import { describe, expect, it, vi } from 'vitest'
import { createSettingsBridge } from '../../src/preload/bridge/settings'
import { SMART_HINT_SETTINGS_CHANNELS as H, isSmartHintsSettingsSnapshot, validateSmartHintsEnable } from '../../src/shared/contracts/smart-hints-settings'

describe('Smart Hints Settings narrow bridge', () => {
  const snapshot = { enabled: false, provider: 'GEMINI', model: 'gemini-3.1-flash-lite', hasKey: false, state: 'DISABLED', usedRequests: 0, requestLimit: 20,
    remainingRequests: 20, lifetimeRequests: 0, resetAt: 1793750400000, retryAt: null, needsLimitReview: false }
  it('no credential argument or response is part of settings IPC', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: snapshot }))
    const api = createSettingsBridge({ invoke, on() {}, removeListener() {} }).smartHints!
    await api.configureKey(); expect(invoke).toHaveBeenCalledWith(H.key, {})
    await api.check(); expect(invoke).toHaveBeenCalledWith(H.check, {})
    expect(validateSmartHintsEnable({ enabled: true, apiKey: 'SYNTHETIC' }).ok).toBe(false)
    expect(isSmartHintsSettingsSnapshot({ ...snapshot, key: 'SYNTHETIC' })).toBe(false)
  })
  it('invalid update fields never reach Main', async () => {
    const invoke = vi.fn(async () => ({ ok: true, value: snapshot }))
    const api = createSettingsBridge({ invoke, on() {}, removeListener() {} }).smartHints!
    expect((await api.enable({ enabled: 'true' } as never)).ok).toBe(false)
    expect((await api.budget({ dailyLimit: 301 })).ok).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
