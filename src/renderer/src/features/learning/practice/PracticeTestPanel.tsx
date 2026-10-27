import { Check, ChevronDown, ChevronUp, FlaskConical, LoaderCircle, Maximize2, Minimize2, Minus, PanelBottom, PanelRight, Terminal, X } from 'lucide-react'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import { csharpFailureMessage, javascriptFailureMessage, type ExerciseRunView } from './use-exercise-runtime'
import { runErrorFor } from './RunErrorAlert'

export type TestPanelSize = 'open' | 'collapsed' | 'expanded'
export type TestPanelDock = 'editor' | 'bottom'
interface Props {
  exercise: Exercise
  language: ExerciseLanguage
  tab: 'tests' | 'result'; onTab(tab: 'tests' | 'result'): void
  selectedCase: number; onCase(index: number): void
  size: TestPanelSize; onSize(size: TestPanelSize): void
  dock: TestPanelDock; onDock(dock: TestPanelDock): void
  execution: ExerciseRunView
}
export function PracticeTestPanel({ exercise, language, tab, onTab, selectedCase, onCase, size, onSize, dock, onDock, execution }: Props) {
  const collapsed = size === 'collapsed'
  const expanded = size === 'expanded'
  const selectTab = (value: 'tests' | 'result') => { onTab(value); if (collapsed) onSize('open') }
  const collapseLabel = collapsed ? 'Mở Testcase / Test Result' : 'Thu gọn Testcase / Test Result'
  const expandLabel = expanded ? 'Khôi phục kích thước panel' : 'Phóng to panel kiểm thử'
  const dockLabel = dock === 'editor' ? 'Dock xuống dưới workspace' : 'Dock dưới Code Editor'
  const snapshot = execution.snapshot?.exerciseId === exercise.id && execution.snapshot.language === language ? execution.snapshot : undefined
  const payload = language === 'javascript' ? snapshot?.javascript : snapshot?.csharp
  // Bind even a validated transport observation to the currently displayed catalogue.
  const result = payload && payload.schema.returnType === exercise.returnType
    && payload.schema.sampleCount === exercise.samples.length
    && JSON.stringify(payload.schema.parameterTypes) === JSON.stringify(exercise.parameters.map(p => p.type)) ? payload.result : undefined
  const index = Math.min(Math.max(selectedCase, 0), exercise.samples.length - 1)
  const sample = exercise.samples[index]
  const row = result?.cases.find(c => c.caseIndex === index)
  const notRun = result?.notRunCaseIndices.includes(index)
  const compile = result && 'compile' in result ? result.compile : undefined
  const syntax = result && 'syntax' in result ? result.syntax : undefined
  const preCaseError = runErrorFor(execution, exercise, language)
  const stale = !!execution.snapshot && (!snapshot || !!payload && !result)
  const empty = execution.status === 'idle' || stale
  const loading = !empty && (execution.status === 'running' || execution.status === 'cleanup-pending')
  const complete = execution.status === 'finished' && execution.snapshot?.reason === 'COMPLETED'
    && execution.snapshot.cleanup.cleanupComplete && !result?.failure
  // Compare only validated sample actuals with the displayed public catalogue.
  // This presentation has no Official Judge or submission/completion authority.
  const caseState = (i: number) => {
    const item = result?.cases.find(c => c.caseIndex === i)
    return !item || result?.notRunCaseIndices.includes(i) ? 'NOT_RUN'
      : item.outcome === 'RETURNED' && JSON.stringify(item.actual) === JSON.stringify(exercise.samples[i].expected) ? 'PASS' : 'FAIL'
  }
  const states = exercise.samples.map((_, i) => caseState(i))
  const passed = states.filter(s => s === 'PASS').length
  const error = execution.status === 'error' || execution.status === 'unsupported' || !!result?.failure
  const failure = result?.failure?.kind
  const status = error ? failure === 'COMPILE_ERROR' ? 'Compilation Error' : failure === 'SYNTAX_ERROR' ? 'Syntax Error'
    : failure === 'RUNTIME_ERROR' ? 'Runtime Error' : execution.message
    : complete && result ? states.includes('FAIL') ? 'Wrong Answer'
      : passed === exercise.samples.length ? 'Passed' : 'Chưa chạy hết testcase' : execution.message
  const tone = error || complete && states.includes('FAIL') ? 'fail'
    : complete && !!result && passed === exercise.samples.length ? 'pass' : 'neutral'
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
        {exercise.samples.map((_, i) => <button type="button" key={i} aria-pressed={index === i} onClick={() => onCase(i)}>Case {i + 1}</button>)}
      </div>
      {exercise.parameters.map((parameter, i) => <div className="practice-test-field" key={parameter.name}>
        <span>{parameter.name} =</span><pre aria-label={`Input ${parameter.name}`}>{JSON.stringify(sample.args[i])}</pre>
      </div>)}
      <div className="practice-test-field"><span>Expected =</span><pre aria-label="Expected output">{JSON.stringify(sample.expected)}</pre></div>
    </div>
    <div className="practice-test-body practice-result-body"
      id={`test-result-panel-${exercise.id}`} role="region" aria-labelledby={`test-result-tab-${exercise.id}`} hidden={collapsed || tab !== 'result'}
      data-view={empty ? 'empty' : loading ? 'loading' : 'result'} aria-busy={loading}>
      {empty ? <div className="practice-result-empty"><p role="status">Nhấn Run để xem kết quả kiểm thử</p></div>
        : loading ? <div className="practice-result-empty" role="status" aria-label="Đang kiểm thử">
          <LoaderCircle className="practice-result-spinner" aria-hidden="true" />
        </div> : <>
      <div className="practice-result-header">
        <p role={error && !preCaseError ? 'alert' : 'status'} data-tone={tone}>{status}</p>
        {error && !preCaseError && status !== execution.message && <span>{execution.message}</span>}
      </div>
      {!preCaseError && syntax?.diagnostics.length ? <div className="practice-result-diagnostics"><span>Syntax diagnostics</span><ul aria-label="Syntax diagnostics">
        {syntax.diagnostics.map((d, i) => <li key={i}>Syntax error{d.source === 'solution' && d.line !== null ? ` · Dòng ${d.line}, cột ${d.column}` : ''}</li>)}
      </ul></div> : null}
      {!preCaseError && compile?.diagnostics.length ? <div className="practice-result-diagnostics"><span>Compiler diagnostics</span><ul aria-label="Compiler diagnostics">
        {compile.diagnostics.map((d, i) => <li key={i}>{d.code} · {d.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}
          {d.source === 'solution' ? ` · Dòng ${d.line}, cột ${d.column}` : ' · Harness/compiler'}</li>)}
      </ul></div> : null}
      {result && !preCaseError && <><div className="practice-result-cases" role="tablist" aria-label="Kết quả sample cases">
        {exercise.samples.map((_, i) => <button type="button" key={i} role="tab"
          id={`result-case-${exercise.id}-${i}`} aria-controls={`result-case-panel-${exercise.id}`}
          aria-label={`Case ${i + 1} · ${states[i]}`} data-state={states[i]}
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
          {states[i] === 'PASS' ? <Check aria-hidden="true" /> : states[i] === 'FAIL' ? <X aria-hidden="true" /> : <Minus aria-hidden="true" />}
          <span>Case {i + 1}</span>{states[i] === 'NOT_RUN' && <small>Chưa chạy</small>}
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
              {notRun ? 'Chưa chạy (NOT_RUN)' : row?.failure ? snapshot?.javascript
                ? javascriptFailureMessage[row.failure.kind as keyof typeof javascriptFailureMessage]
                : csharpFailureMessage[row.failure.kind as keyof typeof csharpFailureMessage]
                : execution.busy ? 'Đang chờ kết quả.' : 'Chưa có kết quả.'}
            </p>}
        </div>
        <div className="practice-result-field"><span>Expected</span><pre aria-label={`Expected Case ${index + 1}`}>{JSON.stringify(sample.expected)}</pre></div>
        {(row?.stdout || row?.stderr) && <details className="practice-result-console"><summary>Console output</summary>
          {row.stdout && <div className="practice-result-field"><span>stdout</span><pre>{row.stdout}</pre></div>}
          {row.stderr && <div className="practice-result-field"><span>stderr</span><pre>{row.stderr}</pre></div>}
        </details>}
      </section></>}
      {(snapshot?.stdout || snapshot?.stderr) && <details className="practice-result-console"><summary>Operation output</summary>
        {snapshot.stdout && <div className="practice-result-field"><span>stdout</span><pre>{snapshot.stdout}</pre></div>}
        {snapshot.stderr && <div className="practice-result-field"><span>stderr</span><pre>{snapshot.stderr}</pre></div>}
      </details>}
      </>}
    </div>
  </section>
}
