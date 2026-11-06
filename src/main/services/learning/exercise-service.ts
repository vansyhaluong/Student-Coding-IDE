import { createHash, randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppError } from '../../../shared/contracts/app-error'
import type { ExerciseEndReason, ExerciseRunRequest, ExerciseSessionReference, ExerciseSnapshot, ExerciseStopRequest } from '../../../shared/contracts/exercise'
import { isExerciseSessionId, validateExerciseRunRequest, validateExerciseSessionReference, validateExerciseSnapshot, validateExerciseStopRequest } from '../../../shared/contracts/exercise-validation'
import { DomainError, serializeAppError } from '../../errors/app-error'
import { FileExerciseCheckpointStore, type ExerciseCheckpointStore } from './runtime/exercise-checkpoint'
import { exerciseClock, exerciseCoreError, waitForExerciseCleanup, type ExerciseClock } from './runtime/exercise-limits'
import { recoverExercise } from './runtime/exercise-recovery'
import { ExerciseSession } from './runtime/exercise-session'
import { ensureExerciseDirectory, ExerciseWorkspace } from './runtime/exercise-workspace'
import type { ExerciseExecutionPhase, ExerciseLeaseProvider, ExerciseRuntimeAdapter } from './runtime/exercise-runtime-adapter'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './runtime/windows-exercise-adapter'
import { WindowsExerciseLeaseProvider } from './runtime/windows-exercise-lease'
import { loadLearningNative, type LearningNativeBinding } from './runtime/windows-exercise-native'
import { WindowsCsharpExecutionAdapter, createOfficialCsharpExecutionAdapter } from './runtime/csharp-execution-adapter'
import { runCsharpSamples } from './runtime/csharp-orchestrator'
import { WindowsJavascriptExecutionAdapter, createOfficialJavascriptExecutionAdapter } from './runtime/javascript-execution-adapter'
import { runJavascriptSamples } from './runtime/javascript-orchestrator'
import type { ExercisePackageRegistry } from './content/exercise-package-registry'
import { packageRunBinding } from './package-run-binding'
import { createPublicRunReceipt, type PublicRunPackage, type PublicRunReceipt } from './smart-hints/public-run-receipt'
import { SMART_HINT_POLICY } from '../../../shared/contracts/smart-hints'
import { bindOfficialCasePlan, type OfficialPlanIdentity, type OfficialPlanSelection } from './official-case-plan'
import { executionDriverState, runExecutionDriver, type ExecutionDriverState } from './runtime/execution-driver'
import type { OfficialAdapterFactory, OfficialExecutionCompletion, OfficialJudgeOperationHandle, OfficialOperationHandle, OfficialSettledCaseConsumer } from './runtime/official-execution-contracts'
import { createOfficialJudge } from './judge-service'
import type { JudgeOwnerBoundIdentity, JudgeResult } from './judge/judge-contracts'
import type { LearningStore } from './learning-store'
import type { SnapshotTransaction, CommitGuardContext } from './storage/snapshot-transaction'
import type { SubmissionDiagnostic } from '../../../shared/contracts/submission-diagnostic'
import { SUBMISSION_STORE_POLICY, type SubmissionCapture, type SubmissionRecord, type SubmissionStorageResult } from './storage/submission-contracts'
import { bindSubmissionTarget, compareSubmissionIdentity, validateSubmissionCapture, validateSubmissionForCandidate, validateSubmissionSource, validateSubmissionLineage } from './storage/submission-validation'

type Navigation = (event: unknown, url: string, inPlace: boolean, mainFrame: boolean) => void
export interface ExerciseOwner {
  id: number
  isDestroyed(): boolean
  on(event: 'did-start-navigation', listener: Navigation): unknown
  on(event: 'did-finish-load' | 'render-process-gone' | 'destroyed', listener: () => void): unknown
  removeListener(event: 'did-start-navigation', listener: Navigation): unknown
  removeListener(event: 'did-finish-load' | 'render-process-gone' | 'destroyed', listener: () => void): unknown
}
export interface ExerciseExecution {
  adapter: ExerciseRuntimeAdapter
  /** Trusted finite language-driver plan; prepare is always owned by Core first. */
  phases: readonly ('compile' | 'execute')[]
  orchestrate?(session: ExerciseSession, progress: () => void): Promise<unknown>
  observation?(): ExerciseSnapshot['csharp']
  javascriptObservation?(): ExerciseSnapshot['javascript']
  releaseContent?(): void
  publicRunPackage?(): PublicRunPackage | undefined
}
export interface ExerciseServiceOptions {
  root: string
  leases: ExerciseLeaseProvider
  /** Synchronous configuration only: no process launch, probes or I/O before admission. */
  createExecution?: (request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace) => ExerciseExecution
  checkpointStore?: (workspace: ExerciseWorkspace) => ExerciseCheckpointStore
  clock?: ExerciseClock
  onSnapshot?: (owner: number, snapshot: ExerciseSnapshot) => void
  onCleanupError?: (error: AppError) => void
  /** Main-only configuration. The adapter factory is invoked in admitted Prepare. */
  official?: { registry: ExercisePackageRegistry; createAdapter: OfficialAdapterFactory }
  /** Synchronous accessor to the managed Main storage dependency, never a caller authority. */
  submissions?: { store(): Pick<LearningStore, 'begin'>; ownsLease(): boolean }
}
export interface SubmissionServiceStatus {
  readonly submissionId: string
  readonly reference: Readonly<ExerciseSessionReference>
  readonly exerciseId: string
  readonly language: ExerciseRunRequest['language']
  readonly sourceRevision: number
  readonly stage: 'RUNTIME' | 'STORAGE' | 'SETTLED'
  readonly verdict: JudgeResult['verdict']
  readonly counts?: { readonly total: number; readonly attempted: number; readonly passed: number }
  readonly diagnostic?: SubmissionDiagnostic
  readonly storage: { readonly state: SubmissionStorageResult['state']; readonly reason?: string;
    readonly recoveryPending?: true; readonly recordKey?: { readonly storeKind: 'ACCEPTED' | 'FAILED'; readonly recordId: string } }
}
/** Private same-operation handle. No raw Judge/Official result or transport wiring. */
export interface SubmissionOperationHandle {
  readonly submissionId: string
  readonly reference: Readonly<ExerciseSessionReference>
  status(): SubmissionServiceStatus
  completion(): Promise<SubmissionServiceStatus>
  retry(): Promise<SubmissionServiceStatus>
}
interface SubmitState {
  readonly intent: Readonly<Pick<SubmissionCapture, 'id' | 'submissionId' | 'exerciseId' | 'language' | 'code' | 'sourceRevision' | 'codeHash' | 'submittedAt'>>
  capture?: SubmissionCapture
  record?: SubmissionRecord
  storage: SubmissionStorageResult
  transaction?: SnapshotTransaction
  task?: Promise<void>
  admitted: boolean
  finished: boolean
}
interface OwnerEntry { owner: ExerciseOwner; accepts: boolean; documentEpoch: number; remove(): void }
interface Operation {
  runFingerprint?: string
  kind: 'RUN' | 'OFFICIAL'
  owner: number
  ownerEntry: OwnerEntry
  generation: number
  session: ExerciseSession
  invalidated: boolean
  executionDone: boolean
  lastPublished: number
  completion: Promise<ExerciseSnapshot>
  execution: ExerciseExecution
  runtimeSettled?: boolean
  runtimeCleanup?: Promise<ExerciseSnapshot>
  submit?: SubmitState
  official?: { binding: ReturnType<typeof bindOfficialCasePlan>; driver: ExecutionDriverState;
    consumer: OfficialSettledCaseConsumer; tasks: Set<Promise<unknown>>; cleanupFailure: boolean; releaseFailed: boolean;
    judge?: { engine: ReturnType<typeof createOfficialJudge>; identity?: Readonly<JudgeOwnerBoundIdentity>; documentEpoch: number;
      finalizationFailed: boolean; result?: JudgeResult } }
}
interface RecoveryEntry {
  workspace: ExerciseWorkspace
  store: ExerciseCheckpointStore
  result?: 'QUARANTINED' | 'ALREADY_COMPLETE' | 'CLEANUP_COMPLETE'
}
function serviceError(reason: string, code: 'PERMISSION_DENIED' | 'INVALID_INPUT' | 'PROCESS_FAILED' | 'UNSUPPORTED' = 'PROCESS_FAILED'): DomainError {
  return new DomainError({ code, operation: 'exercise:service', retryable: code === 'PROCESS_FAILED',
    message: 'Learning execution is unavailable or its session is no longer current.', details: { reason } })
}

/** Main-only singleton coordinator. No IPC registration or renderer execution API. */
export class ExerciseService {
  readonly name = 'ExerciseService'
  private readonly root: string
  private readonly clock: ExerciseClock
  private readonly hostEpoch = randomUUID()
  private readonly owners = new Map<number, OwnerEntry>()
  private readonly recoveryEntries = new Map<string, RecoveryEntry>()
  private readonly orphans = new Set<string>()
  private generation = 0
  private started = false
  private sealed = false
  private stopped = false
  private recoveryPending = false
  private recoveryFailed = false
  private recoveryTask?: Promise<void>
  private active?: Operation
  private last?: { owner: number; ownerEntry: OwnerEntry; snapshot: ExerciseSnapshot; publicRun?: PublicRunReceipt }
  private publicReceiptTimer?: ReturnType<typeof setTimeout>
  /** Clear even idle receipts whose handles still exist after slot settlement. */
  private diagnosticReceipt?: { owner: number; discard(): void }
  private error?: AppError
  constructor(private readonly options: ExerciseServiceOptions) {
    this.root = resolve(options.root); this.clock = options.clock ?? exerciseClock
  }
  start(): void {
    if (this.started || this.sealed) throw serviceError('SERVICE_STATE')
    this.started = true
    // Return synchronously so DesktopApplication owns this service before any
    // pending recovery I/O. Admission stays closed until recovery succeeds.
    this.beginRecovery()
  }
  private report(error: unknown): void {
    this.error = serializeAppError(error, 'exercise:service')
    try { this.options.onCleanupError?.(this.error) } catch { /* Keep original ownership/error even if diagnostics fail. */ }
  }
  private beginRecovery(): Promise<void> {
    if (this.recoveryPending && this.recoveryTask) return this.recoveryTask
    this.recoveryPending = true; this.recoveryFailed = false
    const task = Promise.resolve().then(() => this.recoverStartup()).then(() => {
      this.recoveryFailed = false; this.error = undefined
    }, error => { this.recoveryFailed = true; this.report(error); throw error })
    this.recoveryTask = task
    void task.finally(() => { this.recoveryPending = false }).catch(() => {})
    return task
  }
  ready(): Promise<void> {
    if (!this.started) return Promise.reject(serviceError('NOT_STARTED'))
    return waitForExerciseCleanup(this.recoveryTask ?? Promise.resolve(), this.clock)
  }
  retryRecovery(): Promise<void> {
    if (!this.started) return Promise.reject(serviceError('NOT_STARTED'))
    return waitForExerciseCleanup(this.recoveryFailed ? this.beginRecovery() : this.recoveryTask ?? Promise.resolve(), this.clock)
  }
  private async recoverStartup(): Promise<void> {
    const directory = join(this.root, 'checkpoints'), sessions = join(this.root, 'sessions')
    await ensureExerciseDirectory(directory); await ensureExerciseDirectory(sessions)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.name.endsWith('.json')) continue // Interrupted atomic-write temporary files remain untouched.
      const id = entry.name.slice(0, -5)
      if (!entry.isFile() || entry.isSymbolicLink() || !isExerciseSessionId(id)) throw exerciseCoreError('RECOVERY_CONTAINMENT')
      if (!this.recoveryEntries.has(id)) {
        const workspace = new ExerciseWorkspace(this.root, id, this.options.leases)
        this.recoveryEntries.set(id, { workspace, store: this.store(workspace) })
      }
    }
    for (const [id, entry] of this.recoveryEntries) if (!entry.result) {
      entry.result = await recoverExercise(entry.workspace, entry.store, this.clock)
      this.orphans.delete(id)
    }
    // Never adopt/delete a workspace without an acknowledged checkpoint.
    for (const entry of await readdir(sessions, { withFileTypes: true })) {
      if (isExerciseSessionId(entry.name) && !this.recoveryEntries.has(entry.name)) this.orphans.add(entry.name)
    }
  }
  private store(workspace: ExerciseWorkspace): ExerciseCheckpointStore {
    return this.options.checkpointStore?.(workspace) ?? new FileExerciseCheckpointStore(workspace)
  }
  observe(owner: ExerciseOwner): void {
    if (this.sealed || this.owners.has(owner.id) || owner.isDestroyed()) return
    const entry: OwnerEntry = { owner, accepts: true, documentEpoch: 0, remove: () => {
      owner.removeListener('did-start-navigation', navigation); owner.removeListener('did-finish-load', loaded)
      owner.removeListener('render-process-gone', lost); owner.removeListener('destroyed', destroyed)
      if (this.owners.get(owner.id) === entry) this.owners.delete(owner.id)
    } }
    const lost = () => {
      if (this.owners.get(owner.id) !== entry) return
      entry.accepts = false
      this.invalidate(owner.id, 'OWNER_LOST')
    }
    const navigation: Navigation = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) lost() }
    const loaded = () => { if (this.owners.get(owner.id) === entry && !owner.isDestroyed() && !this.sealed) entry.accepts = true }
    const destroyed = () => { lost(); entry.remove() }
    this.owners.set(owner.id, entry)
    owner.on('did-start-navigation', navigation); owner.on('did-finish-load', loaded)
    owner.on('render-process-gone', lost); owner.on('destroyed', destroyed)
  }
  run(owner: number, value: ExerciseRunRequest): ExerciseSnapshot {
    const op = this.admit(owner, value)
    this.publish(op)
    return this.observation(op)
  }
  /** Trusted Main capability only. No public flag, IPC, renderer DTO or queue. */
  runOfficial(owner: number, value: ExerciseRunRequest, identity: Readonly<OfficialPlanIdentity>, consumer: OfficialSettledCaseConsumer): OfficialOperationHandle {
    if (!value || !identity || Object.hasOwn(identity, 'selection') || identity.exerciseId !== value.exerciseId || typeof consumer !== 'function') throw serviceError('INVALID_REQUEST', 'INVALID_INPUT')
    const op = this.admit(owner, value, { identity: Object.freeze({ ...identity }), consumer })
    return Object.freeze({ reference: Object.freeze({ sessionId: op.session.snapshot().sessionId, generation: op.generation }),
      completion: async () => {
        try { await op.completion }
        catch { op.official!.cleanupFailure = !op.session.snapshot().cleanup.cleanupComplete }
        // A retry observes this SAME retained operation. Pending language work
        // rejects rather than fabricating a completed prefix/unattempted suffix.
        return this.officialCompletion(op)
      } })
  }
  /** Main-private entry on the SAME slot. Caller supplies source/plan identity only. */
  runJudge(owner: number, value: ExerciseRunRequest, identity: Readonly<OfficialPlanIdentity>): OfficialJudgeOperationHandle {
    if (!value || !identity || Object.hasOwn(identity, 'selection') || identity.exerciseId !== value.exerciseId) throw serviceError('INVALID_REQUEST', 'INVALID_INPUT')
    const engine = createOfficialJudge()
    const op = this.admit(owner, value, { identity: Object.freeze({ ...identity }), consumer: engine.consume, judge: engine })
    return Object.freeze({ reference: Object.freeze({ sessionId: op.session.snapshot().sessionId, generation: op.generation }),
      completion: async () => {
        try { await op.completion } catch { /* Read actual retained completion; do not start another wait. */ }
        return this.officialCompletion(op)
      },
      judgeResult: async () => {
        try { await op.completion } catch { /* Pending/failed cleanup stays owned by this operation. */ }
        const judge = op.official!.judge!
        if (judge.result && this.currentJudge(op)) return structuredClone(judge.result)
        if (judge.finalizationFailed) throw serviceError('OFFICIAL_JUDGE_FINALIZATION_FAILED')
        // Preview/invalidation is not a second finalization or a new operation.
        return this.reduceJudge(op)
      },
    })
  }
  /** Captures intent BEFORE execute starts. Main selects the trusted plan in Prepare. */
  submit(owner: number, value: ExerciseRunRequest): SubmissionOperationHandle {
    const request = validateExerciseRunRequest(value)
    if (!request.ok || !validateSubmissionSource(request.value.code).ok) throw serviceError('INVALID_REQUEST', 'INVALID_INPUT')
    if (!this.options.submissions) throw serviceError('SUBMISSION_STORAGE_UNAVAILABLE', 'UNSUPPORTED')
    const engine = createOfficialJudge(true), r = request.value
    const submit: SubmitState = { intent: Object.freeze({ id: randomUUID(), submissionId: randomUUID(),
      exerciseId: r.exerciseId, language: r.language, code: r.code, sourceRevision: r.sourceRevision,
      codeHash: createHash('sha256').update(r.code, 'utf8').digest('hex'), submittedAt: new Date().toISOString() }),
    storage: { state: 'not-requested' }, admitted: false, finished: false }
    const op = this.admit(owner, r, { identity: Object.freeze({ selection: 'CURRENT', exerciseId: r.exerciseId }),
      consumer: engine.consume, judge: engine, submit })
    const reference = Object.freeze({ sessionId: op.session.snapshot().sessionId, generation: op.generation })
    return Object.freeze({ submissionId: submit.intent.submissionId, reference,
      status: () => this.submissionStatus(op),
      completion: async () => {
        try { await op.completion } catch { /* Original runtime/storage waits retain their tasks. */ }
        return this.submissionStatus(op)
      },
      retry: async () => {
        this.submissionStatus(op) // Revoke observation, never settlement, after owner loss.
        if (this.active === op) {
          try { await this.cleanup(op) } catch { /* Report actual retained state, never restart execution. */ }
        }
        return this.submissionStatus(op)
      },
    })
  }
  private admit(owner: number, value: ExerciseRunRequest, official?: { identity: Readonly<OfficialPlanSelection>; consumer: OfficialSettledCaseConsumer;
    judge?: ReturnType<typeof createOfficialJudge>; submit?: SubmitState }): Operation {
    const request = validateExerciseRunRequest(value)
    if (!request.ok) throw serviceError('INVALID_REQUEST', 'INVALID_INPUT')
    const entry = this.owners.get(owner)
    if (!entry || !entry.accepts || entry.owner.isDestroyed()) throw serviceError('OWNER_LOST', 'PERMISSION_DENIED')
    if (!this.started || this.sealed || this.recoveryPending || this.recoveryFailed) throw serviceError('ADMISSION_CLOSED')
    if (this.active) throw serviceError('OPERATION_BUSY') // No queue and no implicit replacement.
    if (official ? !this.options.official : !this.options.createExecution) throw serviceError('LANGUAGE_ADAPTER_UNAVAILABLE', 'UNSUPPORTED')
    const workspace = new ExerciseWorkspace(this.root, `exercise_${randomUUID()}`, this.options.leases)
    const generation = this.generation + 1
    const tasks = new Set<Promise<unknown>>()
    const binding = official ? bindOfficialCasePlan(this.options.official!.registry, official.identity, {
      packageOwner: { owner: entry, generation, phase: 'prepare',
        isCurrent: () => this.active === operation && this.isCurrent(operation),
        check() {}, retain: task => { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}) },
        canRelease: () => operation.executionDone && !operation.session.ownsResources && tasks.size === 0 },
      cleanup: () => operation.session.snapshot().cleanup,
    }, Object.freeze(request.value), workspace, this.options.official!.createAdapter, official.judge ? view => {
      if (operation.submit) this.bindSubmitPlan(operation, view.identity)
      official.judge!.initialize(view)
    } : undefined) : undefined
    const execution: ExerciseExecution = binding ? { adapter: binding.adapter, phases: ['compile', 'execute'], releaseContent: binding.releaseContent }
      : this.options.createExecution!(Object.freeze(request.value), workspace)
    if (!execution.phases.length || execution.phases.some(p => p !== 'compile' && p !== 'execute')
      || !execution.phases.includes('execute')) throw serviceError('INVALID_DRIVER_PLAN', 'INVALID_INPUT')
    this.generation = generation
    const session = new ExerciseSession({ request: request.value, ownerId: `webcontents:${owner}`, generation,
      hostEpoch: this.hostEpoch, workspace, adapter: execution.adapter, checkpoints: this.store(workspace), clock: this.clock })
    const operation: Operation = { kind: official ? 'OFFICIAL' : 'RUN', owner, ownerEntry: entry, generation, session, invalidated: false,
      executionDone: false, lastPublished: -1, execution, submit: official?.submit, completion: undefined as unknown as Promise<ExerciseSnapshot> }
    if (!official) operation.runFingerprint = createHash('sha256').update(request.value.code, 'utf8').digest('hex')
    if (binding && official) {
      operation.official = { binding, tasks, consumer: official.consumer, driver: executionDriverState(), cleanupFailure: false, releaseFailed: false }
      if (official.judge) operation.official.judge = { engine: official.judge, documentEpoch: entry.documentEpoch, finalizationFailed: false,
        identity: 'selection' in official.identity ? undefined : Object.freeze({ ownerId: owner, ownerEntry: entry,
          session: Object.freeze({ sessionId: workspace.sessionId, generation }), plan: official.identity,
          language: request.value.language, sourceRevision: request.value.sourceRevision,
          sourceHash: createHash('sha256').update(request.value.code, 'utf8').digest('hex') }) }
    }
    this.diagnosticReceipt?.discard()
    this.diagnosticReceipt = official?.submit && official.judge ? { owner, discard: official.judge.discardDiagnostic } : undefined
    clearTimeout(this.publicReceiptTimer); this.publicReceiptTimer = undefined
    this.last = undefined; this.active = operation
    // Begin Core prepare immediately, before returning admission to the caller.
    operation.completion = this.execute(operation, [...execution.phases])
    void operation.completion.catch(error => { if (operation.session.ownsResources) this.report(error) })
    return operation
  }
  private observation(op: Operation): ExerciseSnapshot {
    if (op.kind !== 'RUN') throw serviceError('STALE_SESSION', 'PERMISSION_DENIED')
    const snapshot = op.session.snapshot()
    if (this.isCurrent(op) && op.execution.observation) {
      const csharp = op.execution.observation()
      if (csharp) snapshot.csharp = csharp
    }
    if (this.isCurrent(op) && op.execution.javascriptObservation) {
      const javascript = op.execution.javascriptObservation()
      if (javascript) snapshot.javascript = javascript
    }
    const checked = validateExerciseSnapshot(snapshot)
    if (!checked.ok) throw serviceError('INVALID_OBSERVATION')
    return checked.value
  }
  private isCurrent(op: Operation): boolean {
    return !this.sealed && !op.invalidated && op.generation === this.generation
      && this.owners.get(op.owner) === op.ownerEntry && op.ownerEntry.accepts && !op.ownerEntry.owner.isDestroyed()
  }
  private publish(op: Operation): void {
    if (op.kind !== 'RUN' || !this.isCurrent(op)) return
    try {
      const snapshot = this.observation(op)
      if (snapshot.sequence <= op.lastPublished) return
      op.lastPublished = snapshot.sequence
      this.options.onSnapshot?.(op.owner, structuredClone(snapshot))
    } catch (error) { this.report(error) }
  }
  private async execute(op: Operation, phases: readonly ('compile' | 'execute')[]): Promise<ExerciseSnapshot> {
    let retainedCleanupFailure: unknown
    try {
      if (op.official) await runExecutionDriver(op.session, op.execution.adapter as ReturnType<typeof bindOfficialCasePlan>['adapter'], {
        language: op.session.snapshot().language, current: () => this.isCurrent(op), consumer: op.official.consumer,
        currentCase: () => op.official!.binding.evidence().cases.at(-1),
      }, op.official.driver)
      else if (op.execution.orchestrate) await op.execution.orchestrate(op.session, () => this.publish(op))
      else {
        await op.session.runPhase('prepare'); this.publish(op)
        for (const phase of phases) {
          if (!this.isCurrent(op)) throw serviceError('STALE_SESSION', 'PERMISSION_DENIED')
          await op.session.runPhase(phase); this.publish(op)
        }
      }
    } catch (error) {
      if (op.official) {
        op.official.cleanupFailure = true
        if (op.session.ownsResources && op.session.snapshot().phase === 'cleanup') retainedCleanupFailure = error
      }
      // Core retains the same execution/cleanup tasks, including 12s caller waits.
    }
    finally { op.executionDone = true; op.official?.judge?.engine.revokeView() }
    // Official completion must not start a second12s caller wait after the
    // driver's close failed. Keep this same task/slot for explicit managed retry.
    if (retainedCleanupFailure) throw retainedCleanupFailure
    const snapshot = await this.cleanup(op)
    if (op.kind === 'RUN' && !this.isCurrent(op)) throw serviceError('STALE_SESSION', 'PERMISSION_DENIED')
    return snapshot
  }
  private async cleanup(op: Operation, reason: ExerciseEndReason = 'COMPLETED'): Promise<ExerciseSnapshot> {
    await this.settleRuntime(op, reason)
    // A joined close can finish before execute's finally sets executionDone.
    // Recheck the same live operation after that join, without a new Core task.
    const snapshot = this.finalizeRuntime(op)
    if (op.submit && op.runtimeSettled && this.active === op) await this.waitSubmission(op, this.continueSubmission(op))
    return snapshot
  }
  private settleRuntime(op: Operation, reason: ExerciseEndReason): Promise<ExerciseSnapshot> {
    // Preserve legacy Run/Official/Judge cancellation and retry ordering exactly.
    if (!op.submit) return this.cleanupRuntime(op, reason)
    if (op.runtimeSettled) return Promise.resolve(op.kind === 'RUN' ? this.observation(op) : op.session.snapshot())
    if (op.runtimeCleanup) return op.runtimeCleanup
    // Call close synchronously: cancellation must set Core's first reason now.
    const task = this.cleanupRuntime(op, reason)
    op.runtimeCleanup = task
    void task.finally(() => { if (op.runtimeCleanup === task) op.runtimeCleanup = undefined }).catch(() => {})
    return task
  }
  private async cleanupRuntime(op: Operation, reason: ExerciseEndReason): Promise<ExerciseSnapshot> {
    try { await op.session.close(reason) }
    catch (error) { this.report(error); throw error }
    return this.finalizeRuntime(op)
  }
  private finalizeRuntime(op: Operation): ExerciseSnapshot {
    const snapshot = op.kind === 'RUN' ? this.observation(op) : op.session.snapshot()
    this.publish(op)
    if (!op.runtimeSettled && !op.session.ownsResources && op.executionDone && this.active === op) {
      let publicRun: PublicRunReceipt | undefined
      // Advisory capture must never change Run cleanup, result or eligibility.
      if (op.kind === 'RUN' && this.isCurrent(op)) {
        try { publicRun = createPublicRunReceipt(op.runFingerprint!, snapshot, op.execution.publicRunPackage?.()) } catch { /* CODE_ONLY */ }
      }
      if (op.execution.releaseContent) {
        if (!snapshot.cleanup.cleanupComplete || snapshot.cleanup.proof !== 'VERIFIED') throw serviceError('PACKAGE_CLEANUP_UNVERIFIED')
        if (op.official?.judge && (snapshot.cleanup.state !== 'FINALIZED' || !snapshot.cleanup.processClean
          || snapshot.cleanup.workspace !== 'REMOVED' || snapshot.cleanup.pendingIo)) throw serviceError('PACKAGE_CLEANUP_UNVERIFIED')
        try { op.execution.releaseContent(); if (op.official) op.official.releaseFailed = false }
        catch {
          if (op.official) { op.official.releaseFailed = true; op.official.cleanupFailure = true }
          const error = serviceError('PACKAGE_RELEASE_FAILED'); this.report(error); throw error
        }
      }
      if (op.official) op.official.cleanupFailure = false
      if (op.official?.judge && !op.official.judge.result && (!op.submit || op.official.judge.identity)) {
        // No await between owner/release checks, scalar reduction and slot release.
        // A throwing finalizer leaves the same slot available to managed retry.
        try { op.official.judge.result = this.reduceJudge(op); op.official.judge.finalizationFailed = false }
        catch {
          op.official.judge.finalizationFailed = true
          const error = serviceError('OFFICIAL_JUDGE_FINALIZATION_FAILED'); this.report(error); throw error
        }
      }
      op.runtimeSettled = true
      if (op.kind === 'RUN' && this.isCurrent(op)) {
        this.last = { owner: op.owner, ownerEntry: op.ownerEntry, snapshot: structuredClone(snapshot), publicRun }
        if (publicRun) {
          const receiptOwner = op.owner // Never retain the operation/session/leased adapter in this timer.
          this.publicReceiptTimer = setTimeout(() => this.retirePublicRunReceipt(receiptOwner), SMART_HINT_POLICY.resultMs)
          this.publicReceiptTimer.unref()
        }
      }
      if (!op.submit) this.active = undefined
    }
    return snapshot
  }
  private officialCompletion(op: Operation): OfficialExecutionCompletion {
    const state = op.official!
    const evidence = state.binding.evidence(), snapshot = op.session.snapshot()
    const invalidated = state.judge ? !this.currentJudge(op) : !this.isCurrent(op)
    const failed = state.driver.failure || state.cleanupFailure || state.releaseFailed || evidence.failure
    return structuredClone({ identity: state.binding.identity(), planAcquired: state.binding.planAcquired(),
      disposition: invalidated ? 'INVALIDATED' : failed ? 'EXECUTION_FAILURE' : state.driver.disposition,
      compile: evidence.compile ?? evidence.syntax ?? null, cases: evidence.cases, notRunCaseIndices: evidence.notRunCaseIndices,
      failure: evidence.failure ?? (!invalidated && failed ? { kind: 'INFRASTRUCTURE_FAILURE', phase: state.binding.planAcquired() ? 'cleanup' : 'prepare', caseIndex: null } : null),
      endReason: snapshot.reason ?? 'INTERNAL_ERROR', cleanup: snapshot.cleanup })
  }
  private currentJudge(op: Operation): boolean {
    return this.isCurrent(op) && op.official!.judge!.documentEpoch === op.ownerEntry.documentEpoch
  }
  /** Main transport stamp only; never serialize the owner-entry alias. */
  contextStamp(owner: number): Readonly<{ entry: object; epoch: number }> {
    const entry = this.owners.get(owner)
    if (this.sealed || !entry || !entry.accepts || entry.owner.isDestroyed()) throw serviceError('OWNER_LOST', 'PERMISSION_DENIED')
    return { entry, epoch: entry.documentEpoch }
  }
  private reduceJudge(op: Operation): JudgeResult {
    const state = op.official!, judge = state.judge!, snapshot = op.session.snapshot()
    const identity = judge.identity
    if (!identity) throw serviceError('OFFICIAL_PLAN_UNBOUND')
    let completion: OfficialExecutionCompletion | null
    try { completion = this.officialCompletion(op) }
    catch (error) {
      if (!(error instanceof DomainError) || error.details?.reason !== 'RESULT_PENDING') throw serviceError('OFFICIAL_RESULT_INVALID')
      completion = null // Runtime still owns unsettled phase evidence; no invented prefix.
    }
    return judge.engine.reduce({ identity,
      operationIdentity: { ownerId: op.owner, ownerEntry: this.owners.get(op.owner) ?? op.ownerEntry,
        session: { sessionId: snapshot.sessionId, generation: snapshot.generation }, plan: state.binding.identity(),
        language: snapshot.language, sourceRevision: snapshot.sourceRevision, sourceHash: identity.sourceHash },
      completion, ownerCurrent: this.currentJudge(op),
      decisionSecuredBeforeClose: op.executionDone && !state.driver.consumerFailure && (!state.driver.failure || op.session.lastPhaseError !== undefined),
      cleanup: { snapshot: snapshot.cleanup, executionDone: op.executionDone, ownsResources: op.session.ownsResources,
        retainedPackageTasks: state.tasks.size, representationBorrows: state.binding.representationBorrows(),
        contentReleased: state.binding.contentReleased(), contentReleaseFailed: state.releaseFailed },
    })
  }
  private bindSubmitPlan(op: Operation, plan: Readonly<OfficialPlanIdentity>): void {
    const s = op.submit!, snapshot = op.session.snapshot()
    if (s.capture || this.active !== op || !this.currentJudge(op) || snapshot.phase !== 'prepare'
      || plan.exerciseId !== s.intent.exerciseId) throw serviceError('SUBMISSION_PLAN_INVALID')
    const capture = validateSubmissionCapture({ schemaVersion: 1, ...s.intent, packageVersion: plan.packageVersion,
      signatureVersion: plan.signatureVersion, signatureHash: plan.signatureHash,
      testSet: { id: plan.testSetId, version: plan.testSetVersion, hash: plan.officialHash },
      comparator: { id: plan.comparatorId, version: plan.comparatorVersion } })
    if (!capture.ok) throw serviceError('SUBMISSION_PLAN_INVALID')
    s.capture = capture.value
    op.official!.judge!.identity = Object.freeze({ ownerId: op.owner, ownerEntry: op.ownerEntry,
      session: Object.freeze({ sessionId: snapshot.sessionId, generation: op.generation }), plan,
      language: s.intent.language, sourceRevision: s.intent.sourceRevision, sourceHash: s.intent.codeHash })
  }
  private submissionStatus(op: Operation): SubmissionServiceStatus {
    if (!op.submit || !this.currentJudge(op)) throw serviceError('STALE_SESSION', 'PERMISSION_DENIED')
    const s = op.submit, result = s.transaction?.status ?? s.storage
    const judge = op.official!.judge!.result
    const diagnostic = judge ? op.official!.judge!.engine.diagnostic(judge) : undefined
    const recordKey = result.state === 'saved' ? { storeKind: result.target.storeKind, recordId: result.target.id } : undefined
    return structuredClone({ submissionId: s.intent.submissionId,
      reference: { sessionId: op.session.snapshot().sessionId, generation: op.generation },
      exerciseId: s.intent.exerciseId, language: s.intent.language, sourceRevision: s.intent.sourceRevision,
      stage: s.finished ? 'SETTLED' : op.runtimeSettled ? 'STORAGE' : 'RUNTIME',
      verdict: judge?.verdict ?? null,
      ...(op.runtimeSettled && diagnostic ? { diagnostic } : {}),
      ...(judge?.state === 'FINAL' && judge.requiredCases !== null ? { counts: {
        total: judge.requiredCases, attempted: judge.attemptedCases, passed: judge.passedCases } } : {}),
      storage: { state: result.state, ...(result.state === 'failed' ? { reason: result.reason } : {}),
        ...(result.state === 'not-requested' && s.finished ? { reason: s.capture ? 'INELIGIBLE' : 'PLAN_UNAVAILABLE' } : {}),
        ...(result.state === 'unknown' ? { recoveryPending: true as const } : {}), ...(recordKey ? { recordKey } : {}) } })
  }
  private submissionGuard(op: Operation, context: CommitGuardContext): void {
    const s = op.submit!, official = op.official!, judge = official.judge!, result = judge.result
    const snapshot = op.session.snapshot(), identity = judge.identity, capture = s.capture, record = s.record
    if (this.active !== op || !this.currentJudge(op) || s.admitted || !op.runtimeSettled || !op.executionDone
      || !capture || !record || !identity || !result || result.state !== 'FINAL' || result.eligibility.kind === 'INELIGIBLE'
      || !this.options.submissions?.ownsLease() || op.session.ownsResources
      || snapshot.cleanup.state !== 'FINALIZED' || snapshot.cleanup.proof !== 'VERIFIED' || !snapshot.cleanup.cleanupComplete
      || !snapshot.cleanup.processClean || snapshot.cleanup.pendingIo || snapshot.cleanup.workspace !== 'REMOVED'
      || official.tasks.size || official.cleanupFailure || official.releaseFailed || official.judge!.finalizationFailed || official.binding.representationBorrows()
      || !official.binding.planAcquired() || !official.binding.contentReleased()
      || identity.ownerId !== op.owner || identity.ownerEntry !== op.ownerEntry
      || identity.session.sessionId !== snapshot.sessionId || identity.session.generation !== op.generation
      || snapshot.generation !== op.generation || snapshot.exerciseId !== capture.exerciseId || snapshot.language !== capture.language
      || snapshot.sourceRevision !== capture.sourceRevision || identity.language !== capture.language
      || identity.sourceRevision !== capture.sourceRevision || identity.sourceHash !== capture.codeHash
      || capture.packageVersion !== identity.plan.packageVersion || capture.signatureVersion !== identity.plan.signatureVersion
      || capture.signatureHash !== identity.plan.signatureHash || capture.testSet.id !== identity.plan.testSetId
      || capture.testSet.version !== identity.plan.testSetVersion || capture.testSet.hash !== identity.plan.officialHash
      || capture.comparator.id !== identity.plan.comparatorId || capture.comparator.version !== identity.plan.comparatorVersion
      || result.identity.ownerId !== op.owner || result.identity.session.sessionId !== snapshot.sessionId
      || result.identity.session.generation !== op.generation || result.identity.language !== capture.language
      || result.identity.sourceRevision !== capture.sourceRevision || result.identity.sourceHash !== capture.codeHash
      || capture.code !== s.intent.code || capture.codeHash !== createHash('sha256').update(s.intent.code, 'utf8').digest('hex')
      || JSON.stringify(identity.plan) !== JSON.stringify(official.binding.identity())
      || JSON.stringify(result.identity.plan) !== JSON.stringify(identity.plan)) throw serviceError('SUBMISSION_ADMISSION_REVOKED', 'PERMISSION_DENIED')
    const checked = validateSubmissionForCandidate(record, { state: 'FINAL', verdict: result.verdict, eligibility: result.eligibility.kind }, capture)
    const target = bindSubmissionTarget(record)
    const last = context.next.records.at(-1), matching = last ? compareSubmissionIdentity(record, last) : undefined
    if (!checked.ok || !target.ok || JSON.stringify(target.value) !== JSON.stringify(context.target)
      || !matching?.ok || matching.value !== 'MATCHING_RETRY'
      || context.next.storeKind !== target.value.storeKind
      || (context.base ? !validateSubmissionLineage(context.next, context.base).ok
        : context.next.commitSequence !== 1 || context.next.previousCommit !== null || context.next.records.length !== 1)) {
      throw serviceError('SUBMISSION_BINDING_INVALID', 'PERMISSION_DENIED')
    }
    s.admitted = true // No await: S3 dispatches the primary rename in this same stack.
  }
  private continueSubmission(op: Operation): Promise<void> {
    const s = op.submit!
    if (s.task) return s.task
    if (s.finished) return Promise.resolve()
    const task = Promise.resolve().then(async () => {
      if (!s.transaction) {
        const result = op.official!.judge!.result, capture = s.capture
        if (!this.currentJudge(op) || !capture || !result || result.state !== 'FINAL' || result.eligibility.kind === 'INELIGIBLE') {
          s.finished = true; return // Ineligible is not a fabricated save failure.
        }
        const now = new Date().toISOString()
        const proposed = result.verdict === 'Accepted' ? { ...capture, result: 'Accepted', acceptedAt: now, cleanupProof: 'VERIFIED',
          testSet: { ...capture.testSet, total: result.requiredCases, passed: result.passedCases } }
          : { ...capture, verdict: result.verdict, gradedAt: now, recordedAt: now }
        const record = validateSubmissionForCandidate(proposed, { state: 'FINAL', verdict: result.verdict, eligibility: result.eligibility.kind }, capture)
        const target = record.ok ? bindSubmissionTarget(record.value) : undefined
        if (!record.ok || !target?.ok) throw serviceError('SUBMISSION_RECORD_INVALID')
        s.record = record.value; s.storage = { state: 'pending', target: target.value }
        try { s.transaction = this.options.submissions!.store().begin(record.value, context => this.submissionGuard(op, context)) }
        catch {
          s.storage = { state: 'failed', target: target.value, reason: 'UNAVAILABLE' }; s.finished = true
          this.report(serviceError('SUBMISSION_STORAGE_UNAVAILABLE')); return
        }
      }
      await s.transaction.task // Never op.completion: that task can be waiting for us.
      s.storage = s.transaction.status
      if (!s.transaction.settled) { await s.transaction.settle(); s.storage = s.transaction.status }
      if (s.transaction.settled && s.storage.state !== 'unknown' && s.storage.state !== 'pending') s.finished = true
    }).catch(error => { this.report(error); throw error })
      .finally(() => { if (s.finished && this.active === op) this.active = undefined })
    s.task = task // Attach before yielding; concurrent cleanup joins exactly this continuation.
    void task.finally(() => { if (s.task === task) s.task = undefined }).catch(() => {})
    return task
  }
  private async waitSubmission(op: Operation, task: Promise<void>, shutdown = false): Promise<void> {
    const kind = op.official!.judge!.result?.verdict === 'Accepted' ? 'ACCEPTED' : 'FAILED'
    const ms = shutdown ? SUBMISSION_STORE_POLICY[kind].shutdownWaitMs : SUBMISSION_STORE_POLICY[kind].callerWaitMs
    const due = this.clock.now() + ms
    let cancel = () => {}
    const deadline = new Promise<never>((_, reject) => { cancel = this.clock.schedule(() => reject(serviceError('SUBMISSION_STORAGE_PENDING')), ms) })
    try {
      await Promise.race([task, deadline])
      if (this.clock.now() >= due) throw serviceError('SUBMISSION_STORAGE_PENDING')
    } finally { cancel() }
  }
  publicRunReceipt(owner: number, reference: ExerciseSessionReference): PublicRunReceipt | undefined {
    this.snapshot(owner, { sessionId: reference.sessionId, generation: reference.generation }) // Exact owner/document/generation authority.
    return this.last?.publicRun ? structuredClone(this.last.publicRun) : undefined
  }
  retirePublicRunReceipt(owner: number): void {
    if (this.last?.owner !== owner) return
    this.last.publicRun = undefined; clearTimeout(this.publicReceiptTimer); this.publicReceiptTimer = undefined
  }
  snapshot(owner: number, reference: ExerciseSessionReference): ExerciseSnapshot {
    if (!validateExerciseSessionReference(reference).ok) throw serviceError('INVALID_REFERENCE', 'INVALID_INPUT')
    const op = this.active
    if (op?.kind === 'RUN' && op.owner === owner && this.isCurrent(op)) {
      const s = this.observation(op)
      if (s.sessionId === reference.sessionId && s.generation === reference.generation) return s
    }
    const last = this.last
    if (!this.sealed && last?.owner === owner && this.owners.get(owner) === last.ownerEntry && last.ownerEntry.accepts
      && !last.ownerEntry.owner.isDestroyed() && last.snapshot.generation === this.generation
      && last.snapshot.sessionId === reference.sessionId && last.snapshot.generation === reference.generation) return structuredClone(last.snapshot)
    throw serviceError('STALE_SESSION', 'PERMISSION_DENIED')
  }
  completion(owner: number, reference: ExerciseSessionReference): Promise<ExerciseSnapshot> {
    this.snapshot(owner, reference)
    return this.active?.completion ?? Promise.resolve(this.snapshot(owner, reference))
  }
  async stopSession(owner: number, value: ExerciseStopRequest): Promise<ExerciseSnapshot> {
    const request = validateExerciseStopRequest(value)
    if (!request.ok) throw serviceError('INVALID_REFERENCE', 'INVALID_INPUT')
    const reference = { sessionId: request.value.sessionId, generation: request.value.generation }
    const snapshot = this.snapshot(owner, reference) // Authorize before invalidating this generation.
    const op = this.active
    this.invalidate(owner, request.value.reason)
    return op ? this.cleanup(op, request.value.reason) : snapshot
  }
  invalidate(owner: number, reason: 'CONTEXT_CHANGED' | 'LEARNING_LEFT' | 'OWNER_LOST'): void {
    if (this.diagnosticReceipt?.owner === owner) { this.diagnosticReceipt.discard(); this.diagnosticReceipt = undefined }
    const entry = this.owners.get(owner)
    if (entry) entry.documentEpoch++ // Revoke idle Judge receipts too, including context/leave after slot release.
    if (this.last?.owner === owner) { this.retirePublicRunReceipt(owner); this.last = undefined; this.generation++ }
    const op = this.active
    if (!op || op.owner !== owner || op.invalidated) return
    op.invalidated = true; this.generation++
    if (op.kind === 'OFFICIAL') this.options.official?.registry.invalidate(op.ownerEntry, op.generation)
    void this.cleanup(op, reason).catch(() => {}) // Retained op is retried by managed stop/retryCleanup.
  }
  retryCleanup(): Promise<void> {
    const op = this.active
    return op ? this.cleanup(op).then(() => {}) : Promise.resolve()
  }
  beginShutdown(): void {
    if (this.sealed) return
    this.diagnosticReceipt?.discard(); this.diagnosticReceipt = undefined
    clearTimeout(this.publicReceiptTimer); this.publicReceiptTimer = undefined
    this.sealed = true; this.generation++; this.last = undefined
    if (this.active) {
      this.active.invalidated = true
      if (this.active.kind === 'OFFICIAL') this.options.official?.registry.invalidate(this.active.ownerEntry, this.active.generation)
      void this.cleanup(this.active, 'SHUTDOWN').catch(() => {})
    }
  }
  async stop(): Promise<void> {
    this.beginShutdown()
    if (this.started) await this.retryRecovery()
    const op = this.active
    if (op) {
      // Runtime12s and target storage15s/10s are separate caller joins.
      await waitForExerciseCleanup(this.settleRuntime(op, 'SHUTDOWN'), this.clock)
      this.finalizeRuntime(op)
      if (op.submit && op.runtimeSettled && this.active === op) await this.waitSubmission(op, this.continueSubmission(op), true)
    }
    if (this.active || [...this.recoveryEntries.values()].some(e => e.workspace.ownsLease)) throw serviceError('CLEANUP_PENDING')
    for (const entry of [...this.owners.values()]) entry.remove()
    this.stopped = true
  }
  status() {
    return { state: this.stopped ? 'STOPPED' : this.sealed ? 'STOPPING' : !this.started ? 'CREATED'
      : this.recoveryPending ? 'RECOVERING' : this.recoveryFailed ? 'RECOVERY_FAILED' : 'READY',
    generation: this.generation, active: this.active !== undefined, recoveryPending: this.recoveryPending,
    recovery: [...this.recoveryEntries].map(([sessionId, e]) => ({ sessionId, result: e.result ?? 'PENDING' })),
    orphanQuarantine: [...this.orphans], error: this.error ? structuredClone(this.error) : undefined }
  }
}

/** Main-only fixed-driver injection for controlled tests; never an IPC capability. */
export interface WindowsExerciseDriver {
  phases: ExerciseExecution['phases']
  plan(phase: ExerciseExecutionPhase): LearningProcessSpec | null
}
export function createWindowsExerciseService(root: string, options: {
  packages?: ExercisePackageRegistry
  driver?: (request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace) => WindowsExerciseDriver | undefined
  onCleanupError?: ExerciseServiceOptions['onCleanupError']
  onSnapshot?: ExerciseServiceOptions['onSnapshot']
  submissions?: ExerciseServiceOptions['submissions']
} = {}): ExerciseService {
  let native: LearningNativeBinding | undefined
  const binding = () => native ??= loadLearningNative()
  return new ExerciseService({ root, onCleanupError: options.onCleanupError, onSnapshot: options.onSnapshot, submissions: options.submissions,
    leases: { acquire: id => new WindowsExerciseLeaseProvider(root, binding()).acquire(id) },
    official: options.packages ? { registry: options.packages, createAdapter: (request, workspace, load) => request.language === 'csharp'
      ? createOfficialCsharpExecutionAdapter(request, workspace, binding(), load)
      : createOfficialJavascriptExecutionAdapter(request, workspace, binding(), load) } : undefined,
    createExecution: (request, workspace) => {
      if (!options.driver && options.packages) {
        if (!options.packages.has(request.exerciseId)) throw serviceError('INVALID_EXERCISE', 'INVALID_INPUT')
        if (request.language === 'javascript') {
          const plan = packageRunBinding<import('./runtime/javascript-execution-contracts').JavascriptExecutionAdapter>(options.packages, request.exerciseId,
            exercise => new WindowsJavascriptExecutionAdapter(request, workspace, binding(), undefined, [exercise], 4096))
          return { adapter: plan.adapter, phases: ['compile', 'execute'], releaseContent: plan.releaseContent, publicRunPackage: plan.publicRunPackage,
            orchestrate: (session, progress) => runJavascriptSamples(session, plan.adapter, progress),
            javascriptObservation: () => {
              if (!plan.available()) return undefined
              try { return { schema: plan.schema()!, result: plan.adapter.result() } }
              catch (error) { if (error instanceof DomainError && ['RESULT_PENDING', 'RESULT_INVALIDATED'].includes(String(error.details?.reason))) return undefined; throw error }
            } }
        }
        const plan = packageRunBinding<import('./runtime/csharp-execution-contracts').CsharpExecutionAdapter>(options.packages, request.exerciseId,
          exercise => new WindowsCsharpExecutionAdapter(request, workspace, binding(), undefined, [exercise], 4096))
        return { adapter: plan.adapter, phases: ['compile', 'execute'], releaseContent: plan.releaseContent, publicRunPackage: plan.publicRunPackage,
          orchestrate: (session, progress) => runCsharpSamples(session, plan.adapter, progress),
          observation: () => {
            if (!plan.available()) return undefined
            try { return { schema: plan.schema()!, result: plan.adapter.result() } }
            catch (error) { if (error instanceof DomainError && ['RESULT_PENDING', 'RESULT_INVALIDATED'].includes(String(error.details?.reason))) return undefined; throw error }
          } }
      }
      const driver = options.driver?.(request, workspace)
      if (!driver) throw serviceError('LANGUAGE_ADAPTER_UNAVAILABLE', 'UNSUPPORTED')
      return { phases: driver.phases, adapter: new WindowsExerciseRuntimeAdapter(binding(), phase => driver.plan(phase)) }
    } })
}
