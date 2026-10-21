import { randomUUID } from 'node:crypto'
import type { ExerciseCleanupSnapshot, ExerciseEndReason, ExercisePhase, ExerciseRunRequest, ExerciseSnapshot } from '../../../../shared/contracts/exercise'
import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import { validateExerciseRunRequest, validateExerciseSessionReference } from '../../../../shared/contracts/exercise-validation'
import { makeExerciseCheckpoint, type ExerciseCheckpointStage, type ExerciseCheckpointStore, type ExerciseFinalProof } from './exercise-checkpoint'
import { ExerciseLimits, exerciseCoreError, type ExerciseClock } from './exercise-limits'
import type { ExerciseExecutionPhase, ExerciseRuntimeAdapter, ExerciseTerminationEvidence } from './exercise-runtime-adapter'
import type { ExerciseWorkspace } from './exercise-workspace'
import { DomainError } from '../../../errors/app-error'

export function classifyExerciseTermination(e: ExerciseTerminationEvidence): ExerciseFinalProof {
  const identities = new Set(e.retained.map(p => `${p.pid}:${p.created}`))
  if (!Number.isSafeInteger(e.activeProcesses) || e.activeProcesses !== 0 || e.members.length
    || !Number.isSafeInteger(e.totalProcesses) || e.totalProcesses < 0 || e.unresolvedErrors
    || !e.observerSettled || e.retained.some(p => !p.signaled || !Number.isSafeInteger(p.pid) || p.pid <= 0 || !p.created)
    || identities.size !== e.retained.length) throw exerciseCoreError('PROCESS_UNRESOLVED')
  return !e.coverageComplete || e.totalProcesses !== identities.size ? 'HISTORY_UNVERIFIED' : 'VERIFIED'
}

export interface ExerciseSessionOptions {
  request: ExerciseRunRequest
  ownerId: string
  workspace: ExerciseWorkspace
  checkpoints: ExerciseCheckpointStore
  adapter: ExerciseRuntimeAdapter
  clock?: ExerciseClock
  generation?: number
  hostEpoch?: string
}

/** One Main-owned operation; application-wide admission belongs to ExerciseService. */
export class ExerciseSession {
  readonly limits: ExerciseLimits
  private readonly hostEpoch: string
  private readonly request: ExerciseRunRequest
  private phase: ExercisePhase = 'prepare'
  private lastExecutionPhase: ExerciseExecutionPhase | null = null
  private reason: ExerciseEndReason | null = null
  private sequence = 0
  private readonly generation: number
  private preparationStarted = false
  private readonly phaseTasks = new Set<Promise<void>>()
  private activePhase = false
  private task?: Promise<void>
  private proof: ExerciseFinalProof | null = null
  private unresolved = false
  private terminated = false
  private released = false
  private handlesClosed = false
  private workspaceRemoved = false
  private complete = false
  private cleanupError = false
  private checkpoint: ExerciseCheckpointStage | null = null
  private stdout = ''
  private stderr = ''
  private outputBytes = 0
  private phaseError: unknown
  private cleanupFailure: unknown
  constructor(private readonly options: ExerciseSessionOptions) {
    const request = validateExerciseRunRequest(options.request)
    this.generation = options.generation ?? 1
    this.hostEpoch = options.hostEpoch ?? randomUUID()
    if (!request.ok || !/^[A-Za-z0-9:_-]{1,128}$/.test(options.ownerId)
      || !validateExerciseSessionReference({ sessionId: options.workspace.sessionId, generation: this.generation }).ok
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(this.hostEpoch)) throw exerciseCoreError('SESSION_INPUT')
    this.request = request.value
    this.limits = new ExerciseLimits(options.clock)
    this.limits.controller.signal.addEventListener('abort', () => {
      if (this.phase !== 'cleanup' && this.phase !== 'finished') this.backgroundClose(this.limits.reason ?? 'INTERNAL_ERROR')
    }, { once: true })
  }
  private get baseRecord() {
    if (!this.options.workspace.identity) throw exerciseCoreError('WORKSPACE_NOT_PREPARED')
    return { sessionId: this.options.workspace.sessionId, ownerId: this.options.ownerId,
      hostEpoch: this.hostEpoch, workspaceIdentity: this.options.workspace.identity }
  }
  private async persist(stage: ExerciseCheckpointStage): Promise<void> {
    await this.options.checkpoints.write(makeExerciseCheckpoint(this.baseRecord, stage, this.proof))
    this.checkpoint = stage
  }
  private backgroundClose(reason: ExerciseEndReason): void {
    void this.close(reason).catch(() => { /* Failure is retained in session state for the next managed retry. */ })
  }
  private output(stream: 'stdout' | 'stderr', text: string, rawBytes = Buffer.byteLength(text, 'utf8')): void {
    if (this.phase === 'cleanup' || this.phase === 'finished' || this.limits.controller.signal.aborted) return
    if (!Number.isSafeInteger(rawBytes) || rawBytes < Buffer.byteLength(text, 'utf8')) throw exerciseCoreError('OUTPUT_ACCOUNTING')
    const bytes = rawBytes
    if (this.outputBytes + bytes > EXERCISE_LIMITS.outputBytes) { this.limits.cancel('OUTPUT_LIMIT'); return }
    this.outputBytes += bytes
    if (stream === 'stdout') this.stdout += text
    else this.stderr += text
    this.sequence++
  }
  async runPhase(phase: ExerciseExecutionPhase): Promise<void> {
    if (this.reason || this.complete || this.activePhase) throw exerciseCoreError('ADMISSION_CLOSED')
    const allowed = this.lastExecutionPhase === null ? phase === 'prepare'
      : this.lastExecutionPhase === 'prepare' ? phase === 'compile' || phase === 'execute'
        : phase === 'execute'
    if (!allowed) throw exerciseCoreError('PHASE_ORDER')
    this.activePhase = true; this.phase = phase; this.sequence++
    try {
      await this.limits.phase(phase, deadline => {
        const work = (async () => {
          if (phase === 'prepare') {
            this.preparationStarted = true
            await this.options.workspace.prepare(); await this.persist('OWNED')
          }
          if (this.limits.controller.signal.aborted) return
          await this.options.adapter.runPhase(phase, { signal: this.limits.controller.signal, deadline,
            jobMemoryBytes: phase === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes
              : phase === 'execute' ? EXERCISE_LIMITS.executeJobMemoryBytes : null,
            output: (stream, text, rawBytes) => this.output(stream, text, rawBytes) })
        })()
        this.phaseTasks.add(work)
        void work.finally(() => this.phaseTasks.delete(work)).catch(() => {})
        return work
      })
      this.lastExecutionPhase = phase
    } catch (error) {
      this.phaseError = error
      if (error instanceof DomainError && error.details?.reason === 'JOB_MEMORY_LIMIT') this.limits.cancel('JOB_MEMORY_LIMIT')
      this.backgroundClose(this.limits.reason ?? (phase === 'prepare' ? 'PREPARATION_FAILED'
        : phase === 'compile' ? 'COMPILATION_FAILED' : 'RUNTIME_FAILED'))
      throw error
    } finally { this.activePhase = false }
  }
  /** Each caller has its own wait budget; the underlying cleanup remains singular. */
  async close(reason: ExerciseEndReason = 'COMPLETED'): Promise<void> {
    if (this.complete) return
    if (!this.reason) {
      this.reason = this.limits.reason ?? reason
      this.phase = 'cleanup'; this.sequence++
      this.limits.cancel(this.reason); this.limits.finishOperation()
    }
    if (!this.task) {
      this.cleanupError = false
      const task = Promise.resolve().then(() => this.cleanup())
      this.task = task
      void task.finally(() => { if (this.task === task) this.task = undefined }).catch(() => {})
    }
    try { await this.limits.waitCleanup(this.task) }
    catch (error) { this.cleanupError = true; this.cleanupFailure = error; this.sequence++; throw error }
  }
  private async currentProof(): Promise<ExerciseFinalProof> {
    try {
      const kind = classifyExerciseTermination(await this.options.adapter.evidence())
      if (this.proof === 'VERIFIED' && kind !== 'VERIFIED') throw exerciseCoreError('PROOF_CHANGED')
      this.unresolved = false
      return this.proof === 'HISTORY_UNVERIFIED' ? this.proof : kind
    } catch (error) { this.unresolved = true; throw error }
  }
  private async cleanup(): Promise<void> {
    try {
      // Acquire/prepare may still be pending. Its task remains owned; no later launch
      // is permitted after cancellation. Native termination unblocks active phases.
      if (!this.terminated) {
        try { await this.options.adapter.terminate(this.reason!) }
        catch (error) { this.unresolved = true; throw error }
        this.terminated = true
      }
      if (!this.released) {
        try { await this.options.adapter.settleObservers() }
        catch (error) { this.unresolved = true; throw error }
        await Promise.allSettled([...this.phaseTasks])
        // Invalidation can arrive before any phase starts. Create only the scoped
        // ownership audit/workspace under cleanup; never run a cancelled driver.
        if (!this.preparationStarted) {
          this.preparationStarted = true
          await this.options.workspace.prepare()
        }
        if (!this.options.workspace.identity) throw exerciseCoreError('PREPARATION_UNRESOLVED')
        // A failed OWNED acknowledgement may have committed. Retry the same
        // immutable record before disposition; never rerun preparation or launch.
        if (!this.checkpoint) await this.persist('OWNED')
        this.proof = await this.currentProof()
        if (this.checkpoint === 'OWNED') await this.persist('RELEASE_READY')
        await this.currentProof() // Persistence may have yielded; revalidate before release.
        try { await this.options.adapter.release() }
        catch (error) { this.unresolved = true; throw error }
        this.released = true
      }
      if (!this.handlesClosed) {
        try { await this.options.adapter.closeHandles() }
        catch (error) { this.unresolved = true; throw error }
        this.handlesClosed = true; this.unresolved = false
      }
      if (this.checkpoint === 'RELEASE_READY') await this.persist('FINALIZED')
      if (this.proof === 'VERIFIED' && this.checkpoint === 'FINALIZED') {
        if (!this.workspaceRemoved) {
          await this.options.workspace.remove(this.baseRecord.workspaceIdentity)
          this.workspaceRemoved = true
        }
        await this.persist('CLEANUP_COMPLETE')
      }
      await this.options.workspace.releaseLease()
      this.complete = true; this.cleanupError = false; this.cleanupFailure = undefined; this.phase = 'finished'; this.sequence++
    } catch (error) { this.cleanupError = true; this.cleanupFailure = error; this.sequence++; throw error }
  }
  get ownsResources(): boolean { return !this.complete }
  get pendingCleanup(): boolean { return this.task !== undefined }
  get lastPhaseError(): unknown { return this.phaseError }
  get lastCleanupError(): unknown { return this.cleanupFailure }
  snapshot(): ExerciseSnapshot {
    const finalized = this.checkpoint === 'FINALIZED' || this.checkpoint === 'CLEANUP_COMPLETE'
    const cleanup: ExerciseCleanupSnapshot = {
      state: this.complete ? 'FINALIZED' : this.reason ? this.cleanupError ? 'FAILED' : 'PENDING' : 'NOT_STARTED',
      proof: this.unresolved ? 'PROCESS_UNRESOLVED' : this.proof ?? 'PENDING',
      processClean: !this.unresolved && finalized && this.proof === 'VERIFIED',
      cleanupComplete: this.complete && this.checkpoint === 'CLEANUP_COMPLETE',
      workspace: this.proof === 'HISTORY_UNVERIFIED' ? 'QUARANTINED'
        : finalized ? this.checkpoint === 'CLEANUP_COMPLETE' ? 'REMOVED' : 'DELETE_PENDING' : 'RETAINED',
      pendingIo: this.task !== undefined && !this.complete,
    }
    return { sessionId: this.options.workspace.sessionId, generation: this.generation,
      exerciseId: this.request.exerciseId, language: this.request.language, sourceRevision: this.request.sourceRevision,
      sequence: this.sequence, phase: this.phase, reason: this.reason, stdout: this.stdout, stderr: this.stderr, cleanup }
  }
}
