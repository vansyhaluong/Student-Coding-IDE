import type { ExerciseType, ExerciseValue } from './practice'
import { isExerciseId } from './practice'

export const SUBMISSION_DIAGNOSTIC_BYTES = 32 * 1024
/** Public ordinal, never an Official case index/ID. Binding is the enclosing status. */
export type SubmissionDiagnostic =
  | { kind: 'DETAIL_UNAVAILABLE'; reason: 'NO_VERIFIED_PUBLIC_DETAIL' | 'DETAIL_LIMIT_EXCEEDED' }
  | { kind: 'PUBLIC_SAMPLE_MISMATCH'; exerciseId: string; packageVersion: number; sampleOrdinal: number;
      parameterTypes: ExerciseType[]; input: ExerciseValue[]; returnType: ExerciseType;
      actual: ExerciseValue; expected: ExerciseValue }

const types: readonly string[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const encoder = new TextEncoder()
/** Bounded data-descriptor walk before JSON serialization. No getters/toJSON,
 * sparse/custom arrays, cycles or unbounded output allocation. Transport JSON only. */
export function diagnosticJsonBytes(value: unknown): number | null {
  let remaining = SUBMISSION_DIAGNOSTIC_BYTES, nodes = SUBMISSION_DIAGNOSTIC_BYTES
  const charge = (n: number) => { remaining -= n; return remaining >= 0 }
  const string = (s: string): boolean => {
    if (s.length > SUBMISSION_DIAGNOSTIC_BYTES) return false
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c >= 0xd800 && c <= 0xdbff) { const low = s.charCodeAt(++i); if (!(low >= 0xdc00 && low <= 0xdfff)) return false }
      else if (c >= 0xdc00 && c <= 0xdfff) return false
    }
    return charge(encoder.encode(JSON.stringify(s)).byteLength)
  }
  const walk = (v: unknown, depth: number): boolean => {
    if (--nodes < 0 || depth > 8) return false
    if (typeof v === 'string') return string(v)
    if (typeof v === 'number') return Number.isFinite(v) && charge(String(Object.is(v, -0) ? 0 : v).length)
    if (typeof v === 'boolean') return charge(v ? 4 : 5)
    if (!v || typeof v !== 'object') return false
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || v.length > remaining
        || Reflect.ownKeys(v).length !== v.length + 1 || !charge(2 + Math.max(0, v.length - 1))) return false
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i))
        if (!d || !d.enumerable || !('value' in d) || !walk(d.value, depth + 1)) return false
      }
      return true
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
    const keys = Reflect.ownKeys(v)
    if (keys.length > 16 || !charge(2 + Math.max(0, keys.length - 1))) return false
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(v, key)
      if (typeof key !== 'string' || !d?.enumerable || !('value' in d) || !string(key) || !charge(1) || !walk(d.value, depth + 1)) return false
    }
    return true
  }
  return walk(value, 0) ? SUBMISSION_DIAGNOSTIC_BYTES - remaining : null
}
const fields = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v)
  && !Object.is(v, -0) && v >= min && v <= max
const type = (v: unknown): v is ExerciseType => typeof v === 'string' && types.includes(v)
/** Caller has first passed the bounded descriptor walk. */
function typed(v: unknown, t: ExerciseType): boolean {
  if (t === 'int32') return typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647
  if (t === 'boolean') return typeof v === 'boolean'
  if (t === 'string') return typeof v === 'string'
  if (!Array.isArray(v)) return false
  if (t === 'int32[]') return v.every(x => typed(x, 'int32'))
  if (t === 'string[]') return v.every(x => typed(x, 'string'))
  return v.every(row => Array.isArray(row) && row.length === (v[0] as unknown[]).length && row.every(x => typed(x, 'int32')))
}
/** Shape/budget validation is not a proof of provenance: Main's leased resolver
 * authenticates provenance before this DTO can be constructed/published. */
export function isSubmissionDiagnostic(value: unknown): value is SubmissionDiagnostic {
  if (diagnosticJsonBytes(value) === null || !value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'DETAIL_UNAVAILABLE') return fields(v, ['kind', 'reason'])
    && ['NO_VERIFIED_PUBLIC_DETAIL', 'DETAIL_LIMIT_EXCEEDED'].includes(v.reason as string)
  if (v.kind !== 'PUBLIC_SAMPLE_MISMATCH' || !fields(v, ['kind', 'exerciseId', 'packageVersion', 'sampleOrdinal',
    'parameterTypes', 'input', 'returnType', 'actual', 'expected']) || !isExerciseId(v.exerciseId)
    || !integer(v.packageVersion, 1, 2147483647) || !integer(v.sampleOrdinal, 1, 16)
    || !Array.isArray(v.parameterTypes) || v.parameterTypes.length > 16 || !v.parameterTypes.every(type)
    || !Array.isArray(v.input) || v.input.length !== v.parameterTypes.length || !type(v.returnType)) return false
  const parameters = v.parameterTypes as ExerciseType[]
  return v.input.every((arg, i) => typed(arg, parameters[i])) && typed(v.actual, v.returnType) && typed(v.expected, v.returnType)
}

export const unavailableDiagnostic = (reason: Extract<SubmissionDiagnostic, { kind: 'DETAIL_UNAVAILABLE' }>['reason'] = 'NO_VERIFIED_PUBLIC_DETAIL'): SubmissionDiagnostic =>
  ({ kind: 'DETAIL_UNAVAILABLE', reason })
