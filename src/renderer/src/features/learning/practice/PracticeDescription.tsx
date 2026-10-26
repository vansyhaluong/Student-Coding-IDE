import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/motion/tabs'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { useSubmission } from './use-submission'
import { MySolutions } from './MySolutions'
import { useSubmissionHistory, type HistoryRow } from './use-submission-history'
import { SubmissionHistoryPanel } from './SubmissionHistoryPanel'
import { SubmissionDetails, type RestoreSubmissionSource } from './SubmissionDetails'

/** Only the description pane owns these tabs; the editor and operation observers stay mounted. */
export function PracticeDescription({ exercise, language, locked, active, hidden, submission, sourceRevision, draftCode, restoreBlocked, onReplace, onRestore }: {
  exercise: Exercise; language: ExerciseLanguage; locked: boolean; active: boolean; hidden: boolean
  submission: ReturnType<typeof useSubmission>; onReplace(code: string): void
  sourceRevision: number; draftCode: string; restoreBlocked: boolean; onRestore(request: RestoreSubmissionSource): boolean
}) {
  const [tab, setTab] = useState('description')
  const [selected, setSelected] = useState<{ row: HistoryRow; language: ExerciseLanguage }>()
  const [restoreNotice, setRestoreNotice] = useState<string>()
  const selection = active && !hidden && tab === 'submission' && selected?.language === language ? selected.row : undefined
  useEffect(() => { setSelected(undefined) }, [language, active, hidden])
  const history = useSubmissionHistory(exercise.id, active && !hidden && tab === 'submission', submission.view.status)
  const accepted = history.view.stores?.ACCEPTED
  useEffect(() => {
    if (active && !hidden && tab === 'submission' && accepted) submission.refreshCompletion()
    // Revalidate committed completion when opening/reloading History or its Accepted availability changes.
  }, [active, hidden, tab, accepted?.state, accepted?.readable, accepted?.warning])
  return <div className="practice-description-pane" hidden={hidden}>
    <Tabs value={tab} onValueChange={value => { setSelected(undefined); setTab(value) }} variant="underline" className="practice-description-tabs">
      <TabsList aria-label="Description và Submission"><TabsTrigger value="description">Description</TabsTrigger><TabsTrigger value="submission">Submission</TabsTrigger></TabsList>
      <TabsContent value="description" className="practice-description-content">
        <article className="practice-description" aria-label="Description"><p className="learning-eyebrow">Description</p><h1>{exercise.title}</h1>
          <p>{exercise.description}</p><h2>Input</h2>
          <ul>{exercise.parameters.map(p => <li key={p.name}><code>{p.name}: {p.type}</code></li>)}</ul>
          <h2>Output</h2><p>Trả về <code>{exercise.returnType}</code>.</p>
          <h2>Ví dụ Input / Output</h2>{exercise.samples.map((sample, i) => <pre key={i}>Input: {JSON.stringify(sample.args)}{'\n'}Output: {JSON.stringify(sample.expected)}</pre>)}
          <h2>Constraints</h2><ul>{exercise.constraints.map(c => <li key={c}>{c}</li>)}</ul>
          <details><summary>Nguồn tham khảo · {exercise.source.publisher}</summary><p className="practice-source">{exercise.source.url}</p><p>{exercise.source.usage}</p></details>
          <MySolutions key={`${exercise.id}/${language}`} solutions={[]} disabled={locked} onRestore={onReplace} />
        </article>
      </TabsContent>
      <TabsContent value="submission" className="practice-description-content">
        {restoreNotice && <p className="practice-notice" role="status">{restoreNotice}</p>}
        <div hidden={!!selection}><SubmissionHistoryPanel history={history} completion={submission.view}
          onSelect={row => setSelected({ row, language })} onRefresh={() => { history.refresh(); submission.refreshCompletion() }} /></div>
        {selection && <SubmissionDetails key={selection.source.reference} row={selection} active={active && !hidden && !locked}
          language={language} sourceRevision={sourceRevision} draftCode={draftCode} restoreBlocked={restoreBlocked} onRestore={request => {
            const restored = onRestore(request)
            if (restored && request.language !== language) setRestoreNotice(`Đã Restore source vào Code Draft ${request.language === 'csharp' ? 'C#' : 'JavaScript'}. Chưa Submit.`)
            return restored
          }} onBack={() => setSelected(undefined)} />}
      </TabsContent>
    </Tabs>
  </div>
}
