import type {
  AppError,
  AppErrorCode,
} from '../../shared/contracts'

const NODE_ERROR_CODES: Partial<Record<string, AppErrorCode>> = {
  ENOENT: 'NOT_FOUND',
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  EINVAL: 'INVALID_INPUT',
}

export class DomainError extends Error {
  readonly code: AppErrorCode
  readonly operation?: string
  readonly details?: AppError['details']
  readonly retryable: boolean

  constructor(error: AppError, options?: ErrorOptions) {
    super(error.message, options)
    this.name = 'DomainError'
    this.code = error.code
    this.operation = error.operation
    this.details = error.details
    this.retryable = error.retryable
  }
}

export function invalidInputError(
  operation: string,
  fields: string[],
): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message: 'The request payload is invalid.',
    operation,
    details: fields.length > 0 ? { fields: fields.join(', ') } : undefined,
    retryable: false,
  })
}

export function serializeAppError(
  error: unknown,
  fallbackOperation?: string,
): AppError {
  if (error instanceof DomainError) {
    return {
      code: error.code,
      message: error.message,
      operation: error.operation ?? fallbackOperation,
      details: error.details,
      retryable: error.retryable,
    }
  }

  if (isNodeError(error)) {
    const code = NODE_ERROR_CODES[error.code ?? ''] ?? 'INTERNAL_ERROR'
    return {
      code,
      message: safeNodeMessage(code),
      operation: fallbackOperation,
      retryable: code === 'INTERNAL_ERROR',
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'An internal application error occurred.',
    operation: fallbackOperation,
    retryable: false,
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && ('code' in error || 'errno' in error)
}

function safeNodeMessage(code: AppErrorCode): string {
  switch (code) {
    case 'NOT_FOUND':
      return 'The requested resource was not found.'
    case 'PERMISSION_DENIED':
      return 'Permission was denied for this operation.'
    case 'INVALID_INPUT':
      return 'The operation received invalid input.'
    default:
      return 'An internal application error occurred.'
  }
}
