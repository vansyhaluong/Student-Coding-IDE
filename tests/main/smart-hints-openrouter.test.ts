import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenRouterSmartHintsService, OpenRouterSmartHintsAdapter, OPENROUTER_FREE_ENDPOINT, OPENROUTER_FREE_MODEL } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import type { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import type { SmartAction, SmartOutput, SmartPrepare } from '../../src/shared/contracts/smart-hints'
import { isSmartCapabilities, isSmartOutput, validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { createPublicRunReceipt, publicRunPackage, sourceFingerprint } from '../../src/main/services/learning/smart-hints/public-run-receipt'
import { capture, request, output, response as fakeResponse, envelope as fakeEnvelope, start, reference, registry, snapshot, source, fixAction } from '../fixtures/learning/smart-hints'

function envelope(content?: string) {
  return JSON.stringify({ ...JSON.parse(fakeEnvelope(content)), model: 'synthetic/free-model:free', provider: 'Synthetic Provider' })
}
const response = (raw = envelope()) => fakeResponse(raw)

const key = 'sk-or-v1-SYNTHETIC-ONLY-not-a-real-key'
const services: SmartHintsService[] = []
const credential = () => ({ authorization: () => `Bearer ${key}`, clear: vi.fn() })
const signal = () => new AbortController().signal
function service(send: (r: Request) => Promise<Response>) {
  const s = createOpenRouterSmartHintsService({ development: true, liveApproved: true, readKey: () => key, transport: { send } })
  services.push(s); return s
}
async function prepare(s: SmartHintsService, q: SmartPrepare) {
  return s.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
}
afterEach(async () => { for (const s of services.splice(0)) await s.stop(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('SH-4 OpenRouter Free: exclusively injected fake transport', () => {
  it.each([[false, false], [false, true], [true, false]])('development %s / approval %s fail closed before reading a key', (development, liveApproved) => {
    const readKey = vi.fn(() => key), fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const s = createOpenRouterSmartHintsService({ development, liveApproved, readKey }); services.push(s)
    expect(s.capabilities()).toEqual({ enabled: false, providerMode: 'DISABLED', applyEnabled: false, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(readKey).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 'short', 'sk-or-v1-invalid\r\nHEADER', 'sk-or-v1-with spaces-invalid', 'x'.repeat(513)])('invalid/missing key %# cannot enable provider', value => {
    const s = createOpenRouterSmartHintsService({ development: true, liveApproved: true, readKey: () => value }); services.push(s)
    expect(s.capabilities().enabled).toBe(false)
  })
  it('Main public capture, consent, fixed route/model and one send; no private evidence or secret in payload/status', async () => {
    const r = registry(), q = request(), send = vi.fn(async (req: Request) => {
      expect(r.pinned).toBe(false); expect(req.url).toBe(OPENROUTER_FREE_ENDPOINT)
      expect(req.headers.get('authorization')).toBe(`Bearer ${key}`)
      expect(req.redirect).toBe('error'); expect(req.credentials).toBe('omit'); expect(req.cache).toBe('no-store')
      const body = await req.json()
      expect(body).toMatchObject({ model: OPENROUTER_FREE_MODEL, max_tokens: 2048, stream: false, provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } } })
      expect(body).not.toHaveProperty('tools'); expect(body).not.toHaveProperty('thinking'); expect(body).not.toHaveProperty('response_format')
      expect(JSON.stringify(body)).not.toMatch(/sk-or-v1-|HIDDEN_CANARY|PRIVATE_|comparator|signatureHash|testSetId|official/)
      return response()
    }), s = service(send)
    expect(isSmartCapabilities(s.capabilities())).toBe(true)
    expect(s.capabilities()).toMatchObject({ enabled: true, providerMode: 'OPENROUTER_FREE', applyEnabled: true })
    const p = await s.prepare(1, 'doc', q, () => {}, g => captureSmartHints(r.packages, q, g, () => {}))
    expect(send).not.toHaveBeenCalled()
    expect(() => s.start(1, 'doc', { ...start(p), consentGranted: false } as never)).toThrow()
    s.start(1, 'doc', start(p)); s.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p)).state).toBe('COMPLETE'))
    expect(send).toHaveBeenCalledOnce()
    expect(JSON.stringify(s.status(1, 'doc', reference(p)))).not.toMatch(/sk-or-v1-|HIDDEN_CANARY|PRIVATE_|function solve/)
    s.beginShutdown(); expect(s.capabilities().enabled).toBe(false)
  })
  const actions: [SmartAction, SmartOutput][] = [
    [{ kind: 'HINT' }, { kind: 'HINT', thinking: 'Compare inputs.', steps: ['Return the value.'], code: { language: 'javascript', text: 'return x + 1;' }, evidence: [] }],
    [{ kind: 'ANALYZE' }, output],
    [{ kind: 'EXPLAIN', selection: { startOffset: 0, endOffset: 8, text: 'function', startLine: 1, startColumn: 1, endLine: 1, endColumn: 9 } },
      { kind: 'EXPLANATION', syntax: 'syntax', variables: 'variables', controlFlow: 'flow', algorithm: 'algorithm', illustrativeExamples: [] }],
    [fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1), { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: 29, endOffset: 29, expectedOldText: '', replacementText: ' + 1', rationale: 'public statement' }], rationale: 'Check the operation', evidence: [] }],
    [fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1), { kind: 'NO_FIX', reason: 'LOCATION_UNKNOWN', advice: 'Inspect the public statement.' }],
  ]
  it.each(actions)('bounded protocol for %j', async (action, result) => {
    const send = vi.fn(async (r: Request) => {
      const b = await r.json(), input = JSON.parse(b.messages[1].content)
      expect(input.action).toEqual(action); expect(input.previousHints).toEqual(['prior synthetic hint'])
      return response(envelope(JSON.stringify(result)))
    })
    expect(await new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request({ action })), ['prior synthetic hint'], signal())).toEqual(result)
    expect(send).toHaveBeenCalledOnce()
  })
  it.each(actions)('service validates and publishes %j without exposing route metadata', async (action, result) => {
    const send = vi.fn(async () => response(envelope(JSON.stringify(result)))), s = service(send)
    const p = await prepare(s, request({ action })); s.start(1, 'doc', start(p))
    if (action.kind === 'SUGGEST_FIX') {
      expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
      expect(send).not.toHaveBeenCalled(); return
    }
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE', output: result }))
    expect(JSON.stringify(s.status(1, 'doc', reference(p)))).not.toContain('synthetic/free-model')
    expect(send).toHaveBeenCalledOnce()
  })
  it('repeated unified Hint uses consented source without replaying prior cards', async () => {
    const q = request({ action: { kind: 'HINT', level: 1 } }), send = vi.fn(async (r: Request) => {
      const body = await r.json(), input = JSON.parse(body.messages[1].content)
      expect(input.source).toBe(q.source)
      expect(input.previousHints).toEqual([])
      return response(envelope(JSON.stringify({ kind: 'HINT', thinking: 'Compare inputs.', steps: ['Return the value.'], code: { language: 'javascript', text: 'return x + 1;' }, evidence: [] })))
    }), s = service(send)
    for (const n of [1, 2, 3] as const) {
      const p = await prepare(s, { ...q, requestId: request().requestId, action: { kind: 'HINT', level: n } })
      s.start(1, 'doc', start(p))
      await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE', output: { kind: 'HINT' } }))
    }
    expect(send).toHaveBeenCalledTimes(3)
  })
  it('Code & Public Run analysis sends only matching public receipt observations', async () => {
    const r = registry(), snap = snapshot(), q = request({ run: { sessionId: snap.sessionId, generation: snap.generation, sequence: snap.sequence } })
    const receipt = createPublicRunReceipt(sourceFingerprint(q.source), snap, publicRunPackage(r.data))
    const result = { ...output, evidence: ['R1'] }, send = vi.fn(async (req: Request) => {
      const body = await req.json(), input = JSON.parse(body.messages[1].content)
      expect(input.runContext).toMatchObject({ kind: 'RUN_PUBLIC', observations: [{ evidenceId: 'R1' }, { evidenceId: 'R2' }] })
      expect(JSON.stringify(body)).not.toMatch(/HIDDEN_CANARY|PRIVATE_PATH|stdout|stderr|official/)
      return response(envelope(JSON.stringify(result)))
    }), s = service(send)
    const p = await s.prepare(1, 'doc', q, () => {}, g => captureSmartHints(r.packages, q, g, () => {}, receipt))
    expect(send).not.toHaveBeenCalled(); s.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p))).toMatchObject({ state: 'COMPLETE', output: result }))
    expect(send).toHaveBeenCalledOnce()
  })
  it('accepts documented OpenRouter envelope, routed model and private reasoning metadata', async () => {
    const wire = { id: 'gen-synthetic', object: 'chat.completion', created: 1, provider: 'Synthetic Provider',
      model: 'synthetic/free-model:free', choices: [{ finish_reason: 'stop', native_finish_reason: 'completed', logprobs: null,
        message: { role: 'assistant', content: JSON.stringify(output), reasoning: 'private', reasoning_details: [{ type: 'reasoning.text', text: 'private' }] } }],
      usage: { prompt_tokens: 20, completion_tokens: 100, total_tokens: 120, cost: 0, completion_tokens_details: { reasoning_tokens: 30 } } }
    expect(await new OpenRouterSmartHintsAdapter({ send: async () => response(JSON.stringify(wire)) }, credential()).run(capture(request()), [], signal())).toEqual(output)
  })
  it.each([
    { model: undefined }, { model: '' }, { model: {} }, { model: 'x'.repeat(257) }, { provider: {} },
    { error: { code: 429, message: 'private' } }, { usage: { completion_tokens: 10, cost: 0.01 } },
    { choices: [{ index: 0, finish_reason: 'stop', error: { code: 500 }, message: { role: 'assistant', content: JSON.stringify(output) } }] },
    { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null, reasoning: 'JSON only in reasoning' } }] },
    { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: [], reasoning_details: {} } }] },
  ])('fails closed on invalid routing/cost/error envelope %# without retry', async patch => {
    const send = vi.fn(async () => response(JSON.stringify({ ...JSON.parse(envelope()), ...patch })))
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request()), [], signal())).rejects.toThrow()
    expect(send).toHaveBeenCalledOnce()
  })
  it.each([[401, 'AUTH'], [403, 'AUTH'], [402, 'BALANCE'], [429, 'RATE_LIMIT'], [422, 'PROVIDER'], [500, 'PROVIDER'], [302, 'PROVIDER']])('HTTP %i yields fixed %s, no retry or error-body disclosure', async (status, code) => {
    const send = vi.fn(async () => new Response(`PRIVATE_PATH ${key}`, { status: status as number }))
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code, message: code })
    expect(send).toHaveBeenCalledOnce()
  })
  it('network errors cannot expose request credentials or paths', async () => {
    const send = vi.fn(async () => { throw new Error(`${key} PRIVATE_PATH`) })
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ message: 'NETWORK' })
    expect(send).toHaveBeenCalledOnce()
  })
  it('refuses an accidental API key in consented source before any send', async () => {
    const send = vi.fn(async () => response())
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request({ source: `// ${key}` })), [], signal())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(send).not.toHaveBeenCalled()
  })
  it('cancels unread HTTP error bodies instead of retaining their stream', async () => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel })
    await expect(new OpenRouterSmartHintsAdapter({ send: async () => new Response(body, { status: 429 }) }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'RATE_LIMIT' })
    expect(cancel).toHaveBeenCalledOnce()
  })
  it.each([
    'not json', envelope('{"kind":"ANALYSIS","kind":"HINT"}'), envelope('{"__proto__":{}}'),
    envelope('```json\n{}\n```'), envelope(JSON.stringify({ ...output, suggestions: [key] })),
    envelope(JSON.stringify({ ...output, suggestions: [Buffer.from(key).toString('base64')] })),
    JSON.stringify({ model: 'synthetic/free-model:free', choices: [{ index: 0, finish_reason: 'length', message: { role: 'assistant', content: '{}' } }] }),
    JSON.stringify({ model: 'synthetic/free-model:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{}', tool_calls: [] } }] }),
    JSON.stringify({ model: 'synthetic/free-model:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{}', reasoning_content: {} } }] }),
  ])('malformed/reflection/tools/incomplete response %# rejects without retry', async raw => {
    const send = vi.fn(async () => response(raw))
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request()), [], signal())).rejects.toThrow()
    expect(send).toHaveBeenCalledOnce()
  })
  it('bounded reasoning stays private; key reflection in reasoning rejects', async () => {
    const body = (reasoning: string) => JSON.stringify({ model: 'synthetic/free-model:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(output), reasoning_content: reasoning } }] })
    expect(await new OpenRouterSmartHintsAdapter({ send: async () => response(body('private reasoning')) }, credential()).run(capture(request()), [], signal())).toEqual(output)
    await expect(new OpenRouterSmartHintsAdapter({ send: async () => response(body(key)) }, credential()).run(capture(request()), [], signal())).rejects.toThrow()
  })
  it('accepts inert OpenAI-compatible null metadata, rejects escaped key and active tool/refusal data', async () => {
    const wire = (extra: Record<string, unknown>) => JSON.stringify({ model: 'synthetic/free-model:free', choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
      message: { role: 'assistant', content: JSON.stringify(output), reasoning_content: null, tool_calls: null, refusal: null, ...extra } }] })
    const run = (raw: string) => new OpenRouterSmartHintsAdapter({ send: async () => response(raw) }, credential()).run(capture(request()), [], signal())
    expect(await run(wire({}))).toEqual(output)
    await expect(run(wire({ tool_calls: [{ type: 'function' }] }))).rejects.toThrow()
    await expect(run(wire({ refusal: 'refused' }))).rejects.toThrow()
    const escaped = key.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
    // Reflect after JSON decoding too, rather than relying solely on raw-wire search.
    const reflected = envelope(JSON.stringify({ ...output, suggestions: [key] })).replace(key, escaped)
    expect(reflected).not.toContain(key)
    await expect(run(reflected)).rejects.toThrow()
  })
  it('wire, token, output, encoded request and UTF8 limits hold', async () => {
    for (const r of [response(' '.repeat(98305)), response(envelope('x'.repeat(32769))),
      response(envelope().replace('"completion_tokens":100', '"completion_tokens":2049')),
      new Response(new Uint8Array([0xc3, 0x28]), { headers: { 'content-type': 'application/json' } })]) {
      await expect(new OpenRouterSmartHintsAdapter({ send: async () => r }, credential()).run(capture(request()), [], signal())).rejects.toThrow()
    }
    const send = vi.fn(async () => response())
    await expect(new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(request({ source: '\u0001'.repeat(16000) })), [], signal())).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
    expect(send).not.toHaveBeenCalled()
  })
  it('timeout, cancel and blocked reader abort at unchanged 10s, without retry', async () => {
    vi.useFakeTimers()
    const send = vi.fn(() => new Promise<Response>(() => {})), a = new OpenRouterSmartHintsAdapter({ send }, credential())
    const c = new AbortController(), p = a.run(capture(request()), [], c.signal), cancelled = expect(p).rejects.toMatchObject({ code: 'TIMEOUT' })
    c.abort(); await cancelled
    const timed = expect(a.run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10000); await timed
    const cancel = vi.fn(), r = new Response(new ReadableStream({ pull() {}, cancel }), { headers: { 'content-type': 'application/json' } })
    const pending = expect(new OpenRouterSmartHintsAdapter({ send: async () => r }, credential()).run(capture(request()), [], signal())).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10000); await pending; expect(cancel).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('context retirement suppresses late responses; shutdown aborts and clears credential', async () => {
    let resolve!: (r: Response) => void
    const send = vi.fn(() => new Promise<Response>(r => { resolve = r })), s = service(send), q = request(), p = await prepare(s, q)
    s.start(1, 'doc', start(p)); await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    s.retireContext(1, 'doc', { clientContextId: q.clientContextId, reason: 'LANGUAGE' }); resolve(response())
    await vi.waitFor(() => expect(s.status(1, 'doc', reference(p)).state).toBe('CANCELLED'))
    const c = credential(), adapter = new OpenRouterSmartHintsAdapter({ send: async () => response() }, c)
    adapter.dispose(); expect(c.clear).toHaveBeenCalledOnce()
  })
  it('legacy adapter responses still fail SH-1; disabled service cannot publish a grant', async () => {
    for (const result of [{ ...output, kind: 'unknown' },
      { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: 0, endOffset: 8, expectedOldText: 'wrong source', replacementText: 'x', rationale: 'x' }], rationale: 'x', evidence: [] }]) {
      const send = vi.fn(async () => response(envelope(JSON.stringify(result)))), action = fixAction(source, source.indexOf('x;'), source.indexOf('x;') + 1)
      const q = request({ action }); expect(validateSmartPrepare(q).ok).toBe(true)
      const parsed = await new OpenRouterSmartHintsAdapter({ send }, credential()).run(capture(q), [], signal())
      expect(isSmartOutput(parsed, action, source, [], 'LF')).toBe(false); expect(send).toHaveBeenCalledOnce()
      send.mockClear()
      const s = service(send), p = await prepare(s, q)
      expect(s.start(1, 'doc', start(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
      expect(send).not.toHaveBeenCalled()
    }
  })
  it('service reserves quota before sends; rejected seventh request cannot consume transport', async () => {
    const send = vi.fn(async () => response()), s = service(send)
    for (let i = 0; i < 7; i++) {
      const p = await prepare(s, request()), result = s.start(1, 'doc', start(p))
      if (i === 6) expect(result).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
      else await vi.waitFor(() => expect(s.status(1, 'doc', reference(p)).state).toBe('COMPLETE'))
    }
    expect(send).toHaveBeenCalledTimes(6)
  })
})


it.each(['before', 'at', 'after'] as const)('development adapter %s deadline: one settlement, abort/listener/timer cleanup, late body cancellation', async timing => {
  vi.useFakeTimers()
  try {
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener'), cancel = vi.fn(), onTimeout = vi.fn()
    let release!: (r: Response) => void
    const send = vi.fn(() => new Promise<Response>(done => { release = done }))
    const adapter = new OpenRouterSmartHintsAdapter({ send }, credential(), OPENROUTER_FREE_MODEL, { timeoutMs: 30000, onTimeout })
    let settlements = 0
    const task = adapter.run(capture(request()), [], controller.signal).then(value => { settlements++; return value }, error => { settlements++; return error })
    if (timing === 'before') {
      await vi.advanceTimersByTimeAsync(12000)
      controller.abort()
    } else {
      // Register response at/after the adapter timer: expiry must win deterministically.
      setTimeout(() => release(new Response(new ReadableStream({ cancel }))), timing === 'at' ? 30000 : 30001)
      await vi.advanceTimersByTimeAsync(30001)
    }
    expect(await task).toMatchObject({ code: 'TIMEOUT' })
    if (timing === 'before') {
      release(new Response(new ReadableStream({ cancel })))
      await vi.advanceTimersByTimeAsync(1)
    }
    expect(settlements).toBe(1)
    expect(send).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(onTimeout).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1)
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})
