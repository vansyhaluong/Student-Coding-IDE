// Independently authored developer checkers; not production Comparator/Judge.
import { demand, type Args, type Id } from './model'

export function oracle(exercise: Id, args: Args): unknown {
  switch (exercise) {
    case 'ch2-04': {
      const [a, b] = args as number[]; const A = BigInt(a), B = BigInt(b)
      // Quotient selected by monotone search, not reference division.
      let lo = 0n, hi = A + 1n
      while (lo + 1n < hi) { const mid = (lo + hi) / 2n; if (mid * B <= A) lo = mid; else hi = mid }
      return [Number(lo), Number(A - lo * B)]
    }
    case 'ch3-04': {
      const y = (args[0] as number) % 400
      // Separately enumerate cycle positions, removing century exclusions.
      const days = new Set(Array.from({ length: 100 }, (_, i) => i * 4))
      for (const n of [100, 200, 300]) days.delete(n)
      demand(days.size === 97, 'ORACLE_INVARIANT'); return days.has(y)
    }
    case 'ch4-09': {
      const fib = (n: number): [bigint, bigint] => {
        if (!n) return [0n, 1n]
        const [a, b] = fib(Math.floor(n / 2)), c = a * (2n * b - a), d = a * a + b * b
        return n % 2 ? [d, c + d] : [c, d]
      }
      return Number(fib(args[0] as number)[0])
    }
    case 'ch5-03': {
      const words = args[0] as string[]; const shortest = [...words].sort((a, b) => a.length - b.length)[0]
      for (let n = shortest.length; n >= 0; n--) if (words.every(w => w.startsWith(shortest.slice(0, n)))) return shortest.slice(0, n)
      throw new Error('ORACLE_INVARIANT')
    }
    case 'ch5-07': {
      // Prefix frequencies; doesn't call domain enumerator or window helpers.
      const [s, t] = args as string[], prefix: number[][] = [Array<number>(26).fill(0)]
      for (const char of s) { const next = [...prefix[prefix.length - 1]]; next[char.charCodeAt(0) - 97]++; prefix.push(next) }
      const need = Array<number>(26).fill(0); for (const char of t) need[char.charCodeAt(0) - 97]++
      for (let len = t.length; len <= s.length; len++) {
        const answers = new Set<string>()
        for (let l = 0; l + len <= s.length; l++) if (need.every((n, c) => prefix[l + len][c] - prefix[l][c] >= n)) answers.add(s.slice(l, l + len))
        demand(answers.size <= 1, 'ORACLE_DOMAIN')
        if (answers.size) return [...answers][0]
      }
      return ''
    }
    case 'ch7-01': {
      const [nums, target] = args as [number[], number]; const found: number[][] = []
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (BigInt(nums[i]) + BigInt(nums[j]) === BigInt(target)) found.push([i, j])
      demand(found.length === 1, 'ORACLE_DOMAIN'); return found[0]
    }
    case 'ch7-05': return (args[0] as number[]).map((_, i, a) => Number(a.reduce((p, v, j) => j === i ? p : p * BigInt(v), 1n)))
    case 'ch8-01': {
      const [m, rows, cols] = args as [number[][], number, number], width = m[0].length
      if (rows * cols !== m.length * width) return m.map(r => [...r])
      return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => m[Math.floor((r * cols + c) / width)][(r * cols + c) % width]))
    }
    case 'ch8-08': {
      const m = args[0] as number[][], R = m.length, C = m[0].length
      const cells = m.flatMap((r, i) => r.map((value, j) => ({ i, j, value }))).sort((a, b) => a.value - b.value || a.i - b.i || a.j - b.j)
      const dp = m.map(r => r.map(() => 1)); let best = 1
      for (const { i, j, value } of cells) {
        for (const [r, c] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (r >= 0 && c >= 0 && r < R && c < C && m[r][c] < value) dp[i][j] = Math.max(dp[i][j], dp[r][c] + 1)
        best = Math.max(best, dp[i][j])
      }
      return best
    }
  }
}
