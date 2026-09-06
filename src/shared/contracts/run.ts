import type { AppResult } from './app-error'
import { validateAppError, type AppError } from './app-error'
import type { ProjectId } from './project'
import { validateExactObject, type ValidationResult } from './validation'

export const RUN_CHANNELS = { start: 'run:start', stop: 'run:stop', event: 'run:event' } as const
declare const runSessionBrand: unique symbol
export type RunSessionId = string & { readonly [runSessionBrand]: true }
export const RUN_STATES = ['STARTING', 'RUNNING', 'STOPPING', 'EXITED', 'FAILED', 'CANCELLED'] as const
export type RunState = typeof RUN_STATES[number]

export interface RunTarget {
  readonly projectId: ProjectId
  readonly relativePath: string
}

/** UI selects the current document. Dirty is a guard, never disk/path authority. */
export interface StartRunRequest extends RunTarget {
  readonly dirty: boolean
}
export interface StopRunRequest { readonly sessionId: RunSessionId }
export interface RunSession extends RunTarget {
  readonly sessionId: RunSessionId
  readonly state: RunState
}
export type RunEvent =
  | { readonly type: 'state'; readonly session: RunSession }
  | { readonly type: 'stdout' | 'stderr'; readonly session: RunSession; readonly data: string }
  | { readonly type: 'exit'; readonly session: RunSession; readonly exitCode: number | null }
  | { readonly type: 'error'; readonly session: RunSession; readonly error: AppError }

/** Live Renderer capability exposes only these semantic operations, never process options. */
export interface RunApi {
  start(request: StartRunRequest): Promise<AppResult<RunSession>>
  stop(sessionId: RunSessionId): Promise<AppResult<null>>
  onEvent(listener: (event: RunEvent) => void): () => void
}

function invalid(path: string): ValidationResult<never> {
  return { ok: false, issues: [{ path, message: 'Invalid Run field' }] }
}

export function isRunSessionId(value: unknown): value is RunSessionId {
  return typeof value === 'string'
    && /^run_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
}

/** Lexical IPC check only. Main must separately verify active project and real paths. */
function target(value: Record<string, unknown>): ValidationResult<RunTarget> {
  if (typeof value.projectId !== 'string' || !/^project_[a-f0-9]{24}$/.test(value.projectId)) {
    return invalid('$.projectId')
  }
  const path = value.relativePath
  if (typeof path !== 'string' || !path || /[\\<>:"|?*]/.test(path)
    || [...path].some((character) => character.charCodeAt(0) < 32)
    || path.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    return invalid('$.relativePath')
  }
  return { ok: true, value: { projectId: value.projectId as ProjectId, relativePath: path } }
}

export function validateStartRunRequest(value: unknown): ValidationResult<StartRunRequest> {
  const object = validateExactObject(value, ['projectId', 'relativePath', 'dirty'])
  if (!object.ok) return object
  const validated = target(object.value)
  if (!validated.ok) return validated
  if (typeof object.value.dirty !== 'boolean') return invalid('$.dirty')
  return { ok: true, value: { ...validated.value, dirty: object.value.dirty } }
}

export function validateStopRunRequest(value: unknown): ValidationResult<StopRunRequest> {
  const object = validateExactObject(value, ['sessionId'])
  if (!object.ok) return object
  return isRunSessionId(object.value.sessionId)
    ? { ok: true, value: { sessionId: object.value.sessionId } } : invalid('$.sessionId')
}

export function validateRunSession(value: unknown): ValidationResult<RunSession> {
  const object = validateExactObject(value, ['projectId', 'relativePath', 'sessionId', 'state'])
  if (!object.ok) return object
  const validated = target(object.value)
  if (!validated.ok) return validated
  const { sessionId, state } = object.value
  if (!isRunSessionId(sessionId)) return invalid('$.sessionId')
  if (typeof state !== 'string' || !RUN_STATES.some((candidate) => candidate === state)) {
    return invalid('$.state')
  }
  return { ok: true, value: { ...validated.value, sessionId, state: state as RunState } }
}

export function validateRunEvent(value: unknown): ValidationResult<RunEvent> {
  const object = validateExactObject(value, ['type', 'session', 'data', 'exitCode', 'error'])
  if (!object.ok) return object
  const session = validateRunSession(object.value.session)
  if (!session.ok) return session
  const { type, data, exitCode, error } = object.value
  const fields = type === 'state' ? ['type', 'session']
    : type === 'stdout' || type === 'stderr' ? ['type', 'session', 'data']
      : type === 'exit' ? ['type', 'session', 'exitCode'] : ['type', 'session', 'error']
  const exact = validateExactObject(value, fields)
  if (!exact.ok) return exact
  if (type === 'state') return { ok: true, value: { type, session: session.value } }
  if ((type === 'stdout' || type === 'stderr') && typeof data === 'string') {
    return { ok: true, value: { type, session: session.value, data } }
  }
  if (type === 'exit' && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.value.state)
    && (exitCode === null || typeof exitCode === 'number'
      && Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 0xffff_ffff)) {
    return { ok: true, value: { type, session: session.value, exitCode } }
  }
  if (type === 'error') {
    const validated = validateAppError(error)
    if (validated.ok) return { ok: true, value: { type, session: session.value, error: validated.value } }
  }
  return invalid('$')
}
