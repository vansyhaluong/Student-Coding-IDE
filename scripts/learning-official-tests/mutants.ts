import { minimumTexts } from './domains'
import { demand, type Args, type Id } from './model'

export interface Mutant { name: string; obligations: string[]; kind: 'value' | 'domain' | 'performance'; run: (args: Args, expected: unknown) => unknown }
const mutant = (name: string, obligations: string[], run: Mutant['run'], kind: Mutant['kind'] = 'value'): Mutant => ({ name, obligations, kind, run })
function uncachedFib(args: Args): number {
  let calls = 0
  const fib = (n: number): number => { demand(++calls <= 100000, 'MUTANT_STEP_LIMIT'); return n < 2 ? n : fib(n - 1) + fib(n - 2) }
  return fib(args[0] as number)
}
function uncachedPath(args: Args): number {
  const m = args[0] as number[][], R = m.length, C = m[0].length; let calls = 0
  const dfs = (r: number, c: number): number => {
    demand(++calls <= 100000, 'MUTANT_STEP_LIMIT'); let best = 1
    for (const [i, j] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) if (i >= 0 && j >= 0 && i < R && j < C && m[i][j] > m[r][c]) best = Math.max(best, 1 + dfs(i, j))
    return best
  }
  return Math.max(...m.flatMap((row, r) => row.map((_, c) => dfs(r, c))))
}
function graph(args: Args, directions: number[][], origin = false): number {
  const m = args[0] as number[][], R = m.length, C = m[0].length, dp = m.map(r => r.map(() => 1))
  const cells = m.flatMap((r, i) => r.map((v, j) => ({ i, j, v }))).sort((a, b) => b.v - a.v)
  for (const { i, j, v } of cells) for (const [dr, dc] of directions) {
    const r = i + dr, c = j + dc
    if (r >= 0 && c >= 0 && r < R && c < C && m[r][c] > v) dp[i][j] = Math.max(dp[i][j], 1 + dp[r][c])
  }
  return origin ? dp[0][0] : Math.max(...dp.flat())
}
export function mutants(exercise: Id): Mutant[] {
  switch (exercise) {
    case 'ch2-04': return [mutant('swapped', ['D4'], (_, e) => [...e as number[]].reverse()), mutant('ceil', ['D2', 'D3'], a => [Math.ceil(Number(a[0]) / Number(a[1])), Number(a[0]) % Number(a[1])]), mutant('no-remainder', ['D3'], (_, e) => [(e as number[])[0], 0]), mutant('zero-is-one', ['D1'], (a, e) => a[0] === 0 ? [1, 0] : e)]
    case 'ch3-04': return [mutant('divisible4', ['L3'], a => Number(a[0]) % 4 === 0), mutant('only400', ['L2'], a => Number(a[0]) % 400 === 0), mutant('reject-centuries', ['L4'], a => Number(a[0]) % 4 === 0 && Number(a[0]) % 100 !== 0), mutant('even', ['L1', 'L5'], a => Number(a[0]) % 2 === 0)]
    case 'ch4-09': return [mutant('wrong-seed', ['F1'], (a, e) => a[0] === 0 ? 1 : e), mutant('off-by-one', ['F2'], (_, e) => Number(e) + 1), mutant('narrow', ['F3'], (_, e) => Number(e) & 65535), mutant('uncached-recursion', ['F4'], uncachedFib, 'performance')]
    case 'ch5-03': return [mutant('first-word', ['C2', 'C3'], a => (a[0] as string[])[0]), mutant('drop-last', ['C5'], (_, e) => (e as string).slice(0, -1)), mutant('first-two-only', ['C4'], a => { const w = (a[0] as string[]).slice(0, 2); let s = w[0]; while (!w.every(v => v.startsWith(s))) s = s.slice(0, -1); return s }), mutant('skip-empty', ['C1'], (a, e) => (a[0] as string[]).some(s => s === '') ? (a[0] as string[]).find(Boolean) ?? 'x' : e)]
    case 'ch5-07': return [mutant('whole-source', ['W1', 'W4'], a => a[0]), mutant('distinct-only', ['W2'], a => { const [s, t] = a as string[]; const need = [...new Set(t)]; for (let n = 1; n <= s.length; n++) for (let l = 0; l + n <= s.length; l++) if (need.every(c => s.slice(l, l + n).includes(c))) return s.slice(l, l + n); return '' }), mutant('drop-last', ['W3', 'W4'], (_, e) => (e as string).slice(0, -1)), mutant('first-cover', ['W5'], a => { const [s, t] = a as string[]; for (let r = 1; r <= s.length; r++) if ([...new Set(t)].every(c => s.slice(0, r).split(c).length >= t.split(c).length)) return s.slice(0, r); return '' }), mutant('unique-position-domain', ['W7'], a => { const [s, t] = a as string[], texts = minimumTexts(s, t); if (!texts.size) return true; const text = [...texts][0]; return texts.size === 1 && s.indexOf(text) === s.lastIndexOf(text) }, 'domain')]
    case 'ch7-01': return [mutant('values', ['T4'], (a, e) => (e as number[]).map(i => (a[0] as number[])[i])), mutant('reversed', ['T4'], (_, e) => [...e as number[]].reverse()), mutant('deduplicate', ['T1'], (a, e) => new Set(a[0] as number[]).size !== (a[0] as number[]).length ? [] : e), mutant('adjacent-only', ['T3'], (a, e) => (e as number[])[1] - (e as number[])[0] === 1 ? e : []), mutant('positive-only', ['T2'], (a, e) => (a[0] as number[]).some(n => n < 0) ? [] : e)]
    case 'ch7-05': return [mutant('include-self', ['P1'], a => (a[0] as number[]).map(() => (a[0] as number[]).reduce((p, v) => p * v, 1))), mutant('absolute', ['P2'], (_, e) => (e as number[]).map(Math.abs)), mutant('any-zero-all-zero', ['P3'], (a, e) => (a[0] as number[]).includes(0) ? (a[0] as number[]).map(() => 0) : e), mutant('two-zero-wrong', ['P4'], (a, e) => (a[0] as number[]).filter(v => v === 0).length > 1 ? (a[0] as number[]).map(() => 1) : e), mutant('narrow', ['P5'], (_, e) => (e as number[]).map(n => n & 65535))]
    case 'ch8-01': return [mutant('mismatch-empty', ['R3', 'R4'], (a, e) => Number(a[1]) * Number(a[2]) !== (a[0] as number[][]).flat().length ? [] : e), mutant('transpose-result', ['R1'], (_, e) => (e as number[][])[0].map((_, c) => (e as number[][]).map(r => r[c]))), mutant('input-side-bound-on-result', ['R5'], (a, e) => Number(a[1]) > 20 || Number(a[2]) > 20 ? [] : e), mutant('sort-values', ['R6'], (_, e) => (e as number[][]).map(r => [...r].sort((a, b) => a - b))), mutant('singleton-empty', ['R2'], (a, e) => (a[0] as number[][]).flat().length === 1 ? [] : e)]
    case 'ch8-08': return [mutant('count-edges', ['G1'], (_, e) => Number(e) - 1), mutant('only-origin', ['G2'], a => graph(a, [[1, 0], [-1, 0], [0, 1], [0, -1]], true)), mutant('right-down', ['G3'], a => graph(a, [[1, 0], [0, 1]])), mutant('diagonal', ['G4'], a => graph(a, [[1, 1], [-1, -1], [1, -1], [-1, 1]])), mutant('all-cells', ['G1', 'G5'], a => (a[0] as number[][]).flat().length), mutant('ignore-negative', ['G6'], (a, e) => (a[0] as number[][]).flat().some(v => v < 0) ? 1 : e), mutant('uncached-dfs', ['G7'], uncachedPath, 'performance')]
  }
}
