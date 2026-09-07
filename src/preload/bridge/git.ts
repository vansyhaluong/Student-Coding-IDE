import {
  validateAppError,
  type AppResult,
} from '../../shared/contracts/app-error'
import {
  GIT_CHANNELS,
  validateGetGitStateRequest,
  validateGitState,
  validateGitStatus,
  validateGitPathRequest,
  validateGitMutationOutcome,
  validateGitCommitRequest,
  validateGitSwitchRequest,
  validateGitHistoryRequest,
  validateGitBranchSnapshot,
  validateGitHistory,
  type GitApi,
} from '../../shared/contracts/git'
import { validateExactObject, type ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'

function invalid(): AppResult<never> {
  return {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'Invalid Git request.',
      retryable: false,
    },
  }
}

/** Semantic Git operations; all process options remain private to Main. */
export function createGitBridge(ipc: IpcRendererLike): GitApi {
  return {
    async getState(projectId) {
      const request = validateGetGitStateRequest({ projectId })
      if (!request.ok) return invalid()
      return parseGitResult(
        await invokeSafely(ipc, GIT_CHANNELS.getState, request.value),
        validateGitState, GIT_CHANNELS.getState,
      )
    },
    async getStatus(projectId) {
      const request = validateGetGitStateRequest({ projectId })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.getStatus, request.value),
        validateGitStatus, GIT_CHANNELS.getStatus)
    },
    async stage(projectId, path) {
      const request = validateGitPathRequest({ projectId, path })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.stage, request.value),
        validateGitMutationOutcome, GIT_CHANNELS.stage)
    },
    async unstage(projectId, path) {
      const request = validateGitPathRequest({ projectId, path })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.unstage, request.value),
        validateGitMutationOutcome, GIT_CHANNELS.unstage)
    },
    async commit(projectId, message) {
      const request = validateGitCommitRequest({ projectId, message })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.commit, request.value),
        validateGitMutationOutcome, GIT_CHANNELS.commit)
    },
    async getBranches(projectId) {
      const request = validateGetGitStateRequest({ projectId })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.getBranches, request.value),
        validateGitBranchSnapshot, GIT_CHANNELS.getBranches)
    },
    async switchBranch(projectId, branch) {
      const request = validateGitSwitchRequest({ projectId, branch })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.switchBranch, request.value),
        validateGitMutationOutcome, GIT_CHANNELS.switchBranch)
    },
    async getHistory(projectId, limit) {
      const request = validateGitHistoryRequest({ projectId, limit })
      if (!request.ok) return invalid()
      return parseGitResult(await invokeSafely(ipc, GIT_CHANNELS.getHistory, request.value),
        (value) => {
          const result = validateGitHistory(value)
          return result.ok && result.value.length > request.value.limit
            ? { ok: false, issues: [{ path: '$', message: 'History exceeds requested limit' }] } : result
        }, GIT_CHANNELS.getHistory)
    },
  }
}

function parseGitResult<T>(value: unknown, validate: (value: unknown) => ValidationResult<T>, operation: string): AppResult<T> {
  const envelope = validateExactObject(value, ['ok', 'value', 'error'])
  if (envelope.ok && envelope.value.ok === true) {
    const exact = validateExactObject(value, ['ok', 'value'])
    const state = validate(envelope.value.value)
    if (exact.ok && state.ok) return { ok: true, value: state.value }
  }
  if (envelope.ok && envelope.value.ok === false) {
    const exact = validateExactObject(value, ['ok', 'error'])
    const error = validateAppError(envelope.value.error)
    if (exact.ok && error.ok) return { ok: false, error: error.value }
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The application returned an invalid response.',
      operation,
      details: { boundaryFailure: 'response-validation' },
      retryable: false,
    },
  }
}
