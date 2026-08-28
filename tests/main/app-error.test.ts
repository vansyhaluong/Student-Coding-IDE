import { describe, expect, it } from 'vitest'

import {
  DomainError,
  serializeAppError,
} from '../../src/main/errors/app-error'

describe('serializeAppError', () => {
  it('serializes an expected domain error without its cause or stack', () => {
    const cause = new Error('secret technical cause')
    const serialized = serializeAppError(new DomainError({
      code: 'PERMISSION_DENIED',
      message: 'Access was denied.',
      operation: 'project:identify',
      retryable: false,
    }, { cause }))

    expect(serialized).toEqual({
      code: 'PERMISSION_DENIED',
      message: 'Access was denied.',
      operation: 'project:identify',
      retryable: false,
    })
    expect(serialized).not.toHaveProperty('stack')
    expect(JSON.stringify(serialized)).not.toContain('secret technical cause')
  })

  it('maps known Node error codes to safe messages', () => {
    const error = Object.assign(new Error('D:\\private\\missing.txt'), {
      code: 'ENOENT',
    })

    expect(serializeAppError(error, 'file:read')).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      operation: 'file:read',
      retryable: false,
    })
  })

  it('redacts unknown errors', () => {
    const serialized = serializeAppError(
      new Error('token=do-not-leak'),
      'lifecycle:get-status',
    )

    expect(serialized.code).toBe('INTERNAL_ERROR')
    expect(serialized.message).not.toContain('token')
    expect(serialized).not.toHaveProperty('stack')
  })
})
