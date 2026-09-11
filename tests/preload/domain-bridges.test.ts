import { describe, expect, it, vi } from 'vitest'

import { createPreloadApi } from '../../src/preload/bridge'
import { GIT_CONTEXT_CHANNEL } from '../../src/shared/contracts/git-lifecycle'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import {
  FILE_CHANNELS,
  GIT_CHANNELS,
  PROJECT_CHANNELS,
  SEARCH_CHANNELS,
} from '../../src/shared/contracts'

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
  readonly invoke = vi.fn(async (channel: string, payload?: unknown) => {
    if (channel === GIT_CONTEXT_CHANNEL) return { ok: true, value: { generation: 'fixture-generation' } }
    if (channel.startsWith('git:')) return { ok: true, value: {
      identity: (payload as { identity: unknown }).identity, result: this.responses.get(channel),
    } }
    return this.responses.get(channel)
  })

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
    ipcRenderer.responses.set(FILE_CHANNELS.write, { ok: true, value: null })
    ipcRenderer.responses.set(FILE_CHANNELS.getStatus, {
      ok: true,
      value: {
        projectId: 'project_1234567890abcdef12345678',
        state: 'AVAILABLE',
      },
    })
    ipcRenderer.responses.set(GIT_CHANNELS.getState, {
      ok: true,
      value: { dependency: 'MISSING', repository: null },
    })
    ipcRenderer.responses.set(SEARCH_CHANNELS.start, { ok: true, value: null })
    ipcRenderer.responses.set(SEARCH_CHANNELS.cancel, { ok: true, value: null })
    const api = createPreloadApi(ipcRenderer)

    expect(Object.keys(api).sort()).toEqual([
      'file',
      'git',
      'language',
      'lifecycle',
      'project',
      'run',
      'search',
      'terminal',
    ])
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('execute')
    expect(api).not.toHaveProperty('fs')
    await expect(api.project.getActive()).resolves.toMatchObject({ ok: true })
    await expect(api.file.listDirectory(
      'project_1234567890abcdef12345678' as never,
      '',
    )).resolves.toMatchObject({ ok: true })
    await expect(api.file.write(
      'project_1234567890abcdef12345678' as never,
      'main.ts',
      'saved',
    )).resolves.toEqual({ ok: true, value: null })
    await expect(api.file.getStatus(
      'project_1234567890abcdef12345678' as never,
    )).resolves.toMatchObject({ ok: true, value: { state: 'AVAILABLE' } })
    await expect(api.git.getState(
      'project_1234567890abcdef12345678' as never,
    )).resolves.toEqual({
      ok: true,
      value: { dependency: 'MISSING', repository: null },
    })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(FILE_CHANNELS.write, {
      projectId: 'project_1234567890abcdef12345678',
      relativePath: 'main.ts',
      content: 'saved',
    })
    await expect(api.search.start(
      'project_1234567890abcdef12345678' as never,
      'search_query_1',
      'Save',
    )).resolves.toEqual({ ok: true, value: null })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(SEARCH_CHANNELS.start, {
      projectId: 'project_1234567890abcdef12345678',
      operationId: 'search_query_1',
      query: 'Save',
    })
    await expect(api.search.cancel('search_query_1'))
      .resolves.toEqual({ ok: true, value: null })

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
    const fileStatusListener = vi.fn()
    const searchListener = vi.fn()
    const removeProject = api.project.onChanged(projectListener)
    const removeFile = api.file.onChanged(fileListener)
    const removeFileStatus = api.file.onStatusChanged(fileStatusListener)
    const removeSearch = api.search.onEvent(searchListener)

    ipcRenderer.emit(PROJECT_CHANNELS.changed, { activeProject: { id: 1 } })
    ipcRenderer.emit(PROJECT_CHANNELS.changed, { activeProject: null })
    ipcRenderer.emit(FILE_CHANNELS.changed, { projectId: 'x', relativePath: 4, kind: 'changed' })
    ipcRenderer.emit(FILE_CHANNELS.changed, {
      projectId: 'project_1234567890abcdef12345678',
      relativePath: 'src/main.ts',
      kind: 'changed',
    })
    ipcRenderer.emit(FILE_CHANNELS.statusChanged, {
      projectId: 'project_1234567890abcdef12345678',
      state: 'BROKEN',
    })
    ipcRenderer.emit(FILE_CHANNELS.statusChanged, {
      projectId: 'project_1234567890abcdef12345678',
      state: 'UNAVAILABLE',
    })
    ipcRenderer.emit(SEARCH_CHANNELS.event, { type: 'batch', matches: 'bad' })
    ipcRenderer.emit(SEARCH_CHANNELS.event, {
      type: 'batch',
      projectId: 'project_1234567890abcdef12345678',
      operationId: 'search_query_1',
      matches: [{
        projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
        relativePath: 'src/main.ts',
        lineNumber: 2,
        columnStart: 4,
        columnEnd: 8,
        preview: 'mismatched project',
      }],
    })
    ipcRenderer.emit(SEARCH_CHANNELS.event, {
      type: 'batch',
      projectId: 'project_1234567890abcdef12345678',
      operationId: 'search_query_1',
      matches: [{
        projectId: 'project_1234567890abcdef12345678',
        relativePath: 'src/main.ts',
        lineNumber: 2,
        columnStart: 4,
        columnEnd: 8,
        preview: 'const save = true',
      }],
    })

    expect(projectListener).toHaveBeenCalledOnce()
    expect(fileListener).toHaveBeenCalledOnce()
    expect(fileStatusListener).toHaveBeenCalledOnce()
    expect(searchListener).toHaveBeenCalledOnce()
    removeProject()
    removeFile()
    removeFileStatus()
    removeSearch()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(4)
  })

  it('normalizes project, file, and search transport rejections', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const api = createPreloadApi(ipcRenderer)
    const expectedFailure = {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The application request could not be completed.',
        details: { boundaryFailure: 'transport' },
        retryable: true,
      },
    }

    ipcRenderer.invoke.mockRejectedValueOnce(new Error('raw project transport failure'))
    const projectFailure = await api.project.getActive()
    expect(projectFailure).toMatchObject(expectedFailure)
    expect(JSON.stringify(projectFailure)).not.toContain('raw project')
    ipcRenderer.invoke.mockRejectedValueOnce(new Error('raw file transport failure'))
    await expect(api.file.listDirectory(
      'project_1234567890abcdef12345678' as never,
      '',
    )).resolves.toMatchObject(expectedFailure)
    ipcRenderer.invoke.mockRejectedValueOnce(new Error('raw search transport failure'))
    await expect(api.search.start(
      'project_1234567890abcdef12345678' as never,
      'search_query_1',
      'Save',
    )).resolves.toMatchObject(expectedFailure)
  })

  it('keeps response parser failures distinct from transport failures', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    ipcRenderer.responses.set(PROJECT_CHANNELS.open, {
      ok: true,
      value: { id: 7, name: 'malformed' },
    })

    await expect(createPreloadApi(ipcRenderer).project.open()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        details: { boundaryFailure: 'response-validation' },
        retryable: false,
      },
    })
  })
})
