import { performance } from 'node:perf_hooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsCsharpExecutionAdapter } from '../../src/main/services/learning/runtime/csharp-execution-adapter'
import type { CsharpSdkResolver, CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import type { LearningJobSample, LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import type { ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { runCsharpSamples } from '../../src/main/services/learning/runtime/csharp-orchestrator'
import type { Exercise } from '../../src/shared/contracts/practice'
const mocks = vi.hoisted(() => ({ compile: vi.fn(), artifact: vi.fn(), capture: vi.fn(), validate: vi.fn() }))
vi.mock('../../src/main/services/learning/runtime/csharp-runtime-files', () => ({ CsharpRuntimeFiles: class {
  capture = mocks.capture; validate = mocks.validate
} }))
vi.mock('../../src/main/services/learning/runtime/csharp-compiler', () => ({ csharpEnvironment: () => ({}), RoslynCsharpCompiler: class {
  compile = mocks.compile; revalidateArtifact = mocks.artifact
  runtime = { terminate: vi.fn(async () => {}), settleObservers: vi.fn(async () => {}), release: vi.fn(async () => {}), closeHandles: vi.fn(async () => {}),
    evidence: async () => ({ members: [], retained: [], totalProcesses: 0, activeProcesses: 0, coverageComplete: true, observerSettled: true, unresolvedErrors: false }), diagnostics: () => [] }
} }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.compile.mockResolvedValue({ result: { status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null },
    artifact: { assemblyPath: 'C:\\workspace\\csharp\\Learning.dll', runtimeConfigPath: 'C:\\workspace\\csharp\\Learning.runtimeconfig.json' } })
  mocks.artifact.mockResolvedValue(undefined); mocks.capture.mockResolvedValue(undefined); mocks.validate.mockResolvedValue(undefined)
})
const response = (actual: unknown = 8) => JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual, stdout: '', stderr: '' })
function fixture(wire: Buffer | ((request: { caseIndex: number; args: unknown[] }) => Buffer) = Buffer.from(response()), exitCode = 0, exercise: Exercise = exercises[0], envelope = 0) {
  const sample: LearningJobSample = { rootPid: 123, members: [123], activeProcesses: 1, totalProcesses: 1,
    retained: [{ pid: 123, created: 'identity', signaled: false }], quotaBytes: 512 * 1024 ** 2, peakJobCommitBytes: 0,
    reportedJobCommitBytes: 0, coverageComplete: true, observerSettled: false, exitCode: 259, events: [],
    stdinSettled: true, stdinFailed: false, stdinBytesWritten: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
  const samples = new Map<object, LearningJobSample>(), requests = new Map<object, { caseIndex: number; args: unknown[] }>()
  const states = new Map<object, { terminated: boolean; released: boolean; handlesClosed: boolean }>()
  const pristine = structuredClone(sample)
  const finish = (s: LearningJobSample) => { s.members = []; s.activeProcesses = 0; s.retained[0].signaled = true; s.observerSettled = true; s.exitCode = exitCode }
  const native: LearningNativeBinding = { capability: 'student-ide-learning-job-v1', start: vi.fn(() => {
    const handle = {}, s = samples.size ? structuredClone(pristine) : sample
    s.rootPid += samples.size; s.members = [s.rootPid]; s.retained = [{ pid: s.rootPid, created: `identity-${s.rootPid}`, signaled: false }]
    samples.set(handle, s); states.set(handle, { terminated: false, released: false, handlesClosed: false }); return handle
  }), submitInput: vi.fn((h, input) => { requests.set(h, JSON.parse(input.toString())) }),
    poll: vi.fn(h => { const source = samples.get(h)!, s = { ...source }; source.stdout = Buffer.alloc(0); source.stderr = Buffer.alloc(0); return s }),
    control: vi.fn((h, operation) => {
      const s = samples.get(h)!, state = states.get(h)!
      if (operation === 'resume') { finish(s); s.stdout = typeof wire === 'function' ? wire(requests.get(h)!) : wire }
      if (operation === 'terminate') { finish(s); state.terminated = true }
      if (operation === 'release') state.released = true
      if (operation === 'closeHandles') state.handlesClosed = true
    }), state: h => states.get(h)!, acquireLease: vi.fn(), watch: vi.fn(), observation: vi.fn() }
  const sdk = { dotnetPath: 'C:\\sdk\\dotnet.exe', runtimeVersion: '10.0.7' } as CsharpSdkSelection
  const resolver = { resolve: vi.fn<CsharpSdkResolver['resolve']>().mockResolvedValue({ state: 'AVAILABLE', selection: sdk }) }
  const workspace = new ExerciseWorkspace('C:\\workspace', 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
  const request = { exerciseId: exercise.id, language: 'csharp' as const, code: '', sourceRevision: 1 }
  const adapter = new WindowsCsharpExecutionAdapter(request, workspace, native, resolver, [exercise], envelope)
  const abort = new AbortController()
  const context: ExercisePhaseContext = { signal: abort.signal, deadline: performance.now() + 20_000, jobMemoryBytes: null, output: vi.fn() }
  const prepare = async () => { await adapter.runPhase('prepare', context); await adapter.runPhase('compile', { ...context, jobMemoryBytes: 2 * 1024 ** 3 }); await adapter.verifyBetweenCases(context) }
  const execute = () => adapter.runPhase('execute', { ...context, jobMemoryBytes: 512 * 1024 ** 2 })
  const cleanup = async () => { await adapter.terminate('COMPLETED'); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles() }
  return { adapter, native, sample, context, abort, prepare, execute, cleanup, resolver, samples, workspace, request }
}
function sessionFor(f: ReturnType<typeof fixture>, clock?: ExerciseClock) {
  vi.spyOn(f.workspace, 'prepare').mockImplementation(async () => { await f.workspace.acquire(); f.workspace.identity = { dev: '1', ino: '2', birthtimeNs: '3' } })
  vi.spyOn(f.workspace, 'remove').mockResolvedValue()
  return new ExerciseSession({ request: f.request, ownerId: 'orchestration-unit', workspace: f.workspace, adapter: f.adapter, clock,
    checkpoints: { write: vi.fn(async () => {}), read: vi.fn() } })
}
const threeSamples: Exercise = { ...exercises[0], samples: [{ args: [14, -6], expected: 999 }, { args: [0, 0], expected: 999 }, { args: [1, 2], expected: 999 }] }
const typedWire = (request: { caseIndex: number; args: unknown[] }) => Buffer.from(JSON.stringify({ ...JSON.parse(response()),
  caseIndex: request.caseIndex, actual: Number(request.args[0]) + Number(request.args[1]) }))
describe('C# single-sample execution (mock compiler/runtime dependencies; fake native process)', () => {
  it('A03 records TIMEOUT/prepare after Core expires before the resolver settles', async () => {
    let now = performance.now()
    const timers = new Map<number, () => void>()
    const clock: ExerciseClock = { now: () => now, schedule: (callback, ms) => {
      const due = now + ms; timers.set(due, callback); return () => { timers.delete(due) }
    } }
    const f = fixture(), session = sessionFor(f, clock)
    let entered!: () => void, settle!: () => void
    const ready = new Promise<void>(r => { entered = r }), pending = new Promise<void>(r => { settle = r })
    f.resolver.resolve.mockImplementationOnce(async context => { entered(); await pending; throw context.signal.reason })
    const release = vi.spyOn(f.workspace, 'releaseLease')
    const work = runCsharpSamples(session, f.adapter); void work.catch(() => {})
    await ready
    const due = Math.min(...timers.keys()), expire = timers.get(due)!
    expect(due - now).toBe(10_000); now = due; expire()
    expect(session.limits.reason).toBe('PREPARE_TIMEOUT'); settle()
    await expect(work).resolves.toEqual({ compile: null, cases: [], notRunCaseIndices: [0, 1],
      failure: { kind: 'TIMEOUT', phase: 'prepare', caseIndex: null } })
    expect(session.snapshot()).toMatchObject({ reason: 'PREPARE_TIMEOUT',
      cleanup: { proof: 'VERIFIED', cleanupComplete: true, workspace: 'REMOVED' } })
    expect(f.native.start).not.toHaveBeenCalled(); expect(mocks.compile).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce(); expect(f.workspace.ownsLease).toBe(false)
  })
  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT', 'OWNER_LOST', 'SHUTDOWN'] as const)(
    'A03 suppresses Prepare publication after %s without inventing a timeout', async reason => {
      const f = fixture(), session = sessionFor(f)
      let entered!: () => void, settle!: () => void
      const ready = new Promise<void>(r => { entered = r }), pending = new Promise<void>(r => { settle = r })
      f.resolver.resolve.mockImplementationOnce(async context => { entered(); await pending; throw context.signal.reason })
      const release = vi.spyOn(f.workspace, 'releaseLease')
      const work = runCsharpSamples(session, f.adapter); void work.catch(() => {})
      await ready
      const close = session.close(reason); void close.catch(() => {})
      settle(); await close
      await expect(work).rejects.toMatchObject({ details: { reason: 'RESULT_INVALIDATED' } })
      expect(() => f.adapter.result()).toThrow()
      expect(session.snapshot()).toMatchObject({ reason,
        cleanup: { proof: 'VERIFIED', cleanupComplete: true, workspace: 'REMOVED' } })
      expect(f.native.start).not.toHaveBeenCalled(); expect(mocks.compile).not.toHaveBeenCalled()
      expect(release).toHaveBeenCalledOnce(); expect(f.workspace.ownsLease).toBe(false)
    })
  it('A03 requires a trusted aborted reason rather than timeout-shaped data', async () => {
    const f = fixture()
    f.resolver.resolve.mockImplementationOnce(async () => {
      f.abort.abort({ details: { reason: 'PREPARE_TIMEOUT' } }); throw f.abort.signal.reason
    })
    await expect(f.adapter.runPhase('prepare', f.context)).rejects.toEqual({ details: { reason: 'PREPARE_TIMEOUT' } })
    expect(f.adapter.result()).toEqual({ compile: null, cases: [], notRunCaseIndices: [0, 1], failure: null })
    expect(f.native.start).not.toHaveBeenCalled(); await f.cleanup()
  })
  it.each(['MISSING', 'INVALID_CONFIGURATION'] as const)('records SDK %s without compilation or launch', async state => {
    const f = fixture()
    f.resolver.resolve.mockResolvedValueOnce(state === 'MISSING' ? { state, reason: 'SDK_NOT_FOUND' } : { state, reason: 'SDK_INCOMPATIBLE' })
    await expect(f.prepare()).rejects.toThrow()
    expect(f.adapter.result()).toMatchObject({ compile: null, cases: [], failure: { phase: 'prepare', kind: state === 'MISSING' ? 'SDK_MISSING' : 'SDK_INCOMPATIBLE' } })
    expect(mocks.compile).not.toHaveBeenCalled(); expect(f.native.start).not.toHaveBeenCalled(); await f.cleanup()
  })
  it('sends catalogue JSON over stdin with fixed host/runtime arguments and returns detached actual data', async () => {
    const f = fixture(); await f.prepare(); await f.execute()
    expect(f.native.start).toHaveBeenCalledWith('C:\\sdk\\dotnet.exe', ['exec', '--fx-version', '10.0.7', '--roll-forward', 'Disable',
      '--runtimeconfig', 'C:\\workspace\\csharp\\Learning.runtimeconfig.json', 'C:\\workspace\\csharp\\Learning.dll'], expect.any(String), 512 * 1024 ** 2, [])
    expect(JSON.parse(vi.mocked(f.native.submitInput).mock.calls[0][1].toString())).toEqual({ protocolVersion: 1, caseIndex: 0, args: [14, -6] })
    expect(f.context.output).toHaveBeenCalledWith('stdout', '', Buffer.byteLength(response()))
    expect(f.adapter.result().cases[0]).toMatchObject({ actual: 8, outcome: 'RETURNED', failure: null })
    const detached = f.adapter.result(); detached.cases[0].actual = 99
    expect(f.adapter.result().cases[0].actual).toBe(8)
    await expect(f.execute()).rejects.toThrow(); await f.cleanup()
  })
  it.each([Buffer.from('null'), Buffer.from('{bad'), Buffer.from(response('wrong type')),
    Buffer.from(response().replace('"caseIndex":0', '"caseIndex":1')), Buffer.concat([Buffer.from(response()), Buffer.from([255])]),
    Buffer.from(response() + response())])('rejects malformed bytes/schema/framing (case %#)', async wire => {
    const f = fixture(wire); await f.prepare()
    await expect(f.execute()).rejects.toMatchObject({ details: { reason: 'RUNTIME_FAILED' } })
    expect(f.adapter.result().cases[0]).toMatchObject({ actual: null, failure: { kind: 'RUNTIME_ERROR' } })
    await f.cleanup()
  })
  it('rejects an apparently valid response with a nonzero OS exit', async () => {
    const f = fixture(Buffer.from(response()), 17); await f.prepare(); await expect(f.execute()).rejects.toThrow()
    expect(f.adapter.result().cases[0]).toMatchObject({ exitCode: 17, failure: { kind: 'RUNTIME_ERROR' } }); await f.cleanup()
  })
  it('counts physical stdout and stderr together and rejects overflow before parsing', async () => {
    const f = fixture(Buffer.alloc(1024 * 1024)); await f.prepare()
    const control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') f.sample.stderr = Buffer.from('x') })
    await expect(f.execute()).rejects.toMatchObject({ details: { reason: 'OUTPUT_LIMIT' } })
    expect(f.adapter.result().failure?.kind).toBe('OUTPUT_LIMIT'); await f.cleanup()
  })
  it('requires native event evidence for a Job-limit classification', async () => {
    const f = fixture(); await f.prepare(); f.sample.events = [{ message: 10, pid: 123 }]
    await expect(f.execute()).rejects.toMatchObject({ details: { reason: 'JOB_MEMORY_LIMIT' } })
    expect(f.adapter.result().failure?.kind).toBe('JOB_MEMORY_LIMIT'); await f.cleanup()
  })
  it('records infrastructure failure without launching when artifact revalidation fails', async () => {
    const f = fixture(); await f.prepare(); mocks.artifact.mockRejectedValueOnce(exerciseCoreError('WORKSPACE_REPLACED'))
    await expect(f.execute()).rejects.toMatchObject({ details: { reason: 'INTERNAL_ERROR' } })
    expect(f.native.start).not.toHaveBeenCalled(); expect(f.adapter.result().failure?.kind).toBe('INFRASTRUCTURE_FAILURE'); await f.cleanup()
  })
  it('keeps native spawn errors as infrastructure with no fabricated OS exit', async () => {
    const f = fixture(); await f.prepare(); vi.mocked(f.native.start).mockImplementationOnce(() => { throw { code: 'LEARNING_SPAWN' } })
    await expect(f.execute()).rejects.toMatchObject({ details: { reason: 'INTERNAL_ERROR' } })
    expect(f.adapter.result().cases[0]).toMatchObject({ exitCode: null, failure: { kind: 'INFRASTRUCTURE_FAILURE' } }); await f.cleanup()
  })
  it('keeps the original operation timeout distinct from a per-case timeout', async () => {
    const f = fixture(); await f.prepare()
    const control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') f.abort.abort(exerciseCoreError('OPERATION_TIMEOUT')) })
    await expect(f.execute()).rejects.toThrow()
    expect(f.adapter.result().cases[0].failure).toEqual({ kind: 'TIMEOUT', phase: 'operation', caseIndex: null }); await f.cleanup()
  })
  it('preserves cancellation as a partial observation without inventing a runtime failure', async () => {
    const f = fixture(); await f.prepare()
    const control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') f.abort.abort(exerciseCoreError('OWNER_LOST')) })
    await expect(f.execute()).rejects.toThrow(); expect(() => f.adapter.result()).toThrow()
    await f.cleanup()
  })
})

describe('C# multi-case orchestration (mock compiler and fake native processes)', () => {
  it('reserves transport envelope space without increasing the physical-output quota', async () => {
    const wire = Buffer.from(JSON.stringify({ ...JSON.parse(response()), stdout: 'x'.repeat(1024 * 1024 - 1000) }))
    expect(wire.length).toBeLessThan(1024 * 1024)
    const f = fixture(wire, 0, threeSamples, 4096), result = await runCsharpSamples(sessionFor(f), f.adapter)
    expect(result.failure?.kind).toBe('OUTPUT_LIMIT'); expect(result.notRunCaseIndices).toEqual([1, 2])
    expect(f.native.start).toHaveBeenCalledTimes(1); expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1024 * 1024 - 4096)
  })
  it('shares the raw output budget across cases and stops before the third launch', async () => {
    const f = fixture(request => Buffer.from(JSON.stringify({ ...JSON.parse(typedWire(request).toString()), stdout: 'x'.repeat(600_000) })), 0, threeSamples)
    const session = sessionFor(f), result = await runCsharpSamples(session, f.adapter)
    expect(result.cases.map(c => c.outcome)).toEqual(['RETURNED', 'FAILED'])
    expect(result.failure?.kind).toBe('OUTPUT_LIMIT'); expect(result.notRunCaseIndices).toEqual([2])
    expect(f.native.start).toHaveBeenCalledTimes(2); expect(mocks.compile).toHaveBeenCalledTimes(1)
    expect(session.snapshot().reason).toBe('OUTPUT_LIMIT')
  })
  it.each(['PROCESS_UNRESOLVED', 'HISTORY_UNVERIFIED'] as const)('blocks the next case on %s evidence', async proof => {
    const f = fixture(typedWire, 0, threeSamples), session = sessionFor(f)
    const original = f.adapter.evidence.bind(f.adapter)
    let checks = 0
    vi.spyOn(f.adapter, 'evidence').mockImplementation(async () => {
      const evidence = await original()
      if (++checks === 2) return { ...evidence, ...(proof === 'PROCESS_UNRESOLVED' ? { observerSettled: false } : { coverageComplete: false }) }
      return evidence
    })
    const result = await runCsharpSamples(session, f.adapter)
    expect(result.cases).toHaveLength(1); expect(result.notRunCaseIndices).toEqual([1, 2])
    expect(result.failure).toEqual({ kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null })
    expect(f.native.start).toHaveBeenCalledTimes(1)
    expect(session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
  it('retains the same Jobs after a barrier/cleanup query failure and retries without relaunch', async () => {
    const f = fixture(typedWire, 0, threeSamples), session = sessionFor(f)
    const original = f.adapter.evidence.bind(f.adapter)
    let checks = 0, fail = true
    vi.spyOn(f.adapter, 'evidence').mockImplementation(async () => {
      if (++checks >= 2 && fail) throw exerciseCoreError('PROCESS_UNRESOLVED')
      return original()
    })
    await expect(runCsharpSamples(session, f.adapter)).rejects.toThrow()
    expect(session.ownsResources).toBe(true); expect(f.native.start).toHaveBeenCalledTimes(1)
    expect(vi.mocked(f.native.control).mock.calls.some(([, op]) => op === 'release')).toBe(false)
    fail = false; await session.close('COMPLETED'); await session.close('COMPLETED')
    expect(vi.mocked(f.native.control).mock.calls.filter(([, op]) => op === 'release')).toHaveLength(1)
    expect(vi.mocked(f.native.control).mock.calls.filter(([, op]) => op === 'closeHandles')).toHaveLength(1)
    expect(f.native.start).toHaveBeenCalledTimes(1)
  })
  it('compiles once, attempts three ordered cases in isolated Jobs and ignores expected values', async () => {
    const f = fixture(typedWire, 0, threeSamples), session = sessionFor(f)
    const result = await runCsharpSamples(session, f.adapter)
    expect(mocks.compile).toHaveBeenCalledTimes(1); expect(f.native.start).toHaveBeenCalledTimes(3)
    expect(result.cases.map(c => [c.caseIndex, c.actual])).toEqual([[0, 8], [1, 0], [2, 3]])
    expect(result.notRunCaseIndices).toEqual([])
    expect(new Set(f.adapter.diagnostics().execute.map(s => s.rootPid)).size).toBe(3)
    expect(session.snapshot().cleanup.cleanupComplete).toBe(true)
    await expect(runCsharpSamples(session, f.adapter)).rejects.toThrow(); expect(f.native.start).toHaveBeenCalledTimes(3)
  })
  it('fails fast at the middle case and reports the untouched suffix', async () => {
    const f = fixture(request => request.caseIndex === 1 ? Buffer.from('{bad json') : typedWire(request), 0, threeSamples)
    const result = await runCsharpSamples(sessionFor(f), f.adapter)
    expect(result.cases.map(c => c.outcome)).toEqual(['RETURNED', 'FAILED']); expect(result.failure?.caseIndex).toBe(1)
    expect(result.notRunCaseIndices).toEqual([2]); expect(f.native.start).toHaveBeenCalledTimes(2)
  })
  it('does not invent executed cases after compile failure', async () => {
    const f = fixture(typedWire, 0, threeSamples)
    mocks.compile.mockResolvedValueOnce({ artifact: null, result: { status: 'FAILED', exitCode: null, diagnostics: [], stdout: '', stderr: '',
      failure: { kind: 'INFRASTRUCTURE_FAILURE', phase: 'compile', caseIndex: null } } })
    const result = await runCsharpSamples(sessionFor(f), f.adapter)
    expect(result.cases).toEqual([]); expect(result.notRunCaseIndices).toEqual([0, 1, 2]); expect(f.native.start).not.toHaveBeenCalled()
  })
  it('rejects mismatched or concurrent orchestrators without cancelling the admitted driver', async () => {
    const f = fixture(typedWire), other = fixture(typedWire), session = sessionFor(f)
    await expect(runCsharpSamples(session, other.adapter)).rejects.toThrow()
    const first = runCsharpSamples(session, f.adapter)
    await expect(runCsharpSamples(session, f.adapter)).rejects.toThrow()
    await first; expect(mocks.compile).toHaveBeenCalledTimes(1)
  })
  it('requires a new VERIFIED barrier and never borrows a previous OS exit on preflight failure', async () => {
    const f = fixture(typedWire, 0, threeSamples); await f.prepare(); await f.execute()
    expect(f.adapter.result().notRunCaseIndices).toEqual([1, 2])
    await expect(f.execute()).rejects.toThrow(); expect(f.native.start).toHaveBeenCalledTimes(1)
    await f.adapter.verifyBetweenCases(f.context)
    mocks.artifact.mockRejectedValueOnce(exerciseCoreError('WORKSPACE_REPLACED'))
    await expect(f.execute()).rejects.toThrow()
    expect(f.adapter.result().cases[1]).toMatchObject({ caseIndex: 1, exitCode: null, failure: { kind: 'INFRASTRUCTURE_FAILURE', caseIndex: 1 } })
    expect(f.adapter.result().notRunCaseIndices).toEqual([2]); await f.cleanup()
  })
})
