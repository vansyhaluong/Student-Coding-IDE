/** @vitest-environment jsdom */
import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import type { editor } from 'monaco-editor'
import { randomUUID } from 'node:crypto'
import { attachDetection, AI_DIAGNOSTIC_OWNER } from '../../src/renderer/src/features/learning/practice/practice-diagnostics'
import { DetectionIssues } from '../../src/renderer/src/features/learning/practice/DetectionIssues'
import { AssistantQuickActions } from '../../src/renderer/src/features/learning/AssistantQuickActions'
import { constructDetection } from '../../src/main/services/learning/smart-hints/detection'
import { request, capture } from '../fixtures/learning/smart-hints'

let monaco: typeof import('monaco-editor/editor/editor.api')
const disposers: (() => void)[] = []
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  monaco = await import('monaco-editor/editor/editor.api')
  for (const id of ['csharp', 'javascript']) if (!monaco.languages.getLanguages().some(l => l.id === id)) monaco.languages.register({ id })
}, 30000)
afterEach(() => { cleanup(); disposers.splice(0).reverse().forEach(d => d()) })
for (const language of ['csharp', 'javascript'] as const) {
  function fixture(quote = 'return a;') {
    const source = language === 'csharp' ? 'int Sum(int a,int b) {\nreturn a;\n}' : 'function Sum(a,b) {\nreturn a;\n}'
    const model = monaco.editor.createModel(source, language, monaco.Uri.parse(`practice:///synthetic/solution.${language === 'csharp' ? 'cs' : 'js'}`))
    disposers.push(() => model.dispose())
    const q = request({ source, language, action: { kind: 'DETECT_ISSUES' }, origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: model.getVersionId(), eol: 'LF' } })
    const at = source.indexOf(quote)
    const i = { type: 'logic', severity: 'warning', message: 'Thiếu b', explanation: 'Chỉ trả về a.', reason: 'Cần tổng.',
      impact: 'Sai kết quả.', guidance: 'Kiểm tra phép cộng.', evidence: [], range: { startOffset: at, endOffset: at + quote.length, quote } }
    const output = constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...i, range: { ...i.range, startOffset: 0, endOffset: 1 } }, { ...i, message: 'Không định vị', range: null }] })
    let changed = () => {}
    const select = vi.fn(), reveal = vi.fn(), focus = vi.fn()
    const ed = { getModel: () => model, setPosition: select, revealRangeInCenter: reveal, focus,
      createDecorationsCollection: () => {
        let ids: string[] = []
        return { set: (items: editor.IModelDeltaDecoration[]) => { ids = model.deltaDecorations(ids, items) },
          clear: () => { if (!model.isDisposed()) ids = model.deltaDecorations(ids, []) } }
      },
      onDidChangeModelContent: (f: () => void) => model.onDidChangeContent(f),
      onDidChangeModel: (f: () => void) => { changed = f; return { dispose() {} } },
    } as unknown as editor.IStandaloneCodeEditor
    monaco.editor.setModelMarkers(model, 'existing-compiler', [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2, message: 'existing', severity: 8 }])
    const controller = attachDetection(ed, monaco.editor, { source, binding: capture(q).binding, issues: output.issues })
    disposers.push(controller.dispose)
    return { model, source, output, controller, select, reveal, focus,
      lineDecorations: () => model.getAllDecorations().filter(d => d.options.className === 'smart-detection-line'),
      changed: () => changed() }
  }
  it(`${language}: detection immediately marks the full error line and exposes details in the editor marker`, () => {
    const f = fixture(), markers = monaco.editor.getModelMarkers({ owner: AI_DIAGNOSTIC_OWNER, resource: f.model.uri })
    expect(markers).toHaveLength(1); expect(markers[0].message).toContain('Nghi vấn AI')
    expect(f.lineDecorations()).toHaveLength(1)
    expect(f.lineDecorations()[0].options.linesDecorationsClassName).toBe('smart-detection-margin')
    expect(f.lineDecorations()[0].options.isWholeLine).toBe(true)
    expect(f.lineDecorations()[0].range.startLineNumber).toBe(2)
    expect(markers[0].message).toContain('Chỉ trả về a.')
    expect(markers[0].message).toContain('Hướng khắc phục: Kiểm tra phép cộng.')
    expect(f.model.getValue()).toBe(f.source)
    expect(f.select).not.toHaveBeenCalled()
  })
  it(`${language}: a range ending at the next line start does not highlight that line`, () => {
    const f = fixture('return a;\n')
    expect(f.lineDecorations()[0].range.endLineNumber).toBe(2)
  })
  it(`${language}: issue list routes only current valid ranges; unknown locations have no navigation`, () => {
    const f = fixture(); render(<DetectionIssues issues={f.output.issues} onIssue={f.controller.reveal} />)
    fireEvent.click(screen.getByRole('button', { name: /Thiếu b/ })); expect(f.select).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Không định vị/ })); expect(f.select).toHaveBeenCalledOnce()
    expect(f.model.getValue()).toBe(f.source)
    expect(screen.queryByLabelText('Error Details')).toBeNull()
  })
  it(`${language}: edit/Undo cannot revive old markers and preserves existing compiler owner`, () => {
    const f = fixture(); f.model.pushEditOperations([], [{ range: f.model.getFullModelRange(), text: f.source + '\n' }], () => null)
    expect(monaco.editor.getModelMarkers({ owner: AI_DIAGNOSTIC_OWNER, resource: f.model.uri })).toHaveLength(0)
    expect(f.lineDecorations()).toHaveLength(0)
    expect(monaco.editor.getModelMarkers({ owner: 'existing-compiler', resource: f.model.uri })).toHaveLength(1)
    f.model.undo(); expect(f.controller.reveal(f.output.issues[0].id)).toBe(false)
  })
  it(`${language}: model/exercise change and disposal clean owned markers only`, () => {
    const f = fixture(); f.changed()
    expect(monaco.editor.getModelMarkers({ owner: AI_DIAGNOSTIC_OWNER, resource: f.model.uri })).toHaveLength(0)
    expect(f.lineDecorations()).toHaveLength(0)
    expect(f.controller.reveal(f.output.issues[0].id)).toBe(false)
    f.controller.dispose(); expect(monaco.editor.getModelMarkers({ owner: 'existing-compiler', resource: f.model.uri })).toHaveLength(1)
  })
}
it('empty findings explicitly avoid a correctness claim', () => {
  render(<DetectionIssues issues={[]} />)
  expect(screen.getByText(/không phải chứng nhận code đúng/)).toBeTruthy()
})
it('no-selection Suggest Fix is available with Gemini even without the selection parser', () => {
  const onAction = vi.fn()
  const quick = { hints: { capabilities: { enabled: true, providerMode: 'GEMINI_FREE', suggestFixMode: 'DISABLED', suggestFixLanguages: [] },
    language: 'javascript', checking: false }, slot: { current: undefined }, readiness: { state: 'UNAVAILABLE', reason: 'NO_SELECTION' }, onAction }
  render(<AssistantQuickActions quick={quick as never} blocked={false} />)
  const button = screen.getByRole('button', { name: 'Suggest Fix' })
  expect(button.hasAttribute('disabled')).toBe(false); fireEvent.click(button); expect(onAction).toHaveBeenCalledWith('SUGGEST_FIX')
})
