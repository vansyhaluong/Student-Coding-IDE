/** Main-only ports. Declarations only: no filesystem/process/native implementation. */
import type { CsharpCompileResult, CsharpExecutionResult, CsharpSampleSchema } from '../../../../shared/contracts/csharp-execution'
import type { ExerciseRunRequest } from '../../../../shared/contracts/exercise'
import type { Exercise } from '../../../../shared/contracts/practice'
import type { ExercisePhaseContext, ExerciseRuntimeAdapter } from './exercise-runtime-adapter'
import type { ExerciseWorkspace } from './exercise-workspace'
import type { ExecutionPlan, ExecutionSignature } from './execution-plan'
import type { OfficialCaseObservation } from './official-execution-contracts'
import type { OfficialCasePlan } from '../official-case-plan'

/** Every asynchronous operation stays under Core's admitted monotonic phase deadline. */
export type CsharpPreparationContext = Pick<ExercisePhaseContext, 'signal' | 'deadline'>
export interface CsharpSdkSelection {
  readonly sdkVersion: string
  readonly runtimeVersion: string
  readonly dotnetPath: string
  readonly sdkDirectory: string
  readonly compilerPath: string
  readonly referenceDirectory: string
  readonly references: readonly string[]
  readonly runtimeDirectory: string
  readonly targetFramework: 'net10.0'
}
export type CsharpSdkResolution = { state: 'AVAILABLE'; selection: CsharpSdkSelection }
  | { state: 'MISSING'; reason: 'SDK_NOT_FOUND' }
  | { state: 'INVALID_CONFIGURATION'; reason: 'SDK_INCOMPATIBLE' | 'INSTALLATION_INCOMPLETE' | 'ARCHITECTURE_MISMATCH' }
export interface CsharpSdkResolver {
  /** Filesystem discovery only; stable SDK 10.x, no patch lock/install/fallback/Project resolver. */
  resolve(context: CsharpPreparationContext): Promise<CsharpSdkResolution>
}
export interface CsharpPreparedExecution {
  readonly workspace: ExerciseWorkspace
  readonly sdk: CsharpSdkSelection
  /** Main catalogue record; never Renderer-provided signature, samples or expected output. */
  readonly exercise?: Readonly<Exercise>
  readonly signature?: ExecutionSignature
  readonly code: string
  readonly schema: CsharpSampleSchema
}
/** Acquired by the trusted caller INSIDE this adapter's admitted Prepare. Only
 * the input view and its accounted representation capability cross this port. */
export interface CsharpOfficialInputs {
  readonly execution: ExecutionPlan
  readonly representInput: OfficialCasePlan['representInput']
}
export type CsharpOfficialInputLoader = (context: ExercisePhaseContext) => Promise<CsharpOfficialInputs>
export interface CsharpOfficialExecutionEvidence {
  readonly compile: CsharpCompileResult | null
  readonly cases: readonly OfficialCaseObservation[]
  readonly notRunCaseIndices: readonly number[]
  readonly failure: CsharpExecutionResult['failure']
}
export interface CsharpCompiledArtifact {
  readonly assemblyPath: string
  readonly runtimeConfigPath: string
}
export type CsharpCompilation = { result: CsharpCompileResult & { status: 'SUCCEEDED' }; artifact: CsharpCompiledArtifact }
  | { result: CsharpCompileResult & { status: 'FAILED' }; artifact: null }
export interface CsharpCompiler {
  /** Direct installed Roslyn, explicit local references, no MSBuild/NuGet/build server. */
  compile(input: CsharpPreparedExecution, context: ExercisePhaseContext): Promise<CsharpCompilation>
}
/** Observed only once process and its pipes settle; not itself proof of tree cleanup. */
export interface CsharpProcessResult { exitCode: number; stdout: string; stderr: string }
export interface CsharpExecutionAdapter extends ExerciseRuntimeAdapter {
  hasNextCase(): boolean
  verifyBetweenCases(context: CsharpPreparationContext): Promise<void>
  /** Detached completed-attempt prefix + exact not-run suffix. Throws while an attempt is pending
   * or owner invalidation discarded it. Bind to a Main-issued snapshot before public routing. */
  result(): CsharpExecutionResult
}
export interface CsharpExecutionAdapterFactory {
  /** Synchronous configuration only; no I/O/discovery/launch before service admission. */
  create(request: Readonly<ExerciseRunRequest> & { language: 'csharp' }, workspace: ExerciseWorkspace): CsharpExecutionAdapter
}
