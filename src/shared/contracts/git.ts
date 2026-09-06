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
} as const

/** Phase 5A exposes detection only; command arguments and paths remain in Main. */
export interface GitApi {
  getState(projectId: ProjectId): Promise<AppResult<GitState>>
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
