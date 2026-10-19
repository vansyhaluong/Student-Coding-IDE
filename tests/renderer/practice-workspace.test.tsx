/** @vitest-environment jsdom */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { PracticeState } from '../../src/shared/contracts/practice'
import { exercises } from '../../src/main/services/learning/content/exercises'
import { getBundledCourse } from '../../src/main/services/learning/content/course'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { MySolutions, type SavedAcceptedView } from '../../src/renderer/src/features/learning/practice/MySolutions'
import type { ChapterId } from '../../src/renderer/src/features/learning/chapters'

vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange, readOnly }: { code: string; onChange(code: string): void; readOnly: boolean }) =>
    <textarea aria-label="Practice code" value={code} readOnly={readOnly} onChange={e => onChange(e.target.value)} />,
}))
vi.mock('../../src/renderer/src/features/learning/highlight-csharp', () => ({ highlightCsharp: async () => [] }))
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
    practice: {
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
// The real eight theory pages stay mounted. Query the active Practice surface,
// rather than repeatedly computing accessibility across unrelated hidden content.
function workspace(editor: HTMLElement) {
  return within(editor.closest<HTMLElement>('.practice-workspace')!)
}
async function changeLanguage(editor: HTMLElement, language: 'csharp' | 'javascript') {
  const select = workspace(editor).getByRole<HTMLSelectElement>('combobox')
  fireEvent.change(select, { target: { value: language } })
  await waitFor(() => expect(select.value).toBe(language))
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
  const editor = await openFirst() as HTMLTextAreaElement
  expect(workspace(editor).getByRole<HTMLSelectElement>('combobox').value).toBe('csharp')
  expect(editor.value).toBe(exercises[0].languages.csharp.starter)
  fireEvent.change(editor, { target: { value: '// C# draft' } })
  await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe(exercises[0].languages.javascript.starter)
  fireEvent.change(editor, { target: { value: '' } })
  await changeLanguage(editor, 'csharp')
  expect(editor.value).toBe('// C# draft')
  await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe('')
})
it('cancels Reset without edits and confirms Reset for the current language only', async () => {
  persisted = {
    drafts: [{ exerciseId: 'ch2-01', language: 'csharp', code: '// C# draft' },
      { exerciseId: 'ch2-01', language: 'javascript', code: '// JS draft' }],
    languages: [{ exerciseId: 'ch2-01', language: 'csharp' }],
  }
  render(<Harness />)
  const editor = await openFirst() as HTMLTextAreaElement
  const practice = workspace(editor)
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  expect(practice.getByRole('alertdialog', { name: 'Xác nhận Reset Code' })).toBeTruthy()
  expect(editor.value).toBe('// C# draft')
  fireEvent.click(practice.getByRole('button', { name: 'Hủy' }))
  expect(editor.value).toBe('// C# draft')
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Xác nhận Reset' }))
  expect(editor.value).toBe(exercises[0].languages.csharp.starter)
  await changeLanguage(editor, 'javascript')
  expect(editor.value).toBe('// JS draft')
  expect(persisted.drafts.find(d => d.language === 'csharp')?.code).toBe(exercises[0].languages.csharp.starter)
})
it('persists both drafts and last language before reopening a fresh workspace', async () => {
  const view = render(<Harness />)
  const editor = await openFirst() as HTMLTextAreaElement
  fireEvent.change(editor, { target: { value: '// restart C#' } })
  await changeLanguage(editor, 'javascript')
  fireEvent.change(editor, { target: { value: '// restart JS' } })
  fireEvent.click(workspace(editor).getByRole('button', { name: '← Danh sách' }))
  await screen.findByRole('region', { name: 'Bài tập chương 2' })
  expect(persisted.drafts.find(d => d.language === 'csharp')?.code).toBe('// restart C#')
  expect(persisted.drafts.find(d => d.language === 'javascript')?.code).toBe('// restart JS')
  expect(persisted.languages).toEqual([{ exerciseId: 'ch2-01', language: 'javascript' }])
  view.unmount(); render(<Harness />)
  const restored = await openFirst() as HTMLTextAreaElement
  expect(workspace(restored).getByRole<HTMLSelectElement>('combobox').value).toBe('javascript')
  expect(restored.value).toBe('// restart JS')
  await changeLanguage(restored, 'csharp')
  expect(restored.value).toBe('// restart C#')
})
it('lists 9 exercises by difficulty, isolates languages, confirms Reset and restores drafts on restart', async () => {
  const view = render(<Harness />)
  const editor = await openFirst()
  const practice = workspace(editor)
  expect((practice.getByRole('combobox') as HTMLSelectElement).value).toBe('csharp')
  expect((editor as HTMLTextAreaElement).value).toBe(exercises[0].languages.csharp.starter)
  fireEvent.change(editor, { target: { value: '// student cs' } })
  await changeLanguage(editor, 'javascript')
  fireEvent.change(editor, { target: { value: '// student js' } })
  await changeLanguage(editor, 'csharp')
  await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe('// student cs'))
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Hủy' }))
  expect((editor as HTMLTextAreaElement).value).toBe('// student cs')
  fireEvent.click(practice.getByRole('button', { name: 'Reset Code' }))
  fireEvent.click(practice.getByRole('button', { name: 'Xác nhận Reset' }))
  expect((editor as HTMLTextAreaElement).value).toBe(exercises[0].languages.csharp.starter)
  await changeLanguage(editor, 'javascript')
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
  expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText(/^Accepted ·/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Test Result' }))
  expect(screen.getByText(/Chưa có kết quả thực thi/)).toBeTruthy()
})
it('shows icon-only Run/Reset and LeetCode-style sample cases without execution results', async () => {
  render(<Harness />)
  const editor = await openFirst()
  const practice = workspace(editor)
  const run = practice.getByRole<HTMLButtonElement>('button', { name: 'Run' })
  const reset = practice.getByRole<HTMLButtonElement>('button', { name: 'Reset Code' })
  expect(run.disabled).toBe(true)
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
  expect(result.getByText('Chưa có kết quả thực thi.')).toBeTruthy()
  expect(result.getByText('Run và Submit chưa khả dụng.')).toBeTruthy()
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
