import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeOpenRouterDiagnostics } from '../../scripts/sh4-openrouter-diagnostics'
import { createOpenRouterSmartHintsService, verifiedNorthFree, NORTH_MINI_CODE_FREE_MODEL as north } from '../../src/main/services/learning/smart-hints/openrouter-provider'
import { runOpenRouterSmoke, type SmokeOptions } from '../../scripts/sh4-openrouter-smoke'

beforeEach(() => { vi.stubGlobal('fetch', () => { throw new Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const pricing = { prompt: '0', completion: '0' }
const model = { id: north, pricing, supported_parameters: ['max_tokens'] }
const endpoint = { status: 0, pricing, supported_parameters: ['max_tokens'] }
const catalogue = { data: [model] }, endpoints = { data: { id: north, endpoints: [endpoint] } }
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })

describe('SH-4 allowlisted diagnostics', () => {
  it.each(['private-secret', '-1', '1.5', '9'.repeat(100), 'Bearer SYNTHETIC', '604801'])('drops unsafe Retry-After %s and unknown header strings', retry => {
    const result = safeOpenRouterDiagnostics(new Response(null, { status: 429, headers: {
      'retry-after': retry, 'x-ratelimit-limit': 'private-secret', 'x-ratelimit-reset': 'Infinity', 'x-request-id': 'private-secret',
    } }), { error: { message: 'private-secret', code: 'private-secret', metadata: { provider_code: 'private-secret', error_type: 'private-secret' } } })
    expect(result).toMatchObject({ retryAfterSeconds: null, retryAfterAt: null, rateLimit: { limit: null, remaining: null, reset: null }, errorCode: null, providerCode: null, errorType: null, attribution: 'UNKNOWN' })
    expect(JSON.stringify(result)).not.toContain('private-secret')
  })
  it('requires authenticated quota evidence for account exhaustion, not a generic quota error label', () => {
    expect(safeOpenRouterDiagnostics(new Response(null, { status: 200 }), undefined, 0).attribution).toBe('ACCOUNT_QUOTA')
    expect(safeOpenRouterDiagnostics(new Response(null, { status: 429 }), { error: { metadata: { error_type: 'insufficient_quota' } } }).attribution).toBe('UNKNOWN')
    expect(safeOpenRouterDiagnostics(new Response(null, { status: 429 }), { error: { metadata: { error_type: { toString: 'private-secret' } } } }).errorType).toBe(null)
  })
  it('normalizes only canonical HTTP dates, without scheduling a retry', () => {
    expect(safeOpenRouterDiagnostics(new Response(null, { status: 429, headers: { 'retry-after': 'Mon, 02 Nov 2026 05:00:00 GMT' } }), null))
      .toMatchObject({ retryAfterSeconds: null, retryAfterAt: '2026-11-02T05:00:00.000Z', attribution: 'UNKNOWN' })
  })
  it.each([404, 503])('routing requires explicit metadata and compatible HTTP %s', status => {
    expect(safeOpenRouterDiagnostics(new Response(null, { status }), { error: { metadata: { error_type: 'routing_error' } } }).attribution).toBe('ROUTING')
    expect(safeOpenRouterDiagnostics(new Response(null, { status }), { error: { message: 'routing failed' } }).attribution).toBe('UNKNOWN')
  })
  it.each(['{', '{"error":{"code":429,"code":500}}', JSON.stringify({ error: { message: 'x'.repeat(20000) } })])('malformed/oversized metadata cannot publish raw data or authorize another request', async raw => {
    const send = vi.fn(async () => new Response(raw, { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '5' } }))
    const reserve = vi.fn(async () => {})
    const result = await runOpenRouterSmoke({ electronMainDevelopment: true, readKey: () => 'SYNTHETIC-ONLY-TEST-KEY', send, reserve, confirm: async () => true })
    expect(result).toMatchObject({ keyHttpStatus: 429, inferenceRequests: 0, diagnostics: { status: 429, errorCode: null, attribution: 'UNKNOWN', retryAfterSeconds: 5 } })
    expect(send).toHaveBeenCalledOnce(); expect(reserve).not.toHaveBeenCalled()
  })
  it('an unknown development profile fails before even reading a synthetic key', async () => {
    const readKey = vi.fn(), send = vi.fn(), reserve = vi.fn()
    const result = await runOpenRouterSmoke({ modelProfile: 'paid/model' as SmokeOptions['modelProfile'], electronMainDevelopment: true, readKey, send, reserve, confirm: async () => true })
    expect(result.code).toBe('MODEL_PROFILE_DENIED'); expect(readKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
  })
})

describe('North verification gates', () => {
  it('accepts only the exact free model and explicit endpoint availability/capabilities', () => {
    expect(verifiedNorthFree(catalogue, endpoints)).toBe(true)
    for (const candidate of [null, { data: [] }, { data: [{ ...model, id: 'cohere/north-mini-code' }] },
      { data: [{ ...model, pricing: { ...pricing, request: '0.1' } }] }, { data: [{ ...model, supported_parameters: [] }] }]) {
      expect(verifiedNorthFree(candidate, endpoints)).toBe(false)
    }
    expect(verifiedNorthFree(catalogue, { data: { id: north, endpoints: [endpoint, { ...endpoint, pricing: { prompt: '1', completion: '0' } }] } })).toBe(false)
  })
  it.each([[false, true], [true, false], [false, false]])('North cannot bypass development=%s / approval=%s', async (development, liveApproved) => {
    const readKey = vi.fn(), send = vi.fn()
    const service = createOpenRouterSmartHintsService({ development, liveApproved, readKey, transport: { send }, developmentModel: { profile: 'NORTH_MINI_CODE_FREE', catalogue, endpoints } })
    try { expect(service.capabilities().enabled).toBe(false); expect(readKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled() }
    finally { await service.stop() }
  })
  it('unverified metadata cannot provision North or read a key', async () => {
    const readKey = vi.fn(), send = vi.fn()
    const service = createOpenRouterSmartHintsService({ development: true, liveApproved: true, readKey, transport: { send }, developmentModel: { profile: 'NORTH_MINI_CODE_FREE', catalogue, endpoints: {} } })
    try { expect(service.capabilities().enabled).toBe(false); expect(readKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled() }
    finally { await service.stop() }
  })
  it('paid catalogue stops before endpoint fetch, reservation or inference', async () => {
    const send = vi.fn(async (r: Request) => r.url.endsWith('/key') ? json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
      : json({ data: [{ ...model, pricing: { prompt: '1', completion: '0' } }] }))
    const reserve = vi.fn(async () => {})
    expect(await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile: 'NORTH_MINI_CODE_FREE', readKey: () => 'SYNTHETIC-ONLY-TEST-KEY', send, reserve, confirm: async () => true }))
      .toMatchObject({ code: 'FREE_ROUTE_UNVERIFIED', inferenceRequests: 0 })
    expect(send).toHaveBeenCalledTimes(2); expect(reserve).not.toHaveBeenCalled()
  })
})
