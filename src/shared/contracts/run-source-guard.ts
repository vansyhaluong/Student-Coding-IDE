import type { AppResult } from './app-error'
import { isProjectId, type ProjectId } from './project'
import { isRunSessionId, type RunSessionId } from './run'
import { validateExactObject, type ValidationResult } from './validation'

export const RUN_SOURCE_GUARD_CHANNELS = {
  requested: 'run:source-guard-requested', released: 'run:source-guard-released',
  reply: 'run:source-guard-reply',
} as const
// Limit live records, not source documents; all retained documents are aggregated.
export const RUN_SOURCE_GUARD_LIMITS = { timeoutMs: 5_000, maximumSessions: 64 } as const
export interface RunSourceGuardRequest {
  readonly projectId: ProjectId
  readonly sessionId: RunSessionId
  readonly requestId: string
}
export interface RunSourceState {
  readonly revision: number | null
  readonly dirty: boolean
  readonly conflict: boolean
}
export interface RunSourceGuardReply extends RunSourceGuardRequest, RunSourceState {}
export type RunSourceGuardReason = 'SOURCE_DIRTY' | 'SOURCE_CONFLICT' | 'SOURCE_STATE_UNKNOWN'
  | 'SOURCE_CHANGED' | 'SOURCE_GUARD_TIMEOUT' | 'SOURCE_GUARD_CANCELLED'
  | 'SOURCE_GUARD_UNAVAILABLE' | 'SOURCE_GUARD_LIMIT_EXCEEDED'
export interface RunSourceGuardApi {
  onRequested(listener: (request: RunSourceGuardRequest) => void): () => void
  onReleased(listener: (request: RunSourceGuardRequest) => void): () => void
  reply(response: RunSourceGuardReply): Promise<AppResult<null>>
}
function invalid(): ValidationResult<never> {
  return { ok: false, issues: [{ path: '$', message: 'Invalid saved-source guard payload' }] }
}
function identity(value: Record<string, unknown>): ValidationResult<RunSourceGuardRequest> {
  return isProjectId(value.projectId) && isRunSessionId(value.sessionId)
    && typeof value.requestId === 'string' && /^source_[0-9a-f]{32}$/.test(value.requestId)
    ? { ok: true, value: { projectId: value.projectId, sessionId: value.sessionId, requestId: value.requestId } }
    : invalid()
}
export function validateRunSourceGuardRequest(value: unknown): ValidationResult<RunSourceGuardRequest> {
  const object = validateExactObject(value, ['projectId', 'sessionId', 'requestId'])
  return object.ok ? identity(object.value) : object
}
export function validateRunSourceGuardReply(value: unknown): ValidationResult<RunSourceGuardReply> {
  const object = validateExactObject(value, ['projectId', 'sessionId', 'requestId', 'revision', 'dirty', 'conflict'])
  if (!object.ok) return object
  const target = identity(object.value)
  if (!target.ok) return target
  const { revision, dirty, conflict } = object.value
  if ((revision !== null && (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0))
    || typeof dirty !== 'boolean' || typeof conflict !== 'boolean') return invalid()
  return { ok: true, value: { ...target.value, revision, dirty, conflict } }
}
