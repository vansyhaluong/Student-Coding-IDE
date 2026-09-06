import {
  validateAppError,
  type AppResult,
} from '../../shared/contracts/app-error'
import {
  GIT_CHANNELS,
  validateGetGitStateRequest,
  validateGitState,
  type GitApi,
  type GitState,
} from '../../shared/contracts/git'
import { validateExactObject } from '../../shared/contracts/validation'
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

/** Phase 5A detection only; process options remain private to Main. */
export function createGitBridge(ipc: IpcRendererLike): GitApi {
  return {
    async getState(projectId) {
      const request = validateGetGitStateRequest({ projectId })
      if (!request.ok) return invalid()
      return parseGitResult(
        await invokeSafely(ipc, GIT_CHANNELS.getState, request.value),
      )
    },
  }
}

function parseGitResult(value: unknown): AppResult<GitState> {
  const envelope = validateExactObject(value, ['ok', 'value', 'error'])
  if (envelope.ok && envelope.value.ok === true) {
    const exact = validateExactObject(value, ['ok', 'value'])
    const state = validateGitState(envelope.value.value)
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
      operation: GIT_CHANNELS.getState,
      details: { boundaryFailure: 'response-validation' },
      retryable: false,
    },
  }
}
