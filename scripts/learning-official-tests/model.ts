// Developer-only E2-S2. Independently authored from the accepted S1 worksheets.
import { performance } from 'node:perf_hooks'
import { parsePackageJsonWork } from '../../src/main/services/learning/content/bounded-package-json'
import { runPackageWorkSync } from '../../src/main/services/learning/content/exercise-package-work'
import { matchesExerciseType, type ExerciseType } from '../../src/shared/contracts/practice'

export const IDS = ['ch2-04', 'ch3-04', 'ch4-09', 'ch5-03', 'ch5-07', 'ch7-01', 'ch7-05', 'ch8-01', 'ch8-08'] as const
export type Id = typeof IDS[number]
export type Args = unknown[]
export const TOOL_VERSION = 'e2-s2-v1'
export const LIMITS = Object.freeze({ attempts: 256, rows: 64, bytes: 1024 * 1024, stderr: 64 * 1024,
  campaignMs: 120_000, generationMs: 5000, childMs: 30_000, buildMs: 60_000, heapMiB: 128 })
export const signatures: Record<Id, { args: ExerciseType[]; result: ExerciseType }> = {
  'ch2-04': { args: ['int32', 'int32'], result: 'int32[]' },
  'ch3-04': { args: ['int32'], result: 'boolean' }, 'ch4-09': { args: ['int32'], result: 'int32' },
  'ch5-03': { args: ['string[]'], result: 'string' }, 'ch5-07': { args: ['string', 'string'], result: 'string' },
  'ch7-01': { args: ['int32[]', 'int32'], result: 'int32[]' }, 'ch7-05': { args: ['int32[]'], result: 'int32[]' },
  'ch8-01': { args: ['int32[][]', 'int32', 'int32'], result: 'int32[][]' }, 'ch8-08': { args: ['int32[][]'], result: 'int32' },
}
export class Quarantine extends Error {
  constructor(readonly code: string) { super(code) }
}
export function demand(ok: unknown, code: string): asserts ok { if (!ok) throw new Quarantine(code) }
export function id(value: string): Id { demand((IDS as readonly string[]).includes(value), 'UNKNOWN_ID'); return value as Id }
export function check(signal?: AbortSignal, due = Infinity): void {
  demand(!signal?.aborted, 'CANCELLED'); demand(performance.now() < due, 'TOOL_TIMEOUT')
}
export function encode(value: unknown): Buffer {
  const s = JSON.stringify(value); demand(s !== undefined, 'SERIALIZATION');
  const b = Buffer.from(s); demand(b.length <= LIMITS.bytes, 'BYTE_LIMIT'); return b
}
export function parse(bytes: Uint8Array): unknown {
  // Same strict UTF-8/duplicate/Unicode/grammar/depth/node kernel as packages.
  return runPackageWorkSync(parsePackageJsonWork(bytes, LIMITS.bytes))
}
export function typed(value: unknown, kind: ExerciseType): void {
  demand(matchesExerciseType(value, kind), 'TYPE_OR_OVERFLOW');
  demand(encode(value).length <= 256 * 1024, 'VALUE_BYTES')
}
export function same(a: unknown, b: unknown): boolean { return encode(a).equals(encode(b)) }

/** xorshift32-v1; unsigned 32-bit operations, zero maps to fixed nonzero state.
 * Streams include exercise ID in seed mixing, so pilot ordering doesn't couple streams. */
export function random(seed: number, exercise: string): () => number {
  demand(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'SEED');
  let state = seed >>> 0
  for (const c of exercise) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0
  if (!state) state = 0x9e3779b9
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0 }
}
