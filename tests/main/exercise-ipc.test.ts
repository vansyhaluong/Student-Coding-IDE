import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { ExerciseService } from '../../src/main/services/learning/exercise-service'
import type { ExerciseRuntimeAdapter, ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { IpcHandlerRegistry, type IpcMainLike, type IpcRequestContext } from '../../src/main/ipc/ipc-handler-registry'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { DomainError } from '../../src/main/errors/app-error'
import { EXERCISE_CHANNELS, EXERCISE_LIMITS, type ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import { createExerciseBridge } from '../../src/preload/bridge/exercise'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { DesktopApplication } from '../../src/main/app/desktop-application'

class Owner extends EventEmitter { constructor(readonly id: number) { super() } isDestroyed() { return false } }
const request = { exerciseId: 'ch2-01', language: 'javascript' as const, code: 'source', sourceRevision: 4 }
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const roots: string[] = [], stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
  vi.useRealTimers()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('exercise-ipc-')) throw Error('Unsafe cleanup')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(options: { unsupported?: boolean; run?: (phase: string, context: ExercisePhaseContext) => Promise<void> } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exercise-ipc-')); roots.push(root)
  const owner = new Owner(1), other = new Owner(2)
  const frame = { processId: 10, frameToken: 'current', detached: false, isDestroyed: () => false }
  let currentFrame = frame
  const context: IpcRequestContext = { senderId: 1, senderFrame: frame }
  const held = new Set<string>(), changed = vi.fn()
  const adapter: ExerciseRuntimeAdapter = {
    runPhase: vi.fn(options.run ?? (async () => {})), terminate: vi.fn(async () => {}), settleObservers: vi.fn(async () => {}),
    evidence: vi.fn(async () => ({ members: [], activeProcesses: 0, totalProcesses: 0, retained: [], coverageComplete: true, observerSettled: true, unresolvedErrors: false })),
    release: vi.fn(async () => {}), closeHandles: vi.fn(async () => {}),
  }
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  const service = new ExerciseService({ root, leases: { acquire: async id => {
    held.add(id); return { release: async () => { held.delete(id) } }
  } }, clock: { now: () => Date.now(), schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } },
  createExecution: options.unsupported ? undefined : () => ({ adapter, phases: ['execute'] }),
  onSnapshot: (id, s) => ipc.publish(id, s) })
  const authorize = vi.fn((c: IpcRequestContext) => {
    if (c.senderId !== 1 && c.senderId !== 2 || !c.senderFrame || c.senderFrame !== currentFrame
      || c.senderFrame.detached || c.senderFrame.isDestroyed()) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'C:\\private raw authorization', retryable: false })
  })
  const ipc = new ExerciseIpcService(registry, service, authorize, (c, s) => { changed(c, s); listeners.forEach(l => l({}, s)) })
  const listeners = new Set<Parameters<IpcRendererLike['on']>[1]>()
  const invoke = (c: string, payload: unknown, ctx = context) => handlers.get(c)!({ sender: { id: ctx.senderId }, senderFrame: ctx.senderFrame }, payload)
  const bridge = createExerciseBridge({ invoke, on: (_c, l) => { listeners.add(l) }, removeListener: (_c, l) => { listeners.delete(l) } })
  service.start(); await service.ready(); service.observe(owner); service.observe(other); ipc.observe(owner); ipc.observe(other); ipc.start()
  stops.push(async () => { ipc.stop(); await service.stop() })
  const run = async () => {
    const result = await bridge.run(request)
    if (!result.ok) throw Error(JSON.stringify(result))
    const ref = { sessionId: result.value.sessionId, generation: result.value.generation }
    return { snapshot: result.value, ref, completion: service.completion(1, ref) }
  }
  return { service, ipc, handlers, bridge, invoke, context, frame, owner, other, held, changed, adapter, authorize, run,
    replaceFrame: () => { currentFrame = { ...frame, frameToken: 'replacement' }; return currentFrame } }
}

it('registers only declared channels, validates malformed input and never accepts privileged fields', async () => {
  const f = await fixture({ unsupported: true })
  expect([...f.handlers.keys()].sort()).toEqual([EXERCISE_CHANNELS.run, EXERCISE_CHANNELS.snapshot, EXERCISE_CHANNELS.stop].sort())
  for (const v of [null, [], {}, { ...request, language: 'python' }, { ...request, sourceRevision: -1 },
    ...['owner', 'generation', 'path', 'command', 'pid', 'jobHandle', 'nativeOptions'].map(key => ({ ...request, [key]: 'spoof' }))]) {
    expect(await f.invoke(EXERCISE_CHANNELS.run, v)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  }
  expect(f.authorize).not.toHaveBeenCalled()
  for (const language of ['csharp', 'javascript']) expect(await f.bridge.run({ ...request, language } as never)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } })
  expect(f.service.status().active).toBe(false)
  f.ipc.stop(); expect(f.handlers.size).toBe(0)
})

it('rejects untrusted/detached/subframe/unknown sender metadata and sanitizes authorization errors', async () => {
  const f = await fixture()
  for (const ctx of [{ senderId: 90, senderFrame: f.frame }, { senderId: 1 },
    { senderId: 1, senderFrame: { ...f.frame, detached: true } }, { senderId: 1, senderFrame: { ...f.frame, frameToken: 'subframe' } }]) {
    const result = await f.invoke(EXERCISE_CHANNELS.run, request, ctx)
    expect(result).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(JSON.stringify(result)).not.toContain('private')
  }
  expect(f.service.status().active).toBe(false)
})

it('derives ownership from sender, rejects stale references and enforces singleton admission', async () => {
  const entered = gate(), done = gate()
  const f = await fixture({ run: async p => { if (p === 'execute') { entered.resolve(); await done.promise } } })
  const op = await f.run(); await entered.promise
  for (const ref of [{ ...op.ref, generation: op.ref.generation + 1 }, { ...op.ref, sessionId: 'bad' }]) {
    expect(await f.invoke(EXERCISE_CHANNELS.snapshot, ref)).toMatchObject({ ok: false })
    expect(await f.invoke(EXERCISE_CHANNELS.stop, { ...ref, reason: 'LEARNING_LEFT' })).toMatchObject({ ok: false })
  }
  expect(await f.invoke(EXERCISE_CHANNELS.snapshot, op.ref, { ...f.context, senderId: 2 })).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  expect(await f.invoke(EXERCISE_CHANNELS.run, request, { ...f.context, senderId: 2 })).toMatchObject({ ok: false })
  expect(await f.invoke(EXERCISE_CHANNELS.stop, { ...op.ref, reason: 'SHUTDOWN' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  done.resolve(); await op.completion
})

it('publishes only the current owner/session/generation and increasing sequence; navigation revokes events', async () => {
  const entered = gate(), done = gate()
  const f = await fixture({ run: async p => { if (p === 'execute') { entered.resolve(); await done.promise } } })
  const listener = vi.fn(); f.bridge.onChanged(listener)
  const op = await f.run(); await entered.promise
  const current = f.service.snapshot(1, op.ref)
  // Legitimate phase-settlement events can precede this manual routing probe.
  f.changed.mockClear()
  listener.mockClear()
  f.ipc.publish(2, current); expect(f.changed).not.toHaveBeenCalled()
  f.ipc.publish(1, { ...current, generation: 100 }); expect(f.changed).not.toHaveBeenCalled()
  f.ipc.publish(1, { ...current, sequence: current.sequence + 100 }); expect(f.changed).not.toHaveBeenCalled()
  f.ipc.publish(1, current); expect(f.changed).toHaveBeenCalledOnce()
  f.ipc.publish(1, current); expect(f.changed).toHaveBeenCalledOnce()
  f.owner.emit('did-start-navigation', {}, 'new', false, true); f.replaceFrame()
  const completion = op.completion.catch(() => {})
  f.ipc.publish(1, { ...current, sequence: current.sequence + 1 }); expect(f.changed).toHaveBeenCalledOnce()
  done.resolve(); await completion; await f.service.retryCleanup()
  expect(listener).toHaveBeenCalledOnce()
})

it('caps combined UTF-8 output, cancels and completes Policy B cleanup through IPC snapshots', async () => {
  const f = await fixture({ run: async (p, c) => {
    if (p === 'execute') { c.output('stdout', 'é'.repeat(EXERCISE_LIMITS.outputBytes / 2)); c.output('stderr', 'x') }
  } })
  const op = await f.run(); const final = await op.completion
  const result = await f.bridge.snapshot(op.ref)
  expect(result).toMatchObject({ ok: true, value: { reason: 'OUTPUT_LIMIT', cleanup: { cleanupComplete: true } } })
  expect(Buffer.byteLength(final.stdout) + Buffer.byteLength(final.stderr)).toBe(EXERCISE_LIMITS.outputBytes)
  expect(f.adapter.terminate).toHaveBeenCalledWith('OUTPUT_LIMIT'); expect(f.held.size).toBe(0)
})

it('rejects unsafe outbound snapshots and strips raw native/DomainError details', async () => {
  const f = await fixture()
  vi.spyOn(f.service, 'run').mockImplementationOnce(() => { throw new DomainError({ code: 'PROCESS_FAILED', message: 'C:\\secret native stack', details: { pid: 123, handle: 'private' }, retryable: true }) })
  const failed = await f.bridge.run(request)
  expect(failed).toMatchObject({ ok: false, error: { code: 'PROCESS_FAILED' } })
  expect(JSON.stringify(failed)).not.toMatch(/secret|native|stack|pid|handle|private/)
  vi.spyOn(f.service, 'snapshot').mockReturnValue({ absolutePath: 'C:\\secret' } as unknown as ExerciseSnapshot)
  expect(await f.invoke(EXERCISE_CHANNELS.snapshot, { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1 })).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
})

it('cancels only the authorized session, returns actual cleanup and suppresses retired events', async () => {
  const entered = gate()
  const f = await fixture({ run: async (p, c) => { if (p === 'execute') { entered.resolve(); await new Promise<void>(r => c.signal.addEventListener('abort', () => r(), { once: true })) } } })
  const op = await f.run(); await entered.promise
  const completion = op.completion.catch(() => {})
  const result = await f.bridge.stop({ ...op.ref, reason: 'CONTEXT_CHANGED' })
  expect(result).toMatchObject({ ok: true, value: { reason: 'CONTEXT_CHANGED', cleanup: { cleanupComplete: true } } })
  await completion
  expect(f.held.size).toBe(0)
  expect(await f.bridge.snapshot(op.ref)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
})

it('retains pending cleanup after the IPC caller deadline, seals STOPPING and retries before Window/Project/Terminal teardown', async () => {
  const entered = gate(), io = gate()
  const f = await fixture({ run: async (p, c) => { if (p === 'execute') { entered.resolve(); await new Promise<void>(r => c.signal.addEventListener('abort', () => r(), { once: true })) } } })
  const op = await f.run(); await entered.promise
  const completion = op.completion.catch(() => {})
  vi.useFakeTimers()
  vi.mocked(f.adapter.settleObservers).mockImplementation(() => io.promise)
  const pending = f.bridge.stop({ ...op.ref, reason: 'LEARNING_LEFT' })
  await vi.advanceTimersByTimeAsync(EXERCISE_LIMITS.cleanupWaitMs)
  expect(await pending).toMatchObject({ ok: false, error: { code: 'PROCESS_FAILED' } })
  expect(f.held.size).toBe(1); expect(f.service.status().active).toBe(true)
  const order: string[] = []
  const window = { name: 'Window', stop: () => { order.push('window') } }
  const desktop = new DesktopApplication([{ name: 'ProjectRun', stop: () => { order.push('run') } },
    { name: 'Terminal', stop: () => { order.push('terminal') } },
    { name: 'Learning', stop: () => f.service.stop() }, f.ipc, window], { shutdownLast: [window] })
  // IPC is already started by fixture; avoid duplicate registration in Desktop start.
  vi.spyOn(f.ipc, 'start').mockImplementation(() => {})
  desktop.subscribe(s => { if (s.state === 'STOPPING') { f.service.beginShutdown(); f.ipc.beginShutdown() } })
  await desktop.start()
  const failed = desktop.shutdown(); const rejected = expect(failed).rejects.toThrow()
  expect(f.service.status().state).toBe('STOPPING')
  await vi.advanceTimersByTimeAsync(EXERCISE_LIMITS.cleanupWaitMs); await rejected
  expect(order).toEqual([]); expect(f.held.size).toBe(1)
  io.resolve(); await desktop.shutdown(); await completion
  expect(order).toEqual(['terminal', 'run', 'window'])
  expect(f.adapter.release).toHaveBeenCalledOnce(); expect(f.adapter.closeHandles).toHaveBeenCalledOnce()
  expect(f.held.size).toBe(0); expect(f.handlers.size).toBe(0)
})

it('rejects late cancellation replies after a document change even when Electron frame token is unchanged', async () => {
  const entered = gate(), io = gate()
  const f = await fixture({ run: async (p, c) => { if (p === 'execute') { entered.resolve(); await new Promise<void>(r => c.signal.addEventListener('abort', () => r(), { once: true })) } } })
  const op = await f.run(); await entered.promise
  const completion = op.completion.catch(() => {})
  vi.mocked(f.adapter.settleObservers).mockImplementation(() => { entered.resolve(); return io.promise })
  const pending = f.bridge.stop({ ...op.ref, reason: 'LEARNING_LEFT' })
  f.owner.emit('did-start-navigation', {}, 'new', false, true)
  f.owner.emit('did-finish-load'); io.resolve()
  expect(await pending).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } }); await completion
  expect(f.held.size).toBe(0)
})

it('removes owner subscriptions on destroy and managed stop without leaking across reload', async () => {
  const f = await fixture()
  expect(f.owner.listenerCount('did-start-navigation')).toBe(2) // Core service and IPC transport ownership.
  f.owner.emit('render-process-gone'); f.owner.emit('did-finish-load')
  f.owner.emit('destroyed')
  expect(f.owner.listenerCount('did-start-navigation')).toBe(0)
  expect(await f.invoke(EXERCISE_CHANNELS.run, request)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  f.ipc.stop(); await f.service.stop()
  expect(f.other.listenerCount('did-start-navigation')).toBe(0)
  expect(f.other.listenerCount('destroyed')).toBe(0)
})

it('rejects an invoke result retired by concurrent context cancellation before the response crosses IPC', async () => {
  const f = await fixture(), run = f.service.run.bind(f.service)
  vi.spyOn(f.service, 'run').mockImplementationOnce((owner, request) => {
    const admitted = run(owner, request)
    f.service.invalidate(owner, 'CONTEXT_CHANGED')
    return admitted
  })
  expect(await f.bridge.run(request)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  await f.service.retryCleanup()
})
