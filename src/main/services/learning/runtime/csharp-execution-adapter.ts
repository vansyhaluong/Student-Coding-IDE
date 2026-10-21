import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS, type ExerciseEndReason, type ExerciseRunRequest } from '../../../../shared/contracts/exercise'
import { validateExerciseRunRequest } from '../../../../shared/contracts/exercise-validation'
import { CSHARP_FAILURE_END_REASON, CSHARP_HARNESS_VERSION, type CsharpCaseResult, type CsharpExecutionFailure,
  type CsharpExecutionResult, type CsharpFailureKind, type CsharpSampleSchema } from '../../../../shared/contracts/csharp-execution'
import { parseCsharpHarnessResponse, validateCsharpCaseResult, validateCsharpExecutionResult,
  validateCsharpHarnessRequest } from '../../../../shared/contracts/csharp-execution-validation'
import type { Exercise } from '../../../../shared/contracts/practice'
import { DomainError } from '../../../errors/app-error'
import { exercises } from '../content/exercises'
import type { CsharpCompilation, CsharpExecutionAdapter, CsharpPreparedExecution, CsharpPreparationContext, CsharpSdkResolver } from './csharp-execution-contracts'
import { classifyExerciseTermination } from './exercise-session'
import { RoslynCsharpCompiler, csharpEnvironment } from './csharp-compiler'
import { FilesystemCsharpSdkResolver } from './csharp-sdk-resolver'
import { CsharpRuntimeFiles } from './csharp-runtime-files'
import { checkCsharpWork } from './csharp-compile-workspace'
import type { ExerciseExecutionPhase, ExercisePhaseContext, ExerciseTerminationEvidence } from './exercise-runtime-adapter'
import type { ExerciseWorkspace } from './exercise-workspace'
import { exerciseCoreError } from './exercise-limits'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './windows-exercise-adapter'
import type { LearningNativeBinding } from './windows-exercise-native'

/** One operation; Core orchestrates one admitted execute phase per Main catalogue sample. */
export class WindowsCsharpExecutionAdapter implements CsharpExecutionAdapter {
  private readonly compiler: RoslynCsharpCompiler
  private readonly execution: WindowsExerciseRuntimeAdapter
  private readonly request: ExerciseRunRequest
  private readonly exercise: Exercise
  private readonly schema: CsharpSampleSchema
  private prepared?: CsharpPreparedExecution
  private compilation?: CsharpCompilation
  private observation: CsharpExecutionResult = { compile: null, cases: [], notRunCaseIndices: [], failure: null }
  private plan: LearningProcessSpec | null = null
  private sealed = false
  private active = false
  private stage = 0
  private barrierVerified = false
  private verifying = false
  private discarded = false
  private operationSignal?: AbortSignal
  private readonly runtimeFiles = new CsharpRuntimeFiles()
  constructor(request: Readonly<ExerciseRunRequest>, private readonly workspace: ExerciseWorkspace, native: LearningNativeBinding,
    private readonly resolver: CsharpSdkResolver = new FilesystemCsharpSdkResolver(), catalogue: readonly Exercise[] = exercises,
    private readonly resultEnvelopeBytes = 0) {
    const checked = validateExerciseRunRequest(request), exercise = catalogue.find(e => e.id === request.exerciseId)
    if (!checked.ok || checked.value.language !== 'csharp' || !exercise) throw exerciseCoreError('INTERNAL_ERROR')
    this.request = checked.value; this.exercise = structuredClone(exercise)
    this.schema = { parameterTypes: this.exercise.parameters.map(p => p.type), returnType: this.exercise.returnType, sampleCount: this.exercise.samples.length }
    this.observation.notRunCaseIndices = this.remaining(0)
    this.compiler = new RoslynCsharpCompiler(native, workspace)
    this.execution = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'execute' ? this.plan : null, csharpEnvironment(workspace))
  }
  result(): CsharpExecutionResult {
    if (this.discarded || this.ownerInvalidated()) throw exerciseCoreError('RESULT_INVALIDATED')
    if (this.active && this.stage === 3) throw exerciseCoreError('RESULT_PENDING')
    const failure = !this.observation.failure && this.abortReason() === 'OPERATION_TIMEOUT'
      ? this.failure('TIMEOUT', 'operation') : this.observation.failure
    const checked = validateCsharpExecutionResult({ ...this.observation, failure }, this.schema)
    if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
    return checked.value
  }
  private remaining(from: number): number[] { return Array.from({ length: this.schema.sampleCount - from }, (_, i) => from + i) }
  private abortReason(): unknown {
    return this.operationSignal?.reason instanceof DomainError ? this.operationSignal.reason.details?.reason : undefined
  }
  private ownerInvalidated(): boolean { return ['OWNER_LOST', 'CONTEXT_CHANGED', 'LEARNING_LEFT', 'SHUTDOWN'].includes(String(this.abortReason())) }
  hasNextCase(): boolean {
    return !this.sealed && !this.active && !this.observation.failure && this.compilation?.result.status === 'SUCCEEDED'
      && this.observation.cases.length < this.schema.sampleCount
  }
  private failure(kind: CsharpFailureKind, phase: CsharpExecutionFailure['phase'], index = this.observation.cases.length): CsharpExecutionFailure {
    return { kind, phase, caseIndex: phase === 'execute' ? index : null }
  }
  async verifyBetweenCases(context: CsharpPreparationContext): Promise<void> {
    if (this.active || this.verifying || this.sealed || this.observation.failure || this.stage < 2) throw exerciseCoreError('ADMISSION_CLOSED')
    this.verifying = true; this.barrierVerified = false
    try {
      checkCsharpWork(context)
      const evidence = await this.evidence()
      checkCsharpWork(context)
      if (classifyExerciseTermination(evidence) !== 'VERIFIED') throw exerciseCoreError('PROCESS_UNRESOLVED')
      this.barrierVerified = true
    } catch (error) {
      if (!context.signal.aborted) this.observation.failure = this.failure('INFRASTRUCTURE_FAILURE', 'cleanup')
      throw error
    } finally { this.verifying = false }
  }
  private reject(failure: CsharpExecutionFailure): never {
    this.observation.failure = failure
    throw exerciseCoreError(failure.kind === 'TIMEOUT' ? failure.phase === 'operation' ? 'OPERATION_TIMEOUT'
      : failure.phase === 'execute' ? 'EXECUTE_TIMEOUT' : failure.phase === 'compile' ? 'COMPILE_TIMEOUT' : 'PREPARE_TIMEOUT'
      : CSHARP_FAILURE_END_REASON[failure.kind])
  }
  async runPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<void> {
    const stage = phase === 'prepare' ? 1 : phase === 'compile' ? 2 : 3
    const allowed = phase === 'execute' ? this.stage >= 2 && this.hasNextCase() && this.barrierVerified : stage === this.stage + 1
    if (this.sealed || this.active || this.verifying || !allowed || context.signal.aborted
      || this.operationSignal && this.operationSignal !== context.signal) throw exerciseCoreError('ADMISSION_CLOSED')
    this.operationSignal ??= context.signal
    this.active = true; this.stage = stage
    try {
      checkCsharpWork(context)
      if (phase === 'prepare') {
        const sdk = await this.resolver.resolve(context); checkCsharpWork(context)
        if (sdk.state !== 'AVAILABLE') this.reject(this.failure(sdk.state === 'MISSING' ? 'SDK_MISSING' : 'SDK_INCOMPATIBLE', 'prepare'))
        for (let i = 0; i < this.schema.sampleCount; i++) {
          checkCsharpWork(context)
          const request = validateCsharpHarnessRequest({ protocolVersion: CSHARP_HARNESS_VERSION, caseIndex: i,
            args: this.exercise.samples[i]?.args }, this.schema, i)
          if (!request.ok) this.reject(this.failure('INFRASTRUCTURE_FAILURE', 'prepare'))
        }
        await this.runtimeFiles.capture(sdk.selection, context)
        this.prepared = { workspace: this.workspace, sdk: sdk.selection, exercise: this.exercise, code: this.request.code, schema: this.schema }
      } else if (phase === 'compile') {
        if (!this.prepared) throw exerciseCoreError('INTERNAL_ERROR')
        this.compilation = await this.compiler.compile(this.prepared, context)
        this.observation.compile = this.compilation.result
        if (Buffer.byteLength(JSON.stringify(this.observation), 'utf8') > EXERCISE_LIMITS.outputBytes - this.resultEnvelopeBytes) {
          const failure = this.failure('OUTPUT_LIMIT', 'compile')
          this.compilation = { artifact: null, result: { status: 'FAILED', exitCode: this.compilation.result.exitCode,
            diagnostics: [], stdout: '', stderr: '', failure } }
          this.observation.compile = this.compilation.result
        }
        if (this.compilation.result.failure) this.reject(this.compilation.result.failure)
      } else {
        this.barrierVerified = false
        await this.execute(context)
      }
    } catch (error) {
      if (context.signal.aborted) throw error // Core lifecycle reason remains authoritative.
      if (!this.observation.failure && phase !== 'execute') {
        const why = error instanceof DomainError ? error.details?.reason : undefined
        this.reject(this.failure(why === 'PHASE_DEADLINE' || performance.now() >= context.deadline ? 'TIMEOUT' : 'INFRASTRUCTURE_FAILURE', phase))
      }
      throw error
    } finally { this.active = false }
  }
  private async execute(context: ExercisePhaseContext): Promise<void> {
    const caseIndex = this.observation.cases.length
    const phase = { ...context, deadline: Math.min(context.deadline, performance.now() + EXERCISE_LIMITS.executeCaseMs) }
    let bytes = 0, observing = true, overflow = false, processAttempted = false
    const stdout: Buffer[] = []
    const failed = (kind: CsharpFailureKind, operation = false): CsharpCaseResult => ({ caseIndex, outcome: 'FAILED', actual: null,
      stdout: '', stderr: '', exitCode: processAttempted ? this.execution.processResult()?.exitCode ?? null : null,
      failure: this.failure(kind, operation ? 'operation' : 'execute', caseIndex) })
    let result: CsharpCaseResult
    try {
      if (!this.prepared || !this.compilation?.artifact || this.compilation.result.status !== 'SUCCEEDED'
        || context.jobMemoryBytes !== EXERCISE_LIMITS.executeJobMemoryBytes) throw exerciseCoreError('INTERNAL_ERROR')
      checkCsharpWork(phase)
      const artifact = this.compilation.artifact
      await this.compiler.revalidateArtifact(artifact, phase)
      await this.runtimeFiles.validate(phase)
      const input = validateCsharpHarnessRequest({ protocolVersion: CSHARP_HARNESS_VERSION, caseIndex,
        args: this.exercise.samples[caseIndex].args }, this.schema, caseIndex)
      if (!input.ok) throw exerciseCoreError('INTERNAL_ERROR')
      this.plan = { executable: this.prepared.sdk.dotnetPath, cwd: dirname(artifact.assemblyPath),
        args: ['exec', '--fx-version', this.prepared.sdk.runtimeVersion, '--roll-forward', 'Disable',
          '--runtimeconfig', artifact.runtimeConfigPath, artifact.assemblyPath], stdin: JSON.stringify(input.value),
        observeBytes: (stream, chunk) => {
          if (!observing || phase.signal.aborted) return
          bytes += chunk.length
          context.output(stream, '', chunk.length) // Physical bytes, before decoding/parsing or redaction.
          if (bytes > EXERCISE_LIMITS.outputBytes) { overflow = true; throw exerciseCoreError('OUTPUT_LIMIT') }
          if (!phase.signal.aborted && stream === 'stdout') stdout.push(Buffer.from(chunk))
        } }
      processAttempted = true
      const process = await this.execution.runProcessPhase('execute', { ...phase, output: () => {} })
      checkCsharpWork(phase)
      if (!process || !process.observerSettled || !process.processExited || process.failure && process.failure !== 'NONZERO_EXIT') throw exerciseCoreError('INTERNAL_ERROR')
      if (process.exitCode !== 0) result = failed('RUNTIME_ERROR')
      else {
        let decoded: string | undefined
        try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(stdout)) } catch { /* Untrusted malformed response, not host metadata. */ }
        const response = decoded === undefined ? null : parseCsharpHarnessResponse(decoded, this.schema, caseIndex)
        result = response?.ok ? { caseIndex, outcome: response.value.outcome,
          actual: response.value.outcome === 'RETURNED' ? response.value.actual : null,
          stdout: response.value.stdout, stderr: response.value.stderr, exitCode: 0,
          failure: response.value.outcome === 'RETURNED' ? null : this.failure('RUNTIME_ERROR', 'execute') } : failed('RUNTIME_ERROR')
      }
      checkCsharpWork(phase) // Parsing/validation is inside the original execute deadline too.
    } catch (error) {
      const reason = phase.signal.reason instanceof DomainError ? phase.signal.reason.details?.reason : undefined
      const why = error instanceof DomainError ? error.details?.reason : undefined
      if (reason === 'OPERATION_TIMEOUT') result = failed('TIMEOUT', true)
      else if (reason === 'OUTPUT_LIMIT' || overflow || why === 'OUTPUT_LIMIT') result = failed('OUTPUT_LIMIT')
      else if (reason === 'EXECUTE_TIMEOUT' || why === 'PHASE_DEADLINE' || performance.now() >= phase.deadline) result = failed('TIMEOUT')
      else if (this.execution.processResult()?.jobMemoryLimitObserved) result = failed('JOB_MEMORY_LIMIT')
      else if (phase.signal.aborted || this.sealed) { this.discarded = true; throw error }
      else result = failed('INFRASTRUCTURE_FAILURE')
    } finally { observing = false; this.plan = null }
    if (!this.fits(result)) result = failed('OUTPUT_LIMIT')
    if (!validateCsharpCaseResult(result, this.schema).ok) result = failed('INFRASTRUCTURE_FAILURE')
    // A synchronous result guard cannot turn a late successful response into success.
    if (!result.failure && (performance.now() >= phase.deadline || phase.signal.aborted)) {
      if (phase.signal.aborted) { this.discarded = true; throw phase.signal.reason }
      result = failed('TIMEOUT')
    }
    this.observation.cases.push(result); this.observation.notRunCaseIndices = this.remaining(caseIndex + 1)
    this.observation.failure = result.failure
    if (result.failure) this.reject(result.failure)
  }
  private fits(result: CsharpCaseResult): boolean {
    const cases = [...this.observation.cases, result], remaining = this.remaining(cases.length)
    const size = (rows: CsharpCaseResult[], notRunCaseIndices: number[], failure: CsharpExecutionFailure | null) =>
      Buffer.byteLength(JSON.stringify({ compile: this.observation.compile, cases: rows, notRunCaseIndices, failure }), 'utf8') <= EXERCISE_LIMITS.outputBytes - this.resultEnvelopeBytes
    if (!size(cases, remaining, result.failure)) return false
    if (result.failure) return true
    // Reserve representation space for real later failures; never store synthetic results.
    if (!size(cases, remaining, this.failure('INFRASTRUCTURE_FAILURE', 'cleanup'))) return false
    if (remaining.length) {
      const failure = this.failure('INFRASTRUCTURE_FAILURE', 'execute', cases.length)
      return size([...cases, { caseIndex: cases.length, outcome: 'FAILED', actual: null, stdout: '', stderr: '', exitCode: 0xffff_ffff, failure }], remaining.slice(1), failure)
    }
    return true
  }
  private get runtimes() { return [this.compiler.runtime, this.execution] }
  private async all(action: (runtime: WindowsExerciseRuntimeAdapter) => Promise<void>): Promise<void> {
    const results = await Promise.allSettled(this.runtimes.map(action))
    const error = results.find(r => r.status === 'rejected')
    if (error?.status === 'rejected') throw error.reason
  }
  async terminate(reason: ExerciseEndReason): Promise<void> { this.sealed = true; await this.all(r => r.terminate(reason)) }
  async settleObservers(): Promise<void> { await this.all(r => r.settleObservers()) }
  async evidence(): Promise<ExerciseTerminationEvidence> {
    const samples = await Promise.all(this.runtimes.map(r => r.evidence()))
    return { members: samples.flatMap(s => s.members), retained: samples.flatMap(s => s.retained),
      activeProcesses: samples.reduce((n, s) => n + s.activeProcesses, 0), totalProcesses: samples.reduce((n, s) => n + s.totalProcesses, 0),
      coverageComplete: samples.every(s => s.coverageComplete), observerSettled: samples.every(s => s.observerSettled),
      unresolvedErrors: samples.some(s => s.unresolvedErrors) }
  }
  async release(): Promise<void> { await this.all(r => r.release()) }
  async closeHandles(): Promise<void> { await this.all(r => r.closeHandles()) }
  diagnostics() { return { compile: this.compiler.runtime.diagnostics(), execute: this.execution.diagnostics() } }
}
