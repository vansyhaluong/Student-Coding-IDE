import { EXERCISE_CHANNELS, type ExerciseSnapshot } from '../../shared/contracts/exercise'
import { validateExerciseRunRequest, validateExerciseSessionReference, validateExerciseSnapshot, validateExerciseStopRequest } from '../../shared/contracts/exercise-validation'
import { DomainError, serializeAppError } from '../errors/app-error'
import type { ExerciseOwner, ExerciseService } from '../services/learning/exercise-service'
import type { IpcHandlerRegistry, IpcRequestContext, IpcSenderFrame } from './ipc-handler-registry'

interface Publication { context: IpcRequestContext; epoch: object; sessionId: string; generation: number; sequence: number }
function sameFrame(a: IpcSenderFrame | null | undefined, b: IpcSenderFrame | null | undefined): boolean {
  return !!a && !!b && a.processId === b.processId && a.frameToken === b.frameToken
}
/** Learning-only channels. The injected authorizer must verify the current app main frame. */
export class ExerciseIpcService {
  readonly name = 'ExerciseIpcService'
  private removers: (() => void)[] = []
  private publication?: Publication // One global operation, bounded retained routing state.
  private readonly owners = new Map<number, { owner: ExerciseOwner; epoch: object; remove(): void }>()
  private sealed = false
  constructor(private readonly registry: IpcHandlerRegistry, private readonly service: ExerciseService,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly send: (context: IpcRequestContext, snapshot: ExerciseSnapshot) => void) {}
  observe(owner: ExerciseOwner): void {
    if (this.sealed || owner.isDestroyed() || this.owners.has(owner.id)) return
    const invalidate = () => {
      entry.epoch = {}
      if (this.publication?.context.senderId === owner.id) this.publication = undefined
    }
    const navigate = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) invalidate() }
    const destroyed = () => { invalidate(); entry.remove() }
    const entry = { owner, epoch: {}, remove: () => {
      owner.removeListener('did-start-navigation', navigate); owner.removeListener('render-process-gone', invalidate)
      owner.removeListener('destroyed', destroyed); this.owners.delete(owner.id)
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
  }
  private assertContext(context: IpcRequestContext): void {
    if (this.sealed) throw new DomainError({ code: 'PROCESS_CANCELLED', message: 'Learning admission is closed.', retryable: false })
    this.authorize(context)
    const owner = this.owners.get(context.senderId)
    if (!owner || owner.owner.isDestroyed() || !context.senderFrame || context.senderFrame.detached || context.senderFrame.isDestroyed()) {
      throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Learning owner is unavailable.', retryable: false })
    }
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
  beginShutdown(): void { this.sealed = true; this.publication = undefined }
  stop(): void {
    this.beginShutdown(); for (const remove of this.removers.splice(0)) remove()
    for (const entry of [...this.owners.values()]) entry.remove()
  }
}
