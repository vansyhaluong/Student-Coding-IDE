import {
  APP_ERROR_CODES,
  type AppError,
  type AppResult,
} from '../../shared/contracts'

export function parseAppResult<T>(
  value: unknown,
  isValue: (candidate: unknown) => candidate is T,
  operation: string,
): AppResult<T> {
  if (isRecord(value) && value.ok === true && isValue(value.value)) {
    return { ok: true, value: value.value }
  }
  if (isRecord(value) && value.ok === false && isAppError(value.error)) {
    return { ok: false, error: value.error }
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The application returned an invalid response.',
      operation,
      retryable: false,
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAppError(value: unknown): value is AppError {
  return isRecord(value)
    && typeof value.code === 'string'
    && APP_ERROR_CODES.includes(value.code as AppError['code'])
    && typeof value.message === 'string'
    && typeof value.retryable === 'boolean'
}
