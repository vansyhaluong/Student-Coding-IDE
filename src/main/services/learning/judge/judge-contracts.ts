/** Main-private vocabulary only. No public exports, runtime authority or reducer. */
import type { ExerciseCleanupSnapshot, ExerciseEndReason, ExerciseSessionReference } from '../../../../shared/contracts/exercise'
import type { ExerciseLanguage } from '../../../../shared/contracts/practice'
import type { OfficialPlanIdentity } from '../official-case-plan'
import type { OfficialExecutionCompletion } from '../runtime/official-execution-contracts'

export interface ComparatorIdentity {
  readonly id: 'exact-typed'
  readonly version: 1
}
/** INVALID_ACTUAL is a comparator inconsistency, not trusted harness INVALID_RESULT. */
export type ComparatorResult = 'PASS' | 'DIFFERENT' | 'INVALID_ACTUAL' | 'INVALID_EXPECTED' | 'INVALID_CONFIGURATION'
export type JudgeGradedFailure = 'WrongAnswer' | 'CompilationError' | 'SyntaxError' | 'RuntimeError'
  | 'TimeLimitExceeded' | 'MemoryLimitExceeded' | 'OutputLimitExceeded'
export type JudgeVerdict = 'Accepted' | JudgeGradedFailure | 'InfrastructureFailure' | 'CancelledInvalidated'

/** No values/console/diagnostics; compile/operation failures do not invent case rows. */
export type JudgeCaseDecision = { readonly caseIndex: number } & (
  | { readonly kind: 'COMPARED'; readonly result: 'PASS' | 'DIFFERENT' }
  | { readonly kind: 'EXECUTION_FAILURE'; readonly verdict: Exclude<JudgeVerdict, 'Accepted' | 'WrongAnswer' | 'CompilationError' | 'SyntaxError'> }
)

/** Identity is supplied by the admitting service, never a Renderer authority token.
 * ownerEntry is an identity alias, not a retained source/package payload. */
export interface JudgeOwnerBoundIdentity {
  readonly ownerId: number
  readonly ownerEntry: object
  readonly session: Readonly<ExerciseSessionReference>
  readonly plan: Readonly<OfficialPlanIdentity>
  readonly language: ExerciseLanguage
  readonly sourceRevision: number
  readonly sourceHash: string
}
export interface JudgeCleanupQualification {
  readonly snapshot: Readonly<ExerciseCleanupSnapshot>
  readonly executionDone: boolean
  readonly ownsResources: boolean
  readonly retainedPackageTasks: number
  readonly representationBorrows: number
  readonly contentReleased: boolean
  /** Absent/false with contentReleased=false means release is still pending. */
  readonly contentReleaseFailed?: boolean
}
/** Recorded by the synchronous consumer, never inferred from RETURNED alone. */
export interface JudgeComparisonEvidence {
  readonly caseIndex: number
  readonly result: ComparatorResult
  readonly barrierVerified: boolean
}
/** Raw private evidence is input only. Future S3 must attest facts from the same
 * operation; these types alone do not validate or authorize a result/commit. */
export interface JudgeEligibilityInput {
  readonly identity: Readonly<JudgeOwnerBoundIdentity>
  /** Observed same-operation facts to compare with the captured expected binding.
   * S2 checks consistency only; S3 must supply these from service-owned state. */
  readonly operationIdentity: Readonly<JudgeOwnerBoundIdentity>
  readonly completion: Readonly<OfficialExecutionCompletion> | null
  readonly caseCount: number | null
  readonly comparisons: readonly JudgeComparisonEvidence[]
  readonly ownerCurrent: boolean
  readonly decisionSecuredBeforeClose: boolean
  readonly cleanup: Readonly<JudgeCleanupQualification>
}
export type JudgeIneligibilityReason = 'PENDING_COMPLETION' | 'INVALID_EVIDENCE' | 'IDENTITY_MISMATCH'
  | 'OWNER_INVALIDATED' | 'INCOMPLETE_COMPARISON' | 'UNTRUSTED_FAILURE' | 'CLEANUP_UNQUALIFIED' | 'RELEASE_PENDING'
/** Mutually exclusive candidates; neither means saved/completed or commit authority. */
export type JudgeEligibility =
  | { readonly kind: 'ACCEPTED_CANDIDATE'; readonly acceptedCandidateEligible: true; readonly gradedFailureCandidateEligible: false }
  | { readonly kind: 'GRADED_FAILURE_CANDIDATE'; readonly acceptedCandidateEligible: false; readonly gradedFailureCandidateEligible: true }
  | { readonly kind: 'INELIGIBLE'; readonly acceptedCandidateEligible: false; readonly gradedFailureCandidateEligible: false;
      readonly reasons: readonly JudgeIneligibilityReason[] }

interface JudgeScalarResult {
  readonly identity: Readonly<Omit<JudgeOwnerBoundIdentity, 'ownerEntry'>>
  readonly requiredCases: number | null
  readonly attemptedCases: number
  readonly comparedCases: number
  readonly passedCases: number
  readonly decisions: readonly JudgeCaseDecision[]
  readonly notRunCaseIndices: readonly number[]
  readonly provisionalVerdict: JudgeVerdict | null
  /** Preserve first Core reason and mapped Runtime phase without private payloads. */
  readonly endReason: ExerciseEndReason | null
  readonly failure: Readonly<Pick<NonNullable<OfficialExecutionCompletion['failure']>, 'kind' | 'phase' | 'caseIndex'>> | null
  readonly cleanup: Readonly<JudgeCleanupQualification>
}
export type JudgeResult = JudgeScalarResult & (
  | { readonly state: 'PENDING'; readonly verdict: null; readonly eligibility: Extract<JudgeEligibility, { kind: 'INELIGIBLE' }> }
  | { readonly state: 'FINAL'; readonly verdict: 'Accepted'; readonly eligibility: Extract<JudgeEligibility, { kind: 'ACCEPTED_CANDIDATE' }> }
  | { readonly state: 'FINAL'; readonly verdict: JudgeGradedFailure;
      readonly eligibility: Extract<JudgeEligibility, { kind: 'GRADED_FAILURE_CANDIDATE' }> }
  | { readonly state: 'FINAL'; readonly verdict: 'InfrastructureFailure' | 'CancelledInvalidated';
      readonly eligibility: Extract<JudgeEligibility, { kind: 'INELIGIBLE' }> }
)
