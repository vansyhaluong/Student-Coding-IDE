import { ChevronDown, Play, Square } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { EditorModelManager } from '../editor/models/editor-model-manager'
import { Button } from '../../components/ui/Button'
import { RunController, runUnavailableReason } from './run-controller'
import { RunTargetDialog, resolutionMessage } from './RunTargetDialog'
import { runResult } from './OutputPanel'

export function EditorRunAction({ manager, controller, locked, onShowOutput }: {
  manager: EditorModelManager; controller: RunController; locked: boolean; onShowOutput(): void
}) {
  const [, revise] = useState(0)
  useEffect(() => manager.subscribe(() => revise((value) => value + 1)), [manager])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const target = manager.getActiveDocument()
  const [chooser, setChooser] = useState(false)
  const closeChooser = useCallback(() => { setChooser(false); void controller.cancelTargets() }, [controller])
  useEffect(() => { setChooser(false) }, [snapshot.projectId, snapshot.available])
  const projectView = controller.getProjectView()
  const pinned = controller.projectBusy()
  const csharp = pinned || (snapshot.mode ?? (!target || /\.(cs|csproj)$/i.test(target.relativePath) ? 'csharp' : 'javascript')) === 'csharp'
  useEffect(() => {
    if (csharp && snapshot.projectId && snapshot.available && !snapshot.resolution && !snapshot.resolving
      && !snapshot.targetError && !pinned && !locked) void controller.resolveTargets()
  }, [controller, csharp, snapshot.projectId, snapshot.available, snapshot.resolution, snapshot.resolving, snapshot.targetError, pinned, locked])
  if (!snapshot.projectId) return null
  const view = csharp ? projectView : target ? controller.getView(target.relativePath) : undefined
  const state = view?.session?.state
  const running = state === 'RUNNING'
  const stopping = state === 'STOPPING' || view?.pending === 'stop'
  const busy = !!view?.pending || state === 'STARTING' || stopping
  const source = manager.getSourceState(snapshot.projectId)
  const reason = locked ? 'Run unavailable while the project is changing or closing.'
    : csharp ? !snapshot.available ? 'Project unavailable. Reopen the project before running.'
      : source.conflict ? 'Resolve project source conflicts before running.' : source.dirty ? 'Save changed files before running.'
        : snapshot.resolving ? 'Finding Console projects…' : snapshot.targetError
          ?? (snapshot.resolution?.state === 'READY' ? null : resolutionMessage(snapshot.resolution))
      : runUnavailableReason(target, snapshot.projectId, snapshot.available)
  const label = csharp && pinned ? !view?.session ? 'Preparing…' : runResult(view) : stopping ? 'Stopping…' : state === 'STARTING' || view?.pending === 'start' ? 'Starting…' : 'Run'
  const retryStop = state === 'STOPPING' && !!view?.error && !view.pending
  return <div className="editor-run-actions" role="group" aria-label={csharp ? 'Run Console project' : 'Run current file'}>
    <Button variant="ghost" size="small" className="run-target-trigger" disabled={locked || pinned || !snapshot.available}
      aria-label="Choose Run target" title={csharp && snapshot.resolution?.state === 'READY' ? snapshot.resolution.target.relativePath : 'Choose Run target'}
      onClick={() => { setChooser(true); if (!snapshot.resolution && !snapshot.resolving) void controller.resolveTargets() }}>
      <span>{csharp ? snapshot.resolution?.state === 'READY' ? `C# ${snapshot.resolution.target.relativePath.split('/').at(-1)}`
        : snapshot.resolving ? 'Finding targets…' : snapshot.resolution?.state === 'NO_RUNNABLE_PROJECT' ? 'No Console target' : 'Choose C# target…' : 'JavaScript'}</span><ChevronDown />
    </Button>
    <Button variant="ghost" size="small" className="editor-run-button"
      disabled={!!reason || busy || (csharp && pinned)} title={reason ?? (running ? 'Run again after stopping the current run' : csharp ? 'Run Console project' : 'Run current file')}
      aria-label={reason ? `Run unavailable: ${reason}` : running ? 'Run again' : label}
      onClick={() => { onShowOutput(); if (csharp) void controller.startProject(source, locked); else if (target) void controller.start(target, locked) }}>
      <Play aria-hidden="true" />{label}
    </Button>
    {(running || stopping || state === 'STARTING' || csharp && view?.pending === 'start') && <Button variant="ghost" size="small"
      disabled={locked || !snapshot.available || (csharp ? view?.pending === 'stop' || stopping && !retryStop : busy && !retryStop)}
      title={retryStop ? 'Retry Stop' : csharp ? 'Stop Console project' : 'Stop current file'} aria-label={retryStop ? 'Retry Stop' : csharp ? 'Stop Console project' : 'Stop current file'}
      onClick={() => { onShowOutput(); if (csharp) void controller.stopProject(); else if (target) void controller.stop(target.relativePath) }}>
      <Square aria-hidden="true" />{retryStop ? 'Retry Stop' : 'Stop'}
    </Button>}
    {chooser && !locked && snapshot.available && !pinned && <RunTargetDialog controller={controller} snapshot={snapshot}
      onCancel={closeChooser} onMode={mode => controller.setMode(mode)} />}
  </div>
}
