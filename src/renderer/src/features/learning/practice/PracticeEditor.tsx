import Editor from '@monaco-editor/react'
import { useCallback, useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import '../../editor/monaco'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { PracticeSourceReplacement } from './use-practice'

const editorOptions = { automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 4,
  scrollBeyondLastLine: false, padding: { top: 16 } }

export function PracticeEditor({ exercise, language, code, readOnly, onChange, sourceReplacement }: {
  exercise: Exercise; language: ExerciseLanguage; code: string; readOnly: boolean; onChange(code: string): void
  sourceReplacement?: PracticeSourceReplacement
}) {
  const initialCode = useRef(code)
  const instance = useRef<editor.IStandaloneCodeEditor | undefined>(undefined)
  const latest = useRef({ onChange, sourceReplacement, exerciseId: exercise.id, language })
  latest.current = { onChange, sourceReplacement, exerciseId: exercise.id, language }
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
  const mounted = useCallback((ed: editor.IStandaloneCodeEditor) => { instance.current = ed; replace() }, [replace])
  const changed = useCallback((value: string | undefined) => { if (value !== undefined && !replacing.current) latest.current.onChange(value) }, [])
  return <Editor key={`${exercise.id}/${language}`} height="100%" theme="vs"
    path={`practice:///${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}`}
    language={language} defaultValue={initialCode.current} onChange={changed} onMount={mounted}
    keepCurrentModel={false} saveViewState={false}
    options={{ ...editorOptions, readOnly }} />
}
