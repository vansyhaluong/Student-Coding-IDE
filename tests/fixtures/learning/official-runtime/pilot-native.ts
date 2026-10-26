import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { vi } from 'vitest'
import { createWindowsExerciseService } from '../../../../src/main/services/learning/exercise-service'
import * as nativeModule from '../../../../src/main/services/learning/runtime/windows-exercise-native'
import type { LearningNativeBinding } from '../../../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseLimits } from '../../../../src/main/services/learning/runtime/exercise-limits'
import { ExerciseSession } from '../../../../src/main/services/learning/runtime/exercise-session'
import { ExercisePackageRegistry } from '../../../../src/main/services/learning/content/exercise-package-registry'
import type { openBundledExerciseResources } from '../../../../src/main/services/learning/content/exercise-package-resources-runtime'
import type { OfficialPlanIdentity } from '../../../../src/main/services/learning/official-case-plan'
import type { OfficialExecutionCompletion, OfficialOperationHandle } from '../../../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseExecutionPhase } from '../../../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { ExerciseSnapshot } from '../../../../src/shared/contracts/exercise'
import { EXERCISE_LIMITS } from '../../../../src/shared/contracts/exercise'
import type { OfficialPackageCase } from '../../../../src/main/services/learning/content/exercise-package-contracts'
import { JAVASCRIPT_HARNESS_SOURCE } from '../../../../src/main/services/learning/runtime/javascript-harness'
import { SOLUTIONS, JS_TRANSPORT_FAULT, faultSource, type PilotLanguage, type PilotFault } from './pilot-solutions'

export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
let retained: { service: ReturnType<typeof createWindowsExerciseService>; packages: ExercisePackageRegistry; root: string; native: LearningNativeBinding; watches: object[] } | undefined
/** Keep the real owner strongly referenced on an unexpected unresolved cleanup.
 * Later tests may not start another native operation over that unresolved owner. */
export async function retryRetainedPilot(): Promise<void> {
  if (!retained) return
  const owner = retained
  await owner.service.stop()
  if (owner.service.status().active) throw Error('Pilot native cleanup remains retained')
  await owner.packages.stop()
  for (const watch of owner.watches) owner.native.observation(watch, 'close')
  if (dirname(resolve(owner.root)) !== resolve(tmpdir()) || !basename(owner.root).startsWith('e3-s5-native-')) throw Error('Unsafe retained cleanup')
  await rm(owner.root, { recursive: true, force: true }); retained = undefined
}
class Owner extends EventEmitter { constructor(readonly id: number) { super() } isDestroyed() { return false } }
interface PhaseRecord { phase: ExerciseExecutionPhase; deadline: number; operationDeadline: number; remainingAtEntryMs: number; durationMs?: number }
interface JobRecord { phase: string; executable: string; args: readonly string[]; pid: number; created: string; quota: number;
  stdoutBytes: number; stderrBytes: number; peakJobCommitBytes: number; totalProcesses: number; coverageComplete: boolean; releases: number; closes: number }
export interface PilotReceipt {
  id: string; language: PilotLanguage; mode: string; sourceSha256: string; identity: OfficialPlanIdentity; caseCount: number;
  environment: { windows: string; node: string; abi: string | undefined; nativeSha256: string };
  phases: PhaseRecord[]; jobs: JobRecord[]; barriers: number; seen: number[]; requests: { caseIndex: number; bytes: number; argsHash: string; keys: string[] }[];
  rawBytes: number; artifacts: Record<string, string>; started: string; elapsedMs?: number; executionMs?: number;
  result?: OfficialExecutionCompletion; publicResult?: ExerciseSnapshot; errors: string[]; violations: string[];
  snapshotCount: number; ledger?: ReturnType<ExercisePackageRegistry['status']>; retained?: boolean; root?: string;
  assertion: 'UNVERIFIED' | 'PASS' | 'FAIL'; assertionError?: string
}
/** Instrument the real Core/native paths, never substitute native success. All
 * observers are test-only and forward existing calls/contexts unchanged. */
export async function nativePilot(id: string, language: PilotLanguage, options: { fault?: PilotFault; publicRun?: boolean; code?: string; evidenceDirectory?: string } = {}) {
  if (retained) throw Error('UNVERIFIED: previous native ownership unresolved; no new pilot launch')
  const native = nativeModule.loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
  const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as { openBundledExerciseResources: typeof openBundledExerciseResources }
  const packages = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
  await packages.whenStarted()
  if (packages.status().state !== 'AVAILABLE') throw Error('Compiled Registry unavailable')
  const base = resolve('resources/learning/exercises', id)
  const metadata = JSON.parse(await readFile(join(base, 'exercise.json'), 'utf8'))
  const judgeRaw = await readFile(join(base, 'judge/v1.json'))
  const judge = JSON.parse(judgeRaw.toString()) as { cases: OfficialPackageCase[] }
  const identity: OfficialPlanIdentity = { exerciseId: id, packageVersion: metadata.packageVersion, testSetId: metadata.official.testSetId,
    testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash,
    officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
  const pilot = Object.entries(SOLUTIONS).find(([key]) => key === id)?.[1][language]
  const code = options.fault ? faultSource(language, options.fault) : options.code ?? pilot
  if (typeof code !== 'string') throw Error('Missing fixed test source')
  const r: PilotReceipt = { id, language, mode: options.publicRun ? 'public' : options.fault ?? 'full', sourceSha256: digest(code), identity, caseCount: judge.cases.length,
    environment: { windows: release(), node: process.version, abi: process.versions.modules,
      nativeSha256: digest(await readFile('out/main/native/learning/learning-job.node')) },
    phases: [], jobs: [], barriers: 0, seen: [], requests: [], rawBytes: 0, artifacts: {}, started: new Date().toISOString(),
    errors: [], violations: [], snapshotCount: 0, assertion: 'UNVERIFIED' }
  if (digest(judgeRaw) !== identity.officialHash) throw Error('Source fixture identity mismatch')
  const root = await mkdtemp(join(tmpdir(), 'e3-s5-native-'))
  const handles = new Map<object, JobRecord>(), watches: object[] = []
  let workspacePath = '', cancelling = false, started = performance.now(), handle: OfficialOperationHandle | undefined
  const request = { exerciseId: id, language, code, sourceRevision: 1 }
  const note = (ok: boolean, message: string) => { if (!ok) r.violations.push(message) }
  const binding: LearningNativeBinding = { capability: native.capability, acquireLease: native.acquireLease, state: native.state,
    watch: native.watch, observation: native.observation,
    start: (exe, args, cwd, quota, environment) => {
      for (const old of handles.keys()) if (!native.state(old).handlesClosed) {
        const sample = native.poll(old)
        note(sample.activeProcesses === 0 && sample.observerSettled && sample.stdinSettled && sample.retained.every(p => p.signaled), 'Prior Job not settled')
        note(sample.stdout.length === 0 && sample.stderr.length === 0, 'Late bytes outside Runtime observer')
      }
      const phase = args.some(a => a.endsWith('csc.dll')) || args.at(-1) === 'syntax' ? 'compile'
        : language === 'javascript' && args.at(-1) !== 'execute' ? 'probe' : 'execute'
      workspacePath = phase === 'compile' && language === 'csharp' ? dirname(cwd) : cwd
      note(quota === (phase === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes), 'Quota selection')
      const argv = options.fault === 'protocol' && language === 'javascript' && phase === 'execute' ? ['--eval', JS_TRANSPORT_FAULT] : args
      const job = native.start(exe, argv, cwd, quota, environment), sample = native.poll(job)
      note(sample.quotaBytes === quota, 'Native quota readback')
      const record: JobRecord = { phase, executable: exe, args: argv, pid: sample.rootPid, created: sample.retained[0].created, quota,
        stdoutBytes: 0, stderrBytes: 0, peakJobCommitBytes: sample.peakJobCommitBytes, totalProcesses: sample.totalProcesses,
        coverageComplete: sample.coverageComplete, releases: 0, closes: 0 }
      handles.set(job, record); r.jobs.push(record); watches.push(native.watch(sample.rootPid)); return job
    },
    submitInput: (job, bytes) => {
      if (bytes.length) {
        const input = JSON.parse(bytes.toString()), keys = Object.keys(input).sort()
        note(keys.join(',') === 'args,caseIndex,protocolVersion' && input.protocolVersion === 1, 'Child input fields')
        note(JSON.stringify(input.args) === JSON.stringify(judge.cases[input.caseIndex]?.args), 'Input order/arguments')
        r.requests.push({ caseIndex: input.caseIndex, bytes: bytes.length, argsHash: digest(JSON.stringify(input.args)), keys })
      }
      native.submitInput(job, bytes)
    },
    poll: job => {
      const sample = native.poll(job), record = handles.get(job)!
      record.stdoutBytes += sample.stdout.length; record.stderrBytes += sample.stderr.length
      r.rawBytes += sample.stdout.length + sample.stderr.length
      record.peakJobCommitBytes = Math.max(record.peakJobCommitBytes, sample.peakJobCommitBytes)
      record.totalProcesses = Math.max(record.totalProcesses, sample.totalProcesses); record.coverageComplete &&= sample.coverageComplete
      return sample
    },
    control: (job, action) => {
      native.control(job, action)
      if (action === 'release') handles.get(job)!.releases++
      if (action === 'closeHandles') handles.get(job)!.closes++
      if (action === 'resume' && options.fault === 'cancel' && handles.get(job)!.phase === 'execute' && !cancelling) {
        cancelling = true; queueMicrotask(() => service.invalidate(1, 'CONTEXT_CHANGED'))
      }
    },
  }
  const location = vi.spyOn(nativeModule, 'loadLearningNative').mockReturnValue(binding)
  const service = createWindowsExerciseService(root, { packages, onSnapshot: () => { r.snapshotCount++ }, onCleanupError: e => r.errors.push(JSON.stringify(e)) })
  const originalPhase = ExerciseLimits.prototype.phase
  const phaseSpy = vi.spyOn(ExerciseLimits.prototype, 'phase').mockImplementation(function <T>(this: ExerciseLimits, phase: ExerciseExecutionPhase, work: (deadline: number) => Promise<T>): Promise<T> {
    return originalPhase.call(this, phase, async deadline => {
      const beginning = performance.now(), entry: PhaseRecord = { phase, deadline, operationDeadline: this.operationDeadline, remainingAtEntryMs: deadline - this.clock.now() }
      r.phases.push(entry)
      try { return await work(deadline) } finally { entry.durationMs = performance.now() - beginning }
    }) as Promise<T>
  })
  const originalBarrier = ExerciseSession.prototype.verifyExecutionBarrier
  const barrierSpy = vi.spyOn(ExerciseSession.prototype, 'verifyExecutionBarrier').mockImplementation(async function (this: ExerciseSession) {
    await originalBarrier.call(this); r.barriers++
    note(!this.snapshot().cleanup.cleanupComplete, 'Case barrier mistaken for final cleanup')
    if (r.barriers === (language === 'csharp' ? 1 : 2)) {
      const folder = join(workspacePath, language === 'csharp' ? 'csharp' : 'javascript')
      const files = language === 'csharp' ? ['Solution.cs', 'Harness.cs', 'Learning.dll', 'Learning.runtimeconfig.json'] : ['Source.json', 'Harness.mjs']
      for (const file of files) r.artifacts[file] = digest(await readFile(join(folder, file)))
      if (language === 'javascript') {
        const source = JSON.parse(await readFile(join(folder, 'Source.json'), 'utf8'))
        note(Object.keys(source).sort().join(',') === 'code,functionName,schema', 'Source.json private field leak')
        note(source.code === code && source.functionName === metadata.signature.functionName && source.schema.sampleCount === (options.publicRun ? 2 : r.caseCount), 'Source identity/count')
        note(await readFile(join(folder, 'Harness.mjs'), 'utf8') === JAVASCRIPT_HARNESS_SOURCE, 'Fixed child changed')
      } else {
        const harness = await readFile(join(folder, 'Harness.cs'), 'utf8')
        note(!harness.includes(identity.officialHash) && !harness.includes('"expected"') && !harness.includes('"visibility"'), 'C# harness private field leak')
      }
    }
  })
  const originalClose = ExerciseSession.prototype.close
  const closeSpy = vi.spyOn(ExerciseSession.prototype, 'close').mockImplementation(function (this: ExerciseSession, reason) {
    r.executionMs ??= performance.now() - started
    return originalClose.call(this, reason)
  })
  try {
    service.start(); await service.ready(); service.observe(new Owner(1)); service.observe(new Owner(2)); started = performance.now()
    if (options.publicRun) {
      const admitted = service.run(1, request)
      r.publicResult = await service.completion(1, { sessionId: admitted.sessionId, generation: admitted.generation })
    } else {
      handle = service.runOfficial(1, request, identity, row => {
        r.seen.push(row.caseIndex)
        note(row.kind === 'RETURNED' && row.process?.observerSettled === true, 'Non-returned/unsettled continuation')
        note(packages.readiness(id).pinned && service.status().active, 'Premature full lease/slot release')
        let busy = false; try { service.run(2, request) } catch { busy = true }; note(busy, 'Run/Official exclusion')
        if (options.fault === 'hook-throw') throw Error('S5_CONTROLLED_HOOK')
        return options.fault === 'stop' ? 'STOP' : 'CONTINUE'
      })
      let inaccessible = false; try { service.snapshot(1, handle.reference) } catch { inaccessible = true }; note(inaccessible, 'Official public snapshot access')
      r.result = await handle.completion()
    }
    r.elapsedMs = performance.now() - started
    note(options.publicRun || r.snapshotCount === 0, 'Official public publication')
  } catch (error) { r.errors.push(String(error)) }
  finally {
    try { await service.stop() } catch (error) { r.errors.push(`Cleanup: ${String(error)}`) }
    if (service.status().active) {
      r.retained = true; r.root = root; packages.beginShutdown()
      retained = { service, packages, root, native, watches }
    }
    else { await packages.stop(); r.ledger = packages.status() }
    for (const watch of watches) {
      note(native.observation(watch, 'identity').signaled, 'Root identity not signaled')
      if (!r.retained) native.observation(watch, 'close')
    }
    note([...handles].every(([job, record]) => native.state(job).released && native.state(job).handlesClosed && record.releases === 1 && record.closes === 1), 'Native release/close ownership')
    phaseSpy.mockRestore(); barrierSpy.mockRestore(); closeSpy.mockRestore(); location.mockRestore()
    if (!r.retained) {
      const safeRoot = dirname(resolve(root)) === resolve(tmpdir()) && basename(root).startsWith('e3-s5-native-')
      note(safeRoot, 'Unsafe pilot cleanup')
      if (safeRoot) await rm(root, { recursive: true, force: true })
    }
    await mkdir(options.evidenceDirectory ?? 'out/e3-s5/native', { recursive: true })
  }
  return { receipt: r, judge }
}
