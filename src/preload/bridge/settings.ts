import { SETTINGS_CHANNELS, validateSettings, isSettingsSnapshot, isDependencyGuidance, type SettingsApi } from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { SMART_HINT_SETTINGS_CHANNELS as H, isSmartHintsSettingsSnapshot, validateSmartHintsEnable, validateSmartHintsBudget } from '../../shared/contracts/smart-hints-settings'
export function createSettingsBridge(ipc: IpcRendererLike): SettingsApi {
  return {
    smartHints: {
      get: async () => parseAppResult(await invokeSafely(ipc, H.get, {}), isSmartHintsSettingsSnapshot, H.get),
      configureKey: async () => parseAppResult(await invokeSafely(ipc, H.key, {}), isSmartHintsSettingsSnapshot, H.key),
      removeKey: async () => parseAppResult(await invokeSafely(ipc, H.removeKey, {}), isSmartHintsSettingsSnapshot, H.removeKey),
      check: async () => parseAppResult(await invokeSafely(ipc, H.check, {}), isSmartHintsSettingsSnapshot, H.check),
      enable: async value => {
        const r = validateSmartHintsEnable(value)
        if (!r.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid Smart Hints setting.', retryable: false } }
        return parseAppResult(await invokeSafely(ipc, H.enable, r.value), isSmartHintsSettingsSnapshot, H.enable)
      },
      budget: async value => {
        const r = validateSmartHintsBudget(value)
        if (!r.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid request limit.', retryable: false } }
        return parseAppResult(await invokeSafely(ipc, H.budget, r.value), isSmartHintsSettingsSnapshot, H.budget)
      },
    },
    get: async () => parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.get, {}), isSettingsSnapshot, SETTINGS_CHANNELS.get),
    update: async value => {
      const valid = validateSettings(value)
      if (!valid.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid settings.', retryable: false } }
      return parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.update, valid.value), isSettingsSnapshot, SETTINGS_CHANNELS.update)
    },
    dependencies: async () => parseAppResult(await invokeSafely(ipc, SETTINGS_CHANNELS.dependencies, {}), isDependencyGuidance, SETTINGS_CHANNELS.dependencies),
  }
}
