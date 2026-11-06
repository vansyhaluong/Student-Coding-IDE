/** @vitest-environment jsdom */
import { beforeAll, afterEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { editor } from 'monaco-editor'
import { createPracticeFixSelectionBinding } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'

let monaco: typeof import('monaco-editor/editor/editor.api')
const models: editor.ITextModel[] = []
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  monaco = await import('monaco-editor/editor/editor.api')
  for (const id of ['csharp', 'javascript']) if (!monaco.languages.getLanguages().some(l => l.id === id)) monaco.languages.register({ id })
}, 30000)
afterEach(() => { models.splice(0).forEach(m => m.dispose()) })

for (const language of ['csharp', 'javascript'] as const) for (const eol of ['\n', '\r\n']) {
  it(`real Monaco model ${language} ${JSON.stringify(eol)}: reversed UTF-16 capture, EOL, frozen target and edit/Undo staleness`, async () => {
    // Register only grammar IDs; no language server or provider is started.
    const source = ['// 😀', 'return a;', 'return a;', '// tail'].join(eol)
    const model = monaco.editor.createModel(source, language, monaco.Uri.parse(`practice:///selection-real/solution.${language === 'csharp' ? 'cs' : 'js'}`)); models.push(model)
    const second = source.indexOf('return a;', source.indexOf('return a;') + 1), a = model.getPositionAt(second), b = model.getPositionAt(second + 9)
    let selections = [new monaco.Selection(b.lineNumber, b.column, a.lineNumber, a.column)]
    const selectionListeners = new Set<() => void>(), modelListeners = new Set<() => void>()
    const ed = { getModel: () => model, getSelections: () => selections,
      onDidChangeCursorSelection: (listener: () => void) => { selectionListeners.add(listener); return { dispose: () => selectionListeners.delete(listener) } },
      onDidChangeModel: (listener: () => void) => { modelListeners.add(listener); return { dispose: () => modelListeners.delete(listener) } },
      onDidChangeModelContent: (listener: () => void) => model.onDidChangeContent(listener),
      onDidChangeModelLanguage: (listener: () => void) => model.onDidChangeLanguage(listener),
    } as unknown as editor.IStandaloneCodeEditor
    const id = randomUUID()
    const binding = createPracticeFixSelectionBinding(ed, () => ({ exerciseId: 'selection-real', language, source, sourceRevision: 3, modelId: id }))
    try {
      binding.refresh()
      const snapshot = binding.capture()!
      expect(snapshot.selection).toMatchObject({ startOffset: second, endOffset: second + 9, text: 'return a;', startLine: 3, startColumn: 1, endColumn: 10 })
      expect(snapshot.origin.eol).toBe(eol === '\r\n' ? 'CRLF' : 'LF')
      expect(snapshot.freezeTarget()).toBe(true)
      selections = [new monaco.Selection(1, 1, 1, 1)]; selectionListeners.forEach(f => f())
      expect(snapshot.isCurrent()).toBe(true); expect(snapshot.selection.startOffset).toBe(second)
      model.pushStackElement(); model.pushEditOperations([], [{ range: new monaco.Range(1, 1, 1, 1), text: ' ' }], () => []); model.pushStackElement()
      expect(snapshot.isCurrent()).toBe(false)
      await model.undo(); expect(model.getValue()).toBe(source); expect(snapshot.isCurrent()).toBe(false)
    } finally { binding.dispose() }
    expect(selectionListeners.size).toBe(0); expect(modelListeners.size).toBe(0)
  })
}
