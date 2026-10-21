import type { ExerciseEndReason } from './exercise'
import type { ExerciseType, ExerciseValue } from './practice'

/** Declaration/validation only in 9D.1 step 1; not yet an Exercise IPC payload. */
export const CSHARP_HARNESS_VERSION = 1 as const
export type CsharpFailurePhase = 'prepare' | 'compile' | 'execute' | 'operation' | 'cleanup'
export const CSHARP_FAILURE_KINDS = [
  'SDK_MISSING', 'SDK_INCOMPATIBLE', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIMEOUT',
  'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT', 'INFRASTRUCTURE_FAILURE',
] as const
export type CsharpFailureKind = typeof CSHARP_FAILURE_KINDS[number]
/** No free-form native messages, stack, paths, PIDs or provider details. */
export interface CsharpExecutionFailure {
  kind: CsharpFailureKind
  phase: CsharpFailurePhase
  /** Zero-based Main catalogue sample index; null outside a particular execute case. */
  caseIndex: number | null
}
/** Future adapter mapping, not a change to Core's current error handling. */
export const CSHARP_FAILURE_END_REASON: Readonly<Record<Exclude<CsharpFailureKind, 'TIMEOUT'>, ExerciseEndReason>> = Object.freeze({
  SDK_MISSING: 'DEPENDENCY_MISSING', SDK_INCOMPATIBLE: 'INVALID_RUNTIME', COMPILE_ERROR: 'COMPILATION_FAILED',
  RUNTIME_ERROR: 'RUNTIME_FAILED', JOB_MEMORY_LIMIT: 'JOB_MEMORY_LIMIT', OUTPUT_LIMIT: 'OUTPUT_LIMIT',
  INFRASTRUCTURE_FAILURE: 'INTERNAL_ERROR',
})
export const CSHARP_TIMEOUT_END_REASON = Object.freeze({
  prepare: 'PREPARE_TIMEOUT', compile: 'COMPILE_TIMEOUT', execute: 'EXECUTE_TIMEOUT', operation: 'OPERATION_TIMEOUT',
} as const satisfies Partial<Record<CsharpFailurePhase, ExerciseEndReason>>)

/** Location aliases only. Message text deliberately omitted until a safe formatter exists. */
export interface CsharpCompilerDiagnostic {
  code: string
  severity: 'error' | 'warning'
  source: 'solution' | 'harness' | 'compiler'
  line: number | null
  column: number | null
}
export interface CsharpCompileResult {
  status: 'SUCCEEDED' | 'FAILED'
  /** Windows DWORD exit code; null when no process exit was observed. */
  exitCode: number | null
  diagnostics: CsharpCompilerDiagnostic[]
  /** Safe normalized presentation, never raw host/compiler paths or stacks. */
  stdout: string
  stderr: string
  failure: CsharpExecutionFailure | null
}
export interface CsharpCaseResult {
  caseIndex: number
  outcome: 'RETURNED' | 'FAILED'
  actual: ExerciseValue | null
  stdout: string
  stderr: string
  exitCode: number | null
  failure: CsharpExecutionFailure | null
}
/** Partial observation allowed; no completion/cleanup proof or Judge verdict. */
export interface CsharpExecutionResult {
  compile: CsharpCompileResult | null
  /** Contiguous sample prefix, sequential/fail-fast; no cases after the first failure. */
  cases: CsharpCaseResult[]
  /** Exact increasing suffix of samples not yet attempted. No fabricated case result. */
  notRunCaseIndices: number[]
  failure: CsharpExecutionFailure | null
}

/** Main -> generated harness, one JSON document on stdin followed by EOF. */
export interface CsharpHarnessRequest {
  protocolVersion: typeof CSHARP_HARNESS_VERSION
  caseIndex: number
  args: ExerciseValue[]
}
/** Harness -> Main, one JSON document on stdout; user Console streams are captured. */
export type CsharpHarnessResponse = {
  protocolVersion: typeof CSHARP_HARNESS_VERSION
  caseIndex: number
  stdout: string
  stderr: string
} & ({ outcome: 'RETURNED'; actual: ExerciseValue }
  | { outcome: 'FAILED'; error: 'USER_EXCEPTION' | 'INVALID_RESULT' })

/** Main-supplied catalogue schema, never supplied by a renderer or harness response. */
export interface CsharpSampleSchema {
  parameterTypes: readonly ExerciseType[]
  returnType: ExerciseType
  sampleCount: number
}
