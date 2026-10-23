import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS, type ExerciseEndReason, type ExerciseRunRequest } from '../../../../shared/contracts/exercise'
import { validateExerciseRunRequest } from '../../../../shared/contracts/exercise-validation'
import { JAVASCRIPT_FAILURE_END_REASON, JAVASCRIPT_TIMEOUT_END_REASON, type JavascriptCaseResult,
  type JavascriptExecutionFailure, type JavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution'
import { parseJavascriptHarnessResponse, validateJavascriptCaseResult, validateJavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution-validation'
import type { Exercise } from '../../../../shared/contracts/practice'
import { exercises } from '../content/exercises'
import { DomainError } from '../../../errors/app-error'
import type { JavascriptExecutionAdapter, JavascriptHarnessFiles, JavascriptNodeResolver, JavascriptPreparedExecution, JavascriptPreparationContext } from './javascript-execution-contracts'
import type { ExerciseExecutionPhase, ExercisePhaseContext, ExerciseRuntimeAdapter, ExerciseTerminationEvidence } from './exercise-runtime-adapter'
import { exerciseCoreError } from './exercise-limits'
import { FixedJavascriptHarness } from './javascript-harness'
import { LearningNodeResolver } from './javascript-node-resolver'
import { WindowsLearningNodeProbe } from './javascript-node-probe'
import { checkJavascriptWork } from './javascript-node-files'
import { NodeJavascriptSyntaxChecker, javascriptProcessFailure } from './javascript-syntax'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './windows-exercise-adapter'
import type { LearningNativeBinding } from './windows-exercise-native'
import type { ExerciseWorkspace } from './exercise-workspace'
import { classifyExerciseTermination } from './exercise-session'

/** One operation; Core admits one execute phase and VERIFIED barrier per catalogue sample. */
export class WindowsJavascriptExecutionAdapter implements JavascriptExecutionAdapter {
  private readonly request: ExerciseRunRequest
  private readonly exercise: Exercise
  private readonly harness = new FixedJavascriptHarness()
  private readonly probe: WindowsLearningNodeProbe
  private readonly process: WindowsExerciseRuntimeAdapter
  private readonly syntax: NodeJavascriptSyntaxChecker
  private prepared?: JavascriptPreparedExecution
  private files?: JavascriptHarnessFiles
  private plan: LearningProcessSpec | null = null
  private stage = 0
  private active = false
  private verifying = false
  private barrier = false
  private sealed = false
  private operationSignal?: AbortSignal
  private observation: JavascriptExecutionResult
  constructor(request: Readonly<ExerciseRunRequest>, private readonly workspace: ExerciseWorkspace, native: LearningNativeBinding,
    private readonly resolver: JavascriptNodeResolver = new LearningNodeResolver(), catalogue: readonly Exercise[] = exercises,
    private readonly snapshotReserveBytes = 0) {
    const checked = validateExerciseRunRequest(request), exercise = catalogue.find(e => e.id === request.exerciseId)
    if (!checked.ok || checked.value.language !== 'javascript' || !exercise) throw exerciseCoreError('INTERNAL_ERROR')
    this.request = checked.value; this.exercise = structuredClone(exercise)
    this.observation = { syntax: null, cases: [], notRunCaseIndices: this.remaining(0), failure: null }
    this.probe = new WindowsLearningNodeProbe(native, workspace)
    this.syntax = new NodeJavascriptSyntaxChecker(this.harness, resolver)
    this.process = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'compile' ? this.syntax.processSpec() : phase === 'execute' ? this.plan : null,
      { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: workspace.path, TMP: workspace.path })
  }
  private remaining(from: number): number[] { return Array.from({ length: this.exercise.samples.length - from }, (_, i) => i + from) }
  private get schema() { return { parameterTypes: this.exercise.parameters.map(p => p.type), returnType: this.exercise.returnType, sampleCount: this.exercise.samples.length } }
  hasNextCase(): boolean {
    return !this.sealed && !this.active && !this.verifying && !this.operationSignal?.aborted
      && !this.observation.failure && this.observation.syntax?.status === 'SUCCEEDED'
      && this.observation.cases.length < this.schema.sampleCount
  }
  private reject(failure: JavascriptExecutionFailure): never {
    this.observation.failure = failure
    throw exerciseCoreError(failure.kind === 'TIMEOUT' ? JAVASCRIPT_TIMEOUT_END_REASON[failure.phase as keyof typeof JAVASCRIPT_TIMEOUT_END_REASON]
      : JAVASCRIPT_FAILURE_END_REASON[failure.kind])
  }
  private ownerInvalidated(): boolean {
    const reason = this.operationSignal?.reason instanceof DomainError ? this.operationSignal.reason.details?.reason : undefined
    return ['OWNER_LOST', 'CONTEXT_CHANGED', 'LEARNING_LEFT', 'SHUTDOWN'].includes(String(reason))
  }
  result(): JavascriptExecutionResult {
    if (this.ownerInvalidated()) throw exerciseCoreError('RESULT_INVALIDATED')
    if (this.active || this.verifying) throw exerciseCoreError('RESULT_PENDING')
    const reason = this.operationSignal?.reason instanceof DomainError ? this.operationSignal.reason.details?.reason : undefined
    const observation = reason === 'OPERATION_TIMEOUT' && !this.observation.failure
      ? { ...this.observation, failure: { kind: 'TIMEOUT', phase: 'operation', caseIndex: null } } : this.observation
    const checked = validateJavascriptExecutionResult(observation, this.schema)
    if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
    return checked.value
  }
  async verifyBetweenCases(context: JavascriptPreparationContext): Promise<void> {
    if (this.active || this.verifying || this.sealed || !this.stage || this.observation.failure
      || context.signal !== this.operationSignal) throw exerciseCoreError('ADMISSION_CLOSED')
    this.verifying = true; this.barrier = false
    try {
      checkJavascriptWork(context)
      if (classifyExerciseTermination(await this.evidence()) !== 'VERIFIED') throw exerciseCoreError('PROCESS_UNRESOLVED')
      checkJavascriptWork(context); this.barrier = true
    } catch (error) {
      if (!context.signal.aborted) this.observation.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
      throw error
    } finally { this.verifying = false }
  }
  async runPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<void> {
    const next = phase === 'prepare' ? 1 : phase === 'compile' ? 2 : 3
    if (this.active || this.verifying || this.sealed || (phase === 'execute' ? !this.hasNextCase() : next !== this.stage + 1) || phase !== 'prepare' && !this.barrier
      || this.observation.failure || context.signal.aborted || this.operationSignal && this.operationSignal !== context.signal) throw exerciseCoreError('ADMISSION_CLOSED')
    this.active = true; this.stage = next; this.barrier = false; this.operationSignal ??= context.signal
    try {
      checkJavascriptWork(context)
      if (phase === 'prepare') {
        const node = await this.resolver.resolve(context, this.probe)
        if (node.state !== 'AVAILABLE') this.reject({ kind: node.state === 'MISSING' ? 'NODE_MISSING' : 'NODE_INCOMPATIBLE', phase, caseIndex: null })
        this.prepared = { workspace: this.workspace, node: node.selection, exercise: this.exercise,
          code: this.request.code, sourceRevision: this.request.sourceRevision, schema: this.schema }
        for (let i = 0; i < this.schema.sampleCount; i++) {
          checkJavascriptWork(context)
          this.harness.request(this.prepared, i)
        }
        this.files = await this.harness.prepare(this.prepared, context)
      } else if (phase === 'compile') {
        if (!this.prepared || !this.files) throw exerciseCoreError('INTERNAL_ERROR')
        this.observation.syntax = await this.syntax.check(this.prepared, this.files, context, this.process)
        if (this.observation.syntax.failure) this.reject(this.observation.syntax.failure)
      } else await this.execute(context)
    } catch (error) {
      // Core can abort Prepare before the resolver/probe rejection reaches us.
      // Only that deadline abort is reportable here; lifecycle invalidations stay suppressed.
      const prepareTimedOut = phase === 'prepare' && context.signal.reason instanceof DomainError
        && context.signal.reason.details?.reason === 'PREPARE_TIMEOUT'
      if (this.observation.failure || context.signal.aborted && !prepareTimedOut) throw error
      const mapped = javascriptProcessFailure(context, phase, error, phase === 'prepare' ? null : this.process.processResult())
      const failure = mapped.phase === 'execute' ? { ...mapped, caseIndex: this.observation.cases.length } : mapped
      if (phase === 'compile' && this.observation.syntax === null) this.observation.syntax = {
        status: 'FAILED', exitCode: null, diagnostics: [], stdout: '', stderr: '', failure,
      }
      if (phase === 'execute') {
        this.observation.cases.push({ caseIndex: this.observation.cases.length, outcome: 'FAILED', actual: null, stdout: '', stderr: '', exitCode: null, failure })
        this.observation.notRunCaseIndices = this.remaining(this.observation.cases.length)
      }
      this.reject(failure)
    } finally { this.active = false }
  }
  private async execute(context: ExercisePhaseContext): Promise<void> {
    const caseIndex = this.observation.cases.length
    const mapFailure = (error: unknown): JavascriptExecutionFailure => {
      const failure = javascriptProcessFailure(context, 'execute', error, attempted ? this.process.processResult() : null)
      return failure.phase === 'execute' ? { ...failure, caseIndex } : failure
    }
    const chunks: Buffer[] = []
    let stderr = 0, bytes = 0, observing = true, attempted = false
    const failed = (failure: JavascriptExecutionFailure): JavascriptCaseResult => ({ caseIndex, outcome: 'FAILED', actual: null,
      stdout: '', stderr: '', exitCode: attempted ? this.process.processResult()?.exitCode ?? null : null, failure })
    let row: JavascriptCaseResult
    try {
      if (!this.prepared || !this.files || context.jobMemoryBytes !== EXERCISE_LIMITS.executeJobMemoryBytes
        || this.observation.syntax?.status !== 'SUCCEEDED') throw exerciseCoreError('INTERNAL_ERROR')
      await this.harness.revalidate(this.prepared, this.files, context)
      await this.resolver.revalidate(this.prepared.node, context)
      const request = this.harness.request(this.prepared, caseIndex)
      checkJavascriptWork(context)
      this.plan = { executable: this.prepared.node.canonicalPath, args: [this.files.harnessPath, 'execute'],
        cwd: this.workspace.path, stdin: JSON.stringify(request), observeBytes: (stream, chunk) => {
          if (!observing || context.signal.aborted) return
          context.output(stream, '', chunk.length); bytes += chunk.length
          if (bytes > EXERCISE_LIMITS.outputBytes) throw exerciseCoreError('OUTPUT_LIMIT')
          if (stream === 'stdout') chunks.push(Buffer.from(chunk)); else stderr += chunk.length
        } }
      attempted = true
      const process = await this.process.runProcessPhase('execute', { ...context, output: () => {} })
      checkJavascriptWork(context)
      if (!process || !process.processExited || !process.observerSettled || !process.stdoutSettled || !process.stderrSettled
        || process.failure && process.failure !== 'NONZERO_EXIT') throw exerciseCoreError('INTERNAL_ERROR')
      const response = stderr ? null : parseJavascriptHarnessResponse(Buffer.concat(chunks), this.schema, caseIndex, process.exitCode)
      row = response?.ok ? { caseIndex, outcome: response.value.outcome,
        actual: response.value.outcome === 'RETURNED' ? response.value.actual : null, stdout: response.value.stdout,
        stderr: response.value.stderr, exitCode: process.exitCode,
        failure: response.value.outcome === 'RETURNED' ? null : { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex } }
        : failed({ kind: 'PROTOCOL_FAILURE', phase: 'execute', caseIndex })
      checkJavascriptWork(context)
    } catch (error) { row = failed(mapFailure(error)) }
    finally { observing = false; this.plan = null }
    if (!validateJavascriptCaseResult(row, this.schema).ok) throw exerciseCoreError('INTERNAL_ERROR')
    if (!this.fits(row)) row = failed({ kind: 'OUTPUT_LIMIT', phase: 'execute', caseIndex })
    if (!row.failure && (context.signal.aborted || performance.now() >= context.deadline)) {
      row = failed(mapFailure(exerciseCoreError('PHASE_DEADLINE')))
    }
    this.observation.cases.push(row); this.observation.notRunCaseIndices = this.remaining(caseIndex + 1); this.observation.failure = row.failure
    if (row.failure) this.reject(row.failure)
  }
  private fits(row: JavascriptCaseResult): boolean {
    const cases = [...this.observation.cases, row], remaining = this.remaining(cases.length)
    const fits = (rows: JavascriptCaseResult[], suffix: number[], failure: JavascriptExecutionFailure | null) => {
      const result = { syntax: this.observation.syntax, cases: rows, notRunCaseIndices: suffix, failure }
      return validateJavascriptExecutionResult(result, this.schema).ok
        && (!this.snapshotReserveBytes || Buffer.byteLength(JSON.stringify({ schema: this.schema, result }), 'utf8') + this.snapshotReserveBytes <= EXERCISE_LIMITS.outputBytes)
    }
    if (!fits(cases, remaining, row.failure)) return false
    if (row.failure) return true
    // Reserve representation space for later real failures without fabricating cases.
    if (!fits(cases, remaining, { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null })) return false
    if (!remaining.length) return true
    const failure: JavascriptExecutionFailure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'execute', caseIndex: cases.length }
    return fits([...cases, { caseIndex: cases.length, outcome: 'FAILED', actual: null,
      stdout: '', stderr: '', exitCode: 0xffff_ffff, failure }], remaining.slice(1), failure)
  }
  private get runtimes() { return [this.probe, this.process] }
  private async all(action: (runtime: ExerciseRuntimeAdapter) => Promise<void>): Promise<void> {
    const results = await Promise.allSettled(this.runtimes.map(action)), failed = results.find(r => r.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }
  async terminate(reason: ExerciseEndReason): Promise<void> { this.sealed = true; await this.all(r => r.terminate(reason)) }
  settleObservers() { return this.all(r => r.settleObservers()) }
  async evidence(): Promise<ExerciseTerminationEvidence> {
    const rows = await Promise.all(this.runtimes.map(r => r.evidence()))
    return { members: rows.flatMap(r => r.members), retained: rows.flatMap(r => r.retained),
      activeProcesses: rows.reduce((n, r) => n + r.activeProcesses, 0), totalProcesses: rows.reduce((n, r) => n + r.totalProcesses, 0),
      coverageComplete: rows.every(r => r.coverageComplete), observerSettled: rows.every(r => r.observerSettled),
      unresolvedErrors: rows.some(r => r.unresolvedErrors) }
  }
  release() { return this.all(r => r.release()) }
  closeHandles() { return this.all(r => r.closeHandles()) }
  diagnostics() { return { probe: this.probe.diagnostics(), harness: this.process.diagnostics() } }
}
