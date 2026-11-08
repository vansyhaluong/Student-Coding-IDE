import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatContext, ChatPrepare, ChatScope } from '../../src/shared/contracts/learning-chat'
import { isChatStatus } from '../../src/shared/contracts/learning-chat-validation'
import { ChatService } from '../../src/main/services/learning/chat/service'
import { chatTextHash } from '../../src/main/services/learning/chat/context-builder'
import { SharedExecutionCoordinator } from '../../src/main/services/learning/smart-hints/execution-coordinator'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { SmartHintsConfiguration } from '../../src/main/services/learning/smart-hints/configuration'
import { SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import { GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-transport'
import { defaultSource, selection, send as consent, ref, secret } from '../fixtures/learning/chat'
import { capture, request, start, reference, output } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const key = 'AQ.SYNTHETIC_CHAT_SERVICE_KEY'
const metadata = { name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 }
const reply = { kind: 'CHAT_REPLY', text: 'Advisory only 🐟\r\nIllustrative example.' }
const envelope = (value: unknown = reply) => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] })
const services: ChatService[] = [], hints: SmartHintsService[] = [], configs: SmartHintsConfiguration[] = [], roots: string[] = []
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(async () => {
  for (const s of services.splice(0)) await s.stop()
  for (const s of hints.splice(0)) await s.stop()
  for (const c of configs.splice(0)) await c.stop()
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function fixture(injected?: SharedExecutionCoordinator) {
  let now = Date.now(), generation = 1, available = true, source = defaultSource
  const owner = { id: 1, scope: randomUUID() }, check = vi.fn()
  let context: ChatContext = { kind: 'PRACTICE', exerciseId: 'synthetic', language: 'javascript', sourceRevision: 1,
    modelId: randomUUID(), modelVersion: 1, eol: 'CRLF', sourceFingerprint: chatTextHash(source) }
  const reserve = vi.fn(async (signal: AbortSignal) => { if (signal.aborted) throw new SmartProviderError('TIMEOUT') })
  const coordinator = injected ?? new SharedExecutionCoordinator(() => now, reserve)
  let retirement: ((reason: 'PROVIDER_CHANGED' | 'KEY_CHANGED') => void) | undefined
  const unsubscribe = vi.fn(() => { retirement = undefined })
  const send = vi.fn(async (r: Request): Promise<Response> => Response.json(r.method === 'GET' ? metadata : envelope()))
  const service = new ChatService({ coordinator, provider: { current: () => ({ generation, available }), transport: { send },
    credential: { value: () => key }, onRetire: listener => { retirement = listener; return unsubscribe } },
    contentPolicy: { allows: text => ![secret, Buffer.from(secret).toString('base64')].some(s => text.includes(s)) }, clock: () => now })
  services.push(service)
  let session = service.openSession(owner, context, check)
  const snapshot = () => service.getSession(owner, session.sessionId)
  const prepare = (scope: ChatScope = 'QUESTION_ONLY', question = 'Explain this.', selected = 'return n;') => {
    const base = { sessionId: session.sessionId, revision: snapshot().revision, requestId: randomUUID(), question }
    const q: ChatPrepare = scope === 'QUESTION_ONLY' ? { ...base, scope, attachment: null } : scope === 'QUESTION_WITH_SOURCE'
      ? { ...base, scope, attachment: { source } } : { ...base, scope, attachment: { source, selection: selection(source, selected) } }
    return service.prepare(owner, q)
  }
  const complete = async (scope: ChatScope = 'QUESTION_ONLY', question?: string) => {
    const p = prepare(scope, question); service.start(owner, consent(p)); await service.drain()
    return service.status(owner, ref(p))
  }
  const update = () => {
    if (context.kind !== 'PRACTICE') throw Error()
    source += '\r\n// new source'
    context = { ...context, sourceRevision: context.sourceRevision + 1, modelVersion: context.modelVersion + 1, sourceFingerprint: chatTextHash(source) }
    return service.updateContext(owner, session.sessionId, snapshot().revision, context, check)
  }
  return { service, coordinator, reserve, send, owner, check, unsubscribe, prepare, snapshot, complete, update,
    advance: (ms: number) => { now += ms }, retire: (reason: 'PROVIDER_CHANGED' | 'KEY_CHANGED') => { generation++; retirement?.(reason) },
    changeSilently: () => { generation++ }, unavailable: () => { available = false }, context: () => context,
    reopen: (next = context) => { context = next; session = service.openSession(owner, next, check); return session } }
}

describe('ChatService orchestration, fake Gemini only', () => {
  it('prepare is immutable/consented and network-free; start commits one validated pair with monotonic status/revision', async () => {
    const f = fixture(), p = f.prepare('QUESTION_WITH_SELECTION', 'Why? 🐟\r\n')
    expect(p).toMatchObject({ state: 'PREPARED', sequence: 0, manifest: { tokenCount: null, publicRun: false } })
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
    const forged = structuredClone(p); forged.manifest.scope = 'QUESTION_WITH_SOURCE'
    expect(f.service.status(f.owner, ref(p))).toEqual(p)
    expect(f.service.start(f.owner, consent(p))).toMatchObject({ state: 'RUNNING', sequence: 1 })
    await f.service.drain()
    const done = f.service.status(f.owner, ref(p))
    expect(done).toMatchObject({ state: 'COMPLETE', sequence: 2 }); expect(isChatStatus(done)).toBe(true)
    expect(f.snapshot()).toMatchObject({ revision: 1, messages: [{ role: 'user', text: 'Why? 🐟\r\n' }, { role: 'assistant', text: reply.text }] })
    expect(f.reserve).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(done)).not.toMatch(/proposalId|applyGrant|SmartEdit|consentToken|SYNTHETIC_CHAT_SERVICE_KEY/)
    expect(f.service.cancel(f.owner, ref(p))).toEqual(done)
    expect(() => f.service.start(f.owner, consent(p))).toThrow()
    expect(f.send).toHaveBeenCalledTimes(2)
  })
  it('multi-turn replays only eligible Main history; revision change retains timeline but excludes prior context', async () => {
    const f = fixture()
    await f.complete('QUESTION_WITH_SOURCE', 'BROAD_CANARY')
    await f.complete('QUESTION_ONLY', 'narrow')
    const narrow = await f.send.mock.calls[3][0].json()
    expect(narrow.contents).toHaveLength(1); expect(JSON.stringify(narrow)).not.toContain('BROAD_CANARY')
    await f.complete('QUESTION_ONLY', 'follow-up')
    expect((await f.send.mock.calls[5][0].json()).contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
    f.update(); expect(f.snapshot().messages).toHaveLength(6)
    await f.complete()
    expect((await f.send.mock.calls[7][0].json()).contents).toHaveLength(1)
  })
  it.each(['owner', 'scope', 'token', 'digest', 'consent', 'extra', 'revision'])('rejects forged %s before admission/network', mode => {
    const f = fixture(), p = f.prepare(), q = consent(p)
    if (mode === 'token') q.consentToken = randomUUID()
    if (mode === 'digest') q.digest = 'a'.repeat(64)
    if (mode === 'revision') f.update()
    const payload = mode === 'consent' ? { ...q, consentGranted: false } : mode === 'extra' ? { ...q, history: [] } : q
    const owner = mode === 'owner' ? { ...f.owner, id: 2 } : mode === 'scope' ? { ...f.owner, scope: randomUUID() } : f.owner
    expect(() => f.service.start(owner, payload)).toThrow()
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
    expect(f.coordinator.rateLimitReset()).toBeNull()
  })
  it('duplicate RUNNING start cannot acquire admission/reserve twice', async () => {
    const f = fixture(), pending = gate<Response>(), p = f.prepare()
    f.send.mockImplementation(() => pending.promise)
    f.service.start(f.owner, consent(p)); expect(() => f.service.start(f.owner, consent(p))).toThrow()
    await Promise.resolve(); f.service.cancel(f.owner, ref(p)); await f.service.drain()
    pending.resolve(Response.json(metadata)); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('capture and session TTL expire without sending', () => {
    const f = fixture(), p = f.prepare(); f.advance(60000)
    expect(f.service.status(f.owner, ref(p))).toMatchObject({ state: 'EXPIRED', sequence: 1 })
    expect(() => f.service.start(f.owner, consent(p))).toThrow()
    f.advance(1800000); expect(() => f.snapshot()).toThrow()
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('cancelling PREPARED consumes no admission and terminal cancellation cannot start', () => {
    const f = fixture(), p = f.prepare()
    expect(f.service.cancel(f.owner, ref(p))).toMatchObject({ state: 'CANCELLED', sequence: 1 })
    expect(() => f.service.start(f.owner, consent(p))).toThrow()
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
    expect(f.coordinator.rateLimitReset()).toBeNull()
  })
  it('unavailable configuration invalidates a consented capture before dispatch', () => {
    const f = fixture(), p = f.prepare(); f.unavailable()
    expect(f.service.start(f.owner, consent(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' }); expect(() => f.reopen()).toThrow()
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('expired session aborts an in-flight request and purges history', async () => {
    vi.useFakeTimers()
    const f = fixture(); f.advance(1800000 - 5000)
    const p = f.prepare(), pending = gate<Response>(); f.send.mockImplementation(() => pending.promise)
    f.service.start(f.owner, consent(p)); await Promise.resolve()
    f.advance(5000); await vi.advanceTimersByTimeAsync(5000); await f.service.drain()
    expect(() => f.snapshot()).toThrow(); pending.resolve(Response.json(metadata))
  })
  it('checks the absolute deadline after a response even before its timer runs', async () => {
    const f = fixture()
    f.send.mockImplementation(async r => {
      if (r.method === 'GET') return Response.json(metadata)
      f.advance(10000); return Response.json(envelope())
    })
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(f.snapshot().messages).toEqual([])
  })
  it.each([400, 401, 429, 503])('HTTP %i fails without history or retry', async status => {
    const f = fixture()
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : Response.json({}, { status }))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: status === 401 ? 'AUTH' : status === 429 ? 'RATE_LIMIT' : 'PROVIDER' })
    expect(f.snapshot().messages).toEqual([]); expect(f.send).toHaveBeenCalledTimes(2); expect(f.reserve).toHaveBeenCalledOnce()
  })
  it.each([{ kind: 'CHAT_REPLY', text: '' }, { ...reply, proposalId: randomUUID() }, { kind: 'EDIT_PROPOSAL', edits: [] }, { kind: 'CHAT_REPLY', text: secret }])('invalid/unsafe reply never commits', async value => {
    const f = fixture(); f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : envelope(value)))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    expect(f.snapshot().messages).toEqual([]); expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('six/minute and thirty/hour rate window belongs to the injected coordinator', async () => {
    const f = fixture()
    for (let i = 0; i < 6; i++) expect((await f.complete()).state).toBe('COMPLETE')
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
    expect(f.reserve).toHaveBeenCalledTimes(6)
    for (let i = 6; i < 30; i++) { f.advance(61000); expect((await f.complete()).state).toBe('COMPLETE') }
    f.advance(61000); expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
    expect(f.reserve).toHaveBeenCalledTimes(30)
  })
  it('failed daily reservation is not retried, charged twice or dispatched', async () => {
    const f = fixture(); f.reserve.mockRejectedValueOnce(new SmartProviderError('RATE_LIMIT'))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
    expect(f.reserve).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledOnce(); expect(f.snapshot().messages).toEqual([])
    expect((await f.complete()).state).toBe('COMPLETE'); expect(f.reserve).toHaveBeenCalledTimes(2)
  })
  it.each(['cancel', 'timeout', 'source', 'check'])('%s blocks a late response and releases the shared active slot', async mode => {
    vi.useFakeTimers()
    const f = fixture(), pending = gate<Response>(), p = f.prepare()
    const cancelled = vi.fn()
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : pending.promise)
    f.service.start(f.owner, consent(p))
    await vi.waitFor(() => expect(f.reserve).toHaveBeenCalledOnce())
    if (mode === 'cancel') f.service.cancel(f.owner, ref(p))
    if (mode === 'source') f.update()
    if (mode === 'check') { f.check.mockImplementation(() => { throw Error('OWNER_STALE') }); expect(() => f.snapshot()).toThrow() }
    if (mode === 'timeout') { f.advance(10000); await vi.advanceTimersByTimeAsync(10000) }
    await f.service.drain(); await f.coordinator.drain()
    pending.resolve(new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve(); await Promise.resolve()
    expect(cancelled).toHaveBeenCalledOnce()
    if (mode !== 'check') {
      expect(f.snapshot().messages).toEqual([])
      expect(f.service.status(f.owner, ref(p))).toMatchObject(mode === 'timeout' ? { state: 'FAILED', code: 'TIMEOUT', sequence: 2 } : { state: 'CANCELLED', sequence: 2 })
    }
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('cancel during body reading cancels reader, unlocks stream and prevents commit', async () => {
    const f = fixture(), cancelled = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel: cancelled })
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : new Response(body, { headers: { 'content-type': 'application/json' } }))
    const p = f.prepare(); f.service.start(f.owner, consent(p))
    await vi.waitFor(() => expect(body.locked).toBe(true))
    f.service.cancel(f.owner, ref(p)); await f.service.drain()
    expect(cancelled).toHaveBeenCalledOnce(); expect(body.locked).toBe(false); expect(f.snapshot().messages).toEqual([])
  })
  it('cancellation during unsettled reservation retains the active slot until ledger settles', async () => {
    const f = fixture(), pending = gate<void>()
    f.reserve.mockImplementationOnce(() => pending.promise)
    const p = f.prepare(); f.service.start(f.owner, consent(p))
    await vi.waitFor(() => expect(f.reserve).toHaveBeenCalledOnce())
    f.service.cancel(f.owner, ref(p)); await f.service.drain()
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'BUSY' })
    pending.resolve(); await f.coordinator.drain()
    expect((await f.complete()).state).toBe('COMPLETE'); expect(f.reserve).toHaveBeenCalledTimes(2)
  })
  it.each(['PANEL_CLOSED', 'NAVIGATION', 'CONTEXT_CHANGED'] as const)('%s retires active session and history', async reason => {
    const f = fixture(), pending = gate<Response>()
    await f.complete(); const p = f.prepare(); f.send.mockImplementation(() => pending.promise)
    f.service.start(f.owner, consent(p)); await Promise.resolve()
    f.service.closeSession(f.owner, reason); await f.service.drain()
    expect(() => f.snapshot()).toThrow(); expect(() => f.service.status(f.owner, ref(p))).toThrow()
    pending.resolve(Response.json(metadata)); expect(f.reopen().messages).toEqual([])
  })
  it.each(['PROVIDER_CHANGED', 'KEY_CHANGED'] as const)('%s notification purges completed and pending context', async reason => {
    const f = fixture(); await f.complete(); const p = f.prepare()
    f.retire(reason); expect(() => f.snapshot()).toThrow(); expect(() => f.service.start(f.owner, consent(p))).toThrow()
    expect(f.reopen().messages).toEqual([])
  })
  it.each(['PROVIDER_CHANGED', 'KEY_CHANGED'] as const)('%s aborts running HTTP and drops late response', async reason => {
    const f = fixture(), pending = gate<Response>(), cancelled = vi.fn()
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : pending.promise)
    const p = f.prepare(); f.service.start(f.owner, consent(p))
    await vi.waitFor(() => expect(f.reserve).toHaveBeenCalledOnce())
    f.retire(reason); await f.service.drain(); await f.coordinator.drain()
    expect(() => f.snapshot()).toThrow()
    pending.resolve(new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'content-type': 'application/json' } }))
    await Promise.resolve(); await Promise.resolve(); expect(cancelled).toHaveBeenCalledOnce()
    expect(f.reopen().messages).toEqual([])
  })
  it('coordinator cancellation joins transport cleanup without committing a pair', async () => {
    const f = fixture(), p = f.prepare(), pending = gate<Response>(); f.send.mockImplementation(() => pending.promise)
    f.service.start(f.owner, consent(p)); await Promise.resolve(); await f.coordinator.cancelActive()
    await f.service.drain()
    expect(f.service.status(f.owner, ref(p))).toMatchObject({ state: 'CANCELLED' }); expect(f.snapshot().messages).toEqual([])
    pending.resolve(Response.json(metadata))
  })
  it('generation drift without notification also fails closed, and changing exercise/language opens a fresh session', async () => {
    const f = fixture(), p = f.prepare(); f.changeSilently()
    expect(() => f.service.start(f.owner, consent(p))).toThrow(); expect(f.send).not.toHaveBeenCalled()
    const next = f.reopen(), context = f.context()
    if (context.kind !== 'PRACTICE') throw Error()
    expect(f.reopen({ ...context, language: 'csharp' }).sessionId).not.toBe(next.sessionId)
    expect(f.reopen({ ...context, exerciseId: 'other' }).messages).toEqual([])
  })
  it('shutdown aborts pending request, unsubscribes once, clears timers and does not shut down other consumers', async () => {
    vi.useFakeTimers()
    const f = fixture(), p = f.prepare(), pending = gate<Response>(); f.send.mockImplementation(() => pending.promise)
    f.service.start(f.owner, consent(p)); await Promise.resolve(); await f.service.stop(); await f.service.stop()
    expect(f.unsubscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    expect(() => f.snapshot()).toThrow(); expect(() => f.reopen()).toThrow()
    const slot = f.coordinator.admit({ signal: new AbortController().signal, deadline: Date.now() + 10000, cancel() {} })
    expect(slot.ok).toBe(true); if (slot.ok) slot.admission.release()
    pending.resolve(Response.json(metadata))
  })
  it.each(['chat-first', 'hints-first'])('shares one active inference with real SmartHintsService (%s)', async order => {
    const f = fixture(), held = gate<void>()
    const smart = new SmartHintsService({ mode: 'FAKE', run: async (_c, _h, signal, execution) => {
      await execution!.reserveInference!(signal); await held.promise; return output
    } }, Date.now, undefined, undefined, undefined, f.coordinator); hints.push(smart)
    const q = request(), prepareHint = () => smart.prepare(2, 'smart-document', q, () => {}, async g => capture(q, g))
    if (order === 'chat-first') {
      const pending = gate<Response>(); f.send.mockImplementation(() => pending.promise)
      const p = f.prepare(); f.service.start(f.owner, consent(p)); await Promise.resolve()
      const s = await prepareHint(); expect(smart.start(2, 'smart-document', start(s))).toMatchObject({ state: 'FAILED', code: 'BUSY' })
      f.service.cancel(f.owner, ref(p)); await f.service.drain(); pending.resolve(Response.json(metadata)); held.resolve()
    } else {
      const s = await prepareHint(); smart.start(2, 'smart-document', start(s))
      await vi.waitFor(() => expect(f.reserve).toHaveBeenCalledOnce())
      expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'BUSY' }); expect(f.send).not.toHaveBeenCalled()
      held.resolve(); await vi.waitFor(() => expect(smart.status(2, 'smart-document', reference(s)).state).toBe('COMPLETE'))
      expect((await f.complete()).state).toBe('COMPLETE')
    }
  })
  it('uses the existing configuration daily ledger; Chat and Smart Hints cannot double charge or bypass its budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chat-ledger-')); roots.push(root)
    const config = new SmartHintsConfiguration({ file: join(root, 'settings.json'), encryption: { available: async () => true,
      encrypt: async text => Buffer.from(`encrypted:${text}`), decrypt: async data => data.toString().slice(10) },
      transport: { send: async r => Response.json(r.method === 'GET' ? metadata : { candidates: [{ finishReason: 'STOP',
        content: { role: 'model', parts: [{ text: JSON.stringify(output) }] } }] }) }, promptKey: async () => key, confirm: async () => true })
    configs.push(config); await config.start(); await config.configureKey(() => {}); await config.enable(true, () => {}); await config.budget(1, () => {})
    const f = fixture(config.coordinator)
    expect((await f.complete()).state).toBe('COMPLETE'); expect(config.snapshot().usedRequests).toBe(1)
    const q = request(), p = await config.service.prepare(2, 'document', q, () => {}, async g => capture(q, g))
    config.service.start(2, 'document', start(p))
    await vi.waitFor(() => expect(config.service.status(2, 'document', reference(p)).state).toBe('FAILED'))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
    expect(config.snapshot().usedRequests).toBe(1); expect(await readdir(`${join(root, 'settings.json')}.usage`)).toHaveLength(1)
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
  })
})
