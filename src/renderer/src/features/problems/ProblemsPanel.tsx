import {
  AlertCircle,
  Info,
  Lightbulb,
  ListChecks,
  SquareTerminal,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useRef, useSyncExternalStore } from 'react'

import type { ProjectIdentity } from '../../../../shared/contracts'
import { PanelResizer } from '../../components/PanelResizer'
import { Button } from '../../components/ui/Button'
import type { ProblemItem, ProblemsStore } from './problems-store'

const MINIMUM_PANEL_HEIGHT = 160
const MINIMUM_EDITOR_HEIGHT = 180

interface ProblemsPanelProps {
  store: ProblemsStore
  project: ProjectIdentity | null
  height: number
  onHeightChange(height: number): void
  onSelectTerminal(): void
  onClosePanel(): void
  onNavigate(problem: ProblemItem): void
  interactionLocked: boolean
}

export function ProblemsPanel({
  store,
  project,
  height,
  onHeightChange,
  onSelectTerminal,
  onClosePanel,
  onNavigate,
  interactionLocked,
}: ProblemsPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  )
  const maximumHeight = (): number => Math.max(
    MINIMUM_PANEL_HEIGHT,
    (panelRef.current?.parentElement?.clientHeight ?? window.innerHeight)
      - MINIMUM_EDITOR_HEIGHT,
  )

  return (
    <section ref={panelRef} className="terminal-panel problems-panel" aria-label="Problems panel" style={{ height }}>
      <PanelResizer
        height={height}
        minimum={MINIMUM_PANEL_HEIGHT}
        getMaximum={maximumHeight}
        onResize={onHeightChange}
        label="Resize Problems panel"
      />
      <header className="terminal-panel-header">
        <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel">
          <button type="button" role="tab" aria-selected="false" onClick={onSelectTerminal}>
            <SquareTerminal aria-hidden="true" /><span>Terminal</span>
          </button>
          <button type="button" role="tab" aria-selected="true">
            <ListChecks aria-hidden="true" /><span>Problems</span>
            {snapshot.totalCount > 0 && <small>{snapshot.totalCount}</small>}
          </button>
        </div>
        <div className="problems-summary" aria-label="Problem counts">
          <span><AlertCircle aria-hidden="true" />{snapshot.errorCount}</span>
          <span><TriangleAlert aria-hidden="true" />{snapshot.warningCount}</span>
        </div>
        <div className="terminal-panel-actions">
          <Button variant="ghost" size="iconSmall" onClick={onClosePanel} title="Hide Problems" aria-label="Hide Problems"><X /></Button>
        </div>
      </header>

      {!project ? (
        <div className="problems-empty"><ListChecks aria-hidden="true" /><p>Open a project to view problems.</p></div>
      ) : snapshot.totalCount === 0 ? (
        <div className="problems-empty"><ListChecks aria-hidden="true" /><p>No reported problems</p></div>
      ) : (
        <div className="problems-list" aria-label="Reported problems">
          {snapshot.groups.map((group) => (
            <section className="problem-file-group" key={group.relativePath}>
              <header title={group.relativePath}>
                <strong>{group.fileName}</strong>
                <span>{group.relativePath}</span>
                <small>{group.problems.length}</small>
              </header>
              <ul>
                {group.problems.map((problem) => (
                  <li key={problem.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(problem)}
                      disabled={interactionLocked || snapshot.projectId !== project.id}
                      title={`${problem.message} (${problem.source})`}
                    >
                      <SeverityIcon severity={problem.severity} />
                      <span className="problem-message">{problem.message}</span>
                      <span className="problem-source">{problem.source}</span>
                      <span className="problem-location">
                        Ln {problem.range.startLineNumber}, Col {problem.range.startColumn}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function SeverityIcon({ severity }: { severity: ProblemItem['severity'] }) {
  if (severity === 'error') return <AlertCircle className="problem-severity error" aria-label="Error" />
  if (severity === 'warning') return <TriangleAlert className="problem-severity warning" aria-label="Warning" />
  if (severity === 'info') return <Info className="problem-severity info" aria-label="Information" />
  return <Lightbulb className="problem-severity hint" aria-label="Hint" />
}
