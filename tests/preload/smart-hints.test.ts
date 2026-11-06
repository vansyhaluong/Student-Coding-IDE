import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { createLearningBridge } from '../../src/preload/bridge/learning'
import { SMART_HINT_CHANNELS as C, type SmartStatus } from '../../src/shared/contracts/smart-hints'
import { request, capture, reference, start, fixAction } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

function fixture() {
  const q = request(), s: SmartStatus = { schemaVersion: 1, requestId: q.requestId, operationId: randomUUID(), sequence: 0,
    binding: capture(q).binding, state: 'PREPARED', captureToken: randomUUID(), expiresAt: Date.now() + 60000, consentVersion: 1,
    statementBytes: 20, runContextKind: 'CODE_ONLY' }
  const ipc = { invoke: vi.fn<(c: string, q: unknown) => Promise<unknown>>(async () => ({ ok: true, value: s })), on: vi.fn(), removeListener: vi.fn() }
  const order = createLearningOrder(), api = createSmartHintsBridge(ipc, order)
  return { q, s, ipc, order, api }
}
describe('SH-1 typed bridge identity, epoch and stale suppression', () => {
  it('D6-2 rejects old capabilities and kind-only Fix before IPC', async () => {
    const f = fixture()
    expect((await f.api.prepare({ ...f.q, action: { kind: 'SUGGEST_FIX' } } as never)).ok).toBe(false)
    expect(f.ipc.invoke).not.toHaveBeenCalled()
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: { enabled: true, providerMode: 'FAKE', applyEnabled: true, consentVersion: 1 } })
    expect((await f.api.capabilities()).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: { enabled: true, providerMode: 'FAKE', applyEnabled: true, consentVersion: 1,
      suggestFixMode: 'DISABLED', suggestFixLanguages: [] } })
    expect((await f.api.capabilities()).ok).toBe(true)
  })
  it.each(['range', 'fingerprint', 'source', 'revision', 'origin'] as const)('D6-2 first prepare response cannot retarget %s', async field => {
    const f = fixture(), q = request({ action: fixAction() }), b = capture(q).binding
    if (b.action.kind !== 'SUGGEST_FIX') throw Error()
    if (field === 'range') b.action.selection.startOffset++
    if (field === 'fingerprint') b.action.selection.fingerprint = 'b'.repeat(64)
    if (field === 'source') b.fingerprint = 'b'.repeat(64)
    if (field === 'revision') b.sourceRevision++
    if (field === 'origin' && b.origin.kind === 'PRACTICE') b.origin.modelVersion++
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: { ...f.s, requestId: q.requestId, binding: b } })
    expect((await f.api.prepare(q)).ok).toBe(false)
  })
  it('D6-2 selection binding stays exact across prepare/start; same request id cannot replace its target', async () => {
    const f = fixture(), q = request({ action: fixAction() }), binding = capture(q).binding
    const s = { ...f.s, requestId: q.requestId, binding }
    f.ipc.invoke.mockResolvedValue({ ok: true, value: s })
    expect((await f.api.prepare(q)).ok).toBe(true)
    const calls = f.ipc.invoke.mock.calls.length
    expect((await f.api.prepare({ ...q, action: fixAction(q.source, 0, 1) })).ok).toBe(false)
    expect(f.ipc.invoke).toHaveBeenCalledTimes(calls)
    expect((await f.api.start(start(s))).ok).toBe(true)
  })
  it('separate capability API and no request on construction', () => {
    const f = fixture(), learning = createLearningBridge(f.ipc)
    expect(Object.keys(learning.smartHints).sort()).toEqual(['cancel', 'capabilities', 'prepare', 'retireContext', 'start', 'status'])
    expect(Object.keys(learning.analysis).sort()).toEqual(['cancel', 'prepare', 'start', 'status'])
    expect(f.ipc.invoke).not.toHaveBeenCalled()
  })
  it('validation blocks config/hidden metadata/missing consent before IPC', async () => {
    const f = fixture()
    for (const field of ['apiKey', 'model', 'endpoint', 'official', 'owner']) expect((await f.api.prepare({ ...f.q, [field]: 'PRIVATE' } as never)).ok).toBe(false)
    expect((await f.api.start({ ...reference(f.s) } as never)).ok).toBe(false); expect(f.ipc.invoke).not.toHaveBeenCalled()
  })
  it('lost start ACK recovers by status without replay, duplicate sequence is stable', async () => {
    const f = fixture(); await f.api.prepare(f.q)
    f.ipc.invoke.mockRejectedValueOnce(Error('PRIVATE_PATH'))
    expect((await f.api.start(start(f.s))).ok).toBe(false)
    expect((await f.api.status(reference(f.s))).ok).toBe(true); expect((await f.api.status(reference(f.s))).ok).toBe(true)
    expect(f.ipc.invoke.mock.calls.map(x => x[0])).toEqual([C.prepare, C.start, C.status, C.status])
  })
  it('wrong request/op/binding, stale sequence or extra private field rejects', async () => {
    const f = fixture(); f.s.sequence = 4; await f.api.prepare(f.q)
    for (const s of [{ ...f.s, requestId: randomUUID() }, { ...f.s, operationId: randomUUID() }, { ...f.s, sequence: 3 },
      { ...f.s, raw: 'HIDDEN_CANARY' }, { ...f.s, binding: { ...f.s.binding, sourceRevision: 9 } }]) {
      f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: s }); expect((await f.api.status(reference(f.s))).ok).toBe(false)
    }
  })
  it('late result after retire or context switch drops without touching Run/Submit order', async () => {
    const f = fixture(), g = gate<unknown>()
    f.ipc.invoke.mockReturnValueOnce(g.promise)
    const pending = f.api.prepare(f.q), oldEpoch = f.order.epoch
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: null })
    await f.api.retireContext({ clientContextId: f.q.clientContextId, reason: 'EDIT' })
    g.resolve({ ok: true, value: f.s }); expect((await pending).ok).toBe(false); expect(f.order.epoch).toBe(oldEpoch)
    expect(f.ipc.invoke.mock.calls.map(x => x[0])).toEqual([C.prepare, C.retireContext])
  })
  it('Learning context invalidate and unload reject late replies and remove lifecycle hook', async () => {
    const f = fixture(), g = gate<unknown>(), hooks = new Set<() => void>()
    const life = { addEventListener: (_e: string, h: () => void) => hooks.add(h), removeEventListener: (_e: string, h: () => void) => hooks.delete(h) }
    const api = createSmartHintsBridge(f.ipc, f.order, life as never)
    f.ipc.invoke.mockReturnValueOnce(g.promise); const pending = api.prepare(f.q)
    f.order.invalidate(); g.resolve({ ok: true, value: f.s }); expect((await pending).ok).toBe(false)
    for (const hook of hooks) hook()
    expect(hooks.size).toBe(0); expect((await api.prepare(f.q)).ok).toBe(false)
  })
})
