import { describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { WindowsExerciseRuntimeAdapter, learningEnvironment } from '../../src/main/services/learning/runtime/windows-exercise-adapter'
import { mapLearningNativeError, type LearningJobSample, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import type { ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'

function mockNative() {
  const samples = new Map<object, LearningJobSample>()
  const states = new Map<object, { terminated: boolean; released: boolean; handlesClosed: boolean }>()
  let pid = 10
  const native: LearningNativeBinding = {
    capability: 'student-ide-learning-job-v1',
    start: vi.fn((_exe, _args, _cwd, quota) => {
      const h = {}, rootPid = ++pid
      states.set(h, { terminated: false, released: false, handlesClosed: false })
      samples.set(h, { rootPid, quotaBytes: quota, peakJobCommitBytes: 100, reportedJobCommitBytes: 90,
        members: [rootPid], activeProcesses: 1, totalProcesses: 1, retained: [{ pid: rootPid, created: `time-${pid}`, signaled: false }],
        coverageComplete: true, observerSettled: false, exitCode: 259, events: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })
      return h
    }),
    poll: vi.fn(h => structuredClone(samples.get(h)!) as LearningJobSample),
    control: vi.fn((h, op) => {
      const state = states.get(h)!
      if (op === 'release') state.released = true
      if (op === 'closeHandles') state.handlesClosed = true
      if (op === 'terminate') state.terminated = true
      if (op !== 'resume' && op !== 'terminate') return
      const s = samples.get(h)!
      // A real exited process keeps its OS exit code when cleanup terminates its empty Job.
      if (op === 'terminate' && s.retained.every(p => p.signaled)) return
      s.members = []; s.activeProcesses = 0; s.observerSettled = true; s.exitCode = 0
      s.retained.forEach(p => { p.signaled = true })
    }),
    state: vi.fn(h => ({ ...states.get(h)! })),
    acquireLease: vi.fn(() => ({})), watch: vi.fn(() => ({})), observation: vi.fn() as unknown as LearningNativeBinding['observation'],
  }
  // structuredClone(Buffer) produces Uint8Array; native contract requires Buffers.
  vi.mocked(native.poll).mockImplementation(h => { const s = samples.get(h)!; return { ...structuredClone(s), stdout: Buffer.from(s.stdout), stderr: Buffer.from(s.stderr) } })
  return { native, samples }
}
function context(quota = 512 * 1024 ** 2): ExercisePhaseContext {
  return { signal: new AbortController().signal, deadline: performance.now() + 30_000, jobMemoryBytes: quota, output: vi.fn() }
}
const spec = { executable: 'C:\\node.exe', args: ['fixture'], cwd: 'C:\\learning' }

describe('Learning Windows adapter', () => {
  it('returns nonzero compiler exit as detached data while Common runPhase still rejects it', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => {
      control(h, op)
      if (op === 'resume') { samples.get(h)!.exitCode = 1; samples.get(h)!.stdout = Buffer.from('Solution.cs(1,1): error CS1002') }
    })
    const ctx = context(2 * 1024 ** 3)
    const result = await adapter.runProcessPhase('compile', ctx)
    expect(result).toEqual({ phase: 'compile', exitCode: 1, processExited: true, stdoutSettled: true,
      stderrSettled: true, observerSettled: true, failure: 'NONZERO_EXIT', jobMemoryLimitObserved: false })
    expect(Object.isFrozen(result)).toBe(true)
    expect(ctx.output).toHaveBeenCalledWith('stdout', expect.stringContaining('CS1002'))
    expect(adapter.diagnostics()[0].released).toBe(false)
    await expect(adapter.runPhase('compile', context(2 * 1024 ** 3))).rejects.toMatchObject({ details: { reason: 'RUNTIME_FAILED' } })
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    const polls = vi.mocked(native.poll).mock.calls.length
    expect(adapter.processResult()).toEqual(result)
    await adapter.release(); await adapter.closeHandles()
    expect(vi.mocked(native.poll).mock.calls.length).toBe(polls)
  })

  it('does not treat process exit or exit code 259 as pipe settlement or cleanup', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => {
      control(h, op)
      if (op === 'resume') { samples.get(h)!.exitCode = 259; samples.get(h)!.observerSettled = false }
    })
    const ctx = context(2 * 1024 ** 3), work = adapter.runProcessPhase('compile', ctx)
    expect(adapter.processResult()).toMatchObject({ exitCode: 259, processExited: true, observerSettled: false, stdoutSettled: false })
    await expect(adapter.release()).rejects.toThrow()
    const s = samples.values().next().value!
    s.observerSettled = true; s.stderr = Buffer.from('late diagnostic')
    await expect(work).resolves.toMatchObject({ exitCode: 259, failure: 'NONZERO_EXIT', stderrSettled: true })
    expect(ctx.output).toHaveBeenCalledWith('stderr', 'late diagnostic')
    await adapter.release(); await adapter.closeHandles()
  })

  it.each(['COMPILE_TIMEOUT', 'OPERATION_TIMEOUT', 'OWNER_LOST', 'OUTPUT_LIMIT'] as const)('retains %s separately from killed-process exit', async reason => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => { if (op !== 'resume') control(h, op) })
    const abort = new AbortController(), ctx = { ...context(2 * 1024 ** 3), signal: abort.signal }
    const work = adapter.runProcessPhase('compile', ctx)
    void work.catch(() => {})
    expect(adapter.processResult()).toMatchObject({ exitCode: null, processExited: false })
    abort.abort(exerciseCoreError(reason))
    await expect(work).rejects.toThrow()
    const failure = reason.endsWith('_TIMEOUT') ? 'TIMEOUT' : reason === 'OUTPUT_LIMIT' ? 'OUTPUT_LIMIT' : 'CANCELLED'
    expect(adapter.processResult()).toMatchObject({ failure, observerSettled: false })
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    expect(adapter.processResult()).toMatchObject({ failure, exitCode: 0, observerSettled: true })
  })

  it('observes a monotonic phase deadline without claiming process termination', async () => {
    const timer = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') timer.mockReturnValue(31_000) })
    try {
      await expect(adapter.runProcessPhase('compile', context(2 * 1024 ** 3))).rejects.toMatchObject({ details: { reason: 'PHASE_DEADLINE' } })
      expect(adapter.processResult()).toMatchObject({ failure: 'TIMEOUT' })
      await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    } finally { timer.mockRestore() }
  })

  it('records sanitized infrastructure failure without inventing an exit result', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    vi.mocked(native.start).mockImplementationOnce(() => { throw { code: 'LEARNING_SPAWN', message: 'C:\\secret' } })
    await expect(adapter.runProcessPhase('compile', context(2 * 1024 ** 3))).rejects.toMatchObject({ details: { reason: 'NATIVE_FAILURE' } })
    expect(adapter.processResult()).toMatchObject({ exitCode: null, processExited: false, failure: 'INFRASTRUCTURE_FAILURE' })
    expect(JSON.stringify(adapter.processResult())).not.toContain('secret')
  })

  it('rejects cancellation arriving between the final sample and phase completion', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const abort = new AbortController()
    const work = adapter.runProcessPhase('compile', { ...context(2 * 1024 ** 3), signal: abort.signal })
    abort.abort(exerciseCoreError('CONTEXT_CHANGED'))
    await expect(work).rejects.toThrow()
    expect(adapter.processResult()).toMatchObject({ failure: 'CANCELLED', exitCode: 0 })
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
  })

  it('rejects concurrent admission without replacing the active process observation', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const first = adapter.runProcessPhase('compile', context(2 * 1024 ** 3))
    await expect(adapter.runProcessPhase('execute', context())).rejects.toMatchObject({ details: { reason: 'ADMISSION_CLOSED' } })
    await first
    expect(adapter.processResult()?.phase).toBe('compile')
    expect(native.start).toHaveBeenCalledOnce()
    await adapter.release(); await adapter.closeHandles()
  })

  it('requires native evidence for memory failure and bounds retained Job events', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => {
      control(h, op)
      if (op === 'resume') samples.get(h)!.events = Array.from({ length: 1000 }, () => ({ message: 10, pid: 11 }))
    })
    await expect(adapter.runProcessPhase('compile', context(2 * 1024 ** 3))).rejects.toThrow()
    expect(adapter.processResult()).toMatchObject({ failure: 'JOB_MEMORY_LIMIT', jobMemoryLimitObserved: true })
    expect(adapter.diagnostics()[0].memoryEvents).toHaveLength(64)
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
  })

  it('retains a poll failure while cleanup retries and later settles the process', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const poll = vi.mocked(native.poll).getMockImplementation()!
    vi.mocked(native.poll).mockImplementationOnce(poll).mockImplementationOnce(() => { throw { code: 'LEARNING_PIPE', message: 'private path' } })
    await expect(adapter.runProcessPhase('compile', context(2 * 1024 ** 3))).rejects.toThrow()
    expect(adapter.processResult()).toMatchObject({ failure: 'INFRASTRUCTURE_FAILURE', observerSettled: false })
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    expect(adapter.processResult()).toMatchObject({ failure: 'INFRASTRUCTURE_FAILURE', exitCode: 0, observerSettled: true })
  })

  it('streams split UTF-8 and drains its decoder before reporting settled', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    const bytes = Buffer.from('🙂')
    vi.mocked(native.control).mockImplementation((h, op) => {
      control(h, op)
      if (op === 'resume') { samples.get(h)!.stdout = bytes.subarray(0, 2); samples.get(h)!.observerSettled = false }
    })
    const ctx = context(2 * 1024 ** 3), work = adapter.runProcessPhase('compile', ctx)
    expect(ctx.output).not.toHaveBeenCalled()
    const s = samples.values().next().value!
    s.stdout = bytes.subarray(2); s.observerSettled = true
    await expect(work).resolves.toMatchObject({ stdoutSettled: true, failure: null })
    expect(ctx.output).toHaveBeenCalledWith('stdout', '🙂')
    s.stdout = Buffer.alloc(0)
    await adapter.release(); await adapter.closeHandles()
  })

  it('keeps the Core combined operation output limiter authoritative with the result port', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'prepare' ? null : spec, {})
    const control = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementation((h, op) => {
      control(h, op)
      if (op === 'resume') {
        const s = samples.get(h)!
        s.stdout = Buffer.alloc(600 * 1024, 65); s.stderr = Buffer.alloc(600 * 1024, 66)
      }
    })
    const workspace = new ExerciseWorkspace('mock-learning', 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
    vi.spyOn(workspace, 'prepare').mockImplementation(async () => { await workspace.acquire(); workspace.identity = { dev: '1', ino: '2', birthtimeNs: '3' } })
    vi.spyOn(workspace, 'remove').mockResolvedValue()
    const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language: 'csharp', code: '', sourceRevision: 0 },
      ownerId: 'owner', workspace, adapter, checkpoints: { read: vi.fn(), write: async () => {} } })
    await session.runPhase('prepare')
    await expect(session.runPhase('compile')).rejects.toThrow()
    await session.close()
    const snapshot = session.snapshot()
    expect(snapshot.reason).toBe('OUTPUT_LIMIT')
    expect(Buffer.byteLength(snapshot.stdout) + Buffer.byteLength(snapshot.stderr)).toBeLessThanOrEqual(1024 ** 2)
    expect(adapter.processResult()).toMatchObject({ failure: 'OUTPUT_LIMIT', observerSettled: true })
    expect(snapshot.cleanup.cleanupComplete).toBe(true)
  })
  it('retains suspended ownership, validates quota/member identity before resume, and aggregates phase Jobs', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    await adapter.runPhase('compile', context(2 * 1024 ** 3)); await adapter.runPhase('execute', context())
    expect(vi.mocked(native.start).mock.calls.map(c => c[3])).toEqual([2 * 1024 ** 3, 512 * 1024 ** 2])
    expect(vi.mocked(native.poll).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(native.control).mock.invocationCallOrder[0])
    expect((await adapter.evidence()).retained).toHaveLength(2)
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    const count = vi.mocked(native.control).mock.calls.length
    await adapter.release(); await adapter.closeHandles(); await adapter.evidence()
    expect(vi.mocked(native.control).mock.calls.length).toBe(count)
    expect(adapter.diagnostics().every(s => s.released && s.handlesClosed)).toBe(true)
  })

  it('retains ownership if resume fails and permits subsequent cleanup', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    vi.mocked(native.control).mockImplementationOnce(() => { throw { code: 'LEARNING_SPAWN', win32: 5 } })
    await expect(adapter.runPhase('execute', context())).rejects.toMatchObject({ details: { nativeCode: 'LEARNING_SPAWN' } })
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    expect(vi.mocked(native.start)).toHaveBeenCalledOnce()
  })

  it('never resumes a suspended root if synchronous startup has already consumed its deadline', async () => {
    const timer = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const start = vi.mocked(native.start).getMockImplementation()!
    vi.mocked(native.start).mockImplementation((...args) => { const h = start(...args); timer.mockReturnValue(2_001); return h })
    try {
      await expect(adapter.runPhase('execute', { ...context(), deadline: 2_000 })).rejects.toMatchObject({ details: { reason: 'PHASE_DEADLINE' } })
      expect(native.control).not.toHaveBeenCalled()
      await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    } finally { timer.mockRestore() }
  })

  it('rejects quota drift before resume without losing the created Job', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    const poll = vi.mocked(native.poll).getMockImplementation()!
    vi.mocked(native.poll).mockImplementationOnce(h => ({ ...poll(h), quotaBytes: 1 }))
    await expect(adapter.runPhase('execute', context())).rejects.toThrow()
    expect(native.control).not.toHaveBeenCalled()
    expect(samples.size).toBe(1)
    await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
  })

  it('does not duplicate successful per-Job release after a later Job release fails', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    await adapter.runPhase('compile', context(2 * 1024 ** 3)); await adapter.runPhase('execute', context())
    const jobs = vi.mocked(native.start).mock.results.map(r => r.value)
    const original = vi.mocked(native.control).getMockImplementation()!
    let fail = true
    vi.mocked(native.control).mockImplementation((h, op) => {
      if (h === jobs[1] && op === 'release' && fail) { fail = false; throw { code: 'LEARNING_CLOSE', win32: 6 } }
      original(h, op)
    })
    await expect(adapter.release()).rejects.toThrow(); await adapter.release(); await adapter.closeHandles()
    expect(vi.mocked(native.control).mock.calls.filter(([h, op]) => h === jobs[0] && op === 'release')).toHaveLength(1)
  })

  it('reconciles an error returned after release, without querying or releasing that Job again', async () => {
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    await adapter.runPhase('execute', context())
    const original = vi.mocked(native.control).getMockImplementation()!
    vi.mocked(native.control).mockImplementationOnce((h, op) => { original(h, op); throw { code: 'LEARNING_CLOSE', win32: 6 } })
    await expect(adapter.release()).rejects.toThrow()
    const queries = vi.mocked(native.poll).mock.calls.length
    await adapter.evidence(); await adapter.release(); await adapter.closeHandles()
    expect(vi.mocked(native.poll).mock.calls.length).toBe(queries)
    expect(vi.mocked(native.control).mock.calls.filter(([, op]) => op === 'release')).toHaveLength(1)
  })

  it('separates Job event 10 from runtime OOM text and nonzero exit', async () => {
    for (const jobEvent of [false, true]) {
      const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
      const original = vi.mocked(native.control).getMockImplementation()!
      vi.mocked(native.control).mockImplementation((h, op) => {
        original(h, op)
        if (op === 'resume') { const s = samples.get(h)!; s.stderr = Buffer.from('runtime OOM'); s.exitCode = 1; s.events = jobEvent ? [{ message: 10, pid: s.rootPid }] : [] }
      })
      await expect(adapter.runPhase('execute', context())).rejects.toMatchObject({ details: { reason: jobEvent ? 'JOB_MEMORY_LIMIT' : 'RUNTIME_FAILED' } })
      await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    }
  })

  it('keeps an unresolved query error distinct from a historical count mismatch', async () => {
    const { native, samples } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    await adapter.runPhase('execute', context())
    samples.values().next().value!.totalProcesses = 7
    expect((await adapter.evidence()).totalProcesses).toBe(7)
    vi.mocked(native.poll).mockImplementationOnce(() => { throw { code: 'LEARNING_QUERY', win32: 5 } })
    await expect(adapter.release()).rejects.toMatchObject({ details: { nativeCode: 'LEARNING_QUERY' } })
    await adapter.release(); await adapter.closeHandles()
  })

  it('filters injected Node options and uses an explicitly bounded argv plan', async () => {
    expect(learningEnvironment({ NODE_OPTIONS: '--require evil', node_path: 'evil', ELECTRON_RUN_AS_NODE: '1', OK: 'yes' })).toEqual(['OK=yes'])
    const { native } = mockNative(), adapter = new WindowsExerciseRuntimeAdapter(native, () => spec, {})
    await expect(adapter.runPhase('execute', context(64 * 1024 ** 2))).rejects.toThrow()
    expect(native.start).not.toHaveBeenCalled()
  })

  it('maps only safe native codes/numbers, never native paths or messages', () => {
    const mapped = mapLearningNativeError({ code: 'LEARNING_QUERY', win32: 5, message: 'C:\\secret\\file', stack: 'unsafe' })
    expect(mapped.details).toEqual({ reason: 'NATIVE_FAILURE', nativeCode: 'LEARNING_QUERY', win32: 5 })
    expect(mapped.message).not.toContain('secret')
    expect(mapLearningNativeError({ code: 'C:\\secret', win32: NaN }).details).toEqual({ reason: 'NATIVE_FAILURE', nativeCode: 'LEARNING_NATIVE', win32: 0 })
  })

  it('preserves JOB_MEMORY_LIMIT through Core cancellation and Policy B cleanup', async () => {
    const { native } = mockNative()
    const adapter = new WindowsExerciseRuntimeAdapter(native, () => null, {})
    const workspace = new ExerciseWorkspace('mock-learning', 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
    vi.spyOn(workspace, 'prepare').mockImplementation(async () => { await workspace.acquire(); workspace.identity = { dev: '1', ino: '2', birthtimeNs: '3' } })
    vi.spyOn(workspace, 'remove').mockResolvedValue()
    const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language: 'csharp', code: '', sourceRevision: 0 },
      ownerId: 'owner', workspace, adapter, checkpoints: { read: vi.fn(), write: async () => {} } })
    await session.runPhase('prepare')
    vi.spyOn(adapter, 'runPhase').mockRejectedValueOnce(exerciseCoreError('JOB_MEMORY_LIMIT'))
    await expect(session.runPhase('execute')).rejects.toThrow(); await session.close()
    expect(session.snapshot().reason).toBe('JOB_MEMORY_LIMIT')
    expect(session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
})
