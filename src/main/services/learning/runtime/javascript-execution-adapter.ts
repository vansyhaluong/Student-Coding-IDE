import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS, type ExerciseEndReason, type ExerciseRunRequest } from '../../../../shared/contracts/exercise'
import { validateExerciseRunRequest } from '../../../../shared/contracts/exercise-validation'
import { JAVASCRIPT_FAILURE_END_REASON, JAVASCRIPT_TIMEOUT_END_REASON, type JavascriptCaseResult,
  type JavascriptExecutionFailure, type JavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution'
import { parseJavascriptHarnessResponse, validateJavascriptCaseResult, validateJavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution-validation'
import type { Exercise } from '../../../../shared/contracts/practice'
import { exercises } from '../content/exercises'
import { DomainError } from '../../../errors/app-error'
import type { JavascriptExecutionAdapter, JavascriptHarnessFiles, JavascriptNodeResolver, JavascriptInputPreparedExecution, JavascriptPreparationContext,
  JavascriptOfficialInputLoader, JavascriptOfficialInputs, JavascriptOfficialExecutionEvidence } from './javascript-execution-contracts'
import { checkExecutionInput, checkExecutionSignature, type ExecutionPlan } from './execution-plan'
import type { OfficialCaseObservation } from './official-execution-contracts'
import { javascriptOfficialResponse } from './javascript-official-evidence'
import type { ExerciseExecutionPhase, ExercisePhaseContext, ExerciseRuntimeAdapter, ExerciseTerminationEvidence } from './exercise-runtime-adapter'
import { exerciseCoreError } from './exercise-limits'
import { FixedJavascriptHarness, javascriptInputRequest } from './javascript-harness'
import { LearningNodeResolver } from './javascript-node-resolver'
import { WindowsLearningNodeProbe } from './javascript-node-probe'
import { checkJavascriptWork } from './javascript-node-files'
import { NodeJavascriptSyntaxChecker, javascriptProcessFailure } from './javascript-syntax'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './windows-exercise-adapter'
import type { LearningNativeBinding } from './windows-exercise-native'
import type { ExerciseWorkspace } from './exercise-workspace'
import { classifyExerciseTermination } from './exercise-session'

/** One operation; Core admits one execute phase and VERIFIED barrier per catalogue sample. */
class JavascriptInputExecutionAdapter implements JavascriptExecutionAdapter {
  private readonly request: ExerciseRunRequest
  private source?: ExecutionPlan
  private readonly loadOfficial?: JavascriptOfficialInputLoader
  private officialInputs?: JavascriptOfficialInputs
  private readonly privateCases: OfficialCaseObservation[] = []
  private retainedInput?: Awaited<ReturnType<JavascriptOfficialInputs['representInput']>>
  private discarded = false
  private readonly harness = new FixedJavascriptHarness()
  private readonly probe: WindowsLearningNodeProbe
  private readonly process: WindowsExerciseRuntimeAdapter
  private readonly syntax: NodeJavascriptSyntaxChecker
  private prepared?: JavascriptInputPreparedExecution
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
    private readonly resolver: JavascriptNodeResolver, source: ExecutionPlan | JavascriptOfficialInputLoader,
    private readonly snapshotReserveBytes = 0) {
    const checked = validateExerciseRunRequest(request)
    if (!checked.ok || checked.value.language !== 'javascript') throw exerciseCoreError('INTERNAL_ERROR')
    this.request = checked.value
    if (typeof source === 'function') this.loadOfficial = source
    else this.source = source
    this.observation = { syntax: null, cases: [], notRunCaseIndices: this.remaining(0), failure: null }
    this.probe = new WindowsLearningNodeProbe(native, workspace)
    this.syntax = new NodeJavascriptSyntaxChecker(this.harness, resolver)
    this.process = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'compile' ? this.syntax.processSpec() : phase === 'execute' ? this.plan : null,
      { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: workspace.path, TMP: workspace.path })
  }
  private remaining(from: number): number[] { return Array.from({ length: this.schema.sampleCount - from }, (_, i) => i + from) }
  private get schema() { return { parameterTypes: this.source?.signature.parameters.map(p => p.type) ?? [], returnType: this.source?.signature.returnType ?? 'int32', sampleCount: this.source?.caseCount ?? 0 } }
  hasNextCase(): boolean {
    return !this.sealed && !this.discarded && !this.active && !this.verifying && !this.operationSignal?.aborted
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
    if (this.loadOfficial) throw exerciseCoreError('RESULT_INVALIDATED')
    return this.checkedResult()
  }
  private checkedResult(): JavascriptExecutionResult {
    if (this.discarded || this.ownerInvalidated()) throw exerciseCoreError('RESULT_INVALIDATED')
    if (this.active || this.verifying) throw exerciseCoreError('RESULT_PENDING')
    const reason = this.operationSignal?.reason instanceof DomainError ? this.operationSignal.reason.details?.reason : undefined
    const observation = reason === 'OPERATION_TIMEOUT' && !this.observation.failure
      ? { ...this.observation, failure: { kind: 'TIMEOUT', phase: 'operation', caseIndex: null } } : this.observation
    const checked = validateJavascriptExecutionResult(observation, this.schema)
    if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
    return checked.value
  }
  officialResult(): JavascriptOfficialExecutionEvidence {
    if (!this.loadOfficial || !this.source) throw exerciseCoreError('RESULT_PENDING')
    const result = this.checkedResult()
    return structuredClone({ syntax: result.syntax, cases: this.privateCases, notRunCaseIndices: result.notRunCaseIndices, failure: result.failure })
  }
  /** Borrowed service/driver evidence, including settled invalidated failures.
   * Separate from owner-guarded result delivery and never a public snapshot. */
  officialEvidence(): JavascriptOfficialExecutionEvidence {
    if (!this.loadOfficial || this.active || this.verifying) throw exerciseCoreError('RESULT_PENDING')
    const reason = this.operationSignal?.reason instanceof DomainError ? this.operationSignal.reason.details?.reason : undefined
    return { syntax: this.observation.syntax, cases: this.privateCases, notRunCaseIndices: this.remaining(this.privateCases.length),
      failure: !this.observation.failure && reason === 'OPERATION_TIMEOUT' ? { kind: 'TIMEOUT', phase: 'operation', caseIndex: null } : this.observation.failure }
  }
  async verifyBetweenCases(context: JavascriptPreparationContext): Promise<void> {
    if (this.active || this.verifying || this.sealed || !this.stage || this.observation.failure
      || context.signal !== this.operationSignal) throw exerciseCoreError('ADMISSION_CLOSED')
    this.verifying = true; this.barrier = false
    try {
      checkJavascriptWork(context)
      if (classifyExerciseTermination(await this.evidence()) !== 'VERIFIED') throw exerciseCoreError('PROCESS_UNRESOLVED')
      checkJavascriptWork(context)
      this.retainedInput?.release(); this.retainedInput = undefined
      this.barrier = true
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
        if (this.loadOfficial) {
          this.officialInputs = await this.loadOfficial(context); checkJavascriptWork(context)
          this.source = this.officialInputs.execution
          checkExecutionSignature(this.source.signature, this.source.caseCount)
          this.observation.notRunCaseIndices = this.remaining(0)
        }
        if (!this.source) throw exerciseCoreError('INTERNAL_ERROR')
        const node = await this.resolver.resolve(context, this.probe)
        if (node.state !== 'AVAILABLE') this.reject({ kind: node.state === 'MISSING' ? 'NODE_MISSING' : 'NODE_INCOMPATIBLE', phase, caseIndex: null })
        this.prepared = { workspace: this.workspace, node: node.selection, exerciseId: this.request.exerciseId, signature: this.source.signature,
          code: this.request.code, sourceRevision: this.request.sourceRevision, schema: this.schema }
        // Official input data was validated by the trusted reader. Serialize only
        // the current request inside Execute, never clone all cases in Prepare.
        for (let i = 0; !this.loadOfficial && i < this.schema.sampleCount; i++) {
          checkJavascriptWork(context)
          javascriptInputRequest(checkExecutionInput(this.source, i), this.schema, i)
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
    let privateCase: OfficialCaseObservation | undefined
    let borrow: Awaited<ReturnType<JavascriptOfficialInputs['representInput']>> | undefined
    let stderr = 0, bytes = 0, observing = true, attempted = false
    const failed = (failure: JavascriptExecutionFailure): JavascriptCaseResult => ({ caseIndex, outcome: 'FAILED', actual: null,
      stdout: '', stderr: '', exitCode: attempted ? this.process.processResult()?.exitCode ?? null : null, failure })
    let row: JavascriptCaseResult
    try {
      if (!this.prepared || !this.files || context.jobMemoryBytes !== EXERCISE_LIMITS.executeJobMemoryBytes
        || this.observation.syntax?.status !== 'SUCCEEDED') throw exerciseCoreError('INTERNAL_ERROR')
      await this.harness.revalidate(this.prepared, this.files, context)
      await this.resolver.revalidate(this.prepared.node, context)
      if (!this.source) throw exerciseCoreError('INTERNAL_ERROR')
      const args = checkExecutionInput(this.source, caseIndex)
      let stdin: string
      if (this.officialInputs) {
        borrow = await this.officialInputs.representInput(caseIndex)
        checkJavascriptWork(context)
        stdin = JSON.stringify(borrow.data)
      } else stdin = JSON.stringify(javascriptInputRequest(args, this.schema, caseIndex))
      checkExecutionInput(this.source, caseIndex)
      checkJavascriptWork(context)
      this.plan = { executable: this.prepared.node.canonicalPath, args: [this.files.harnessPath, 'execute'],
        cwd: this.workspace.path, stdin, observeBytes: (stream, chunk) => {
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
      if (this.loadOfficial) {
        privateCase = javascriptOfficialResponse(Buffer.concat(chunks), stderr, this.schema, caseIndex, process)
        row = privateCase.kind === 'RETURNED' ? { caseIndex, outcome: 'RETURNED', actual: privateCase.actual as JavascriptCaseResult['actual'],
          stdout: privateCase.stdout, stderr: privateCase.stderr, exitCode: 0, failure: null }
          : privateCase.kind === 'USER_EXCEPTION' || privateCase.kind === 'INVALID_RESULT'
            ? { ...failed({ kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex }), stdout: privateCase.stdout, stderr: privateCase.stderr }
            : failed({ kind: 'PROTOCOL_FAILURE', phase: 'execute', caseIndex })
      } else {
        const response = stderr ? null : parseJavascriptHarnessResponse(Buffer.concat(chunks), this.schema, caseIndex, process.exitCode)
        row = response?.ok ? { caseIndex, outcome: response.value.outcome,
        actual: response.value.outcome === 'RETURNED' ? response.value.actual : null, stdout: response.value.stdout,
        stderr: response.value.stderr, exitCode: process.exitCode,
        failure: response.value.outcome === 'RETURNED' ? null : { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex } }
        : failed({ kind: 'PROTOCOL_FAILURE', phase: 'execute', caseIndex })
      }
      checkJavascriptWork(context)
    } catch (error) {
      try { row = failed(mapFailure(error)) }
      catch (cancelled) {
        if (this.loadOfficial) this.privateCases.push({ caseIndex, language: 'javascript', kind: 'INTERRUPTED', reason: 'CANCELLED',
          process: attempted ? this.process.processResult() : null })
        throw cancelled
      }
    }
    finally {
      observing = false; this.plan = null
      // A failed/native-unresolved case keeps this one borrow until Core release.
      // Successful cases release it only at their VERIFIED barrier.
      if (borrow) { if (attempted) this.retainedInput = borrow; else borrow.release() }
    }
    if (!validateJavascriptCaseResult(row, this.schema).ok) throw exerciseCoreError('INTERNAL_ERROR')
    if (!this.fits(row)) { row = failed({ kind: 'OUTPUT_LIMIT', phase: 'execute', caseIndex }); privateCase = undefined }
    if (!row.failure && (context.signal.aborted || performance.now() >= context.deadline)) {
      row = failed(mapFailure(exerciseCoreError('PHASE_DEADLINE')))
    }
    if (this.loadOfficial) {
      if (!row.failure) {
        try { checkExecutionInput(this.source!, caseIndex) }
        catch (error) { this.discarded = true; throw error }
      }
      if (!privateCase || row.failure && row.failure.kind !== 'RUNTIME_ERROR' && row.failure.kind !== 'PROTOCOL_FAILURE') {
        const kind = row.failure?.kind
        privateCase = { caseIndex, language: 'javascript', process: attempted ? this.process.processResult() : null,
          ...(kind === 'TIMEOUT' || kind === 'OUTPUT_LIMIT' || kind === 'JOB_MEMORY_LIMIT'
            ? { kind: 'INTERRUPTED' as const, reason: kind } : { kind: 'INFRASTRUCTURE_FAILURE' as const, reason: 'UNKNOWN' as const }) }
      }
      this.privateCases.push(privateCase)
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
  async release() {
    await this.all(r => r.release())
    this.retainedInput?.release(); this.retainedInput = undefined
  }
  closeHandles() { return this.all(r => r.closeHandles()) }
  diagnostics() { return { probe: this.probe.diagnostics(), harness: this.process.diagnostics() } }
}

/** Existing public Run constructor and result mapping. */
export class WindowsJavascriptExecutionAdapter extends JavascriptInputExecutionAdapter {
  constructor(request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace, native: LearningNativeBinding,
    resolver: JavascriptNodeResolver = new LearningNodeResolver(), catalogue: readonly Exercise[] = exercises, snapshotReserveBytes = 0) {
    const exercise = catalogue.find(e => e.id === request.exerciseId)
    if (!exercise) throw exerciseCoreError('INTERNAL_ERROR')
    const copy = structuredClone(exercise)
    super(request, workspace, native, resolver, { signature: { functionName: copy.functionName, parameters: copy.parameters, returnType: copy.returnType },
      caseCount: copy.samples.length, inputAt: index => copy.samples[index].args }, snapshotReserveBytes)
  }
}

/** Main-private port. The trusted caller owns the same Core admission, package
 * tasks and full lease release after final VERIFIED cleanup. No service wiring. */
export function createOfficialJavascriptExecutionAdapter(request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace,
  native: LearningNativeBinding, load: JavascriptOfficialInputLoader, resolver: JavascriptNodeResolver = new LearningNodeResolver()) {
  return new JavascriptInputExecutionAdapter(request, workspace, native, resolver, load, 128 * 1024)
}
