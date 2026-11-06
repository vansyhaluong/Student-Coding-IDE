import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { SubmissionAnalysisService } from '../../src/main/services/learning/analysis/service'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { FakeDeepSeekAdapter } from '../../src/main/services/learning/smart-hints/adapter'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { SMART_HINT_CHANNELS as C, type SmartStatus } from '../../src/shared/contracts/smart-hints'
import { request, registry, response, reference, start, fixAction } from '../fixtures/learning/smart-hints'
class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const closers: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of closers.splice(0)) await close() })
function fixture() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const ipcRegistry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  const owner = new Owner(1), other = new Owner(2), r = registry(), q = request()
  const frame = { processId: 10, frameToken: 'main', detached: false, isDestroyed: () => false }, event = { sender: { id: 1 }, senderFrame: frame }
  const send = vi.fn<(request: Request) => Promise<Response>>(async () => { expect(r.pinned).toBe(false); return response() })
  const smart = new SmartHintsService(new FakeDeepSeekAdapter({ send }, { authorization: () => 'Bearer synthetic-sh-secret', clear() {} }))
  const runService = { invalidate: vi.fn(), run: vi.fn(), submit: vi.fn(), publicRunReceipt: vi.fn(), retirePublicRunReceipt: vi.fn() }
  const analysis = new SubmissionAnalysisService(), invalidateD2 = vi.spyOn(analysis, 'invalidate')
  let allowedFrame = frame
  const ipc = new ExerciseIpcService(ipcRegistry, runService as unknown as ExerciseService, context => {
    if (context.senderFrame?.frameToken !== allowedFrame.frameToken || context.senderFrame.processId !== 10) throw Error('PRIVATE_PATH HIDDEN_CANARY')
  }, () => {}, undefined, { service: analysis, capture: async () => { throw Error('D2 must not capture') } },
  { service: smart, capture: (request, generation, check, receipt) => captureSmartHints(r.packages, request, generation, check, receipt) })
  ipc.observe(owner); ipc.observe(other); ipc.start(); closers.push(() => ipc.stop())
  const invoke = async (c: string, q: unknown, e = event) => handlers.get(c)!(e, q) as Promise<{ ok: boolean; value: SmartStatus }>
  return { ipc, invoke, q, event, frame, owner, send, smart, r, runService, invalidateD2,
    replaceFrame() { allowedFrame = { ...frame, frameToken: 'replacement' }; return { sender: { id: 1 }, senderFrame: allowedFrame } } }
}
describe('SH-1 semantic Main IPC integration', () => {
  it('D6-2 validates selection before lease; binds target but blocks all Fix dispatch while capability is disabled', async () => {
    const f = fixture(), q = { ...f.q, action: fixAction() }
    for (const action of [{ kind: 'SUGGEST_FIX' }, { ...q.action, selection: { ...q.action.selection, text: 'wrong' } },
      fixAction(q.source, 0, q.source.length)]) expect((await f.invoke(C.prepare, { ...q, action })).ok).toBe(false)
    expect(f.r.acquirePublic).not.toHaveBeenCalled()
    const p = await f.invoke(C.prepare, q)
    expect(p.ok).toBe(true); expect(p.value.binding.action).toMatchObject({ kind: 'SUGGEST_FIX', selection: { startOffset: q.action.selection.startOffset } })
    expect(JSON.stringify(p.value)).not.toContain(q.action.selection.text)
    for (const event of [{ sender: { id: 2 }, senderFrame: f.frame }, { sender: { id: 1 }, senderFrame: { ...f.frame, frameToken: 'subframe' } }])
      expect((await f.invoke(C.start, start(p.value), event)).ok).toBe(false)
    expect((await f.invoke(C.start, start(p.value))).value).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(f.smart.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(f.send).not.toHaveBeenCalled(); expect(f.runService.run).not.toHaveBeenCalled()
  })
  it('capture → consent → status; duplicate ACK does not call Run/Submit/D2/store', async () => {
    const f = fixture(), p = await f.invoke(C.prepare, f.q); expect(p.ok).toBe(true); expect(f.send).not.toHaveBeenCalled()
    await f.invoke(C.start, start(p.value)); await f.invoke(C.start, start(p.value))
    await vi.waitFor(async () => expect((await f.invoke(C.status, reference(p.value))).value.state).toBe('COMPLETE'))
    expect(f.send).toHaveBeenCalledOnce(); expect(f.runService.run).not.toHaveBeenCalled(); expect(f.runService.submit).not.toHaveBeenCalled()
    expect(f.runService.invalidate).not.toHaveBeenCalled(); expect(f.invalidateD2).not.toHaveBeenCalled()
    const result = await f.invoke(C.status, reference(p.value)); expect(JSON.stringify(result)).not.toMatch(/HIDDEN_CANARY|PRIVATE_PATH|synthetic-sh-secret|stdout|stderr|official/)
  })
  it('cancel/retire only revoke SH; no shared lifecycle invalidation or execution', async () => {
    const f = fixture(), p = await f.invoke(C.prepare, f.q)
    expect((await f.invoke(C.cancel, reference(p.value))).value.state).toBe('CANCELLED')
    await f.invoke(C.retireContext, { clientContextId: f.q.clientContextId, reason: 'EDIT' })
    expect(f.runService.retirePublicRunReceipt).toHaveBeenCalledOnce()
    expect(f.runService.invalidate).not.toHaveBeenCalled(); expect(f.invalidateD2).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
  })
  it('missing/foreign Run receipt is CODE_ONLY and does not start execution', async () => {
    const f = fixture(); f.runService.publicRunReceipt.mockImplementation(() => { throw Error('foreign/private') })
    const p = await f.invoke(C.prepare, { ...f.q, run: { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1, sequence: 3 } })
    expect(p.value).toMatchObject({ state: 'PREPARED', runContextKind: 'CODE_ONLY' }); expect(f.runService.run).not.toHaveBeenCalled()
  })
  it.each(['start', 'status', 'cancel'] as const)('%s rejects foreign owner, subframe and detached frame', async action => {
    const f = fixture(), p = await f.invoke(C.prepare, f.q), q = action === 'start' ? start(p.value) : reference(p.value)
    for (const event of [{ sender: { id: 99 }, senderFrame: f.frame }, { sender: { id: 2 }, senderFrame: f.frame },
      { sender: { id: 1 }, senderFrame: { ...f.frame, detached: true } }, { sender: { id: 1 }, senderFrame: { ...f.frame, frameToken: 'subframe' } }]) {
      const result = await f.invoke(C[action], q, event); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PATH|HIDDEN_CANARY/)
    }
    expect(f.send).not.toHaveBeenCalled()
  })
  it('rejects extra fields, arbitrary config and unconsented starts at registry boundary', async () => {
    const f = fixture()
    for (const key of ['key', 'endpoint', 'official', 'diagnostic']) expect((await f.invoke(C.prepare, { ...f.q, [key]: 'HIDDEN_CANARY' })).ok).toBe(false)
    const p = await f.invoke(C.prepare, f.q)
    expect((await f.invoke(C.start, { ...start(p.value), consentGranted: false })).ok).toBe(false); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['destroyed', 'render-process-gone', 'did-start-navigation'] as const)('%s retires captures; late start cannot dispatch', async event => {
    const f = fixture(), p = await f.invoke(C.prepare, f.q)
    if (event === 'destroyed') f.owner.dead = true
    f.owner.emit(event, {}, 'about:blank', false, true)
    expect((await f.invoke(C.start, start(p.value))).ok).toBe(false); expect(f.send).not.toHaveBeenCalled()
  })
  it('same owner replacement document cannot reuse token', async () => {
    const f = fixture(), p = await f.invoke(C.prepare, f.q)
    expect((await f.invoke(C.start, start(p.value), f.replaceFrame())).ok).toBe(false); expect(f.send).not.toHaveBeenCalled()
  })
  it('owner loss during provider request aborts transport and rejects late output', async () => {
    const f = fixture(); let resolve!: (value: Response) => void
    f.send.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const p = await f.invoke(C.prepare, f.q); await f.invoke(C.start, start(p.value))
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledOnce())
    f.owner.dead = true; f.owner.emit('destroyed')
    expect(f.send.mock.calls[0][0].signal.aborted).toBe(true)
    resolve(response()); expect((await f.invoke(C.status, reference(p.value))).ok).toBe(false)
  })
})
