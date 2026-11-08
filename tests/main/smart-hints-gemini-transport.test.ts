import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedGeminiTransport, GEMINI_MODEL, GEMINI_MODEL_URL, GEMINI_GENERATE_URL,
  type GeminiGenerateRequest, type GeminiTransportSession, type GeminiExecution } from '../../src/main/services/learning/smart-hints/gemini-transport'
import { SharedExecutionCoordinator } from '../../src/main/services/learning/smart-hints/execution-coordinator'
import { SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import { SMART_HINT_POLICY as P } from '../../src/shared/contracts/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const key = 'SYNTHETIC_SHARED_TRANSPORT_CREDENTIAL'
const metadata = { name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 }
const body = (): GeminiGenerateRequest => ({ systemInstruction: { parts: [{ text: 'Synthetic consumer instructions.' }] },
  contents: [{ role: 'user', parts: [{ text: 'synthetic input' }] }],
  generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, candidateCount: 1, maxOutputTokens: 2048 } })
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_HTTP_FORBIDDEN') }) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function fixture(reply: () => Response = () => Response.json({ fixture: true }), options: GeminiExecution = {}) {
  const send = vi.fn(async (request: Request) => request.method === 'GET' ? Response.json(metadata) : reply())
  const credential = { value: vi.fn(() => key), clear: vi.fn() }, reserve = vi.fn(async () => {}), diagnostic = vi.fn()
  const client = new SharedGeminiTransport({ send }, credential, { beforeInference: reserve, onDiagnostic: diagnostic, ...options })
  const run = (controller = new AbortController(), input = body()) => client.execute(controller.signal, async session => {
    await session.checkModel(); return session.generate(input)
  })
  return { send, credential, reserve, diagnostic, client, run }
}

describe('shared fixed-model Gemini HTTP lifetime (fake network only)', () => {
  it('preserves exact GET/POST, headers, request policy and JSON body without rewriting contents', async () => {
    const f = fixture(), input = body()
    expect(await f.run(undefined, input)).toEqual({ fixture: true })
    expect(f.send.mock.calls.map(([r]) => [r.method, r.url])).toEqual([['GET', GEMINI_MODEL_URL], ['POST', GEMINI_GENERATE_URL]])
    for (const [request] of f.send.mock.calls) {
      expect(request.headers.get('x-goog-api-key')).toBe(key)
      expect(request.headers.has('authorization')).toBe(false); expect(request.url).not.toContain(key)
      expect(request.redirect).toBe('error'); expect(request.credentials).toBe('omit'); expect(request.cache).toBe('no-store')
    }
    expect(f.send.mock.calls[0][0].body).toBeNull()
    expect(await f.send.mock.calls[1][0].text()).toBe(JSON.stringify(input))
    expect(f.reserve).toHaveBeenCalledOnce(); expect(f.credential.value).toHaveBeenCalledOnce()
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toMatch(/SYNTHETIC_SHARED|synthetic input|instructions/)
    f.client.dispose(); expect(f.credential.clear).toHaveBeenCalledOnce()
  })
  it.each([[400, 'PROVIDER'], [401, 'AUTH'], [403, 'AUTH'], [402, 'BALANCE'], [429, 'RATE_LIMIT'], [500, 'PROVIDER'], [503, 'PROVIDER']] as const)(
    'HTTP %i maps to %s without retry or parsing an unsafe error message', async (status, code) => {
      const f = fixture(() => Response.json({ error: { message: `UNTRUSTED ${key}` } }, { status }))
      const error = await f.run().catch(e => e)
      expect(error).toMatchObject({ code }); expect(String(error)).not.toMatch(/UNTRUSTED|SYNTHETIC_SHARED/)
      expect(f.send).toHaveBeenCalledTimes(2); expect(f.reserve).toHaveBeenCalledOnce()
      expect(f.diagnostic).toHaveBeenCalledWith(expect.objectContaining({ stage: 'HEADERS_RECEIVED', requestKind: 'INFERENCE', httpStatus: status }))
    })
  it.each([
    ['malformed', () => new Response('{', { headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
    ['duplicate keys', () => new Response('{"a":1,"a":2}', { headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
    ['non-object', () => Response.json([]), 'INVALID_RESPONSE'],
    ['wrong type', () => new Response('UNTRUSTED', { headers: { 'content-type': 'text/html' } }), 'INVALID_RESPONSE'],
    ['missing body', () => new Response(null, { headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
    ['oversize header', () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(P.wireBytes + 1) } }), 'LIMIT_EXCEEDED'],
    ['oversize chunks', () => new Response('x'.repeat(P.wireBytes + 1), { headers: { 'content-type': 'application/json' } }), 'LIMIT_EXCEEDED'],
    ['invalid UTF-8', () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
  ] as const)('%s response fails closed', async (_name, reply, code) => {
    const f = fixture(reply)
    await expect(f.run()).rejects.toMatchObject({ code })
    expect(f.send).toHaveBeenCalledTimes(2)
  })
  it.each([`{ "echo": "${key}" }`, `{ "echo": "${Buffer.from(key).toString('base64')}" }`])('rejects secret forms in response and request without diagnostic leakage', async raw => {
    const f = fixture(() => new Response(raw, { headers: { 'content-type': 'application/json' } }))
    await expect(f.run()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    const input = body(); input.contents[0].parts[0].text = raw
    await expect(f.run(undefined, input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain(key)
    expect(JSON.stringify(f.diagnostic.mock.calls)).not.toContain(Buffer.from(key).toString('base64'))
  })
  it('bounds the whole multi-turn request before reservation and rejects output-policy changes', async () => {
    const f = fixture(), input = body(); input.contents[0].parts[0].text = 'x'.repeat(P.requestBytes)
    await expect(f.run(undefined, input)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' })
    const changed = body(); changed.generationConfig.maxOutputTokens++
    await expect(f.run(undefined, changed)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.reserve).not.toHaveBeenCalled(); expect(f.send.mock.calls.every(([r]) => r.method === 'GET')).toBe(true)
  })
  it.each([{ ...metadata, name: 'models/unapproved' }, { ...metadata, outputTokenLimit: 2047 }, { ...metadata, supportedGenerationMethods: [] }])(
    'metadata readiness failure sends no reservation or inference', async value => {
      const f = fixture(); f.send.mockResolvedValueOnce(Response.json(value))
      await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER', providerFailureSource: 'MODEL_METADATA_ERROR' })
      expect(f.send).toHaveBeenCalledOnce(); expect(f.reserve).not.toHaveBeenCalled()
    })
  it('reuses one metadata check within a lifetime, never repeats generation, and closes escaped sessions', async () => {
    const f = fixture(); let escaped!: GeminiTransportSession
    await f.client.execute(new AbortController().signal, async session => {
      escaped = session
      const first = session.checkModel(); expect(session.checkModel()).toBe(first); await first
      await session.generate(body())
      await expect(session.generate(body())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    })
    await expect(escaped.generate(body())).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('detaches the request before awaiting reservation', async () => {
    const pending = gate<void>(), entered = gate<void>(), input = body()
    const f = fixture(undefined, { beforeInference: async () => { entered.resolve(); await pending.promise } })
    const result = f.run(undefined, input); await entered.promise
    input.contents[0].parts[0].text = 'MUTATED'; input.generationConfig.maxOutputTokens = 9999
    pending.resolve(); await result
    expect(await f.send.mock.calls[1][0].json()).toEqual(body())
  })
  it('an already-aborted operation never reads the credential or dispatches HTTP', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort()
    await expect(f.run(controller)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(f.credential.value).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
  })
  it('missing key fails before HTTP; network errors expose no unsafe details', async () => {
    const f = fixture(); f.credential.value.mockReturnValueOnce('')
    await expect(f.run()).rejects.toMatchObject({ code: 'AUTH' }); expect(f.send).not.toHaveBeenCalled()
    f.send.mockRejectedValueOnce(new Error(`UNTRUSTED ${key}`))
    const error = await f.run().catch(e => e)
    expect(error).toMatchObject({ code: 'NETWORK' }); expect(String(error)).not.toContain(key)
    expect(f.send).toHaveBeenCalledOnce(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('abort before headers cancels a late response and removes its listener without retry', async () => {
    const pending = gate<Response>(), f = fixture(), controller = new AbortController(), cancel = vi.fn()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    f.send.mockImplementationOnce(() => pending.promise)
    const result = f.run(controller); controller.abort()
    await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' })
    pending.resolve(new Response(new ReadableStream({ cancel })))
    await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(f.send).toHaveBeenCalledOnce(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('abort during body reading cancels the reader and releases the stream lock', async () => {
    const reading = gate<void>(), cancel = vi.fn(), stream = new ReadableStream<Uint8Array>({ pull() { reading.resolve() }, cancel })
    const f = fixture(() => new Response(stream, { headers: { 'content-type': 'application/json' } })), controller = new AbortController()
    const result = f.run(controller)
    await reading.promise; await vi.waitFor(() => expect(stream.locked).toBe(true))
    controller.abort(); await expect(result).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(f.send).toHaveBeenCalledTimes(2)
  })
  it.each([10000, 30000])('direct lifetime honors its existing %ims timeout and cleans timer/listeners', async timeoutMs => {
    vi.useFakeTimers()
    const pending = gate<Response>(), timeout = vi.fn(), f = fixture(undefined, { timeoutMs, onTimeout: timeout }), controller = new AbortController()
    f.send.mockImplementationOnce(() => pending.promise)
    const rejection = expect(f.run(controller)).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(timeoutMs); await rejection
    expect(timeout).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    expect(f.send.mock.calls[0][0].signal.aborted).toBe(true); expect(f.send).toHaveBeenCalledOnce()
    pending.resolve(Response.json(metadata)); await Promise.resolve()
  })
  it('uses only the outer Main deadline when supplied', async () => {
    vi.useFakeTimers(); let now = 0
    const pending = gate<Response>(), f = fixture(), controller = new AbortController()
    f.send.mockImplementationOnce(() => pending.promise)
    setTimeout(() => { now = 10000; controller.abort() }, 10000)
    const rejection = expect(f.client.execute(controller.signal, async session => session.checkModel(), { deadline: 10000, clock: () => now })).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(10000); await rejection
    expect(vi.getTimerCount()).toBe(0); pending.resolve(Response.json(metadata)); await Promise.resolve()
  })
  it('reservation failure never POSTs or retries', async () => {
    const reserve = vi.fn(async () => { throw new SmartProviderError('PROVIDER', undefined, undefined, 'RESERVATION_IO_ERROR') })
    const f = fixture(undefined, { beforeInference: reserve })
    await expect(f.run()).rejects.toMatchObject({ code: 'PROVIDER', providerFailureSource: 'RESERVATION_IO_ERROR' })
    expect(f.send).toHaveBeenCalledOnce(); expect(reserve).toHaveBeenCalledOnce()
  })
  it('two fake consumers use the transport with one external admission/ledger and unchanged multi-turn contents', async () => {
    const reserveDaily = vi.fn(async () => {}), coordinator = new SharedExecutionCoordinator(Date.now, reserveDaily)
    const response = gate<Response>(), posted = gate<void>(), requests: Request[] = []
    let posts = 0
    const send = vi.fn(async (r: Request) => {
      requests.push(r)
      if (r.method === 'GET') return Response.json(metadata)
      if (++posts === 1) { posted.resolve(); return response.promise }
      return Response.json({ fixture: true })
    })
    const consumer = async (input: GeminiGenerateRequest) => {
      const controller = new AbortController(), admitted = coordinator.admit({ signal: controller.signal, deadline: Date.now() + 10000, cancel: () => controller.abort() })
      if (!admitted.ok) return admitted.code
      const transport = new SharedGeminiTransport({ send }, { value: () => key, clear() {} }, { beforeInference: admitted.admission.reserveInference })
      try { return await transport.execute(controller.signal, async session => { await session.checkModel(); return session.generate(input) }, { deadline: Date.now() + 10000, clock: Date.now }) }
      finally { admitted.admission.release() }
    }
    const first = consumer(body()); await posted.promise
    expect(await consumer(body())).toBe('BUSY'); expect(send).toHaveBeenCalledTimes(2)
    response.resolve(Response.json({ fixture: true })); await first; await coordinator.drain()
    const input = body(); input.contents.push({ role: 'model', parts: [{ text: 'synthetic prior response' }] }, { role: 'user', parts: [{ text: 'synthetic follow-up' }] })
    expect(await consumer(input)).toEqual({ fixture: true }); await coordinator.drain()
    expect(await requests[3].json()).toEqual(input)
    expect(reserveDaily).toHaveBeenCalledTimes(2); expect(send).toHaveBeenCalledTimes(4)
  })
})
