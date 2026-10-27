import { useState } from 'react'
import { CircleAlert, X } from 'lucide-react'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { ExerciseRunView } from './use-exercise-runtime'

/** Presentation of the current public Run observation only, never Submit/Judge data. */
export function runErrorFor(execution: ExerciseRunView, exercise: Exercise, language: ExerciseLanguage) {
  if (execution.status !== 'error' && execution.status !== 'unsupported') return undefined
  const snapshot = execution.snapshot
  if (snapshot && (snapshot.exerciseId !== exercise.id || snapshot.language !== language)) return undefined
  const payload = language === 'csharp' ? snapshot?.csharp : snapshot?.javascript
  if (payload && (payload.schema.returnType !== exercise.returnType || payload.schema.sampleCount !== exercise.samples.length
    || JSON.stringify(payload.schema.parameterTypes) !== JSON.stringify(exercise.parameters.map(p => p.type)))) return undefined
  // An attempted testcase owns its own Runtime error and Actual/Expected detail.
  if (payload?.result.cases.length) return undefined
  const result = payload?.result, failure = result?.failure
  const stage = result && ('compile' in result ? result.compile : result.syntax)
  return {
    title: failure?.kind === 'COMPILE_ERROR' ? 'Compilation Error' : failure?.kind === 'SYNTAX_ERROR' ? 'Syntax Error' : 'Run Error',
    message: execution.message,
    code: failure?.kind ?? snapshot?.reason ?? (execution.status === 'unsupported' ? 'UNSUPPORTED' : undefined),
    diagnostics: stage?.diagnostics ?? [], stdout: stage?.stdout ?? '', stderr: stage?.stderr ?? '',
  }
}

/** Parent keys this sibling by exercise/language/Run intent; dismiss never changes the editor or operation. */
export function RunErrorAlert({ exercise, language, execution, hidden }: {
  exercise: Exercise; language: ExerciseLanguage; execution: ExerciseRunView; hidden?: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  const error = runErrorFor(execution, exercise, language)
  if (!error || dismissed) return null
  return <section className="practice-run-error" role="alert" aria-label="Lỗi Run" hidden={hidden}>
    <div className="practice-run-error-heading"><CircleAlert aria-hidden="true" /><strong>{error.title}</strong>
      <button type="button" className="practice-run-error-close" aria-label="Đóng lỗi Run" title="Đóng lỗi Run" onClick={() => setDismissed(true)}><X aria-hidden="true" /></button>
    </div>
    <p>{error.message}</p>
    {error.code && <code className="practice-run-error-code">{error.code}</code>}
    {error.diagnostics.length > 0 && <ul aria-label="Run diagnostics">{error.diagnostics.map((diagnostic, index) => <li key={index}>
      <code>{diagnostic.code}</code>{diagnostic.source === 'solution'
        ? diagnostic.line !== null ? ` · Dòng ${diagnostic.line}${diagnostic.column !== null ? `, cột ${diagnostic.column}` : ''}` : '' : ' · Compiler/harness'}
    </li>)}</ul>}
    {(error.stdout || error.stderr) && <pre aria-label="Output lỗi Run">{[error.stdout, error.stderr].filter(Boolean).join('\n')}</pre>}
  </section>
}
