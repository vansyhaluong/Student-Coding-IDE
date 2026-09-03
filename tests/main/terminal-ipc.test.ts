import { describe, expect, it, vi } from 'vitest'

import { DomainError } from '../../src/main/errors/app-error'
import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import {
  TerminalIpcService,
  type TerminalIpcServiceBoundary,
  type TerminalWebContents,
} from '../../src/main/ipc/terminal-ipc-service'
import {
  TERMINAL_CHANNELS,
  TERMINAL_LIMITS,
  type CloseTerminalResponse,
  type ProjectId,
  type TerminalEvent,
  type TerminalSessionId,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const sessionId = 'terminal_session_1' as TerminalSessionId

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>>()

  handle(channel: string, listener: (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, payload: unknown, senderId = 7): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: senderId } }, payload)
  }
}

class FakeTerminalService implements TerminalIpcServiceBoundary {
  readonly create = vi.fn(async () => ({
    sessionId,
    projectId,
    state: 'RUNNING' as const,
    cols: 80,
    rows: 24,
    shellLabel: 'PowerShell',
  }))
  readonly input = vi.fn()
  readonly resize = vi.fn()
  readonly close = vi.fn(async (): Promise<CloseTerminalResponse> => ({
    status: 'closed',
  }))
  readonly getSessionSnapshot = vi.fn((requestedSessionId: TerminalSessionId) => (
    requestedSessionId === sessionId
      ? {
          sessionId,
          ownerWebContentsId: 7,
          projectId,
          shellLabel: 'PowerShell',
          cols: 80,
          rows: 24,
          state: 'RUNNING' as const,
        }
      : null
  ))
  readonly closeSessionsForOwner = vi.fn(async () => undefined)
}

class FakeWebContents implements TerminalWebContents {
  destroyed = false
  readonly sent: Array<{ channel: string; event: TerminalEvent }> = []
  private navigationListener: ((
    event: unknown,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => void) | undefined
  private destroyedListener: (() => void) | undefined

  constructor(readonly id: number) {}

  isDestroyed(): boolean {
    return this.destroyed
  }

  send(channel: string, event: TerminalEvent): void {
    this.sent.push({ channel, event })
  }

  on(
    _event: 'did-start-navigation',
    listener: (
      event: unknown,
      url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ) => void,
  ): void {
    this.navigationListener = listener
  }

  once(_event: 'destroyed', listener: () => void): void {
    this.destroyedListener = listener
  }

  removeNavigationListener(listener: NonNullable<FakeWebContents['navigationListener']>): void {
    if (this.navigationListener === listener) this.navigationListener = undefined
  }

  removeDestroyedListener(listener: () => void): void {
    if (this.destroyedListener === listener) this.destroyedListener = undefined
  }

  destroy(): void {
    this.destroyed = true
    this.destroyedListener?.()
  }

  navigate(isInPlace = false, isMainFrame = true): void {
    this.navigationListener?.({}, 'app://reload', isInPlace, isMainFrame)
  }
}

function setup() {
  const ipcMain = new FakeIpcMain()
  const terminalService = new FakeTerminalService()
  const owners = new Map<number, FakeWebContents>([
    [7, new FakeWebContents(7)],
    [8, new FakeWebContents(8)],
  ])
  const ipc = new TerminalIpcService(
    new IpcHandlerRegistry(ipcMain),
    terminalService,
    { getWebContents: (ownerId) => owners.get(ownerId) ?? null },
  )
  ipc.start()
  return { ipcMain, terminalService, owners, ipc }
}

describe('Phase 2E-E terminal IPC handlers', () => {
  it('registers the four handlers once and removes them on stop', () => {
    const { ipc, ipcMain } = setup()
    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      TERMINAL_CHANNELS.close,
      TERMINAL_CHANNELS.create,
      TERMINAL_CHANNELS.input,
      TERMINAL_CHANNELS.resize,
    ].sort())
    expect(() => ipc.start()).toThrow('already registered')
    ipc.stop()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('validates create exactly and derives the owner from the sender', async () => {
    const { ipcMain, terminalService } = setup()
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.create, {
      projectId,
      cols: 80,
      rows: 24,
    }, 19)).resolves.toMatchObject({ ok: true, value: { sessionId } })
    expect(terminalService.create).toHaveBeenCalledWith(
      { projectId, cols: 80, rows: 24 },
      { ownerWebContentsId: 19, projectId },
    )

    for (const extra of ['cwd', 'executable', 'env', 'args']) {
      await expect(ipcMain.invoke(TERMINAL_CHANNELS.create, {
        projectId,
        cols: 80,
        rows: 24,
        [extra]: extra === 'env' ? {} : 'forbidden',
      })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.create, {
      projectId: 'bad', cols: 80, rows: 24,
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.create, {
      projectId, cols: 0, rows: 1_001,
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })

  it('forwards input unchanged and rejects malformed or oversized data', async () => {
    const { ipcMain, terminalService } = setup()
    await expect(ipcMain.invoke(
      TERMINAL_CHANNELS.input,
      { sessionId, data: '\x03' },
      12,
    )).resolves.toEqual({ ok: true, value: null })
    expect(terminalService.input).toHaveBeenCalledWith(
      { sessionId, data: '\x03' },
      { ownerWebContentsId: 12, projectId },
    )
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.input, {
      sessionId,
      data: 'a'.repeat(TERMINAL_LIMITS.maximumInputBytes + 1),
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.input, {
      sessionId,
      data: '',
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })

  it('validates resize and preserves typed idempotent close responses', async () => {
    const { ipcMain, terminalService } = setup()
    await expect(ipcMain.invoke(
      TERMINAL_CHANNELS.resize,
      { sessionId, cols: 100, rows: 30 },
      22,
    )).resolves.toEqual({ ok: true, value: null })
    expect(terminalService.resize).toHaveBeenCalledWith(
      { sessionId, cols: 100, rows: 30 },
      { ownerWebContentsId: 22, projectId },
    )
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.resize, {
      sessionId, cols: -1, rows: 30,
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })

    terminalService.close.mockResolvedValueOnce({ status: 'already-closed' })
    await expect(ipcMain.invoke(
      TERMINAL_CHANNELS.close,
      { sessionId },
      23,
    )).resolves.toEqual({ ok: true, value: { status: 'already-closed' } })
    expect(terminalService.close).toHaveBeenCalledWith(
      { sessionId },
      { ownerWebContentsId: 23, projectId },
    )
  })

  it('serializes service and unknown-session errors without raw errors', async () => {
    const { ipcMain, terminalService } = setup()
    terminalService.create.mockRejectedValueOnce(new DomainError({
      code: 'DEPENDENCY_MISSING',
      message: 'Terminal dependency unavailable.',
      operation: TERMINAL_CHANNELS.create,
      retryable: false,
    }))
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.create, {
      projectId, cols: 80, rows: 24,
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'DEPENDENCY_MISSING',
        message: 'Terminal dependency unavailable.',
        operation: TERMINAL_CHANNELS.create,
        retryable: false,
      },
    })
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.close, {
      sessionId: 'terminal_unknown',
    })).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })

    terminalService.close.mockRejectedValueOnce(new DomainError({
      code: 'PERMISSION_DENIED',
      message: 'The terminal session is owned by another renderer.',
      operation: TERMINAL_CHANNELS.close,
      retryable: false,
    }))
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.close, { sessionId }, 99))
      .resolves.toMatchObject({
        ok: false,
        error: { code: 'PERMISSION_DENIED' },
      })

    terminalService.input.mockImplementationOnce(() => {
      throw new DomainError({
        code: 'PROCESS_FAILED',
        message: 'The terminal process rejected input.',
        operation: TERMINAL_CHANNELS.input,
        retryable: false,
      })
    })
    await expect(ipcMain.invoke(TERMINAL_CHANNELS.input, {
      sessionId, data: 'echo failure',
    })).resolves.toMatchObject({ ok: false, error: { code: 'PROCESS_FAILED' } })

    terminalService.input.mockImplementationOnce(() => {
      throw new Error('native stack and environment details')
    })
    const result = await ipcMain.invoke(TERMINAL_CHANNELS.input, {
      sessionId, data: 'echo safe',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(result)).not.toContain('native stack')
  })
})

describe('Phase 2E-E terminal routing and ownership cleanup', () => {
  it('routes valid events only to the live owner in service order', () => {
    const { ipc, owners } = setup()
    const events: TerminalEvent[] = [
      { type: 'data', sessionId, projectId, sequence: 0 as never, data: 'a' },
      { type: 'data', sessionId, projectId, sequence: 1 as never, data: 'b' },
      { type: 'exit', sessionId, projectId, exitCode: 0, signal: null },
    ]
    for (const event of events) ipc.publish(7, event)
    expect(owners.get(7)?.sent).toEqual(events.map((event) => ({
      channel: TERMINAL_CHANNELS.event,
      event,
    })))
    expect(owners.get(8)?.sent).toEqual([])

    ipc.publish(7, { type: 'data', sessionId, projectId, data: 'bad' } as never)
    expect(owners.get(7)?.sent).toHaveLength(3)
    owners.get(7)!.destroyed = true
    ipc.publish(7, events[0]!)
    expect(owners.get(7)?.sent).toHaveLength(3)
  })

  it('cleans only the destroyed owner once and tolerates duplicate loss', async () => {
    const { ipcMain, terminalService, owners } = setup()
    await ipcMain.invoke(TERMINAL_CHANNELS.create, { projectId, cols: 80, rows: 24 }, 7)
    await ipcMain.invoke(TERMINAL_CHANNELS.create, { projectId, cols: 80, rows: 24 }, 8)
    owners.get(7)!.destroy()
    owners.get(7)!.destroy()
    await vi.waitFor(() => expect(terminalService.closeSessionsForOwner)
      .toHaveBeenCalledWith(7))
    expect(terminalService.closeSessionsForOwner).toHaveBeenCalledTimes(1)
    expect(terminalService.closeSessionsForOwner).not.toHaveBeenCalledWith(8)
  })

  it('cleans on a real main-frame reload but not in-place navigation', async () => {
    const { ipcMain, terminalService, owners } = setup()
    await ipcMain.invoke(TERMINAL_CHANNELS.create, { projectId, cols: 80, rows: 24 }, 7)
    owners.get(7)!.navigate(true, true)
    expect(terminalService.closeSessionsForOwner).not.toHaveBeenCalled()
    owners.get(7)!.navigate(false, true)
    await vi.waitFor(() => expect(terminalService.closeSessionsForOwner)
      .toHaveBeenCalledWith(7))
  })
})
