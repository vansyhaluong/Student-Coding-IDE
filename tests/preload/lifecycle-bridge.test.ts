import { describe, expect, it, vi } from 'vitest'

import { createPreloadApi } from '../../src/preload/bridge'
import {
  createLifecycleBridge,
  type IpcRendererLike,
} from '../../src/preload/bridge/lifecycle'
import { LIFECYCLE_CHANNELS } from '../../src/shared/contracts'

class FakeIpcRenderer implements IpcRendererLike {
  response: unknown = { ok: true, value: { state: 'RUNNING' } }
  readonly listeners = new Map<string, (
    event: { sender?: unknown },
    payload: unknown,
  ) => void>()
  readonly removeListener = vi.fn()

  async invoke(channel: string, payload: unknown): Promise<unknown> {
    void channel
    void payload
    return this.response
  }

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

describe('lifecycle preload bridge', () => {
  it('exposes only the narrow lifecycle domain API', () => {
    const api = createPreloadApi(new FakeIpcRenderer())
    expect(Object.keys(api).sort()).toEqual([
      'file',
      'git',
      'lifecycle',
      'project',
      'run',
      'search',
      'terminal',
    ])
    expect(Object.keys(api.lifecycle).sort()).toEqual([
      'getStatus',
      'onProjectTransitionSettled',
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

    ipcRenderer.emit(LIFECYCLE_CHANNELS.statusChanged, { state: 'RUNNING' })
    ipcRenderer.emit(LIFECYCLE_CHANNELS.statusChanged, { state: 'UNKNOWN' })
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      LIFECYCLE_CHANNELS.statusChanged,
      ipcRenderer.listeners.get(LIFECYCLE_CHANNELS.statusChanged),
    )
  })

  it('validates project transition settlement events and cleans up its listener', () => {
    const ipcRenderer = new FakeIpcRenderer()
    const listener = vi.fn()
    const unsubscribe = createLifecycleBridge(ipcRenderer)
      .onProjectTransitionSettled(listener)
    const transitionId = '12345678-1234-4123-8123-123456789abc'

    ipcRenderer.emit(LIFECYCLE_CHANNELS.projectTransitionSettled, {
      transitionId,
      outcome: 'failed',
    })
    ipcRenderer.emit(LIFECYCLE_CHANNELS.projectTransitionSettled, {
      transitionId: 'stale',
      outcome: 'failed',
    })
    ipcRenderer.emit(LIFECYCLE_CHANNELS.projectTransitionSettled, {
      transitionId,
      outcome: 'failed',
      rawError: 'must not pass validation',
    })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ transitionId, outcome: 'failed' })
    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      LIFECYCLE_CHANNELS.projectTransitionSettled,
      ipcRenderer.listeners.get(LIFECYCLE_CHANNELS.projectTransitionSettled),
    )
  })

  it('normalizes transport rejection without exposing its raw error', async () => {
    const ipcRenderer = new FakeIpcRenderer()
    vi.spyOn(ipcRenderer, 'invoke').mockRejectedValueOnce(
      new Error('raw lifecycle transport stack'),
    )

    await expect(createLifecycleBridge(ipcRenderer).getStatus()).resolves.toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The application request could not be completed.',
        details: { boundaryFailure: 'transport' },
        retryable: true,
      },
    })
  })
})
