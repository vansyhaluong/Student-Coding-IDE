import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitBranch, RefreshCw } from 'lucide-react'
import type { AppError, AppResult, GitApi, GitBranchSnapshot, GitHistoryItem, GitMutationOutcome,
  GitState, GitStatus, GitStatusEntry, ProjectIdentity } from '../../../../shared/contracts'
import { isGitCommitMessage } from '../../../../shared/contracts/git'
import { Button } from '../../components/ui/Button'

interface Snapshot { state: GitState; status: GitStatus | null; branches: GitBranchSnapshot | null; history: readonly GitHistoryItem[] }
interface Props { project: ProjectIdentity; locked?: boolean; unavailable?: boolean; api?: GitApi
  onSnapshot?(project: ProjectIdentity, status: GitStatus | null): void }

/** Project-session presentation state. Main and Preload remain lifecycle authorities. */
export function SourceControl({ project, locked = false, unavailable = false, api = window.studentIde.git, onSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [trusted, setTrusted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [branch, setBranch] = useState('')
  const owner = useRef({ alive: true, read: 0, mutation: false })
  const currentDraft = useRef(draft)
  const outcome = useRef<'applied' | 'unknown' | null>(null)
  const access = useRef({ locked, unavailable })
  access.current = { locked, unavailable }
  currentDraft.current = draft
  const disabled = locked || unavailable || busy || loading || !trusted

  // Publish presentation only; this component remains the sole Git request owner.
  // Layout cleanup removes decorations before paint during invalidation/unmount.
  useLayoutEffect(() => {
    onSnapshot?.(project, disabled ? null : snapshot?.status ?? null)
    return () => onSnapshot?.(project, null)
  }, [project, snapshot, disabled, onSnapshot])

  const refresh = async (appliedStatus?: GitStatus): Promise<void> => {
    const session = owner.current
    if (!session.alive || session.mutation && !appliedStatus || access.current.locked || access.current.unavailable) return
    const read = ++session.read
    const current = () => session.alive && owner.current === session && read === session.read
      && !access.current.locked && !access.current.unavailable
    setLoading(true); setTrusted(false)
    try {
      const state = value(await api.getState(project.id))
      if (!current()) return
      if (state.dependency !== 'AVAILABLE' || state.repository !== 'REPOSITORY') {
        setSnapshot({ state, status: null, branches: null, history: [] })
        setBranch(''); setTrusted(true)
        setNotice(outcome.current === 'applied' ? 'The operation was applied.'
          : outcome.current === 'unknown' ? 'The operation outcome is unknown. Repository state has been refreshed; inspect it before repeating the operation.' : null)
        return
      }
      const [statusResult, branchResult, historyResult] = await Promise.all([
        appliedStatus ? Promise.resolve({ ok: true as const, value: appliedStatus }) : api.getStatus(project.id),
        api.getBranches(project.id), api.getHistory(project.id),
      ])
      if (!current()) return
      const status = value(statusResult), branches = value(branchResult), history = value(historyResult)
      setSnapshot({ state, status, branches, history })
      setBranch((selected) => branches.branches.includes(selected) ? selected : branches.currentBranch ?? '')
      setTrusted(true)
      setNotice(outcome.current === 'applied' ? 'The operation was applied.'
        : outcome.current === 'unknown' ? 'The operation outcome is unknown. Repository state has been refreshed; inspect it before repeating the operation.' : null)
    } catch (error) {
      if (current()) setNotice(`${outcome.current === 'applied' ? 'The operation was applied. '
        : outcome.current === 'unknown' ? 'The operation outcome is unknown. ' : ''}${safeMessage(error)} Repository data is not current. Refresh before making further changes.`)
    } finally { if (current()) setLoading(false) }
  }

  useEffect(() => {
    const session = { alive: true, read: 0, mutation: false }
    owner.current = session
    return () => { session.alive = false; session.read++ }
    // The parent keys this component by project session. Tab switches keep it mounted.
  }, [project.id])

  useEffect(() => {
    owner.current.read++
    setLoading(false)
    setTrusted(false)
    if (!locked && !unavailable) void refresh()
  }, [project.id, locked, unavailable])

  const mutate = async (action: () => Promise<AppResult<GitMutationOutcome>>, submitted?: string): Promise<void> => {
    const session = owner.current
    if (disabled || session.mutation || !session.alive) return
    session.mutation = true; session.read++
    outcome.current = null
    setBusy(true); setNotice(null)
    const current = () => session.alive && owner.current === session
    try {
      const result = await action()
      if (!current()) return
      if (!result.ok) {
        const unknown = result.error.details?.reason === 'mutation-outcome-unknown'
          || result.error.details?.boundaryFailure === 'transport'
          || result.error.details?.boundaryFailure === 'response-validation'
        if (unknown) {
          outcome.current = 'unknown'
          setTrusted(false)
          setNotice('The operation outcome is unknown. Refresh and inspect the repository before making further changes. Do not repeat the operation without checking.')
        } else setNotice(result.error.message)
        return
      }
      if (submitted !== undefined && currentDraft.current === submitted) {
        currentDraft.current = ''; setDraft('')
      }
      outcome.current = 'applied'
      setNotice('The operation was applied.')
      if (result.value.refreshRequired) {
        setTrusted(false)
        setNotice('The operation was applied, but repository data could not be refreshed. Refresh before making further changes.')
        return
      }
      await refresh(result.value.status)
    } catch {
      if (current()) {
        outcome.current = 'unknown'
        setTrusted(false)
        setNotice('The operation outcome is unknown. Refresh and inspect the repository before making further changes.')
      }
    } finally {
      session.mutation = false
      if (current()) setBusy(false)
    }
  }

  const status = snapshot?.status
  const branches = snapshot?.branches
  const repository = snapshot?.state.dependency === 'AVAILABLE' && snapshot.state.repository === 'REPOSITORY'
  const entries = status?.entries ?? []
  const section = (title: string, rows: readonly GitStatusEntry[], staged: boolean) => <section className="git-section" aria-label={title}>
    <h3>{title} <span>{rows.length}</span></h3>
    {rows.length === 0 ? <p className="git-empty">No {title.toLowerCase()}.</p> : <ul>
      {rows.map((entry) => {
        const conflict = entry.staged?.kind === 'CONFLICTED' || entry.unstaged?.kind === 'CONFLICTED'
        const kind = conflict ? 'Conflicted — read-only' : entry.untracked ? 'Untracked' : (staged ? entry.staged : entry.unstaged)?.kind
        return <li key={entry.path} className="git-change">
          <span className="git-path" title={entry.path}>{entry.path}<small>{kind}</small></span>
          {!conflict && <Button size="small" variant="ghost" disabled={disabled}
            aria-label={`${staged ? 'Unstage' : 'Stage'} ${entry.path}`}
            onClick={() => void mutate(() => staged ? api.unstage(project.id, entry.path) : api.stage(project.id, entry.path))}>
            {staged ? 'Unstage' : 'Stage'}
          </Button>}
        </li>
      })}
    </ul>}
  </section>

  return <section className="source-control" aria-label="Source Control">
    <header className="panel-header"><h2>Source Control</h2>
      <Button size="iconSmall" variant="ghost" aria-label="Refresh Source Control" title="Refresh Source Control"
        disabled={busy || locked || unavailable} onClick={() => void refresh()}><RefreshCw aria-hidden="true" /></Button>
    </header>
    <div className="git-status" aria-live="polite" aria-busy={busy || loading}>
      {loading && <p>Loading Source Control…</p>}{busy && <p>Applying Git operation…</p>}
      {unavailable && <p role="alert">Project unavailable. Close and reopen it to retry.</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
    {snapshot && !repository && <p className="git-empty">{dependencyMessage(snapshot.state)}</p>}
    {repository && <>
      <section className="git-branch" aria-label="Branch">
        <p><GitBranch aria-hidden="true" /> {branches?.state === 'ATTACHED' ? branches.currentBranch
          : branches?.state === 'DETACHED' ? 'Detached HEAD'
            : branches?.state === 'UNBORN' ? `Unborn repository${branches.currentBranch ? ` — ${branches.currentBranch}` : ''}` : 'Branch unavailable'}</p>
        <label htmlFor="git-local-branch">Local branch</label>
        <select id="git-local-branch" value={branch} disabled={disabled || !branches?.branches.length}
          onChange={(event) => setBranch(event.target.value)}>
          <option value="">Select a local branch</option>
          {branches?.branches.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Button size="small" disabled={disabled || !branch || !branches?.branches.includes(branch)
          || branches.state === 'ATTACHED' && branches.currentBranch === branch}
          onClick={() => void mutate(() => api.switchBranch(project.id, branch))}>Switch branch</Button>
      </section>
      <section className="git-commit" aria-label="Commit staged changes">
        <label htmlFor="git-commit-message">Commit message</label>
        <textarea id="git-commit-message" value={draft} onChange={(event) => {
          currentDraft.current = event.target.value; setDraft(event.target.value)
        }} />
        <Button size="small" variant="primary" disabled={disabled || !isGitCommitMessage(draft)
          || !entries.some((entry) => entry.staged) || entries.some((entry) => entry.staged?.kind === 'CONFLICTED' || entry.unstaged?.kind === 'CONFLICTED')}
          onClick={() => { const message = currentDraft.current; void mutate(() => api.commit(project.id, message), message) }}>Commit staged changes</Button>
      </section>
      {status?.didHitLimit && <p className="git-empty">Status result limit reached. Only returned entries are shown.</p>}
      {section('Staged changes', entries.filter((entry) => entry.staged), true)}
      {section('Changes', entries.filter((entry) => entry.unstaged && !entry.untracked), false)}
      {section('Untracked', entries.filter((entry) => entry.untracked), false)}
      <section className="git-section" aria-label="History"><h3>History</h3>
        {snapshot.history.length === 0 ? <p className="git-empty">No commits in history.</p> : <ol className="git-history">
          {snapshot.history.map((item) => <li key={item.id}><strong>{item.subject}</strong>
            <code>{item.id}</code><span>{item.authorName}</span><time dateTime={item.authoredAt}>{item.authoredAt}</time></li>)}
        </ol>}
      </section>
    </>}
  </section>
}

function value<T>(result: AppResult<T>): T { if (!result.ok) throw result.error; return result.value }
function safeMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
    ? String((error as AppError).message) : 'The application request could not be completed.'
}
function dependencyMessage(state: GitState): string {
  switch (state.dependency) {
    case 'MISSING': return 'Git is missing. Install Git and make it available on PATH, then restart the application.'
    case 'NOT_CONFIGURED': return 'Git is not configured.'
    case 'INVALID_CONFIGURATION': return 'Git configuration is invalid.'
    case 'AVAILABLE': return 'This project is not a Git repository.'
  }
}
