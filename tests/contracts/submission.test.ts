import { describe, expect, it } from 'vitest'
import { SUBMISSION_API_LIMITS as L } from '../../src/shared/contracts/submission'
import { validateSubmitRequest, validateSubmissionReference, validateSubmissionHistoryRequest, validateSubmissionSourceRequest,
  validateSubmissionContext, isSubmissionStatus, isSubmissionHistory, isSubmissionSource, isSubmissionCompletion } from '../../src/shared/contracts/submission-validation'
import { transportStatus, transportHistory, transportSource, submitRequest, availableStores } from '../fixtures/learning/submission-transport'

describe('S6 exact Submit and semantic request validators', () => {
  it('accepts exact source/revision without normalization and rejects malformed Unicode', () => {
    expect(validateSubmitRequest({ ...submitRequest, code: '🙂\r\n' })).toMatchObject({ ok: true, value: { code: '🙂\r\n' } })
    expect(validateSubmitRequest({ ...submitRequest, code: 'x'.repeat(L.sourceCodeUnits) }).ok).toBe(true)
    for (const code of ['x'.repeat(L.sourceCodeUnits + 1), '\ud800', '\udfff']) expect(validateSubmitRequest({ ...submitRequest, code }).ok).toBe(false)
  })
  it.each(['owner', 'verdict', 'Expected', 'cleanup', 'storage', 'identity', 'officialHash', 'command', 'path'])('refuses supplied %s authority', field => {
    expect(validateSubmitRequest({ ...submitRequest, [field]: 'private' }).ok).toBe(false)
  })
  it('does not invoke getters and rejects hidden/symbol/prototype fields', () => {
    let reads = 0; expect(validateSubmitRequest({ ...submitRequest, get code() { reads++; return 'x' } }).ok).toBe(false); expect(reads).toBe(0)
    expect(validateSubmitRequest(Object.assign(Object.create({}), submitRequest)).ok).toBe(false)
    expect(validateSubmitRequest({ ...submitRequest, [Symbol('owner')]: 1 }).ok).toBe(false)
  })
  it('validates Main-issued references and context without write/replay authority', () => {
    expect(validateSubmissionReference(transportStatus().reference).ok).toBe(true)
    for (const r of [{ ...transportStatus().reference, generation: 0 }, { ...transportStatus().reference, code: 'new submission' }, { ...transportStatus().reference, sessionId: '../x' }]) expect(validateSubmissionReference(r).ok).toBe(false)
    expect(validateSubmissionContext({ reason: 'LEARNING_LEFT' }).ok).toBe(true)
    expect(validateSubmissionContext({ reason: 'SHUTDOWN' }).ok).toBe(false)
  })
  it('enforces100 rows/512byte cursor/32KiB chunk requests without raw source hashes', () => {
    expect(validateSubmissionHistoryRequest({ limit: 100, cursor: 'a'.repeat(512) }).ok).toBe(true)
    for (const r of [{ limit: 101 }, { cursor: 'a'.repeat(513) }, { limit: -0 }, { cursor: undefined }]) expect(validateSubmissionHistoryRequest(r).ok).toBe(false)
    expect(validateSubmissionSourceRequest({ reference: 'opaque', offset: 0, limit: 32768 }).ok).toBe(true)
    for (const r of [{ reference: 'opaque', offset: 0, limit: 32769 }, { reference: 'opaque', offset: -1 }, { reference: 'opaque', offset: 0, sourceHash: 'hash' }]) expect(validateSubmissionSourceRequest(r).ok).toBe(false)
  })
})
describe('S6 safe response allowlists, consistency and encoded bounds', () => {
  it('accepts safe status/counts and rejects raw evidence, bad ordering counters and impossible saves', () => {
    expect(isSubmissionStatus(transportStatus())).toBe(true)
    for (const change of [{ sequence: -1 }, { sourceHash: 'a'.repeat(64) }, { JudgeResult: {} }, { counts: { total: 7, attempted: 8, passed: 7 } },
      { counts: { total: 7, attempted: 7, passed: 7, caseIndex: 0 } }, { storage: { state: 'saved', recordKey: { storeKind: 'FAILED', recordId: transportStatus().reference.submissionId } } },
      { stage: 'SETTLED' }, { storage: { state: 'unknown', recoveryPending: false } }]) expect(isSubmissionStatus({ ...transportStatus(), ...change })).toBe(false)
  })
  it('validates complete versus partial counts and strict row privacy', () => {
    const h = transportHistory(100); expect(isSubmissionHistory(h)).toBe(true)
    expect(isSubmissionHistory(transportHistory(101))).toBe(false)
    expect(isSubmissionHistory({ ...h, coverage: 'PARTIAL', countScope: 'READABLE_ONLY', total: null })).toBe(true)
    expect(isSubmissionHistory({ ...h, coverage: 'PARTIAL' })).toBe(false)
    const row = h.rows[0]
    expect(isSubmissionHistory({ ...h, rows: [{ ...row, source: { ...row.source, hash: 'a'.repeat(64) } }] })).toBe(false)
    expect(isSubmissionHistory({ ...h, rows: [row, row] })).toBe(false)
    expect(isSubmissionHistory({ ...h, rows: [{ ...row, Expected: 'private' }] })).toBe(false)
    expect(isSubmissionHistory({ ...h, nextCursor: 'a'.repeat(513) })).toBe(false)
  })
  it('checks exact UTF-8 chunk ranges, encoded response bytes and no private hash fields', () => {
    const chunk = transportSource('\0'.repeat(32768)); expect(isSubmissionSource(chunk)).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify({ ok: true, value: chunk })).byteLength).toBeLessThanOrEqual(L.responseBytes)
    expect(isSubmissionSource(transportSource('a'.repeat(32769)))).toBe(false)
    for (const changed of [{ sourceHash: 'a'.repeat(64) }, { code: '\ud800' }, { nextOffset: 7 }, { eof: false }]) expect(isSubmissionSource({ ...chunk, ...changed })).toBe(false)
    expect(isSubmissionSource(transportSource('🙂\r\n'))).toBe(true)
  })
  it('requires committed readable evidence for positive/negative completion and preserves recovery warning', () => {
    const base = { ok: true, exerciseId: 'ch2-04', state: 'COMPLETED', accepted: availableStores().ACCEPTED }
    expect(isSubmissionCompletion(base)).toBe(true)
    expect(isSubmissionCompletion({ ...base, accepted: { state: 'UNAVAILABLE', readable: false } })).toBe(false)
    expect(isSubmissionCompletion({ ...base, state: 'NOT_COMPLETED', accepted: { state: 'RECOVERED', readable: true, warning: 'POSSIBLE_DATA_LOSS' } })).toBe(false)
    expect(isSubmissionCompletion({ ...base, state: 'UNKNOWN', accepted: { state: 'RECOVERED', readable: true, warning: 'POSSIBLE_DATA_LOSS' } })).toBe(true)
  })
})
