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
  const replace = useCallback(() => {
    const ed = instance.current, { sourceReplacement: change, exerciseId, language } = latest.current
    const model = ed?.getModel()
    if (!ed || !model || model.isDisposed() || !change || applied.current === change
      || change.exerciseId !== exerciseId || change.language !== language
      || model.uri.scheme !== 'practice' || model.uri.path !== `/${exerciseId}/solution.${language === 'csharp' ? 'cs' : 'js'}`) return
    applied.current = change
    if (model.getValue() === change.code) return
    const view = ed.saveViewState()
    ed.pushUndoStop()
    ed.executeEdits('learning.source.replace', [{ range: model.getFullModelRange(), text: change.code, forceMoveMarkers: true }], ed.getSelections() ?? undefined)
    ed.pushUndoStop()
    if (view) ed.restoreViewState(view)
  }, [])
  useEffect(replace, [sourceReplacement, replace])
  const mounted = useCallback((ed: editor.IStandaloneCodeEditor) => { instance.current = ed; replace() }, [replace])
  const changed = useCallback((value: string | undefined) => { if (value !== undefined) latest.current.onChange(value) }, [])
  return <Editor key={`${exercise.id}/${language}`} height="100%" theme="vs"
    path={`practice:///${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}`}
    language={language} defaultValue={initialCode.current} onChange={changed} onMount={mounted}
    keepCurrentModel={false} saveViewState={false}
    options={{ ...editorOptions, readOnly }} />
}
