/** Main-only declarations: no resolution, process launch, probe or harness implementation. */
import type { JavascriptExecutionResult, JavascriptHarnessRequest, JavascriptSampleSchema,
  JavascriptSyntaxResult } from '../../../../shared/contracts/javascript-execution'
import type { ExerciseRunRequest } from '../../../../shared/contracts/exercise'
import type { Exercise } from '../../../../shared/contracts/practice'
import type { ExercisePhaseContext, ExerciseRuntimeAdapter, LearningProcessResultPort } from './exercise-runtime-adapter'
import type { ExerciseWorkspace } from './exercise-workspace'
import type { ExecutionPlan, ExecutionSignature } from './execution-plan'
import type { OfficialCasePlan } from '../official-case-plan'
import type { OfficialCaseObservation } from './official-execution-contracts'

export type JavascriptPreparationContext = Pick<ExercisePhaseContext, 'signal' | 'deadline'>
/** Identity metadata is private to Main; selection is frozen/revalidated per operation. */
export interface JavascriptNodeSelection {
  readonly executablePath: string
  readonly canonicalPath: string
  readonly identity: { readonly volume: string; readonly fileId: string }
  readonly version: string
  readonly architecture: string
}
export type JavascriptNodeResolution = { state: 'AVAILABLE'; selection: JavascriptNodeSelection }
  | { state: 'MISSING'; reason: 'NODE_NOT_FOUND' }
  | { state: 'INVALID_CONFIGURATION'; reason: 'NODE_INCOMPATIBLE' | 'UNSAFE_IDENTITY' | 'ARCHITECTURE_MISMATCH' | 'CAPABILITY_MISSING' }
export interface JavascriptNodeProbe {
  /** Fixed probe only, admitted Learning Job; 512 MiB inside original Prepare 10s.
   * Port cannot launch arbitrary argv or reset deadlines. Owner retains all Jobs/I/O. */
  probe(candidate: Readonly<Pick<JavascriptNodeSelection, 'executablePath' | 'canonicalPath' | 'identity'>>,
    context: ExercisePhaseContext): Promise<JavascriptNodeResolution>
}
export interface JavascriptNodeResolver {
  /** PATH-first verified stable 24.x; owned probe shares context due. No Project resolver. */
  resolve(context: ExercisePhaseContext, probe: JavascriptNodeProbe): Promise<JavascriptNodeResolution>
  revalidate(selection: JavascriptNodeSelection, context: JavascriptPreparationContext): Promise<void>
}
export interface JavascriptPreparedExecution {
  readonly workspace: ExerciseWorkspace
  readonly node: JavascriptNodeSelection
  readonly exercise: Readonly<Exercise>
  readonly code: string
  readonly sourceRevision: number
  readonly schema: JavascriptSampleSchema
}
/** Input-only preparation. The public legacy Exercise preparation remains valid. */
export interface JavascriptInputPreparedExecution extends Omit<JavascriptPreparedExecution, 'exercise'> {
  readonly exerciseId: string
  readonly signature: ExecutionSignature
}
export type JavascriptHarnessPreparation = JavascriptPreparedExecution | JavascriptInputPreparedExecution
/** Trusted loader invoked only in this adapter's already admitted Prepare. */
export interface JavascriptOfficialInputs {
  readonly execution: ExecutionPlan
  readonly representInput: OfficialCasePlan['representInput']
}
export type JavascriptOfficialInputLoader = (context: ExercisePhaseContext) => Promise<JavascriptOfficialInputs>
export interface JavascriptOfficialExecutionEvidence {
  readonly syntax: JavascriptSyntaxResult | null
  readonly cases: readonly OfficialCaseObservation[]
  readonly notRunCaseIndices: readonly number[]
  readonly failure: JavascriptExecutionResult['failure']
}
export interface JavascriptHarnessFiles {
  readonly sourcePath: string
  readonly harnessPath: string
}
export interface JavascriptHarness {
  /** Write fixed trusted assets and source as separate data; never evaluate source here. */
  prepare(input: JavascriptHarnessPreparation, context: JavascriptPreparationContext): Promise<JavascriptHarnessFiles>
  request(input: JavascriptPreparedExecution, caseIndex: number): JavascriptHarnessRequest
}
export interface JavascriptSyntaxChecker {
  /** Parse only in owned child, compile phase 30s/2GiB; never evaluate top-level source. */
  check(input: JavascriptHarnessPreparation, files: JavascriptHarnessFiles,
    context: ExercisePhaseContext, process: LearningProcessResultPort): Promise<JavascriptSyntaxResult>
}
export interface JavascriptExecutionAdapter extends ExerciseRuntimeAdapter {
  hasNextCase(): boolean
  verifyBetweenCases(context: JavascriptPreparationContext): Promise<void>
  /** Detached settled prefix/suffix only; throw for pending/owner-invalidated observations. */
  result(): JavascriptExecutionResult
}
export interface JavascriptExecutionAdapterFactory {
  /** Configuration only; no resolution/I/O/probe before service admission. */
  create(request: Readonly<ExerciseRunRequest> & { language: 'javascript' }, workspace: ExerciseWorkspace): JavascriptExecutionAdapter
}
