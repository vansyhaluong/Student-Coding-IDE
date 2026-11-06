import { describe, expect, it, vi } from 'vitest'
import { runOpenRouterSmoke, SMOKE_SOURCE, type SmokeOptions } from '../../scripts/sh4-openrouter-smoke'

const key = 'sk-or-v1-SYNTHETIC-ONLY-manual-smoke'
const hint = { kind: 'HINT', level: 1, paragraphs: ['Compare the returned value with the public examples.'], nextQuestion: 'What changes between input and output?', evidence: [] }
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
function fixture(patch: Partial<SmokeOptions> = {}) {
  const calls: Request[] = []
  const reserve = vi.fn(async () => {}), readKey = vi.fn(() => key), confirm = vi.fn(async () => true)
  const send = vi.fn(async (request: Request) => {
    calls.push(request)
    if (request.method === 'GET' && request.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 50 } } })
    if (request.method === 'GET' && request.url.endsWith('/models')) return json({ data: [{ id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] })
    const body = await request.clone().json(), input = JSON.parse(body.messages[1].content)
    expect(input.action).toEqual({ kind: 'HINT', level: 1 })
    expect(input.signature).toEqual({ functionName: 'Solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' })
    expect(input).not.toHaveProperty('signatureIdentity')
    return json({ model: 'synthetic/test:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(hint) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0 } })
  })
  const options: SmokeOptions = { electronMainDevelopment: true, readKey, send, confirm, reserve, ...patch }
  return { options, calls, send, confirm, readKey, reserve }
}
describe('manual SH-4 runner: injected offline transports only', () => {
  it.each(['PREFLIGHT', 'SNAPSHOT'] as const)('bounds an unresponsive %s dialog and ignores late approval', async at => {
    vi.useFakeTimers()
    try {
      let release: ((approved: boolean) => void) | undefined, signal: AbortSignal | undefined
      const stages: string[] = []
      const f = fixture({ progress: async evidence => { stages.push(evidence.stage) },
        confirm: async (stage, _details, currentSignal) => {
          if (stage !== at) return true
          signal = currentSignal
          return new Promise<boolean>(done => { release = done })
        } })
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(1)
      expect(stages.at(-1)).toBe(`${at}_CONSENT`)
      await vi.advanceTimersByTimeAsync(60000)
      const result = await task
      expect(result).toMatchObject({ result: 'STOP', code: `${at}_CONSENT_TIMEOUT`, stage: `${at}_CONSENT`, inferenceRequests: 0,
        httpRequests: at === 'PREFLIGHT' ? 0 : 2 })
      expect(signal?.aborted).toBe(true)
      release!(true)
      await vi.advanceTimersByTimeAsync(1)
      expect(f.calls.map(request => request.method)).toEqual(at === 'PREFLIGHT' ? [] : ['GET', 'GET'])
      expect(f.reserve).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('reports consent expiry even when native abort resolves as Cancel', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture({ confirm: (_stage, _details, signal) => new Promise<boolean>(done => {
        signal.addEventListener('abort', () => done(false), { once: true })
      }) })
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(60001)
      expect(await task).toMatchObject({ code: 'PREFLIGHT_CONSENT_TIMEOUT', httpRequests: 0 })
      expect(f.send).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
  it('reports dialog failure separately from a user cancellation without exposing errors', async () => {
    const f = fixture({ confirm: async () => { throw Error(`PRIVATE ${key}`) } })
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code: 'PREFLIGHT_CONSENT_FAILED', httpRequests: 0 })
    expect(f.send).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(key)
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
  it('persists safe progress before each consent and transport attempt', async () => {
    const stages: string[] = []
    const f = fixture({ progress: async evidence => {
      stages.push(evidence.stage)
      expect(JSON.stringify(evidence)).not.toContain(key)
    } })
    const normal = f.options.send
    f.options.send = request => {
      expect(stages.at(-1)).toBe(request.method === 'POST' ? 'INFERENCE_DISPATCHING' : request.url.endsWith('/key') ? 'ACCOUNT_DISPATCHING' : 'CATALOGUE_DISPATCHING')
      return normal(request)
    }
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'PASS', httpRequests: 3, httpDelivery: 'UNKNOWN' })
    expect(stages).toEqual(['MAIN_STARTED', 'PREFLIGHT_CONSENT', 'ACCOUNT_DISPATCHING', 'CATALOGUE_DISPATCHING', 'SNAPSHOT_CONSENT', 'INFERENCE_DISPATCHING', 'INFERENCE_HEADERS_RECEIVED', 'INFERENCE_VALIDATION'])
  })
  it('progress persistence failure blocks dispatch', async () => {
    const f = fixture({ progress: async evidence => { if (evidence.stage === 'ACCOUNT_DISPATCHING') throw Error('PRIVATE') } })
    const result = await runOpenRouterSmoke(f.options)
    expect(result.code).toBe('EVIDENCE_PERSISTENCE_FAILED')
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('bounds metadata transport even when it ignores abort', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture({ send: () => new Promise(() => {}) })
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(30001)
      expect(await task).toMatchObject({ code: 'ACCOUNT_FREE_ACCESS_UNVERIFIED_TIMEOUT', httpRequests: 1, inferenceRequests: 0 })
      expect(f.reserve).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
  it('does not dispatch inference if timeout occurs while reserving', async () => {
    vi.useFakeTimers()
    try {
      let release: (() => void) | undefined
      const f = fixture({ reserve: () => new Promise<void>(done => { release = done }) })
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(100)
      expect(release).toBeTypeOf('function')
      await vi.advanceTimersByTimeAsync(30001)
      release!()
      await vi.advanceTimersByTimeAsync(25)
      expect(await task).toMatchObject({ code: 'TIMEOUT', httpRequests: 2 })
      expect(f.calls.map(request => request.method)).toEqual(['GET', 'GET'])
    } finally { vi.useRealTimers() }
  })
  it('denies nondevelopment/non-Main before loading a key or sending', async () => {
    const f = fixture({ electronMainDevelopment: false }), result = await runOpenRouterSmoke(f.options)
    expect(result.code).toBe('ELECTRON_MAIN_DEVELOPMENT_REQUIRED'); expect(f.readKey).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 'short', 'invalid key containing spaces'])('missing/invalid key %# sends nothing', async value => {
    const f = fixture({ readKey: () => value }), result = await runOpenRouterSmoke(f.options)
    expect(result.code).toBe('KEY_MISSING_OR_INVALID'); expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it.each(['PREFLIGHT', 'SNAPSHOT'] as const)('cancel at %s never sends inference or reserves allowance', async stage => {
    const f = fixture({ confirm: async at => at !== stage }), result = await runOpenRouterSmoke(f.options)
    expect(result.code).toBe('CONSENT_CANCELLED'); expect(result.inferenceRequests).toBe(0); expect(f.reserve).not.toHaveBeenCalled()
    expect(f.calls.every(r => r.method === 'GET')).toBe(true)
  })
  it('validates account/zero prices then exactly one consented C# L1 through real service/adapter', async () => {
    const f = fixture(), result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'PASS', inferenceRequests: 1, accountVerified: true, freeRouteVerified: true, httpStatus: 200,
      model: 'synthetic/test:free', schemaValidation: 'PASS', hint, productionEnabled: false, usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, cost: 0 } })
    expect(f.reserve).toHaveBeenCalledOnce(); expect(f.confirm).toHaveBeenCalledTimes(2)
    expect(f.calls.map(r => r.method)).toEqual(['GET', 'GET', 'POST'])
    expect(f.calls[0].headers.get('authorization')).toBe(`Bearer ${key}`); expect(f.calls[1].headers.has('authorization')).toBe(false)
    const body = await f.calls[2].json(), input = JSON.parse(body.messages[1].content)
    expect(body).toMatchObject({ model: 'openrouter/free', provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } }, max_tokens: 2048 })
    expect(input).toMatchObject({ language: 'csharp', source: SMOKE_SOURCE, action: { kind: 'HINT', level: 1 }, previousHints: [], runContext: { kind: 'CODE_ONLY' } })
    expect(JSON.stringify(result)).not.toContain(key)
  })
  it.each([
    {}, { is_free_tier: true, limit_remaining: null },
    { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 0 } },
    { is_free_tier: true, limit_remaining: -1, free_model_daily_requests: { remaining: 50 } },
    { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 50 }, effective_budget: { remaining_usd: 0 } },
  ])('unknown/exhausted/restricted account %# stops before catalogue or inference', async account => {
    const f = fixture({ send: async () => json({ data: account }) }), result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code: 'ACCOUNT_FREE_ACCESS_UNVERIFIED', inferenceRequests: 0, accountVerified: false }); expect(f.reserve).not.toHaveBeenCalled()
  })
  it.each(['0.01', undefined])('paid/unknown route price %s cannot infer', async prompt => {
    const f = fixture(), normal = f.options.send
    f.options.send = async r => r.url.endsWith('/models') ? json({ data: [{ id: 'openrouter/free', pricing: { prompt, completion: '0' }, supported_parameters: ['max_tokens'] }] }) : normal(r)
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code: 'FREE_ROUTE_UNVERIFIED', inferenceRequests: 0 }); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('a persistent reservation failure prevents any inference and reports a safe cause', async () => {
    const f = fixture({ reserve: async () => { throw new Error(`EEXIST ${key}`) } }), result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'STOP', code: 'ATTEMPT_RESERVATION_FAILED', inferenceRequests: 0 })
    expect(f.calls.map(r => r.method)).toEqual(['GET', 'GET']); expect(JSON.stringify(result)).not.toContain(key)
  })
  it.each([401, 402, 429, 500])('HTTP %s records only status and fixed failure, without resend', async status => {
    const f = fixture(), normal = f.options.send
    f.options.send = r => r.method === 'POST' ? Promise.resolve(new Response(`private ${key}`, { status })) : normal(r)
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'FAIL', inferenceRequests: 1, httpStatus: status, hint: null }); expect(f.reserve).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain(key)
  })
  it.each(['prose', JSON.stringify({ kind: 'HINT', level: 2, paragraphs: ['wrong level'], nextQuestion: '?', evidence: [] }), JSON.stringify({ ...hint, paragraphs: [key] })])('invalid/reflecting output %# never becomes a logged hint', async content => {
    const f = fixture(), normal = f.options.send
    f.options.send = r => r.method === 'POST' ? Promise.resolve(json({ model: 'synthetic/test:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] })) : normal(r)
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'FAIL', inferenceRequests: 1, code: 'INVALID_RESPONSE', schemaValidation: result.responseFailure?.code === 'SCHEMA_VALIDATION_FAILED' ? 'FAIL' : 'NOT_RUN', hint: null })
    expect(result.responseFailure).not.toBeNull()
    expect(JSON.stringify(result)).not.toContain(key)
  })
})

// New profile cases reuse only the synthetic transport above.
describe('North development profile and safe diagnostics (offline)', () => {
  const north = 'cohere/north-mini-code:free'
  const pricing = { prompt: '0', completion: '0' }
  const catalogue = { data: [{ id: north, pricing, supported_parameters: ['max_tokens'] }] }
  const endpoints = { data: { id: north, endpoints: [{ status: 0, pricing, supported_parameters: ['max_tokens'] }] } }
  function northFixture(post?: (request: Request) => Promise<Response>, endpointData: unknown = endpoints) {
    const f = fixture({ modelProfile: 'NORTH_MINI_CODE_FREE' }), normal = f.options.send
    f.options.send = async r => {
      if (r.url.endsWith('/models')) { f.calls.push(r); return json(catalogue) }
      if (r.url.endsWith('/endpoints')) { f.calls.push(r); return json(endpointData) }
      if (r.method === 'POST' && post) { f.calls.push(r); return post(r) }
      return normal(r)
    }
    return f
  }
  it('verifies anonymous catalogue/endpoints before North dispatch and names model at both consents', async () => {
    const f = northFixture(async r => {
      const body = await r.json()
      expect(body.model).toBe(north)
      expect(body.provider).toEqual({ allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } })
      for (const k of ['models', 'response_format', 'tools']) expect(body).not.toHaveProperty(k)
      return json({ model: north, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(hint) } }] })
    })
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ result: 'PASS', requestedModel: north, httpRequests: 4, inferenceRequests: 1, freeRouteVerified: true })
    expect(f.calls.map(r => r.method)).toEqual(['GET', 'GET', 'GET', 'POST'])
    expect(f.calls[2].headers.has('authorization')).toBe(false)
    expect(f.confirm).toHaveBeenCalledWith('PREFLIGHT', expect.stringContaining(north), expect.any(AbortSignal))
    expect(f.confirm).toHaveBeenCalledWith('SNAPSHOT', expect.stringContaining(north), expect.any(AbortSignal))
  })
  it.each([
    {}, { data: { id: north, endpoints: [] } },
    { data: { id: north, endpoints: [{ status: 1, pricing, supported_parameters: ['max_tokens'] }] } },
    { data: { id: north, endpoints: [{ status: 0, pricing: { ...pricing, request: '0.01' }, supported_parameters: ['max_tokens'] }] } },
    { data: { id: north, endpoints: [{ status: 0, pricing, supported_parameters: [] }] } },
  ])('unverified North endpoint %# stops without reservation or router substitution', async data => {
    const f = northFixture(undefined, data), result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code: 'FREE_ROUTE_UNVERIFIED', inferenceRequests: 0 })
    expect(f.reserve).not.toHaveBeenCalled(); expect(f.calls.every(r => r.method === 'GET')).toBe(true)
  })
  it.each(['not JSON', '```json\n{}\n```', '{"kind":"HINT","level":1,"level":1}', '{"kind":"HINT","level":2,"paragraphs":[],"nextQuestion":"x","evidence":[]}'])('North malformed/wrong schema output fails closed: %s', async content => {
    const f = northFixture(async () => json({ model: north, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] }))
    expect(await runOpenRouterSmoke(f.options)).toMatchObject({ result: 'FAIL', code: 'INVALID_RESPONSE', hint: null, inferenceRequests: 1 })
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('rejects a different returned model without falling back or publishing a hint', async () => {
    const f = northFixture(async () => json({ model: 'different/model:free', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(hint) } }] }))
    expect(await runOpenRouterSmoke(f.options)).toMatchObject({ result: 'FAIL', code: 'INVALID_RESPONSE', hint: null, inferenceRequests: 1 })
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it.each([
    [{ error_type: 'insufficient_quota' }, 'UNKNOWN'],
    [{ provider_code: 429 }, 'PROVIDER_RATE_LIMIT'],
    [{ error_type: 'insufficient_quota', provider_code: 429 }, 'UNKNOWN'],
    [{ error_type: 'private-secret', provider_code: 'private-secret' }, 'UNKNOWN'],
    [{}, 'UNKNOWN'],
  ])('429 allowlisted attribution %j, without disclosing reflected secrets', async (metadata, attribution) => {
    const f = northFixture(async () => new Response(JSON.stringify({ error: { code: 429, message: `PRIVATE ${key}`, metadata: { ...metadata, raw: key } } }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60', 'x-ratelimit-limit': '20', 'x-ratelimit-remaining': '0', 'x-request-id': key } }))
    const result = await runOpenRouterSmoke(f.options)
    expect(result).toMatchObject({ code: 'RATE_LIMIT', hint: null, inferenceRequests: 1, diagnostics: {
      status: 429, retryAfterSeconds: 60, attribution, errorCode: 429, rateLimit: { limit: 20, remaining: 0, reset: null } } })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private-secret|raw|x-request-id/)
    expect(JSON.stringify(result)).not.toContain(key)
    expect(f.calls).toHaveLength(4); expect(f.reserve).toHaveBeenCalledOnce()
  })
})


describe('SH-4 development deadline integration (offline fake time)', () => {
  it.each(['headers', 'body'] as const)('accepts %s delayed beyond production 10s and completes before 30s', async delayed => {
    vi.useFakeTimers()
    try {
      const f = fixture(), normal = f.options.send
      f.options.send = async r => {
        if (r.method !== 'POST') return normal(r)
        const reply = await normal(r)
        if (delayed === 'headers') {
          await new Promise(done => setTimeout(done, 15000)); return reply
        }
        const bytes = new TextEncoder().encode(await reply.text())
        return new Response(new ReadableStream({ start(c) {
          setTimeout(() => { c.enqueue(bytes); c.close() }, 15000)
        } }), { headers: { 'content-type': 'application/json' } })
      }
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(16000)
      expect(await task).toMatchObject({ result: 'PASS', timeoutMs: 30000, timeoutOwner: null, inferenceStage: 'COMPLETE', inferenceRequests: 1 })
      expect(f.reserve).toHaveBeenCalledOnce()
      expect(f.calls.filter(r => r.method === 'POST')).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it.each(['headers', 'body'] as const)('Main deadline wins during %s, aborts, cleans up and ignores late headers', async delayed => {
    vi.useFakeTimers()
    try {
      const f = fixture(), normal = f.options.send, cancel = vi.fn()
      let release!: (r: Response) => void
      let signal: AbortSignal | undefined
      f.options.send = async r => {
        if (r.method !== 'POST') return normal(r)
        f.calls.push(r); signal = r.signal
        if (delayed === 'headers') return new Promise<Response>(done => { release = done })
        return new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } })
      }
      const task = runOpenRouterSmoke(f.options)
      await vi.advanceTimersByTimeAsync(29999)
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(50)
      const result = await task
      expect(result).toMatchObject({ code: 'TIMEOUT', timeoutOwner: 'MAIN_SERVICE', timeoutMs: 30000,
        httpStatus: delayed === 'body' ? 200 : null, inferenceStage: delayed === 'body' ? 'READING_BODY' : 'WAITING_HEADERS', schemaValidation: 'NOT_RUN', hint: null, inferenceRequests: 1 })
      expect(signal?.aborted).toBe(true)
      if (delayed === 'headers') {
        release(new Response(new ReadableStream({ cancel })))
        await vi.advanceTimersByTimeAsync(1)
      }
      expect(cancel).toHaveBeenCalledOnce()
      expect(result.hint).toBeNull()
      expect(f.reserve).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
