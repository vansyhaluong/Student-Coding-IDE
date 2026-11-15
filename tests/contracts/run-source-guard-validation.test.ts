import { describe, expect, it } from 'vitest'
import { validateRunSourceGuardReply, validateRunSourceGuardRequest } from '../../src/shared/contracts/run-source-guard'

const request = { projectId: 'project_1234567890abcdef12345678',
  sessionId: 'run_12345678-1234-1234-1234-123456789012', requestId: `source_${'a'.repeat(32)}` }
const reply = { ...request, revision: 1, dirty: false, conflict: false }
describe('saved-source exact contracts', () => {
  it('accepts scoped identities, clean/dirty/conflict and unknown revision states', () => {
    expect(validateRunSourceGuardRequest(request).ok).toBe(true)
    for (const state of [{}, { dirty: true }, { conflict: true }, { revision: null }, { revision: 0 }]) {
      expect(validateRunSourceGuardReply({ ...reply, ...state }).ok).toBe(true)
    }
  })
  it.each([
    { projectId: 'other' }, { sessionId: 'run_other' }, { requestId: 'source_unknown' },
    { requestId: 'a'.repeat(10000) }, { revision: -1 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { revision: '1' }, { revision: undefined }, { dirty: 'false' }, { conflict: null },
    { executable: 'cmd.exe' }, { argv: [] }, { cwd: 'C:\\outside' }, { content: 'source code' },
  ])('rejects invalid or privileged reply fields: %j', change => {
    expect(validateRunSourceGuardReply({ ...reply, ...change }).ok).toBe(false)
  })
  it('rejects extraneous request fields and missing identities', () => {
    expect(validateRunSourceGuardRequest({ ...request, revision: 1 }).ok).toBe(false)
    expect(validateRunSourceGuardRequest({ projectId: request.projectId }).ok).toBe(false)
  })
})
