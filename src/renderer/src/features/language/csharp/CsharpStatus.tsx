import { useRef, useState, useSyncExternalStore } from 'react'
import type { ProjectId } from '../../../../../shared/contracts'
import type { LanguageApi } from '../../../../../shared/contracts/language'
import { csharpStatusStore } from './csharp-status-store'

export function CsharpStatus({ projectId, api }: { projectId: ProjectId | null; api?: Pick<LanguageApi, 'selectWorkspace'> }) {
  const snapshot = useSyncExternalStore(csharpStatusStore.subscribe, csharpStatusStore.getSnapshot)
  const details = useRef<HTMLDetailsElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!snapshot || snapshot.projectId !== projectId) return null
  const { presentation, status } = snapshot
  const select = async (relativePath: string) => {
    if (pending || status.workspace.state !== 'SELECTION_REQUIRED') return
    const candidate = status.workspace.candidates.find(candidate => candidate.relativePath === relativePath)
    if (!candidate) return
    setPending(true); setError(null)
    try {
      const result = await (api ?? window.studentIde.language).selectWorkspace({ projectId: snapshot.projectId, candidate })
      // Status events are authoritative; retired selections cannot overwrite another session.
      if (csharpStatusStore.getSnapshot() !== snapshot) return
      if (result.ok) csharpStatusStore.set(snapshot.projectId, result.value)
      else setError('Could not select the C# solution. Choose it again to retry.')
    } catch {
      if (csharpStatusStore.getSnapshot() === snapshot) setError('Could not select the C# solution. Choose it again to retry.')
    } finally { setPending(false) }
  }
  return <details ref={details} className="csharp-status" onKeyDown={event => {
    if (event.key === 'Escape' && details.current) {
      details.current.open = false
      details.current.querySelector('summary')?.focus()
    }
  }}>
    <summary className="status-terminal-toggle"><span role="status" aria-label={presentation.detail} title={presentation.detail}>
      {presentation.label}
    </span></summary>
    <div className="csharp-status-details">
      <strong>C# Language Intelligence</strong>
      <p>{presentation.dependency}</p><p>{presentation.service}</p><p>{presentation.workspace}</p>
      {status.workspace.state === 'SELECTION_REQUIRED' && <label>
        Solution
        <select aria-label="C# solution" disabled={pending} value="" onChange={event => { void select(event.target.value) }}>
          <option value="">Choose a solution…</option>
          {status.workspace.candidates.map(candidate => <option key={candidate.relativePath} value={candidate.relativePath}>{candidate.relativePath}</option>)}
        </select>
      </label>}
      {pending && <p role="status">Loading C# solution…</p>}
      {error && <p role="alert">{error}</p>}
      {status.service.state !== 'RUNNING' && <p>C# syntax highlighting and editing remain available.</p>}
    </div>
  </details>
}
