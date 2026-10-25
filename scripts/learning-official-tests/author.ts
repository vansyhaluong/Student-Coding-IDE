import { setImmediate as tick } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import { check, demand, encode, id, LIMITS, random, TOOL_VERSION, type Args, type Id } from './model'
import { domain } from './domains'

export interface Candidate { key: string; args: Args; obligations: string[]; source: 'public' | 'curated' | 'seeded' }
type Recipe = [Args, string[]]
const row = (args: Args, ...obligations: string[]): Recipe => [args, obligations]
export const obligations: Record<Id, string[]> = Object.fromEntries(
  (['D:5', 'L:5', 'F:4', 'C:5', 'W:7', 'T:5', 'P:5', 'R:6', 'G:7']).map((v, i) => {
    const [prefix, n] = v.split(':'); const ids = ['ch2-04', 'ch3-04', 'ch4-09', 'ch5-03', 'ch5-07', 'ch7-01', 'ch7-05', 'ch8-01', 'ch8-08']
    return [ids[i], Array.from({ length: Number(n) }, (_, j) => prefix + (j + 1))]
  })) as Record<Id, string[]>
function curated(exercise: Id): Recipe[] {
  switch (exercise) {
    case 'ch2-04': return [row([0, 1], 'D1'), row([1, 1], 'D1', 'D2'), row([3, 8], 'D2'), row([12, 3], 'D3'), row([29, 6], 'D3', 'D4'), row([1e6, 1000], 'D5'), row([1e6, 1], 'D5')]
    case 'ch3-04': return [row([1], 'L1', 'L5'), row([9999], 'L1', 'L5'), row([2024], 'L2'), row([1900], 'L3'), row([2000], 'L4'), row([1999], 'L5'), row([2001], 'L5'), row([100], 'L3'), row([400], 'L4')]
    case 'ch4-09': return [row([0], 'F1'), row([1], 'F1'), row([2], 'F1'), row([9], 'F2'), row([10], 'F2'), row([45], 'F3', 'F4')]
    case 'ch5-03': return [row([['abc']], 'C1'), row([['', 'a']], 'C1'), row([['', '']], 'C1'), row([['a', 'b']], 'C2'), row([['abcd', 'ab']], 'C3'), row([['abc', 'abd', 'ax']], 'C4'), row([['ax', 'abd', 'abc']], 'C4'), row([Array(100).fill('a'.repeat(100))], 'C5')]
    case 'ch5-07': return [row(['a', 'aa'], 'W1', 'W2'), row(['abc', 'z'], 'W1'), row(['aab', 'aa'], 'W2'), row(['baaac', 'aac'], 'W3'), row(['abccc', 'ab'], 'W4'), row(['cccab', 'ab'], 'W4'), row(['cabc', 'ab'], 'W4'), row(['ab', 'ab'], 'W4'), row(['a', 'a'], 'W4'), row(['aaxxxbcaab', 'aab'], 'W3', 'W5'), row(['a'.repeat(1000), 'a'.repeat(1000)], 'W6'), row(['aa', 'a'], 'W7')]
    case 'ch7-01': return [row([[5, 5], 10], 'T1'), row([[-5, 0, 5], 0], 'T2'), row([[10000, -10000], 0], 'T2'), row([[4, 1, 8, 3], 11], 'T3', 'T4'), row([[8, 2, 6, 1], 9], 'T3', 'T4'), row([[...Array(998).fill(10000), 0, 0], 0], 'T5')]
    case 'ch7-05': return [row([[2, 1]], 'P1'), row([[-2, -1, 1]], 'P2'), row([[-2, 1, 2]], 'P2'), row([[0, 2, 1]], 'P3'), row([[2, 0, 2]], 'P3'), row([[1, 2, 0]], 'P3'), row([[0, 2, 0]], 'P4'), row([[0, 0]], 'P4'), row([Array(20).fill(-2)], 'P5'), row([[1, -1]], 'P5')]
    case 'ch8-01': return [row([[[1, 2, 3], [4, 5, 6]], 3, 2], 'R1'), row([[[1, 2]], 2, 1], 'R2'), row([[[1]], 1, 1], 'R2'), row([[[1, 2]], 1, 1], 'R3'), row([[[1, 2]], 2, 2], 'R3'), row([[[1, 2]], 400, 400], 'R4'), row([Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, c) => r * 20 + c)), 1, 400], 'R5'), row([Array.from({ length: 20 }, () => Array(20).fill(1)), 400, 1], 'R5'), row([[[-1, 0], [0, -1]], 1, 4], 'R6')]
    case 'ch8-08': return [row([[[1]]], 'G1'), row([[[5, 5]]], 'G1'), row([[[4, 3], [1, 2]]], 'G2', 'G3'), row([[[1, 9], [9, 2]]], 'G4'), row([[[1, 2, 3]]], 'G4'), row([[[1], [2], [3]]], 'G4'), row([[[1, 2, 1], [2, 3, 4]]], 'G5'), row([[[-10000, 0, 10000]]], 'G6'), row([Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => r * 50 + (r % 2 ? 49 - c : c)))], 'G7')]
  }
}
function seeded(exercise: Id, next: () => number): Args {
  const n = (lo: number, hi: number) => lo + next() % (hi - lo + 1)
  const str = () => Array.from({ length: n(1, 8) }, () => String.fromCharCode(97 + n(0, 2))).join('')
  switch (exercise) {
    case 'ch2-04': return [n(0, 1e6), n(1, 1000)]
    case 'ch3-04': return [n(1, 9999)]
    case 'ch4-09': return [n(0, 45)]
    case 'ch5-03': return [Array.from({ length: n(1, 6) }, str)]
    case 'ch5-07': return [str(), str()]
    case 'ch7-01': return [Array.from({ length: n(2, 8) }, () => n(-10, 10)), n(-10, 10)]
    case 'ch7-05': return [Array.from({ length: n(2, 20) }, () => n(-2, 2))]
    case 'ch8-01': { const m = Array.from({ length: n(1, 4) }, () => Array.from({ length: 3 }, () => n(-10, 10))); return [m, n(1, 6), n(1, 6)] }
    case 'ch8-08': return [Array.from({ length: n(1, 5) }, () => Array.from({ length: 4 }, () => n(-10, 10)))]
  }
}
export async function author(exerciseValue: string, options: { seed: number; randomCount?: number; signal?: AbortSignal }, samples: { id: string; args: Args }[] = []): Promise<Candidate[]> {
  const exercise = id(exerciseValue), count = options.randomCount === undefined ? 8 : options.randomCount
  demand(Object.keys(options).every(k => ['seed', 'randomCount', 'signal'].includes(k)), 'OPTIONS')
  demand(Number.isInteger(count) && count >= 0 && count <= 24 && samples.length <= 16, 'COUNT')
  const next = random(options.seed, exercise), due = performance.now() + LIMITS.generationMs
  const result: Candidate[] = [], seen = new Map<string, Candidate>()
  function add(args: Args, tags: string[], source: Candidate['source'], key: string): boolean {
    domain(exercise, args); const k = encode(args).toString('utf8'), old = seen.get(k)
    if (old && source !== 'public') { old.obligations = [...new Set([...old.obligations, ...tags])].sort(); return false }
    const c = { key, args: structuredClone(args), obligations: [...tags].sort(), source }
    if (!old) seen.set(k, c)
    result.push(c) // Distinct mandatory public sample IDs survive even with identical args.
    demand(result.length <= LIMITS.rows && encode(result).length <= LIMITS.bytes, 'CAMPAIGN_LIMIT'); return true
  }
  for (const s of samples) { check(options.signal, due); add(s.args, [], 'public', 'public:' + s.id) }
  for (const [i, [args, tags]] of curated(exercise).entries()) { await tick(); check(options.signal, due); add(args, tags, 'curated', 'curated:' + i) }
  let accepted = 0
  for (let attempt = 0; accepted < count && attempt < LIMITS.attempts; attempt++) {
    await tick(); check(options.signal, due); const args = seeded(exercise, next)
    try { domain(exercise, args) } catch { continue } // Only rejected generated domain proposals; never oracle disagreement.
    if (add(args, [], 'seeded', `xorshift32-v1:${options.seed}:${attempt}`)) accepted++
  }
  demand(accepted === count, 'ATTEMPTS_EXHAUSTED')
  return result
}
export const authorVersion = TOOL_VERSION + '/xorshift32-v1'
