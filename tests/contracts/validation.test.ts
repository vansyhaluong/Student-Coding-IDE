import { describe, expect, it } from 'vitest'

import { validateEmptyObject } from '../../src/shared/contracts'

describe('validateEmptyObject', () => {
  it('accepts an empty plain object', () => {
    expect(validateEmptyObject({})).toEqual({ ok: true, value: {} })
  })

  it.each([null, undefined, [], 'value', 1])(
    'rejects a non-object payload: %s',
    (payload) => {
      expect(validateEmptyObject(payload).ok).toBe(false)
    },
  )

  it('rejects unknown fields with field paths', () => {
    expect(validateEmptyObject({ unexpected: true })).toEqual({
      ok: false,
      issues: [{
        path: '$.unexpected',
        message: 'Unknown field',
      }],
    })
  })
})
