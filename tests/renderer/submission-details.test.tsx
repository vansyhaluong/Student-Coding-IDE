/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppResult, StudentIdeApi } from '../../src/shared/contracts'
import type { ExerciseApi } from '../../src/shared/contracts/exercise'
import type { ExerciseLanguage, PracticeState } from '../../src/shared/contracts/practice'
import type { SubmissionApi, SubmissionSource, SubmissionStores } from '../../src/shared/contracts/submission'
import { useSubmissionSource } from '../../src/renderer/src/features/learning/practice/use-submission-source'
import type { HistoryRow } from '../../src/renderer/src/features/learning/practice/use-submission-history'
import { SubmissionDetails } from '../../src/renderer/src/features/learning/practice/SubmissionDetails'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { pagedPracticeFixture } from '../fixtures/learning/practice-api'
import { getBundledCourse } from '../../src/main/services/learning/content/course'

const viewer = vi.hoisted(() => ({ props: undefined as unknown }))
const draftViewer = vi.hoisted(() => ({ code: '' }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({}))
vi.mock('@monaco-editor/react', () => ({ default: (props: { value: string; options: { readOnly: boolean; domReadOnly: boolean } }) => {
  viewer.props = props
  return <textarea aria-label="Source đã lưu (chỉ đọc)" value={props.value} readOnly={props.options.readOnly && props.options.domReadOnly} />
} }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange, readOnly }: { code: string; onChange(code: string): void; readOnly: boolean }) => {
    draftViewer.code = code
    return <textarea aria-label="Practice code" value={code} onChange={e => onChange(e.target.value)} readOnly={readOnly} />
  },
}))
vi.mock('../../src/renderer/src/features/learning/ChapterMaterial', () => ({ ChapterMaterial: () => null }))
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
const bytes = (code: string) => new TextEncoder().encode(code).byteLength
const sample = 'const text = "Tiếng Việt 😃 漢字";\r\nreturn text;'
const stores: SubmissionStores = { ACCEPTED: { state: 'AVAILABLE', readable: true }, FAILED: { state: 'AVAILABLE', readable: true } }
const row = (code = sample, language: ExerciseLanguage = 'csharp', n = 1): HistoryRow => ({
  key: { storeKind: 'ACCEPTED', recordId: id(n) }, submissionId: id(n), exerciseId: 'ch2-01', language,
  verdict: 'Accepted', submittedAt: '2026-10-26T12:30:00.000Z', source: { reference: `opaque_source_${n}`, revision: 7, byteLength: bytes(code) },
})
type Chunk = Extract<SubmissionSource, { ok: true }>
const chunk = (selection = row(), code = sample, changes: Partial<Chunk> = {}): Chunk => ({ ok: true, stores,
  reference: selection.source.reference, key: selection.key, submissionId: selection.submissionId, sourceRevision: selection.source.revision,
  offset: 0, nextOffset: bytes(code), totalBytes: selection.source.byteLength, eof: bytes(code) === selection.source.byteLength, code, ...changes })
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const fail = { ok: false as const, error: { code: 'INTERNAL_ERROR' as const, message: 'Expected=private JudgeResult C:\\private\\hidden', retryable: true } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function apiFixture(selection = row(), code = sample) {
  const api = {
    source: vi.fn<SubmissionApi['source']>().mockResolvedValue(ok(chunk(selection, code))),
    history: vi.fn<SubmissionApi['history']>().mockResolvedValue(ok({ ok: true, rows: [{ ...selection, packageVersion: 1 }], stores,
      coverage: 'COMPLETE', countScope: 'ALL_SELECTED', knownCount: 1, total: 1, nextCursor: null })),
    completion: vi.fn<SubmissionApi['completion']>().mockResolvedValue(ok({ ok: true, exerciseId: 'ch2-01', state: 'NOT_COMPLETED', accepted: { state: 'MISSING', readable: true } })),
    submit: vi.fn<SubmissionApi['submit']>(), status: vi.fn<SubmissionApi['status']>(), current: vi.fn<SubmissionApi['current']>(),
    retry: vi.fn<SubmissionApi['retry']>(), context: vi.fn<SubmissionApi['context']>().mockResolvedValue(ok(null)), onChanged: vi.fn(() => vi.fn()),
  }
  return api
}
function sourceFixture(selection = row(), code = sample, active = true) {
  const api = apiFixture(selection, code), initialProps = { row: selection, active }
  const hook = renderHook(props => useSubmissionSource(props.row, props.active, api), { initialProps })
  return { ...hook, api, initialProps }
}
async function flush() { await act(async () => {}) }
beforeEach(() => { viewer.props = undefined; vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('assembles contiguous UTF-8 chunks in order without exposing partial code, preserving CRLF and astral Unicode', async () => {
  const first = 'a'.repeat(32767), rest = '😃é漢\r\n', code = first + rest, selection = row(code)
  const f = sourceFixture(selection, code, false), last = deferred<AppResult<SubmissionSource>>()
  f.api.source.mockResolvedValueOnce(ok(chunk(selection, first, { eof: false }))).mockReturnValueOnce(last.promise)
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.result.current.view.phase).toBe('loading'); expect(f.result.current.view.code).toBeUndefined()
  expect(f.api.source).toHaveBeenLastCalledWith({ reference: selection.source.reference, offset: 32767, limit: 32768 })
  await act(async () => last.resolve(ok(chunk(selection, rest, { offset: 32767, nextOffset: bytes(code), eof: true }))))
  expect(f.result.current.view.code).toBe(code); expect(f.result.current.view.phase).toBe('ready')
})

it('accepts a committed empty source without treating it as missing', async () => {
  const f = sourceFixture(row(''), ''); await flush()
  expect(f.result.current.view).toMatchObject({ phase: 'ready', code: '', loadedBytes: 0 })
})

it.each(['reference', 'record', 'store', 'submission', 'revision', 'total', 'offset', 'bytes', 'eof', 'unicode', 'private', 'oversized'] as const)(
  'rejects a %s chunk violation without making source restorable', async violation => {
    const selection = row(), f = sourceFixture(selection, sample, false)
    const change = violation === 'reference' ? { reference: 'forged_ref' } : violation === 'record' ? { key: { ...selection.key, recordId: id(9) } }
      : violation === 'store' ? { key: { ...selection.key, storeKind: 'FAILED' as const } } : violation === 'submission' ? { submissionId: id(9) }
        : violation === 'revision' ? { sourceRevision: 999 } : violation === 'total' ? { totalBytes: bytes(sample) + 1, eof: false }
          : violation === 'offset' ? { offset: 1 } : violation === 'bytes' ? { nextOffset: 1 } : violation === 'eof' ? { eof: false }
            : violation === 'unicode' ? { code: '\ud83d' } : violation === 'private' ? { Expected: 'secret' } : { code: 'x'.repeat(32769), nextOffset: 32769, totalBytes: 32769 }
    f.api.source.mockResolvedValueOnce(ok({ ...chunk(selection), ...change }))
    f.rerender({ ...f.initialProps, active: true }); await flush()
    expect(f.result.current.view.phase).toBe('error'); expect(f.result.current.view.code).toBeUndefined()
    expect(f.result.current.view.error).not.toContain('secret')
  })

it.each(['NOT_FOUND', 'UNAVAILABLE', 'CONFLICT', 'IDENTITY_MISMATCH'] as const)('reports source %s without automatically replaying or exposing private errors', async reason => {
  const f = sourceFixture(row(), sample, false)
  f.api.source.mockResolvedValueOnce(ok({ ok: false, reason, stores }))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.result.current.view.phase).toBe('error'); expect(f.api.source).toHaveBeenCalledOnce()
  f.api.source.mockRejectedValueOnce(Error('Expected private C:\\hidden'))
  await act(async () => f.result.current.retry())
  expect(f.result.current.view.error).not.toContain('private')
})

it('drops partial code after a later read failure and retries from offset zero', async () => {
  const selection = row('ab'), f = sourceFixture(selection, 'ab', false)
  f.api.source.mockResolvedValueOnce(ok(chunk(selection, 'a', { eof: false }))).mockResolvedValueOnce(fail)
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.result.current.view.phase).toBe('error'); expect(f.result.current.view.code).toBeUndefined()
  f.api.source.mockResolvedValueOnce(ok(chunk(selection, 'ab')))
  await act(async () => f.result.current.retry())
  expect(f.api.source).toHaveBeenLastCalledWith({ reference: selection.source.reference, offset: 0, limit: 32768 })
  expect(f.result.current.view.code).toBe('ab')
})

it.each(['inactive', 'selection', 'unmount', 'pagehide'] as const)('suppresses stale %s source reads and does not dispatch another chunk', async change => {
  const f = sourceFixture(row('ab'), 'ab', false), old = deferred<AppResult<SubmissionSource>>()
  f.api.source.mockReturnValueOnce(old.promise)
  f.rerender({ ...f.initialProps, active: true })
  if (change === 'unmount') f.unmount()
  else if (change === 'inactive') f.rerender(f.initialProps)
  else if (change === 'pagehide') act(() => { window.dispatchEvent(new Event('pagehide')) })
  else {
    const next = row('new', 'javascript', 2)
    f.api.source.mockResolvedValueOnce(ok(chunk(next, 'new')))
    f.rerender({ row: next, active: true }); await flush()
  }
  await act(async () => old.resolve(ok(chunk(f.initialProps.row, 'a', { eof: false }))))
  expect(f.api.source).toHaveBeenCalledTimes(change === 'selection' ? 2 : 1)
  if (change === 'selection') expect(f.result.current.view.code).toBe('new')
})

it('requires the selected store to be readable but allows the other store to be unavailable', async () => {
  const f = sourceFixture(row(), sample, false)
  f.api.source.mockResolvedValueOnce(ok(chunk(row(), sample, { stores: { ACCEPTED: stores.ACCEPTED, FAILED: { state: 'CORRUPT', readable: false } } })))
  f.rerender({ ...f.initialProps, active: true }); await flush()
  expect(f.result.current.view.phase).toBe('ready')
  f.api.source.mockResolvedValueOnce(ok(chunk(row(), sample, { stores: { ACCEPTED: { state: 'UNAVAILABLE', readable: false }, FAILED: stores.FAILED } })))
  await act(async () => f.result.current.retry())
  expect(f.result.current.view.phase).toBe('error')
})

async function detailsFixture(code = sample, language: ExerciseLanguage = 'csharp') {
  const selection = row(code, language), api = apiFixture(selection, code)
  window.studentIde = { learning: { submission: api } } as unknown as StudentIdeApi
  const onRestore = vi.fn(() => true), onBack = vi.fn()
  const props = { row: selection, active: true, language: 'csharp' as ExerciseLanguage, sourceRevision: 4, draftCode: 'current draft', restoreBlocked: false, onRestore, onBack }
  const view = render(<SubmissionDetails {...props} />)
  await screen.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
  return { ...view, api, selection, props, onRestore, onBack }
}

it.each(['csharp', 'javascript'] as const)('uses a disposable read-only %s model with a namespace separate from Practice', async language => {
  const f = await detailsFixture(sample, language)
  const props = viewer.props as { language: string; path: string; keepCurrentModel: boolean; saveViewState: boolean; options: { readOnly: boolean; domReadOnly: boolean } }
  expect(props.language).toBe(language); expect(props.path).toMatch(/^submission-view:\/\//)
  expect(props.keepCurrentModel).toBe(false); expect(props.saveViewState).toBe(false)
  expect(props.options).toMatchObject({ readOnly: true, domReadOnly: true })
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Source đã lưu (chỉ đọc)' }).readOnly).toBe(true)
  expect(f.onRestore).not.toHaveBeenCalled()
})

it('does not render source as HTML, private errors or internal references', async () => {
  const f = await detailsFixture('<img src=x onerror=alert(1)>')
  expect(f.container.querySelector('img')).toBeNull()
  expect(f.container.textContent).not.toContain('opaque_source_')
  expect(f.container.textContent).not.toContain('JudgeResult')
})

it('requires confirmation, supports cancel and executes a confirmed restore only once', async () => {
  const f = await detailsFixture()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  expect(f.onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Hủy Restore' }))
  expect(f.onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  const confirm = screen.getByRole('button', { name: 'Xác nhận Restore' })
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm) })
  expect(f.onRestore).toHaveBeenCalledExactlyOnceWith({ exerciseId: 'ch2-01', language: 'csharp', code: sample,
    expectedLanguage: 'csharp', expectedDraftRevision: 4, expectedDraftCode: 'current draft' })
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
})

it('invalidates consent when the draft changes, and rejects a false result from the draft owner', async () => {
  const f = await detailsFixture()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  f.rerender(<SubmissionDetails {...f.props} sourceRevision={5} />)
  expect(screen.queryByRole('button', { name: 'Xác nhận Restore' })).toBeNull()
  expect(f.onRestore).not.toHaveBeenCalled()
  f.onRestore.mockReturnValueOnce(false)
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận Restore' }))
  expect(screen.getByRole('alert').textContent).toContain('Chưa thay thế source')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(false)
})

it('blocks restore during an operation/close and removes previous consent', async () => {
  const f = await detailsFixture()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  f.rerender(<SubmissionDetails {...f.props} restoreBlocked />)
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  f.rerender(<SubmissionDetails {...f.props} />)
  expect(screen.queryByRole('alertdialog')).toBeNull(); expect(f.onRestore).not.toHaveBeenCalled()
})

it('invalidates consent for changed draft text even when its revision number is unchanged', async () => {
  const f = await detailsFixture()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  f.rerender(<SubmissionDetails {...f.props} draftCode="reloaded draft at same revision" />)
  expect(screen.queryByRole('button', { name: 'Xác nhận Restore' })).toBeNull()
  expect(f.onRestore).not.toHaveBeenCalled()
})

it('restores a verified empty source only after confirmation', async () => {
  const f = await detailsFixture('')
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  expect(f.onRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận Restore' }))
  expect(f.onRestore).toHaveBeenCalledWith(expect.objectContaining({ code: '' }))
})

it('allows viewing and explicitly restoring a committed Failed source without treating its verdict as completion', async () => {
  const selection: HistoryRow = { ...row(), key: { storeKind: 'FAILED', recordId: id(1) }, verdict: 'CompilationError' }
  const api = apiFixture(selection), onRestore = vi.fn(() => true)
  window.studentIde = { learning: { submission: api } } as unknown as StudentIdeApi
  render(<SubmissionDetails row={selection} active language="csharp" sourceRevision={1} draftCode="draft" restoreBlocked={false} onBack={vi.fn()} onRestore={onRestore} />)
  await screen.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
  expect(screen.getByText('Compilation Error')).toBeTruthy(); expect(screen.getByText(/saved · Failed/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận Restore' }))
  expect(onRestore).toHaveBeenCalledOnce(); expect(api.completion).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled()
})

it('retires ready source and consent on pagehide without restoring from a stale view', async () => {
  const f = await detailsFixture()
  fireEvent.click(screen.getByRole('button', { name: 'Restore to Editor' }))
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  expect(f.onRestore).not.toHaveBeenCalled()
})

async function workspaceFixture(language: ExerciseLanguage = 'csharp', code = sample) {
  const selection = row(code, language), api = apiFixture(selection, code)
  let state: PracticeState = { drafts: [
    { exerciseId: 'ch2-01', language: 'csharp', code: 'current C# draft' },
    { exerciseId: 'ch2-01', language: 'javascript', code: 'current JS draft' },
  ], languages: [{ exerciseId: 'ch2-01', language: 'csharp' }] }
  const save = vi.fn(async (draft: PracticeState['drafts'][number]) => {
    state = { drafts: [...state.drafts.filter(d => d.exerciseId !== draft.exerciseId || d.language !== draft.language), draft],
      languages: [...state.languages.filter(l => l.exerciseId !== draft.exerciseId), { exerciseId: draft.exerciseId, language: draft.language }] }
    return ok(null)
  })
  const run = vi.fn<ExerciseApi['run']>().mockResolvedValue(fail), stop = vi.fn<ExerciseApi['stop']>()
  let close!: (token: string) => void
  window.studentIde = { learning: { submission: api, getCourse: vi.fn(async () => ok(getBundledCourse())),
    exercise: { run, stop, snapshot: vi.fn(), onChanged: () => () => {} },
    practice: { ...pagedPracticeFixture(exercises, () => state), save,
      onPrepareClose: (fn: typeof close) => { close = fn; return () => {} }, onResume: () => () => {}, resolveClose: vi.fn(async () => ok(null)) },
  } } as unknown as StudentIdeApi
  const props = { selectedChapterId: 2 as const, sidebarCollapsed: false, onSelectChapter: vi.fn(), active: true }
  const view = render(<LearningWorkspace {...props} />)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Nội dung học tập' })).getByRole('tab', { name: 'Luyện tập' }))
  fireEvent.click(await screen.findByRole('button', { name: /Tổng hai số/ }))
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
  const workspace = within(editor.closest<HTMLElement>('.practice-workspace')!)
  fireEvent.click(workspace.getByRole('tab', { name: 'Submissions' }))
  await workspace.findByRole('button', { name: 'Chi tiết' })
  const openDetails = async (waitForSource = true) => {
    fireEvent.click(workspace.getByRole('button', { name: 'Chi tiết' }))
    const details = within(workspace.getByRole('region', { name: 'Submission Details' }))
    if (waitForSource) await details.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
    return details
  }
  return { ...view, props, api, selection, editor, workspace, openDetails, save, run, stop, close: () => close('synthetic-close'), state: () => state }
}

it('selects Details and returns to the same History without changing the editor or operation state', async () => {
  const f = await workspaceFixture(), details = await f.openDetails()
  expect(details.getByText('Accepted')).toBeTruthy(); expect(details.getByText('C#')).toBeTruthy()
  expect(details.getByText(/saved · Accepted/)).toBeTruthy()
  expect(f.editor.value).toBe('current C# draft')
  fireEvent.click(details.getByRole('button', { name: '← History' }))
  expect(f.workspace.getByRole('table')).toBeTruthy()
  expect(f.workspace.getByRole('textbox', { name: 'Practice code' })).toBe(f.editor)
  expect(f.api.history).toHaveBeenCalledOnce(); expect(f.save).not.toHaveBeenCalled()
  expect(f.run).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled(); expect(f.api.submit).not.toHaveBeenCalled()
  expect(f.api.context).not.toHaveBeenCalled()
})

it.each(['csharp', 'javascript'] as const)('restores the confirmed %s source to the correct draft, preserving the other language and never submitting', async language => {
  const f = await workspaceFixture(language), details = await f.openDetails()
  fireEvent.click(details.getByRole('button', { name: 'Restore to Editor' }))
  expect(f.editor.value).toBe('current C# draft')
  if (language === 'javascript') expect(details.getByText(/Editor sẽ chuyển sang JavaScript/)).toBeTruthy()
  fireEvent.click(details.getByRole('button', { name: 'Xác nhận Restore' }))
  // HTML textarea normalizes CRLF in .value; the real editor input and saved draft must retain the original bytes.
  await waitFor(() => expect(f.workspace.getByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' }).value).toBe(sample.replace(/\r\n/g, '\n')))
  expect(draftViewer.code).toBe(sample)
  expect(f.workspace.getByRole<HTMLSelectElement>('combobox').value).toBe(language)
  await waitFor(() => expect(f.save).toHaveBeenCalledWith({ exerciseId: 'ch2-01', language, code: sample }))
  expect(f.state().drafts.find(d => d.language !== language)?.code).toBe(language === 'csharp' ? 'current JS draft' : 'current C# draft')
  expect(f.api.submit).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled()
})

it('requires a new confirmation after an editor edit instead of overwriting the newer draft', async () => {
  const f = await workspaceFixture(), details = await f.openDetails()
  fireEvent.click(details.getByRole('button', { name: 'Restore to Editor' }))
  fireEvent.change(f.editor, { target: { value: 'newer unsaved draft' } })
  expect(details.queryByRole('button', { name: 'Xác nhận Restore' })).toBeNull()
  expect(f.editor.value).toBe('newer unsaved draft')
  fireEvent.click(details.getByRole('button', { name: 'Restore to Editor' }))
  fireEvent.click(details.getByRole('button', { name: 'Hủy Restore' }))
  expect(f.editor.value).toBe('newer unsaved draft')
})

it('does not restore through an old UI callback after the draft owner synchronously locks for close', async () => {
  const f = await workspaceFixture(), details = await f.openDetails()
  fireEvent.click(details.getByRole('button', { name: 'Restore to Editor' }))
  const confirm = details.getByRole('button', { name: 'Xác nhận Restore' })
  await act(async () => { f.close(); fireEvent.click(confirm) })
  expect(f.editor.value).toBe('current C# draft')
  expect(f.save.mock.calls.some(([draft]) => draft.code === sample)).toBe(false)
})

it.each(['back', 'description', 'language', 'inactive', 'close'] as const)('preserves drafts on %s while a source request is unresolved and ignores its late reply', async change => {
  const f = await workspaceFixture(), source = deferred<AppResult<SubmissionSource>>()
  f.api.source.mockReturnValueOnce(source.promise)
  const details = await f.openDetails(false)
  expect(details.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  if (change === 'back') fireEvent.click(details.getByRole('button', { name: '← History' }))
  else if (change === 'description') fireEvent.click(f.workspace.getByRole('tab', { name: 'Description' }))
  else if (change === 'language') { fireEvent.change(f.workspace.getByRole('combobox'), { target: { value: 'javascript' } }); await flush() }
  else if (change === 'inactive') f.rerender(<LearningWorkspace {...f.props} active={false} />)
  else await act(async () => f.close())
  await act(async () => source.resolve(ok(chunk(f.selection))))
  expect(screen.queryByRole('region', { name: 'Submission Details' })).toBeNull()
  expect(f.workspace.getByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' }).value).toBe(change === 'language' ? 'current JS draft' : 'current C# draft')
  expect(f.save.mock.calls.some(([draft]) => draft.code === sample)).toBe(false)
  expect(f.api.submit).not.toHaveBeenCalled()
})

it('suppresses old-exercise source after navigating to a different exercise', async () => {
  const f = await workspaceFixture(), source = deferred<AppResult<SubmissionSource>>()
  f.api.source.mockReturnValueOnce(source.promise); await f.openDetails(false)
  fireEvent.click(f.workspace.getByRole('button', { name: 'Về danh sách bài tập' }))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(exercises[1].title) }))
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
  await act(async () => source.resolve(ok(chunk(f.selection))))
  expect(editor.value).toBe(exercises[1].languages.csharp.starter)
  expect(screen.queryByRole('region', { name: 'Submission Details' })).toBeNull()
  expect(f.save.mock.calls.some(([draft]) => draft.code === sample)).toBe(false)
})

it('shows missing/corrupt source and recovery/partial availability without enabling a failed read for Restore', async () => {
  const f = await workspaceFixture()
  f.api.source.mockResolvedValueOnce(ok({ ok: false, reason: 'UNAVAILABLE', stores: { ACCEPTED: { state: 'CORRUPT', readable: false }, FAILED: stores.FAILED } }))
  const details = await f.openDetails(false); await details.findByRole('alert')
  expect(details.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  f.api.source.mockResolvedValueOnce(ok(chunk(f.selection, sample, { stores: { ACCEPTED: { state: 'RECOVERED', readable: true, warning: 'POSSIBLE_DATA_LOSS' }, FAILED: { state: 'UNAVAILABLE', readable: false } } })))
  fireEvent.click(details.getByRole('button', { name: 'Đọc lại source' }))
  await details.findByRole('textbox', { name: 'Source đã lưu (chỉ đọc)' })
  expect(details.getByText(/POSSIBLE_DATA_LOSS/)).toBeTruthy(); expect(details.getByText(/Một phần kho không đọc được/)).toBeTruthy()
  expect(f.editor.value).toBe('current C# draft')
})

it.each(['Run', 'Submit'] as const)('views source without disturbing in-flight %s and blocks Restore', async action => {
  const f = await workspaceFixture(), pending = deferred<never>()
  if (action === 'Run') f.run.mockReturnValueOnce(pending.promise)
  else f.api.submit.mockReturnValueOnce(pending.promise)
  fireEvent.click(f.workspace.getByRole('button', { name: action }))
  if (action === 'Submit') {
    expect(f.workspace.getByRole('status', { name: 'Đang chấm bài' })).toBeTruthy()
    expect(f.workspace.queryByRole('region', { name: 'Submission Details' })).toBeNull()
    expect(f.editor.value).toBe('current C# draft')
    expect(f.run).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled()
    return
  }
  const details = await f.openDetails()
  expect(details.getByRole<HTMLButtonElement>('button', { name: 'Restore to Editor' }).disabled).toBe(true)
  fireEvent.click(details.getByRole('button', { name: '← History' }))
  expect(f.api.context).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled()
  expect(f.editor.value).toBe('current C# draft')
})
