/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PracticeTestPanel } from '../../src/renderer/src/features/learning/practice/PracticeTestPanel'
import { csharpFailureMessage } from '../../src/renderer/src/features/learning/practice/use-exercise-runtime'
import type { ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import { exercises } from '../fixtures/learning/legacy-exercises'
import type { Exercise, ExerciseType, ExerciseValue } from '../../src/shared/contracts/practice'

afterEach(cleanup)
function panel(result: NonNullable<ExerciseSnapshot['csharp']>['result'] | undefined, override: Partial<ExerciseSnapshot> = {}, exercise: Exercise = exercises[0]) {
  const snapshot: ExerciseSnapshot = { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1, sequence: 5,
    exerciseId: exercises[0].id, language: 'csharp', sourceRevision: 1, phase: 'finished', reason: 'COMPLETED', stdout: '', stderr: '',
    cleanup: { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false },
    ...(result ? { csharp: { schema: { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }, result } } : {}), ...override }
  function Harness() {
    const [selectedCase, onCase] = useState(0)
    return <PracticeTestPanel exercise={exercise} tab="result" onTab={vi.fn()} selectedCase={selectedCase} onCase={onCase}
      size="open" onSize={vi.fn()} dock="editor" onDock={vi.fn()} execution={{ status: result ? result.failure ? 'error' : 'finished' : 'idle',
        busy: false, message: result?.failure ? csharpFailureMessage[result.failure.kind] : result ? 'Đã kết thúc thực thi.' : 'Chưa có kết quả thực thi.', snapshot: result ? snapshot : undefined }} />
  }
  return render(<Harness />)
}
const compile = { status: 'SUCCEEDED' as const, exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null }
it('shows actual zero, escaped student streams and the untouched suffix without a comparison verdict', () => {
  panel({ compile, cases: [{ caseIndex: 0, outcome: 'RETURNED', actual: 0, exitCode: 0, stdout: '<script>unsafe()</script>', stderr: 'student error', failure: null }], notRunCaseIndices: [1], failure: null })
  expect(screen.getByLabelText('Actual Case 1').textContent).toBe('0')
  expect(screen.getByRole('status').textContent).toBe('Đã chạy xong')
  expect(screen.getByLabelText('Input Case 1').textContent).toContain('a =14')
  expect(screen.getByLabelText('Expected Case 1').textContent).toBe('8')
  fireEvent.click(screen.getByText('Console output'))
  expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy(); expect(document.querySelector('script')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: /^Case 2/ }))
  expect(screen.getByLabelText('Output Case 2').textContent).toContain('NOT_RUN')
  expect(screen.getByLabelText('Input Case 2').textContent).toContain('b =0')
  expect(screen.getByLabelText('Expected Case 2').textContent).toBe('0')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  expect(screen.queryByLabelText('Actual Case 2')).toBeNull()
  expect(screen.queryByText('<script>unsafe()</script>')).toBeNull()
  expect(screen.queryByText(/Accepted|Wrong Answer|PASS/)).toBeNull()
})
it('shows bounded code/position diagnostics and no fabricated actual after compilation failure', () => {
  const failure = { kind: 'COMPILE_ERROR' as const, phase: 'compile' as const, caseIndex: null }
  panel({ compile: { ...compile, status: 'FAILED', exitCode: 1, diagnostics: [{ code: 'CS1002', severity: 'error', source: 'solution', line: 4, column: 9 }], failure },
    cases: [], notRunCaseIndices: [0, 1], failure })
  expect(screen.getByLabelText('Compiler diagnostics').textContent).toContain('CS1002 · Lỗi · Dòng 4, cột 9')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})
it.each(['RUNTIME_ERROR', 'TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT', 'INFRASTRUCTURE_FAILURE'] as const)('shows safe %s failure and no actual', kind => {
  const failure = { kind, phase: 'execute' as const, caseIndex: 0 }
  panel({ compile, cases: [{ caseIndex: 0, outcome: 'FAILED', actual: null, exitCode: null, stdout: '', stderr: '', failure }], notRunCaseIndices: [1], failure })
  expect(screen.getByLabelText('Output Case 1').textContent).toBe(csharpFailureMessage[kind]); expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})
it('does not display results for a mismatched catalogue schema', () => {
  const result = { compile, cases: [], notRunCaseIndices: [0, 1], failure: null }
  panel(result, { csharp: { schema: { parameterTypes: [], returnType: 'boolean', sampleCount: 2 }, result } })
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  expect(screen.getByLabelText('Output Case 1').textContent).toBe('Chưa có kết quả.')
})

it('switches one detail view with mouse and arrow/Home/End keys, without comparing actual and expected', () => {
  panel({ compile, cases: [0, 1].map(caseIndex => ({ caseIndex, outcome: 'RETURNED', actual: 999, exitCode: 0, stdout: '', stderr: '', failure: null })), notRunCaseIndices: [], failure: null })
  const first = screen.getByRole('tab', { name: /^Case 1/ }), second = screen.getByRole('tab', { name: /^Case 2/ })
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  fireEvent.keyDown(first, { key: 'ArrowRight' })
  expect(second.getAttribute('aria-selected')).toBe('true'); expect(document.activeElement).toBe(second)
  expect(screen.getByLabelText('Actual Case 2').textContent).toBe('999')
  expect(screen.getByLabelText('Expected Case 2').textContent).toBe('0')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  fireEvent.keyDown(second, { key: 'Home' }); expect(first.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(first, { key: 'End' }); expect(second.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(second, { key: 'ArrowRight' }); expect(first.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(first, { key: 'ArrowLeft' }); expect(second.getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByText(/Accepted|Wrong Answer|Runtime.*ms/)).toBeNull()
})

const typedValues: [ExerciseType, ExerciseValue][] = [['int32', 0], ['boolean', false], ['string', 'Việt 日本語 😀\n'],
  ['int32[]', [2, 7, 11, 15]], ['string[]', ['', 'Ω']], ['int32[][]', [[1, 2], [3, 4]]]]
it.each(typedValues)('formats catalogue Input/Expected and structured %s actual as JSON', (type, value) => {
  const exercise: Exercise = { ...exercises[0], parameters: [{ name: 'value', type }], returnType: type, samples: [{ args: [value], expected: value }] }
  panel({ compile, cases: [{ caseIndex: 0, outcome: 'RETURNED', actual: value, exitCode: 0, stdout: 'console is not actual', stderr: '', failure: null }], notRunCaseIndices: [], failure: null }, {}, exercise)
  expect(screen.getByLabelText('Input Case 1').textContent).toBe(`value =${JSON.stringify(value)}`)
  expect(screen.getByLabelText('Actual Case 1').textContent).toBe(JSON.stringify(value))
  expect(screen.getByLabelText('Expected Case 1').textContent).toBe(JSON.stringify(value))
})

it('keeps an honest empty state, catalogue values and no invented output or timing', () => {
  panel(undefined)
  expect(screen.getByRole('status').textContent).toBe('Chưa có kết quả thực thi.')
  expect(screen.getByText('Chọn Run để xem Output của các test mẫu.')).toBeTruthy()
  expect(screen.getByLabelText('Output Case 1').textContent).toBe('Chưa có kết quả.')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  expect(screen.queryByText(/NOT_RUN|Runtime.*ms/)).toBeNull()
})

it('keeps every case selectable and renders one long output at a time', () => {
  const exercise = { ...exercises[0], returnType: 'string' as const, samples: Array.from({ length: 20 }, () => ({ args: [14, -6], expected: '' })) }
  panel({ compile, cases: [{ caseIndex: 0, outcome: 'RETURNED', actual: 'x'.repeat(10000), exitCode: 0, stdout: '', stderr: '', failure: null }], notRunCaseIndices: Array.from({ length: 19 }, (_, i) => i + 1), failure: null }, {}, exercise)
  expect(screen.getAllByRole('tab')).toHaveLength(20)
  expect(screen.getByLabelText('Actual Case 1').textContent).toHaveLength(10002)
  fireEvent.click(screen.getByRole('tab', { name: /^Case 20 / }))
  expect(screen.getByLabelText('Output Case 20').textContent).toContain('NOT_RUN')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})
