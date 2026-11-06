import { describe, expect, it, vi } from 'vitest'
import { SmartHintsSettingsIpcService } from '../../src/main/ipc/smart-hints-settings-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { SmartHintsConfiguration } from '../../src/main/services/learning/smart-hints/configuration'
import { SMART_HINT_SETTINGS_CHANNELS as H } from '../../src/shared/contracts/smart-hints-settings'
import { DomainError } from '../../src/main/errors/app-error'

describe('normal Smart Hints Settings IPC ownership and exact payloads', () => {
  function setup() {
    let allowed = true
    const snapshot = { enabled: false, provider: 'GEMINI', model: 'gemini-3.1-flash-lite', hasKey: false, state: 'DISABLED', usedRequests: 0, requestLimit: 20,
      remainingRequests: 20, lifetimeRequests: 0, resetAt: Date.UTC(2026, 10, 4), retryAt: null, needsLimitReview: false }
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const registry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
    const configuration = { snapshot: vi.fn(() => snapshot), enable: vi.fn(async () => snapshot), configureKey: vi.fn(async (check: () => void, entry: (signal: AbortSignal) => Promise<string | null>) => {
      await entry(new AbortController().signal); check(); return snapshot
    }), removeKey: vi.fn(async () => snapshot), checkConnection: vi.fn(async () => snapshot), budget: vi.fn(async () => snapshot), cancel: vi.fn() }
    const prompt = vi.fn(async () => null), remove = vi.fn(), observe = vi.fn(() => remove)
    const service = new SmartHintsSettingsIpcService(registry, configuration as unknown as SmartHintsConfiguration,
      c => { if (!allowed || c.senderId !== 1) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Settings owner unavailable.', retryable: false }) }, observe, prompt)
    service.start()
    const invoke = (c: string, payload: unknown, owner = 1) => handlers.get(c)!({ sender: { id: owner } }, payload)
    return { service, invoke, configuration, prompt, remove, setAllowed: (value: boolean) => { allowed = value }, handlers }
  }
  it('rejects foreign owners and key-bearing/unknown payload before prompt or dispatch', async () => {
    const f = setup()
    expect(await f.invoke(H.key, { apiKey: 'SYNTHETIC' })).toMatchObject({ ok: false })
    expect(await f.invoke(H.key, {}, 2)).toMatchObject({ ok: false })
    expect(await f.invoke(H.enable, { enabled: true, command: 'bad' })).toMatchObject({ ok: false })
    expect(f.prompt).not.toHaveBeenCalled(); expect(f.configuration.enable).not.toHaveBeenCalled()
    f.service.stop(); expect(f.handlers.size).toBe(0)
  })
  it('rechecks authority after native key prompt and removes owner observers', async () => {
    const f = setup()
    f.prompt.mockImplementationOnce(async () => { f.setAllowed(false); return null })
    expect(await f.invoke(H.key, {})).toMatchObject({ ok: false })
    expect(f.remove).toHaveBeenCalledOnce(); expect(f.prompt).toHaveBeenCalledOnce()
    f.service.stop()
  })
})
