import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runOpenRouterSmoke, SMOKE_SOURCE } from '../../scripts/sh4-openrouter-smoke'
import { OpenRouterSmartHintsAdapter, NORTH_MINI_CODE_FREE_MODEL as model } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import { strictJson } from '../../src/main/services/learning/analysis/validation'
import { isSmartOutput } from '../../src/shared/contracts/smart-hints-validation'
import { capture, request } from '../fixtures/learning/smart-hints'

// Synthetic counterexamples, NOT captured North responses or a reproduced live root cause.
const key = 'SYNTHETIC-ONLY-NORTH-INVESTIGATION'
const hint = { kind: 'HINT', level: 1, paragraphs: ['Compare the returned value with the public examples.'], nextQuestion: 'What changes?', evidence: [] }
const usage = { prompt_tokens: 280, completion_tokens: 426, total_tokens: 706, cost: 0 }
const envelope = (content: unknown = JSON.stringify(hint), patch: Record<string, unknown> = {}) => JSON.stringify({ model, usage,
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }], ...patch })
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
const q = () => request({ language: 'csharp', source: SMOKE_SOURCE, action: { kind: 'HINT', level: 1 } })
const cases = [
  { at: 'HTTP_HEADER', raw: envelope(), contentType: 'text/plain' },
  { at: 'STRICT_ENVELOPE_JSON', raw: envelope().replace('{', '{"id":"synthetic-one","id":"synthetic-two",') },
  { at: 'ENVELOPE_CHOICES', raw: envelope(undefined, { choices: [] }) },
  { at: 'ENVELOPE_EXTRA_FIELD', raw: envelope(undefined, { synthetic_extra_metadata: true }) },
  { at: 'ENVELOPE_FINISH', raw: envelope(undefined, { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: JSON.stringify(hint) } }] }) },
  { at: 'CONTENT_EXTRACTION', raw: envelope([{ type: 'text', text: JSON.stringify(hint) }]) },
  { at: 'CONTENT_JSON', raw: envelope('{"kind":') },
  { at: 'CONTENT_FENCE', raw: envelope('```json\n' + JSON.stringify(hint) + '\n```') },
  { at: 'OUTPUT_SCHEMA', raw: envelope(JSON.stringify({ ...hint, paragraphs: [] })) },
  { at: 'ACTION_LEVEL', raw: envelope(JSON.stringify({ ...hint, level: 2 })) },
  { at: 'OUTPUT_JSON_STRING', raw: envelope(JSON.stringify(JSON.stringify(hint))) },
]

beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(() => { vi.unstubAllGlobals() })

async function smoke(raw: string, contentType = 'application/json') {
  const reserve = vi.fn(async () => {}), calls: Request[] = []
  const evidence = await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile: 'NORTH_MINI_CODE_FREE',
    readKey: () => key, confirm: async () => true, reserve, send: async r => {
      calls.push(r)
      const pricing = { prompt: '0', completion: '0' }, supported_parameters = ['max_tokens']
      if (r.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 50 } } })
      if (r.url.endsWith('/models')) return json({ data: [{ id: model, pricing, supported_parameters }] })
      if (r.url.endsWith('/endpoints')) return json({ data: { id: model, endpoints: [{ status: 0, pricing, supported_parameters }] } })
      expect(r.method).toBe('POST')
      expect(await r.clone().json()).toMatchObject({ model, max_tokens: 2048, provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } } })
      return new Response(raw, { headers: { 'content-type': contentType } })
    } })
  return { evidence, reserve, calls }
}

describe('North HTTP 200 INVALID_RESPONSE: safe stages now distinguish the formerly ambiguous rejecting layers', () => {
  it.each(cases)('synthetic $at failure retains fixed public code and reports its own private stage', async test => {
    const { evidence, reserve, calls } = await smoke(test.raw, test.contentType)
    expect(evidence).toMatchObject({ code: 'INVALID_RESPONSE', result: 'FAIL', schemaValidation: ['OUTPUT_SCHEMA', 'ACTION_LEVEL', 'OUTPUT_JSON_STRING'].includes(test.at) ? 'FAIL' : 'NOT_RUN', httpStatus: 200,
      model, requestedModel: model, inferenceRequests: 1, diagnostics: null, hint: null,
      usage: { promptTokens: 280, completionTokens: 426, totalTokens: 706, cost: 0 }, retry: false, paidFallback: false })
    expect(evidence.responseFailure?.code).toBe(['OUTPUT_SCHEMA', 'ACTION_LEVEL', 'OUTPUT_JSON_STRING'].includes(test.at) ? 'SCHEMA_VALIDATION_FAILED'
      : ['CONTENT_JSON', 'CONTENT_FENCE'].includes(test.at) ? 'JSON_PARSE_FAILED' : 'ENVELOPE_INVALID')
    expect(reserve).toHaveBeenCalledOnce(); expect(calls.map(r => r.method)).toEqual(['GET', 'GET', 'GET', 'POST'])
    expect(JSON.stringify(evidence)).not.toContain(key)
    expect(evidence).not.toHaveProperty('choices')
  })

  it('distinguishes successful ordinary JSON.parse from the stricter envelope parser in a synthetic duplicate-key case', async () => {
    const raw = cases.find(c => c.at === 'STRICT_ENVELOPE_JSON')!.raw
    expect(JSON.parse(raw)).toMatchObject({ model, usage })
    expect(() => strictJson(raw, 98304)).toThrow()
    const adapter = new OpenRouterSmartHintsAdapter({ send: async () => new Response(raw, { headers: { 'content-type': 'application/json' } }) },
      { authorization: () => `Bearer ${key}`, clear: () => {} }, model)
    await expect(adapter.run(capture(q()), [], new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('synthetic schema/action failures pass adapter parsing but fail unchanged SH-1 validation', async () => {
    for (const output of [{ ...hint, level: 2 }, { ...hint, paragraphs: [] }, { ...hint, level: '1' },
      { ...hint, synthetic_extra_field: true }, { kind: 'HINT', level: 1, paragraphs: hint.paragraphs, nextQuestion: hint.nextQuestion },
      { ...hint, evidence: ['R1'] }, JSON.stringify(hint)]) {
      const adapter = new OpenRouterSmartHintsAdapter({ send: async () => new Response(envelope(JSON.stringify(output)), { headers: { 'content-type': 'application/json' } }) },
        { authorization: () => `Bearer ${key}`, clear: () => {} }, model)
      const parsed = await adapter.run(capture(q()), [], new AbortController().signal)
      expect(parsed).toEqual(output)
      expect(isSmartOutput(parsed, { kind: 'HINT', level: 1 }, SMOKE_SOURCE, [], 'LF')).toBe(false)
    }
  })

  it('a conforming synthetic North envelope/content passes without schema relaxation, repair or extra request', async () => {
    expect(isSmartOutput(hint, { kind: 'HINT', level: 1 }, SMOKE_SOURCE, [], 'LF')).toBe(true)
    const { evidence, calls, reserve } = await smoke(envelope())
    expect(evidence).toMatchObject({ result: 'PASS', code: 'COMPLETE', schemaValidation: 'PASS', hint, inferenceRequests: 1 })
    expect(calls).toHaveLength(4); expect(reserve).toHaveBeenCalledOnce()
  })
})
