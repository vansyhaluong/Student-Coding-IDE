import { describe, expect, it, vi } from 'vitest'
import { createAnalysisBridge } from '../../src/preload/bridge/analysis'
import { createLearningBridge } from '../../src/preload/bridge/learning'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { ANALYSIS_CHANNELS as C } from '../../src/shared/contracts/analysis'
import { gate } from '../fixtures/learning/analysis'
function fixture() {
  const ipc = { invoke: vi.fn<(c: string, q: unknown) => Promise<unknown>>(async () => ({ ok: true, value: { requestId: 'r', sequence: 1, state: 'RUNNING' } })),
    on: vi.fn(), removeListener: vi.fn() }
  const order = createLearningOrder(), api = createAnalysisBridge(ipc, order)
  return { ipc, order, api }
}
describe('D2 typed preload analysis bridge', () => {
  it('separate Learning API with no raw transport or provider config', async () => {
    const f = fixture(), api = createLearningBridge(f.ipc)
    expect(Object.keys(api.analysis).sort()).toEqual(['cancel', 'prepare', 'start', 'status'])
    expect((await api.analysis.prepare({ requestId: 'r', sourceReference: 'opaque' })).ok).toBe(true)
    expect(f.ipc.invoke.mock.calls[0]).toEqual([C.prepare, { requestId: 'r', sourceReference: 'opaque' }])
  })
  it('rejects arbitrary source/key/config and missing consent locally', async () => {
    const f = fixture()
    for (const field of ['source', 'apiKey', 'endpoint', 'model', 'prompt']) expect((await f.api.prepare({ requestId: 'r', sourceReference: 'ref', [field]: 'x' } as never)).ok).toBe(false)
    expect((await f.api.start({ requestId: 'r', captureToken: 't' } as never)).ok).toBe(false)
    expect(f.ipc.invoke).not.toHaveBeenCalled()
  })
  it('lost ACK is not replayed; status recovers same operation', async () => {
    const f = fixture(); f.ipc.invoke.mockRejectedValueOnce(Error('PRIVATE_PATH'))
    expect((await f.api.start({ requestId: 'r', captureToken: 't', consentVersion: 1 })).ok).toBe(false)
    expect((await f.api.status({ requestId: 'r' })).ok).toBe(true)
    expect(f.ipc.invoke.mock.calls.map(c => c[0])).toEqual([C.start, C.status])
  })
  it('drops late replies after shared Learning context invalidation', async () => {
    const f = fixture(), g = gate<unknown>(); f.ipc.invoke.mockImplementationOnce(() => g.promise)
    const pending = f.api.prepare({ requestId: 'r', sourceReference: 'ref' }); f.order.invalidate()
    g.resolve({ ok: true, value: { requestId: 'r', sequence: 1, state: 'RUNNING' } })
    expect((await pending).ok).toBe(false)
  })
  it('rejects foreign requestId, regressing sequence and private result fields', async () => {
    const f = fixture(); await f.api.prepare({ requestId: 'r', sourceReference: 'ref' })
    for (const value of [{ requestId: 'other', sequence: 2, state: 'RUNNING' }, { requestId: 'r', sequence: 0, state: 'RUNNING' },
      { requestId: 'r', sequence: 2, state: 'RUNNING', raw: 'PRIVATE' }]) {
      f.ipc.invoke.mockResolvedValueOnce({ ok: true, value }); expect((await f.api.status({ requestId: 'r' })).ok).toBe(false)
    }
  })
  it('sanitizes errors and removes unload hook', async () => {
    const f = fixture(), unload = new Set<EventListenerOrEventListenerObject>()
    const life = { addEventListener: (_e: string, listener: EventListenerOrEventListenerObject) => { unload.add(listener) },
      removeEventListener: (_e: string, listener: EventListenerOrEventListenerObject) => { unload.delete(listener) } }
    const api = createAnalysisBridge(f.ipc, f.order, life as never)
    f.ipc.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: 'PRIVATE_PATH', details: { apiKey: 'secret' }, retryable: true } })
    const r = await api.status({ requestId: 'r' }); expect(JSON.stringify(r)).not.toMatch(/PRIVATE|apiKey|secret/)
    expect(r).toMatchObject({ ok: false, error: { retryable: false } })
    for (const listener of unload) (listener as () => void)()
    expect(unload.size).toBe(0); expect((await api.status({ requestId: 'r' })).ok).toBe(false)
    expect(f.ipc.invoke).toHaveBeenCalledOnce()
  })
})
