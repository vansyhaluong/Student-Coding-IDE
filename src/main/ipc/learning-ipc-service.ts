import { LEARNING_CHANNELS, type LearningCourse } from '../../shared/contracts/learning'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'

export class LearningIpcService {
  readonly name = 'LearningIpcService'
  private remove?: () => void
  constructor(private readonly registry: IpcHandlerRegistry, private readonly getCourse: () => LearningCourse,
    private readonly authorize: (context: IpcRequestContext) => void) {}
  start(): void {
    this.remove = this.registry.register({ channel: LEARNING_CHANNELS.getCourse, validate: validateEmptyObject,
      handle: (_, context) => { this.authorize(context); return this.getCourse() } })
  }
  stop(): void { this.remove?.(); this.remove = undefined }
}
