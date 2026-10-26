import { describe, expect, it, vi } from 'vitest'
import { createSubmissionBridge } from '../../src/preload/bridge/submission'
import { createExerciseBridge } from '../../src/preload/bridge/exercise'
import { createLearningBridge } from '../../src/preload/bridge/learning'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { SUBMISSION_CHANNELS as C } from '../../src/shared/contracts/submission'
import { transportStatus, transportSource, transportHistory, submitRequest, transportRun } from '../fixtures/learning/submission-transport'
const gate = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const events = new Map<string, Set<(_e: unknown, v: unknown) => void>>(), unload = new Set<() => void>()
  const ipc = { invoke: vi.fn<(c: string, v: unknown) => Promise<unknown>>(async () => ({ ok: true, value: transportStatus() })),
    on: vi.fn((c: string, l: (_e: unknown, v: unknown) => void) => { if (!events.has(c)) events.set(c, new Set()); events.get(c)!.add(l) }),
    removeListener: vi.fn((c: string, l: (_e: unknown, v: unknown) => void) => { events.get(c)?.delete(l) }) }
  const life = { addEventListener: (_e: 'unload', l: () => void) => { unload.add(l) }, removeEventListener: (_e: 'unload', l: () => void) => { unload.delete(l) } }
  const order = createLearningOrder(), api = createSubmissionBridge(ipc, life, order), run = createExerciseBridge(ipc, life, order)
  return { api, run, ipc, order, unload, events, emit: (v: unknown) => events.get(C.changed)?.forEach(l => l({}, v)) }
}
describe('S6 preload Submit bridge', () => {
  it('buffers one newest pre-ACK event and detaches listener/caller payloads', async () => {
    const f = fixture(), ack = gate<unknown>(), changed = vi.fn(); f.api.onChanged(changed)
    f.ipc.invoke.mockImplementationOnce(() => ack.promise)
    const started = f.api.submit(submitRequest)
    for (let n = 1; n <= 100; n++) f.emit({ ...transportStatus(1, n), stage: 'STORAGE' })
    expect(changed).not.toHaveBeenCalled(); ack.resolve({ ok: true, value: transportStatus() })
    const result = await started; expect(result).toMatchObject({ ok: true, value: { sequence: 100 } }); expect(changed).toHaveBeenCalledTimes(1)
    changed.mock.calls[0][0].exerciseId = 'modified'
    f.emit(transportStatus(1, 101)); expect(changed).toHaveBeenCalledTimes(2)
    f.emit({ ...transportStatus(1, 102), exerciseId: 'foreign' }); f.emit(transportStatus(1, 100)); expect(changed).toHaveBeenCalledTimes(2)
  })
  it('lost ACK performs no replay; current recovers Main reference and retry sends only that reference', async () => {
    const f = fixture(); f.ipc.invoke.mockRejectedValueOnce(Error('PRIVATE_TRANSPORT'))
    expect(await f.api.submit(submitRequest)).toMatchObject({ ok: false, error: { retryable: false } }); expect(f.ipc.invoke).toHaveBeenCalledTimes(1)
    const current = await f.api.current(); expect(current).toMatchObject({ ok: true, value: { reference: transportStatus().reference } })
    await f.api.retry(transportStatus().reference)
    expect(f.ipc.invoke.mock.calls.map(c => c[0])).toEqual([C.submit, C.current, C.retry])
    expect(f.ipc.invoke.mock.calls[2][1]).toEqual(transportStatus().reference)
  })
  it('rejects forged inputs locally and allows no concurrent Submit invoke queue', async () => {
    const f = fixture(), ack = gate<unknown>()
    expect((await f.api.submit({ ...submitRequest, verdict: 'Accepted' } as never)).ok).toBe(false)
    expect((await f.api.status({ ...transportStatus().reference, owner: 1 } as never)).ok).toBe(false)
    expect((await f.api.source({ reference: 'x', offset: 0, sourceHash: 'x' } as never)).ok).toBe(false)
    expect(f.ipc.invoke).not.toHaveBeenCalled()
    f.ipc.invoke.mockImplementationOnce(() => ack.promise); const first = f.api.submit(submitRequest)
    expect((await f.api.submit(submitRequest)).ok).toBe(false); expect(f.ipc.invoke).toHaveBeenCalledTimes(1)
    ack.resolve({ ok: true, value: transportStatus() }); await first
  })
  it('rejects hidden result/event fields and sanitizes all error data', async () => {
    const f = fixture(), listener = vi.fn(); f.api.onChanged(listener); await f.api.submit(submitRequest)
    for (const extra of [{ Expected: [1] }, { sourceHash: 'a'.repeat(64) }, { JudgeResult: {} }, { counts: { total: 7, attempted: 7, passed: 7, indices: [0] } }]) {
      const bad = { ...transportStatus(1, 1), ...extra }; f.emit(bad); f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: bad })
      expect((await f.api.status(transportStatus().reference)).ok).toBe(false)
    }
    expect(listener).not.toHaveBeenCalled()
    f.ipc.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: 'C:\\PRIVATE_PATH', details: { Expected: 'private' }, retryable: true } })
    const error = await f.api.status(transportStatus().reference)
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE|Expected|details/)
  })
  it('shares ordering with Run and rejects delayed Run/Submit replies and old events across modes', async () => {
    const f = fixture(), late = gate<unknown>(), changed = vi.fn(); f.api.onChanged(changed)
    f.ipc.invoke.mockImplementationOnce(() => late.promise); const oldRun = f.run.run(submitRequest)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportStatus(2) }); expect((await f.api.submit(submitRequest)).ok).toBe(true)
    late.resolve({ ok: true, value: transportRun(1) }); expect((await oldRun).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportRun(3) }); expect((await f.run.run(submitRequest)).ok).toBe(true)
    f.emit(transportStatus(2, 10)); expect(changed).not.toHaveBeenCalled()
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportStatus(2, 10) }); expect((await f.api.status(transportStatus(2).reference)).ok).toBe(false)
  })
  it('context invalidation rejects in-flight responses in both modes without exposing stop authority', async () => {
    const f = fixture(), old = gate<unknown>(); f.ipc.invoke.mockImplementationOnce(() => old.promise)
    const pending = f.api.submit(submitRequest)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: null }); expect((await f.api.context({ reason: 'LEARNING_LEFT' })).ok).toBe(true)
    old.resolve({ ok: true, value: transportStatus() }); expect((await pending).ok).toBe(false)
    expect((await f.api.context({ reason: 'SHUTDOWN' } as never)).ok).toBe(false)
  })
  it('validates bounded reads and exact source offset/ref/request identity correlation', async () => {
    const f = fixture(); f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportHistory(100) })
    expect((await f.api.history({ limit: 100 })).ok).toBe(true)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportHistory(101) }); expect((await f.api.history({})).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportSource('\0'.repeat(32768)) })
    expect((await f.api.source({ reference: 'opaque-source-ref', offset: 0 })).ok).toBe(true)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportSource() }); expect((await f.api.source({ reference: 'other', offset: 0 })).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportSource('too much') }); expect((await f.api.source({ reference: 'opaque-source-ref', offset: 0, limit: 1 })).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: { ok: true, exerciseId: 'other', state: 'UNKNOWN', accepted: { state: 'UNAVAILABLE', readable: false } } })
    expect((await f.api.completion({ exerciseId: 'ch2-04' })).ok).toBe(false)
  })
  it('subscribes once, isolates consumers, removes listeners on last unsubscribe and unload, rejects late ACK', async () => {
    const f = fixture(), a = f.api.onChanged(() => { throw Error('consumer') }), b = f.api.onChanged(vi.fn())
    expect(f.ipc.on).toHaveBeenCalledTimes(1); a(); a(); expect(f.ipc.removeListener).not.toHaveBeenCalled(); b(); expect(f.ipc.removeListener).toHaveBeenCalledTimes(1)
    f.api.onChanged(vi.fn()); const ack = gate<unknown>(); f.ipc.invoke.mockImplementationOnce(() => ack.promise); const pending = f.api.submit(submitRequest)
    for (const unload of [...f.unload]) unload()
    ack.resolve({ ok: true, value: transportStatus() }); expect((await pending).ok).toBe(false)
    expect(f.events.get(C.changed)?.size).toBe(0); expect(f.unload.size).toBe(0)
  })
  it('isolates a throwing listener and rejects history filters/partial scope mislabeled as complete', async () => {
    const f = fixture(), survivor = vi.fn(); f.api.onChanged(() => { throw Error('consumer') }); f.api.onChanged(survivor)
    await f.api.submit(submitRequest); f.emit(transportStatus(1, 1)); expect(survivor).toHaveBeenCalledOnce()
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportHistory(33) }); expect((await f.api.history({})).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportHistory() }); expect((await f.api.history({ scope: 'FAILED' })).ok).toBe(false)
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: transportHistory() }); expect((await f.api.history({ language: 'csharp' })).ok).toBe(false)
    const bad = transportHistory(); bad.stores.ACCEPTED = { state: 'UNAVAILABLE', readable: false } as never
    f.ipc.invoke.mockResolvedValueOnce({ ok: true, value: bad }); expect((await f.api.history({})).ok).toBe(false)
  })
  it('composes a separate semantic capability while keeping the four Run methods unchanged', () => {
    const f = fixture(), learning = createLearningBridge(f.ipc)
    expect(Object.keys(learning.exercise).sort()).toEqual(['onChanged', 'run', 'snapshot', 'stop'])
    expect(Object.keys(learning.submission).sort()).toEqual(['submit', 'status', 'current', 'retry', 'history', 'completion', 'source', 'context', 'onChanged'].sort())
  })
})
