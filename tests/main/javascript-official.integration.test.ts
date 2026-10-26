import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createOfficialJavascriptExecutionAdapter, WindowsJavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-adapter'
import { runJavascriptSamples } from '../../src/main/services/learning/runtime/javascript-orchestrator'
import { packageRunBinding } from '../../src/main/services/learning/package-run-binding'
import { ExerciseSession, classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { acquireOfficialCasePlan, type OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { JavascriptOfficialExecutionEvidence } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import type { ExerciseExecutionPhase, ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { OfficialPackageCase } from '../../src/main/services/learning/content/exercise-package-contracts'
import type { openBundledExerciseResources } from '../../src/main/services/learning/content/exercise-package-resources-runtime'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_JAVASCRIPT_EXECUTE_LIVE === '1'
type Mode = 'success' | 'exception' | 'invalid' | 'timeout' | 'protocol' | 'syntax' | 'top-level' | 'wrong-length' | 'output'
  | 'probe-cancel' | 'stdin-cancel' | 'case-cancel' | 'barrier'
const solutions = {
  'ch2-04': 'globalThis.calls=(globalThis.calls||0)+1;function Divide(a,b){return globalThis.calls===1?[Math.trunc(a/b),a%b]:[999];}',
  'ch3-04': 'function LeapYear(year){return year%400===0||(year%4===0&&year%100!==0);}',
}
async function removeRoot(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e3-s3-native-')) throw Error('Unsafe test cleanup')
  await rm(root, { recursive: true, force: true })
}

describe.skipIf(!enabled)('E3-S3 frozen Official sets / real PATH Node24 / Windows Jobs', () => {
  it('preserves real public Run through the existing public Registry binding and original wrapper', async () => {
    const native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as { openBundledExerciseResources: typeof openBundledExerciseResources }
    const registry = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
    await registry.whenStarted()
    const root = await mkdtemp(join(tmpdir(), 'e3-s3-native-'))
    const workspace = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, new WindowsExerciseLeaseProvider(root, native))
    const request = { exerciseId: 'ch2-04', language: 'javascript' as const, code: solutions['ch2-04'], sourceRevision: 1 }
    let expected: unknown[] = [], driver: WindowsJavascriptExecutionAdapter | undefined
    const binding = packageRunBinding(registry, request.exerciseId, exercise => {
      expected = exercise.samples.map(c => c.expected) // Existing PUBLIC samples; test-only assertion.
      driver = new WindowsJavascriptExecutionAdapter(request, workspace, native, undefined, [exercise])
      return driver
    })
    const session = new ExerciseSession({ request, ownerId: 'e3-s3-public-parity', workspace, adapter: binding.adapter, checkpoints: new FileExerciseCheckpointStore(workspace) })
    try {
      const result = await runJavascriptSamples(session, binding.adapter)
      expect(result.cases.map(c => c.actual)).toEqual(expected); expect(expected).toHaveLength(2)
      expect(result.failure).toBeNull(); expect(result.notRunCaseIndices).toEqual([])
      expect(driver?.diagnostics().probe).toHaveLength(1); expect(driver?.diagnostics().harness).toHaveLength(3)
      expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
      const diagnostics = driver!.diagnostics()
      binding.releaseContent(); await registry.stop()
      expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
      await mkdir('out/e3-s3/native', { recursive: true })
      await writeFile('out/e3-s3/native/ch2-04-public-run.json', JSON.stringify({ mode: 'public-run', windows: release(), node: process.version, abi: process.versions.modules,
        result, diagnostics, cleanup: session.snapshot().cleanup, ledger: registry.status() }, null, 2))
    } finally { await session.close(); binding.releaseContent(); await registry.stop(); await removeRoot(root) }
  }, 60_000)
  async function run(id: keyof typeof solutions, mode: Mode = 'success') {
    const native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as { openBundledExerciseResources: typeof openBundledExerciseResources }
    const registry = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
    await registry.whenStarted(); expect(registry.status().state).toBe('AVAILABLE')
    // Test-only Main fixture assertions. The production reader's compiled anchor
    // remains the trust authority; neither Expected nor this Judge enters Runtime.
    const metadata = JSON.parse(await readFile(resolve('resources/learning/exercises', id, 'exercise.json'), 'utf8'))
    const judge = JSON.parse(await readFile(resolve('resources/learning/exercises', id, 'judge/v1.json'), 'utf8')) as { cases: OfficialPackageCase[] }
    const identity: OfficialPlanIdentity = { exerciseId: id, packageVersion: metadata.packageVersion, testSetId: metadata.official.testSetId,
      testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash,
      officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
    const root = await mkdtemp(join(tmpdir(), 'e3-s3-native-'))
    const jobs: object[] = [], inputs: unknown[] = []
    const launches: { mode: string; pid: number; quota: number; executable: string }[] = []
    const modes = new Map<object, string>(), resumed = new Set<object>()
    const tasks = new Set<Promise<unknown>>()
    let closing: Promise<void> | undefined, invalidated = false, barriers = 0, queryFault = false, borrows = 0, loads = 0
    const cancel = () => {
      if (invalidated) return
      invalidated = true; closing = session.close('OWNER_LOST'); void closing.catch(() => {})
    }
    const binding: LearningNativeBinding = { capability: native.capability, acquireLease: native.acquireLease,
      state: native.state, watch: native.watch, observation: native.observation,
      start: (executable, args, cwd, quota, environment) => {
        for (const job of jobs) {
          const s = native.poll(job)
          expect(s.activeProcesses).toBe(0); expect(s.members).toEqual([])
          expect(s.observerSettled && s.stdinSettled).toBe(true); expect(s.retained.every(p => p.signaled)).toBe(true)
          expect(native.state(job)).toMatchObject({ released: false, handlesClosed: false })
        }
        const phase = args.at(-1) === 'execute' ? 'execute' : args.at(-1) === 'syntax' ? 'syntax' : 'probe'
        expect(quota).toBe(phase === 'syntax' ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes)
        // Deliberate test-only transport fault with a real contained Node child;
        // production harness/configuration and v1 protocol are not modified.
        const argv = mode === 'protocol' && phase === 'execute'
          ? ['--eval', 'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("{malformed"));'] : args
        const job = native.start(executable, argv, cwd, quota, environment), sample = native.poll(job)
        expect(sample.quotaBytes).toBe(quota)
        jobs.push(job); modes.set(job, phase); launches.push({ mode: phase, pid: sample.rootPid, quota, executable })
        if (mode === 'probe-cancel' && phase === 'probe') queueMicrotask(cancel)
        return job
      },
      submitInput: (job, bytes) => {
        if (modes.get(job) === 'execute') inputs.push(JSON.parse(bytes.toString()))
        native.submitInput(job, bytes)
        if (mode === 'stdin-cancel' && modes.get(job) === 'execute') queueMicrotask(cancel)
      },
      poll: job => {
        if (queryFault) throw { code: 'LEARNING_QUERY' }
        const sample = native.poll(job)
        if (mode === 'case-cancel' && resumed.has(job) && modes.get(job) === 'execute' && sample.activeProcesses) queueMicrotask(cancel)
        return sample
      },
      control: (job, operation) => { native.control(job, operation); if (operation === 'resume') resumed.add(job) },
    }
    const workspace = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, new WindowsExerciseLeaseProvider(root, binding))
    const code = mode === 'exception' ? 'function Divide(){throw Error("student");}'
      : mode === 'invalid' ? 'function Divide(){return null;}'
      : mode === 'timeout' || mode === 'case-cancel' ? 'function Divide(){for(;;){}}'
      : mode === 'syntax' ? 'function Divide( {'
      : mode === 'top-level' ? 'throw Error("must run only in Execute");function Divide(){return [1];}'
      : mode === 'wrong-length' ? 'function Divide(){return [42];}'
      : mode === 'output' ? 'function Divide(a,b){console.log("x".repeat(600000));return [Math.trunc(a/b),a%b];}'
      : solutions[id]
    const request = { exerciseId: id, language: 'javascript' as const, code, sourceRevision: 1 }
    let phase!: ExerciseExecutionPhase, context!: ExercisePhaseContext, releaseContent: (() => void) | undefined
    const phases: { phase: string; remainingMs: number; jobMemoryBytes: number | null }[] = []
    const adapter = createOfficialJavascriptExecutionAdapter(request, workspace, binding, async () => {
      loads++
      const plan = await acquireOfficialCasePlan(registry, identity, {
        packageOwner: { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => !invalidated,
          check() {}, retain(task) { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}) },
          canRelease: () => !session.ownsResources && tasks.size === 0 && borrows === 0 },
        currentPhase: () => ({ phase, context }), cleanup: () => session.snapshot().cleanup,
        retainContent: r => { releaseContent = r },
      })
      expect(Object.keys(plan.execution).sort()).toEqual(['caseCount', 'inputAt', 'signature'])
      expect(plan.execution.caseCount).toBe(judge.cases.length)
      return { execution: plan.execution, representInput: async index => {
        const baseline = registry.status(), borrow = await plan.representInput(index)
        borrows++; expect(registry.status().parsedBytes).toBeGreaterThan(baseline.parsedBytes)
        return { data: borrow.data, release: () => { borrow.release(); borrows--; expect(registry.status().parsedBytes).toBe(baseline.parsedBytes) } }
      } }
    })
    const original = adapter.runPhase.bind(adapter)
    adapter.runPhase = async (p, c) => {
      phase = p; context = c
      phases.push({ phase: p, remainingMs: c.deadline - performance.now(), jobMemoryBytes: c.jobMemoryBytes })
      expect(c.jobMemoryBytes).toBe(p === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes)
      expect(c.deadline).toBeLessThanOrEqual(session.limits.operationDeadline)
      await original(p, c)
    }
    const barrier = adapter.verifyBetweenCases.bind(adapter)
    adapter.verifyBetweenCases = async c => {
      if (mode === 'barrier' && barriers === 2) queryFault = true
      await barrier(c); barriers++
      expect(classifyExerciseTermination(await adapter.evidence())).toBe('VERIFIED')
      expect(borrows).toBe(0); expect(session.snapshot().cleanup.cleanupComplete).toBe(false)
      expect(() => releaseContent!()).toThrow() // A case barrier is not final cleanup.
      if (barriers === 1) {
        const source = JSON.parse(await readFile(join(workspace.path, 'javascript', 'Source.json'), 'utf8'))
        expect(source).toEqual({ code, functionName: metadata.signature.functionName,
          schema: { parameterTypes: metadata.signature.parameters.map((p: { type: string }) => p.type), returnType: metadata.signature.returnType, sampleCount: judge.cases.length } })
      }
    }
    const session = new ExerciseSession({ request, ownerId: 'e3-s3-native', workspace, adapter, checkpoints: new FileExerciseCheckpointStore(workspace) })
    const due = session.limits.operationDeadline
    let result: JavascriptOfficialExecutionEvidence | undefined, caught: unknown
    try {
      session.claimOrchestration(adapter)
      try {
        await session.runPhase('prepare'); await session.verifyExecutionBarrier()
        await session.runPhase('compile'); await session.verifyExecutionBarrier()
        while (adapter.hasNextCase()) {
          session.limits.checkOperation(); await session.runPhase('execute'); await session.verifyExecutionBarrier()
        }
      } catch (error) { caught = error }
      if (mode === 'barrier') {
        expect(session.ownsResources).toBe(true); expect(borrows).toBe(1)
        expect(jobs.every(j => !native.state(j).released && !native.state(j).handlesClosed)).toBe(true)
      }
      queryFault = false; await closing; await session.close()
      if (mode.endsWith('-cancel')) expect(() => adapter.officialResult()).toThrow()
      else result = adapter.officialResult()
      expect(() => adapter.result()).toThrow(); expect(loads).toBe(1)
      expect(session.limits.operationDeadline).toBe(due)
      expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false })
      expect(workspace.ownsLease).toBe(false); expect(borrows).toBe(0)
      expect(jobs.every(j => native.state(j).released && native.state(j).handlesClosed)).toBe(true)
      expect(new Set(launches.map(l => l.pid)).size).toBe(launches.length)
      expect(launches.filter(l => l.mode === 'probe')).toHaveLength(1)
      expect(launches.filter(l => l.mode === 'syntax')).toHaveLength(mode === 'probe-cancel' ? 0 : 1)
      expect(inputs).toEqual(judge.cases.slice(0, inputs.length).map((c, caseIndex) => ({ protocolVersion: 1, caseIndex, args: c.args })))
      await Promise.allSettled([...tasks]); releaseContent?.(); await registry.stop()
      expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
      await mkdir('out/e3-s3/native', { recursive: true })
      await writeFile(`out/e3-s3/native/${id}-${mode}.json`, JSON.stringify({ id, mode, windows: release(), node: process.version, abi: process.versions.modules,
        limits: EXERCISE_LIMITS, loads, barriers, phases, launches, result, reason: session.snapshot().reason,
        diagnostics: adapter.diagnostics(), cleanup: session.snapshot().cleanup, ledger: registry.status() }, null, 2))
      return { result, judge, caught, launches, barriers, reason: session.snapshot().reason }
    } finally {
      queryFault = false; await session.close(); await Promise.allSettled([...tasks]); releaseContent?.(); await registry.stop(); await removeRoot(root)
    }
  }
  it.each(['ch2-04', 'ch3-04'] as const)('executes the complete frozen %s set in order, without shared top-level state', async id => {
    const r = await run(id)
    expect(r.caught).toBeUndefined(); expect(r.launches.map(l => l.mode)).toEqual(['probe', 'syntax', ...r.judge.cases.map(() => 'execute')])
    expect(r.barriers).toBe(r.judge.cases.length + 2)
    expect(r.result?.cases.map(c => c.kind === 'RETURNED' ? c.actual : c.kind)).toEqual(r.judge.cases.map(c => c.expected))
    expect(r.result?.notRunCaseIndices).toEqual([])
  }, 60_000)
  it.each([['exception', 'USER_EXCEPTION'], ['invalid', 'INVALID_RESULT'], ['timeout', 'INTERRUPTED'], ['protocol', 'PROTOCOL_FAILURE']] as const)('handles real %s without attempting the suffix', async (mode, kind) => {
    const r = await run('ch2-04', mode)
    expect(r.caught).toBeDefined(); expect(r.result?.cases[0].kind).toBe(kind)
    expect(r.result?.notRunCaseIndices).toEqual(r.judge.cases.slice(1).map((_c, i) => i + 1)); expect(r.launches).toHaveLength(3)
    if (mode === 'exception' || mode === 'invalid') expect(r.result?.cases[0].process?.exitCode).toBe(1)
  }, 60_000)
  it('stops after real syntax failure, before all Official cases', async () => {
    const r = await run('ch2-04', 'syntax')
    expect(r.launches.map(l => l.mode)).toEqual(['probe', 'syntax']); expect(r.result?.syntax?.failure?.kind).toBe('SYNTAX_ERROR')
    expect(r.result?.cases).toEqual([]); expect(r.result?.notRunCaseIndices).toEqual(r.judge.cases.map((_c, i) => i))
  }, 60_000)
  it('does not evaluate throwing top-level student code until Execute', async () => {
    const r = await run('ch2-04', 'top-level')
    expect(r.result?.syntax?.status).toBe('SUCCEEDED'); expect(r.barriers).toBe(2)
    expect(r.result?.cases[0].kind).toBe('USER_EXCEPTION')
  }, 60_000)
  it('retains wrong-length typed vectors as RETURNED for later comparison', async () => {
    const r = await run('ch2-04', 'wrong-length')
    expect(r.caught).toBeUndefined(); expect(r.result?.cases.every(c => c.kind === 'RETURNED' && JSON.stringify(c.actual) === '[42]')).toBe(true)
  }, 60_000)
  it('charges physical output cumulatively and stops at the second case quota failure', async () => {
    const r = await run('ch2-04', 'output')
    expect(r.reason).toBe('OUTPUT_LIMIT'); expect(r.result?.cases.map(c => c.kind)).toEqual(['RETURNED', 'INTERRUPTED'])
    expect(r.result?.notRunCaseIndices).toEqual(r.judge.cases.slice(2).map((_c, i) => i + 2)); expect(r.launches).toHaveLength(4)
  }, 60_000)
  it.each(['probe-cancel', 'stdin-cancel', 'case-cancel'] as const)('retains real Jobs/tasks/lease on %s and never publishes late success', async mode => {
    const r = await run('ch2-04', mode)
    expect(r.caught).toBeDefined(); expect(r.reason).toBe('OWNER_LOST'); expect(r.launches).toHaveLength(mode === 'probe-cancel' ? 1 : 3)
  }, 60_000)
  it('retains the current input/Jobs on an injected query fault, then retries VERIFIED cleanup', async () => {
    const r = await run('ch2-04', 'barrier')
    expect(r.caught).toBeDefined(); expect(r.launches).toHaveLength(3); expect(r.result?.cases).toHaveLength(1)
    expect(r.result?.failure).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup' })
  }, 60_000)
})
