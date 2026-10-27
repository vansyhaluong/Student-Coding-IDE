/** @vitest-environment jsdom */
import { createHash } from 'node:crypto'
import { useEffect } from 'react'
import type { EditorProps } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { PracticeEditor } from '../../src/renderer/src/features/learning/practice/PracticeEditor'

const host = vi.hoisted(() => ({ props: undefined as EditorProps | undefined,
  ed: undefined as editor.IStandaloneCodeEditor | undefined }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({}))
vi.mock('@monaco-editor/react', () => ({ default: (props: EditorProps) => {
  host.props = props
  useEffect(() => { props.onMount?.(host.ed!, undefined as never) }, [])
  return null
} }))

const exercise = exercises.find(e => e.id === 'ch3-01')!
let monaco: typeof import('monaco-editor/editor/editor.api')
let model: editor.ITextModel
let subscription: { dispose(): void }
let restoreView: ReturnType<typeof vi.fn>
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
function exact(value: string) {
  expect(model.getValue()).toBe(value)
  expect(Buffer.from(model.getValue(), 'utf8')).toEqual(Buffer.from(value, 'utf8'))
  expect(hash(model.getValue())).toBe(hash(value))
}
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  monaco = await import('monaco-editor/editor/editor.api')
}, 30_000)
beforeEach(() => {
  model = monaco.editor.createModel('draft\nold\nend', 'plaintext', monaco.Uri.parse('practice:///ch3-01/solution.cs'))
  const selections = [new monaco.Selection(1, 2, 1, 4)]
  const view = { cursorState: selections, scrollTop: 17 }
  restoreView = vi.fn()
  host.ed = { getModel: () => model, saveViewState: () => view, restoreViewState: restoreView,
    getSelections: () => selections, pushUndoStop: () => model.pushStackElement(),
    executeEdits: vi.fn((_source: string, edits: editor.IIdentifiedSingleEditOperation[], end: typeof selections) => {
      model.pushEditOperations(selections, edits, () => end)
      return true
    }) } as unknown as editor.IStandaloneCodeEditor
  subscription = model.onDidChangeContent(event => host.props?.onChange?.(model.getValue(), event))
})
afterEach(() => { cleanup(); subscription.dispose(); model.dispose(); host.props = undefined })

for (const language of ['csharp', 'javascript'] as const) {
  for (const beforeEol of ['\n', '\r\n']) for (const sourceEol of ['\n', '\r\n']) {
    it(`${language}: exact bytes/hash and one-step Undo/Redo for ${JSON.stringify(beforeEol)} -> ${JSON.stringify(sourceEol)}`, async () => {
      if (language === 'javascript') {
        model.dispose()
        model = monaco.editor.createModel('', 'plaintext', monaco.Uri.parse('practice:///ch3-01/solution.js'))
        subscription.dispose()
        subscription = model.onDidChangeContent(event => host.props?.onChange?.(model.getValue(), event))
      }
      const draft = ['prior long draft', 'second', 'last'].join(beforeEol)
      const source = ['// \u03a9 \ud83d\ude00', 'short', 'saved source', ''].join(sourceEol)
      model.setValue(draft)
      model.setEOL(beforeEol === '\r\n' ? 1 : 0)
      const id = model.id, onChange = vi.fn()
      const base = { exercise, language, code: draft, readOnly: false, onChange }
      const ui = render(<PracticeEditor {...base} />)
      const replacement = { exerciseId: exercise.id, language, code: source }
      ui.rerender(<PracticeEditor {...base} sourceReplacement={replacement} />)
      exact(source)
      expect(model.getEOL()).toBe(sourceEol)
      expect(model.id).toBe(id)
      expect(onChange.mock.calls).toEqual([[source]])
      expect(restoreView).toHaveBeenCalledWith({ cursorState: [new monaco.Selection(1, 2, 1, 4)], scrollTop: 17 })
      for (let cycle = 0; cycle < 3; cycle++) {
        await act(async () => { await model.undo() })
        exact(draft)
        expect(model.getEOL()).toBe(beforeEol)
        await act(async () => { await model.redo() })
        exact(source)
        expect(model.getEOL()).toBe(sourceEol)
      }
      ui.rerender(<PracticeEditor {...base} sourceReplacement={replacement} />)
      exact(source)
    })
  }
}

it.each(['', 'one line \u03a9', 'trailing\r\n'])('restores %j without losing empty/trailing source bytes', async source => {
  const draft = model.getValue(), onChange = vi.fn()
  const base = { exercise, language: 'csharp' as const, code: draft, readOnly: false, onChange }
  render(<PracticeEditor {...base} sourceReplacement={{ exerciseId: exercise.id, language: 'csharp', code: source }} />)
  exact(source)
  expect(onChange.mock.calls).toEqual([[source]])
  await act(async () => { await model.undo() })
  exact(draft)
  await act(async () => { await model.redo() })
  exact(source)
})

it.each(['\n', '\r\n'])('preserves Undo/Redo when only EOL changes from %j', async beforeEol => {
  const draft = ['same', '\u03a9 \ud83d\ude00', ''].join(beforeEol)
  const source = ['same', '\u03a9 \ud83d\ude00', ''].join(beforeEol === '\n' ? '\r\n' : '\n')
  model.setValue(draft)
  const onChange = vi.fn()
  render(<PracticeEditor exercise={exercise} language="csharp" code={draft} readOnly={false} onChange={onChange}
    sourceReplacement={{ exerciseId: exercise.id, language: 'csharp', code: source }} />)
  exact(source)
  expect(onChange.mock.calls).toEqual([[source]])
  await act(async () => { await model.undo() })
  exact(draft)
  await act(async () => { await model.redo() })
  exact(source)
})

it('restores into an empty draft and undoes back to its original EOL', async () => {
  model.setValue('')
  model.setEOL(0)
  const source = 'restored\r\n\u03a9\r\n'
  render(<PracticeEditor exercise={exercise} language="csharp" code="" readOnly={false} onChange={vi.fn()}
    sourceReplacement={{ exerciseId: exercise.id, language: 'csharp', code: source }} />)
  exact(source)
  await act(async () => { await model.undo() })
  exact('')
  expect(model.getEOL()).toBe('\n')
  await act(async () => { await model.redo() })
  exact(source)
})

it('separates Restore from earlier typing, preserves the model, and does not replay an applied intent', async () => {
  const initial = model.getValue(), draft = 'typed\n\u03a9\nlast', source = 'saved\r\n\ud83d\ude00\r\nend'
  model.pushEditOperations(null, [{ range: model.getFullModelRange(), text: draft }], () => null)
  const base = { exercise, language: 'csharp' as const, code: draft, readOnly: false, onChange: vi.fn() }
  const ui = render(<PracticeEditor {...base} />)
  const replacement = { exerciseId: exercise.id, language: 'csharp' as const, code: source }
  ui.rerender(<PracticeEditor {...base} sourceReplacement={replacement} />)
  await act(async () => { await model.undo() })
  exact(draft)
  ui.rerender(<PracticeEditor {...base} sourceReplacement={replacement} />)
  exact(draft)
  await act(async () => { await model.undo() })
  exact(initial)
  await act(async () => { await model.redo(); await model.redo() })
  exact(source)
})

it.each([
  { exerciseId: 'ch3-02', language: 'csharp' as const },
  { exerciseId: exercise.id, language: 'javascript' as const },
])('rejects a stale replacement for $exerciseId/$language', context => {
  const draft = model.getValue(), onChange = vi.fn()
  render(<PracticeEditor exercise={exercise} language="csharp" code={draft} readOnly={false} onChange={onChange}
    sourceReplacement={{ ...context, code: 'wrong\r\nsource' }} />)
  exact(draft)
  expect(onChange).not.toHaveBeenCalled()
  expect(host.ed!.executeEdits).not.toHaveBeenCalled()
})

it('leaves the draft alone without an explicit replacement and after unmount', () => {
  const draft = model.getValue(), onChange = vi.fn()
  const base = { exercise, language: 'csharp' as const, code: draft, readOnly: false, onChange }
  const ui = render(<PracticeEditor {...base} />)
  ui.rerender(<PracticeEditor {...base} code="saved\r\nsource" />)
  exact(draft)
  ui.unmount()
  expect(host.ed!.executeEdits).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
})
