import { describe, expect, it, vi } from 'vitest'

import { createPreloadApi } from '../../src/preload/bridge'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import {
  TERMINAL_CHANNELS,
  type ProjectId,
  type TerminalSessionId,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const sessionId = 'terminal_session_1' as TerminalSessionId

class FakeIpcRenderer implements IpcRendererLike {
  readonly responses = new Map<string, unknown>()
  readonly listeners = new Map<string, Set<(
    event: unknown,
    payload: unknown,
  ) => void>>()
  readonly invoke = vi.fn(async (channel: string) => this.responses.get(channel))
  readonly on = vi.fn((
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ) => {
    const listeners = this.listeners.get(channel) ?? new Set()
    listeners.add(listener)
    this.listeners.set(channel, listeners)
  })
  readonly removeListener = vi.fn((
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ) => {
    this.listeners.get(channel)?.delete(listener)
  })

  emit(channel: string, payload: unknown): void {
    for (const listener of this.listeners.get(channel) ?? []) listener({}, payload)
  }
}

function setup() {
  const ipcRenderer = new FakeIpcRenderer()
  ipcRenderer.responses.set(TERMINAL_CHANNELS.create, {
    ok: true,
    value: {
      sessionId,
      projectId,
      state: 'RUNNING',
      cols: 80,
      rows: 24,
      shellLabel: 'PowerShell',
    },
  })
  ipcRenderer.responses.set(TERMINAL_CHANNELS.input, { ok: true, value: null })
  ipcRenderer.responses.set(TERMINAL_CHANNELS.resize, { ok: true, value: null })
  ipcRenderer.responses.set(TERMINAL_CHANNELS.close, {
    ok: true,
    value: { status: 'closed' },
  })
  return { ipcRenderer, api: createPreloadApi(ipcRenderer) }
}

describe('Phase 2E-E terminal preload bridge', () => {
  it('invokes only the exact terminal channels with narrow payloads', async () => {
    const { api, ipcRenderer } = setup()
    await expect(api.terminal.create({ projectId, cols: 80, rows: 24 }))
      .resolves.toMatchObject({ ok: true, value: { sessionId } })
    await expect(api.terminal.input({ sessionId, data: '\x03' }))
      .resolves.toEqual({ ok: true, value: null })
    await expect(api.terminal.resize({ sessionId, cols: 100, rows: 30 }))
      .resolves.toEqual({ ok: true, value: null })
    await expect(api.terminal.close({ sessionId }))
      .resolves.toEqual({ ok: true, value: { status: 'closed' } })

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [TERMINAL_CHANNELS.create, { projectId, cols: 80, rows: 24 }],
      [TERMINAL_CHANNELS.input, { sessionId, data: '\x03' }],
      [TERMINAL_CHANNELS.resize, { sessionId, cols: 100, rows: 30 }],
      [TERMINAL_CHANNELS.close, { sessionId }],
    ])
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api.terminal).not.toHaveProperty('invoke')
    expect(api.terminal).not.toHaveProperty('send')
    expect(api.terminal).not.toHaveProperty('on')
  })

  it('validates outgoing requests before invoking Main', async () => {
    const { api, ipcRenderer } = setup()
    await expect(api.terminal.create({
      projectId,
      cols: 80,
      rows: 24,
      cwd: 'C:\\secret',
    } as never)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(api.terminal.input({ sessionId, data: '' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(ipcRenderer.invoke).not.toHaveBeenCalled()
  })

  it('validates every incoming response', async () => {
    const { api, ipcRenderer } = setup()
    ipcRenderer.responses.set(TERMINAL_CHANNELS.create, {
      ok: true,
      value: { sessionId, cwd: 'C:\\secret' },
    })
    ipcRenderer.responses.set(TERMINAL_CHANNELS.close, {
      ok: true,
      value: { status: 'maybe' },
    })
    await expect(api.terminal.create({ projectId, cols: 80, rows: 24 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    await expect(api.terminal.close({ sessionId }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
  })

  it('fans out one validated IPC subscription and unsubscribes independently', () => {
    const { api, ipcRenderer } = setup()
    const first = vi.fn()
    const second = vi.fn()
    const removeFirst = api.terminal.onEvent(first)
    const removeSecond = api.terminal.onEvent(second)
    expect(ipcRenderer.on).toHaveBeenCalledOnce()
    expect(ipcRenderer.on).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.event,
      expect.any(Function),
    )

    ipcRenderer.emit(TERMINAL_CHANNELS.event, {
      type: 'data', sessionId, projectId, sequence: 0, data: 'hello',
    })
    ipcRenderer.emit(TERMINAL_CHANNELS.event, {
      type: 'data', sessionId, projectId, sequence: -1, data: 'malformed',
    })
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()

    removeFirst()
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled()
    ipcRenderer.emit(TERMINAL_CHANNELS.event, {
      type: 'exit', sessionId, projectId, exitCode: 0, signal: null,
    })
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)

    removeSecond()
    expect(ipcRenderer.removeListener).toHaveBeenCalledOnce()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.event,
      expect.any(Function),
    )
    removeSecond()
    expect(ipcRenderer.removeListener).toHaveBeenCalledOnce()
  })
})
