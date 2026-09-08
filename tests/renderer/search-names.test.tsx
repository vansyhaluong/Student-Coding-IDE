/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchPanel } from '../../src/renderer/src/features/search/SearchPanel'
import { createSearchBridge } from '../../src/preload/bridge/search'
import { SEARCH_CHANNELS, type ProjectIdentity, type ProjectId } from '../../src/shared/contracts'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import type {} from '../../src/renderer/src/student-ide'

const project: ProjectIdentity = { id: 'project_1234567890abcdef12345678' as ProjectId, name: 'A' }
const other: ProjectIdentity = { id: 'project_abcdef1234567890abcdef12' as ProjectId, name: 'B' }
function setup() {
  const listeners = new Map<string, Parameters<IpcRendererLike['on']>[1]>()
  const invoke = vi.fn(async (channel: string, payload: unknown) => {
    void channel; void payload
    return { ok: true, value: null }
  })
  const search = createSearchBridge({ invoke, on: (channel, listener) => { listeners.set(channel, listener) },
    removeListener: (channel) => { listeners.delete(channel) } })
  window.studentIde = { ...window.studentIde, search }
  const onOpenFile = vi.fn(), onNavigate = vi.fn()
  const panel = (active = project) => <SearchPanel project={active} onNavigate={onNavigate} onOpenFile={onOpenFile}
    tree={<div>Normal file tree</div>} />
  const view = render(panel())
  const send = (channel: string, payload: unknown) => act(() => listeners.get(channel)?.({}, payload))
  const latest = () => invoke.mock.calls.filter(([channel]) => channel === SEARCH_CHANNELS.start || channel === SEARCH_CHANNELS.startNames).at(-1)!
  const type = (query: string) => fireEvent.change(screen.getByLabelText('Search project'), { target: { value: query } })
  return { ...view, invoke, listeners, panel, send, latest, type, onOpenFile, onNavigate }
}
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Explorer Names/Contents through production Search Preload', () => {
  it('defaults to Names, debounces typing, uses paths-only results and restores the tree on clear', async () => {
    vi.useFakeTimers()
    const f = setup()
    expect(screen.getByRole('tab', { name: 'Names' }).getAttribute('aria-selected')).toBe('true')
    expect(f.invoke).not.toHaveBeenCalled()
    f.type('src'); f.type('src/auth')
    await act(async () => vi.advanceTimersByTime(179))
    expect(f.invoke).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    const [channel, payload] = f.latest()
    expect(channel).toBe(SEARCH_CHANNELS.startNames)
    expect(payload).toMatchObject({ projectId: project.id, query: 'src/auth' })
    f.send(SEARCH_CHANNELS.namesEvent, { ...(payload as object), query: undefined }) // malformed event ignored
    const identity = payload as { projectId: string; operationId: string }
    f.send(SEARCH_CHANNELS.namesEvent, { projectId: identity.projectId, operationId: identity.operationId,
      type: 'batch', matches: [{ relativePath: 'src/Auth.png' }] })
    fireEvent.click(screen.getByRole('button', { name: 'src/Auth.png' }))
    expect(f.onOpenFile).toHaveBeenCalledWith('src/Auth.png')
    expect(screen.getByText('Normal file tree').parentElement?.hidden).toBe(true)
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(screen.getByText('Normal file tree').parentElement?.hidden).toBe(false)
    expect(f.invoke).toHaveBeenCalledWith(SEARCH_CHANNELS.cancel, { operationId: identity.operationId })
    expect(screen.queryByRole('button', { name: 'src/Auth.png' })).toBeNull()
  })

  it('preserves one query, immediately searches each explicitly selected mode, and rejects old-mode results', async () => {
    vi.useFakeTimers()
    const f = setup()
    f.type('needle'); await act(async () => vi.advanceTimersByTime(180))
    const names = f.latest()[1] as { projectId: string; operationId: string }
    fireEvent.click(screen.getByRole('tab', { name: 'Contents' }))
    const [channel, contents] = f.latest() as [string, { projectId: string; operationId: string; query: string }]
    expect(channel).toBe(SEARCH_CHANNELS.start)
    expect(contents.query).toBe('needle')
    expect(f.invoke).toHaveBeenCalledWith(SEARCH_CHANNELS.cancel, { operationId: names.operationId })
    f.send(SEARCH_CHANNELS.namesEvent, { projectId: project.id, operationId: names.operationId,
      type: 'batch', matches: [{ relativePath: 'old-name.ts' }] })
    expect(screen.queryByText('old-name.ts')).toBeNull()
    f.send(SEARCH_CHANNELS.event, { projectId: project.id, operationId: contents.operationId, type: 'batch', matches: [
      { projectId: project.id, relativePath: 'content.ts', lineNumber: 1, columnStart: 1, columnEnd: 7, preview: 'needle' },
    ] })
    expect(screen.getByRole('button', { name: 'content.ts line 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Names' }))
    expect(f.latest()[0]).toBe(SEARCH_CHANNELS.startNames)
    expect((screen.getByLabelText('Search project') as HTMLInputElement).value).toBe('needle')
    expect(screen.queryByRole('button', { name: 'content.ts line 1' })).toBeNull()
    f.send(SEARCH_CHANNELS.event, { projectId: project.id, operationId: contents.operationId, type: 'batch', matches: [
      { projectId: project.id, relativePath: 'late.ts', lineNumber: 1, columnStart: 1, columnEnd: 7, preview: 'needle' },
    ] })
    expect(screen.queryByText('late.ts')).toBeNull()
  })

  it('does not dispatch an empty query on mode switch and keeps Contents empty behavior', () => {
    const f = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Contents' }))
    expect(screen.getByText('Type to search in files')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Names' }))
    expect(f.invoke).not.toHaveBeenCalled()
  })

  it('clears on project change, resets Names, ignores old project events, and cancels on unmount/reload', async () => {
    vi.useFakeTimers()
    const f = setup()
    f.type('path'); await act(async () => vi.advanceTimersByTime(180))
    const old = f.latest()[1] as { operationId: string }
    f.rerender(f.panel(other))
    expect((screen.getByLabelText('Search project') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('tab', { name: 'Names' }).getAttribute('aria-selected')).toBe('true')
    f.send(SEARCH_CHANNELS.namesEvent, { projectId: project.id, operationId: old.operationId,
      type: 'batch', matches: [{ relativePath: 'old.ts' }] })
    expect(screen.queryByText('old.ts')).toBeNull()
    f.type('new'); await act(async () => vi.advanceTimersByTime(180))
    const fresh = f.latest()[1] as { operationId: string; projectId: string }
    expect(fresh.projectId).toBe(other.id)
    f.unmount()
    expect(f.invoke).toHaveBeenCalledWith(SEARCH_CHANNELS.cancel, { operationId: fresh.operationId })
    expect(f.listeners.size).toBe(0)
    render(f.panel(other))
    expect((screen.getByLabelText('Search project') as HTMLInputElement).value).toBe('')
  })
})
