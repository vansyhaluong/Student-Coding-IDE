import { mutants, type Mutant } from './mutants'
import { directions, pathVariant } from './pilot-coverage'
import type { Id } from './model'

export interface ReviewedMutant extends Mutant { tier: 'critical' | 'broader'; rationale: string }
export function pilotMutants(exercise: Id): ReviewedMutant[] {
  const critical: ReviewedMutant[] = mutants(exercise).map(m => ({ ...m, tier: 'critical', rationale: 'Accepted S2/S1 critical model; no denominator removal.' }))
  if (exercise === 'ch8-08') for (const [name, group, run] of [
    ['adds-diagonals', 'G4', (a: unknown[]) => pathVariant(a[0] as number[][], [...directions, [1, 1], [-1, -1], [1, -1], [-1, 1]])],
    ['wraps-boundaries', 'G4', (a: unknown[]) => pathVariant(a[0] as number[][], directions, false, true)],
    ['greedy-greatest-next', 'G5', (a: unknown[]) => pathVariant(a[0] as number[][], directions, false, false, true)],
  ] as const) critical.push({ name, obligations: [group], run, kind: 'value', tier: 'critical', rationale: 'S3 review makes an explicitly critical S1 adjacency/greedy defect executable; S2 catalogue retained.' })

  // Reviewed second-order/conditional mutations, separate from every retained
  // critical model. Valid output types, no crash/equivalence exclusions. Their
  // actual discriminating witnesses are required before counting applicability.
  const groups: Record<Id, [string[], string[]]> = {
    'ch2-04': [['D3'], ['D5']], 'ch3-04': [['L2', 'L3', 'L4'], ['L5']],
    'ch4-09': [['F2'], ['F3']], 'ch5-03': [['C3', 'C4'], ['C5']],
    'ch5-07': [['W2', 'W3', 'W5'], ['W6']], 'ch7-01': [['T3', 'T4'], ['T5']],
    'ch7-05': [['P3', 'P4'], ['P5']], 'ch8-01': [['R1', 'R2'], ['R4', 'R5']],
    'ch8-08': [['G2', 'G3', 'G5'], ['G7']],
  }
  const broader: Mutant[] = [
    { name: 'conditional-interior-return-edit', obligations: groups[exercise][0], kind: 'value', run: (a, e) => {
      switch (exercise) {
        case 'ch2-04': return Number(a[0]) > Number(a[1]) && Number(a[1]) > 1 ? [(e as number[])[0] + 1, 0] : e
        case 'ch3-04': return Number(a[0]) >= 1900 && Number(a[0]) <= 2100 ? !e : e
        case 'ch4-09': return Number(a[0]) > 2 && Number(a[0]) < 45 ? Number(e) - 1 : e
        case 'ch5-03': return (a[0] as string[]).length > 2 && (e as string).length > 0 ? (e as string).slice(1) : e
        case 'ch5-07': return (a[1] as string).length > 1 && (e as string).length > 0 ? (e as string).slice(1) : e
        case 'ch7-01': return (e as number[])[1] > 1 ? [(e as number[])[0] + 1, (e as number[])[1]] : e
        case 'ch7-05': return (a[0] as number[]).includes(0) ? (e as number[]).map(n => n + 1) : e
        case 'ch8-01': return (a[0] as number[][]).flat().length > 1 && Number(a[1]) > 1 ? [...e as number[][]].reverse() : e
        case 'ch8-08': return (a[0] as number[][]).length > 1 && Number(e) > 1 ? Number(e) - 1 : e
      }
    } },
    { name: 'conditional-boundary-return-edit', obligations: groups[exercise][1], kind: 'value', run: (a, e) => {
      switch (exercise) {
        case 'ch2-04': return Number(a[0]) === 1e6 ? [0, (e as number[])[0]] : e
        case 'ch3-04': return Number(a[0]) < 400 || Number(a[0]) > 2400 ? !e : e
        case 'ch4-09': return a[0] === 45 ? Number(e) % 100000 : e
        case 'ch5-03': return (a[0] as string[]).length === 100 ? '' : e
        case 'ch5-07': return (a[0] as string).length === 1000 ? (e as string).slice(0, -1) : e
        case 'ch7-01': return (a[0] as number[]).length === 1000 ? [] : e
        case 'ch7-05': return (a[0] as number[]).length === 20 ? (e as number[]).map(n => n < 0 ? -n : 0) : e
        case 'ch8-01': return Number(a[1]) === 400 || Number(a[2]) === 400 ? [] : e
        case 'ch8-08': return (a[0] as number[][]).length === 50 ? 1 : e
      }
    } },
  ]
  return [...critical, ...broader.map(m => ({ ...m, tier: 'broader' as const,
    rationale: 'S3 conditional/operator perturbation model; applicability and non-equivalence established by retained valid kill witness, not a claim of exhaustive fault coverage.' }))]
}
