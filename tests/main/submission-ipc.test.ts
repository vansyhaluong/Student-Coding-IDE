import { EventEmitter } from 'node:events'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike, type IpcRequestContext } from '../../src/main/ipc/ipc-handler-registry'
import { ExerciseService, type SubmissionOperationHandle, type SubmissionServiceStatus } from '../../src/main/services/learning/exercise-service'
import { DomainError } from '../../src/main/errors/app-error'
import { SUBMISSION_CHANNELS as C, type SubmissionStatus, type SubmissionHistory, type SubmissionSource } from '../../src/shared/contracts/submission'
import { EXERCISE_CHANNELS as R } from '../../src/shared/contracts/exercise'
import { createSubmissionBridge } from '../../src/preload/bridge/submission'
import { fixture as storeFixture, record, document, sourceRequest } from '../fixtures/learning/submission-read-fixture'
import { transportStatus, submitRequest, transportUuid, transportRun } from '../fixtures/learning/submission-transport'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import type { OfficialAdapterFactory, OfficialCaseObservation } from '../../src/main/services/learning/runtime/official-execution-contracts'

class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const dispose: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of dispose.splice(0)) await close(); vi.restoreAllMocks() })
function value<T>(v: unknown): T { const r = v as { ok: boolean; value: T; error?: unknown }; if (!r.ok) throw Error(JSON.stringify(r.error)); return r.value }
async function fixture(real = false) {
  const store = await storeFixture(), owner = new Owner(1), other = new Owner(2), finished = gate()
  const entries = new Map([[1, {}], [2, {}]]), epochs = new Map([[1, 0], [2, 0]])
  let generation = 0, mode = 'RUN', activeOwner = 1, final = false
  const denied = () => new DomainError({ code: 'PERMISSION_DENIED', message: 'PRIVATE_PATH Expected', retryable: false })
  const fake = {
    contextStamp(id: number) { return { entry: entries.get(id)!, epoch: epochs.get(id)! } },
    invalidate: vi.fn((id: number) => { epochs.set(id, epochs.get(id)! + 1) }),
    submit: vi.fn((id: number) => {
      const n = ++generation, status = transportStatus(n), entry = entries.get(id), epoch = epochs.get(id); mode = 'SUBMIT'; activeOwner = id
      const statusNow = (): SubmissionServiceStatus => {
        if (generation !== n || mode !== 'SUBMIT' || entries.get(id) !== entry || epochs.get(id) !== epoch) throw denied()
        return { ...status, submissionId: status.reference.submissionId, reference: { sessionId: status.reference.sessionId, generation: n },
          stage: final ? 'SETTLED' : 'STORAGE', storage: final ? { state: 'saved', recordKey: { storeKind: 'ACCEPTED', recordId: transportUuid(55) } } : { state: 'pending' } }
      }
      return { reference: { sessionId: status.reference.sessionId, generation: n }, submissionId: status.reference.submissionId,
        status: vi.fn(statusNow), completion: async () => { await finished.promise; return statusNow() },
        retry: vi.fn(async () => { final = true; finished.resolve(); return statusNow() }) }
    }),
    run: vi.fn((id: number) => { mode = 'RUN'; activeOwner = id; return transportRun(++generation) }),
    snapshot: vi.fn((id: number, ref: { generation: number }) => { if (mode !== 'RUN' || id !== activeOwner || ref.generation !== generation) throw denied(); return transportRun(generation) }),
    stopSession: vi.fn(async (id: number, ref: { generation: number }) => fake.snapshot(id, ref)),
  }
  let service = fake as unknown as ExerciseService
  let packages: Awaited<ReturnType<typeof sourceRegistry>> | undefined
  if (real) {
    packages = await sourceRegistry()
    const factory: OfficialAdapterFactory = (request, _workspace, load) => {
      let input: Awaited<ReturnType<typeof load>> | undefined
      const cases: OfficialCaseObservation[] = []
      return { hasNextCase: () => !!input && cases.length < input.execution.caseCount,
        async runPhase(phase, context) {
          if (phase === 'prepare') input = await load(context)
          if (phase === 'execute') {
            const args = input!.execution.inputAt(cases.length) as readonly number[], a = args[0], b = args[1]
            cases.push({ caseIndex: cases.length, language: request.language, kind: 'RETURNED', actual: [Math.floor(a / b), a % b], stdout: 'PRIVATE_CONSOLE', stderr: '',
              process: { phase: 'execute', exitCode: 0, processExited: true, stdoutSettled: true, stderrSettled: true, observerSettled: true, failure: null, jobMemoryLimitObserved: false } })
          }
        }, async verifyBetweenCases() {}, officialEvidence: () => ({ cases, notRunCaseIndices: Array.from({ length: (input?.execution.caseCount ?? 0) - cases.length }, (_, i) => i + cases.length),
          compile: { status: 'SUCCEEDED', exitCode: 0, failure: null, diagnostics: [], stdout: 'PRIVATE_DIAGNOSTIC', stderr: '' }, failure: null }),
        async terminate() {}, async settleObservers() {}, async release() {}, async closeHandles() {}, async evidence() {
          return { members: [], retained: [], activeProcesses: 0, totalProcesses: 0, observerSettled: true, coverageComplete: true, unresolvedErrors: false }
        } }
    }
    service = new ExerciseService({ root: join(store.root, 'runtime'), leases: { acquire: async () => ({ release: async () => {} }) },
      official: { registry: packages, createAdapter: factory }, submissions: { store: () => store.store, ownsLease: () => store.lease.ownsLease } })
    service.start(); await service.ready(); service.observe(owner); service.observe(other)
  }
  const submit = real ? vi.spyOn(service, 'submit') : fake.submit
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>(), sends: SubmissionStatus[] = []
  const registry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  const frame = { processId: 10, frameToken: 'current', detached: false, isDestroyed: () => false }; let currentFrame = frame
  const event = { sender: { id: 1 }, senderFrame: frame }
  const ports = { store: () => store.store, send: (_c: IpcRequestContext, s: SubmissionStatus) => { sends.push(s) } }
  const invalidateChat = vi.fn()
  const ipc = new ExerciseIpcService(registry, service, (ctx: IpcRequestContext) => {
    if (![1, 2].includes(ctx.senderId) || ctx.senderFrame?.frameToken !== currentFrame.frameToken || ctx.senderFrame.processId !== currentFrame.processId) throw denied()
  }, () => {}, ports, undefined, undefined, invalidateChat)
  ipc.observe(owner); ipc.observe(other); ipc.start()
  const invoke = (channel: string, payload: unknown, e = event) => handlers.get(channel)!(e, payload)
  dispose.push(async () => { finished.resolve(); ipc.stop(); if (real) await service.stop(); await packages?.stop(); await store.dispose() })
  return { store, owner, other, service, fake, submit, ipc, handlers, invoke, event, sends, finished, ports, invalidateChat,
    finish() { final = true; finished.resolve() }, replaceFrame() { currentFrame = { ...frame, frameToken: 'new' }; return { sender: { id: 1 }, senderFrame: currentFrame } },
    replaceOwner() { owner.dead = true; owner.emit('destroyed'); const next = new Owner(1); entries.set(1, {}); epochs.set(1, 0); ipc.observe(next); return next } }
}

describe('S6 Main Submit/status authorization and lifecycle', () => {
  it('existing Learning context invalidation retires Chat using trusted sender only', async () => {
    const f = await fixture()
    expect(await f.invoke(C.context, { reason: 'LEARNING_LEFT', owner: 2 })).toMatchObject({ ok: false })
    expect(f.invalidateChat).not.toHaveBeenCalled()
    expect(await f.invoke(C.context, { reason: 'LEARNING_LEFT' })).toEqual({ ok: true, value: null })
    expect(f.invalidateChat).toHaveBeenCalledExactlyOnceWith(1)
  })
  it('registers only semantic channels and refuses forged input before domain dispatch', async () => {
    const f = await fixture()
    expect(f.handlers.size).toBe(11)
    for (const field of ['owner', 'verdict', 'Expected', 'cleanup', 'officialHash', 'path', 'command']) expect(await f.invoke(C.submit, { ...submitRequest, [field]: 'private' })).toMatchObject({ ok: false })
    expect(f.submit).not.toHaveBeenCalled()
    f.ipc.stop(); expect(f.handlers.size).toBe(0); expect(f.owner.listenerCount('destroyed')).toBe(0)
  })
  it('authorizes current sender/frame and sanitizes raw failures on all paths', async () => {
    const f = await fixture()
    for (const event of [{ sender: { id: 99 }, senderFrame: f.event.senderFrame }, { sender: { id: 1 }, senderFrame: { ...f.event.senderFrame, frameToken: 'subframe' } },
      { sender: { id: 1 }, senderFrame: { ...f.event.senderFrame, detached: true } }]) {
      const reply = await f.invoke(C.submit, submitRequest, event); expect(reply).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } }); expect(JSON.stringify(reply)).not.toMatch(/PRIVATE_PATH|Expected/)
    }
    expect(f.submit).not.toHaveBeenCalled()
  })
  it('status/retry/current join Main-issued identity and never re-admit Submit', async () => {
    const f = await fixture(), first = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest))
    expect(value<SubmissionStatus>(await f.invoke(C.status, first.reference)).sequence).toBe(0)
    const saved = value<SubmissionStatus>(await f.invoke(C.retry, first.reference)); expect(saved.storage.state).toBe('saved'); expect(saved.sequence).toBe(1)
    expect(value<SubmissionStatus>(await f.invoke(C.current, {})).reference).toEqual(first.reference)
    await f.invoke(C.retry, first.reference); expect(f.submit).toHaveBeenCalledTimes(1)
    expect(f.sends.every((s, i, a) => i === 0 || s.sequence > a[i - 1].sequence)).toBe(true)
  })
  it('rejects foreign owner/forged identity and private refs on legacy Run routes', async () => {
    const f = await fixture(), first = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest))
    expect(await f.invoke(C.status, first.reference, { ...f.event, sender: { id: 2 } })).toMatchObject({ ok: false })
    for (const changed of [{ generation: 99 }, { submissionId: transportUuid(999) }, { sessionId: `exercise_${transportUuid(999)}` }]) expect(await f.invoke(C.retry, { ...first.reference, ...changed })).toMatchObject({ ok: false })
    const ref = { sessionId: first.reference.sessionId, generation: first.reference.generation }
    expect(await f.invoke(R.snapshot, ref)).toMatchObject({ ok: false }); expect(await f.invoke(R.stop, { ...ref, reason: 'LEARNING_LEFT' })).toMatchObject({ ok: false })
    expect(f.submit).toHaveBeenCalledTimes(1)
  })
  it('revokes idle references after context/leave and after a new Run generation', async () => {
    const f = await fixture(), first = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest))
    expect(await f.invoke(C.context, { reason: 'LEARNING_LEFT' })).toMatchObject({ ok: true, value: null })
    expect(await f.invoke(C.status, first.reference)).toMatchObject({ ok: false }); expect(await f.invoke(C.current, {})).toMatchObject({ ok: true, value: null })
    const next = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest)); await f.invoke(R.run, submitRequest)
    expect(await f.invoke(C.status, next.reference)).toMatchObject({ ok: false })
  })
  it('revokes stale frame, navigation, and reused numeric owner without accepting old listeners', async () => {
    const f = await fixture(), first = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest)), newEvent = f.replaceFrame()
    expect(await f.invoke(C.status, first.reference)).toMatchObject({ ok: false })
    expect(await f.invoke(C.current, {}, newEvent)).toMatchObject({ ok: true, value: null })
    const oldNavigate = f.owner.listeners('did-start-navigation')[0] as (...args: unknown[]) => void
    const replacement = f.replaceOwner(); const fresh = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest, newEvent))
    oldNavigate({}, '', false, true)
    expect(await f.invoke(C.status, fresh.reference, newEvent)).toMatchObject({ ok: true })
    replacement.emit('did-start-navigation', {}, '', false, true)
    expect(await f.invoke(C.status, fresh.reference, newEvent)).toMatchObject({ ok: false })
  })
  it('shutdown seals replies/events and drops late completion without stopping owned service tasks', async () => {
    const f = await fixture(); await f.invoke(C.submit, submitRequest); f.ipc.beginShutdown(); f.finish(); await Promise.resolve(); await Promise.resolve()
    expect(f.sends).toEqual([]); expect(await f.invoke(C.current, {})).toMatchObject({ ok: false })
  })
})

describe('S6 committed read projections and context-bound opaque identities', () => {
  it('reports UNKNOWN/partial-unavailable when the managed filesystem façade cannot initialize, never an empty or negative store', async () => {
    const f = await fixture(), r = record(); await f.store.write(document([r]))
    const h = value<SubmissionHistory>(await f.invoke(C.history, {})); if (!h.ok) throw Error('fixture')
    vi.spyOn(f.ports, 'store').mockImplementation(() => { throw Error('PRIVATE_STORAGE_INIT_PATH') })
    expect(value(await f.invoke(C.completion, { exerciseId: 'synthetic' }))).toMatchObject({ state: 'UNKNOWN', accepted: { state: 'UNAVAILABLE', readable: false } })
    expect(value(await f.invoke(C.history, {}))).toMatchObject({ coverage: 'PARTIAL', total: null, knownCount: 0 })
    const source = await f.invoke(C.source, { reference: h.rows[0].source.reference, offset: 0 })
    expect(value(source)).toMatchObject({ ok: false, reason: 'UNAVAILABLE' }); expect(JSON.stringify(source)).not.toContain('PRIVATE_STORAGE_INIT_PATH')
  })
  it('projects bounded history/source without internal hashes and detects stale generation cursors', async () => {
    const f = await fixture(), records = Array.from({ length: 33 }, () => record('ACCEPTED', { exerciseId: 'ch2-04', code: '🙂\r\n' }))
    const base = document(records); await f.store.write(base)
    const h = value<SubmissionHistory>(await f.invoke(C.history, {})); expect(h.ok).toBe(true); if (!h.ok) return
    expect(h.rows).toHaveLength(32); expect(Buffer.byteLength(h.nextCursor!)).toBeLessThanOrEqual(512)
    expect(h.rows.every(r => Buffer.byteLength(JSON.stringify(r)) <= 1024)).toBe(true)
    const encoded = JSON.stringify(h)
    for (const r of records) expect(encoded).not.toContain(r.codeHash)
    expect(encoded).not.toMatch(/signatureHash|testSet|cleanupProof|payloadDigest/)
    const source = value<SubmissionSource>(await f.invoke(C.source, { reference: h.rows[0].source.reference, offset: 0 }))
    expect(source).toMatchObject({ ok: true, code: '🙂\r\n' }); expect(JSON.stringify(source)).not.toContain(records[0].codeHash)
    expect(value(await f.invoke(C.history, { cursor: h.nextCursor }))).toMatchObject({ ok: true, rows: [expect.any(Object)] })
    expect(await f.invoke(C.source, { reference: h.nextCursor, offset: 0 })).toMatchObject({ ok: false })
    await f.store.write(document([...records, record()], base))
    expect(value(await f.invoke(C.history, { cursor: h.nextCursor }))).toMatchObject({ ok: false, reason: 'STALE_CURSOR' })
  })
  it('read tokens cannot cross owner/context, become arbitrary paths or reveal a private raw binding', async () => {
    const f = await fixture(), r = record(); await f.store.write(document([r]))
    const h = value<SubmissionHistory>(await f.invoke(C.history, {})); if (!h.ok) throw Error('fixture')
    const reference = h.rows[0].source.reference
    expect(await f.invoke(C.source, { reference, offset: 0 }, { ...f.event, sender: { id: 2 } })).toMatchObject({ ok: false })
    expect(await f.invoke(C.source, { reference: reference.slice(0, -1) + (reference.endsWith('A') ? 'B' : 'A'), offset: 0 })).toMatchObject({ ok: false })
    expect(await f.invoke(C.source, sourceRequest(r))).toMatchObject({ ok: false })
    f.service.invalidate(1, 'CONTEXT_CHANGED') // Even invalidation outside this IPC revokes read scopes.
    expect(await f.invoke(C.source, { reference, offset: 0 })).toMatchObject({ ok: false })
  })
  it('preserves partial availability/UNKNOWN and recovered backup data-loss warning without repair', async () => {
    const f = await fixture(), r = record('ACCEPTED', { exerciseId: 'ch2-04' }); await f.store.write(document([r]), true)
    await fs.writeFile(f.store.path('ACCEPTED'), 'preserve corrupt')
    expect(value(await f.invoke(C.completion, { exerciseId: 'ch2-04' }))).toMatchObject({ state: 'COMPLETED', accepted: { warning: 'POSSIBLE_DATA_LOSS' } })
    expect(value(await f.invoke(C.completion, { exerciseId: 'possibly-lost' }))).toMatchObject({ state: 'UNKNOWN' })
    expect(value(await f.invoke(C.history, {}))).toMatchObject({ coverage: 'PARTIAL', total: null })
    expect(await fs.readFile(f.store.path('ACCEPTED'), 'utf8')).toBe('preserve corrupt')
  })
  it('rejects read responses after an awaited context change and never echoes I/O diagnostics', async () => {
    const f = await fixture(), entered = gate(), resume = gate(), actual = f.store.store.history.bind(f.store.store)
    vi.spyOn(f.store.store, 'history').mockImplementationOnce(async request => { entered.resolve(); await resume.promise; return actual(request) })
    const pending = f.invoke(C.history, {}); await entered.promise; await f.invoke(C.context, { reason: 'CONTEXT_CHANGED' }); resume.resolve()
    const reply = await pending; expect(reply).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } }); expect(JSON.stringify(reply)).not.toMatch(/PRIVATE|Expected|sourceHash/)
  })
  it('enforces JSON bounds for escaped source and rejects an incorrect private source binding at projection', async () => {
    const f = await fixture(), r = record('ACCEPTED', { code: '\0'.repeat(32768) }); await f.store.write(document([r]))
    const h = value<SubmissionHistory>(await f.invoke(C.history, {})); if (!h.ok) throw Error('fixture')
    const req = { reference: h.rows[0].source.reference, offset: 0 }, source = await f.invoke(C.source, req)
    expect(Buffer.byteLength(JSON.stringify(source))).toBeLessThanOrEqual(256 * 1024)
    expect(value(source)).toMatchObject({ ok: true, code: r.code })
    const original = await f.store.store.source(sourceRequest(r)); if (!original.ok) throw Error('fixture')
    vi.spyOn(f.store.store, 'source').mockResolvedValueOnce({ ...original, sourceHash: 'a'.repeat(64) })
    const bad = await f.invoke(C.source, req); expect(bad).toMatchObject({ ok: false }); expect(JSON.stringify(bad)).not.toContain(r.codeHash)
  })
  it('projects only allowed private status fields and strips even DomainError diagnostics', async () => {
    const f = await fixture(), admitted = value<SubmissionStatus>(await f.invoke(C.submit, submitRequest))
    const handle = vi.mocked(f.submit).mock.results[0].value
    const actual = handle.status()
    vi.mocked(handle.status).mockReturnValueOnce({ ...actual, Expected: 'PRIVATE_EXPECTED' } as never)
    expect(JSON.stringify(await f.invoke(C.status, admitted.reference))).not.toMatch(/PRIVATE_EXPECTED|Expected/)
    vi.mocked(handle.status).mockImplementationOnce(() => { throw new DomainError({ code: 'PROCESS_FAILED', message: 'PRIVATE_PATH', retryable: true, details: { sourceHash: 'raw' } }) })
    const failed = await f.invoke(C.status, admitted.reference); expect(failed).toMatchObject({ ok: false }); expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_PATH|sourceHash/)
  })
})

it('controlled real service → Judge → storage → IPC/preload survives lost ACK without replay or duplicate commit', async () => {
  const f = await fixture(true); let lost = true
  const bridge = createSubmissionBridge({ invoke: async (c, p) => {
    const result = await f.invoke(c, p)
    if (c === C.submit && lost) { lost = false; throw Error('lost ACK') }
    return result
  }, on() {}, removeListener() {} })
  expect((await bridge.submit(submitRequest)).ok).toBe(false)
  const handle = vi.mocked(f.submit).mock.results[0].value as SubmissionOperationHandle
  await handle.completion()
  const current = await bridge.current(); expect(current).toMatchObject({ ok: true, value: { storage: { state: 'saved' }, counts: { total: 7, passed: 7 } } })
  if (!current.ok || !current.value) throw Error('fixture')
  await bridge.retry(current.value.reference); expect(f.submit).toHaveBeenCalledTimes(1)
  expect(await bridge.completion({ exerciseId: 'ch2-04' })).toMatchObject({ ok: true, value: { state: 'COMPLETED' } })
  const page = await bridge.history({}); expect(page).toMatchObject({ ok: true, value: { total: 1 } })
  expect(JSON.stringify([current, page, f.sends])).not.toMatch(/PRIVATE_CONSOLE|PRIVATE_DIAGNOSTIC|expected|actual|signatureHash|officialHash|sourceHash/)
})
