import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createWindowsExerciseService } from '../../src/main/services/learning/exercise-service'
import * as nativeModule from '../../src/main/services/learning/runtime/windows-exercise-native'
import type { LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import type { openBundledExerciseResources } from '../../src/main/services/learning/content/exercise-package-resources-runtime'
import type { OfficialPackageCase } from '../../src/main/services/learning/content/exercise-package-contracts'
import type { OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { OfficialExecutionCompletion, OfficialJudgeOperationHandle } from '../../src/main/services/learning/runtime/official-execution-contracts'
import { ExerciseLimits } from '../../src/main/services/learning/runtime/exercise-limits'
import type { ExerciseExecutionPhase } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'
import type { JudgeResult } from '../../src/main/services/learning/judge/judge-contracts'
import * as judges from '../../src/main/services/learning/judge-service'
import * as comparator from '../../src/main/services/learning/judge/exact-typed-comparator'
import * as reducer from '../../src/main/services/learning/judge/verdict-reducer'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_GENERIC_JUDGE_LIVE === '1'
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const evidenceRoot = resolve('out/e7/candidate-20261027-r1/s2/native')
const digest = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex')
const operations = [
  { language: 'csharp' as const, mode: 'correct', code: 'public class Solution { public int[] Divide(int a,int b) => new[]{a/b,a%b}; }' },
  { language: 'csharp' as const, mode: 'wrong', code: 'public class Solution { public int[] Divide(int a,int b) => new[]{a/b,a%b+1}; }' },
  { language: 'javascript' as const, mode: 'correct', code: 'function Divide(a,b){return [Math.trunc(a/b),a%b];}' },
  { language: 'javascript' as const, mode: 'wrong', code: 'function Divide(a,b){return [Math.trunc(a/b),a%b+1];}' },
]
class Owner extends EventEmitter { constructor(readonly id: number) { super() } isDestroyed() { return false } }
interface JobReceipt {
  phase: 'probe' | 'compile' | 'execute'; pid: number; created: string; quota: number;
  rawBytes: number; peakJobCommitBytes: number; releases: number; closes: number; coverageComplete: boolean; settledAtRelease?: boolean
}
interface Receipt {
  language: 'csharp' | 'javascript'; mode: string; sourceSha256: string; assertion: 'UNVERIFIED' | 'PASS' | 'FAIL'; error?: string;
  environment: { windows: string; node: string; abi?: string; nativeSha256: string; openerSha256: string };
  identity: OfficialPlanIdentity; jobs: JobReceipt[];
  phases: { phase: ExerciseExecutionPhase; deadline: number; operationDeadline: number; remainingAtEntryMs: number }[];
  barriers: number; comparisons: { index: number; result: string; expectedMatched: boolean; afterVerifiedBarrier: boolean }[];
  requests: { index: number; keys: string[]; argsMatched: boolean; bytes: number }[];
  initializeCount: number; finalizations: number; eligibleWhileActive?: boolean; snapshots: number; errors: string[];
  violations: string[]; elapsedMs?: number; executionMs?: number; result?: JudgeResult;
  runtime?: Pick<OfficialExecutionCompletion, 'disposition' | 'planAcquired' | 'failure' | 'endReason' | 'cleanup'> & {
    compileStatus: string | null; indices: number[]; kinds: string[]; notRunCaseIndices: readonly number[]; actualsMatched: boolean[];
  };
  ledger?: ReturnType<ExercisePackageRegistry['status']>; retained?: boolean; artifacts: Record<string, string>;
}
const receipts: Receipt[] = []
let retained: { service: ReturnType<typeof createWindowsExerciseService>; packages: ExercisePackageRegistry; native: LearningNativeBinding;
  watches: object[]; root: string } | undefined
let boundary: Record<string, string> = {}
async function fingerprints() {
  const manifest = JSON.parse(await readFile('resources/learning/exercises/manifest.json', 'utf8')) as {
    packages: { exerciseId: string; assets: Record<string, { path: string }> }[]
  }
  const entry = manifest.packages.find(e => e.exerciseId === 'ch2-04')!
  const paths = [
    'src/main/services/learning/exercise-service.ts', 'src/main/services/learning/official-case-plan.ts',
    'src/main/services/learning/judge-service.ts', 'src/main/services/learning/judge/judge-contracts.ts',
    'src/main/services/learning/judge/exact-typed-comparator.ts', 'src/main/services/learning/judge/verdict-reducer.ts',
    'src/main/services/learning/runtime/official-execution-contracts.ts', 'src/main/services/learning/runtime/execution-driver.ts',
    'src/main/services/learning/runtime/exercise-session.ts', 'src/main/services/learning/runtime/exercise-limits.ts',
    'src/main/services/learning/runtime/csharp-execution-adapter.ts', 'src/main/services/learning/runtime/javascript-execution-adapter.ts',
    'src/main/services/learning/runtime/windows-exercise-native.ts', 'resources/learning/exercises/manifest.json',
    'out/main/native/learning/learning-job.node', 'out/main/exercise-package-resources-runtime.js', 'out/main/index.js',
    ...Object.values(entry.assets).map(a => join('resources/learning/exercises/ch2-04', a.path)),
  ]
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, digest(await readFile(p))])))
}
async function removeRoot(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e4-s4-native-')) throw Error('Unsafe native test cleanup')
  await rm(root, { recursive: true, force: true })
}

describe.skipIf(!enabled).sequential('E4-S4 four real Divide Judge operations, no retries or additional native controls', () => {
  beforeAll(async () => { await mkdir(evidenceRoot, { recursive: true }); boundary = await fingerprints() })
  afterAll(async () => {
    if (retained) {
      const owner = retained
      await owner.service.stop() // Same owned cleanup only; never restart cases.
      if (owner.service.status().active) throw Error('UNVERIFIED: native ownership still retained')
      await owner.packages.stop()
      for (const watch of owner.watches) owner.native.observation(watch, 'close')
      await removeRoot(owner.root); retained = undefined
    }
    const after = await fingerprints()
    await writeFile(join(evidenceRoot, `summary-${runId}.json`), JSON.stringify({ runId, boundaryBefore: boundary,
      boundaryAfter: after, unchanged: isDeepStrictEqual(boundary, after), receipts }, null, 2))
    expect(isDeepStrictEqual(boundary, after)).toBe(true)
  })
  for (const operation of operations) it(`${operation.language}/${operation.mode} uses actual service, native Jobs, comparison and final release`, { timeout: 80_000, retry: 0 }, async context => {
    if (retained) context.skip('UNVERIFIED: previous native operation retains ownership; no replacement launch')
    const { language, mode, code } = operation
    const native = nativeModule.loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as { openBundledExerciseResources: typeof openBundledExerciseResources }
    const packages = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
    await packages.whenStarted(); expect(packages.status().state).toBe('AVAILABLE')
    const metadata = JSON.parse(await readFile('resources/learning/exercises/ch2-04/exercise.json', 'utf8'))
    const rawSet = await readFile('resources/learning/exercises/ch2-04/judge/v1.json')
    const official = JSON.parse(rawSet.toString()) as { cases: OfficialPackageCase[] }
    const identity: OfficialPlanIdentity = { exerciseId: metadata.exerciseId, packageVersion: metadata.packageVersion,
      testSetId: metadata.official.testSetId, testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version,
      signatureHash: metadata.signature.hash, officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
    expect(digest(rawSet) === identity.officialHash).toBe(true)
    const receipt: Receipt = { language, mode, sourceSha256: digest(code), assertion: 'UNVERIFIED', identity,
      environment: { windows: release(), node: process.version, abi: process.versions.modules,
        nativeSha256: boundary['out/main/native/learning/learning-job.node'], openerSha256: boundary['out/main/exercise-package-resources-runtime.js'] },
      jobs: [], phases: [], barriers: 0, comparisons: [], requests: [], initializeCount: 0, finalizations: 0,
      snapshots: 0, errors: [], violations: [], artifacts: {} }
    receipts.push(receipt)
    const root = await mkdtemp(join(tmpdir(), 'e4-s4-native-')), watches: object[] = [], jobs = new Map<object, JobReceipt>()
    const note = (ok: boolean, reason: string) => { if (!ok) receipt.violations.push(reason) }
    let workspacePath = '', activeCase = -1, lastBarrierIndex = -1, started = performance.now()
    const binding: LearningNativeBinding = { capability: native.capability, acquireLease: native.acquireLease, state: native.state,
      watch: native.watch, observation: native.observation,
      start(exe, args, cwd, quota, environment) {
        for (const old of jobs.keys()) if (!native.state(old).handlesClosed) {
          const sample = native.poll(old)
          if (sample.activeProcesses !== 0 || !sample.observerSettled || !sample.stdinSettled || !sample.retained.every(p => p.signaled))
            throw Error('Prior native Job unsettled; refusing next launch')
          note(sample.stdout.length === 0 && sample.stderr.length === 0, 'Late bytes outside Runtime observer')
        }
        const phase = args.some(a => a.endsWith('csc.dll')) || args.at(-1) === 'syntax' ? 'compile'
          : language === 'javascript' && args.at(-1) !== 'execute' ? 'probe' : 'execute'
        workspacePath = phase === 'compile' && language === 'csharp' ? dirname(cwd) : cwd
        note(quota === (phase === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes), 'Configured quota changed')
        const job = native.start(exe, args, cwd, quota, environment), sample = native.poll(job)
        note(sample.quotaBytes === quota, 'Native quota readback mismatch')
        const record: JobReceipt = { phase, pid: sample.rootPid, created: sample.retained[0].created, quota, rawBytes: 0,
          peakJobCommitBytes: sample.peakJobCommitBytes, releases: 0, closes: 0, coverageComplete: sample.coverageComplete }
        jobs.set(job, record); receipt.jobs.push(record); watches.push(native.watch(sample.rootPid)); return job
      },
      submitInput(job, bytes) {
        if (bytes.length) {
          const input = JSON.parse(bytes.toString()), keys = Object.keys(input).sort()
          const argsMatched = isDeepStrictEqual(input.args, official.cases[input.caseIndex]?.args)
          note(keys.join(',') === 'args,caseIndex,protocolVersion' && input.protocolVersion === 1 && argsMatched, 'Private/incorrect child input')
          receipt.requests.push({ index: input.caseIndex, keys, argsMatched, bytes: bytes.length })
        }
        native.submitInput(job, bytes)
      },
      poll(job) {
        const sample = native.poll(job), record = jobs.get(job)!
        record.rawBytes += sample.stdout.length + sample.stderr.length
        record.peakJobCommitBytes = Math.max(record.peakJobCommitBytes, sample.peakJobCommitBytes)
        record.coverageComplete &&= sample.coverageComplete
        return sample
      },
      control(job, action) {
        if (action === 'release') {
          const sample = native.poll(job), record = jobs.get(job)!
          record.settledAtRelease = sample.activeProcesses === 0 && sample.observerSettled && sample.stdinSettled
            && sample.members.length === 0 && sample.retained.every(p => p.signaled)
          note(record.settledAtRelease && sample.stdout.length === 0 && sample.stderr.length === 0, 'Unsafe native release')
        }
        native.control(job, action)
        if (action === 'release') jobs.get(job)!.releases++
        if (action === 'closeHandles') jobs.get(job)!.closes++
      },
    }
    const location = vi.spyOn(nativeModule, 'loadLearningNative').mockReturnValue(binding)
    const service = createWindowsExerciseService(root, { packages, onSnapshot: () => { receipt.snapshots++ }, onCleanupError: e => receipt.errors.push(JSON.stringify(e)) })
    const originalPhase = ExerciseLimits.prototype.phase, originalBarrier = ExerciseSession.prototype.verifyExecutionBarrier
    const originalClose = ExerciseSession.prototype.close, originalCreate = judges.createOfficialJudge
    const originalCompare = comparator.compareExactTyped, originalReduce = reducer.reduceJudgeVerdict
    const phaseSpy = vi.spyOn(ExerciseLimits.prototype, 'phase').mockImplementation(function <T>(this: ExerciseLimits, phase: ExerciseExecutionPhase, work: (deadline: number) => Promise<T>): Promise<T> {
      return originalPhase.call(this, phase, async deadline => {
        receipt.phases.push({ phase, deadline, operationDeadline: this.operationDeadline, remainingAtEntryMs: deadline - this.clock.now() })
        return work(deadline)
      }) as Promise<T>
    })
    const barrierSpy = vi.spyOn(ExerciseSession.prototype, 'verifyExecutionBarrier').mockImplementation(async function (this: ExerciseSession) {
      await originalBarrier.call(this); receipt.barriers++
      lastBarrierIndex = receipt.jobs.filter(j => j.phase === 'execute').length - 1
      note(!this.snapshot().cleanup.cleanupComplete, 'Barrier mistaken for final cleanup')
      if (receipt.barriers === (language === 'csharp' ? 1 : 2)) {
        const folder = join(workspacePath, language === 'csharp' ? 'csharp' : 'javascript')
        for (const file of language === 'csharp' ? ['Solution.cs', 'Harness.cs', 'Learning.dll'] : ['Source.json', 'Harness.mjs'])
          receipt.artifacts[file] = digest(await readFile(join(folder, file)))
        if (language === 'javascript') {
          const source = JSON.parse(await readFile(join(folder, 'Source.json'), 'utf8'))
          note(Object.keys(source).sort().join(',') === 'code,functionName,schema' && source.code === code
            && source.schema.sampleCount === official.cases.length, 'Unexpected JavaScript source descriptor')
        } else {
          const harness = await readFile(join(folder, 'Harness.cs'), 'utf8')
          note(!harness.includes(identity.officialHash) && !harness.includes('"expected"') && !harness.includes('"visibility"'), 'Private C# harness fields')
        }
      }
    })
    const closeSpy = vi.spyOn(ExerciseSession.prototype, 'close').mockImplementation(function (this: ExerciseSession, reason) {
      receipt.executionMs ??= performance.now() - started; return originalClose.call(this, reason)
    })
    const engineSpy = vi.spyOn(judges, 'createOfficialJudge').mockImplementation(() => {
      const engine = originalCreate()
      return { ...engine, initialize(view) { receipt.initializeCount++; engine.initialize(view) }, consume(row) {
        activeCase = row.caseIndex
        note(row.kind === 'RETURNED' && row.process?.processExited === true && row.process.observerSettled
          && row.process.stdoutSettled && row.process.stderrSettled, 'Unsettled/non-returned comparison')
        note(service.status().active && packages.readiness(identity.exerciseId).pinned, 'Premature slot/lease release')
        note([...jobs.keys()].every(j => !native.state(j).released && !native.state(j).handlesClosed), 'Early native release')
        return engine.consume(row)
      } }
    })
    const compareSpy = vi.spyOn(comparator, 'compareExactTyped').mockImplementation((type, actual, expected, config) => {
      const expectedMatched = isDeepStrictEqual(expected, official.cases[activeCase]?.expected)
      const result = originalCompare(type, actual, expected, config), afterVerifiedBarrier = lastBarrierIndex === activeCase
      note(expectedMatched && afterVerifiedBarrier, 'Comparison binding/barrier mismatch')
      receipt.comparisons.push({ index: activeCase, result, expectedMatched, afterVerifiedBarrier }); return result
    })
    const reduceSpy = vi.spyOn(reducer, 'reduceJudgeVerdict').mockImplementation(input => {
      receipt.finalizations++; receipt.eligibleWhileActive = service.status().active
      note(input.ownerCurrent && input.identity.ownerEntry === input.operationIdentity.ownerEntry
        && input.identity.session.sessionId === input.operationIdentity.session.sessionId
        && input.identity.session.generation === input.operationIdentity.session.generation
        && input.identity.sourceHash === digest(code) && input.operationIdentity.sourceHash === digest(code)
        && input.identity.language === language && input.operationIdentity.language === language, 'Owner/source/operation mismatch')
      note(input.cleanup.contentReleased && input.cleanup.retainedPackageTasks === 0 && input.cleanup.representationBorrows === 0
        && !input.cleanup.ownsResources && !packages.readiness(identity.exerciseId).pinned, 'Incomplete content/runtime release')
      note([...jobs.keys()].every(j => native.state(j).released && native.state(j).handlesClosed), 'Native resources retained at final handoff')
      note(!existsSync(join(root, 'sessions', input.operationIdentity.session.sessionId)), 'Workspace still exists at final handoff')
      return originalReduce(input)
    })
    let handle: OfficialJudgeOperationHandle | undefined
    try {
      service.start(); await service.ready(); service.observe(new Owner(1)); service.observe(new Owner(2)); started = performance.now()
      handle = service.runJudge(1, { exerciseId: 'ch2-04', language, code, sourceRevision: 1 }, identity)
      expect(() => service.snapshot(1, handle!.reference)).toThrow()
      expect(() => service.completion(1, handle!.reference)).toThrow()
      await expect(service.stopSession(1, { ...handle.reference, reason: 'LEARNING_LEFT' })).rejects.toThrow()
      expect(() => service.run(2, { exerciseId: 'ch2-04', language, code, sourceRevision: 1 })).toThrow()
      receipt.result = await handle.judgeResult(); const raw = await handle.completion()
      receipt.elapsedMs = performance.now() - started
      receipt.runtime = { disposition: raw.disposition, planAcquired: raw.planAcquired, failure: raw.failure, endReason: raw.endReason,
        cleanup: raw.cleanup, compileStatus: raw.compile?.status ?? null, indices: raw.cases.map(c => c.caseIndex), kinds: raw.cases.map(c => c.kind),
        notRunCaseIndices: raw.notRunCaseIndices, actualsMatched: raw.cases.map((c, i) => c.kind === 'RETURNED' && isDeepStrictEqual(c.actual, official.cases[i].expected)) }
      const attempted = mode === 'correct' ? official.cases.length : 1, indices = Array.from({ length: attempted }, (_, i) => i)
      const result = receipt.result
      expect(result).toMatchObject({ state: 'FINAL', verdict: mode === 'correct' ? 'Accepted' : 'WrongAnswer', attemptedCases: attempted,
        comparedCases: attempted, passedCases: mode === 'correct' ? attempted : 0,
        cleanup: { contentReleased: true, executionDone: true, ownsResources: false, retainedPackageTasks: 0, representationBorrows: 0,
          snapshot: { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false } } })
      expect(result.eligibility.kind).toBe(mode === 'correct' ? 'ACCEPTED_CANDIDATE' : 'GRADED_FAILURE_CANDIDATE')
      expect(result.identity.session).toEqual(handle.reference); expect(isDeepStrictEqual(result.identity.plan, identity)).toBe(true)
      expect(receipt.runtime).toMatchObject({ disposition: mode === 'correct' ? 'EXHAUSTED' : 'CONSUMER_STOP', planAcquired: true,
        compileStatus: 'SUCCEEDED', failure: null, endReason: 'COMPLETED', indices, kinds: indices.map(() => 'RETURNED') })
      expect(receipt.runtime.actualsMatched).toEqual(indices.map(() => mode === 'correct'))
      expect(result.notRunCaseIndices).toEqual(Array.from({ length: official.cases.length - attempted }, (_, i) => attempted + i))
      expect(raw.notRunCaseIndices).toEqual(result.notRunCaseIndices)
      expect(receipt.comparisons.map(c => c.index)).toEqual(indices)
      expect(receipt.comparisons.map(c => c.result)).toEqual(indices.map(() => mode === 'correct' ? 'PASS' : 'DIFFERENT'))
      expect(receipt.requests.map(r => r.index)).toEqual(indices)
      expect(receipt.jobs.filter(j => j.phase === 'execute')).toHaveLength(attempted)
      expect(receipt.jobs.filter(j => j.phase === 'compile')).toHaveLength(1)
      expect(receipt.jobs.filter(j => j.phase === 'probe')).toHaveLength(language === 'javascript' ? 1 : 0)
      expect(receipt.barriers).toBe(attempted + (language === 'csharp' ? 1 : 2))
      expect(receipt.initializeCount).toBe(1); expect(receipt.finalizations).toBe(1); expect(receipt.eligibleWhileActive).toBe(true)
      expect(new Set(receipt.phases.map(p => p.operationDeadline)).size).toBe(1)
      for (const phase of receipt.phases) {
        expect(phase.remainingAtEntryMs).toBeGreaterThan(0)
        expect(phase.remainingAtEntryMs).toBeLessThanOrEqual(phase.phase === 'prepare' ? 10000 : phase.phase === 'compile' ? 30000 : 2000)
        expect(phase.deadline).toBeLessThanOrEqual(phase.operationDeadline)
      }
      expect(receipt.executionMs).toBeLessThan(60000)
      expect(receipt.jobs.reduce((sum, j) => sum + j.rawBytes, 0)).toBeLessThanOrEqual(EXERCISE_LIMITS.outputBytes)
      expect(service.status().active).toBe(false); expect(packages.readiness(identity.exerciseId).pinned).toBe(false)
      expect(JSON.stringify(result).includes('"actual"') || JSON.stringify(result).includes('"expected"')
        || JSON.stringify(result).includes('"stdout"') || JSON.stringify(result).includes('"diagnostics"')
        || JSON.stringify(result).includes('"visibility"') || JSON.stringify(result).includes('"caseId"')).toBe(false)
      expect(receipt.snapshots).toBe(0); expect(receipt.errors).toEqual([]); expect(receipt.violations).toEqual([])
      expect(await handle.judgeResult()).toEqual(result); expect(receipt.finalizations).toBe(1)
    } catch (error) { receipt.assertion = 'FAIL'; receipt.error = String(error); throw error }
    finally {
      try { await service.stop() } catch (error) { receipt.errors.push(`Cleanup: ${String(error)}`) }
      if (service.status().active) { receipt.retained = true; retained = { service, packages, native, watches, root }; packages.beginShutdown() }
      else {
        await packages.stop(); receipt.ledger = packages.status()
        for (const watch of watches) {
          note(native.observation(watch, 'identity').signaled, 'Unsignaled root identity'); native.observation(watch, 'close')
        }
        await removeRoot(root)
      }
      note([...jobs].every(([job, j]) => native.state(job).released && native.state(job).handlesClosed
        && j.releases === 1 && j.closes === 1 && j.coverageComplete && j.settledAtRelease === true), 'Native release/close/coverage mismatch')
      phaseSpy.mockRestore(); barrierSpy.mockRestore(); closeSpy.mockRestore(); engineSpy.mockRestore(); compareSpy.mockRestore(); reduceSpy.mockRestore(); location.mockRestore()
      if (receipt.assertion !== 'FAIL') receipt.assertion = !receipt.retained && receipt.errors.length === 0 && receipt.violations.length === 0
        && receipt.ledger?.parsedBytes === 0 && receipt.ledger.nodes === 0 && receipt.ledger.rawBytes === 0 ? 'PASS' : 'FAIL'
      await writeFile(join(evidenceRoot, `${language}-${mode}-${runId}.json`), JSON.stringify(receipt, null, 2))
    }
    expect(receipt.assertion).toBe('PASS')
  })
})
