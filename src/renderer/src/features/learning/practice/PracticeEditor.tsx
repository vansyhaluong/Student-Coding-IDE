import Editor from '@monaco-editor/react'
import { useCallback, useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import { monaco } from '../../editor/monaco'
import { capturePracticeSelection, capturePracticeHintApply, createPracticeFixSelectionBinding, type PracticeHintEditor, type SmartSourceSnapshot, type PracticeFixReadiness } from './smart-hints-selection'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { PracticeSourceReplacement } from './use-practice'
import { applySmartFix } from './smart-hint-edits'
import { attachDetection, type DetectionSnapshot } from './practice-diagnostics'

const editorOptions = { automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 4,
  scrollBeyondLastLine: false, padding: { top: 16 } }

export function PracticeEditor({ exercise, language, code, readOnly, onChange, sourceReplacement, onHintEditor, onExplain, onHintInvalidated, onFixSelectionReadiness, sourceRevision = 0, applyBlocked = true, detection }: {
  detection?: DetectionSnapshot
  exercise: Exercise; language: ExerciseLanguage; code: string; readOnly: boolean; onChange(code: string): void
  sourceReplacement?: PracticeSourceReplacement
  onHintEditor?(value: PracticeHintEditor | undefined): void; onExplain?(snapshot: SmartSourceSnapshot): void
  onHintInvalidated?(): void
  onFixSelectionReadiness?(value: PracticeFixReadiness): void
  sourceRevision?: number; applyBlocked?: boolean
}) {
  const initialCode = useRef(code)
  const instance = useRef<editor.IStandaloneCodeEditor | undefined>(undefined)
  const latest = useRef({ onChange, sourceReplacement, exerciseId: exercise.id, language, onHintEditor, onExplain, onHintInvalidated, onFixSelectionReadiness, code, sourceRevision, applyBlocked, readOnly, detection })
  latest.current = { onChange, sourceReplacement, exerciseId: exercise.id, language, onHintEditor, onExplain, onHintInvalidated, onFixSelectionReadiness, code, sourceRevision, applyBlocked, readOnly, detection }
  const diagnostic = useRef<ReturnType<typeof attachDetection> | undefined>(undefined)
  const updateDetection = useCallback(() => {
    diagnostic.current?.dispose(); diagnostic.current = undefined
    const now = latest.current
    if (instance.current && now.detection && now.detection.binding.sourceRevision === now.sourceRevision
      && now.detection.binding.origin.kind === 'PRACTICE' && now.detection.binding.origin.modelId === modelIdentity.current?.id)
      diagnostic.current = attachDetection(instance.current, monaco.editor, now.detection)
  }, [])
  useEffect(updateDetection, [detection, updateDetection])
  useEffect(() => () => diagnostic.current?.dispose(), [])
  const action = useRef<{ dispose(): void } | undefined>(undefined)
  const modelIdentity = useRef<{ model: editor.ITextModel; id: string } | undefined>(undefined)
  const observers = useRef<{ dispose(): void }[]>([])
  const fixSelection = useRef<ReturnType<typeof createPracticeFixSelectionBinding> | undefined>(undefined)
  useEffect(() => () => { action.current?.dispose(); observers.current.splice(0).forEach(o => o.dispose()); fixSelection.current?.dispose(); latest.current.onHintEditor?.(undefined); instance.current = undefined }, [])
  useEffect(() => { fixSelection.current?.refresh() }, [exercise.id, language, code, sourceRevision])
  const applied = useRef<PracticeSourceReplacement | undefined>(undefined)
  const replacing = useRef(false)
  const replace = useCallback(() => {
    const ed = instance.current, { sourceReplacement: change, exerciseId, language } = latest.current
    const model = ed?.getModel()
    if (!ed || !model || model.isDisposed() || !change || applied.current === change
      || change.exerciseId !== exerciseId || change.language !== language
      || model.uri.scheme !== 'practice' || model.uri.path !== `/${exerciseId}/solution.${language === 'csharp' ? 'cs' : 'js'}`) return
    applied.current = change
    if (model.getValue() === change.code) return
    const view = ed.saveViewState()
    const selections = ed.getSelections() ?? undefined
    const eol = /\r\n|\n/.exec(change.code)?.[0]
    ed.pushUndoStop()
    replacing.current = true
    try {
      if (eol && eol !== model.getEOL()) {
        // Change EOL on an empty buffer so Undo's text offsets stay valid in
        // both directions. All three operations share one Undo stack element.
        ed.executeEdits('learning.source.replace', [{ range: model.getFullModelRange(), text: '', forceMoveMarkers: true }], selections)
        model.pushEOL(eol === '\r\n' ? 1 : 0)
      }
      ed.executeEdits('learning.source.replace', [{ range: model.getFullModelRange(), text: change.code, forceMoveMarkers: true }], selections)
    } finally {
      replacing.current = false
    }
    ed.pushUndoStop()
    if (view) ed.restoreViewState(view)
    // Do not persist the temporary empty buffer or a normalized intermediate edit.
    latest.current.onChange(model.getValue())
  }, [])
  useEffect(replace, [sourceReplacement, replace])
  const mounted = useCallback((ed: editor.IStandaloneCodeEditor) => {
    action.current?.dispose(); action.current = undefined
    observers.current.splice(0).forEach(o => o.dispose()); fixSelection.current?.dispose()
    instance.current = ed; replace()
    const capture = () => {
      const model = ed.getModel()
      if (!model) return undefined
      if (modelIdentity.current?.model !== model) modelIdentity.current = { model, id: crypto.randomUUID() }
      return capturePracticeSelection(ed, latest.current.exerciseId, latest.current.language, modelIdentity.current.id)
    }
    // Preserve existing invalidation callbacks; cursor-only changes belong solely to Fix readiness.
    if (latest.current.onHintInvalidated) {
      if (ed.onDidChangeModel) observers.current.push(ed.onDidChangeModel(() => latest.current.onHintInvalidated?.()))
      if (ed.onDidChangeModelContent) observers.current.push(ed.onDidChangeModelContent(() => latest.current.onHintInvalidated?.()))
    }
    const localFix = createPracticeFixSelectionBinding(ed, () => {
      const now = latest.current, model = ed.getModel()
      if (model && modelIdentity.current?.model !== model) modelIdentity.current = { model, id: crypto.randomUUID() }
      return { exerciseId: now.exerciseId, language: now.language, source: now.code, sourceRevision: now.sourceRevision, modelId: modelIdentity.current?.id ?? '' }
    }, value => latest.current.onFixSelectionReadiness?.(value))
    fixSelection.current = localFix
    let failed = false
    updateDetection()
    latest.current.onHintEditor?.({ capture, captureFix: localFix.capture, revealIssue: id => diagnostic.current?.reveal(id) ?? false,
      captureHintApply: () => {
        capture() // Refresh model identity without changing selection.
        const now = latest.current
        return capturePracticeHintApply(ed, { exerciseId: now.exerciseId, language: now.language, source: now.code,
          sourceRevision: now.sourceRevision, modelId: modelIdentity.current?.id ?? '' })
      }, focus: () => ed.focus(), applyFix: fix => {
      const now = latest.current
      try {
        const result = applySmartFix(ed, fix, { exerciseId: now.exerciseId, language: now.language,
          sourceRevision: now.sourceRevision, source: now.code, modelId: modelIdentity.current?.id ?? '',
          blocked: failed || now.applyBlocked || now.readOnly }, (sl, sc, el, ec) => new monaco.Selection(sl, sc, el, ec))
        if (result === 'TRANSACTION_FAILED') failed = true
        return result
      } catch { failed = true; return 'TRANSACTION_FAILED' }
    } })
    if (latest.current.onExplain && ed.addAction) action.current = ed.addAction({
      id: 'learning.smartHints.explain', label: 'Explain with AI', contextMenuGroupId: 'navigation', contextMenuOrder: 1.5,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
      run: () => { const snapshot = capture(); if (snapshot?.selection) latest.current.onExplain?.(snapshot) },
    })
  }, [replace, updateDetection])
  const changed = useCallback((value: string | undefined) => { if (value !== undefined && !replacing.current) latest.current.onChange(value) }, [])
  return <Editor key={`${exercise.id}/${language}`} height="100%" theme="vs"
    path={`practice:///${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}`}
    language={language} defaultValue={initialCode.current} onChange={changed} onMount={mounted}
    keepCurrentModel={false} saveViewState={false}
    options={{ ...editorOptions, readOnly }} />
}
