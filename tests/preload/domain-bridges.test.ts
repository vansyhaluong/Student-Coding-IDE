import { describe, expect, it, vi } from 'vitest'

import { createPreloadApi } from '../../src/preload/bridge'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { FILE_CHANNELS, PROJECT_CHANNELS } from '../../src/shared/contracts'

class FakeIpcRenderer implements IpcRendererLike {
  readonly responses = new Map<string, unknown>()
  readonly listeners = new Map<string, (
    event: { sender?: unknown },
    payload: unknown,
  ) => void>()
  readonly removeListener = vi.fn((
    channel: string,
    listener: (event: { sender?: unknown }, payload: unknown) => void,
  ) => {
    void listener
    this.listeners.delete(channel)
  })
  readonly invoke = vi.fn(async (channel: string) => this.responses.get(channel))

  on(
    channel: string,
    listener: (event: { sender?: unknown }, payload: unknown) => void,
  ): void {
    this.listeners.set(channel, listener)
  }

  emit(channel: string, payload: unknown): void {
    this.listeners.get(channel)?.({}, payload)
  }
}

describe('Phase 2B preload bridges', () => {
  it('exposes only narrow domain methods and validates responses', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    ipcRenderer.responses.set(PROJECT_CHANNELS.getActive, {
      ok: true,
      value: { id: 'project_1234567890abcdef12345678', name: 'Demo' },
    })
    ipcRenderer.responses.set(FILE_CHANNELS.listDirectory, {
      ok: true,
      value: [{
        name: 'src',
        relativePath: 'src',
        kind: 'directory',
        isSymbolicLink: false,
      }],
    })
    const api = createPreloadApi(ipcRenderer)

    expect(Object.keys(api).sort()).toEqual(['file', 'lifecycle', 'project'])
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('execute')
    expect(api).not.toHaveProperty('fs')
    await expect(api.project.getActive()).resolves.toMatchObject({ ok: true })
    await expect(api.file.listDirectory(
      'project_1234567890abcdef12345678' as never,
      '',
    )).resolves.toMatchObject({ ok: true })

    ipcRenderer.responses.set(FILE_CHANNELS.listDirectory, {
      ok: true,
      value: [{ absolutePath: 'C:\\secret' }],
    })
    await expect(api.file.listDirectory(
      'project_1234567890abcdef12345678' as never,
      '',
    )).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
  })

  it('returns cleanup functions and ignores malformed or stale-looking events', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createPreloadApi(ipcRenderer)
    const projectListener = vi.fn()
    const fileListener = vi.fn()
    const removeProject = api.project.onChanged(projectListener)
    const removeFile = api.file.onChanged(fileListener)

    ipcRenderer.emit(PROJECT_CHANNELS.changed, { activeProject: { id: 1 } })
    ipcRenderer.emit(PROJECT_CHANNELS.changed, { activeProject: null })
    ipcRenderer.emit(FILE_CHANNELS.changed, { projectId: 'x', relativePath: 4, kind: 'changed' })
    ipcRenderer.emit(FILE_CHANNELS.changed, {
      projectId: 'project_1234567890abcdef12345678',
      relativePath: 'src/main.ts',
      kind: 'changed',
    })

    expect(projectListener).toHaveBeenCalledOnce()
    expect(fileListener).toHaveBeenCalledOnce()
    removeProject()
    removeFile()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(2)
  })
})
