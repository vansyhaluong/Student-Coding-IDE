import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runExecutionDriver } from '../../src/main/services/learning/runtime/execution-driver'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import type { OfficialCaseObservation, OfficialSettledCaseConsumer } from '../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'

const sessions: ExerciseSession[] = []
afterEach(async () => { for (const s of sessions.splice(0)) await s.close() })
function fixture(language: 'csharp' | 'javascript' = 'csharp', clock?: ExerciseClock) {
  const events: string[] = [], cases: OfficialCaseObservation[] = []
  let failCase = -1, failBarrier = -1, barriers = 0, current = true
  const adapter: ExerciseRuntimeAdapter & { hasNextCase(): boolean } = {
    hasNextCase: () => cases.length < 3,
    async runPhase(phase, context) {
      events.push(phase)
      expect(context.jobMemoryBytes).toBe(phase === 'compile' ? 2 * 1024 ** 3 : phase === 'prepare' && language === 'csharp' ? null : 512 * 1024 ** 2)
      if (phase === 'execute') {
        const index = cases.length
        cases.push({ caseIndex: index, language, process: null,
          ...(index === failCase ? { kind: 'USER_EXCEPTION' as const, stdout: '', stderr: '' }
            : { kind: 'RETURNED' as const, actual: [index], stdout: '', stderr: '' }) })
        if (index === failCase) throw exerciseCoreError('RUNTIME_FAILED')
      }
    },
    async verifyBetweenCases() { events.push('barrier'); if (++barriers === failBarrier) throw exerciseCoreError('PROCESS_UNRESOLVED') },
    async terminate() { events.push('terminate') }, async settleObservers() {}, async release() {}, async closeHandles() {},
    async evidence() { return { members: [], retained: [], totalProcesses: 0, activeProcesses: 0, coverageComplete: true, observerSettled: true, unresolvedErrors: false } },
  }
  const workspace = new ExerciseWorkspace('C:\\s4-driver', 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
  vi.spyOn(workspace, 'prepare').mockImplementation(async () => { await workspace.acquire(); workspace.identity = { dev: '1', ino: '2', birthtimeNs: '3' } })
  vi.spyOn(workspace, 'remove').mockResolvedValue()
  const session = new ExerciseSession({ request: { exerciseId: 'ch2-04', language, code: '', sourceRevision: 1 }, workspace, adapter, clock,
    ownerId: 's4-driver', checkpoints: { write: async () => {}, read: async () => { throw Error('unused') } } })
  sessions.push(session)
  const options = { language, current: () => current, currentCase: () => cases.at(-1) }
  return { session, adapter, cases, events, options, failCase: (i: number) => { failCase = i }, failBarrier: (i: number) => { failBarrier = i }, invalidate: () => { current = false } }
}
describe('Shared admitted execution driver and synchronous private consumer', () => {
  it.each(['csharp', 'javascript'] as const)('%s keeps its exact barriers, ordered returned hooks and Core cleanup', async language => {
    const f = fixture(language), consumer = vi.fn(() => {
      expect(f.events.at(-1)).toBe('barrier'); expect(f.session.snapshot().cleanup.cleanupComplete).toBe(false)
      return 'CONTINUE' as const
    })
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer })
    expect(result).toMatchObject({ disposition: 'EXHAUSTED', consumerFailure: false })
    expect(consumer.mock.calls).toHaveLength(3)
    expect(f.events).toEqual(['prepare', ...(language === 'javascript' ? ['barrier'] : []), 'compile', 'barrier',
      'execute', 'barrier', 'execute', 'barrier', 'execute', 'barrier', 'terminate'])
    expect(f.session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
  })
  it.each([0, 1, 2])('STOP at index%i leaves the exact unattempted suffix without a runtime failure', async stop => {
    const f = fixture(), seen: number[] = []
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: row => { seen.push(row.caseIndex); return row.caseIndex === stop ? 'STOP' : 'CONTINUE' } })
    expect(result.disposition).toBe('CONSUMER_STOP'); expect(result.failure).toBeUndefined()
    expect(seen).toEqual(Array.from({ length: stop + 1 }, (_, i) => i)); expect(f.cases).toHaveLength(stop + 1)
    expect(f.session.snapshot().reason).toBe('COMPLETED')
  })
  const badHooks: [string, () => unknown][] = [
    ['throw', () => { throw Error('PRIVATE_SECRET') }], ['invalid', () => 'ACCEPTED'],
    ['resolved Promise', () => Promise.resolve('STOP')], ['rejected Promise', () => Promise.reject(Error('PRIVATE_SECRET'))],
    ['thenable', () => ({ get then() { throw Error('Must not inspect then getter') } })],
  ]
  it.each(badHooks)('rejects %s as infrastructure, drains Promise rejection and does not continue', async (_name, hook) => {
    const f = fixture(), result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: hook as OfficialSettledCaseConsumer })
    expect(result).toMatchObject({ disposition: 'EXECUTION_FAILURE', consumerFailure: true })
    expect(result.failure).toMatchObject({ details: { reason: 'OFFICIAL_CONSUMER_FAILED' } })
    expect(String(result.failure)).not.toContain('PRIVATE_SECRET'); expect(f.cases).toHaveLength(1)
    expect(f.session.snapshot()).toMatchObject({ reason: 'INTERNAL_ERROR', cleanup: { proof: 'VERIFIED', cleanupComplete: true } })
  })
  it('borrows immutable actuals rather than letting a consumer mutate retained Runtime evidence', async () => {
    const f = fixture(), result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: row => {
      expect(Object.isFrozen(row)).toBe(true)
      if (row.kind === 'RETURNED') (row.actual as number[])[0] = 99
      return 'CONTINUE'
    } })
    expect(result.consumerFailure).toBe(true); expect(f.cases[0]).toMatchObject({ actual: [0] })
  })
  it.each(['csharp', 'javascript'] as const)('%s never calls a continuation hook on runtime failure', async language => {
    const f = fixture(language), hook = vi.fn(() => 'CONTINUE' as const); f.failCase(1)
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: hook })
    expect(result.disposition).toBe('EXECUTION_FAILURE'); expect(hook).toHaveBeenCalledTimes(1)
    expect(f.cases.map(c => c.kind)).toEqual(['RETURNED', 'USER_EXCEPTION'])
  })
  it.each(['csharp', 'javascript'] as const)('%s stops before hook/next launch on failed case barrier', async language => {
    const f = fixture(language), hook = vi.fn(() => 'CONTINUE' as const); f.failBarrier(language === 'csharp' ? 2 : 3)
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: hook })
    expect(result.disposition).toBe('EXECUTION_FAILURE'); expect(hook).not.toHaveBeenCalled(); expect(f.cases).toHaveLength(1)
  })
  it('rechecks owner after STOP rather than publishing a late consumer-stop success', async () => {
    const f = fixture(), result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: () => { f.invalidate(); return 'STOP' } })
    expect(result.disposition).toBe('INVALIDATED'); expect(f.cases).toHaveLength(1)
  })
  it('checks the same monotonic operation deadline after synchronous hook work', async () => {
    let now = performance.now()
    const clock: ExerciseClock = { now: () => now, schedule: () => () => {} }, f = fixture('javascript', clock)
    const due = f.session.limits.operationDeadline
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: () => { now = due; return 'CONTINUE' } })
    expect(result.failure).toMatchObject({ details: { reason: 'OPERATION_TIMEOUT' } }); expect(result.consumerFailure).toBe(false)
    expect(f.cases).toHaveLength(1); expect(f.session.limits.operationDeadline).toBe(due)
  })
  it('rejects mismatched/duplicate drivers without touching another admitted adapter', async () => {
    const f = fixture(), other = fixture()
    await expect(runExecutionDriver(f.session, other.adapter, f.options)).rejects.toThrow()
    expect(f.events).toEqual([])
    await runExecutionDriver(f.session, f.adapter, f.options)
    await expect(runExecutionDriver(f.session, f.adapter, f.options)).rejects.toThrow()
    expect(f.events.filter(e => e === 'execute')).toHaveLength(3)
  })
  it('does not let a throwing hook override a trusted elapsed operation deadline', async () => {
    let now = performance.now()
    const f = fixture('csharp', { now: () => now, schedule: () => () => {} })
    const result = await runExecutionDriver(f.session, f.adapter, { ...f.options, consumer: () => { now = f.session.limits.operationDeadline; throw Error('secret') } })
    expect(result.failure).toMatchObject({ details: { reason: 'OPERATION_TIMEOUT' } })
    expect(f.session.snapshot().reason).toBe('OPERATION_TIMEOUT'); expect(f.cases).toHaveLength(1)
  })
})
