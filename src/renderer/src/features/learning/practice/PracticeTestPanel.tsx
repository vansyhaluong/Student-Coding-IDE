import { ChevronDown, ChevronUp, FlaskConical, Maximize2, Minimize2, PanelBottom, PanelRight, Terminal } from 'lucide-react'
import type { Exercise } from '../../../../../shared/contracts/practice'
import { csharpFailureMessage, type ExerciseRunView } from './use-exercise-runtime'

export type TestPanelSize = 'open' | 'collapsed' | 'expanded'
export type TestPanelDock = 'editor' | 'bottom'
interface Props {
  exercise: Exercise
  tab: 'tests' | 'result'; onTab(tab: 'tests' | 'result'): void
  selectedCase: number; onCase(index: number): void
  size: TestPanelSize; onSize(size: TestPanelSize): void
  dock: TestPanelDock; onDock(dock: TestPanelDock): void
  execution: ExerciseRunView
}
export function PracticeTestPanel({ exercise, tab, onTab, selectedCase, onCase, size, onSize, dock, onDock, execution }: Props) {
  const collapsed = size === 'collapsed'
  const expanded = size === 'expanded'
  const selectTab = (value: 'tests' | 'result') => { onTab(value); if (collapsed) onSize('open') }
  const collapseLabel = collapsed ? 'Mở Testcase / Test Result' : 'Thu gọn Testcase / Test Result'
  const expandLabel = expanded ? 'Khôi phục kích thước panel' : 'Phóng to panel kiểm thử'
  const dockLabel = dock === 'editor' ? 'Dock xuống dưới workspace' : 'Dock dưới Code Editor'
  const payload = execution.snapshot?.csharp
  // Bind even a validated transport observation to the currently displayed catalogue.
  const result = payload && payload.schema.returnType === exercise.returnType
    && payload.schema.sampleCount === exercise.samples.length
    && JSON.stringify(payload.schema.parameterTypes) === JSON.stringify(exercise.parameters.map(p => p.type)) ? payload.result : undefined
  const index = Math.min(Math.max(selectedCase, 0), exercise.samples.length - 1)
  const sample = exercise.samples[index]
  const row = result?.cases.find(c => c.caseIndex === index)
  const notRun = result?.notRunCaseIndices.includes(index)
  const complete = execution.status === 'finished' && execution.snapshot?.reason === 'COMPLETED'
    && execution.snapshot.cleanup.cleanupComplete && !result?.failure
  const status = complete ? 'Đã chạy xong' : execution.message
  const caseState = (i: number) => {
    const item = result?.cases.find(c => c.caseIndex === i)
    return item ? item.outcome === 'RETURNED' ? 'Đã chạy' : 'Lỗi'
      : result?.notRunCaseIndices.includes(i) ? 'Chưa chạy' : ''
  }
  return <section className="practice-tests" aria-label="Test Cases và kết quả" data-size={size} data-dock={dock}>
    <div className="practice-test-toolbar">
      <div className="practice-tabs" role="group" aria-label="Chọn vùng kiểm thử">
        <button type="button" id={`testcase-tab-${exercise.id}`} aria-controls={`testcase-panel-${exercise.id}`} aria-pressed={tab === 'tests' && !collapsed} onClick={() => selectTab('tests')}><FlaskConical aria-hidden="true" />Testcase</button>
        <button type="button" id={`test-result-tab-${exercise.id}`} aria-controls={`test-result-panel-${exercise.id}`} aria-pressed={tab === 'result' && !collapsed} onClick={() => selectTab('result')}><Terminal aria-hidden="true" />Test Result</button>
      </div>
      <div className="practice-panel-actions" role="group" aria-label="Bố cục panel kiểm thử">
        <button type="button" className="practice-icon-button" aria-label={dockLabel} title={dockLabel} onClick={() => onDock(dock === 'editor' ? 'bottom' : 'editor')}>
          {dock === 'editor' ? <PanelBottom aria-hidden="true" /> : <PanelRight aria-hidden="true" />}
        </button>
        <button type="button" className="practice-icon-button" aria-label={expandLabel} title={expandLabel} aria-pressed={expanded} onClick={() => onSize(expanded ? 'open' : 'expanded')}>
          {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </button>
        <button type="button" className="practice-icon-button" aria-label={collapseLabel} title={collapseLabel} aria-expanded={!collapsed}
          aria-controls={`testcase-panel-${exercise.id} test-result-panel-${exercise.id}`} onClick={() => onSize(collapsed ? 'open' : 'collapsed')}>
          {collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
      </div>
    </div>
    <div className="practice-test-body" id={`testcase-panel-${exercise.id}`} role="region" aria-labelledby={`testcase-tab-${exercise.id}`} hidden={collapsed || tab !== 'tests'}>
      <div className="practice-case-tabs" role="group" aria-label="Test case mẫu">
        {exercise.samples.map((_, i) => <button type="button" key={i} aria-pressed={selectedCase === i} onClick={() => onCase(i)}>Case {i + 1}</button>)}
      </div>
      {exercise.parameters.map((parameter, i) => <div className="practice-test-field" key={parameter.name}>
        <span>{parameter.name} =</span><pre aria-label={`Input ${parameter.name}`}>{JSON.stringify(exercise.samples[selectedCase].args[i])}</pre>
      </div>)}
      <div className="practice-test-field"><span>Expected =</span><pre aria-label="Expected output">{JSON.stringify(exercise.samples[selectedCase].expected)}</pre></div>
    </div>
    <div className="practice-test-body practice-result-body"
      id={`test-result-panel-${exercise.id}`} role="region" aria-labelledby={`test-result-tab-${exercise.id}`} hidden={collapsed || tab !== 'result'}>
      <div className="practice-result-header">
        <p role={execution.status === 'error' || execution.status === 'unsupported' ? 'alert' : 'status'}>{status}</p>
        {execution.status === 'idle' && <span>Chọn Run để xem Output của các test mẫu.</span>}
      </div>
      {result?.compile?.diagnostics.length ? <div className="practice-result-diagnostics"><span>Compiler diagnostics</span><ul aria-label="Compiler diagnostics">
        {result.compile.diagnostics.map((d, i) => <li key={i}>{d.code} · {d.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}
          {d.source === 'solution' ? ` · Dòng ${d.line}, cột ${d.column}` : ' · Harness/compiler'}</li>)}
      </ul></div> : null}
      <div className="practice-result-cases" role="tablist" aria-label="Kết quả sample cases">
        {exercise.samples.map((_, i) => <button type="button" key={i} role="tab"
          id={`result-case-${exercise.id}-${i}`} aria-controls={`result-case-panel-${exercise.id}`}
          aria-label={`Case ${i + 1}${caseState(i) ? ` · ${caseState(i)}` : ''}`}
          aria-selected={index === i} tabIndex={index === i ? 0 : -1} onClick={() => onCase(i)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (i + 1) % exercise.samples.length
              : event.key === 'ArrowLeft' ? (i + exercise.samples.length - 1) % exercise.samples.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? exercise.samples.length - 1 : undefined
            if (next === undefined) return
            event.preventDefault(); onCase(next)
            const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
            target?.focus(); target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
          }}>
          <span>Case {i + 1}</span>{caseState(i) && <small>{caseState(i)}</small>}
        </button>)}
      </div>
      <section className="practice-result-detail" role="tabpanel" id={`result-case-panel-${exercise.id}`}
        aria-labelledby={`result-case-${exercise.id}-${index}`}>
        <div className="practice-result-field"><span>Input</span>
          <div aria-label={`Input Case ${index + 1}`} className="practice-result-inputs">
            {exercise.parameters.map((parameter, i) => <div className="practice-result-input" key={parameter.name}>
              <span>{parameter.name} =</span><pre>{JSON.stringify(sample.args[i])}</pre>
            </div>)}
          </div>
        </div>
        <div className="practice-result-field"><span>Output</span>
          {row?.outcome === 'RETURNED' ? <pre aria-label={`Actual Case ${index + 1}`}>{JSON.stringify(row.actual)}</pre>
            : <p className="practice-result-unavailable" aria-label={`Output Case ${index + 1}`}>
              {notRun ? 'Chưa chạy (NOT_RUN)' : row?.failure ? csharpFailureMessage[row.failure.kind]
                : execution.busy ? 'Đang chờ kết quả.' : 'Chưa có kết quả.'}
            </p>}
        </div>
        <div className="practice-result-field"><span>Expected</span><pre aria-label={`Expected Case ${index + 1}`}>{JSON.stringify(sample.expected)}</pre></div>
        {(row?.stdout || row?.stderr) && <details className="practice-result-console"><summary>Console output</summary>
          {row.stdout && <div className="practice-result-field"><span>stdout</span><pre>{row.stdout}</pre></div>}
          {row.stderr && <div className="practice-result-field"><span>stderr</span><pre>{row.stderr}</pre></div>}
        </details>}
      </section>
      {(execution.snapshot?.stdout || execution.snapshot?.stderr) && <details className="practice-result-console"><summary>Operation output</summary>
        {execution.snapshot.stdout && <div className="practice-result-field"><span>stdout</span><pre>{execution.snapshot.stdout}</pre></div>}
        {execution.snapshot.stderr && <div className="practice-result-field"><span>stderr</span><pre>{execution.snapshot.stderr}</pre></div>}
      </details>}
    </div>
  </section>
}
