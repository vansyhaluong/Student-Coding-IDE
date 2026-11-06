import { SUBMISSION_API_LIMITS as L, type SubmitRequest, type SubmissionReference, type SubmissionContextRequest,
  type SubmissionHistoryRequest, type SubmissionSourceRequest, type SubmissionStatus, type SubmissionHistory,
  type SubmissionCompletion, type SubmissionSource, type SubmissionReadFailure, type CommittedSubmissionSummary } from './submission'
import type { ValidationResult } from './validation'
import { isExerciseId, isExerciseLanguage } from './practice'
import { isExerciseSessionId } from './exercise-validation'
import { isSubmissionDiagnostic } from './submission-diagnostic'

const bad = <T>(): ValidationResult<T> => ({ ok: false, issues: [{ path: '$', message: 'Invalid submission data.' }] })
const good = <T>(value: T): ValidationResult<T> => ({ ok: true, value })
export function submissionFields(v: unknown, allowed: readonly string[], required: readonly string[] = allowed): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
  const keys = Reflect.ownKeys(v)
  return required.every(k => keys.includes(k)) && keys.every(k => typeof k === 'string' && allowed.includes(k)
    && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))
}
export const submissionInteger = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number'
  && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max
export const submissionUuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const member = (v: unknown, values: readonly string[]): v is string => typeof v === 'string' && values.includes(v)
const bytes = (s: string) => new TextEncoder().encode(s).byteLength
export function submissionText(v: unknown): v is string {
  if (typeof v !== 'string') return false
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) { const n = v.charCodeAt(++i); if (!(n >= 0xdc00 && n <= 0xdfff)) return false }
    else if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}
const token = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  && /^[A-Za-z0-9_.-]+$/.test(v) && bytes(v) <= max
const fit = (v: unknown, max = L.responseBytes) => bytes(JSON.stringify({ ok: true, value: v })) <= max
export function validateSubmitRequest(v: unknown): ValidationResult<SubmitRequest> {
  if (!submissionFields(v, ['exerciseId', 'language', 'code', 'sourceRevision']) || !isExerciseId(v.exerciseId)
    || !isExerciseLanguage(v.language) || typeof v.code !== 'string' || v.code.length > L.sourceCodeUnits
    || !submissionText(v.code) || !submissionInteger(v.sourceRevision)) return bad()
  return good({ exerciseId: v.exerciseId, language: v.language, code: v.code, sourceRevision: v.sourceRevision })
}
export function validateSubmissionReference(v: unknown): ValidationResult<SubmissionReference> {
  return submissionFields(v, ['sessionId', 'generation', 'submissionId']) && isExerciseSessionId(v.sessionId)
    && submissionInteger(v.generation, 1) && submissionUuid(v.submissionId)
    ? good({ sessionId: v.sessionId, generation: v.generation, submissionId: v.submissionId }) : bad()
}
export function validateSubmissionEmpty(v: unknown): ValidationResult<Record<string, never>> { return submissionFields(v, []) ? good({}) : bad() }
export function validateSubmissionContext(v: unknown): ValidationResult<SubmissionContextRequest> {
  return submissionFields(v, ['reason']) && member(v.reason, ['CONTEXT_CHANGED', 'LEARNING_LEFT'])
    ? good({ reason: v.reason as SubmissionContextRequest['reason'] }) : bad()
}
export function validateSubmissionCompletionRequest(v: unknown): ValidationResult<{ exerciseId: string }> {
  return submissionFields(v, ['exerciseId']) && isExerciseId(v.exerciseId) ? good({ exerciseId: v.exerciseId }) : bad()
}
export function validateSubmissionHistoryRequest(v: unknown): ValidationResult<SubmissionHistoryRequest> {
  if (!submissionFields(v, ['scope', 'exerciseId', 'language', 'packageVersion', 'limit', 'cursor'], [])) return bad()
  if (Object.hasOwn(v, 'scope') && !member(v.scope, ['ALL', 'ACCEPTED', 'FAILED'])
    || Object.hasOwn(v, 'exerciseId') && !isExerciseId(v.exerciseId)
    || Object.hasOwn(v, 'language') && !isExerciseLanguage(v.language)
    || Object.hasOwn(v, 'packageVersion') && !submissionInteger(v.packageVersion, 1)
    || Object.hasOwn(v, 'limit') && !submissionInteger(v.limit, 1, L.rowsMaximum)
    || Object.hasOwn(v, 'cursor') && !token(v.cursor, L.cursorBytes)) return bad()
  return good({ ...v } as SubmissionHistoryRequest)
}
export function validateSubmissionSourceRequest(v: unknown): ValidationResult<SubmissionSourceRequest> {
  return submissionFields(v, ['reference', 'offset', 'limit'], ['reference', 'offset']) && token(v.reference, L.sourceReferenceBytes)
    && submissionInteger(v.offset) && (!Object.hasOwn(v, 'limit') || submissionInteger(v.limit, 1, L.sourceChunkBytes))
    ? good({ reference: v.reference, offset: v.offset, ...(Object.hasOwn(v, 'limit') ? { limit: v.limit as number } : {}) }) : bad()
}
const graded = ['Accepted', 'WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded']
const availabilityStates = ['MISSING', 'AVAILABLE', 'RECOVERED', 'READ_ONLY', 'UNAVAILABLE', 'UNSUPPORTED_SCHEMA', 'CORRUPT', 'CONFLICT', 'RECOVERY_PENDING']
function key(v: unknown): boolean { return submissionFields(v, ['storeKind', 'recordId']) && member(v.storeKind, ['ACCEPTED', 'FAILED']) && submissionUuid(v.recordId) }
function availability(v: unknown): boolean {
  return submissionFields(v, ['state', 'readable', 'warning', 'backupState'], ['state', 'readable']) && member(v.state, availabilityStates)
    && typeof v.readable === 'boolean' && (!Object.hasOwn(v, 'warning') || v.warning === 'POSSIBLE_DATA_LOSS')
    && (!Object.hasOwn(v, 'backupState') || member(v.backupState, availabilityStates))
    && (!['AVAILABLE', 'MISSING'].includes(v.state) || v.readable)
    && (v.state !== 'RECOVERED' || v.readable && v.warning === 'POSSIBLE_DATA_LOSS')
    && (!['UNAVAILABLE', 'CORRUPT', 'CONFLICT', 'UNSUPPORTED_SCHEMA', 'RECOVERY_PENDING'].includes(v.state) || !v.readable)
}
function stores(v: unknown): boolean { return submissionFields(v, ['ACCEPTED', 'FAILED']) && availability(v.ACCEPTED) && availability(v.FAILED) }
function storage(v: unknown): boolean {
  if (!submissionFields(v, ['state', 'reason', 'recordKey', 'recoveryPending'], ['state'])) return false
  if (v.state === 'not-requested') return submissionFields(v, ['state', 'reason'], ['state']) && (!Object.hasOwn(v, 'reason') || member(v.reason, ['INELIGIBLE', 'PLAN_UNAVAILABLE']))
  if (v.state === 'pending') return submissionFields(v, ['state'])
  if (v.state === 'saved') return submissionFields(v, ['state', 'recordKey']) && key(v.recordKey)
  if (v.state === 'failed') return submissionFields(v, ['state', 'reason']) && member(v.reason, ['FULL', 'UNAVAILABLE', 'CANCELLED', 'EXPIRED', 'CONFLICT', 'IO_FAILURE'])
  return v.state === 'unknown' && submissionFields(v, ['state', 'recoveryPending']) && v.recoveryPending === true
}
export function isSubmissionStatus(v: unknown): v is SubmissionStatus {
  if (!submissionFields(v, ['reference', 'exerciseId', 'language', 'sourceRevision', 'sequence', 'stage', 'verdict', 'storage', 'counts', 'diagnostic'],
    ['reference', 'exerciseId', 'language', 'sourceRevision', 'sequence', 'stage', 'verdict', 'storage'])
    || !validateSubmissionReference(v.reference).ok || !isExerciseId(v.exerciseId) || !isExerciseLanguage(v.language)
    || !submissionInteger(v.sourceRevision) || !submissionInteger(v.sequence) || !member(v.stage, ['RUNTIME', 'STORAGE', 'SETTLED'])
    || v.verdict !== null && !member(v.verdict, [...graded, 'InfrastructureFailure', 'CancelledInvalidated']) || !storage(v.storage)) return false
  const s = v.storage as SubmissionStatus['storage']
  if (Object.hasOwn(v, 'diagnostic') && (v.verdict !== 'WrongAnswer' || v.stage === 'RUNTIME'
    || !isSubmissionDiagnostic(v.diagnostic)
    || v.diagnostic.kind === 'PUBLIC_SAMPLE_MISMATCH' && v.diagnostic.exerciseId !== v.exerciseId)) return false
  if (Object.hasOwn(v, 'counts') && (!submissionFields(v.counts, ['total', 'attempted', 'passed'])
    || !submissionInteger(v.counts.total, 1, 128) || !submissionInteger(v.counts.attempted, 0, v.counts.total)
    || !submissionInteger(v.counts.passed, 0, v.counts.attempted)
    || v.verdict === 'Accepted' && (v.counts.passed !== v.counts.total || v.counts.attempted !== v.counts.total))) return false
  if (s.state === 'saved' && (!member(v.verdict, graded) || s.recordKey.storeKind !== (v.verdict === 'Accepted' ? 'ACCEPTED' : 'FAILED'))) return false
  if (v.stage === 'SETTLED' && (s.state === 'pending' || s.state === 'unknown')) return false
  return fit(v)
}
function failure(v: unknown): v is SubmissionReadFailure {
  return submissionFields(v, ['ok', 'reason', 'stores']) && v.ok === false && stores(v.stores)
    && member(v.reason, ['INVALID_REQUEST', 'STALE_CURSOR', 'CONFLICT', 'UNAVAILABLE', 'NOT_FOUND', 'IDENTITY_MISMATCH', 'INVALID_RANGE', 'RESPONSE_TOO_LARGE'])
}
function row(v: unknown): boolean {
  if (!submissionFields(v, ['key', 'submissionId', 'exerciseId', 'language', 'submittedAt', 'verdict', 'packageVersion', 'source'])
    || !key(v.key) || !submissionUuid(v.submissionId) || !isExerciseId(v.exerciseId) || !isExerciseLanguage(v.language)
    || typeof v.submittedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.submittedAt)
    || !Number.isFinite(Date.parse(v.submittedAt)) || new Date(v.submittedAt).toISOString() !== v.submittedAt
    || !member(v.verdict, graded) || !submissionInteger(v.packageVersion, 1)
    || !submissionFields(v.source, ['reference', 'revision', 'byteLength']) || !token(v.source.reference, L.sourceReferenceBytes)
    || !submissionInteger(v.source.revision) || !submissionInteger(v.source.byteLength, 0, L.sourceCodeUnits * 3)) return false
  return (v.key as Record<string, unknown>).storeKind === (v.verdict === 'Accepted' ? 'ACCEPTED' : 'FAILED') && bytes(JSON.stringify(v)) <= L.rowBytes
}
export function isSubmissionHistory(v: unknown): v is SubmissionHistory {
  if (failure(v)) return fit(v)
  if (!submissionFields(v, ['ok', 'stores', 'coverage', 'countScope', 'knownCount', 'total', 'rows', 'nextCursor']) || v.ok !== true
    || !stores(v.stores) || !member(v.coverage, ['COMPLETE', 'PARTIAL']) || !submissionInteger(v.knownCount)
    || !Array.isArray(v.rows) || v.rows.length > L.rowsMaximum || Reflect.ownKeys(v.rows).length !== v.rows.length + 1) return false
  const ids = new Set<string>(), submissions = new Set<string>()
  for (let i = 0; i < v.rows.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v.rows, String(i))
    if (!d || !Object.hasOwn(d, 'value') || !row(d.value)) return false
    const safe = d.value as CommittedSubmissionSummary
    if (ids.has(safe.key.recordId) || submissions.has(safe.submissionId)) return false
    ids.add(safe.key.recordId); submissions.add(safe.submissionId)
  }
  return v.knownCount >= v.rows.length && (v.coverage === 'COMPLETE' ? v.countScope === 'ALL_SELECTED' && v.total === v.knownCount
    : v.countScope === 'READABLE_ONLY' && v.total === null) && (v.nextCursor === null || token(v.nextCursor, L.cursorBytes)) && fit(v)
}
export function isSubmissionCompletion(v: unknown): v is SubmissionCompletion {
  return failure(v) ? fit(v) : submissionFields(v, ['ok', 'exerciseId', 'state', 'accepted']) && v.ok === true
    && isExerciseId(v.exerciseId) && member(v.state, ['COMPLETED', 'NOT_COMPLETED', 'UNKNOWN']) && availability(v.accepted)
    && (v.state !== 'COMPLETED' || (v.accepted as Record<string, unknown>).readable === true && (v.accepted as Record<string, unknown>).state !== 'MISSING')
    && (v.state !== 'NOT_COMPLETED' || (v.accepted as Record<string, unknown>).readable === true && (v.accepted as Record<string, unknown>).state !== 'RECOVERED') && fit(v)
}
export function isSubmissionSource(v: unknown): v is SubmissionSource {
  if (failure(v)) return fit(v)
  return submissionFields(v, ['ok', 'stores', 'reference', 'key', 'submissionId', 'sourceRevision', 'offset', 'nextOffset', 'totalBytes', 'eof', 'code'])
    && v.ok === true && stores(v.stores) && token(v.reference, L.sourceReferenceBytes) && key(v.key) && submissionUuid(v.submissionId)
    && submissionInteger(v.sourceRevision) && submissionInteger(v.offset) && submissionInteger(v.nextOffset, v.offset)
    && submissionInteger(v.totalBytes, v.nextOffset, L.sourceCodeUnits * 3) && typeof v.eof === 'boolean' && v.eof === (v.nextOffset === v.totalBytes)
    && typeof v.code === 'string' && v.code.length <= L.sourceChunkBytes && submissionText(v.code) && bytes(v.code) <= L.sourceChunkBytes
    && bytes(v.code) === v.nextOffset - v.offset && (v.eof || v.nextOffset > v.offset) && fit(v)
}
