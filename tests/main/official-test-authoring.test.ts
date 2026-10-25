import { describe, expect, it, vi } from 'vitest'
import { author, obligations } from '../../scripts/learning-official-tests/author'
import { domain } from '../../scripts/learning-official-tests/domains'
import { oracle } from '../../scripts/learning-official-tests/oracles'
import { IDS, parse, random, type Args, type Id } from '../../scripts/learning-official-tests/model'
import { verifyRows, type VerificationPorts } from '../../scripts/learning-official-tests/verify'

describe('E2-S2 deterministic bounded authoring', () => {
  it.each(IDS)('%s replays identical ordering, keys and content and maps every S1 obligation', async id => {
    const first = await author(id, { seed: 20261024 })
    expect(await author(id, { seed: 20261024 })).toEqual(first)
    expect(await author(id, { seed: 7 })).not.toEqual(first)
    expect(new Set(first.flatMap(r => r.obligations))).toEqual(new Set(obligations[id]))
    for (const row of first) expect(() => domain(id, row.args)).not.toThrow()
  })
  it('rejects traversal, unknown fields, unbounded count and seeds', async () => {
    await expect(author('../ch2-04', { seed: 1 })).rejects.toThrow('UNKNOWN_ID')
    await expect(author('ch2-04', { seed: -1 })).rejects.toThrow('SEED')
    await expect(author('ch2-04', { seed: 1, randomCount: 25 })).rejects.toThrow('COUNT')
    await expect(author('ch2-04', { seed: 1, randomCount: null } as never)).rejects.toThrow('COUNT')
    await expect(author('ch2-04', { seed: 1, extra: true } as never)).rejects.toThrow('OPTIONS')
  })
  it('retains distinct mandatory public IDs even when their args coincide', async () => {
    const rows = await author('ch2-04', { seed: 1, randomCount: 0 }, [
      { id: 'sample-1', args: [29, 6] }, { id: 'sample-2', args: [29, 6] },
    ])
    expect(rows.slice(0, 2).map(r => [r.key, r.source])).toEqual([['public:sample-1', 'public'], ['public:sample-2', 'public']])
    expect(rows[0].obligations).toContain('D4')
  })
  it('cancels between bounded recipes, no continuation after rejection', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(author('ch8-08', { seed: 1, signal: controller.signal })).rejects.toThrow('CANCELLED')
  })
  it('separates streams by ID and unsigned boundary seed, retaining versioned behavior', () => {
    expect(new Set(IDS.map(id => random(0xffffffff, id)())).size).toBe(9)
    const a = random(0, 'ch2-04'), b = random(0, 'ch2-04')
    expect(Array.from({ length: 100 }, a)).toEqual(Array.from({ length: 100 }, b))
  })
})

const invalid: [Id, Args][] = [
  ['ch2-04', [0, 0]], ['ch2-04', [-1, 1]], ['ch2-04', [1e6 + 1, 1]], ['ch3-04', [0]], ['ch3-04', [10000]],
  ['ch4-09', [46]], ['ch4-09', [1.5]], ['ch5-03', [[]]], ['ch5-03', [['A']]], ['ch5-03', [['a'.repeat(101)]]],
  ['ch5-07', ['aba', 'ab']], ['ch5-07', ['', 'a']], ['ch5-07', ['a', 'A']], ['ch5-07', ['a', 'a'.repeat(1001)]],
  ['ch7-01', [[1, 1, 2], 3]], ['ch7-01', [[5, 1], 10]], ['ch7-01', [[0, 0, 0], 0]],
  ['ch7-05', [[3, 1]]], ['ch7-05', [[1]]], ['ch7-05', [Array(21).fill(1)]],
  ['ch8-01', [[[1], [2, 3]], 1, 3]], ['ch8-01', [[[1]], 0, 1]], ['ch8-01', [[[1001]], 1, 1]],
  ['ch8-08', [[]]], ['ch8-08', [[[10001]]]], ['ch8-08', [Array.from({ length: 51 }, () => [0])]],
]
describe('E2-S1 domain obligations before Expected creation', () => {
  it.each(invalid)('rejects invalid %s %j', (id, args) => expect(() => domain(id, args)).toThrow())
  it('accepts M1 text uniqueness, absent window, TwoSum index uniqueness and reshape mismatch', () => {
    for (const a of [['aa', 'a'], ['a', 'aa'], ['abxxab', 'ab']]) expect(() => domain('ch5-07', a)).not.toThrow()
    expect(() => domain('ch7-01', [[5, 5], 10])).not.toThrow()
    expect(() => domain('ch8-01', [[[1, 2]], 400, 400])).not.toThrow()
    expect(() => domain('ch7-05', [Array(20).fill(-2)])).not.toThrow()
  })
  it.each([
    ['ch2-04', [29, 6], [4, 5]], ['ch3-04', [1900], false], ['ch3-04', [2000], true],
    ['ch4-09', [45], 1134903170], ['ch5-03', [['abcd', 'ab']], 'ab'], ['ch5-07', ['aa', 'a'], 'a'],
    ['ch7-01', [[5, 5], 10], [0, 1]], ['ch7-05', [[2, 0, 2]], [0, 4, 0]],
    ['ch8-01', [[[1, 2]], 400, 400], [[1, 2]]], ['ch8-08', [[[1, 2], [4, 3]]], 4],
  ] as [Id, Args, unknown][])('independent hand anchor %s', (id, args, expected) => expect(oracle(id, args)).toEqual(expected))
  it('calendar oracle has exactly 97 leap years per 400-year cycle', () => {
    expect(Array.from({ length: 400 }, (_, i) => oracle('ch3-04', [i + 1])).filter(Boolean)).toHaveLength(97)
  })
  it('uses shared duplicate/Unicode/numeric/UTF8 scanner, not a second parser', () => {
    for (const s of ['{"x":1,"x":2}', '"\\ud800"', '[NaN]', '[01]']) expect(() => parse(Buffer.from(s))).toThrow()
    expect(() => parse(Buffer.from([0xff]))).toThrow()
  })
})

describe('fail-closed pipeline and mutation evidence', () => {
  const row = { key: 'curated:0', args: [29, 6], source: 'curated' as const, obligations: ['D4'] }
  const ports = (): VerificationPorts => ({ reference: async () => [[4, 5]], oracle: a => oracle('ch2-04', a) })
  it('rejects a bad generator result before calling either reference', async () => {
    const p = ports(); p.reference = vi.fn(p.reference)
    await expect(verifyRows('ch2-04', [{ ...row, args: [1, 0] }], p)).rejects.toThrow('DOMAIN')
    expect(p.reference).not.toHaveBeenCalled()
  })
  it('quarantines reference disagreement without majority voting', async () => {
    const p = ports(); p.reference = async language => language === 'csharp' ? [[4, 9]] : [[4, 5]]
    await expect(verifyRows('ch2-04', [row], p)).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
  })
  it('quarantines wrong oracle and Expected claims', async () => {
    await expect(verifyRows('ch2-04', [row], { ...ports(), oracle: () => [4, 9] })).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
    await expect(verifyRows('ch2-04', [row], ports(), { expectedClaims: [[4, 9]] })).rejects.toThrow('EXPECTED_DISAGREEMENT')
  })
  it.each([[[2147483648, 0]], ['wrong'], [], [[4, 5], [4, 5]]].map(value => ({ value })))('quarantines overflow/type/count $value', async ({ value }) => {
    const p = ports(); p.reference = async () => value
    await expect(verifyRows('ch2-04', [row], p)).rejects.toThrow()
  })
  it('checks deadline and cancellation before accepting work', async () => {
    await expect(verifyRows('ch2-04', [row], ports(), { due: 0 })).rejects.toThrow('TOOL_TIMEOUT')
    await expect(verifyRows('ch2-04', [row], ports(), { signal: AbortSignal.abort() })).rejects.toThrow('CANCELLED')
  })
  it('does not call invalid/crashing mutants killed or hide surviving mutants', async () => {
    const result = await verifyRows('ch2-04', [row], ports(), { mutants: [
      { name: 'equivalence-unreviewed', obligations: ['D4'], kind: 'value', run: (_, e) => e },
      { name: 'crash', obligations: ['D4'], kind: 'value', run: () => { throw new Error('bad mutant') } },
    ] })
    expect(result.mutation.map(m => m.status)).toEqual(['SURVIVED_REVIEW_REQUIRED', 'INVALID_REVIEW_REQUIRED'])
  })
  it('gives deterministic kill keys and preserves pending critical performance evidence', async () => {
    const rows = await author('ch4-09', { seed: 1, randomCount: 0 })
    const p: VerificationPorts = { reference: async (_, a) => a.map(args => oracle('ch4-09', args)), oracle: a => oracle('ch4-09', a) }
    const a = await verifyRows('ch4-09', rows, p), b = await verifyRows('ch4-09', rows, p)
    expect(a).toEqual(b)
    expect(a.mutation.find(m => m.name === 'uncached-recursion')?.status).toBe('PENDING_RUNTIME')
    expect(a.mutation.filter(m => m.status !== 'PENDING_RUNTIME').length).toBeGreaterThan(0)
  })
})
