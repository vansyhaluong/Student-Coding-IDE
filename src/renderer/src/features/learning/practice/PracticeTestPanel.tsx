import { ChevronDown, ChevronUp, FlaskConical, Maximize2, Minimize2, PanelBottom, PanelRight, Terminal } from 'lucide-react'
import type { Exercise } from '../../../../../shared/contracts/practice'
import type { ExerciseRunView } from './use-exercise-runtime'

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
    <div className={`practice-test-body${execution.snapshot?.stdout || execution.snapshot?.stderr ? '' : ' practice-result-empty'}`}
      id={`test-result-panel-${exercise.id}`} role="region" aria-labelledby={`test-result-tab-${exercise.id}`} hidden={collapsed || tab !== 'result'}>
      <p role={execution.status === 'error' || execution.status === 'unsupported' ? 'alert' : 'status'}>{execution.message}</p>
      {execution.status === 'idle' && <span>Chọn Run để kiểm tra khả năng thực thi. Submit chưa khả dụng.</span>}
      {execution.snapshot?.stdout && <div className="practice-test-field"><span>stdout</span><pre>{execution.snapshot.stdout}</pre></div>}
      {execution.snapshot?.stderr && <div className="practice-test-field"><span>stderr</span><pre>{execution.snapshot.stderr}</pre></div>}
    </div>
  </section>
}
