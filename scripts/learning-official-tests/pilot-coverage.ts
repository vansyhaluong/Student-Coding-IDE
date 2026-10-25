// E2-S3 only: refine accepted S1 groups into independently retained input facets.
// This is developer evidence, never part of the exact Judge schema.
import { type Candidate, obligations } from './author'
import { type Args, type Id } from './model'

export const facets: Record<Id, string[]> = {
  'ch2-04': ['zero', 'positive-b1', 'below', 'equal', 'interior-exact', 'remainder', 'max-quotient', 'max-b'],
  'ch3-04': ['year1', 'year9999', 'ordinary-leap', 'odd-common', 'even-common', 'century-common', 'century-leap', 'before-century', 'after-century', 'early-leap'],
  'ch4-09': ['n0', 'n1', 'n2', 'interior-odd', 'interior-even', 'n45'],
  'ch5-03': ['singleton', 'some-empty', 'all-empty', 'disjoint', 'shortest-prefix', 'last-word-mismatch', 'permuted', 'max-words-length'],
  'ch5-07': ['longer-t', 'missing-letter', 'multiplicity', 'surplus-shrink', 'left-only', 'right-only', 'interior', 'equal', 'single', 'global-min', 'max-lengths', 'same-text-positions'],
  'ch7-01': ['duplicate-solution', 'negative', 'extremes', 'nonadjacent', 'last-index', 'reverse-value-order', 'zero-solution', 'max-n'],
  'ch7-05': ['n2-unequal', 'positive', 'negative-odd', 'negative-even', 'zero-first', 'zero-middle', 'zero-last', 'two-zeros', 'all-zero', 'max-n', 'unit-signs'],
  'ch8-01': ['nonsquare-success', 'identity', 'row-to-column', 'column-to-row', 'singleton', 'mismatch-small', 'mismatch-large', '400x400-mismatch', '1x400', '400x1', 'signed-zero-repeat', 'cell-extremes'],
  'ch8-08': ['singleton', 'plateau', 'away-origin', 'needs-up', 'needs-down', 'needs-left', 'needs-right', 'diagonal-trap', 'row', 'column', 'branch', 'greedy-trap', 'wrap-trap', 'extremes', 'max-serpentine'],
}
// Coarse S1 groups are re-derived from input facts, not inherited labels. This
// lets a mandatory public case satisfy a group without retaining a redundant
// curated duplicate merely because the original group tag was absent.
const groupForFacet: Record<Id, string[]> = {
  'ch2-04': ['D1', 'D1', 'D2', 'D2', 'D3', 'D3', 'D5', 'D5'],
  'ch3-04': ['L5', 'L5', 'L2', 'L1', 'L1', 'L3', 'L4', 'L5', 'L5', 'L2,L5'],
  'ch4-09': ['F1', 'F1', 'F1', 'F2', 'F2', 'F3,F4'],
  'ch5-03': ['C1', 'C1', 'C1', 'C2', 'C3', 'C4', 'C4', 'C5'],
  'ch5-07': ['W1', 'W1', 'W2', 'W3', 'W4', 'W4', 'W4', 'W4', 'W4', 'W5', 'W6', 'W7'],
  'ch7-01': ['T1', 'T2', 'T2', 'T3', 'T3', 'T4', 'T2', 'T5'],
  'ch7-05': ['P1', 'P2', 'P2', 'P2', 'P3', 'P3', 'P3', 'P4', 'P4', 'P5', 'P5'],
  'ch8-01': ['R1', 'R2', 'R2', 'R2', 'R2', 'R3', 'R3', 'R4', 'R5', 'R5', 'R6', 'R6'],
  'ch8-08': ['G1', 'G1', 'G2', 'G3', 'G3', 'G3', 'G3', 'G4', 'G4', 'G4', 'G5', 'G5', 'G4', 'G6', 'G7'],
}
export function supplements(exercise: Id): Candidate[] {
  const values: Partial<Record<Id, [Args, string[]][]>> = {
    'ch3-04': [[[2], ['L1']], [[4], ['L2', 'L5']]],
    'ch8-01': [[[[[1, 2], [3, 4]], 2, 2], ['R2']], [[[[1], [2]], 1, 2], ['R2']], [[[[-1000, 0], [0, 1000]], 1, 4], ['R6']]],
    'ch8-08': [[[[[1, 3, 2]]], ['G4']], [[[[1, 100, 101], [2, 3, 4]]], ['G5']]],
  }
  return (values[exercise] ?? []).map(([args, groups], i) => ({ key: 's3:' + i, args, source: 'curated', obligations: groups }))
}
export function pathVariant(m: number[][], directions: number[][], origin = false, wrap = false, greedy = false): number {
  const R = m.length, C = m[0].length, dp = m.map(row => row.map(() => 1))
  const sorted = m.flatMap((row, r) => row.map((v, c) => ({ r, c, v }))).sort((a, b) => b.v - a.v)
  for (const { r, c, v } of sorted) {
    const next = directions.map(([dr, dc]) => [wrap ? (r + dr + R) % R : r + dr, wrap ? (c + dc + C) % C : c + dc])
      .filter(([i, j]) => i >= 0 && j >= 0 && i < R && j < C && m[i][j] > v)
    const choices = greedy ? next.sort(([i, j], [k, l]) => m[k][l] - m[i][j]).slice(0, 1) : next
    dp[r][c] = Math.max(1, ...choices.map(([i, j]) => 1 + dp[i][j]))
  }
  return origin ? dp[0][0] : Math.max(...dp.flat())
}
export const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
export function coverage(exercise: Id, row: Candidate, expected: unknown): string[] {
  const found: string[] = [], [a, b, c] = row.args
  const add = (key: string, yes: unknown) => { if (yes) found.push('facet:' + key) }
  switch (exercise) {
    case 'ch2-04': {
      const A = a as number, B = b as number
      add('zero', A === 0); add('positive-b1', A > 0 && B === 1); add('below', A < B); add('equal', A === B)
      add('interior-exact', A > B && A < 1e6 && B > 1 && A % B === 0); add('remainder', A > B && A % B !== 0)
      add('max-quotient', A === 1e6 && B === 1); add('max-b', B === 1000); break
    }
    case 'ch3-04': {
      const y = a as number
      add('year1', y === 1); add('year9999', y === 9999); add('ordinary-leap', y % 4 === 0 && y % 100 !== 0)
      add('odd-common', y % 2 === 1 && expected === false); add('even-common', y % 2 === 0 && y % 4 !== 0)
      add('century-common', y % 100 === 0 && expected === false); add('century-leap', y % 400 === 0)
      add('before-century', y === 1999); add('after-century', y === 2001); add('early-leap', y < 100 && expected === true); break
    }
    case 'ch4-09': {
      const n = a as number
      for (const k of [0, 1, 2, 45]) add('n' + k, n === k)
      add('interior-odd', n > 2 && n < 45 && n % 2 === 1); add('interior-even', n > 2 && n < 45 && n % 2 === 0); break
    }
    case 'ch5-03': {
      const w = a as string[], result = expected as string
      add('singleton', w.length === 1 && w[0].length > 0); add('some-empty', w.some(x => x === '') && w.some(Boolean))
      add('all-empty', w.every(x => !x)); add('disjoint', w.every(Boolean) && !result)
      add('shortest-prefix', result.length > 0 && w.includes(result) && w.some(x => x.length > result.length))
      add('last-word-mismatch', JSON.stringify(w) === '["abc","abd","ax"]'); add('permuted', JSON.stringify(w) === '["ax","abd","abc"]')
      add('max-words-length', w.length === 100 && w.every(x => x.length === 100)); break
    }
    case 'ch5-07': {
      const s = a as string, t = b as string, e = expected as string, positions: number[] = []
      if (e) for (let i = 0; i + e.length <= s.length; i++) if (s.slice(i, i + e.length) === e) positions.push(i)
      add('longer-t', t.length > s.length); add('missing-letter', t.length <= s.length && [...t].some(x => !s.includes(x)))
      add('multiplicity', new Set(t).size > 1 && new Set(t).size < t.length && e.length > 0)
      add('surplus-shrink', e && [...new Set(t)].some(x => t.split(x).length > 2 && s.split(x).length > t.split(x).length) && positions[0] > 0)
      add('left-only', positions.length === 1 && positions[0] === 0 && e.length < s.length)
      add('right-only', positions.length === 1 && positions[0] > 0 && positions[0] + e.length === s.length)
      add('interior', positions.length === 1 && positions[0] > 0 && positions[0] + e.length < s.length)
      add('equal', s === t); add('single', s.length === 1 && t.length === 1)
      let first = 0
      for (let r = 1; r <= s.length; r++) if ([...new Set(t)].every(x => s.slice(0, r).split(x).length >= t.split(x).length)) { first = r; break }
      add('global-min', e && first > e.length); add('max-lengths', s.length === 1000 && t.length === 1000)
      add('same-text-positions', positions.length > 1); break
    }
    case 'ch7-01': {
      const nums = a as number[], [i, j] = expected as number[]
      add('duplicate-solution', nums[i] === nums[j]); add('negative', nums[i] < 0 || nums[j] < 0)
      add('extremes', nums.includes(-10000) && nums.includes(10000)); add('nonadjacent', j - i > 1)
      add('last-index', j === nums.length - 1); add('reverse-value-order', nums[i] > nums[j])
      add('zero-solution', nums[i] === 0 || nums[j] === 0); add('max-n', nums.length === 1000); break
    }
    case 'ch7-05': {
      const nums = a as number[], z = nums.filter(x => x === 0).length, neg = nums.filter(x => x < 0).length
      add('n2-unequal', nums.length === 2 && nums[0] !== nums[1]); add('positive', nums.every(x => x > 0))
      add('negative-odd', !z && neg % 2 === 1); add('negative-even', !z && neg > 0 && neg % 2 === 0)
      add('zero-first', z === 1 && nums[0] === 0); add('zero-last', z === 1 && nums.at(-1) === 0)
      add('zero-middle', z === 1 && nums.slice(1, -1).includes(0)); add('two-zeros', z === 2 && z < nums.length)
      add('all-zero', z === nums.length); add('max-n', nums.length === 20 && nums.every(x => Math.abs(x) === 2))
      add('unit-signs', nums.includes(-1) && nums.includes(1)); break
    }
    case 'ch8-01': {
      const m = a as number[][], rows = b as number, cols = c as number, flat = m.flat(), n = flat.length, success = rows * cols === n
      add('nonsquare-success', success && m.length > 1 && m[0].length > 1 && rows > 1 && cols > 1 && m.length !== m[0].length && rows !== cols && new Set(flat).size === n)
      add('identity', m.length > 1 && m[0].length > 1 && rows === m.length && cols === m[0].length)
      add('row-to-column', success && m.length === 1 && rows > 1 && cols === 1)
      add('column-to-row', success && m[0].length === 1 && cols > 1 && rows === 1)
      add('singleton', n === 1); add('mismatch-small', rows * cols < n); add('mismatch-large', rows * cols > n)
      add('400x400-mismatch', rows === 400 && cols === 400 && !success)
      add('1x400', n === 400 && rows === 1 && cols === 400); add('400x1', n === 400 && rows === 400 && cols === 1)
      add('signed-zero-repeat', flat.some(x => x < 0) && flat.includes(0) && new Set(flat).size < flat.length)
      add('cell-extremes', flat.includes(-1000) && flat.includes(1000)); break
    }
    case 'ch8-08': {
      const m = a as number[][], flat = m.flat(), result = expected as number
      add('singleton', flat.length === 1); add('plateau', flat.length > 1 && new Set(flat).size === 1)
      add('away-origin', pathVariant(m, directions, true) < result)
      for (const [i, name] of ['up', 'down', 'left', 'right'].entries()) add('needs-' + name, pathVariant(m, directions.filter((_, j) => i !== j)) < result)
      add('diagonal-trap', pathVariant(m, [...directions, [1, 1], [1, -1], [-1, 1], [-1, -1]]) > result)
      add('row', m.length === 1 && m[0].length > 1); add('column', m.length > 1 && m[0].length === 1)
      add('branch', JSON.stringify(m) === '[[1,2,1],[2,3,4]]'); add('greedy-trap', pathVariant(m, directions, false, false, true) < result)
      add('wrap-trap', pathVariant(m, directions, false, true) > result); add('extremes', flat.includes(-10000) && flat.includes(10000))
      add('max-serpentine', m.length === 50 && m[0].length === 50 && result === 2500); break
    }
  }
  facets[exercise].forEach((facet, i) => {
    if (found.includes('facet:' + facet)) for (const group of groupForFacet[exercise][i].split(',')) found.push('group:' + group)
  })
  if (exercise === 'ch2-04' && a !== b && (expected as number[])[0] !== (expected as number[])[1]) found.push('group:D4')
  return [...new Set(found)].sort()
}
export function requiredCoverage(exercise: Id): string[] {
  return [...obligations[exercise].map(x => 'group:' + x), ...facets[exercise].map(x => 'facet:' + x)]
}
