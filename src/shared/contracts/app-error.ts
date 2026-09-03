import {
  isPlainObject,
  validateExactObject,
  type ValidationIssue,
  type ValidationResult,
} from './validation'

export const APP_ERROR_CODES = [
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'INVALID_INPUT',
  'DEPENDENCY_MISSING',
  'PROCESS_FAILED',
  'PROCESS_CANCELLED',
  'SERVICE_CRASHED',
  'UNSUPPORTED',
  'INTERNAL_ERROR',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export interface AppError {
  code: AppErrorCode
  message: string
  operation?: string
  details?: Record<string, string | number | boolean | null>
  retryable: boolean
}

export type AppResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError }

export function validateAppError(value: unknown): ValidationResult<AppError> {
  const object = validateExactObject(
    value,
    ['code', 'message', 'operation', 'details', 'retryable'],
  )
  if (!object.ok) return object

  const issues: ValidationIssue[] = []
  const { code, message, operation, details, retryable } = object.value
  if (
    typeof code !== 'string'
    || !APP_ERROR_CODES.includes(code as AppErrorCode)
  ) {
    issues.push({ path: '$.code', message: 'Expected a valid AppError code' })
  }
  if (typeof message !== 'string' || message.length === 0) {
    issues.push({ path: '$.message', message: 'Expected a non-empty string' })
  }
  if ('operation' in object.value && typeof operation !== 'string') {
    issues.push({ path: '$.operation', message: 'Expected a string' })
  }
  if ('details' in object.value && !isAppErrorDetails(details)) {
    issues.push({ path: '$.details', message: 'Expected serializable error details' })
  }
  if (typeof retryable !== 'boolean') {
    issues.push({ path: '$.retryable', message: 'Expected a boolean' })
  }
  if (issues.length > 0) return { ok: false, issues }

  const error: AppError = {
    code: code as AppErrorCode,
    message: message as string,
    retryable: retryable as boolean,
  }
  if (typeof operation === 'string') error.operation = operation
  if (isAppErrorDetails(details)) error.details = details
  return { ok: true, value: error }
}

function isAppErrorDetails(value: unknown): value is AppError['details'] {
  return isPlainObject(value) && Object.values(value).every((detail) => (
    typeof detail === 'string'
    || typeof detail === 'number' && Number.isFinite(detail)
    || typeof detail === 'boolean'
    || detail === null
  ))
}
