import { describe, expect, it, vi } from 'vitest'

import { createPreloadApi } from '../../src/preload/bridge'
import {
  createLifecycleBridge,
  type IpcRendererLike,
} from '../../src/preload/bridge/lifecycle'
import { LIFECYCLE_CHANNELS } from '../../src/shared/contracts'

class FakeIpcRenderer implements IpcRendererLike {
  response: unknown = { ok: true, value: { state: 'RUNNING' } }
  listener:
    | ((event: { sender?: unknown }, payload: unknown) => void)
    | undefined
  readonly removeListener = vi.fn()

  async invoke(channel: string, payload: unknown): Promise<unknown> {
    void channel
    void payload
    return this.response
  }

  on(
    _channel: string,
    listener: (event: { sender?: unknown }, payload: unknown) => void,
  ): void {
    this.listener = listener
  }
}

describe('lifecycle preload bridge', () => {
  it('exposes only the narrow lifecycle domain API', () => {
    const api = createPreloadApi(new FakeIpcRenderer())
    expect(Object.keys(api).sort()).toEqual([
      'file',
      'lifecycle',
      'project',
      'search',
      'terminal',
    ])
    expect(Object.keys(api.lifecycle).sort()).toEqual([
      'getStatus',
      'onStatusChanged',
      'onUnsavedTransitionRequested',
      'resolveUnsavedTransition',
    ])
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('execute')
  })

  it('uses a narrow validated transition resolution call', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    ipcRenderer.response = { ok: true, value: null }
    const invoke = vi.spyOn(ipcRenderer, 'invoke')
    const bridge = createLifecycleBridge(ipcRenderer)
    await expect(bridge.resolveUnsavedTransition(
      '12345678-1234-4123-8123-123456789abc',
      false,
    )).resolves.toEqual({ ok: true, value: null })
    expect(invoke).toHaveBeenCalledWith(
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      {
        transitionId: '12345678-1234-4123-8123-123456789abc',
        proceed: false,
      },
    )
  })

  it('returns a validated response and rejects malformed main responses', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    const bridge = createLifecycleBridge(ipcRenderer)
    await expect(bridge.getStatus()).resolves.toEqual({
      ok: true,
      value: { state: 'RUNNING' },
    })

    ipcRenderer.response = { ok: true, value: { state: 'UNKNOWN' } }
    await expect(bridge.getStatus()).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    })
  })

  it('returns an unsubscribe function and ignores malformed events', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const listener = vi.fn()
    const unsubscribe = createLifecycleBridge(ipcRenderer)
      .onStatusChanged(listener)

    ipcRenderer.listener?.({}, { state: 'RUNNING' })
    ipcRenderer.listener?.({}, { state: 'UNKNOWN' })
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      LIFECYCLE_CHANNELS.statusChanged,
      ipcRenderer.listener,
    )
  })
})
