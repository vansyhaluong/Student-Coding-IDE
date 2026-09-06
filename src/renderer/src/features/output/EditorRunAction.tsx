import { Play, Square } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { EditorModelManager } from '../editor/models/editor-model-manager'
import { Button } from '../../components/ui/Button'
import { RunController, runUnavailableReason } from './run-controller'

export function EditorRunAction({ manager, controller, locked, onShowOutput }: {
  manager: EditorModelManager; controller: RunController; locked: boolean; onShowOutput(): void
}) {
  const [, revise] = useState(0)
  useEffect(() => manager.subscribe(() => revise((value) => value + 1)), [manager])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const target = manager.getActiveDocument()
  if (!target || target.projectId !== snapshot.projectId) return null
  const view = controller.getView(target.relativePath)
  const state = view?.session?.state
  const running = state === 'RUNNING'
  const stopping = state === 'STOPPING' || view?.pending === 'stop'
  const busy = !!view?.pending || state === 'STARTING' || stopping
  const reason = locked ? 'Run unavailable while the project is changing or closing.'
    : runUnavailableReason(target, snapshot.projectId, snapshot.available)
  const label = stopping ? 'Stopping…' : state === 'STARTING' || view?.pending === 'start' ? 'Starting…' : 'Run'
  const retryStop = state === 'STOPPING' && !!view?.error && !view.pending
  return <div className="editor-run-actions" role="group" aria-label="Run current file">
    <Button variant="ghost" size="small" className="editor-run-button"
      disabled={!!reason || busy} title={reason ?? (running ? 'Run again after stopping the current run' : 'Run current file')}
      aria-label={reason ? `Run unavailable: ${reason}` : running ? 'Run again' : label}
      onClick={() => { onShowOutput(); void controller.start(target, locked) }}>
      <Play aria-hidden="true" />{label}
    </Button>
    {(running || stopping || state === 'STARTING') && <Button variant="ghost" size="small"
      disabled={locked || !snapshot.available || (busy && !retryStop)}
      title={retryStop ? 'Retry Stop' : 'Stop current file'} aria-label={retryStop ? 'Retry Stop' : 'Stop current file'}
      onClick={() => { onShowOutput(); void controller.stop(target.relativePath) }}>
      <Square aria-hidden="true" />{retryStop ? 'Retry Stop' : 'Stop'}
    </Button>}
  </div>
}
