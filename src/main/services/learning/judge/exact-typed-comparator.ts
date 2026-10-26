import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import type { ExerciseType } from '../../../../shared/contracts/practice'
import { PACKAGE_POLICY as P } from '../content/exercise-package-policy'
import type { ComparatorIdentity, ComparatorResult } from './judge-contracts'

const types: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const int32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647

function configuration(v: unknown): v is ComparatorIdentity {
  if (v === null || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
  const id = Object.getOwnPropertyDescriptor(v, 'id'), version = Object.getOwnPropertyDescriptor(v, 'version')
  return Reflect.ownKeys(v).length === 2 && !!id && 'value' in id && id.value === P.comparatorId
    && !!version && 'value' in version && version.value === P.comparatorVersion
}

/** Parser-origin plain JSON data only, not a general live-object/proxy sanitizer.
 * Track canonical JSON byte cost without stringify/encoding a second payload.
 * Expected uses L6; actual uses Runtime bounds, with no authoring caps. */
function valid(v: unknown, type: ExerciseType, expected: boolean): boolean {
  let bytes = expected ? P.valueBytes : EXERCISE_LIMITS.outputBytes
  let nodes = EXERCISE_LIMITS.outputBytes
  const charge = (n: number): boolean => { bytes -= n; return bytes >= 0 }
  const string = (s: unknown): s is string => {
    if (typeof s !== 'string' || s.length > (expected ? P.stringUnits : EXERCISE_LIMITS.outputBytes) || !charge(2)) return false
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c >= 0xd800 && c <= 0xdbff) {
        const low = s.charCodeAt(++i)
        if (!(low >= 0xdc00 && low <= 0xdfff) || !charge(4)) return false
      } else if (c >= 0xdc00 && c <= 0xdfff) return false
      else if (!charge(c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13 ? 2 : c < 32 ? 6 : c < 128 ? 1 : c < 2048 ? 2 : 3)) return false
    }
    return true
  }
  const array = (a: unknown, limit: number): a is unknown[] => Array.isArray(a)
    && Object.getPrototypeOf(a) === Array.prototype && a.length <= limit && charge(2 + Math.max(0, a.length - 1))
  // Reading data descriptors avoids invoking accessors; parsed arrays are dense.
  const at = (a: unknown[], i: number): unknown => {
    const d = Object.getOwnPropertyDescriptor(a, i)
    return d && 'value' in d ? d.value : undefined
  }
  const scalar = (a: unknown, kind: 'int32' | 'boolean' | 'string'): boolean => {
    if (--nodes < 0) return false
    if (kind === 'string') return string(a)
    if (kind === 'boolean') return typeof a === 'boolean' && charge(a ? 4 : 5)
    return int32(a) && charge(String(a).length)
  }
  if (type === 'int32' || type === 'boolean' || type === 'string') return scalar(v, type)
  if (!array(v, expected ? type === 'int32[]' ? P.integerElements : type === 'string[]' ? P.stringElements : P.matrixRows : EXERCISE_LIMITS.outputBytes)) return false
  let units = 0, cells = 0, width: number | undefined
  for (let i = 0; i < v.length; i++) {
    const item = at(v, i)
    if (type === 'int32[][]') {
      if (--nodes < 0 || !array(item, expected ? P.matrixColumns : EXERCISE_LIMITS.outputBytes)) return false
      width ??= item.length
      cells += item.length
      if (item.length !== width || expected && cells > P.matrixCells) return false
      for (let j = 0; j < item.length; j++) if (!scalar(at(item, j), 'int32')) return false
    } else {
      if (!scalar(item, type === 'int32[]' ? 'int32' : 'string')) return false
      if (typeof item === 'string') units += item.length
      if (expected && units > P.stringArrayUnits) return false
    }
  }
  return true
}

function equal(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false
  return true
}

/** Synchronous, pure exact-typed@1. Caller owns deadline checks and trusted
 * transport validation. INVALID_ACTUAL never itself establishes student blame. */
export function compareExactTyped(type: unknown, actual: unknown, expected: unknown, comparator: unknown): ComparatorResult {
  if (!configuration(comparator) || typeof type !== 'string' || !types.includes(type as ExerciseType)) return 'INVALID_CONFIGURATION'
  const kind = type as ExerciseType
  if (!valid(expected, kind, true)) return 'INVALID_EXPECTED'
  if (!valid(actual, kind, false)) return 'INVALID_ACTUAL'
  return equal(actual, expected) ? 'PASS' : 'DIFFERENT'
}
