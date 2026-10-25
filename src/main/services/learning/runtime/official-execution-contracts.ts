import type { ExecutionValue } from './execution-plan'
import type { LearningProcessResult } from './exercise-runtime-adapter'
import type { ExerciseCleanupSnapshot, ExerciseEndReason } from '../../../../shared/contracts/exercise'
import type { CsharpCompileResult, CsharpExecutionFailure } from '../../../../shared/contracts/csharp-execution'
import type { JavascriptSyntaxResult, JavascriptExecutionFailure } from '../../../../shared/contracts/javascript-execution'
import type { OfficialPlanIdentity } from '../official-case-plan'

/** Private observations are execution evidence, never comparator outcomes/verdicts. */
export type OfficialCaseObservation = {
  readonly caseIndex: number
  readonly language: 'csharp' | 'javascript'
  readonly process: Readonly<LearningProcessResult> | null
} & (
  | { readonly kind: 'RETURNED'; readonly actual: ExecutionValue; readonly stdout: string; readonly stderr: string }
  | { readonly kind: 'USER_EXCEPTION' | 'INVALID_RESULT'; readonly stdout: string; readonly stderr: string }
  | { readonly kind: 'PROTOCOL_FAILURE'; readonly reason: 'MALFORMED' | 'UNEXPECTED_EXIT' | 'MISSING_RESPONSE' }
  | { readonly kind: 'INFRASTRUCTURE_FAILURE'; readonly reason: 'UNSETTLED' | 'RESOURCE_FAILURE' | 'UNKNOWN' }
  | { readonly kind: 'INTERRUPTED'; readonly reason: 'TIMEOUT' | 'CANCELLED' | 'JOB_MEMORY_LIMIT' | 'OUTPUT_LIMIT' }
)
/** Future driver calls synchronously only AFTER the current case's VERIFIED barrier.
 * It must recheck owner/cancellation/phase before another case. No S1 consumer wiring. */
export type OfficialSettledCaseConsumer = (observation: Readonly<OfficialCaseObservation>) => 'CONTINUE' | 'STOP'

/** Bounded attempted prefix/unattempted suffix, not an all-cases success verdict.
 * Runtime buffering/accounting and construction belong to later authorized steps. */
export interface OfficialExecutionCompletion {
  readonly identity: Readonly<OfficialPlanIdentity>
  readonly disposition: 'EXHAUSTED' | 'CONSUMER_STOP' | 'EXECUTION_FAILURE' | 'INVALIDATED'
  readonly compile: Readonly<CsharpCompileResult | JavascriptSyntaxResult> | null
  readonly cases: readonly OfficialCaseObservation[]
  readonly notRunCaseIndices: readonly number[]
  readonly failure: Readonly<CsharpExecutionFailure | JavascriptExecutionFailure> | null
  readonly endReason: ExerciseEndReason
  readonly cleanup: Readonly<ExerciseCleanupSnapshot>
}
