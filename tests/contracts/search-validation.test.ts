import { describe, expect, it } from 'vitest'

import {
  SEARCH_LIMITS,
  validateCancelSearchRequest,
  validateStartSearchRequest,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678'

describe('Phase 2D search contract validation', () => {
  it('accepts exact start and cancel request shapes', () => {
    expect(validateStartSearchRequest({
      projectId,
      operationId: 'search_query_1',
      query: 'Save',
    })).toEqual({
      ok: true,
      value: { projectId, operationId: 'search_query_1', query: 'Save' },
    })
    expect(validateCancelSearchRequest({ operationId: 'search_query_1' }).ok)
      .toBe(true)
  })

  it('rejects empty, oversized, control-character, malformed, and expanded requests', () => {
    expect(validateStartSearchRequest({
      projectId,
      operationId: 'search_query_1',
      query: '   ',
    }).ok).toBe(false)
    expect(validateStartSearchRequest({
      projectId,
      operationId: 'search_query_1',
      query: 'x'.repeat(SEARCH_LIMITS.maximumQueryLength + 1),
    }).ok).toBe(false)
    expect(validateStartSearchRequest({
      projectId,
      operationId: 'search_query_1',
      query: 'one\ntwo',
    }).ok).toBe(false)
    expect(validateStartSearchRequest({
      projectId: 'foreign',
      operationId: '../escape',
      query: 'text',
    }).ok).toBe(false)
    expect(validateStartSearchRequest({
      projectId,
      operationId: 'search_query_1',
      query: 'text',
      rootPath: 'C:\\secret',
    }).ok).toBe(false)
    expect(validateCancelSearchRequest({ operationId: 'search_query_1', all: true }).ok)
      .toBe(false)
  })
})
