import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Play, RotateCcw } from 'lucide-react'
import type { Exercise, ExerciseLanguage, ExerciseDraft, ExerciseSummary } from '../../../../../shared/contracts/practice'
import { PracticeDescription } from './PracticeDescription'
import { PracticeTestPanel, type TestPanelDock, type TestPanelSize } from './PracticeTestPanel'
import type { ExerciseRunView } from './use-exercise-runtime'
import type { PracticeSourceReplacement } from './use-practice'
import type { useSubmission } from './use-submission'
import type { RestoreSubmissionSource } from './SubmissionDetails'
import { RunErrorAlert } from './RunErrorAlert'
import { useSmartHints } from './use-smart-hints'
import { SmartHintsPanel } from './SmartHintsPanel'
import type { PracticeHintEditor, SmartSourceSnapshot, PracticeFixReadiness } from './smart-hints-selection'
import type { SmartFix } from './smart-hint-edits'
const PracticeEditor = lazy(async () => ({ default: (await import('./PracticeEditor')).PracticeEditor }))
const SmartHintDiffPreview = lazy(async () => ({ default: (await import('./SmartHintDiffPreview')).SmartHintDiffPreview }))

interface Props {
  exercises: ExerciseSummary[]; chapter: number; drafts: ExerciseDraft[]; exercise: Exercise | undefined
  language: ExerciseLanguage; code: string; ready: boolean; locked: boolean
  execution: ExerciseRunView; onRun(): void
  submission: ReturnType<typeof useSubmission>
  active?: boolean
  sourceRevision: number; onRestore(request: RestoreSubmissionSource): boolean
  sourceReplacement?: PracticeSourceReplacement
  onOpen(exercise?: ExerciseSummary): void; onLanguage(language: ExerciseLanguage): void; onEdit(code: string): void; onReplace(code: string): void
}
export function PracticeWorkspace({ exercises, chapter, drafts, exercise, language, code, ready, locked, execution, submission, active = true, sourceRevision, onRestore, onRun, onOpen, onLanguage, onEdit, onReplace, sourceReplacement }: Props) {
  const [reset, setReset] = useState(false)
  const [tab, setTab] = useState<'tests' | 'result'>('tests')
  const [selectedCase, setSelectedCase] = useState(0)
  const [panelSize, setPanelSize] = useState<TestPanelSize>('open')
  const [panelDock, setPanelDock] = useState<TestPanelDock>('editor')
  const [runRequest, setRunRequest] = useState(0)
  const editor = useRef<PracticeHintEditor | undefined>(undefined), aiTrigger = useRef<HTMLButtonElement>(null)
  const hintPanelId = useId()
  const hints = useSmartHints({ active: active && ready && !!exercise, locked, exerciseId: exercise?.id, language, source: code, sourceRevision })
  const setHintEditor = useCallback((value: PracticeHintEditor | undefined) => { editor.current = value }, [])
  const [fixReadiness, setFixReadiness] = useState<PracticeFixReadiness>()
  const onFixReadiness = useCallback((value: PracticeFixReadiness) => {
    setFixReadiness(value); hints.selectionChanged()
  }, [hints.selectionChanged])
  const explain = useCallback((snapshot: SmartSourceSnapshot) => { if (snapshot.selection) void hints.begin({ kind: 'EXPLAIN', selection: snapshot.selection }, snapshot) }, [hints.begin])
  const [hintNotice, setHintNotice] = useState('')
  const [fix, setFix] = useState<SmartFix>()
  const applyBlocked = !active || !ready || locked || execution.busy || submission.view.busy || reset || hints.capabilities?.applyEnabled !== true
  useEffect(() => {
    if (fix && (!hints.open || !active || !fix.isCurrent())) setFix(undefined)
  }, [fix, hints.open, hints.view, active, sourceRevision, code])
  const capture = () => {
    const snapshot = editor.current?.capture()
    if (!snapshot || snapshot.exerciseId !== exercise?.id || snapshot.language !== language || snapshot.source !== code) { setHintNotice('Code Editor chưa sẵn sàng hoặc snapshot đã thay đổi. Hãy thử lại.'); return undefined }
    setHintNotice(''); return snapshot
  }
  const runSnapshot = execution.snapshot
  hints.setRun(runSnapshot && runSnapshot.exerciseId === exercise?.id && runSnapshot.language === language && runSnapshot.sourceRevision === sourceRevision
    && runSnapshot.phase === 'finished' && runSnapshot.cleanup.state === 'FINALIZED'
    ? { sessionId: runSnapshot.sessionId, generation: runSnapshot.generation, sequence: runSnapshot.sequence } : null)
  if (!ready) return <p role="status">Đang tải bài tập và Code Draft…</p>
  if (!exercise) return <section className="practice-list" aria-label={`Bài tập chương ${chapter}`}>
    <p className="learning-eyebrow">Luyện tập / Chương {chapter}</p><h1>Viết code. Giải bài.</h1>
    {exercises.some(e => !e.available) && <p role="alert">Một số bài tập không khả dụng: {exercises.filter(e => !e.available).map(e => e.id).join(', ')}. Code Draft đã lưu được giữ nguyên.</p>}
    <p>{exercises.filter(e => e.chapter === chapter).length} bài tập · {(['Easy', 'Medium', 'Hard'] as const).map(d => `${exercises.filter(e => e.chapter === chapter && e.difficulty === d).length} ${d}`).join(' · ')}</p>
    {(['Easy', 'Medium', 'Hard'] as const).map(difficulty => <section key={difficulty}>
      <h2><span className="practice-difficulty" data-level={difficulty}>{difficulty}</span></h2>
      {exercises.filter(e => e.chapter === chapter && e.difficulty === difficulty).map(e =>
        <button type="button" className="practice-row" disabled={locked} key={e.id} onClick={() => { setReset(false); setTab('tests'); setSelectedCase(0); onOpen(e) }}>
          <span>{e.title}</span><span>{e.hasDraft || drafts.some(d => d.exerciseId === e.id) ? 'Có bản nháp' : 'Chưa có bản nháp'} →</span>
        </button>)}
    </section>)}
  </section>
  const testPanel = <PracticeTestPanel exercise={exercise} language={language} tab={tab} onTab={setTab} selectedCase={selectedCase} onCase={setSelectedCase}
    size={panelSize} onSize={setPanelSize} dock={panelDock} onDock={setPanelDock} execution={execution} />
  return <div className="practice-workspace">
    <header className="practice-heading"><button type="button" className="practice-icon-button" aria-label="Về danh sách bài tập" title="Về danh sách bài tập"
      disabled={locked} onClick={() => { hints.invalidate('EXERCISE'); setReset(false); onOpen() }}><ArrowLeft aria-hidden="true" /></button>
      <span>Chương {chapter} / {exercise.title}</span><span className="practice-difficulty" data-level={exercise.difficulty}>{exercise.difficulty}</span>
      <button ref={aiTrigger} type="button" className="practice-smart-hints" aria-label="Smart Hints" title="Smart Hints" disabled={locked || !active} aria-expanded={hints.open} aria-controls={hintPanelId} onClick={hints.show}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="m9 6 2.5 5.5L17 14l-5.5 2.5L9 22l-2.5-5.5L1 14l5.5-2.5L9 6Zm9-5 1.5 3.5L23 6l-3.5 1.5L18 11l-1.5-3.5L13 6l3.5-1.5L18 1Zm2 16 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />
        </svg>
      </button>
      <button type="button" className="practice-icon-button practice-run" disabled={locked || execution.busy || submission.view.busy} aria-label="Run" title="Run"
        onClick={() => { setRunRequest(value => value + 1); setTab('result'); if (panelSize === 'collapsed') setPanelSize('open'); onRun() }}><Play aria-hidden="true" fill="currentColor" /></button>
      <button type="button" className="practice-submit" disabled={locked || !!submission.disabledReason}
        title={submission.disabledReason ?? 'Submit'} aria-describedby={submission.disabledReason && !submission.view.busy ? 'practice-submit-availability' : undefined}
        onClick={() => {
          if (panelDock === 'bottom' && panelSize === 'expanded') setPanelSize('open')
          void submission.submit()
        }}>Submit</button>
    </header>
    {submission.disabledReason && !submission.view.busy && <p id="practice-submit-availability" className="practice-submit-availability">{submission.disabledReason}</p>}
    <div className="practice-split" data-panel-dock={panelDock} data-panel-size={panelSize}>
      <PracticeDescription key={exercise.id} exercise={exercise} language={language} locked={locked} active={active && !locked}
        hidden={panelDock === 'bottom' && panelSize === 'expanded'} submission={submission} sourceRevision={sourceRevision} draftCode={code}
        restoreBlocked={locked || execution.busy || submission.view.busy} onReplace={onReplace} onRestore={request => {
          const restored = onRestore(request); if (restored) hints.invalidate('RESTORE'); return restored
        }} onExplain={explain} onRetireHintSource={hints.retireSolution} />
      <div className="practice-code-column" hidden={panelDock === 'bottom' && panelSize === 'expanded'}>
        <div className="practice-editor-heading" hidden={panelDock === 'editor' && panelSize === 'expanded'}><span>Code Editor</span>
          <label>Ngôn ngữ <select aria-label="Ngôn ngữ bài tập" value={language} disabled={locked} onChange={e => { hints.invalidate('LANGUAGE'); setReset(false); onLanguage(e.target.value as ExerciseLanguage) }}>
            <option value="csharp">C#</option><option value="javascript">JavaScript</option>
          </select></label>
          <button type="button" className="practice-icon-button" disabled={locked} aria-label="Reset Code" title="Reset Code" onClick={() => setReset(true)}><RotateCcw aria-hidden="true" /></button>
        </div>
        {reset && <div className="practice-confirm" role="alertdialog" aria-modal="false" aria-label="Xác nhận Reset Code" hidden={panelDock === 'editor' && panelSize === 'expanded'}>
          <p>Thay Code Draft {language === 'csharp' ? 'C#' : 'JavaScript'} của bài này bằng hàm mẫu?</p>
          <button type="button" disabled={locked} onClick={() => { hints.invalidate('RESET'); onReplace(exercise.languages[language].starter); setReset(false) }}>Xác nhận Reset</button>
          <button type="button" onClick={() => setReset(false)}>Hủy</button>
        </div>}
        <div className="practice-editor" aria-label="Code Editor" hidden={panelDock === 'editor' && panelSize === 'expanded'}><Suspense fallback={<p>Đang tải Code Editor…</p>}><PracticeEditor key={`${exercise.id}/${language}`} exercise={exercise} language={language} code={code} sourceReplacement={sourceReplacement} readOnly={locked}
          sourceRevision={sourceRevision} applyBlocked={applyBlocked}
          onHintEditor={setHintEditor} onFixSelectionReadiness={onFixReadiness} onExplain={explain} onHintInvalidated={hints.invalidate} onChange={value => { hints.invalidate('EDIT'); onEdit(value) }} /></Suspense></div>
        <RunErrorAlert key={`${exercise.id}/${language}/${runRequest}`} exercise={exercise} language={language} execution={execution}
          hidden={panelDock === 'editor' && panelSize === 'expanded'} />
        {panelDock === 'editor' && testPanel}
      </div>
      {panelDock === 'bottom' && testPanel}
    </div>
    {fix && fix.isCurrent() && hints.open && active && !locked && <Suspense fallback={<p role="status">Đang tải Diff Preview…</p>}><SmartHintDiffPreview fix={fix} blocked={applyBlocked}
      onReturnFocus={() => editor.current?.focus()}
      onDiscard={() => { setFix(undefined); hints.cancel(); setHintNotice('Đã bỏ đề xuất. Code giữ nguyên.'); editor.current?.focus() }}
      onApplied={() => { setFix(undefined); setHintNotice('Đã áp dụng bản sửa. Dùng Undo/Redo trong Code Editor để kiểm tra lại.'); editor.current?.focus() }}
      onApply={() => {
        const result = applyBlocked ? 'STALE' : editor.current?.applyFix?.(fix) ?? 'STALE'
        if (result !== 'APPLIED') setHintNotice(result === 'STALE' ? 'Source hoặc ngữ cảnh đã thay đổi. Hãy yêu cầu lại.'
          : 'Không xác nhận được transaction. Apply đã khóa; giữ code hiện tại và kiểm tra Draft.')
        return result
      }} /></Suspense>}
    {hints.open && active && !locked && <SmartHintsPanel id={hintPanelId} hints={hints} notice={hintNotice}
      selectionFixReadiness={fixReadiness?.exerciseId === exercise.id && fixReadiness.language === language && fixReadiness.sourceRevision === sourceRevision ? fixReadiness : undefined}
      onClose={() => { hints.close(); setFix(undefined); setHintNotice(''); aiTrigger.current?.focus() }}
      onPreview={hints.capabilities?.applyEnabled === true ? () => { const proposal = hints.previewFix(); if (proposal) setFix(proposal) } : undefined}
      onExplain={() => { const snapshot = capture(); if (snapshot?.selection) explain(snapshot); else setHintNotice('Hãy chọn một hoặc nhiều dòng trong Code Editor rồi yêu cầu giải thích.') }}
      onAction={kind => {
        if (kind === 'SUGGEST_FIX') {
          if (hints.capabilities?.suggestFixMode !== 'SELECTION_V1' || !hints.capabilities.suggestFixLanguages.includes(language)) return
          const snapshot = editor.current?.captureFix?.()
          if (!snapshot || snapshot.exerciseId !== exercise.id || snapshot.language !== language || snapshot.source !== code
            || snapshot.sourceRevision !== sourceRevision || !snapshot.isCurrent()) { setHintNotice('Bôi đen đoạn code cần sửa trong Code Editor rồi yêu cầu Suggest Fix.'); return }
          setHintNotice(''); void hints.begin({ kind, selection: snapshot.selection }, snapshot); return
        }
        const snapshot = capture(); if (!snapshot) return
        const levels = hints.view.hints.flatMap(h => h.output.kind === 'HINT' ? [h.output.level] : [])
        void hints.begin(kind === 'HINT' ? { kind, level: Math.min(3, Math.max(0, ...levels) + 1) as 1 | 2 | 3 } : { kind }, snapshot)
      }} />}
  </div>
}
