import type { AppResult } from './app-error'
import { isProjectId, type ProjectId } from './project'
import { validateExactObject, type ValidationResult } from './validation'
import { validateCSharpRunTargetResolution, validateRunFailure, validateSemanticRunSession,
  validateSemanticRunTarget, validateSemanticStartRunRequest, type CloseRunInputRequest,
  type CSharpProjectRunTarget, type CSharpRunTargetResolution, type RunFailure,
  type RunInputAcknowledgement, type RunInputStatus, type RunInputStatusRequest,
  type SemanticRunSession, type SemanticStartRunRequest, type SendRunInputRequest } from './run'

export const RUN_PROJECT_CHANNELS = { resolve: 'run:resolve-targets', select: 'run:select-target',
  clear: 'run:clear-target', cancel: 'run:cancel-resolution', start: 'run:start-project', event: 'run:project-event' } as const
export interface RunProjectRequest { readonly projectId: ProjectId }
export type CSharpStartRunRequest = SemanticStartRunRequest & { readonly kind: 'csharp-project' }
export type CSharpRunSession = SemanticRunSession & { readonly kind: 'csharp-project' }
export const PROJECT_RUN_REASONS = ['SELECTION_REQUIRED', 'NO_RUNNABLE_PROJECT', 'INVALID_TARGET',
  'INVALID_PROJECT', 'INVALID_PROJECT_REFERENCE', 'STALE_TARGET', 'INVALID_SELECTION', 'PERSISTENCE_FAILED',
  'PERSISTENCE_RECOVERED', 'PROJECT_CHANGED', 'SOURCE_DIRTY', 'SOURCE_CONFLICT', 'SOURCE_STATE_UNKNOWN',
  'SOURCE_CHANGED', 'SOURCE_GUARD_TIMEOUT', 'SOURCE_GUARD_CANCELLED', 'SOURCE_GUARD_UNAVAILABLE',
  'SOURCE_GUARD_LIMIT_EXCEEDED', 'DISCOVERY_LIMIT_EXCEEDED'] as const
export type ProjectRunFailure = RunFailure | { readonly reason: typeof PROJECT_RUN_REASONS[number] }
export type ProjectRunEvent =
  | { readonly type: 'state' | 'phase'; readonly session: CSharpRunSession }
  | { readonly type: 'stdout' | 'stderr'; readonly session: CSharpRunSession; readonly data: string }
  | { readonly type: 'exit'; readonly session: CSharpRunSession; readonly exitCode: number | null }
  | { readonly type: 'error'; readonly session: CSharpRunSession; readonly failure: ProjectRunFailure }
/** Additive methods on studentIde.run. Stop remains the existing session-owned API. */
export interface ProjectRunApi {
  resolveTargets(request: RunProjectRequest): Promise<AppResult<CSharpRunTargetResolution>>
  selectTarget(target: CSharpProjectRunTarget): Promise<AppResult<CSharpRunTargetResolution>>
  clearTarget(request: RunProjectRequest): Promise<AppResult<CSharpRunTargetResolution>>
  cancelResolution(request: RunProjectRequest): Promise<AppResult<null>>
  startProject(request: CSharpStartRunRequest): Promise<AppResult<CSharpRunSession>>
  sendInput(request: SendRunInputRequest): Promise<AppResult<RunInputAcknowledgement>>
  closeInput(request: CloseRunInputRequest): Promise<AppResult<RunInputAcknowledgement>>
  inputStatus(request: RunInputStatusRequest): Promise<AppResult<RunInputStatus>>
  onProjectEvent(listener: (event: ProjectRunEvent) => void): () => void
}
const invalid = (): ValidationResult<never> => ({ ok: false, issues: [{ path: '$', message: 'Invalid C# Run payload' }] })
export function validateRunProjectRequest(value: unknown): ValidationResult<RunProjectRequest> {
  const exact = validateExactObject(value, ['projectId'])
  return exact.ok && isProjectId(exact.value.projectId) ? { ok: true, value: { projectId: exact.value.projectId } } : invalid()
}
export function validateCSharpRunTarget(value: unknown): ValidationResult<CSharpProjectRunTarget> {
  const valid = validateSemanticRunTarget(value)
  return valid.ok && valid.value.kind === 'csharp-project' ? { ok: true, value: valid.value } : invalid()
}
export function validateCSharpStartRunRequest(value: unknown): ValidationResult<CSharpStartRunRequest> {
  const valid = validateSemanticStartRunRequest(value)
  return valid.ok && valid.value.kind === 'csharp-project' ? { ok: true, value: valid.value } : invalid()
}
export function validateCSharpRunSession(value: unknown): ValidationResult<CSharpRunSession> {
  const valid = validateSemanticRunSession(value)
  return valid.ok && valid.value.kind === 'csharp-project' ? { ok: true, value: valid.value } : invalid()
}
export function validateProjectRunFailure(value: unknown): ValidationResult<ProjectRunFailure> {
  const failure = validateRunFailure(value)
  if (failure.ok) return failure
  const exact = validateExactObject(value, ['reason'])
  return exact.ok && PROJECT_RUN_REASONS.some(reason => reason === exact.value.reason)
    ? { ok: true, value: { reason: exact.value.reason as typeof PROJECT_RUN_REASONS[number] } } : invalid()
}
export function validateProjectRunEvent(value: unknown): ValidationResult<ProjectRunEvent> {
  const valid = validateExactObject(value, ['type', 'session', 'data', 'exitCode', 'failure'])
  if (!valid.ok) return invalid()
  const { type, data, exitCode } = valid.value
  const session = validateCSharpRunSession(valid.value.session)
  if (!session.ok) return invalid()
  const fields = type === 'state' || type === 'phase' ? ['type', 'session']
    : type === 'stdout' || type === 'stderr' ? ['type', 'session', 'data']
      : type === 'exit' ? ['type', 'session', 'exitCode'] : ['type', 'session', 'failure']
  if (!validateExactObject(value, fields).ok) return invalid()
  if (type === 'state' || type === 'phase') return { ok: true, value: { type, session: session.value } }
  if ((type === 'stdout' || type === 'stderr') && typeof data === 'string') return { ok: true, value: { type, session: session.value, data } }
  if (type === 'exit' && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.value.state)
    && (exitCode === null || typeof exitCode === 'number' && Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 0xffff_ffff)) {
    return { ok: true, value: { type, session: session.value, exitCode } }
  }
  if (type === 'error') {
    const failure = validateProjectRunFailure(valid.value.failure)
    if (failure.ok) return { ok: true, value: { type, session: session.value, failure: failure.value } }
  }
  return invalid()
}
export { validateCSharpRunTargetResolution }
