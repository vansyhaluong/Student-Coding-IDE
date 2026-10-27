/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PracticeSolution } from '../../src/renderer/src/features/learning/practice/PracticeSolution'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter3Solutions } from '../../src/renderer/src/features/learning/practice/chapter3-solutions'
import { chapter3Exercises } from '../fixtures/learning/chapter3-solution-public'

const copy = vi.hoisted(() => vi.fn<(code: string) => Promise<void>>().mockResolvedValue(undefined))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { editor: {
  colorize: vi.fn(async () => ''), tokenize: (code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.test' }]),
} } }))
beforeEach(() => { copy.mockClear(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }) })
afterEach(cleanup)

it('covers exactly the repository Chapter 3 exercises and leaves the pilot content untouched', () => {
  expect(chapter3Solutions.map(solution => solution.exerciseId).sort()).toEqual(chapter3Exercises.map(exercise => exercise.id))
  expect(chapter3Exercises).toHaveLength(9)
  const after = readFileSync(resolve('src/renderer/src/features/learning/practice/solutions.ts'), 'utf8').replace(/\r\n/g, '\n')
  const pilot = (text: string) => text.slice(text.indexOf('const sum:'), text.indexOf('\nconst solutions:'))
  expect(createHash('sha256').update(pilot(after)).digest('hex')).toBe('e3553c25c5ee9bb5a6e2302ccb1a48478d9805a36dcc0d4b079b13960de158e2')
})

for (const exercise of chapter3Exercises) {
  it.each(['csharp', 'javascript'] as const)(`${exercise.id}: full source and every meaningful %s line are explained in order, without punctuation-only steps`, async language => {
    const solution = solutionFor(exercise)!
    expect(solution).toBeTruthy()
    expect(solution.signature).toEqual({ functionName: exercise.functionName, parameters: exercise.parameters, returnType: exercise.returnType })
    const complete = solutionCode(solution, language), fullLines = complete.split('\n')
    const meaningful = fullLines.flatMap((code, index) => /[\p{L}\p{N}_]/u.test(code) ? [{ code, lineNumber: index + 1 }] : [])
    expect(solution.languages[language].lines.map(({ code, lineNumber }) => ({ code, lineNumber }))).toEqual(meaningful)
    expect(solution.languages[language].lines.every(line => line.explanation.length >= 20 && !line.code.includes('\n'))).toBe(true)
    expect(complete).toContain('{'); expect(complete.trimEnd().endsWith('}')).toBe(true)
    expect(complete).not.toMatch(/Console\.|console\.|stdin|module\.exports|NotImplemented/)
    render(<PracticeSolution key={exercise.id} exercise={exercise} editorLanguage={language} />)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5)
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(complete)
    await waitFor(() => expect(screen.getByLabelText('Code hoàn chỉnh').querySelector('code')?.getAttribute('data-highlighted')).toBe('true'))
    for (const line of solution.languages[language].lines) {
      expect(screen.getByLabelText(`Dòng ${line.lineNumber}`).textContent).toBe(line.code)
      expect(screen.getByText(line.explanation)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: `Copy Dòng ${line.lineNumber}` }))
      await waitFor(() => expect(copy).toHaveBeenLastCalledWith(line.code))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(complete))
    await screen.findByText('Đã sao chép Code hoàn chỉnh')
    const other = language === 'csharp' ? 'javascript' : 'csharp'
    fireEvent.click(screen.getByRole('tab', { name: other === 'csharp' ? 'C#' : 'JavaScript' }))
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(solutionCode(solution, other))
  })
}

it('rebinds on exercise changes and never borrows Chapter 3 content for a different ID/signature', () => {
  const first = chapter3Exercises[0], second = chapter3Exercises[1]
  const view = render(<PracticeSolution key={first.id} exercise={first} editorLanguage="csharp" />)
  view.rerender(<PracticeSolution key={second.id} exercise={second} editorLanguage="javascript" />)
  expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toContain('function Sign(n)')
  expect(screen.getByLabelText('Code hoàn chỉnh').textContent).not.toContain('IsEven')
  for (const exercise of [{ ...first, id: 'ch4-01' }, { ...first, functionName: 'Wrong' }]) {
    view.rerender(<PracticeSolution key={exercise.id} exercise={exercise} editorLanguage="csharp" />)
    expect(screen.getByText('Chưa có hướng dẫn cho bài tập này')).toBeTruthy()
    expect(screen.queryByLabelText('Code hoàn chỉnh')).toBeNull()
  }
})
