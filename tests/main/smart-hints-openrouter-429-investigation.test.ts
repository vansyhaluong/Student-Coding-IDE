import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterSmartHintsAdapter } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import { runOpenRouterSmoke, type SmokeOptions } from '../../scripts/sh4-openrouter-smoke'
import { capture, request } from '../fixtures/learning/smart-hints'

// Diagnostic investigation only. Synthetic credential and injected transports;
// no environment reads, persistent reservation, live fetch or candidate selection.
const key = 'SYNTHETIC-ONLY-429-INVESTIGATION'
const hint = { kind: 'HINT', thinking: 'Compare the return value with the public examples.', steps: ['Compare the public inputs.'], code: { language: 'csharp', text: 'return x + 1;' }, evidence: [] }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
function smoke(inference: (r: Request) => Promise<Response>) {
  const reserve = vi.fn(async () => {}), send = vi.fn(async (r: Request) => {
    if (r.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { used: 0, limit: 50, remaining: 50 } } })
    if (r.url.endsWith('/models')) return json({ data: [{ id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] })
    expect(await r.clone().json()).toMatchObject({ model: 'openrouter/free', provider: {
      allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } }, max_tokens: 2048, stream: false })
    return inference(r)
  })
  const options: SmokeOptions = { electronMainDevelopment: true, readKey: () => key, send, reserve, confirm: async () => true }
  return { options, send, reserve }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('SH-4 429 investigation — offline only, current policy unchanged', () => {
  it('429 headers do not cause retry or disclosure, and unread error body is cancelled', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(() => { throw new Error('REAL_FETCH_FORBIDDEN') }); vi.stubGlobal('fetch', fetch)
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel }), getReader = vi.spyOn(body, 'getReader')
    const send = vi.fn(async (r: Request) => {
      const payload = await r.json()
      expect(payload.model).toBe('openrouter/free')
      expect(payload).not.toHaveProperty('models'); expect(payload).not.toHaveProperty('response_format')
      return new Response(body, { status: 429, headers: { 'retry-after': '60', 'x-ratelimit-limit': '20',
        'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000', 'x-request-id': 'SYNTHETIC_PRIVATE_ID' } })
    })
    const adapter = new OpenRouterSmartHintsAdapter({ send }, { authorization: () => `Bearer ${key}`, clear: () => {} })
    await expect(adapter.run(capture(request()), [], new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMIT', message: 'RATE_LIMIT' })
    await vi.advanceTimersByTimeAsync(600001)
    expect(send).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce(); expect(getReader).not.toHaveBeenCalled()
  })
  it('successful quota/catalogue preflight can still end in 429 with source attribution unknown', async () => {
    const f = smoke(async () => new Response(JSON.stringify({ error: { code: 429,
      message: `DO_NOT_RETAIN ${key}`, metadata: { provider_code: 'SYNTHETIC_UPSTREAM', provider_name: 'Synthetic Provider' } } }),
    { status: 429, headers: { 'retry-after': '60', 'x-ratelimit-remaining': '0' } }))
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'FAIL', code: 'RATE_LIMIT', keyHttpStatus: 200, catalogueHttpStatus: 200,
      accountVerified: true, freeRouteVerified: true, httpStatus: 429, inferenceRequests: 1, httpRequests: 3,
      model: null, usage: null, hint: null, schemaValidation: 'NOT_RUN', retry: false, paidFallback: false })
    expect(f.send).toHaveBeenCalledTimes(3); expect(f.reserve).toHaveBeenCalledOnce()
    for (const field of ['retryAfter', 'headers', 'provider', 'provider_code']) expect(result).not.toHaveProperty(field)
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_RETAIN|SYNTHETIC_UPSTREAM|Synthetic Provider/)
    expect(JSON.stringify(result)).not.toContain(key)
  })
  it.each([
    [JSON.stringify(hint), 'COMPLETE', 'PASS'],
    ['plain prose, not JSON', 'INVALID_RESPONSE', 'FAIL'],
    [JSON.stringify({ ...hint, level: 2 }), 'INVALID_RESPONSE', 'FAIL'],
  ])('a simulated North response passes only valid JSON/action schema (%#)', async (content, code, resultKind) => {
    // Routed response identity only: the outgoing route remains openrouter/free.
    // This does not establish North inference quality, availability or a new configuration.
    const f = smoke(async () => json({ model: 'cohere/north-mini-code:free', choices: [{ index: 0,
      finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { completion_tokens: 20, cost: 0 } }))
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code, result: resultKind, inferenceRequests: 1 })
    expect(f.send).toHaveBeenCalledTimes(3); expect(f.reserve).toHaveBeenCalledOnce()
    if (resultKind === 'FAIL') expect(result.hint).toBeNull()
  })
})
