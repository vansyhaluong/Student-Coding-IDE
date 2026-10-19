import Editor from '@monaco-editor/react'
import '../../editor/monaco'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'

export function PracticeEditor({ exercise, language, code, readOnly, onChange }: {
  exercise: Exercise; language: ExerciseLanguage; code: string; readOnly: boolean; onChange(code: string): void
}) {
  return <Editor key={`${exercise.id}/${language}`} height="100%" theme="vs"
    path={`practice:///${exercise.id}/solution.${language === 'csharp' ? 'cs' : 'js'}`}
    language={language} value={code} onChange={value => { if (value !== undefined) onChange(value) }}
    keepCurrentModel={false} saveViewState={false}
    options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 4,
      scrollBeyondLastLine: false, readOnly, padding: { top: 16 } }} />
}
