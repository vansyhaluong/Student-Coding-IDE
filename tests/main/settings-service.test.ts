import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppPersistence, SettingsService } from '../../src/main/services/settings/settings-service'
import { defaultSettings, validateSettings, SETTINGS_CHANNELS, type ProjectId } from '../../src/shared/contracts'
import { SettingsIpcService } from '../../src/main/ipc/settings-ipc-service'
import { IpcHandlerRegistry, type IpcInvokeEventLike } from '../../src/main/ipc/ipc-handler-registry'
import { DomainError } from '../../src/main/errors/app-error'
import { createSettingsBridge } from '../../src/preload/bridge/settings'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'phase6-settings-'))
  roots.push(root)
  const path = join(root, 'app-state.json')
  const store = createAppPersistence(path)
  await store.start()
  return { path, store, service: new SettingsService(store) }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const recent = { id: 'project_1234567890abcdef12345678' as ProjectId, name: 'Demo', rootPath: 'C:/Demo', lastOpenedAt: '2026-09-14T00:00:00Z' }

describe('Phase 6 settings persistence', () => {
  it('migrates v1 without losing recent entries and persists v2 across restart', async () => {
    const { path } = await fixture()
    await writeFile(path, JSON.stringify({ schemaVersion: 1, data: { recentProjects: [recent] } }))
    const store = createAppPersistence(path)
    await store.start()
    expect(store.getValue()).toEqual({ recentProjects: [recent], settings: defaultSettings() })
    const settings = { ...defaultSettings(), theme: 'system' as const, fontSize: 19, tabSize: 4 as const, autoSave: true }
    await new SettingsService(store).update(settings)
    await store.stop()
    const restarted = createAppPersistence(path)
    await restarted.start()
    expect(restarted.getValue()).toEqual({ recentProjects: [recent], settings })
    expect(JSON.parse(await readFile(path, 'utf8')).schemaVersion).toBe(2)
  })

  it('serializes settings and history updates without losing either', async () => {
    const { store, service, path } = await fixture()
    await Promise.all([
      service.update({ ...defaultSettings(), fontSize: 22 }),
      store.updateWith(current => ({ ...current, recentProjects: [recent] })),
      service.update({ ...defaultSettings(), theme: 'light' }),
    ])
    const restarted = createAppPersistence(path)
    await restarted.start()
    expect(restarted.getValue()).toEqual({ recentProjects: [recent], settings: { ...defaultSettings(), theme: 'light' } })
  })

  it('recovers backup, warns and preserves corrupt evidence when saving', async () => {
    const { store, service, path } = await fixture()
    await service.update({ ...defaultSettings(), fontSize: 20 })
    await store.updateWith(current => ({ ...current, recentProjects: [recent] }))
    await writeFile(path, '{ broken')
    const recovered = createAppPersistence(path)
    await recovered.start()
    expect(new SettingsService(recovered).get()).toMatchObject({ recovered: true, settings: { fontSize: 20 } })
    await new SettingsService(recovered).update(defaultSettings())
    expect(await readFile(path + '.corrupt', 'utf8')).toBe('{ broken')
    expect(JSON.parse(await readFile(path + '.bak', 'utf8')).data.settings.fontSize).toBe(20)
  })

  it('recovers defaults from invalid settings and unsupported schemas', async () => {
    const { path } = await fixture()
    for (const document of [
      { schemaVersion: 2, data: { recentProjects: [], settings: { ...defaultSettings(), fontSize: -1 } } },
      { schemaVersion: 99, data: {} },
      { schemaVersion: 1, data: { recentProjects: [{ ...recent, id: '../outside' }] } },
    ]) {
      await writeFile(path, JSON.stringify(document))
      const store = createAppPersistence(path)
      await store.start()
      expect(new SettingsService(store).get()).toEqual({ settings: defaultSettings(), recovered: true })
    }
  })

  it('rejects invalid or executable-bearing values without mutation', async () => {
    const { service } = await fixture()
    for (const value of [
      { ...defaultSettings(), fontSize: 8.5 }, { ...defaultSettings(), fontSize: 41 },
      { ...defaultSettings(), autoSave: 'true' }, { ...defaultSettings(), tabSize: 3 },
      { ...defaultSettings(), theme: 'unknown' }, { ...defaultSettings(), executable: 'cmd.exe' },
    ]) {
      expect(validateSettings(value).ok).toBe(false)
      await expect(service.update(value as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    expect(service.get().settings).toEqual(defaultSettings())
  })

  it('reports a safe recoverable write failure and keeps current preferences', async () => {
    const { service, store } = await fixture()
    vi.spyOn(store, 'updateWith').mockRejectedValueOnce(new Error('private disk detail'))
    await expect(service.update({ ...defaultSettings(), fontSize: 20 })).rejects.toMatchObject({ code: 'INTERNAL_ERROR', retryable: true })
    expect(service.get().settings).toEqual(defaultSettings())
    await expect(service.update({ ...defaultSettings(), fontSize: 20 })).resolves.toMatchObject({ settings: { fontSize: 20 } })
  })
})

describe('Phase 6 settings IPC', () => {
  it('validates before dispatch, authorizes requests, rechecks async ownership and cleans handlers', async () => {
    const { service } = await fixture()
    const handlers = new Map<string, (event: IpcInvokeEventLike, payload: unknown) => Promise<unknown>>()
    const registry = new IpcHandlerRegistry({ handle: (key, fn) => { handlers.set(key, fn) }, removeHandler: key => { handlers.delete(key) } })
    let allowed = true
    const authorize = vi.fn(() => { if (!allowed) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Unavailable', retryable: false }) })
    const ipc = new SettingsIpcService(registry, service, authorize, async () => {
      allowed = false
      return { node: 'AVAILABLE', git: 'MISSING' }
    })
    ipc.start()
    const call = (channel: string, value: unknown) => handlers.get(channel)!({ sender: { id: 1 } }, value)
    expect(await call(SETTINGS_CHANNELS.update, { ...defaultSettings(), command: 'bad' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(authorize).not.toHaveBeenCalled()
    expect(await call(SETTINGS_CHANNELS.get, {})).toMatchObject({ ok: true })
    expect(await call(SETTINGS_CHANNELS.dependencies, {})).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(await call(SETTINGS_CHANNELS.update, defaultSettings())).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    ipc.stop()
    expect(handlers.size).toBe(0)
  })

  it('preload rejects malformed responses and never forwards invalid settings', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, value: { settings: defaultSettings(), recovered: false, raw: 'private' } })
    const bridge = createSettingsBridge({ invoke, on: vi.fn(), removeListener: vi.fn() })
    expect(await bridge.get()).toMatchObject({ ok: false })
    invoke.mockClear()
    expect(await bridge.update({ ...defaultSettings(), fontSize: NaN })).toMatchObject({ ok: false })
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValue({ ok: true, value: { node: 'AVAILABLE', git: 'MISSING' } })
    expect(await bridge.dependencies()).toEqual({ ok: true, value: { node: 'AVAILABLE', git: 'MISSING' } })
  })
})

