/** @vitest-environment jsdom */
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useExerciseRuntime } from '../../src/renderer/src/features/learning/practice/use-exercise-runtime'
import type { ExerciseApi, ExerciseRunRequest, ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'

const request: ExerciseRunRequest = { exerciseId: 'ch2-01', language: 'csharp', code: 'captured', sourceRevision: 3 }
const snapshot = (sequence = 1, generation = 1): ExerciseSnapshot => ({ sessionId: `exercise_${String(generation).padStart(8, '0')}-1234-4234-8234-123456789abc`,
  generation, sequence, exerciseId: request.exerciseId, language: request.language, sourceRevision: request.sourceRevision,
  phase: 'execute', reason: null, stdout: '', stderr: '', cleanup: { state: 'NOT_STARTED', proof: 'PENDING', processClean: false, cleanupComplete: false, workspace: 'RETAINED', pendingIo: false } })
const final = (s = snapshot(5)): ExerciseSnapshot => ({ ...s, phase: 'finished', reason: 'COMPLETED', cleanup: {
  state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false,
} })
const fail = { ok: false as const, error: { code: 'PROCESS_FAILED' as const, message: 'C:\\private native pid=9 handle=secret', retryable: true } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function fixture(strict = false) {
  vi.useFakeTimers()
  const listeners = new Set<(s: ExerciseSnapshot) => void>(), removed = vi.fn()
  const api = {
    run: vi.fn<ExerciseApi['run']>().mockResolvedValue({ ok: true, value: snapshot() }),
    snapshot: vi.fn<ExerciseApi['snapshot']>().mockResolvedValue({ ok: true, value: snapshot() }),
    stop: vi.fn<ExerciseApi['stop']>().mockResolvedValue({ ok: true, value: final() }),
    onChanged: vi.fn<ExerciseApi['onChanged']>(listener => { listeners.add(listener); return () => { listeners.delete(listener); removed() } }),
  }
  const initialProps: { active: boolean; exerciseId?: string; language: ExerciseLanguage } = { active: true, exerciseId: request.exerciseId, language: request.language }
  const hook = renderHook(input => useExerciseRuntime(input, api), { initialProps,
    wrapper: strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined })
  const run = () => act(async () => { await hook.result.current.run(request) })
  const emit = (s: ExerciseSnapshot) => act(() => { for (const l of [...listeners]) l(s) })
  return { ...hook, api, listeners, removed, run, emit, initialProps }
}
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

it('is idle without a session and does not subscribe while Learning/exercise is inactive', () => {
  const f = fixture()
  expect(f.result.current.view.status).toBe('idle'); expect(f.listeners.size).toBe(1)
  f.rerender({ ...f.initialProps, active: false }); expect(f.listeners.size).toBe(0)
  expect(f.api.run).not.toHaveBeenCalled(); expect(f.api.stop).not.toHaveBeenCalled()
  f.rerender({ ...f.initialProps, exerciseId: undefined }); expect(f.listeners.size).toBe(0)
})

it('captures code/revision, prevents duplicate run admission and probes the Main-issued identity', async () => {
  const f = fixture(), pending = deferred<Awaited<ReturnType<ExerciseApi['run']>>>()
  f.api.run.mockReturnValueOnce(pending.promise)
  let first!: Promise<void>
  act(() => { first = f.result.current.run(request) })
  await act(async () => { await f.result.current.run({ ...request, code: 'other' }) })
  expect(f.api.run).toHaveBeenCalledOnce(); expect(f.result.current.view.busy).toBe(true)
  await act(async () => { pending.resolve({ ok: true, value: snapshot() }); await first })
  expect(f.api.run).toHaveBeenCalledWith(request)
  expect(f.api.snapshot).toHaveBeenCalledWith({ sessionId: snapshot().sessionId, generation: 1 })
  expect(f.result.current.view.status).toBe('running')
})

it('ignores unsolicited, wrong session/generation/revision/language/exercise and old or duplicate sequences', async () => {
  const f = fixture()
  f.emit(snapshot(100)); expect(f.result.current.view.status).toBe('idle')
  await f.run()
  for (const s of [snapshot(2, 2), { ...snapshot(3), exerciseId: 'ch2-02' }, { ...snapshot(3), language: 'javascript' as const },
    { ...snapshot(3), sourceRevision: 4 }, snapshot(0), { ...snapshot(4), pid: 123 }]) f.emit(s)
  expect(f.result.current.view.snapshot?.sequence).toBe(1)
  f.emit({ ...snapshot(3), stdout: 'current' }); f.emit({ ...snapshot(3), stdout: 'duplicate' }); f.emit(snapshot(2))
  expect(f.result.current.view.snapshot?.stdout).toBe('current')
})

it('fetches snapshot after admission to recover an event that preceded its invoke reply', async () => {
  const f = fixture(), pending = deferred<Awaited<ReturnType<ExerciseApi['run']>>>()
  f.api.run.mockReturnValueOnce(pending.promise); f.api.snapshot.mockResolvedValueOnce({ ok: true, value: final() })
  let first!: Promise<void>; act(() => { first = f.result.current.run(request) })
  f.emit(final())
  await act(async () => { pending.resolve({ ok: true, value: snapshot() }); await first })
  expect(f.result.current.view.status).toBe('finished'); expect(f.result.current.view.busy).toBe(false)
  expect(f.api.stop).not.toHaveBeenCalled()
})

it.each(['exercise', 'language'] as const)('cancels a known session on %s change and never renders the old result', async change => {
  const f = fixture(); await f.run(); const callback = [...f.listeners][0]
  f.rerender({ ...f.initialProps, ...(change === 'exercise' ? { exerciseId: 'ch2-02' } : { language: 'javascript' as const }) })
  expect(f.api.stop).toHaveBeenCalledWith({ sessionId: snapshot().sessionId, generation: 1, reason: 'CONTEXT_CHANGED' })
  act(() => callback(final()))
  expect(f.result.current.view.status).toBe('idle'); expect(f.listeners.size).toBe(1)
})

it.each(['leave', 'unmount', 'pagehide'] as const)('cancels and unsubscribes on %s with no state updates from late work', async mode => {
  const f = fixture(); await f.run(); const callback = [...f.listeners][0]
  if (mode === 'leave') f.rerender({ ...f.initialProps, active: false })
  else if (mode === 'unmount') f.unmount()
  else act(() => window.dispatchEvent(new Event('pagehide')))
  expect(f.api.stop).toHaveBeenCalledWith({ sessionId: snapshot().sessionId, generation: 1, reason: 'LEARNING_LEFT' })
  expect(f.listeners.size).toBe(0)
  act(() => callback(final()))
  if (mode === 'leave') expect(f.result.current.view.status).toBe('idle')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(f.api.snapshot).toHaveBeenCalledOnce()
})

it('retires an admission still pending at unmount, then stops exactly the late Main-issued session', async () => {
  const f = fixture(), pending = deferred<Awaited<ReturnType<ExerciseApi['run']>>>()
  f.api.run.mockReturnValueOnce(pending.promise)
  let first!: Promise<void>; act(() => { first = f.result.current.run(request) })
  f.unmount(); expect(f.api.stop).not.toHaveBeenCalled()
  await act(async () => { pending.resolve({ ok: true, value: snapshot() }); await first })
  expect(f.api.stop).toHaveBeenCalledOnce()
  expect(f.api.stop).toHaveBeenCalledWith({ sessionId: snapshot().sessionId, generation: 1, reason: 'LEARNING_LEFT' })
  expect(f.api.snapshot).not.toHaveBeenCalled()
})

it('does not let an old pending admission overwrite a fresh context that has its own Main session', async () => {
  const f = fixture(), pending = deferred<Awaited<ReturnType<ExerciseApi['run']>>>()
  f.api.run.mockReturnValueOnce(pending.promise)
  let first!: Promise<void>; act(() => { first = f.result.current.run(request) })
  f.rerender({ ...f.initialProps, language: 'javascript' })
  const next = { ...snapshot(1, 2), language: 'javascript' as const }
  f.api.run.mockResolvedValueOnce({ ok: true, value: next }); f.api.snapshot.mockResolvedValue({ ok: true, value: next })
  await act(async () => { await f.result.current.run({ ...request, language: 'javascript' }) })
  await act(async () => { pending.resolve({ ok: true, value: snapshot() }); await first })
  expect(f.result.current.view.snapshot?.generation).toBe(2)
  expect(f.api.stop).toHaveBeenCalledWith({ sessionId: snapshot().sessionId, generation: 1, reason: 'CONTEXT_CHANGED' })
})

it('keeps exactly one subscription across rerenders and StrictMode replay, then removes every listener', async () => {
  const f = fixture(true); expect(f.listeners.size).toBe(1)
  f.rerender({ ...f.initialProps }); expect(f.listeners.size).toBe(1)
  await f.run(); f.unmount()
  expect(f.listeners.size).toBe(0); expect(f.removed).toHaveBeenCalledTimes(f.api.onChanged.mock.calls.length)
  expect(f.api.stop).toHaveBeenCalledOnce()
})

it('shows UNSUPPORTED and safe errors without rendering backend/native details or claiming success', async () => {
  const f = fixture()
  f.api.run.mockResolvedValueOnce({ ...fail, error: { ...fail.error, code: 'UNSUPPORTED' } })
  await f.run(); expect(f.result.current.view.status).toBe('unsupported')
  expect(f.result.current.view.message).toContain('chưa có backend'); expect(f.result.current.view.snapshot).toBeUndefined()
  f.api.run.mockRejectedValueOnce(new Error('native path secret'))
  await f.run(); expect(f.result.current.view.status).toBe('error')
  expect(JSON.stringify(f.result.current.view)).not.toMatch(/private|native|secret|handle|pid=/)
})

it('shows retained pending/failed cleanup without false completion and polls without overlapping I/O', async () => {
  const f = fixture(); await f.run()
  const pending: ExerciseSnapshot = { ...snapshot(2), phase: 'cleanup', reason: 'EXECUTE_TIMEOUT', cleanup: {
    state: 'FAILED', proof: 'PROCESS_UNRESOLVED', processClean: false, cleanupComplete: false, workspace: 'RETAINED', pendingIo: true,
  } }
  f.emit(pending); expect(f.result.current.view.status).toBe('cleanup-pending'); expect(f.result.current.view.busy).toBe(true)
  const io = deferred<Awaited<ReturnType<ExerciseApi['snapshot']>>>()
  f.api.snapshot.mockReturnValueOnce(io.promise)
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(f.api.snapshot).toHaveBeenCalledTimes(2)
  await act(async () => { io.resolve({ ok: true, value: { ...final(), reason: 'EXECUTE_TIMEOUT' } }) })
  expect(f.result.current.view.busy).toBe(false); expect(f.result.current.view.message).toContain('vượt thời gian')
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) }); expect(f.api.snapshot).toHaveBeenCalledTimes(2)
})

it('does not claim cleanup success when owner/snapshot authorization is lost', async () => {
  const f = fixture(); f.api.snapshot.mockResolvedValueOnce({ ...fail, error: { ...fail.error, code: 'PERMISSION_DENIED' } })
  await f.run()
  expect(f.result.current.view.status).toBe('error'); expect(f.result.current.view.busy).toBe(true)
  expect(f.result.current.view.message).toContain('chưa được xác nhận thu hồi')
  expect(JSON.stringify(f.result.current.view)).not.toContain('private')
  f.unmount(); expect(f.api.stop).toHaveBeenCalledOnce()
})

it('preserves quarantine flags and distinguishes cancellation from execution completion', async () => {
  const f = fixture(); await f.run()
  f.emit({ ...final(), cleanup: { state: 'FINALIZED', proof: 'HISTORY_UNVERIFIED', processClean: false, cleanupComplete: false,
    workspace: 'QUARANTINED', pendingIo: false } })
  expect(f.result.current.view.message).toContain('cách ly'); expect(f.result.current.view.snapshot?.cleanup.processClean).toBe(false)
  f.api.run.mockResolvedValueOnce({ ok: true, value: snapshot(1, 2) }); f.api.snapshot.mockResolvedValueOnce({ ok: true, value: snapshot(1, 2) })
  await f.run(); f.emit({ ...final(snapshot(5, 2)), reason: 'OWNER_LOST' })
  expect(f.result.current.view.status).toBe('cancelled'); expect(f.result.current.view.busy).toBe(false)
})

it('ignores a late snapshot probe after unmount and does not send stop twice', async () => {
  const f = fixture(), io = deferred<Awaited<ReturnType<ExerciseApi['snapshot']>>>()
  f.api.snapshot.mockReturnValueOnce(io.promise); await f.run(); f.unmount()
  await act(async () => { io.resolve({ ok: true, value: final() }) })
  expect(f.api.stop).toHaveBeenCalledOnce(); expect(f.listeners.size).toBe(0)
})

it('rejects a reused generation returned for a new attempt instead of showing an earlier Run again', async () => {
  const f = fixture(); await f.run(); f.emit(final())
  expect(f.result.current.view.busy).toBe(false)
  await f.run()
  expect(f.result.current.view.status).toBe('error')
  expect(f.result.current.view.message).toBe('Không thể xác nhận phiên thực thi.')
  expect(f.result.current.view.snapshot).toBeUndefined()
})
