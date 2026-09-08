/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceControl } from '../../src/renderer/src/features/git/SourceControl'
import type { AppResult, GitApi, GitMutationOutcome, GitStatus, ProjectIdentity, GitBranchSnapshot, ProjectId } from '../../src/shared/contracts'
import { createGitBridge } from '../../src/preload/bridge/git'
import { GIT_CONTEXT_CHANNEL } from '../../src/shared/contracts/git-lifecycle'

const project: ProjectIdentity = { id: 'project_1234567890abcdef12345678' as ProjectId, name: 'A' }
const other: ProjectIdentity = { id: 'project_abcdef1234567890abcdef12' as ProjectId, name: 'B' }
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const failed = (reason = 'command-failed'): AppResult<never> => ({ ok: false,
  error: { code: 'PROCESS_FAILED', message: 'Git command failed.', details: { reason }, retryable: false } })
const status: GitStatus = { entries: [
  { path: 'mm.ts', staged: { kind: 'MODIFIED' }, unstaged: { kind: 'MODIFIED' }, untracked: false },
  { path: 'new.ts', staged: null, unstaged: null, untracked: true },
], didHitLimit: false }
const applied = ok<GitMutationOutcome>({ applied: true, status, refreshRequired: false })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }
function apiFixture() {
  return {
    getState: vi.fn<GitApi['getState']>(async () => ok({ dependency: 'AVAILABLE', repository: 'REPOSITORY' })),
    getStatus: vi.fn<GitApi['getStatus']>(async () => ok(status)),
    getBranches: vi.fn<GitApi['getBranches']>(async () => ok({ state: 'ATTACHED', currentBranch: 'main', branches: ['main', '@', 'topic'] })),
    getHistory: vi.fn<GitApi['getHistory']>(async () => ok([])),
    stage: vi.fn<GitApi['stage']>(async () => applied), unstage: vi.fn<GitApi['unstage']>(async () => applied),
    commit: vi.fn<GitApi['commit']>(async () => applied), switchBranch: vi.fn<GitApi['switchBranch']>(async () => applied),
  }
}
async function ready(api = apiFixture()) {
  const view = render(<SourceControl key={project.id} project={project} api={api} />)
  await screen.findByLabelText('Commit message')
  await waitFor(() => expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(false))
  return { api, ...view }
}
function draft(text = 'commit message') { fireEvent.change(screen.getByLabelText('Commit message'), { target: { value: text } }) }
function commit() { fireEvent.click(screen.getByRole('button', { name: 'Commit staged changes' })) }
afterEach(cleanup)

describe('Source Control project-session UI', () => {
  it.each(['unknown', 'recovery'] as const)('withdraws the shared snapshot for %s until explicit successful refresh', async (mode) => {
    const api = apiFixture(), onSnapshot = vi.fn()
    api.stage.mockResolvedValue(mode === 'unknown' ? failed('mutation-outcome-unknown')
      : ok({ applied: true, status: null, refreshRequired: true }))
    const view = render(<SourceControl project={project} api={api} onSnapshot={onSnapshot} />)
    await waitFor(() => expect(onSnapshot).toHaveBeenLastCalledWith(project, status))
    fireEvent.click(screen.getByLabelText('Stage new.ts'))
    await screen.findByText(mode === 'unknown' ? /outcome is unknown/ : /applied, but/)
    expect(onSnapshot).toHaveBeenLastCalledWith(project, null)
    expect(api.getStatus).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect(onSnapshot).toHaveBeenLastCalledWith(project, status))
    view.rerender(<SourceControl project={project} api={api} onSnapshot={onSnapshot} unavailable />)
    expect(onSnapshot).toHaveBeenLastCalledWith(project, null)
    view.unmount()
    expect(onSnapshot).toHaveBeenLastCalledWith(project, null)
  })

  it('loads after an initial transition lock and rejects a read after root unavailability', async () => {
    const api = apiFixture()
    const view = render(<SourceControl project={project} api={api} locked />)
    expect(api.getState).not.toHaveBeenCalled()
    view.rerender(<SourceControl project={project} api={api} />)
    await screen.findByLabelText('Stage new.ts')
    const pending = deferred<AppResult<GitStatus>>()
    api.getStatus.mockReturnValueOnce(pending.promise)
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2))
    view.rerender(<SourceControl project={project} api={api} unavailable />)
    await act(async () => pending.resolve(ok({ entries: [], didHitLimit: false })))
    expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Project unavailable')
    view.rerender(<SourceControl project={project} api={api} />)
    await waitFor(() => expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(false))
    expect(api.getStatus).toHaveBeenCalledTimes(3)
  })

  it('renders MM in both categories, untracked separately, and wires row-only semantic actions', async () => {
    const { api } = await ready()
    expect(within(screen.getByRole('region', { name: 'Staged changes' })).getByText('mm.ts')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Changes' })).getByText('mm.ts')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Stage new.ts'))
    await waitFor(() => expect(api.stage).toHaveBeenCalledWith(project.id, 'new.ts'))
    await waitFor(() => expect((screen.getByLabelText('Unstage mm.ts') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByLabelText('Unstage mm.ts'))
    await waitFor(() => expect(api.unstage).toHaveBeenCalledWith(project.id, 'mm.ts'))
  })

  it('shows conflicts read-only and empty status/history without inventing actions', async () => {
    const api = apiFixture()
    api.getStatus.mockResolvedValue(ok({ entries: [{ path: 'conflict.ts', staged: { kind: 'CONFLICTED' }, unstaged: null, untracked: false }], didHitLimit: false }))
    render(<SourceControl project={project} api={api} />)
    await screen.findByText('Conflicted — read-only')
    expect(screen.queryByLabelText('Unstage conflict.ts')).toBeNull()
    expect(screen.queryByLabelText('Stage conflict.ts')).toBeNull()
    expect(screen.getByText('No commits in history.')).toBeTruthy()
    expect(screen.getByText('No changes.')).toBeTruthy()
    expect(screen.getByText('No untracked.')).toBeTruthy()
  })

  it.each(['MISSING', 'NOT_CONFIGURED', 'INVALID_CONFIGURATION', 'NOT_REPOSITORY'] as const)('represents %s without enabling mutations', async (state) => {
    const api = apiFixture()
    api.getState.mockResolvedValue(ok(state === 'NOT_REPOSITORY'
      ? { dependency: 'AVAILABLE', repository: 'NOT_REPOSITORY' } : { dependency: state, repository: null }))
    render(<SourceControl project={project} api={api} />)
    await waitFor(() => expect(screen.queryByText('Loading Source Control…')).toBeNull())
    expect(api.getStatus).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Commit message')).toBeNull()
    expect(screen.getByText(/Git is missing|Git is not configured|Git configuration is invalid|not a Git repository/)).toBeTruthy()
  })

  it.each([false, true])('clears an unchanged submitted message on applied:true, refreshRequired=%s', async (refreshRequired) => {
    const { api } = await ready()
    api.commit.mockResolvedValue(refreshRequired ? ok({ applied: true, status: null, refreshRequired: true }) : applied)
    draft(); commit()
    await waitFor(() => expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe(''))
    expect(api.commit).toHaveBeenCalledWith(project.id, 'commit message')
    expect(api.stage).not.toHaveBeenCalled()
    if (refreshRequired) {
      expect(api.getState).toHaveBeenCalledTimes(1)
      expect(api.getStatus).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/operation was applied, but/)).toBeTruthy()
    }
  })

  it('preserves newer edits and blocks duplicate mutations while commit is pending', async () => {
    const { api } = await ready(), pending = deferred<AppResult<GitMutationOutcome>>()
    api.commit.mockReturnValue(pending.promise)
    draft('submitted'); commit(); commit()
    fireEvent.click(screen.getByLabelText('Stage new.ts'))
    draft('newer edit')
    await act(async () => pending.resolve(applied))
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('newer edit')
    expect(api.commit).toHaveBeenCalledTimes(1)
    expect(api.stage).not.toHaveBeenCalled()
  })

  it.each(['command-failed', 'mutation-outcome-unknown'])('preserves draft on %s', async (reason) => {
    const { api } = await ready()
    api.commit.mockResolvedValue(failed(reason))
    draft(); commit()
    await screen.findByText(reason === 'command-failed' ? 'Git command failed.' : /outcome is unknown/)
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('commit message')
  })

  it.each(['applied', 'unknown'] as const)('requires explicit successful Refresh after %s; failed refresh preserves truthful recovery', async (outcome) => {
    const { api } = await ready()
    api.commit.mockResolvedValue(outcome === 'applied' ? ok({ applied: true, status: null, refreshRequired: true }) : failed('mutation-outcome-unknown'))
    draft(); commit()
    await screen.findByText(outcome === 'applied' ? /applied, but/ : /outcome is unknown/)
    expect(api.getState).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(true)
    api.getStatus.mockResolvedValueOnce(failed())
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await screen.findByText(/Repository data is not current/)
    expect(screen.getByText(outcome === 'applied' ? /operation was applied/ : /outcome is unknown/)).toBeTruthy()
    expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect((screen.getByLabelText('Stage new.ts') as HTMLButtonElement).disabled).toBe(false))
    expect(api.commit).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe(outcome === 'applied' ? '' : 'commit message')
  })

  it('keeps draft through manual refresh, clears on project replacement/reload, and ignores the old commit reply', async () => {
    const { api, rerender, unmount } = await ready()
    draft('A draft')
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Commit staged changes' }) as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('A draft')
    const pending = deferred<AppResult<GitMutationOutcome>>()
    api.commit.mockReturnValue(pending.promise); commit()
    rerender(<SourceControl key={other.id} project={other} api={api} />)
    await screen.findByLabelText('Commit message')
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('')
    draft('B draft')
    await act(async () => pending.resolve(applied))
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('B draft')
    expect(api.getState).toHaveBeenCalledWith(other.id)
    unmount()
    render(<SourceControl key={other.id} project={other} api={api} />)
    await screen.findByLabelText('Commit message')
    expect((screen.getByLabelText('Commit message') as HTMLTextAreaElement).value).toBe('')
  })

  it.each<GitBranchSnapshot>([
    { state: 'ATTACHED', currentBranch: 'main', branches: ['main', '@'] },
    { state: 'DETACHED', currentBranch: null, branches: ['main', '@'] },
    { state: 'UNBORN', currentBranch: 'main', branches: [] },
  ])('renders branch state $state and switches only explicitly selected local names', async (branches) => {
    const api = apiFixture(); api.getBranches.mockResolvedValue(ok(branches))
    await ready(api)
    if (branches.state === 'UNBORN') {
      expect(screen.getByText('Unborn repository — main')).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Switch branch' }) as HTMLButtonElement).disabled).toBe(true)
    } else {
      if (branches.state === 'DETACHED') expect(screen.getByText('Detached HEAD')).toBeTruthy()
      else expect((screen.getByRole('button', { name: 'Switch branch' }) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.change(screen.getByLabelText('Local branch'), { target: { value: '@' } })
      expect(api.switchBranch).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Switch branch' }))
      await waitFor(() => expect(api.switchBranch).toHaveBeenCalledWith(project.id, '@'))
    }
  })

  it('uses backend default bounded history and displays the supplied fields', async () => {
    const api = apiFixture(), item = { id: 'a'.repeat(40), subject: 'Initial commit', authorName: 'Student', authoredAt: '2026-09-08T12:00:00Z' }
    api.getHistory.mockResolvedValue(ok([item]))
    await ready(api)
    expect(api.getHistory).toHaveBeenCalledWith(project.id)
    for (const field of Object.values(item)) expect(screen.getByText(field)).toBeTruthy()
  })

  it('never replaces a newer refresh with an older equivalent read', async () => {
    const { api } = await ready(), first = deferred<AppResult<GitStatus>>(), second = deferred<AppResult<GitStatus>>()
    api.getStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByLabelText('Refresh Source Control'))
    await waitFor(() => expect(api.getStatus).toHaveBeenCalledTimes(3))
    await act(async () => second.resolve(ok({ entries: [], didHitLimit: false })))
    await act(async () => first.resolve(ok(status)))
    expect(screen.queryByLabelText('Stage new.ts')).toBeNull()
    expect(screen.getByText('No staged changes.')).toBeTruthy()
  })

  it('integrates with the production Git Preload identity envelopes without raw arguments', async () => {
    const dispatch = vi.fn(async (channel: string, payload: unknown) => {
      if (channel === GIT_CONTEXT_CHANNEL) return ok({ generation: 'generation' })
      const request = payload as { identity: unknown }
      const response = channel === 'git:get-state' ? ok({ dependency: 'AVAILABLE', repository: 'REPOSITORY' })
        : channel === 'git:get-status' ? ok(status)
          : channel === 'git:get-branches' ? ok({ state: 'ATTACHED', currentBranch: 'main', branches: ['main'] })
            : channel === 'git:get-history' ? ok([]) : applied
      return ok({ identity: request.identity, result: response })
    })
    const api = createGitBridge({ invoke: dispatch, on: () => {}, removeListener: () => {} })
    render(<SourceControl project={project} api={api} />)
    await screen.findByLabelText('Stage new.ts')
    fireEvent.click(screen.getByLabelText('Stage new.ts'))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('git:stage', expect.objectContaining({
      payload: { projectId: project.id, path: 'new.ts' },
    })))
  })
})
