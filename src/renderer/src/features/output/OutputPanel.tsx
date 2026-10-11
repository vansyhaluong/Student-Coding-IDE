import { ListChecks, SquareTerminal, Text, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
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
  const [buildLogOpen, setBuildLogOpen] = useState(false)
  const projectSessionId = view?.projectSession?.sessionId
  const buildFailed = view?.kind === 'csharp-project' && view.failureReason === 'BUILD_OR_RESTORE_FAILED'
  useEffect(() => { setBuildLogOpen(buildFailed) }, [projectSessionId, buildFailed])
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
        : !view ? <div className="problems-empty"><Text aria-hidden="true" /><p>Run JavaScript or a C# Console project to view output.</p></div>
          : <>
            <div className="output-context"><span title={view.relativePath}>{view.relativePath}</span><span role="status">{runResult(view)}</span></div>
            {view.error && view.kind !== 'csharp-project' && <p className="project-error" role="alert">{view.error}</p>}
            {view.error && view.kind === 'csharp-project' && !buildFailed && <p className="project-error" role="alert">{view.error}</p>}
            <div className="output-log" ref={log} tabIndex={0} aria-label={`Run output for ${view.relativePath}`}
              onScroll={() => { const element = log.current!; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24 }}>
              {view.kind === 'csharp-project'
                ? <CSharpOutput view={view} buildLogOpen={buildLogOpen} onToggleBuildLog={() => setBuildLogOpen(open => !open)} />
                : view.chunks.map((chunk, index) => chunk.stream === 'phase'
                  ? <span key={index} className="output-phase-separator">{chunk.data}</span>
                  : <span key={index} className={`output-chunk output-${chunk.stream}`}>
                      <span className="output-stream">[{chunk.stream}] </span>{chunk.data}
                    </span>)}
            </div>
          </>}
  </section>
}

function CSharpOutput({ view, buildLogOpen, onToggleBuildLog }: {
  view: RunView; buildLogOpen: boolean; onToggleBuildLog(): void
}) {
  const buildChunks = view.chunks.filter(chunk => chunk.phase === 'BUILD_RESTORE' && chunk.stream !== 'phase')
  const executionChunks = view.chunks.filter(chunk => chunk.phase === 'EXECUTING' && chunk.stream !== 'phase')
  const preparationChunks = view.chunks.filter(chunk => chunk.phase === 'PREPARING' && chunk.stream !== 'phase')
  const buildText = buildChunks.map(chunk => chunk.data).join('')
  const executionStarted = view.phase === 'EXECUTING' || view.projectSession?.phase === 'EXECUTING'
  const buildSummary = summarizeBuild(buildText)
  const isBuildFailed = view.failureReason === 'BUILD_OR_RESTORE_FAILED'
  const diagnostics = isBuildFailed ? compilerDiagnostics(buildText) : []
  const executionRunning = executionStarted && view.projectSession?.state === 'RUNNING'
  const buildLabel = isBuildFailed ? 'Build failed'
    : !executionStarted && view.projectSession?.state === 'CANCELLED' ? 'Build cancelled'
      : executionStarted ? 'Build succeeded' : 'Building…'

  return <div className="csharp-output-content">
    {preparationChunks.length > 0 && <section className="output-preparation" aria-label="Preparation">
      <div className="output-execution-heading"><strong>Preparation</strong></div>
      <div className="output-execution-log"><OutputEvents chunks={preparationChunks} /></div>
    </section>}
    {(buildChunks.length > 0 || isBuildFailed || executionStarted || view.phase === 'BUILD_RESTORE') && <section className={`output-build${isBuildFailed ? ' failed' : ''}`} aria-label="Build">
      <div className="output-build-summary">
        <strong>{buildLabel}</strong>
        {!isBuildFailed && executionStarted && buildSummary.elapsed && <span>{buildSummary.elapsed}</span>}
        {!isBuildFailed && executionStarted && !buildSummary.elapsed && buildSummary.restore && <span>{buildSummary.restore}</span>}
      </div>
      {isBuildFailed
        ? <div className="output-build-failure" role="alert">
            <strong>{view.failure ?? view.error ?? 'Build or restore failed.'}</strong>
            {diagnostics.length > 0 && <ul>{diagnostics.map((line, index) => <li key={index}>{line}</li>)}</ul>}
          </div>
        : executionStarted && (buildSummary.restore || buildSummary.counts) && <p className="output-build-metrics">
            {[buildSummary.restore, buildSummary.counts].filter(Boolean).join(' · ')}
          </p>}
      {buildChunks.length > 0 && <>
        <button type="button" className="output-log-toggle" aria-expanded={buildLogOpen} onClick={onToggleBuildLog}>
          {buildLogOpen ? 'Hide build log' : 'View build log'}
        </button>
        {buildLogOpen && <div className="output-build-log" aria-label="Build log"><OutputEvents chunks={buildChunks} /></div>}
      </>}
    </section>}
    {executionStarted && <section className="output-execution" aria-label="Execution">
      <div className="output-execution-heading">
        <strong>Execution</strong>
        {view.projectSession?.state === 'EXITED' && <span>{view.exitCode == null ? 'Finished' : `Exit code ${view.exitCode}`}</span>}
        {view.projectSession?.state === 'CANCELLED' && <span>Stopped</span>}
        {executionRunning && <span>Running</span>}
        {executionStarted && view.projectSession?.state === 'STOPPING' && <span>Stopping…</span>}
        {executionStarted && view.projectSession?.state === 'FAILED' && <span>Failed</span>}
      </div>
      {executionChunks.length > 0
        ? <div className="output-execution-log"><OutputEvents chunks={executionChunks} /></div>
        : executionRunning ? <p className="output-execution-empty">Waiting for program output…</p>
          : view.projectSession?.state === 'CANCELLED' ? <p className="output-execution-empty">Program stopped.</p>
            : view.projectSession?.state === 'EXITED' ? <p className="output-execution-empty">Program produced no output.</p> : null}
    </section>}
  </div>
}

function OutputEvents({ chunks }: { chunks: readonly RunView['chunks'][number][] }) {
  return <>{chunks.map((chunk, index) => <div key={index} className={`output-event output-${chunk.stream}`}>
    <span className="output-event-stream">{chunk.stream}</span><pre>{chunk.data}</pre>
  </div>)}</>
}

function summarizeBuild(text: string): { elapsed?: string; restore?: string; counts?: string } {
  const elapsedText = text.match(/Time Elapsed\s+([^\r\n]+)/i)?.[1]?.trim()
  const elapsed = elapsedText ? formatElapsed(elapsedText) : undefined
  const restore = /All projects are up-to-date for restore\./i.test(text) ? 'Restore up-to-date'
    : /\bRestored\s+.+\s+in\s+/i.test(text) ? 'Restore completed' : undefined
  const warnings = text.match(/\b(\d+)\s+Warning\(s\)/i)?.[1]
  const errors = text.match(/\b(\d+)\s+Error\(s\)/i)?.[1]
  const counts = warnings !== undefined || errors !== undefined
    ? `${warnings === undefined ? '' : `${warnings} warning${warnings === '1' ? '' : 's'}`}${warnings !== undefined && errors !== undefined ? ' · ' : ''}${errors === undefined ? '' : `${errors} error${errors === '1' ? '' : 's'}`}`
    : undefined
  return { elapsed, restore, counts }
}

function formatElapsed(value: string): string {
  const match = value.match(/^(?:(\d+):)?(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (!match) return value
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
  return `${seconds.toFixed(2)}s`
}

function compilerDiagnostics(text: string): string[] {
  return text.split(/\r?\n/).filter(line => /:\s*error\s+[A-Z]+\d+\s*:/i.test(line))
}

export function runResult(view: RunView): string {
  if (view.kind === 'csharp-project' && !view.projectSession) {
    if (view.error) return 'Run failed'
    return view.pending === 'start' ? 'Preparing…' : 'Ready'
  }
  if (view.projectSession) {
    const state = view.projectSession.state
    if (state === 'STOPPING') return view.error && !view.pending ? 'Stop failed — retry Stop' : 'Stopping…'
    if (state === 'CANCELLED') return 'Stopped'
    if (state === 'EXITED') return view.failure ?? (view.exitCode === 0 ? 'Completed (exit 0)' : `Execution failed (exit ${view.exitCode ?? 'unknown'}).`)
    if (state === 'FAILED') return view.failure ?? view.error ?? 'Run failed'
    if (state === 'STARTING' && view.phase === 'PREPARING') return 'Preparing…'
    if (view.phase === 'BUILD_RESTORE') return 'Building…'
    if (view.phase === 'EXECUTING') return 'Running'
    return 'Preparing…'
  }
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
