/** @vitest-environment jsdom */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { PracticeState } from '../../src/shared/contracts/practice'
import type { ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { pagedPracticeFixture } from '../fixtures/learning/practice-api'
import { getBundledCourse } from '../../src/main/services/learning/content/course'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { MySolutions, type SavedAcceptedView } from '../../src/renderer/src/features/learning/practice/MySolutions'
import type { ChapterId } from '../../src/renderer/src/features/learning/chapters'

vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange, readOnly }: { code: string; onChange(code: string): void; readOnly: boolean }) =>
    <textarea aria-label="Practice code" value={code} readOnly={readOnly} onChange={e => onChange(e.target.value)} />,
}))
vi.mock('../../src/renderer/src/features/learning/highlight-csharp', () => ({ highlightCsharp: async () => [] }))
// Practice lifecycle is tested here; real material rendering has its own regression suites.
vi.mock('../../src/renderer/src/features/learning/ChapterMaterial', () => ({
  ChapterMaterial: ({ chapter }: { chapter: { order: number; title: string } }) => <h1>Chương {chapter.order} — {chapter.title}</h1>,
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
let persisted: PracticeState
let close: (token: string) => void
let resume: () => void
const resolveClose = vi.fn(async () => ({ ok: true as const, value: null }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() })
  persisted = { drafts: [], languages: [] }; resolveClose.mockClear()
  window.studentIde = { learning: {
    getCourse: vi.fn(async () => ({ ok: true, value: getBundledCourse() })),
    exercise: {
      run: vi.fn(async () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'Backend unavailable', retryable: false } })),
      snapshot: vi.fn(async () => ({ ok: false, error: { code: 'PERMISSION_DENIED', message: 'No session', retryable: false } })),
      stop: vi.fn(async () => ({ ok: false, error: { code: 'PERMISSION_DENIED', message: 'No session', retryable: false } })),
      onChanged: vi.fn(() => vi.fn()),
    },
    practice: {
      ...pagedPracticeFixture(exercises, () => persisted),
      load: vi.fn(async () => ({ ok: true, value: { exercises, state: structuredClone(persisted), recovered: false } })),
      save: vi.fn(async draft => {
        persisted = { drafts: [...persisted.drafts.filter(d => d.exerciseId !== draft.exerciseId || d.language !== draft.language), draft],
          languages: [...persisted.languages.filter(l => l.exerciseId !== draft.exerciseId), { exerciseId: draft.exerciseId, language: draft.language }] }
        return { ok: true, value: null }
      }),
      onPrepareClose: fn => { close = fn; return vi.fn() },
      onResume: fn => { resume = fn; return vi.fn() }, resolveClose,
    },
  } } as StudentIdeApi
})
function Harness({ active = true }: { active?: boolean }) {
  const [chapter, select] = useState<ChapterId>(2)
  return <LearningWorkspace active={active} selectedChapterId={chapter} onSelectChapter={select} sidebarCollapsed={false} />
}
async function openFirst() {
  const navigation = within(screen.getByRole('navigation', { name: 'Nội dung học tập' }))
  fireEvent.click(navigation.getByRole('tab', { name: 'Luyện tập' }))
  const list = within(await screen.findByRole('region', { name: 'Bài tập chương 2' }))
  fireEvent.click(list.getByRole('button', { name: /Tổng hai số/ }))
  return screen.findByRole('textbox', { name: 'Practice code' })
}

it('keeps the draft indicator when returning from the editor to the package summary list', async () => {
  render(<Harness />)
  const editor = await openFirst()
  fireEvent.change(editor, { target: { value: '// retained draft' } })
  fireEvent.click(screen.getByRole('button', { name: '← Danh sách' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Tổng hai số/ }).textContent).toContain('Có bản nháp'))
})

it('reports unavailable package summaries truthfully and permits explicit retry', async () => {
  vi.spyOn(window.studentIde.learning.practice, 'list').mockResolvedValueOnce({ ok: true, value: {
    items: [{ id: 'unavailable-64', chapter: null, title: 'unavailable-64', difficulty: null, hasDraft: true, available: false }], nextCursor: null, recovered: false,
  } })
  render(<Harness />)
  await screen.findByText('Một số bài tập không khả dụng. Hãy thử tải lại.')
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại lưu / tải' }))
  const navigation = within(screen.getByRole('navigation', { name: 'Nội dung học tập' }))
  fireEvent.click(navigation.getByRole('tab', { name: 'Luyện tập' }))
  await screen.findByRole('button', { name: /Tổng hai số/ })
  expect(screen.queryByText('Một số bài tập không khả dụng. Hãy thử tải lại.')).toBeNull()
})
// The real eight theory pages stay mounted. Query the active Practice surface,
// rather than repeatedly computing accessibility across unrelated hidden content.
function workspace(editor: HTMLElement) {
  return within(editor.closest<HTMLElement>('.practice-workspace')!)
}
async function changeLanguage(editor: HTMLElement, language: 'csharp' | 'javascript') {
  const select = workspace(editor).getByRole<HTMLSelectElement>('combobox')
  fireEvent.change(select, { target: { value: language } })
  await waitFor(() => expect(select.value).toBe(language))
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
}
it('switches beUI tabs with keyboard support and keeps Practice selected when draft saving fails', async () => {
  const view = render(<Harness />)
  const editor = await openFirst() as HTMLTextAreaElement
  const tabs = within(view.container.querySelector<HTMLElement>('[role="tablist"]')!)
  const theory = tabs.getByRole('tab', { name: 'Tài liệu' })
  const practice = tabs.getByRole('tab', { name: 'Luyện tập' })
  expect(practice.getAttribute('aria-selected')).toBe('true')
  expect(practice.tabIndex).toBe(0)
  expect(theory.tabIndex).toBe(-1)
  expect(document.getElementById(practice.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('tabpanel')
  const theoryPages = view.container.querySelector<HTMLElement>('.learning-pages')!
  const theoryPage = theoryPages.querySelector<HTMLElement>('[aria-label="Nội dung chương 2"]')!
  theoryPage.scrollTop = 320
  fireEvent.change(editor, { target: { value: '// guarded tab draft' } })
  vi.mocked(window.studentIde.learning.practice.save).mockRejectedValueOnce(new Error('save unavailable'))
  await act(async () => { fireEvent.click(theory) })
  expect(practice.getAttribute('aria-selected')).toBe('true')
  expect(editor.value).toBe('// guarded tab draft')
  expect(theoryPages.hidden).toBe(true)
  await act(async () => { fireEvent.click(theory) })
  expect(theory.getAttribute('aria-selected')).toBe('true')
  expect(theoryPages.hidden).toBe(false)
  expect(theoryPage.scrollTop).toBe(320)
  expect(persisted.drafts[0].code).toBe('// guarded tab draft')
  fireEvent.keyDown(theory, { key: 'End' })
  expect(practice.getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(practice)
  expect((await screen.findByRole('textbox', { name: 'Practice code' }) as HTMLTextAreaElement).value).toBe('// guarded tab draft')
  fireEvent.keyDown(practice, { key: 'Home' })
  expect(theory.getAttribute('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(theory)
})
it('switches C# → JavaScript → C# without losing independent drafts, including empty code', async () => {
  render(<Harness />)
  let editor = await openFirst() as HTMLTextAreaElement
  expect(workspace(editor).getByRole<HTMLSelectElement>('combobox').value).toBe('csharp')
  expect(editor.value).toBe(exercises[0].languages.csharp.starter)
  fireEvent.change(editor, { target: { value: '// C# draft' } })
  editor = await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe(exercises[0].languages.javascript.starter)
  fireEvent.change(editor, { target: { value: '' } })
  editor = await changeLanguage(editor, 'csharp')
  expect(editor.value).toBe('// C# draft')
  editor = await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe('')
})
it('cancels Reset without edits and confirms Reset for the current language only', async () => {
  persisted = {
    drafts: [{ exerciseId: 'ch2-01', language: 'csharp', code: '// C# draft' },
      { exerciseId: 'ch2-01', language: 'javascript', code: '// JS draft' }],
    languages: [{ exerciseId: 'ch2-01', language: 'csharp' }],
  }
  render(<Harness />)
  let editor = await openFirst() as HTMLTextAreaElement
  const practice = workspace(editor)
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  expect(practice.getByRole('alertdialog', { name: 'Xác nhận Reset Code' })).toBeTruthy()
  expect(editor.value).toBe('// C# draft')
  fireEvent.click(practice.getByRole('button', { name: 'Hủy' }))
  expect(editor.value).toBe('// C# draft')
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Xác nhận Reset' }))
  expect(editor.value).toBe(exercises[0].languages.csharp.starter)
  editor = await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe('// JS draft')
  expect(persisted.drafts.find(d => d.language === 'csharp')?.code).toBe(exercises[0].languages.csharp.starter)
})
it('persists both drafts and last language before reopening a fresh workspace', async () => {
  const view = render(<Harness />)
  let editor = await openFirst() as HTMLTextAreaElement
  fireEvent.change(editor, { target: { value: '// restart C#' } })
  editor = await changeLanguage(editor, 'javascript')
  fireEvent.change(editor, { target: { value: '// restart JS' } })
  fireEvent.click(workspace(editor).getByRole('button', { name: '← Danh sách' }))
  await screen.findByRole('region', { name: 'Bài tập chương 2' })
  expect(persisted.drafts.find(d => d.language === 'csharp')?.code).toBe('// restart C#')
  expect(persisted.drafts.find(d => d.language === 'javascript')?.code).toBe('// restart JS')
  expect(persisted.languages).toEqual([{ exerciseId: 'ch2-01', language: 'javascript' }])
  view.unmount(); render(<Harness />)
  let restored = await openFirst() as HTMLTextAreaElement
  expect(workspace(restored).getByRole<HTMLSelectElement>('combobox').value).toBe('javascript')
  expect(restored.value).toBe('// restart JS')
  restored = await changeLanguage(restored, 'csharp')
  expect(restored.value).toBe('// restart C#')
})
it('lists 9 exercises by difficulty, isolates languages, confirms Reset and restores drafts on restart', async () => {
  const view = render(<Harness />)
  let editor = await openFirst()
  const practice = workspace(editor)
  expect((practice.getByRole('combobox') as HTMLSelectElement).value).toBe('csharp')
  expect((editor as HTMLTextAreaElement).value).toBe(exercises[0].languages.csharp.starter)
  fireEvent.change(editor, { target: { value: '// student cs' } })
  editor = await changeLanguage(editor, 'javascript')
  fireEvent.change(editor, { target: { value: '// student js' } })
  editor = await changeLanguage(editor, 'csharp')
  await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe('// student cs'))
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Hủy' }))
  expect((editor as HTMLTextAreaElement).value).toBe('// student cs')
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Xác nhận Reset' }))
  expect((editor as HTMLTextAreaElement).value).toBe(exercises[0].languages.csharp.starter)
  editor = await changeLanguage(editor, 'javascript')
  await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe('// student js'))
  fireEvent.click(practice.getByRole('button', { name: '← Danh sách' }))
  const list = within(await screen.findByRole('region', { name: 'Bài tập chương 2' }))
  expect(list.getByRole('button', { name: /Tổng hai số/ })).toBeTruthy()
  expect(list.getAllByRole('button', { name: /bản nháp/ })).toHaveLength(9)
  expect(persisted.languages.find(l => l.exerciseId === exercises[0].id)?.language).toBe('javascript')
  view.unmount(); render(<Harness />)
  const restored = await openFirst()
  expect((restored as HTMLTextAreaElement).value).toBe('// student js')
  expect((workspace(restored).getByRole('combobox') as HTMLSelectElement).value).toBe('javascript')
})
it('flushes on chapter/mode transitions and application close, keeps the editor isolated and unexecuted', async () => {
  const view = render(<Harness />)
  let editor = await openFirst()
  fireEvent.change(editor, { target: { value: '// retained' } })
  fireEvent.click(screen.getByRole('button', { name: 'Chương 3: Cấu trúc rẽ nhánh' }))
  await screen.findByRole('heading', { name: 'Chương 3 — Cấu trúc rẽ nhánh' })
  expect(persisted.drafts[0].code).toBe('// retained')
  fireEvent.click(screen.getByRole('button', { name: 'Chương 2: Kiến thức lập trình cơ bản' }))
  editor = await screen.findByRole('textbox', { name: 'Practice code' })
  expect((editor as HTMLTextAreaElement).value).toBe('// retained')
  fireEvent.change(editor, { target: { value: '// before hiding' } })
  view.rerender(<Harness active={false} />)
  await waitFor(() => expect(persisted.drafts[0].code).toBe('// before hiding'))
  view.rerender(<Harness active />)
  fireEvent.change(editor, { target: { value: '// just before close' } })
  await act(async () => close('11111111-1111-1111-1111-111111111111'))
  await waitFor(() => expect(resolveClose).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', true))
  expect(persisted.drafts[0].code).toBe('// just before close')
  expect((editor as HTMLTextAreaElement).readOnly).toBe(true)
  await act(async () => resume())
  await waitFor(() => expect((editor as HTMLTextAreaElement).readOnly).toBe(false))
  expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText(/^Accepted ·/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Test Result' }))
  expect(screen.getByText('Nhấn Run để xem kết quả kiểm thử')).toBeTruthy()
})
it('shows icon-only Run/Reset and LeetCode-style sample cases without execution results', async () => {
  render(<Harness />)
  const editor = await openFirst()
  const practice = workspace(editor)
  const run = practice.getByRole<HTMLButtonElement>('button', { name: 'Run' })
  const reset = practice.getByRole<HTMLButtonElement>('button', { name: 'Reset Code' })
  expect(run.disabled).toBe(false)
  expect(run.textContent).toBe('')
  expect(run.querySelector('svg')).toBeTruthy()
  expect(reset.textContent).toBe('')
  expect(reset.querySelector('svg')).toBeTruthy()
  const cases = within(practice.getByRole('region', { name: 'Testcase' }))
  expect(cases.getByRole('button', { name: 'Case 1' }).getAttribute('aria-pressed')).toBe('true')
  expect(cases.getByLabelText('Input a').textContent).toBe('14')
  expect(cases.getByLabelText('Input b').textContent).toBe('-6')
  expect(cases.getByLabelText('Expected output').textContent).toBe('8')
  fireEvent.click(cases.getByRole('button', { name: 'Case 2' }))
  expect(cases.getByRole('button', { name: 'Case 2' }).getAttribute('aria-pressed')).toBe('true')
  expect(cases.getByLabelText('Input a').textContent).toBe('0')
  expect(cases.getByLabelText('Input b').textContent).toBe('0')
  expect(cases.getByLabelText('Expected output').textContent).toBe('0')
  fireEvent.click(practice.getByRole('button', { name: 'Test Result' }))
  expect(practice.queryByRole('region', { name: 'Testcase' })).toBeNull()
  const result = within(practice.getByRole('region', { name: 'Test Result' }))
  expect(result.getByText('Nhấn Run để xem kết quả kiểm thử')).toBeTruthy()
  expect(result.queryByRole('tab')).toBeNull()
  fireEvent.click(practice.getByRole('button', { name: 'Testcase' }))
  expect(cases.getByRole('button', { name: 'Case 2' }).getAttribute('aria-pressed')).toBe('true')
})
it('collapses, opens and expands the test dock while retaining the editor and chosen case', async () => {
  render(<Harness />)
  const editor = await openFirst() as HTMLTextAreaElement
  const practice = workspace(editor)
  fireEvent.change(editor, { target: { value: '// dock draft' } })
  fireEvent.click(practice.getByRole('button', { name: 'Case 2' }))
  fireEvent.click(practice.getByRole('button', { name: 'Thu gọn Testcase / Test Result' }))
  expect(practice.queryByRole('region', { name: 'Testcase' })).toBeNull()
  expect(practice.getByRole('button', { name: 'Mở Testcase / Test Result' }).getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(practice.getByRole('button', { name: 'Mở Testcase / Test Result' }))
  expect(practice.getByRole('button', { name: 'Case 2' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(practice.getByRole('button', { name: 'Phóng to panel kiểm thử' }))
  expect(practice.queryByRole('textbox', { name: 'Practice code' })).toBeNull()
  expect(practice.getByRole('region', { name: 'Testcase' })).toBeTruthy()
  expect(editor.isConnected).toBe(true)
  fireEvent.click(practice.getByRole('button', { name: 'Khôi phục kích thước panel' }))
  expect(practice.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
  expect(editor.value).toBe('// dock draft')
  fireEvent.click(practice.getByRole('button', { name: 'Thu gọn Testcase / Test Result' }))
  fireEvent.click(practice.getByRole('button', { name: 'Test Result' }))
  expect(practice.getByRole('region', { name: 'Test Result' })).toBeTruthy()
  expect(practice.getByRole('button', { name: 'Thu gọn Testcase / Test Result' }).getAttribute('aria-expanded')).toBe('true')
})
it('docks across the workspace bottom and restores the editor dock without losing code or test selection', async () => {
  render(<Harness />)
  const editor = await openFirst() as HTMLTextAreaElement
  const practice = workspace(editor)
  fireEvent.change(editor, { target: { value: '// keep across docking' } })
  fireEvent.click(practice.getByRole('button', { name: 'Case 2' }))
  fireEvent.click(practice.getByRole('button', { name: 'Dock xuống dưới workspace' }))
  const panel = practice.getByRole('region', { name: 'Test Cases và kết quả' })
  expect(panel.parentElement?.classList.contains('practice-split')).toBe(true)
  expect(practice.getByRole('button', { name: 'Case 2' }).getAttribute('aria-pressed')).toBe('true')
  expect(practice.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
  fireEvent.click(practice.getByRole('button', { name: 'Phóng to panel kiểm thử' }))
  expect(practice.queryByRole('article', { name: 'Description' })).toBeNull()
  expect(practice.queryByRole('textbox', { name: 'Practice code' })).toBeNull()
  expect(practice.getByRole('region', { name: 'Testcase' })).toBeTruthy()
  fireEvent.click(practice.getByRole('button', { name: 'Khôi phục kích thước panel' }))
  expect(practice.getByRole('article', { name: 'Description' })).toBeTruthy()
  fireEvent.click(practice.getByRole('button', { name: 'Dock dưới Code Editor' }))
  expect(practice.getByRole('region', { name: 'Test Cases và kết quả' }).parentElement?.classList.contains('practice-code-column')).toBe(true)
  expect(practice.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
  expect(editor.value).toBe('// keep across docking')
  expect(practice.getByRole('button', { name: 'Case 2' }).getAttribute('aria-pressed')).toBe('true')
})
it('filters My Solutions and confirms before restoring saved Accepted code', () => {
  const restore = vi.fn()
  render(<MySolutions disabled={false} onRestore={restore} solutions={[
    { id: 'saved', language: 'csharp', code: '// accepted', verdict: 'Accepted', saved: true },
    { id: 'unsaved', language: 'csharp', code: '// uncommitted', verdict: 'Accepted', saved: false },
    { id: 'failed', language: 'csharp', code: '// failed', verdict: 'Wrong Answer', saved: true },
  ] as SavedAcceptedView[]} />)
  expect(screen.queryByRole('button', { name: /unsaved|failed/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Accepted · saved' }))
  expect(screen.getByLabelText('Code Accepted').textContent).toBe('// accepted')
  fireEvent.click(screen.getByRole('button', { name: 'Restore Accepted Solution' }))
  expect(restore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' })); expect(restore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restore Accepted Solution' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận Restore' }))
  expect(restore).toHaveBeenCalledWith('// accepted')
})

it('runs captured exercise code through the bridge and shows UNSUPPORTED without a fake result or Stop/Submit control', async () => {
  render(<Harness />)
  const editor = await openFirst()
  fireEvent.change(editor, { target: { value: '// captured source' } })
  fireEvent.click(workspace(editor).getByRole('button', { name: 'Run' }))
  await waitFor(() => expect(workspace(editor).getByRole('alert').textContent).toContain('chưa có backend thực thi'))
  expect(window.studentIde.learning.exercise.run).toHaveBeenCalledWith({ exerciseId: 'ch2-01', language: 'csharp', code: '// captured source', sourceRevision: expect.any(Number) })
  expect(workspace(editor).getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(true)
  expect(workspace(editor).queryByRole('button', { name: /^(Stop|Cancel)$/ })).toBeNull()
  expect(within(workspace(editor).getByRole('region', { name: 'Test Result' })).queryByText(/Đã kết thúc thực thi|Accepted/)).toBeNull()
})

it('renders running/pending cleanup safely, cancels on language change and ignores a late old-session event', async () => {
  const api = window.studentIde.learning.exercise
  let snapshot!: ExerciseSnapshot
  vi.mocked(api.run).mockImplementation(async r => {
    snapshot = { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1, sequence: 1,
      exerciseId: r.exerciseId, language: r.language, sourceRevision: r.sourceRevision, phase: 'execute', reason: null,
      stdout: '<img src=x onerror=alert(1)>', stderr: '', cleanup: { state: 'NOT_STARTED', proof: 'PENDING', processClean: false,
        cleanupComplete: false, workspace: 'RETAINED', pendingIo: false } }
    return { ok: true, value: snapshot }
  })
  vi.mocked(api.snapshot).mockImplementation(async () => ({ ok: true, value: snapshot }))
  render(<Harness />)
  const editor = await openFirst(), practice = workspace(editor)
  fireEvent.click(practice.getByRole('button', { name: 'Run' }))
  await waitFor(() => expect(practice.getByRole('status', { name: 'Đang kiểm thử' })).toBeTruthy())
  expect(practice.getByRole<HTMLButtonElement>('button', { name: 'Run' }).disabled).toBe(true)
  expect(practice.queryByText('<img src=x onerror=alert(1)>')).toBeNull()
  const oldEvent = vi.mocked(api.onChanged).mock.calls.at(-1)![0]
  await act(async () => oldEvent({ ...snapshot, sequence: 2, phase: 'cleanup', reason: 'EXECUTE_TIMEOUT', cleanup: {
    state: 'PENDING', proof: 'PENDING', processClean: false, cleanupComplete: false, workspace: 'RETAINED', pendingIo: true,
  } }))
  expect(practice.getByRole('status', { name: 'Đang kiểm thử' })).toBeTruthy()
  await changeLanguage(editor, 'javascript')
  expect(api.stop).toHaveBeenCalledWith({ sessionId: snapshot.sessionId, generation: 1, reason: 'CONTEXT_CHANGED' })
  await act(async () => oldEvent({ ...snapshot, sequence: 3, stdout: 'old output' }))
  expect(practice.queryByText('old output')).toBeNull()
  expect(practice.getByRole('status').textContent).toBe('Nhấn Run để xem kết quả kiểm thử')
})
