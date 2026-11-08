import type { editor } from 'monaco-editor'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { SmartOrigin, SmartSelection } from '../../../../../shared/contracts/smart-hints'
import { SMART_HINT_POLICY as P } from '../../../../../shared/contracts/smart-hints'
import { smartBoundary, smartPosition, smartText, smartInteger, smartUuid } from '../../../../../shared/contracts/smart-hints-validation'
import type { ReviewFix, ApplyFixResult } from './smart-hint-edits'

/** Renderer-local source evidence; no Preload or disk authority. */
export interface SmartSourceSnapshot {
  exerciseId: string; language: ExerciseLanguage; source: string; origin: SmartOrigin; selection?: SmartSelection
  isCurrent(): boolean
}
export interface PracticeHintEditor {
  capture(): SmartSourceSnapshot | undefined; focus(): void; applyFix?(fix: ReviewFix): ApplyFixResult
  captureHintApply?(): HintApplySnapshot | undefined
  /** Fix-only capture; selection freshness freezes only at explicit consent. */
  captureFix?(): PracticeFixSnapshot | undefined
}
export interface PracticeFixContext {
  exerciseId: string; language: ExerciseLanguage; source: string; sourceRevision: number; modelId: string
}
export interface HintApplySnapshot extends SmartSourceSnapshot {
  sourceRevision: number; origin: Extract<SmartOrigin, { kind: 'PRACTICE' }>
}
/** Freeze the one explicit target at click time; later cursor movement cannot rebase it. */
export function capturePracticeHintApply(ed: editor.IStandaloneCodeEditor, c: PracticeFixContext): HintApplySnapshot | undefined {
  const snapshot = capturePracticeSelection(ed, c.exerciseId, c.language, c.modelId), model = ed.getModel(), ranges = ed.getSelections?.()
  if (!snapshot || !model || snapshot.source !== c.source || !snapshot.isCurrent() || ranges?.length !== 1
    || model.getLanguageId() !== c.language || !smartUuid(c.modelId) || !smartInteger(c.sourceRevision)) return
  const a = ranges[0].getStartPosition(), b = ranges[0].getEndPosition(), source = snapshot.source
  const startOffset = model.getOffsetAt(a), endOffset = model.getOffsetAt(b)
  if (!smartBoundary(source, startOffset) || !smartBoundary(source, endOffset) || startOffset > endOffset
    || !smartText(source.slice(startOffset, endOffset), P.selectionBytes, true)) return
  const selection: SmartSelection = { startOffset, endOffset, text: source.slice(startOffset, endOffset),
    startLine: a.lineNumber, startColumn: a.column, endLine: b.lineNumber, endColumn: b.column }
  if (snapshot.origin.kind !== 'PRACTICE') return
  return { ...snapshot, origin: snapshot.origin, selection, sourceRevision: c.sourceRevision }
}
export type PracticeFixReadiness = Readonly<{
  exerciseId: string; language: ExerciseLanguage; sourceRevision: number
} & ({ state: 'READY'; range: Readonly<Omit<SmartSelection, 'text'>>; selectedBytes: number }
  | { state: 'UNAVAILABLE'; reason: 'EDITOR_UNAVAILABLE' | 'STALE_CONTEXT' | 'NO_SELECTION' | 'MULTIPLE_SELECTIONS'
    | 'INVALID_RANGE' | 'INVALID_BOUNDARY' | 'WHITESPACE_ONLY' | 'FULL_SOURCE' | 'SIZE_LIMIT_EXCEEDED' })>
export interface PracticeFixSnapshot extends SmartSourceSnapshot {
  readonly exerciseId: string
  readonly language: ExerciseLanguage
  readonly source: string
  readonly sourceRevision: number
  readonly origin: Readonly<Extract<SmartOrigin, { kind: 'PRACTICE' }>>
  readonly selection: Readonly<SmartSelection>
  /** Freeze the existing target after a final pre-consent freshness check. Does not grant consent or send anything. */
  freezeTarget(): boolean
}

/** Fix-only local capture. Legacy Explain capture and its freshness rules stay separate. */
export function createPracticeFixSelectionBinding(ed: editor.IStandaloneCodeEditor, context: () => PracticeFixContext,
  onReadiness?: (value: PracticeFixReadiness) => void) {
  let alive = true, sourceEpoch = 0, selectionEpoch = 0
  let previousModel: editor.ITextModel | null | undefined, previousContext: string | undefined, previousSelection: string | undefined
  let lastReadiness = ''
  const supported = typeof ed.getSelections === 'function' && typeof ed.onDidChangeCursorSelection === 'function'
    && typeof ed.onDidChangeModel === 'function' && typeof ed.onDidChangeModelContent === 'function'
  const contextKey = (c: PracticeFixContext) => JSON.stringify([c.exerciseId, c.language, c.sourceRevision, c.source, c.modelId])
  const rangeKey = (ranges: ReturnType<typeof ed.getSelections>) => JSON.stringify(ranges?.map(r => [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]) ?? null)
  function inspect() {
    const sourceAtRead = sourceEpoch, selectionAtRead = selectionEpoch
    const c = { ...context() }, model = ed.getModel()
    const base = { exerciseId: c.exerciseId, language: c.language, sourceRevision: c.sourceRevision }
    let selectionKey = '', version = -1, source: string | undefined, eol: string | undefined, modelLanguage: string | undefined
    const unavailable = (reason: Extract<PracticeFixReadiness, { state: 'UNAVAILABLE' }>['reason']) => ({
      readiness: Object.freeze({ ...base, state: 'UNAVAILABLE' as const, reason }), model,
      stamp: JSON.stringify([contextKey(c), version, source, eol, modelLanguage]), selectionKey, data: undefined,
    })
    try {
      if (!alive || !supported || !model || model.isDisposed()) return unavailable('EDITOR_UNAVAILABLE')
      version = model.getVersionId()
      source = model.getValue(); eol = model.getEOL(); modelLanguage = model.getLanguageId()
      const ranges = ed.getSelections()
      selectionKey = rangeKey(ranges)
      if (model.uri.scheme !== 'practice' || model.uri.path !== `/${c.exerciseId}/solution.${c.language === 'csharp' ? 'cs' : 'js'}`
        || modelLanguage !== c.language || source !== c.source || !smartInteger(c.sourceRevision) || !smartInteger(version, 1) || !smartUuid(c.modelId)
        || (eol !== '\n' && eol !== '\r\n')) return unavailable('STALE_CONTEXT')
      if (!smartText(source, P.sourceBytes, true)) return unavailable('SIZE_LIMIT_EXCEEDED')
      if (/\r(?!\n)/.test(source) || (eol === '\n' ? source.includes('\r') : /(?<!\r)\n/.test(source))) return unavailable('INVALID_BOUNDARY')
      if (!ranges?.length) return unavailable('NO_SELECTION')
      if (ranges.length !== 1) return unavailable('MULTIPLE_SELECTIONS')
      const r = ranges[0], a = r.getStartPosition(), b = r.getEndPosition()
      if (![a.lineNumber, a.column, b.lineNumber, b.column].every(x => smartInteger(x, 1))) return unavailable('INVALID_RANGE')
      const start = model.getOffsetAt(a), end = model.getOffsetAt(b)
      if (!smartInteger(start) || !smartInteger(end) || end < start || end > source.length) return unavailable('INVALID_RANGE')
      const ra = model.getPositionAt(start), rb = model.getPositionAt(end)
      if (ra.lineNumber !== a.lineNumber || ra.column !== a.column || rb.lineNumber !== b.lineNumber || rb.column !== b.column) return unavailable('INVALID_RANGE')
      if (start === end) return unavailable('NO_SELECTION')
      if (!smartBoundary(source, start) || !smartBoundary(source, end)) return unavailable('INVALID_BOUNDARY')
      if (start === 0 && end === source.length) return unavailable('FULL_SOURCE')
      const text = source.slice(start, end)
      if (!text.trim()) return unavailable('WHITESPACE_ONLY')
      if (!smartText(text, P.selectionBytes)) return unavailable('SIZE_LIMIT_EXCEEDED')
      const selection = selectedRange(source, start, end)!
      if (selection.startLine !== a.lineNumber || selection.startColumn !== a.column
        || selection.endLine !== b.lineNumber || selection.endColumn !== b.column) return unavailable('INVALID_RANGE')
      // Detect clamping, context/model/source races and selection movement during capture.
      if (sourceAtRead !== sourceEpoch || selectionAtRead !== selectionEpoch
        || ed.getModel() !== model || model.isDisposed() || model.getVersionId() !== version || model.getValue() !== source
        || model.getEOL() !== eol || model.getLanguageId() !== modelLanguage
        || contextKey(context()) !== contextKey(c) || rangeKey(ed.getSelections()) !== selectionKey) return unavailable('STALE_CONTEXT')
      const { text: _text, ...range } = selection
      const readiness: PracticeFixReadiness = Object.freeze({ ...base, state: 'READY', range: Object.freeze(range), selectedBytes: new TextEncoder().encode(_text).length })
      return { readiness, model, stamp: JSON.stringify([contextKey(c), version, source, eol, modelLanguage]), selectionKey,
        data: { ...c, source, selection: Object.freeze(selection), origin: Object.freeze({ kind: 'PRACTICE' as const, modelId: c.modelId, modelVersion: version, eol: eol === '\r\n' ? 'CRLF' as const : 'LF' as const }) } }
    } catch { return unavailable('EDITOR_UNAVAILABLE') }
  }
  function read() {
    const value = inspect()
    if (value.readiness.state === 'UNAVAILABLE' && ['STALE_CONTEXT', 'EDITOR_UNAVAILABLE'].includes(value.readiness.reason)) sourceEpoch++
    if (previousModel !== value.model || previousContext !== value.stamp) sourceEpoch++
    if (previousSelection !== value.selectionKey) selectionEpoch++
    previousModel = value.model; previousContext = value.stamp; previousSelection = value.selectionKey
    return value
  }
  function refresh() {
    const { readiness } = read(), key = JSON.stringify(readiness)
    if (key !== lastReadiness) { lastReadiness = key; onReadiness?.(readiness) }
  }
  const observers: { dispose(): void }[] = []
  if (supported) {
    observers.push(ed.onDidChangeCursorSelection(refresh))
    observers.push(ed.onDidChangeModel(() => { sourceEpoch++; refresh() }))
    observers.push(ed.onDidChangeModelContent(() => { sourceEpoch++; refresh() }))
    if (ed.onDidChangeModelLanguage) observers.push(ed.onDidChangeModelLanguage(() => { sourceEpoch++; refresh() }))
  }
  refresh()
  return {
    refresh,
    capture(): PracticeFixSnapshot | undefined {
      const { data } = read()
      if (!data) return undefined
      const sourceAtCapture = sourceEpoch, selectionAtCapture = selectionEpoch
      let frozen = false
      const isCurrent = () => {
        read()
        return alive && sourceAtCapture === sourceEpoch && (frozen || selectionAtCapture === selectionEpoch)
      }
      return Object.freeze({ exerciseId: data.exerciseId, language: data.language, sourceRevision: data.sourceRevision,
        source: data.source, origin: data.origin, selection: data.selection, isCurrent,
        freezeTarget: () => { if (!isCurrent()) return false; frozen = true; return true } })
    },
    dispose() {
      if (!alive) return
      alive = false; sourceEpoch++; observers.splice(0).forEach(o => o.dispose()); refresh()
    },
  }
}
export function selectedRange(source: string, startOffset: number, endOffset: number): SmartSelection | undefined {
  if (startOffset < 0 || endOffset <= startOffset || endOffset > source.length
    || !smartBoundary(source, startOffset) || !smartBoundary(source, endOffset)) return undefined
  const text = source.slice(startOffset, endOffset)
  if (!smartText(text, 8192)) return undefined
  const start = smartPosition(source, startOffset), end = smartPosition(source, endOffset)
  return { startOffset, endOffset, text, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column }
}
export function capturePracticeSelection(ed: editor.IStandaloneCodeEditor, exerciseId: string,
  language: ExerciseLanguage, modelId: string): SmartSourceSnapshot | undefined {
  const model = ed.getModel()
  if (!model || model.isDisposed() || model.uri.scheme !== 'practice'
    || model.uri.path !== `/${exerciseId}/solution.${language === 'csharp' ? 'cs' : 'js'}`) return undefined
  const source = model.getValue(), version = model.getVersionId(), range = ed.getSelection()
  const selection = range ? selectedRange(source, model.getOffsetAt(range.getStartPosition()), model.getOffsetAt(range.getEndPosition())) : undefined
  return { exerciseId, source, language, origin: { kind: 'PRACTICE', modelId, modelVersion: version, eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF' }, selection,
    isCurrent: () => ed.getModel() === model && !model.isDisposed() && model.getVersionId() === version && model.getValue() === source }
}
export function captureSolutionSelection(node: HTMLElement, source: string, language: ExerciseLanguage,
  blockId: string, exerciseId: string, selection: Selection | null = window.getSelection()): SmartSourceSnapshot | undefined {
  if (!node.isConnected || node.dataset.smartHintsBlock !== blockId || node.textContent !== source || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return undefined
  const range = selection.getRangeAt(0)
  if (!node.contains(range.startContainer) || !node.contains(range.endContainer)) return undefined
  const before = document.createRange(); before.selectNodeContents(node); before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  before.setEnd(range.endContainer, range.endOffset)
  const end = before.toString().length, selected = selectedRange(source, start, end)
  if (!selected || selected.text !== range.toString()) return undefined
  // Equal text alone does not preserve selection provenance after retokenization.
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL), descendants: Node[] = []
  let child: Node | null
  while ((child = walker.nextNode())) descendants.push(child)
  return { exerciseId, source, language, origin: { kind: 'SOLUTION', blockId }, selection: selected,
    isCurrent: () => {
      if (!node.isConnected || node.dataset.smartHintsBlock !== blockId || node.textContent !== source) return false
      const current = document.createTreeWalker(node, NodeFilter.SHOW_ALL)
      return descendants.every(original => current.nextNode() === original) && current.nextNode() === null
    } }
}
