/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PanelResizer } from '../../src/renderer/src/components/PanelResizer'
import {
  TerminalPanel,
} from '../../src/renderer/src/features/terminal/TerminalPanel'
import type {
  TerminalController,
  TerminalControllerSnapshot,
  TerminalSessionView,
} from '../../src/renderer/src/features/terminal/terminal-controller'
import type { ProjectIdentity, TerminalSessionId } from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

class FakePanelController {
  readonly createSession = vi.fn(async () => {
    let id = `terminal_${this.nextId++}` as TerminalSessionId
    while (this.hosts.has(id)) id = `terminal_${this.nextId++}` as TerminalSessionId
    const host = document.createElement('div')
    host.dataset.terminalHost = id
    this.hosts.set(id, host)
    this.sessions.push(session(id, `PowerShell ${this.sessions.length + 1}`))
    this.publish()
    return id
  })
  readonly focus = vi.fn()
  readonly setSessionVisible = vi.fn()
  readonly closeSession = vi.fn(async (id: TerminalSessionId) => {
    const index = this.sessions.findIndex((item) => item.sessionId === id)
    if (index < 0) return false
    this.sessions.splice(index, 1)
    this.publish()
    return true
  })
  private readonly listeners = new Set<() => void>()
  private readonly hosts = new Map<TerminalSessionId, HTMLElement>()
  private readonly sessions: TerminalSessionView[] = []
  private nextId = 1
  private snapshot: TerminalControllerSnapshot = {
    sessions: [], creating: false, createError: null,
  }
  readonly setInteractionLocked = vi.fn()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot(): TerminalControllerSnapshot { return this.snapshot }
  getHost(id: TerminalSessionId): HTMLElement | null { return this.hosts.get(id) ?? null }
  add(view: TerminalSessionView): void {
    const host = document.createElement('div')
    host.dataset.terminalHost = view.sessionId
    this.hosts.set(view.sessionId, host)
    this.sessions.push(view)
    this.publish()
  }
  replace(view: TerminalSessionView): void {
    const index = this.sessions.findIndex((item) => item.sessionId === view.sessionId)
    this.sessions[index] = view
    this.publish()
  }
  private publish(): void {
    this.snapshot = {
      sessions: [...this.sessions], creating: false, createError: null,
    }
    for (const listener of this.listeners) listener()
  }
}

afterEach(cleanup)

describe('Phase 2E-F Terminal Bottom Panel', () => {
  it('is initially closed and never creates a hidden terminal', () => {
    const controller = new FakePanelController()
    renderPanel(controller, { open: false, project })
    expect((screen.getByLabelText('Terminal panel') as HTMLElement).hidden).toBe(true)
    expect(controller.createSession).not.toHaveBeenCalled()
  })

  it('opens without a project as a quiet recoverable empty state', () => {
    const controller = new FakePanelController()
    renderPanel(controller, { open: true, openRequest: 1, project: null })
    expect(screen.getByText('Open a project to start a terminal.')).not.toBeNull()
    expect((screen.getByLabelText('New Terminal') as HTMLButtonElement).disabled).toBe(true)
    expect(controller.createSession).not.toHaveBeenCalled()
  })

  it('creates the first terminal only after an explicit open request', async () => {
    const controller = new FakePanelController()
    renderPanel(controller, { open: true, openRequest: 1, project })
    await waitFor(() => expect(controller.createSession).toHaveBeenCalledOnce())
    expect((await screen.findByRole('tab', { name: /PowerShell 1/ })).getAttribute(
      'aria-selected',
    )).toBe('true')
    expect(document.querySelector('[data-terminal-host="terminal_1"]')).not.toBeNull()
  })

  it('does not create a terminal for an open request while interaction is locked', () => {
    const controller = new FakePanelController()
    renderPanel(controller, {
      open: true,
      openRequest: 1,
      project,
      interactionLocked: true,
    })

    expect(controller.setInteractionLocked).toHaveBeenCalledWith(true)
    expect(controller.createSession).not.toHaveBeenCalled()
    expect((screen.getByLabelText('New Terminal') as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not duplicate an existing session across a React remount', async () => {
    const controller = new FakePanelController()
    controller.add(session('terminal_existing' as TerminalSessionId, 'PowerShell 1'))
    const first = renderPanel(controller, { open: true, openRequest: 1, project })
    await waitFor(() => expect(controller.focus).toHaveBeenCalledWith('terminal_existing'))
    first.unmount()
    renderPanel(controller, { open: true, openRequest: 1, project })
    await waitFor(() => expect(controller.focus).toHaveBeenCalledTimes(2))
    expect(controller.createSession).not.toHaveBeenCalled()
  })

  it('supports session selection, new terminal, and isolated close with neighbor selection', async () => {
    const controller = new FakePanelController()
    controller.add(session('terminal_1' as TerminalSessionId, 'PowerShell 1'))
    controller.add(session('terminal_2' as TerminalSessionId, 'PowerShell 2'))
    renderPanel(controller, { open: true, openRequest: 1, project })

    fireEvent.click(await screen.findByRole('tab', { name: /PowerShell 1/ }))
    expect(controller.focus).toHaveBeenLastCalledWith('terminal_1')
    fireEvent.click(screen.getByLabelText('New Terminal'))
    await waitFor(() => expect(controller.createSession).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByLabelText('Close PowerShell 3'))
    await waitFor(() => expect(controller.closeSession).toHaveBeenCalledWith('terminal_3'))
    expect(screen.queryByRole('tab', { name: /PowerShell 3/ })).toBeNull()
    expect(screen.getByRole('tab', { name: /PowerShell 2/ }).getAttribute(
      'aria-selected',
    )).toBe('true')
  })

  it('keeps scrollback host mounted and shows restrained exit/error state', async () => {
    const controller = new FakePanelController()
    const id = 'terminal_1' as TerminalSessionId
    controller.add(session(id, 'PowerShell 1'))
    renderPanel(controller, { open: true, openRequest: 1, project })
    controller.replace({ ...session(id, 'PowerShell 1'), state: 'EXITED', exitCode: 9 })

    expect(await screen.findByText('Terminal exited with code 9.')).not.toBeNull()
    expect(document.querySelector('[data-terminal-host="terminal_1"]')).not.toBeNull()
    controller.replace({
      ...session(id, 'PowerShell 1'),
      state: 'FAILED',
      error: 'Terminal process stopped.',
    })
    expect((await screen.findByRole('alert')).textContent).toContain('Terminal process stopped.')
  })
})

describe('Phase 2E-F horizontal panel resizer', () => {
  it('supports bounded keyboard resizing', () => {
    const onResize = vi.fn()
    render(
      <PanelResizer
        height={200}
        minimum={160}
        getMaximum={() => 300}
        onResize={onResize}
      />,
    )
    const separator = screen.getByRole('separator', { name: 'Resize Terminal panel' })
    fireEvent.keyDown(separator, { key: 'ArrowUp' })
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(onResize).toHaveBeenNthCalledWith(1, 210)
    expect(onResize).toHaveBeenNthCalledWith(2, 190)
  })

  it('supports pointer resizing and clamps panel/editor minimums', () => {
    const onResize = vi.fn()
    const { container } = render(
      <div>
        <PanelResizer
          height={200}
          minimum={160}
          getMaximum={() => 300}
          onResize={onResize}
        />
      </div>,
    )
    vi.spyOn(container.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
    } as DOMRect)
    fireEvent.pointerDown(screen.getByRole('separator'), { clientY: 300 })
    fireEvent.pointerMove(window, { clientY: 100 })
    fireEvent.pointerMove(window, { clientY: 490 })
    fireEvent.pointerUp(window)
    expect(onResize).toHaveBeenNthCalledWith(1, 300)
    expect(onResize).toHaveBeenNthCalledWith(2, 160)
  })
})

function renderPanel(
  controller: FakePanelController,
  overrides: Partial<{
    project: ProjectIdentity | null
    open: boolean
    openRequest: number
    interactionLocked: boolean
  }> = {},
) {
  return render(
    <TerminalPanel
      controller={controller as unknown as TerminalController}
      project={overrides.project === undefined ? project : overrides.project}
      open={overrides.open ?? false}
      openRequest={overrides.openRequest ?? 0}
      height={260}
      onHeightChange={vi.fn()}
      onClosePanel={vi.fn()}
      interactionLocked={overrides.interactionLocked ?? false}
    />,
  )
}

function session(
  sessionId: TerminalSessionId,
  label: string,
): TerminalSessionView {
  return {
    sessionId,
    projectId: project.id,
    label,
    state: 'RUNNING',
    exitCode: null,
    error: null,
  }
}
