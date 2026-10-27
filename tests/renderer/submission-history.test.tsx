/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppResult } from '../../src/shared/contracts/app-error'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { SubmissionApi, SubmissionHistory, CommittedSubmissionSummary, SubmissionStatus, SubmissionCompletion, SubmissionStores } from '../../src/shared/contracts/submission'
import type { ExerciseApi } from '../../src/shared/contracts/exercise'
import { useSubmissionHistory } from '../../src/renderer/src/features/learning/practice/use-submission-history'
import { SubmissionHistoryPanel } from '../../src/renderer/src/features/learning/practice/SubmissionHistoryPanel'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { pagedPracticeFixture } from '../fixtures/learning/practice-api'
import { getBundledCourse } from '../../src/main/services/learning/content/course'

vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange }: { code: string; onChange(code: string): void }) =>
    <textarea aria-label="Practice code" value={code} onChange={e => onChange(e.target.value)} />,
}))
vi.mock('../../src/renderer/src/features/learning/ChapterMaterial', () => ({ ChapterMaterial: () => null }))
const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
const row = (n = 1, verdict: CommittedSubmissionSummary['verdict'] = 'Accepted', exerciseId = 'ch2-01'): CommittedSubmissionSummary => ({
  key: { storeKind: verdict === 'Accepted' ? 'ACCEPTED' : 'FAILED', recordId: uuid(n) }, submissionId: uuid(n), exerciseId,
  language: n % 2 ? 'csharp' : 'javascript', submittedAt: new Date(Date.UTC(2026, 9, 26, 12, 0, 60 - n)).toISOString(), verdict,
  packageVersion: 1, source: { reference: `private_opaque_source_${n}`, revision: n, byteLength: 20 },
})
const stores: SubmissionStores = { ACCEPTED: { state: 'AVAILABLE', readable: true }, FAILED: { state: 'AVAILABLE', readable: true } }
type Page = Extract<SubmissionHistory, { ok: true }>
const page = (rows: CommittedSubmissionSummary[] = [], changes: Partial<Page> = {}): Page => ({ ok: true, stores,
  coverage: 'COMPLETE', countScope: 'ALL_SELECTED', knownCount: rows.length, total: rows.length, rows, nextCursor: null, ...changes })
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const failure = { ok: false as const, error: { code: 'INTERNAL_ERROR' as const, message: 'Expected=private C:\\private\\JudgeResult', retryable: false } }
const saved = (n = 1): SubmissionStatus => ({ reference: { sessionId: `exercise_${uuid(100)}`, generation: 1, submissionId: uuid(n) },
  exerciseId: 'ch2-01', language: 'csharp', sourceRevision: 0, sequence: n, verdict: 'Accepted', stage: 'SETTLED',
  storage: { state: 'saved', recordKey: { storeKind: 'ACCEPTED', recordId: uuid(n) } } })
const completed = (state: 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN' = 'NOT_COMPLETED'): SubmissionCompletion => ({
  ok: true, exerciseId: 'ch2-01', state, accepted: state === 'UNKNOWN' ? { state: 'UNAVAILABLE', readable: false }
    : { state: state === 'COMPLETED' ? 'AVAILABLE' : 'MISSING', readable: true },
})
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function apiFixture() {
  const listeners = new Set<(s: SubmissionStatus) => void>()
  const api = {
    history: vi.fn<SubmissionApi['history']>().mockResolvedValue(ok(page())),
    completion: vi.fn<SubmissionApi['completion']>().mockResolvedValue(ok(completed())),
    submit: vi.fn<SubmissionApi['submit']>().mockResolvedValue(ok(saved())),
    status: vi.fn<SubmissionApi['status']>().mockResolvedValue(ok(saved())), current: vi.fn<SubmissionApi['current']>().mockResolvedValue(ok(null)),
    retry: vi.fn<SubmissionApi['retry']>().mockResolvedValue(ok(saved())), source: vi.fn<SubmissionApi['source']>(),
    context: vi.fn<SubmissionApi['context']>().mockResolvedValue(ok(null)),
    onChanged: vi.fn<SubmissionApi['onChanged']>(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }),
  }
  return { api, emit: (status: SubmissionStatus) => act(() => { for (const fn of [...listeners]) fn(status) }) }
}
function hookFixture(active = true) {
  const f = apiFixture(), initialProps = { exerciseId: 'ch2-01', active, status: undefined as SubmissionStatus | undefined }
  const hook = renderHook(props => useSubmissionHistory(props.exerciseId, props.active, props.status, f.api), { initialProps })
  return { ...f, ...hook, initialProps }
}
async function flush() { await act(async () => {}) }
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reads lazily, limits pages to 32, requests both committed stores for only the selected exercise', async () => {
  const f = hookFixture(false)
  expect(f.api.history).not.toHaveBeenCalled()
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.api.history).toHaveBeenCalledExactlyOnceWith({ scope: 'ALL', exerciseId: 'ch2-01', limit: 32 })
  expect(f.api.submit).not.toHaveBeenCalled(); expect(f.api.source).not.toHaveBeenCalled()
})

it('appends deterministic pages once per click flight, preserving Main order and projecting only summary fields', async () => {
  const f = hookFixture(false), more = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockResolvedValueOnce(ok(page([row(1), row(2, 'WrongAnswer')], { knownCount: 3, total: 3, nextCursor: 'cursor1' })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  f.api.history.mockReturnValueOnce(more.promise)
  act(() => { f.result.current.loadMore(); f.result.current.loadMore() })
  expect(f.api.history).toHaveBeenCalledTimes(2)
  expect(f.api.history).toHaveBeenLastCalledWith({ scope: 'ALL', exerciseId: 'ch2-01', limit: 32, cursor: 'cursor1' })
  await act(async () => { more.resolve(ok(page([row(3)], { knownCount: 3, total: 3 }))) })
  expect(f.result.current.view.rows.map(r => r.submissionId)).toEqual([uuid(1), uuid(2), uuid(3)])
  expect(f.result.current.view.rows[0].source).toEqual(row().source) // Opaque binding retained for authorized S3 source reads; never displayed.
})

it('discards old pages and restarts without cursor on STALE_CURSOR, without mixing generations', async () => {
  const f = hookFixture(false)
  f.api.history.mockResolvedValueOnce(ok(page([row()], { knownCount: 2, total: 2, nextCursor: 'oldcursor' })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  f.api.history.mockResolvedValueOnce(ok({ ok: false, reason: 'STALE_CURSOR', stores })).mockResolvedValueOnce(ok(page([row(9)])))
  await act(async () => f.result.current.loadMore())
  expect(f.api.history).toHaveBeenLastCalledWith({ scope: 'ALL', exerciseId: 'ch2-01', limit: 32 })
  expect(f.result.current.view.rows.map(r => r.submissionId)).toEqual([uuid(9)])
  expect(f.result.current.view.notice).toContain('tải lại từ đầu')
})

it.each(['record', 'submission'] as const)('detects a cross-page duplicate %s identity without silently deduplicating', async kind => {
  const f = hookFixture(false)
  f.api.history.mockResolvedValueOnce(ok(page([row()], { knownCount: 2, total: 2, nextCursor: 'next' })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  const duplicate = { ...row(2), ...(kind === 'record' ? { key: row().key } : { submissionId: row().submissionId }) }
  f.api.history.mockResolvedValueOnce(ok(page([duplicate], { knownCount: 2, total: 2 })))
  await act(async () => f.result.current.loadMore())
  expect(f.result.current.view.rows).toHaveLength(1)
  expect(f.result.current.view.error).toContain('xung đột')
  expect(f.result.current.view.moreBlocked).toBe(true)
})

it.each(['other-exercise', 'private-fields', 'oversized-page', 'empty-cursor-loop'] as const)('rejects %s responses safely', async kind => {
  const f = hookFixture(false)
  const response = kind === 'other-exercise' ? page([row(1, 'Accepted', 'ch2-02')])
    : kind === 'private-fields' ? page([{ ...row(), Expected: 'hidden secret' } as CommittedSubmissionSummary])
      : kind === 'oversized-page' ? page(Array.from({ length: 33 }, (_, i) => row(i + 1))) : page([], { nextCursor: 'loop' })
  f.api.history.mockResolvedValueOnce(ok(response)); f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.result.current.view.error).toBeTruthy()
  expect(f.result.current.view.rows).toEqual([])
  expect(f.result.current.view.error).not.toContain('secret')
})

it('rejects repeated pagination cursors without fetching forever', async () => {
  const f = hookFixture(false)
  f.api.history.mockResolvedValueOnce(ok(page([row()], { nextCursor: 'same', total: 3, knownCount: 3 })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  f.api.history.mockResolvedValueOnce(ok(page([row(2)], { nextCursor: 'same', total: 3, knownCount: 3 })))
  await act(async () => f.result.current.loadMore())
  expect(f.result.current.view.error).toBeTruthy()
  f.result.current.loadMore(); expect(f.api.history).toHaveBeenCalledTimes(2)
})

it('suppresses late pages from old exercises and inactive contexts', async () => {
  const f = hookFixture(false), old = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(page([row(2, 'WrongAnswer', 'ch2-02')])))
  f.rerender({ ...f.initialProps, active: true })
  f.rerender({ ...f.initialProps, active: true, exerciseId: 'ch2-02' }); await flush()
  await act(async () => old.resolve(ok(page([row()]))))
  expect(f.result.current.view.rows.map(r => r.submissionId)).toEqual([uuid(2)])
  const late = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(late.promise); act(() => f.result.current.refresh())
  f.rerender({ ...f.initialProps, active: false, exerciseId: 'ch2-02' })
  await act(async () => late.resolve(ok(page([row(3, 'Accepted', 'ch2-02')]))))
  expect(f.result.current.view.rows).toEqual([])
})

it('refreshes only on a new saved record; pending/unknown or repeated status updates do not create rows or reset pages', async () => {
  const f = hookFixture(); await flush()
  const pending: SubmissionStatus = { ...saved(), stage: 'STORAGE', storage: { state: 'pending' } }
  f.rerender({ ...f.initialProps, status: pending }); await flush()
  f.rerender({ ...f.initialProps, status: { ...pending, storage: { state: 'unknown', recoveryPending: true } } }); await flush()
  expect(f.api.history).toHaveBeenCalledOnce()
  f.api.history.mockResolvedValueOnce(ok(page([row()])))
  f.rerender({ ...f.initialProps, status: saved() }); await flush()
  expect(f.result.current.view.rows).toHaveLength(1)
  f.rerender({ ...f.initialProps, status: { ...saved(), sequence: 99 } }); await flush()
  f.rerender({ ...f.initialProps, status: pending }); await flush()
  expect(f.api.history).toHaveBeenCalledTimes(2)
})

it('coalesces refresh after a saved commit during delayed pagination and discards the old page', async () => {
  const f = hookFixture(false), more = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockResolvedValueOnce(ok(page([row()], { total: 2, knownCount: 2, nextCursor: 'old' })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  f.api.history.mockReturnValueOnce(more.promise).mockResolvedValueOnce(ok(page([row(9)])))
  act(() => f.result.current.loadMore())
  f.rerender({ ...f.initialProps, active: true, status: saved(9) })
  expect(f.api.history).toHaveBeenCalledTimes(2)
  await act(async () => more.resolve(ok(page([row(2)], { total: 2, knownCount: 2 }))))
  expect(f.api.history).toHaveBeenCalledTimes(3)
  expect(f.result.current.view.rows.map(r => r.submissionId)).toEqual([uuid(9)])
})

it('does not loop on a first-page stale cursor error or expose transport details', async () => {
  const f = hookFixture(false)
  f.api.history.mockResolvedValueOnce(ok({ ok: false, reason: 'STALE_CURSOR', stores }))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.api.history).toHaveBeenCalledOnce(); expect(f.result.current.view.error).toBeTruthy()
  f.api.history.mockRejectedValueOnce(Error('private Expected C:\\hidden'))
  await act(async () => f.result.current.refresh())
  expect(f.result.current.view.error).not.toContain('private')
})

it('retires read publication on unmount without calling execution/context/source APIs', async () => {
  const f = hookFixture(false), read = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(read.promise); f.rerender({ ...f.initialProps, active: true }); f.unmount()
  await act(async () => read.resolve(ok(page([row()]))))
  expect(f.api.context).not.toHaveBeenCalled(); expect(f.api.source).not.toHaveBeenCalled(); expect(f.api.submit).not.toHaveBeenCalled()
})

async function workspaceFixture() {
  const f = apiFixture()
  const run = vi.fn<ExerciseApi['run']>().mockResolvedValue(failure)
  f.api.submit.mockImplementation(async request => ok({ ...saved(), exerciseId: request.exerciseId, language: request.language,
    sourceRevision: request.sourceRevision, verdict: null, stage: 'RUNTIME', storage: { state: 'not-requested' } }))
  window.studentIde = { learning: { getCourse: vi.fn(async () => ok(getBundledCourse())), submission: f.api,
    exercise: { run, snapshot: vi.fn(), stop: vi.fn(), onChanged: () => () => {} },
    practice: { ...pagedPracticeFixture(exercises, () => ({ drafts: [], languages: [] })), save: vi.fn(async () => ok(null)),
      onPrepareClose: () => () => {}, onResume: () => () => {}, resolveClose: vi.fn() },
  } } as unknown as StudentIdeApi
  const view = render(<LearningWorkspace selectedChapterId={2} sidebarCollapsed={false} onSelectChapter={vi.fn()} />)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Nội dung học tập' })).getByRole('tab', { name: 'Luyện tập' }))
  fireEvent.click(await screen.findByRole('button', { name: /Tổng hai số/ }))
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
  const workspace = within(editor.closest<HTMLElement>('.practice-workspace')!)
  const openHistory = async () => {
    fireEvent.click(workspace.getByRole('tab', { name: 'Submissions' })); await flush()
    return within(workspace.getByRole('region', { name: 'Lịch sử nộp bài' }))
  }
  return { ...f, ...view, run, editor, workspace, openHistory }
}

it('defaults to Description with all exercise content and accessible keyboard tabs, preserving editor/source/selection', async () => {
  const f = await workspaceFixture()
  expect(f.workspace.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
  const description = within(f.workspace.getByRole('article', { name: 'Description' }))
  for (const name of ['Input', 'Output', 'Ví dụ Input / Output', 'Constraints']) expect(description.getByRole('heading', { name })).toBeTruthy()
  expect(description.getByText(exercises[0].description)).toBeTruthy()
  expect(description.getByText(`Nguồn tham khảo · ${exercises[0].source.publisher}`)).toBeTruthy()
  expect(f.api.history).not.toHaveBeenCalled()
  fireEvent.change(f.editor, { target: { value: 'draft kept while viewing history' } }); f.editor.setSelectionRange(4, 8); f.editor.scrollTop = 12
  fireEvent.keyDown(f.workspace.getByRole('tab', { name: 'Description' }), { key: 'ArrowRight' }); await flush()
  const tab = f.workspace.getByRole('tab', { name: 'Submissions' })
  expect(tab.getAttribute('aria-selected')).toBe('true')
  expect(document.getElementById(tab.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('tabpanel')
  fireEvent.keyDown(tab, { key: 'ArrowLeft' })
  expect(f.workspace.getByRole('textbox', { name: 'Practice code' })).toBe(f.editor)
  expect(f.editor.value).toBe('draft kept while viewing history'); expect(f.editor.selectionStart).toBe(4); expect(f.editor.scrollTop).toBe(12)
  expect(f.api.context).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled(); expect(f.api.submit).not.toHaveBeenCalled()
})

it.each(['Accepted', 'WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'] as const)(
  'renders committed %s in the three-column table without metrics or private data', async verdict => {
    const f = await workspaceFixture(); f.api.history.mockResolvedValueOnce(ok(page([row(1, verdict), row(2, verdict)])))
    const history = await f.openHistory(), table = history.getByRole('table')
    expect(within(table).getByText('C#')).toBeTruthy(); expect(within(table).getByText('JavaScript')).toBeTruthy()
    expect(table.querySelector('time')?.dateTime).toBe(row().submittedAt)
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Status', 'Language', 'Submitted At'])
    expect([...table.querySelectorAll('td[data-accepted]')].every(cell => cell.getAttribute('data-accepted') === String(verdict === 'Accepted'))).toBe(true)
    expect(table.textContent).not.toMatch(/saved|Runtime\s*Memory|Notes/)
    expect(table.textContent).toContain(verdict.replace(/([a-z])([A-Z])/g, '$1 $2'))
    expect(history.getAllByRole('button', { name: 'Chi tiết' })).toHaveLength(2)
    expect(history.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(history.queryByText(/^Tiến độ:/)).toBeNull()
    expect(f.container.textContent).not.toContain('private_opaque_source_')
    expect(f.api.source).not.toHaveBeenCalled()
  })

it('renders load-more loading and appends pages in Main order', async () => {
  const f = await workspaceFixture(), more = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockResolvedValueOnce(ok(page([row()], { nextCursor: 'next', total: 2, knownCount: 2 })))
  const history = await f.openHistory()
  f.api.history.mockReturnValueOnce(more.promise)
  fireEvent.click(history.getByRole('button', { name: 'Tải thêm' }))
  expect(history.getByRole<HTMLButtonElement>('button', { name: 'Đang tải thêm…' }).disabled).toBe(true)
  await act(async () => more.resolve(ok(page([row(2, 'WrongAnswer')], { total: 2, knownCount: 2 }))))
  expect([...history.getByRole('table').querySelectorAll('time')].map(t => t.dateTime)).toEqual([row().submittedAt, row(2).submittedAt])
  expect(history.queryByRole('button', { name: 'Tải thêm' })).toBeNull()
})

it('displays newest first in exactly three columns without mutating pagination rows, with row/keyboard Details', () => {
  const rows = [row(3, 'RuntimeError'), row(1), row(2, 'WrongAnswer')], onSelect = vi.fn(), onRefresh = vi.fn()
  const history = { view: { rows, loading: false, loadingMore: false, page: page(rows) }, refresh: vi.fn(), loadMore: vi.fn() }
  render(<SubmissionHistoryPanel history={history} completion={{ busy: false, completion: 'NOT_COMPLETED', possibleDataLoss: false }} onRefresh={onRefresh} onSelect={onSelect} />)
  const refresh = screen.getByRole('button', { name: 'Tải lại lịch sử' })
  expect(refresh.textContent).toBe(''); expect(refresh.querySelector('svg')).toBeTruthy()
  fireEvent.click(refresh); expect(onRefresh).toHaveBeenCalledOnce()
  expect(screen.queryByText(/^Tiến độ:|^Accepted:|^Đã tải /)).toBeNull()
  expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Status', 'Language', 'Submitted At'])
  const displayed = screen.getAllByRole('row').slice(1)
  expect(displayed.map(r => r.querySelector('time')?.dateTime)).toEqual([row(1).submittedAt, row(2).submittedAt, row(3).submittedAt])
  expect(rows.map(r => r.submissionId)).toEqual([row(3).submissionId, row(1).submissionId, row(2).submissionId])
  expect(displayed.every(r => within(r).getAllByRole('cell').length === 3)).toBe(true)
  fireEvent.click(displayed[0]); expect(onSelect).toHaveBeenLastCalledWith(row(1))
  fireEvent.keyDown(displayed[1], { key: 'Enter' }); expect(onSelect).toHaveBeenLastCalledWith(row(2, 'WrongAnswer'))
  fireEvent.keyDown(displayed[2], { key: ' ' }); expect(onSelect).toHaveBeenLastCalledWith(row(3, 'RuntimeError'))
  expect(onSelect).toHaveBeenCalledTimes(3)
})

it('reloads language-scoped source references and ignores a late previous-context History reply', async () => {
  const f = apiFixture(), old = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(page([row(2)])))
  const hook = renderHook(({ key }) => useSubmissionHistory('ch2-01', true, undefined, f.api, key), { initialProps: { key: 'ch2-01/csharp' } })
  await flush()
  hook.rerender({ key: 'ch2-01/javascript' }); await flush()
  await act(async () => old.resolve(ok(page([row(1)]))))
  expect(hook.result.current.view.rows.map(r => r.source.reference)).toEqual([row(2).source.reference])
  expect(f.api.history).toHaveBeenCalledTimes(2)
})

it('shows a stale-cursor reload and replaces visible old rows with the fresh first page', async () => {
  const f = await workspaceFixture()
  f.api.history.mockResolvedValueOnce(ok(page([row()], { nextCursor: 'old', total: 2, knownCount: 2 })))
  const history = await f.openHistory()
  f.api.history.mockResolvedValueOnce(ok({ ok: false, reason: 'STALE_CURSOR', stores })).mockResolvedValueOnce(ok(page([row(9)])))
  fireEvent.click(history.getByRole('button', { name: 'Tải thêm' })); await flush()
  expect(history.getByText(/Lịch sử đã thay đổi/)).toBeTruthy()
  expect(history.getByRole('table').querySelector('time')?.dateTime).toBe(row(9).submittedAt)
  expect(history.getAllByRole('row')).toHaveLength(2)
})

it('renders a committed-read conflict as an error, not an empty store or a provisional grade', async () => {
  const f = await workspaceFixture()
  const conflictStores: SubmissionStores = { ACCEPTED: { state: 'CONFLICT', readable: false }, FAILED: stores.FAILED }
  f.api.history.mockResolvedValueOnce(ok({ ok: false, reason: 'CONFLICT', stores: conflictStores }))
  f.api.completion.mockResolvedValue(ok(completed('UNKNOWN')))
  const history = await f.openHistory()
  expect(history.getByRole('alert').textContent).toContain('xung đột')
  expect(history.queryByText(/^Tiến độ:/)).toBeNull()
  expect(history.queryByRole('table')).toBeNull()
  expect(history.queryByText('Chưa có lần nộp bài đã commit cho bài tập này.')).toBeNull()
})

it('revalidates previously completed progress if Accepted becomes unavailable during History refresh', async () => {
  const f = await workspaceFixture()
  f.api.completion.mockResolvedValue(ok(completed('COMPLETED')))
  const history = await f.openHistory()
  expect(f.api.completion).toHaveBeenCalled()
  f.api.history.mockResolvedValueOnce(ok(page([], { stores: { ACCEPTED: { state: 'CORRUPT', readable: false }, FAILED: stores.FAILED },
    coverage: 'PARTIAL', countScope: 'READABLE_ONLY', total: null })))
  f.api.completion.mockResolvedValue(ok(completed('UNKNOWN')))
  fireEvent.click(history.getByRole('button', { name: 'Tải lại lịch sử' })); await flush()
  expect(history.queryByText(/^Tiến độ:/)).toBeNull()
  expect(f.workspace.queryByText('Hoàn thành · Accepted đã commit')).toBeNull()
})

it('refreshes Failed committed history without revoking earlier committed completion', async () => {
  const f = await workspaceFixture()
  f.api.completion.mockResolvedValue(ok(completed('COMPLETED')))
  const history = await f.openHistory()
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' })); await flush()
  const request = f.api.submit.mock.calls[0][0]
  f.api.history.mockResolvedValueOnce(ok(page([row(2, 'WrongAnswer'), row()])))
  f.emit({ ...saved(), sequence: 3, sourceRevision: request.sourceRevision, verdict: 'WrongAnswer',
    storage: { state: 'saved', recordKey: { storeKind: 'FAILED', recordId: uuid(2) } } })
  await waitFor(() => expect(history.getByText('Wrong Answer')).toBeTruthy())
  expect(f.api.completion).toHaveBeenCalled()
})

it('switches to Submissions immediately and reads History only after verified saved settlement', async () => {
  const f = await workspaceFixture()
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' })); await flush()
  const request = f.api.submit.mock.calls[0][0]
  expect(f.workspace.getByRole('tab', { name: 'Submissions' }).getAttribute('aria-selected')).toBe('true')
  expect(f.api.history).not.toHaveBeenCalled()
  f.api.history.mockResolvedValueOnce(ok(page([row()])))
  f.emit({ ...saved(), sequence: 3, sourceRevision: request.sourceRevision })
  await flush()
  const history = await f.openHistory()
  expect(history.getByRole('table')).toBeTruthy(); expect(f.api.history).toHaveBeenCalledOnce()
})

it.each(['UNAVAILABLE', 'CORRUPT', 'UNSUPPORTED_SCHEMA', 'RECOVERY_PENDING', 'RECOVERED'] as const)('shows partial %s stores without a false empty/completion claim', async state => {
  const f = await workspaceFixture(), recovered = state === 'RECOVERED'
  const partialStores: SubmissionStores = { ACCEPTED: { state, readable: recovered, ...(recovered ? { warning: 'POSSIBLE_DATA_LOSS' as const } : {}) }, FAILED: stores.FAILED }
  f.api.completion.mockResolvedValue(ok(completed('UNKNOWN')))
  // Re-read completion through the public UI, independently of row availability.
  f.api.history.mockResolvedValue(ok(page([], { stores: partialStores, coverage: 'PARTIAL', countScope: 'READABLE_ONLY', total: null })))
  const history = await f.openHistory()
  fireEvent.click(history.getByRole('button', { name: 'Tải lại lịch sử' })); await flush()
  expect(history.getByText(/Chỉ hiển thị phần lịch sử đọc được/)).toBeTruthy()
  expect(history.queryByText(/^Tiến độ:/)).toBeNull()
  expect(history.queryByText('Chưa có lần nộp bài đã commit cho bài tập này.')).toBeNull()
  if (recovered) expect(history.getByText(/POSSIBLE_DATA_LOSS/)).toBeTruthy()
})

it('renders missing-store empty state, loading and errors distinctly with explicit refresh', async () => {
  const f = await workspaceFixture(), read = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(read.promise)
  fireEvent.click(f.workspace.getByRole('tab', { name: 'Submissions' }))
  const history = within(f.workspace.getByRole('region', { name: 'Lịch sử nộp bài' }))
  expect(history.getByRole('status').textContent).toContain('Đang tải')
  await act(async () => read.resolve(ok(page([], { stores: { ACCEPTED: { state: 'MISSING', readable: true }, FAILED: { state: 'MISSING', readable: true } } }))))
  expect(history.getByText('Chưa có lần nộp bài đã commit cho bài tập này.')).toBeTruthy()
  f.api.history.mockResolvedValueOnce(failure)
  fireEvent.click(history.getByRole('button', { name: 'Tải lại lịch sử' })); await flush()
  expect(history.getByRole('alert').textContent).not.toContain('private')
  expect(history.queryByText('Chưa có lần nộp bài đã commit cho bài tập này.')).toBeNull()
})

it('updates after saved Submit, excludes pending results and shows completion only after committed API confirmation', async () => {
  const f = await workspaceFixture(), history = await f.openHistory()
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' })); await flush()
  const request = f.api.submit.mock.calls[0][0]
  f.emit({ ...saved(), sequence: 2, sourceRevision: request.sourceRevision, stage: 'STORAGE', storage: { state: 'pending' } })
  expect(history.queryByRole('table')).toBeNull(); expect(f.api.history).toHaveBeenCalledOnce()
  f.api.history.mockResolvedValueOnce(ok(page([row()]))); f.api.completion.mockResolvedValue(ok(completed('COMPLETED')))
  f.emit({ ...saved(), sequence: 3, sourceRevision: request.sourceRevision })
  await waitFor(() => expect(history.getByRole('table')).toBeTruthy())
  expect(history.getByRole('table')).toBeTruthy(); expect(f.api.history).toHaveBeenCalledTimes(2)
  expect(f.api.submit).toHaveBeenCalledOnce()
})

it('switches exercises to default Description and ignores late old-exercise history', async () => {
  const f = await workspaceFixture(), old = deferred<AppResult<SubmissionHistory>>()
  f.api.history.mockReturnValueOnce(old.promise)
  fireEvent.click(f.workspace.getByRole('tab', { name: 'Submissions' }))
  fireEvent.click(f.workspace.getByRole('button', { name: '← Danh sách' }))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(exercises[1].title) }))
  const nextEditor = await screen.findByRole('textbox', { name: 'Practice code' })
  const workspace = within(nextEditor.closest<HTMLElement>('.practice-workspace')!)
  expect(workspace.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
  f.api.history.mockResolvedValueOnce(ok(page([row(2, 'WrongAnswer', exercises[1].id)])))
  fireEvent.click(workspace.getByRole('tab', { name: 'Submissions' })); await flush()
  await act(async () => old.resolve(ok(page([row()]))))
  const history = workspace.getByRole('region', { name: 'Lịch sử nộp bài' })
  expect(history.querySelector('time')?.dateTime).toBe(row(2).submittedAt)
  expect(f.api.history).toHaveBeenLastCalledWith({ scope: 'ALL', exerciseId: exercises[1].id, limit: 32 })
})

it.each(['Run', 'Submit'] as const)('switching description tabs leaves an in-flight %s untouched', async action => {
  const f = await workspaceFixture(), pending = deferred<never>()
  if (action === 'Run') f.run.mockReturnValueOnce(pending.promise)
  else f.api.submit.mockReturnValueOnce(pending.promise)
  fireEvent.click(f.workspace.getByRole('button', { name: action }))
  if (action === 'Run') await f.openHistory()
  else expect(f.workspace.getByRole('status', { name: 'Đang chấm bài' })).toBeTruthy()
  fireEvent.click(f.workspace.getByRole('tab', { name: 'Description' }))
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Run' }).disabled).toBe(true)
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(true)
  expect(f.api.context).not.toHaveBeenCalled()
  expect(action === 'Run' ? f.run : f.api.submit).toHaveBeenCalledOnce()
})

it('does not infer completion from an Accepted history row when completion is UNKNOWN', () => {
  const history = { view: { rows: [row()], loading: false, loadingMore: false, page: page([row()]) }, refresh: vi.fn(), loadMore: vi.fn() }
  render(<SubmissionHistoryPanel history={history} completion={{ busy: false, completion: 'UNKNOWN', possibleDataLoss: false }} onRefresh={vi.fn()} />)
  expect(screen.queryByText(/^Tiến độ:/)).toBeNull()
  expect(screen.queryByText('Tiến độ: Hoàn thành (Accepted đã commit)')).toBeNull()
})
