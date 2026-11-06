/** @vitest-environment jsdom */
import { useEffect } from 'react'
import { randomUUID, webcrypto } from 'node:crypto'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { PracticeEditor } from '../../src/renderer/src/features/learning/practice/PracticeEditor'
import { createPracticeFixSelectionBinding, type PracticeFixContext, type PracticeFixReadiness, type PracticeHintEditor } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { exercises } from '../fixtures/learning/legacy-exercises'

const host = vi.hoisted(() => ({ editor: undefined as unknown }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { KeyMod: { CtrlCmd: 2048, Shift: 1024 }, KeyCode: { KeyE: 35 } } }))
vi.mock('@monaco-editor/react', () => ({ default: (props: { onMount(ed: unknown): void }) => {
  useEffect(() => { props.onMount(host.editor) }, [])
  return <div />
} }))
beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const exercise = exercises.find(e => e.id === 'ch2-01')!
type EventKind = 'selection' | 'model' | 'content'

// Model fixture implements Monaco UTF-16 position/offset clamping and event ownership.
function fixture(language: 'csharp' | 'javascript' = 'csharp', initial = 'public class Solution {\r\n public int Sum(int a, int b) {\r\n  return a;\r\n }\r\n}') {
  let source = initial, version = 1, disposed = false, from = source.indexOf('return a;'), to = from + 'return a;'.length
  let eol = source.includes('\r\n') ? '\r\n' : '\n'
  let modelLanguage: string = language
  let current: editor.ITextModel
  let context: PracticeFixContext = { exerciseId: exercise.id, language, source, sourceRevision: 7, modelId: randomUUID() }
  const listeners = { selection: new Set<() => void>(), model: new Set<() => void>(), content: new Set<() => void>() }
  const disposers: ReturnType<typeof vi.fn>[] = []
  const observe = (kind: EventKind) => (handler: () => void) => {
    listeners[kind].add(handler)
    const dispose = vi.fn(() => { listeners[kind].delete(handler) }); disposers.push(dispose)
    return { dispose }
  }
  const emit = (kind: EventKind) => { for (const handler of [...listeners[kind]]) handler() }
  const position = (offset: number) => {
    const lines = source.slice(0, Math.max(0, Math.min(source.length, offset))).split('\n')
    return { lineNumber: lines.length, column: lines.at(-1)!.length + 1 }
  }
  const model = {
    uri: { scheme: 'practice', path: `/${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}` },
    isDisposed: () => disposed, getValue: vi.fn(() => source), getVersionId: vi.fn(() => version), getEOL: () => eol, getLanguageId: () => modelLanguage,
    getPositionAt: vi.fn(position), getOffsetAt: vi.fn((p: { lineNumber: number; column: number }) => {
      const lines = source.split('\n'), line = Math.min(Math.max(1, p.lineNumber), lines.length)
      const offset = lines.slice(0, line - 1).reduce((n, text) => n + text.length + 1, 0)
      return offset + Math.min(Math.max(0, p.column - 1), lines[line - 1].replace(/\r$/, '').length)
    }),
  }
  const range = (a: number, b: number) => {
    const start = position(Math.min(a, b)), end = position(Math.max(a, b))
    return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column,
      getStartPosition: () => start, getEndPosition: () => end }
  }
  current = model as unknown as editor.ITextModel
  const getSelections = vi.fn(() => [range(from, to)])
  const ed = { getModel: () => current, getSelections, getSelection: () => getSelections()[0],
    onDidChangeCursorSelection: observe('selection'), onDidChangeModel: observe('model'), onDidChangeModelContent: observe('content'),
    focus: vi.fn(), executeEdits: vi.fn(), addAction: vi.fn(() => ({ dispose: vi.fn() })) }
  const readiness = vi.fn<(r: PracticeFixReadiness) => void>()
  const create = () => createPracticeFixSelectionBinding(ed as unknown as editor.IStandaloneCodeEditor, () => context, readiness)
  return { ed, model, listeners, disposers, getSelections, position, range, create, readiness,
    get context() { return context },
    setContext(value: Partial<PracticeFixContext>) { context = { ...context, ...value } },
    select(a: number, b: number) { from = a; to = b; emit('selection') },
    emit, setVersion(v: number) { version = v }, setEol(value: string) { eol = value },
    setModelLanguage(value: string) { modelLanguage = value },
    setSource(value: string) { source = value },
    disposeModel() { disposed = true },
    switchModel() { current = { ...model } as unknown as editor.ITextModel; emit('model') },
    source: () => source,
  }
}

describe('D6-1 local Fix capture geometry and immutable source binding', () => {
  it.each(['csharp', 'javascript'] as const)('%s captures single line, multiline and whole-function proper subset from the same snapshot', language => {
    const code = language === 'csharp' ? 'public class Solution {\n public int Sum(int a, int b) {\n  return a;\n }\n}'
      : 'function Sum(a, b) {\n const v = a;\n return v;\n}\nconst tail = 1;'
    const f = fixture(language, code), binding = f.create()
    const start = code.indexOf(language === 'csharp' ? 'return a;' : 'const v = a;'), end = code.indexOf('\n}', start)
    f.select(start, start + (language === 'csharp' ? 9 : 12))
    const line = binding.capture()!
    expect(line.selection.text).toBe(code.slice(line.selection.startOffset, line.selection.endOffset))
    f.select(start, end)
    expect(binding.capture()?.selection.endLine).toBeGreaterThanOrEqual(line.selection.startLine)
    const methodStart = code.indexOf(language === 'csharp' ? 'public int' : 'function'), methodEnd = code.indexOf('}', methodStart) + 1
    f.select(methodStart, methodEnd)
    const method = binding.capture()!
    expect(method.selection.text).toBe(code.slice(methodStart, methodEnd))
    expect(method.sourceRevision).toBe(7); expect(method.origin.modelVersion).toBe(1)
    expect(method.origin.modelId).toBe(f.context.modelId); expect(method.exerciseId).toBe(exercise.id); expect(method.language).toBe(language)
    expect(Object.isFrozen(method)).toBe(true); expect(Object.isFrozen(method.selection)).toBe(true); expect(Object.isFrozen(method.origin)).toBe(true)
    expect(Reflect.set(method.selection, 'startOffset', 0)).toBe(false)
    expect(f.ed.executeEdits).not.toHaveBeenCalled(); binding.dispose()
  })
  it('uses offsets of the second duplicate and accepts reversed anchor direction without searching text', () => {
    const code = 'return a;\nreturn a;\n// tail', f = fixture('javascript', code), binding = f.create()
    const second = code.indexOf('return a;', 1)
    f.select(second + 9, second)
    expect(binding.capture()?.selection).toMatchObject({ startOffset: second, endOffset: second + 9, text: 'return a;', startLine: 2 })
    expect(f.model.getOffsetAt).toHaveBeenCalled(); binding.dispose()
  })
  it.each(['\n', '\r\n'])('captures exact UTF-16 and %j without normalizing text', eol => {
    const code = `// 😀${eol}return a;${eol}tail`, f = fixture('javascript', code), binding = f.create(), start = code.indexOf('return')
    f.select(start, start + 9)
    expect(binding.capture()?.selection).toMatchObject({ startOffset: start, endOffset: start + 9, startLine: 2, startColumn: 1, endColumn: 10 })
    expect(binding.capture()?.origin.eol).toBe(eol === '\r\n' ? 'CRLF' : 'LF')
    f.select(3, 5); expect(binding.capture()?.selection.text).toBe('😀')
    f.select(4, 5); expect(binding.capture()).toBeUndefined()
    if (eol === '\r\n') { f.select(5, 6); expect(binding.capture()).toBeUndefined() }
    binding.dispose()
  })
  it('rejects no/collapsed/whitespace/multi-cursor/full-source selections with no primary fallback', () => {
    const f = fixture('javascript', '  return a;\n tail'), binding = f.create()
    f.select(2, 2); expect(binding.capture()).toBeUndefined()
    f.select(0, 2); expect(binding.capture()).toBeUndefined()
    expect(f.readiness.mock.calls.at(-1)![0]).toMatchObject({ state: 'UNAVAILABLE', reason: 'WHITESPACE_ONLY' })
    f.getSelections.mockReturnValueOnce([]); expect(binding.capture()).toBeUndefined()
    f.getSelections.mockReturnValue([f.range(2, 11), f.range(12, 13)])
    expect(binding.capture()).toBeUndefined()
    f.getSelections.mockImplementation(() => [f.range(0, f.source().length)])
    expect(binding.capture()).toBeUndefined()
    expect(f.ed.executeEdits).not.toHaveBeenCalled(); binding.dispose()
  })
  it('rejects clamped positions, non-integer offsets, source and selection size caps', () => {
    const f = fixture(), binding = f.create()
    const bad = f.range(0, 1); bad.getStartPosition = () => ({ lineNumber: 900, column: 1 })
    f.getSelections.mockReturnValue([bad]); expect(binding.capture()).toBeUndefined()
    f.getSelections.mockImplementation(() => [f.range(1, 2)])
    f.model.getOffsetAt.mockReturnValueOnce(1.5); expect(binding.capture()).toBeUndefined()
    f.getSelections.mockImplementation(() => [f.range(0, 8193)])
    const large = 'x'.repeat(8193) + 'tail'; f.setSource(large); f.setContext({ source: large }); f.select(0, 8193)
    expect(binding.capture()).toBeUndefined()
    f.setSource('x'.repeat(16385)); f.setContext({ source: f.source() }); f.select(1, 2)
    expect(binding.capture()).toBeUndefined(); binding.dispose()
  })
})

describe('D6-1 phase-specific freshness and editor observer lifecycle', () => {
  it('selection movement makes pre-consent capture sticky stale, even if the range moves back; a new capture never retargets the old one', () => {
    const f = fixture(), binding = f.create(), captured = binding.capture()!, old = captured.selection
    f.select(old.startOffset + 1, old.endOffset)
    const second = binding.capture()!
    f.select(old.startOffset, old.endOffset)
    expect(captured.isCurrent()).toBe(false); expect(captured.freezeTarget()).toBe(false)
    expect(second.selection.startOffset).toBe(old.startOffset + 1)
    expect(captured.selection).toBe(old); binding.dispose()
  })
  it('same-range notifications keep capture current; after freeze cursor/multicursor changes cannot retarget it', () => {
    const f = fixture(), binding = f.create(), captured = binding.capture()!, old = captured.selection
    f.emit('selection'); expect(captured.isCurrent()).toBe(true)
    expect(captured.freezeTarget()).toBe(true)
    f.select(0, 0); expect(captured.isCurrent()).toBe(true)
    f.getSelections.mockReturnValue([f.range(0, 1), f.range(2, 3)]); f.emit('selection')
    expect(captured.isCurrent()).toBe(true); expect(captured.selection).toBe(old)
    binding.dispose(); expect(captured.isCurrent()).toBe(false)
  })
  it.each(['source', 'version', 'revision', 'exercise', 'language', 'modelLanguage', 'identity', 'eol', 'model', 'disposed'] as const)('%s change invalidates before and after target freeze', change => {
    const f = fixture(), binding = f.create(), before = binding.capture()!, after = binding.capture()!
    expect(after.freezeTarget()).toBe(true)
    if (change === 'source') f.setSource(f.source() + ' ')
    if (change === 'version') f.setVersion(2)
    if (change === 'revision') f.setContext({ sourceRevision: 8 })
    if (change === 'exercise') f.setContext({ exerciseId: 'ch2-02' })
    if (change === 'language') f.setContext({ language: 'javascript' })
    if (change === 'modelLanguage') f.setModelLanguage('javascript')
    if (change === 'identity') f.setContext({ modelId: randomUUID() })
    if (change === 'eol') f.setEol('\n')
    if (change === 'model') f.switchModel()
    if (change === 'disposed') f.disposeModel()
    expect(before.isCurrent()).toBe(false); expect(after.isCurrent()).toBe(false)
    binding.dispose()
  })
  it.each(['source', 'version', 'revision', 'selection', 'model'] as const)('rejects %s mutation inside a single synchronous capture', change => {
    const f = fixture(), binding = f.create()
    f.model.getOffsetAt.mockImplementationOnce(p => {
      if (change === 'source') f.setSource(f.source() + ' ')
      if (change === 'version') f.setVersion(2)
      if (change === 'revision') f.setContext({ sourceRevision: 8 })
      if (change === 'selection') f.select(0, 1)
      if (change === 'model') f.switchModel()
      return f.source().split('\n').slice(0, p.lineNumber - 1).reduce((n, l) => n + l.length + 1, 0) + p.column - 1
    })
    expect(binding.capture()).toBeUndefined(); binding.dispose()
  })
  it('rejects selection movement-and-return during capture even when the final range matches', () => {
    const f = fixture(), binding = f.create(), first = binding.capture()!.selection
    f.model.getOffsetAt.mockImplementationOnce(p => {
      f.select(0, 1); f.select(first.startOffset, first.endOffset)
      return f.source().split('\n').slice(0, p.lineNumber - 1).reduce((n, l) => n + l.length + 1, 0) + p.column - 1
    })
    expect(binding.capture()).toBeUndefined(); binding.dispose()
  })
  it('a source edit and restore invalidates permanently and disposal releases every observer exactly once', () => {
    const f = fixture(), binding = f.create(), captured = binding.capture()!, original = f.source()
    captured.freezeTarget(); f.setSource(original + ' '); f.emit('content'); f.setSource(original); f.emit('content')
    expect(captured.isCurrent()).toBe(false)
    binding.dispose(); binding.dispose()
    for (const handlers of Object.values(f.listeners)) expect(handlers.size).toBe(0)
    for (const dispose of f.disposers) expect(dispose).toHaveBeenCalledOnce()
    const count = f.readiness.mock.calls.length; f.emit('selection'); expect(f.readiness).toHaveBeenCalledTimes(count)
    expect(binding.capture()).toBeUndefined()
  })
  it('PracticeEditor registers local capture/readiness, refreshes revision and never routes cursor changes to Hint invalidation or edits', () => {
    const f = fixture(); host.editor = f.ed
    const registered = vi.fn<(ed: PracticeHintEditor | undefined) => void>(), invalidated = vi.fn(), readiness = vi.fn()
    const props = { exercise, language: 'csharp' as const, code: f.source(), sourceRevision: 7, readOnly: false, onChange: vi.fn(),
      onHintEditor: registered, onHintInvalidated: invalidated, onFixSelectionReadiness: readiness }
    const ui = render(<PracticeEditor {...props} />), capability = registered.mock.calls[0][0]!, captured = capability.captureFix!()!
    expect(captured.sourceRevision).toBe(7)
    act(() => { f.select(0, 1) })
    expect(captured.isCurrent()).toBe(false); expect(invalidated).not.toHaveBeenCalled()
    const fresh = capability.captureFix!()!; expect(fresh.freezeTarget()).toBe(true)
    act(() => { f.select(2, 3) }); expect(fresh.isCurrent()).toBe(true)
    ui.rerender(<PracticeEditor {...props} sourceRevision={8} />)
    expect(fresh.isCurrent()).toBe(false); expect(capability.captureFix!()?.sourceRevision).toBe(8)
    expect(f.ed.executeEdits).not.toHaveBeenCalled(); expect(props.onChange).not.toHaveBeenCalled()
    ui.unmount(); expect(registered).toHaveBeenLastCalledWith(undefined)
    for (const handlers of Object.values(f.listeners)) expect(handlers.size).toBe(0)
    for (const dispose of f.disposers) expect(dispose).toHaveBeenCalledOnce()
    expect(fresh.isCurrent()).toBe(false)
  })
})
