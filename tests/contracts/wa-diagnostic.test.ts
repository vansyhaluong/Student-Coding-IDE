import { describe, expect, it } from 'vitest'
import { diagnosticJsonBytes, isSubmissionDiagnostic, SUBMISSION_DIAGNOSTIC_BYTES as CAP, unavailableDiagnostic } from '../../src/shared/contracts/submission-diagnostic'
import { isSubmissionStatus, isSubmissionHistory } from '../../src/shared/contracts/submission-validation'
import type { ExerciseType } from '../../src/shared/contracts/practice'
import { publicDiagnostic } from '../fixtures/learning/wa-diagnostic'
import { transportStatus, transportHistory } from '../fixtures/learning/submission-transport'

describe('WA-B1 strict bounded public DTO', () => {
  it.each<[ExerciseType, unknown]>([['int32', -2147483648], ['boolean', false], ['string', '🙂\r\n"'],
    ['int32[]', [1, -2]], ['string[]', ['🙂', '']], ['int32[][]', [[1, 2], [3, 4]]], ['int32[][]', [[], []]]])('accepts typed %s', (returnType, value) => {
    expect(isSubmissionDiagnostic({ ...publicDiagnostic(), parameterTypes: [returnType], input: [value], returnType, actual: value, expected: value })).toBe(true)
  })
  it.each<[ExerciseType, unknown]>([['int32', '1'], ['int32', 2147483648], ['int32', NaN], ['boolean', 0], ['string', '\ud800'],
    ['int32[]', ['1']], ['string[]', [1]], ['int32[][]', [[1], [2, 3]]], ['int32[]', new Array(2)]])('rejects malformed %s', (returnType, actual) => {
    const valid: Record<ExerciseType, unknown> = { int32: 1, boolean: true, string: 'valid', 'int32[]': [1], 'string[]': ['valid'], 'int32[][]': [[1]] }
    expect(isSubmissionDiagnostic({ ...publicDiagnostic(), returnType, actual, expected: valid[returnType] })).toBe(false)
  })
  it.each(['caseIndex', 'caseId', 'visibility', 'stdout', 'stderr', 'stack', 'testSetId', 'officialHash', 'comparator', 'private'])('rejects private/unknown %s', field => {
    expect(isSubmissionDiagnostic({ ...publicDiagnostic(), [field]: 'private' })).toBe(false)
    expect(isSubmissionDiagnostic({ ...unavailableDiagnostic(), [field]: 'private' })).toBe(false)
  })
  it.each([{ packageVersion: 0 }, { packageVersion: undefined }, { sampleOrdinal: 0 }, { sampleOrdinal: 17 }, { exerciseId: '' },
    { parameterTypes: ['unknown'] }, { input: [] }, { returnType: 'unknown' }, { kind: 'HIDDEN_CASE' }])('rejects invalid identity/schema %j', change => {
    expect(isSubmissionDiagnostic({ ...publicDiagnostic(), ...change })).toBe(false)
  })
  it('accepts only fixed unclassified unavailable reasons', () => {
    expect(isSubmissionDiagnostic(unavailableDiagnostic())).toBe(true)
    expect(isSubmissionDiagnostic(unavailableDiagnostic('DETAIL_LIMIT_EXCEEDED'))).toBe(true)
    expect(isSubmissionDiagnostic({ kind: 'DETAIL_UNAVAILABLE', reason: 'HIDDEN_CASE' })).toBe(false)
  })
  it('enforces exactly32KiB encoded, including Unicode/escapes, before serialization', () => {
    const d = { ...publicDiagnostic(), actual: '' }
    const base = Buffer.byteLength(JSON.stringify(d))
    d.actual = 'x'.repeat(CAP - base)
    expect(diagnosticJsonBytes(d)).toBe(CAP); expect(isSubmissionDiagnostic(d)).toBe(true)
    d.actual += 'x'; expect(isSubmissionDiagnostic(d)).toBe(false)
    d.actual = '🙂'.repeat(CAP / 4); expect(isSubmissionDiagnostic(d)).toBe(false)
    d.actual = '\0'.repeat(CAP / 6); expect(isSubmissionDiagnostic(d)).toBe(false)
  })
  it('refuses getters/toJSON, symbols, custom arrays, cycles and excessive nodes without invoking code', () => {
    let reads = 0
    const bad = { ...publicDiagnostic(), get actual() { reads++; return 'x' } }
    expect(isSubmissionDiagnostic(bad)).toBe(false); expect(reads).toBe(0)
    expect(isSubmissionDiagnostic({ ...publicDiagnostic(), toJSON() { reads++; return {} } })).toBe(false)
    const array = ['x']; Object.assign(array, { extra: 'x' })
    for (const input of [array, Array(1000000).fill(0), { [Symbol('private')]: 1 }]) expect(isSubmissionDiagnostic({ ...publicDiagnostic(), input })).toBe(false)
    const cycle: unknown[] = []; cycle.push(cycle)
    expect(diagnosticJsonBytes(cycle)).toBeNull(); expect(reads).toBe(0)
  })
  it('binds diagnostic to WA/storage stage/exercise and never permits it in History', () => {
    const status = { ...transportStatus(), exerciseId: 'wa-synthetic', verdict: 'WrongAnswer', diagnostic: publicDiagnostic() }
    expect(isSubmissionStatus(status)).toBe(true)
    for (const change of [{ verdict: 'Accepted' }, { verdict: 'InfrastructureFailure' }, { stage: 'RUNTIME' }, { exerciseId: 'other' }]) {
      expect(isSubmissionStatus({ ...status, ...change })).toBe(false)
    }
    expect(isSubmissionStatus({ ...status, storage: { state: 'unknown', recoveryPending: true } })).toBe(true)
    expect(isSubmissionStatus({ ...status, stage: 'SETTLED', storage: { state: 'failed', reason: 'FULL' } })).toBe(true)
    const h = transportHistory(); h.rows[0] = { ...h.rows[0], diagnostic: publicDiagnostic() } as never
    expect(isSubmissionHistory(h)).toBe(false)
  })
})
