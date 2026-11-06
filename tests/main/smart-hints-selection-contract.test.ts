import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { isSelectionFixWire } from '../../src/main/services/learning/smart-hints/selection-fix'
import { request, fixAction, registry, capture, reference, start, output } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.stop() })
describe('D6-2 Main selection binding, lease identity and disabled dispatch', () => {
  it('detaches input before await; freezes target and trusted signature/package identity; releases lease', async () => {
    const r = registry(), q = request({ action: fixAction() }), expected = structuredClone(q), pending = gate<void>()
    const acquire = r.acquirePublic.getMockImplementation()!
    r.acquirePublic.mockImplementation(async (...args) => { await pending.promise; return acquire(...args) })
    const take = captureSmartHints(r.packages, q, 4, () => {})
    q.source = 'changed'; q.sourceRevision = 50
    if (q.action.kind !== 'SUGGEST_FIX') throw Error()
    q.action.selection.text = 'tampered'; q.action.selection.startOffset = 0
    pending.resolve(); const result = await take
    expect(result.source).toBe(expected.source); expect(result.binding.sourceRevision).toBe(expected.sourceRevision)
    expect(result.action).toEqual(expected.action); expect(result.binding.action).not.toHaveProperty('selection.text')
    expect(result.binding.packageVersion).toBe(r.data.metadata.packageVersion)
    expect(result.signatureIdentity).toEqual({ version: r.data.metadata.signature.version, hash: r.data.metadata.signature.hash })
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.action)).toBe(true)
    if (result.action.kind !== 'SUGGEST_FIX' || result.binding.action.kind !== 'SUGGEST_FIX') throw Error()
    expect(Object.isFrozen(result.action.selection)).toBe(true); expect(Object.isFrozen(result.binding.action.selection)).toBe(true)
    expect(Reflect.set(result.action.selection, 'text', 'other')).toBe(false)
    r.data.metadata.signature.hash = 'b'.repeat(64)
    expect(result.signatureIdentity.hash).toBe('a'.repeat(64)); expect(r.release).toHaveBeenCalledOnce()
  })
  it('rejects malformed target before acquiring a package and stale owner during acquire', async () => {
    const r = registry(), q = request({ action: fixAction() })
    await expect(captureSmartHints(r.packages, { ...q, action: { kind: 'SUGGEST_FIX' } } as never, 1, () => {})).rejects.toThrow()
    expect(r.acquirePublic).not.toHaveBeenCalled()
    let calls = 0
    await expect(captureSmartHints(r.packages, q, 1, () => { if (++calls === 3) throw Error('stale') })).rejects.toThrow()
    expect(r.release).toHaveBeenCalledOnce()
  })
  it('operation keeps its binding despite mutable capture aliases; Fix never reserves or calls provider', async () => {
    const run = vi.fn(async () => output), service = new SmartHintsService({ mode: 'FAKE', run }); services.push(service)
    const q = request({ action: fixAction() }), c = capture(q)
    const p = await service.prepare(1, 'doc', q, () => {}, async () => c)
    c.binding.sourceRevision = 70; c.binding.origin = { kind: 'SOLUTION', blockId: randomUUID() }
    if (c.action.kind !== 'SUGGEST_FIX' || c.binding.action.kind !== 'SUGGEST_FIX') throw Error()
    c.action.selection.text = 'changed'; c.binding.action.selection.startOffset = 0
    expect(service.status(1, 'doc', reference(p))).toEqual(p)
    expect(() => service.start(2, 'doc', start(p))).toThrow()
    expect(() => service.start(1, 'other', start(p))).toThrow()
    expect(() => service.start(1, 'doc', { ...start(p), captureToken: randomUUID() })).toThrow()
    expect(service.start(1, 'doc', start(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(service.capabilities()).toMatchObject({ enabled: true, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(run).not.toHaveBeenCalled(); expect(service.rateLimitReset()).toBeNull()
  })
  it.each(['selection', 'revision', 'origin', 'action'] as const)('rejects capture %s tampering', async field => {
    const service = new SmartHintsService(); services.push(service)
    const q = request({ action: fixAction() }), c = capture(q)
    if (field === 'selection' && c.binding.action.kind === 'SUGGEST_FIX') c.binding.action.selection.fingerprint = 'b'.repeat(64)
    if (field === 'revision') c.binding.sourceRevision++
    if (field === 'origin' && c.binding.origin.kind === 'PRACTICE') c.binding.origin.modelVersion++
    if (field === 'action') c.action = { kind: 'ANALYZE' }
    await expect(service.prepare(1, 'doc', q, () => {}, async () => c)).rejects.toThrow()
  })
  it('selection-only cancel preserves Hint progression; newer revision retires old operation/token', async () => {
    const run = vi.fn(async (c: ReturnType<typeof capture>) => ({ kind: 'HINT', level: c.action.kind === 'HINT' ? c.action.level : 1,
      paragraphs: [`Level ${c.action.kind === 'HINT' ? c.action.level : 1}`], nextQuestion: 'Why?', evidence: [] }))
    const service = new SmartHintsService({ mode: 'FAKE', run }); services.push(service)
    const base = request({ action: { kind: 'HINT', level: 1 } })
    const prepare = (q: typeof base) => service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
    const first = await prepare(base); service.start(1, 'doc', start(first))
    await vi.waitFor(() => expect(service.status(1, 'doc', reference(first)).state).toBe('COMPLETE'))
    const fix = await prepare({ ...base, requestId: randomUUID(), action: fixAction() })
    service.cancel(1, 'doc', reference(fix))
    const next = await prepare({ ...base, requestId: randomUUID(), action: { kind: 'HINT', level: 2 } })
    service.start(1, 'doc', start(next))
    await vi.waitFor(() => expect(service.status(1, 'doc', reference(next)).state).toBe('COMPLETE'))
    expect(run.mock.calls[1][0].binding.contextGeneration).toBe(first.binding.contextGeneration)
    const newer = await prepare({ ...base, requestId: randomUUID(), sourceRevision: 2 })
    expect(newer.binding.contextGeneration).toBeGreaterThan(first.binding.contextGeneration)
    expect(() => service.start(1, 'doc', start(next))).toThrow()
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('D6-2 strict private replacement-only wire (not connected)', () => {
  const edit = { kind: 'EDIT_PROPOSAL', replacementText: '', rationale: 'Delete the extra statement.', evidence: [] }
  it('accepts deletion, bounded replacement and all NO_FIX reasons without canonical construction', () => {
    expect(isSelectionFixWire(edit, [])).toBe(true)
    expect(isSelectionFixWire({ ...edit, replacementText: '😀', evidence: ['R1'] }, ['R1'])).toBe(true)
    for (const reason of ['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'])
      expect(isSelectionFixWire({ kind: 'NO_FIX', reason, advice: 'Select a smaller region.' }, [])).toBe(true)
  })
  it.each(['edits', 'startOffset', 'endOffset', 'expectedOldText', 'source', 'private'])('rejects extra/model-authored %s', field => {
    expect(isSelectionFixWire({ ...edit, [field]: [] }, [])).toBe(false)
  })
  it('rejects missing/oversized/malformed fields and unbound, sparse or accessor evidence', () => {
    for (const v of [{ ...edit, rationale: '' }, { ...edit, rationale: '😀'.repeat(513) }, { ...edit, replacementText: '\ud800' },
      { ...edit, replacementText: 'x'.repeat(16385) }, { ...edit, evidence: ['R1'] }, { ...edit, evidence: new Array(1) },
      { kind: 'EDIT_PROPOSAL', replacementText: '' }, { kind: 'NO_FIX', reason: 'OTHER', advice: 'x' },
      { kind: 'NO_FIX', reason: 'LOCATION_UNKNOWN', advice: 'x', evidence: [] }, JSON.stringify(edit)])
      expect(isSelectionFixWire(v, [])).toBe(false)
    const getter = vi.fn(() => 'R1'), evidence = Object.defineProperty([], '0', { get: getter, enumerable: true })
    expect(isSelectionFixWire({ ...edit, evidence }, ['R1'])).toBe(false); expect(getter).not.toHaveBeenCalled()
  })
})
