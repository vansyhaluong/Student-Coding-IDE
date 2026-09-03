import type { AppError, AppResult } from './app-error'
import { validateAppError } from './app-error'
import { isProjectId, type ProjectId } from './project'
import {
  isPlainObject,
  validateExactObject,
  type ValidationIssue,
  type ValidationResult,
} from './validation'

export type TerminalSessionId = string & {
  readonly __brand: 'TerminalSessionId'
}

export type TerminalEventSequence = number & {
  readonly __brand: 'TerminalEventSequence'
}

export const TERMINAL_SESSION_STATES = [
  'CREATING',
  'RUNNING',
  'CLOSING',
  'EXITED',
  'FAILED',
] as const

export type TerminalSessionState = (typeof TERMINAL_SESSION_STATES)[number]

export const TERMINAL_LIMITS = {
  minimumDimension: 1,
  maximumDimension: 1_000,
  maximumInputBytes: 64 * 1024,
  maximumSessionIdLength: 128,
  maximumShellLabelLength: 128,
} as const

export const TERMINAL_CHANNELS = {
  create: 'terminal:create',
  input: 'terminal:input',
  resize: 'terminal:resize',
  close: 'terminal:close',
  event: 'terminal:event',
} as const

export const TERMINAL_ERROR_SEMANTICS = {
  INVALID_INPUT: 'Malformed terminal request, dimensions, input, or session ID.',
  NOT_FOUND: 'The requested terminal session does not exist.',
  PERMISSION_DENIED: 'The renderer or project does not own the terminal session.',
  DEPENDENCY_MISSING: 'No required PTY provider or approved shell is available.',
  PROCESS_FAILED: 'The PTY failed to spawn or failed during normal operation.',
  SERVICE_CRASHED: 'The terminal service or native provider failed catastrophically.',
} as const satisfies Partial<Record<AppError['code'], string>>

export interface CreateTerminalRequest {
  projectId: ProjectId
  cols: number
  rows: number
}

export interface CreateTerminalResponse {
  sessionId: TerminalSessionId
  projectId: ProjectId
  state: 'RUNNING'
  cols: number
  rows: number
  /** Display metadata only; never an executable or shell-selection input. */
  shellLabel: string
}

export interface TerminalInputRequest {
  sessionId: TerminalSessionId
  data: string
}

export type TerminalInputResponse = null

export interface ResizeTerminalRequest {
  sessionId: TerminalSessionId
  cols: number
  rows: number
}

export type ResizeTerminalResponse = null

export interface CloseTerminalRequest {
  sessionId: TerminalSessionId
}

export interface CloseTerminalResponse {
  status: 'closed' | 'already-closed'
}

export interface TerminalDataEvent {
  type: 'data'
  sessionId: TerminalSessionId
  projectId: ProjectId
  sequence: TerminalEventSequence
  data: string
}

export interface TerminalExitEvent {
  type: 'exit'
  sessionId: TerminalSessionId
  projectId: ProjectId
  exitCode: number | null
  signal: number | null
}

export interface TerminalErrorEvent {
  type: 'error'
  sessionId: TerminalSessionId
  projectId: ProjectId
  error: AppError
}

// A successful create response is the readiness boundary. A separate ready
// event would duplicate the same RUNNING metadata and create two sources of
// truth for startup ordering.
export type TerminalEvent =
  | TerminalDataEvent
  | TerminalExitEvent
  | TerminalErrorEvent

export interface TerminalContractApi {
  create(request: CreateTerminalRequest): Promise<AppResult<CreateTerminalResponse>>
  input(request: TerminalInputRequest): Promise<AppResult<TerminalInputResponse>>
  resize(request: ResizeTerminalRequest): Promise<AppResult<ResizeTerminalResponse>>
  close(request: CloseTerminalRequest): Promise<AppResult<CloseTerminalResponse>>
  onEvent(listener: (event: TerminalEvent) => void): () => void
}

const ALLOWED_TRANSITIONS: Readonly<Record<TerminalSessionState, readonly TerminalSessionState[]>> = {
  CREATING: ['RUNNING', 'FAILED'],
  RUNNING: ['CLOSING', 'EXITED', 'FAILED'],
  CLOSING: ['EXITED', 'FAILED'],
  EXITED: [],
  FAILED: [],
}

export function isTerminalSessionState(value: unknown): value is TerminalSessionState {
  return typeof value === 'string'
    && TERMINAL_SESSION_STATES.includes(value as TerminalSessionState)
}

export function canTransitionTerminalSession(
  from: TerminalSessionState,
  to: TerminalSessionState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function isTerminalSessionId(value: unknown): value is TerminalSessionId {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= TERMINAL_LIMITS.maximumSessionIdLength
    && /^[a-zA-Z0-9_-]+$/.test(value)
}

export function validateTerminalSessionId(
  value: unknown,
): ValidationResult<TerminalSessionId> {
  return isTerminalSessionId(value)
    ? { ok: true, value }
    : {
        ok: false,
        issues: [{ path: '$', message: 'Expected a valid terminal session ID' }],
      }
}

export function isTerminalEventSequence(
  value: unknown,
): value is TerminalEventSequence {
  // Phase 2E-D owns per-session monotonic assignment. The cross-boundary value
  // starts at zero and must remain a non-negative safe integer.
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function validateCreateTerminalRequest(
  value: unknown,
): ValidationResult<CreateTerminalRequest> {
  const object = validateExactObject(value, ['projectId', 'cols', 'rows'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateProjectIdField(object.value.projectId, issues)
  validateDimensions(object.value.cols, object.value.rows, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          projectId: object.value.projectId as ProjectId,
          cols: object.value.cols as number,
          rows: object.value.rows as number,
        },
      }
}

export function validateCreateTerminalResponse(
  value: unknown,
): ValidationResult<CreateTerminalResponse> {
  const object = validateExactObject(
    value,
    ['sessionId', 'projectId', 'state', 'cols', 'rows', 'shellLabel'],
  )
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateSessionIdField(object.value.sessionId, issues)
  validateProjectIdField(object.value.projectId, issues)
  if (object.value.state !== 'RUNNING') {
    issues.push({ path: '$.state', message: 'Expected RUNNING' })
  }
  validateDimensions(object.value.cols, object.value.rows, issues)
  validateShellLabel(object.value.shellLabel, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: object.value as unknown as CreateTerminalResponse,
      }
}

export function validateTerminalInputRequest(
  value: unknown,
): ValidationResult<TerminalInputRequest> {
  const object = validateExactObject(value, ['sessionId', 'data'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateSessionIdField(object.value.sessionId, issues)
  const data = object.value.data
  if (typeof data !== 'string') {
    issues.push({ path: '$.data', message: 'Expected a string' })
  } else if (data.length === 0) {
    issues.push({ path: '$.data', message: 'Expected non-empty terminal input' })
  } else if (utf8ByteLength(data) > TERMINAL_LIMITS.maximumInputBytes) {
    issues.push({ path: '$.data', message: 'Terminal input exceeds the UTF-8 byte limit' })
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as TerminalInputRequest }
}

export function validateResizeTerminalRequest(
  value: unknown,
): ValidationResult<ResizeTerminalRequest> {
  const object = validateExactObject(value, ['sessionId', 'cols', 'rows'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateSessionIdField(object.value.sessionId, issues)
  validateDimensions(object.value.cols, object.value.rows, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as ResizeTerminalRequest }
}

export function validateCloseTerminalRequest(
  value: unknown,
): ValidationResult<CloseTerminalRequest> {
  const object = validateExactObject(value, ['sessionId'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateSessionIdField(object.value.sessionId, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as CloseTerminalRequest }
}

export function validateCloseTerminalResponse(
  value: unknown,
): ValidationResult<CloseTerminalResponse> {
  const object = validateExactObject(value, ['status'])
  if (!object.ok) return object
  return object.value.status === 'closed' || object.value.status === 'already-closed'
    ? { ok: true, value: { status: object.value.status } }
    : {
        ok: false,
        issues: [{ path: '$.status', message: 'Expected a terminal close status' }],
      }
}

export function validateTerminalEvent(
  value: unknown,
): ValidationResult<TerminalEvent> {
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path: '$', message: 'Expected an object' }] }
  }
  switch (value.type) {
    case 'data':
      return validateTerminalDataEvent(value)
    case 'exit':
      return validateTerminalExitEvent(value)
    case 'error':
      return validateTerminalErrorEvent(value)
    default:
      return {
        ok: false,
        issues: [{ path: '$.type', message: 'Expected a terminal event type' }],
      }
  }
}

function validateTerminalDataEvent(
  value: unknown,
): ValidationResult<TerminalDataEvent> {
  const object = validateExactObject(
    value,
    ['type', 'sessionId', 'projectId', 'sequence', 'data'],
  )
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateEventIdentity(object.value, issues)
  if (!isTerminalEventSequence(object.value.sequence)) {
    issues.push({ path: '$.sequence', message: 'Expected a non-negative safe integer' })
  }
  if (typeof object.value.data !== 'string' || object.value.data.length === 0) {
    issues.push({ path: '$.data', message: 'Expected non-empty terminal data' })
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as TerminalDataEvent }
}

function validateTerminalExitEvent(
  value: unknown,
): ValidationResult<TerminalExitEvent> {
  const object = validateExactObject(
    value,
    ['type', 'sessionId', 'projectId', 'exitCode', 'signal'],
  )
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateEventIdentity(object.value, issues)
  if (object.value.exitCode !== null && !Number.isSafeInteger(object.value.exitCode)) {
    issues.push({ path: '$.exitCode', message: 'Expected an integer or null' })
  }
  if (
    object.value.signal !== null
    && (!Number.isSafeInteger(object.value.signal) || (object.value.signal as number) < 0)
  ) {
    issues.push({ path: '$.signal', message: 'Expected a non-negative integer or null' })
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as TerminalExitEvent }
}

function validateTerminalErrorEvent(
  value: unknown,
): ValidationResult<TerminalErrorEvent> {
  const object = validateExactObject(
    value,
    ['type', 'sessionId', 'projectId', 'error'],
  )
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateEventIdentity(object.value, issues)
  const error = validateAppError(object.value.error)
  if (!error.ok) {
    issues.push(...error.issues.map((issue) => ({
      path: issue.path === '$' ? '$.error' : `$.error${issue.path.slice(1)}`,
      message: issue.message,
    })))
  }
  return issues.length > 0 || !error.ok
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          type: 'error',
          sessionId: object.value.sessionId as TerminalSessionId,
          projectId: object.value.projectId as ProjectId,
          error: error.value,
        },
      }
}

function validateEventIdentity(
  value: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  validateSessionIdField(value.sessionId, issues)
  validateProjectIdField(value.projectId, issues)
}

function validateSessionIdField(value: unknown, issues: ValidationIssue[]): void {
  if (!isTerminalSessionId(value)) {
    issues.push({ path: '$.sessionId', message: 'Expected a valid terminal session ID' })
  }
}

function validateProjectIdField(value: unknown, issues: ValidationIssue[]): void {
  if (!isProjectId(value)) {
    issues.push({ path: '$.projectId', message: 'Expected a valid ProjectId' })
  }
}

function validateDimensions(
  cols: unknown,
  rows: unknown,
  issues: ValidationIssue[],
): void {
  validateDimension(cols, '$.cols', issues)
  validateDimension(rows, '$.rows', issues)
}

function validateDimension(
  value: unknown,
  path: '$.cols' | '$.rows',
  issues: ValidationIssue[],
): void {
  if (
    !Number.isInteger(value)
    || (value as number) < TERMINAL_LIMITS.minimumDimension
    || (value as number) > TERMINAL_LIMITS.maximumDimension
  ) {
    issues.push({
      path,
      message: `Expected an integer from ${TERMINAL_LIMITS.minimumDimension} to ${TERMINAL_LIMITS.maximumDimension}`,
    })
  }
}

function validateShellLabel(value: unknown, issues: ValidationIssue[]): void {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || value.length > TERMINAL_LIMITS.maximumShellLabelLength
    || /[\0\r\n]/.test(value)
  ) {
    issues.push({ path: '$.shellLabel', message: 'Expected a safe display label' })
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
