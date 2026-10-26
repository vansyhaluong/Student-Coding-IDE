import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsJavascriptExecutionAdapter, createOfficialJavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-adapter'
import type { JavascriptOfficialInputLoader } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import type { ExecutionPlan, ExecutionValue } from '../../src/main/services/learning/runtime/execution-plan'
import { runJavascriptSamples } from '../../src/main/services/learning/runtime/javascript-orchestrator'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { captureJavascriptNode } from '../../src/main/services/learning/runtime/javascript-node-files'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { exercises } from '../fixtures/learning/legacy-exercises'
import type { Exercise, ExerciseType } from '../../src/shared/contracts/practice'
import { fakeNode, probeContext, probeNative, probeReport } from '../fixtures/learning/javascript-node-files'

const triple: Exercise = { ...exercises[0], samples: [
  { args: [14, -6], expected: 999 }, { args: [0, 0], expected: 999 }, { args: [1, 2], expected: 999 },
] }
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { resolve, promise } }
let root: string
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('JavaScript multi-case adapter and Core driver', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'Learning-js-multi-unit-')) })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-js-multi-unit-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  })
  async function fixture(failAt = -1, exercise = triple, clock?: ExerciseClock, official?: JavascriptOfficialInputLoader) {
    const installed = join(root, 'node'), candidate = await captureJavascriptNode(await fakeNode(installed), probeContext())
    let mode = 'probe', input = { caseIndex: 0, args: [0, 0] }, handle: object
    const mocked = probeNative(() => {
      if (mode === 'probe') return Buffer.from(probeReport(candidate))
      if (mode === 'syntax') return Buffer.from('{"status":"SUCCEEDED"}')
      const failed = input.caseIndex === failAt
      mocked.jobs.get(handle)!.exitCode = failed ? 1 : 0
      return Buffer.from(JSON.stringify({ protocolVersion: 1, caseIndex: input.caseIndex,
        outcome: failed ? 'FAILED' : 'RETURNED', ...(failed ? { error: 'USER_EXCEPTION' } : { actual: input.args[0] + input.args[1] }), stdout: '', stderr: '' }))
    })
    const original = vi.mocked(mocked.native.start).getMockImplementation()!
    vi.mocked(mocked.native.start).mockImplementation((...args) => {
      const last = args[1].at(-1); mode = last === 'syntax' || last === 'execute' ? last : 'probe'
      return handle = original(...args)
    })
    vi.mocked(mocked.native.submitInput).mockImplementation((_h, bytes) => { if (bytes.length) input = JSON.parse(bytes.toString()) })
    const releaseLease = vi.fn(async () => {})
    const workspace = new ExerciseWorkspace(join(root, 'learning'), 'exercise_12345678-1234-4234-8234-123456789abc',
      { acquire: async () => ({ release: releaseLease }) })
    const request = { exerciseId: exercise.id, language: 'javascript' as const, code: 'function Sum(a,b){return a+b;}', sourceRevision: 1 }
    const resolver = new LearningNodeResolver({ PATH: installed })
    const runtime = official ? createOfficialJavascriptExecutionAdapter(request, workspace, mocked.native, official, resolver)
      : new WindowsJavascriptExecutionAdapter(request, workspace, mocked.native, resolver, [exercise])
    const session = new ExerciseSession({ request, ownerId: 'js-multi-unit', workspace, adapter: runtime, clock,
      checkpoints: { read: async () => { throw Error('not used') }, write: async () => {} } })
    const prepare = async () => {
      await session.runPhase('prepare'); await session.verifyExecutionBarrier()
      await session.runPhase('compile'); await session.verifyExecutionBarrier()
    }
    return { ...mocked, workspace, resolver, runtime, session, prepare, releaseLease }
  }
  it('A01 records Prepare timeout after Core aborts before the resolver settles', async () => {
    let now = performance.now()
    const timers = new Map<number, () => void>()
    const clock: ExerciseClock = { now: () => now, schedule: (callback, ms) => {
      const due = now + ms; timers.set(due, callback); return () => { timers.delete(due) }
    } }
    const f = await fixture(-1, triple, clock), entered = gate(), pending = gate()
    vi.spyOn(f.resolver, 'resolve').mockImplementationOnce(async context => {
      entered.resolve(); await pending.promise; throw context.signal.reason
    })
    const work = runJavascriptSamples(f.session, f.runtime); void work.catch(() => {})
    await entered.promise
    const due = Math.min(...timers.keys()), expire = timers.get(due)!
    now = due; expire()
    expect(f.session.limits.reason).toBe('PREPARE_TIMEOUT')
    pending.resolve()
    await expect(work).resolves.toEqual({ syntax: null, cases: [], notRunCaseIndices: [0, 1, 2],
      failure: { kind: 'TIMEOUT', phase: 'prepare', caseIndex: null } })
    expect(f.session.snapshot()).toMatchObject({ reason: 'PREPARE_TIMEOUT',
      cleanup: { proof: 'VERIFIED', cleanupComplete: true, workspace: 'REMOVED' } })
    expect(f.native.start).not.toHaveBeenCalled(); expect(f.releaseLease).toHaveBeenCalledOnce()
  })
  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT', 'OWNER_LOST', 'SHUTDOWN'] as const)(
    'A01 does not publish a Prepare timeout or stale result after %s', async reason => {
      const f = await fixture(), entered = gate(), pending = gate()
      vi.spyOn(f.resolver, 'resolve').mockImplementationOnce(async context => {
        entered.resolve(); await pending.promise; throw context.signal.reason
      })
      const work = runJavascriptSamples(f.session, f.runtime); void work.catch(() => {})
      await entered.promise
      const close = f.session.close(reason); void close.catch(() => {})
      pending.resolve(); await close
      await expect(work).rejects.toMatchObject({ details: { reason: 'RESULT_INVALIDATED' } })
      expect(() => f.runtime.result()).toThrow()
      expect(f.session.snapshot()).toMatchObject({ reason,
        cleanup: { proof: 'VERIFIED', cleanupComplete: true, workspace: 'REMOVED' } })
      expect(f.native.start).not.toHaveBeenCalled(); expect(f.releaseLease).toHaveBeenCalledOnce()
    })
  it('resolves/syntax-checks once, returns ordered actuals, ignores expected, snapshots input and detaches results', async () => {
    const exercise = structuredClone(triple), f = await fixture(-1, exercise)
    const resolveNode = vi.spyOn(f.resolver, 'resolve'), validate = vi.spyOn(f.resolver, 'revalidate')
    exercise.samples[0].args = [99, 99]
    const result = await runJavascriptSamples(f.session, f.runtime)
    expect(result.cases.map(c => c.actual)).toEqual([8, 0, 3]); expect(result.notRunCaseIndices).toEqual([])
    expect(resolveNode).toHaveBeenCalledOnce(); expect(validate).toHaveBeenCalledTimes(4)
    expect(f.native.start).toHaveBeenCalledTimes(5)
    expect(new Set([...f.jobs.values()].map(s => s.rootPid)).size).toBe(5)
    expect([...f.states.values()].every(s => s.released && s.handlesClosed)).toBe(true)
    result.cases[0].actual = 999; expect(f.runtime.result().cases[0].actual).toBe(8)
    expect(f.session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
    await expect(runJavascriptSamples(f.session, f.runtime)).rejects.toThrow()
    expect(f.native.start).toHaveBeenCalledTimes(5)
  })
  it.each([0, 1, 2])('fails fast at case %i with exact attempted prefix and suffix', async index => {
    const f = await fixture(index), result = await runJavascriptSamples(f.session, f.runtime)
    expect(result.cases.map(c => c.caseIndex)).toEqual(Array.from({ length: index + 1 }, (_, i) => i))
    expect(result.cases[index]).toMatchObject({ outcome: 'FAILED', failure: { kind: 'RUNTIME_ERROR', caseIndex: index } })
    expect(result.notRunCaseIndices).toEqual([0, 1, 2].slice(index + 1)); expect(f.native.start).toHaveBeenCalledTimes(index + 3)
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
  it('rejects next execution without a fresh barrier and a mismatched driver without touching the session', async () => {
    const f = await fixture()
    await expect(runJavascriptSamples(f.session, {} as WindowsJavascriptExecutionAdapter)).rejects.toThrow()
    expect(f.native.start).not.toHaveBeenCalled()
    await f.prepare(); await f.session.runPhase('execute')
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    expect(f.native.start).toHaveBeenCalledTimes(3); await f.session.close()
  })
  it.each(['history', 'observer', 'identity'] as const)('blocks the next case with %s evidence and preserves cleanup truth', async fault => {
    const f = await fixture(); await f.prepare(); await f.session.runPhase('execute')
    const sample = [...f.jobs.values()].at(-1)!
    if (fault === 'history') sample.coverageComplete = false
    if (fault === 'observer') sample.observerSettled = false
    if (fault === 'identity') sample.retained[0].signaled = false
    await expect(f.session.verifyExecutionBarrier()).rejects.toThrow()
    expect(f.runtime.hasNextCase()).toBe(false); expect(f.native.start).toHaveBeenCalledTimes(3)
    if (fault !== 'history') { sample.observerSettled = true; sample.retained[0].signaled = true }
    await f.session.close()
    expect(f.runtime.result().failure).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup' })
    expect(f.session.snapshot().cleanup).toMatchObject(fault === 'history'
      ? { proof: 'HISTORY_UNVERIFIED', cleanupComplete: false, workspace: 'QUARANTINED' }
      : { proof: 'VERIFIED', cleanupComplete: true })
  })
  it('retains pending barrier work and handles during cancellation without a late launch', async () => {
    const f = await fixture(); await f.prepare(); await f.session.runPhase('execute')
    const pending = gate(), entered = gate(), original = f.runtime.evidence.bind(f.runtime)
    vi.spyOn(f.runtime, 'evidence').mockImplementationOnce(async () => { entered.resolve(); await pending.promise; return original() })
    const barrier = f.session.verifyExecutionBarrier(); void barrier.catch(() => {})
    await entered.promise; expect(() => f.runtime.result()).toThrow()
    const close = f.session.close('OWNER_LOST'); void close.catch(() => {})
    expect(f.session.ownsResources).toBe(true); expect([...f.states.values()].every(s => !s.handlesClosed)).toBe(true)
    pending.resolve(); await expect(barrier).rejects.toThrow(); await close
    expect(f.native.start).toHaveBeenCalledTimes(3); expect(() => f.runtime.result()).toThrow()
  })
  it.each(['prepare', 'compile', 'execute'] as const)('cancels retained %s preflight without late launch', async phase => {
    const f = await fixture(), pending = gate(), entered = gate()
    if (phase !== 'prepare') { await f.session.runPhase('prepare'); await f.session.verifyExecutionBarrier() }
    if (phase === 'execute') { await f.session.runPhase('compile'); await f.session.verifyExecutionBarrier() }
    const before = vi.mocked(f.native.start).mock.calls.length
    if (phase === 'prepare') vi.spyOn(f.resolver, 'resolve').mockImplementationOnce(async context => {
      entered.resolve(); await pending.promise; throw context.signal.reason
    })
    else vi.spyOn(f.resolver, 'revalidate').mockImplementationOnce(async () => { entered.resolve(); await pending.promise })
    const work = f.session.runPhase(phase); void work.catch(() => {}); await entered.promise
    const close = f.session.close('CONTEXT_CHANGED'); void close.catch(() => {})
    expect(f.session.ownsResources).toBe(true); pending.resolve(); await expect(work).rejects.toThrow(); await close
    expect(f.native.start).toHaveBeenCalledTimes(before); expect(() => f.runtime.result()).toThrow()
  })
  it('does not reset the operation deadline between cases', async () => {
    let now = performance.now()
    const clock: ExerciseClock = { now: () => now, schedule: () => () => {} }
    const f = await fixture(-1, triple, clock), due = f.session.limits.operationDeadline
    await f.prepare(); await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    now = due; expect(() => f.session.limits.checkOperation()).toThrow()
    await f.session.close(); expect(f.native.start).toHaveBeenCalledTimes(3)
    expect(f.session.limits.operationDeadline).toBe(due)
    expect(f.runtime.result()).toMatchObject({ cases: [{ actual: 8 }], notRunCaseIndices: [1, 2], failure: { kind: 'TIMEOUT', phase: 'operation' } })
  })
  it('keeps cumulative output accounting across cases', async () => {
    const f = await fixture()
    await f.prepare()
    const original = vi.mocked(f.native.poll).getMockImplementation()!
    let reads = 0
    vi.mocked(f.native.poll).mockImplementation(h => {
      const s = original(h)
      if (s.stdout.length && ++reads === 2) s.stdout = Buffer.concat([s.stdout, Buffer.alloc(1024 * 1024)])
      return s
    })
    await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(f.runtime.result()).toMatchObject({ notRunCaseIndices: [2], failure: { kind: 'OUTPUT_LIMIT', caseIndex: 1 } })
    expect(f.native.start).toHaveBeenCalledTimes(4)
  })
  it.each(['protocol', 'memory', 'stdin'] as const)('maps middle-case %s failure without losing the attempted prefix', async fault => {
    const f = await fixture(); await f.prepare(); await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    if (fault === 'stdin') vi.mocked(f.native.submitInput).mockImplementationOnce(h => { f.jobs.get(h)!.stdinFailed = true })
    else {
      const original = vi.mocked(f.native.poll).getMockImplementation()!
      vi.mocked(f.native.poll).mockImplementation(h => {
        const s = original(h)
        if (s.stdout.length) {
          if (fault === 'protocol') s.stdout = Buffer.from('{"bad":true}')
          else s.events = [{ message: 10, pid: s.rootPid }]
        }
        return s
      })
    }
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(f.runtime.result()).toMatchObject({ cases: [{ actual: 8 }, { outcome: 'FAILED' }], notRunCaseIndices: [2],
      failure: { caseIndex: 1, kind: fault === 'protocol' ? 'PROTOCOL_FAILURE' : fault === 'memory' ? 'JOB_MEMORY_LIMIT' : 'INFRASTRUCTURE_FAILURE' } })
    expect(f.native.start).toHaveBeenCalledTimes(4)
  })
  it('retries checkpoint cleanup without duplicate process, release or close actions', async () => {
    const f = await fixture(), original = f.workspace.remove.bind(f.workspace)
    vi.spyOn(f.workspace, 'remove').mockRejectedValueOnce(exerciseCoreError('DELETE_FAILED')).mockImplementation(original)
    await expect(runJavascriptSamples(f.session, f.runtime)).rejects.toThrow()
    expect(f.session.ownsResources).toBe(true); const calls = vi.mocked(f.native.control).mock.calls.length
    await f.session.close(); expect(f.native.start).toHaveBeenCalledTimes(5)
    expect(vi.mocked(f.native.control).mock.calls.length).toBe(calls)
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
    await expect(runJavascriptSamples(f.session, f.runtime)).rejects.toThrow()
  })

  function officialInputs(count = 3) {
    let current = true
    const execution: ExecutionPlan = { signature: { functionName: 'Sum', parameters: [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }], returnType: 'int32' },
      caseCount: count, inputAt: vi.fn(index => { if (!current) throw exerciseCoreError('ADMISSION_CLOSED'); return [index, index ? -index : 0] }) }
    const release = vi.fn(), represent = vi.fn(async (caseIndex: number) => ({ data: { protocolVersion: 1, caseIndex, args: execution.inputAt(caseIndex) }, release }))
    const load = vi.fn(async () => ({ execution, representInput: represent }))
    return { execution, load, represent, release, revoke: () => { current = false } }
  }
  async function driveOfficial(f: Awaited<ReturnType<typeof fixture>>) {
    f.session.claimOrchestration(f.runtime)
    try {
      await f.prepare()
      while (f.runtime.hasNextCase()) { f.session.limits.checkOperation(); await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier() }
    } catch { /* The test asserts private evidence/Core reason after retained cleanup. */ }
    await f.session.close()
    return f.runtime.officialResult()
  }
  it.each([21, 128])('Official count%i uses one probe/syntax, ordered inputs and the original barriers', async count => {
    const source = officialInputs(count), f = await fixture(-1, triple, undefined, source.load)
    expect(source.load).not.toHaveBeenCalled(); expect(source.execution.inputAt).not.toHaveBeenCalled()
    const resolveNode = vi.spyOn(f.resolver, 'resolve'), result = await driveOfficial(f)
    expect(source.load).toHaveBeenCalledOnce(); expect(resolveNode).toHaveBeenCalledOnce()
    expect(f.native.start).toHaveBeenCalledTimes(count + 2)
    expect(vi.mocked(f.native.start).mock.calls.filter(c => c[1].at(-1) === 'syntax')).toHaveLength(1)
    expect(result.cases.map(c => [c.caseIndex, c.kind, c.kind === 'RETURNED' ? c.actual : null])).toEqual(Array.from({ length: count }, (_, i) => [i, 'RETURNED', 0]))
    expect(result.notRunCaseIndices).toEqual([]); expect(source.release).toHaveBeenCalledTimes(count)
    const calls = vi.mocked(f.native.submitInput).mock.calls.filter(c => c[1].length)
    expect(calls.map(c => JSON.parse(c[1].toString()))).toEqual(Array.from({ length: count }, (_, caseIndex) => ({ protocolVersion: 1, caseIndex, args: [caseIndex, caseIndex ? -caseIndex : 0] })))
    expect(() => f.runtime.result()).toThrow(); expect(f.session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
  }, 30_000)
  it.each<[ExerciseType, ExecutionValue]>([['int32', -2147483648], ['boolean', false], ['string', 'Ω😀'],
    ['int32[]', [42]], ['string[]', ['', 'a']], ['int32[][]', [[1, 2], [3, 4]]]])('Official %s input and actual retain their type/order', async (type, value) => {
    const release = vi.fn(), inputAt = vi.fn(() => [value])
    const execution: ExecutionPlan = { signature: { functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type }, caseCount: 1, inputAt }
    const f = await fixture(-1, triple, undefined, async () => ({ execution, representInput: async caseIndex => ({ data: { protocolVersion: 1, caseIndex, args: inputAt() }, release }) }))
    await f.prepare(); expect(inputAt).not.toHaveBeenCalled()
    const poll = vi.mocked(f.native.poll).getMockImplementation()!
    vi.mocked(f.native.poll).mockImplementation(h => { const s = poll(h); if (s.stdout.length) s.stdout = Buffer.from(JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual: value, stdout: '', stderr: '' })); return s })
    await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier(); await f.session.close()
    expect(f.runtime.officialResult().cases).toMatchObject([{ kind: 'RETURNED', actual: value }]); expect(release).toHaveBeenCalledOnce()
    expect(JSON.parse(vi.mocked(f.native.submitInput).mock.calls.at(-1)![1].toString()).args).toEqual([value])
  })
  it('keeps USER_EXCEPTION/exit1 and the exact untouched suffix', async () => {
    const source = officialInputs(), f = await fixture(1, triple, undefined, source.load), result = await driveOfficial(f)
    expect(result).toMatchObject({ cases: [{ kind: 'RETURNED' }, { kind: 'USER_EXCEPTION', process: { exitCode: 1 } }], notRunCaseIndices: [2] })
    expect(source.release).toHaveBeenCalledTimes(2); expect(f.native.start).toHaveBeenCalledTimes(4)
  })
  it('blocks a revoked current owner before launching a case', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare(); source.revoke(); await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(f.native.start).toHaveBeenCalledTimes(2)
    expect(f.runtime.officialResult()).toMatchObject({ cases: [{ kind: 'INFRASTRUCTURE_FAILURE', process: null }], notRunCaseIndices: [1, 2] })
  })
  it('does not publish a returned value after current owner revocation during raw output', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare()
    const poll = vi.mocked(f.native.poll).getMockImplementation()!
    vi.mocked(f.native.poll).mockImplementation(h => { const s = poll(h); if (s.stdout.length) source.revoke(); return s })
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(() => f.runtime.officialResult()).toThrow(); expect(f.native.start).toHaveBeenCalledTimes(3)
  })
  it('retains a failed-barrier input borrow until Core releases the same Jobs', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare(); await f.session.runPhase('execute'); expect(source.release).not.toHaveBeenCalled()
    const evidence = f.runtime.evidence.bind(f.runtime)
    vi.spyOn(f.runtime, 'evidence').mockImplementationOnce(async () => ({ ...await evidence(), observerSettled: false }))
    await expect(f.session.verifyExecutionBarrier()).rejects.toThrow()
    expect(source.release).not.toHaveBeenCalled(); expect(f.runtime.hasNextCase()).toBe(false)
    await f.session.close(); expect(source.release).toHaveBeenCalledOnce(); expect(f.native.start).toHaveBeenCalledTimes(3)
  })
  it('retains a pending input task/borrow through owner cancellation without a late launch', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load), entered = gate(), pending = gate()
    source.represent.mockImplementationOnce(async caseIndex => { entered.resolve(); await pending.promise; return { data: { protocolVersion: 1, caseIndex, args: [0, 0] }, release: source.release } })
    await f.prepare(); const work = f.session.runPhase('execute'); void work.catch(() => {}); await entered.promise
    const close = f.session.close('OWNER_LOST'); void close.catch(() => {})
    expect(source.release).not.toHaveBeenCalled(); expect(f.session.ownsResources).toBe(true)
    pending.resolve(); await expect(work).rejects.toThrow(); await close
    expect(source.release).toHaveBeenCalledOnce(); expect(f.native.start).toHaveBeenCalledTimes(2)
    expect(() => f.runtime.officialResult()).toThrow()
    expect(f.runtime.officialEvidence()).toMatchObject({ cases: [{ kind: 'INTERRUPTED', reason: 'CANCELLED', process: null }], notRunCaseIndices: [1, 2] })
  })
  it.each(['protocol', 'memory', 'stdin', 'output'] as const)('Official trusted %s failure preserves its prefix/suffix and borrow cleanup', async fault => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare(); await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    if (fault === 'stdin') vi.mocked(f.native.submitInput).mockImplementationOnce(h => { f.jobs.get(h)!.stdinFailed = true })
    else {
      const poll = vi.mocked(f.native.poll).getMockImplementation()!
      vi.mocked(f.native.poll).mockImplementation(h => { const s = poll(h); if (s.stdout.length) {
        if (fault === 'protocol') s.stdout = Buffer.from('{"bad":true}')
        else if (fault === 'memory') s.events = [{ message: 10, pid: s.rootPid }]
        else s.stdout = Buffer.concat([s.stdout, Buffer.alloc(1024 * 1024)])
      } return s })
    }
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(f.runtime.officialResult()).toMatchObject({ cases: [{ kind: 'RETURNED' }, {
      kind: fault === 'protocol' ? 'PROTOCOL_FAILURE' : fault === 'stdin' ? 'INFRASTRUCTURE_FAILURE' : 'INTERRUPTED' }], notRunCaseIndices: [2] })
    expect(source.release).toHaveBeenCalledTimes(2)
  })
  it('preserves the original operation deadline after an Official case', async () => {
    let now = performance.now()
    const clock: ExerciseClock = { now: () => now, schedule: () => () => {} }, source = officialInputs()
    const f = await fixture(-1, triple, clock, source.load), due = f.session.limits.operationDeadline
    await f.prepare(); await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    now = due; expect(() => f.session.limits.checkOperation()).toThrow(); await f.session.close()
    expect(f.runtime.officialResult()).toMatchObject({ cases: [{ kind: 'RETURNED' }], notRunCaseIndices: [1, 2], failure: { kind: 'TIMEOUT', phase: 'operation' } })
    expect(f.session.limits.operationDeadline).toBe(due); expect(f.native.start).toHaveBeenCalledTimes(3)
  })
  it('charges malformed UTF8 physical bytes before decoding without refunding protocol failure', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare()
    const poll = vi.mocked(f.native.poll).getMockImplementation()!, output = vi.fn()
    vi.mocked(f.native.poll).mockImplementation(h => { const s = poll(h); if (s.stdout.length) s.stdout = Buffer.from([255]); return s })
    const run = f.runtime.runPhase.bind(f.runtime)
    vi.spyOn(f.runtime, 'runPhase').mockImplementation((phase, context) => run(phase, { ...context, output: (stream, text, bytes) => { output(stream, text, bytes); context.output(stream, text, bytes) } }))
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(output).toHaveBeenCalledWith('stdout', '', 1)
    expect(f.runtime.officialResult().cases).toMatchObject([{ kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }])
    expect(source.release).toHaveBeenCalledOnce()
  })
  it('rejects wrong input arity in Execute before serialization or a child launch', async () => {
    const source = officialInputs(), f = await fixture(-1, triple, undefined, source.load)
    await f.prepare(); vi.mocked(source.execution.inputAt).mockReturnValueOnce([1])
    await expect(f.session.runPhase('execute')).rejects.toThrow(); await f.session.close()
    expect(source.represent).not.toHaveBeenCalled(); expect(f.native.start).toHaveBeenCalledTimes(2)
    expect(f.runtime.officialResult().cases).toMatchObject([{ kind: 'INFRASTRUCTURE_FAILURE', process: null }])
  })
})
