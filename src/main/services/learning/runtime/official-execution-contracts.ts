import type { ExecutionValue } from './execution-plan'
import type { LearningProcessResult } from './exercise-runtime-adapter'
import type { ExerciseCleanupSnapshot, ExerciseEndReason } from '../../../../shared/contracts/exercise'
import type { CsharpCompileResult, CsharpExecutionFailure } from '../../../../shared/contracts/csharp-execution'
import type { JavascriptSyntaxResult, JavascriptExecutionFailure } from '../../../../shared/contracts/javascript-execution'
import type { OfficialPlanIdentity } from '../official-case-plan'
import type { ExerciseRuntimeAdapter } from './exercise-runtime-adapter'
import type { ExerciseRunRequest, ExerciseSessionReference } from '../../../../shared/contracts/exercise'
import type { ExerciseWorkspace } from './exercise-workspace'
import type { ExecutionPlan } from './execution-plan'
import type { OfficialCasePlan } from '../official-case-plan'

/** Aliased settled language evidence; never a public result/publication port. */
export interface OfficialLanguageEvidence {
  readonly compile?: CsharpCompileResult | null
  readonly syntax?: JavascriptSyntaxResult | null
  readonly cases: readonly OfficialCaseObservation[]
  readonly notRunCaseIndices: readonly number[]
  readonly failure: CsharpExecutionFailure | JavascriptExecutionFailure | null
}
export interface OfficialLanguageAdapter extends ExerciseRuntimeAdapter {
  hasNextCase(): boolean
  officialEvidence(): OfficialLanguageEvidence
}
export type OfficialAdapterFactory = (request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace,
  load: (context: import('./exercise-runtime-adapter').ExercisePhaseContext) => Promise<{
    execution: ExecutionPlan; representInput: OfficialCasePlan['representInput']
  }>) => OfficialLanguageAdapter
/** Capability bound to ONE Main operation; public reference routes reject it. */
export interface OfficialOperationHandle {
  readonly reference: Readonly<ExerciseSessionReference>
  completion(): Promise<OfficialExecutionCompletion>
}

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
  /** False means failure before a trusted plan/count was acquired, not exhaustion. */
  readonly planAcquired: boolean
  readonly disposition: 'EXHAUSTED' | 'CONSUMER_STOP' | 'EXECUTION_FAILURE' | 'INVALIDATED'
  readonly compile: Readonly<CsharpCompileResult | JavascriptSyntaxResult> | null
  readonly cases: readonly OfficialCaseObservation[]
  readonly notRunCaseIndices: readonly number[]
  readonly failure: Readonly<CsharpExecutionFailure | JavascriptExecutionFailure> | null
  readonly endReason: ExerciseEndReason
  readonly cleanup: Readonly<ExerciseCleanupSnapshot>
}
