import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { RoslynCsharpCompiler } from '../../src/main/services/learning/runtime/csharp-compiler'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import type { CsharpPreparedExecution } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import type { LearningJobSample, LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'
import { validateCsharpCompileResult } from '../../src/shared/contracts/csharp-execution-validation'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'

// Unit-only SDK substitution. This file provides NO real Roslyn acceptance evidence.
vi.mock('../../src/main/services/learning/runtime/csharp-sdk-resolver', () => ({ revalidateCsharpSdk: vi.fn(async () => true) }))
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const work of cleanup.splice(0)) await work() })
async function fixture(exitCode = 1, output = 'Solution.cs(1,2): error CS1002: C:\\private\n', running = false) {
  const root = await mkdtemp(join(tmpdir(), 'compile-fixture-'))
  const workspace = new ExerciseWorkspace(root, 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
  await workspace.prepare()
  const sample: LearningJobSample = { stdinSettled: true, stdinFailed: false, stdinBytesWritten: 0, rootPid: 12, members: [12], activeProcesses: 1, totalProcesses: 1, retained: [{ pid: 12, created: 'identity', signaled: false }],
    coverageComplete: true, observerSettled: false, exitCode: 259, quotaBytes: EXERCISE_LIMITS.compileJobMemoryBytes,
    peakJobCommitBytes: 0, reportedJobCommitBytes: 0, events: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
  const state = { terminated: false, released: false, handlesClosed: false }
  const finish = () => { sample.members = []; sample.activeProcesses = 0; sample.retained[0].signaled = true; sample.observerSettled = true; sample.exitCode = exitCode }
  const native: LearningNativeBinding = {
    capability: 'student-ide-learning-job-v1', start: vi.fn(() => ({})), submitInput: vi.fn(),
    poll: vi.fn(() => { const result = { ...sample }; sample.stdout = Buffer.alloc(0); sample.stderr = Buffer.alloc(0); sample.events = []; return result }),
    control: vi.fn((_h, op) => {
      if (op === 'resume' && !running) { finish(); sample.stdout = Buffer.from(output) }
      if (op === 'terminate') { state.terminated = true; finish() }
      if (op === 'release') state.released = true
      if (op === 'closeHandles') state.handlesClosed = true
    }), state: vi.fn(() => ({ ...state })), acquireLease: vi.fn(), watch: vi.fn(), observation: vi.fn(),
  }
  const compiler = new RoslynCsharpCompiler(native, workspace)
  cleanup.push(async () => { await compiler.runtime.terminate(); await compiler.runtime.settleObservers(); await compiler.runtime.release(); await compiler.runtime.closeHandles(); await workspace.releaseLease(); await rm(root, { recursive: true, force: true }) })
  const referenceDirectory = 'C:\\test SDK\\ref'
  const input: CsharpPreparedExecution = { workspace, code: 'public class Solution { public int Sum(int a, int b) => a + b; }', exercise: exercises[0],
    schema: { parameterTypes: ['int32', 'int32'], returnType: 'int32', sampleCount: exercises[0].samples.length },
    sdk: { sdkVersion: '10.0.100', runtimeVersion: '10.0.1', dotnetPath: 'C:\\test SDK\\dotnet.exe', sdkDirectory: 'C:\\test SDK\\sdk\\10.0.100',
      compilerPath: 'C:\\test SDK\\sdk\\10.0.100\\Roslyn\\bincore\\csc.dll', referenceDirectory,
      references: ['System.Runtime', 'System.Console', 'System.Text.Json', 'System.Collections'].map(name => join(referenceDirectory, name + '.dll')),
      runtimeDirectory: 'C:\\test SDK\\shared\\Microsoft.NETCore.App\\10.0.1', targetFramework: 'net10.0' } }
  const controller = new AbortController()
  const context = { signal: controller.signal, deadline: performance.now() + 30_000, jobMemoryBytes: EXERCISE_LIMITS.compileJobMemoryBytes, output: vi.fn() }
  return { compiler, native, sample, input, context, controller }
}

describe('Roslyn compile orchestration (controlled ports, not real compilation)', () => {
  it('requires nonzero plus known source diagnostic, streams raw accounting without raw presentation', async () => {
    const f = await fixture(), result = await f.compiler.compile(f.input, f.context)
    expect(result.result).toMatchObject({ status: 'FAILED', exitCode: 1, failure: { kind: 'COMPILE_ERROR' } })
    expect(validateCsharpCompileResult(result.result, 2).ok).toBe(true)
    expect(JSON.stringify(result.result)).not.toContain('private')
    expect(f.context.output).toHaveBeenCalledWith('stdout', '', expect.any(Number))
    const args = vi.mocked(f.native.start).mock.calls[0]
    expect(args[1]).toEqual(['exec', '--fx-version', '10.0.1', '--roll-forward', 'Disable', f.input.sdk.compilerPath, '/noconfig', expect.stringContaining('@')])
    expect(args[3]).toBe(2 * 1024 ** 3)
    expect(args[4].some(e => e.startsWith('DOTNET_STARTUP_HOOKS='))).toBe(false)
    expect(f.compiler.runtime.diagnostics()[0].released).toBe(false)
  })
  it.each(['compiler OOM text', 'error CS0006: missing local dependency', 'Harness.cs(10,1): error CS1002: harness bug'])('does not misclassify nonzero output %s as source error', async text => {
    const f = await fixture(1, text), result = await f.compiler.compile(f.input, f.context)
    expect(result.result.failure?.kind).toBe('INFRASTRUCTURE_FAILURE')
    expect(result.artifact).toBeNull()
  })
  it('does not accept exit zero without an observed valid assembly', async () => {
    const f = await fixture(0, ''), result = await f.compiler.compile(f.input, f.context)
    expect(result.result.failure?.kind).toBe('INFRASTRUCTURE_FAILURE'); expect(result.artifact).toBeNull()
  })
  it('maps native launch failure without leaking its raw message', async () => {
    const f = await fixture()
    vi.mocked(f.native.start).mockImplementationOnce(() => { throw { code: 'LEARNING_SPAWN', message: 'C:\\secret' } })
    const result = await f.compiler.compile(f.input, f.context)
    expect(result.result).toMatchObject({ exitCode: null, failure: { kind: 'INFRASTRUCTURE_FAILURE' } })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('uses the actual Job event rather than OOM output as memory-limit evidence', async () => {
    const f = await fixture(), control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') f.sample.events = [{ message: 10, pid: 12 }] })
    expect((await f.compiler.compile(f.input, f.context)).result.failure?.kind).toBe('JOB_MEMORY_LIMIT')
  })
  it('fails closed on expired deadline without launching a process', async () => {
    const f = await fixture(), result = await f.compiler.compile(f.input, { ...f.context, deadline: performance.now() - 1 })
    expect(result.result.failure?.kind).toBe('TIMEOUT'); expect(f.native.start).not.toHaveBeenCalled()
  })
  it('preserves operation timeout taxonomy instead of replacing it with compile timeout', async () => {
    const f = await fixture(); f.controller.abort(exerciseCoreError('OPERATION_TIMEOUT'))
    expect((await f.compiler.compile(f.input, f.context)).result.failure).toEqual({ kind: 'TIMEOUT', phase: 'operation', caseIndex: null })
  })
  it('retains lifecycle cancellation as cancellation, with resources still owned for cleanup', async () => {
    const f = await fixture(1, '', true), start = vi.mocked(f.native.start).getMockImplementation()!
    vi.mocked(f.native.start).mockImplementation((...args) => { queueMicrotask(() => f.controller.abort(exerciseCoreError('CONTEXT_CHANGED'))); return start(...args) })
    await expect(f.compiler.compile(f.input, f.context)).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(f.compiler.runtime.diagnostics()[0]).toMatchObject({ released: false, handlesClosed: false })
  })
  it('bounds raw compiler output independently of presentation redaction', async () => {
    const f = await fixture(1, 'x'.repeat(EXERCISE_LIMITS.outputBytes + 1))
    expect((await f.compiler.compile(f.input, f.context)).result.failure?.kind).toBe('OUTPUT_LIMIT')
    // More bytes arriving during cleanup must drain, not re-trigger our limit/parser.
    f.sample.stderr = Buffer.from('late private compiler bytes')
    await f.compiler.runtime.terminate(); await expect(f.compiler.runtime.settleObservers()).resolves.toBeUndefined()
  })
  it('rejects a second compile attempt without relaunch or workspace overwrite', async () => {
    const f = await fixture(); await f.compiler.compile(f.input, f.context)
    await expect(f.compiler.compile(f.input, f.context)).rejects.toThrow(); expect(f.native.start).toHaveBeenCalledOnce()
  })
})
