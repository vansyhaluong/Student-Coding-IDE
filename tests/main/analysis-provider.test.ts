import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DirectDeepSeekAdapter } from '../../src/main/services/learning/analysis/adapter'
import { POLICY } from '../../src/main/services/learning/analysis/contracts'
import { strictJson, validateAnalysis, inputSnapshot } from '../../src/main/services/learning/analysis/validation'
import { analysis, envelope, input, response } from '../fixtures/learning/analysis'
const credential = { authorization: () => 'Bearer synthetic-dummy-secret', clear() {} }
describe('D2 promoted direct adapter: fake transport only', () => {
  it('native fetch reaches only test loopback; fixed direct request and one single-use call', async () => {
    let calls = 0, payload: unknown
    const server = createServer(async (req, res) => {
      calls++; const chunks = []; for await (const chunk of req) chunks.push(chunk)
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(envelope()))
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address(); if (!address || typeof address === 'string') throw Error()
    const send = vi.fn(async (r: Request) => {
      expect(r.url).toBe('https://api.deepseek.com/chat/completions'); expect(r.redirect).toBe('error')
      return fetch(`http://127.0.0.1:${address.port}/fake`, { method: r.method, headers: r.headers, body: await r.text(), signal: r.signal })
    })
    try {
      const op = new DirectDeepSeekAdapter({ send }, credential).createOperation(input)
      expect(await op.run()).toMatchObject({ ok: true, advisory: true, analysis })
      expect(await op.run()).toMatchObject({ ok: false, code: 'ALREADY_USED' })
      expect(calls).toBe(1); expect(send).toHaveBeenCalledOnce()
      expect(payload).toMatchObject({ stream: false, max_tokens: 1024, tool_choice: 'none', response_format: { type: 'json_object' } })
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) }
  })
  it.each([[400, 'REQUEST_REJECTED'], [401, 'AUTHENTICATION'], [402, 'BALANCE'], [403, 'AUTHENTICATION'],
    [422, 'REQUEST_REJECTED'], [429, 'RATE_LIMIT'], [500, 'PROVIDER_ERROR'], [503, 'PROVIDER_ERROR']])('HTTP %i maps to %s once and redacts body', async (status, code) => {
    const send = vi.fn(async () => new Response('PRIVATE_EXPECTED synthetic-dummy-secret', { status: status as number }))
    const result = await new DirectDeepSeekAdapter({ send }, credential).createOperation(input).run()
    expect(result).toMatchObject({ ok: false, code, retryable: false }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|dummy-secret/)
    expect(send).toHaveBeenCalledOnce()
  })
  it('network exceptions are sanitized and not retried', async () => {
    const send = vi.fn(async () => { throw Error('PRIVATE_PATH synthetic-dummy-secret') })
    const result = await new DirectDeepSeekAdapter({ send }, credential).createOperation(input).run()
    expect(result).toMatchObject({ code: 'NETWORK_ERROR' }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|dummy-secret/); expect(send).toHaveBeenCalledOnce()
  })
  it.each(['', '```json\n{}\n```', '{} {}', '{"schemaVersion":1,"schemaVersion":1}', '{"__proto__":{}}', '[]',
    JSON.stringify({ ...analysis, verdict: 'Accepted' }), JSON.stringify({ ...analysis, codeQuality: [] }),
    JSON.stringify({ ...analysis, algorithmAnalysis: 'x'.repeat(8193) }), '{"a":"\\ud800"}'])('rejects malformed analysis %s without repair', async content => {
    const send = vi.fn(async () => response(JSON.stringify(envelope(content))))
    expect(await new DirectDeepSeekAdapter({ send }, credential).createOperation(input).run()).toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(send).toHaveBeenCalledOnce()
  })
  it.each(['synthetic-dummy-secret', Buffer.from('synthetic-dummy-secret').toString('base64')])('rejects secret reflection %s', async secret => {
    const send = vi.fn(async () => response(JSON.stringify(envelope(JSON.stringify({ ...analysis, algorithmAnalysis: secret })))))
    expect(await new DirectDeepSeekAdapter({ send }, credential).createOperation(input).run()).toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('timeouts and external cancellation abort the fake transport exactly once', async () => {
    for (const cancel of [false, true]) {
      const controller = new AbortController()
      const send = vi.fn((r: Request) => new Promise<Response>((_resolve, reject) => r.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })))
      const pending = new DirectDeepSeekAdapter({ send }, credential, 25).createOperation(input).run(controller.signal)
      if (cancel) controller.abort()
      expect(await pending).toMatchObject({ code: cancel ? 'CANCELLED' : 'TIMEOUT' }); expect(send).toHaveBeenCalledOnce()
    }
  })
  it('bounds responses and refuses truncated/tool output', async () => {
    for (const body of [JSON.stringify(envelope()).replace('"stop"', '"length"'),
      JSON.stringify({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(analysis), tool_calls: [] } }] })]) {
      const result = await new DirectDeepSeekAdapter({ send: async () => response(body) }, credential).createOperation(input).run()
      expect(result.ok).toBe(false)
    }
    const send = vi.fn(async () => new Response('x', { headers: { 'content-type': 'application/json', 'content-length': String(POLICY.wireBytes + 1) } }))
    expect(await new DirectDeepSeekAdapter({ send }, credential).createOperation(input).run()).toMatchObject({ code: 'RESPONSE_LIMIT' })
  })
  it.each([{ source: 'x'.repeat(16385) }, { publicStatement: 'x'.repeat(8193) }, { packageVersion: 0 }, { source: '\ud800' },
    { expected: 'PRIVATE' }, { endpoint: 'https://example.com' }, { model: 'x' }, { apiKey: 'x' }])('invalid input %j causes zero calls', async patch => {
    const send = vi.fn(async () => response())
    expect(await new DirectDeepSeekAdapter({ send }, credential).createOperation({ ...input, ...patch }).run()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(send).not.toHaveBeenCalled()
  })
  it('strict parser enforces depth/nodes/duplicate decoded keys and exact limits', () => {
    for (const raw of ['[ '.repeat(12) + '1' + ']'.repeat(12), '[' + '0,'.repeat(2048) + '0]', '{"a":1,"\\u0061":2}']) expect(() => strictJson(raw, 32768)).toThrow()
    expect(inputSnapshot({ ...input, source: 'x'.repeat(16384), publicStatement: 'x'.repeat(8192) }).source.length).toBe(16384)
    expect(validateAnalysis(JSON.stringify(analysis))).toEqual(analysis)
  })
})
