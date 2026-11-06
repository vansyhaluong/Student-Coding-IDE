import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubmissionAnalysisService } from '../../src/main/services/learning/analysis/service'
import { DirectDeepSeekAdapter } from '../../src/main/services/learning/analysis/adapter'
import { analysis, capture, gate, response } from '../fixtures/learning/analysis'
import type { AnalysisResult } from '../../src/main/services/learning/analysis/contracts'
const active: SubmissionAnalysisService[] = []
afterEach(async () => { for (const s of active.splice(0)) await s.stop(); vi.useRealTimers() })
const q = { requestId: 'analysis-1', sourceReference: 'authorized-reference' }
function fixture(provider = true, clock?: () => number) {
  const send = vi.fn<(request: Request) => Promise<Response>>(async () => response())
  const adapter = new DirectDeepSeekAdapter({ send }, { authorization: () => 'Bearer synthetic-dummy-secret', clear() {} })
  const s = new SubmissionAnalysisService(provider ? adapter : undefined, clock); active.push(s)
  const check = vi.fn(), load = vi.fn(async () => structuredClone(capture))
  const prepare = () => s.prepare(1, 'scope', q, check, load)
  const status = () => s.status(1, 'scope', q.requestId)
  const start = () => {
    const v = status(); if (v.state !== 'PREPARED') throw Error(v.state)
    return { requestId: q.requestId, captureToken: v.captureToken, consentVersion: 1 as const }
  }
  return { s, send, check, load, prepare, status, start }
}
async function prepared(f: ReturnType<typeof fixture>) { f.prepare(); await vi.waitFor(() => expect(f.status().state).toBe('PREPARED')); return f.start() }
describe('D2 operation admission/consent/lifecycle', () => {
  it('prepare alone never calls provider; dispatch only with explicit consent and exact capture', async () => {
    const f = fixture(), start = await prepared(f)
    expect(f.send).not.toHaveBeenCalled()
    f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.status().state).toBe('COMPLETE'))
    expect(f.status()).toMatchObject({ advisory: true, analysis }); expect(f.send).toHaveBeenCalledOnce()
    const body = JSON.parse(await f.send.mock.calls[0][0].text())
    expect(JSON.parse(body.messages[1].content)).toEqual(capture.input)
  })
  it('duplicate prepare/start and lost ACK retain one permit even after completion', async () => {
    const f = fixture(); f.prepare(); f.prepare()
    await vi.waitFor(() => expect(f.status().state).toBe('PREPARED')); const start = f.start()
    f.s.start(1, 'scope', start); f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.status().state).toBe('COMPLETE'))
    f.s.start(1, 'scope', start); f.prepare(); expect(f.load).toHaveBeenCalledOnce(); expect(f.send).toHaveBeenCalledOnce()
    expect(() => f.s.prepare(1, 'scope', { ...q, requestId: 'double-click' }, f.check, f.load)).toThrow()
  })
  it.each([{ consentVersion: 0 }, { consentVersion: 2 }, { captureToken: 'foreign' }])('rejects invalid consent/token %j without request', async patch => {
    const f = fixture(), start = await prepared(f)
    expect(() => f.s.start(1, 'scope', { ...start, ...patch } as never)).toThrow(); expect(f.send).not.toHaveBeenCalled()
  })
  it('TTL expiry cannot dispatch or rearm the same prepare', async () => {
    let clock = 1000; const f = fixture(true, () => clock), start = await prepared(f); clock += 60000
    expect(f.s.start(1, 'scope', start)).toMatchObject({ state: 'FAILED', code: 'CAPTURE_EXPIRED' })
    expect(f.prepare()).toMatchObject({ state: 'FAILED', code: 'CAPTURE_EXPIRED' }); expect(f.send).not.toHaveBeenCalled()
  })
  it('unprovisioned production fails closed', async () => {
    const f = fixture(false), start = await prepared(f)
    expect(f.s.start(1, 'scope', start)).toMatchObject({ state: 'FAILED', code: 'KEY_UNAVAILABLE' }); expect(f.send).not.toHaveBeenCalled()
  })
  it('cancel before prepare completion does not retain captured data or dispatch', async () => {
    const f = fixture(), g = gate<typeof capture>(); f.load.mockImplementationOnce(() => g.promise)
    f.prepare(); await Promise.resolve(); f.s.cancel(1, 'scope', q.requestId); g.resolve(capture)
    await Promise.resolve(); await Promise.resolve(); expect(f.status().state).toBe('CANCELLED'); expect(f.send).not.toHaveBeenCalled()
  })
  it('cancel during request aborts transport and never republishes a late result', async () => {
    const f = fixture(), g = gate<Response>(); f.send.mockImplementationOnce(() => g.promise)
    const start = await prepared(f); f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce()); f.s.cancel(1, 'scope', q.requestId)
    expect(f.send.mock.calls[0][0].signal.aborted).toBe(true); g.resolve(response())
    await new Promise(r => setTimeout(r, 10)); expect(f.status().state).toBe('CANCELLED')
    f.s.start(1, 'scope', start); expect(f.send).toHaveBeenCalledOnce()
  })
  it('context loss between start and dispatch sends zero requests', async () => {
    const f = fixture(), start = await prepared(f); f.s.start(1, 'scope', start); f.s.invalidate(1)
    await Promise.resolve(); expect(f.send).not.toHaveBeenCalled(); expect(() => f.status()).toThrow()
  })
  it('new submission revokes old token and rejects old status', async () => {
    const f = fixture(), start = await prepared(f)
    f.s.prepare(1, 'scope', { requestId: 'new', sourceReference: 'new-reference' }, f.check, f.load)
    expect(() => f.s.start(1, 'scope', start)).toThrow(); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['owner', 'scope', 'requestId'] as const)('rejects foreign %s', async field => {
    const f = fixture(), start = await prepared(f)
    expect(() => f.s.start(field === 'owner' ? 2 : 1, field === 'scope' ? 'foreign' : 'scope',
      field === 'requestId' ? { ...start, requestId: 'foreign' } : start)).toThrow(); expect(f.send).not.toHaveBeenCalled()
  })
  it('service epoch revocation aborts in-flight provider and drops its late response', async () => {
    const f = fixture(), g = gate<Response>(); f.send.mockImplementationOnce(() => g.promise)
    const start = await prepared(f); f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce()); f.check.mockImplementation(() => { throw Error('revoked') })
    await vi.waitFor(() => expect(f.send.mock.calls[0][0].signal.aborted).toBe(true)); g.resolve(response())
    expect(() => f.status()).toThrow()
  })
  it('validates provider output again at the publication boundary', async () => {
    const s = new SubmissionAnalysisService({ createOperation: () => ({ run: async () => ({ ok: true, analysis: { verdict: 'Accepted' } } as unknown as AnalysisResult) }) }); active.push(s)
    s.prepare(1, 's', q, () => {}, async () => capture)
    await vi.waitFor(() => expect(s.status(1, 's', q.requestId).state).toBe('PREPARED'))
    const st = s.status(1, 's', q.requestId); if (st.state !== 'PREPARED') throw Error()
    s.start(1, 's', { requestId: q.requestId, captureToken: st.captureToken, consentVersion: 1 })
    await vi.waitFor(() => expect(s.status(1, 's', q.requestId)).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
  })
  it.each(['network', 'malformed', 'http'] as const)('provider %s failure is terminal and cannot replay', async kind => {
    const f = fixture()
    f.send.mockImplementationOnce(async () => {
      if (kind === 'network') throw Error('PRIVATE_PROVIDER_ERROR')
      return kind === 'malformed' ? response('{}') : new Response('PRIVATE_BODY', { status: 503 })
    })
    const start = await prepared(f); f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.status().state).toBe('FAILED'))
    f.s.start(1, 'scope', start); f.prepare()
    expect(f.send).toHaveBeenCalledOnce(); expect(JSON.stringify(f.status())).not.toMatch(/PRIVATE_|stack|headers/)
  })
  it('shutdown revokes pending capture and waits until capture cleanup settles', async () => {
    const f = fixture(), g = gate<typeof capture>(); f.load.mockImplementationOnce(() => g.promise)
    f.prepare(); await Promise.resolve()
    let stopped = false; const pending = f.s.stop().then(() => { stopped = true })
    await Promise.resolve(); expect(stopped).toBe(false)
    g.resolve(capture); await pending; expect(stopped).toBe(true); expect(f.send).not.toHaveBeenCalled()
    expect(() => f.prepare()).toThrow()
  })
  it('explicit cancel drops completed result; only a new operation with new consent may analyze again', async () => {
    const f = fixture(), start = await prepared(f); f.s.start(1, 'scope', start)
    await vi.waitFor(() => expect(f.status().state).toBe('COMPLETE'))
    expect(f.s.cancel(1, 'scope', q.requestId)).toMatchObject({ state: 'CANCELLED' })
    expect(f.status()).not.toHaveProperty('analysis')
    f.s.start(1, 'scope', start); expect(f.send).toHaveBeenCalledOnce()
    f.s.prepare(1, 'scope', { ...q, requestId: 'intentional-new-operation' }, f.check, f.load)
    await vi.waitFor(() => expect(f.s.status(1, 'scope', 'intentional-new-operation').state).toBe('PREPARED'))
    expect(f.send).toHaveBeenCalledOnce() // Fresh consent has not been supplied.
    expect(() => f.s.start(1, 'scope', start)).toThrow()
  })
})
