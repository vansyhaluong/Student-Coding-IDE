import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { AI_CHANNELS, type AiChatEvent } from '../../src/shared/contracts/ai'
import { AiIpcService } from '../../src/main/ipc/ai-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike, type IpcSenderFrame } from '../../src/main/ipc/ipc-handler-registry'
import { OllamaService } from '../../src/main/services/ai/ollama-service'
import { createAiBridge } from '../../src/preload/bridge/ai'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { DomainError } from '../../src/main/errors/app-error'

const messages = [{ role: 'user' as const, content: 'Hello' }]
function setup() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } })
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:1.7b' }] })
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; streams.push(value) } })
    init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
    return new Response(body)
  })
  const recipients = new Map<number, Set<Parameters<IpcRendererLike['on']>[1]>>()
  const publish = vi.fn((owner: number, event: AiChatEvent) => { for (const listener of recipients.get(owner) ?? []) listener({}, event) })
  const authorize = vi.fn()
  const service = new AiIpcService(registry, new OllamaService(http), authorize, publish)
  service.start()
  const frame: IpcSenderFrame = { frameToken: 'document-a', processId: 10, detached: false, isDestroyed: () => false }
  const connect = (id: number, senderFrame = frame) => {
    const listeners = new Set<Parameters<IpcRendererLike['on']>[1]>()
    recipients.set(id, listeners)
    const invoke = vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id }, senderFrame }, payload))
    const bridge = createAiBridge({ invoke, on: (_channel, listener) => { listeners.add(listener) }, removeListener: (_channel, listener) => { listeners.delete(listener) } })
    return { invoke, bridge, listeners }
  }
  const client = connect(7)
  const send = (content: string, done = false, streamIndex = streams.length - 1) => streams[streamIndex].enqueue(new TextEncoder().encode(JSON.stringify({ message: { role: 'assistant', content }, done }) + '\n'))
  return { handlers, http, authorize, service, ...client, publish, send, connect, frame }
}

describe('AI streaming IPC/preload', () => {
  it('isolates two renderer streams and refuses cross-owner cancellation', async () => {
    const { bridge: a, connect, http, send, service } = setup()
    const { bridge: b } = connect(8)
    const eventsA: AiChatEvent[] = []
    const eventsB: AiChatEvent[] = []
    a.onChatEvent(event => eventsA.push(event))
    b.onChatEvent(event => eventsB.push(event))
    try {
      const first = await a.startChat({ messages })
      await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
      const second = await b.startChat({ messages })
      await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(4))
      if (!first.ok || !second.ok) throw new Error('Start failed')
      await b.stopChat(first.value.requestId)
      expect(http.mock.calls[1][1]?.signal?.aborted).toBe(false)
      expect(http.mock.calls[3][1]?.signal?.aborted).toBe(false)
      send('Only A', true, 0)
      send('Only B', true, 1)
      await vi.waitFor(() => {
        expect(eventsA).toEqual([
          { requestId: first.value.requestId, type: 'chunk', content: 'Only A' },
          { requestId: first.value.requestId, type: 'complete' },
        ])
        expect(eventsB).toEqual([
          { requestId: second.value.requestId, type: 'chunk', content: 'Only B' },
          { requestId: second.value.requestId, type: 'complete' },
        ])
      })
    } finally { service.stop() }
  })
  it.each([{ frameToken: 'other-document' }, { processId: 99 }])('rejects stop from a mismatched document: %j', async mismatch => {
    const { bridge, handlers, frame, http, service } = setup()
    try {
      const first = await bridge.startChat({ messages })
      if (!first.ok) throw new Error('Start failed')
      await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
      await expect(handlers.get(AI_CHANNELS.stopChat)!({ sender: { id: 7 }, senderFrame: { ...frame, ...mismatch } }, first.value))
        .resolves.toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
      expect(http.mock.calls[1][1]?.signal?.aborted).toBe(false)
      await bridge.stopChat(first.value.requestId)
      expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    } finally { service.stop() }
  })
  it('aborts without publishing when the originating frame loses authorization', async () => {
    const { bridge, authorize, http, send, publish, service } = setup()
    try {
      await bridge.startChat({ messages })
      await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
      authorize.mockImplementation(() => { throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Detached frame.', retryable: false }) })
      send('Must not reach renderer')
      await vi.waitFor(() => expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true))
      expect(publish).not.toHaveBeenCalled()
      await expect(bridge.getStatus()).resolves.toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    } finally { service.stop() }
  })
  it('round trips typed events in order, completes once and removes subscriptions/handlers', async () => {
    const { bridge, http, send, publish, service, handlers, listeners } = setup()
    const events: AiChatEvent[] = []
    const unsubscribe = bridge.onChatEvent(event => events.push(event))
    expect(Object.keys(bridge).sort()).toEqual(['getStatus', 'onChatEvent', 'startChat', 'stopChat'])
    await expect(bridge.getStatus()).resolves.toEqual({ ok: true, value: 'ready' })
    const result = await bridge.startChat({ messages })
    expect(result.ok).toBe(true)
    await vi.waitFor(() => expect(http.mock.calls.some(([url]) => String(url).endsWith('/api/chat'))).toBe(true))
    send('Hello ')
    send('world', true)
    await vi.waitFor(() => expect(events.map(event => event.type)).toEqual(['chunk', 'chunk', 'complete']))
    expect(new Set(events.map(event => event.requestId)).size).toBe(1)
    expect(publish.mock.calls.every(([owner]) => owner === 7)).toBe(true)
    unsubscribe()
    expect(listeners.size).toBe(0)
    service.stop()
    expect(handlers.size).toBe(0)
  })
  it('blocks overlap, safely stops, aborts HTTP and allows another request', async () => {
    const { bridge, http, publish, service } = setup()
    const first = await bridge.startChat({ messages })
    if (!first.ok) throw new Error('Start failed')
    await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
    await expect(bridge.startChat({ messages })).resolves.toMatchObject({ ok: false })
    await expect(bridge.stopChat(first.value.requestId)).resolves.toEqual({ ok: true, value: null })
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    await expect(bridge.stopChat(first.value.requestId)).resolves.toMatchObject({ ok: true })
    expect(publish.mock.calls.map(([, event]) => event.type)).toEqual(['stopped'])
    const second = await bridge.startChat({ messages })
    expect(second.ok).toBe(true)
    await bridge.stopChat(first.value.requestId)
    await expect(bridge.startChat({ messages })).resolves.toMatchObject({ ok: false })
    service.stop()
  })
  it('does not let another sender cancel a request', async () => {
    const { bridge, handlers, service } = setup()
    const first = await bridge.startChat({ messages })
    if (!first.ok) throw new Error('Start failed')
    await handlers.get(AI_CHANNELS.stopChat)!({ sender: { id: 8 } }, first.value)
    await expect(bridge.startChat({ messages })).resolves.toMatchObject({ ok: false })
    service.stop()
  })
  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'])('cancels on %s without late events', async event => {
    const { bridge, service, http, publish } = setup()
    const owner = Object.assign(new EventEmitter(), { id: 7 })
    service.observe(owner as never)
    await bridge.startChat({ messages })
    await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
    owner.emit(event, {}, 'file://renderer', false, true)
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(publish).not.toHaveBeenCalled()
    service.stop()
    expect(owner.eventNames()).toHaveLength(0)
  })
  it('delivers sanitized errors through the validated preload event', async () => {
    const { bridge, http, service } = setup()
    http.mockRejectedValue(new Error('private detail'))
    const events: AiChatEvent[] = []
    bridge.onChatEvent(event => events.push(event))
    await bridge.startChat({ messages })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({ type: 'error', error: { code: 'DEPENDENCY_MISSING' } })
    expect(JSON.stringify(events)).not.toContain('private detail')
    service.stop()
  })
  it.each([
    { messages, model: 'other' }, { messages, url: 'https://example.com' },
    { messages: [{ role: 'system', content: 'Hi' }] },
    { messages: [{ role: 'user', content: 'Hi', tools: [] }] }, { messages: [] },
  ])('rejects invalid requests at both boundaries: %j', async payload => {
    const { bridge, invoke, http, service } = setup()
    await expect(invoke(AI_CHANNELS.startChat, payload)).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(bridge.startChat(payload as never)).resolves.toMatchObject({ ok: false })
    expect(invoke).toHaveBeenCalledOnce()
    expect(http).not.toHaveBeenCalled()
    service.stop()
  })
  it('rejects unauthorized callers, invalid stop IDs and malformed events', async () => {
    const { authorize, bridge, listeners, http, service } = setup()
    authorize.mockImplementation(() => { throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Not authorized.', retryable: false }) })
    await expect(bridge.startChat({ messages })).resolves.toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    await expect(bridge.stopChat('bad')).resolves.toMatchObject({ ok: false })
    const listener = vi.fn()
    bridge.onChatEvent(listener)
    for (const callback of listeners) callback({}, { type: 'chunk', requestId: 'bad', content: 3 })
    expect(listener).not.toHaveBeenCalled()
    expect(http).not.toHaveBeenCalled()
    service.stop()
  })
})
