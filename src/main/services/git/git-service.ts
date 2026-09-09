import { realpath, lstat } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  GitState,
  ProjectFileSystemStatus,
  ProjectId,
  GitStatus,
  GitMutationOutcome,
  GitBranchSnapshot,
  GitHistoryItem,
} from '../../../shared/contracts'
import { isGitRelativePath, isGitBranchName, isGitCommitId, isGitCommitMessage, validateGitHistoryRequest } from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'
import {
  normalizePathIdentity,
  type ActiveProject,
} from '../project/project-identity'
import type { GitCommandResult, GitCommandOptions, GitStreamResult } from './git-command-runner'
import type { GitExecutableStatus } from '../dependencies/git-executable'
import { GitStatusParser, type ParsedGitStatus } from './git-status-parser'
import { authorizeGitPath, invalidGitPath, type GitPathAccess } from './git-path-authority'
import { parseGitHistory, parseGitLocalBranches, malformedLocalGit } from './git-local-parser'

const STATUS_ARGS = ['-c', 'status.renames=copies', 'status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'] as const

const REPOSITORY_PROBE_ARGS = [
  '-c',
  'core.quotePath=false',
  'rev-parse',
  '--show-toplevel',
] as const

export interface GitProjectAuthority {
  getAuthorizedProject(projectId: string): ActiveProject
}

export interface GitProjectAvailability {
  getStatus(projectId: ProjectId): ProjectFileSystemStatus
}

export interface GitRootAccess {
  realpath(path: string): Promise<string>
}

export interface GitDependencyDetector {
  detect(): Promise<GitExecutableStatus>
}

export interface GitCommandExecutor {
  execute(
    executable: string,
    args: readonly string[],
    cwd: string,
    options?: GitCommandOptions,
  ): Promise<GitCommandResult>
  stream?(
    executable: string, args: readonly string[], cwd: string,
    consume: (chunk: Uint8Array) => boolean, options?: GitCommandOptions,
  ): Promise<GitStreamResult>
}

const diskRoots: GitRootAccess = { realpath }

/** Main-owned detection, bounded status and selected-entry index operations. */
export class GitService {
  constructor(
    private readonly projects: GitProjectAuthority,
    private readonly availability: GitProjectAvailability,
    private readonly detector: GitDependencyDetector,
    private readonly commands: GitCommandExecutor,
    private readonly roots: GitRootAccess = diskRoots,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly paths?: GitPathAccess,
    private readonly metadata: { lstat(path: string): Promise<unknown> } = { lstat },
  ) {}

  async getState(projectId: ProjectId): Promise<GitState> {
    return (await this.probe(projectId)).state
  }

  private async probe(projectId: ProjectId): Promise<{
    state: GitState; project: ActiveProject; executable?: string
  }> {
    const project = this.authorizeAvailableProject(projectId)
    const dependency = await this.detector.detect()
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    if (dependency.state === 'MISSING') {
      return { state: { dependency: 'MISSING', repository: null }, project }
    }

    const result = await this.commands.execute(
      dependency.git.executable,
      REPOSITORY_PROBE_ARGS,
      project.canonicalRoot,
    )
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    if (isNotRepositoryResult(result)) {
      return { state: { dependency: 'AVAILABLE', repository: 'NOT_REPOSITORY' }, project }
    }
    if (result.exitCode !== 0) {
      throw gitCommandFailure()
    }

    const reportedRoot = parseGitTopLevel(result.stdout, this.platform)
    const canonicalGitRoot = await this.roots.realpath(reportedRoot)
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    return {
      project, executable: dependency.git.executable,
      state: {
        dependency: 'AVAILABLE',
        repository: normalizePathIdentity(canonicalGitRoot, this.platform)
          === project.pathIdentity
          ? 'REPOSITORY'
          : 'NOT_REPOSITORY',
      },
    }
  }

  async getStatus(projectId: ProjectId, options: GitCommandOptions = {}): Promise<GitStatus> {
    return (await this.readStatus(projectId, options)).snapshot.status
  }

  stage(projectId: ProjectId, path: string): Promise<GitMutationOutcome> {
    return this.mutate(projectId, path, 'stage')
  }

  unstage(projectId: ProjectId, path: string): Promise<GitMutationOutcome> {
    return this.mutate(projectId, path, 'unstage')
  }

  async getBranches(projectId: ProjectId, options: GitCommandOptions = {}): Promise<GitBranchSnapshot> {
    return (await this.readBranches(projectId, options)).snapshot
  }

  private async readBranches(projectId: ProjectId, options: GitCommandOptions = {}) {
    const context = await this.repository(projectId)
    const run = (args: readonly string[]) => this.commands.execute(context.executable, args, context.project.canonicalRoot, options)
    const headBefore = await run(['symbolic-ref', '--quiet', 'HEAD'])
    if (headBefore.exitCode !== 0 && headBefore.exitCode !== 1) throw malformedLocalGit()
    const currentBranch = headBefore.exitCode === 1 ? null : localHeadName(headBefore.stdout)
    const head = await run(['rev-parse', '--verify', '--quiet', 'HEAD'])
    const list = await run(['for-each-ref', '--sort=refname', '--format=%(refname)%00%(objectname)%00%(objecttype)%00', 'refs/heads/'])
    if (list.exitCode !== 0) throw gitOperationFailure('get-branches', 'command-failed')
    const refs = parseGitLocalBranches(list.stdout)
    const headAfter = await run(['symbolic-ref', '--quiet', 'HEAD'])
    const oidAfter = await run(['rev-parse', '--verify', '--quiet', 'HEAD'])
    if (headBefore.exitCode !== headAfter.exitCode || headBefore.stdout !== headAfter.stdout
      || head.exitCode !== oidAfter.exitCode || head.stdout !== oidAfter.stdout) {
      throw gitOperationFailure('get-branches', 'repository-changed')
    }
    const branches = [...refs.keys()]
    let snapshot: GitBranchSnapshot
    if (head.exitCode === 0) {
      const oid = singleLine(head.stdout)
      if (!isGitCommitId(oid) || (currentBranch !== null && refs.get(currentBranch) !== oid)) throw malformedLocalGit()
      snapshot = currentBranch === null ? { state: 'DETACHED', currentBranch, branches }
        : { state: 'ATTACHED', currentBranch, branches }
    } else {
      // A missing symbolic target is unborn; other lookup failures are not.
      if (currentBranch === null || refs.has(currentBranch)) throw malformedLocalGit()
      const missing = await run(['show-ref', '--verify', '--quiet', `refs/heads/${currentBranch}`])
      if (missing.exitCode !== 1) throw malformedLocalGit()
      snapshot = { state: 'UNBORN', currentBranch, branches }
    }
    await this.repository(projectId, context.project.pathIdentity)
    return { ...context, snapshot, refs }
  }

  async getHistory(projectId: ProjectId, limit?: number, options: GitCommandOptions = {}): Promise<readonly GitHistoryItem[]> {
    const request = validateGitHistoryRequest({ projectId, limit })
    if (!request.ok) throw invalidLocalInput('get-history')
    const before = await this.repository(projectId)
    const head = await this.commands.execute(before.executable, ['rev-parse', '--verify', '--quiet', 'HEAD'], before.project.canonicalRoot, options)
    if (head.exitCode !== 0) {
      const symbolic = await this.commands.execute(before.executable, ['symbolic-ref', '--quiet', 'HEAD'], before.project.canonicalRoot, options)
      if (symbolic.exitCode !== 0) throw malformedLocalGit()
      const branch = localHeadName(symbolic.stdout)
      const target = await this.commands.execute(before.executable, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], before.project.canonicalRoot, options)
      if (target.exitCode !== 1) throw malformedLocalGit()
      await this.repository(projectId, before.project.pathIdentity)
      return []
    }
    if (!isGitCommitId(singleLine(head.stdout))) throw malformedLocalGit()
    const result = await this.commands.execute(before.executable, [
      'log', `--max-count=${request.value.limit}`, '--no-decorate', '--no-show-signature', '--encoding=UTF-8',
      '-z', '--format=tformat:%H%x00%s%x00%an%x00%aI', 'HEAD', '--',
    ], before.project.canonicalRoot, options)
    if (result.exitCode !== 0) throw gitOperationFailure('get-history', 'command-failed')
    const history = parseGitHistory(result.stdout, request.value.limit)
    await this.repository(projectId, before.project.pathIdentity)
    return history
  }

  async commit(projectId: ProjectId, message: string): Promise<GitMutationOutcome> {
    if (!isGitCommitMessage(message)) throw invalidLocalInput('commit')
    const before = await this.repository(projectId)
    await this.assertNoSequencedOperation(before)
    await this.repository(projectId, before.project.pathIdentity)
    return this.mutateLocal(projectId, before, ['commit', '-m', message], 'commit')
  }

  async switchBranch(projectId: ProjectId, branch: string): Promise<GitMutationOutcome> {
    if (!isGitBranchName(branch)) throw invalidLocalInput('switch-branch')
    const before = await this.readBranches(projectId)
    if (!before.snapshot.branches.includes(branch)) throw invalidLocalInput('switch-branch')
    await this.repository(projectId, before.project.pathIdentity)
    if (branch === '@') return this.switchAtBranch(projectId, before, before.refs.get(branch)!)
    return this.mutateLocal(projectId, before,
      ['switch', '--no-guess', '--no-overwrite-ignore', '--', branch], 'switch-branch')
  }

  private async switchAtBranch(projectId: ProjectId, before: { project: ActiveProject; executable: string },
    targetId: string): Promise<GitMutationOutcome> {
    // Git switch treats the short name @ as HEAD. Only Main constructs this ref.
    const targetRef = 'refs/heads/@'
    const run = (args: readonly string[]) => this.commands.execute(before.executable, args, before.project.canonicalRoot)
    const prove = async (attached: boolean) => {
      await this.repository(projectId, before.project.pathIdentity)
      const symbolic = await run(['symbolic-ref', '--quiet', 'HEAD'])
      const head = await run(['rev-parse', '--verify', '--quiet', 'HEAD'])
      const target = await run(['rev-parse', '--verify', '--quiet', targetRef])
      if ((attached ? symbolic.exitCode !== 0 || singleLine(symbolic.stdout) !== targetRef
        : symbolic.exitCode !== 1 || symbolic.stdout !== '')
        || head.exitCode !== 0 || target.exitCode !== 0
        || singleLine(head.stdout) !== targetId || singleLine(target.stdout) !== targetId) {
        throw malformedLocalGit()
      }
      await this.repository(projectId, before.project.pathIdentity)
    }
    try {
      // Authorized exception: native post-checkout runs once and sees DETACHED.
      const checkout = await run(['switch', '--detach', '--no-guess', '--no-overwrite-ignore', '--', targetRef])
      if (checkout.exitCode !== 0) throw malformedLocalGit()
      await prove(false)
      const attach = await run(['symbolic-ref', 'HEAD', targetRef])
      if (attach.exitCode !== 0) throw malformedLocalGit()
      await prove(true)
    } catch {
      await this.reprobeAfterInterruptedMutation(projectId, before.project.pathIdentity)
      throw gitOperationFailure('switch-branch', 'mutation-outcome-unknown')
    }
    try {
      const status = await this.getStatus(projectId)
      this.assertProjectStillAvailable(projectId, before.project.pathIdentity)
      return { applied: true, status, refreshRequired: false }
    } catch {
      return { applied: true, status: null, refreshRequired: true }
    }
  }

  private async assertNoSequencedOperation(context: { project: ActiveProject; executable: string }): Promise<void> {
    const result = await this.commands.execute(context.executable, ['rev-parse', '--absolute-git-dir'], context.project.canonicalRoot)
    if (result.exitCode !== 0) throw gitOperationFailure('commit', 'command-failed')
    const directory = parseGitTopLevel(result.stdout, this.platform)
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      try {
        await this.metadata.lstat(join(directory, marker))
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        throw gitOperationFailure('commit', 'repository-state-unavailable')
      }
      throw gitOperationFailure('commit', 'operation-in-progress')
    }
  }

  private async mutateLocal(projectId: ProjectId, before: { project: ActiveProject; executable: string },
    args: readonly string[], action: 'commit' | 'switch-branch'): Promise<GitMutationOutcome> {
    let result: GitCommandResult
    try {
      result = await this.commands.execute(before.executable, args, before.project.canonicalRoot)
    } catch {
      await this.reprobeAfterInterruptedMutation(projectId, before.project.pathIdentity)
      throw gitOperationFailure(action, 'mutation-outcome-unknown')
    }
    if (result.exitCode !== 0) {
      if (action === 'switch-branch') {
        // post-checkout can fail AFTER switching. Nonzero is not proof of unapplied.
        await this.reprobeAfterInterruptedMutation(projectId, before.project.pathIdentity)
        throw gitOperationFailure(action, 'mutation-outcome-unknown')
      }
      throw gitOperationFailure(action, 'command-failed')
    }
    try {
      await this.repository(projectId, before.project.pathIdentity)
      const status = await this.getStatus(projectId)
      this.assertProjectStillAvailable(projectId, before.project.pathIdentity)
      return { applied: true, status, refreshRequired: false }
    } catch {
      return { applied: true, status: null, refreshRequired: true }
    }
  }

  private async repository(projectId: ProjectId, expectedIdentity?: string) {
    const context = await this.probe(projectId)
    if (context.state.dependency !== 'AVAILABLE' || context.state.repository !== 'REPOSITORY'
      || !context.executable) throw gitOperationFailure('get-status', 'repository-unavailable')
    const canonical = await this.roots.realpath(context.project.canonicalRoot)
    if (normalizePathIdentity(canonical, this.platform) !== context.project.pathIdentity
      || (expectedIdentity && context.project.pathIdentity !== expectedIdentity)) throw projectUnavailable()
    this.assertProjectStillAvailable(projectId, context.project.pathIdentity)
    return { project: context.project, executable: context.executable }
  }

  private async readStatus(projectId: ProjectId, options: GitCommandOptions = {}): Promise<{
    snapshot: ParsedGitStatus; project: ActiveProject; executable: string
  }> {
    const context = await this.repository(projectId)
    if (!this.commands.stream) throw gitOperationFailure('get-status', 'stream-unavailable')
    const parser = new GitStatusParser()
    const result = await this.commands.stream(context.executable, STATUS_ARGS, context.project.canonicalRoot,
      (chunk) => parser.push(chunk), options)
    if (result.exitCode !== 0) throw gitOperationFailure('get-status', 'command-failed')
    const snapshot = parser.finish()
    await this.repository(projectId, context.project.pathIdentity)
    return { ...context, snapshot }
  }

  private async mutate(projectId: ProjectId, path: string, action: 'stage' | 'unstage'): Promise<GitMutationOutcome> {
    if (!isGitRelativePath(path)) throw invalidGitPath()
    const before = await this.readStatus(projectId)
    const entry = before.snapshot.status.entries.find((candidate) => candidate.path === path)
    if (!entry) throw invalidGitPath()
    if ([entry.staged, entry.unstaged].some((change) => change?.kind === 'CONFLICTED')) {
      throw gitOperationFailure(action, 'conflicted-read-only')
    }
    if (action === 'unstage' && !entry.staged) throw gitOperationFailure(action, 'not-staged')
    // Already-staged entries (including renames whose old path left the index)
    // have no worktree change to add. The fresh authorized snapshot is sufficient.
    if (action === 'stage' && !entry.untracked && !entry.unstaged) {
      return { applied: true, status: before.snapshot.status, refreshRequired: false }
    }
    const selectedPaths = [path]
    const selectedChange = action === 'unstage' ? entry.staged : entry.unstaged ?? entry.staged
    if (selectedChange?.kind === 'RENAMED') selectedPaths.push(selectedChange.previousPath)
    for (const selectedPath of selectedPaths) {
      await authorizeGitPath(before.project, selectedPath, this.platform, this.paths)
    }
    await this.repository(projectId, before.project.pathIdentity)
    const args = action === 'stage' ? ['add']
      : before.snapshot.unborn ? ['reset', '-q'] : ['restore', '--staged']
    let result: GitCommandResult
    try {
      result = await this.commands.execute(before.executable,
        ['--literal-pathspecs', ...args, '--', ...selectedPaths], before.project.canonicalRoot)
    } catch {
      // A killed command may have committed its index lock before termination.
      // Status can establish the desired state, but cannot prove who wrote it.
      // Re-probe for recovery; never turn uncertainty into applied=false/true.
      await this.reprobeAfterInterruptedMutation(projectId, before.project.pathIdentity)
      throw gitOperationFailure(action, 'mutation-outcome-unknown')
    }
    if (result.exitCode !== 0) throw gitOperationFailure(action, 'command-failed')
    try {
      await this.repository(projectId, before.project.pathIdentity)
      const status = await this.getStatus(projectId)
      this.assertProjectStillAvailable(projectId, before.project.pathIdentity)
      return { applied: true, status, refreshRequired: false }
    } catch {
      return { applied: true, status: null, refreshRequired: true }
    }
  }

  private async reprobeAfterInterruptedMutation(projectId: ProjectId, identity: string): Promise<void> {
    try {
      await this.repository(projectId, identity)
      await this.getStatus(projectId)
    } catch {
      // The returned structured unknown outcome explicitly requires a refresh.
    }
  }

  private authorizeAvailableProject(projectId: ProjectId): ActiveProject {
    const project = this.projects.getAuthorizedProject(projectId)
    if (this.availability.getStatus(projectId).state !== 'AVAILABLE') {
      throw projectUnavailable()
    }
    return project
  }

  private assertProjectStillAvailable(
    projectId: ProjectId,
    expectedPathIdentity: string,
  ): void {
    const current = this.projects.getAuthorizedProject(projectId)
    if (current.pathIdentity !== expectedPathIdentity
      || this.availability.getStatus(projectId).state !== 'AVAILABLE') {
      throw projectUnavailable()
    }
  }
}

function parseGitTopLevel(
  stdout: string,
  platform: NodeJS.Platform,
): string {
  const value = stdout.endsWith('\r\n')
    ? stdout.slice(0, -2)
    : stdout.endsWith('\n')
      ? stdout.slice(0, -1)
      : stdout
  if (
    !value
    || value.includes('\0')
    || value.includes('\r')
    || value.includes('\n')
    || !isFullyQualifiedPath(value, platform)
  ) {
    throw gitCommandFailure()
  }
  return value
}

function isFullyQualifiedPath(
  value: string,
  platform: NodeJS.Platform,
): boolean {
  if (platform !== 'win32') return value.startsWith('/')

  // isAbsolute alone also accepts current-drive rooted paths. Validate the
  // complete drive/UNC syntax before realpath can consult any ambient cwd.
  const drive = /^[a-z]:[\\/]/i.test(value)
  const unc = value.startsWith('\\\\') || value.startsWith('//')
  if (!drive && !unc) return false

  const remainder = value.slice(drive ? 3 : 2).replace(/[\\/]$/, '')
  if (drive && remainder === '') return value.length === 3
  const segments = remainder.split(/[\\/]/)
  if (unc && segments.length < 2) return false
  return segments.every((segment) => (
    segment.length > 0
    && !/[<>:"|?*]/.test(segment)
    && !Array.from(segment).some((character) => character.charCodeAt(0) < 32)
    && !/[. ]$/.test(segment)
    && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)
  ))
}

function isNotRepositoryResult(result: GitCommandResult): boolean {
  return result.exitCode !== 0
    && /(?:^|\r?\n)fatal: not a git repository(?: \(|$)/.test(result.stderr)
}

function projectUnavailable(): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message: 'The project root is unavailable.',
    operation: 'git:get-state',
    retryable: false,
  })
}

function gitCommandFailure(): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED',
    message: 'Git could not determine the repository state.',
    operation: 'git:get-state',
    retryable: true,
  })
}

function gitOperationFailure(
  action: 'get-status' | 'stage' | 'unstage' | 'commit' | 'get-branches' | 'switch-branch' | 'get-history', reason: string,
): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED', operation: `git:${action}`,
    message: reason === 'mutation-outcome-unknown'
      ? 'Git stopped before its mutation outcome could be confirmed. Refresh before trying again.'
      : reason === 'conflicted-read-only'
        ? 'Conflicted entries are read-only.' : 'Git could not complete the requested operation.',
    details: { reason, refreshRequired: reason === 'mutation-outcome-unknown' }, retryable: false,
  })
}

function invalidLocalInput(action: string): DomainError {
  return new DomainError({ code: 'INVALID_INPUT', operation: `git:${action}`,
    message: 'Invalid Git request.', details: { reason: 'invalid-input' }, retryable: false })
}

function singleLine(stdout: string): string {
  if (!stdout.endsWith('\n')) throw malformedLocalGit()
  const line = stdout.slice(0, -1)
  if (!line || /[\r\n\0]/.test(line)) throw malformedLocalGit()
  return line
}

function localHeadName(stdout: string): string {
  const ref = singleLine(stdout)
  if (!ref.startsWith('refs/heads/')) throw malformedLocalGit()
  const name = ref.slice('refs/heads/'.length)
  if (!isGitBranchName(name)) throw malformedLocalGit()
  return name
}
