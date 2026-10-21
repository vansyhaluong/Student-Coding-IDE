import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir, release } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RoslynCsharpCompiler } from '../../src/main/services/learning/runtime/csharp-compiler'
import { FilesystemCsharpSdkResolver } from '../../src/main/services/learning/runtime/csharp-sdk-resolver'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import type { ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { CsharpCompilation, CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'
import { validateCsharpCompileResult } from '../../src/shared/contracts/csharp-execution-validation'
import type { Exercise } from '../../src/shared/contracts/practice'
import { exercises } from '../../src/main/services/learning/content/exercises'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_CSHARP_COMPILE_LIVE === '1'
const id = 'exercise_12345678-1234-4234-8234-123456789abc'
const records: object[] = []
let root: string, evidence: string, native: LearningNativeBinding
describe.skipIf(!enabled)('Real installed Roslyn compilation in Learning Windows Job (no execute/stdin)', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning compile Ω '))
    evidence = resolve('out', `learning-csharp-compile-step3-${Date.now()}`); await mkdir(evidence)
    const sources = ['csharp-compiler.ts', 'csharp-compile-workspace.ts', 'csharp-harness.ts', 'csharp-diagnostics.ts', 'csharp-sdk-resolver.ts',
      'exercise-runtime-adapter.ts', 'exercise-session.ts', 'windows-exercise-adapter.ts', 'native/learning-job.cpp'].map(file => `src/main/services/learning/runtime/${file}`)
    sources.push('out/main/native/learning/learning-job.node', 'tests/main/csharp-compiler.integration.test.ts')
    const hashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), node: process.version, arch: process.arch,
      classification: 'REAL_ROSLYN_LEARNING_JOB_COMPILE_ONLY', watchdog: false, hashes }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning compile Ω ')) throw Error('Unsafe fixture cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  async function compile(name: string, exercise: Exercise, code: string, cancel = false) {
    const directory = join(root, name); await mkdir(directory)
    let launched = 0, pendingStop: Promise<void> | undefined
    const binding: LearningNativeBinding = { capability: native.capability, poll: native.poll, control: native.control, submitInput: native.submitInput,
      state: native.state, acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      start: (...args) => {
        const handle = native.start(...args); launched++
        if (cancel) queueMicrotask(() => { pendingStop = session.close('CONTEXT_CHANGED'); void pendingStop.catch(() => {}) })
        return handle
      } }
    const workspace = new ExerciseWorkspace(directory, id, new WindowsExerciseLeaseProvider(directory, binding))
    const compiler = new RoslynCsharpCompiler(binding, workspace), store = new FileExerciseCheckpointStore(workspace)
    let sdk: CsharpSdkSelection | undefined, compilation: CsharpCompilation | undefined
    const adapter: ExerciseRuntimeAdapter = {
      runPhase: async (phase, context) => {
        if (phase === 'prepare') {
          const resolution = await new FilesystemCsharpSdkResolver().resolve(context)
          if (resolution.state !== 'AVAILABLE') throw Error(`Installed SDK unavailable: ${resolution.state}`)
          sdk = resolution.selection
        } else if (phase === 'compile') {
          compilation = await compiler.compile({ workspace, sdk: sdk!, exercise, code,
            schema: { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length } }, context)
          if (compilation.result.status === 'FAILED') throw exerciseCoreError('COMPILATION_FAILED')
        } else throw Error('Execute is outside this package')
      },
      terminate: reason => compiler.runtime.terminate(reason), evidence: () => compiler.runtime.evidence(),
      settleObservers: () => compiler.runtime.settleObservers(), release: () => compiler.runtime.release(), closeHandles: () => compiler.runtime.closeHandles(),
    }
    const session = new ExerciseSession({ request: { exerciseId: exercise.id, language: 'csharp', code, sourceRevision: 1 }, ownerId: 'real-compiler-test', workspace, checkpoints: store, adapter })
    let failure: unknown, assemblyHash: string | null = null, fileNames: string[] = [], processResult: unknown
    try {
      await session.runPhase('prepare')
      try { await session.runPhase('compile') } catch (error) { failure = error }
      processResult = compiler.runtime.processResult()
      if (compilation?.artifact) {
        const assembly = await readFile(compilation.artifact.assemblyPath)
        expect(assembly.subarray(0, 2).toString()).toBe('MZ')
        assemblyHash = createHash('sha256').update(assembly).digest('hex')
        fileNames = await readdir(dirname(compilation.artifact.assemblyPath))
        expect(fileNames.sort()).toEqual(['Harness.cs', 'Learning.dll', 'Learning.runtimeconfig.json', 'Solution.cs', 'compile.rsp'])
        const config = JSON.parse(await readFile(compilation.artifact.runtimeConfigPath, 'utf8'))
        expect(config.runtimeOptions.framework.version).toBe(sdk!.runtimeVersion)
        expect(config.runtimeOptions.rollForward).toBe('Disable')
        expect(compiler.runtime.diagnostics()[0]).toMatchObject({ quotaBytes: 2 * 1024 ** 3, released: false })
      }
      if (compilation) expect(validateCsharpCompileResult(compilation.result, exercise.samples.length).ok).toBe(true)
      // Compiler host paths/diagnostics were accounted, never forwarded into public streams.
      expect(session.snapshot().stdout).toBe(''); expect(session.snapshot().stderr).toBe('')
    } finally {
      await pendingStop
      await session.close(cancel ? 'CONTEXT_CHANGED' : compilation?.result.status === 'SUCCEEDED' ? 'COMPLETED' : 'COMPILATION_FAILED')
      records.push({ name, sdk: sdk && { version: sdk.sdkVersion, runtime: sdk.runtimeVersion, referenceCount: sdk.references.length },
        compilation, processResult, assemblyHash, fileNames, launched, cleanup: session.snapshot().cleanup,
        reason: session.snapshot().reason, watchdog: false, codeExecuted: false, restoreInvoked: false })
    }
    expect(session.snapshot().cleanup.cleanupComplete).toBe(true)
    expect(compiler.runtime.diagnostics().every(d => d.released && d.handlesClosed)).toBe(true)
    return { compilation, failure, launched, reason: session.snapshot().reason }
  }
  const representations = { int32: ['int', '0'], boolean: ['bool', 'false'], string: ['string', '"tiếng Việt 🙂"'],
    'int32[]': ['int[]', 'new int[0]'], 'string[]': ['string[]', 'new string[0]'], 'int32[][]': ['int[][]', 'new int[0][]'] }
  it.each(Object.entries(representations))('compiles catalogue-compatible %s return signature offline without executing it', async (type, [cs, value]) => {
    // Catalogue currently uses string[] as input only: this return-signature fixture
    // proves the approved type contract, not an additional production catalogue entry.
    const exercise: Exercise = exercises.find(e => e.returnType === type) ?? { ...exercises[0], functionName: 'EchoStrings',
      parameters: [{ name: 'values', type: 'string[]' }], returnType: 'string[]', samples: [{ args: [['Ω']], expected: ['Ω'] }] }
    const input = exercise.parameters.map(p => `${representations[p.type][0]} @${p.name}`).join(', ')
    const code = `using System; public class Solution { public ${cs} ${exercise.functionName}(${input}) { Console.WriteLine("captured when execute is authorized"); return ${value}; } }`
    const result = await compile(type.replace(/\W/g, '_'), exercise, code)
    expect(result.failure).toBeUndefined(); expect(result.compilation?.result.status).toBe('SUCCEEDED'); expect(result.launched).toBe(1)
  }, 30_000)
  it('reports a real syntax error with a nonzero OS exit and safe source diagnostic', async () => {
    const result = await compile('syntax', exercises[0], 'public class Solution { public int Sum(int a, int b) { return a + ; } }')
    expect(result.compilation?.result).toMatchObject({ status: 'FAILED', failure: { kind: 'COMPILE_ERROR' } })
    expect(result.compilation?.result.exitCode).not.toBe(0)
    expect(result.compilation?.result.diagnostics.some(d => d.source === 'solution' && d.severity === 'error')).toBe(true)
  }, 30_000)
  it('reports a wrong return signature as a compile error at the generated binding', async () => {
    const result = await compile('signature', exercises[0], 'public class Solution { public string Sum(int a, int b) => "wrong"; }')
    expect(result.compilation?.result.failure?.kind).toBe('COMPILE_ERROR')
    expect(result.compilation?.result.diagnostics.some(d => d.source === 'harness')).toBe(true)
  }, 30_000)
  it('fails an external package reference offline instead of restoring it', async () => {
    const result = await compile('no-nuget', exercises[0], 'using Newtonsoft.Json; public class Solution { public int Sum(int a, int b) => a + b; }')
    expect(result.compilation?.result.failure?.kind).toBe('COMPILE_ERROR'); expect(result.launched).toBe(1)
  }, 30_000)
  it('cancels a real compiler Job through Core and retains cleanup ownership until finalized', async () => {
    const result = await compile('cancel', exercises[0], 'public class Solution { public int Sum(int a, int b) => a + b; }', true)
    expect(result.failure).toBeDefined(); expect(result.reason).toBe('CONTEXT_CHANGED'); expect(result.launched).toBe(1)
  }, 30_000)
})
