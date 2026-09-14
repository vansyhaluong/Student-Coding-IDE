import { SETTINGS_CHANNELS, validateSettings, validateEmptyObject, type DependencyGuidance } from '../../shared/contracts'
import type { SettingsService } from '../services/settings/settings-service'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'
export class SettingsIpcService {
  readonly name = 'SettingsIpcService'
  private removers: Array<() => void> = []
  constructor(private readonly registry: IpcHandlerRegistry, private readonly settings: SettingsService,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly dependencies: () => Promise<DependencyGuidance>) {}
  start() {
    this.removers.push(
      this.registry.register({ channel: SETTINGS_CHANNELS.get, validate: validateEmptyObject, handle: (_, c) => { this.authorize(c); return this.settings.get() } }),
      this.registry.register({ channel: SETTINGS_CHANNELS.update, validate: validateSettings, handle: (s, c) => { this.authorize(c); return this.settings.update(s) } }),
      this.registry.register({ channel: SETTINGS_CHANNELS.dependencies, validate: validateEmptyObject, handle: async (_, c) => { this.authorize(c); const value = await this.dependencies(); this.authorize(c); return value } }),
    )
  }
  stop() { for (const remove of this.removers.splice(0)) remove() }
}
