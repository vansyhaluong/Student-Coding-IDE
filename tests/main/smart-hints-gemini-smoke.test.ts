import { describe, expect, it, vi } from 'vitest'
import { runGeminiSmoke, type GeminiSmokeOptions } from '../../scripts/sh4-gemini-smoke'
import { GEMINI_MODEL, GEMINI_MODEL_URL, GEMINI_GENERATE_URL } from '../../src/main/services/learning/smart-hints/gemini-provider'

const key = 'SYNTHETIC-ONLY-GEMINI-SMOKE-TEST'
const hint = { kind: 'HINT', level: 1, paragraphs: ['Compare public samples.'], nextQuestion: 'What changes?', evidence: [] }
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
function fixture(patch: Partial<GeminiSmokeOptions> = {}) {
  const readKey = vi.fn(() => key), reserve = vi.fn(async () => {}), confirm = vi.fn(async () => true)
  const send = vi.fn(async (r: Request) => {
    if (r.method === 'GET') return json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
    const body = await r.clone().json(), input = JSON.parse(body.contents[0].parts[0].text)
    expect(input.action).toEqual({ kind: 'HINT', level: 1 })
    expect(input.signature).toEqual({ functionName: 'Solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' })
    expect(input).not.toHaveProperty('signatureIdentity')
    return json({ modelVersion: GEMINI_MODEL, candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(hint) }] } }] })
  })
  const options: GeminiSmokeOptions = { electronMainDevelopment: true, liveApproved: true, readKey, reserve, confirm, send, ...patch }
  return { options, readKey, reserve, confirm, send }
}
describe('Gemini manual runner, synthetic I/O only', () => {
  it.each([undefined, ''])('missing credential %# has its own code/stage and no HTTP', async value => {
    const f = fixture({ readKey: () => value })
    const result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ result: 'STOP', code: 'KEY_MISSING', stage: 'KEY_VALIDATION', freeTierAttested: true,
      httpRequests: 0, inferenceRequests: 0, modelHttpStatus: null, inferenceHttpStatus: null })
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it.each(['short', 'PRESENT', ' key-with-spaces-long-enough ', 'quoted-key-"invalid"', 'header-key-with\r\ninjection', 'x'.repeat(513), 'key-with-\u200b-invisible-character'])('invalid credential %# has its own code without logging its value', async value => {
    const f = fixture({ readKey: () => value }), result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ code: 'KEY_FORMAT_INVALID', stage: 'KEY_VALIDATION', httpRequests: 0, inferenceRequests: 0 })
    expect(f.send).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain(value)
  })
  it.each(['STANDARD', 'AUTHORIZATION'] as const)('accepts a synthetic %s key without changing its bytes or using Bearer', async kind => {
    const fake = kind === 'STANDARD' ? 'AIza' + 'SYNTHETIC_Only-0123456789'.padEnd(35, 'x')
      : 'AQ.' + 'SYNTHETIC_Auth-0123456789'.padEnd(600, 'x')
    const f = fixture({ readKey: () => fake }), normal = f.options.send
    let exactHeader = true
    f.options.send = async r => { exactHeader &&= r.headers.get('x-goog-api-key') === fake && !r.headers.has('authorization'); return normal(r) }
    const result = await runGeminiSmoke(f.options)
    expect(exactHeader).toBe(true)
    expect(result).toMatchObject({ result: 'PASS', code: 'COMPLETE', inferenceRequests: 1 })
    expect(JSON.stringify(result)).not.toContain(fake)
  })
  it.each(['AQ.', 'AQ..invalid-payload', 'AQ.invalid-key-with spaces', 'AQ.invalid-key\r\nheader', 'AQ.' + 'x'.repeat(4094)])('rejects malformed/oversized authorization key %# before any HTTP', async fake => {
    const f = fixture({ readKey: () => fake }), result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ code: 'KEY_FORMAT_INVALID', stage: 'KEY_VALIDATION', httpRequests: 0, inferenceRequests: 0 })
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
    expect(JSON.stringify(result).includes(fake)).toBe(false)
  })
  it.each([401, 403])('HTTP %s authentication/permission rejection is distinct from a local key-format failure', async status => {
    const f = fixture({ send: async () => new Response('PRIVATE_ERROR', { status }) })
    const result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ code: 'HTTP_AUTH_FAILED', modelHttpStatus: status, inferenceRequests: 0, httpRequests: 1,
      stage: 'MODEL_HEADERS_RECEIVED' })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR')
  })
  it('gates approval/tier/consent, runs model check then exactly one inference with safe evidence', async () => {
    const stages: string[] = [], f = fixture({ progress: async e => { stages.push(e.stage); expect(JSON.stringify(e)).not.toContain(key) } })
    const result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ result: 'PASS', code: 'COMPLETE', model: GEMINI_MODEL, timeoutMs: 30000, freeTierAttested: true,
      modelAccessible: true, httpRequests: 2, inferenceRequests: 1, inferenceReserved: true, schemaValidation: 'PASS', hint, productionEnabled: false, retry: false, paidFallback: false })
    expect(f.send.mock.calls.map(([r]) => r.url)).toEqual([GEMINI_MODEL_URL, GEMINI_GENERATE_URL])
    expect(f.reserve).toHaveBeenCalledOnce()
    expect(f.confirm).toHaveBeenNthCalledWith(1, 'PREFLIGHT', expect.stringContaining('no active billing/paid tier'), expect.any(AbortSignal))
    expect(f.confirm).toHaveBeenNthCalledWith(2, 'SNAPSHOT', expect.stringContaining('30s'), expect.any(AbortSignal))
    expect(stages).toEqual(['MAIN_STARTED', 'PREFLIGHT_CONSENT', 'KEY_VALIDATION', 'SNAPSHOT_CONSENT', 'INFERENCE_DISPATCHING'])
  })
  it.each(['PREFLIGHT', 'SNAPSHOT'] as const)('cancel %s sends no HTTP and no inference reservation', async stage => {
    const f = fixture({ confirm: async current => current !== stage })
    expect(await runGeminiSmoke(f.options)).toMatchObject({ code: stage === 'PREFLIGHT' ? 'PREFLIGHT_CANCELLED' : 'CONSENT_CANCELLED', httpRequests: 0, inferenceRequests: 0 })
    expect(f.reserve).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
    if (stage === 'PREFLIGHT') expect(f.readKey).not.toHaveBeenCalled()
  })
  it.each(['electronMainDevelopment', 'liveApproved'] as const)('denies %s before key access', async flag => {
    const f = fixture({ [flag]: false })
    expect(await runGeminiSmoke(f.options)).toMatchObject({ code: 'DEVELOPMENT_APPROVAL_REQUIRED', httpRequests: 0 })
    expect(f.readKey).not.toHaveBeenCalled()
  })
  it('unavailable model does not reserve/send inference or substitute model', async () => {
    const f = fixture({ send: async () => new Response(null, { status: 404 }) })
    expect(await runGeminiSmoke(f.options)).toMatchObject({ result: 'FAIL', code: 'PROVIDER', modelHttpStatus: 404,
      modelAccessible: false, inferenceRequests: 0, schemaValidation: 'NOT_RUN' })
    expect(f.reserve).not.toHaveBeenCalled()
  })
  it('429 quota is a fixed failure and never retries', async () => {
    const f = fixture(), normal = f.options.send
    f.options.send = async r => r.method === 'GET' ? normal(r) : new Response(`PRIVATE ${key}`, { status: 429 })
    const result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ code: 'RATE_LIMIT', inferenceRequests: 1, inferenceHttpStatus: 429, hint: null })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SYNTHETIC-ONLY-GEMINI-SMOKE-TEST/)
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it.each(['headers', 'body'] as const)('post-200 diagnostics distinguish %s timeout and clean up', async at => {
    vi.useFakeTimers()
    try {
      const f = fixture(), normal = f.options.send, cancel = vi.fn()
      f.options.send = async r => {
        if (r.method === 'GET') return normal(r)
        if (at === 'headers') return new Promise<Response>(() => {})
        return new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } })
      }
      const task = runGeminiSmoke(f.options)
      await vi.advanceTimersByTimeAsync(30050)
      expect(await task).toMatchObject({ code: 'TIMEOUT', timeoutOwner: 'MAIN_SERVICE', inferenceRequests: 1,
        inferenceHttpStatus: at === 'body' ? 200 : null, diagnostic: { requestKind: 'INFERENCE', stage: at === 'body' ? 'READING_BODY' : 'WAITING_HEADERS' }, schemaValidation: 'NOT_RUN', hint: null })
      if (at === 'body') expect(cancel).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it.each(['PREFLIGHT', 'SNAPSHOT'] as const)('bounds %s consent and ignores late approval', async stage => {
    vi.useFakeTimers()
    try {
      let release!: (v: boolean) => void
      const f = fixture({ confirm: async current => current !== stage || new Promise<boolean>(done => { release = done }) })
      const task = runGeminiSmoke(f.options); await vi.advanceTimersByTimeAsync(60001)
      expect(await task).toMatchObject({ code: `${stage}_CONSENT_TIMEOUT`, httpRequests: 0 })
      release(true); await vi.advanceTimersByTimeAsync(1)
      expect(f.send).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('persistence failure prevents inference', async () => {
    const f = fixture({ progress: async () => { throw new Error(key) } })
    expect(await runGeminiSmoke(f.options)).toMatchObject({ code: 'EVIDENCE_PERSISTENCE_FAILED', httpRequests: 0, inferenceRequests: 0 })
    expect(f.readKey).not.toHaveBeenCalled()
  })
  it('invalid SH1 response preserves failure taxonomy and returns no hint', async () => {
    const f = fixture(), normal = f.options.send
    f.options.send = async r => r.method === 'GET' ? normal(r)
      : json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ ...hint, level: 2 }) }] } }] })
    expect(await runGeminiSmoke(f.options)).toMatchObject({ code: 'INVALID_RESPONSE', schemaValidation: 'FAIL',
      responseFailure: { code: 'SCHEMA_VALIDATION_FAILED' }, hint: null, inferenceRequests: 1 })
  })
  it('failed reservation spends no inference request and preserves the fixed safe error', async () => {
    const f = fixture({ reserve: async () => { throw new Error(key) } })
    const result = await runGeminiSmoke(f.options)
    expect(result).toMatchObject({ code: 'ATTEMPT_RESERVATION_FAILED', inferenceRequests: 0, hint: null })
    expect(JSON.stringify(result)).not.toContain(key)
  })
  it('late reservation completion after abort cannot dispatch or publish late progress', async () => {
    vi.useFakeTimers()
    try {
      let release!: () => void
      const progress = vi.fn(async () => {}), f = fixture({ progress, reserve: () => new Promise<void>(done => { release = done }) })
      const task = runGeminiSmoke(f.options); await vi.advanceTimersByTimeAsync(30050)
      expect(await task).toMatchObject({ code: 'TIMEOUT', inferenceRequests: 0 })
      const count = progress.mock.calls.length
      release(); await vi.advanceTimersByTimeAsync(1)
      expect(progress).toHaveBeenCalledTimes(count)
      expect(f.send).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
