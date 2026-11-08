import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiChatAdapter } from '../../src/main/services/learning/chat/gemini-chat-adapter'
import { SharedGeminiTransport, GEMINI_MODEL, GEMINI_MODEL_URL, GEMINI_GENERATE_URL } from '../../src/main/services/learning/smart-hints/gemini-transport'
import { SMART_HINT_POLICY as P } from '../../src/shared/contracts/smart-hints'
import { CHAT_POLICY as C, type ChatScope } from '../../src/shared/contracts/learning-chat'
import type { ChatExecution } from '../../src/main/services/learning/chat/conversation-manager'
import { chatFixture, defaultSource, ref, send as consent, secret } from '../fixtures/learning/chat'
import { gate } from '../fixtures/learning/analysis'

const apiKey = 'AQ.SYNTHETIC_CHAT_TRANSPORT_API_KEY'
const metadata = { name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 }
const reply = { kind: 'CHAT_REPLY', text: 'Giải thích minh họa 🐟 é\r\nKhông tự sửa editor.' }
const envelope = (value: unknown = reply) => ({ modelVersion: GEMINI_MODEL, candidates: [{ index: 0, finishReason: 'STOP',
  content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30, thoughtsTokenCount: 0, totalTokenCount: 130 } })
const owned: ReturnType<typeof chatFixture>[] = []
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(() => { for (const f of owned.splice(0)) f.manager.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixture(source = defaultSource) {
  const domain = chatFixture(source); owned.push(domain)
  const reserve = vi.fn(async () => {}), diagnostics = vi.fn()
  const send = vi.fn(async (r: Request): Promise<Response> => Response.json(r.method === 'GET' ? metadata : envelope()))
  const client = new SharedGeminiTransport({ send }, { value: () => apiKey, clear() {} }, { beforeInference: reserve, onDiagnostic: diagnostics })
  const adapter = new GeminiChatAdapter(client, { capture: execution => domain.manager.capture(execution), reply: value => domain.builder.reply(value) })
  const active = (scope: ChatScope = 'QUESTION_ONLY', question?: string, selected?: string) => {
    const p = domain.manager.prepare(domain.owner, domain.request(scope, question, selected))
    return { p, execution: domain.manager.start(domain.owner, consent(p)) }
  }
  return { ...domain, reserve, diagnostics, send, adapter, active }
}

describe('Gemini Chat adapter with Main-owned prepared context and fake HTTP', () => {
  it('single turn preserves fixed HTTP/key/output policy and returns advice without auto-commit or editor authority', async () => {
    const f = fixture(), { execution } = f.active()
    expect(await f.adapter.run(execution)).toEqual(reply)
    expect(f.snapshot().messages).toEqual([])
    expect(f.send.mock.calls.map(([r]) => [r.method, r.url])).toEqual([['GET', GEMINI_MODEL_URL], ['POST', GEMINI_GENERATE_URL]])
    const request = f.send.mock.calls[1][0], body = await request.json()
    expect(request.headers.get('x-goog-api-key')).toBe(apiKey); expect(request.headers.has('authorization')).toBe(false)
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user'])
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ question: execution.capture().input.question, attachment: null })
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 2048, candidateCount: 1, responseMimeType: 'application/json',
      responseJsonSchema: { additionalProperties: false, required: ['kind', 'text'], properties: { kind: { enum: ['CHAT_REPLY'] } } } })
    expect(body.systemInstruction.parts[0].text).toContain('programming learning assistant')
    expect(body.systemInstruction.parts[0].text).toContain('untrusted data')
    expect(body).not.toHaveProperty('tools'); expect(body).not.toHaveProperty('model')
    expect(body).not.toHaveProperty('stream'); expect(f.reserve).toHaveBeenCalledOnce()
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ finishReason: 'STOP', envelopeJsonValidation: 'PASS', outputJsonValidation: 'PASS' }))
  })
  it('multi-turn roles alternate user/model in original order with at most eight consented pairs', async () => {
    const f = fixture()
    for (let i = 0; i < 10; i++) f.commit('QUESTION_ONLY', `user-${i} 🐟\r\n`, `assistant-${i} é\r\n`)
    const { execution } = f.active('QUESTION_ONLY', 'next question'), capture = execution.capture()
    await f.adapter.run(execution)
    const body = await f.send.mock.calls[1][0].json()
    expect(body.contents).toHaveLength(17)
    expect(body.contents.slice(0, -1).map((c: { role: string }) => c.role)).toEqual(Array.from({ length: 16 }, (_, i) => i % 2 ? 'model' : 'user'))
    expect(body.contents.slice(0, -1).map((c: { parts: { text: string }[] }) => c.parts[0].text)).toEqual(capture.input.history.map(m => m.text))
    expect(body.contents[0].parts[0].text).toBe('user-2 🐟\r\n')
    expect(JSON.parse(body.contents.at(-1).parts[0].text)).toEqual({ question: 'next question', attachment: null })
    expect(f.snapshot().messages).toHaveLength(20)
  })
  it.each(['QUESTION_ONLY', 'QUESTION_WITH_SELECTION', 'QUESTION_WITH_SOURCE'] as const)('%s sends exactly the eligible history and attachment, never Main bindings or private authority', async scope => {
    const f = fixture(defaultSource + '\r\n// OUTSIDE_SELECTED_REGION')
    f.commit('QUESTION_WITH_SOURCE', 'BROAD_HISTORY_CANARY', 'BROAD_REPLY_CANARY')
    f.commit('QUESTION_ONLY', 'safe prior question', 'safe prior answer')
    const { execution } = f.active(scope), capture = execution.capture(), before = JSON.stringify(capture)
    await f.adapter.run(execution)
    const body = await f.send.mock.calls[1][0].json(), input = JSON.parse(body.contents.at(-1).parts[0].text)
    expect(input).toEqual({ question: capture.input.question, attachment: capture.input.attachment })
    expect(body.contents.slice(0, -1).map((c: { parts: { text: string }[] }) => c.parts[0].text)).toEqual(capture.input.history.map(m => m.text))
    const wire = JSON.stringify(body)
    for (const field of ['consentToken', 'providerGeneration', 'historyMessageIds', 'sourceFingerprint', 'proposalId', 'applyGrant', 'hiddenTests', 'lockedHints', 'sampleSolution'])
      expect(wire).not.toContain(`"${field}"`)
    if (scope !== 'QUESTION_WITH_SOURCE') expect(wire).not.toMatch(/BROAD_HISTORY_CANARY|BROAD_REPLY_CANARY|OUTSIDE_SELECTED_REGION/)
    if (scope === 'QUESTION_ONLY') expect(input.attachment).toBeNull()
    if (scope === 'QUESTION_WITH_SELECTION') expect(input.attachment).toEqual({ kind: 'SELECTION', text: 'return n;',
      startOffset: capture.provenance.selection!.startOffset, endOffset: capture.provenance.selection!.endOffset, eol: 'CRLF' })
    expect(JSON.stringify(capture)).toBe(before)
  })
  it('rejects forged, pre-consent and stale execution identities before HTTP, never invokes an untrusted capture function', async () => {
    const f = fixture(), capture = vi.fn(() => { throw Error('UNTRUSTED') })
    await expect(f.adapter.run({ signal: new AbortController().signal, capture })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(capture).not.toHaveBeenCalled()
    const p = f.manager.prepare(f.owner, f.request())
    await expect(f.adapter.run(p as unknown as ChatExecution)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const { execution } = f.active(); f.update(defaultSource + '\r\n// changed')
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('rejects a wire body over 64KiB without truncating consented data or reserving inference', async () => {
    const f = fixture('"'.repeat(C.sourceBytes)), { execution } = f.active('QUESTION_WITH_SOURCE'), capture = execution.capture()
    expect(capture.manifest.requestBytes).toBeLessThan(C.requestBytes - 8192)
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
    expect(f.send).toHaveBeenCalledOnce(); expect(f.send.mock.calls[0][0].method).toBe('GET'); expect(f.reserve).not.toHaveBeenCalled()
    expect(execution.capture()).toBe(capture); expect(capture.input.attachment).toMatchObject({ source: '"'.repeat(C.sourceBytes) })
  })
  it.each([[400, 'PROVIDER'], [401, 'AUTH'], [429, 'RATE_LIMIT'], [500, 'PROVIDER'], [503, 'PROVIDER']] as const)('HTTP %i → %s with no inference retry', async (status, code) => {
    const f = fixture(), { execution } = f.active()
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : Response.json({ error: { message: 'UNTRUSTED' } }, { status }))
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code })
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.reserve).toHaveBeenCalledOnce(); expect(f.snapshot().messages).toEqual([])
  })
  it.each([
    ['empty text', { kind: 'CHAT_REPLY', text: '' }], ['blank text', { kind: 'CHAT_REPLY', text: '  ' }],
    ['unpaired Unicode', { kind: 'CHAT_REPLY', text: '\ud800' }], ['NUL', { kind: 'CHAT_REPLY', text: '\0' }],
    ['oversized reply', { kind: 'CHAT_REPLY', text: 'x'.repeat(C.replyBytes) }],
    ['SmartEdit', { kind: 'EDIT_PROPOSAL', edits: [] }], ['proposalId', { ...reply, proposalId: 'forged' }],
    ['Apply grant', { ...reply, applyGrant: true }], ['editor command', { ...reply, command: 'APPLY' }],
    ['extra properties', { ...reply, history: [] }],
  ])('%s response fails closed with no editor authority or commit', async (_name, value) => {
    const f = fixture(), { execution } = f.active()
    f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : envelope(value)))
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.snapshot().messages).toEqual([]); expect(f.send).toHaveBeenCalledTimes(2)
  })
  it.each([
    ['MAX_TOKENS', { ...envelope(), candidates: [{ ...envelope().candidates[0], finishReason: 'MAX_TOKENS' }] }],
    ['SAFETY', { ...envelope(), candidates: [{ ...envelope().candidates[0], finishReason: 'SAFETY' }] }],
    ['missing finish', { ...envelope(), candidates: [{ content: envelope().candidates[0].content }] }],
    ['prompt block', { ...envelope(), promptFeedback: { blockReason: 'SAFETY' } }],
    ['blocked rating', { ...envelope(), candidates: [{ ...envelope().candidates[0], safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: true }] }] }],
    ['malformed rating', { ...envelope(), candidates: [{ ...envelope().candidates[0], safetyRatings: [{ blocked: 'true' }] }] }],
    ['wrong role', { ...envelope(), candidates: [{ ...envelope().candidates[0], content: { role: 'user', parts: [{ text: JSON.stringify(reply) }] } }] }],
    ['wrong model', { ...envelope(), modelVersion: 'unapproved-model' }],
    ['tool call', { ...envelope(), candidates: [{ ...envelope().candidates[0], content: { role: 'model', parts: [{ functionCall: { name: 'apply' } }] } }] }],
    ['thought only', { ...envelope(), candidates: [{ ...envelope().candidates[0], content: { role: 'model', parts: [{ text: 'HIDDEN_REASONING', thought: true }] } }] }],
    ['negative usage', { ...envelope(), usageMetadata: { candidatesTokenCount: -1 } }],
    ['array usage', { ...envelope(), usageMetadata: [] }],
  ])('%s envelope is rejected even when an embedded reply looks valid', async (_name, value) => {
    const f = fixture(), { execution } = f.active()
    f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : value))
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.snapshot().messages).toEqual([])
  })
  it.each(['{', '```json\n{"kind":"CHAT_REPLY","text":"bad"}\n```', '{"kind":"CHAT_REPLY","text":"a","text":"b"}'])(
    'malformed content is not repaired or retried %#', async text => {
      const f = fixture(), { execution } = f.active(), value = envelope()
      value.candidates[0].content.parts = [{ text }]
      f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : value))
      await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
      expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ outputJsonValidation: 'FAIL' }))
      expect(f.reserve).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledTimes(2)
    })
  it('reported output+thought tokens over 2048 and oversized HTTP responses are rejected', async () => {
    const f = fixture(), { execution } = f.active()
    f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : { ...envelope(), usageMetadata: { candidatesTokenCount: 2048, thoughtsTokenCount: 1 } }))
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
    const next = fixture(), token = next.active().execution
    next.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : new Response('x'.repeat(P.wireBytes + 1), { headers: { 'content-type': 'application/json' } }))
    await expect(next.adapter.run(token)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
  })
  it('valid split text parts preserve Unicode/CRLF, ignore thoughts and remain inert advisory text', async () => {
    const f = fixture(), { execution } = f.active(), output = { kind: 'CHAT_REPLY', text: 'Ví dụ 🐟 é\r\n{"edits":[],"proposalId":"inert","command":"APPLY"}' }
    const text = JSON.stringify(output), value = envelope()
    value.candidates[0].content.parts = [{ text: 'Do not disclose reasoning.', thought: true } as never,
      { text: text.slice(0, 10) }, { text: text.slice(10) }]
    f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : value))
    const result = await f.adapter.run(execution)
    expect(result).toEqual(output); expect(result).not.toHaveProperty('proposalId'); expect(result).not.toHaveProperty('consume')
    expect(JSON.stringify(result)).not.toContain('Do not disclose reasoning.')
    expect(f.manager.complete(execution, result).state).toBe('COMPLETE') // Explicit consumer commit, not adapter behavior.
  })
  it.each([secret, apiKey, Buffer.from(apiKey).toString('base64')])('secret-bearing response never reaches history or diagnostics %#', async value => {
    const f = fixture(), { execution } = f.active()
    f.send.mockImplementation(async r => Response.json(r.method === 'GET' ? metadata : envelope({ kind: 'CHAT_REPLY', text: value })))
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.snapshot().messages).toEqual([])
    expect(JSON.stringify(f.diagnostics.mock.calls)).not.toContain(value)
  })
  it('known transport credential in an otherwise domain-approved question is blocked before POST', async () => {
    const f = fixture(), { execution } = f.active('QUESTION_ONLY', apiKey)
    await expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.send).toHaveBeenCalledOnce(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('abort while waiting for headers cancels a late response and cannot commit late advice', async () => {
    const f = fixture(), { p, execution } = f.active(), pending = gate<Response>(), entered = gate<void>(), cancel = vi.fn()
    f.send.mockImplementationOnce(() => { entered.resolve(); return pending.promise })
    const result = f.adapter.run(execution); await entered.promise; f.manager.cancel(f.owner, ref(p))
    await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' })
    pending.resolve(new Response(new ReadableStream({ cancel })))
    await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledOnce(); expect(f.reserve).not.toHaveBeenCalled()
    expect(f.snapshot().messages).toEqual([])
  })
  it('abort while reading inference body releases reader/lock and publishes no partial reply', async () => {
    const f = fixture(), { p, execution } = f.active(), cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ cancel })
    f.send.mockImplementation(async r => r.method === 'GET' ? Response.json(metadata) : new Response(stream, { headers: { 'content-type': 'application/json' } }))
    const result = f.adapter.run(execution)
    await vi.waitFor(() => expect(stream.locked).toBe(true))
    f.manager.cancel(f.owner, ref(p)); await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(stream.locked).toBe(false); expect(cancel).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledTimes(2)
    expect(f.snapshot().messages).toEqual([])
  })
  it('source change while inference is pending aborts and discards the late successful envelope', async () => {
    const f = fixture(), { execution } = f.active(), pending = gate<Response>(), posted = gate<void>(), cancel = vi.fn()
    f.send.mockImplementation(async r => { if (r.method === 'GET') return Response.json(metadata); posted.resolve(); return pending.promise })
    const result = f.adapter.run(execution); await posted.promise; f.update(defaultSource + '\r\n// changed')
    await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' })
    pending.resolve(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(f.snapshot().messages).toEqual([]); expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('uses the existing 10s direct transport timeout with no retry and clears its timer', async () => {
    vi.useFakeTimers()
    const f = fixture(), { execution } = f.active(), pending = gate<Response>()
    f.send.mockImplementationOnce(() => pending.promise)
    const before = vi.getTimerCount(), rejection = expect(f.adapter.run(execution)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(vi.getTimerCount()).toBe(before + 1)
    await vi.advanceTimersByTimeAsync(P.timeoutMs); await rejection
    expect(vi.getTimerCount()).toBe(before)
    expect(f.send).toHaveBeenCalledOnce(); pending.resolve(Response.json(metadata)); await Promise.resolve()
  })
  it('outer Main deadline owns the only execution timer; adapter creates no additional one', async () => {
    vi.useFakeTimers()
    const f = fixture(), { p, execution } = f.active(), pending = gate<Response>()
    f.send.mockImplementationOnce(() => pending.promise)
    const before = vi.getTimerCount()
    setTimeout(() => f.manager.cancel(f.owner, ref(p)), P.timeoutMs)
    const rejection = expect(f.adapter.run(execution, { deadline: Date.now() + P.timeoutMs, clock: Date.now })).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(vi.getTimerCount()).toBe(before + 1)
    await vi.advanceTimersByTimeAsync(P.timeoutMs); await rejection
    expect(vi.getTimerCount()).toBe(before)
    expect(f.send).toHaveBeenCalledOnce(); pending.resolve(Response.json(metadata)); await Promise.resolve()
  })
})
