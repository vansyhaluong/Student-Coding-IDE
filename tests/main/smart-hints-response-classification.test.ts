import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runOpenRouterSmoke } from '../../scripts/sh4-openrouter-smoke'
import { createOpenRouterSmartHintsService, NORTH_MINI_CODE_FREE_MODEL as model } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import { projectResponseFailure, schemaResponseFailure } from '../../src/main/services/learning/smart-hints/response-failure'
import { SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import { capture, request, start, reference } from '../fixtures/learning/smart-hints'

const key = 'SYNTHETIC-ONLY-CLASSIFICATION-KEY'
const hint = { kind: 'HINT', thinking: 'Compare the public examples.', steps: ['Compare the public inputs.'], code: { language: 'csharp', text: 'return x + 1;' }, evidence: [] }
const envelope = (content: unknown = JSON.stringify(hint)) => JSON.stringify({ model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] })
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(() => { vi.unstubAllGlobals() })

async function smoke(raw: string, status = 200) {
  const calls: Request[] = [], reserve = vi.fn(async () => {})
  const result = await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile: 'NORTH_MINI_CODE_FREE', readKey: () => key,
    confirm: async () => true, reserve, send: async r => {
      calls.push(r)
      const pricing = { prompt: '0', completion: '0' }, supported_parameters = ['max_tokens']
      if (r.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
      if (r.url.endsWith('/models')) return json({ data: [{ id: model, pricing, supported_parameters }] })
      if (r.url.endsWith('/endpoints')) return json({ data: { id: model, endpoints: [{ status: 0, pricing, supported_parameters }] } })
      const body = await r.clone().json()
      expect(body).toMatchObject({ model, max_tokens: 2048, provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } } })
      expect(body).not.toHaveProperty('response_format'); expect(body).not.toHaveProperty('models')
      return new Response(raw, { status, headers: { 'content-type': 'application/json' } })
    } })
  return { result, calls, reserve }
}

describe('HTTP 200 response rejection classification, Main-private only', () => {
  const cases = [
    { raw: '{', code: 'ENVELOPE_INVALID', contentType: 'UNOBSERVED', stage: 'ENVELOPE', invalidFields: [] },
    { raw: JSON.stringify({ model, private_unknown_field: 'PRIVATE-CANARY', choices: [] }), code: 'ENVELOPE_INVALID', contentType: 'UNOBSERVED', stage: 'ENVELOPE', invalidFields: [] },
    { raw: JSON.stringify({ model, choices: [{ finish_reason: 'stop', message: { role: 'assistant' } }] }), code: 'CONTENT_MISSING', contentType: 'MISSING', stage: 'CONTENT_EXTRACTION', invalidFields: [] },
    ...[null, '', ' \n\t'].map(content => ({ raw: envelope(content), code: 'CONTENT_MISSING', contentType: content === null ? 'NULL' : 'STRING', stage: 'CONTENT_EXTRACTION', invalidFields: [] })),
    { raw: envelope([{ type: 'text', text: 'PRIVATE-CANARY' }]), code: 'ENVELOPE_INVALID', contentType: 'ARRAY', stage: 'ENVELOPE', invalidFields: [] },
    { raw: envelope({ private: 'PRIVATE-CANARY' }), code: 'ENVELOPE_INVALID', contentType: 'OBJECT', stage: 'ENVELOPE', invalidFields: [] },
    ...['not JSON PRIVATE-CANARY', '```json\n{}\n```', '{"kind":"HINT","kind":"HINT"}'].map(content => ({ raw: envelope(content), code: 'JSON_PARSE_FAILED', contentType: 'STRING', stage: 'CONTENT_JSON', invalidFields: [] })),
    { raw: envelope(JSON.stringify({ ...hint, level: 2 })), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['$'] },
    { raw: envelope(JSON.stringify({ ...hint, steps: [], thinking: 123 })), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['thinking', 'steps'] },
    { raw: envelope(JSON.stringify({ kind: 'HINT', thinking: hint.thinking, steps: hint.steps, evidence: [] })), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['code'] },
    { raw: envelope(JSON.stringify({ ...hint, evidence: ['R1'] })), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['evidence'] },
    { raw: envelope(JSON.stringify({ ...hint, 'PRIVATE-CANARY': 'PRIVATE-CANARY' })), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['$'] },
    { raw: envelope(JSON.stringify('PRIVATE-CANARY')), code: 'SCHEMA_VALIDATION_FAILED', contentType: 'STRING', stage: 'SH1_SCHEMA', invalidFields: ['$'] },
  ]
  it.each(cases)('$code / $contentType / $invalidFields', async test => {
    const { result, calls, reserve } = await smoke(test.raw)
    expect(result).toMatchObject({ code: 'INVALID_RESPONSE', hint: null, inferenceRequests: 1, httpStatus: 200,
      responseFailure: { code: test.code, stage: test.stage, contentType: test.contentType, invalidFields: test.invalidFields },
      schemaValidation: test.code === 'SCHEMA_VALIDATION_FAILED' ? 'FAIL' : 'NOT_RUN' })
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CANARY'); expect(JSON.stringify(result)).not.toContain(key)
    expect(result).not.toHaveProperty('source'); expect(result).not.toHaveProperty('prompt'); expect(result).not.toHaveProperty('choices')
    expect(calls).toHaveLength(4); expect(reserve).toHaveBeenCalledOnce()
  })
  it('valid output keeps the strict schema, no diagnostic and one send', async () => {
    const { result, calls } = await smoke(envelope())
    expect(result).toMatchObject({ code: 'COMPLETE', hint, schemaValidation: 'PASS', responseFailure: null, inferenceRequests: 1 })
    expect(calls).toHaveLength(4)
  })
  it('429 retains rate-limit diagnostics and is not mislabeled as a content/schema error', async () => {
    const { result } = await smoke('{"error":{"code":429,"message":"PRIVATE-CANARY"}}', 429)
    expect(result).toMatchObject({ code: 'RATE_LIMIT', responseFailure: null, schemaValidation: 'NOT_RUN', diagnostics: { status: 429 } })
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CANARY')
  })
  it('reflected synthetic key never reaches diagnostic metadata or a hint', async () => {
    const { result } = await smoke(envelope(JSON.stringify({ ...hint, paragraphs: [key] })))
    expect(result).toMatchObject({ code: 'INVALID_RESPONSE', responseFailure: { code: 'ENVELOPE_INVALID' }, schemaValidation: 'NOT_RUN', hint: null })
    expect(JSON.stringify(result)).not.toContain(key)
  })
})

it('diagnostic projection never echoes unknown codes, content types, field names, values or extra error properties', () => {
  expect(projectResponseFailure({ code: 'PRIVATE-CANARY' })).toBeUndefined()
  expect(projectResponseFailure({ code: 'SCHEMA_VALIDATION_FAILED', stage: 'PRIVATE-CANARY', contentType: 'PRIVATE-CANARY',
    invalidFields: ['PRIVATE-CANARY', 'level'], raw: key, source: 'PRIVATE-CANARY' })).toEqual({ code: 'SCHEMA_VALIDATION_FAILED', stage: 'SH1_SCHEMA', contentType: 'UNOBSERVED', invalidFields: ['level'] })
  const getter = vi.fn(() => key), unsafe = Object.defineProperty({}, 'code', { get: getter })
  expect(projectResponseFailure(unsafe)).toBeUndefined(); expect(getter).not.toHaveBeenCalled()
  const getterOutput = Object.defineProperty({ ...hint }, 'steps', { get: getter, enumerable: true })
  expect(schemaResponseFailure(getterOutput, { kind: 'HINT' }, [])).toMatchObject({ invalidFields: ['steps'] })
  expect(getter).not.toHaveBeenCalled()
})

it('private classification is not exposed through public status, and a throwing diagnostic sink cannot alter fail-closed behavior', async () => {
  const sink = vi.fn(() => { throw Error('PRIVATE-CANARY') })
  const service = createOpenRouterSmartHintsService({ development: true, liveApproved: true, readKey: () => key,
    onResponseFailure: sink, transport: { send: async () => json(JSON.parse(envelope(JSON.stringify({ ...hint, level: 2 })))) } })
  try {
    const q = request({ action: { kind: 'HINT', level: 1 } }), prepared = await service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
    service.start(1, 'doc', start(prepared))
    await vi.waitFor(() => expect(service.status(1, 'doc', reference(prepared))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ code: 'SCHEMA_VALIDATION_FAILED', stage: 'SH1_SCHEMA', contentType: 'STRING', invalidFields: ['$'] }), q.requestId)
    const status = service.status(1, 'doc', reference(prepared))
    expect(status).not.toHaveProperty('responseFailure'); expect(status).not.toHaveProperty('invalidFields')
    expect(JSON.stringify(status)).not.toMatch(/PRIVATE-CANARY|SCHEMA_VALIDATION_FAILED|SH1_SCHEMA/)
  } finally { await service.stop() }
})

it('a custom transport error cannot smuggle raw data into the Main diagnostic sink', async () => {
  const sink = vi.fn()
  const unsafe = { code: 'ENVELOPE_INVALID', stage: key, contentType: key, invalidFields: [key], raw: key }
  const service = createOpenRouterSmartHintsService({ development: true, liveApproved: true, readKey: () => key, onResponseFailure: sink,
    transport: { send: async () => { throw new SmartProviderError('INVALID_RESPONSE', unsafe as never) } } })
  try {
    const q = request(), p = await service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
    service.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(service.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
    expect(sink).toHaveBeenCalledWith({ code: 'ENVELOPE_INVALID', stage: 'ENVELOPE', contentType: 'UNOBSERVED', invalidFields: [] }, q.requestId)
    expect(JSON.stringify(sink.mock.calls)).not.toContain(key)
  } finally { await service.stop() }
})
