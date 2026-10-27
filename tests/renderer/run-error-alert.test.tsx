/** @vitest-environment jsdom */
import { useEffect, useRef, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import { RunErrorAlert } from '../../src/renderer/src/features/learning/practice/RunErrorAlert'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import { javascriptFailureMessage, type ExerciseRunView } from '../../src/renderer/src/features/learning/practice/use-exercise-runtime'
import { exercises } from '../fixtures/learning/legacy-exercises'

let monaco: typeof import('monaco-editor/editor/editor.api')
const host = vi.hoisted(() => ({ mounts: 0, unmounts: 0, model: undefined as editor.ITextModel | undefined }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({ PracticeEditor: ({ code }: { code: string }) => {
  const model = useRef<editor.ITextModel | null>(null)
  if (!model.current) model.current = monaco.editor.createModel(code, 'plaintext')
  host.model = model.current
  useEffect(() => { host.mounts++; return () => { host.unmounts++; model.current?.dispose() } }, [])
  return <textarea aria-label="Practice code" defaultValue={code} />
} }))

const exercise = exercises[0]
function failure(language: ExerciseLanguage = 'csharp', generation = 1): ExerciseRunView {
  const kind = language === 'csharp' ? 'COMPILE_ERROR' as const : 'SYNTAX_ERROR' as const
  const failed = { kind, phase: 'compile' as const, caseIndex: null }
  const schema = { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }
  const snapshot: ExerciseSnapshot = { sessionId: `exercise_12345678-1234-4234-8234-${generation.toString().padStart(12, '0')}`, generation,
    sequence: 5, exerciseId: exercise.id, language, sourceRevision: 1, phase: 'finished', reason: 'COMPILATION_FAILED', stdout: '', stderr: '',
    cleanup: { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false } }
  if (language === 'csharp') snapshot.csharp = { schema, result: { compile: { status: 'FAILED', exitCode: 1,
    diagnostics: [{ code: 'CS1002', severity: 'error', source: 'solution', line: 4, column: 9 }],
    stdout: 'CS1002 · solution line 4', stderr: '', failure: { ...failed, kind: 'COMPILE_ERROR' } },
    cases: [], notRunCaseIndices: [0, 1], failure: { ...failed, kind: 'COMPILE_ERROR' } } }
  else snapshot.javascript = { schema, result: { syntax: { status: 'FAILED', exitCode: 1,
    diagnostics: [{ code: 'SYNTAX_ERROR', source: 'solution', line: 2, column: 3 }], stdout: '', stderr: '', failure: { ...failed, kind: 'SYNTAX_ERROR' } },
    cases: [], notRunCaseIndices: [0, 1], failure: { ...failed, kind: 'SYNTAX_ERROR' } } }
  return { status: 'error', busy: false, message: language === 'csharp' ? 'Không thể biên dịch. Kiểm tra cú pháp và chữ ký hàm.' : 'Syntax error: kiểm tra cú pháp và chữ ký hàm.', snapshot }
}
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  monaco = await import('monaco-editor/editor/editor.api')
}, 30_000)
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() })
  host.mounts = 0; host.unmounts = 0; host.model = undefined
  window.studentIde = { learning: {} } as unknown as StudentIdeApi
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['csharp', 'javascript'] as const)('presents actual %s failure codes/locations and supports dismissal', language => {
  const execution = failure(language)
  render(<RunErrorAlert exercise={exercise} language={language} execution={execution} />)
  const alert = screen.getByRole('alert', { name: 'Lỗi Run' })
  expect(alert.textContent).toContain(language === 'csharp' ? 'Compilation Error' : 'Syntax Error')
  expect(screen.getByLabelText('Run diagnostics').textContent).toContain(language === 'csharp' ? 'CS1002 · Dòng 4, cột 9' : 'SYNTAX_ERROR · Dòng 2, cột 3')
  expect(alert.textContent).toContain(execution.message)
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lỗi Run' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['SDK_MISSING', 'SDK_INCOMPATIBLE', 'TIMEOUT', 'INFRASTRUCTURE_FAILURE'] as const)('uses the existing pre-case %s category without inventing testcase failures', kind => {
  const execution = failure()
  execution.snapshot!.csharp!.result.failure = { kind, phase: 'prepare', caseIndex: null }
  execution.snapshot!.csharp!.result.compile = null
  execution.message = 'Thông báo an toàn từ trạng thái Run.'
  render(<RunErrorAlert exercise={exercise} language="csharp" execution={execution} />)
  expect(screen.getByRole('alert').textContent).toContain(kind)
  expect(screen.queryByLabelText('Run diagnostics')).toBeNull()
  expect(screen.queryByRole('tab')).toBeNull()
})

it('keeps an attempted testcase Runtime Error in Test Result instead of a pre-case alert', () => {
  const execution = failure(), runtime = { kind: 'RUNTIME_ERROR' as const, phase: 'execute' as const, caseIndex: 0 }
  execution.snapshot!.csharp!.result.failure = runtime
  execution.snapshot!.csharp!.result.cases = [{ caseIndex: 0, outcome: 'FAILED', actual: null, exitCode: 1, stdout: '', stderr: '', failure: runtime }]
  render(<RunErrorAlert exercise={exercise} language="csharp" execution={execution} />)
  expect(screen.queryByRole('alert')).toBeNull()
})

it.each(['NODE_MISSING', 'NODE_INCOMPATIBLE'] as const)('shows the real pre-case JavaScript %s category', kind => {
  const execution = failure('javascript')
  execution.snapshot!.javascript!.result.syntax = null
  execution.snapshot!.javascript!.result.failure = { kind, phase: 'prepare', caseIndex: null }
  execution.message = javascriptFailureMessage[kind]
  render(<RunErrorAlert exercise={exercise} language="javascript" execution={execution} />)
  expect(screen.getByRole('alert').textContent).toContain(kind)
  expect(screen.getByRole('alert').textContent).toContain(javascriptFailureMessage[kind])
  expect(screen.queryByLabelText('Run diagnostics')).toBeNull()
})

it.each(['exercise', 'language', 'schema'] as const)('suppresses a stale %s alert', context => {
  const execution = failure()
  if (context === 'schema') execution.snapshot!.csharp!.schema.returnType = 'boolean'
  render(<RunErrorAlert exercise={context === 'exercise' ? { ...exercise, id: 'ch2-02' } : exercise}
    language={context === 'language' ? 'javascript' : 'csharp'} execution={execution} />)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('renders only provided output as escaped text and never invents a missing diagnostic line/message', () => {
  const execution = failure('javascript')
  const syntax = execution.snapshot!.javascript!.result.syntax!
  syntax.diagnostics[0].line = null; syntax.diagnostics[0].column = null
  syntax.stderr = '<script>unsafe()</script>'
  render(<RunErrorAlert exercise={exercise} language="javascript" execution={execution} />)
  expect(screen.getByLabelText('Output lỗi Run').textContent).toBe('<script>unsafe()</script>')
  expect(document.querySelector('script')).toBeNull()
  expect(screen.getByLabelText('Run diagnostics').textContent).not.toContain('Dòng')
  expect(screen.getByLabelText('Run diagnostics').textContent).not.toContain('Compiler/harness')
})

it('clears on new Run/success and preserves the same editor node, selection and real Monaco Undo/Redo', async () => {
  const onRun = vi.fn(), onEdit = vi.fn(), onRestore = vi.fn()
  let props: ComponentProps<typeof PracticeWorkspace> = {
    exercises: [], chapter: 2, drafts: [], exercise, language: 'csharp', code: 'original\r\nsource', ready: true, locked: false,
    execution: failure(), onRun, sourceRevision: 1, onRestore,
    submission: { view: { busy: false, completion: 'NOT_COMPLETED', possibleDataLoss: false }, disabledReason: 'Not used',
      staleSource: false, submit: vi.fn(async () => {}), checkStatus: vi.fn(), refreshCompletion: vi.fn() },
    onOpen: vi.fn(), onLanguage: vi.fn(), onEdit, onReplace: vi.fn(),
  }
  const ui = render(<PracticeWorkspace {...props} />)
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
  expect(editor.parentElement!.nextElementSibling).toBe(screen.getByRole('alert'))
  const model = host.model!, id = model.id, edited = 'typed\r\nsource'
  model.pushStackElement(); model.pushEditOperations(null, [{ range: model.getFullModelRange(), text: edited }], () => null); model.pushStackElement()
  fireEvent.change(editor, { target: { value: edited } }); editor.setSelectionRange(2, 5); editor.scrollTop = 12
  fireEvent.click(screen.getByRole('button', { name: 'Đóng lỗi Run' }))
  expect(screen.queryByRole('alert')).toBeNull()
  const assertEditor = () => {
    expect(screen.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
    expect(host.model!.id).toBe(id); expect(model.getValue()).toBe(edited)
    expect(editor.selectionStart).toBe(2); expect(editor.selectionEnd).toBe(5); expect(editor.scrollTop).toBe(12)
    expect(host.mounts).toBe(1); expect(host.unmounts).toBe(0)
  }
  assertEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Run' })); expect(onRun).toHaveBeenCalledOnce()
  props = { ...props, execution: { status: 'running', busy: true, message: 'Đang biên dịch…' } }; ui.rerender(<PracticeWorkspace {...props} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status', { name: 'Đang kiểm thử' })).toBeTruthy()
  assertEditor()
  props = { ...props, execution: failure('csharp', 2) }; ui.rerender(<PracticeWorkspace {...props} />)
  expect(screen.getByRole('alert', { name: 'Lỗi Run' })).toBeTruthy()
  expect(screen.queryByRole('tablist', { name: 'Kết quả sample cases' })).toBeNull()
  assertEditor()
  props = { ...props, execution: { status: 'finished', busy: false, message: 'Đã kết thúc thực thi.' } }; ui.rerender(<PracticeWorkspace {...props} />)
  expect(screen.queryByRole('alert')).toBeNull()
  assertEditor()
  await act(async () => { await model.undo() }); expect(model.getValue()).toBe('original\r\nsource')
  await act(async () => { await model.redo() }); expect(model.getValue()).toBe(edited)
  expect(onEdit).not.toHaveBeenCalled(); expect(onRestore).not.toHaveBeenCalled()
  await waitFor(() => expect(host.mounts).toBe(1))
})
