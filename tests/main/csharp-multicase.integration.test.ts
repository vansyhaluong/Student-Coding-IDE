import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WindowsCsharpExecutionAdapter } from '../../src/main/services/learning/runtime/csharp-execution-adapter'
import { runCsharpSamples } from '../../src/main/services/learning/runtime/csharp-orchestrator'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { ExerciseSession, classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { exercises } from '../../src/main/services/learning/content/exercises'
import type { Exercise, ExerciseType, ExerciseValue } from '../../src/shared/contracts/practice'
import type { CsharpExecutionResult } from '../../src/shared/contracts/csharp-execution'
import { validateCsharpExecutionResult } from '../../src/shared/contracts/csharp-execution-validation'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_CSHARP_EXECUTE_LIVE === '1'
const triple: Exercise = { ...exercises[0], samples: [{ args: [14, -6], expected: 999 }, { args: [0, 0], expected: 999 }, { args: [1, 2], expected: 999 }] }
const sum = 'public class Solution { public int Sum(int a,int b) => a+b; }'
let root: string, evidence: string, native: LearningNativeBinding
const records: object[] = []

describe.skipIf(!enabled)('Real .NET 10 multi-case orchestration through production Learning Jobs', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning-multicase-'))
    evidence = resolve('out/learning-csharp-multicase', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidence, { recursive: true })
    const files = ['csharp-orchestrator.ts', 'csharp-execution-adapter.ts', 'csharp-compiler.ts', 'csharp-harness.ts',
      'exercise-session.ts', 'exercise-limits.ts', 'windows-exercise-adapter.ts', 'native/learning-job.cpp'].map(p => `src/main/services/learning/runtime/${p}`)
    files.push('out/main/native/learning/learning-job.node', 'tests/main/csharp-multicase.integration.test.ts')
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), node: process.version,
      classification: 'REAL_ROSLYN_DOTNET_MULTI_CASE', injectedFaults: ['barrier native query failure'], watchdog: false,
      hashes: Object.fromEntries(await Promise.all(files.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')]))) }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-multicase-')) throw Error('Unsafe test cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })

  async function run(name: string, exercise: Exercise, code: string, fault?: 'cancel' | 'barrier-retry') {
    const directory = join(root, name); await mkdir(directory)
    const jobs: object[] = [], watches: object[] = [], inputs: object[] = [], launches: object[] = []
    const stages = new Map<object, { releases: number; closes: number }>()
    let failureEnabled = false, cancelled = false, assemblyHash: string | undefined
    let cancelWork: Promise<void> | undefined
    const binding: LearningNativeBinding = { capability: native.capability, state: native.state,
      acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      start: (...args) => {
        // Before any new process, all previously started Jobs must be settled,
        // but their identity handles remain owned until final cleanup.
        for (const previous of jobs) {
          const sample = native.poll(previous)
          expect(sample.members).toEqual([]); expect(sample.activeProcesses).toBe(0)
          expect(sample.observerSettled).toBe(true); expect(sample.stdinSettled).toBe(true)
          expect(sample.retained.every(p => p.signaled)).toBe(true)
          expect(native.state(previous).released).toBe(false)
          expect(native.state(previous).handlesClosed).toBe(false)
        }
        const job = native.start(...args), sample = native.poll(job)
        jobs.push(job); stages.set(job, { releases: 0, closes: 0 })
        const compiling = args[1].some(a => a.endsWith('csc.dll'))
        expect(sample.quotaBytes).toBe(compiling ? 2 * 1024 ** 3 : 512 * 1024 ** 2)
        expect(sample.members).toContain(sample.rootPid); expect(sample.retained[0].signaled).toBe(false)
        watches.push(native.watch(sample.rootPid))
        launches.push({ compiling, rootPid: sample.rootPid, retained: sample.retained, quotaBytes: sample.quotaBytes,
          runtimeVersion: args[1][2], compiler: args[1].find(a => a.endsWith('csc.dll')) ?? null })
        return job
      },
      submitInput: (job, input) => {
        inputs.push(input.length ? JSON.parse(input.toString()) : { compilerEOF: true })
        native.submitInput(job, input)
      },
      poll: job => {
        if (failureEnabled) throw { code: 'LEARNING_QUERY' }
        const sample = native.poll(job)
        if (fault === 'cancel' && job === jobs[2] && sample.stderr.length && !cancelled) {
          cancelled = true
          queueMicrotask(() => { cancelWork = session.close('OWNER_LOST'); void cancelWork.catch(() => {}) })
        }
        return sample
      },
      control: (job, operation) => {
        native.control(job, operation)
        if (operation === 'release') stages.get(job)!.releases++
        if (operation === 'closeHandles') stages.get(job)!.closes++
      } }
    const workspace = new ExerciseWorkspace(directory, 'exercise_12345678-1234-4234-8234-123456789abc', new WindowsExerciseLeaseProvider(directory, binding))
    const request = { exerciseId: exercise.id, language: 'csharp' as const, code, sourceRevision: 1 }
    // Main-owned catalogue fixture; no renderer-provided cases or production catalogue changes.
    const adapter = new WindowsCsharpExecutionAdapter(request, workspace, binding, undefined, [exercise])
    const session = new ExerciseSession({ request, ownerId: 'real-csharp-multicase', workspace,
      checkpoints: new FileExerciseCheckpointStore(workspace), adapter })
    const barrier = adapter.verifyBetweenCases.bind(adapter)
    let barriers = 0
    adapter.verifyBetweenCases = async context => {
      if (++barriers === 1) assemblyHash = createHash('sha256').update(await readFile(join(workspace.path, 'csharp', 'Learning.dll'))).digest('hex')
      if (fault === 'barrier-retry' && barriers === 2) failureEnabled = true
      await barrier(context)
      expect(classifyExerciseTermination(await adapter.evidence())).toBe('VERIFIED')
    }
    let result: CsharpExecutionResult | undefined, caught: unknown
    try {
      try { result = await runCsharpSamples(session, adapter) } catch (error) { caught = error }
      if (fault === 'barrier-retry') {
        expect(caught).toBeDefined(); expect(jobs).toHaveLength(2)
        expect(session.ownsResources).toBe(true)
        expect(jobs.every(j => !native.state(j).released && !native.state(j).handlesClosed)).toBe(true)
        failureEnabled = false
        await session.close('COMPLETED'); await session.close('COMPLETED')
        result = adapter.result()
      }
      await cancelWork
    } finally {
      failureEnabled = false
      await session.close('COMPLETED')
      for (const handle of watches) { expect(native.observation(handle, 'identity').signaled).toBe(true); native.observation(handle, 'close') }
      records.push({ name, fault: fault ?? null, result: result ?? null, launches, inputs, barriers, assemblyHash,
        cleanup: session.snapshot().cleanup, reason: session.snapshot().reason, diagnostics: adapter.diagnostics(),
        stages: [...stages.values()], cancelled, watchdog: false })
    }
    expect(session.snapshot().cleanup).toMatchObject({ cleanupComplete: true, proof: 'VERIFIED' })
    expect(jobs.every(j => native.state(j).released && native.state(j).handlesClosed)).toBe(true)
    expect([...stages.values()].every(s => s.releases === 1 && s.closes === 1)).toBe(true)
    expect(new Set(adapter.diagnostics().execute.map(s => s.rootPid)).size).toBe(jobs.length - 1)
    expect(launches.filter(l => (l as { compiling: boolean }).compiling)).toHaveLength(1)
    if (fault === 'cancel') { expect(() => adapter.result()).toThrow(); expect(result).toBeUndefined() }
    else expect(validateCsharpExecutionResult(result, { parameterTypes: exercise.parameters.map(p => p.type),
      returnType: exercise.returnType, sampleCount: exercise.samples.length }).ok).toBe(true)
    return { result: result!, caught, launches: jobs.length, reason: session.snapshot().reason, inputs }
  }

  it('compiles once and invokes three isolated real catalogue-signature cases in order', async () => {
    const r = await run('sum', triple, sum)
    expect(r.caught).toBeUndefined(); expect(r.launches).toBe(4)
    expect(r.result.cases.map(c => c.actual)).toEqual([8, 0, 3]); expect(r.result.notRunCaseIndices).toEqual([])
    expect(r.inputs.slice(1)).toEqual(triple.samples.map((s, caseIndex) => ({ protocolVersion: 1, caseIndex, args: s.args })))
  }, 40_000)
  const types: [ExerciseType, string, ExerciseValue, ExerciseValue][] = [
    ['int32', 'int', -2147483648, 2147483647], ['boolean', 'bool', false, true], ['string', 'string', 'Việt 日本語 😀\n\0', ''],
    ['int32[]', 'int[]', [0, -1, 2147483647], []], ['string[]', 'string[]', ['', 'Ω', '😀'], []], ['int32[][]', 'int[][]', [[1, 2], [3, 4]], []] ]
  it.each(types)('round trips two real %s values with separate student Console output', async (type, cs, a, b) => {
    const exercise: Exercise = { ...exercises[0], functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type,
      samples: [a, b].map(value => ({ args: [value], expected: value })) }
    const r = await run(`type-${types.findIndex(t => t[0] === type)}`, exercise,
      `public class Solution { public ${cs} Echo(${cs} value) { System.Console.WriteLine("console Ω"); System.Console.Error.Write("student stderr"); return value; } }`)
    expect(r.caught).toBeUndefined(); expect(r.launches).toBe(3)
    expect(r.result.cases.map(c => c.actual)).toEqual([a, b])
    for (const row of r.result.cases) expect(row).toMatchObject({ stdout: 'console Ω\r\n', stderr: 'student stderr', outcome: 'RETURNED' })
  }, 40_000)
  it('fails fast at a middle runtime exception', async () => {
    const r = await run('exception', triple, 'public class Solution { public int Sum(int a,int b) { if(a==0) throw new System.Exception(); return a+b; } }')
    expect(r.launches).toBe(3); expect(r.result.cases.map(c => c.outcome)).toEqual(['RETURNED', 'FAILED'])
    expect(r.result.failure).toMatchObject({ kind: 'RUNTIME_ERROR', caseIndex: 1 }); expect(r.result.notRunCaseIndices).toEqual([2])
  }, 40_000)
  it('does not launch any case after real syntax failure', async () => {
    const r = await run('syntax', triple, 'public class Solution { public int Sum(int a,int b) => a+; }')
    expect(r.launches).toBe(1); expect(r.result.compile?.failure?.kind).toBe('COMPILE_ERROR')
    expect(r.result.cases).toEqual([]); expect(r.result.notRunCaseIndices).toEqual([0, 1, 2])
  }, 40_000)
  it('times out the middle case within its execute budget and stops the suffix', async () => {
    const r = await run('timeout', triple, 'public class Solution { public int Sum(int a,int b) { if(a==0) while(true) {} return a+b; } }')
    expect(r.launches).toBe(3); expect(r.reason).toBe('EXECUTE_TIMEOUT')
    expect(r.result.failure).toMatchObject({ kind: 'TIMEOUT', caseIndex: 1 }); expect(r.result.notRunCaseIndices).toEqual([2])
  }, 40_000)
  it('enforces the cumulative physical output budget across real cases', async () => {
    const r = await run('cumulative-output', triple, "public class Solution { public int Sum(int a,int b) { System.Console.Write(new string('x',600000)); return a+b; } }")
    expect(r.launches).toBe(3); expect(r.reason).toBe('OUTPUT_LIMIT')
    expect(r.result.cases[0].outcome).toBe('RETURNED'); expect(r.result.failure).toMatchObject({ kind: 'OUTPUT_LIMIT', caseIndex: 1 })
    expect(r.result.notRunCaseIndices).toEqual([2])
  }, 40_000)
  it('discards results on owner loss during the middle case and cleans every retained Job', async () => {
    const r = await run('cancel', triple, 'public class Solution { public int Sum(int a,int b) { if(a==0) { using var ready=System.Console.OpenStandardError(); ready.WriteByte(114); ready.Flush(); while(true) {} } return a+b; } }', 'cancel')
    expect(r.caught).toBeDefined(); expect(r.launches).toBe(3); expect(r.reason).toBe('OWNER_LOST')
  }, 40_000)
  it('stops at a native-query barrier fault and retries cleanup of the same real Jobs', async () => {
    const r = await run('barrier-retry', triple, sum, 'barrier-retry')
    expect(r.launches).toBe(2); expect(r.result.cases).toHaveLength(1); expect(r.result.notRunCaseIndices).toEqual([1, 2])
    expect(r.result.failure).toEqual({ kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null })
  }, 40_000)
})
