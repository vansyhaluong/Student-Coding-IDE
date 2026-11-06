import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterSmartHintsAdapter, NORTH_MINI_CODE_FREE_MODEL as model } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import { FakeDeepSeekAdapter, SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import { envelopeDiagnostics, projectEnvelopeDiagnostics } from '../../src/main/services/learning/smart-hints/envelope-diagnostics'
import { projectResponseFailure } from '../../src/main/services/learning/smart-hints/response-failure'
import { capture, request } from '../fixtures/learning/smart-hints'
import { runOpenRouterSmoke } from '../../scripts/sh4-openrouter-smoke'

// Contract-based synthetic fixtures, not a saved response from north-diagnostics-20261102.
// Sources: https://openrouter.ai/openapi.json (ChatResult.service_tier),
// https://openrouter.ai/docs/api_reference/overview (NonStreamingChoice.native_finish_reason).
const key = 'SYNTHETIC-ONLY-ENVELOPE-KEY'
const hint = { kind: 'HINT', level: 1, paragraphs: ['Compare the public examples.'], nextQuestion: 'What changes?', evidence: [] }
const wire = () => ({ model, id: 'synthetic', created: 1, object: 'chat.completion', system_fingerprint: null,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(hint) } }],
  usage: { prompt_tokens: 280, completion_tokens: 385, total_tokens: 665, cost: 0 } })
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const credential = () => ({ authorization: () => `Bearer ${key}`, clear: () => {} })
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(() => { vi.unstubAllGlobals() })
async function reject(value: unknown, contentType = 'application/json') {
  const send = vi.fn(async () => new Response(typeof value === 'string' ? value : JSON.stringify(value), { headers: { 'content-type': contentType } }))
  const adapter = new OpenRouterSmartHintsAdapter({ send }, credential(), model)
  const error = await adapter.run(capture(request({ action: { kind: 'HINT', level: 1 } })), [], new AbortController().signal).catch(e => e)
  expect(error).toBeInstanceOf(SmartProviderError)
  if (!(error instanceof SmartProviderError)) throw Error('EXPECTED_PROVIDER_ERROR')
  expect(error.code).toBe('INVALID_RESPONSE')
  expect(send).toHaveBeenCalledOnce()
  return error as SmartProviderError
}

describe('documented optional metadata compatibility, no schema/parser relaxation', () => {
  it.each([null, 'default', 'auto'])('accepts documented service_tier %s, discards its value', async service_tier => {
    const send = vi.fn(async () => json({ ...wire(), service_tier }))
    expect(await new OpenRouterSmartHintsAdapter({ send }, credential(), model).run(capture(request()), [], new AbortController().signal)).toEqual(hint)
    expect(send).toHaveBeenCalledOnce()
  })
  it('accepts absent/null/string native finish reason only with normalized stop', async () => {
    for (const native of [undefined, null, 'stop', 'completed']) {
      const value = wire(); Object.assign(value.choices[0], { native_finish_reason: native })
      expect(await new OpenRouterSmartHintsAdapter({ send: async () => json(value) }, credential(), model)
        .run(capture(request()), [], new AbortController().signal)).toEqual(hint)
    }
  })
  it.each([{}, [], 0, true, 'x'.repeat(257)])('rejects wrong/beyond-policy service_tier %# rather than accepting arbitrary metadata', async service_tier => {
    const error = await reject({ ...wire(), service_tier })
    expect(error.responseFailure?.envelope?.check).toBe('SERVICE_TIER')
  })
  it('service_tier and native null never bypass strict content JSON or SH-1 schema', async () => {
    const value = wire(); Object.assign(value, { service_tier: null }); Object.assign(value.choices[0], { native_finish_reason: null })
    value.choices[0].message.content = '```json\n{}\n```'
    expect((await reject(value)).responseFailure).toMatchObject({ code: 'JSON_PARSE_FAILED' })
    value.choices[0].finish_reason = 'length'
    expect((await reject(value)).responseFailure?.envelope?.check).toBe('FINISH_REASON')
    Object.assign(value.choices[0], { native_finish_reason: {} }); value.choices[0].finish_reason = 'stop'
    expect((await reject(value)).responseFailure?.envelope?.check).toBe('CHOICE_METADATA')
  })
  it('does not enable these OpenRouter additions for the historical fake protocol', async () => {
    const send = vi.fn(async () => json({ ...wire(), service_tier: null }))
    await expect(new FakeDeepSeekAdapter({ send }, credential()).run(capture(request()), [], new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})

describe('HTTP 200 guard diagnostics carry field presence/type, never content or unknown names', () => {
  it('identifies header and strict outer JSON rejection before any fields are observed', async () => {
    expect((await reject(wire(), 'text/plain')).responseFailure?.envelope).toEqual(envelopeDiagnostics('HEADERS'))
    expect((await reject('{')).responseFailure?.envelope).toEqual(envelopeDiagnostics('OUTER_JSON'))
    const duplicate = JSON.stringify(wire()).replace('{', '{"id":"one","id":"two",')
    expect((await reject(duplicate)).responseFailure?.envelope?.check).toBe('OUTER_JSON')
  })
  it('identifies unsupported top-level fields without logging their private names or values', async () => {
    const value = { ...wire(), 'PRIVATE-CANARY': key }
    // A reflected known credential is rejected even earlier; use an unrelated private canary here.
    value['PRIVATE-CANARY'] = 'PRIVATE-CANARY'
    const diagnostic = projectResponseFailure((await reject(value)).responseFailure)!
    expect(diagnostic).toMatchObject({ code: 'ENVELOPE_INVALID', envelope: { check: 'TOP_LEVEL_FIELDS', otherFields: { response: true } } })
    expect(diagnostic.envelope?.fields).toContainEqual({ field: 'message.content', type: 'STRING', presence: 'PRESENT' })
    expect(diagnostic.envelope?.fields).toContainEqual({ field: 'response.service_tier', type: 'MISSING', presence: 'MISSING' })
    expect(JSON.stringify(diagnostic)).not.toMatch(/PRIVATE-CANARY|SYNTHETIC-ONLY|Compare the public|What changes/)
  })
  it.each([
    { check: 'CHOICES', value: { ...wire(), choices: [] } },
    { check: 'MODEL_METADATA', value: { ...wire(), model: {} } },
    { check: 'PROVIDER', value: { ...wire(), provider: null } },
    { check: 'CHOICE_INDEX', value: { ...wire(), choices: [{ ...wire().choices[0], index: 1 }] } },
    { check: 'FINISH_REASON', value: { ...wire(), choices: [{ ...wire().choices[0], finish_reason: 'tool_calls' }] } },
    { check: 'CHOICE_METADATA', value: { ...wire(), choices: [{ ...wire().choices[0], logprobs: {} }] } },
    { check: 'MESSAGE_ROLE', value: { ...wire(), choices: [{ ...wire().choices[0], message: { role: 'user', content: 'PRIVATE-CANARY' } }] } },
    { check: 'MESSAGE_FIELDS', value: { ...wire(), choices: [{ ...wire().choices[0], message: { ...wire().choices[0].message, 'PRIVATE-CANARY': 'PRIVATE-CANARY' } }] } },
    { check: 'MESSAGE_METADATA', value: { ...wire(), choices: [{ ...wire().choices[0], message: { ...wire().choices[0].message, refusal: 'PRIVATE-CANARY' } }] } },
    { check: 'CONTENT_TYPE', value: { ...wire(), choices: [{ ...wire().choices[0], message: { role: 'assistant', content: [{ type: 'text', text: 'PRIVATE-CANARY' }] } }] } },
  ])('identifies the $check guard without exporting values', async ({ check, value }) => {
    const error = await reject(value)
    expect(error.responseFailure?.envelope?.check).toBe(check)
    expect(JSON.stringify(error.responseFailure)).not.toMatch(/PRIVATE-CANARY|Compare the public|What changes/)
  })
  it('final sink drops arbitrary paths/types/checks and avoids getters', () => {
    expect(projectEnvelopeDiagnostics({ check: 'PRIVATE-CANARY', fields: [] })).toBeUndefined()
    const getter = vi.fn(() => key)
    const value = Object.defineProperty({ model }, 'choices', { get: getter })
    const shape = envelopeDiagnostics('TOP_LEVEL_FIELDS', value)
    expect(getter).not.toHaveBeenCalled()
    expect(shape.fields).toContainEqual({ field: 'response.choices', type: 'OTHER', presence: 'PRESENT' })
    const projected = projectEnvelopeDiagnostics({ check: 'TOP_LEVEL_FIELDS', fields: [
      { field: key, presence: 'PRESENT', type: 'STRING' }, { field: 'response.model', presence: 'PRESENT', type: key },
      { field: 'response.model', presence: 'PRESENT', type: 'STRING', raw: key }], otherFields: { response: true, choice: key }, raw: key })
    expect(projected).toEqual({ check: 'TOP_LEVEL_FIELDS', fields: [{ field: 'response.model', presence: 'PRESENT', type: 'STRING' }], otherFields: { response: true, choice: false, message: false } })
    expect(JSON.stringify(projected)).not.toContain(key)
  })
})

async function smokeWith(value: unknown) {
  const calls: Request[] = [], reserve = vi.fn(async () => {})
  const result = await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile: 'NORTH_MINI_CODE_FREE', readKey: () => key, confirm: async () => true, reserve,
    send: async r => {
      calls.push(r)
      const pricing = { prompt: '0', completion: '0' }, supported_parameters = ['max_tokens']
      if (r.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
      if (r.url.endsWith('/models')) return json({ data: [{ id: model, pricing, supported_parameters }] })
      if (r.url.endsWith('/endpoints')) return json({ data: { id: model, endpoints: [{ status: 0, pricing, supported_parameters }] } })
      expect(await r.clone().json()).toMatchObject({ model, max_tokens: 2048, provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } } })
      return json(value)
    } })
  return { result, calls, reserve }
}

it('smoke wrapper and Main sink persist only safe model/envelope shape', async () => {
  const { result, calls, reserve } = await smokeWith({ ...wire(), provider: { 'PRIVATE-CANARY': 'PRIVATE-CANARY' } })
  expect(result).toMatchObject({ code: 'INVALID_RESPONSE', schemaValidation: 'NOT_RUN', responseFailure: { envelope: { check: 'PROVIDER' } }, inferenceRequests: 1, hint: null })
  expect(result.responseFailure?.envelope?.fields).toContainEqual({ field: 'response.provider', type: 'OBJECT', presence: 'PRESENT' })
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE-CANARY|SYNTHETIC-ONLY/)
  expect(calls).toHaveLength(4); expect(reserve).toHaveBeenCalledOnce()
})

it.each([
  { name: 'valid hint', content: JSON.stringify(hint), code: 'COMPLETE', schema: 'PASS', failure: undefined },
  { name: 'malformed JSON', content: '```json\n{}\n```', code: 'INVALID_RESPONSE', schema: 'NOT_RUN', failure: 'JSON_PARSE_FAILED' },
  { name: 'wrong SH-1 hint level', content: JSON.stringify({ ...hint, level: 2 }), code: 'INVALID_RESPONSE', schema: 'FAIL', failure: 'SCHEMA_VALIDATION_FAILED' },
])('documented optional metadata preserves real service validation: $name', async test => {
  const value = { ...wire(), service_tier: null }
  Object.assign(value.choices[0], { native_finish_reason: null })
  value.choices[0].message.content = test.content
  const { result, calls, reserve } = await smokeWith(value)
  expect(result).toMatchObject({ code: test.code, schemaValidation: test.schema, inferenceRequests: 1 })
  if (test.failure) { expect(result.responseFailure?.code).toBe(test.failure); expect(result.hint).toBeNull() }
  else { expect(result.hint).toEqual(hint); expect(result.responseFailure).toBeNull() }
  expect(calls).toHaveLength(4); expect(reserve).toHaveBeenCalledOnce()
})
