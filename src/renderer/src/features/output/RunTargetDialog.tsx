import { useState } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import type { RunController, RunViewSnapshot } from './run-controller'

export function RunTargetDialog({ controller, snapshot, onCancel, onMode }: {
  controller: RunController; snapshot: RunViewSnapshot; onCancel(): void; onMode(mode: 'javascript' | 'csharp'): void
}) {
  const [choice, setChoice] = useState('')
  const resolution = snapshot.resolution
  const candidates = resolution && 'candidates' in resolution ? resolution.candidates : []
  const busy = snapshot.resolving || snapshot.cancellationFailed
  return <Dialog title="Run target" description="Choose a C# Console project or run the current JavaScript file."
    initialFocus="dialog" onCancel={onCancel} actions={<>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button disabled={busy || !candidates.some(candidate => candidate.relativePath === choice && candidate.eligibility === 'ELIGIBLE')}
        data-dialog-primary="true" onClick={() => { onMode('csharp'); void controller.resolveTargets('select', choice) }}>Use target</Button>
    </>}>
    <div className="run-target-modes">
      <Button variant="ghost" onClick={() => { onMode('javascript'); onCancel() }}>Current file (JavaScript)</Button>
      <Button variant="ghost" onClick={() => { onMode('csharp'); void controller.resolveTargets() }}>C# Console project</Button>
    </div>
    <p role="status">{snapshot.resolving ? 'Finding Console projects…' : snapshot.targetError ?? resolutionMessage(resolution)}</p>
    {resolution?.selectionDiagnostic && <p role="alert">{resolution.selectionDiagnostic === 'STALE_TARGET'
      ? 'The previous target is no longer available or eligible. Choose a target again.'
      : 'Saved target selection was recovered. Confirm a target before running.'}</p>}
    <fieldset className="run-target-list" disabled={!!busy}>
      <legend>Console projects</legend>
      {candidates.map(candidate => <label key={candidate.relativePath} className="run-target-option">
        <input type="radio" name="run-target" checked={choice === candidate.relativePath}
          disabled={candidate.eligibility !== 'ELIGIBLE'} onChange={() => setChoice(candidate.relativePath)} />
        <span><strong>{candidate.displayName}</strong><span>{candidate.relativePath}</span>
          {candidate.reason && <span>{candidate.reason.toLowerCase().replaceAll('_', ' ')}</span>}</span>
      </label>)}
    </fieldset>
    <div className="run-target-modes">
      <Button variant="ghost" disabled={!!busy} onClick={() => { setChoice(''); void controller.resolveTargets() }}>Refresh targets</Button>
      <Button variant="ghost" disabled={!!busy} onClick={() => { setChoice(''); void controller.resolveTargets('clear') }}>Clear saved choice</Button>
      {(snapshot.resolving || snapshot.cancellationFailed) && <Button variant="ghost" onClick={() => void controller.cancelTargets()}>
        {snapshot.cancellationFailed ? 'Retry cancellation' : 'Cancel discovery'}</Button>}
    </div>
  </Dialog>
}

export function resolutionMessage(resolution: RunViewSnapshot['resolution']): string {
  if (!resolution) return 'Refresh to find Console projects.'
  switch (resolution.state) {
    case 'READY': return `Ready: ${resolution.target.relativePath}`
    case 'SELECTION_REQUIRED': return 'Choose a Console project.'
    case 'NO_RUNNABLE_PROJECT': return 'No runnable Console project found.'
    case 'DEPENDENCY_FAILED': return `.NET dependency: ${resolution.dependency.reason.toLowerCase().replaceAll('_', ' ')}. Fix the environment and refresh.`
    case 'FAILED': return `Target discovery failed: ${resolution.reason.toLowerCase().replaceAll('_', ' ')}.`
  }
}
