/** Standalone 9D.2 contracts; no Exercise snapshot/IPC integration in Step 1. */
import type { ExerciseEndReason } from './exercise'
import type { ExerciseType, ExerciseValue } from './practice'

export const JAVASCRIPT_HARNESS_VERSION = 1 as const
export const JAVASCRIPT_PROTOCOL_MAX_DEPTH = 12
export const JAVASCRIPT_FAILURE_KINDS = [
  'NODE_MISSING', 'NODE_INCOMPATIBLE', 'SYNTAX_ERROR', 'RUNTIME_ERROR', 'PROTOCOL_FAILURE',
  'TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT', 'INFRASTRUCTURE_FAILURE',
] as const
export type JavascriptFailureKind = typeof JAVASCRIPT_FAILURE_KINDS[number]
export type JavascriptFailurePhase = 'prepare' | 'compile' | 'execute' | 'operation' | 'cleanup'
export interface JavascriptExecutionFailure {
  kind: JavascriptFailureKind
  phase: JavascriptFailurePhase
  /** Main catalogue index only during execute, otherwise null. */
  caseIndex: number | null
}
export const JAVASCRIPT_FAILURE_END_REASON = Object.freeze({
  NODE_MISSING: 'DEPENDENCY_MISSING', NODE_INCOMPATIBLE: 'INVALID_RUNTIME',
  SYNTAX_ERROR: 'COMPILATION_FAILED', RUNTIME_ERROR: 'RUNTIME_FAILED',
  PROTOCOL_FAILURE: 'INTERNAL_ERROR', JOB_MEMORY_LIMIT: 'JOB_MEMORY_LIMIT',
  OUTPUT_LIMIT: 'OUTPUT_LIMIT', INFRASTRUCTURE_FAILURE: 'INTERNAL_ERROR',
} as const satisfies Record<Exclude<JavascriptFailureKind, 'TIMEOUT'>, ExerciseEndReason>)
export const JAVASCRIPT_TIMEOUT_END_REASON = Object.freeze({
  prepare: 'PREPARE_TIMEOUT', compile: 'COMPILE_TIMEOUT', execute: 'EXECUTE_TIMEOUT', operation: 'OPERATION_TIMEOUT',
} as const satisfies Partial<Record<JavascriptFailurePhase, ExerciseEndReason>>)

/** No exception message, raw stack, host path or engine-dependent diagnostic code. */
export interface JavascriptDiagnostic {
  code: 'SYNTAX_ERROR'
  source: 'solution' | 'harness'
  line: number | null
  column: number | null
}
export interface JavascriptSampleSchema {
  parameterTypes: readonly ExerciseType[]
  returnType: ExerciseType
  sampleCount: number
}
/** One UTF-8 JSON document on stdin, followed by EOF. Schema stays Main-owned. */
export interface JavascriptHarnessRequest {
  protocolVersion: typeof JAVASCRIPT_HARNESS_VERSION
  caseIndex: number
  args: ExerciseValue[]
}
/** One stdout JSON document. Trusted harness exit: RETURNED=0, FAILED=1. */
export type JavascriptHarnessResponse = {
  protocolVersion: typeof JAVASCRIPT_HARNESS_VERSION
  caseIndex: number
  stdout: string
  stderr: string
} & ({ outcome: 'RETURNED'; actual: ExerciseValue }
  | { outcome: 'FAILED'; error: 'USER_EXCEPTION' | 'INVALID_RESULT' })
export interface JavascriptSyntaxResult {
  status: 'SUCCEEDED' | 'FAILED'
  exitCode: number | null
  diagnostics: JavascriptDiagnostic[]
  stdout: string
  stderr: string
  failure: JavascriptExecutionFailure | null
}
export interface JavascriptCaseResult {
  caseIndex: number
  outcome: 'RETURNED' | 'FAILED'
  actual: ExerciseValue | null
  stdout: string
  stderr: string
  exitCode: number | null
  failure: JavascriptExecutionFailure | null
}
/** Settled observations; never proof of cleanup or a Judge verdict. */
export interface JavascriptExecutionResult {
  syntax: JavascriptSyntaxResult | null
  cases: JavascriptCaseResult[]
  notRunCaseIndices: number[]
  failure: JavascriptExecutionFailure | null
}
