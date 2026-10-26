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
    private readonly submissions?: SubmissionIpcPorts) {}
  observe(owner: ExerciseOwner): void {
    if (this.sealed || owner.isDestroyed() || this.owners.has(owner.id)) return
    const invalidate = () => {
      if (this.owners.get(owner.id) !== entry) return
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
        this.service.invalidate(context.senderId, request.reason)
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
  beginShutdown(): void { this.sealed = true; this.publication = undefined; this.submitRoute = undefined }
  stop(): void {
    this.beginShutdown(); for (const remove of this.removers.splice(0)) remove()
    for (const entry of [...this.owners.values()]) entry.remove()
  }
}
