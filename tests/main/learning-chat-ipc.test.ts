import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_CHANNELS as C, type ChatSession } from '../../src/shared/contracts/learning-chat'
import { chatTextHash } from '../../src/main/services/learning/chat/context-builder'
import { chatIpcFixture, chatReply, chatEnvelope, ipcKey, requireValue } from '../fixtures/learning/chat-ipc'
import { send as consent, ref, defaultSource } from '../fixtures/learning/chat'
import { request, capture, start, reference } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'
import { DesktopApplication } from '../../src/main/app/desktop-application'

const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
beforeEach(() => vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }))
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function fixture() { const f = await chatIpcFixture(); fixtures.push(f); return f }

describe('Chat Preload → IPC → configured Main → fake Gemini', () => {
  it.each([false, true])('keeps sealed IPC through window destruction, including recovery retry=%s', async failsOnce => {
    const f = await fixture(), session = await f.open(), order: string[] = []
    const business = { name: 'Chat business', stop: vi.fn(async () => { await f.config.stop(); order.push('business') }) }
    const transport = { name: 'Chat transport', stop: vi.fn(async () => { await f.ipc.stop(); order.push('transport') }) }
    let failed = false
    const window = { name: 'Recovery window', stop: vi.fn(async () => {
      expect(await f.invoke(C.closeSession, { sessionId: session.sessionId, revision: session.revision, reason: 'PANEL_CLOSED' }))
        .toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      expect(await f.rawOpen()).toMatchObject({ ok: false })
      if (failsOnce && !failed) { failed = true; throw Error('CONTROLLED_WINDOW_CLEANUP_FAILURE') }
      f.owner.dead = true; f.owner.emit('destroyed'); order.push('window')
    }) }
    const app = new DesktopApplication([business, transport, window], { shutdownLast: [window, transport] })
    app.subscribe(status => { if (status.state === 'STOPPING') f.ipc.beginShutdown() })
    await app.start()
    if (failsOnce) {
      await expect(app.shutdown()).rejects.toThrow('Application cleanup failed')
      expect(transport.stop).not.toHaveBeenCalled()
      expect(await f.invoke(C.closeSession, { sessionId: session.sessionId, revision: session.revision, reason: 'PANEL_CLOSED' })).toMatchObject({ ok: false })
    }
    await app.shutdown()
    expect(order).toEqual(['business', 'window', 'transport'])
    expect(business.stop).toHaveBeenCalledOnce(); expect(transport.stop).toHaveBeenCalledOnce()
    expect(f.owner.eventNames()).toEqual([]); expect(f.other.eventNames()).toEqual([])
    expect(() => f.invoke(C.closeSession, { sessionId: session.sessionId, revision: session.revision, reason: 'PANEL_CLOSED' })).toThrow()
    expect(f.send).not.toHaveBeenCalled()
  })
  it('two consented turns commit history, preserve UTF-16/CRLF and spend the shared ledger exactly once per turn', async () => {
    const f = await fixture(), s = await f.open()
    expect(s.context).toMatchObject({ sourceFingerprint: chatTextHash(defaultSource), eol: 'CRLF' })
    expect(f.send).not.toHaveBeenCalled()
    for (let i = 0; i < 2; i++) {
      const p = await f.prepare(s.sessionId, 'QUESTION_WITH_SOURCE', `Question ${i} 🐟\r\n`)
      expect(f.send).toHaveBeenCalledTimes(i * 2)
      expect(requireValue(await f.api.start(consent(p))).state).toBe('RUNNING')
      await f.config.chat.drain()
      const done = requireValue(await f.api.status(ref(p)))
      expect(done).toMatchObject({ state: 'COMPLETE', sequence: 2, messages: [{ role: 'user' }, { role: 'assistant', text: chatReply.text }] })
      expect(JSON.stringify(done)).not.toMatch(/proposalId|applyGrant|SmartEdit|SYNTHETIC_CHAT_IPC_KEY/)
    }
    const session = requireValue(await f.api.getSession({ sessionId: s.sessionId }))
    expect(session.messages).toHaveLength(4); expect(session.revision).toBe(2); expect(f.config.snapshot().usedRequests).toBe(2)
    const body = await f.send.mock.calls[3][0].clone().json()
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
    expect(JSON.parse(body.contents[2].parts[0].text).attachment).toEqual({ kind: 'SOURCE', source: defaultSource, eol: 'CRLF' })
  })
  it.each(['sender', 'frame', 'detached', 'destroyed-frame', 'missing-frame', 'scope'])('rejects forged %s before dispatch', async mode => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    const event = mode === 'sender' ? { ...f.event, sender: { id: 99 } } : mode === 'scope' ? { ...f.event, sender: { id: 2 } }
      : { ...f.event, senderFrame: mode === 'missing-frame' ? null : { ...f.frame,
        frameToken: mode === 'frame' ? 'subframe' : f.frame.frameToken, detached: mode === 'detached', isDestroyed: () => mode === 'destroyed-frame' } }
    const result = await f.invoke(C.start, consent(p), event)
    expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toContain('UNTRUSTED_PRIVATE_ERROR'); expect(f.send).not.toHaveBeenCalled()
  })
  it('selection scope sends only selected text; Learning context supports question-only without implicit course material', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId, 'QUESTION_WITH_SELECTION')
    requireValue(await f.api.start(consent(p))); await f.config.chat.drain()
    expect(requireValue(await f.api.status(ref(p))).state).toBe('COMPLETE')
    const input = JSON.parse((await f.send.mock.calls[1][0].clone().json()).contents[0].parts[0].text)
    expect(input.attachment).toMatchObject({ kind: 'SELECTION', text: 'return n;' }); expect(input.attachment).not.toHaveProperty('source')
    const learning = requireValue(await f.api.openSession({ context: { kind: 'LEARNING', courseId: 'synthetic', chapter: 2 } }))
    const next = await f.prepare(learning.sessionId); requireValue(await f.api.start(consent(next))); await f.config.chat.drain()
    expect(requireValue(await f.api.status(ref(next))).state).toBe('COMPLETE')
    expect(JSON.parse((await f.send.mock.calls[3][0].clone().json()).contents[0].parts[0].text).attachment).toBeNull()
  })
  it.each(['history', 'owner', 'providerGeneration', 'sourceFingerprint', 'systemInstruction', 'applyGrant'])('rejects forged %s at contract boundary', async field => {
    const f = await fixture()
    expect(await f.invoke(C.openSession, { context: { ...f.context, [field]: 'PRIVATE' } })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('catalogue, forged session/consent/revision and duplicate start cannot dispatch twice', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    for (const patch of [{ sessionId: randomUUID() }, { consentToken: randomUUID() }, { digest: 'b'.repeat(64) }, { consentGranted: false }, { revision: 9 }])
      expect(await f.invoke(C.start, { ...consent(p), ...patch })).toMatchObject({ ok: false })
    requireValue(await f.api.start(consent(p))); await f.config.chat.drain()
    expect(await f.invoke(C.start, consent(p))).toMatchObject({ ok: false }); expect(f.send).toHaveBeenCalledTimes(2)
    f.unavailable(); expect(await f.invoke(C.openSession, { context: f.context })).toMatchObject({ ok: false })
    expect(await f.invoke(C.getSession, { sessionId: s.sessionId })).toMatchObject({ ok: false })
  })
  it('updateContext cancels frozen capture; stale revision/model cannot start or preserve old replay', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    const context = { ...f.context, sourceRevision: 2, modelVersion: 2, source: defaultSource + '\r\n// edited' }
    const updated = requireValue(await f.api.updateContext({ sessionId: s.sessionId, revision: 0, context }))
    expect(updated.revision).toBe(1); expect(await f.invoke(C.start, consent(p))).toMatchObject({ ok: false })
    expect(await f.invoke(C.updateContext, { sessionId: s.sessionId, revision: 0, context })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('expired capture and session reject start without HTTP', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId); f.advance(60000)
    expect(await f.invoke(C.status, ref(p))).toMatchObject({ ok: true, value: { state: 'EXPIRED' } })
    expect(await f.invoke(C.start, consent(p))).toMatchObject({ ok: false })
    f.advance(1800000); expect(await f.invoke(C.getSession, { sessionId: s.sessionId })).toMatchObject({ ok: false }); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['navigation', 'destroyed', 'render-process-gone', 'replacement', 'context', 'shutdown'] as const)('%s revokes document history and consent', async mode => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    if (mode === 'navigation') f.owner.emit('did-start-navigation', {}, 'app', false, true)
    if (mode === 'destroyed') { f.owner.dead = true; f.owner.emit('destroyed') }
    if (mode === 'render-process-gone') f.owner.emit('render-process-gone')
    if (mode === 'context') f.ipc.invalidateOwner(1)
    if (mode === 'shutdown') f.ipc.beginShutdown()
    expect(await f.invoke(C.start, consent(p), mode === 'replacement' ? f.replaceFrame() : f.event)).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('subframe/in-place navigation does not revoke the active main document', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    f.owner.emit('did-start-navigation', {}, 'child', false, false); f.owner.emit('did-start-navigation', {}, '#same', true, true)
    expect(await f.invoke(C.status, ref(p))).toMatchObject({ ok: true, value: { state: 'PREPARED' } })
  })
  it.each(['key', 'disable', 'budget'] as const)('configuration %s change retires pending consent with no HTTP', async mode => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId)
    if (mode === 'key') await f.config.configureKey(() => {}, async () => 'AQ.SYNTHETIC_ROTATED_CHAT_KEY')
    if (mode === 'disable') await f.config.enable(false, () => {})
    if (mode === 'budget') await f.config.budget(10, () => {})
    expect(await f.invoke(C.start, consent(p))).toMatchObject({ ok: false })
    expect(await f.invoke(C.getSession, { sessionId: s.sessionId })).toMatchObject({ ok: false }); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['navigation', 'key'] as const)('%s aborts running HTTP and discards a late response', async mode => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId), pending = gate<Response>(), cancel = vi.fn()
    const original = f.send.getMockImplementation()!
    f.send.mockImplementation(r => r.method === 'GET' ? original(r) : pending.promise)
    requireValue(await f.api.start(consent(p))); await vi.waitFor(() => expect(f.config.snapshot().usedRequests).toBe(1))
    if (mode === 'navigation') f.owner.emit('did-start-navigation', {}, 'app', false, true)
    else await f.config.configureKey(() => {}, async () => 'AQ.SYNTHETIC_ROTATED_CHAT_KEY')
    await f.config.chat.drain()
    pending.resolve(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce()
    expect(await f.invoke(C.getSession, { sessionId: s.sessionId })).toMatchObject({ ok: false })
  })
  it('HTTP auth failure updates the same configuration readiness and exposes a fixed FAILED status', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId), original = f.send.getMockImplementation()!
    f.send.mockImplementation(r => r.method === 'GET' ? original(r) : Promise.resolve(Response.json({}, { status: 401 })))
    requireValue(await f.api.start(consent(p))); await f.config.chat.drain()
    expect(requireValue(await f.api.status(ref(p)))).toMatchObject({ state: 'FAILED', code: 'AUTH' })
    expect(f.config.snapshot().state).toBe('INVALID_KEY'); expect(f.config.snapshot().usedRequests).toBe(1)
  })
  it('cancel while reading body cleans reader and does not commit; malformed reply fails closed', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId), cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json({ name: `models/gemini-3.1-flash-lite`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 })
      : new Response(body, { headers: { 'content-type': 'application/json' } }))
    requireValue(await f.api.start(consent(p))); await vi.waitFor(() => expect(body.locked).toBe(true))
    expect(requireValue(await f.api.cancel(ref(p))).state).toBe('CANCELLED'); await f.config.chat.drain()
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false)
    expect(requireValue(await f.api.getSession({ sessionId: s.sessionId })).messages).toEqual([])
  })
  it('30s never applies to Chat: its 10s timeout drops late response, retains one charge and cleans up', async () => {
    const f = await fixture(), s = await f.open(), p = await f.prepare(s.sessionId), pending = gate<Response>(), cancelled = vi.fn()
    const original = f.send.getMockImplementation()!
    f.send.mockImplementation(r => r.method === 'GET' ? original(r) : pending.promise)
    vi.useFakeTimers()
    requireValue(await f.api.start(consent(p))); await vi.waitFor(() => expect(f.config.snapshot().usedRequests).toBe(1))
    f.advance(10000); await vi.advanceTimersByTimeAsync(10000)
    await f.config.chat.drain()
    pending.resolve(new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve(); await Promise.resolve()
    expect(await f.invoke(C.status, ref(p))).toMatchObject({ ok: true, value: { state: 'FAILED', code: 'TIMEOUT' } })
    expect(cancelled).toHaveBeenCalledOnce(); expect(f.config.snapshot().usedRequests).toBe(1)
  })
  it('real configured Smart Hints shares Chat slot, daily ledger and rate state', async () => {
    const f = await fixture(); await f.config.budget(1, () => {})
    const s = await f.open(), p = await f.prepare(s.sessionId), pending = gate<Response>(), original = f.send.getMockImplementation()!
    f.send.mockImplementation(r => r.method === 'GET' ? original(r) : pending.promise)
    requireValue(await f.api.start(consent(p))); await vi.waitFor(() => expect(f.config.snapshot().usedRequests).toBe(1))
    const q = request(), hp = await f.config.service.prepare(2, 'smart-document', q, () => {}, async g => capture(q, g))
    expect(f.config.service.start(2, 'smart-document', start(hp))).toMatchObject({ state: 'FAILED', code: 'BUSY' })
    pending.resolve(Response.json(chatEnvelope())); await f.config.chat.drain()
    expect(requireValue(await f.api.status(ref(p))).state).toBe('COMPLETE')
    const next = await f.prepare(s.sessionId); requireValue(await f.api.start(consent(next))); await f.config.chat.drain()
    expect(await f.invoke(C.status, ref(next))).toMatchObject({ ok: true, value: { state: 'FAILED', code: 'RATE_LIMIT' } })
    expect(f.config.snapshot().usedRequests).toBe(1)
    expect(f.config.service.status(2, 'smart-document', reference(hp)).state).toBe('FAILED')
  })
  it('request containing the configured key is rejected at prepare without transmission', async () => {
    const f = await fixture(), s = await f.open()
    expect(await f.invoke(C.prepare, { sessionId: s.sessionId, revision: 0, requestId: randomUUID(), scope: 'QUESTION_ONLY', question: ipcKey, attachment: null })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('close validates session/revision; shutdown unregisters channels and owner listeners', async () => {
    const f = await fixture(), s = await f.open()
    expect(await f.invoke(C.closeSession, { sessionId: s.sessionId, revision: 9, reason: 'PANEL_CLOSED' })).toMatchObject({ ok: false })
    expect(await f.api.closeSession({ sessionId: s.sessionId, revision: 0, reason: 'PANEL_CLOSED' })).toEqual({ ok: true, value: null })
    expect(await f.invoke(C.getSession, { sessionId: s.sessionId })).toMatchObject({ ok: false })
    await f.ipc.stop(); expect(f.owner.eventNames()).toEqual([])
  })
  it('invalid service response is rejected by Main before crossing IPC', async () => {
    const f = await fixture()
    vi.spyOn(f.config.chat, 'openSession').mockReturnValue({ proposalId: 'forged' } as unknown as ChatSession)
    expect(await f.rawOpen()).toMatchObject({ ok: false })
  })
})
