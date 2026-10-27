/** @vitest-environment jsdom */
import { type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PracticeTestPanel } from '../../src/renderer/src/features/learning/practice/PracticeTestPanel'
import { useExerciseRuntime } from '../../src/renderer/src/features/learning/practice/use-exercise-runtime'
import type { ExerciseApi, ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import { exercises } from '../fixtures/learning/legacy-exercises'

const exercise = exercises[0]
type Props = ComponentProps<typeof PracticeTestPanel>
function finished(language: ExerciseLanguage = 'csharp', generation = 1): ExerciseSnapshot {
  const stage = { status: 'SUCCEEDED' as const, exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null }
  const result = { cases: exercise.samples.map((sample, caseIndex) => ({ caseIndex, outcome: 'RETURNED' as const,
    actual: sample.expected, exitCode: 0, stdout: '', stderr: '', failure: null })), notRunCaseIndices: [], failure: null }
  const schema = { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }
  return { sessionId: `exercise_12345678-1234-4234-8234-${generation.toString().padStart(12, '0')}`, generation, sequence: 6,
    exerciseId: exercise.id, language, sourceRevision: 1, phase: 'finished', reason: 'COMPLETED', stdout: '', stderr: '',
    cleanup: { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false },
    ...(language === 'csharp' ? { csharp: { schema, result: { ...result, compile: stage } } } : { javascript: { schema, result: { ...result, syntax: stage } } }) }
}
function panel(overrides: Partial<Props> = {}) {
  let props: Props = { exercise, language: 'csharp', selectedCase: 0, onCase: vi.fn(), tab: 'result', onTab: vi.fn(),
    size: 'open', onSize: vi.fn(), dock: 'editor', onDock: vi.fn(),
    execution: { status: 'finished', busy: false, message: 'Done', snapshot: finished() }, ...overrides }
  const ui = render(<PracticeTestPanel {...props} />)
  return { ...ui, update(next: Partial<Props>) { props = { ...props, ...next }; ui.rerender(<PracticeTestPanel {...props} />) } }
}
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

it('starts empty even if an idle view still carries an old payload, without fake case results', () => {
  panel({ execution: { status: 'idle', busy: false, message: 'old', snapshot: finished() } })
  expect(screen.getByRole('status').textContent).toBe('Nhấn Run để xem kết quả kiểm thử')
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  expect(screen.queryByText(/PASS|FAIL|Passed|old/)).toBeNull()
})

it.each(['prepare', 'compile', 'execute', 'cleanup'] as const)('hides prior results and phase text behind a centered spinner during %s', phase => {
  const ui = panel()
  expect(screen.getByRole('status').textContent).toBe('Passed')
  ui.update({ execution: { status: phase === 'cleanup' ? 'cleanup-pending' : 'running', busy: true,
    message: phase === 'compile' ? 'Đang biên dịch' : 'Đang chạy', snapshot: { ...finished(), phase, stdout: 'prior console' } } })
  expect(screen.getByRole('status', { name: 'Đang kiểm thử' }).querySelector('svg')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Test Result' }).getAttribute('aria-busy')).toBe('true')
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByText(/Đang biên dịch|Đang chạy|Compiling|Running|prior console|Passed/)).toBeNull()
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})

it.each(['csharp', 'javascript'] as const)('shows real %s PASS checks, FAIL crosses and a truthful sample verdict', language => {
  const snapshot = finished(language), observation = snapshot.csharp ?? snapshot.javascript!
  const ui = panel({ language, execution: { status: 'finished', busy: false, message: 'Done', snapshot } })
  expect(screen.getByRole('status').textContent).toBe('Passed')
  expect(screen.getAllByRole('tab').every(tab => tab.getAttribute('data-state') === 'PASS' && !!tab.querySelector('.lucide-check'))).toBe(true)
  observation.result.cases[0].actual = 123
  ui.update({ execution: { status: 'finished', busy: false, message: 'Done', snapshot: structuredClone(snapshot) } })
  expect(screen.getByRole('status').textContent).toBe('Wrong Answer')
  expect(screen.getByRole('tab', { name: 'Case 1 · FAIL' }).querySelector('.lucide-x')).toBeTruthy()
  expect(screen.getByLabelText('Actual Case 1').textContent).toBe('123')
  expect(screen.getByLabelText('Expected Case 1').textContent).toBe(JSON.stringify(exercise.samples[0].expected))
})

it('does not count an untouched suffix as PASS/FAIL or report whole-run success', () => {
  const snapshot = finished()
  snapshot.csharp!.result.cases.splice(1)
  snapshot.csharp!.result.notRunCaseIndices = [1]
  panel({ execution: { status: 'finished', busy: false, message: 'Done', snapshot } })
  expect(screen.getByRole('status').textContent).toBe('Chưa chạy hết testcase')
  expect(screen.getByRole('tab', { name: 'Case 2 · NOT_RUN' }).getAttribute('data-state')).toBe('NOT_RUN')
  expect(screen.getByRole('tab', { name: 'Case 2 · NOT_RUN' }).querySelector('.lucide-x, .lucide-check')).toBeNull()
  expect(screen.queryByText(/sample tests passed/)).toBeNull()
})

it.each(['exercise', 'language', 'schema'] as const)('immediately discards a result with mismatched %s', context => {
  const ui = panel()
  const snapshot = finished()
  ui.update(context === 'exercise' ? { exercise: { ...exercise, id: 'different-exercise' } }
    : context === 'language' ? { language: 'javascript' }
      : { execution: { status: 'finished', busy: false, message: 'old result', snapshot: {
        ...snapshot, csharp: { ...snapshot.csharp!, schema: { ...snapshot.csharp!.schema, returnType: 'boolean' } } } } })
  expect(screen.getByRole('status').textContent).toBe('Nhấn Run để xem kết quả kiểm thử')
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})

it('replaces the spinner with a real transport error even while Runtime ownership is retained', () => {
  const ui = panel({ execution: { status: 'running', busy: true, message: 'preparing' } })
  ui.update({ execution: { status: 'error', busy: true, message: 'Không thể cập nhật trạng thái; chưa xác nhận thu hồi.' } })
  expect(screen.getByRole('status').textContent).toContain('chưa xác nhận thu hồi')
  expect(screen.queryByRole('status', { name: 'Đang kiểm thử' })).toBeNull()
  expect(screen.queryByRole('tab')).toBeNull()
})

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
it('keeps a new Run loading when old terminal events and snapshot replies arrive late', async () => {
  vi.useFakeTimers()
  const listeners = new Set<(s: ExerciseSnapshot) => void>(), oldProbe = deferred<Awaited<ReturnType<ExerciseApi['snapshot']>>>()
  const pending = deferred<Awaited<ReturnType<ExerciseApi['snapshot']>>>()
  const start = (generation: number): ExerciseSnapshot => {
    const snapshot = finished('csharp', generation); delete snapshot.csharp
    return { ...snapshot, phase: 'prepare', reason: null, sequence: 1,
      cleanup: { state: 'NOT_STARTED', proof: 'PENDING', processClean: false, cleanupComplete: false, workspace: 'RETAINED', pendingIo: false } }
  }
  const api: ExerciseApi = { run: vi.fn<ExerciseApi['run']>().mockResolvedValueOnce({ ok: true, value: start(1) }).mockResolvedValueOnce({ ok: true, value: start(2) }),
    snapshot: vi.fn<ExerciseApi['snapshot']>().mockReturnValueOnce(oldProbe.promise).mockReturnValue(pending.promise),
    stop: vi.fn<ExerciseApi['stop']>().mockResolvedValue({ ok: true, value: finished() }),
    onChanged: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  function Harness() {
    const runtime = useExerciseRuntime({ active: true, exerciseId: exercise.id, language: 'csharp' }, api)
    return <><button onClick={() => { void runtime.run({ exerciseId: exercise.id, language: 'csharp', code: 'sample', sourceRevision: 1 }) }}>Run sample</button>
      <PracticeTestPanel exercise={exercise} language="csharp" execution={runtime.view} tab="result" onTab={vi.fn()} selectedCase={0} onCase={vi.fn()}
        size="open" onSize={vi.fn()} dock="editor" onDock={vi.fn()} /></>
  }
  render(<Harness />)
  await act(async () => { fireEvent.click(screen.getByText('Run sample')) })
  act(() => { for (const listener of listeners) listener(finished()) })
  expect(screen.getByRole('status').textContent).toBe('Passed')
  await act(async () => { fireEvent.click(screen.getByText('Run sample')) })
  await act(async () => { oldProbe.resolve({ ok: true, value: { ...finished(), sequence: 99, stdout: 'stale console' } }) })
  act(() => { for (const listener of listeners) listener({ ...finished(), sequence: 100 }) })
  expect(screen.getByRole('status', { name: 'Đang kiểm thử' })).toBeTruthy()
  expect(screen.queryByText('Passed')).toBeNull()
  expect(screen.queryByText('stale console')).toBeNull()
  act(() => { for (const listener of listeners) listener(finished('csharp', 2)) })
  expect(screen.getByRole('status').textContent).toBe('Passed')
})
