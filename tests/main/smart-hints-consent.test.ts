import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { SMART_HINT_CHANNELS as C, SMART_HINT_POLICY as P, type SmartStatus, type SmartStart } from '../../src/shared/contracts/smart-hints'
import { isSmartStatus } from '../../src/shared/contracts/smart-hints-validation'
import { consentFixture } from '../fixtures/learning/smart-consent'
import { request, start, reference, fixAction } from '../fixtures/learning/smart-hints'

type Fixture = ReturnType<typeof consentFixture>
const fixtures: Fixture[] = []
function setup() { const f = consentFixture(); fixtures.push(f); return f }
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.close())) })
function decision(p: Extract<SmartStatus, { state: 'PREPARED' }>, mode: 'ONCE' | 'SESSION' | 'REUSE'): SmartStart {
  return { ...start(p), consent: { sessionId: p.consent!.sessionId, mode } }
}
async function complete(f: Fixture, p: Extract<SmartStatus, { state: 'PREPARED' }>, mode: 'ONCE' | 'SESSION' | 'REUSE') {
  const r = await f.api.start(decision(p, mode)); expect(r.ok).toBe(true)
  await vi.waitFor(async () => { const s = await f.api.status(reference(p)); expect(s.ok && s.value.state).toBe('COMPLETE') })
}
it('first prepare requires permission; remembering covers a fresh edited source in the same exercise', async () => {
  const f = setup(), q = request(), p = await f.prepare(q)
  expect(p.consent).toMatchObject({ reusable: false, scope: { source: true, selection: false, runEvidence: false } })
  expect(f.run).not.toHaveBeenCalled()
  expect((await f.api.start(decision(p, 'REUSE'))).ok).toBe(false)
  await complete(f, p, 'SESSION')
  await f.api.retireContext({ clientContextId: q.clientContextId, reason: 'EDIT' })
  const next = await f.prepare(request({ source: q.source.replace('return x;', 'return x + 2;'), sourceRevision: 2 }))
  expect(next.consent.sessionId).toBe(p.consent.sessionId); expect(next.consent.reusable).toBe(true)
  await complete(f, next, 'REUSE'); expect(f.run).toHaveBeenCalledTimes(2)
  expect(f.reservations).toHaveBeenCalledTimes(2)
})
it('single-request permission is not remembered and cancellation dispatches nothing', async () => {
  const f = setup(), p = await f.prepare(request())
  await complete(f, p, 'ONCE')
  const second = await f.prepare(request()); expect(second.consent.reusable).toBe(false)
  await f.api.cancel(reference(second)); expect(await f.api.start(decision(second, 'SESSION'))).toMatchObject({ ok: true, value: { state: 'CANCELLED' } })
  expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
})
it('scope expansion asks again; once-only expansion does not widen the stored grant', async () => {
  const f = setup(), q = request(), p = await f.prepare(q); await complete(f, p, 'SESSION')
  const selected = request({ action: { ...fixAction(q.source), kind: 'EXPLAIN' } }), expanded = await f.prepare(selected)
  expect(expanded.consent).toMatchObject({ reusable: false, scope: { source: true, selection: true, runEvidence: false } })
  expect((await f.api.start(decision(expanded, 'REUSE'))).ok).toBe(false)
  await complete(f, expanded, 'ONCE')
  const again = await f.prepare({ ...selected, requestId: randomUUID() }); expect(again.consent.reusable).toBe(false)
  await complete(f, again, 'SESSION')
  const narrower = await f.prepare(request()); expect(narrower.consent.reusable).toBe(true)
})
it.each(['HINT', 'ANALYZE', 'EXPLAIN', 'SUGGEST_FIX', 'DETECT_ISSUES'] as const)('%s discloses its actual source/selection/Run scope', async kind => {
  const f = setup(); await f.service.probeCapabilities(); f.evidence(true)
  const q = request({ action: kind === 'EXPLAIN' || kind === 'SUGGEST_FIX' ? { kind, selection: fixAction().selection } : { kind } })
  const p = await f.prepare(q)
  expect(p.consent.scope).toEqual({ source: true, selection: kind === 'EXPLAIN' || kind === 'SUGGEST_FIX', runEvidence: true })
  await complete(f, p, 'SESSION')
  expect(f.run.mock.calls[0][0].action.kind).toBe(kind)
  expect(f.run.mock.calls[0][0]).not.toHaveProperty('consent')
})
it('new trusted Run evidence widens scope; an untrusted Run reference alone does not', async () => {
  const f = setup(), p = await f.prepare(request()); await complete(f, p, 'SESSION')
  const noEvidence = await f.prepare(request({ run: { sessionId: `exercise_${randomUUID()}`, generation: 1, sequence: 1 } }))
  expect(noEvidence.consent.scope.runEvidence).toBe(false); expect(noEvidence.consent.reusable).toBe(true)
  await f.api.cancel(reference(noEvidence)); f.evidence(true)
  const expanded = await f.prepare(request()); expect(expanded.consent.reusable).toBe(false)
  expect((await f.api.start(decision(expanded, 'REUSE'))).ok).toBe(false)
})
it.each(['exercise', 'language', 'origin', 'provider', 'end', 'expiry'] as const)('%s retires remembered permission', async change => {
  const f = setup(), q = request(), p = await f.prepare(q); await complete(f, p, 'SESSION')
  let next = request()
  if (change === 'exercise') next = request({ exerciseId: 'other' })
  if (change === 'language') next = request({ language: 'csharp' })
  if (change === 'origin') next = request({ origin: { kind: 'SOLUTION', blockId: randomUUID() }, action: { kind: 'EXPLAIN', selection: fixAction().selection } })
  if (change === 'provider') await f.service.configureProvider({ ...f.provider })
  if (change === 'end') await f.api.retireContext({ clientContextId: q.clientContextId, reason: 'LEARNING_LEFT' })
  if (change === 'expiry') f.advance(P.sessionMs + 1)
  const prepared = await f.prepare(next)
  expect(prepared.consent.reusable).toBe(false); expect(prepared.consent.sessionId).not.toBe(p.consent.sessionId)
  expect((await f.api.start({ ...decision(prepared, 'REUSE'), consent: { sessionId: p.consent.sessionId, mode: 'REUSE' } })).ok).toBe(false)
})
it('revoke after prepare blocks reuse, aborts pending work and permits a fresh explicit decision', async () => {
  const f = setup(), p = await f.prepare(request()); await complete(f, p, 'SESSION')
  const second = await f.prepare(request()); f.hold(); await f.api.start(decision(second, 'REUSE'))
  await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(2))
  await f.api.revokeConsent({ sessionId: second.consent.sessionId })
  expect(f.run.mock.calls[1][2].aborted).toBe(true)
  expect(await f.api.status(reference(second))).toMatchObject({ ok: true, value: { state: 'CANCELLED' } })
  const next = await f.prepare(request()); expect(next.consent.reusable).toBe(false)
  await f.api.revokeConsent({ sessionId: p.consent.sessionId }) // stale revoke cannot affect the replacement
  expect((await f.api.start(decision(next, 'ONCE'))).ok).toBe(true)
})
it('revocation between prepare and start rejects a stale reused consent without inference', async () => {
  const f = setup(), first = await f.prepare(request()); await complete(f, first, 'SESSION')
  const p = await f.prepare(request()); expect(p.consent.reusable).toBe(true)
  await f.api.revokeConsent({ sessionId: p.consent.sessionId })
  expect((await f.api.start(decision(p, 'REUSE'))).ok).toBe(false)
  expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
})
it('forged decisions, extra scope fields, cross-owner/frame and document replacement cannot reuse permission', async () => {
  const f = setup(), p = await f.prepare(request()); await complete(f, p, 'SESSION')
  const next = await f.prepare(request()), q = decision(next, 'REUSE')
  expect((await f.api.start({ ...q, consent: { ...q.consent!, sessionId: randomUUID() } })).ok).toBe(false)
  expect((await f.api.start({ ...q, consent: { ...q.consent!, scope: { source: true, runEvidence: true } } } as never)).ok).toBe(false)
  for (const e of [{ sender: { id: 99 }, senderFrame: f.event.senderFrame }, { sender: { id: 1 }, senderFrame: { ...f.event.senderFrame, frameToken: 'forged' } }]) {
    expect(await f.handlers.get(C.start)!(e, q)).toMatchObject({ ok: false })
  }
  f.owner.emit('render-process-gone')
  expect((await f.api.start(q)).ok).toBe(false); expect(f.run).toHaveBeenCalledOnce()
})
it('PREPARED consent metadata is strictly validated, not an authority claim from the caller', async () => {
  const f = setup(), p = await f.prepare(request())
  expect(isSmartStatus(p)).toBe(true)
  expect(isSmartStatus({ ...p, consent: { ...p.consent, scope: { ...p.consent.scope, hiddenTests: true } } })).toBe(false)
})
