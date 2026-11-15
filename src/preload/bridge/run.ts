import { RUN_CHANNELS, RUN_INPUT_CHANNELS, validateCloseRunInputRequest, validateRunEvent,
  validateRunInputAcknowledgement, validateRunInputStatus, validateRunInputStatusRequest,
  validateRunSession, validateSendRunInputRequest, validateStartRunRequest, validateStopRunRequest,
  type RunApi, type RunInputAcknowledgement, type RunInputStatus, type RunSession } from '../../shared/contracts/run'
import type { AppResult } from '../../shared/contracts/app-error'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { RUN_PROJECT_CHANNELS, validateRunProjectRequest, validateCSharpRunTarget,
  validateCSharpStartRunRequest, validateCSharpRunSession, validateCSharpRunTargetResolution,
  validateProjectRunEvent, type CSharpRunSession } from '../../shared/contracts/run-project'
import type { CSharpRunTargetResolution } from '../../shared/contracts/run'
import { validateAppError } from '../../shared/contracts/app-error'
import { validateExactObject } from '../../shared/contracts/validation'

function parseProjectResult<T>(value: unknown, matches: (value: unknown) => value is T, operation: string): AppResult<T> {
  const envelope = validateExactObject(value, ['ok', 'value', 'error'])
  if (envelope.ok && envelope.value.ok === true && validateExactObject(value, ['ok', 'value']).ok) {
    return parseAppResult(value, matches, operation)
  }
  if (envelope.ok && envelope.value.ok === false && validateExactObject(value, ['ok', 'error']).ok) {
    const error = validateExactObject(envelope.value.error, ['code', 'message', 'operation', 'details', 'retryable'])
    if (error.ok) {
      // Existing Main serializer includes undefined optional fields.
      const normalized = Object.fromEntries(Object.entries(error.value).filter(([, entry]) => entry !== undefined))
      const valid = validateAppError(normalized)
      if (valid.ok) return { ok: false, error: valid.value }
    }
  }
  return parseAppResult(null, matches, operation)
}

function invalid<T>(): AppResult<T> {
  return { ok: false, error: { code: 'INVALID_INPUT', retryable: false,
    message: 'Invalid Run request.' } }
}

/** Narrow semantic Run capability; no executable or process options cross the bridge. */
export function createRunBridge(ipc: IpcRendererLike): RunApi {
  return {
    async resolveTargets(request) {
      const valid = validateRunProjectRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_PROJECT_CHANNELS.resolve, valid.value),
        (value): value is CSharpRunTargetResolution => {
          const result = validateCSharpRunTargetResolution(value)
          return result.ok && result.value.projectId === valid.value.projectId
        }, RUN_PROJECT_CHANNELS.resolve)
    },
    async selectTarget(request) {
      const valid = validateCSharpRunTarget(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_PROJECT_CHANNELS.select, valid.value),
        (value): value is CSharpRunTargetResolution => {
          const result = validateCSharpRunTargetResolution(value)
          return result.ok && result.value.projectId === valid.value.projectId
        }, RUN_PROJECT_CHANNELS.select)
    },
    async clearTarget(request) {
      const valid = validateRunProjectRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_PROJECT_CHANNELS.clear, valid.value),
        (value): value is CSharpRunTargetResolution => {
          const result = validateCSharpRunTargetResolution(value)
          return result.ok && result.value.projectId === valid.value.projectId
        }, RUN_PROJECT_CHANNELS.clear)
    },
    async cancelResolution(request) {
      const valid = validateRunProjectRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_PROJECT_CHANNELS.cancel, valid.value),
        (value): value is null => value === null, RUN_PROJECT_CHANNELS.cancel)
    },
    async startProject(request) {
      const valid = validateCSharpStartRunRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_PROJECT_CHANNELS.start, valid.value),
        (value): value is CSharpRunSession => {
          const result = validateCSharpRunSession(value)
          return result.ok && result.value.projectId === valid.value.projectId
            && result.value.relativePath === valid.value.relativePath
        }, RUN_PROJECT_CHANNELS.start)
    },
    async sendInput(request) {
      const valid = validateSendRunInputRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_INPUT_CHANNELS.send, valid.value),
        (value): value is RunInputAcknowledgement => {
          const result = validateRunInputAcknowledgement(value)
          return result.ok && result.value.projectId === valid.value.projectId
            && result.value.sessionId === valid.value.sessionId && result.value.sequence === valid.value.sequence
        }, RUN_INPUT_CHANNELS.send)
    },
    async closeInput(request) {
      const valid = validateCloseRunInputRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_INPUT_CHANNELS.close, valid.value),
        (value): value is RunInputAcknowledgement => {
          const result = validateRunInputAcknowledgement(value)
          return result.ok && result.value.projectId === valid.value.projectId
            && result.value.sessionId === valid.value.sessionId && result.value.sequence === valid.value.sequence
        }, RUN_INPUT_CHANNELS.close)
    },
    async inputStatus(request) {
      const valid = validateRunInputStatusRequest(request)
      if (!valid.ok) return invalid()
      return parseProjectResult(await invokeSafely(ipc, RUN_INPUT_CHANNELS.status, valid.value),
        (value): value is RunInputStatus => {
          const result = validateRunInputStatus(value)
          return result.ok && result.value.projectId === valid.value.projectId
            && result.value.sessionId === valid.value.sessionId
        }, RUN_INPUT_CHANNELS.status)
    },
    onProjectEvent(listener) {
      const wrapped = (_event: unknown, value: unknown) => {
        const valid = validateProjectRunEvent(value)
        if (valid.ok) listener(valid.value)
      }
      ipc.on(RUN_PROJECT_CHANNELS.event, wrapped)
      return () => ipc.removeListener(RUN_PROJECT_CHANNELS.event, wrapped)
    },
    async start(request) {
      const validated = validateStartRunRequest(request)
      if (!validated.ok) return invalid()
      return parseAppResult(await invokeSafely(ipc, RUN_CHANNELS.start, validated.value),
        (value): value is RunSession => validateRunSession(value).ok, RUN_CHANNELS.start)
    },
    async stop(sessionId) {
      const validated = validateStopRunRequest({ sessionId })
      if (!validated.ok) return invalid()
      return parseAppResult(await invokeSafely(ipc, RUN_CHANNELS.stop, validated.value),
        (value): value is null => value === null, RUN_CHANNELS.stop)
    },
    onEvent(listener) {
      const wrapped = (_event: unknown, value: unknown): void => {
        const validated = validateRunEvent(value)
        if (validated.ok) listener(validated.value)
      }
      ipc.on(RUN_CHANNELS.event, wrapped)
      return () => ipc.removeListener(RUN_CHANNELS.event, wrapped)
    },
  }
}
