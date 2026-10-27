/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { useEffect, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Exercise } from '../../src/shared/contracts/practice'
import type { StudentIdeApi } from '../../src/shared/contracts'
import { PracticeSolution } from '../../src/renderer/src/features/learning/practice/PracticeSolution'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'

const host = vi.hoisted(() => ({ mounts: 0, unmounts: 0, copy: vi.fn(), colorize: vi.fn(async () => ''),
  tokenize: vi.fn((code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.test' }])) }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { editor: { colorize: host.colorize, tokenize: host.tokenize } } }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({ PracticeEditor: ({ code }: { code: string }) => {
  useEffect(() => { host.mounts++; return () => { host.unmounts++ } }, [])
  return <textarea aria-label="Practice code" defaultValue={code} />
} }))

const asset = (name: string) => readFileSync(resolve('resources/learning/exercises/ch2-01', name), 'utf8')
const metadata = JSON.parse(asset('exercise.json'))
const samples = JSON.parse(asset('samples.json')).samples as Exercise['samples']
const exercise: Exercise = { id: metadata.exerciseId, chapter: metadata.metadata.chapter, title: metadata.metadata.title,
  difficulty: metadata.metadata.difficulty, description: metadata.statement, constraints: metadata.constraints,
  functionName: metadata.signature.functionName, parameters: metadata.signature.parameters, returnType: metadata.signature.returnType,
  samples, source: metadata.metadata.source,
  languages: { csharp: { monacoId: 'csharp', starter: asset('starters/csharp.txt') },
    javascript: { monacoId: 'javascript', starter: asset('starters/javascript.txt') } } }

beforeEach(async () => {
  // Resolve the async mock once before concurrent code-block effects import it.
  await import('../../src/renderer/src/features/editor/monaco')
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() })
  host.mounts = 0; host.unmounts = 0; host.copy.mockReset().mockResolvedValue(undefined)
  host.colorize.mockClear(); host.tokenize.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: host.copy } })
  window.studentIde = { learning: {} } as unknown as StudentIdeApi
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['csharp', 'javascript'] as const)('renders all five sections in %s, matching explanations and highlighted exact full code', async language => {
  render(<PracticeSolution exercise={exercise} editorLanguage={language} />)
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
    '1. Phân tích đề bài', '2. Ý tưởng thuật toán', '3. Hướng dẫn code từng dòng', '4. Code hoàn chỉnh', '5. Độ phức tạp',
  ])
  const code = screen.getByLabelText('Code hoàn chỉnh'), content = solutionFor(exercise)!
  expect(code.textContent).toBe(solutionCode(content, language))
  await waitFor(() => expect(host.tokenize).toHaveBeenCalledWith(solutionCode(content, language), language))
  await waitFor(() => expect(screen.getByLabelText('Code hoàn chỉnh').querySelector('code')?.getAttribute('data-highlighted')).toBe('true'))
  for (const line of content.languages[language].lines) expect(screen.getByText(line.explanation)).toBeTruthy()
  expect(screen.getByRole('tab', { name: language === 'csharp' ? 'C#' : 'JavaScript' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getAllByRole('tablist')).toHaveLength(1)
})

it('changes walkthrough and full code together using the independent keyboard-accessible language tabs', async () => {
  render(<PracticeSolution exercise={exercise} editorLanguage="csharp" />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'C#' }), { key: 'ArrowRight' })
  expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(solutionCode(solutionFor(exercise)!, 'javascript'))
  expect(screen.queryByText(solutionFor(exercise)!.languages.csharp.lines[0].explanation)).toBeNull()
  expect(screen.getByText(solutionFor(exercise)!.languages.javascript.lines[0].explanation)).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'C#' }))
  await waitFor(() => expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toContain('public int Sum(int a, int b)'))
})

it.each(['csharp', 'javascript'] as const)('copies every %s snippet and the complete code exactly, with feedback', async language => {
  render(<PracticeSolution exercise={exercise} editorLanguage={language} />)
  const content = solutionFor(exercise)!
  for (const [index, line] of content.languages[language].lines.entries()) {
    fireEvent.click(screen.getByRole('button', { name: `Copy Dòng ${index + 1}` }))
    await waitFor(() => expect(host.copy).toHaveBeenLastCalledWith(line.code))
    await screen.findByText(`Đã sao chép Dòng ${index + 1}`)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
  await waitFor(() => expect(host.copy).toHaveBeenLastCalledWith(solutionCode(content, language)))
  await screen.findByText('Đã sao chép Code hoàn chỉnh')
})

it('handles clipboard failure without inserting code and ignores delayed copy feedback from a retired language', async () => {
  host.copy.mockRejectedValueOnce(new Error('denied'))
  render(<PracticeSolution exercise={exercise} editorLanguage="csharp" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Không thể sao chép')
  let resolve!: () => void
  host.copy.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
  fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }))
  await act(async () => resolve())
  expect(screen.queryByText('Đã sao chép Code hoàn chỉnh')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['id', 'function', 'parameter', 'return'] as const)('shows empty state for a missing or incompatible %s without borrowing another solution', kind => {
  const other = structuredClone(exercise)
  if (kind === 'id') other.id = 'ch2-02'
  if (kind === 'function') other.functionName = 'Other'
  if (kind === 'parameter') other.parameters[0].type = 'string'
  if (kind === 'return') other.returnType = 'string'
  render(<PracticeSolution exercise={other} editorLanguage="javascript" />)
  expect(screen.getByRole('status').textContent).toBe('Chưa có hướng dẫn cho bài tập này')
  expect(screen.queryByLabelText('Code hoàn chỉnh')).toBeNull()
})

function props(): ComponentProps<typeof PracticeWorkspace> {
  return { exercise, exercises: [], chapter: 2, drafts: [], ready: true, locked: false, language: 'csharp', code: 'unchanged draft', sourceRevision: 3,
    execution: { status: 'idle', busy: false, message: '' }, onRun: vi.fn(), onEdit: vi.fn(), onLanguage: vi.fn(), onReplace: vi.fn(), onOpen: vi.fn(), onRestore: vi.fn(),
    submission: { view: { busy: false, completion: 'UNKNOWN', possibleDataLoss: false }, staleSource: false, submit: vi.fn(), checkStatus: vi.fn(), refreshCompletion: vi.fn(), disabledReason: undefined } }
}
it('keeps Description default, navigates the three tabs, and preserves the editor node/selection/draft with no execution or Restore calls', async () => {
  const p = props(), view = render(<PracticeWorkspace {...p} />)
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
  editor.setSelectionRange(2, 5); editor.scrollTop = 12
  const tabs = within(screen.getByRole('tablist', { name: 'Description, Solution và Submissions' }))
  expect(tabs.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Description', 'Solution', 'Submissions'])
  expect(tabs.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByLabelText('Code hoàn chỉnh')).toBeNull()
  for (let index = 0; index < 3; index++) {
    fireEvent.click(tabs.getByRole('tab', { name: 'Solution' }))
    fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }))
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Ngôn ngữ bài tập' }).value).toBe('csharp')
    fireEvent.click(tabs.getByRole('tab', { name: 'Submissions' }))
    expect(screen.getByRole('region', { name: 'Lịch sử nộp bài' })).toBeTruthy()
    fireEvent.click(tabs.getByRole('tab', { name: 'Description' }))
  }
  expect(screen.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
  expect(editor.value).toBe('unchanged draft'); expect(editor.selectionStart).toBe(2); expect(editor.selectionEnd).toBe(5); expect(editor.scrollTop).toBe(12)
  expect(host.mounts).toBe(1); expect(host.unmounts).toBe(0)
  for (const callback of [p.onRun, p.onEdit, p.onReplace, p.onLanguage, p.onRestore, p.submission.submit]) expect(callback).not.toHaveBeenCalled()
  fireEvent.click(tabs.getByRole('tab', { name: 'Solution' }))
  view.rerender(<PracticeWorkspace {...p} exercise={{ ...exercise, id: 'ch2-02', title: 'Bài khác' }} />)
  expect(screen.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByLabelText('Code hoàn chỉnh')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Solution' }))
  expect(screen.getByText('Chưa có hướng dẫn cho bài tập này')).toBeTruthy()
})

it('uses the current Editor language when Solution is opened, then keeps its language independent', async () => {
  const p = props(), view = render(<PracticeWorkspace {...p} />)
  await screen.findByRole('textbox', { name: 'Practice code' })
  view.rerender(<PracticeWorkspace {...p} language="javascript" />)
  fireEvent.click(screen.getByRole('tab', { name: 'Solution' }))
  expect(screen.getByRole('tab', { name: 'JavaScript' }).getAttribute('aria-selected')).toBe('true')
  view.rerender(<PracticeWorkspace {...p} language="csharp" />)
  expect(screen.getByRole('tab', { name: 'JavaScript' }).getAttribute('aria-selected')).toBe('true')
})

it('matches the real public C# signature and generated instance invocation without compiling or executing Runtime', () => {
  const solution = solutionFor(exercise)!, code = solutionCode(solution, 'csharp')
  expect(solution.exerciseId).toBe(metadata.exerciseId)
  expect(solution.signature).toEqual({ functionName: metadata.signature.functionName, parameters: metadata.signature.parameters, returnType: metadata.signature.returnType })
  expect(code).toBe(exercise.languages.csharp.starter.replace(/ {8}\/\/[^\n]*\r?\n {8}throw new System.NotImplementedException\(\);/, '        return a + b;').trimEnd())
  const harness = generateCsharpHarness(exercise, { parameterTypes: ['int32', 'int32'], returnType: 'int32', sampleCount: samples.length })
  expect(harness).toContain('global::System.Func<int, int, int> invoke = new global::Solution().@Sum;')
  expect(code).not.toMatch(/Console|Main|static|throw/)
  for (const sample of samples) expect(Number(sample.args[0]) + Number(sample.args[1])).toBe(sample.expected)
})

it('runs the authored JavaScript function on public samples and independently specified in-domain examples only', () => {
  const code = solutionCode(solutionFor(exercise)!, 'javascript')
  expect(code).toMatch(/^function Sum\(a, b\)/)
  expect(code).not.toMatch(/console|stdin|module.exports/)
  const cases = [...samples, { args: [-1_000_000, -1_000_000], expected: -2_000_000 }, { args: [1_000_000, 1_000_000], expected: 2_000_000 }, { args: [-3, 3], expected: 0 }]
  for (const sample of cases) expect(runInNewContext(`${code}\nSum(a, b)`, { a: sample.args[0], b: sample.args[1] }, { timeout: 1000 })).toBe(sample.expected)
})
