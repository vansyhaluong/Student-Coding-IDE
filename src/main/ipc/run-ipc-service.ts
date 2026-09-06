import { RUN_CHANNELS, validateStartRunRequest, validateStopRunRequest,
  type StartRunRequest, type RunSession, type RunSessionId } from '../../shared/contracts/run'
import type { ManagedService } from '../app/desktop-application'
import { IpcHandlerRegistry } from './ipc-handler-registry'

/** Semantic execution port; ownership observation remains Main-only. */
export interface RunCommands {
  startRun(request: StartRunRequest, ownerId: number): Promise<RunSession>
  stopRun(sessionId: RunSessionId, ownerId: number): Promise<void>
}
export class RunIpcService implements ManagedService {
  readonly name = 'RunIpcService'
  private readonly cleanup: (() => void)[] = []
  constructor(private readonly registry: IpcHandlerRegistry, private readonly run: RunCommands,
    private readonly observeOwner: (ownerId: number) => void = () => {}) {}
  start(): void {
    this.cleanup.push(this.registry.register({ channel: RUN_CHANNELS.start,
      validate: validateStartRunRequest,
      handle: (request, context) => {
        this.observeOwner(context.senderId)
        return this.run.startRun(request, context.senderId)
      } }))
    this.cleanup.push(this.registry.register({ channel: RUN_CHANNELS.stop,
      validate: validateStopRunRequest,
      handle: async (request, context) => {
        await this.run.stopRun(request.sessionId, context.senderId)
        return null
      } }))
  }
  stop(): void { for (const remove of this.cleanup.splice(0).reverse()) remove() }
}
