import { demand, signatures, typed, type Args, type Id } from './model'

const integer = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && Number(v) >= lo && Number(v) <= hi
const word = (v: unknown, lo: number, hi: number): v is string => typeof v === 'string' && v.length >= lo && v.length <= hi && /^[a-z]*$/.test(v)
function vector(v: unknown, lo: number, hi: number, test: (x: unknown) => boolean): v is unknown[] {
  return Array.isArray(v) && v.length >= lo && v.length <= hi && v.every(test)
}
function matrix(v: unknown, side: number, bound: number): boolean {
  return vector(v, 1, side, r => vector(r, 1, side, x => integer(x, -bound, bound)))
    && (v as unknown[][]).every(r => r.length === (v[0] as unknown[]).length)
}
/** Domain-only interval enumeration, independent of both sliding-window references.
 * M1=A: count distinct minimum TEXTS, never minimum positions. No tie-breaker. */
export function minimumTexts(s: string, t: string): Set<string> {
  const need = Array<number>(26).fill(0)
  for (const c of t) need[c.charCodeAt(0) - 97]++
  let best = Infinity; const texts = new Set<string>()
  for (let l = 0; l < s.length; l++) {
    const got = Array<number>(26).fill(0)
    for (let r = l; r < s.length; r++) {
      got[s.charCodeAt(r) - 97]++
      if (!need.every((n, c) => got[c] >= n)) continue
      const len = r - l + 1
      if (len < best) { best = len; texts.clear() }
      if (len === best) texts.add(s.slice(l, r + 1))
      break
    }
  }
  return texts
}
export function domain(exercise: Id, args: Args): void {
  const sig = signatures[exercise]
  demand(args.length === sig.args.length, 'ARITY')
  args.forEach((a, i) => typed(a, sig.args[i]))
  const [a, b, c] = args
  let valid = false
  switch (exercise) {
    case 'ch2-04': valid = integer(a, 0, 1e6) && integer(b, 1, 1000); break
    case 'ch3-04': valid = integer(a, 1, 9999); break
    case 'ch4-09': valid = integer(a, 0, 45); break
    case 'ch5-03': valid = vector(a, 1, 100, x => word(x, 0, 100)); break
    case 'ch5-07': valid = word(a, 1, 1000) && word(b, 1, 1000) && minimumTexts(a, b).size <= 1; break
    case 'ch7-01': {
      if (!vector(a, 2, 1000, x => integer(x, -10000, 10000)) || !integer(b, -10000, 10000)) break
      let count = 0; const nums = a as number[]
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === b) count++
      valid = count === 1; break
    }
    case 'ch7-05': valid = vector(a, 2, 20, x => integer(x, -2, 2)); break // Every product <= 2^20.
    case 'ch8-01': valid = matrix(a, 20, 1000) && integer(b, 1, 400) && integer(c, 1, 400); break
    case 'ch8-08': valid = matrix(a, 50, 10000); break
  }
  demand(valid, 'DOMAIN')
}
