import { SETTINGS_CHANNELS, validateSettings, isSettingsSnapshot, isDependencyGuidance, type SettingsApi } from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
export function createSettingsBridge(ipc: IpcRendererLike): SettingsApi {
  return {
    get: async () => parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.get, {}), isSettingsSnapshot, SETTINGS_CHANNELS.get),
    update: async value => {
      const valid = validateSettings(value)
      if (!valid.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid settings.', retryable: false } }
      return parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.update, valid.value), isSettingsSnapshot, SETTINGS_CHANNELS.update)
    },
    dependencies: async () => parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.dependencies, {}), isDependencyGuidance, SETTINGS_CHANNELS.dependencies),
  }
}
