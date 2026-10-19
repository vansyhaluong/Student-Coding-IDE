import { randomUUID } from 'node:crypto'
import { PRACTICE_CHANNELS, validateCloseResolution, validateExerciseDraft, type PracticeState } from '../../shared/contracts/practice'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { PersistenceService } from '../services/persistence/persistence-service'
import { savePracticeDraft } from '../services/learning/practice-store'
import { exercises } from '../services/learning/content/exercises'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'
import { DomainError } from '../errors/app-error'

export class PracticeIpcService {
  readonly name = 'PracticeIpcService'
  private removers: (() => void)[] = []
  private closing?: { owner: number; token: string; resolve: (saved: boolean) => void }
  constructor(private readonly registry: IpcHandlerRegistry, private readonly store: PersistenceService<PracticeState>,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly publish: (owner: number, channel: string, payload: unknown) => void) {}
  start(): void {
    this.removers = [
      this.registry.register({ channel: PRACTICE_CHANNELS.load, validate: validateEmptyObject,
        handle: (_, context) => { this.authorize(context); return { exercises, state: this.store.getValue(), recovered: this.store.recovered } } }),
      this.registry.register({ channel: PRACTICE_CHANNELS.save, validate: validateExerciseDraft,
        handle: async (draft, context) => {
          this.authorize(context)
          if (!exercises.some(e => e.id === draft.exerciseId)) throw new DomainError({ code: 'INVALID_INPUT', message: 'Unknown exercise.', retryable: false })
          await savePracticeDraft(this.store, draft)
          return null
        } }),
      this.registry.register({ channel: PRACTICE_CHANNELS.resolveClose, validate: validateCloseResolution,
        handle: (request, context) => {
          this.authorize(context)
          if (!this.closing || this.closing.owner !== context.senderId || this.closing.token !== request.token) {
            throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Close request is no longer active.', retryable: false })
          }
          this.closing.resolve(request.saved); return null
        } }),
    ]
  }
  async prepareClose(owner: number): Promise<boolean> {
    if (this.closing) return false
    const token = randomUUID()
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => finish(false), 15000)
      const finish = (saved: boolean) => {
        clearTimeout(timer); this.closing = undefined
        if (!saved) this.resume(owner)
        resolve(saved)
      }
      this.closing = { owner, token, resolve: finish }
      this.publish(owner, PRACTICE_CHANNELS.prepareClose, { token })
    })
  }
  resume(owner: number): void { this.publish(owner, PRACTICE_CHANNELS.resume, {}) }
  stop(): void {
    this.closing?.resolve(false)
    for (const remove of this.removers.splice(0)) remove()
  }
}
