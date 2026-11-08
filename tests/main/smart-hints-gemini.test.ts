import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGeminiSmartHintsService, geminiKeyState, GeminiSmartHintsAdapter, GEMINI_MODEL, GEMINI_MODEL_URL, GEMINI_GENERATE_URL } from '../../src/main/services/learning/smart-hints/gemini-provider'
import { geminiResponseSchema } from '../../src/main/services/learning/smart-hints/gemini-schema'
import { isSmartCapabilities, validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'
import type { SelectionFixWire } from '../../src/main/services/learning/smart-hints/selection-fix'
import type { SmartAction, SmartOutput } from '../../src/shared/contracts/smart-hints'
import type { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { capture, request, output, start, reference, source, fixAction } from '../fixtures/learning/smart-hints'

const key = 'SYNTHETIC-ONLY-GEMINI-TEST-CREDENTIAL'
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const metadata = { name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 }
const envelope = (content: unknown = output) => ({ modelVersion: GEMINI_MODEL, candidates: [{ index: 0, finishReason: 'STOP',
  content: { role: 'model', parts: [{ text: typeof content === 'string' ? content : JSON.stringify(content) }] } }], usageMetadata: { candidatesTokenCount: 30, thoughtsTokenCount: 0 } })
const services: SmartHintsService[] = []
const credential = () => ({ value: () => key, clear: vi.fn() })
const signal = () => new AbortController().signal
const sendFor = (data = envelope()) => vi.fn(async (r: Request) => json(r.method === 'GET' ? metadata : data))
function service(send = sendFor(), patch: Partial<Parameters<typeof createGeminiSmartHintsService>[0]> = {}) {
  const s = createGeminiSmartHintsService({ development: true, liveApproved: true, freeTierConfirmed: true,
    readKey: () => key, transport: { send }, ...patch }); services.push(s); return s
}
async function prepare(s: SmartHintsService, q = request()) { return s.prepare(1, 'doc', q, () => {}, async g => capture(q, g)) }
afterEach(async () => { for (const s of services.splice(0)) await s.stop(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Gemini direct REST via injected fake transport only', () => {
  it('shared key classification preserves Standard bounds/alphabet, with no trimming or repair', () => {
    for (const v of [undefined, null, '']) expect(geminiKeyState(v)).toBe('KEY_MISSING')
    for (const v of ['a'.repeat(15), 'a'.repeat(513), 'a'.repeat(16) + ' ', 'key\r\nheader-injection', 42, {}, ['synthetic']]) expect(geminiKeyState(v)).toBe('KEY_FORMAT_INVALID')
    for (const v of ['a'.repeat(16), 'a'.repeat(512), 'AIza' + 'x'.repeat(35), 'SYNTHETIC_key-with-0_9']) expect(geminiKeyState(v)).toBe('VALID')
  })
  it('reproduces the old AQ. rejection and accepts its explicit authorization-key branch', () => {
    const fake = 'AQ.' + 'SYNTHETIC_Auth-0123456789'.padEnd(600, 'x')
    expect(/^[A-Za-z0-9_-]+$/.test(fake)).toBe(false)
    expect(fake.length > 512).toBe(true)
    expect(geminiKeyState(fake)).toBe('VALID')
  })
  it.each([15, 16, 512, 513, 4096, 4097])('authorization-key local length boundary %s remains bounded', length => {
    const fake = 'AQ.' + 'x'.repeat(length - 3)
    expect(geminiKeyState(fake)).toBe(length >= 16 && length <= 4096 ? 'VALID' : 'KEY_FORMAT_INVALID')
  })
  it.each(['AQ.', 'AQ..payload-too-long', 'aq.payload-long-enough', 'AQ.payload-long-enough.',
    'AQ.payload with spaces', 'AQ.payload\twith-tab', 'AQ.payload\r\ninjection', 'AQ.payload\nnew-line',
    'AQ.payload\u0000with-nul', 'AQ.payload\u007fwith-del', 'AQ.payload\u200bzero-width',
    'AQ.payload-é-unicode', 'AQ.payload"with-quote', 'AQ.payload/invalid+alphabet', 'AQ.payload=invalid-padding',
    'AQ.payload-long-enough\n', 'AQ.payload-long-enough\r\n'])('invalid authorization syntax %# fails closed', fake => {
    expect(geminiKeyState(fake)).toBe('KEY_FORMAT_INVALID')
    const send = sendFor()
    expect(service(send, { readKey: () => fake }).capabilities().enabled).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['\n', '\r\n', '\t', '\u0000'])('rejects trailing control suffix %# on Standard keys too', suffix => {
    expect(geminiKeyState('AIza' + 'x'.repeat(35) + suffix)).toBe('KEY_FORMAT_INVALID')
  })
  it.each(['STANDARD', 'AUTHORIZATION'] as const)('%s key goes unchanged only into x-goog-api-key for both REST calls', async kind => {
    const fake = kind === 'STANDARD' ? 'AIza' + 'SYNTHETIC_Only-0123456789'.padEnd(35, 'x')
      : 'AQ.' + 'SYNTHETIC_Auth-0123456789'.padEnd(600, 'x')
    const send = sendFor(), s = service(send, { readKey: () => fake }), p = await prepare(s)
    s.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE' }))
    expect(send).toHaveBeenCalledTimes(2)
    for (const [r] of send.mock.calls) {
      expect(r.headers.get('x-goog-api-key') === fake).toBe(true)
      expect(r.headers.has('authorization')).toBe(false)
      expect(r.url.includes(fake)).toBe(false)
      if (r.method === 'POST') expect(JSON.stringify(await r.clone().json()).includes(fake)).toBe(false)
    }
    expect(JSON.stringify(s.status(1, 'doc', reference(p))).includes(fake)).toBe(false)
  })
  it.each(['development', 'liveApproved', 'freeTierConfirmed'] as const)('denies absent %s gate before reading a key', flag => {
    const readKey = vi.fn(() => key), fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const s = service(sendFor(), { [flag]: false, readKey })
    expect(s.capabilities()).toMatchObject({ enabled: false, providerMode: 'DISABLED' })
    expect(readKey).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 'short', 'bad key containing spaces', 'x'.repeat(513), 'HEADER\r\nINJECTION'])('rejects invalid credential %# without sending', value => {
    const send = sendFor(); expect(service(send, { readKey: () => value }).capabilities().enabled).toBe(false); expect(send).not.toHaveBeenCalled()
  })
  it('requires consent, checks exact model before inference and sends only scoped public data with structured schema', async () => {
    const send = sendFor(), beforeInference = vi.fn(async () => {}), s = service(send, { beforeInference })
    expect(isSmartCapabilities(s.capabilities())).toBe(true)
    expect(s.capabilities()).toMatchObject({ enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true })
    const p = await prepare(s); expect(send).not.toHaveBeenCalled()
    expect(() => s.start(1, 'doc', { ...start(p), consentGranted: false } as never)).toThrow()
    s.start(1, 'doc', start(p)); s.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE', output }))
    expect(send.mock.calls.map(([r]) => [r.method, r.url])).toEqual([['GET', GEMINI_MODEL_URL], ['POST', GEMINI_GENERATE_URL]])
    for (const [r] of send.mock.calls) {
      expect(r.headers.get('x-goog-api-key')).toBe(key)
      expect(r.headers.has('authorization')).toBe(false); expect(r.url).not.toContain(key)
      expect(r.redirect).toBe('error'); expect(r.cache).toBe('no-store'); expect(r.credentials).toBe('omit')
    }
    const body = await send.mock.calls[1][0].json()
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', candidateCount: 1, maxOutputTokens: 2048,
      responseJsonSchema: { type: 'object', additionalProperties: false, required: ['kind', 'hypotheses', 'suggestions', 'evidence'] } })
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ source, language: 'javascript', action: { kind: 'ANALYZE' }, previousHints: [] })
    expect(JSON.stringify(body)).not.toMatch(/SYNTHETIC-ONLY-GEMINI-TEST-CREDENTIAL|HIDDEN_CANARY|OpenRouter|official|comparator/)
    for (const field of ['tools', 'cachedContent', 'model', 'models']) expect(body).not.toHaveProperty(field)
    expect(beforeInference).toHaveBeenCalledOnce()
    expect(JSON.stringify(s.status(1, 'doc', reference(p)))).not.toMatch(/SYNTHETIC-ONLY-GEMINI-TEST-CREDENTIAL|gemini-3.1-flash-lite|responseId/)
  })
  const actions: [SmartAction, SmartOutput | SelectionFixWire][] = [
    [{ kind: 'HINT' }, { kind: 'HINT', thinking: 'Compare inputs.', steps: ['Return the value.'], code: { language: 'javascript', text: 'return x + 1;' }, evidence: [] }],
    [{ kind: 'ANALYZE' }, output],
    [{ kind: 'EXPLAIN', selection: { startOffset: 0, endOffset: 8, text: 'function', startLine: 1, startColumn: 1, endLine: 1, endColumn: 9 } },
      { kind: 'EXPLANATION', syntax: 'Function.', variables: 'Input.', controlFlow: 'Return.', algorithm: 'Identity.', illustrativeExamples: [] }],
    [fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1), { kind: 'EDIT_PROPOSAL', replacementText: 'x + 1', rationale: 'Focused.', evidence: [] }],
    [fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1), { kind: 'NO_FIX', reason: 'LOCATION_UNKNOWN', advice: 'Inspect public samples.' }],
  ]
  it.each(actions)('separate wire schema and unchanged SH1 validation for %j', async (action, result) => {
    // L2/L3 sequencing belongs to the existing service; here verify wire/action output.
    const send = sendFor(envelope(result)), c = capture(request({ action }))
    expect(await new GeminiSmartHintsAdapter({ send }, credential()).run(c, ['prior hint'], signal())).toEqual(result)
    const body = await send.mock.calls[1][0].json()
    expect(body.generationConfig.responseJsonSchema).toEqual(geminiResponseSchema(c))
    if (action.kind === 'HINT') expect(body.generationConfig.responseJsonSchema.properties.code.properties.language.enum).toEqual(['javascript'])
    if (action.kind === 'SUGGEST_FIX') expect(body.generationConfig.responseJsonSchema.anyOf).toHaveLength(2)
    expect(JSON.parse(body.contents[0].parts[0].text).previousHints).toEqual(['prior hint'])
    {
      const serviceSend = sendFor(envelope(result)), s = service(serviceSend), p = await prepare(s, request({ action }))
      s.start(1, 'doc', start(p))
      if (action.kind === 'SUGGEST_FIX') {
        expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
        expect(s.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
      } else await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE', output: result }))
      if (action.kind === 'SUGGEST_FIX') expect(serviceSend).not.toHaveBeenCalled()
    }
  })
  it.each([{}, { ...metadata, name: 'models/other-model' }, { ...metadata, supportedGenerationMethods: ['countTokens'] }, { ...metadata, outputTokenLimit: 1024 }])('fails closed on inaccessible/unsupported metadata %#, without POST', async data => {
    const send = vi.fn(async () => json(data)), beforeInference = vi.fn(async () => {})
    await expect(new GeminiSmartHintsAdapter({ send }, credential(), { beforeInference }).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'PROVIDER' })
    expect(send).toHaveBeenCalledOnce(); expect(beforeInference).not.toHaveBeenCalled()
  })
  it.each([[400, 'PROVIDER'], [401, 'AUTH'], [403, 'AUTH'], [404, 'PROVIDER'], [429, 'RATE_LIMIT'], [500, 'PROVIDER'], [503, 'PROVIDER']] as const)('maps HTTP %s to %s, never retrying or exposing raw errors', async (status, code) => {
    const cancel = vi.fn(), send = vi.fn(async (r: Request) => r.method === 'GET' ? json(metadata)
      : new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(key)) }, cancel }), { status }))
    const error = await new GeminiSmartHintsAdapter({ send }, credential()).run(capture(request()), [], signal()).catch(e => e)
    expect(error).toMatchObject({ code }); expect(JSON.stringify(error)).not.toContain(key)
    expect(send).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledOnce()
  })
  it.each([
    {}, { candidates: [] }, { candidates: [envelope().candidates[0], envelope().candidates[0]] },
    { ...envelope(), promptFeedback: { blockReason: 'SAFETY' } },
    { ...envelope(), candidates: [{ ...envelope().candidates[0], finishReason: 'MAX_TOKENS' }] },
    { ...envelope(), candidates: [{ ...envelope().candidates[0], content: { role: 'model', parts: [{ functionCall: { name: 'execute' } }] } }] },
    { ...envelope(), modelVersion: 'other-model' },
    { ...envelope(), candidates: [{ ...envelope().candidates[0], safetyRatings: [{ blocked: true }] }] },
  ])('rejects invalid/blocked/truncated/tool envelope %#', async data => {
    await expect(new GeminiSmartHintsAdapter({ send: sendFor(data as ReturnType<typeof envelope>) }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('discards bounded thought text and joins only answer text parts', async () => {
    const data = envelope(), raw = JSON.stringify(output)
    data.candidates[0].content.parts = [{ text: 'private reasoning', thought: true }, { text: raw.slice(0, 8) }, { text: raw.slice(8) }] as typeof data.candidates[0]['content']['parts']
    const result = await new GeminiSmartHintsAdapter({ send: sendFor(data) }, credential()).run(capture(request()), [], signal())
    expect(result).toEqual(output); expect(JSON.stringify(result)).not.toContain('private reasoning')
  })
  it.each(['not JSON', '```json\n{}\n```', '{"kind":"ANALYSIS","kind":"ANALYSIS"}'])('strict JSON rejects %s with no repair', async content => {
    await expect(new GeminiSmartHintsAdapter({ send: sendFor(envelope(content)) }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE', responseFailure: { code: 'JSON_PARSE_FAILED' } })
  })
  it.each([
    { ...output, extra: 'not allowed' }, { ...output, kind: 'HINT' }, { ...output, evidence: ['R1'] },
    { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: 0, endOffset: 5, expectedOldText: 'wrong', replacementText: 'x', rationale: 'x' }], rationale: 'x', evidence: [] },
  ])('application rejects schema/evidence/unsafe-edit %# despite structured output request', async data => {
    if (data.kind === 'EDIT_PROPOSAL') {
      const action = fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1), send = sendFor(envelope(data)), q = request({ action })
      expect(validateSmartPrepare(q).ok).toBe(true)
      await expect(new GeminiSmartHintsAdapter({ send }, credential()).run(capture(q), [], signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
      expect(send).toHaveBeenCalledTimes(2)
      return
    }
    const failures = vi.fn(), s = service(sendFor(envelope(data)), { onResponseFailure: failures }), action = data.kind === 'EDIT_PROPOSAL' ? fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1) : { kind: 'ANALYZE' as const }
    const p = await prepare(s, request({ action })); s.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
    expect(failures).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEMA_VALIDATION_FAILED' }), expect.any(String))
  })
  it.each([envelope({ ...output, suggestions: [key] }), { ...envelope(), responseId: key }])('blocks reflected credentials including ignored metadata %#', async data => {
    await expect(new GeminiSmartHintsAdapter({ send: sendFor(data) }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('bounds output token accounting including thoughts', async () => {
    const data = { ...envelope(), usageMetadata: { candidatesTokenCount: 2048, thoughtsTokenCount: 1 } }
    await expect(new GeminiSmartHintsAdapter({ send: sendFor(data) }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
  })
  it('default composition keeps the production 10s cap', async () => {
    vi.useFakeTimers()
    const send = vi.fn(async () => new Promise<Response>(() => {})), s = service(send)
    const p = await prepare(s); s.start(1, 'doc', start(p))
    await vi.advanceTimersByTimeAsync(10001)
    expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(send).toHaveBeenCalledOnce(); await s.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('pre-aborted caller never reads a credential or sends', async () => {
    const c = credential(), value = vi.spyOn(c, 'value'), send = sendFor()
    await expect(new GeminiSmartHintsAdapter({ send }, c).run(capture(request()), [], AbortSignal.abort())).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(value).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
  })
  it.each(['at', 'after'] as const)('deadline wins over model headers arriving %s timeout; late bodies are canceled', async timing => {
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      const send = vi.fn(() => new Promise<Response>(resolve => {
        setTimeout(() => resolve(new Response(new ReadableStream({ cancel }))), timing === 'at' ? 30000 : 30001)
      }))
      const task = new GeminiSmartHintsAdapter({ send }, credential(), { timeoutMs: 30000 }).run(capture(request()), [], signal()).catch(e => e)
      await vi.advanceTimersByTimeAsync(30002)
      expect(await task).toMatchObject({ code: 'TIMEOUT' })
      expect(cancel).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it.each(['model', 'headers', 'body', 'reservation'] as const)('30s deadline bounds %s and cleans all timers without retry', async at => {
    vi.useFakeTimers()
    const cancel = vi.fn(), send = vi.fn(async (r: Request) => {
      if (at === 'model' || at === 'headers' && r.method === 'POST') return new Promise<Response>(() => {})
      if (at === 'body' && r.method === 'POST') return new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } })
      return json(r.method === 'GET' ? metadata : envelope())
    })
    const s = service(send, { developmentSmoke: true, ...(at === 'reservation' ? { beforeInference: () => new Promise<void>(() => {}) } : {}) })
    const p = await prepare(s); s.start(1, 'doc', start(p)); await vi.advanceTimersByTimeAsync(30001)
    expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(['body', 'headers'].includes(at) ? 1 : 0)
    if (at === 'body') expect(cancel).toHaveBeenCalledOnce()
    await s.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('retirement aborts request and suppresses late response; cancellation removes listener and clears credential', async () => {
    const c = credential(), controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener'), cancel = vi.fn()
    let release!: (response: Response) => void
    const send = vi.fn(async () => new Promise<Response>(done => { release = done }))
    const adapter = new GeminiSmartHintsAdapter({ send }, c), task = adapter.run(capture(request()), [], controller.signal).catch(e => e)
    controller.abort(); expect(await task).toMatchObject({ code: 'TIMEOUT' })
    release(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    adapter.dispose(); expect(c.clear).toHaveBeenCalledOnce()
    const s = service(sendFor()), q = request(), p = await prepare(s, q)
    s.start(1, 'doc', start(p)); s.retireContext(1, 'doc', { clientContextId: q.clientContextId, reason: 'EDIT' })
    await Promise.resolve(); expect(s.status(1, 'doc', reference(p)).state).toBe('CANCELLED')
  })
  it('service quota rejects seventh action before another model GET/POST; no refund or retry', async () => {
    const send = sendFor(), s = service(send)
    for (let i = 0; i < 7; i++) {
      const p = await prepare(s)
      s.start(1, 'doc', start(p))
      await vi.waitFor(() => expect(s.status(1, 'doc', reference(p)).state).toBe(i === 6 ? 'FAILED' : 'COMPLETE'))
      if (i === 6) expect(s.status(1, 'doc', reference(p))).toMatchObject({ code: 'RATE_LIMIT' })
    }
    expect(send).toHaveBeenCalledTimes(12)
  })
})
