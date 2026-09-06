import { randomUUID } from 'node:crypto'
import { validateStartRunRequest, validateStopRunRequest, type RunEvent, type RunState,
  type RunSession, type RunSessionId, type StartRunRequest } from '../../../shared/contracts/run'
import { DomainError, invalidInputError, serializeAppError } from '../../errors/app-error'
import { normalizePathIdentity } from '../project/project-identity'
import { JavaScriptRunStrategy } from './javascript-run-strategy'
import type { AuthorizedRunTarget, PreparedRun, RunRuntime, RunStrategy } from './run-strategy'
import type { PipedProcessAdapter, PipedProcessEvent, PipedRunProcess } from './piped-process-adapter'
import type { ProcessManager } from '../process/process-manager'

/** Later execution composition must authorize disk/project state, then revalidate
 * immediately before spawn. Renderer dirty/current-file state stays UI-owned. */
export interface RunPreparationAuthority {
  authorize(target: StartRunRequest, ownerId: number): Promise<AuthorizedRunTarget>
  resolveRuntime(): Promise<RunRuntime>
}
export interface RunPreparation {
  readonly session: RunSession
  readonly execution: PreparedRun
}
interface OwnedPreparation extends RunPreparation { readonly ownerId: number }
interface LifecycleSession {
  session: RunSession
  readonly ownerId: number
  readonly identity: string
  readonly ready: Promise<void>
  process?: PipedRunProcess
  cleanup?: Promise<void>
  exitCode: number | null
  stdoutEof: boolean
  stderrEof: boolean
  cancelled: boolean
  observationFailed: boolean
  finalized: boolean
  muted?: boolean
}
export interface RunExecutionOptions {
  adapter: PipedProcessAdapter
  manager: ProcessManager
  onEvent(ownerId: number, event: RunEvent): void
  onEventSinkError?(error: unknown): void
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
  private readonly strategies: readonly RunStrategy[] = [new JavaScriptRunStrategy()]
  private readonly sessions = new Map<RunSessionId, LifecycleSession>()
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
    private readonly execution?: RunExecutionOptions) {}

  private async resolve(request: StartRunRequest, ownerId: number): Promise<{
    target: StartRunRequest; execution: PreparedRun
  }> {
    const validation = validateStartRunRequest(request)
    if (!validation.ok) throw invalidInputError('run:prepare', validation.issues.map((issue) => issue.path))
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw invalidInputError('run:prepare', ['owner'])
    // Capture validated input before awaiting any Main authority operation.
    const target = validation.value
    if (target.dirty) throw new DomainError({ code: 'INVALID_INPUT', retryable: false,
      operation: 'run:prepare', message: 'Save this file before running it.' })
    const strategy = this.strategies.find((candidate) => candidate.supports(target))
    if (!strategy) throw new DomainError({ code: 'UNSUPPORTED', retryable: false,
      operation: 'run:prepare', message: target.relativePath.endsWith('.ts')
        ? 'TypeScript Run is not supported in current V1.'
        : 'Run supports JavaScript .js files only in current V1.' })
    const authorized = await this.authority.authorize(target, ownerId)
    if (authorized.projectId !== target.projectId || authorized.relativePath !== target.relativePath) {
      throw invalidInputError('run:prepare', ['target'])
    }
    const runtime = await this.authority.resolveRuntime()
    const execution = strategy.prepare(authorized, runtime)
    return { target, execution }
  }

  async prepare(request: StartRunRequest, ownerId: number): Promise<RunPreparation> {
    const { target, execution } = await this.resolve(request, ownerId)
    // Preparations are serialized by target identity at the final synchronous insertion.
    const identity = normalizePathIdentity(execution.args[0], 'win32')
    if ([...this.preparations.values()].some((entry) =>
      normalizePathIdentity(entry.execution.args[0], 'win32') === identity)) {
      throw new DomainError({ code: 'PROCESS_FAILED', retryable: true,
        operation: 'run:prepare', message: 'The previous Run preparation must be released first.' })
    }
    const session: RunSession = Object.freeze({ projectId: target.projectId,
      relativePath: target.relativePath, sessionId: `run_${randomUUID()}` as RunSessionId,
      state: 'STARTING' })
    const preparation = Object.freeze({ session, execution })
    this.preparations.set(session.sessionId, { ...preparation, ownerId })
    return preparation
  }

  startRun(request: StartRunRequest, ownerId: number): Promise<RunSession> {
    const validation = validateStartRunRequest(request)
    if (!validation.ok) return Promise.reject(invalidInputError('run:start', ['target']))
    const target = validation.value
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

  /** Main lifecycle lease; invalidates earlier asynchronous starts, even after release. */
  suspendProject(projectId: string): () => void {
    this.projectGenerations.set(projectId, (this.projectGenerations.get(projectId) ?? 0) + 1)
    this.projectBlocks.set(projectId, (this.projectBlocks.get(projectId) ?? 0) + 1)
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
      if (entry.ownerId === ownerId) entry.muted = true
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
    for (const entry of this.sessions.values()) entry.muted = true
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
    const identity = normalizePathIdentity(resolved.execution.args[0], 'win32')
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
      if (normalizePathIdentity(preparation.execution.args[0], 'win32') !== identity) {
        this.releasePreparation(preparation.session.sessionId, ownerId)
        throw invalidInputError('run:start', ['target'])
      }
      let ready!: () => void
      const entry: LifecycleSession = { session: preparation.session, ownerId, identity,
        ready: new Promise<void>((resolve) => { ready = resolve }), exitCode: null,
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
    if (entry.exitCode === null) entry.cancelled = true
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
    try { await this.execution!.manager.cleanupOwner(sessionOwner(entry.session.sessionId)) }
    catch { throw runFailure('run:cleanup', 'Run cleanup failed. Retry Stop before running this file again.') }
  }

  private cleanup(entry: LifecycleSession): Promise<void> {
    if (entry.finalized) return Promise.resolve()
    if (entry.cleanup) return entry.cleanup
    this.transition(entry, 'STOPPING')
    const task = Promise.resolve().then(async () => {
      if (!entry.process) throw runFailure('run:cleanup', 'Run process is not ready for cleanup.')
      // The verified adapter waits for the tree, root, both EOFs and native release.
      await entry.process.close()
    }).catch(() => {
      const failure = runFailure('run:cleanup', 'Run cleanup failed. Retry Stop before running this file again.')
      this.emitError(entry, failure)
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
      // Root exit initiates owned descendant cleanup even if a child holds a pipe.
      void this.requestCleanup(entry).catch(() => undefined) // cleanup emits its safe failure
    } else if (!entry.observationFailed) {
      entry.observationFailed = true
      this.emitError(entry, runFailure('run:output', 'Run output could not be fully observed.'))
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
    entry.session = Object.freeze({ ...entry.session, state })
    entry.finalized = true
    this.sessions.delete(entry.session.sessionId)
    if (this.targets.get(entry.identity) === entry) this.targets.delete(entry.identity)
    this.completed.set(entry.session.sessionId, { session: entry.session, ownerId: entry.ownerId })
    if (this.completed.size > 128) this.completed.delete(this.completed.keys().next().value!)
    this.emit(entry, { type: 'state', session: entry.session })
    this.emit(entry, { type: 'exit', session: entry.session, exitCode: entry.exitCode })
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
    return { session: owned.session, execution: owned.execution }
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
    const current = await this.authority.authorize({ projectId: preparation.session.projectId,
      relativePath: preparation.session.relativePath, dirty: false }, ownerId)
    const execution = this.strategies.find((strategy) => strategy.supports(current))!
      .prepare(current, await this.authority.resolveRuntime())
    this.getPreparation(sessionId, ownerId)
    if (this.processes.has(sessionId)) throw new Error('Preparation has already launched.')
    if (current.projectId !== preparation.session.projectId
      || current.relativePath !== preparation.session.relativePath
      || normalizePathIdentity(execution.args[0], 'win32') !== normalizePathIdentity(preparation.execution.args[0], 'win32')) {
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
    const process: PipedRunProcess = {
      ownership: created.ownership, settled: created.settled, isReleased: () => created.isReleased(),
      close: async () => {
        await created.close()
        if (!created.isReleased()) throw new Error('Native Run resource was not released.')
        lifecycle?.released()
        this.processes.delete(sessionId)
        this.preparations.delete(sessionId)
        unregister()
      },
    }
    this.processes.set(sessionId, process)
    return process
  }
}

function sessionOwner(sessionId: RunSessionId): string { return `run-session:${sessionId}` }
function runFailure(operation: string, message: string): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', operation, message, retryable: true })
}
function safeStartError(error: unknown): DomainError {
  return error instanceof DomainError ? error : runFailure('run:start', 'The Run process could not be started.')
}
