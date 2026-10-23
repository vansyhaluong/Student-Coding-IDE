import type { AppResult } from './app-error'
import type { ExerciseDraft, ExerciseLanguage } from './practice'
import type { CsharpExecutionResult, CsharpSampleSchema } from './csharp-execution'
import type { JavascriptExecutionResult, JavascriptSampleSchema } from './javascript-execution'

/** Approved initial Learning policy. Neither Project Run nor Terminal uses this. */
export const EXERCISE_LIMITS = Object.freeze({
  prepareMs: 10_000,
  compileMs: 30_000,
  executeCaseMs: 2_000,
  operationMs: 60_000,
  cleanupWaitMs: 12_000,
  compileJobMemoryBytes: 2 * 1024 ** 3,
  executeJobMemoryBytes: 512 * 1024 ** 2,
  outputBytes: 1024 ** 2,
  concurrentOperations: 1,
  queuedOperations: 0,
})

export const EXERCISE_RUNTIME_POLICY = Object.freeze({
  dotnetSdkMajor: 10,
  nodeMajor: 24,
  stableOnly: true,
  lockPatch: false,
  autoInstall: false,
  majorFallback: false,
})

/** Declarations only: no IPC handler, bridge or public API wiring in Common step 1. */
export const EXERCISE_CHANNELS = {
  run: 'exercise:run',
  snapshot: 'exercise:snapshot',
  stop: 'exercise:stop',
  changed: 'exercise:changed',
} as const

/** Case/harness DTOs remain an adapter/P9-HARNESS gate, not arbitrary test execution. */
export interface ExerciseRunRequest extends ExerciseDraft {
  /** Editor revision captured with code; does not grant session ownership. */
  sourceRevision: number
}

/** Main-issued opaque identity. The IPC sender, not this DTO, determines owner. */
export interface ExerciseSessionReference {
  sessionId: string
  generation: number
}

/** Internal Learning lifecycle only; there is no student-facing Stop control. */
export interface ExerciseStopRequest extends ExerciseSessionReference {
  reason: 'CONTEXT_CHANGED' | 'LEARNING_LEFT'
}

export const EXERCISE_PHASES = ['prepare', 'compile', 'execute', 'cleanup', 'finished'] as const
export type ExercisePhase = typeof EXERCISE_PHASES[number]
export const EXERCISE_END_REASONS = [
  'COMPLETED', 'CONTEXT_CHANGED', 'LEARNING_LEFT', 'OWNER_LOST', 'SHUTDOWN',
  'PREPARE_TIMEOUT', 'COMPILE_TIMEOUT', 'EXECUTE_TIMEOUT', 'OPERATION_TIMEOUT',
  'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT', 'DEPENDENCY_MISSING', 'INVALID_RUNTIME',
  'PREPARATION_FAILED', 'COMPILATION_FAILED', 'RUNTIME_FAILED', 'INTERNAL_ERROR',
] as const
export type ExerciseEndReason = typeof EXERCISE_END_REASONS[number]
export type ExerciseTerminationProof = 'PENDING' | 'VERIFIED' | 'HISTORY_UNVERIFIED' | 'PROCESS_UNRESOLVED'

/** Service finalization and process/workspace cleanup are deliberately separate. */
export interface ExerciseCleanupSnapshot {
  state: 'NOT_STARTED' | 'PENDING' | 'FAILED' | 'FINALIZED'
  proof: ExerciseTerminationProof
  processClean: boolean
  cleanupComplete: boolean
  workspace: 'RETAINED' | 'DELETE_PENDING' | 'QUARANTINED' | 'REMOVED'
  pendingIo: boolean
}

/** Execution completion is not a Judge verdict, Accepted record or saved solution. */
export interface ExerciseSnapshot extends ExerciseSessionReference {
  exerciseId: string
  language: ExerciseLanguage
  sourceRevision: number
  sequence: number
  phase: ExercisePhase
  reason: ExerciseEndReason | null
  stdout: string
  stderr: string
  cleanup: ExerciseCleanupSnapshot
  /** Main catalogue schema; no commands, paths, expected values or process metadata. */
  csharp?: { schema: CsharpSampleSchema; result: CsharpExecutionResult }
  javascript?: { schema: JavascriptSampleSchema; result: JavascriptExecutionResult }
}

export interface ExerciseApi {
  run(request: ExerciseRunRequest): Promise<AppResult<ExerciseSnapshot>>
  snapshot(request: ExerciseSessionReference): Promise<AppResult<ExerciseSnapshot>>
  stop(request: ExerciseStopRequest): Promise<AppResult<ExerciseSnapshot>>
  onChanged(listener: (snapshot: ExerciseSnapshot) => void): () => void
}
