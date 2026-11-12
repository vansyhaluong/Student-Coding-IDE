import { EXERCISE_CHANNELS, type ExerciseSnapshot } from '../../shared/contracts/exercise'
import { validateExerciseRunRequest, validateExerciseSessionReference, validateExerciseSnapshot, validateExerciseStopRequest } from '../../shared/contracts/exercise-validation'
import { DomainError, serializeAppError } from '../errors/app-error'
import type { ExerciseOwner, ExerciseService } from '../services/learning/exercise-service'
import type { SubmissionOperationHandle } from '../services/learning/exercise-service'
import { randomUUID } from 'node:crypto'
import { SUBMISSION_CHANNELS as S, type SubmissionReference, type SubmissionStatus } from '../../shared/contracts/submission'
import { validateSubmitRequest, validateSubmissionReference, validateSubmissionEmpty, validateSubmissionHistoryRequest,
  validateSubmissionCompletionRequest, validateSubmissionSourceRequest, validateSubmissionContext, isSubmissionStatus } from '../../shared/contracts/submission-validation'
import { SubmissionProjection } from '../services/learning/submission-projection'
import type { LearningStore } from '../services/learning/learning-store'
import { SubmissionReadModel } from '../services/learning/storage/submission-read-model'
import type { IpcHandlerRegistry, IpcRequestContext, IpcSenderFrame } from './ipc-handler-registry'
import { ANALYSIS_CHANNELS as A } from '../../shared/contracts/analysis'
import { validateAnalysisPrepare, validateAnalysisStart, validateAnalysisReference, isAnalysisStatus } from '../../shared/contracts/analysis-validation'
import type { SubmissionAnalysisService } from '../services/learning/analysis/service'
import type { SavedAnalysisCapture, AnalysisSubmissionBinding } from '../services/learning/analysis/capture'
import { SMART_HINT_CHANNELS as H } from '../../shared/contracts/smart-hints'
import { validatePrepareHintApply, isHintApplyProposal, validateConsumeHintApply, validateDiscardHintApply, isHintApplyFailure } from '../../shared/contracts/smart-hints-validation'
import { validateSmartPrepare, validateSmartReference, validateSmartStart, validateSmartRetire, validateSmartConsentReference, isSmartStatus, isSmartCapabilities } from '../../shared/contracts/smart-hints-validation'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { SmartHintsService } from '../services/learning/smart-hints/service'
import type { SmartCapture } from '../services/learning/smart-hints/capture'
import type { SmartPrepare, SmartReference, PrepareHintApply } from '../../shared/contracts/smart-hints'
import type { PublicRunReceipt } from '../services/learning/smart-hints/public-run-receipt'

export interface SmartHintsIpcPorts {
  service: SmartHintsService
  capture(request: SmartPrepare, generation: number, check: () => void, receipt?: PublicRunReceipt): Promise<SmartCapture>
}

/** Synchronous IPC dispatch: do not erase an already committed Hint when its
 * Cancel races the renderer's status poll. SH-1 and progression stay unchanged. */
export function cancelSmartHintsOperation(service: Pick<SmartHintsService, 'status' | 'cancel'>, owner: number, scope: string, request: SmartReference) {
  const status = service.status(owner, scope, request)
  return status.state === 'COMPLETE' && status.binding.action.kind === 'HINT' ? status : service.cancel(owner, scope, request)
}

export interface AnalysisIpcPorts {
  service: SubmissionAnalysisService
  capture(binding: AnalysisSubmissionBinding, check: () => void): Promise<SavedAnalysisCapture>
}

interface Publication { context: IpcRequestContext; epoch: object; sessionId: string; generation: number; sequence: number }
interface ReadStamp { entry: object; epoch: object; serviceEntry: object; serviceEpoch: number; scope: string }
interface SubmitRoute { context: IpcRequestContext; stamp: ReadStamp; handle: SubmissionOperationHandle;
  signature?: string; sequence: number; last?: SubmissionStatus }
export interface SubmissionIpcPorts { store(): Pick<LearningStore, 'history' | 'completion' | 'source'>;
  send(context: IpcRequestContext, status: SubmissionStatus): void }
function sameFrame(a: IpcSenderFrame | null | undefined, b: IpcSenderFrame | null | undefined): boolean {
  return !!a && !!b && a.processId === b.processId && a.frameToken === b.frameToken
}
/** Learning-only channels. The injected authorizer must verify the current app main frame. */
export class ExerciseIpcService {
  readonly name = 'ExerciseIpcService'
  private removers: (() => void)[] = []
  private publication?: Publication // One global operation, bounded retained routing state.
  private readonly owners = new Map<number, { owner: ExerciseOwner; epoch: object; scope: string; frame?: IpcSenderFrame; remove(): void }>()
  private submitRoute?: SubmitRoute
  private readonly projection = new SubmissionProjection()
  private sealed = false
  constructor(private readonly registry: IpcHandlerRegistry, private readonly service: ExerciseService,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly send: (context: IpcRequestContext, snapshot: ExerciseSnapshot) => void,
    private readonly submissions?: SubmissionIpcPorts,
    private readonly analysis?: AnalysisIpcPorts,
    private readonly smartHints?: SmartHintsIpcPorts,
    private readonly invalidateChat?: (owner: number) => void) {}
  observe(owner: ExerciseOwner): void {
    if (this.sealed || owner.isDestroyed() || this.owners.has(owner.id)) return
    const invalidate = () => {
      if (this.owners.get(owner.id) !== entry) return
      this.analysis?.service.invalidate(owner.id)
      this.smartHints?.service.invalidate(owner.id)
      entry.epoch = {}
      entry.scope = randomUUID()
      if (this.publication?.context.senderId === owner.id) this.publication = undefined
      if (this.submitRoute?.context.senderId === owner.id) this.submitRoute = undefined
    }
    const navigate = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) invalidate() }
    const destroyed = () => { invalidate(); entry.remove() }
    const entry = { owner, epoch: {}, scope: randomUUID(), remove: () => {
      owner.removeListener('did-start-navigation', navigate); owner.removeListener('render-process-gone', invalidate)
      owner.removeListener('destroyed', destroyed); if (this.owners.get(owner.id) === entry) this.owners.delete(owner.id)
    } }
    this.owners.set(owner.id, entry)
    owner.on('did-start-navigation', navigate); owner.on('render-process-gone', invalidate); owner.on('destroyed', destroyed)
  }
  start(): void {
    this.removers = [
      this.registry.register({ channel: EXERCISE_CHANNELS.run, validate: validateExerciseRunRequest,
        handle: (request, context) => this.boundary(EXERCISE_CHANNELS.run, context, () => {
          this.assertContext(context)
          const snapshot = this.safeSnapshot(this.service.run(context.senderId, request))
          this.submitRoute = undefined
          this.publication = { context, epoch: this.owners.get(context.senderId)!.epoch,
            sessionId: snapshot.sessionId, generation: snapshot.generation, sequence: snapshot.sequence }
          return snapshot
        }) }),
      this.registry.register({ channel: EXERCISE_CHANNELS.snapshot, validate: validateExerciseSessionReference,
        handle: (request, context) => this.boundary(EXERCISE_CHANNELS.snapshot, context, () => {
          this.assertContext(context)
          return this.safeSnapshot(this.service.snapshot(context.senderId, request))
        }) }),
      this.registry.register({ channel: EXERCISE_CHANNELS.stop, validate: validateExerciseStopRequest,
        handle: (request, context) => this.boundary(EXERCISE_CHANNELS.stop, context, async () => {
          this.assertContext(context)
          const result = await this.service.stopSession(context.senderId, request)
          this.assertContext(context) // Never deliver an awaited result into a replacement document.
          return this.safeSnapshot(result)
        }) }),
    ]
    if (this.submissions) this.startSubmission()
    if (this.analysis) this.startAnalysis()
    if (this.smartHints) this.startSmartHints()
  }
  /** Document authority only: SH source edits never invalidate Run/Submit/D2 generations. */
  private async smartBoundary<T>(context: IpcRequestContext, action: (scope: string, check: () => void) => T | Promise<T>, hintPreparation?: PrepareHintApply): Promise<T> {
    let verify: (() => void) | undefined
    try {
      this.assertContext(context)
      const entry = this.owners.get(context.senderId)!, epoch = entry.epoch, frame = context.senderFrame
      const check = () => {
        this.assertContext(context)
        if (this.owners.get(context.senderId) !== entry || entry.epoch !== epoch || !sameFrame(frame, entry.frame)) throw this.denied()
      }
      verify = check
      const value = await action(entry.scope, check)
      check(); return value
    } catch (error) {
      // Preserve only the strict fixed-field Hint failure, after rechecking the
      // same document epoch/frame. Other domains keep their existing redaction.
      if (hintPreparation && error instanceof DomainError && isHintApplyFailure(error, hintPreparation)) {
        let current = false
        try { verify?.(); current = !!verify } catch { /* Retired document. */ }
        if (current) throw new DomainError({ code: error.code, operation: 'prepareHintApply', message: 'Hint Apply preparation rejected.',
          retryable: error.retryable, details: structuredClone(error.details) })
      }
      throw new DomainError({ code: 'INVALID_INPUT', operation: 'smart-hints', message: 'The Smart Hints request could not be completed.', retryable: false })
    }
  }
  private startSmartHints(): void {
    const ports = this.smartHints!, safe = (value: unknown) => { if (!isSmartStatus(value)) throw this.denied(); return value }
    this.removers.push(
      this.registry.register({ channel: H.revokeConsent, validate: validateSmartConsentReference,
        handle: (request, context) => this.smartBoundary(context, scope => { ports.service.revokeConsent(context.senderId, scope, request); return null }) }),
      this.registry.register({ channel: H.consumeHintApply, validate: validateConsumeHintApply,
        handle: (request, context) => this.smartBoundary(context, scope => ports.service.consumePreparedHintApply(context.senderId, scope, request,
          (q, generation, check) => ports.capture(q, generation, check)).then(proposal => {
          if (!isHintApplyProposal(proposal)) throw this.denied()
          return proposal
        })) }),
      this.registry.register({ channel: H.discardHintApply, validate: validateDiscardHintApply,
        handle: (request, context) => this.smartBoundary(context, scope => { ports.service.discardHintApply(context.senderId, scope, request); return null }) }),
      this.registry.register({ channel: H.prepareHintApply, validate: validatePrepareHintApply,
        handle: (request, context) => this.smartBoundary(context, scope => ports.service.prepareHintApply(context.senderId, scope, request,
          (q, generation, check) => ports.capture(q, generation, check)).then(proposal => {
          if (!isHintApplyProposal(proposal)) throw this.denied()
          return proposal
        }), request) }),
      this.registry.register({ channel: H.capabilities, validate: validateEmptyObject,
        handle: (_, context) => this.smartBoundary(context, async () => {
          const value = await ports.service.probeCapabilities()
          if (!isSmartCapabilities(value)) throw this.denied()
          return value
        }) }),
      this.registry.register({ channel: H.prepare, validate: validateSmartPrepare,
        handle: (request, context) => this.smartBoundary(context, (scope, check) => {
          let receipt: PublicRunReceipt | undefined
          if (request.run) { try { receipt = this.service.publicRunReceipt(context.senderId, request.run) } catch { /* CODE_ONLY */ } }
          return ports.service.prepare(context.senderId, scope, request, check,
            (generation, guard) => ports.capture(request, generation, guard, receipt)).then(safe)
        }) }),
      this.registry.register({ channel: H.start, validate: validateSmartStart,
        handle: (request, context) => this.smartBoundary(context, scope => safe(ports.service.start(context.senderId, scope, request))) }),
      this.registry.register({ channel: H.status, validate: validateSmartReference,
        handle: (request, context) => this.smartBoundary(context, scope => safe(ports.service.status(context.senderId, scope, request))) }),
      this.registry.register({ channel: H.cancel, validate: validateSmartReference,
        handle: (request, context) => this.smartBoundary(context, scope => safe(cancelSmartHintsOperation(ports.service, context.senderId, scope, request))) }),
      this.registry.register({ channel: H.retireContext, validate: validateSmartRetire,
        handle: (request, context) => this.smartBoundary(context, scope => {
          if (ports.service.retireContext(context.senderId, scope, request)) this.service.retirePublicRunReceipt(context.senderId)
          return null
        }) }),
    )
  }
  private startAnalysis(): void {
    const service = this.analysis!.service
    const safe = (value: unknown) => { if (!isAnalysisStatus(value)) throw this.denied(); return value }
    this.removers.push(
      this.registry.register({ channel: A.prepare, validate: validateAnalysisPrepare,
        handle: (request, context) => this.submissionBoundary(A.prepare, context, scope => {
          const stamp = this.stamp(context), binding = this.projection.analysisBinding(request.sourceReference, scope)
          // History reissues encrypted tokens; deduplicate by their authenticated identity.
          const identity = JSON.stringify([binding.key.storeKind, binding.key.recordId, binding.submissionId,
            binding.sourceHash, binding.sourceRevision, binding.exerciseId, binding.language, binding.packageVersion])
          return safe(service.prepare(context.senderId, scope, { requestId: request.requestId, sourceReference: identity }, () => this.checkStamp(context, stamp),
            check => this.analysis!.capture(binding, check)))
        }) }),
      this.registry.register({ channel: A.start, validate: validateAnalysisStart,
        handle: (request, context) => this.submissionBoundary(A.start, context,
          scope => safe(service.start(context.senderId, scope, request))) }),
      this.registry.register({ channel: A.status, validate: validateAnalysisReference,
        handle: (request, context) => this.submissionBoundary(A.status, context,
          scope => safe(service.status(context.senderId, scope, request.requestId))) }),
      this.registry.register({ channel: A.cancel, validate: validateAnalysisReference,
        handle: (request, context) => this.submissionBoundary(A.cancel, context,
          scope => safe(service.cancel(context.senderId, scope, request.requestId))) }),
    )
  }
  private startSubmission(): void {
    this.removers.push(
      this.registry.register({ channel: S.submit, validate: validateSubmitRequest, handle: (request, context) => this.submissionBoundary(S.submit, context, () => {
        const handle = this.service.submit(context.senderId, request), route: SubmitRoute = {
          context, stamp: this.stamp(context), handle, sequence: -1 }
        this.publication = undefined; this.submitRoute = route
        const status = this.projectStatus(route)
        void handle.completion().then(() => this.publishSubmission(route), () => {})
        return status
      }) }),
      this.registry.register({ channel: S.status, validate: validateSubmissionReference, handle: (reference, context) => this.submissionBoundary(S.status, context,
        () => { const route = this.authorizedSubmit(context, reference); this.publishSubmission(route); return this.projectStatus(route) }) }),
      this.registry.register({ channel: S.current, validate: validateSubmissionEmpty, handle: (_, context) => this.submissionBoundary(S.current, context, () => {
        if (!this.submitRoute || this.submitRoute.context.senderId !== context.senderId) return null
        const route = this.authorizedSubmit(context)
        this.publishSubmission(route); return this.projectStatus(route)
      }) }),
      this.registry.register({ channel: S.retry, validate: validateSubmissionReference, handle: (reference, context) => this.submissionBoundary(S.retry, context, async () => {
        const route = this.authorizedSubmit(context, reference)
        await route.handle.retry(); this.authorizedSubmit(context, reference)
        this.publishSubmission(route); return this.projectStatus(route)
      }) }),
      this.registry.register({ channel: S.history, validate: validateSubmissionHistoryRequest, handle: (request, context) => this.submissionBoundary(S.history, context, async scope => {
        const privateRequest = { ...request, ...(request.cursor ? { cursor: this.projection.cursor(request.cursor, scope) } : {}) }
        return this.projection.history(await this.committedStore().history(privateRequest), scope)
      }) }),
      this.registry.register({ channel: S.completion, validate: validateSubmissionCompletionRequest, handle: (request, context) => this.submissionBoundary(S.completion, context,
        async () => this.projection.completion(await this.committedStore().completion(request.exerciseId))) }),
      this.registry.register({ channel: S.source, validate: validateSubmissionSourceRequest, handle: (request, context) => this.submissionBoundary(S.source, context,
        async scope => {
          const binding = this.projection.sourceBinding(request.reference, scope, request.offset, request.limit)
          return this.projection.source(await this.committedStore().source(binding), request.reference, binding)
        }) }),
      this.registry.register({ channel: S.context, validate: validateSubmissionContext, handle: (request, context) => this.submissionBoundary(S.context, context, () => {
        this.invalidateChat?.(context.senderId)
        this.service.invalidate(context.senderId, request.reason)
        this.analysis?.service.invalidate(context.senderId)
        const entry = this.owners.get(context.senderId)!; entry.epoch = {}; entry.scope = randomUUID()
        if (this.publication?.context.senderId === context.senderId) this.publication = undefined
        if (this.submitRoute?.context.senderId === context.senderId) this.submitRoute = undefined
        return null
      }, true) }),
    )
  }
  private committedStore(): Pick<LearningStore, 'history' | 'completion' | 'source'> {
    try { return this.submissions!.store() }
    catch {
      // No initialized filesystem façade is still unavailable evidence, never empty.
      // Reuse S4's unavailable projection; this grants no read/write authority.
      const unknown = SubmissionReadModel.unavailable()
      return { history: async request => unknown.history(request), completion: async id => unknown.completion(id),
        source: async request => unknown.source(request) }
    }
  }
  private denied(): DomainError { return new DomainError({ code: 'PERMISSION_DENIED', message: 'Submission observation is no longer authorized.', retryable: false }) }
  private stamp(context: IpcRequestContext): ReadStamp {
    this.assertContext(context)
    const entry = this.owners.get(context.senderId)!, current = this.service.contextStamp(context.senderId)
    return { entry, epoch: entry.epoch, serviceEntry: current.entry, serviceEpoch: current.epoch, scope: `${entry.scope}:${current.epoch}` }
  }
  private checkStamp(context: IpcRequestContext, stamp: ReadStamp): void {
    const current = this.stamp(context)
    if (current.entry !== stamp.entry || current.epoch !== stamp.epoch || current.serviceEntry !== stamp.serviceEntry
      || current.serviceEpoch !== stamp.serviceEpoch) throw this.denied()
  }
  private authorizedSubmit(context: IpcRequestContext, reference?: SubmissionReference): SubmitRoute {
    const route = this.submitRoute
    if (!route || route.context.senderId !== context.senderId || !sameFrame(route.context.senderFrame, context.senderFrame)) throw this.denied()
    this.checkStamp(context, route.stamp)
    if (reference && (reference.sessionId !== route.handle.reference.sessionId || reference.generation !== route.handle.reference.generation
      || reference.submissionId !== route.handle.submissionId)) throw this.denied()
    route.handle.status() // Checks current service generation and live owner, including idle receipts.
    return route
  }
  private projectStatus(route: SubmitRoute): SubmissionStatus {
    const projected = this.projection.status(route.handle.status(), 0)
    if (projected.reference.sessionId !== route.handle.reference.sessionId || projected.reference.generation !== route.handle.reference.generation
      || projected.reference.submissionId !== route.handle.submissionId) throw this.denied()
    const signature = JSON.stringify(projected)
    if (signature !== route.signature) { route.sequence++; route.signature = signature }
    const status = { ...projected, sequence: route.sequence }
    if (!isSubmissionStatus(status)) throw this.denied()
    route.last = status; return structuredClone(status)
  }
  private publishSubmission(route: SubmitRoute): void {
    if (this.sealed || this.submitRoute !== route) return
    try {
      this.authorizedSubmit(route.context)
      const before = route.last?.sequence ?? -1, status = this.projectStatus(route)
      if (status.sequence > before) this.submissions!.send(route.context, structuredClone(status))
    } catch { if (this.submitRoute === route) this.submitRoute = undefined }
  }
  private async submissionBoundary<T>(operation: string, context: IpcRequestContext,
    action: (scope: string) => T | Promise<T>, changesContext = false): Promise<T> {
    try {
      const original = this.stamp(context), pending = action(original.scope)
      const expected = changesContext ? this.stamp(context) : original
      const result = await pending
      this.checkStamp(context, expected)
      if (isSubmissionStatus(result)) this.authorizedSubmit(context, result.reference)
      return result
    } catch (error) {
      const safe = serializeAppError(error)
      throw new DomainError({ code: safe.code, operation, retryable: operation === S.submit ? false : safe.retryable,
        message: 'The submission request could not be completed.' })
    }
  }
  private assertContext(context: IpcRequestContext): void {
    if (this.sealed) throw new DomainError({ code: 'PROCESS_CANCELLED', message: 'Learning admission is closed.', retryable: false })
    this.authorize(context)
    const owner = this.owners.get(context.senderId)
    if (!owner || owner.owner.isDestroyed() || !context.senderFrame || context.senderFrame.detached || context.senderFrame.isDestroyed()) {
      throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Learning owner is unavailable.', retryable: false })
    }
    if (owner.frame && !sameFrame(owner.frame, context.senderFrame)) {
      this.analysis?.service.invalidate(context.senderId)
      this.smartHints?.service.invalidate(context.senderId)
      owner.epoch = {}; owner.scope = randomUUID()
      if (this.publication?.context.senderId === context.senderId) this.publication = undefined
      if (this.submitRoute?.context.senderId === context.senderId) this.submitRoute = undefined
      this.service.invalidate(context.senderId, 'CONTEXT_CHANGED')
    }
    owner.frame = context.senderFrame
    const route = this.publication
    if (route?.context.senderId === context.senderId && !sameFrame(route.context.senderFrame, context.senderFrame)) {
      this.publication = undefined
    }
  }
  private safeSnapshot(value: unknown): ExerciseSnapshot {
    const result = validateExerciseSnapshot(value)
    if (!result.ok) throw new Error('Invalid Learning snapshot')
    return result.value
  }
  private async boundary(operation: string, context: IpcRequestContext,
    action: () => ExerciseSnapshot | Promise<ExerciseSnapshot>): Promise<ExerciseSnapshot> {
    try {
      this.assertContext(context)
      const epoch = this.owners.get(context.senderId)!.epoch
      const result = await action()
      this.assertContext(context)
      if (this.owners.get(context.senderId)!.epoch !== epoch) {
        throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Learning document changed.', retryable: false })
      }
      if (operation !== EXERCISE_CHANNELS.stop) {
        this.service.snapshot(context.senderId, { sessionId: result.sessionId, generation: result.generation })
      }
      return result
    } catch (error) {
      const safe = serializeAppError(error)
      // Domain/native diagnostics stay in Main. Even a DomainError may contain a path.
      throw new DomainError({ code: safe.code, operation, retryable: safe.retryable,
        message: safe.code === 'UNSUPPORTED' ? 'The Learning language backend is not available.'
          : safe.code === 'PERMISSION_DENIED' ? 'The Learning session is no longer authorized.'
            : 'The Learning request could not be completed.' })
    }
  }
  publish(owner: number, value: ExerciseSnapshot): void {
    const route = this.publication
    if (!route || owner !== route.context.senderId || this.sealed) return
    try {
      this.assertContext(route.context)
      if (this.owners.get(owner)!.epoch !== route.epoch) { this.publication = undefined; return }
      const snapshot = this.safeSnapshot(value)
      if (snapshot.sessionId !== route.sessionId || snapshot.generation !== route.generation || snapshot.sequence <= route.sequence) return
      const current = this.service.snapshot(owner, { sessionId: snapshot.sessionId, generation: snapshot.generation })
      if (current.sequence !== snapshot.sequence || current.exerciseId !== snapshot.exerciseId
        || current.language !== snapshot.language || current.sourceRevision !== snapshot.sourceRevision) return
      route.sequence = snapshot.sequence
      this.send(route.context, snapshot)
    } catch { this.publication = undefined /* Owner loss/stale/invalid result revokes routing, never broadcasts. */ }
  }
  beginShutdown(): void { this.sealed = true; this.publication = undefined; this.submitRoute = undefined; this.analysis?.service.beginShutdown(); this.smartHints?.service.beginShutdown() }
  async stop(): Promise<void> {
    this.beginShutdown(); for (const remove of this.removers.splice(0)) remove()
    for (const entry of [...this.owners.values()]) entry.remove()
    await this.analysis?.service.stop()
    await this.smartHints?.service.stop()
  }
}
