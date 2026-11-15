import { randomUUID } from 'node:crypto'
import { isRunSessionId, runInputCapability, validateCloseRunInputRequest,
  validateSendRunInputRequest, validateStartRunRequest, validateStopRunRequest, validateSemanticStartRunRequest,
  type RunInputAcknowledgement, type RunInputGateReason, type RunInputStatus,
  type SemanticStartRunRequest, type RunExecutionPhase, type RunEvent, type RunState,
  type RunSession, type RunSessionId, type RunTargetKind, type StartRunRequest,
} from '../../../shared/contracts/run'
import type { ProjectId } from '../../../shared/contracts/project'
import { DomainError, invalidInputError, serializeAppError } from '../../errors/app-error'
import { runTargetIdentity, runExecutionFingerprint, snapshotExecution, snapshotPlan, runPlanFingerprint,
  type RunPreparationContext,
  type AuthorizedRunTarget, type PreparedRun, type RunRuntime, type RunStrategy,
  type RunRuntimeContext } from './run-strategy'
import type { PipedProcessAdapter, PipedProcessEvent, PipedRunProcess } from './piped-process-adapter'
import { RunInputQueue, runInputRejection } from './run-input-queue'
import type { ProcessManager } from '../process/process-manager'
import { sourceGuardError, type RunSourceGuardPort, type RunSourceLease } from './run-source-guard'

/** Later execution composition must authorize disk/project state, then revalidate
 * immediately before spawn. Renderer dirty/current-file state stays UI-owned. */
export interface RunPreparationAuthority {
  authorize(target: StartRunRequest, ownerId: number, context?: RunPreparationContext): Promise<AuthorizedRunTarget>
  resolveRuntime(context: RunRuntimeContext): Promise<RunRuntime>
}
export interface RunPreparation {
  readonly session: RunSession
  readonly execution: PreparedRun
  readonly identity: string
  readonly fingerprint: string
}
interface OwnedPreparation extends RunPreparation { readonly ownerId: number }
interface LifecycleSession {
  session: RunSession
  readonly ownerId: number
  readonly identity: string
  readonly kind: RunTargetKind
  readonly projectGeneration: number
  readonly ownerGeneration: number
  readonly ready: Promise<void>
  process?: PipedRunProcess
  input?: RunInputQueue
  /** Set when input must stay shut even if the execute step is created later. */
  inputBlock?: RunInputGateReason
  cleanup?: Promise<void>
  exitCode: number | null
  stdoutEof: boolean
  stderrEof: boolean
  cancelled: boolean
  observationFailed: boolean
  finalized: boolean
  muted?: boolean
  plan?: {
    controller: AbortController
    phase: RunExecutionPhase
    generation: number
    finished?: () => void
    cleanupFailed: boolean
    sourceLease?: RunSourceLease
    sourceFailure?: DomainError
  }
}
export interface RunExecutionOptions {
  adapter: PipedProcessAdapter
  manager: ProcessManager
  onEvent(ownerId: number, event: RunEvent): void
  onEventSinkError?(error: unknown): void
  /** Main-only phase observation; no public IPC migration in M1-08. */
  onPhase?(ownerId: number, session: RunSession, phase: RunExecutionPhase): void
  /** Main-only terminal bookkeeping, independent of muted public event delivery. */
  onFinalized?(ownerId: number, session: RunSession): void
  sourceGuard?: RunSourceGuardPort
}
interface LaunchLifecycle {
  cleanup(): Promise<void>
  released(): void
  canLaunch?(): void
}

/** Main-owned Run lifecycle; application/renderer composition is a later package. */
export class RunService {
  private readonly preparations = new Map<RunSessionId, OwnedPreparation>()
  private readonly processes = new Map<RunSessionId, PipedRunProcess>()
  private readonly strategies: readonly RunStrategy[]
  private readonly sessions = new Map<RunSessionId, LifecycleSession>()
  private readonly inputs = new Map<RunSessionId, { ownerId: number; projectId: ProjectId; queue: RunInputQueue }>()
  private readonly targets = new Map<string, LifecycleSession>()
  private readonly starts = new Map<string, Promise<unknown>>()
  private readonly pendingStarts = new Map<Promise<RunSession>, string>()
  private readonly cleanupRequests = new Map<Promise<void>, string>()
  private readonly projectBlocks = new Map<string, number>()
  private readonly projectGenerations = new Map<string, number>()
  private readonly ownerGenerations = new Map<number, number>()
  private readonly pendingOwners = new Map<Promise<RunSession>, number>()
  private readonly cleanupOwners = new Map<Promise<void>, number>()
  private stopping = false
  // Small tombstones support late Stop without retaining processes/output indefinitely.
  private readonly completed = new Map<RunSessionId, { session: RunSession; ownerId: number }>()
  constructor(private readonly authority: RunPreparationAuthority,
    strategies: readonly RunStrategy[], private readonly execution?: RunExecutionOptions) {
    const kinds = new Set<string>()
    this.strategies = Object.freeze(strategies.map(strategy => {
      if (!['javascript-file', 'csharp-project'].includes(strategy.kind) || kinds.has(strategy.kind)) {
        throw invalidInputError('run:configure', ['strategy'])
      }
      kinds.add(strategy.kind)
      return Object.freeze({ kind: strategy.kind, supports: strategy.supports.bind(strategy),
        prepare: strategy.prepare.bind(strategy),
        ...(strategy.preparePlan ? { preparePlan: strategy.preparePlan.bind(strategy) } : {}) })
    }))
  }

  private async resolve(request: StartRunRequest, ownerId: number): Promise<{
    target: StartRunRequest; execution: PreparedRun; identity: string; fingerprint: string
  }> {
    const validation = validateStartRunRequest(request)
    if (!validation.ok) throw invalidInputError('run:prepare', validation.issues.map((issue) => issue.path))
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw invalidInputError('run:prepare', ['owner'])
    // Capture validated input before awaiting any Main authority operation.
    const target = Object.freeze(validation.value)
    if (target.dirty) throw new DomainError({ code: 'INVALID_INPUT', retryable: false,
      operation: 'run:prepare', message: 'Save this file before running it.' })
    const matches = this.strategies.filter((candidate) => candidate.supports(target))
    if (matches.length > 1) throw invalidInputError('run:prepare', ['strategy'])
    const strategy = matches[0]
    if (!strategy) throw new DomainError({ code: 'UNSUPPORTED', retryable: false,
      operation: 'run:prepare', message: target.relativePath.endsWith('.ts')
        ? 'TypeScript Run is not supported in current V1.'
        : 'Run supports JavaScript .js files only in current V1.' })
    const authorized = Object.freeze({ ...await this.authority.authorize(target, ownerId) })
    if (authorized.projectId !== target.projectId || authorized.relativePath !== target.relativePath) {
      throw invalidInputError('run:prepare', ['target'])
    }
    const identity = runTargetIdentity(authorized, strategy.kind)
    const runtime = await this.authority.resolveRuntime(Object.freeze({ strategyKind: strategy.kind, target: authorized }))
    const execution = snapshotExecution(strategy.prepare(authorized, runtime))
    const fingerprint = runExecutionFingerprint(identity, authorized, execution)
    return { target, execution, identity, fingerprint }
  }

  async prepare(request: StartRunRequest, ownerId: number): Promise<RunPreparation> {
    const { target, execution, identity, fingerprint } = await this.resolve(request, ownerId)
    // Preparations are serialized by target identity at the final synchronous insertion.
    if ([...this.preparations.values()].some((entry) =>
      entry.identity === identity)) {
      throw new DomainError({ code: 'PROCESS_FAILED', retryable: true,
        operation: 'run:prepare', message: 'The previous Run preparation must be released first.' })
    }
    const session: RunSession = Object.freeze({ projectId: target.projectId,
      relativePath: target.relativePath, sessionId: `run_${randomUUID()}` as RunSessionId,
      state: 'STARTING' })
    const preparation = Object.freeze({ session, execution, identity, fingerprint })
    this.preparations.set(session.sessionId, { ...preparation, ownerId })
    return preparation
  }

  startRun(request: StartRunRequest, ownerId: number): Promise<RunSession> {
    const validation = validateStartRunRequest(request)
    if (!validation.ok) return Promise.reject(invalidInputError('run:start', ['target']))
    const target = validation.value
    // The legacy public bridge remains JavaScript-only until M1-10.
    if (/\.csproj$/i.test(target.relativePath)) return Promise.reject(new DomainError({ code: 'UNSUPPORTED',
      message: 'C# Run requires the Main-owned execution plan.', operation: 'run:start', retryable: false }))
    const generation = this.projectGenerations.get(target.projectId) ?? 0
    const ownerGeneration = this.ownerGenerations.get(ownerId) ?? 0
    const check = () => {
      if (this.stopping || this.projectBlocks.has(target.projectId)
        || (this.ownerGenerations.get(ownerId) ?? 0) !== ownerGeneration
        || (this.projectGenerations.get(target.projectId) ?? 0) !== generation) {
        throw runFailure('run:start', 'Run is unavailable while this project is changing or closing.')
      }
    }
    const task = this.startAuthorized(target, ownerId, check)
    this.pendingStarts.set(task, target.projectId)
    this.pendingOwners.set(task, ownerId)
    void task.finally(() => this.pendingOwners.delete(task)).catch(() => undefined)
    void task.finally(() => this.pendingStarts.delete(task)).catch(() => undefined)
    return task
  }

  /** Main-only plan entry point. The live JavaScript bridge keeps startRun semantics. */
  startPlannedRun(request: SemanticStartRunRequest, ownerId: number): Promise<RunSession> {
    const validation = validateSemanticStartRunRequest(request)
    if (!validation.ok || !Number.isSafeInteger(ownerId) || ownerId <= 0) {
      return Promise.reject(invalidInputError('run:start', ['target', 'owner']))
    }
    const target = Object.freeze(validation.value)
    if (target.dirty) return Promise.reject(invalidInputError('run:start', ['dirty']))
    const generation = this.projectGenerations.get(target.projectId) ?? 0
    const ownerGeneration = this.ownerGenerations.get(ownerId) ?? 0
    const check = () => {
      if (this.stopping || this.projectBlocks.has(target.projectId)
        || (this.projectGenerations.get(target.projectId) ?? 0) !== generation
        || (this.ownerGenerations.get(ownerId) ?? 0) !== ownerGeneration) {
        throw runFailure('run:start', 'Run is unavailable while this project is changing or closing.')
      }
    }
    const task = this.reservePlan(target, ownerId, check)
    this.pendingStarts.set(task, target.projectId)
    this.pendingOwners.set(task, ownerId)
    void task.finally(() => {
      this.pendingStarts.delete(task); this.pendingOwners.delete(task)
    }).catch(() => undefined)
    return task
  }

  private async reservePlan(target: SemanticStartRunRequest, ownerId: number,
    check: () => void): Promise<RunSession> {
    check()
    if (!this.execution) throw runFailure('run:start', 'Run execution is not configured.')
    const matches = this.strategies.filter(strategy => strategy.kind === target.kind && strategy.supports(target))
    if (matches.length !== 1) throw invalidInputError('run:start', ['strategy'])
    const strategy = matches[0]
    // Only cheap project/path authorization precedes the cancellable session.
    const request = { projectId: target.projectId, relativePath: target.relativePath, dirty: false }
    const authorized = Object.freeze({ ...await this.authority.authorize(request, ownerId) })
    check()
    if (authorized.projectId !== target.projectId || authorized.relativePath !== target.relativePath) {
      throw invalidInputError('run:start', ['target'])
    }
    const identity = runTargetIdentity(authorized, strategy.kind)
    const previous = this.starts.get(identity) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(async () => {
      check()
      const old = this.targets.get(identity)
      if (old) await this.stopRun(old.session.sessionId, ownerId)
      check()
      if ([...this.preparations.values()].some(preparation => preparation.identity === identity)) {
        throw runFailure('run:start', 'The previous Run preparation must be released first.')
      }
      const entry: LifecycleSession = {
        session: Object.freeze({ projectId: target.projectId, relativePath: target.relativePath,
          sessionId: `run_${randomUUID()}` as RunSessionId, state: 'STARTING' }),
        ownerId, identity, kind: strategy.kind, ready: Promise.resolve(), exitCode: null, stdoutEof: false,
        stderrEof: false, cancelled: false, observationFailed: false, finalized: false,
        projectGeneration: this.projectGenerations.get(target.projectId) ?? 0,
        ownerGeneration: this.ownerGenerations.get(ownerId) ?? 0,
        plan: { controller: new AbortController(), phase: 'PREPARING', generation: 0, cleanupFailed: false },
      }
      this.sessions.set(entry.session.sessionId, entry)
      this.targets.set(identity, entry)
      this.emit(entry, { type: 'state', session: entry.session })
      this.publishPhase(entry, 'PREPARING')
      void this.executePlan(entry, authorized, strategy, check)
      return entry.session
    })
    this.starts.set(identity, task)
    try { return await task }
    finally { if (this.starts.get(identity) === task) this.starts.delete(identity) }
  }

  private cancelPlan(entry: LifecycleSession): void {
    entry.cancelled = true
    entry.plan!.controller.abort()
  }

  private publishPhase(entry: LifecycleSession, phase: RunExecutionPhase): void {
    entry.plan!.phase = phase
    if (this.stopping || entry.muted || entry.finalized) return
    try { this.execution?.onPhase?.(entry.ownerId, entry.session, phase) }
    catch { this.execution?.onEventSinkError?.(runFailure('run:event', 'Run event delivery failed.')) }
  }

  private async executePlan(entry: LifecycleSession, authorized: AuthorizedRunTarget,
    strategy: RunStrategy, lifecycleCheck: () => void): Promise<void> {
    const control = entry.plan!
    const check = () => {
      lifecycleCheck()
      if (control.sourceFailure) throw control.sourceFailure
      if (entry.finalized || entry.cancelled || control.controller.signal.aborted) {
        throw runFailure('run:prepare', 'Run preparation was cancelled.')
      }
    }
    const context: RunPreparationContext = Object.freeze({
      signal: control.controller.signal, resourceOwnerId: sessionOwner(entry.session.sessionId),
      registerResource: (close: () => Promise<void>) => {
        check()
        return this.execution!.manager.register({ id: `run-preparation:${randomUUID()}`,
          ownerId: sessionOwner(entry.session.sessionId), close })
      },
    })
    const prepare = async (target: AuthorizedRunTarget) => {
      check()
      const runtime = await abortable(this.authority.resolveRuntime(Object.freeze({
        strategyKind: strategy.kind, target, preparation: context,
      })), context.signal)
      check()
      const plan = await abortable(Promise.resolve(strategy.preparePlan
        ? strategy.preparePlan(target, runtime, context)
        : { steps: [{ phase: 'EXECUTING' as const, execution: strategy.prepare(target, runtime) }] }), context.signal)
      check()
      return snapshotPlan(plan, strategy.kind)
    }
    try {
      if (strategy.kind === 'csharp-project') {
        if (!this.execution!.sourceGuard) throw sourceGuardError('SOURCE_STATE_UNKNOWN')
        control.sourceLease = this.execution!.sourceGuard.open(entry.session, entry.ownerId,
          control.controller.signal, error => {
            if (entry.finalized || control.sourceFailure) return
            control.sourceFailure = error
            this.emitError(entry, error)
            control.controller.abort()
            void this.requestCleanup(entry).then(() => this.finalize(entry, 'FAILED')).catch(() => undefined)
          })
        await control.sourceLease.check()
        check()
      }
      const plan = await prepare(authorized)
      const fingerprint = runPlanFingerprint(entry.identity, authorized, plan)
      for (const [index, step] of plan.steps.entries()) {
        check()
        if (control.sourceLease) { await control.sourceLease.check(); check() }
        const current = Object.freeze({ ...await abortable(this.authority.authorize({
          projectId: entry.session.projectId, relativePath: entry.session.relativePath, dirty: false,
        }, entry.ownerId, context), context.signal) })
        check()
        if (current.projectId !== entry.session.projectId || current.relativePath !== entry.session.relativePath
          || runTargetIdentity(current, strategy.kind) !== entry.identity) {
          throw invalidInputError('run:launch', ['target'])
        }
        const revalidated = await prepare(current)
        if (runPlanFingerprint(entry.identity, current, revalidated) !== fingerprint) {
          throw invalidInputError('run:launch', ['plan'])
        }
        // Preparation probes must release completely before native step creation.
        await this.requestCleanup(entry)
        check()
        if (control.sourceLease) { await control.sourceLease.check(); check() }
        entry.process = undefined
        entry.exitCode = null; entry.stdoutEof = false; entry.stderrEof = false
        entry.observationFailed = false
        const generation = ++control.generation
        const finished = new Promise<void>(resolve => { control.finished = resolve })
        this.publishPhase(entry, step.phase)
        check() // A synchronous phase observer may have requested Stop.
        control.sourceLease?.assertValid()
        let child: PipedRunProcess | undefined
        const lineInput = strategy.kind === 'csharp-project' && step.phase === 'EXECUTING'
        const unregister = this.execution!.manager.register({ id: `run-step:${entry.session.sessionId}:${generation}`,
          ownerId: context.resourceOwnerId, close: () => this.cleanup(entry) })
        const observeStep = (event: PipedProcessEvent) => {
          if (control.generation === generation) this.observe(entry, event)
        }
        try {
          child = lineInput
            ? this.execution!.adapter.create(step.execution, observeStep, 'line-input')
            : this.execution!.adapter.create(step.execution, observeStep)
        } catch (error) {
          unregister()
          if (strategy.kind === 'csharp-project') throw new DomainError({ code: 'PROCESS_FAILED',
            operation: 'run:spawn', message: 'The C# Run process could not be started.', retryable: false,
            details: { reason: 'SPAWN_FAILED', phase: step.phase } })
          throw error
        }
        const created = child
        entry.process = forwardRunProcess(created, async () => {
          await created.close()
          if (!created.isReleased() || entry.exitCode === null || !entry.stdoutEof || !entry.stderrEof) {
            throw runFailure('run:cleanup', 'Run process observers have not completed.')
          }
        })
        if (lineInput) this.attachInput(entry, created)
        // Subsequent edits never restart or cancel an already-executing program.
        if (step.phase === 'EXECUTING') { control.sourceLease?.release(); control.sourceLease = undefined }
        if (entry.session.state === 'STARTING') this.transition(entry, 'RUNNING')
        await finished
        await this.requestCleanup(entry)
        check()
        if (entry.observationFailed || entry.exitCode !== 0) {
          if (strategy.kind === 'csharp-project' && !entry.observationFailed) this.emitError(entry, new DomainError({
            code: 'PROCESS_FAILED', operation: 'run:step', retryable: false,
            message: step.phase === 'BUILD_RESTORE' ? 'C# build or restore failed.' : 'C# execution failed.',
            details: { reason: step.phase === 'BUILD_RESTORE' ? 'BUILD_OR_RESTORE_FAILED' : 'EXECUTION_FAILED',
              phase: step.phase, exitCode: entry.exitCode },
          }))
          this.finalize(entry, 'FAILED'); return
        }
        ++control.generation // Retire callbacks before asynchronous step-gap preparation.
        control.finished = undefined
        if (index < plan.steps.length - 1) entry.exitCode = null
      }
      this.finalize(entry, 'EXITED')
    } catch (error) {
      if (entry.finalized) return
      if (control.cleanupFailed) return
      if (!entry.cancelled && !control.sourceFailure) this.emitError(entry, safeStartError(error))
      this.transition(entry, 'STOPPING')
      // Cleanup failure retains both session and resources; explicit Stop can retry.
      try {
        await this.requestCleanup(entry)
        this.finalize(entry, entry.cancelled ? 'CANCELLED' : 'FAILED')
      } catch { /* Safe cleanup error is emitted by the retained resource. */ }
    }
  }

  /** Main lifecycle lease; invalidates earlier asynchronous starts, even after release. */
  suspendProject(projectId: string): () => void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1)
    this.projectBlocks.set(projectId, (this.projectBlocks.get(projectId) ?? 0) + 1)
    for (const entry of this.sessions.values()) {
      if (entry.session.projectId === projectId) this.closeLiveInput(entry, 'PROJECT_CHANGED')
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const count = (this.projectBlocks.get(projectId) ?? 1) - 1
      if (count) this.projectBlocks.set(projectId, count)
      else this.projectBlocks.delete(projectId)
    }
  }

  suppressProjectEvents(projectId: string): void {
    for (const entry of this.sessions.values()) {
      if (entry.session.projectId === projectId) entry.muted = true
    }
  }

  async stopProject(projectId: string): Promise<void> {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1)
    for (const entry of this.sessions.values()) {
      if (entry.session.projectId !== projectId) continue
      this.closeLiveInput(entry, 'PROJECT_CHANGED')
      if (entry.plan) this.cancelPlan(entry)
    }
    await Promise.allSettled([...this.pendingStarts].filter(([, id]) => id === projectId).map(([task]) => task))
    const results = await Promise.allSettled([...this.sessions.values()]
      .filter((entry) => entry.session.projectId === projectId)
      .map((entry) => this.stopRun(entry.session.sessionId, entry.ownerId)))
    // Finalization removes active records before ProcessManager's promise unwinds.
    // Retain and await those requests as well, including natural-exit cleanup.
    const pending = await Promise.allSettled([...this.cleanupRequests]
      .filter(([, id]) => id === projectId).map(([task]) => task))
    if ([...results, ...pending].some((result) => result.status === 'rejected')) {
      throw runFailure('run:project-cleanup', 'Run cleanup failed. The project was not changed; retry the operation.')
    }
  }

  /** Main-only renderer navigation/destruction cleanup; project lifecycle stays separate. */
  async stopOwner(ownerId: number): Promise<void> {
    this.ownerGenerations.set(ownerId, (this.ownerGenerations.get(ownerId) ?? 0) + 1)
    for (const entry of this.sessions.values()) {
      if (entry.ownerId === ownerId) {
        entry.muted = true
        this.closeLiveInput(entry, 'OWNER_LOST')
        if (entry.plan) this.cancelPlan(entry)
      }
    }
    await Promise.allSettled([...this.pendingOwners].filter(([, id]) => id === ownerId).map(([task]) => task))
    const results = await Promise.allSettled([...this.sessions.values()]
      .filter((entry) => entry.ownerId === ownerId)
      .map((entry) => this.stopRun(entry.session.sessionId, ownerId)))
    const pending = await Promise.allSettled([...this.cleanupOwners]
      .filter(([, id]) => id === ownerId).map(([task]) => task))
    if ([...results, ...pending].some((result) => result.status === 'rejected')) {
      throw runFailure('run:owner-cleanup', 'Run cleanup failed. Application shutdown must be retried.')
    }
  }

  beginShutdown(): void {
    this.stopping = true
    for (const entry of this.sessions.values()) {
      entry.muted = true
      this.closeLiveInput(entry, 'SHUTDOWN')
      if (entry.plan) this.cancelPlan(entry)
    }
  }

  async stop(): Promise<void> {
    this.beginShutdown()
    const projects = new Set([...this.pendingStarts.values(),
      ...this.cleanupRequests.values(),
      ...[...this.sessions.values()].map((entry) => entry.session.projectId)])
    const results = await Promise.allSettled([...projects].map((id) => this.stopProject(id)))
    if (results.some((result) => result.status === 'rejected')) {
      throw runFailure('run:shutdown', 'Run cleanup failed. Application shutdown must be retried.')
    }
  }

  private async startAuthorized(request: StartRunRequest, ownerId: number, check: () => void): Promise<RunSession> {
    check()
    if (!this.execution) throw runFailure('run:start', 'Run execution is not configured.')
    let resolved: Awaited<ReturnType<RunService['resolve']>>
    try { resolved = await this.resolve(request, ownerId) }
    catch (error) { throw safeStartError(error) }
    check()
    const identity = resolved.identity
    // Canonical target serialization preserves concurrency between different files.
    const previous = this.starts.get(identity) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(async () => {
      check()
      const old = this.targets.get(identity)
      if (old) await this.stopRun(old.session.sessionId, ownerId)
      let preparation: RunPreparation
      try { preparation = await this.prepare(resolved.target, ownerId) }
      catch (error) { throw safeStartError(error) }
      try { check() } catch (error) {
        this.releasePreparation(preparation.session.sessionId, ownerId)
        throw error
      }
      if (preparation.identity !== identity || preparation.fingerprint !== resolved.fingerprint) {
        this.releasePreparation(preparation.session.sessionId, ownerId)
        throw invalidInputError('run:start', ['target'])
      }
      let ready!: () => void
      const entry: LifecycleSession = { session: preparation.session, ownerId, identity, kind: 'javascript-file',
        ready: new Promise<void>((resolve) => { ready = resolve }), exitCode: null,
        projectGeneration: this.projectGenerations.get(preparation.session.projectId) ?? 0,
        ownerGeneration: this.ownerGenerations.get(ownerId) ?? 0,
        stdoutEof: false, stderrEof: false, cancelled: false, observationFailed: false, finalized: false }
      this.sessions.set(entry.session.sessionId, entry)
      this.targets.set(identity, entry)
      this.emit(entry, { type: 'state', session: entry.session })
      try {
        entry.process = await this.launchPrepared(entry.session.sessionId, ownerId,
          this.execution!.adapter, this.execution!.manager, (event) => this.observe(entry, event), {
            canLaunch: check,
            cleanup: () => this.cleanup(entry),
            released: () => {
              if (entry.exitCode === null || !entry.stdoutEof || !entry.stderrEof) {
                throw runFailure('run:cleanup', 'Run process observers have not completed.')
              }
              this.finalize(entry, entry.observationFailed ? 'FAILED'
                : entry.cancelled ? 'CANCELLED' : entry.exitCode === 0 ? 'EXITED' : 'FAILED')
            },
          })
        if (entry.session.state === 'STARTING') this.transition(entry, 'RUNNING')
        return entry.session
      } catch (error) {
        const failure = safeStartError(error)
        this.emitError(entry, failure)
        this.releasePreparation(entry.session.sessionId, ownerId)
        this.finalize(entry, 'FAILED')
        throw failure
      } finally { ready() }
    })
    this.starts.set(identity, task)
    try { return await task }
    finally { if (this.starts.get(identity) === task) this.starts.delete(identity) }
  }

  getSession(sessionId: RunSessionId, ownerId: number): RunSession {
    const entry = this.sessions.get(sessionId) ?? this.completed.get(sessionId)
    if (!entry || entry.ownerId !== ownerId) throw new DomainError({ code: 'PERMISSION_DENIED',
      operation: 'run:session', message: 'Run session is not owned by this window.', retryable: false })
    return entry.session
  }

  async stopRun(sessionId: RunSessionId, ownerId: number): Promise<void> {
    if (!validateStopRunRequest({ sessionId }).ok) throw invalidInputError('run:stop', ['sessionId'])
    this.getSession(sessionId, ownerId)
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.closeLiveInput(entry, 'STOPPED')
    if (entry.plan) this.cancelPlan(entry)
    else if (entry.exitCode === null) entry.cancelled = true
    this.transition(entry, 'STOPPING')
    await this.requestCleanup(entry)
  }

  private requestCleanup(entry: LifecycleSession): Promise<void> {
    const task = this.performCleanupRequest(entry)
    this.cleanupRequests.set(task, entry.session.projectId)
    this.cleanupOwners.set(task, entry.ownerId)
    void task.finally(() => this.cleanupOwners.delete(task)).catch(() => undefined)
    void task.finally(() => this.cleanupRequests.delete(task)).catch(() => undefined)
    return task
  }

  private async performCleanupRequest(entry: LifecycleSession): Promise<void> {
    await entry.ready
    if (entry.finalized) return
    try {
      await this.execution!.manager.cleanupOwner(sessionOwner(entry.session.sessionId))
      if (entry.plan) entry.plan.cleanupFailed = false
      if (entry.plan && entry.cancelled) this.finalize(entry, 'CANCELLED')
    }
    catch {
      const failure = runFailure('run:cleanup', 'Run cleanup failed. Retry Stop before running this file again.',
        entry.plan && /\.csproj$/i.test(entry.session.relativePath) ? 'CLEANUP_FAILED' : undefined)
      if (entry.plan) {
        entry.plan.cleanupFailed = true
        this.transition(entry, 'STOPPING')
        this.emitError(entry, failure)
      }
      throw failure
    }
  }

  private cleanup(entry: LifecycleSession): Promise<void> {
    this.sealInput(entry)
    if (entry.finalized) return Promise.resolve()
    if (entry.cleanup) return entry.cleanup
    if (!entry.plan || entry.cancelled) this.transition(entry, 'STOPPING')
    const task = Promise.resolve().then(async () => {
      if (!entry.process) throw runFailure('run:cleanup', 'Run process is not ready for cleanup.')
      // The verified adapter waits for the tree, root, both EOFs and native release.
      await entry.process.close()
    }).catch(() => {
      const failure = runFailure('run:cleanup', 'Run cleanup failed. Retry Stop before running this file again.')
      if (!entry.plan) this.emitError(entry, failure)
      throw failure
    }).finally(() => { if (entry.cleanup === task) entry.cleanup = undefined })
    entry.cleanup = task
    return task
  }

  private observe(entry: LifecycleSession, event: PipedProcessEvent): void {
    if (entry.finalized || this.sessions.get(entry.session.sessionId) !== entry
      || this.targets.get(entry.identity) !== entry) return
    if (event.type === 'stdout' || event.type === 'stderr') {
      if (event.type === 'stdout' ? entry.stdoutEof : entry.stderrEof) return
      this.emit(entry, { type: event.type, session: entry.session, data: event.data })
      return
    }
    if (event.type === 'stdout-eof') entry.stdoutEof = true
    else if (event.type === 'stderr-eof') entry.stderrEof = true
    else if (event.type === 'exit') {
      if (entry.exitCode !== null) return
      entry.exitCode = event.exitCode
      if (entry.plan?.phase === 'EXECUTING') this.closeLiveInput(entry, entry.cancelled ? 'STOPPED' : 'EXITED')
      if (entry.plan) { entry.plan.finished?.(); return }
      // Root exit initiates owned descendant cleanup even if a child holds a pipe.
      void this.requestCleanup(entry).catch(() => undefined) // cleanup emits its safe failure
    } else if (!entry.observationFailed) {
      entry.observationFailed = true
      if (entry.plan?.phase === 'EXECUTING') this.closeLiveInput(entry, entry.cancelled ? 'STOPPED' : 'EXITED')
      this.emitError(entry, runFailure('run:output', 'Run output could not be fully observed.',
        entry.plan && /\.csproj$/i.test(entry.session.relativePath) ? 'OBSERVATION_FAILED' : undefined))
      if (entry.plan) { entry.plan.finished?.(); return }
      void this.requestCleanup(entry).catch(() => undefined) // ownership retained on failure
    }
  }

  private transition(entry: LifecycleSession, state: RunState): void {
    if (entry.finalized || entry.session.state === state) return
    entry.session = Object.freeze({ ...entry.session, state })
    this.emit(entry, { type: 'state', session: entry.session })
  }

  private finalize(entry: LifecycleSession, state: 'EXITED' | 'FAILED' | 'CANCELLED'): void {
    if (entry.finalized) return
    this.sealInput(entry)
    entry.plan?.sourceLease?.release()
    entry.session = Object.freeze({ ...entry.session, state })
    entry.finalized = true
    this.sessions.delete(entry.session.sessionId)
    if (this.targets.get(entry.identity) === entry) this.targets.delete(entry.identity)
    this.completed.set(entry.session.sessionId, { session: entry.session, ownerId: entry.ownerId })
    if (this.completed.size > 128) {
      const oldest = this.completed.keys().next().value!
      this.completed.delete(oldest)
      this.inputs.delete(oldest)
    }
    this.emit(entry, { type: 'state', session: entry.session })
    this.emit(entry, { type: 'exit', session: entry.session, exitCode: entry.exitCode })
    try { this.execution?.onFinalized?.(entry.ownerId, entry.session) }
    catch { this.execution?.onEventSinkError?.(runFailure('run:event', 'Run finalization notification failed.')) }
  }

  private emitError(entry: LifecycleSession, error: DomainError): void {
    const safe = serializeAppError(error)
    this.emit(entry, { type: 'error', session: entry.session, error: {
      code: safe.code, message: safe.message, retryable: safe.retryable,
      ...(safe.operation === undefined ? {} : { operation: safe.operation }),
      ...(safe.details === undefined ? {} : { details: safe.details }),
    } })
  }

  private emit(entry: LifecycleSession, event: RunEvent): void {
    if (this.stopping || entry.muted) return
    try { this.execution!.onEvent(entry.ownerId, event) }
    catch { this.execution?.onEventSinkError?.(runFailure('run:event', 'Run event delivery failed.')) }
  }

  getPreparation(sessionId: RunSessionId, ownerId: number): RunPreparation {
    const owned = this.preparations.get(sessionId)
    if (!owned || owned.ownerId !== ownerId) throw new DomainError({ code: 'PERMISSION_DENIED',
      retryable: false, operation: 'run:session', message: 'Run session is not owned by this window.' })
    return Object.freeze({ session: owned.session, execution: owned.execution,
      identity: owned.identity, fingerprint: owned.fingerprint })
  }

  /** Only unstarted preparations; never an execution/cleanup substitute. */
  releasePreparation(sessionId: RunSessionId, ownerId: number): void {
    this.getPreparation(sessionId, ownerId)
    if (this.processes.has(sessionId)) throw new Error('A live process must be cleaned before preparation release.')
    this.preparations.delete(sessionId)
  }

  /** 4B Main-only launch seam. Not a public Run command; no re-run/UI policy. */
  async launchPrepared(sessionId: RunSessionId, ownerId: number, adapter: PipedProcessAdapter,
    manager: ProcessManager, observe: (event: PipedProcessEvent) => void,
    lifecycle?: LaunchLifecycle): Promise<PipedRunProcess> {
    const preparation = this.getPreparation(sessionId, ownerId)
    if (this.processes.has(sessionId)) throw new Error('Preparation has already launched.')
    // Recheck project/disk/runtime authority after async preparation, before creation.
    const current = await this.resolve({ projectId: preparation.session.projectId,
      relativePath: preparation.session.relativePath, dirty: false }, ownerId)
    const execution = current.execution
    this.getPreparation(sessionId, ownerId)
    if (this.processes.has(sessionId)) throw new Error('Preparation has already launched.')
    if (current.identity !== preparation.identity || current.fingerprint !== preparation.fingerprint) {
      throw invalidInputError('run:launch', ['target'])
    }
    let native: PipedRunProcess | undefined
    lifecycle?.canLaunch?.()
    // Register before creation so registration failure cannot orphan a process.
    const unregister = manager.register({ id: sessionId,
      ownerId: lifecycle ? sessionOwner(sessionId) : `run-owner:${ownerId}`,
      close: async () => { if (native) await (lifecycle ? lifecycle.cleanup() : process.close()) } })
    try { native = adapter.create(execution, observe) }
    catch (error) { unregister(); throw error }
    const created = native
    const process = forwardRunProcess(created, async () => {
      await created.close()
      if (!created.isReleased()) throw new Error('Native Run resource was not released.')
      lifecycle?.released()
      this.processes.delete(sessionId)
      this.preparations.delete(sessionId)
      unregister()
    })
    this.processes.set(sessionId, process)
    return process
  }

  sendInput(value: unknown, ownerId: number): Promise<RunInputAcknowledgement> {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return Promise.reject(invalidInputError('run:input', ['owner']))
    const identity = inputIdentity(value)
    if (!identity) return Promise.reject(invalidInputError('run:input', ['request']))
    const validated = validateSendRunInputRequest(value)
    const denial = this.denyInput(identity, ownerId)
    if (denial) return Promise.resolve(denial)
    if (!validated.ok) {
      const text = value && typeof value === 'object' ? (value as { text?: unknown }).text : undefined
      const exact = !!value && typeof value === 'object'
        && Object.keys(value).length === 4
        && ['projectId', 'sessionId', 'sequence', 'text'].every(key => Object.prototype.hasOwnProperty.call(value, key))
      if (!exact || typeof text !== 'string') {
        return Promise.resolve(runInputRejection(identity.projectId, identity.sessionId, identity.sequence, 'INVALID_INPUT'))
      }
      return this.queueFor(identity.sessionId).submit({ ...identity, text })
    }
    return this.queueFor(validated.value.sessionId).submit(validated.value)
  }

  closeInput(value: unknown, ownerId: number): Promise<RunInputAcknowledgement> {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return Promise.reject(invalidInputError('run:input', ['owner']))
    const identity = inputIdentity(value)
    if (!identity) return Promise.reject(invalidInputError('run:input', ['request']))
    const validated = validateCloseRunInputRequest(value)
    const denial = this.denyInput(identity, ownerId)
    if (denial) return Promise.resolve(denial)
    if (!validated.ok) return Promise.resolve(runInputRejection(identity.projectId, identity.sessionId, identity.sequence, 'INVALID_INPUT'))
    return this.queueFor(validated.value.sessionId).close(validated.value)
  }

  getInputStatus(sessionId: RunSessionId, ownerId: number): RunInputStatus {
    if (!isRunSessionId(sessionId) || !Number.isSafeInteger(ownerId) || ownerId <= 0) {
      throw invalidInputError('run:input', ['sessionId'])
    }
    const entry = this.sessions.get(sessionId)
    const retained = this.inputs.get(sessionId)
    const owner = entry?.ownerId ?? retained?.ownerId
    if (owner === undefined || owner !== ownerId) throw inputDenied()
    if (entry?.input) return entry.input.status()
    if (!entry && retained) return retained.queue.status()
    return this.inactiveStatus(entry!)
  }

  /** Owner, project, step, and lifecycle denials. Undefined means the live queue may accept the request. */
  private denyInput(request: { projectId: ProjectId; sessionId: RunSessionId; sequence: number },
    ownerId: number): RunInputAcknowledgement | undefined {
    const entry = this.sessions.get(request.sessionId)
    const retained = this.inputs.get(request.sessionId)
    const owner = entry?.ownerId ?? retained?.ownerId
    const projectId = entry?.session.projectId ?? retained?.projectId
    if (owner === undefined || owner !== ownerId || projectId !== request.projectId) {
      return runInputRejection(request.projectId, request.sessionId, request.sequence, 'SESSION_UNAVAILABLE')
    }
    if (entry) {
      const blocked = this.inputGuard(entry)
      if (blocked) {
        this.closeLiveInput(entry, blocked)
        return runInputRejection(request.projectId, request.sessionId, request.sequence, 'INPUT_CLOSED')
      }
    }
    if (!(entry?.input ?? retained?.queue)) {
      return runInputRejection(request.projectId, request.sessionId, request.sequence, 'CAPABILITY_DENIED')
    }
    return undefined
  }

  private queueFor(sessionId: RunSessionId): RunInputQueue {
    const queue = this.sessions.get(sessionId)?.input ?? this.inputs.get(sessionId)?.queue
    if (!queue) throw inputDenied()
    return queue
  }

  private inputGuard(entry: LifecycleSession): RunInputGateReason | undefined {
    if (this.stopping) return 'SHUTDOWN'
    if ((this.ownerGenerations.get(entry.ownerId) ?? 0) !== entry.ownerGeneration) return 'OWNER_LOST'
    if (this.projectBlocks.has(entry.session.projectId)
      || (this.projectGenerations.get(entry.session.projectId) ?? 0) !== entry.projectGeneration) {
      return 'PROJECT_CHANGED'
    }
    return undefined
  }

  private inactiveStatus(entry: LifecycleSession): RunInputStatus {
    const phase = entry.plan?.phase ?? 'EXECUTING'
    return {
      projectId: entry.session.projectId,
      sessionId: entry.session.sessionId,
      capability: runInputCapability(entry.kind, phase),
      nextSequence: 1,
      queuedSubmissions: 0,
      queuedUtf8Bytes: 0,
      gate: 'CLOSED',
      // Closed capability is the authority. EOF here means this step has no writer.
      reason: entry.inputBlock ?? (this.stopping ? 'SHUTDOWN' : 'EOF'),
    }
  }

  private attachInput(entry: LifecycleSession, process: PipedRunProcess): void {
    if (process.stdin !== 'line-input' || !process.writeInput || !process.closeInput) return
    const writeInput = process.writeInput
    const closeInput = process.closeInput
    const queue = new RunInputQueue(entry.session.projectId, entry.session.sessionId, {
      writeInput: bytes => writeInput.call(process, bytes),
      closeInput: () => closeInput.call(process),
    }, () => {
      if (!entry.finalized) void this.stopRun(entry.session.sessionId, entry.ownerId).catch(() => undefined)
    })
    entry.input = queue
    this.inputs.set(entry.session.sessionId, {
      ownerId: entry.ownerId, projectId: entry.session.projectId, queue,
    })
    if (entry.inputBlock) queue.closeGate(entry.inputBlock)
    else if (this.stopping) queue.closeGate('SHUTDOWN')
    else if (entry.cancelled) queue.closeGate('STOPPED')
  }

  /** First explicit lifecycle reason wins over EOF. Later reasons do not replace it. */
  private closeLiveInput(entry: LifecycleSession, reason: RunInputGateReason): void {
    if (entry.inputBlock === undefined || entry.inputBlock === 'EOF') entry.inputBlock = reason
    entry.input?.closeGate(reason)
  }

  private sealInput(entry: LifecycleSession): void {
    if (!entry.input || entry.input.status().gate === 'CLOSED') return
    this.closeLiveInput(entry, this.stopping ? 'SHUTDOWN' : entry.cancelled ? 'STOPPED' : 'EXITED')
  }
}

function forwardRunProcess(created: PipedRunProcess, close: () => Promise<void>): PipedRunProcess {
  return {
    ownership: created.ownership,
    settled: created.settled,
    isReleased: () => created.isReleased(),
    ...(created.stdin === undefined ? {} : { stdin: created.stdin }),
    ...(created.writeInput ? { writeInput: (bytes: Uint8Array) => created.writeInput!(bytes) } : {}),
    ...(created.closeInput ? { closeInput: () => created.closeInput!() } : {}),
    close,
  }
}
function inputDenied(): DomainError {
  return new DomainError({ code: 'PERMISSION_DENIED', operation: 'run:input', retryable: false,
    message: 'Run session is not owned by this window.' })
}
function inputIdentity(value: unknown): { projectId: ProjectId; sessionId: RunSessionId; sequence: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.projectId !== 'string' || !/^project_[a-f0-9]{24}$/.test(record.projectId)) return undefined
  if (!isRunSessionId(record.sessionId)) return undefined
  if (typeof record.sequence !== 'number' || !Number.isSafeInteger(record.sequence) || record.sequence < 1) return undefined
  return { projectId: record.projectId as ProjectId, sessionId: record.sessionId, sequence: record.sequence }
}
function sessionOwner(sessionId: RunSessionId): string { return `run-session:${sessionId}` }
/** Detach an uncooperative promise on cancellation while still observing rejection. */
function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(runFailure('run:prepare', 'Run preparation was cancelled.'))
    }
    if (signal.aborted) { void task.catch(() => undefined); abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    void task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
function runFailure(operation: string, message: string, reason?: string): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', operation, message, retryable: true,
    ...(reason ? { details: { reason } } : {}) })
}
function safeStartError(error: unknown): DomainError {
  return error instanceof DomainError ? error : runFailure('run:start', 'The Run process could not be started.')
}
