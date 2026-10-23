import { EXERCISE_LIMITS } from './exercise'
import { JAVASCRIPT_FAILURE_KINDS, JAVASCRIPT_HARNESS_VERSION, JAVASCRIPT_PROTOCOL_MAX_DEPTH,
  type JavascriptCaseResult, type JavascriptDiagnostic, type JavascriptExecutionFailure,
  type JavascriptExecutionResult, type JavascriptHarnessRequest, type JavascriptHarnessResponse,
  type JavascriptSampleSchema, type JavascriptSyntaxResult } from './javascript-execution'
import type { ExerciseType } from './practice'
import type { ValidationResult } from './validation'

const invalid = <T>(): ValidationResult<T> => ({ ok: false, issues: [{ path: '$', message: 'Invalid JavaScript execution data' }] })
const unicode = (v: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const count = (v: unknown): v is number => integer(v) && v > 0 && v <= EXERCISE_LIMITS.outputBytes
const index = (v: unknown, n: number): v is number => integer(v) && v < n
const exit = (v: unknown): boolean => v === null || integer(v) && v <= 0xffff_ffff
const member = (set: readonly string[], v: unknown): v is string => typeof v === 'string' && set.includes(v)
const types: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const bytes = (v: string): number => new TextEncoder().encode(v).byteLength

/** Data-only detached clone. Reject accessors/toJSON, sparse/custom arrays, symbols,
 * cycles, exotic objects and non-JSON values before stringify; never call user hooks.
 * Inputs must be parsed/structured-cloned data, never live vm objects or Proxies. */
function data(v: unknown): unknown {
  let remaining = EXERCISE_LIMITS.outputBytes
  const seen = new Set<object>()
  const visit = (v: unknown, depth: number): unknown => {
    if (--remaining < 0 || depth > JAVASCRIPT_PROTOCOL_MAX_DEPTH) throw new Error('bounds')
    if (v === null || typeof v === 'boolean') return v
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && unicode(v)) {
      remaining -= v.length
      if (remaining < 0) throw new Error('size')
      return v
    }
    if (typeof v !== 'object' || v === null || seen.has(v)) throw new Error('data')
    const array = Array.isArray(v)
    if (!array && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('prototype')
    seen.add(v)
    const keys = Reflect.ownKeys(v)
    if (keys.length > remaining || keys.some(k => typeof k !== 'string')) throw new Error('keys')
    if (array && (v.length > remaining || keys.length !== v.length + 1)) throw new Error('array')
    const out: Record<string, unknown> | unknown[] = array ? [] : Object.create(null)
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string' || !unicode(key) || key === 'toJSON') throw new Error('key')
      remaining -= key.length
      const descriptor = Object.getOwnPropertyDescriptor(v, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('descriptor')
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= v.length)) throw new Error('index')
      Object.defineProperty(out, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true })
    }
    seen.delete(v)
    return out
  }
  const out = visit(v, 0)
  if (bytes(JSON.stringify(out)) > EXERCISE_LIMITS.outputBytes) throw new Error('bytes')
  return out
}
function validate<T>(v: unknown, guard: (v: unknown) => v is T): ValidationResult<T> {
  try { const copy = data(v); return guard(copy) ? { ok: true, value: copy } : invalid() } catch { return invalid() }
}

/** Scan before JSON.parse to bound nesting and reject duplicate decoded property names.
 * JSON.parse still checks the entire grammar; this scanner also requires one document. */
function document(input: string | Uint8Array): unknown {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) throw new Error('input')
  if (input.length > EXERCISE_LIMITS.outputBytes) throw new Error('size')
  const text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input)
  if (!unicode(text) || bytes(text) > EXERCISE_LIMITS.outputBytes) throw new Error('unicode/bytes')
  let pos = 0
  const whitespace = (): void => { while (/[\t\n\r ]/.test(text[pos] ?? '') && pos < text.length) pos++ }
  const string = (): string => {
    const start = pos++
    while (pos < text.length) {
      const c = text[pos++]
      if (c === '"') return JSON.parse(text.slice(start, pos)) as string
      if (c === '\\') pos++
    }
    throw new Error('string')
  }
  const scan = (depth: number): void => {
    if (depth > JAVASCRIPT_PROTOCOL_MAX_DEPTH) throw new Error('depth')
    whitespace()
    const token = text[pos]
    if (token === '"') { string(); return }
    if (token === '{' || token === '[') {
      const object = token === '{', end = object ? '}' : ']'
      const names = new Set<string>()
      pos++; whitespace()
      if (text[pos] === end) { pos++; return }
      for (;;) {
        whitespace()
        if (object) {
          if (text[pos] !== '"') throw new Error('key')
          const key = string()
          if (names.has(key)) throw new Error('duplicate')
          names.add(key); whitespace()
          if (text[pos++] !== ':') throw new Error('colon')
        }
        scan(depth + 1); whitespace()
        if (text[pos] === end) { pos++; return }
        if (text[pos++] !== ',') throw new Error('separator')
      }
    }
    const primitive = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y
    primitive.lastIndex = pos
    if (!primitive.exec(text)) throw new Error('token')
    pos = primitive.lastIndex
  }
  scan(0); whitespace()
  if (pos !== text.length) throw new Error('trailing')
  return JSON.parse(text) as unknown
}

function schema(v: unknown): v is JavascriptSampleSchema {
  return exact(v, ['parameterTypes', 'returnType', 'sampleCount']) && count(v.sampleCount)
    && Array.isArray(v.parameterTypes) && v.parameterTypes.every(t => member(types, t)) && member(types, v.returnType)
}
function value(v: unknown, type: ExerciseType): boolean {
  const int32 = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
  if (type === 'int32') return int32(v)
  if (type === 'boolean') return typeof v === 'boolean'
  if (type === 'string') return typeof v === 'string' && unicode(v)
  if (!Array.isArray(v)) return false
  if (type === 'int32[]') return v.every(int32)
  if (type === 'string[]') return v.every(s => typeof s === 'string' && unicode(s))
  return v.every(row => Array.isArray(row) && row.length === v[0].length && row.every(int32))
}
function failure(v: unknown, n: number): v is JavascriptExecutionFailure {
  if (!exact(v, ['kind', 'phase', 'caseIndex']) || !member(JAVASCRIPT_FAILURE_KINDS, v.kind)
    || !member(['prepare', 'compile', 'execute', 'operation', 'cleanup'], v.phase)
    || (v.phase === 'execute' ? !index(v.caseIndex, n) : v.caseIndex !== null)) return false
  if (v.kind === 'NODE_MISSING' || v.kind === 'NODE_INCOMPATIBLE') return v.phase === 'prepare'
  if (v.kind === 'SYNTAX_ERROR') return v.phase === 'compile'
  if (v.kind === 'RUNTIME_ERROR') return v.phase === 'execute'
  if (v.kind === 'TIMEOUT') return v.phase !== 'cleanup'
  if (v.kind === 'INFRASTRUCTURE_FAILURE') return v.phase !== 'operation'
  return member(['prepare', 'compile', 'execute'], v.phase)
}
function diagnostic(v: unknown): v is JavascriptDiagnostic {
  return exact(v, ['code', 'source', 'line', 'column']) && v.code === 'SYNTAX_ERROR'
    && member(['solution', 'harness'], v.source)
    && (v.line === null && v.column === null || integer(v.line) && v.line > 0 && integer(v.column) && v.column > 0)
}
const streams = (v: Record<string, unknown>): boolean => typeof v.stdout === 'string' && typeof v.stderr === 'string'
const same = (a: JavascriptExecutionFailure | null, b: JavascriptExecutionFailure | null): boolean =>
  a === null || b === null ? a === b : a.kind === b.kind && a.phase === b.phase && a.caseIndex === b.caseIndex
function syntax(v: unknown, n: number): v is JavascriptSyntaxResult {
  if (!exact(v, ['status', 'exitCode', 'diagnostics', 'stdout', 'stderr', 'failure']) || !exit(v.exitCode) || !streams(v)
    || !Array.isArray(v.diagnostics) || !v.diagnostics.every(diagnostic)) return false
  if (v.status === 'SUCCEEDED') return v.exitCode === 0 && v.failure === null && v.diagnostics.length === 0
  if (v.status !== 'FAILED' || !failure(v.failure, n)
    || !(v.failure.phase === 'compile' || v.failure.kind === 'TIMEOUT' && v.failure.phase === 'operation')) return false
  return v.failure.kind === 'SYNTAX_ERROR' ? v.exitCode === 1 && v.diagnostics.length > 0 : v.diagnostics.length === 0
}
function caseResult(v: unknown, s: JavascriptSampleSchema): v is JavascriptCaseResult {
  if (!exact(v, ['caseIndex', 'outcome', 'actual', 'stdout', 'stderr', 'exitCode', 'failure'])
    || !index(v.caseIndex, s.sampleCount) || !exit(v.exitCode) || !streams(v)) return false
  if (v.outcome === 'RETURNED') return v.exitCode === 0 && v.failure === null && value(v.actual, s.returnType)
  return v.outcome === 'FAILED' && v.actual === null && failure(v.failure, s.sampleCount)
    && (v.failure.phase === 'execute' && v.failure.caseIndex === v.caseIndex
      || v.failure.kind === 'TIMEOUT' && v.failure.phase === 'operation')
    && (v.failure.kind !== 'RUNTIME_ERROR' || v.exitCode === 1)
}
export const validateJavascriptSampleSchema = (v: unknown): ValidationResult<JavascriptSampleSchema> => validate(v, schema)
export const validateJavascriptDiagnostic = (v: unknown): ValidationResult<JavascriptDiagnostic> => validate(v, diagnostic)
export function validateJavascriptExecutionFailure(v: unknown, sampleCount: number): ValidationResult<JavascriptExecutionFailure> {
  return count(sampleCount) ? validate(v, (v): v is JavascriptExecutionFailure => failure(v, sampleCount)) : invalid()
}
export function validateJavascriptSyntaxResult(v: unknown, sampleCount: number): ValidationResult<JavascriptSyntaxResult> {
  return count(sampleCount) ? validate(v, (v): v is JavascriptSyntaxResult => syntax(v, sampleCount)) : invalid()
}
export function validateJavascriptCaseResult(v: unknown, s: JavascriptSampleSchema): ValidationResult<JavascriptCaseResult> {
  const checked = validateJavascriptSampleSchema(s)
  return checked.ok ? validate(v, (v): v is JavascriptCaseResult => caseResult(v, checked.value)) : invalid()
}
export function validateJavascriptExecutionResult(v: unknown, s: JavascriptSampleSchema): ValidationResult<JavascriptExecutionResult> {
  const checked = validateJavascriptSampleSchema(s)
  if (!checked.ok) return invalid()
  const shape = checked.value
  return validate(v, (v): v is JavascriptExecutionResult => {
    if (!exact(v, ['syntax', 'cases', 'notRunCaseIndices', 'failure']) || !Array.isArray(v.cases)
      || v.cases.length > shape.sampleCount || v.failure !== null && !failure(v.failure, shape.sampleCount)
      || v.syntax !== null && !syntax(v.syntax, shape.sampleCount) || !Array.isArray(v.notRunCaseIndices)
      || v.notRunCaseIndices.length !== shape.sampleCount - v.cases.length) return false
    const cases = v.cases
    if (!v.notRunCaseIndices.every((n, i) => n === cases.length + i)
      || cases.some((c, i) => !caseResult(c, shape) || c.caseIndex !== i || i < cases.length - 1 && c.outcome === 'FAILED')
      || cases.length > 0 && (v.syntax === null || v.syntax.status !== 'SUCCEEDED')) return false
    const f = v.failure as JavascriptExecutionFailure | null
    const last = cases.at(-1) as JavascriptCaseResult | undefined
    if (v.syntax?.status === 'FAILED' && !same(f, v.syntax.failure)
      || last?.outcome === 'FAILED' && !same(f, last.failure)) return false
    if (f === null) return true
    if (f.phase === 'prepare') return v.syntax === null && cases.length === 0
    if (f.phase === 'compile') return v.syntax?.status === 'FAILED'
    if (f.phase === 'execute') return last?.outcome === 'FAILED' && same(f, last.failure)
    if (f.phase === 'operation') return v.syntax?.status !== 'FAILED' || same(f, v.syntax.failure)
    return true // Cleanup infrastructure failure can follow any settled prefix.
  })
}
export function validateJavascriptHarnessRequest(v: unknown, s: JavascriptSampleSchema, caseIndex: number): ValidationResult<JavascriptHarnessRequest> {
  const checked = validateJavascriptSampleSchema(s)
  if (!checked.ok || !index(caseIndex, checked.value.sampleCount)) return invalid()
  return validate(v, (v): v is JavascriptHarnessRequest => exact(v, ['protocolVersion', 'caseIndex', 'args'])
    && v.protocolVersion === JAVASCRIPT_HARNESS_VERSION && v.caseIndex === caseIndex && Array.isArray(v.args)
    && v.args.length === checked.value.parameterTypes.length && v.args.every((a, i) => value(a, checked.value.parameterTypes[i])))
}
/** Completed response only: no response is accepted before a concrete settled exit. */
export function validateJavascriptHarnessResponse(v: unknown, s: JavascriptSampleSchema, caseIndex: number, exitCode: number | null): ValidationResult<JavascriptHarnessResponse> {
  const checked = validateJavascriptSampleSchema(s)
  if (!checked.ok || !index(caseIndex, checked.value.sampleCount)) return invalid()
  return validate(v, (v): v is JavascriptHarnessResponse => {
    if (!exact(v, ['protocolVersion', 'caseIndex', 'outcome', 'stdout', 'stderr',
      v !== null && typeof v === 'object' && 'outcome' in v && v.outcome === 'RETURNED' ? 'actual' : 'error'])
      || v.protocolVersion !== JAVASCRIPT_HARNESS_VERSION || v.caseIndex !== caseIndex || !streams(v)) return false
    return v.outcome === 'RETURNED' && exitCode === 0 && value(v.actual, checked.value.returnType)
      || v.outcome === 'FAILED' && exitCode === 1 && member(['USER_EXCEPTION', 'INVALID_RESULT'], v.error)
  })
}
export function parseJavascriptHarnessRequest(input: string | Uint8Array, s: JavascriptSampleSchema, caseIndex: number): ValidationResult<JavascriptHarnessRequest> {
  try { return validateJavascriptHarnessRequest(document(input), s, caseIndex) } catch { return invalid() }
}
export function parseJavascriptHarnessResponse(input: string | Uint8Array, s: JavascriptSampleSchema, caseIndex: number, exitCode: number | null): ValidationResult<JavascriptHarnessResponse> {
  try { return validateJavascriptHarnessResponse(document(input), s, caseIndex, exitCode) } catch { return invalid() }
}
