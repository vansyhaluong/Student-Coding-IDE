import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { SubmissionAnalysisService } from '../../src/main/services/learning/analysis/service'
import { DirectDeepSeekAdapter } from '../../src/main/services/learning/analysis/adapter'
import { captureSavedAnalysis } from '../../src/main/services/learning/analysis/capture'
import { DomainError } from '../../src/main/errors/app-error'
import { ANALYSIS_CHANNELS as C, type AnalysisStatus } from '../../src/shared/contracts/analysis'
import { SUBMISSION_CHANNELS as S } from '../../src/shared/contracts/submission'
import { fixture as readFixture, record, document } from '../fixtures/learning/submission-read-fixture'
import { input, publicPackages, response, gate } from '../fixtures/learning/analysis'
class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
function value<T>(v: unknown): T { const r = v as { ok: boolean; value: T }; if (!r.ok) throw Error(JSON.stringify(v)); return r.value }
async function fixture() {
  const store = await readFixture(), r = record('FAILED', { code: input.source }); await store.write(document([r]))
  const owner = new Owner(1), other = new Owner(2), entries = new Map([[1, {}], [2, {}]]), epochs = new Map([[1, 0], [2, 0]])
  const service = { contextStamp: (id: number) => ({ entry: entries.get(id)!, epoch: epochs.get(id)! }),
    invalidate: vi.fn((id: number) => epochs.set(id, epochs.get(id)! + 1)), run: vi.fn(), submit: vi.fn() }
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  const frame = { processId: 10, frameToken: 'current', detached: false, isDestroyed: () => false }
  let allowed = frame
  const event = { sender: { id: 1 }, senderFrame: frame }, packages = publicPackages()
  const send = vi.fn(async (request: Request) => {
    expect(request.signal.aborted).toBe(false)
    expect(store.lease.ownsLease).toBe(false); expect(packages.pinned).toBe(false)
    return response()
  })
  const provider = new DirectDeepSeekAdapter({ send }, { authorization: () => 'Bearer synthetic-only', clear() {} })
  const analysis = new SubmissionAnalysisService(provider)
  const ipc = new ExerciseIpcService(registry, service as unknown as ExerciseService, context => {
    if (![1, 2].includes(context.senderId) || context.senderFrame?.frameToken !== allowed.frameToken
      || context.senderFrame.processId !== allowed.processId) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'PRIVATE_PATH', retryable: false })
  }, () => {}, { store: () => store.store, send: () => {} }, {
    service: analysis, capture: (binding, check) => captureSavedAnalysis(store.store, packages.packages, binding, check),
  })
  ipc.observe(owner); ipc.observe(other); ipc.start()
  const invoke = (c: string, q: unknown, e = event) => handlers.get(c)!(e, q)
  const history = value<{ rows: { source: { reference: string } }[] }>(await invoke(S.history, {}))
  const q = { requestId: 'request-1', sourceReference: history.rows[0].source.reference }
  const status = async () => value<AnalysisStatus>(await invoke(C.status, { requestId: q.requestId }))
  const prepare = async () => {
    await invoke(C.prepare, q); await vi.waitFor(async () => expect((await status()).state).toBe('PREPARED'))
    const prepared = await status(); if (prepared.state !== 'PREPARED') throw Error()
    return { requestId: q.requestId, captureToken: prepared.captureToken, consentVersion: 1 }
  }
  cleanup.push(async () => { await ipc.stop(); await store.dispose() })
  return { store, r, owner, other, event, invoke, q, status, prepare, send, packages, service, ipc, analysis,
    replaceFrame() { allowed = { ...frame, frameToken: 'replacement' }; return { sender: { id: 1 }, senderFrame: allowed } } }
}
describe('D2 Main semantic IPC with committed storage and direct fake adapter', () => {
  it('history → capture → explicit consent → start/status, duplicate/lost ACK creates one request', async () => {
    const f = await fixture(), before = await f.store.store.completion(f.r.exerciseId), start = await f.prepare()
    await Promise.all([f.invoke(C.start, start), f.invoke(C.start, start)])
    await vi.waitFor(async () => expect((await f.status()).state).toBe('COMPLETE'))
    await f.invoke(C.start, start)
    expect(f.send).toHaveBeenCalledOnce(); expect(f.service.run).not.toHaveBeenCalled(); expect(f.service.submit).not.toHaveBeenCalled()
    expect(await f.store.store.completion(f.r.exerciseId)).toEqual(before)
    expect(JSON.stringify(await f.status())).not.toMatch(/PRIVATE_|EXPECTED|HIDDEN|storage|codeHash|sourceRevision|synthetic-only/)
  })
  it('same committed identity with a reissued history token cannot obtain a double-click permit', async () => {
    const f = await fixture(); await f.prepare()
    const h = value<{ rows: { source: { reference: string } }[] }>(await f.invoke(S.history, {}))
    expect(h.rows[0].source.reference).not.toBe(f.q.sourceReference)
    expect(await f.invoke(C.prepare, { requestId: 'double-click', sourceReference: h.rows[0].source.reference })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('forged payload/source reference/consent never invokes provider', async () => {
    const f = await fixture()
    for (const field of ['source', 'prompt', 'endpoint', 'apiKey', 'model', 'owner', 'path']) expect(await f.invoke(C.prepare, { ...f.q, [field]: 'forged' })).toMatchObject({ ok: false })
    expect(await f.invoke(C.prepare, { ...f.q, sourceReference: 'forged' })).toMatchObject({ ok: false })
    const start = await f.prepare()
    for (const patch of [{ consentVersion: 0 }, { consentVersion: 2 }, { captureToken: 'foreign' }, { source: 'forged' }]) expect(await f.invoke(C.start, { ...start, ...patch })).toMatchObject({ ok: false })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('owner/frame checks apply to prepare/start/status/cancel', async () => {
    const f = await fixture(), start = await f.prepare()
    for (const e of [{ sender: { id: 99 }, senderFrame: f.event.senderFrame }, { sender: { id: 2 }, senderFrame: f.event.senderFrame },
      { ...f.event, senderFrame: { ...f.event.senderFrame, detached: true } },
      { ...f.event, senderFrame: { ...f.event.senderFrame, frameToken: 'subframe' } }]) {
      for (const [c, q] of [[C.prepare, f.q], [C.start, start], [C.status, { requestId: f.q.requestId }], [C.cancel, { requestId: f.q.requestId }]] as const) {
        const result = await f.invoke(c, q, e); expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PATH/)
      }
    }
    expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT'] as const)('submission context %s invalidates prepared capture', async reason => {
    const f = await fixture(), start = await f.prepare()
    await f.invoke(S.context, { reason })
    expect(await f.invoke(C.start, start)).toMatchObject({ ok: false }); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'] as const)('%s aborts in-flight request immediately', async reason => {
    const f = await fixture(), g = gate<Response>(); f.send.mockImplementationOnce(() => g.promise)
    const start = await f.prepare(); await f.invoke(C.start, start)
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce())
    if (reason === 'destroyed') f.owner.dead = true
    f.owner.emit(reason, {}, 'about:blank', false, true)
    expect(f.send.mock.calls[0][0].signal.aborted).toBe(true); g.resolve(response())
    expect(await f.invoke(C.status, { requestId: f.q.requestId })).toMatchObject({ ok: false })
  })
  it('same owner id in a replacement frame cannot reuse capture', async () => {
    const f = await fixture(), start = await f.prepare()
    expect(await f.invoke(C.start, start, f.replaceFrame())).toMatchObject({ ok: false }); expect(f.send).not.toHaveBeenCalled()
  })
  it('cancel is independent and cannot mutate Judge/Run/Submit', async () => {
    const f = await fixture(), start = await f.prepare()
    expect(await f.invoke(C.cancel, { requestId: f.q.requestId })).toMatchObject({ ok: true, value: { state: 'CANCELLED' } })
    await f.invoke(C.start, start); expect(f.send).not.toHaveBeenCalled(); expect(f.service.invalidate).not.toHaveBeenCalled()
  })
  it.each([{ exerciseId: 'foreign' }, { language: 'csharp' as const }, { packageVersion: 2 }])('History binding rejects changed committed metadata %j without dispatch', async patch => {
    const f = await fixture(); await f.store.write(document([{ ...f.r, ...patch }]))
    await f.invoke(C.prepare, f.q)
    await vi.waitFor(async () => expect(await f.status()).toMatchObject({ state: 'FAILED', code: 'SOURCE_UNAVAILABLE' }))
    expect(f.send).not.toHaveBeenCalled(); expect(f.packages.acquirePublic).not.toHaveBeenCalled()
  })
})
