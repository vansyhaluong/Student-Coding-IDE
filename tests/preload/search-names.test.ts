import { describe, expect, it, vi } from 'vitest'
import { createSearchBridge } from '../../src/preload/bridge/search'
import { SEARCH_CHANNELS, validateStartSearchRequest } from '../../src/shared/contracts'
import type { ProjectId } from '../../src/shared/contracts'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
describe('Names typed Preload contract', () => {
  it('uses its own narrow start and stream while retaining Contents and shared cancellation', async () => {
    const listeners = new Map<string, Parameters<IpcRendererLike['on']>[1]>()
    const invoke = vi.fn(async () => ({ ok: true, value: null }))
    const api = createSearchBridge({ invoke, on: (channel, listener) => { listeners.set(channel, listener) },
      removeListener: (channel) => { listeners.delete(channel) } })
    const names = vi.fn(), contents = vi.fn()
    const remove = api.onNamesEvent(names), removeContents = api.onEvent(contents)
    await api.startNames(projectId, 'search_names', 'src')
    expect(invoke).toHaveBeenLastCalledWith(SEARCH_CHANNELS.startNames, { projectId, operationId: 'search_names', query: 'src' })
    await api.start(projectId, 'search_contents', 'text')
    expect(invoke).toHaveBeenLastCalledWith(SEARCH_CHANNELS.start, { projectId, operationId: 'search_contents', query: 'text' })
    await api.cancel('search_names')
    expect(invoke).toHaveBeenLastCalledWith(SEARCH_CHANNELS.cancel, { operationId: 'search_names' })
    const batch = { projectId, operationId: 'search_names', type: 'batch', matches: [{ relativePath: 'src/Auth.ts' }] }
    listeners.get(SEARCH_CHANNELS.namesEvent)!({}, batch)
    expect(names).toHaveBeenCalledWith(batch)
    expect(contents).not.toHaveBeenCalled()
    for (const path of ['/etc/passwd', 'C:/secret', 'C:secret', '../escape', 'a/../b', '\\server\\share', 'a//b', './a', 'a\0b']) {
      listeners.get(SEARCH_CHANNELS.namesEvent)!({}, { ...batch, matches: [{ relativePath: path }] })
    }
    listeners.get(SEARCH_CHANNELS.namesEvent)!({}, { ...batch, matches: [{ relativePath: 'a', lineNumber: 1 }] })
    listeners.get(SEARCH_CHANNELS.namesEvent)!({}, { ...batch, matches: Array(51).fill({ relativePath: 'a' }) })
    expect(names).toHaveBeenCalledOnce()
    remove(); removeContents(); expect(listeners.size).toBe(0)
  })

  it('uses the exact existing request validator without adding raw paths or arbitrary arguments', () => {
    const request = { projectId, operationId: 'search_names', query: 'server/index' }
    expect(validateStartSearchRequest(request).ok).toBe(true)
    for (const extra of [{ root: 'C:/' }, { args: ['ls'] }, { mode: 'arbitrary' }]) {
      expect(validateStartSearchRequest({ ...request, ...extra }).ok).toBe(false)
    }
    for (const query of ['', '\0', 'a\nb', 'a'.repeat(257)]) {
      expect(validateStartSearchRequest({ ...request, query }).ok).toBe(false)
    }
  })
})
