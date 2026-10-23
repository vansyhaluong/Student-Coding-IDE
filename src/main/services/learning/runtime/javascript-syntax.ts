import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import type { JavascriptExecutionFailure, JavascriptSyntaxResult } from '../../../../shared/contracts/javascript-execution'
import { validateJavascriptSyntaxResult } from '../../../../shared/contracts/javascript-execution-validation'
import { DomainError } from '../../../errors/app-error'
import type { JavascriptHarnessFiles, JavascriptNodeResolver, JavascriptPreparedExecution, JavascriptSyntaxChecker } from './javascript-execution-contracts'
import type { ExercisePhaseContext, LearningProcessResult, LearningProcessResultPort } from './exercise-runtime-adapter'
import type { LearningProcessSpec } from './windows-exercise-adapter'
import { FixedJavascriptHarness } from './javascript-harness'
import { checkJavascriptWork } from './javascript-node-files'
import { exerciseCoreError } from './exercise-limits'

/** Main-only mapping; lifecycle invalidation is never fabricated as a student result. */
export function javascriptProcessFailure(context: ExercisePhaseContext, phase: 'prepare' | 'compile' | 'execute',
  error: unknown, process: LearningProcessResult | null): JavascriptExecutionFailure {
  const reason = context.signal.reason instanceof DomainError ? context.signal.reason.details?.reason : undefined
  const why = error instanceof DomainError ? error.details?.reason : undefined
  const failure = (kind: JavascriptExecutionFailure['kind']): JavascriptExecutionFailure => ({ kind, phase, caseIndex: phase === 'execute' ? 0 : null })
  if (reason === 'OPERATION_TIMEOUT') return { kind: 'TIMEOUT', phase: 'operation', caseIndex: null }
  if (reason === 'OUTPUT_LIMIT' || why === 'OUTPUT_LIMIT') return failure('OUTPUT_LIMIT')
  if (reason === 'PREPARE_TIMEOUT' || reason === 'COMPILE_TIMEOUT' || reason === 'EXECUTE_TIMEOUT'
    || why === 'PHASE_DEADLINE' || performance.now() >= context.deadline) return failure('TIMEOUT')
  if (process?.jobMemoryLimitObserved || reason === 'JOB_MEMORY_LIMIT' || why === 'JOB_MEMORY_LIMIT') return failure('JOB_MEMORY_LIMIT')
  if (context.signal.aborted) throw error
  return failure('INFRASTRUCTURE_FAILURE')
}
/** Private fixed syntax frames; no engine message/stack/path parsing or contract extension. */
export function javascriptSyntaxObservation(stdout: Uint8Array, stderrBytes: number, exitCode: number | null): JavascriptSyntaxResult {
  const base = { exitCode, diagnostics: [], stdout: '', stderr: '' }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stdout)
    if (!stderrBytes && exitCode === 0 && text === '{"status":"SUCCEEDED"}') return { ...base, status: 'SUCCEEDED', failure: null }
    if (!stderrBytes && exitCode === 1 && text === '{"status":"FAILED","code":"SYNTAX_ERROR"}') return {
      ...base, status: 'FAILED', diagnostics: [{ code: 'SYNTAX_ERROR', source: 'solution', line: null, column: null }],
      failure: { kind: 'SYNTAX_ERROR', phase: 'compile', caseIndex: null },
    }
  } catch { /* Invalid UTF-8 is protocol failure, never a source diagnostic. */ }
  return { ...base, status: 'FAILED', failure: { kind: 'PROTOCOL_FAILURE', phase: 'compile', caseIndex: null } }
}
export class NodeJavascriptSyntaxChecker implements JavascriptSyntaxChecker {
  private plan: LearningProcessSpec | null = null
  private active = false
  constructor(private readonly harness: FixedJavascriptHarness, private readonly resolver: JavascriptNodeResolver) {}
  processSpec(): LearningProcessSpec | null { return this.plan }
  async check(input: JavascriptPreparedExecution, files: JavascriptHarnessFiles, context: ExercisePhaseContext,
    process: LearningProcessResultPort): Promise<JavascriptSyntaxResult> {
    if (this.active) throw exerciseCoreError('ADMISSION_CLOSED')
    this.active = true
    let observing = true, attempted = false, bytes = 0, stderr = 0
    const chunks: Buffer[] = []
    let observation: JavascriptSyntaxResult
    try {
      if (context.jobMemoryBytes !== EXERCISE_LIMITS.compileJobMemoryBytes) throw exerciseCoreError('QUOTA_CONFIGURATION')
      await this.harness.revalidate(input, files, context); await this.resolver.revalidate(input.node, context)
      checkJavascriptWork(context)
      this.plan = { executable: input.node.canonicalPath, args: [files.harnessPath, 'syntax'], cwd: input.workspace.path,
        observeBytes: (stream, chunk) => {
          if (!observing || context.signal.aborted) return
          context.output(stream, '', chunk.length); bytes += chunk.length
          if (bytes > EXERCISE_LIMITS.outputBytes) throw exerciseCoreError('OUTPUT_LIMIT')
          if (stream === 'stdout') chunks.push(Buffer.from(chunk)); else stderr += chunk.length
        } }
      attempted = true
      const result = await process.runProcessPhase('compile', { ...context, output: () => {} })
      checkJavascriptWork(context)
      if (!result || !result.processExited || !result.observerSettled || !result.stdoutSettled || !result.stderrSettled
        || result.failure && result.failure !== 'NONZERO_EXIT') throw exerciseCoreError('INTERNAL_ERROR')
      observation = javascriptSyntaxObservation(Buffer.concat(chunks), stderr, result.exitCode)
      checkJavascriptWork(context)
    } catch (error) {
      observation = { status: 'FAILED', exitCode: attempted ? process.processResult()?.exitCode ?? null : null,
        diagnostics: [], stdout: '', stderr: '', failure: javascriptProcessFailure(context, 'compile', error, attempted ? process.processResult() : null) }
    } finally { observing = false; this.plan = null; this.active = false }
    const checked = validateJavascriptSyntaxResult(observation, input.schema.sampleCount)
    if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
    return checked.value
  }
}
