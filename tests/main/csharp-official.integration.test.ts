import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir, release } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createOfficialCsharpExecutionAdapter } from '../../src/main/services/learning/runtime/csharp-execution-adapter'
import { ExerciseSession, classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { acquireOfficialCasePlan, type OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { ExerciseExecutionPhase, ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { CsharpOfficialExecutionEvidence } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import type { OfficialPackageCase } from '../../src/main/services/learning/content/exercise-package-contracts'
import type { openAnchoredExerciseResources } from '../../src/main/services/learning/content/exercise-package-resources'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_CSHARP_EXECUTE_LIVE === '1'
const solutions = {
  'ch2-04': 'public class Solution { public int[] Divide(int a,int b) => new[]{a/b,a%b}; }',
  'ch3-04': 'public class Solution { public bool LeapYear(int year) => System.DateTime.IsLeapYear(year); }',
}
async function removeTestRoot(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e3-s2-native-')) throw Error('Unsafe test cleanup')
  await rm(root, { recursive: true, force: true })
}

describe.skipIf(!enabled)('E3-S2 frozen Official sets, real installed Roslyn/dotnet/Windows Jobs', () => {
  async function run(id: keyof typeof solutions, mode: 'success' | 'exception' | 'invalid' | 'wrong-length' | 'cancel' | 'timeout' | 'output' | 'barrier' = 'success') {
    const native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    // Use the emitted production reader and its COMPILED anchor, not a source hash
    // or a test-created trust root. The Registry remains the existing source class.
    const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as {
      openBundledExerciseResources: (environment: { packaged: boolean; resourcesPath: string }, ...args: Parameters<typeof openAnchoredExerciseResources> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof openAnchoredExerciseResources>
    }
    const registry = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
    await registry.whenStarted(); expect(registry.status().state).toBe('AVAILABLE')
    // Test-only identity/Expected assertions; these are never passed to Runtime.
    const metadata = JSON.parse(await readFile(resolve('resources/learning/exercises', id, 'exercise.json'), 'utf8'))
    const judge = JSON.parse(await readFile(resolve('resources/learning/exercises', id, 'judge/v1.json'), 'utf8')) as { cases: OfficialPackageCase[] }
    const identity: OfficialPlanIdentity = { exerciseId: id, packageVersion: metadata.packageVersion, testSetId: metadata.official.testSetId,
      testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash,
      officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
    const root = await mkdtemp(join(tmpdir(), 'e3-s2-native-'))
    const jobs: object[] = [], inputs: unknown[] = [], quotas: number[] = []
    let cancel: Promise<void> | undefined, cancelled = false, barriers = 0, queryFault = false
    // N-API methods are non-enumerable; preserve capabilities explicitly.
    const binding: LearningNativeBinding = { capability: native.capability, state: native.state,
      control: native.control, acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      start: (...args) => {
        for (const job of jobs) {
          const s = native.poll(job)
          expect(s.activeProcesses).toBe(0); expect(s.observerSettled).toBe(true)
          expect(s.retained.every(p => p.signaled)).toBe(true)
          expect(native.state(job)).toMatchObject({ released: false, handlesClosed: false })
        }
        const job = native.start(...args), s = native.poll(job)
        const compile = args[1].some(a => a.endsWith('csc.dll'))
        expect(s.quotaBytes).toBe(compile ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes)
        jobs.push(job); quotas.push(s.quotaBytes); return job
      },
      submitInput: (job, input) => { if (input.length) inputs.push(JSON.parse(input.toString())); native.submitInput(job, input) },
      poll: job => {
        if (queryFault) throw { code: 'LEARNING_QUERY' }
        const sample = native.poll(job)
        if (mode === 'cancel' && jobs.indexOf(job) === 1 && sample.stderr.length && !cancelled) {
          cancelled = true
          queueMicrotask(() => { cancel = session.close('OWNER_LOST'); void cancel.catch(() => {}) })
        }
        return sample
      },
    }
    const workspace = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, new WindowsExerciseLeaseProvider(root, binding))
    const code = mode === 'success' || mode === 'barrier' ? solutions[id]
      : mode === 'exception' ? 'public class Solution { public int[] Divide(int a,int b) => throw new System.Exception(); }'
      : mode === 'invalid' ? 'public class Solution { public int[] Divide(int a,int b) => null!; }'
      : mode === 'wrong-length' ? 'public class Solution { public int[] Divide(int a,int b) => new[]{42}; }'
      : mode === 'output' ? "public class Solution { public int[] Divide(int a,int b) { System.Console.Write(new string('x',600000)); return new[]{a/b,a%b}; } }"
      : `public class Solution { public int[] Divide(int a,int b) { ${mode === 'cancel' ? 'using var ready=System.Console.OpenStandardError(); ready.WriteByte(114); ready.Flush();' : ''} while(true) {} } }`
    const request = { exerciseId: id, language: 'csharp' as const, code, sourceRevision: 1 }
    const tasks = new Set<Promise<unknown>>()
    let phase!: ExerciseExecutionPhase, context!: ExercisePhaseContext, releaseContent: (() => void) | undefined, loads = 0
    const adapter = createOfficialCsharpExecutionAdapter(request, workspace, binding, async () => {
      loads++
      const plan = await acquireOfficialCasePlan(registry, identity, {
        packageOwner: { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => !cancelled,
          check() {}, retain(task) { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}) },
          canRelease: () => !session.ownsResources && tasks.size === 0 },
        currentPhase: () => ({ phase, context }), cleanup: () => session.snapshot().cleanup,
        retainContent: r => { releaseContent = r },
      })
      expect(Object.keys(plan.execution).sort()).toEqual(['caseCount', 'inputAt', 'signature'])
      expect(plan.execution.caseCount).toBe(judge.cases.length)
      return { execution: plan.execution, representInput: plan.representInput }
    })
    const original = adapter.runPhase.bind(adapter)
    adapter.runPhase = async (p, c) => { phase = p; context = c; await original(p, c) }
    const barrier = adapter.verifyBetweenCases.bind(adapter)
    adapter.verifyBetweenCases = async c => {
      if (mode === 'barrier' && barriers === 1) queryFault = true
      await barrier(c); barriers++
      expect(classifyExerciseTermination(await adapter.evidence())).toBe('VERIFIED')
      expect(session.snapshot().cleanup.cleanupComplete).toBe(false)
    }
    const session = new ExerciseSession({ request, ownerId: 'e3-s2-native', workspace, adapter, checkpoints: new FileExerciseCheckpointStore(workspace) })
    let result: CsharpOfficialExecutionEvidence | undefined, caught: unknown
    try {
      session.claimOrchestration(adapter)
      try {
        await session.runPhase('prepare'); await session.runPhase('compile'); await session.verifyExecutionBarrier()
        while (adapter.hasNextCase()) {
          session.limits.checkOperation(); await session.runPhase('execute'); await session.verifyExecutionBarrier()
        }
      } catch (error) { caught = error }
      if (mode === 'barrier') {
        expect(session.ownsResources).toBe(true)
        expect(jobs.every(job => !native.state(job).released && !native.state(job).handlesClosed)).toBe(true)
      }
      queryFault = false
      await cancel; await session.close('COMPLETED')
      if (mode === 'cancel') expect(() => adapter.officialResult()).toThrow()
      else result = adapter.officialResult()
      expect(() => adapter.result()).toThrow()
      expect(loads).toBe(1)
      expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true, processClean: true, pendingIo: false, workspace: 'REMOVED' })
      expect(jobs.every(job => native.state(job).released && native.state(job).handlesClosed)).toBe(true)
      const diagnostics = adapter.diagnostics()
      expect(diagnostics.compile).toHaveLength(1)
      expect(new Set(diagnostics.execute.map(j => j.rootPid)).size).toBe(diagnostics.execute.length)
      expect(inputs).toEqual(judge.cases.slice(0, diagnostics.execute.length).map((c, caseIndex) => ({ protocolVersion: 1, caseIndex, args: c.args })))
      await Promise.allSettled([...tasks]); releaseContent?.(); await registry.stop()
      expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
      const receipt = { id, mode, windows: release(), node: process.version, limits: EXERCISE_LIMITS, loads, barriers,
        quotas, result, cleanup: session.snapshot().cleanup, reason: session.snapshot().reason, diagnostics, ledger: registry.status() }
      await mkdir('out/e3-s2/native', { recursive: true })
      await writeFile(`out/e3-s2/native/${id}-${mode}.json`, JSON.stringify(receipt, null, 2))
      return { result, judge, caught, jobs: jobs.length, barriers, reason: session.snapshot().reason }
    } finally {
      queryFault = false; await session.close('COMPLETED'); await Promise.allSettled([...tasks])
      releaseContent?.(); await registry.stop()
      await removeTestRoot(root)
    }
  }
  it.each(['ch2-04', 'ch3-04'] as const)('runs the complete frozen %s set in order with VERIFIED barriers/cleanup', async id => {
    const r = await run(id)
    expect(r.caught).toBeUndefined(); expect(r.jobs).toBe(r.judge.cases.length + 1)
    expect(r.barriers).toBe(r.judge.cases.length + 1)
    expect(r.result?.cases.map(c => c.kind === 'RETURNED' ? c.actual : c.kind)).toEqual(r.judge.cases.map(c => c.expected))
    expect(r.result?.notRunCaseIndices).toEqual([])
  }, 60_000)
  it.each([['exception', 'USER_EXCEPTION'], ['invalid', 'INVALID_RESULT'], ['timeout', 'INTERRUPTED'], ['output', 'INTERRUPTED']] as const)('handles real %s and stops the suffix', async (mode, kind) => {
    const r = await run('ch2-04', mode), index = mode === 'output' ? 1 : 0
    expect(r.caught).toBeDefined(); expect(r.result?.cases[index].kind).toBe(kind)
    expect(r.result?.notRunCaseIndices).toEqual(r.judge.cases.slice(index + 1).map((_c, i) => i + index + 1))
    expect(r.jobs).toBe(index + 2)
  }, 60_000)
  it('keeps a valid wrong-length vector as RETURNED actual for the later comparator', async () => {
    const r = await run('ch2-04', 'wrong-length')
    expect(r.caught).toBeUndefined(); expect(r.result?.cases.every(c => c.kind === 'RETURNED' && JSON.stringify(c.actual) === '[42]')).toBe(true)
  }, 60_000)
  it('suppresses late success after owner loss and releases the leased plan after final cleanup', async () => {
    const r = await run('ch2-04', 'cancel'); expect(r.caught).toBeDefined(); expect(r.reason).toBe('OWNER_LOST'); expect(r.jobs).toBe(2)
  }, 60_000)
  it('retains the same Jobs/lease on a controlled barrier query fault, then retries VERIFIED cleanup', async () => {
    const r = await run('ch2-04', 'barrier'); expect(r.caught).toBeDefined(); expect(r.jobs).toBe(2)
    expect(r.result?.cases).toHaveLength(1); expect(r.result?.failure).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup' })
  }, 60_000)
})
