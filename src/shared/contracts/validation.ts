export interface ValidationIssue {
  path: string
  message: string
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

export type RuntimeValidator<T> = (value: unknown) => ValidationResult<T>

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function validateEmptyObject(
  value: unknown,
): ValidationResult<Record<string, never>> {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: '$', message: 'Expected an object' }],
    }
  }

  const keys = Object.keys(value)
  if (keys.length > 0) {
    return {
      ok: false,
      issues: keys.map((key) => ({
        path: `$.${key}`,
        message: 'Unknown field',
      })),
    }
  }

  return { ok: true, value: {} }
}
