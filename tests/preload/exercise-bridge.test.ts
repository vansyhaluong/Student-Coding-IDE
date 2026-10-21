import { expect, it, vi } from 'vitest'
import { createExerciseBridge } from '../../src/preload/bridge/exercise'
import { EXERCISE_CHANNELS, EXERCISE_LIMITS, type ExerciseSnapshot } from '../../src/shared/contracts/exercise'

const request = { exerciseId: 'ch2-01', language: 'javascript' as const, code: 'source', sourceRevision: 4 }
const snapshot = (generation = 1, sequence = 0): ExerciseSnapshot => ({
  sessionId: `exercise_${String(generation).padStart(8, '0')}-1234-4234-8234-123456789abc`, generation, sequence,
  exerciseId: request.exerciseId, language: request.language, sourceRevision: 4, phase: 'execute', reason: null,
  stdout: '', stderr: '', cleanup: { state: 'NOT_STARTED', proof: 'PENDING', processClean: false,
    cleanupComplete: false, workspace: 'RETAINED', pendingIo: false },
})
const ref = (s: ExerciseSnapshot) => ({ sessionId: s.sessionId, generation: s.generation })
function fixture() {
  const listeners = new Set<(_event: unknown, v: unknown) => void>(), unload = new Set<() => void>()
  const invoke = vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(async () => ({ ok: true, value: snapshot() }))
  const on = vi.fn((_c, l) => { listeners.add(l) })
  const removeListener = vi.fn((_c, l) => { listeners.delete(l) })
  const bridge = createExerciseBridge({ invoke, on, removeListener }, {
    addEventListener: (_e, l) => { unload.add(l) }, removeEventListener: (_e, l) => { unload.delete(l) },
  })
  return { bridge, invoke, on, removeListener, listeners, unload, emit: (v: unknown) => [...listeners].forEach(l => l({}, v)) }
}

it('exposes only the four semantic methods and explicitly declared channels', async () => {
  const f = fixture()
  expect(Object.keys(f.bridge).sort()).toEqual(['onChanged', 'run', 'snapshot', 'stop'])
  await f.bridge.run(request); await f.bridge.snapshot(ref(snapshot()))
  f.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: 'safe', retryable: true } })
  await f.bridge.stop({ ...ref(snapshot()), reason: 'LEARNING_LEFT' })
  expect(f.invoke.mock.calls.map(c => c[0])).toEqual([EXERCISE_CHANNELS.run, EXERCISE_CHANNELS.snapshot, EXERCISE_CHANNELS.stop])
})

it('validates all requests locally and rejects arbitrary ownership/native/path authority', async () => {
  const f = fixture()
  for (const v of [null, {}, { ...request, owner: 2 }, { ...request, command: 'x' }, { ...request, code: 'x'.repeat(262145) }]) {
    expect((await f.bridge.run(v as never)).ok).toBe(false)
  }
  for (const v of [{ ...ref(snapshot()), pid: 3 }, { sessionId: 'x', generation: 1 }]) expect((await f.bridge.snapshot(v as never)).ok).toBe(false)
  expect((await f.bridge.stop({ ...ref(snapshot()), reason: 'SHUTDOWN' } as never)).ok).toBe(false)
  expect(f.invoke).not.toHaveBeenCalled()
})

it('validates response shape, combined UTF-8 cap and normalizes transport rejection', async () => {
  const f = fixture()
  for (const value of [{ ...snapshot(), nativeHandle: 'secret' }, { ...snapshot(), stdout: 'é'.repeat(EXERCISE_LIMITS.outputBytes / 2), stderr: 'x' },
    { ...snapshot(), cleanup: { ...snapshot().cleanup, processClean: true } }]) {
    f.invoke.mockResolvedValueOnce({ ok: true, value })
    expect(await f.bridge.run(request)).toMatchObject({ ok: false, error: { details: { boundaryFailure: 'response-validation' } } })
  }
  f.invoke.mockRejectedValueOnce(new Error('raw transport secret'))
  const result = await f.bridge.run(request)
  expect(result).toMatchObject({ ok: false, error: { details: { boundaryFailure: 'transport' } } })
  expect(JSON.stringify(result)).not.toContain('secret')
})

it('does not trust unsolicited identities; drops wrong session/generation, malformed and non-increasing events', async () => {
  const f = fixture(), listener = vi.fn()
  f.bridge.onChanged(listener)
  f.emit(snapshot(20, 100)); expect(listener).not.toHaveBeenCalled()
  await f.bridge.run(request)
  for (const v of [null, snapshot(2, 2), { ...snapshot(1, 2), sessionId: snapshot(2).sessionId }, snapshot(1, 0), { ...snapshot(1, 1), pid: 10 }]) f.emit(v)
  expect(listener).not.toHaveBeenCalled()
  f.emit(snapshot(1, 2)); f.emit(snapshot(1, 2)); f.emit(snapshot(1, 1))
  expect(listener).toHaveBeenCalledOnce(); expect(listener).toHaveBeenCalledWith(snapshot(1, 2))
})

it('uses one transport listener, isolates subscribers and supports idempotent independent unsubscribe', async () => {
  const f = fixture(), listener = vi.fn()
  const removeBad = f.bridge.onChanged(s => { s.stdout = 'mutation'; throw Error('consumer') })
  const first = f.bridge.onChanged(listener), second = f.bridge.onChanged(listener)
  expect(f.on).toHaveBeenCalledOnce()
  await f.bridge.run(request); f.emit(snapshot(1, 1))
  expect(listener).toHaveBeenCalledTimes(2); expect(listener.mock.calls[0][0].stdout).toBe('')
  first(); first(); f.emit(snapshot(1, 2)); expect(listener).toHaveBeenCalledTimes(3)
  removeBad(); second(); expect(f.removeListener).toHaveBeenCalledOnce(); expect(f.listeners.size).toBe(0)
  const late = f.on.mock.calls[0][1]; late({}, snapshot(1, 3)); expect(listener).toHaveBeenCalledTimes(3)
})

it('disposes subscription and in-flight results on unload; a reload starts with no trusted session', async () => {
  const f = fixture(), listener = vi.fn()
  const remove = f.bridge.onChanged(listener); await f.bridge.run(request)
  const callback = f.on.mock.calls[0][1]
  for (const unload of [...f.unload]) unload()
  remove(); callback({}, snapshot(1, 1)); f.emit(snapshot(1, 2))
  expect(listener).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0); expect(f.unload.size).toBe(0)
  expect((await f.bridge.run(request)).ok).toBe(false)
  f.bridge.onChanged(listener); expect(f.listeners.size).toBe(0)
  const reload = fixture(); reload.bridge.onChanged(listener); reload.emit(snapshot(1, 3)); expect(listener).not.toHaveBeenCalled()
})

it('binds an event beating the run reply only after the reply proves its session identity', async () => {
  const f = fixture(), listener = vi.fn()
  f.bridge.onChanged(listener)
  let resolve!: (v: unknown) => void
  f.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const pending = f.bridge.run(request)
  f.emit(snapshot(1, 2)); expect(listener).not.toHaveBeenCalled()
  resolve({ ok: true, value: snapshot() }); expect((await pending).ok).toBe(true)
  expect(listener).toHaveBeenCalledWith(snapshot(1, 2))
})

it('rejects late replies from an earlier generation and mismatched snapshot responses', async () => {
  const f = fixture()
  await f.bridge.run(request)
  let resolve!: (v: unknown) => void
  f.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const old = f.bridge.snapshot(ref(snapshot()))
  f.invoke.mockResolvedValueOnce({ ok: true, value: snapshot(2) }); await f.bridge.run(request)
  resolve({ ok: true, value: snapshot(1, 10) }); expect((await old).ok).toBe(false)
  f.invoke.mockResolvedValueOnce({ ok: true, value: snapshot(3) })
  expect((await f.bridge.snapshot(ref(snapshot(2)))).ok).toBe(false)
})

it('retires stop events immediately and never reactivates a cancelled generation from a late snapshot reply', async () => {
  const f = fixture(), listener = vi.fn()
  f.bridge.onChanged(listener); await f.bridge.run(request)
  let resolve!: (v: unknown) => void
  f.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const old = f.bridge.snapshot(ref(snapshot()))
  f.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: 'cleanup pending', retryable: true } })
  await f.bridge.stop({ ...ref(snapshot()), reason: 'LEARNING_LEFT' })
  f.emit(snapshot(1, 2)); expect(listener).not.toHaveBeenCalled()
  resolve({ ok: true, value: snapshot(1, 3) }); expect((await old).ok).toBe(false)
})
