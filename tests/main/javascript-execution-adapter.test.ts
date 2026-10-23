import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsJavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-adapter'
import { runJavascriptSamples } from '../../src/main/services/learning/runtime/javascript-orchestrator'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { captureJavascriptNode } from '../../src/main/services/learning/runtime/javascript-node-files'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { exercises } from '../../src/main/services/learning/content/exercises'
import type { Exercise } from '../../src/shared/contracts/practice'
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
  async function fixture(failAt = -1, exercise = triple, clock?: ExerciseClock) {
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
    const runtime = new WindowsJavascriptExecutionAdapter(request, workspace, mocked.native, resolver, [exercise])
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
})
