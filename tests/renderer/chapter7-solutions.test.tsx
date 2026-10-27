/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PracticeSolution } from '../../src/renderer/src/features/learning/practice/PracticeSolution'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter7Solutions } from '../../src/renderer/src/features/learning/practice/chapter7-solutions'
import { chapter7Exercises } from '../fixtures/learning/chapter7-solution-public'

const copy = vi.hoisted(() => vi.fn<(code: string) => Promise<void>>().mockResolvedValue(undefined))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { editor: {
  colorize: vi.fn(async () => ''), tokenize: (code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.test' }]),
} } }))
beforeEach(() => { copy.mockClear(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }) })
afterEach(cleanup)

it('keeps the no-division contract for ProductExceptSelf in both complete sources', () => {
  const exercise = chapter7Exercises.find(item => item.id === 'ch7-05')!
  const solution = solutionFor(exercise)!
  for (const language of ['csharp', 'javascript'] as const) expect(solutionCode(solution, language)).not.toContain('/')
})

it('covers all real Chapter 7 IDs and preserves existing Chapter 2/3/4/5/6 content', () => {
  expect(chapter7Solutions.map(solution => solution.exerciseId).sort()).toEqual(chapter7Exercises.map(exercise => exercise.id))
  expect(chapter7Exercises).toHaveLength(9)
  const source = readFileSync(resolve('src/renderer/src/features/learning/practice/solutions.ts'), 'utf8').replace(/\r\n/g, '\n')
  const pilot = source.slice(source.indexOf('const sum:'), source.indexOf('\nconst solutions:'))
  expect(createHash('sha256').update(pilot).digest('hex')).toBe('e3553c25c5ee9bb5a6e2302ccb1a48478d9805a36dcc0d4b079b13960de158e2')
  const chapter3 = readFileSync(resolve('src/renderer/src/features/learning/practice/chapter3-solutions.ts'))
  expect(createHash('sha256').update(chapter3).digest('hex')).toBe('90a5718963ea57d5a0ff7d2ab857e0d318ea86d00c56a3e5f9e23622a6401b23')
  const chapter4 = readFileSync(resolve('src/renderer/src/features/learning/practice/chapter4-solutions.ts'))
  expect(createHash('sha256').update(chapter4).digest('hex')).toBe('a4753a1d5881ae68dfb78d11f65200e61650757246b6dd2d627c24e25c7b6641')
  const chapter5 = readFileSync(resolve('src/renderer/src/features/learning/practice/chapter5-solutions.ts'))
  expect(createHash('sha256').update(chapter5).digest('hex')).toBe('e3021117f0d117786f2199097131037b908479339aed91d84c8d45e04ab923e9')
  const chapter6 = readFileSync(resolve('src/renderer/src/features/learning/practice/chapter6-solutions.ts'))
  expect(createHash('sha256').update(chapter6).digest('hex')).toBe('724eaceab775108ccec6c575d27bc853c3311f57f89533ee45e62f7fd7b0b5b8')
})

for (const exercise of chapter7Exercises) {
  it.each(['csharp', 'javascript'] as const)(`${exercise.id}: renders all sections and copies every meaningful %s line, preserving syntax and line order`, async language => {
    const solution = solutionFor(exercise)!
    expect(solution).toBeTruthy()
    expect(solution.signature).toEqual({ functionName: exercise.functionName, parameters: exercise.parameters, returnType: exercise.returnType })
    const full = solutionCode(solution, language)
    const meaningful = full.split('\n').flatMap((code, index) => /[\p{L}\p{N}_]/u.test(code) ? [{ code, lineNumber: index + 1 }] : [])
    expect(solution.languages[language].lines.map(({ code, lineNumber }) => ({ code, lineNumber }))).toEqual(meaningful)
    expect(solution.languages[language].lines.every(line => line.explanation.length >= 20 && !line.code.includes('\n'))).toBe(true)
    expect(full.trimEnd().endsWith('}')).toBe(true)
    expect(full).not.toMatch(/Console\.|console\.|stdin|module\.exports|NotImplemented/)
    // Source declaration must match the real starter's public entry shape.
    const declaration = language === 'csharp' ? full.split('\n')[2].trim() : full.split('\n')[0]
    expect(exercise.languages[language].starter).toContain(declaration)
    render(<PracticeSolution key={exercise.id} exercise={exercise} editorLanguage={language} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      '1. Phân tích đề bài', '2. Ý tưởng thuật toán', '3. Hướng dẫn code từng dòng', '4. Code hoàn chỉnh', '5. Độ phức tạp',
    ])
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(full)
    await waitFor(() => expect(screen.getByLabelText('Code hoàn chỉnh').querySelector('code')?.getAttribute('data-highlighted')).toBe('true'))
    for (const line of solution.languages[language].lines) {
      expect(screen.getByLabelText(`Dòng ${line.lineNumber}`).textContent).toBe(line.code)
      expect(screen.getByText(line.explanation)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: `Copy Dòng ${line.lineNumber}` }))
      await waitFor(() => expect(copy).toHaveBeenLastCalledWith(line.code))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(full))
    await screen.findByText('Đã sao chép Code hoàn chỉnh')
    const other = language === 'csharp' ? 'javascript' : 'csharp'
    fireEvent.click(screen.getByRole('tab', { name: other === 'csharp' ? 'C#' : 'JavaScript' }))
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(solutionCode(solution, other))
  })
}

it('switches to the correct exercise source and fails closed for an unknown ID or mismatched signature', () => {
  const first = chapter7Exercises[0], second = chapter7Exercises[1]
  const view = render(<PracticeSolution key={first.id} exercise={first} editorLanguage="csharp" />)
  view.rerender(<PracticeSolution key={second.id} exercise={second} editorLanguage="javascript" />)
  expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toContain('function MaxProfit(prices)')
  expect(screen.getByLabelText('Code hoàn chỉnh').textContent).not.toContain('TwoSum')
  for (const exercise of [{ ...first, id: 'ch8-01' }, { ...first, functionName: 'Wrong' }]) {
    view.rerender(<PracticeSolution key={exercise.id} exercise={exercise} editorLanguage="csharp" />)
    expect(screen.getByText('Chưa có hướng dẫn cho bài tập này')).toBeTruthy()
    expect(screen.queryByLabelText('Code hoàn chỉnh')).toBeNull()
  }
})
