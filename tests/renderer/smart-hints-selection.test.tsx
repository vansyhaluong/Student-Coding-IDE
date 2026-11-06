/** @vitest-environment jsdom */
import { useEffect } from 'react'
import { randomUUID, webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { PracticeEditor } from '../../src/renderer/src/features/learning/practice/PracticeEditor'
import { PracticeSolution } from '../../src/renderer/src/features/learning/practice/PracticeSolution'
import { captureSolutionSelection, selectedRange, type PracticeHintEditor } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { exercises } from '../fixtures/learning/legacy-exercises'

const host = vi.hoisted(() => ({ editor: undefined as unknown, props: undefined as unknown, mounts: 0 }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: {
  KeyMod: { CtrlCmd: 2048, Shift: 1024 }, KeyCode: { KeyE: 35 },
  editor: { colorize: async () => '', tokenize: (s: string) => s.split('\n').map(() => [{ offset: 0, type: 'plain' }]) },
} }))
vi.mock('@monaco-editor/react', () => ({ default: (props: { onMount(ed: unknown): void }) => {
  host.props = props
  useEffect(() => { host.mounts++; props.onMount(host.editor) }, [])
  return <div data-testid="monaco-host" />
} }))
const exercise = exercises.find(e => e.id === 'ch2-01')!
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); host.mounts = 0 })
afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals() })

describe('SH-2 Practice local read-only Monaco capability', () => {
  it.each(['csharp', 'javascript'] as const)('%s single/multiline primary selection binds real model identity/version/URI', language => {
    let text = '// 🐟\r\nfirst\r\nsecond', version = 3, disposed = false
    const model = { uri: { scheme: 'practice', path: `/${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}` },
      isDisposed: () => disposed, getValue: () => text, getVersionId: () => version, getEOL: () => '\r\n',
      getOffsetAt: (p: { lineNumber: number; column: number }) => text.split('\n').slice(0, p.lineNumber - 1).reduce((n, s) => n + s.length + 1, 0) + p.column - 1 }
    let end = { lineNumber: 2, column: 6 }
    const addAction = vi.fn<(a: editor.IActionDescriptor) => { dispose: ReturnType<typeof vi.fn> }>(() => ({ dispose: vi.fn() })), executeEdits = vi.fn(), focus = vi.fn(), invalidated = vi.fn()
    const onDidChangeModel = vi.fn<(handler: () => void) => { dispose: ReturnType<typeof vi.fn> }>(() => ({ dispose: vi.fn() })), onDidChangeModelContent = vi.fn<(handler: () => void) => { dispose: ReturnType<typeof vi.fn> }>(() => ({ dispose: vi.fn() }))
    host.editor = { getModel: () => model, getSelection: () => ({ getStartPosition: () => ({ lineNumber: 2, column: 1 }), getEndPosition: () => end }), addAction, executeEdits, focus, onDidChangeModel, onDidChangeModelContent }
    const registered = vi.fn<(value: PracticeHintEditor | undefined) => void>(), explain = vi.fn()
    const ui = render(<PracticeEditor exercise={exercise} language={language} code={text} readOnly={false} onChange={() => {}} onHintEditor={registered} onExplain={explain} onHintInvalidated={invalidated} />)
    const capability = registered.mock.calls[0][0]!, first = capability.capture()!
    expect(first.selection?.text).toBe('first'); expect(first.exerciseId).toBe(exercise.id)
    end = { lineNumber: 3, column: 7 }
    const multiple = capability.capture()!; expect(multiple.selection?.text).toBe('first\r\nsecond')
    expect(multiple.origin).toEqual(first.origin)
    act(() => { void addAction.mock.calls[0][0].run(host.editor as editor.IStandaloneCodeEditor) })
    expect(explain.mock.calls[0][0].selection.text).toBe('first\r\nsecond'); expect(addAction.mock.calls[0][0].keybindings).toEqual([2048 | 1024 | 35])
    ui.rerender(<PracticeEditor exercise={exercise} language={language} code={text} readOnly={false} onChange={() => {}} onHintEditor={registered} onExplain={explain} onHintInvalidated={invalidated} />)
    expect(host.mounts).toBe(1); expect(executeEdits).not.toHaveBeenCalled()
    version++; expect(first.isCurrent()).toBe(false)
    onDidChangeModelContent.mock.calls[0][0](); onDidChangeModel.mock.calls[0][0](); expect(invalidated).toHaveBeenCalledTimes(2)
    text = '// different'; expect(multiple.isCurrent()).toBe(false)
    disposed = true; expect(capability.capture()).toBeUndefined()
    ui.unmount(); expect(registered).toHaveBeenLastCalledWith(undefined); expect(addAction.mock.results[0].value.dispose).toHaveBeenCalledOnce()
    expect(onDidChangeModel.mock.results[0].value.dispose).toHaveBeenCalledOnce(); expect(onDidChangeModelContent.mock.results[0].value.dispose).toHaveBeenCalledOnce()
  })
  it('rejects split UTF-16 surrogates, CRLF, whitespace-only and oversized selections', () => {
    const code = 'a🐟\r\nb'
    expect(selectedRange(code, 2, 3)).toBeUndefined(); expect(selectedRange(code, 3, 4)).toBeUndefined()
    expect(selectedRange('  ', 0, 2)).toBeUndefined(); expect(selectedRange('x'.repeat(8193), 0, 8193)).toBeUndefined()
    expect(selectedRange(code, 1, 3)?.text).toBe('🐟')
  })
})

function select(node: HTMLElement, from = 0, to = node.textContent!.length) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), nodes: Text[] = []
  let item: Node | null; while ((item = walker.nextNode())) nodes.push(item as Text)
  const position = (offset: number): [Node, number] => {
    let remaining = offset
    for (const n of nodes) { if (remaining <= n.length) return [n, remaining]; remaining -= n.length }
    return [node, node.childNodes.length]
  }
  const range = document.createRange(), a = position(from), b = position(to)
  range.setStart(...a); range.setEnd(...b); const s = window.getSelection()!; s.removeAllRanges(); s.addRange(range)
}
describe('SH-2 Solution DOM selection (no Monaco editor)', () => {
  it('retires a captured selection when tokenization replaces DOM with identical source text', () => {
    const id = randomUUID(), source = 'first\nsecond'
    render(<code data-smart-hints-block={id} data-testid="retokenized">{source}</code>)
    const node = screen.getByTestId('retokenized'); select(node)
    const snapshot = captureSolutionSelection(node, source, 'javascript', id, exercise.id)!
    expect(snapshot.isCurrent()).toBe(true)
    const span = document.createElement('span'); span.textContent = source; node.replaceChildren(span)
    expect(node.textContent).toBe(source)
    expect(snapshot.isCurrent()).toBe(false)
  })
  it('exact token-span multiline selection, mismatch/outside/cross-block rejection', () => {
    const id = randomUUID(), ui = render(<><code data-smart-hints-block={id} data-testid="code"><span>first🐟</span>{'\n'}<span>second</span></code><p data-testid="outside">not code</p></>)
    const node = screen.getByTestId('code'), source = node.textContent!
    select(node, 0, source.length)
    const snap = captureSolutionSelection(node, source, 'javascript', id, exercise.id)!
    expect(snap.selection?.text).toBe(source); expect(snap.selection?.endLine).toBe(2); expect(snap.origin.kind).toBe('SOLUTION')
    expect(captureSolutionSelection(node, source + 'wrong', 'javascript', id, exercise.id)).toBeUndefined()
    expect(captureSolutionSelection(node, source, 'javascript', randomUUID(), exercise.id)).toBeUndefined()
    const range = document.createRange(); range.setStart(node.firstChild!.firstChild!, 0); range.setEnd(screen.getByTestId('outside').firstChild!, 3)
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
    expect(captureSolutionSelection(node, source, 'javascript', id, exercise.id)).toBeUndefined()
    ui.unmount(); expect(snap.isCurrent()).toBe(false)
  })
  it('actual Solution full-code selection is Vietnamese explanation input, never Apply', async () => {
    const explain = vi.fn(), retire = vi.fn()
    render(<PracticeSolution exercise={exercise} editorLanguage="csharp" onExplain={explain} onRetire={retire} />)
    const pre = screen.getByLabelText('Code hoàn chỉnh'), code = pre.querySelector('code')!
    await waitFor(() => expect(code.dataset.highlighted).toBe('true'))
    const text = code.textContent!, start = text.indexOf('\n') + 1
    select(code, start, text.length)
    const container = pre.parentElement!
    fireEvent.pointerDown(within(container).getByRole('button', { name: 'Explain with AI' }))
    fireEvent.click(within(container).getByRole('button', { name: 'Explain with AI' }))
    expect(explain).toHaveBeenCalledOnce(); expect(explain.mock.calls[0][0].selection.text).toBe(text.slice(start))
    expect(explain.mock.calls[0][0].language).toBe('csharp'); expect(code.textContent).toBe(text); expect(code.hasAttribute('contenteditable')).toBe(false)
    expect(screen.queryByRole('button', { name: /Apply|Diff/ })).toBeNull()
  })
  it('keyboard select-all/explain and Solution language/unmount retire the right block', async () => {
    const explain = vi.fn(), retire = vi.fn()
    const ui = render(<PracticeSolution exercise={exercise} editorLanguage="csharp" onExplain={explain} onRetire={retire} />)
    let pre = screen.getByLabelText('Code hoàn chỉnh'), code = pre.querySelector('code')!
    await waitFor(() => expect(code.dataset.highlighted).toBe('true'))
    fireEvent.keyDown(pre, { ctrlKey: true, key: 'a' }); fireEvent.keyDown(pre, { ctrlKey: true, shiftKey: true, key: 'e' })
    expect(explain).toHaveBeenCalledOnce(); const old = explain.mock.calls[0][0]
    expect(old.selection.text).toBe(code.textContent)
    ui.rerender(<PracticeSolution exercise={exercise} editorLanguage="csharp" onExplain={explain} onRetire={retire} />)
    expect(old.isCurrent()).toBe(true) // Plain rerender retains registered source; no fake stale selection.
    fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }))
    expect(retire).toHaveBeenCalledWith(old.origin.blockId); expect(old.isCurrent()).toBe(false)
    pre = screen.getByLabelText('Code hoàn chỉnh'); code = pre.querySelector('code')!
    await waitFor(() => expect(code.dataset.highlighted).toBe('true'))
    fireEvent.keyDown(pre, { ctrlKey: true, key: 'a' }); fireEvent.keyDown(pre, { ctrlKey: true, shiftKey: true, key: 'e' })
    expect(explain.mock.calls.at(-1)![0].language).toBe('javascript')
    const last = explain.mock.calls.at(-1)![0]; ui.unmount(); expect(retire).toHaveBeenCalledWith(last.origin.blockId)
  })
  it('missing/collapsed selection gives honest instructions instead of a whole-source request', async () => {
    const explain = vi.fn(); render(<PracticeSolution exercise={exercise} editorLanguage="csharp" onExplain={explain} />)
    const pre = screen.getByLabelText('Code hoàn chỉnh'); await waitFor(() => expect(pre.querySelector('code')!.dataset.highlighted).toBe('true'))
    window.getSelection()?.removeAllRanges(); fireEvent.click(within(pre.parentElement!).getByRole('button', { name: 'Explain with AI' }))
    expect(explain).not.toHaveBeenCalled(); expect(screen.getByText(/Hãy chọn code bên trong một khối/)).toBeTruthy()
  })
})
