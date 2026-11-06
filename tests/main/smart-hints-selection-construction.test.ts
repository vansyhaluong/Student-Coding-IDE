import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmartHintsService, type SmartExecutionEvent } from '../../src/main/services/learning/smart-hints/service'
import { constructSelectionFix, assertSelectionFixBinding } from '../../src/main/services/learning/smart-hints/selection-fix'
import { immutableSmartCapture, bindSmartAction } from '../../src/main/services/learning/smart-hints/capture'
import { SelectionFixError, projectSelectionFixDiagnostic } from '../../src/main/services/learning/smart-hints/selection-fix-diagnostics'
import type { SelectionFixGuard, SelectionFixGuardLease } from '../../src/main/services/learning/smart-hints/selection-fix-guard'
import { isSmartOutput, smartCandidate } from '../../src/shared/contracts/smart-hints-validation'
import { request, capture, fixAction, start, reference } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
afterEach(async () => { for (const s of services.splice(0)) await s.stop() })
const wire = { kind: 'EDIT_PROPOSAL', replacementText: 'x + 1', rationale: 'Unverified synthetic proposal.', evidence: [] as string[] }
function fixture(clock = Date.now) {
  const q = request(), at = q.source.indexOf('x;')
  q.action = fixAction(q.source, at, at + 1)
  const c = immutableSmartCapture(capture(q))
  const lease = { assertReady: vi.fn<SelectionFixGuardLease['assertReady']>(async () => {}),
    verify: vi.fn<SelectionFixGuardLease['verify']>(async () => {}), dispose: vi.fn(async () => {}) }
  const guard: SelectionFixGuard = { preflight: vi.fn(async () => lease) }
  const run = vi.fn(async () => structuredClone(wire) as unknown), events = vi.fn<(event: SmartExecutionEvent) => void>(), diagnostics = vi.fn()
  // Explicit Main-private composition only. Normal app never supplies this port in D6-4.
  const service = new SmartHintsService({ mode: 'FAKE', run }, clock, undefined,
    { timeoutMs: 30000, onExecution: events, onSelectionFix: diagnostics }, guard)
  services.push(service)
  const prepare = () => service.prepare(1, 'document', q, () => {}, async g => ({ ...c, binding: { ...c.binding, contextGeneration: g } }))
  const complete = async () => {
    const p = await prepare(); service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(['FAILED', 'COMPLETE']).toContain(service.status(1, 'document', reference(p)).state))
    return service.status(1, 'document', reference(p))
  }
  return { q, c, lease, guard, run, events, diagnostics, service, prepare, complete }
}
describe('D6-4 G0-C1 deterministic construction, no repair and immutable authority', () => {
  it.each(['\n', '\r\n'])('uses the second duplicate at exact UTF-16 %j offsets; no search or normalization', eol => {
    const source = ['// 🐟 é', 'return x;', 'return x;', '// tail'].join(eol), at = source.lastIndexOf('x;')
    const q = request({ source, action: fixAction(source, at, at + 1),
      origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 9, eol: eol === '\n' ? 'LF' : 'CRLF' } })
    const c = immutableSmartCapture(capture(q)), response = structuredClone(wire), result = constructSelectionFix(c, response)
    if (result.kind !== 'EDIT_PROPOSAL') throw Error()
    expect(result.edits).toEqual([{ startOffset: at, endOffset: at + 1, expectedOldText: 'x', replacementText: 'x + 1', rationale: wire.rationale }])
    expect(isSmartOutput(result, c.action, source, [], eol === '\n' ? 'LF' : 'CRLF')).toBe(true)
    expect(smartCandidate(source, result.edits)).toBe(['// 🐟 é', 'return x;', 'return x + 1;', '// tail'].join(eol))
    response.replacementText = 'MUTATED'; response.evidence.push('R9')
    expect(result.edits[0].replacementText).toBe('x + 1'); expect(result.evidence).toEqual([])
    expect(result).not.toHaveProperty('proposalId')
  })
  it.each(['text', 'hash', 'revisionOrigin', 'split-surrogate', 'split-crlf'] as const)('tampered %s fails closed before construction', mode => {
    const source = '// 🐟\r\nreturn x;\r\ntail', at = source.indexOf('x;')
    const q = request({ source, action: fixAction(source, at, at + 1), origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'CRLF' } })
    const c = capture(q)
    if (c.action.kind !== 'SUGGEST_FIX' || c.binding.action.kind !== 'SUGGEST_FIX') throw Error()
    if (mode === 'text') c.action.selection.text = 'wrong'
    if (mode === 'hash') c.binding.action.selection.fingerprint = 'b'.repeat(64)
    if (mode === 'revisionOrigin') c.binding.origin = { kind: 'SOLUTION', blockId: randomUUID() }
    if (mode === 'split-surrogate' || mode === 'split-crlf') {
      const n = mode === 'split-surrogate' ? 4 : source.indexOf('\n')
      c.action = fixAction(source, n, n + 1); c.binding.action = bindSmartAction(c.action)
    }
    expect(() => assertSelectionFixBinding(c)).toThrow()
    expect(() => constructSelectionFix(c, wire)).toThrow(SelectionFixError)
    try { constructSelectionFix(c, wire) } catch (error) { expect(error).toMatchObject({ code: 'PROVIDER', selectionFix: { stage: 'CONSTRUCTION', reason: 'BINDING_MISMATCH' } }) }
  })
  it('NO_FIX has its exact canonical shape and never constructs an edit', () => {
    const f = fixture(), response = { kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'Review the selected code.' }
    expect(constructSelectionFix(f.c, response)).toEqual(response)
    expect(constructSelectionFix(f.c, response)).not.toHaveProperty('edits')
  })
})
describe('D6-4 guarded Main operation publication and lifecycle', () => {
  it('preflight precedes consent, readiness precedes provider, and the grant follows SH-1/postflight/disposal', async () => {
    const f = fixture(), held = gate<void>()
    f.lease.verify.mockImplementationOnce(async candidate => { expect(candidate).toContain('x + 1'); await held.promise })
    const p = await f.prepare()
    expect(f.guard.preflight).toHaveBeenCalledOnce(); expect(f.run).not.toHaveBeenCalled()
    expect(f.service.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    f.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.lease.verify).toHaveBeenCalledOnce())
    expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'RUNNING' })
    expect(f.service.status(1, 'document', reference(p))).not.toHaveProperty('proposalId')
    held.resolve(); await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    const result = f.service.status(1, 'document', reference(p))
    expect(result).toMatchObject({ proposalId: expect.any(String), output: { kind: 'EDIT_PROPOSAL', edits: [expect.objectContaining({ expectedOldText: f.c.action.kind === 'SUGGEST_FIX' ? f.c.action.selection.text : '' })] } })
    expect(f.lease.dispose).toHaveBeenCalledOnce(); expect(f.run).toHaveBeenCalledOnce(); expect(f.lease.assertReady).toHaveBeenCalledOnce()
    expect(f.lease.assertReady.mock.invocationCallOrder[0]).toBeLessThan(f.run.mock.invocationCallOrder[0])
    expect(f.events.mock.calls.at(-1)![0]).toMatchObject({ state: 'COMPLETE', timeoutMs: 30000, schemaValidation: 'PASS' })
  })
  it('valid NO_FIX completes without postflight/candidate/grant and disposes its lease', async () => {
    const f = fixture(); f.run.mockResolvedValueOnce({ kind: 'NO_FIX', reason: 'INSUFFICIENT_CONTEXT', advice: 'Review public context.' })
    expect(await f.complete()).toMatchObject({ state: 'COMPLETE', proposalId: null, output: { kind: 'NO_FIX' } })
    expect(f.lease.verify).not.toHaveBeenCalled(); expect(f.lease.dispose).toHaveBeenCalledOnce()
  })
  it('changed parser readiness rejects before provider dispatch and never blames Gemini backend', async () => {
    const f = fixture()
    f.lease.assertReady.mockRejectedValueOnce(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'ASSET_CHANGED'))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'PROVIDER' })
    expect(f.run).not.toHaveBeenCalled(); expect(f.lease.dispose).toHaveBeenCalledOnce()
    expect(f.events.mock.calls.at(-1)![0]).toMatchObject({ providerFailureSource: 'UNEXPECTED_ERROR',
      selectionFix: { stage: 'GUARD_RUNTIME', reason: 'ASSET_CHANGED' } })
  })
  it.each([{ ...wire, startOffset: 0 }, { ...wire, evidence: ['R1'] }, { ...wire, edits: [] }, { kind: 'NO_FIX', reason: 'OTHER', advice: 'x' }])('malformed wire %# cannot get a proposal', async value => {
    const f = fixture(); f.run.mockResolvedValueOnce(value)
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    expect(f.lease.verify).not.toHaveBeenCalled(); expect(f.diagnostics).toHaveBeenCalledWith({ stage: 'WIRE', reason: 'INVALID_WIRE' })
    expect(f.lease.dispose).toHaveBeenCalledOnce()
  })
  it.each(['no-op', 'wrong-eol', 'over-limit'] as const)('SH-1 still rejects %s without postflight or response repair', async mode => {
    const f = fixture()
    f.run.mockResolvedValueOnce({ ...wire, replacementText: mode === 'no-op' && f.c.action.kind === 'SUGGEST_FIX' ? f.c.action.selection.text
      : mode === 'wrong-eol' ? 'x\r\n+1' : '\n'.repeat(201) })
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    expect(f.diagnostics).toHaveBeenCalledWith({ stage: 'SH1', reason: 'SH1_REJECTED' }); expect(f.lease.verify).not.toHaveBeenCalled()
  })
  it.each(['SYNTAX', 'SIGNATURE', 'STRUCTURE', 'UNSUPPORTED_GRAMMAR'] as const)('%s postflight failure is sanitized and cannot publish', async reason => {
    const f = fixture(); f.lease.verify.mockRejectedValueOnce(new SelectionFixError('INVALID_RESPONSE', 'POSTFLIGHT', reason))
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    expect(f.events.mock.calls.at(-1)![0]).toMatchObject({ selectionFix: { stage: 'POSTFLIGHT', reason } })
    expect(JSON.stringify(f.events.mock.calls)).not.toContain(f.c.source)
    expect(JSON.stringify(f.events.mock.calls)).not.toContain(wire.replacementText)
  })
  it('unsupported baseline fails before PREPARED/provider and preflight telemetry cannot alter rejection', async () => {
    const f = fixture(); vi.mocked(f.guard.preflight).mockRejectedValueOnce(new SelectionFixError('INVALID_INPUT', 'PREFLIGHT', 'SIGNATURE'))
    f.diagnostics.mockImplementationOnce(() => { throw Error('PRIVATE_CANARY') })
    await expect(f.prepare()).rejects.toThrow()
    expect(f.run).not.toHaveBeenCalled(); expect(f.service.rateLimitReset()).toBeNull()
    expect(f.diagnostics).toHaveBeenCalledWith({ stage: 'PREFLIGHT', reason: 'SIGNATURE' })
  })
  it('cancel while postflight is pending aborts/disposes and ignores late success without duplicate telemetry', async () => {
    const f = fixture(), held = gate<void>(); f.lease.verify.mockImplementationOnce(async () => { await held.promise })
    const p = await f.prepare(); f.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.lease.verify).toHaveBeenCalledOnce())
    f.service.cancel(1, 'document', reference(p)); held.resolve(); await f.service.stop()
    expect(f.run).toHaveBeenCalledOnce(); expect(f.lease.dispose).toHaveBeenCalledOnce()
    expect(f.events.mock.calls.filter(([e]) => e.state !== 'STARTED').map(([e]) => e.state)).toEqual(['CANCELLED'])
  })
  it('context retirement drops a late provider response before construction/postflight/publication', async () => {
    const f = fixture(), held = gate<unknown>()
    f.run.mockImplementationOnce(() => held.promise)
    const p = await f.prepare(); f.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.run).toHaveBeenCalledOnce())
    f.service.retireContext(1, 'document', { clientContextId: f.q.clientContextId, reason: 'EDIT' })
    held.resolve(structuredClone(wire))
    await vi.waitFor(() => expect(f.lease.dispose).toHaveBeenCalledOnce())
    expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'CANCELLED' })
    expect(f.service.status(1, 'document', reference(p))).not.toHaveProperty('proposalId')
    expect(f.lease.verify).not.toHaveBeenCalled()
    expect(f.events.mock.calls.some(([e]) => e.state === 'COMPLETE')).toBe(false)
  })
  it('stale owner/revision context during verification never publishes the late proposal', async () => {
    const f = fixture(), held = gate<void>(), check = vi.fn()
    f.lease.verify.mockImplementationOnce(async () => { await held.promise })
    const p = await f.service.prepare(1, 'document', f.q, check, async () => f.c)
    f.service.start(1, 'document', start(p)); await vi.waitFor(() => expect(f.lease.verify).toHaveBeenCalledOnce())
    check.mockImplementation(() => { throw Error('source/model/revision context changed') }); held.resolve()
    await vi.waitFor(() => expect(f.lease.dispose).toHaveBeenCalledOnce())
    expect(() => f.service.status(1, 'document', reference(p))).toThrow()
    expect(f.events.mock.calls.some(([e]) => e.state === 'COMPLETE')).toBe(false)
  })
  it('the exclusive 30s outer deadline wins after guard await; no second timeout window or retry', async () => {
    let now = 1000
    const f = fixture(() => now); f.lease.verify.mockImplementationOnce(async () => { now = 31000 })
    expect(await f.complete()).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(f.events.mock.calls.at(-1)![0]).toMatchObject({ timeoutMs: 30000, elapsedMs: 30000 })
    expect(f.run).toHaveBeenCalledOnce(); expect(f.lease.dispose).toHaveBeenCalledOnce()
  })
  it('private diagnostic projection ignores accessors, unknown strings and all source fields', () => {
    const getter = vi.fn(() => 'SIGNATURE')
    expect(projectSelectionFixDiagnostic(Object.defineProperty({ stage: 'POSTFLIGHT' }, 'reason', { get: getter }))).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
    expect(projectSelectionFixDiagnostic({ stage: 'POSTFLIGHT', reason: 'SIGNATURE', source: 'PRIVATE_CANARY' })).toEqual({ stage: 'POSTFLIGHT', reason: 'SIGNATURE' })
    expect(projectSelectionFixDiagnostic({ stage: 'PRIVATE_CANARY', reason: 'SIGNATURE' })).toBeUndefined()
  })
})
