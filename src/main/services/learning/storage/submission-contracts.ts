/** Main-private data contracts. None of these types is a commit capability. */
export type SubmissionStoreKind = 'ACCEPTED' | 'FAILED'
export type SubmissionLanguage = 'csharp' | 'javascript'
export type SubmissionGradedFailure = 'WrongAnswer' | 'CompilationError' | 'SyntaxError' | 'RuntimeError'
  | 'TimeLimitExceeded' | 'MemoryLimitExceeded' | 'OutputLimitExceeded'

const MiB = 1024 * 1024
export const SUBMISSION_LIMITS = Object.freeze({
  sourceCodeUnits: 256 * 1024, recordBytes: 2 * MiB, metadataBytes: 16 * 1024,
  reserveBytes: 16 * MiB, candidateSpaceMultiplier: 2, maxTransientAttempts: 3,
  retryBackoffMs: Object.freeze([250, 1000] as const),
  summaryDefault: 32, summaryMaximum: 100, summaryRowBytes: 1024,
  responseBytes: 256 * 1024, cursorBytes: 512, sourceChunkBytes: 32 * 1024,
})
/** Configuration only: no paths are resolved and no disk checks/timers execute. */
export const SUBMISSION_STORE_POLICY = Object.freeze({
  ACCEPTED: Object.freeze({ filename: 'accepted.json', snapshotBytes: 64 * MiB,
    warningBytes: 48 * MiB, highWarningBytes: 56 * MiB, callerWaitMs: 15000,
    shutdownWaitMs: 15000, slowNoticeMs: 5000, precommitWindowMs: 15000 }),
  FAILED: Object.freeze({ filename: 'failed-submissions.json', snapshotBytes: 32 * MiB,
    warningBytes: 24 * MiB, highWarningBytes: 28 * MiB, callerWaitMs: 10000,
    shutdownWaitMs: 10000, slowNoticeMs: 3000, precommitWindowMs: 10000 }),
})

export interface SubmissionIdentity { readonly id: string; readonly submissionId: string }
export interface SubmissionTestSetIdentity { readonly id: string; readonly version: number; readonly hash: string }
export interface SubmissionCapture extends SubmissionIdentity {
  readonly schemaVersion: 1
  readonly exerciseId: string
  readonly language: SubmissionLanguage
  readonly code: string
  readonly sourceRevision: number
  readonly codeHash: string
  readonly submittedAt: string
  readonly packageVersion: number
  readonly signatureVersion: number
  readonly signatureHash: string
  readonly testSet: Readonly<SubmissionTestSetIdentity>
  readonly comparator: Readonly<{ id: 'exact-typed'; version: 1 }>
}
export interface AcceptedSubmissionRecord extends SubmissionCapture {
  readonly result: 'Accepted'
  readonly acceptedAt: string
  readonly testSet: Readonly<SubmissionTestSetIdentity & { total: number; passed: number }>
  readonly cleanupProof: 'VERIFIED'
}
export interface FailedSubmissionRecord extends SubmissionCapture {
  readonly verdict: SubmissionGradedFailure
  readonly gradedAt: string
  readonly recordedAt: string
}
export type SubmissionRecord = AcceptedSubmissionRecord | FailedSubmissionRecord
export interface SubmissionCommitIdentity { readonly commitSequence: number; readonly commitId: string }
export interface PreviousSubmissionCommit extends SubmissionCommitIdentity { readonly digest: string }
interface SubmissionEnvelope {
  readonly schemaVersion: 1
  readonly commitSequence: number
  readonly lastCommitId: string
  readonly previousCommit: Readonly<PreviousSubmissionCommit> | null
  readonly checksum: string
}
export type SubmissionDocument = SubmissionEnvelope & (
  | { readonly storeKind: 'ACCEPTED'; readonly records: readonly AcceptedSubmissionRecord[] }
  | { readonly storeKind: 'FAILED'; readonly records: readonly FailedSubmissionRecord[] }
)
export type UnsignedSubmissionDocument = Omit<SubmissionEnvelope, 'checksum'> & (
  | { readonly storeKind: 'ACCEPTED'; readonly records: readonly AcceptedSubmissionRecord[] }
  | { readonly storeKind: 'FAILED'; readonly records: readonly FailedSubmissionRecord[] }
)

/** Projection of final eligibility supplied by Main, not proof of trusted origin.
 * The live service must still authenticate all facts and guard commit admission. */
export type SubmissionCandidate = { readonly state: 'FINAL' } & (
  | { readonly verdict: 'Accepted'; readonly eligibility: 'ACCEPTED_CANDIDATE' }
  | { readonly verdict: SubmissionGradedFailure; readonly eligibility: 'GRADED_FAILURE_CANDIDATE' }
)
export interface SubmissionTargetBinding extends SubmissionIdentity {
  readonly storeKind: SubmissionStoreKind
  readonly payloadDigest: string
}
export type SubmissionValidationReason = 'INVALID_SCHEMA' | 'UNSUPPORTED_SCHEMA' | 'INVALID_SOURCE'
  | 'HASH_MISMATCH' | 'IDENTITY_MISMATCH' | 'INVALID_LINEAGE' | 'CHECKSUM_MISMATCH'
  | 'DUPLICATE_ID' | 'IDEMPOTENCY_CONFLICT' | 'INELIGIBLE' | 'CAPACITY_EXCEEDED' | 'INVALID_ENCODING'
export type SubmissionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: SubmissionValidationReason }
/** Means structurally valid document data only, NEVER verified filesystem commit. */
export type CommittedRecordValidation = SubmissionValidation<SubmissionRecord>
export type SubmissionIdempotency = 'DISTINCT' | 'MATCHING_RETRY' | 'IDEMPOTENCY_CONFLICT'
export type SubmissionAvailability = 'MISSING' | 'AVAILABLE' | 'RECOVERED' | 'READ_ONLY'
  | 'UNAVAILABLE' | 'UNSUPPORTED_SCHEMA' | 'CORRUPT' | 'CONFLICT' | 'RECOVERY_PENDING'
export type SubmissionStorageResult =
  | { readonly state: 'not-requested' }
  | { readonly state: 'pending'; readonly target: Readonly<SubmissionTargetBinding> }
  | { readonly state: 'saved'; readonly target: Readonly<SubmissionTargetBinding>; readonly commit: Readonly<SubmissionCommitIdentity> }
  | { readonly state: 'failed'; readonly target: Readonly<SubmissionTargetBinding>; readonly reason: 'FULL' | 'UNAVAILABLE' | 'CANCELLED' | 'EXPIRED' | 'CONFLICT' | 'IO_FAILURE' }
  | { readonly state: 'unknown'; readonly target: Readonly<SubmissionTargetBinding>; readonly recoveryPending: true }
/** Byte lengths of canonical UTF-8, including punctuation/escaping/envelope. */
export interface SubmissionByteLengths {
  readonly recordBytes: number
  readonly metadataBytes: number
  readonly snapshotBytes: number
}
