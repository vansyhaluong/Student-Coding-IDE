import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExerciseSession, classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import type { ExerciseCheckpoint, ExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import type { ExercisePhaseContext, ExerciseRuntimeAdapter, ExerciseTerminationEvidence } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { validateExerciseSnapshot } from '../../src/shared/contracts/exercise-validation'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'

const sessionId = 'exercise_12345678-1234-4234-8234-123456789abc'
function gate() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}
function fixture(language: 'csharp' | 'javascript' = 'csharp') {
  let leased = false
  const release = vi.fn(async () => { leased = false })
  const workspace = new ExerciseWorkspace('test-learning-root', sessionId, { acquire: async () => {
    if (leased) return null
    leased = true; return { release }
  } })
  vi.spyOn(workspace, 'prepare').mockImplementation(async () => {
    await workspace.acquire(); workspace.identity = { dev: '1', ino: '2', birthtimeNs: '3' }
  })
  vi.spyOn(workspace, 'remove').mockResolvedValue()
  let record: ExerciseCheckpoint | undefined
  const records: ExerciseCheckpoint[] = []
  const checkpoints: ExerciseCheckpointStore = {
    read: vi.fn(async () => { if (!record) throw Error('no record'); return structuredClone(record) }),
    write: vi.fn(async value => { const saved = structuredClone(value); record = saved; records.push(saved) }),
  }
  const evidence: ExerciseTerminationEvidence = { members: [], activeProcesses: 0, totalProcesses: 1,
    retained: [{ pid: 123, created: 'creation-1', signaled: true }], coverageComplete: true,
    observerSettled: true, unresolvedErrors: false }
  const adapter = {
    runPhase: vi.fn<ExerciseRuntimeAdapter['runPhase']>().mockResolvedValue(),
    terminate: vi.fn<ExerciseRuntimeAdapter['terminate']>().mockResolvedValue(),
    evidence: vi.fn(async () => structuredClone(evidence)),
    settleObservers: vi.fn<ExerciseRuntimeAdapter['settleObservers']>().mockResolvedValue(),
    release: vi.fn<ExerciseRuntimeAdapter['release']>().mockResolvedValue(),
    closeHandles: vi.fn<ExerciseRuntimeAdapter['closeHandles']>().mockResolvedValue(),
  }
  const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language, code: 'code', sourceRevision: 5 },
    ownerId: 'owner-1', workspace, checkpoints, adapter,
    clock: { now: () => Date.now(), schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } } })
  return { session, adapter, workspace, checkpoints, evidence, records, release }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('Learning Policy B stages', () => {
  it.each(['csharp', 'javascript'] as const)('maps Prepare probe quota only for %s without changing deadlines', async language => {
    const f = fixture(language)
    await f.session.runPhase('prepare')
    expect(f.adapter.runPhase.mock.calls[0][1]).toMatchObject({ deadline: 10_000,
      jobMemoryBytes: language === 'javascript' ? EXERCISE_LIMITS.executeJobMemoryBytes : null })
    expect(f.session.limits.operationDeadline).toBe(60_000)
    await f.session.close()
  })
  it('gives each execute its own 2s phase, clamped to the original operation due including barriers', async () => {
    const f = fixture(), deadlines: number[] = [], barrierDeadlines: number[] = []
    await f.session.runPhase('prepare'); await f.session.runPhase('compile')
    const barrier = vi.fn(async (context: { deadline: number }) => { barrierDeadlines.push(context.deadline); await vi.advanceTimersByTimeAsync(600) })
    Object.assign(f.adapter, { verifyBetweenCases: barrier })
    await vi.advanceTimersByTimeAsync(57_500)
    f.adapter.runPhase.mockImplementation(async (_phase, context) => { deadlines.push(context.deadline); await vi.advanceTimersByTimeAsync(deadlines.length === 1 ? 1500 : 500) })
    await f.session.runPhase('execute'); await f.session.verifyExecutionBarrier()
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    await f.session.close()
    expect(deadlines).toEqual([59_500, 60_000]); expect(barrierDeadlines).toEqual([60_000])
    expect(f.session.snapshot().reason).toBe('OPERATION_TIMEOUT')
    await expect(f.session.runPhase('execute')).rejects.toThrow()
  })
  it('retains a pending barrier through the 12s caller wait and cleanup retry, without admitting another case', async () => {
    const f = fixture(), pending = gate()
    await f.session.runPhase('prepare'); await f.session.runPhase('compile')
    Object.assign(f.adapter, { verifyBetweenCases: vi.fn(() => pending.promise) })
    const barrier = f.session.verifyExecutionBarrier(); void barrier.catch(() => {})
    await Promise.resolve()
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(12_000)
    await expect(barrier).rejects.toMatchObject({ details: { reason: 'CLEANUP_DEADLINE' } })
    expect(f.session.ownsResources).toBe(true); expect(f.adapter.release).not.toHaveBeenCalled()
    const cleanup = f.session.close(); void cleanup.catch(() => {})
    pending.resolve(); await cleanup
    expect(f.adapter.release).toHaveBeenCalledTimes(1); expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
    expect(f.adapter.runPhase).toHaveBeenCalledTimes(2)
  })
  it('does not turn a barrier resolving after cancellation into permission to launch', async () => {
    const f = fixture(), pending = gate()
    await f.session.runPhase('prepare'); await f.session.runPhase('compile')
    Object.assign(f.adapter, { verifyBetweenCases: vi.fn(() => pending.promise) })
    const barrier = f.session.verifyExecutionBarrier(); void barrier.catch(() => {})
    const cleanup = f.session.close('OWNER_LOST'); void cleanup.catch(() => {})
    await expect(barrier).rejects.toThrow(); expect(f.adapter.release).not.toHaveBeenCalled()
    pending.resolve(); await cleanup
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    expect(f.session.snapshot().reason).toBe('OWNER_LOST')
  })
  it.each(['DEPENDENCY_MISSING', 'INVALID_RUNTIME', 'INTERNAL_ERROR', 'OUTPUT_LIMIT', 'JOB_MEMORY_LIMIT'] as const)('retains existing semantic driver reason %s in Core cleanup', async reason => {
    const f = fixture()
    f.adapter.runPhase.mockRejectedValueOnce(exerciseCoreError(reason))
    await expect(f.session.runPhase('prepare')).rejects.toThrow(); await f.session.close()
    expect(f.session.snapshot().reason).toBe(reason)
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
  it('counts raw compiler bytes across phases while keeping redacted snapshot streams empty', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.runPhase.mockImplementationOnce(async (_phase, context) => { context.output('stdout', '', 600 * 1024) })
    await f.session.runPhase('compile')
    f.adapter.runPhase.mockImplementationOnce(async (_phase, context) => { context.output('stderr', '', 600 * 1024) })
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    await f.session.close()
    expect(f.session.snapshot()).toMatchObject({ stdout: '', stderr: '', reason: 'OUTPUT_LIMIT', cleanup: { cleanupComplete: true } })
  })
  it('rejects invalid Main accounting rather than undercounting visible UTF-8 output', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.runPhase.mockImplementationOnce(async (_phase, context) => { context.output('stdout', 'Ω', 1) })
    await expect(f.session.runPhase('compile')).rejects.toMatchObject({ details: { reason: 'OUTPUT_ACCOUNTING' } })
    await f.session.close()
    expect(f.session.snapshot().stdout).toBe('')
  })
  it('audits and cleans an admitted session cancelled before any phase starts without launching a driver', async () => {
    const f = fixture()
    await f.session.close('OWNER_LOST')
    expect(f.workspace.prepare).toHaveBeenCalledOnce()
    expect(f.adapter.runPhase).not.toHaveBeenCalled()
    expect(f.records.map(r => r.checkpoint)).toEqual(['OWNED', 'RELEASE_READY', 'FINALIZED', 'CLEANUP_COMPLETE'])
    expect(f.session.snapshot().reason).toBe('OWNER_LOST')
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
  })
  it('acknowledges each stage, settles before release, deletes only VERIFIED and returns a valid snapshot', async () => {
    const f = fixture()
    await f.session.runPhase('prepare'); await f.session.runPhase('compile'); await f.session.runPhase('execute')
    await f.session.close()
    expect(f.records.map(r => r.checkpoint)).toEqual(['OWNED', 'RELEASE_READY', 'FINALIZED', 'CLEANUP_COMPLETE'])
    expect(f.adapter.settleObservers.mock.invocationCallOrder[0]).toBeLessThan(f.adapter.release.mock.invocationCallOrder[0])
    expect(f.adapter.release.mock.invocationCallOrder[0]).toBeLessThan(f.adapter.closeHandles.mock.invocationCallOrder[0])
    expect(f.workspace.remove).toHaveBeenCalledOnce()
    expect(f.workspace.ownsLease).toBe(false)
    expect(f.session.ownsResources).toBe(false)
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
    await f.session.close(); expect(f.adapter.terminate).toHaveBeenCalledOnce()
  })

  it('finalizes an accounting mismatch as historical quarantine without declaring a live process or clean workspace', async () => {
    const f = fixture(); f.evidence.totalProcesses = 5
    await f.session.runPhase('prepare'); await f.session.close()
    expect(f.session.snapshot().cleanup).toMatchObject({ state: 'FINALIZED', proof: 'HISTORY_UNVERIFIED',
      processClean: false, cleanupComplete: false, workspace: 'QUARANTINED' })
    expect(f.workspace.remove).not.toHaveBeenCalled()
    expect(f.records.map(r => r.checkpoint)).toEqual(['OWNED', 'RELEASE_READY', 'FINALIZED'])
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
  })

  it.each(['members', 'active', 'handle', 'observer', 'error', 'identity'] as const)('retains ownership for unresolved %s', async cause => {
    const f = fixture()
    if (cause === 'members') f.evidence.members = [{ pid: 123, created: 'creation-1' }]
    if (cause === 'active') f.evidence.activeProcesses = 1
    if (cause === 'handle') f.evidence.retained[0].signaled = false
    if (cause === 'observer') f.evidence.observerSettled = false
    if (cause === 'error') f.evidence.unresolvedErrors = true
    if (cause === 'identity') f.evidence.retained.push({ ...f.evidence.retained[0] })
    await f.session.runPhase('prepare'); await expect(f.session.close()).rejects.toThrow()
    expect(f.session.snapshot().cleanup.proof).toBe('PROCESS_UNRESOLVED')
    expect(f.workspace.ownsLease).toBe(true)
    expect(f.adapter.release).not.toHaveBeenCalled()
    expect(f.workspace.remove).not.toHaveBeenCalled()
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
  })

  it('uses coverage gaps even when TotalProcesses matches; rejects invalid accounting', () => {
    const f = fixture()
    expect(classifyExerciseTermination({ ...f.evidence, coverageComplete: false })).toBe('HISTORY_UNVERIFIED')
    expect(() => classifyExerciseTermination({ ...f.evidence, totalProcesses: NaN })).toThrow()
  })

  it('revalidates after RELEASE_READY I/O before native release', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    const write = f.checkpoints.write
    vi.mocked(f.checkpoints.write).mockImplementation(async r => {
      if (r.checkpoint === 'RELEASE_READY') f.evidence.activeProcesses = 1
    })
    await expect(f.session.close()).rejects.toThrow()
    expect(write).toHaveBeenCalled(); expect(f.adapter.release).not.toHaveBeenCalled()
    expect(f.session.snapshot().cleanup.processClean).toBe(false)
  })

  it.each(['terminate', 'release', 'closeHandles'] as const)('retries %s failure without repeating completed native stages', async method => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter[method].mockRejectedValueOnce(Error('native failure before completion'))
    await expect(f.session.close()).rejects.toThrow()
    expect(f.workspace.ownsLease).toBe(true)
    await f.session.close()
    expect(f.adapter[method]).toHaveBeenCalledTimes(2)
    for (const other of ['terminate', 'release', 'closeHandles'] as const) {
      if (other !== method) expect(f.adapter[other]).toHaveBeenCalledOnce()
    }
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })

  it.each(['RELEASE_READY', 'FINALIZED', 'CLEANUP_COMPLETE'] as const)('retries %s persistence failure at the retained stage', async stage => {
    const f = fixture(); await f.session.runPhase('prepare')
    const original = vi.mocked(f.checkpoints.write).getMockImplementation()!
    let failed = false
    vi.mocked(f.checkpoints.write).mockImplementation(async r => {
      if (r.checkpoint === stage && !failed) { failed = true; throw Error('disk failure') }
      await original(r)
    })
    await expect(f.session.close()).rejects.toThrow()
    if (stage !== 'RELEASE_READY') expect(f.adapter.closeHandles).toHaveBeenCalledOnce()
    await f.session.close()
    expect(f.adapter.terminate).toHaveBeenCalledOnce()
    expect(f.adapter.release).toHaveBeenCalledOnce()
    expect(f.adapter.closeHandles).toHaveBeenCalledOnce()
    if (stage === 'CLEANUP_COMPLETE') expect(f.workspace.remove).toHaveBeenCalledOnce()
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })

  it('retains a deletion failure and does not repeat native actions on retry', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    vi.mocked(f.workspace.remove).mockRejectedValueOnce(Error('locked workspace'))
    await expect(f.session.close()).rejects.toThrow()
    expect(f.session.snapshot().cleanup).toMatchObject({ state: 'FAILED', proof: 'VERIFIED', processClean: true, cleanupComplete: false })
    await f.session.close()
    expect(f.workspace.remove).toHaveBeenCalledTimes(2)
    expect(f.adapter.release).toHaveBeenCalledOnce()
  })

  it('retries an ambiguous FINALIZED acknowledgement without repeating native actions', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    const original = vi.mocked(f.checkpoints.write).getMockImplementation()!
    let failed = false
    vi.mocked(f.checkpoints.write).mockImplementation(async r => {
      await original(r)
      if (r.checkpoint === 'FINALIZED' && !failed) { failed = true; throw Error('read-back failure after replace') }
    })
    await expect(f.session.close()).rejects.toThrow()
    expect(f.session.snapshot().cleanup.processClean).toBe(false)
    await f.session.close()
    expect(f.adapter.release).toHaveBeenCalledOnce(); expect(f.adapter.closeHandles).toHaveBeenCalledOnce()
  })

  it('retains an observer error, then retries observer verification without repeating termination', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.settleObservers.mockRejectedValueOnce(Error('observer failure'))
    await expect(f.session.close()).rejects.toThrow()
    expect(f.session.snapshot().cleanup.proof).toBe('PROCESS_UNRESOLVED')
    await f.session.close(); expect(f.adapter.terminate).toHaveBeenCalledOnce()
  })

  it('does not drop ownership when lease release fails after durable cleanup', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.release.mockRejectedValueOnce(Error('lease release failure'))
    await expect(f.session.close()).rejects.toThrow()
    expect(f.workspace.ownsLease).toBe(true); expect(f.session.ownsResources).toBe(true)
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
    await f.session.close(); expect(f.adapter.release).toHaveBeenCalledOnce()
    expect(f.workspace.remove).toHaveBeenCalledOnce()
  })
})

describe('Learning deadlines and retained pending work', () => {
  it('passes the approved per-phase deadlines and aggregate quotas to the adapter', async () => {
    const f = fixture()
    await f.session.runPhase('prepare'); await f.session.runPhase('compile'); await f.session.runPhase('execute')
    expect(f.adapter.runPhase.mock.calls.map(([phase, context]) => [phase, context.deadline, context.jobMemoryBytes])).toEqual([
      ['prepare', 10_000, null], ['compile', 30_000, 2 * 1024 ** 3], ['execute', 2_000, 512 * 1024 ** 2],
    ])
    await f.session.close()
  })
  it('shares one operation deadline across prepare, compile and sequential cases', async () => {
    const f = fixture()
    await f.session.runPhase('prepare'); await vi.advanceTimersByTimeAsync(9_000)
    await f.session.runPhase('compile'); await vi.advanceTimersByTimeAsync(29_000)
    await f.session.runPhase('execute'); await vi.advanceTimersByTimeAsync(21_000)
    const pending = gate(); let context!: ExercisePhaseContext
    f.adapter.runPhase.mockImplementationOnce(async (_, ctx) => { context = ctx; await pending.promise })
    const phase = f.session.runPhase('execute'); const failure = expect(phase).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(context.deadline).toBe(60_000)
    await vi.advanceTimersByTimeAsync(1_000); await failure
    expect(f.session.snapshot().reason).toBe('OPERATION_TIMEOUT')
    expect(context.signal.aborted).toBe(true)
    pending.resolve(); await f.session.close()
  })

  it.each([['prepare', 10_000, 'PREPARE_TIMEOUT'], ['compile', 30_000, 'COMPILE_TIMEOUT'], ['execute', 2_000, 'EXECUTE_TIMEOUT']] as const)(
    'cancels at the %s phase deadline and retains work until settled', async (phase, ms, reason) => {
      const f = fixture()
      if (phase !== 'prepare') await f.session.runPhase('prepare')
      const pending = gate(); f.adapter.runPhase.mockImplementationOnce(() => pending.promise)
      const work = f.session.runPhase(phase); const rejected = expect(work).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(ms); await rejected
      expect(f.session.snapshot().reason).toBe(reason)
      expect(f.session.ownsResources).toBe(true)
      pending.resolve(); await f.session.close()
      expect(f.adapter.terminate).toHaveBeenCalledOnce()
    },
  )

  it('holds the lease and original pending FINALIZED I/O across caller timeouts and dedupes concurrent retries', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    const pending = gate(), original = vi.mocked(f.checkpoints.write).getMockImplementation()!
    vi.mocked(f.checkpoints.write).mockImplementation(async r => { if (r.checkpoint === 'FINALIZED') await pending.promise; await original(r) })
    const first = f.session.close(), second = f.session.close()
    const failures = [expect(first).rejects.toMatchObject({ details: { reason: 'CLEANUP_DEADLINE' } }), expect(second).rejects.toThrow()]
    await vi.advanceTimersByTimeAsync(12_000); await Promise.all(failures)
    expect(f.workspace.ownsLease).toBe(true); expect(f.session.pendingCleanup).toBe(true)
    expect(f.session.snapshot().cleanup).toMatchObject({ state: 'FAILED', pendingIo: true, processClean: false, cleanupComplete: false })
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    const retry = f.session.close(); pending.resolve(); await retry
    expect(f.adapter.release).toHaveBeenCalledOnce(); expect(f.adapter.closeHandles).toHaveBeenCalledOnce()
    expect(f.workspace.ownsLease).toBe(false)
  })

  it('handles preparation failure without pretending that a checkpoint/workspace was finalized', async () => {
    const f = fixture(); vi.mocked(f.workspace.prepare).mockRejectedValueOnce(Error('prepare failure'))
    await expect(f.session.runPhase('prepare')).rejects.toThrow()
    await expect(f.session.close()).rejects.toThrow()
    expect(f.session.ownsResources).toBe(true)
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(false)
    expect(f.adapter.release).not.toHaveBeenCalled()
  })

  it('keeps pending preparation I/O owned after both phase and cleanup caller deadlines, then joins it without launching', async () => {
    const f = fixture(), pending = gate()
    const prepare = vi.mocked(f.workspace.prepare).getMockImplementation()!
    vi.mocked(f.workspace.prepare).mockImplementation(async () => { await pending.promise; await prepare() })
    const work = f.session.runPhase('prepare'); const rejected = expect(work).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000); await rejected
    const wait = f.session.close(); const timedOut = expect(wait).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(12_000); await timedOut
    expect(f.session.pendingCleanup).toBe(true)
    const retry = f.session.close(); pending.resolve(); await retry
    expect(f.adapter.runPhase).not.toHaveBeenCalled()
    expect(f.adapter.terminate).toHaveBeenCalledOnce()
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })

  it('can acknowledge OWNED after prepare persistence fails without repeating preparation', async () => {
    const f = fixture(); vi.mocked(f.checkpoints.write).mockRejectedValueOnce(Error('OWNED read-back failure'))
    await expect(f.session.runPhase('prepare')).rejects.toThrow()
    await f.session.close()
    expect(f.workspace.prepare).toHaveBeenCalledOnce()
    expect(f.adapter.runPhase).not.toHaveBeenCalled()
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })

  it('bounds combined Unicode output and cancels on overflow without publishing excess bytes', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.runPhase.mockImplementationOnce(async (_, ctx) => {
      ctx.output('stdout', '😀'.repeat(EXERCISE_LIMITS.outputBytes / 4))
      ctx.output('stderr', 'é')
      ctx.output('stdout', 'late output')
    })
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    await f.session.close()
    expect(f.session.snapshot().reason).toBe('OUTPUT_LIMIT')
    expect(f.session.snapshot().stderr).toBe('')
    expect(validateExerciseSnapshot(f.session.snapshot()).ok).toBe(true)
  })

  it('rejects concurrent phases and invalid phase order', async () => {
    const f = fixture(); await expect(f.session.runPhase('execute')).rejects.toThrow()
    await f.session.runPhase('prepare')
    const pending = gate(); f.adapter.runPhase.mockImplementationOnce(() => pending.promise)
    const active = f.session.runPhase('compile')
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    pending.resolve(); await active; await f.session.close()
  })

  it('rejects a late result even when a blocked event loop has not delivered the timer callback', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.runPhase.mockImplementationOnce(async () => { vi.setSystemTime(2_001) })
    await expect(f.session.runPhase('execute')).rejects.toThrow()
    expect(f.session.snapshot().reason).toBe('EXECUTE_TIMEOUT')
    await f.session.close()
  })

  it('reports a late cleanup result when the timer callback was blocked, while preserving truthful completed state', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.terminate.mockImplementationOnce(async () => { vi.setSystemTime(12_001) })
    await expect(f.session.close()).rejects.toMatchObject({ details: { reason: 'CLEANUP_DEADLINE' } })
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
    expect(f.workspace.ownsLease).toBe(false)
    await f.session.close(); expect(f.adapter.release).toHaveBeenCalledOnce()
  })

  it('uses the deadline reason when synchronous native failure arrives after the budget, retaining ownership for retry', async () => {
    const f = fixture(); await f.session.runPhase('prepare')
    f.adapter.runPhase.mockImplementationOnce(async () => { vi.setSystemTime(2_001); throw Error('late CreateProcess failure') })
    await expect(f.session.runPhase('execute')).rejects.toMatchObject({ details: { reason: 'EXECUTE_TIMEOUT' } })
    await f.session.close()
    expect(f.session.snapshot().reason).toBe('EXECUTE_TIMEOUT')
  })
})
