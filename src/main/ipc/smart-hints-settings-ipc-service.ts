import { SMART_HINT_SETTINGS_CHANNELS as H, validateSmartHintsEnable, validateSmartHintsBudget } from '../../shared/contracts/smart-hints-settings'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'
import type { SmartHintsConfiguration } from '../services/learning/smart-hints/configuration'

export class SmartHintsSettingsIpcService {
  readonly name = 'SmartHintsSettingsIpcService'
  private removers: Array<() => void> = []
  constructor(private readonly registry: IpcHandlerRegistry, private readonly configuration: SmartHintsConfiguration,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly observeOwner: (context: IpcRequestContext, cancel: () => void) => () => void,
    private readonly requestKey: (context: IpcRequestContext, signal: AbortSignal) => Promise<string | null>) {}
  private async boundary<T>(context: IpcRequestContext, action: (check: () => void) => Promise<T>): Promise<T> {
    this.authorize(context)
    const remove = this.observeOwner(context, () => this.configuration.cancel())
    try { const result = await action(() => this.authorize(context)); this.authorize(context); return result } finally { remove() }
  }
  start(): void {
    this.removers.push(
      this.registry.register({ channel: H.get, validate: validateEmptyObject, handle: (_, c) => { this.authorize(c); return this.configuration.snapshot() } }),
      this.registry.register({ channel: H.enable, validate: validateSmartHintsEnable, handle: (v, c) => this.boundary(c, check => this.configuration.enable(v.enabled, check)) }),
      this.registry.register({ channel: H.key, validate: validateEmptyObject, handle: (_, c) => this.boundary(c, check => this.configuration.configureKey(check, signal => this.requestKey(c, signal))) }),
      this.registry.register({ channel: H.removeKey, validate: validateEmptyObject, handle: (_, c) => this.boundary(c, check => this.configuration.removeKey(check)) }),
      this.registry.register({ channel: H.check, validate: validateEmptyObject, handle: (_, c) => this.boundary(c, check => this.configuration.checkConnection(check)) }),
      this.registry.register({ channel: H.budget, validate: validateSmartHintsBudget, handle: (v, c) => this.boundary(c, check => this.configuration.budget(v.dailyLimit, check)) }),
    )
  }
  stop(): void { this.configuration.cancel(); for (const remove of this.removers.splice(0)) remove() }
}
