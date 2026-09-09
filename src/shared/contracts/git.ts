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
  commit: 'git:commit',
  getBranches: 'git:get-branches',
  switchBranch: 'git:switch-branch',
  getHistory: 'git:get-history',
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
  commit(projectId: ProjectId, message: string): Promise<AppResult<GitMutationOutcome>>
  getBranches(projectId: ProjectId): Promise<AppResult<GitBranchSnapshot>>
  switchBranch(projectId: ProjectId, branch: string): Promise<AppResult<GitMutationOutcome>>
  getHistory(projectId: ProjectId, limit?: number): Promise<AppResult<readonly GitHistoryItem[]>>
}

export const DEFAULT_GIT_HISTORY_LIMIT = 50
export const MAX_GIT_HISTORY_LIMIT = 100

export type GitBranchSnapshot =
  | { readonly state: 'ATTACHED'; readonly currentBranch: string; readonly branches: readonly string[] }
  | { readonly state: 'DETACHED'; readonly currentBranch: null; readonly branches: readonly string[] }
  | { readonly state: 'UNBORN'; readonly currentBranch: string | null; readonly branches: readonly string[] }

export interface GitHistoryItem {
  readonly id: string
  readonly subject: string
  readonly authorName: string
  readonly authoredAt: string
}

export interface GitCommitRequest extends GetGitStateRequest { readonly message: string }
export interface GitSwitchRequest extends GetGitStateRequest { readonly branch: string }
export interface GitHistoryRequest extends GetGitStateRequest { readonly limit: number }

export function isGitCommitMessage(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0')
}

/** Local branch names, never revisions, options, or complete refs. Main also checks membership. */
export function isGitBranchName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value !== 'HEAD'
    && !value.startsWith('-') && !value.endsWith('.')
    && !value.includes('..') && !value.includes('@{')
    && !Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
    && !/[~^:?*[\\]/u.test(value)
    && value.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'))
}

export function validateGitCommitRequest(value: unknown): ValidationResult<GitCommitRequest> {
  const object = validateExactObject(value, ['projectId', 'message'])
  if (!object.ok) return object
  if (!isProjectId(object.value.projectId)) return invalid('$.projectId')
  if (!isGitCommitMessage(object.value.message)) return invalid('$.message')
  return { ok: true, value: { projectId: object.value.projectId, message: object.value.message } }
}

export function validateGitSwitchRequest(value: unknown): ValidationResult<GitSwitchRequest> {
  const object = validateExactObject(value, ['projectId', 'branch'])
  if (!object.ok) return object
  if (!isProjectId(object.value.projectId)) return invalid('$.projectId')
  if (!isGitBranchName(object.value.branch)) return invalid('$.branch')
  return { ok: true, value: { projectId: object.value.projectId, branch: object.value.branch } }
}

export function validateGitHistoryRequest(value: unknown): ValidationResult<GitHistoryRequest> {
  const object = validateExactObject(value, ['projectId', 'limit'])
  if (!object.ok) return object
  if (!isProjectId(object.value.projectId)) return invalid('$.projectId')
  const limit = object.value.limit === undefined ? DEFAULT_GIT_HISTORY_LIMIT : object.value.limit
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GIT_HISTORY_LIMIT) return invalid('$.limit')
  return { ok: true, value: { projectId: object.value.projectId, limit } }
}

export function validateGitBranchSnapshot(value: unknown): ValidationResult<GitBranchSnapshot> {
  const object = validateExactObject(value, ['state', 'currentBranch', 'branches'])
  if (!object.ok) return object
  const { state, currentBranch, branches } = object.value
  if (!Array.isArray(branches) || !branches.every(isGitBranchName)
    || new Set(branches).size !== branches.length) return invalid('$.branches')
  if (state === 'DETACHED' && currentBranch === null) return { ok: true, value: { state, currentBranch, branches } }
  if (state === 'ATTACHED' && isGitBranchName(currentBranch) && branches.includes(currentBranch)) {
    return { ok: true, value: { state, currentBranch, branches } }
  }
  if (state === 'UNBORN' && (currentBranch === null || isGitBranchName(currentBranch))
    && (currentBranch === null || !branches.includes(currentBranch))) return { ok: true, value: { state, currentBranch, branches } }
  return invalid('$')
}

export function isGitCommitId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
}

export function validateGitHistory(value: unknown): ValidationResult<readonly GitHistoryItem[]> {
  if (!Array.isArray(value) || value.length > MAX_GIT_HISTORY_LIMIT) return invalid('$')
  const items: GitHistoryItem[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const object = validateExactObject(item, ['id', 'subject', 'authorName', 'authoredAt'])
    if (!object.ok) return object
    const { id, subject, authorName, authoredAt } = object.value
    if (!isGitCommitId(id) || ids.has(id) || typeof subject !== 'string' || subject.includes('\0')
      || typeof authorName !== 'string' || authorName.includes('\0')
      || !isGitAuthoredAt(authoredAt)) return invalid('$')
    ids.add(id)
    items.push({ id, subject, authorName, authoredAt })
  }
  return { ok: true, value: items }
}

function isGitAuthoredAt(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = value.match(/\d+/g)!.map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59
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
