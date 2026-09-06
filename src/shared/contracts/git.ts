import type { AppResult } from './app-error'
import { isProjectId, type ProjectId } from './project'
import {
  validateExactObject,
  type ValidationResult,
} from './validation'

export const GIT_DEPENDENCY_STATES = [
  'NOT_CONFIGURED',
  'MISSING',
  'AVAILABLE',
  'INVALID_CONFIGURATION',
] as const

export type GitDependencyState = (typeof GIT_DEPENDENCY_STATES)[number]

export const GIT_REPOSITORY_STATES = [
  'REPOSITORY',
  'NOT_REPOSITORY',
] as const

export type GitRepositoryState = (typeof GIT_REPOSITORY_STATES)[number]

export interface GetGitStateRequest {
  readonly projectId: ProjectId
}

export type GitState =
  | {
      readonly dependency: 'AVAILABLE'
      readonly repository: GitRepositoryState
    }
  | {
      readonly dependency: Exclude<GitDependencyState, 'AVAILABLE'>
      readonly repository: null
    }

export const GIT_CHANNELS = {
  getState: 'git:get-state',
  getStatus: 'git:get-status',
  stage: 'git:stage',
  unstage: 'git:unstage',
} as const

export const MAX_GIT_STATUS_ENTRIES = 1000
export const MAX_GIT_PATH_LENGTH = 32767

export type GitChange =
  | { readonly kind: 'MODIFIED' | 'ADDED' | 'DELETED' | 'CONFLICTED' }
  | { readonly kind: 'RENAMED' | 'COPIED'; readonly previousPath: string }

export interface GitStatusEntry {
  readonly path: string
  readonly staged: GitChange | null
  readonly unstaged: GitChange | null
  readonly untracked: boolean
}

export interface GitStatus {
  readonly entries: readonly GitStatusEntry[]
  readonly didHitLimit: boolean
}

export type GitMutationOutcome =
  | { readonly applied: true; readonly status: GitStatus; readonly refreshRequired: false }
  | { readonly applied: true; readonly status: null; readonly refreshRequired: true }

export interface GitPathRequest extends GetGitStateRequest {
  readonly path: string
}

/** Semantic operations only; executable, cwd and arguments remain in Main. */
export interface GitApi {
  getState(projectId: ProjectId): Promise<AppResult<GitState>>
  getStatus(projectId: ProjectId): Promise<AppResult<GitStatus>>
  stage(projectId: ProjectId, path: string): Promise<AppResult<GitMutationOutcome>>
  unstage(projectId: ProjectId, path: string): Promise<AppResult<GitMutationOutcome>>
}

/** Repository-relative Windows V1 file identity, always using forward slashes. */
export function isGitRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_GIT_PATH_LENGTH
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32)
    && value.split('/').every((segment) => (
      segment.length > 0 && !/[<>:"|?*\\]/.test(segment) && !/[. ]$/.test(segment)
      && segment.toLowerCase() !== '.git'
      && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)
    ))
}

export function validateGitPathRequest(value: unknown): ValidationResult<GitPathRequest> {
  const object = validateExactObject(value, ['projectId', 'path'])
  if (!object.ok) return object
  if (!isProjectId(object.value.projectId)) return invalid('$.projectId')
  if (!isGitRelativePath(object.value.path)) return invalid('$.path')
  return { ok: true, value: { projectId: object.value.projectId, path: object.value.path } }
}

export function validateGitStatus(value: unknown): ValidationResult<GitStatus> {
  const object = validateExactObject(value, ['entries', 'didHitLimit'])
  if (!object.ok) return object
  const { entries, didHitLimit } = object.value
  if (!Array.isArray(entries) || entries.length > MAX_GIT_STATUS_ENTRIES
    || typeof didHitLimit !== 'boolean'
    || (didHitLimit && entries.length !== MAX_GIT_STATUS_ENTRIES)) return invalid('$')
  const validated: GitStatusEntry[] = []
  const paths = new Set<string>()
  for (const entry of entries) {
    const result = validateGitStatusEntry(entry)
    if (!result.ok) return result
    const identity = result.value.path.toLocaleLowerCase('en-US')
    if (paths.has(identity)) return invalid('$.entries')
    paths.add(identity)
    validated.push(result.value)
  }
  return { ok: true, value: { entries: validated, didHitLimit } }
}

export function validateGitStatusEntry(value: unknown): ValidationResult<GitStatusEntry> {
  const object = validateExactObject(value, ['path', 'staged', 'unstaged', 'untracked'])
  if (!object.ok) return object
  const { path, staged, unstaged, untracked } = object.value
  if (!isGitRelativePath(path) || typeof untracked !== 'boolean') return invalid('$')
  const index = validateChange(staged)
  const worktree = validateChange(unstaged)
  if (!index.ok) return index
  if (!worktree.ok) return worktree
  if (untracked ? staged !== null || unstaged !== null : staged === null && unstaged === null) {
    return invalid('$')
  }
  // Conflict is one read-only state, never mixed with ordinary actionable changes.
  if ((index.value?.kind === 'CONFLICTED' || worktree.value?.kind === 'CONFLICTED')
    && (index.value?.kind !== 'CONFLICTED' || worktree.value?.kind !== 'CONFLICTED')) return invalid('$')
  for (const change of [index.value, worktree.value]) {
    if (change && 'previousPath' in change && change.previousPath === path) return invalid('$')
  }
  return { ok: true, value: { path, staged: index.value, unstaged: worktree.value, untracked } }
}

function validateChange(value: unknown): ValidationResult<GitChange | null> {
  if (value === null) return { ok: true, value: null }
  const object = validateExactObject(value, ['kind', 'previousPath'])
  if (!object.ok) return object
  const { kind, previousPath } = object.value
  if (kind === 'RENAMED' || kind === 'COPIED') {
    if (!isGitRelativePath(previousPath)) return invalid('$.previousPath')
    return { ok: true, value: { kind, previousPath } }
  }
  if ('previousPath' in object.value) return invalid('$.previousPath')
  if (kind !== 'MODIFIED' && kind !== 'ADDED' && kind !== 'DELETED' && kind !== 'CONFLICTED') {
    return invalid('$.kind')
  }
  return { ok: true, value: { kind } }
}

export function validateGitMutationOutcome(value: unknown): ValidationResult<GitMutationOutcome> {
  const object = validateExactObject(value, ['applied', 'status', 'refreshRequired'])
  if (!object.ok) return object
  if (object.value.applied !== true) return invalid('$.applied')
  if (object.value.refreshRequired === true && object.value.status === null) {
    return { ok: true, value: { applied: true, status: null, refreshRequired: true } }
  }
  if (object.value.refreshRequired !== false) return invalid('$.refreshRequired')
  const status = validateGitStatus(object.value.status)
  return status.ok
    ? { ok: true, value: { applied: true, status: status.value, refreshRequired: false } }
    : status
}

export function validateGetGitStateRequest(
  value: unknown,
): ValidationResult<GetGitStateRequest> {
  const object = validateExactObject(value, ['projectId'])
  if (!object.ok) return object
  if (!isProjectId(object.value.projectId)) {
    return invalid('$.projectId')
  }
  return { ok: true, value: { projectId: object.value.projectId } }
}

export function validateGitState(value: unknown): ValidationResult<GitState> {
  const object = validateExactObject(value, ['dependency', 'repository'])
  if (!object.ok) return object

  const { dependency, repository } = object.value
  if (!isGitDependencyState(dependency)) return invalid('$.dependency')

  if (dependency === 'AVAILABLE') {
    return isGitRepositoryState(repository)
      ? { ok: true, value: { dependency, repository } }
      : invalid('$.repository')
  }

  return repository === null
    ? { ok: true, value: { dependency, repository: null } }
    : invalid('$.repository')
}

function isGitDependencyState(value: unknown): value is GitDependencyState {
  return typeof value === 'string'
    && GIT_DEPENDENCY_STATES.some((candidate) => candidate === value)
}

function isGitRepositoryState(value: unknown): value is GitRepositoryState {
  return typeof value === 'string'
    && GIT_REPOSITORY_STATES.some((candidate) => candidate === value)
}

function invalid(path: string): ValidationResult<never> {
  return {
    ok: false,
    issues: [{ path, message: 'Invalid Git field' }],
  }
}
