import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { CSharpProjectRunTarget, CSharpRunCandidate, CSharpRunTargetResolution } from '../../../../shared/contracts'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'

export type RunMode = 'javascript-file' | 'csharp-project'

export function RunTargetDialog({
  resolution, busy, error, mode, javascriptAvailable, javascriptReason, onClose, onRefresh, onClear, onUseTarget, onUseJavaScript, onUseCSharp,
}: {
  resolution?: CSharpRunTargetResolution
  busy: boolean
  error?: string
  mode: RunMode
  javascriptAvailable: boolean
  javascriptReason?: string | null
  onClose(): void
  onRefresh(): void
  onClear(): void
  onUseTarget(target: CSharpProjectRunTarget): void
  onUseJavaScript(): void
  onUseCSharp(): void
}) {
  const [draft, setDraft] = useState<string | null>(resolution?.state === 'READY' ? resolution.target.relativePath : null)
  useEffect(() => {
    setDraft(resolution?.state === 'READY' ? resolution.target.relativePath : null)
  }, [resolution])
  const candidates = resolution && resolution.state !== 'FAILED' ? resolution.candidates : []
  const firstEligiblePath = candidates.find(candidate => candidate.eligibility === 'ELIGIBLE')?.relativePath
  const selected = draft ? candidates.find(candidate => candidate.relativePath === draft && candidate.eligibility === 'ELIGIBLE') : undefined
  const canUse = mode === 'csharp-project' && !!selected && resolution?.state !== 'FAILED' && resolution?.state !== 'DEPENDENCY_FAILED'
  const diagnostic = resolution?.selectionDiagnostic === 'STALE_TARGET'
    ? 'The previous target is no longer available or eligible. Choose a target again.'
    : resolution?.selectionDiagnostic === 'PERSISTENCE_RECOVERED'
      ? 'The saved target selection was recovered. Confirm a target before running.' : undefined

  return <Dialog title="Run target" label="Run target"
    description="Choose what to run in this project."
    initialFocus="dialog" onCancel={onClose}
    actions={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" data-dialog-primary="true" disabled={busy || !canUse}
        onClick={() => { if (selected) onUseTarget({ kind: 'csharp-project', projectId: resolution!.projectId, relativePath: selected.relativePath }) }}>
        Use target
      </Button>
    </>}>
    <div className="run-target-mode" role="group" aria-label="Run mode">
      <p className="run-target-section-label">RUN MODE</p>
      <button type="button" className={`run-target-mode-option${mode === 'javascript-file' ? ' selected' : ''}`} aria-pressed={mode === 'javascript-file'} disabled={!javascriptAvailable}
        title={javascriptAvailable ? 'Run the active saved JavaScript file.' : javascriptReason ?? 'Open a saved .js file to use this option.'}
        onClick={onUseJavaScript}>
        <span className="run-target-radio" aria-hidden="true" />
        <span><strong>Current file (JavaScript)</strong><small>{javascriptAvailable ? 'Run the active .js file.' : javascriptReason ?? 'Open a saved .js file to use this option.'}</small></span>
      </button>
      <button type="button" className={`run-target-current-mode${mode === 'csharp-project' ? ' selected' : ''}`} aria-pressed={mode === 'csharp-project'} onClick={onUseCSharp}>
        <span className={`run-target-radio${mode === 'csharp-project' ? ' selected' : ''}`} aria-hidden="true" />
        <span><strong>C# Console project</strong><small>Run the selected .csproj, independent of the editor tab.</small></span>
      </button>
    </div>

    <div className="run-target-candidates">
      <p className="run-target-section-label">C# CONSOLE PROJECTS</p>
      {diagnostic && <div className="run-target-notice" role="status"><strong>Confirm your target</strong><span>{diagnostic}</span></div>}
      {busy && <p className="run-target-state" role="status">Finding Console projects…</p>}
      {error && <div className="run-target-error" role="alert">{error}</div>}
      {!busy && !error && resolution?.state === 'DEPENDENCY_FAILED' && <div className="run-target-error" role="alert">{resolution.dependency.reason === 'DOTNET_HOST_MISSING' || resolution.dependency.reason === 'DOTNET_SDK_MISSING'
        ? 'The .NET SDK was not found. Install the .NET SDK, then refresh targets.'
        : 'The .NET SDK could not be selected or checked. Review the SDK configuration, then refresh targets.'}</div>}
      {!busy && !error && resolution?.state === 'FAILED' && <div className="run-target-error" role="alert">{resolution.reason === 'PERSISTENCE_FAILED'
        ? 'The saved target could not be read. Try again.' : 'Console projects could not be checked. Try again.'}</div>}
      {!busy && !error && resolution?.state === 'NO_RUNNABLE_PROJECT' && <div className="run-target-state">
        <strong>No runnable Console project found.</strong><span>Refresh after adding or fixing a supported .NET Console project.</span>
      </div>}
      {!busy && !error && resolution?.state === 'SELECTION_REQUIRED' && <p className="run-target-state">Choose a Console project before running.</p>}
      {!busy && !error && resolution?.state === 'READY' && candidates.length === 0 && <p className="run-target-state">No other Console projects were found.</p>}
      {!busy && !error && candidates.length > 0 && <div className="run-target-list" role="radiogroup" aria-label="Console project target"
        onKeyDown={event => {
          if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
          const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')]
          if (!radios.length) return
          const index = radios.indexOf(event.target as HTMLButtonElement)
          const next = event.key === 'Home' ? radios[0] : event.key === 'End' ? radios.at(-1)
            : radios[(index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + radios.length) % radios.length]
          if (next) { event.preventDefault(); next.focus(); next.click() }
        }}>
        {candidates.map(candidate => <Candidate key={candidate.relativePath} candidate={candidate}
          checked={draft === candidate.relativePath} tabIndex={draft === candidate.relativePath || draft === null && candidate.relativePath === firstEligiblePath ? 0 : -1}
          onChoose={() => setDraft(candidate.relativePath)} />)}
      </div>}
    </div>

    <div className="run-target-tools">
      <Button variant="ghost" size="small" disabled={busy} onClick={onRefresh}><RefreshCw aria-hidden="true" />Refresh</Button>
      <Button variant="ghost" size="small" disabled={busy || !resolution} onClick={onClear}>Clear saved choice</Button>
    </div>
  </Dialog>
}

function Candidate({ candidate, checked, tabIndex, onChoose }: { candidate: CSharpRunCandidate; checked: boolean; tabIndex: number; onChoose(): void }) {
  const reason = candidate.reason ? candidateReason(candidate.reason) : 'Console project'
  const disabled = candidate.eligibility !== 'ELIGIBLE'
  return <button type="button" role="radio" aria-checked={checked} disabled={disabled}
    tabIndex={disabled ? -1 : tabIndex}
    className={`run-target-candidate${checked ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
    title={`${candidate.displayName} — ${candidate.relativePath}${disabled ? ` (${reason})` : ''}`}
    onClick={onChoose}>
    <span className={`run-target-radio${checked ? ' selected' : ''}`} aria-hidden="true" />
    <span className="run-target-candidate-copy"><strong>{candidate.displayName}</strong><small>{candidate.relativePath}</small>
      {disabled && <small className="run-target-candidate-reason">{reason}</small>}</span>
    <span className="run-target-kind">{disabled ? candidate.eligibility === 'INELIGIBLE' ? 'Unavailable' : 'Unverified' : 'Console'}</span>
  </button>
}

function candidateReason(reason: NonNullable<CSharpRunCandidate['reason']>): string {
  switch (reason) {
    case 'NOT_CONSOLE_PROJECT': return 'This project is not a Console application.'
    case 'UNSUPPORTED_SDK': return 'This project uses an unsupported .NET SDK.'
    case 'UNSUPPORTED_FRAMEWORK': return 'This project targets an unsupported framework.'
    case 'MULTIPLE_FRAMEWORKS': return 'This project targets multiple frameworks.'
    case 'INVALID_PROJECT': return 'This project file could not be checked.'
    case 'INVALID_PROJECT_REFERENCE': return 'A referenced project could not be checked.'
    case 'SDK_MISSING': return 'The required .NET SDK is missing.'
    case 'SDK_SELECTION_FAILED': return 'The .NET SDK could not be selected.'
    case 'PREFLIGHT_FAILED': return 'This project could not be prepared to run.'
  }
}
