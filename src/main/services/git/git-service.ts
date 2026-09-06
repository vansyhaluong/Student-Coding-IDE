import { realpath } from 'node:fs/promises'

import type {
  GitState,
  ProjectFileSystemStatus,
  ProjectId,
} from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'
import {
  normalizePathIdentity,
  type ActiveProject,
} from '../project/project-identity'
import type { GitCommandResult } from './git-command-runner'
import type { GitExecutableStatus } from '../dependencies/git-executable'

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
  ): Promise<GitCommandResult>
}

const diskRoots: GitRootAccess = { realpath }

/** Phase 5A semantic service: dependency and exact-root repository detection only. */
export class GitService {
  constructor(
    private readonly projects: GitProjectAuthority,
    private readonly availability: GitProjectAvailability,
    private readonly detector: GitDependencyDetector,
    private readonly commands: GitCommandExecutor,
    private readonly roots: GitRootAccess = diskRoots,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async getState(projectId: ProjectId): Promise<GitState> {
    const project = this.authorizeAvailableProject(projectId)
    const dependency = await this.detector.detect()
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    if (dependency.state === 'MISSING') {
      return { dependency: 'MISSING', repository: null }
    }

    const result = await this.commands.execute(
      dependency.git.executable,
      REPOSITORY_PROBE_ARGS,
      project.canonicalRoot,
    )
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    if (isNotRepositoryResult(result)) {
      return { dependency: 'AVAILABLE', repository: 'NOT_REPOSITORY' }
    }
    if (result.exitCode !== 0) {
      throw gitCommandFailure()
    }

    const reportedRoot = parseGitTopLevel(result.stdout, this.platform)
    const canonicalGitRoot = await this.roots.realpath(reportedRoot)
    this.assertProjectStillAvailable(projectId, project.pathIdentity)

    return {
      dependency: 'AVAILABLE',
      repository: normalizePathIdentity(canonicalGitRoot, this.platform)
        === project.pathIdentity
        ? 'REPOSITORY'
        : 'NOT_REPOSITORY',
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
