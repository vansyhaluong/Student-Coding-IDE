import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_CHANNELS as C, type ChatStatus } from '../../src/shared/contracts/learning-chat'
import { createLearningChatBridge } from '../../src/preload/bridge/learning-chat'
import { createPreloadApi } from '../../src/preload/bridge'
import { chatIpcFixture, requireValue } from '../fixtures/learning/chat-ipc'
import { ref, send as consent } from '../fixtures/learning/chat'
import { gate } from '../fixtures/learning/analysis'
import { LIFECYCLE_CHANNELS } from '../../src/shared/contracts/lifecycle'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
type IpcListener = Parameters<IpcRendererLike['on']>[1]

const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
beforeEach(() => vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }))
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function fixture() { const f = await chatIpcFixture(); fixtures.push(f); return f }

describe('typed Chat Preload validation and response correlation', () => {
  it.each(['STOPPING', 'STOPPED'])('%s revokes transport before React cleanup and removes its listener', async state => {
    const f = await fixture(), listeners = new Map<string, IpcListener>()
    const transport = { ...f.transport, on: vi.fn((channel, listener) => listeners.set(channel, listener)),
      removeListener: vi.fn(channel => listeners.delete(channel)) }
    const api = createLearningChatBridge(transport, undefined)
    const s = requireValue(await api.openSession({ context: f.context }))
    const stopping = listeners.get(LIFECYCLE_CHANNELS.statusChanged)!
    stopping({}, { state: 'INVALID' }); stopping({}, null); stopping({}, { state: 'RUNNING' })
    requireValue(await api.getSession({ sessionId: s.sessionId }))
    const calls = f.transport.invoke.mock.calls.length
    stopping({}, { state })
    expect(await api.closeSession({ sessionId: s.sessionId, revision: s.revision, reason: 'PANEL_CLOSED' })).toMatchObject({ ok: false })
    expect(await api.getSession({ sessionId: s.sessionId })).toMatchObject({ ok: false })
    expect(await api.openSession({ context: f.context })).toMatchObject({ ok: false })
    expect(f.transport.invoke).toHaveBeenCalledTimes(calls)
    expect(listeners.size).toBe(0)
    expect(transport.removeListener).toHaveBeenCalledOnce()
    expect(f.send).not.toHaveBeenCalled()
  })
  it('STOPPING rejects an in-flight acknowledgement without another close IPC', async () => {
    const f = await fixture(), pending = gate<unknown>()
    let onStatus!: IpcListener
    const invoke = vi.fn(async (channel, value) => { const result = await f.transport.invoke(channel, value); await pending.promise; return result })
    const api = createLearningChatBridge({ ...f.transport, invoke,
      on: (_channel, listener) => { onStatus = listener }, removeListener() {} }, undefined)
    const opening = api.openSession({ context: f.context })
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce())
    onStatus({}, { state: 'STOPPING' })
    pending.resolve({ ok: true, value: {} })
    expect(await opening).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('is exposed through studentIde.learning.chat with only semantic methods and no constructor inference', async () => {
    const f = await fixture(), api = createPreloadApi(f.transport).learning.chat
    expect(Object.keys(api).sort()).toEqual(Object.keys(C).sort()); expect(f.send).not.toHaveBeenCalled(); expect(f.transport.invoke).not.toHaveBeenCalled()
  })
  it.each(['openSession', 'getSession', 'closeSession', 'updateContext', 'prepare', 'start', 'status', 'cancel'] as const)('%s validates malformed input before IPC', async method => {
    const f = await fixture()
    expect(await f.api[method]({ secret: 'PRIVATE' } as never)).toMatchObject({ ok: false }); expect(f.transport.invoke).not.toHaveBeenCalled()
  })
  it.each(['session', 'binding', 'revision', 'scope', 'sequence', 'authority'] as const)('rejects invalid prepared %s response', async field => {
    const f = await fixture(), s = await f.open(), original = f.transport.invoke.getMockImplementation()!
    f.transport.invoke.mockImplementation(async (c, q) => {
      const r = await original(c, q) as { ok: boolean; value: ChatStatus }
      if (c === C.prepare && r.ok) {
        if (field === 'session') r.value.sessionId = randomUUID()
        if (field === 'binding') r.value.binding.context = { kind: 'LEARNING', courseId: 'synthetic', chapter: 2 }
        if (field === 'revision') r.value.binding.revision++
        if (field === 'scope') r.value.binding.scope = 'QUESTION_WITH_SOURCE'
        if (field === 'sequence') r.value.sequence = 99
        if (field === 'authority') Object.assign(r.value, { applyGrant: randomUUID() })
      }
      return r
    })
    expect(await f.api.prepare({ sessionId: s.sessionId, revision: 0, requestId: randomUUID(), scope: 'QUESTION_ONLY', attachment: null, question: 'Explain.' })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('rejects changed same-sequence payload and lower sequence, retaining the last valid binding', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId), original = f.transport.invoke.getMockImplementation()!
    f.transport.invoke.mockImplementation(async (c, q) => {
      const r = await original(c, q) as { ok: boolean; value: ChatStatus }
      if (c === C.status && r.ok && r.value.state === 'PREPARED') r.value.consentToken = randomUUID()
      return r
    })
    expect(await f.api.status(ref(p))).toMatchObject({ ok: false })
    f.transport.invoke.mockImplementation(original)
    requireValue(await f.api.cancel(ref(p)))
    f.transport.invoke.mockResolvedValue({ ok: true, value: p })
    expect(await f.api.status(ref(p))).toMatchObject({ ok: false })
  })
  it('a delayed prepare cannot return into a new source revision', async () => {
    const f = await fixture(), s = await f.open(), waiting = gate<unknown>(), original = f.transport.invoke.getMockImplementation()!
    f.transport.invoke.mockImplementation(async (c, q) => c === C.prepare ? (await original(c, q), waiting.promise) : original(c, q))
    const request = f.api.prepare({ sessionId: s.sessionId, revision: 0, requestId: randomUUID(), scope: 'QUESTION_ONLY', question: 'Explain.', attachment: null })
    await vi.waitFor(() => expect(f.transport.invoke.mock.calls.some(([c]) => c === C.prepare)).toBe(true))
    requireValue(await f.api.updateContext({ sessionId: s.sessionId, revision: 0, context: { ...f.context, sourceRevision: 2, modelVersion: 2 } }))
    waiting.resolve({ ok: true, value: {} }); expect(await request).toMatchObject({ ok: false })
  })
  it('same request ID cannot change its question or consent scope', async () => {
    const f = await fixture(), s = await f.open(), id = randomUUID()
    const q = { sessionId: s.sessionId, revision: 0, requestId: id, scope: 'QUESTION_ONLY' as const, question: 'Explain.', attachment: null }
    requireValue(await f.api.prepare(q)); const calls = f.transport.invoke.mock.calls.length
    expect(await f.api.prepare({ ...q, question: 'different' })).toMatchObject({ ok: false })
    expect(f.transport.invoke).toHaveBeenCalledTimes(calls)
  })
  it('unload disposes correlations and rejects a late response, without a provider call', async () => {
    const f = await fixture(), listeners = new Map<string, EventListener>(), pending = gate<unknown>()
    const api = createLearningChatBridge({ ...f.transport, invoke: async () => pending.promise }, {
      addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => { listeners.set(name, listener as EventListener) },
      removeEventListener: (name: string) => { listeners.delete(name) } })
    const request = api.openSession({ context: f.context })
    listeners.get('unload')!(new Event('unload')); pending.resolve({ ok: true, value: {} })
    expect(await request).toMatchObject({ ok: false }); expect(listeners.size).toBe(0); expect(f.send).not.toHaveBeenCalled()
  })
  it('provider failure returns a fixed safe error; rejected transport exposes no raw exception', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    f.transport.invoke.mockRejectedValue(new Error('PRIVATE_PATH API_KEY'))
    const result = await f.api.start(consent(p))
    expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PATH|API_KEY/)
  })
})
