/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PracticeTestPanel } from '../../src/renderer/src/features/learning/practice/PracticeTestPanel'
import { javascriptFailureMessage } from '../../src/renderer/src/features/learning/practice/use-exercise-runtime'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { javascriptObservation } from '../fixtures/learning/javascript-observation'
import type { ExerciseSnapshot } from '../../src/shared/contracts/exercise'

afterEach(cleanup)
function panel(javascript = structuredClone(javascriptObservation), exerciseId = exercises[0].id) {
  const snapshot: ExerciseSnapshot = { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1, sequence: 5,
    exerciseId, language: 'javascript', sourceRevision: 3, phase: 'finished', reason: javascript.result.failure ? 'RUNTIME_FAILED' : 'COMPLETED',
    stdout: '', stderr: '', javascript, cleanup: { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false } }
  function Harness() {
    const [selectedCase, onCase] = useState(0)
    return <PracticeTestPanel exercise={exercises[0]} selectedCase={selectedCase} onCase={onCase} tab="result" onTab={vi.fn()}
      size="open" onSize={vi.fn()} dock="editor" onDock={vi.fn()} execution={{ status: javascript.result.failure ? 'error' : 'finished', busy: false,
        message: javascript.result.failure ? javascriptFailureMessage[javascript.result.failure.kind] : 'Done', snapshot }} />
  }
  return render(<Harness />)
}
it('shows catalogue input/expected and actual in selectable tabs with an honest NOT_RUN suffix', () => {
  panel()
  expect(screen.getByLabelText('Actual Case 1').textContent).toBe('8')
  expect(screen.getByLabelText('Input Case 1').textContent).toContain('14')
  expect(screen.getByLabelText('Expected Case 1').textContent).toBe('8')
  fireEvent.click(screen.getByRole('tab', { name: /^Case 2/ }))
  expect(screen.getByLabelText('Output Case 2').textContent).toContain('NOT_RUN')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  expect(document.body.textContent).not.toMatch(/Accepted|Wrong Answer|Passed|Failed|\d+\s*ms/)
})
it.each(['RUNTIME_ERROR', 'PROTOCOL_FAILURE'] as const)('renders safe %s and retains later NOT_RUN', kind => {
  const observation = structuredClone(javascriptObservation), failure = { kind, phase: 'execute' as const, caseIndex: 0 }
  observation.result.failure = failure
  observation.result.cases[0] = { caseIndex: 0, outcome: 'FAILED', actual: null, stdout: '', stderr: '', exitCode: null, failure }
  panel(observation)
  expect(screen.getByLabelText('Output Case 1').textContent).toBe(javascriptFailureMessage[kind])
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})
it('renders syntax diagnostics with every sample NOT_RUN', () => {
  const observation = structuredClone(javascriptObservation), failure = { kind: 'SYNTAX_ERROR' as const, phase: 'compile' as const, caseIndex: null }
  observation.result = { syntax: { status: 'FAILED', exitCode: 1, diagnostics: [{ code: 'SYNTAX_ERROR', source: 'solution', line: 2, column: 3 }],
    stdout: '', stderr: '', failure }, cases: [], notRunCaseIndices: [0, 1], failure }
  panel(observation)
  expect(screen.getByLabelText('Syntax diagnostics').textContent).toContain('Dòng 2, cột 3')
  expect(screen.getByLabelText('Output Case 1').textContent).toContain('NOT_RUN')
})
it('rejects results from another displayed exercise or catalogue schema', () => {
  panel(undefined, 'ch2-02')
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
  cleanup()
  const observation = structuredClone(javascriptObservation); observation.schema.returnType = 'boolean'
  panel(observation)
  expect(screen.queryByLabelText('Actual Case 1')).toBeNull()
})
