import { StringDecoder } from 'node:string_decoder'
import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS, type ExerciseEndReason } from '../../../../shared/contracts/exercise'
import { DomainError } from '../../../errors/app-error'
import { exerciseCoreError } from './exercise-limits'
import type { ExerciseExecutionPhase, ExercisePhaseContext, LearningProcessFailure, LearningProcessResult, LearningProcessResultPort, ExerciseTerminationEvidence } from './exercise-runtime-adapter'
import { mapLearningNativeError, type LearningJobSample, type LearningNativeBinding } from './windows-exercise-native'

/** Trusted Main-only preparation, never accepted from renderer/IPC. No language driver here. */
export interface LearningProcessSpec {
  executable: string; args: readonly string[]; cwd: string; stdin?: string
  /** Trusted Main byte observer, before lossy presentation decoding. Never an IPC capability. */
  observeBytes?(stream: 'stdout' | 'stderr', bytes: Buffer): void
}
interface OwnedJob {
  handle: object
  context: ExercisePhaseContext
  sample: LearningJobSample
  out: StringDecoder
  err: StringDecoder
  flushed: boolean
  terminated: boolean
  released: boolean
  closed: boolean
  memoryEvents: { message: number; pid: number }[]
  observeBytes?: LearningProcessSpec['observeBytes']
}
export function learningEnvironment(environment: NodeJS.ProcessEnv): string[] {
  return Object.entries(environment).filter(([key, value]) => value !== undefined && !key.includes('=') && !key.includes('\0') && !value.includes('\0')
    && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key)).sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase()))
    .map(([key, value]) => `${key}=${value}`)
}
/** Nonblocking bounded pipe/Job polling; no worker or renderer can retain a Job handle. */
export class WindowsExerciseRuntimeAdapter implements LearningProcessResultPort {
  private readonly jobs: OwnedJob[] = []
  private sealed = false
  private phaseTask?: Promise<void>
  private latest?: { phase: ExerciseExecutionPhase; job?: OwnedJob; failure: LearningProcessFailure | null }
  private readonly environment: string[]
  constructor(private readonly native: LearningNativeBinding,
    private readonly plan: (phase: ExerciseExecutionPhase) => LearningProcessSpec | null,
    environment: NodeJS.ProcessEnv = process.env) { this.environment = learningEnvironment(environment) }
  private call<T>(work: () => T): T { try { return work() } catch (error) { throw mapLearningNativeError(error) } }
  private control(job: OwnedJob, operation: 'terminate' | 'release' | 'closeHandles'): void {
    try { this.native.control(job.handle, operation) }
    catch (error) {
      // Reconcile even an ambiguous failure after the irreversible native action.
      // state() never queries the closed OS Job and cannot resurrect ownership.
      try {
        const state = this.native.state(job.handle)
        job.terminated ||= state.terminated; job.released ||= state.released; job.closed ||= state.handlesClosed
      } catch { /* Preserve conservative tracked ownership and the original error. */ }
      throw mapLearningNativeError(error)
    }
  }
  private refresh(job: OwnedJob): LearningJobSample {
    if (job.released) return job.sample // Never query a released Job.
    const sample = this.call(() => this.native.poll(job.handle))
    job.sample = sample
    // Keep evidence bounded even if a process repeatedly hits the Job quota.
    for (const event of sample.events) if (event.message === 10 && job.memoryEvents.length < 64) job.memoryEvents.push({ ...event })
    if (sample.stdout.length) job.observeBytes?.('stdout', sample.stdout)
    if (sample.stderr.length) job.observeBytes?.('stderr', sample.stderr)
    const out = job.out.write(sample.stdout), err = job.err.write(sample.stderr)
    if (out) job.context.output('stdout', out)
    if (err) job.context.output('stderr', err)
    if (sample.observerSettled && !job.flushed) {
      const tailOut = job.out.end(), tailErr = job.err.end()
      if (tailOut) job.context.output('stdout', tailOut)
      if (tailErr) job.context.output('stderr', tailErr)
      job.flushed = true
    }
    return sample
  }
  private async monitor(job: OwnedJob, phaseResult: boolean): Promise<void> {
    for (;;) {
      const s = this.refresh(job)
      if (phaseResult && (job.context.signal.aborted || this.sealed)) throw exerciseCoreError('PROCESS_INTERRUPTED')
      if (phaseResult && performance.now() >= job.context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
      if (phaseResult && job.memoryEvents.length) throw exerciseCoreError('JOB_MEMORY_LIMIT')
      if (phaseResult && s.stdinFailed) throw exerciseCoreError('STDIN_DELIVERY_FAILED')
      if (s.observerSettled && !s.members.length && !s.activeProcesses && s.retained.every(p => p.signaled)) {
        return
      }
      // Yield every bounded read, but drain productive pipes promptly. A fixed
      // 15ms pause per 4-KiB Windows pipe buffer can consume a 2s execute budget
      // before a bounded 1-MiB response/overflow reaches Main.
      await new Promise<void>(resolve => setTimeout(resolve, s.stdout.length || s.stderr.length ? 0 : 15))
    }
  }
  async runPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<void> {
    const result = await this.runProcessPhase(phase, context)
    // Preserve Common callers' existing behavior. Language drivers use the result port.
    if (result?.failure === 'NONZERO_EXIT') throw exerciseCoreError('RUNTIME_FAILED')
  }
  private abortFailure(context: ExercisePhaseContext): LearningProcessFailure {
    const error: unknown = context.signal.reason
    const reason = error instanceof DomainError ? error.details?.reason : undefined
    if (typeof reason === 'string' && ['PREPARE_TIMEOUT', 'COMPILE_TIMEOUT', 'EXECUTE_TIMEOUT', 'OPERATION_TIMEOUT'].includes(reason)) return 'TIMEOUT'
    return reason === 'JOB_MEMORY_LIMIT' ? 'JOB_MEMORY_LIMIT' : reason === 'OUTPUT_LIMIT' ? 'OUTPUT_LIMIT' : 'CANCELLED'
  }
  processResult(): LearningProcessResult | null {
    if (!this.latest) return null
    const { phase, job, failure } = this.latest, sample = job?.sample
    const processExited = sample?.retained.some(p => p.pid === sample.rootPid && p.signaled) ?? false
    const settled = !!sample?.observerSettled && !!job?.flushed
    return Object.freeze({ phase, exitCode: processExited ? sample!.exitCode : null, processExited,
      stdoutSettled: settled, stderrSettled: settled, observerSettled: settled,
      failure, jobMemoryLimitObserved: !!job?.memoryEvents.length })
  }
  async runProcessPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<LearningProcessResult | null> {
    // Rejected concurrent calls must not overwrite the admitted attempt's observation.
    if (this.sealed || this.phaseTask || context.signal.aborted) throw exerciseCoreError('ADMISSION_CLOSED')
    this.latest = { phase, failure: null }
    try {
      const spec = this.plan(phase)
      if (!spec) { this.latest = undefined; return null }
      // Reject malformed Unicode instead of silently replacing lone surrogates.
      if (spec.stdin !== undefined && (typeof spec.stdin !== 'string' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(spec.stdin)
        || Buffer.byteLength(spec.stdin, 'utf8') > EXERCISE_LIMITS.outputBytes)) throw exerciseCoreError('STDIN_CONFIGURATION')
      const input = Buffer.from(spec.stdin ?? '', 'utf8')
      if (performance.now() >= context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
      const quota = phase === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes : phase === 'execute' ? EXERCISE_LIMITS.executeJobMemoryBytes : null
      if (quota === null || quota !== context.jobMemoryBytes) throw exerciseCoreError('QUOTA_CONFIGURATION')
      const handle = this.call(() => this.native.start(spec.executable, spec.args, spec.cwd, quota, this.environment))
      // Retain ownership immediately, even if first observation/resume fails.
      const job = { handle, context, out: new StringDecoder('utf8'), err: new StringDecoder('utf8'), flushed: false,
        terminated: false, released: false, closed: false, memoryEvents: [], observeBytes: spec.observeBytes,
        sample: undefined as unknown as LearningJobSample } satisfies OwnedJob
      this.jobs.push(job)
      this.latest.job = job
      this.call(() => this.native.submitInput(handle, input))
      const initial = this.refresh(job)
      if (initial.quotaBytes !== quota || !initial.members.includes(initial.rootPid)
        || !initial.retained.some(p => p.pid === initial.rootPid && !p.signaled)) throw exerciseCoreError('QUOTA_OR_OWNERSHIP')
      // A synchronous CreateProcess/AV delay can postpone JS timer delivery. Keep
      // ownership of the suspended root and let Core select the expired deadline.
      if (performance.now() >= context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
      if (!context.signal.aborted && !this.sealed) this.call(() => this.native.control(handle, 'resume'))
      const task = this.monitor(job, true)
      this.phaseTask = task
      try { await task } finally { if (this.phaseTask === task) this.phaseTask = undefined }
      if (context.signal.aborted || this.sealed) throw exerciseCoreError('PROCESS_INTERRUPTED')
      if (performance.now() >= context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
      this.latest.failure = job.sample.exitCode === 0 ? null : 'NONZERO_EXIT'
      return this.processResult()
    } catch (error) {
      const reason = error instanceof DomainError ? error.details?.reason : undefined
      this.latest!.failure = context.signal.aborted ? this.abortFailure(context)
        : this.sealed ? this.latest!.failure ?? 'CANCELLED'
          : reason === 'PHASE_DEADLINE' || reason === 'TIMEOUT' ? 'TIMEOUT'
            : reason === 'JOB_MEMORY_LIMIT' ? 'JOB_MEMORY_LIMIT' : 'INFRASTRUCTURE_FAILURE'
      throw error instanceof DomainError ? error : exerciseCoreError('PROCESS_OBSERVATION_FAILED')
    }
  }
  async terminate(reason?: ExerciseEndReason): Promise<void> {
    this.sealed = true
    if (this.phaseTask && this.latest && !this.latest.failure) this.latest.failure =
      reason?.endsWith('_TIMEOUT') ? 'TIMEOUT' : reason === 'JOB_MEMORY_LIMIT' ? 'JOB_MEMORY_LIMIT'
        : reason === 'OUTPUT_LIMIT' ? 'OUTPUT_LIMIT' : 'CANCELLED'
    for (const job of this.jobs) if (!job.terminated && !job.released) {
      this.control(job, 'terminate'); job.terminated = true
    }
  }
  async settleObservers(): Promise<void> {
    // The original phase task can fail on memory/exit; retain and drain all pipes
    // and process handles regardless. Query errors reject for stage-aware retry.
    if (this.phaseTask) await this.phaseTask.catch(() => {})
    for (const job of this.jobs) if (!job.released) await this.monitor(job, false)
  }
  async evidence(): Promise<ExerciseTerminationEvidence> {
    const samples = this.jobs.map(j => this.refresh(j))
    return { members: samples.flatMap(s => s.members.map(pid => {
      const retained = s.retained.find(p => p.pid === pid)
      if (!retained) throw exerciseCoreError('PROCESS_UNRESOLVED')
      return { pid, created: retained.created }
    })), activeProcesses: samples.reduce((n, s) => n + s.activeProcesses, 0),
    totalProcesses: samples.reduce((n, s) => n + s.totalProcesses, 0), retained: samples.flatMap(s => s.retained),
    coverageComplete: samples.every(s => s.coverageComplete), observerSettled: samples.every(s => s.observerSettled), unresolvedErrors: false }
  }
  async release(): Promise<void> {
    for (const job of this.jobs) if (!job.released) {
      const s = this.refresh(job)
      if (!s.observerSettled || s.members.length || s.activeProcesses || s.retained.some(p => !p.signaled)) throw exerciseCoreError('PROCESS_UNRESOLVED')
      this.control(job, 'release'); job.released = true
    }
  }
  async closeHandles(): Promise<void> {
    for (const job of this.jobs) if (!job.closed) {
      if (!job.released) throw exerciseCoreError('PROCESS_UNRESOLVED')
      this.control(job, 'closeHandles'); job.closed = true
    }
  }
  diagnostics() {
    return this.jobs.map(j => ({ rootPid: j.sample?.rootPid, quotaBytes: j.sample?.quotaBytes,
      peakJobCommitBytes: j.sample?.peakJobCommitBytes, reportedJobCommitBytes: j.sample?.reportedJobCommitBytes,
      memoryEvents: [...j.memoryEvents], released: j.released, handlesClosed: j.closed }))
  }
}
