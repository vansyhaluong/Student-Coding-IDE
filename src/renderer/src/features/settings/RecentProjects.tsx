import { useEffect, useState } from 'react'
import type { ProjectId, RecentProject } from '../../../../shared/contracts'
import { Button } from '../../components/ui/Button'
export function RecentProjects({ revision, disabled, onOpen }: { revision: unknown; disabled: boolean; onOpen(id: ProjectId): Promise<void> }) {
  const [entries, setEntries] = useState<RecentProject[]>([])
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    let active = true
    void window.studentIde.project.listRecent().then(r => {
      if (!active) return
      if (r.ok) { setEntries(r.value); setError(null) } else setError(r.error.message)
    }).catch(() => { if (active) setError('Recent projects could not be loaded.') })
    return () => { active = false }
  }, [revision, generation])
  return <section className="recent-projects" aria-label="Recent projects"><h2>Recent projects</h2>
    {error && <p role="alert">{error}</p>}
    {!entries.length && <p>No recent projects.</p>}
    <ul>{entries.map(entry => <li key={entry.id}>
      <button className="recent-open" disabled={disabled} title={entry.displayPath} onClick={() => void onOpen(entry.id)}>
        <strong>{entry.name}</strong><span>{entry.displayPath}</span><time dateTime={entry.lastOpenedAt}>{new Date(entry.lastOpenedAt).toLocaleString()}</time>
      </button>
      <Button variant="ghost" size="iconSmall" disabled={disabled} aria-label={'Remove ' + entry.name + ' from recent projects'} title="Remove from history"
        onClick={() => { void window.studentIde.project.removeRecent(entry.id).then(r => { if (r.ok) { setGeneration(g => g + 1); setError(null) } else setError(r.error.message) }).catch(() => setError('Recent project could not be removed.')) }}>×</Button>
    </li>)}</ul>
  </section>
}
