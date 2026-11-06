import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { SUBMISSION_API_LIMITS as L, type SubmissionStatus, type SubmissionHistory, type SubmissionSource, type SubmissionCompletion,
  type SubmissionStores, type SubmissionStoreAvailability, type CommittedSubmissionKey } from '../../../shared/contracts/submission'
import { isSubmissionStatus, isSubmissionHistory, isSubmissionSource, isSubmissionCompletion } from '../../../shared/contracts/submission-validation'
import { DomainError } from '../../errors/app-error'
import type { AnalysisSubmissionBinding } from './analysis/capture'
import type { SubmissionServiceStatus } from './exercise-service'
import { isSubmissionDiagnostic, unavailableDiagnostic, type SubmissionDiagnostic } from '../../../shared/contracts/submission-diagnostic'
import type { SubmissionHistoryResult, SubmissionSourceRequest, SubmissionSourceResult, SubmissionCompletionResult,
  SubmissionReadStores, SubmissionReadAvailability } from './storage/submission-read-model'

const invalid = () => new DomainError({ code: 'INVALID_INPUT', operation: 'submission:projection',
  message: 'Submission data is unavailable or invalid.', retryable: false })
const key = (v: Readonly<CommittedSubmissionKey>): CommittedSubmissionKey => ({ storeKind: v.storeKind, recordId: v.recordId })
function availability(v: SubmissionReadAvailability): SubmissionStoreAvailability {
  return { state: v.state, readable: v.readable, ...(v.warning ? { warning: v.warning } : {}), ...(v.backupState ? { backupState: v.backupState } : {}) }
}
const stores = (v: SubmissionReadStores): SubmissionStores => ({ ACCEPTED: availability(v.ACCEPTED), FAILED: availability(v.FAILED) })
/** Process-local opaque read bindings only. No cache, queue, progress or commit authority.
 * Authenticated encryption keeps private source hashes out of transport tokens. */
export class SubmissionProjection {
  private readonly secret = randomBytes(32)
  private seal(purpose: 'S' | 'C', scope: string, value: unknown): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.secret, iv)
    cipher.setAAD(Buffer.from(purpose))
    const body = Buffer.concat([cipher.update(JSON.stringify([scope, value]), 'utf8'), cipher.final()])
    const token = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
    if (token.length > L.cursorBytes) throw invalid()
    return token
  }
  private open(purpose: 'S' | 'C', scope: string, token: string): unknown {
    try {
      if (token.length > L.cursorBytes || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalid()
      const bytes = Buffer.from(token, 'base64url')
      if (bytes.length < 29 || bytes.toString('base64url') !== token) throw invalid()
      const cipher = createDecipheriv('aes-256-gcm', this.secret, bytes.subarray(0, 12))
      cipher.setAAD(Buffer.from(purpose)); cipher.setAuthTag(bytes.subarray(12, 28))
      const decoded: unknown = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'))
      if (!Array.isArray(decoded) || decoded.length !== 2 || decoded[0] !== scope) throw invalid()
      return decoded[1]
    } catch { throw invalid() }
  }
  status(v: SubmissionServiceStatus, sequence: number): SubmissionStatus {
    const s = v.storage
    // Diagnostic failure never turns a qualified grade into a transport failure.
    let diagnostic: SubmissionDiagnostic | undefined
    if (v.verdict === 'WrongAnswer' && v.stage !== 'RUNTIME' && v.diagnostic !== undefined) {
      const d = v.diagnostic
      diagnostic = isSubmissionDiagnostic(d) && (d.kind !== 'PUBLIC_SAMPLE_MISMATCH' || d.exerciseId === v.exerciseId)
        ? d.kind === 'DETAIL_UNAVAILABLE' ? { kind: d.kind, reason: d.reason }
          : { kind: d.kind, exerciseId: d.exerciseId, packageVersion: d.packageVersion, sampleOrdinal: d.sampleOrdinal,
              parameterTypes: [...d.parameterTypes], input: structuredClone(d.input), returnType: d.returnType,
              actual: structuredClone(d.actual), expected: structuredClone(d.expected) }
        : unavailableDiagnostic()
    }
    const result = { reference: { sessionId: v.reference.sessionId, generation: v.reference.generation, submissionId: v.submissionId },
      exerciseId: v.exerciseId, language: v.language, sourceRevision: v.sourceRevision, sequence,
      stage: v.stage, verdict: v.verdict,
      ...(diagnostic ? { diagnostic } : {}),
      ...(v.counts ? { counts: { total: v.counts.total, attempted: v.counts.attempted, passed: v.counts.passed } } : {}),
      storage: { state: s.state, ...(s.reason ? { reason: s.reason } : {}), ...(s.recoveryPending ? { recoveryPending: true } : {}),
        ...(s.recordKey ? { recordKey: key(s.recordKey) } : {}) } }
    if (!isSubmissionStatus(result)) throw invalid()
    return result
  }
  history(v: SubmissionHistoryResult, scope: string): SubmissionHistory {
    const result = v.ok ? { ok: true as const, stores: stores(v.stores), coverage: v.coverage, countScope: v.countScope,
      knownCount: v.knownCount, total: v.total, rows: v.rows.map(r => ({ key: key(r.key), submissionId: r.submissionId,
        exerciseId: r.exerciseId, language: r.language, submittedAt: r.submittedAt, verdict: r.verdict, packageVersion: r.packageVersion,
        source: { reference: this.seal('S', scope, [r.key.storeKind, r.key.recordId, r.submissionId, r.source.hash, r.source.revision,
          r.exerciseId, r.language, r.packageVersion]),
          revision: r.source.revision, byteLength: r.source.byteLength } })),
      nextCursor: v.nextCursor ? this.seal('C', scope, v.nextCursor) : null }
      : { ok: false as const, reason: v.reason, stores: stores(v.stores) }
    if (!isSubmissionHistory(result)) throw invalid()
    return result
  }
  cursor(value: string, scope: string): string {
    const cursor = this.open('C', scope, value)
    if (typeof cursor !== 'string' || cursor.length > L.cursorBytes) throw invalid()
    return cursor
  }
  sourceBinding(reference: string, scope: string, offset: number, limit?: number): SubmissionSourceRequest {
    const v = this.open('S', scope, reference)
    if (!Array.isArray(v) || v.length !== 8) throw invalid()
    // S4 runtime-validates every identity/hash/range below; none is a path.
    return { key: { storeKind: v[0], recordId: v[1] }, submissionId: v[2], sourceHash: v[3], sourceRevision: v[4],
      offset, ...(limit !== undefined ? { limit } : {}) }
  }
  analysisBinding(reference: string, scope: string): AnalysisSubmissionBinding {
    const v = this.open('S', scope, reference)
    if (!Array.isArray(v) || v.length !== 8 || typeof v[5] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v[5])
      || !['csharp', 'javascript'].includes(v[6]) || !Number.isSafeInteger(v[7]) || v[7] < 1) throw invalid()
    return { ...this.sourceBinding(reference, scope, 0), exerciseId: v[5], language: v[6], packageVersion: v[7] }
  }
  source(v: SubmissionSourceResult, reference: string, binding: SubmissionSourceRequest): SubmissionSource {
    if (v.ok && (v.key.storeKind !== binding.key.storeKind || v.key.recordId !== binding.key.recordId
      || v.submissionId !== binding.submissionId || v.sourceHash !== binding.sourceHash || v.sourceRevision !== binding.sourceRevision
      || v.offset !== binding.offset || v.nextOffset - v.offset > (binding.limit ?? L.sourceChunkBytes))) throw invalid()
    const result = v.ok ? { ok: true as const, stores: stores(v.stores), reference, key: key(v.key), submissionId: v.submissionId,
      sourceRevision: v.sourceRevision, offset: v.offset, nextOffset: v.nextOffset, totalBytes: v.totalBytes, eof: v.eof, code: v.code }
      : { ok: false as const, reason: v.reason, stores: stores(v.stores) }
    if (!isSubmissionSource(result)) throw invalid()
    return result
  }
  completion(v: SubmissionCompletionResult): SubmissionCompletion {
    const result = v.ok ? { ok: true as const, exerciseId: v.exerciseId, state: v.state, accepted: availability(v.accepted) }
      : { ok: false as const, reason: v.reason, stores: stores(v.stores) }
    if (!isSubmissionCompletion(result)) throw invalid()
    return result
  }
}
