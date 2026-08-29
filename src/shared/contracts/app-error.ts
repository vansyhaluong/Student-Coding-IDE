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
