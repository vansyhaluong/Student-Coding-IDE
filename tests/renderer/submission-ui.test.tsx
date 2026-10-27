/** @vitest-environment jsdom */
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { SubmissionApi, SubmissionCompletion, SubmissionStatus, PublicSubmissionVerdict } from '../../src/shared/contracts/submission'
import type { AppResult } from '../../src/shared/contracts/app-error'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import type { ExerciseApi, ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import { useSubmission } from '../../src/renderer/src/features/learning/practice/use-submission'
import { SubmissionResult } from '../../src/renderer/src/features/learning/practice/SubmissionResult'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { pagedPracticeFixture } from '../fixtures/learning/practice-api'
import { getBundledCourse } from '../../src/main/services/learning/content/course'

vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange }: { code: string; onChange(code: string): void }) =>
    <textarea aria-label="Practice code" value={code} onChange={e => onChange(e.target.value)} />,
}))
vi.mock('../../src/renderer/src/features/learning/ChapterMaterial', () => ({ ChapterMaterial: () => null }))

const id = '11111111-1111-4111-8111-111111111111'
const input = { active: true, exerciseId: 'ch2-01' as string | undefined, language: 'csharp' as ExerciseLanguage,
  code: 'exact\r\nsource 😃', sourceRevision: 3, blocked: false }
const unavailable = { ok: false as const, error: { code: 'INTERNAL_ERROR' as const,
  message: 'private expected=secret C:\\private\\JudgeResult', retryable: false } }
const status = (sequence = 1, change: Partial<SubmissionStatus> = {}): SubmissionStatus => ({
  reference: { sessionId: 'exercise_11111111-1111-4111-8111-111111111111', generation: 1, submissionId: id },
  exerciseId: input.exerciseId!, language: input.language, sourceRevision: input.sourceRevision, sequence,
  stage: 'RUNTIME', verdict: null, storage: { state: 'not-requested' }, ...change,
})
const saved = (sequence = 3, verdict: PublicSubmissionVerdict = 'Accepted') => status(sequence, { stage: 'SETTLED', verdict,
  storage: { state: 'saved', recordKey: { storeKind: verdict === 'Accepted' ? 'ACCEPTED' : 'FAILED', recordId: id } } })
const completion = (state: 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN' = 'NOT_COMPLETED'): SubmissionCompletion => ({
  ok: true, exerciseId: 'ch2-01', state,
  accepted: { state: state === 'UNKNOWN' ? 'UNAVAILABLE' : state === 'COMPLETED' ? 'AVAILABLE' : 'MISSING', readable: state !== 'UNKNOWN' },
})
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function apiFixture() {
  const listeners = new Set<(s: SubmissionStatus) => void>()
  const api = {
    submit: vi.fn<SubmissionApi['submit']>().mockResolvedValue({ ok: true, value: status() }),
    status: vi.fn<SubmissionApi['status']>().mockResolvedValue({ ok: true, value: status() }),
    current: vi.fn<SubmissionApi['current']>().mockResolvedValue({ ok: true, value: status() }),
    retry: vi.fn<SubmissionApi['retry']>().mockResolvedValue({ ok: true, value: status() }),
    completion: vi.fn<SubmissionApi['completion']>().mockResolvedValue({ ok: true, value: completion() }),
    context: vi.fn<SubmissionApi['context']>().mockResolvedValue({ ok: true, value: null }),
    history: vi.fn<SubmissionApi['history']>().mockResolvedValue({ ok: true, value: { ok: true, rows: [], stores: {
      ACCEPTED: { state: 'MISSING', readable: true }, FAILED: { state: 'MISSING', readable: true } },
      coverage: 'COMPLETE', countScope: 'ALL_SELECTED', knownCount: 0, total: 0, nextCursor: null } }), source: vi.fn<SubmissionApi['source']>(),
    onChanged: vi.fn<SubmissionApi['onChanged']>(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }),
  }
  const emit = (s: SubmissionStatus) => act(() => { for (const fn of [...listeners]) fn(s) })
  return { api, listeners, emit }
}
function fixture(strict = false) {
  vi.useFakeTimers()
  const f = apiFixture()
  const hook = renderHook(props => useSubmission(props, f.api), { initialProps: input,
    wrapper: strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined })
  const submit = () => act(async () => { await hook.result.current.submit() })
  return { ...f, ...hook, submit }
}
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('captures exact source/revision once and blocks duplicate admission before ACK', async () => {
  const f = fixture(), ack = deferred<AppResult<SubmissionStatus>>()
  f.api.submit.mockReturnValueOnce(ack.promise)
  let task!: Promise<void>
  act(() => { task = f.result.current.submit() })
  await act(async () => { await f.result.current.submit() })
  f.rerender({ ...input, code: 'later draft', sourceRevision: 4 })
  expect(f.api.submit).toHaveBeenCalledExactlyOnceWith({ exerciseId: 'ch2-01', language: 'csharp', code: input.code, sourceRevision: 3 })
  await act(async () => { ack.resolve({ ok: true, value: status() }); await task })
  expect(f.result.current.staleSource).toBe(true)
  expect(f.result.current.view.busy).toBe(true)
})

it.each(['pending', 'unknown'] as const)('keeps Accepted/%s distinct from committed completion and holds the slot', async state => {
  const f = fixture(); await f.submit()
  f.emit(status(2, { stage: 'STORAGE', verdict: 'Accepted', storage: state === 'pending' ? { state } : { state, recoveryPending: true } }))
  expect(f.result.current.view.status?.verdict).toBe('Accepted')
  expect(f.result.current.view.completion).toBe('NOT_COMPLETED')
  expect(f.result.current.view.busy).toBe(true)
  expect(f.api.completion).toHaveBeenCalledOnce()
  await f.submit(); expect(f.api.submit).toHaveBeenCalledOnce()
})

it('reads completion only from the committed API after verified save, not from Accepted alone', async () => {
  const f = fixture(); await f.submit()
  const read = deferred<AppResult<SubmissionCompletion>>()
  f.api.completion.mockReturnValueOnce(read.promise)
  f.emit(saved())
  expect(f.result.current.view.completion).toBe('NOT_COMPLETED')
  await act(async () => { read.resolve({ ok: true, value: completion('COMPLETED') }) })
  expect(f.result.current.view.completion).toBe('COMPLETED')
  expect(f.result.current.view.busy).toBe(false)
})

it.each(['WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'] as const)(
  '%s saved to Failed does not create completion', async verdict => {
    const f = fixture(); await f.submit(); f.emit(saved(3, verdict))
    await act(async () => {})
    expect(f.result.current.view.completion).toBe('NOT_COMPLETED')
    expect(f.result.current.view.status?.storage.state).toBe('saved')
  })

it('preserves earlier committed completion through later failure and storage refusal', async () => {
  const f = apiFixture(); f.api.completion.mockResolvedValue({ ok: true, value: completion('COMPLETED') })
  const hook = renderHook(() => useSubmission(input, f.api))
  await act(async () => { await hook.result.current.submit() })
  f.emit(status(3, { stage: 'SETTLED', verdict: 'WrongAnswer', storage: { state: 'failed', reason: 'FULL' } }))
  expect(hook.result.current.view.completion).toBe('COMPLETED')
})

it('renders unreadable Accepted as UNKNOWN and retains recovered POSSIBLE_DATA_LOSS', async () => {
  const f = fixture()
  f.api.completion.mockResolvedValueOnce({ ok: true, value: completion('UNKNOWN') })
  await act(async () => { f.result.current.refreshCompletion() })
  expect(f.result.current.view.completion).toBe('UNKNOWN')
  f.api.completion.mockResolvedValueOnce({ ok: true, value: { ok: true, exerciseId: 'ch2-01', state: 'COMPLETED',
    accepted: { state: 'RECOVERED', readable: true, warning: 'POSSIBLE_DATA_LOSS' } } })
  await act(async () => { f.result.current.refreshCompletion() })
  expect(f.result.current.view.possibleDataLoss).toBe(true)
})

it.each(['exercise', 'language', 'inactive', 'pagehide', 'unmount'] as const)('retires %s and ignores late ACK/events/completion with listener cleanup', async change => {
  const f = fixture(), ack = deferred<AppResult<SubmissionStatus>>()
  f.api.submit.mockReturnValueOnce(ack.promise)
  let task!: Promise<void>; act(() => { task = f.result.current.submit() })
  const oldListener = [...f.listeners][0]
  if (change === 'unmount') f.unmount()
  else if (change === 'pagehide') act(() => { window.dispatchEvent(new Event('pagehide')) })
  else f.rerender({ ...input, ...(change === 'exercise' ? { exerciseId: 'ch2-02' } : change === 'inactive' ? { active: false } : { language: 'javascript' as const }) })
  await act(async () => { oldListener(saved()); ack.resolve({ ok: true, value: saved() }); await task })
  expect(f.api.context).toHaveBeenCalledExactlyOnceWith({ reason: ['inactive', 'pagehide'].includes(change) ? 'LEARNING_LEFT' : 'CONTEXT_CHANGED' })
  expect(f.api.submit).toHaveBeenCalledOnce()
  if (['inactive', 'pagehide', 'unmount'].includes(change)) expect(f.listeners.size).toBe(0)
  if (!['unmount', 'pagehide'].includes(change)) expect(f.result.current.view.status).toBeUndefined()
})

it('recovers a missing Submit ACK through current, never repeating Submit', async () => {
  const f = fixture()
  f.api.submit.mockRejectedValueOnce(Error('lost ACK/private expected'))
  f.api.current.mockResolvedValueOnce({ ok: true, value: saved() })
  await f.submit()
  expect(f.api.current).toHaveBeenCalledOnce()
  expect(f.api.submit).toHaveBeenCalledOnce()
  expect(f.result.current.view.status?.storage.state).toBe('saved')
})

it('holds an ambiguous operation when current is unavailable/null; status retry never submits again', async () => {
  const f = fixture()
  f.api.submit.mockResolvedValueOnce(unavailable); f.api.current.mockResolvedValueOnce({ ok: true, value: null })
  await f.submit()
  expect(f.result.current.view.busy).toBe(true)
  expect(f.result.current.view.error).not.toContain('secret')
  await f.submit()
  f.api.current.mockResolvedValueOnce({ ok: true, value: status(3) })
  await act(async () => { f.result.current.checkStatus() })
  f.api.retry.mockResolvedValueOnce({ ok: true, value: saved(4) })
  await act(async () => { f.result.current.checkStatus() })
  expect(f.api.retry).toHaveBeenCalledExactlyOnceWith(status().reference)
  expect(f.api.submit).toHaveBeenCalledOnce()
})

it('ignores mismatched identities, extra private fields and old sequences', async () => {
  const f = fixture(); await f.submit()
  for (const bad of [status(2, { exerciseId: 'ch2-02' }), status(2, { sourceRevision: 99 }),
    status(2, { language: 'javascript' }), status(2, { reference: { ...status().reference, generation: 2 } }),
    { ...status(2), expected: 'secret' }]) f.emit(bad)
  expect(f.result.current.view.status?.sequence).toBe(1)
  f.emit(saved(1))
  expect(f.result.current.view.busy).toBe(true)
  f.emit(status(4)); f.emit(status(2))
  expect(f.result.current.view.status?.sequence).toBe(4)
})

it('preserves a newer settled event when an older status invoke fails and stops polling', async () => {
  const f = fixture(), read = deferred<AppResult<SubmissionStatus>>()
  f.api.status.mockReturnValueOnce(read.promise)
  await f.submit(); f.emit(saved(5))
  await act(async () => { read.resolve(unavailable) })
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(f.result.current.view.status?.sequence).toBe(5)
  expect(f.result.current.view.error).toBeUndefined()
  expect(f.api.status).toHaveBeenCalledOnce()
})

it('polls one request at a time and removes timers/listeners on retirement', async () => {
  const f = fixture(true), read = deferred<AppResult<SubmissionStatus>>()
  f.api.status.mockReturnValueOnce(read.promise)
  await f.submit()
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); f.result.current.checkStatus() })
  expect(f.api.status).toHaveBeenCalledOnce(); expect(f.api.retry).not.toHaveBeenCalled()
  f.unmount(); await act(async () => { read.resolve({ ok: true, value: saved() }) })
  expect(f.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0)
})

it('does not adopt the preceding operation after an ambiguous deliberate re-submit', async () => {
  const f = fixture(); await f.submit(); f.emit(saved(3))
  f.api.submit.mockResolvedValueOnce(unavailable); f.api.current.mockResolvedValueOnce({ ok: true, value: saved(3) })
  await f.submit()
  expect(f.result.current.view.busy).toBe(true)
  expect(f.result.current.view.status).toBeUndefined()
})

it.each(['blocked', 'inactive', 'oversize', 'unicode'] as const)('prevents %s Submit locally', async reason => {
  const f = fixture()
  f.rerender({ ...input, blocked: reason === 'blocked', active: reason !== 'inactive',
    code: reason === 'oversize' ? 'x'.repeat(262145) : reason === 'unicode' ? '\ud800' : input.code })
  await f.submit()
  expect(f.result.current.disabledReason).toBeTruthy(); expect(f.api.submit).not.toHaveBeenCalled()
})

it.each(['pending', 'unknown', 'saved', 'failed'] as const)('renders explicit %s storage independently from verdict without private data', state => {
  const storage = state === 'unknown' ? { state, recoveryPending: true as const } : state === 'saved' ? saved().storage
    : state === 'failed' ? { state, reason: 'FULL' as const } : { state }
  render(<SubmissionResult view={{ busy: state === 'pending' || state === 'unknown', status: status(2, { stage: state === 'pending' || state === 'unknown' ? 'STORAGE' : 'SETTLED', verdict: 'Accepted', storage }),
    completion: 'NOT_COMPLETED', possibleDataLoss: false }} staleSource onCheck={vi.fn()} onCompletion={vi.fn()} />)
  const result = screen.getByRole('region', { name: 'Submit Result' })
  expect(result.textContent).toContain(state)
  expect(result.textContent).toContain('Kết quả này thuộc source lúc bấm Submit')
  expect(result.textContent).not.toContain('Hoàn thành ·')
  expect(result.textContent).not.toContain(id)
})

async function workspaceFixture() {
  const f = apiFixture()
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() })
  const run = vi.fn<ExerciseApi['run']>().mockResolvedValue(unavailable)
  window.studentIde = { learning: { getCourse: vi.fn(async () => ({ ok: true, value: getBundledCourse() })),
    submission: f.api, exercise: { run, snapshot: vi.fn(), stop: vi.fn(), onChanged: () => () => {} },
    practice: { ...pagedPracticeFixture(exercises, () => ({ drafts: [], languages: [] })),
      save: vi.fn(async () => ({ ok: true, value: null })), onPrepareClose: () => () => {}, onResume: () => () => {}, resolveClose: vi.fn() },
  } } as unknown as StudentIdeApi
  const view = render(<LearningWorkspace selectedChapterId={2} sidebarCollapsed={false} onSelectChapter={vi.fn()} />)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Nội dung học tập' })).getByRole('tab', { name: 'Luyện tập' }))
  fireEvent.click(await screen.findByRole('button', { name: /Tổng hai số/ }))
  const editor = await screen.findByRole('textbox', { name: 'Practice code' })
  const workspace = within(editor.closest<HTMLElement>('.practice-workspace')!)
  return { ...f, ...view, editor, workspace, run }
}

it('integrates Submit beside unchanged Run, captures edits and displays late result as prior source', async () => {
  const f = await workspaceFixture(), ack = deferred<AppResult<SubmissionStatus>>()
  f.api.submit.mockReturnValueOnce(ack.promise)
  fireEvent.change(f.editor, { target: { value: 'immutable source' } })
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Run' }).disabled).toBe(true)
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(true)
  fireEvent.change(f.editor, { target: { value: 'new draft' } })
  const request = f.api.submit.mock.calls[0][0]
  const s = status(2, { sourceRevision: request.sourceRevision })
  f.api.status.mockResolvedValue({ ok: true, value: s })
  await act(async () => { ack.resolve({ ok: true, value: s }) })
  expect(request.code).toBe('immutable source')
  expect(Object.keys(request).sort()).toEqual(['code', 'exerciseId', 'language', 'sourceRevision'])
  expect(f.workspace.queryByText('Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.')).toBeNull()
  expect(f.workspace.getByRole('status', { name: 'Đang chấm bài' })).toBeTruthy()
  f.api.completion.mockResolvedValue({ ok: true, value: completion('COMPLETED') })
  f.emit({ ...saved(4), sourceRevision: request.sourceRevision })
  await waitFor(() => expect(f.workspace.getByText('Hoàn thành · Accepted đã commit')).toBeTruthy())
  expect(f.workspace.getByText('Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.')).toBeTruthy()
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Run' }).disabled).toBe(false)
  expect(f.run).not.toHaveBeenCalled()
  expect(f.api.history).toHaveBeenCalledOnce(); expect(f.api.source).not.toHaveBeenCalled()
})

it('keeps public Run separate from Submit/committed completion', async () => {
  const f = await workspaceFixture()
  fireEvent.click(f.workspace.getByRole('button', { name: 'Run' }))
  await waitFor(() => expect(f.run).toHaveBeenCalledOnce())
  expect(f.api.submit).not.toHaveBeenCalled()
  expect(f.workspace.queryByText('Hoàn thành · Accepted đã commit')).toBeNull()
})

it('disables Submit throughout an existing public Run without calling Official Submit', async () => {
  const f = await workspaceFixture(), ack = deferred<AppResult<ExerciseSnapshot>>()
  f.run.mockReturnValueOnce(ack.promise)
  fireEvent.click(f.workspace.getByRole('button', { name: 'Run' }))
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(true)
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  expect(f.api.submit).not.toHaveBeenCalled()
  await act(async () => { ack.resolve(unavailable) })
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(false)
})

it('opens Submissions before ACK with only the Judge spinner and prevents a second Submit', async () => {
  const f = await workspaceFixture(), ack = deferred<AppResult<SubmissionStatus>>()
  f.api.submit.mockReturnValueOnce(ack.promise)
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  expect(f.workspace.getByRole('tab', { name: 'Submissions' }).getAttribute('aria-selected')).toBe('true')
  const result = f.workspace.getByRole('region', { name: 'Submit Result' })
  expect(within(result).getByRole('status', { name: 'Đang chấm bài' }).querySelector('svg')).toBeTruthy()
  expect(result.textContent).toBe('')
  expect(f.workspace.queryByRole('table')).toBeNull()
  expect(f.workspace.queryByRole('region', { name: 'Submission Details' })).toBeNull()
  expect(f.api.submit).toHaveBeenCalledOnce()
  expect(f.api.history).not.toHaveBeenCalled()
  expect(f.run).not.toHaveBeenCalled()
  const request = f.api.submit.mock.calls[0][0]
  await act(async () => { ack.resolve({ ok: true, value: status(1, { sourceRevision: request.sourceRevision }) }) })
})

it('opens Submissions even for an immediately settled ACK without inventing a History row', async () => {
  const f = await workspaceFixture()
  f.api.submit.mockImplementation(async request => ({ ok: true, value: { ...saved(), sourceRevision: request.sourceRevision } }))
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(f.workspace.getByText('saved · Đã xác minh bản ghi được lưu.')).toBeTruthy())
  expect(f.workspace.getByRole('tab', { name: 'Submissions' }).getAttribute('aria-selected')).toBe('true')
  await waitFor(() => expect(f.api.history).toHaveBeenCalledOnce())
  expect(f.workspace.queryByRole('table')).toBeNull()
  expect(f.workspace.getByText('Chưa có lần nộp bài đã commit cho bài tập này.')).toBeTruthy()
})

it('shows only the spinner throughout Runtime, then replaces it with truthful verdict/storage', () => {
  const callbacks = { staleSource: false, onCheck: vi.fn(), onCompletion: vi.fn() }
  const view = { busy: true, completion: 'NOT_COMPLETED' as const, possibleDataLoss: false }
  const ui = render(<SubmissionResult {...callbacks} view={{ ...view, status: status() }} />)
  expect(screen.getByRole('status', { name: 'Đang chấm bài' })).toBeTruthy()
  expect(screen.queryByText(/Compiling|Running|Đang biên dịch|source revision|testcase/)).toBeNull()
  ui.rerender(<SubmissionResult {...callbacks} view={{ ...view, status: status(2, {
    stage: 'STORAGE', verdict: 'WrongAnswer', storage: { state: 'unknown', recoveryPending: true } }) }} />)
  expect(screen.queryByRole('status', { name: 'Đang chấm bài' })).toBeNull()
  expect(screen.getByText('Wrong Answer').getAttribute('data-accepted')).toBe('false')
  expect(screen.getByText(/unknown · Chưa xác định/)).toBeTruthy()
  fireEvent.click(screen.getByText('Kiểm tra trạng thái'))
  expect(callbacks.onCheck).toHaveBeenCalledOnce()
})

it('keeps explicit status recovery available when Runtime reports a failure but still owns cleanup', () => {
  const onCheck = vi.fn()
  render(<SubmissionResult view={{ busy: true, status: status(2, { verdict: 'InfrastructureFailure',
    storage: { state: 'not-requested', reason: 'INELIGIBLE' } }), completion: 'NOT_COMPLETED', possibleDataLoss: false }}
    staleSource={false} onCheck={onCheck} onCompletion={vi.fn()} />)
  expect(screen.getByText('Không thể hoàn tất chấm bài')).toBeTruthy()
  expect(screen.getByText('Chưa xác nhận hoàn tất thu hồi tài nguyên.')).toBeTruthy()
  expect(screen.queryByText('Đang hoàn tất lưu bài.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra trạng thái' }))
  expect(onCheck).toHaveBeenCalledOnce()
  expect(screen.queryByRole('status', { name: 'Đang chấm bài' })).toBeNull()
})

it('does not overwrite new completion with an older initial read, or publish a read after navigation', async () => {
  const f = apiFixture(), initial = deferred<AppResult<SubmissionCompletion>>()
  f.api.completion.mockReturnValueOnce(initial.promise)
  const h = renderHook(props => useSubmission(props, f.api), { initialProps: input })
  await act(async () => { await h.result.current.submit() })
  f.api.completion.mockResolvedValueOnce({ ok: true, value: completion('COMPLETED') })
  await act(async () => { f.emit(saved()) })
  await act(async () => { initial.resolve({ ok: true, value: completion() }) })
  expect(h.result.current.view.completion).toBe('COMPLETED')
  const delayed = deferred<AppResult<SubmissionCompletion>>()
  f.api.completion.mockReturnValueOnce(delayed.promise)
  act(() => h.result.current.refreshCompletion())
  h.rerender({ ...input, exerciseId: 'ch2-02' })
  await act(async () => { delayed.resolve({ ok: true, value: completion('COMPLETED') }) })
  expect(h.result.current.view.completion).not.toBe('COMPLETED')
})

it('treats completion transport/read errors as UNKNOWN, never as empty Accepted', async () => {
  const f = fixture()
  f.api.completion.mockResolvedValueOnce(unavailable)
  await act(async () => { f.result.current.refreshCompletion() })
  expect(f.result.current.view.completion).toBe('UNKNOWN')
  f.api.completion.mockRejectedValueOnce(Error('private diagnostic'))
  await act(async () => { f.result.current.refreshCompletion() })
  expect(f.result.current.view.completion).toBe('UNKNOWN')
})

it('keeps a newer status recovered during a delayed ACK without reporting a stale ACK error', async () => {
  const f = fixture(), ack = deferred<AppResult<SubmissionStatus>>()
  f.api.submit.mockReturnValueOnce(ack.promise); f.api.current.mockResolvedValueOnce({ ok: true, value: saved(5) })
  let task!: Promise<void>; act(() => { task = f.result.current.submit() })
  await act(async () => { f.result.current.checkStatus() })
  await act(async () => { ack.resolve({ ok: true, value: status() }); await task })
  expect(f.result.current.view.status?.sequence).toBe(5)
  expect(f.result.current.view.error).toBeUndefined()
  expect(f.api.submit).toHaveBeenCalledOnce()
})

it('allows a deliberate later Submit after settlement with a new Main generation', async () => {
  const f = fixture(); await f.submit(); f.emit(saved(3))
  const next = status(1, { reference: { sessionId: 'exercise_22222222-2222-4222-8222-222222222222',
    generation: 2, submissionId: '22222222-2222-4222-8222-222222222222' } })
  f.api.submit.mockResolvedValueOnce({ ok: true, value: next }); f.api.status.mockResolvedValueOnce({ ok: true, value: next })
  await f.submit()
  expect(f.api.submit).toHaveBeenCalledTimes(2)
  expect(f.result.current.view.status?.reference.generation).toBe(2)
})

it('continues polling a new operation after the preceding operation settles with a status read still in flight', async () => {
  const f = fixture(), old = deferred<AppResult<SubmissionStatus>>()
  f.api.status.mockReturnValueOnce(old.promise)
  await f.submit(); f.emit(saved(3))
  const next = status(1, { reference: { sessionId: 'exercise_22222222-2222-4222-8222-222222222222',
    generation: 2, submissionId: '22222222-2222-4222-8222-222222222222' } })
  f.api.submit.mockResolvedValueOnce({ ok: true, value: next }); f.api.status.mockResolvedValueOnce({ ok: true, value: next })
  await f.submit()
  await act(async () => { old.resolve(unavailable) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(f.api.status).toHaveBeenLastCalledWith(next.reference)
  expect(f.result.current.view.status?.reference.generation).toBe(2)
  expect(f.result.current.view.error).toBeUndefined()
})

it('shows unavailability when the Submit bridge is absent', async () => {
  window.studentIde = { learning: {} } as unknown as StudentIdeApi
  const h = renderHook(() => useSubmission(input))
  await act(async () => { await h.result.current.submit() })
  expect(h.result.current.disabledReason).toBe('Submit chưa khả dụng.')
  expect(h.result.current.view.completion).toBe('UNKNOWN')
})

it('shows safe transport failure and prevents replay or leaking raw error text', async () => {
  const f = await workspaceFixture()
  f.api.submit.mockResolvedValueOnce(unavailable); f.api.current.mockResolvedValueOnce(unavailable)
  fireEvent.click(f.workspace.getByRole('button', { name: 'Submit' }))
  await f.workspace.findByRole('alert')
  expect(f.workspace.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(true)
  expect(f.container.textContent).not.toContain('C:\\private')
  expect(f.container.textContent).not.toContain('JudgeResult')
  expect(f.container.textContent).not.toContain('expected=secret')
  fireEvent.click(f.workspace.getByRole('button', { name: 'Kiểm tra trạng thái' }))
  expect(f.api.submit).toHaveBeenCalledOnce()
})
