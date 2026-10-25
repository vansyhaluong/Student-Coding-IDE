import { lazy, Suspense, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import type { Exercise, ExerciseLanguage, ExerciseDraft, ExerciseSummary } from '../../../../../shared/contracts/practice'
import { MySolutions } from './MySolutions'
import { PracticeTestPanel, type TestPanelDock, type TestPanelSize } from './PracticeTestPanel'
import type { ExerciseRunView } from './use-exercise-runtime'
import type { PracticeSourceReplacement } from './use-practice'
const PracticeEditor = lazy(async () => ({ default: (await import('./PracticeEditor')).PracticeEditor }))

interface Props {
  exercises: ExerciseSummary[]; chapter: number; drafts: ExerciseDraft[]; exercise: Exercise | undefined
  language: ExerciseLanguage; code: string; ready: boolean; locked: boolean
  execution: ExerciseRunView; onRun(): void
  sourceReplacement?: PracticeSourceReplacement
  onOpen(exercise?: ExerciseSummary): void; onLanguage(language: ExerciseLanguage): void; onEdit(code: string): void; onReplace(code: string): void
}
export function PracticeWorkspace({ exercises, chapter, drafts, exercise, language, code, ready, locked, execution, onRun, onOpen, onLanguage, onEdit, onReplace, sourceReplacement }: Props) {
  const [reset, setReset] = useState(false)
  const [tab, setTab] = useState<'tests' | 'result'>('tests')
  const [selectedCase, setSelectedCase] = useState(0)
  const [panelSize, setPanelSize] = useState<TestPanelSize>('open')
  const [panelDock, setPanelDock] = useState<TestPanelDock>('editor')
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
  const testPanel = <PracticeTestPanel exercise={exercise} tab={tab} onTab={setTab} selectedCase={selectedCase} onCase={setSelectedCase}
    size={panelSize} onSize={setPanelSize} dock={panelDock} onDock={setPanelDock} execution={execution} />
  return <div className="practice-workspace">
    <header className="practice-heading"><button type="button" disabled={locked} onClick={() => { setReset(false); onOpen() }}>← Danh sách</button>
      <span>Chương {chapter} / {exercise.title}</span><span className="practice-difficulty" data-level={exercise.difficulty}>{exercise.difficulty}</span>
      <button type="button" className="practice-icon-button practice-run" disabled={locked || execution.busy} aria-label="Run" title="Run"
        onClick={() => { setTab('result'); if (panelSize === 'collapsed') setPanelSize('open'); onRun() }}><Play aria-hidden="true" fill="currentColor" /></button>
      <button type="button" disabled title="Submit — chưa khả dụng">Submit</button>
    </header>
    <div className="practice-split" data-panel-dock={panelDock} data-panel-size={panelSize}>
      <article className="practice-description" aria-label="Description" hidden={panelDock === 'bottom' && panelSize === 'expanded'}><p className="learning-eyebrow">Description</p><h1>{exercise.title}</h1>
        <p>{exercise.description}</p><h2>Input</h2>
        <ul>{exercise.parameters.map(p => <li key={p.name}><code>{p.name}: {p.type}</code></li>)}</ul>
        <h2>Output</h2><p>Trả về <code>{exercise.returnType}</code>.</p>
        <h2>Ví dụ Input / Output</h2>{exercise.samples.map((sample, i) => <pre key={i}>Input: {JSON.stringify(sample.args)}{'\n'}Output: {JSON.stringify(sample.expected)}</pre>)}
        <h2>Constraints</h2><ul>{exercise.constraints.map(c => <li key={c}>{c}</li>)}</ul>
        <details><summary>Nguồn tham khảo · {exercise.source.publisher}</summary><p className="practice-source">{exercise.source.url}</p><p>{exercise.source.usage}</p></details>
        <MySolutions key={`${exercise.id}/${language}`} solutions={[]} disabled={locked} onRestore={onReplace} />
      </article>
      <div className="practice-code-column" hidden={panelDock === 'bottom' && panelSize === 'expanded'}>
        <div className="practice-editor-heading" hidden={panelDock === 'editor' && panelSize === 'expanded'}><span>Code Editor</span>
          <label>Ngôn ngữ <select aria-label="Ngôn ngữ bài tập" value={language} disabled={locked} onChange={e => { setReset(false); onLanguage(e.target.value as ExerciseLanguage) }}>
            <option value="csharp">C#</option><option value="javascript">JavaScript</option>
          </select></label>
          <button type="button" className="practice-icon-button" disabled={locked} aria-label="Reset Code" title="Reset Code" onClick={() => setReset(true)}><RotateCcw aria-hidden="true" /></button>
        </div>
        {reset && <div className="practice-confirm" role="alertdialog" aria-modal="false" aria-label="Xác nhận Reset Code" hidden={panelDock === 'editor' && panelSize === 'expanded'}>
          <p>Thay Code Draft {language === 'csharp' ? 'C#' : 'JavaScript'} của bài này bằng hàm mẫu?</p>
          <button type="button" disabled={locked} onClick={() => { onReplace(exercise.languages[language].starter); setReset(false) }}>Xác nhận Reset</button>
          <button type="button" onClick={() => setReset(false)}>Hủy</button>
        </div>}
        <div className="practice-editor" aria-label="Code Editor" hidden={panelDock === 'editor' && panelSize === 'expanded'}><Suspense fallback={<p>Đang tải Code Editor…</p>}><PracticeEditor key={`${exercise.id}/${language}`} exercise={exercise} language={language} code={code} sourceReplacement={sourceReplacement} readOnly={locked} onChange={onEdit} /></Suspense></div>
        {panelDock === 'editor' && testPanel}
      </div>
      {panelDock === 'bottom' && testPanel}
    </div>
  </div>
}
