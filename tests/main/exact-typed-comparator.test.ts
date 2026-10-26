import { describe, expect, expectTypeOf, it } from 'vitest'
import { compareExactTyped } from '../../src/main/services/learning/judge/exact-typed-comparator'
import type { ComparatorResult, JudgeCaseDecision, JudgeEligibility, JudgeResult, JudgeVerdict } from '../../src/main/services/learning/judge/judge-contracts'
import type { ExerciseType } from '../../src/shared/contracts/practice'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'

const identity = Object.freeze({ id: 'exact-typed', version: 1 })
const compare = (type: unknown, actual: unknown, expected: unknown) => compareExactTyped(type, actual, expected, identity)
const examples: [ExerciseType, unknown, unknown][] = [
  ['int32', 3, 4], ['boolean', false, true], ['string', 'a', 'b'],
  ['int32[]', [1, 2], [2, 1]], ['string[]', ['a', 'b'], ['b', 'a']], ['int32[][]', [[1, 2], [3, 4]], [[1, 3], [2, 4]]],
]

describe('Main-private exact-typed@1', () => {
  it.each(examples)('compares %s by type, value, order and structure', (type, a, b) => {
    expect(compare(type, a, a)).toBe('PASS')
    expect(compare(type, a, b)).toBe('DIFFERENT')
    expect(compare(type, null, a)).toBe('INVALID_ACTUAL')
    expect(compare(type, a, null)).toBe('INVALID_EXPECTED')
  })

  it.each([-2147483648, 2147483647, 0, -0])('accepts int32 boundary %s', n => {
    expect(compare('int32', n, n)).toBe('PASS')
  })
  it('equates negative zero with zero, including nested cells', () => {
    expect(compare('int32', -0, 0)).toBe('PASS')
    expect(compare('int32[]', [-0], [0])).toBe('PASS')
    expect(compare('int32[][]', [[-0]], [[0]])).toBe('PASS')
  })
  it.each([-2147483649, 2147483648, 1.5, NaN, Infinity, -Infinity, '1', true, undefined])('rejects non-int32 %s on either side', n => {
    expect(compare('int32', n, 1)).toBe('INVALID_ACTUAL')
    expect(compare('int32', 1, n)).toBe('INVALID_EXPECTED')
    expect(compare('int32[]', [n], [1])).toBe('INVALID_ACTUAL')
    expect(compare('int32[][]', [[n]], [[1]])).toBe('INVALID_ACTUAL')
  })
  it.each([0, 1, 'true', 'false', new Boolean(true)])('does not coerce boolean %s', value => {
    expect(compare('boolean', value, true)).toBe('INVALID_ACTUAL')
    expect(compare('boolean', false, value)).toBe('INVALID_EXPECTED')
  })
  it.each(['', ' ', '\t\r\n', 'Tiếng Việt', '😀', '\u0000', '"\\\b\f'])('accepts exact valid Unicode %j', value => {
    expect(compare('string', value, value)).toBe('PASS')
    expect(compare('string[]', [value], [value])).toBe('PASS')
  })
  it.each([[' a', 'a'], ['A', 'a'], ['a\r\n', 'a\n'], ['é', 'e\u0301'], ['', ' ']])('does not normalize %j / %j', (a, b) => {
    expect(compare('string', a, b)).toBe('DIFFERENT')
  })
  it.each(['\ud800', '\udfff', '\ud800x', '\ud800\ud800', '😀\udfff'])('rejects lone surrogates %j', value => {
    expect(compare('string', value, '')).toBe('INVALID_ACTUAL')
    expect(compare('string', '', value)).toBe('INVALID_EXPECTED')
    expect(compare('string[]', [value], [''])).toBe('INVALID_ACTUAL')
    expect(compare('string[]', [''], [value])).toBe('INVALID_EXPECTED')
  })
  it.each([1, false, {}, new String('a')])('does not coerce string %s', value => {
    expect(compare('string', value, 'a')).toBe('INVALID_ACTUAL')
  })
  it.each(['int32[]', 'string[]', 'int32[][]'] as const)('accepts empty %s', type => {
    expect(compare(type, [], [])).toBe('PASS')
    expect(compare(type, new Array(1), [])).toBe('INVALID_ACTUAL')
    expect(compare(type, [], new Array(1))).toBe('INVALID_EXPECTED')
  })
  it('distinguishes array length and element types without sorting', () => {
    expect(compare('int32[]', [1], [1, 2])).toBe('DIFFERENT')
    expect(compare('string[]', ['a'], [])).toBe('DIFFERENT')
    expect(compare('int32[]', ['1'], [1])).toBe('INVALID_ACTUAL')
    expect(compare('string[]', [1], ['1'])).toBe('INVALID_ACTUAL')
    expect(compare('int32[]', new Int32Array([1]), [1])).toBe('INVALID_ACTUAL')
    expect(compare('int32[]', { 0: 1, length: 1 }, [1])).toBe('INVALID_ACTUAL')
  })
  it.each([
    [[], [[]]], [[[]], [[], []]], [[], [[], []]], [[[1, 2]], [[1], [2]]], [[[1]], [[1, 2]]],
  ])('distinguishes valid matrix dimensions %#', (a, b) => {
    expect(compare('int32[][]', a, b)).toBe('DIFFERENT')
    expect(compare('int32[][]', a, a)).toBe('PASS')
    expect(compare('int32[][]', b, b)).toBe('PASS')
  })
  it.each([[[1], []], [null], [new Array(1)], [[1], [2, 3]], [[true]], [1]])('rejects malformed matrix %#', (...row) => {
    // Each table entry is the complete candidate matrix, not a spread argument list.
    expect(compare('int32[][]', row, [[1]])).toBe('INVALID_ACTUAL')
    expect(compare('int32[][]', [[1]], row)).toBe('INVALID_EXPECTED')
  })
  it('rejects holes after a valid prefix and never invokes array conversion hooks', () => {
    const sparse = new Array<number>(3); sparse[0] = 1; sparse[2] = 3
    expect(compare('int32[]', sparse, [1, 2, 3])).toBe('INVALID_ACTUAL')
    const matrix = new Array<number[]>(3); matrix[0] = [1]; matrix[2] = [3]
    expect(compare('int32[][]', matrix, [[1], [2], [3]])).toBe('INVALID_ACTUAL')
    const actual = Object.assign([1], { toJSON() { throw Error('no serialization') } })
    expect(compare('int32[]', actual, [1])).toBe('PASS')
  })
  it.each([null, {}, { id: 'other', version: 1 }, { id: 'exact-typed', version: 2 },
    { id: 'exact-typed', version: '1' }, { ...identity, extra: true }, Object.create(identity)])('rejects invalid comparator configuration %#', config => {
    expect(compareExactTyped('int32', 1, 1, config)).toBe('INVALID_CONFIGURATION')
  })
  it.each(['number', 'float64', 'object', '', null, undefined])('rejects unsupported type %s', type => {
    expect(compare(type, 1, 1)).toBe('INVALID_CONFIGURATION')
  })
  it('validates configuration and Expected before touching Actual', () => {
    let reads = 0
    const actual = Object.defineProperty([], 0, { get() { reads++; throw Error('must not read') } })
    expect(compareExactTyped('int32[]', actual, null, null)).toBe('INVALID_CONFIGURATION')
    expect(compare('int32[]', actual, null)).toBe('INVALID_EXPECTED')
    expect(reads).toBe(0)
  })
  it('rejects accessors without invoking them or conversion hooks', () => {
    let calls = 0
    const a = Object.defineProperty([], 0, { get() { calls++; return 1 } })
    expect(compare('int32[]', a, [1])).toBe('INVALID_ACTUAL')
    const config = { get id() { calls++; return 'exact-typed' }, version: 1 }
    expect(compareExactTyped('int32', 1, 1, config)).toBe('INVALID_CONFIGURATION')
    expect(compare('int32', { valueOf() { calls++; return 1 }, toJSON() { calls++; return 1 } }, 1)).toBe('INVALID_ACTUAL')
    expect(calls).toBe(0)
  })
  it('does not mutate frozen inputs or sort output', () => {
    const actual = Object.freeze([Object.freeze([3, -0]), Object.freeze([1, 2])])
    const expected = Object.freeze([Object.freeze([1, 2]), Object.freeze([3, 0])])
    expect(compare('int32[][]', actual, expected)).toBe('DIFFERENT')
    expect(actual).toEqual([[3, -0], [1, 2]])
    expect(Object.is(actual[0][1], -0)).toBe(true)
    expect(compare('int32[][]', actual, actual)).toBe('PASS')
  })

  const beyondL6: [ExerciseType, () => unknown, unknown][] = [
    ['string', () => 'x'.repeat(P.stringUnits + 1), ''],
    ['int32[]', () => Array(P.integerElements + 1).fill(0), []],
    ['string[]', () => Array(P.stringElements + 1).fill(''), []],
    ['string[]', () => ['x'.repeat(P.stringUnits), 'x'.repeat(P.stringUnits), 'x'], []],
    ['string[]', () => ['x'.repeat(P.stringUnits + 1)], []],
    ['int32[][]', () => Array.from({ length: P.matrixRows + 1 }, () => []), []],
    ['int32[][]', () => [Array(P.matrixColumns + 1).fill(0)], []],
    ['int32[][]', () => Array.from({ length: 257 }, () => Array(256).fill(0)), []],
    ['int32[]', () => Array(30_000).fill(2147483647), []],
  ]
  it.each(beyondL6)('keeps runtime-valid %s Actual beyond L6 comparable %#', (type, make, expected) => {
    const actual = make()
    expect(compare(type, actual, expected)).toBe('DIFFERENT')
    expect(compare(type, expected, actual)).toBe('INVALID_EXPECTED')
  })
  it('enforces Expected canonical byte budget including escapes and multibyte Unicode', () => {
    const escaped = Array(9).fill('\u0000'.repeat(5000))
    const unicode = Array(3).fill('漢'.repeat(30_000))
    expect(compare('string[]', escaped, [])).toBe('DIFFERENT')
    expect(compare('string[]', [], escaped)).toBe('INVALID_EXPECTED')
    expect(compare('string[]', unicode, [])).toBe('DIFFERENT')
    expect(compare('string[]', [], unicode)).toBe('INVALID_EXPECTED')
  })
  it('accepts exactly the L6 encoded byte cap and rejects the next byte only on Expected', () => {
    // 2 brackets + comma + 4 quotes + 43689 six-byte escapes + 3 ASCII = 262144.
    const exact = ['\u0000'.repeat(32768), '\u0000'.repeat(10921) + 'abc']
    expect(compare('string[]', exact, exact)).toBe('PASS')
    const over = [exact[0], exact[1] + 'd']
    expect(compare('string[]', over, exact)).toBe('DIFFERENT')
    expect(compare('string[]', exact, over)).toBe('INVALID_EXPECTED')
  })
  it('bounds invalid direct-call Actual without applying authoring caps', () => {
    expect(compare('string', 'x'.repeat(1024 * 1024), '')).toBe('INVALID_ACTUAL')
    expect(compare('int32[]', new Array(1024 * 1024 + 1), [])).toBe('INVALID_ACTUAL')
  })
})

describe('Main-private contracts (type assertions checked by scoped tsc)', () => {
  it('keeps comparator errors separate from trusted harness outcomes and verdicts', () => {
    expectTypeOf<ComparatorResult>().toEqualTypeOf<'PASS' | 'DIFFERENT' | 'INVALID_ACTUAL' | 'INVALID_EXPECTED' | 'INVALID_CONFIGURATION'>()
    expectTypeOf<Extract<JudgeVerdict, 'INVALID_ACTUAL' | 'INVALID_RESULT'>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<JudgeCaseDecision, { kind: 'COMPARED' }>['result']>().toEqualTypeOf<'PASS' | 'DIFFERENT'>()
  })
  it('excludes hidden payloads, diagnostics, owner objects and storage outcomes from scalar results', () => {
    type PrivatePayload = 'actual' | 'expected' | 'args' | 'stdout' | 'stderr' | 'diagnostics' | 'saved' | 'code' | 'caseId'
    expectTypeOf<Extract<keyof JudgeResult, PrivatePayload>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<keyof JudgeCaseDecision, PrivatePayload>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<keyof JudgeResult['identity'], 'ownerEntry'>>().toEqualTypeOf<never>()
  })
  it('prevents Accepted/pending/infrastructure from carrying conflicting eligibility', () => {
    expectTypeOf<Extract<JudgeResult, { state: 'PENDING' }>['verdict']>().toEqualTypeOf<null>()
    expectTypeOf<Extract<JudgeResult, { verdict: 'Accepted' }>['eligibility']['kind']>().toEqualTypeOf<'ACCEPTED_CANDIDATE'>()
    expectTypeOf<Extract<JudgeResult, { verdict: 'InfrastructureFailure' | 'CancelledInvalidated' }>['eligibility']['kind']>().toEqualTypeOf<'INELIGIBLE'>()
    expectTypeOf<Extract<JudgeEligibility, { acceptedCandidateEligible: true; gradedFailureCandidateEligible: true }>>().toEqualTypeOf<never>()
  })
})
