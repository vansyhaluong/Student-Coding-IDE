import { ChevronDown, Play, Square } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { EditorModelManager } from '../editor/models/editor-model-manager'
import { Button } from '../../components/ui/Button'
import { RunController, runUnavailableReason } from './run-controller'
import { RunTargetDialog, type RunMode } from './RunTargetDialog'

export function EditorRunAction({ manager, controller, locked, onShowOutput }: {
  manager: EditorModelManager; controller: RunController; locked: boolean; onShowOutput(): void
}) {
  const [, revise] = useState(0)
  useEffect(() => manager.subscribe(() => revise((value) => value + 1)), [manager])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const target = manager.getActiveDocument()
  const activeTarget = target?.projectId === snapshot.projectId ? target : null
  const javaScriptReason = locked ? 'Run unavailable while the project is changing or closing.'
    : runUnavailableReason(activeTarget, snapshot.projectId, snapshot.available)
  const [modeOverride, setModeOverride] = useState<RunMode | null>(null)
  const mode = modeOverride ?? (activeTarget?.relativePath.toLowerCase().endsWith('.js') ? 'javascript-file' : 'csharp-project')
  const [dialogOpen, setDialogOpen] = useState(false)
  const source = snapshot.projectId ? manager.getSourceState(snapshot.projectId) : { dirty: false, conflict: false, revision: 0 }
  const resolution = snapshot.targetResolution
  const csharpTarget = resolution?.state === 'READY' ? resolution.target : undefined
  const csharpView = csharpTarget ? controller.getView(`csharp:${csharpTarget.relativePath}`) : undefined
  const pinnedView = [...snapshot.views.values()].find(item => item.kind === 'csharp-project' && item.projectSession
    && !['EXITED', 'FAILED', 'CANCELLED'].includes(item.projectSession.state))
  const projectView = pinnedView ?? csharpView
  const projectSession = projectView?.projectSession
  const projectActive = !!projectSession && !['EXITED', 'FAILED', 'CANCELLED'].includes(projectSession.state)
  const projectPinned = projectActive || !!projectView?.pending
  const retryProjectStop = projectSession?.state === 'STOPPING' && !!projectView?.error && !projectView.pending
  const jsView = activeTarget ? controller.getView(activeTarget.relativePath) : undefined
  const jsState = jsView?.session?.state
  const jsActive = !!jsState && !['EXITED', 'FAILED', 'CANCELLED'].includes(jsState)
  const jsStopping = jsState === 'STOPPING' || jsView?.pending === 'stop'
  const jsBusy = !!jsView?.pending || jsState === 'STARTING' || jsStopping
  const retryJsStop = jsState === 'STOPPING' && !!jsView?.error && !jsView.pending
  const jsRunLabel = jsStopping ? 'Stopping…' : jsState === 'STARTING' || jsView?.pending === 'start'
    ? 'Starting…' : jsState === 'RUNNING' ? 'Run again' : 'Run'
  const disabledReason = locked ? 'Run unavailable while the project is changing or closing.'
    : !snapshot.available ? 'Project unavailable. Reopen the project before running.'
      : snapshot.targetBusy ? 'Wait for the target request to finish.'
        : !csharpTarget ? resolution?.state === 'NO_RUNNABLE_PROJECT' ? 'No runnable Console project found.'
          : resolution?.state === 'DEPENDENCY_FAILED' ? '.NET SDK unavailable or invalid.'
            : 'Choose a Console project before running.' : undefined

  useEffect(() => {
    if (mode === 'csharp-project' && snapshot.projectId && snapshot.available && !snapshot.targetResolution && !snapshot.targetBusy) {
      void controller.resolveTargets()
    }
  }, [controller, mode, snapshot.projectId, snapshot.available])

  const targetButtonLabel = projectPinned && projectView?.relativePath
    ? `C# ${projectView.relativePath.split(/[\\/]/).at(-1)}`
    : resolution?.state === 'READY' ? `C# ${resolution.target.relativePath.split(/[\\/]/).at(-1)}`
      : resolution?.state === 'NO_RUNNABLE_PROJECT' ? 'C# no target' : 'C# choose target…'
  const openTargetDialog = (): void => {
    setDialogOpen(true)
    if (!snapshot.targetResolution && !snapshot.targetBusy) void controller.resolveTargets()
  }

  return <>
    <div className="editor-run-actions" role="group" aria-label="Run controls">
      <Button variant="ghost" size="small" className="editor-target-button"
        disabled={locked || !snapshot.projectId || !snapshot.available || projectPinned}
        title={projectView?.relativePath ?? (resolution?.state === 'READY' ? resolution.target.relativePath : 'Choose a C# Console project')}
        aria-label={projectPinned ? `C# target pinned: ${projectView?.relativePath}` : `Choose C# target${resolution?.state === 'READY' ? `: ${resolution.target.relativePath}` : ''}`}
        aria-haspopup="dialog" onClick={openTargetDialog}><span className="editor-target-copy">{targetButtonLabel}</span><ChevronDown aria-hidden="true" /></Button>
      {mode === 'javascript-file' ? <>
        <Button variant="ghost" size="small" className="editor-run-button"
          disabled={!!javaScriptReason || jsBusy} title={javaScriptReason ?? (jsState === 'RUNNING' ? 'Run again after stopping the current run' : 'Run current JavaScript file')}
          aria-label={javaScriptReason ? `Run unavailable: ${javaScriptReason}` : jsRunLabel}
          onClick={() => { if (activeTarget) { onShowOutput(); void controller.start(activeTarget, locked) } }}>
          <Play aria-hidden="true" />{jsRunLabel}
        </Button>
        {(jsActive || jsStopping) && <Button variant="ghost" size="small"
          disabled={locked || !snapshot.available || (!!jsView?.pending && !retryJsStop)}
          title={retryJsStop ? 'Retry Stop' : 'Stop current file'} aria-label={retryJsStop ? 'Retry Stop' : 'Stop current file'}
          onClick={() => { if (activeTarget) { onShowOutput(); void controller.stop(activeTarget.relativePath) } }}>
          <Square aria-hidden="true" />{retryJsStop ? 'Retry Stop' : 'Stop'}
        </Button>}
      </> : <>
        <Button variant="ghost" size="small" className="editor-run-button"
          disabled={!!disabledReason || projectActive || !!projectView?.pending}
          title={projectActive ? 'Stop the active C# Run before starting another.' : disabledReason ?? `Run ${csharpTarget?.relativePath ?? 'C# project'}`}
          aria-label={disabledReason ? `Run unavailable: ${disabledReason}` : projectActive ? 'C# Run active' : 'Run C# project'}
          onClick={() => { if (csharpTarget) { onShowOutput(); void controller.startProjectRun(csharpTarget, source.dirty, source.conflict, locked) } }}>
          <Play aria-hidden="true" />{projectSession?.phase === 'BUILD_RESTORE' ? 'Building…'
            : projectSession?.phase === 'EXECUTING' ? 'Running'
              : projectView?.pending === 'start' || projectSession?.state === 'STARTING' ? 'Preparing…' : 'Run'}
        </Button>
        {(projectActive || retryProjectStop) && <Button variant="ghost" size="small"
          disabled={locked || !snapshot.available || (!!projectView?.pending && !retryProjectStop)}
          title={retryProjectStop ? 'Retry Stop' : 'Stop C# project'} aria-label={retryProjectStop ? 'Retry Stop' : 'Stop C# project'}
          onClick={() => { onShowOutput(); void controller.stopProject() }}>
          <Square aria-hidden="true" />{retryProjectStop ? 'Retry Stop' : 'Stop'}
        </Button>}
      </>}
    </div>
    {dialogOpen && <RunTargetDialog resolution={resolution} busy={!!snapshot.targetBusy} error={snapshot.targetError} mode={mode}
      javascriptAvailable={!javaScriptReason} javascriptReason={javaScriptReason} onClose={() => {
        void controller.cancelTargetRequest().then(cancelled => { if (cancelled) setDialogOpen(false) })
      }} onRefresh={() => void controller.resolveTargets()} onClear={() => void controller.clearTarget()}
      onUseTarget={value => { void controller.selectTarget(value).then(selected => {
        if (selected) { setModeOverride('csharp-project'); setDialogOpen(false) }
      }) }}
      onUseJavaScript={() => { setModeOverride('javascript-file'); setDialogOpen(false) }}
      onUseCSharp={() => setModeOverride('csharp-project')} />}
  </>
}
