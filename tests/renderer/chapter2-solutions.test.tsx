/** @vitest-environment jsdom */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PracticeSolution } from '../../src/renderer/src/features/learning/practice/PracticeSolution'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter2Solutions } from '../../src/renderer/src/features/learning/practice/chapter2-solutions'
import { chapter2Exercises } from '../fixtures/learning/chapter2-solution-public'

const copy = vi.hoisted(() => vi.fn<(code: string) => Promise<void>>().mockResolvedValue(undefined))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { editor: {
  colorize: vi.fn(async () => ''), tokenize: (code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.test' }]),
} } }))
beforeEach(() => { copy.mockClear(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }) })
afterEach(cleanup)

it('covers all nine Chapter2 exercises, adding only the eight missing solutions and preserving the Sum pilot', () => {
  expect(chapter2Exercises).toHaveLength(9)
  expect(chapter2Solutions.map(s => s.exerciseId)).toEqual(chapter2Exercises.slice(1).map(e => e.id))
  expect(chapter2Exercises.every(e => solutionFor(e))).toBe(true)
  const source = readFileSync('src/renderer/src/features/learning/practice/solutions.ts', 'utf8').replace(/\r\n/g, '\n')
  const pilot = source.slice(source.indexOf('const sum:'), source.indexOf('\nconst solutions:'))
  expect(createHash('sha256').update(pilot).digest('hex')).toBe('e3553c25c5ee9bb5a6e2302ccb1a48478d9805a36dcc0d4b079b13960de158e2')
})
for (const exercise of chapter2Exercises.slice(1)) {
  it.each(['csharp', 'javascript'] as const)(`${exercise.id}: renders/copies complete %s teaching code with correctly numbered meaningful lines`, async language => {
    const solution = solutionFor(exercise)!, full = solutionCode(solution, language)
    expect(solution.signature).toEqual({ functionName: exercise.functionName, parameters: exercise.parameters, returnType: exercise.returnType })
    const meaningful = full.split('\n').flatMap((code, index) => /[\p{L}\p{N}_]/u.test(code) ? [{ code, lineNumber: index + 1 }] : [])
    expect(solution.languages[language].lines.map(({ code, lineNumber }) => ({ code, lineNumber }))).toEqual(meaningful)
    expect(solution.languages[language].lines.every(line => line.explanation.length >= 20)).toBe(true)
    expect(full).not.toMatch(/Console\.|console\.|stdin|module\.exports|NotImplemented/)
    expect(exercise.languages[language].starter).toContain(language === 'csharp' ? full.split('\n')[2].trim() : full.split('\n')[0])
    render(<PracticeSolution exercise={exercise} editorLanguage={language} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1. Phân tích đề bài', '2. Ý tưởng thuật toán', '3. Hướng dẫn code từng dòng', '4. Code hoàn chỉnh', '5. Độ phức tạp',
    ])
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(full)
    for (const line of solution.languages[language].lines) {
      expect(screen.getByLabelText(`Dòng ${line.lineNumber}`).textContent).toBe(line.code)
      fireEvent.click(screen.getByRole('button', { name: `Copy Dòng ${line.lineNumber}` }))
      await waitFor(() => expect(copy).toHaveBeenLastCalledWith(line.code))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Copy Code hoàn chỉnh' }))
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(full))
    fireEvent.click(screen.getByRole('tab', { name: language === 'csharp' ? 'JavaScript' : 'C#' }))
    expect(screen.getByLabelText('Code hoàn chỉnh').textContent).toBe(solutionCode(solution, language === 'csharp' ? 'javascript' : 'csharp'))
  })
}
it('keeps exact-signature lookup fail-closed for changed parameter/return type or unknown exercise', () => {
  const e = chapter2Exercises[3]
  for (const changed of [{ ...e, id: 'unknown' }, { ...e, returnType: 'string' as const }, { ...e, parameters: [{ name: 'wrong', type: 'int32' as const }] }]) expect(solutionFor(changed)).toBeUndefined()
})
