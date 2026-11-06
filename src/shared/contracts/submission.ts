import type { AppResult } from './app-error'
import type { ExerciseLanguage } from './practice'
import type { SubmissionDiagnostic } from './submission-diagnostic'
export type { SubmissionDiagnostic } from './submission-diagnostic'

/** Transport budgets mirror approved E5 policies; no storage authority. */
export const SUBMISSION_API_LIMITS = Object.freeze({ sourceCodeUnits: 256 * 1024, rowsDefault: 32, rowsMaximum: 100,
  rowBytes: 1024, responseBytes: 256 * 1024, cursorBytes: 512, sourceReferenceBytes: 512, sourceChunkBytes: 32 * 1024 })
export const SUBMISSION_CHANNELS = Object.freeze({ submit: 'submission:submit', status: 'submission:status',
  current: 'submission:current', retry: 'submission:retry-status', history: 'submission:history',
  completion: 'submission:completion', source: 'submission:source', context: 'submission:context', changed: 'submission:changed' })
export interface SubmitRequest { exerciseId: string; language: ExerciseLanguage; code: string; sourceRevision: number }
export interface SubmissionReference { sessionId: string; generation: number; submissionId: string }
export interface CommittedSubmissionKey { storeKind: 'ACCEPTED' | 'FAILED'; recordId: string }
export type PublicSubmissionVerdict = 'Accepted' | 'WrongAnswer' | 'CompilationError' | 'SyntaxError' | 'RuntimeError'
  | 'TimeLimitExceeded' | 'MemoryLimitExceeded' | 'OutputLimitExceeded' | 'InfrastructureFailure' | 'CancelledInvalidated'
export type PublicSubmissionStorage = { state: 'not-requested'; reason?: 'INELIGIBLE' | 'PLAN_UNAVAILABLE' }
  | { state: 'pending' } | { state: 'saved'; recordKey: CommittedSubmissionKey }
  | { state: 'failed'; reason: 'FULL' | 'UNAVAILABLE' | 'CANCELLED' | 'EXPIRED' | 'CONFLICT' | 'IO_FAILURE' }
  | { state: 'unknown'; recoveryPending: true }
export interface SubmissionStatus {
  reference: SubmissionReference
  exerciseId: string
  language: ExerciseLanguage
  sourceRevision: number
  sequence: number
  stage: 'RUNTIME' | 'STORAGE' | 'SETTLED'
  verdict: PublicSubmissionVerdict | null
  counts?: { total: number; attempted: number; passed: number }
  /** Ephemeral evidence, bound to this status/reference; never a History field. */
  diagnostic?: SubmissionDiagnostic
  storage: PublicSubmissionStorage
}
export type SubmissionAvailabilityState = 'MISSING' | 'AVAILABLE' | 'RECOVERED' | 'READ_ONLY' | 'UNAVAILABLE'
  | 'UNSUPPORTED_SCHEMA' | 'CORRUPT' | 'CONFLICT' | 'RECOVERY_PENDING'
export interface SubmissionStoreAvailability { state: SubmissionAvailabilityState; readable: boolean;
  warning?: 'POSSIBLE_DATA_LOSS'; backupState?: SubmissionAvailabilityState }
export type SubmissionStores = Record<'ACCEPTED' | 'FAILED', SubmissionStoreAvailability>
export interface SubmissionHistoryRequest { scope?: 'ALL' | 'ACCEPTED' | 'FAILED'; exerciseId?: string;
  language?: ExerciseLanguage; packageVersion?: number; limit?: number; cursor?: string }
export interface CommittedSubmissionSummary { key: CommittedSubmissionKey; submissionId: string; exerciseId: string;
  language: ExerciseLanguage; submittedAt: string; verdict: Exclude<PublicSubmissionVerdict, 'InfrastructureFailure' | 'CancelledInvalidated'>;
  packageVersion: number; source: { reference: string; revision: number; byteLength: number } }
export type SubmissionReadReason = 'INVALID_REQUEST' | 'STALE_CURSOR' | 'CONFLICT' | 'UNAVAILABLE' | 'NOT_FOUND'
  | 'IDENTITY_MISMATCH' | 'INVALID_RANGE' | 'RESPONSE_TOO_LARGE'
export interface SubmissionReadFailure { ok: false; reason: SubmissionReadReason; stores: SubmissionStores }
export type SubmissionHistory = SubmissionReadFailure | { ok: true; stores: SubmissionStores; coverage: 'COMPLETE' | 'PARTIAL';
  countScope: 'ALL_SELECTED' | 'READABLE_ONLY'; knownCount: number; total: number | null;
  rows: CommittedSubmissionSummary[]; nextCursor: string | null }
export type SubmissionCompletion = SubmissionReadFailure | { ok: true; exerciseId: string;
  state: 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN'; accepted: SubmissionStoreAvailability }
export interface SubmissionSourceRequest { reference: string; offset: number; limit?: number }
export type SubmissionSource = SubmissionReadFailure | { ok: true; stores: SubmissionStores; reference: string;
  key: CommittedSubmissionKey; submissionId: string; sourceRevision: number; offset: number; nextOffset: number;
  totalBytes: number; eof: boolean; code: string }
export interface SubmissionContextRequest { reason: 'CONTEXT_CHANGED' | 'LEARNING_LEFT' }
/** Separate from sample-only ExerciseApi; all methods are semantic and bounded. */
export interface SubmissionApi {
  submit(request: SubmitRequest): Promise<AppResult<SubmissionStatus>>
  status(reference: SubmissionReference): Promise<AppResult<SubmissionStatus>>
  current(): Promise<AppResult<SubmissionStatus | null>>
  retry(reference: SubmissionReference): Promise<AppResult<SubmissionStatus>>
  history(request: SubmissionHistoryRequest): Promise<AppResult<SubmissionHistory>>
  completion(request: { exerciseId: string }): Promise<AppResult<SubmissionCompletion>>
  source(request: SubmissionSourceRequest): Promise<AppResult<SubmissionSource>>
  context(request: SubmissionContextRequest): Promise<AppResult<null>>
  onChanged(listener: (status: SubmissionStatus) => void): () => void
}
