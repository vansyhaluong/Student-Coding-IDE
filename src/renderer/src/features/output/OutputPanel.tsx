import { ListChecks, SquareTerminal, Text, X } from 'lucide-react'
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { PanelResizer } from '../../components/PanelResizer'
import { Button } from '../../components/ui/Button'
import type { RunController, RunView } from './run-controller'

export function OutputPanel({ controller, height, onHeightChange, onSelectTerminal, onSelectProblems, onClosePanel }: {
  controller: RunController; height: number; onHeightChange(height: number): void
  onSelectTerminal(): void; onSelectProblems(): void; onClosePanel(): void
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const panel = useRef<HTMLElement>(null), log = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const view = snapshot.selected ? snapshot.views.get(snapshot.selected) : undefined
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [view])
  return <section ref={panel} className="terminal-panel terminal-panel-compact output-panel" aria-label="Output panel" style={{ height }}>
    <PanelResizer height={height} minimum={160}
      getMaximum={() => Math.max(160, (panel.current?.parentElement?.clientHeight ?? window.innerHeight) - 180)}
      onResize={onHeightChange} label="Resize Output panel" />
    <header className="terminal-panel-header">
      <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel">
        <button type="button" role="tab" aria-selected="false" onClick={onSelectTerminal}><SquareTerminal aria-hidden="true" /><span>Terminal</span></button>
        <button type="button" role="tab" aria-selected="false" onClick={onSelectProblems}><ListChecks aria-hidden="true" /><span>Problems</span></button>
        <button type="button" role="tab" aria-selected="true"><Text aria-hidden="true" /><span>Output</span></button>
      </div>
      <div className="terminal-panel-actions">
        <Button variant="ghost" size="iconSmall" onClick={onClosePanel} title="Hide Output" aria-label="Hide Output"><X /></Button>
      </div>
    </header>
    {!snapshot.projectId ? <div className="problems-empty"><p>Open a project to view Run output.</p></div>
      : !snapshot.available ? <div className="problems-empty"><p>Run unavailable while the project is unavailable or closing.</p></div>
        : !view ? <div className="problems-empty"><Text aria-hidden="true" /><p>Run a saved JavaScript file to view its output.</p></div>
          : <>
            <div className="output-context"><span title={view.relativePath}>{view.relativePath}</span><span role="status">{runResult(view)}</span></div>
            {view.error && <p className="project-error" role="alert">{view.error}</p>}
            <div className="output-log" ref={log} tabIndex={0} aria-label={`Run output for ${view.relativePath}`}
              onScroll={() => { const element = log.current!; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24 }}>
              {view.chunks.map((chunk, index) => <span key={index} className={`output-chunk output-${chunk.stream}`}>
                <span className="output-stream">[{chunk.stream}] </span>{chunk.data}
              </span>)}
            </div>
          </>}
  </section>
}

export function runResult(view: RunView): string {
  const state = view.session?.state
  if (state === 'STOPPING') return 'Stopping…'
  if (state === 'STARTING') return 'Starting…'
  if (state === 'RUNNING') return 'Running'
  if (state === 'CANCELLED') return 'Stopped'
  if (state === 'EXITED') return 'Exited successfully (0)'
  if (state === 'FAILED') return view.exitCode != null ? `Exited with code ${view.exitCode}` : 'Run failed'
  if (view.error) return 'Run failed'
  return view.pending ? 'Requesting Run…' : 'Ready'
}
