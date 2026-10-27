/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppResult, StudentIdeApi } from '../../src/shared/contracts'
import type { SubmissionApi, SubmissionSource, SubmissionStores } from '../../src/shared/contracts/submission'
import type { HistoryRow } from '../../src/renderer/src/features/learning/practice/use-submission-history'
import { useSubmissionSource } from '../../src/renderer/src/features/learning/practice/use-submission-source'
import { SubmissionDetails } from '../../src/renderer/src/features/learning/practice/SubmissionDetails'

const viewer = vi.hoisted(() => ({ props: undefined as unknown }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({}))
vi.mock('@monaco-editor/react', () => ({ default: (props: { value: string; options: { readOnly: boolean; domReadOnly: boolean } }) => {
  viewer.props = props
  return <textarea aria-label="Source đã lưu (chỉ đọc)" value={props.value} readOnly={props.options.readOnly && props.options.domReadOnly} />
} }))
const bytes = (s: string) => new TextEncoder().encode(s).byteLength
const source = '// Việt Ω 😀\r\nreturn 1;'
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
const healthy: SubmissionStores = { ACCEPTED: { state: 'MISSING', readable: true }, FAILED: { state: 'AVAILABLE', readable: true } }
const pending: SubmissionStores = { ACCEPTED: { state: 'RECOVERY_PENDING', readable: false }, FAILED: { state: 'RECOVERY_PENDING', readable: false } }
const row = (code = source, changes: Partial<HistoryRow> = {}): HistoryRow => ({
  key: { storeKind: 'FAILED', recordId: id(1) }, submissionId: id(1), exerciseId: 'ch2-04', language: 'csharp',
  verdict: 'WrongAnswer', submittedAt: '2026-10-27T00:00:00.000Z', source: { reference: 'opaque_source_1', revision: 7, byteLength: bytes(code) }, ...changes,
})
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
type Chunk = Extract<SubmissionSource, { ok: true }>
const chunk = (r = row(), code = source, changes: Partial<Chunk> = {}): Chunk => ({
  ok: true, stores: healthy, reference: r.source.reference, key: r.key, submissionId: r.submissionId,
  sourceRevision: r.source.revision, offset: 0, nextOffset: bytes(code), totalBytes: r.source.byteLength, eof: bytes(code) === r.source.byteLength, code, ...changes,
})
const unavailable = (stores = pending): AppResult<SubmissionSource> => ok({ ok: false, reason: 'UNAVAILABLE', stores })
function apiFixture(r = row(), code = source) {
  return {
    source: vi.fn<SubmissionApi['source']>().mockResolvedValue(ok(chunk(r, code))),
    history: vi.fn<SubmissionApi['history']>(), completion: vi.fn<SubmissionApi['completion']>(),
    submit: vi.fn<SubmissionApi['submit']>(), status: vi.fn<SubmissionApi['status']>(), current: vi.fn<SubmissionApi['current']>(),
    retry: vi.fn<SubmissionApi['retry']>(), context: vi.fn<SubmissionApi['context']>(), onChanged: vi.fn(() => vi.fn()),
  }
}
function fixture(api = apiFixture(), selection = row()) {
  const initialProps = { row: selection, active: true }
  const hook = renderHook(p => useSubmissionSource(p.row, p.active, api), { initialProps })
  return { ...hook, api, initialProps }
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function flush() { await act(async () => {}) }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
beforeEach(() => { vi.useFakeTimers(); viewer.props = undefined })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('keeps loading, waits exactly 50ms then 150ms, and succeeds on the second additional attempt', async () => {
  const api = apiFixture(); api.source.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable())
  const f = fixture(api); await flush()
  expect(f.result.current.view).toMatchObject({ phase: 'loading', loadedBytes: 0 })
  expect(f.result.current.view.code).toBeUndefined(); expect(f.result.current.view.error).toBeUndefined()
  await advance(49); expect(api.source).toHaveBeenCalledTimes(1)
  await advance(1); expect(api.source).toHaveBeenCalledTimes(2)
  expect(f.result.current.view.phase).toBe('loading')
  await advance(149); expect(api.source).toHaveBeenCalledTimes(2)
  await advance(1); expect(api.source).toHaveBeenCalledTimes(3)
  expect(f.result.current.view).toMatchObject({ phase: 'ready', code: source, loadedBytes: bytes(source) })
  expect(api.source.mock.calls.map(([r]) => r)).toEqual(Array.from({ length: 3 }, () => ({ reference: row().source.reference, offset: 0, limit: 32768 })))
  expect(api.submit).not.toHaveBeenCalled(); expect(api.completion).not.toHaveBeenCalled(); expect(api.retry).not.toHaveBeenCalled()
})

it('recovers when only the target store is pending and the other store is readable', async () => {
  const api = apiFixture(); api.source.mockResolvedValueOnce(unavailable({ ACCEPTED: healthy.ACCEPTED, FAILED: pending.FAILED }))
  const f = fixture(api); await flush(); await advance(50)
  expect(f.result.current.view.code).toBe(source); expect(api.source).toHaveBeenCalledTimes(2)
})

it('exhausts two additional attempts without a fourth request; manual retry starts a fresh read budget', async () => {
  const api = apiFixture(); api.source.mockResolvedValue(unavailable())
  const f = fixture(api); await flush(); await advance(200)
  expect(api.source).toHaveBeenCalledTimes(3); expect(f.result.current.view.phase).toBe('error')
  expect(f.result.current.view.code).toBeUndefined(); await advance(10000); expect(api.source).toHaveBeenCalledTimes(3)
  api.source.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok(chunk()))
  await act(async () => f.result.current.retry()); expect(f.result.current.view.phase).toBe('loading')
  await advance(49); expect(api.source).toHaveBeenCalledTimes(4)
  await advance(1); expect(api.source).toHaveBeenCalledTimes(5); expect(f.result.current.view.code).toBe(source)
  expect(api.source.mock.calls.every(([r]) => r.offset === 0 && r.reference === row().source.reference)).toBe(true)
})

it.each(['CONFLICT', 'IDENTITY_MISMATCH', 'NOT_FOUND', 'INVALID_RANGE', 'RESPONSE_TOO_LARGE'] as const)(
  'does not retry a real %s error even with pending store flags', async reason => {
    const api = apiFixture(); api.source.mockResolvedValueOnce(ok({ ok: false, reason, stores: pending }))
    const f = fixture(api); await flush(); await advance(1000)
    expect(f.result.current.view.phase).toBe('error'); expect(api.source).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })

it.each(['UNAVAILABLE', 'CORRUPT', 'CONFLICT', 'UNSUPPORTED_SCHEMA'] as const)(
  'does not retry target-store %s while the other store is pending', async state => {
    const api = apiFixture(); api.source.mockResolvedValueOnce(unavailable({ ACCEPTED: pending.ACCEPTED, FAILED: { state, readable: false } }))
    const f = fixture(api); await flush(); await advance(1000)
    expect(f.result.current.view.phase).toBe('error'); expect(api.source).toHaveBeenCalledOnce()
  })

it.each(['UNAVAILABLE', 'CORRUPT', 'CONFLICT', 'UNSUPPORTED_SCHEMA'] as const)(
  'does not hide opposite-store %s behind a pending target', async state => {
    const api = apiFixture(); api.source.mockResolvedValueOnce(unavailable({ ACCEPTED: { state, readable: false }, FAILED: pending.FAILED }))
    const f = fixture(api); await flush(); await advance(1000)
    expect(f.result.current.view.phase).toBe('error'); expect(api.source).toHaveBeenCalledOnce()
  })

it.each(['unknown-field', 'invalid-pending', 'bad-reason', 'missing-stores', 'outer-error', 'rejected'] as const)(
  'does not retry a malformed/transport %s response', async kind => {
    const api = apiFixture()
    const malformed = kind === 'unknown-field' ? { ok: false, reason: 'UNAVAILABLE', stores: pending, Expected: 'private' }
      : kind === 'invalid-pending' ? { ok: false, reason: 'UNAVAILABLE', stores: { ...pending, FAILED: { state: 'RECOVERY_PENDING', readable: true } } }
        : kind === 'bad-reason' ? { ok: false, reason: 'CORRUPT', stores: pending } : { ok: false, reason: 'UNAVAILABLE' }
    if (kind === 'rejected') api.source.mockRejectedValueOnce(Error('private failure'))
    else if (kind === 'outer-error') api.source.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'private failure', retryable: true } })
    else api.source.mockResolvedValueOnce(ok(malformed) as AppResult<SubmissionSource>)
    const f = fixture(api); await flush(); await advance(1000)
    expect(f.result.current.view.phase).toBe('error'); expect(f.result.current.view.error).not.toContain('private')
    expect(api.source).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })

it('retries only the unfinished UTF-8 chunk at the same offset and never appends a prefix twice', async () => {
  const prefix = 'a'.repeat(32767), suffix = '😀é漢\r\n', code = prefix + suffix, selection = row(code)
  const api = apiFixture(selection, code), last = deferred<AppResult<SubmissionSource>>()
  api.source.mockResolvedValueOnce(ok(chunk(selection, prefix, { eof: false }))).mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable()).mockReturnValueOnce(last.promise)
  const f = fixture(api, selection); await flush()
  expect(f.result.current.view).toMatchObject({ phase: 'loading', loadedBytes: bytes(prefix) }); expect(f.result.current.view.code).toBeUndefined()
  await advance(200)
  expect(api.source.mock.calls.map(([r]) => r)).toEqual([0, bytes(prefix), bytes(prefix), bytes(prefix)].map(offset => ({ reference: selection.source.reference, offset, limit: 32768 })))
  await act(async () => last.resolve(ok(chunk(selection, suffix, { offset: bytes(prefix), nextOffset: bytes(code), eof: true }))))
  expect(f.result.current.view).toMatchObject({ phase: 'ready', loadedBytes: bytes(code), code })
})

it('shares the two-retry budget across chunks instead of resetting it after every success', async () => {
  const selection = row('ab'), api = apiFixture(selection, 'ab')
  api.source.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok(chunk(selection, 'a', { eof: false })))
    .mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable())
  const f = fixture(api, selection); await flush(); await advance(50)
  expect(f.result.current.view).toMatchObject({ phase: 'loading', loadedBytes: 1 })
  await advance(149); expect(api.source).toHaveBeenCalledTimes(3)
  await advance(1); expect(api.source).toHaveBeenCalledTimes(4); expect(f.result.current.view.phase).toBe('error')
  expect(api.source.mock.calls.map(([r]) => r.offset)).toEqual([0, 0, 1, 1]); expect(f.result.current.view.code).toBeUndefined()
})

it.each(['reference', 'identity', 'size', 'utf8', 'range'] as const)('still rejects a bad %s chunk after a pending retry', async violation => {
  const api = apiFixture(), change = violation === 'reference' ? { reference: 'other_source' } : violation === 'identity' ? { submissionId: id(2) }
    : violation === 'size' ? { totalBytes: bytes(source) + 1, eof: false } : violation === 'utf8' ? { code: '\ud83d' } : { nextOffset: 1 }
  api.source.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok({ ...chunk(), ...change }))
  const f = fixture(api); await flush(); await advance(50)
  expect(f.result.current.view.phase).toBe('error'); expect(f.result.current.view.code).toBeUndefined(); expect(api.source).toHaveBeenCalledTimes(2)
})

it.each(['exercise', 'language', 'submission', 'inactive', 'unmount', 'pagehide'] as const)(
  'cancels a scheduled retry on %s and never dispatches the stale read', async change => {
    const api = apiFixture(); api.source.mockResolvedValueOnce(unavailable())
    const f = fixture(api); await flush(); expect(vi.getTimerCount()).toBe(1)
    if (change === 'unmount') f.unmount()
    else if (change === 'pagehide') act(() => { window.dispatchEvent(new Event('pagehide')) })
    else if (change === 'inactive') f.rerender({ ...f.initialProps, active: false })
    else {
      const next = row('new', change === 'exercise' ? { exerciseId: 'ch2-01' } : change === 'language' ? { language: 'javascript' }
        : { key: { storeKind: 'FAILED', recordId: id(2) }, submissionId: id(2), source: { reference: 'opaque_source_2', revision: 8, byteLength: 3 } })
      api.source.mockResolvedValueOnce(ok(chunk(next, 'new'))); f.rerender({ row: next, active: true }); await flush()
      expect(f.result.current.view.code).toBe('new')
    }
    expect(vi.getTimerCount()).toBe(0); await advance(1000)
    expect(api.source).toHaveBeenCalledTimes(['exercise', 'language', 'submission'].includes(change) ? 2 : 1)
    expect(vi.getTimerCount()).toBe(0)
  })

it.each(['replacement', 'inactive', 'unmount', 'pagehide'] as const)(
  'ignores an in-flight retried response after %s without appending or retrying again', async change => {
    const selection = row('ab'), api = apiFixture(selection, 'ab'), late = deferred<AppResult<SubmissionSource>>()
    api.source.mockResolvedValueOnce(unavailable()).mockReturnValueOnce(late.promise)
    const f = fixture(api, selection); await flush(); await advance(50); expect(api.source).toHaveBeenCalledTimes(2)
    if (change === 'unmount') f.unmount()
    else if (change === 'pagehide') act(() => { window.dispatchEvent(new Event('pagehide')) })
    else if (change === 'inactive') f.rerender({ ...f.initialProps, active: false })
    else {
      const next = row('new', { exerciseId: 'ch2-01', language: 'javascript', key: { storeKind: 'FAILED', recordId: id(2) }, submissionId: id(2), source: { reference: 'opaque_source_2', revision: 8, byteLength: 3 } })
      api.source.mockResolvedValueOnce(ok(chunk(next, 'new'))); f.rerender({ row: next, active: true }); await flush()
    }
    await act(async () => late.resolve(ok(chunk(selection, 'a', { eof: false }))))
    await advance(1000); expect(api.source).toHaveBeenCalledTimes(change === 'replacement' ? 3 : 2)
    expect(f.result.current.view.code).toBe(change === 'replacement' ? 'new' : undefined); expect(vi.getTimerCount()).toBe(0)
  })

it.each(['csharp', 'javascript'] as const)('keeps the %s Viewer read-only and Restore disabled until pending recovery, then requires explicit confirmation', async language => {
  vi.useRealTimers()
  const selection = row(source, { language }), api = apiFixture(selection), onRestore = vi.fn(() => true)
  api.source.mockResolvedValueOnce(unavailable())
  window.studentIde = { learning: { submission: api } } as unknown as StudentIdeApi
  render(<SubmissionDetails row={selection} active language={language} sourceRevision={4} draftCode="current draft" restoreBlocked={false} onBack={vi.fn()} onRestore={onRestore} />)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  await screen.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
  const props = viewer.props as { value: string; path: string; language: string; options: { readOnly: boolean; domReadOnly: boolean }; keepCurrentModel: boolean }
  expect(props).toMatchObject({ value: source, language, keepCurrentModel: false, options: { readOnly: true, domReadOnly: true } })
  expect(props.path).toMatch(/^submission-view:/); expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' })); expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Hủy Restore' })); expect(onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' })); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận Restore' }))
  expect(onRestore).toHaveBeenCalledExactlyOnceWith({ exerciseId: selection.exerciseId, language, code: source, expectedLanguage: language, expectedDraftRevision: 4, expectedDraftCode: 'current draft' })
  expect(api.submit).not.toHaveBeenCalled(); expect(api.completion).not.toHaveBeenCalled(); expect(api.history).not.toHaveBeenCalled()
})

it('retains the existing manual source-retry button after budget exhaustion and does not auto-Restore', async () => {
  vi.useRealTimers()
  const selection = row(), api = apiFixture(selection), onRestore = vi.fn(() => true)
  api.source.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable())
  window.studentIde = { learning: { submission: api } } as unknown as StudentIdeApi
  render(<SubmissionDetails row={selection} active language="csharp" sourceRevision={1} draftCode="draft" restoreBlocked={false} onBack={vi.fn()} onRestore={onRestore} />)
  const manual = await screen.findByRole('button', { name: 'Đọc lại source' })
  expect(api.source).toHaveBeenCalledTimes(3); expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  fireEvent.click(manual); await screen.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
  expect(api.source).toHaveBeenCalledTimes(4); expect(onRestore).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled(); expect(api.completion).not.toHaveBeenCalled()
})
