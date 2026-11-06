import { useEffect, useRef, useState } from 'react'
import { CircleAlert, FileText, History, Lightbulb } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/motion/tabs'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { useSubmission } from './use-submission'
import { useSubmissionHistory, type HistoryRow } from './use-submission-history'
import { SubmissionHistoryPanel } from './SubmissionHistoryPanel'
import { SubmissionDetails, type RestoreSubmissionSource } from './SubmissionDetails'
import { SubmissionResult } from './SubmissionResult'
import { PracticeSolution } from './PracticeSolution'
import { WrongAnswerPanel } from './WrongAnswerPanel'
import { isSubmissionStatus } from '../../../../../shared/contracts/submission-validation'
import type { SmartSourceSnapshot } from './smart-hints-selection'

/** Only the description pane owns these tabs; the editor and operation observers stay mounted. */
export function PracticeDescription({ exercise, language, locked, active, hidden, submission, sourceRevision, draftCode, restoreBlocked, onRestore, onExplain, onRetireHintSource }: {
  exercise: Exercise; language: ExerciseLanguage; locked: boolean; active: boolean; hidden: boolean
  submission: ReturnType<typeof useSubmission>; onReplace(code: string): void
  sourceRevision: number; draftCode: string; restoreBlocked: boolean; onRestore(request: RestoreSubmissionSource): boolean
  onExplain?(snapshot: SmartSourceSnapshot): void; onRetireHintSource?(blockId: string): void
}) {
  const [tab, setTab] = useState('description')
  const [selected, setSelected] = useState<{ row: HistoryRow; language: ExerciseLanguage }>()
  const [restoreNotice, setRestoreNotice] = useState<string>()
  const handledSubmit = useRef(submission.view.attempt)
  const handledWrongAnswer = useRef<string | undefined>(undefined)
  const status = submission.view.status
  const wrongAnswer = active && status && isSubmissionStatus(status) && status.exerciseId === exercise.id && status.language === language
    && status.verdict === 'WrongAnswer' && status.stage !== 'RUNTIME' ? status : undefined
  const wrongAnswerKey = wrongAnswer ? JSON.stringify([wrongAnswer.reference.sessionId, wrongAnswer.reference.generation,
    wrongAnswer.reference.submissionId, wrongAnswer.exerciseId, wrongAnswer.language, wrongAnswer.sourceRevision]) : undefined
  useEffect(() => {
    if (handledSubmit.current === submission.view.attempt) return
    handledSubmit.current = submission.view.attempt
    setSelected(undefined); setRestoreNotice(undefined); setTab('submission')
    
  }, [submission.view.attempt])
  useEffect(() => {
    if (!wrongAnswerKey || handledWrongAnswer.current === wrongAnswerKey) return
    handledWrongAnswer.current = wrongAnswerKey
    setSelected(undefined); setTab('wrong-answer')
  }, [wrongAnswerKey])
  const visibleTab = tab === 'wrong-answer' && !wrongAnswer ? 'submission' : tab
  const selection = active && !hidden && !submission.view.busy && tab === 'submission' && selected?.language === language ? selected.row : undefined
  useEffect(() => { setSelected(undefined) }, [language, active, hidden])
  const history = useSubmissionHistory(exercise.id, active && !hidden && tab === 'submission' && !submission.view.busy,
    submission.view.status, undefined, `${exercise.id}/${language}`)
  const accepted = history.view.stores?.ACCEPTED
  useEffect(() => {
    if (active && !hidden && tab === 'submission' && accepted) submission.refreshCompletion()
    // Revalidate committed completion when opening/reloading History or its Accepted availability changes.
  }, [active, hidden, tab, accepted?.state, accepted?.readable, accepted?.warning])
  return <div className="practice-description-pane" hidden={hidden}>
    <Tabs value={visibleTab} onValueChange={value => { setSelected(undefined); setTab(value) }} variant="underline" className="practice-description-tabs">
      <TabsList aria-label={wrongAnswer ? 'Description, Solution, Submissions và Wrong Answer' : 'Description, Solution và Submissions'}>
        <TabsTrigger value="description" icon={<FileText className="practice-pane-icon practice-pane-icon-description" />}>Description</TabsTrigger>
        <TabsTrigger value="solution" icon={<Lightbulb className="practice-pane-icon practice-pane-icon-solution" />}>Solution</TabsTrigger>
        <TabsTrigger value="submission" icon={<History className="practice-pane-icon practice-pane-icon-submissions" />}>Submissions</TabsTrigger>
        {wrongAnswer && <TabsTrigger value="wrong-answer" icon={<CircleAlert className="practice-pane-icon practice-pane-icon-wa" />}>Wrong Answer</TabsTrigger>}
      </TabsList>
      <TabsContent value="description" className="practice-description-content">
        <article className="practice-description" aria-label="Description"><h1>{exercise.title}</h1>
          <p>{exercise.description}</p><h2>Input</h2>
          <ul>{exercise.parameters.map(p => <li key={p.name}><code>{p.name}: {p.type}</code></li>)}</ul>
          <h2>Output</h2><p>Trả về <code>{exercise.returnType}</code>.</p>
          <h2>Ví dụ Input / Output</h2>{exercise.samples.map((sample, i) => <pre key={i}>Input: {JSON.stringify(sample.args)}{'\n'}Output: {JSON.stringify(sample.expected)}</pre>)}
          <h2>Constraints</h2><ul>{exercise.constraints.map(c => <li key={c}>{c}</li>)}</ul>
          <details><summary>Nguồn tham khảo · {exercise.source.publisher}</summary><p className="practice-source">{exercise.source.url}</p><p>{exercise.source.usage}</p></details>
        </article>
      </TabsContent>
      <TabsContent value="solution" className="practice-description-content">
        {tab === 'solution' && <PracticeSolution key={exercise.id} exercise={exercise} editorLanguage={language} onExplain={onExplain} onRetire={onRetireHintSource} />}
      </TabsContent>
      <TabsContent value="submission" className="practice-description-content practice-submissions">
        <SubmissionResult view={submission.view} staleSource={submission.staleSource} onCheck={submission.checkStatus} onCompletion={submission.refreshCompletion} />
        <div hidden={submission.view.busy}>
        {restoreNotice && <p className="practice-notice" role="status">{restoreNotice}</p>}
        <div hidden={!!selection}><SubmissionHistoryPanel history={history} completion={submission.view}
          onSelect={row => setSelected({ row, language })} onRefresh={() => { history.refresh(); submission.refreshCompletion() }} /></div>
        {selection && <SubmissionDetails key={selection.source.reference} row={selection} active={active && !hidden && !locked}
          language={language} sourceRevision={sourceRevision} draftCode={draftCode} restoreBlocked={restoreBlocked} onRestore={request => {
            const restored = onRestore(request)
            if (restored && request.language !== language) setRestoreNotice(`Đã Restore source vào Code Draft ${request.language === 'csharp' ? 'C#' : 'JavaScript'}. Chưa Submit.`)
            return restored
          }} onBack={() => setSelected(undefined)} />}
        </div>
      </TabsContent>
      {wrongAnswer && <TabsContent value="wrong-answer" className="practice-description-content">
        <WrongAnswerPanel status={wrongAnswer} staleSource={submission.staleSource} error={submission.view.error} onCheck={submission.checkStatus} />
      </TabsContent>}
    </Tabs>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{wrongAnswerKey ? 'Submit: Wrong Answer.' : ''}</span>
  </div>
}
