import type { SubmissionStatus, SubmissionHistory, SubmissionSource } from '../../../src/shared/contracts/submission'
import type { ExerciseSnapshot } from '../../../src/shared/contracts/exercise'
export const transportUuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
export const submitRequest = { exerciseId: 'ch2-04', language: 'javascript' as const, code: 'synthetic source', sourceRevision: 4 }
export function transportStatus(generation = 1, sequence = 0): SubmissionStatus {
  return { reference: { sessionId: `exercise_${transportUuid(generation)}`, generation, submissionId: transportUuid(generation + 100) },
    exerciseId: submitRequest.exerciseId, language: submitRequest.language, sourceRevision: 4, sequence,
    stage: 'STORAGE', verdict: 'Accepted', counts: { total: 7, attempted: 7, passed: 7 }, storage: { state: 'pending' } }
}
export const availableStores = () => ({ ACCEPTED: { state: 'AVAILABLE' as const, readable: true }, FAILED: { state: 'MISSING' as const, readable: true } })
export function transportHistory(count = 1): Extract<SubmissionHistory, { ok: true }> {
  return { ok: true, stores: availableStores(), coverage: 'COMPLETE', countScope: 'ALL_SELECTED', knownCount: count, total: count,
    rows: Array.from({ length: count }, (_, i) => ({ key: { storeKind: 'ACCEPTED', recordId: transportUuid(i + 1) },
      submissionId: transportUuid(i + 1000), exerciseId: 'ch2-04', language: 'javascript', submittedAt: '2026-10-26T12:00:00.000Z',
      verdict: 'Accepted', packageVersion: 1, source: { reference: 'opaque-source-ref', revision: 4, byteLength: 4 } })), nextCursor: null }
}
export function transportSource(code = 'text'): Extract<SubmissionSource, { ok: true }> {
  const length = new TextEncoder().encode(code).byteLength
  return { ok: true, stores: availableStores(), reference: 'opaque-source-ref', key: { storeKind: 'ACCEPTED', recordId: transportUuid(1) },
    submissionId: transportUuid(1000), sourceRevision: 4, offset: 0, nextOffset: length, totalBytes: length, eof: true, code }
}
export function transportRun(generation = 1): ExerciseSnapshot {
  return { sessionId: `exercise_${transportUuid(generation)}`, generation, exerciseId: 'ch2-04', language: 'javascript', sourceRevision: 4,
    sequence: 0, phase: 'execute', reason: null, stdout: '', stderr: '',
    cleanup: { state: 'NOT_STARTED', proof: 'PENDING', processClean: false, cleanupComplete: false, workspace: 'RETAINED', pendingIo: false } }
}
