import {
  EXERCISE_END_REASONS, EXERCISE_LIMITS, EXERCISE_PHASES,
  type ExerciseCleanupSnapshot, type ExerciseRunRequest, type ExerciseSessionReference,
  type ExerciseSnapshot, type ExerciseStopRequest,
} from './exercise'
import { isExerciseId, isExerciseLanguage, validateExerciseDraft } from './practice'
import { validateExactObject, type ValidationResult } from './validation'
import { isCsharpSampleSchema, validateCsharpExecutionResult } from './csharp-execution-validation'
import { validateJavascriptSampleSchema, validateJavascriptExecutionResult } from './javascript-execution-validation'

const invalid = <T>(message: string): ValidationResult<T> => ({ ok: false, issues: [{ path: '$', message }] })
const counter = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const member = <T extends string>(values: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && values.some(value => value === v)

export function isExerciseSessionId(v: unknown): v is string {
  return typeof v === 'string'
    && /^exercise_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
}

function reference(v: Record<string, unknown>): v is Record<string, unknown> & ExerciseSessionReference {
  return isExerciseSessionId(v.sessionId) && counter(v.generation) && v.generation > 0
}

export function validateExerciseRunRequest(v: unknown): ValidationResult<ExerciseRunRequest> {
  const r = validateExactObject(v, ['exerciseId', 'language', 'code', 'sourceRevision'])
  if (!r.ok) return r
  const draft = validateExerciseDraft({ exerciseId: r.value.exerciseId, language: r.value.language, code: r.value.code })
  if (!draft.ok || !counter(r.value.sourceRevision)) return invalid('Invalid Exercise run request')
  return { ok: true, value: { ...draft.value, sourceRevision: r.value.sourceRevision } }
}

export function validateExerciseSessionReference(v: unknown): ValidationResult<ExerciseSessionReference> {
  const r = validateExactObject(v, ['sessionId', 'generation'])
  if (!r.ok) return r
  if (!reference(r.value)) return invalid('Invalid Exercise session reference')
  return { ok: true, value: { sessionId: r.value.sessionId, generation: r.value.generation } }
}

export function validateExerciseStopRequest(v: unknown): ValidationResult<ExerciseStopRequest> {
  const r = validateExactObject(v, ['sessionId', 'generation', 'reason'])
  if (!r.ok) return r
  if (!reference(r.value) || !member(['CONTEXT_CHANGED', 'LEARNING_LEFT'], r.value.reason)) {
    return invalid('Invalid Exercise lifecycle stop request')
  }
  return { ok: true, value: { sessionId: r.value.sessionId, generation: r.value.generation, reason: r.value.reason } }
}

export function validateExerciseCleanupSnapshot(v: unknown): ValidationResult<ExerciseCleanupSnapshot> {
  const r = validateExactObject(v, ['state', 'proof', 'processClean', 'cleanupComplete', 'workspace', 'pendingIo'])
  if (!r.ok) return r
  const c = r.value
  if (!member(['NOT_STARTED', 'PENDING', 'FAILED', 'FINALIZED'], c.state)
    || !member(['PENDING', 'VERIFIED', 'HISTORY_UNVERIFIED', 'PROCESS_UNRESOLVED'], c.proof)
    || !member(['RETAINED', 'DELETE_PENDING', 'QUARANTINED', 'REMOVED'], c.workspace)
    || typeof c.processClean !== 'boolean' || typeof c.cleanupComplete !== 'boolean'
    || typeof c.pendingIo !== 'boolean') return invalid('Invalid Exercise cleanup snapshot')

  // TotalProcesses mismatch can select HISTORY_UNVERIFIED, never prove a live process.
  if (c.proof !== 'VERIFIED' && (c.processClean || c.cleanupComplete)) return invalid('Unverified cleanup cannot claim clean')
  if (c.proof === 'HISTORY_UNVERIFIED' && c.workspace !== 'QUARANTINED') return invalid('Historical gap requires quarantine')
  if (c.state === 'NOT_STARTED' && (c.proof !== 'PENDING' || c.workspace !== 'RETAINED' || c.pendingIo)) return invalid('Cleanup has not started')
  if (c.processClean && c.workspace !== 'DELETE_PENDING' && c.workspace !== 'REMOVED') return invalid('Invalid clean workspace state')
  if (c.workspace === 'DELETE_PENDING' && !c.processClean) return invalid('Deletion requires acknowledged clean proof')
  if (c.workspace === 'REMOVED' && !c.processClean) return invalid('Removal requires clean proof')
  if (c.cleanupComplete && (c.state !== 'FINALIZED' || c.workspace !== 'REMOVED' || c.pendingIo)) return invalid('Incomplete cleanup mislabeled complete')
  if (c.state === 'FINALIZED' && (c.pendingIo
    || (c.proof !== 'HISTORY_UNVERIFIED' && !(c.proof === 'VERIFIED' && c.processClean && c.cleanupComplete)))) {
    return invalid('Finalization requires completed cleanup or acknowledged quarantine')
  }
  return { ok: true, value: { state: c.state, proof: c.proof, processClean: c.processClean,
    cleanupComplete: c.cleanupComplete, workspace: c.workspace, pendingIo: c.pendingIo } }
}

/** UTF-8 capture bound applies across both streams, not separately to each stream. */
function boundedOutput(stdout: unknown, stderr: unknown): stdout is string {
  if (typeof stdout !== 'string' || typeof stderr !== 'string'
    || stdout.length + stderr.length > EXERCISE_LIMITS.outputBytes) return false
  const encoder = new TextEncoder()
  return encoder.encode(stdout).byteLength + encoder.encode(stderr).byteLength <= EXERCISE_LIMITS.outputBytes
}

export function validateExerciseSnapshot(v: unknown): ValidationResult<ExerciseSnapshot> {
  const r = validateExactObject(v, ['sessionId', 'generation', 'exerciseId', 'language', 'sourceRevision',
    'sequence', 'phase', 'reason', 'stdout', 'stderr', 'cleanup', 'csharp', 'javascript'])
  if (!r.ok) return r
  const s = r.value
  const cleanup = validateExerciseCleanupSnapshot(s.cleanup)
  if (!reference(s) || !isExerciseId(s.exerciseId) || !isExerciseLanguage(s.language)
    || !counter(s.sourceRevision) || !counter(s.sequence) || !member(EXERCISE_PHASES, s.phase)
    || (s.reason !== null && !member(EXERCISE_END_REASONS, s.reason))
    || !boundedOutput(s.stdout, s.stderr) || typeof s.stderr !== 'string' || !cleanup.ok) return invalid('Invalid Exercise snapshot')
  if (s.phase === 'finished' && (s.reason === null || cleanup.value.state !== 'FINALIZED')) return invalid('Session is not finalized')
  if (s.phase !== 'cleanup' && s.phase !== 'finished' && (s.reason !== null || cleanup.value.state !== 'NOT_STARTED')) {
    return invalid('Execution phase cannot claim cleanup or completion')
  }
  if (s.phase === 'cleanup' && (s.reason === null || cleanup.value.state === 'NOT_STARTED' || cleanup.value.state === 'FINALIZED')) {
    return invalid('Invalid cleanup phase')
  }
  let csharp: ExerciseSnapshot['csharp']
  let javascript: ExerciseSnapshot['javascript']
  if ('csharp' in s && 'javascript' in s) return invalid('Conflicting language observations')
  if ('javascript' in s) {
    const payload = validateExactObject(s.javascript, ['schema', 'result'])
    if (!payload.ok || s.language !== 'javascript') return invalid('Invalid JavaScript observation')
    const schema = validateJavascriptSampleSchema(payload.value.schema)
    if (!schema.ok) return invalid('Invalid JavaScript schema')
    const result = validateJavascriptExecutionResult(payload.value.result, schema.value)
    if (!result.ok) return invalid('Invalid JavaScript observation')
    javascript = { schema: schema.value, result: result.value }
  }
  if ('csharp' in s) {
    const payload = validateExactObject(s.csharp, ['schema', 'result'])
    if (!payload.ok || s.language !== 'csharp' || !isCsharpSampleSchema(payload.value.schema)) return invalid('Invalid C# observation')
    const result = validateCsharpExecutionResult(payload.value.result, payload.value.schema)
    if (!result.ok) return invalid('Invalid C# observation')
    csharp = { schema: structuredClone(payload.value.schema), result: result.value }
  }
  const snapshot: ExerciseSnapshot = { sessionId: s.sessionId, generation: s.generation, exerciseId: s.exerciseId,
    language: s.language, sourceRevision: s.sourceRevision, sequence: s.sequence, phase: s.phase,
    reason: s.reason, stdout: s.stdout, stderr: s.stderr, cleanup: cleanup.value, ...(csharp ? { csharp } : {}), ...(javascript ? { javascript } : {}) }
  if ((csharp || javascript) && new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > EXERCISE_LIMITS.outputBytes) return invalid('Learning snapshot exceeds payload limit')
  return { ok: true, value: snapshot }
}
