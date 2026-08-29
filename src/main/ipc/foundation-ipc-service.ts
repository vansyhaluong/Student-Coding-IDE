import {
  LIFECYCLE_CHANNELS,
  type LifecycleStatus,
  validateGetLifecycleStatusRequest,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export class FoundationIpcService implements ManagedService {
  readonly name = 'FoundationIpcService'
  private removeHandler: (() => void) | undefined

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly getStatus: () => LifecycleStatus,
  ) {}

  start(): void {
    this.removeHandler = this.registry.register({
      channel: LIFECYCLE_CHANNELS.getStatus,
      validate: validateGetLifecycleStatusRequest,
      handle: () => this.getStatus(),
    })
  }

  stop(): void {
    this.removeHandler?.()
    this.removeHandler = undefined
  }
}
