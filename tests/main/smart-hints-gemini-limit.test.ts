import { describe, expect, it } from 'vitest'
import { geminiLimitError } from '../../src/main/services/learning/smart-hints/gemini-limit'

const signal = () => new AbortController().signal
describe('bounded, secret-free Gemini429 classification (offline)', () => {
  it.each([
    [{}, 'GEMINI_RATE_LIMIT'],
    [{ error: { message: 'quota exceeded; arbitrary untrusted message' } }, 'GEMINI_RATE_LIMIT'],
    [{ error: { type: 'quota_exceeded' } }, 'GEMINI_QUOTA_EXHAUSTED'],
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerModel' }] }] } }, 'GEMINI_RATE_LIMIT'],
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerModel' }] }] } }, 'GEMINI_QUOTA_EXHAUSTED'],
    [{ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaValue: '0' }] }] } }, 'GEMINI_QUOTA_EXHAUSTED'],
  ])('classifies structured fields only: %j', async (body, kind) => {
    const error = await geminiLimitError(Response.json(body, { status: 429 }), signal())
    expect(error.code).toBe('RATE_LIMIT'); expect(error.providerLimit?.kind).toBe(kind)
    expect(error.message).toBe('RATE_LIMIT')
    expect(JSON.stringify(error)).not.toContain('GenerateRequests')
  })
  it('retains the longer provider RetryInfo/header cooldown; no invented Google reset', async () => {
    const error = await geminiLimitError(Response.json({ error: { details: [
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12.1s' },
    ] } }, { status: 429, headers: { 'retry-after': '20' } }), signal())
    expect(error.providerLimit).toEqual({ kind: 'GEMINI_RATE_LIMIT', retryAfterMs: 20000 })
  })
  it('oversized/malformed error is unknown429, and closes its stream', async () => {
    const cancelled: string[] = []
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(16385)) }, cancel() { cancelled.push('cancelled') } })
    const error = await geminiLimitError(new Response(body, { status: 429, headers: { 'content-type': 'application/json' } }), signal())
    expect(error.providerLimit).toEqual({ kind: 'GEMINI_RATE_LIMIT' }); expect(cancelled).toHaveLength(1)
  })
  it('cancellation terminates a hanging429 body and releases the reader', async () => {
    const controller = new AbortController()
    const body = new ReadableStream<Uint8Array>({})
    const response = new Response(body, { status: 429, headers: { 'content-type': 'application/json' } })
    const task = geminiLimitError(response, controller.signal)
    controller.abort(); await expect(task).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(body.locked).toBe(false)
  })
})
