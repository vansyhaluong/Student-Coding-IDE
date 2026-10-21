import { EXERCISE_LIMITS } from './exercise'
import { CSHARP_FAILURE_KINDS, CSHARP_HARNESS_VERSION, type CsharpCaseResult, type CsharpCompileResult,
  type CsharpCompilerDiagnostic, type CsharpExecutionFailure, type CsharpExecutionResult,
  type CsharpHarnessRequest, type CsharpHarnessResponse, type CsharpSampleSchema } from './csharp-execution'
import type { ExerciseType } from './practice'
import { isPlainObject, validateExactObject, type ValidationResult } from './validation'

const invalid = <T>(): ValidationResult<T> => ({ ok: false, issues: [{ path: '$', message: 'Invalid C# execution data' }] })
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const index = (v: unknown, count: number): v is number => integer(v) && v < count
const exit = (v: unknown): boolean => v === null || integer(v) && v <= 0xffff_ffff
const types: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const member = (values: readonly string[], v: unknown): v is string => typeof v === 'string' && values.includes(v)
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => {
  const r = validateExactObject(v, keys)
  return r.ok && keys.every(k => Object.hasOwn(r.value, k))
}
const bytes = (s: string): number => new TextEncoder().encode(s).byteLength

/** Bounded preflight before stringify/parse/copy; dense JSON only, no cycles or deep objects. */
function bounded(v: unknown): boolean {
  let remaining = EXERCISE_LIMITS.outputBytes
  const visit = (value: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 12) return false
    if (value === null || typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string') { remaining -= value.length; return remaining >= 0 }
    if (Array.isArray(value)) {
      if (value.length > remaining) return false
      for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !visit(value[i], depth + 1)) return false
      return true
    }
    if (!isPlainObject(value)) return false
    for (const key of Object.keys(value)) {
      remaining -= key.length
      if (remaining < 0 || !visit(value[key], depth + 1)) return false
    }
    return true
  }
  return visit(v, 0) && bytes(JSON.stringify(v)) <= EXERCISE_LIMITS.outputBytes
}
function schema(s: CsharpSampleSchema): boolean {
  return bounded(s) && integer(s.sampleCount) && s.sampleCount > 0 && Array.isArray(s.parameterTypes)
    && s.parameterTypes.every(t => types.includes(t)) && types.includes(s.returnType)
}
function value(v: unknown, type: ExerciseType): boolean {
  const int32 = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
  if (type === 'int32') return int32(v)
  if (type === 'boolean') return typeof v === 'boolean'
  if (type === 'string') return typeof v === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)
  if (!Array.isArray(v)) return false
  if (type === 'int32[]') return v.every(int32)
  if (type === 'string[]') return v.every(s => value(s, 'string'))
  return v.every(row => Array.isArray(row) && row.length === v[0].length && row.every(int32))
}
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function failure(v: unknown, count: number): v is CsharpExecutionFailure {
  if (!exact(v, ['kind', 'phase', 'caseIndex']) || !member(CSHARP_FAILURE_KINDS, v.kind)
    || !member(['prepare', 'compile', 'execute', 'operation', 'cleanup'], v.phase)
    || (v.phase === 'execute' ? !index(v.caseIndex, count) : v.caseIndex !== null)) return false
  if (v.kind === 'SDK_MISSING' || v.kind === 'SDK_INCOMPATIBLE') return v.phase === 'prepare'
  if (v.kind === 'COMPILE_ERROR') return v.phase === 'compile'
  if (v.kind === 'RUNTIME_ERROR') return v.phase === 'execute'
  if (v.kind === 'JOB_MEMORY_LIMIT') return v.phase === 'compile' || v.phase === 'execute'
  if (v.kind === 'TIMEOUT') return v.phase !== 'cleanup' // Cleanup wait failure is infrastructure, not execution timeout.
  if (v.kind === 'OUTPUT_LIMIT') return v.phase === 'prepare' || v.phase === 'compile' || v.phase === 'execute'
  return v.phase !== 'operation'
}
export function validateCsharpExecutionFailure(v: unknown, sampleCount: number): ValidationResult<CsharpExecutionFailure> {
  return integer(sampleCount) && sampleCount > 0 && bounded(v) && failure(v, sampleCount) ? { ok: true, value: copy(v) } : invalid()
}
function diagnostic(v: unknown): v is CsharpCompilerDiagnostic {
  if (!exact(v, ['code', 'severity', 'source', 'line', 'column']) || typeof v.code !== 'string' || !/^CS\d{4,5}$/.test(v.code)
    || !member(['error', 'warning'], v.severity) || !member(['solution', 'harness', 'compiler'], v.source)) return false
  return v.source === 'compiler' ? v.line === null && v.column === null
    : integer(v.line) && v.line > 0 && integer(v.column) && v.column > 0
}
export function validateCsharpCompilerDiagnostic(v: unknown): ValidationResult<CsharpCompilerDiagnostic> {
  return bounded(v) && diagnostic(v) ? { ok: true, value: copy(v) } : invalid()
}
function streams(v: Record<string, unknown>): boolean { return value(v.stdout, 'string') && value(v.stderr, 'string') }
function compilation(v: unknown, count: number): v is CsharpCompileResult {
  if (!exact(v, ['status', 'exitCode', 'diagnostics', 'stdout', 'stderr', 'failure']) || !exit(v.exitCode) || !streams(v)
    || !Array.isArray(v.diagnostics) || !v.diagnostics.every(diagnostic)) return false
  if (v.status === 'SUCCEEDED') return v.exitCode === 0 && v.failure === null && !v.diagnostics.some(d => d.severity === 'error')
  if (v.status !== 'FAILED' || !failure(v.failure, count)
    || !(v.failure.phase === 'compile' || v.failure.kind === 'TIMEOUT' && v.failure.phase === 'operation')) return false
  return v.failure.kind !== 'COMPILE_ERROR' || (v.exitCode !== null && v.exitCode !== 0 && v.diagnostics.some(d => d.severity === 'error'))
}
export function validateCsharpCompileResult(v: unknown, sampleCount: number): ValidationResult<CsharpCompileResult> {
  return integer(sampleCount) && sampleCount > 0 && bounded(v) && compilation(v, sampleCount) ? { ok: true, value: copy(v) } : invalid()
}
function caseResult(v: unknown, s: CsharpSampleSchema): v is CsharpCaseResult {
  if (!exact(v, ['caseIndex', 'outcome', 'actual', 'stdout', 'stderr', 'exitCode', 'failure'])
    || !index(v.caseIndex, s.sampleCount) || !exit(v.exitCode) || !streams(v)) return false
  if (v.outcome === 'RETURNED') return v.exitCode === 0 && v.failure === null && value(v.actual, s.returnType)
  return v.outcome === 'FAILED' && v.actual === null && failure(v.failure, s.sampleCount)
    && (v.failure.phase === 'execute' && v.failure.caseIndex === v.caseIndex
      || v.failure.kind === 'TIMEOUT' && v.failure.phase === 'operation')
}
export function validateCsharpCaseResult(v: unknown, s: CsharpSampleSchema): ValidationResult<CsharpCaseResult> {
  return schema(s) && bounded(v) && caseResult(v, s) ? { ok: true, value: copy(v) } : invalid()
}
function sameFailure(a: CsharpExecutionFailure | null, b: CsharpExecutionFailure | null): boolean {
  return a === null || b === null ? a === b : a.kind === b.kind && a.phase === b.phase && a.caseIndex === b.caseIndex
}
export function validateCsharpExecutionResult(v: unknown, s: CsharpSampleSchema): ValidationResult<CsharpExecutionResult> {
  if (!schema(s) || !bounded(v) || !exact(v, ['compile', 'cases', 'failure']) || !Array.isArray(v.cases)
    || v.cases.length > s.sampleCount || v.failure !== null && !failure(v.failure, s.sampleCount)
    || v.compile !== null && !compilation(v.compile, s.sampleCount)) return invalid()
  const cases = v.cases
  if (cases.some((c, i) => !caseResult(c, s) || c.caseIndex !== i || i < cases.length - 1 && c.outcome === 'FAILED')) return invalid()
  if (cases.length && (v.compile === null || v.compile.status !== 'SUCCEEDED')) return invalid()
  if (v.compile?.status === 'FAILED' && !sameFailure(v.failure, v.compile.failure)) return invalid()
  const last = cases.at(-1)
  if (last?.outcome === 'FAILED' && !sameFailure(v.failure, last.failure)) return invalid()
  if (v.failure !== null) {
    if (v.failure.phase === 'compile' && v.compile?.status !== 'FAILED'
      || v.failure.phase === 'prepare' && (v.compile !== null || cases.length)
      || v.failure.phase === 'execute' && last?.outcome !== 'FAILED') return invalid()
  }
  return { ok: true, value: copy({ compile: v.compile, cases, failure: v.failure }) }
}
export function validateCsharpHarnessRequest(v: unknown, s: CsharpSampleSchema, caseIndex: number): ValidationResult<CsharpHarnessRequest> {
  if (!schema(s) || !bounded(v) || !exact(v, ['protocolVersion', 'caseIndex', 'args']) || v.protocolVersion !== CSHARP_HARNESS_VERSION
    || !index(caseIndex, s.sampleCount) || v.caseIndex !== caseIndex || !Array.isArray(v.args) || v.args.length !== s.parameterTypes.length
    || !v.args.every((arg, i) => value(arg, s.parameterTypes[i]))) return invalid()
  return { ok: true, value: copy({ protocolVersion: CSHARP_HARNESS_VERSION, caseIndex, args: v.args }) }
}
export function validateCsharpHarnessResponse(v: unknown, s: CsharpSampleSchema, caseIndex: number): ValidationResult<CsharpHarnessResponse> {
  if (!schema(s) || !bounded(v) || !isPlainObject(v)) return invalid()
  const keys = ['protocolVersion', 'caseIndex', 'outcome', 'stdout', 'stderr', v.outcome === 'RETURNED' ? 'actual' : 'error']
  if (!exact(v, keys) || v.protocolVersion !== CSHARP_HARNESS_VERSION || !index(caseIndex, s.sampleCount)
    || v.caseIndex !== caseIndex || !streams(v)) return invalid()
  if (v.outcome === 'RETURNED' && value(v.actual, s.returnType)
    || v.outcome === 'FAILED' && member(['USER_EXCEPTION', 'INVALID_RESULT'], v.error)) return { ok: true, value: copy(v as CsharpHarnessResponse) }
  return invalid()
}
/** Caller must also decode native bytes as strict UTF-8; reject malformed bytes before this boundary. */
export function parseCsharpHarnessResponse(json: string, s: CsharpSampleSchema, caseIndex: number): ValidationResult<CsharpHarnessResponse> {
  if (json.length > EXERCISE_LIMITS.outputBytes || bytes(json) > EXERCISE_LIMITS.outputBytes) return invalid()
  try { return validateCsharpHarnessResponse(JSON.parse(json), s, caseIndex) } catch { return invalid() }
}
