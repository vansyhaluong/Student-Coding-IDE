import type { ExerciseEndReason } from '../../../../shared/contracts/exercise'

export type ExerciseExecutionPhase = 'prepare' | 'compile' | 'execute'
export interface ExercisePhaseContext {
  signal: AbortSignal
  deadline: number
  jobMemoryBytes: number | null
  /** Main-only raw accounting can exceed safe presentation bytes (e.g. compiler path redaction). */
  output(stream: 'stdout' | 'stderr', text: string, rawBytes?: number): void
}
export interface ExerciseProcessIdentity { pid: number; created: string }
/** Main-only observations, never an Exercise IPC DTO or cleanup proof. */
export type LearningProcessFailure = 'NONZERO_EXIT' | 'TIMEOUT' | 'CANCELLED'
  | 'JOB_MEMORY_LIMIT' | 'OUTPUT_LIMIT' | 'INFRASTRUCTURE_FAILURE'
export interface LearningProcessResult {
  readonly phase: ExerciseExecutionPhase
  readonly exitCode: number | null
  readonly processExited: boolean
  /** Conservative: both remain false until native confirms BOTH pipes and root settled. */
  readonly stdoutSettled: boolean
  readonly stderrSettled: boolean
  readonly observerSettled: boolean
  readonly failure: LearningProcessFailure | null
  readonly jobMemoryLimitObserved: boolean
}
export interface LearningProcessResultPort extends ExerciseRuntimeAdapter {
  /** Nonzero exit is data. Native/limit/cancellation failures still reject; inspect processResult(). */
  runProcessPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<LearningProcessResult | null>
  /** Detached latest attempt, updated by cleanup draining too; no output buffering or native action. */
  processResult(): LearningProcessResult | null
}
/** Aggregate evidence for ALL resources owned by this adapter, not just the root. */
export interface ExerciseTerminationEvidence {
  members: ExerciseProcessIdentity[]
  activeProcesses: number
  totalProcesses: number
  retained: (ExerciseProcessIdentity & { signaled: boolean })[]
  coverageComplete: boolean
  observerSettled: boolean
  unresolvedErrors: boolean
}
/**
 * Learning-only, one operation. No generic renderer execution capability.
 * Implementations set/read back quotas before launch, retain identity handles,
 * contain descendants and settle phase promises/I/O after cancellation.
 * terminate/release/closeHandles must resume safely after partial failure;
 * rejection must NOT hide an irreversible action from the next retry.
 * release cannot discard resources until revalidated termination is safe.
 * Native implementation and language drivers are deliberately not supplied here.
 */
export interface ExerciseRuntimeAdapter {
  /** Main-only operation barrier: no release/finalization and no new phase budget. */
  verifyBetweenCases?(context: Pick<ExercisePhaseContext, 'signal' | 'deadline'>): Promise<void>
  runPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<void>
  terminate(reason: ExerciseEndReason): Promise<void>
  evidence(): Promise<ExerciseTerminationEvidence>
  settleObservers(): Promise<void>
  release(): Promise<void>
  closeHandles(): Promise<void>
}

/** Production implementation must be an OS-exclusive, crash-released lease. */
/** Release is retry-safe; rejection must not conceal a completed release. */
export interface ExerciseLease { release(): Promise<void> }
export interface ExerciseLeaseProvider {
  acquire(sessionId: string): Promise<ExerciseLease | null>
}
