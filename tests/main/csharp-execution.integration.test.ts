import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WindowsCsharpExecutionAdapter } from '../../src/main/services/learning/runtime/csharp-execution-adapter'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { exercises } from '../fixtures/learning/legacy-exercises'
import type { Exercise, ExerciseType, ExerciseValue } from '../../src/shared/contracts/practice'
import { validateCsharpExecutionResult } from '../../src/shared/contracts/csharp-execution-validation'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_CSHARP_EXECUTE_LIVE === '1'
let root: string, evidence: string, native: LearningNativeBinding
const records: object[] = []
const id = 'exercise_12345678-1234-4234-8234-123456789abc'
describe.skipIf(!enabled)('Real .NET 10 C# single-sample execution through production Learning Jobs', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning-execute-'))
    evidence = resolve('out/learning-csharp-execute', new Date().toISOString().replace(/[:.]/g, '-')); await mkdir(evidence, { recursive: true })
    const files = ['csharp-execution-adapter.ts', 'csharp-compiler.ts', 'csharp-compile-workspace.ts', 'csharp-harness.ts',
      'csharp-runtime-files.ts', 'windows-exercise-adapter.ts', 'exercise-session.ts', 'native/learning-job.cpp'].map(p => `src/main/services/learning/runtime/${p}`)
    files.push('out/main/native/learning/learning-job.node', 'tests/main/csharp-execution.integration.test.ts')
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), node: process.version,
      classification: 'REAL_ROSLYN_AND_DOTNET_HARNESS_EXECUTION', watchdog: false,
      hashes: Object.fromEntries(await Promise.all(files.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])) ) }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-execute-')) throw Error('Unsafe test cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  async function run(name: string, exercise: Exercise, code: string, fault?: 'input' | 'stdin-cancel' | 'execute-cancel' | 'result-cancel' | 'cleanup-retry' | 'artifact') {
    const directory = join(root, name); await mkdir(directory)
    let launches = 0, pendingStop: Promise<void> | undefined, cancelled = false, failCleanup = fault === 'cleanup-retry'
    const jobs: object[] = [], inputs: number[] = [], handles: object[] = []
    const launchRecords: object[] = []
    const binding: LearningNativeBinding = { capability: native.capability, state: native.state,
      acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      start: (...args) => {
        const job = native.start(...args); jobs.push(job); launches++
        const sample = native.poll(job)
        expect(sample.quotaBytes).toBe(launches === 1 ? 2 * 1024 ** 3 : 512 * 1024 ** 2)
        expect(sample.members).toContain(sample.rootPid); expect(sample.retained[0].signaled).toBe(false)
        const compilerPath = args[1].find(value => value.endsWith('csc.dll'))
        launchRecords.push({ runtimeVersion: args[1][2], sdkVersion: compilerPath?.match(/[\\/]sdk[\\/](10\.[^\\/]+)[\\/]/)?.[1] ?? null,
          quotaBytes: sample.quotaBytes, rootPid: sample.rootPid, members: sample.members, suspended: !sample.retained[0].signaled })
        handles.push(native.watch(sample.rootPid))
        return job
      },
      submitInput: (job, input) => {
        inputs.push(input.length); native.submitInput(job, launches === 2 && fault === 'input' ? Buffer.from('{bad json') : input)
        if (launches === 2 && fault === 'stdin-cancel') { expect(native.poll(job).stdinSettled).toBe(false); queueMicrotask(cancel) }
      },
      poll: job => {
        if (job === jobs[1] && native.state(job).terminated && failCleanup) throw { code: 'LEARNING_QUERY' }
        const sample = native.poll(job)
        if (job === jobs[1] && fault === 'execute-cancel' && sample.stderr.length) queueMicrotask(cancel)
        if (job === jobs[1] && fault === 'result-cancel' && sample.stdout.length) queueMicrotask(cancel)
        return sample
      }, control: native.control }
    const workspace = new ExerciseWorkspace(directory, id, new WindowsExerciseLeaseProvider(directory, binding))
    const request = { exerciseId: exercise.id, language: 'csharp' as const, code, sourceRevision: 1 }
    const adapter = new WindowsCsharpExecutionAdapter(request, workspace, binding, undefined, [exercise])
    const session = new ExerciseSession({ request, ownerId: 'real-csharp-execution', workspace,
      checkpoints: new FileExerciseCheckpointStore(workspace), adapter })
    function cancel() {
      if (cancelled) return
      cancelled = true; pendingStop = session.close('CONTEXT_CHANGED'); void pendingStop.catch(() => {})
    }
    let caught: unknown, assemblyHash: string | null = null
    try {
      try {
        await session.runPhase('prepare'); await session.runPhase('compile')
        await session.verifyExecutionBarrier()
        assemblyHash = createHash('sha256').update(await readFile(join(workspace.path, 'csharp', 'Learning.dll'))).digest('hex')
        if (fault === 'artifact') await writeFile(join(workspace.path, 'csharp', 'Learning.dll'), 'replaced after compilation')
        await session.runPhase('execute')
      }
      catch (error) { caught = error }
      await pendingStop
      if (fault === 'cleanup-retry') {
        // Successful execution still owns both Jobs. Force failure in cleanup,
        // then recover the same retained resources without relaunching.
        await expect(session.close('COMPLETED')).rejects.toThrow()
        expect(session.ownsResources).toBe(true); expect(native.state(jobs[1]).released).toBe(false)
        failCleanup = false
      }
    } finally {
      failCleanup = false
      await session.close('COMPLETED')
      for (const handle of handles) { expect(native.observation(handle, 'identity').signaled).toBe(true); native.observation(handle, 'close') }
      const invalidated = fault?.endsWith('-cancel') ?? false
      records.push({ name, fault: fault ?? null, result: invalidated ? null : adapter.result(), reason: session.snapshot().reason,
        cleanup: session.snapshot().cleanup, diagnostics: adapter.diagnostics(), inputs, launches, launchRecords, assemblyHash, watchdog: false })
    }
    if (fault?.endsWith('-cancel')) {
      expect(() => adapter.result()).toThrow()
      return { result: null!, caught, inputs, reason: session.snapshot().reason, launches }
    }
    const result = adapter.result()
    expect(validateCsharpExecutionResult(result, { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }).ok).toBe(true)
    expect(session.snapshot().cleanup).toMatchObject({ cleanupComplete: true, proof: 'VERIFIED' })
    expect(session.snapshot().stdout).toBe(''); expect(session.snapshot().stderr).toBe('')
    expect(jobs.every(j => native.state(j).released && native.state(j).handlesClosed)).toBe(true)
    expect(launches).toBeLessThanOrEqual(2)
    return { result, caught, inputs, reason: session.snapshot().reason, launches }
  }
  it('compiles and invokes the real catalogue Sum sample over JSON stdin and EOF', async () => {
    const r = await run('catalogue-sum', exercises[0], 'public class Solution { public int Sum(int a, int b) => a + b; }')
    expect(r.caught).toBeUndefined(); expect(r.launches).toBe(2)
    expect(r.result.cases[0]).toMatchObject({ outcome: 'RETURNED', actual: 8, exitCode: 0, failure: null })
    expect(r.inputs[0]).toBe(0); expect(r.inputs[1]).toBeGreaterThan(0)
  }, 40_000)
  const types: [ExerciseType, string, ExerciseValue][] = [
    ['int32', 'int', -2147483648], ['boolean', 'bool', false], ['string', 'string', 'Việt 日本語 😀\n\0'],
    ['int32[]', 'int[]', [0, -1, 2147483647]], ['string[]', 'string[]', ['', 'Ω', '😀']], ['int32[][]', 'int[][]', [[1, 2], [3, 4]]] ]
  it.each(types)('round trips real harness %s with captured Console streams', async (type, cs, value) => {
    // Main-only signature fixture; it does not add or modify the production catalogue.
    const exercise = { ...exercises[0], functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type,
      samples: [{ args: [value], expected: value }] }
    const r = await run(`type-${types.findIndex(t => t[0] === type)}`, exercise,
      `using System; public class Solution { public ${cs} Echo(${cs} value) { Console.WriteLine("console Ω"); Console.Error.Write("student stderr"); return value; } }`)
    expect(r.caught).toBeUndefined()
    expect(r.result.cases[0]).toMatchObject({ outcome: 'RETURNED', actual: value, stdout: 'console Ω\r\n', stderr: 'student stderr', exitCode: 0 })
  }, 40_000)
  it.each([
    ['exception', 'throw new System.InvalidOperationException("private exception text");'],
    ['clr-oom', 'throw new System.OutOfMemoryException("not Job-limit proof");'],
    ['nonzero', 'System.Environment.Exit(17); return 0;'],
    ['malformed-result', 'System.Console.OpenStandardOutput().WriteByte(255); return 0;'],
  ])('records %s as runtime failure with real execution', async (name, body) => {
    const r = await run(name, exercises[0], `public class Solution { public int Sum(int a, int b) { ${body} } }`)
    expect(r.result.cases[0]).toMatchObject({ outcome: 'FAILED', actual: null, failure: { kind: 'RUNTIME_ERROR' } })
    expect(r.reason).toBe('RUNTIME_FAILED')
  }, 40_000)
  it('does not execute after real syntax diagnostics', async () => {
    const r = await run('syntax', exercises[0], 'public class Solution { public int Sum(int a, int b) => a + ; }')
    expect(r.result.compile?.failure?.kind).toBe('COMPILE_ERROR'); expect(r.launches).toBe(1); expect(r.result.cases).toEqual([])
  }, 40_000)
  it('rejects malformed input delivered by an explicit native-boundary fault fixture', async () => {
    const r = await run('bad-input', exercises[0], 'public class Solution { public int Sum(int a, int b) => a + b; }', 'input')
    expect(r.result.cases[0]).toMatchObject({ exitCode: 2, failure: { kind: 'RUNTIME_ERROR' } })
  }, 40_000)
  it('rejects a jagged typed return through the real generated harness', async () => {
    const exercise: Exercise = { ...exercises[0], functionName: 'Echo', parameters: [{ name: 'value', type: 'int32[][]' }], returnType: 'int32[][]',
      samples: [{ args: [[[1, 2]]], expected: [] }] }
    const r = await run('invalid-typed-return', exercise, 'public class Solution { public int[][] Echo(int[][] value) => new int[][] { new int[] { 1 }, new int[] { 2, 3 } }; }')
    expect(r.result.cases[0]).toMatchObject({ exitCode: 0, actual: null, failure: { kind: 'RUNTIME_ERROR' } })
  }, 40_000)
  it('rejects artifact replacement as infrastructure before assembly launch', async () => {
    const r = await run('artifact-change', exercises[0], 'public class Solution { public int Sum(int a,int b) => a+b; }', 'artifact')
    expect(r.launches).toBe(1); expect(r.reason).toBe('INTERNAL_ERROR')
    expect(r.result.cases[0]).toMatchObject({ exitCode: null, failure: { kind: 'INFRASTRUCTURE_FAILURE' } })
  }, 40_000)
  it('enforces the real execute deadline and cleans the executing CLR Job', async () => {
    const r = await run('timeout', exercises[0], 'public class Solution { public int Sum(int a, int b) { while (true) {} } }')
    expect(r.result.cases[0].failure?.kind).toBe('TIMEOUT'); expect(r.reason).toBe('EXECUTE_TIMEOUT')
  }, 40_000)
  it('enforces aggregate raw output overflow from the real harness', async () => {
    const r = await run('overflow', exercises[0], 'public class Solution { public int Sum(int a, int b) { System.Console.Write(new string(\'x\', 1100000)); return 0; } }')
    expect(r.result.cases[0].failure?.kind).toBe('OUTPUT_LIMIT'); expect(r.reason).toBe('OUTPUT_LIMIT')
  }, 40_000)
  it('uses native Job events rather than CLR exception text for the memory limit', async () => {
    const r = await run('job-memory', exercises[0], `using System; using System.Runtime.InteropServices;
      public class Solution { [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr VirtualAlloc(IntPtr p, UIntPtr size, uint type, uint protection);
      public int Sum(int a,int b) { VirtualAlloc(IntPtr.Zero, new UIntPtr(600u*1024*1024), 0x3000, 4); System.Threading.Thread.Sleep(500); return 0; } }`)
    expect(r.result.cases[0].failure?.kind).toBe('JOB_MEMORY_LIMIT'); expect(r.reason).toBe('JOB_MEMORY_LIMIT')
  }, 40_000)
  it.each(['stdin-cancel', 'execute-cancel', 'result-cancel'] as const)('retains cleanup ownership through %s', async fault => {
    const exercise: Exercise = { ...exercises[0], functionName: 'Echo', parameters: [{ name: 'value', type: 'string' }], returnType: 'string',
      samples: [{ args: ['x'.repeat(200_000)], expected: '' }] }
    const body = fault === 'execute-cancel' ? 'using var ready = System.Console.OpenStandardError(); ready.WriteByte(114); ready.Flush(); while(true) {}' : 'return value;'
    const r = await run(fault, exercise, `public class Solution { public string Echo(string value) { ${body} } }`, fault)
    expect(r.caught).toBeDefined(); expect(r.reason).toBe('CONTEXT_CHANGED'); expect(r.result).toBeNull()
  }, 40_000)
  it('retries cleanup of both real Jobs after a native observation failure', async () => {
    const r = await run('cleanup-retry', exercises[0], 'public class Solution { public int Sum(int a,int b) => a+b; }', 'cleanup-retry')
    expect(r.result.cases[0].outcome).toBe('RETURNED'); expect(r.launches).toBe(2)
  }, 40_000)
})
