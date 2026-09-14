/** @vitest-environment jsdom */
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type StudentIdeApi, type RecentProject, type ProjectId } from '../../src/shared/contracts'
import { SettingsDialog } from '../../src/renderer/src/features/settings/SettingsDialog'
import { RecentProjects } from '../../src/renderer/src/features/settings/RecentProjects'
import { shellShortcut } from '../../src/renderer/src/features/settings/shortcuts'
import { useSettings, useTheme } from '../../src/renderer/src/features/settings/use-settings'

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete document.documentElement.dataset.theme })
function install(settings: Partial<StudentIdeApi['settings']> = {}) {
  const api = {
    get: vi.fn(async () => ({ ok: true as const, value: { settings: defaultSettings(), recovered: false } })),
    update: vi.fn(async (value: ReturnType<typeof defaultSettings>) => ({ ok: true as const, value: { settings: value, recovered: false } })),
    dependencies: vi.fn(async () => ({ ok: true as const, value: { node: 'MISSING' as const, git: 'INVALID_CONFIGURATION' as const } })),
    ...settings,
  }
  window.studentIde = { settings: api } as StudentIdeApi
  return api
}

describe('Settings UX', () => {
  it('validates font input, preserves focus while editing, saves only explicit changes and shows guidance', async () => {
    install()
    const save = vi.fn(async () => true)
    const close = vi.fn()
    render(createElement(SettingsDialog, { value: defaultSettings(), recovered: true, error: null, onSave: save, onClose: close }))
    expect(await screen.findByText('Node.js: MISSING')).toBeDefined()
    expect(screen.getByText('Git: INVALID_CONFIGURATION')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('recovered')
    const font = screen.getByLabelText('Editor font size (px)')
    font.focus()
    fireEvent.change(font, { target: { value: '41' } })
    expect(document.activeElement).toBe(font)
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(font, { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } })
    fireEvent.change(screen.getByLabelText('Tab size'), { target: { value: '4' } })
    fireEvent.click(screen.getByLabelText('Auto Save'))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledWith({ theme: 'light', fontSize: 20, tabSize: 4, autoSave: true })
  })

  it('keeps failed saves open and cancel does not persist draft edits', async () => {
    install()
    const save = vi.fn(async () => false)
    const close = vi.fn()
    render(createElement(SettingsDialog, { value: defaultSettings(), recovered: false, error: 'Disk unavailable', onSave: save, onClose: close }))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(false))
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Disk unavailable')
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'system' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(close).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()
  })

  it('applies System changes and removes its listener on unmount', () => {
    let listener!: () => void
    const media = { matches: false, addEventListener: vi.fn((_event: string, fn: () => void) => { listener = fn }), removeEventListener: vi.fn() }
    window.matchMedia = vi.fn().mockReturnValue(media)
    function Theme({ theme }: { theme: 'system' | 'dark' }) { useTheme(theme); return null }
    const view = render(createElement(Theme, { theme: 'system' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => { media.matches = true; listener() })
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.rerender(createElement(Theme, { theme: 'dark' }))
    act(() => { media.matches = false; listener() })
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('keeps active preferences after a failed update and surfaces load recovery', async () => {
    install({
      get: async () => ({ ok: true, value: { settings: { ...defaultSettings(), fontSize: 18 }, recovered: true } }),
      update: async () => ({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Cannot save', retryable: true } }),
    })
    function Harness() {
      const state = useSettings()
      return createElement('button', { onClick: () => void state.update(defaultSettings()) }, String(state.settings.fontSize) + '/' + state.recovered + '/' + state.error)
    }
    render(createElement(Harness))
    fireEvent.click(await screen.findByText('18/true/null'))
    expect(await screen.findByText('18/true/Cannot save')).toBeDefined()
  })
})

describe('Phase 6 shortcuts and history UI', () => {
  it('respects modal, terminal, editor, composition and modifier ownership', () => {
    const event = (key: string, other = {}) => new KeyboardEvent('keydown', { key, ctrlKey: true, ...other })
    expect(shellShortcut(event('o'), false)).toBe('open')
    expect(shellShortcut(event('n'), false)).toBe('new')
    expect(shellShortcut(event('f', { shiftKey: true }), false)).toBe('search')
    for (const key of ['s', 'f']) expect(shellShortcut(event(key), false)).toBeNull()
    expect(shellShortcut(event('o'), true)).toBeNull()
    expect(shellShortcut(event('n', { isComposing: true }), false)).toBeNull()
    expect(shellShortcut(event('o', { altKey: true }), false)).toBeNull()
    const terminal = document.createElement('div')
    terminal.className = 'terminal-panel'
    document.body.append(terminal)
    const key = event('o')
    terminal.dispatchEvent(key)
    expect(shellShortcut(key, false)).toBeNull()
    const toggle = event('Backquote', { code: 'Backquote' })
    terminal.dispatchEvent(toggle)
    expect(shellShortcut(toggle, false)).toBe('terminal')
    terminal.remove()
  })

  it('opens by opaque ID and removes history through the narrow API', async () => {
    install()
    const entry: RecentProject = { id: 'project_1234567890abcdef12345678' as ProjectId, name: 'Demo', displayPath: 'C:/Demo', lastOpenedAt: '2026-09-14T00:00:00Z' }
    let entries = [entry]
    const remove = vi.fn(async () => { entries = []; return { ok: true as const, value: null } })
    window.studentIde.project = { listRecent: async () => ({ ok: true, value: entries }), removeRecent: remove } as StudentIdeApi['project']
    const open = vi.fn(async () => {})
    render(createElement(RecentProjects, { revision: 1, disabled: false, onOpen: open }))
    fireEvent.click(await screen.findByTitle('C:/Demo'))
    expect(open).toHaveBeenCalledWith(entry.id)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Demo from recent projects' }))
    await waitFor(() => expect(screen.queryByTitle('C:/Demo')).toBeNull())
    expect(remove).toHaveBeenCalledWith(entry.id)
  })
})
