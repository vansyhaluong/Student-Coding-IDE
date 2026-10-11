import type { AppError, CSharpProjectRunTarget, CSharpRunTargetResolution, ProjectId, ProjectRunEvent, ProjectRunFailure, RunApi, RunEvent, RunSession, RunSessionId, SemanticRunSession } from '../../../../shared/contracts'
import type { EditorDocument } from '../editor/models/editor-model-manager'

export interface OutputChunk {
  readonly stream: 'stdout' | 'stderr' | 'phase'
  readonly data: string
  /** Renderer-only grouping metadata copied from the semantic session event. */
  readonly phase?: 'PREPARING' | 'BUILD_RESTORE' | 'EXECUTING'
}
export interface RunView {
  readonly kind?: 'javascript-file' | 'csharp-project'
  readonly relativePath: string
  readonly session?: RunSession
  readonly projectSession?: SemanticRunSession
  readonly failure?: string
  readonly failureReason?: ProjectRunFailure['reason']
  readonly phase?: 'PREPARING' | 'BUILD_RESTORE' | 'EXECUTING'
  readonly chunks: readonly OutputChunk[]
  readonly exitCode?: number | null
  readonly error?: string
  readonly pending?: 'start' | 'stop'
}
export interface RunViewSnapshot {
  readonly projectId: ProjectId | null
  readonly available: boolean
  readonly views: ReadonlyMap<string, RunView>
  readonly selected: string | null
  readonly targetResolution?: CSharpRunTargetResolution
  readonly targetBusy?: boolean
  readonly targetError?: string
}
type Target = Pick<EditorDocument, 'projectId' | 'relativePath' | 'dirty' | 'diskState' | 'externalConflict'>
const identity = (path: string) => path.toLowerCase()
const terminal = (session?: RunSession) => !!session && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.state)
const projectTerminal = (session?: SemanticRunSession) => !!session && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.state)
const projectKey = (path: string) => `csharp:${identity(path)}`

export function runUnavailableReason(target: Target | null, projectId: ProjectId | null, available: boolean): string | null {
  if (!target || !projectId || target.projectId !== projectId) return 'Select a file in the active project.'
  if (!available) return 'Project unavailable. Reopen the project before running.'
  if (target.diskState !== 'available') return 'Restore this file before running.'
  if (target.relativePath.endsWith('.ts')) return 'TypeScript Run is not supported in current V1.'
  if (!target.relativePath.endsWith('.js')) return 'Run supports JavaScript .js files only in current V1.'
  if (target.dirty) return 'Save this file before running.'
  if (target.externalConflict) return 'Resolve the file change before running.'
  return null
}

/** View projection only. All RunSession states come from Main; pending denotes IPC, not process state. */
export class RunController {
  private snapshot: RunViewSnapshot = { projectId: null, available: false, views: new Map(), selected: null }
  private readonly listeners = new Set<() => void>()
  private readonly seen = new Set<RunSessionId>()
  private readonly requests = new Map<string, { candidate?: RunSessionId }>()
  private readonly buffered = new Map<string, OutputChunk[]>()
  private frame: number | undefined
  private generation = 0
  private unsubscribe?: () => void
  private unsubscribeProject?: () => void
  private targetRequest = 0
  private projectAttempt?: { generation: number; target: CSharpProjectRunTarget; sessionId?: RunSessionId; stopRequested?: boolean }
  private projectStopRequest = 0
  private pendingTargetCancellation?: Promise<void>

  constructor(private readonly api: RunApi,
    private readonly requestFrame: (callback: () => void) => number,
    private readonly cancelFrame: (frame: number) => void) {}

  connect(): () => void {
    this.unsubscribe ??= this.api.onEvent((event) => this.receive(event))
    this.unsubscribeProject ??= this.api.onProjectEvent((event) => this.receiveProject(event))
    return () => this.disconnect()
  }
  private disconnect(): void {
    this.unsubscribe?.(); this.unsubscribe = undefined
    this.unsubscribeProject?.(); this.unsubscribeProject = undefined
    this.activateProject(null)
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  getSnapshot = (): RunViewSnapshot => this.snapshot
  getView(path: string): RunView | undefined { return this.snapshot.views.get(identity(path)) }

  activateProject(projectId: ProjectId | null): void {
    if (projectId === this.snapshot.projectId && projectId !== null) return
    const previousProjectId = this.snapshot.projectId
    if (previousProjectId && this.snapshot.targetBusy) {
      this.pendingTargetCancellation = this.api.cancelResolution({ projectId: previousProjectId })
        .then(() => undefined, () => undefined)
    }
    this.generation++
    this.targetRequest++
    this.projectAttempt = undefined
    this.clearBuffered()
    this.requests.clear(); this.seen.clear()
    this.snapshot = { projectId, available: projectId !== null, views: new Map(), selected: null }
    this.notify()
  }
  setAvailable(available: boolean): void {
    if (available === this.snapshot.available) return
    if (this.snapshot.projectId && this.snapshot.targetBusy) {
      const projectId = this.snapshot.projectId
      this.pendingTargetCancellation = this.api.cancelResolution({ projectId }).then(() => undefined, () => undefined)
    }
    // Main mutes unavailable project sessions. Clear the active view without inventing exit states.
    this.generation++
    this.targetRequest++
    this.projectAttempt = undefined
    this.clearBuffered(); this.requests.clear(); this.seen.clear()
    this.snapshot = { ...this.snapshot, available, views: new Map(), selected: null,
      targetResolution: undefined, targetBusy: false, targetError: undefined }
    this.notify()
  }
  private clearBuffered(): void {
    if (this.frame !== undefined) this.cancelFrame(this.frame)
    this.frame = undefined; this.buffered.clear()
  }
  private notify(): void { for (const listener of this.listeners) listener() }
  private update(key: string, view: RunView): void {
    this.snapshot = { ...this.snapshot, views: new Map(this.snapshot.views).set(key, view) }
    this.notify()
  }
  private flush = (): void => {
    this.frame = undefined
    const views = new Map(this.snapshot.views)
    for (const [key, chunks] of this.buffered) {
      const view = views.get(key)
      if (view) views.set(key, { ...view, chunks: [...view.chunks, ...chunks] })
    }
    this.buffered.clear()
    this.snapshot = { ...this.snapshot, views }
    this.notify()
  }
  private receive(event: RunEvent): void {
    if (!this.snapshot.available || event.session.projectId !== this.snapshot.projectId) return
    const key = identity(event.session.relativePath)
    let view = this.snapshot.views.get(key)
    const request = this.requests.get(key)
    if (view?.session?.sessionId !== event.session.sessionId) {
      // Only a new STARTING event during our semantic start may select a replacement.
      if (!request || request.candidate || this.seen.has(event.session.sessionId)
        || event.type !== 'state' || event.session.state !== 'STARTING') return
      request.candidate = event.session.sessionId
      this.seen.add(event.session.sessionId)
      this.buffered.delete(key)
      view = { relativePath: event.session.relativePath, chunks: [], pending: 'start' }
    }
    if (!view || (terminal(view.session) && (event.type === 'stdout' || event.type === 'stderr' || event.type === 'state'))) return
    if (event.type === 'stdout' || event.type === 'stderr') {
      const chunks = this.buffered.get(key) ?? []
      chunks.push({ stream: event.type, data: event.data })
      this.buffered.set(key, chunks)
      this.frame ??= this.requestFrame(this.flush)
      return
    }
    const chunks = this.buffered.get(key) ?? []
    this.buffered.delete(key)
    this.update(key, { ...view, chunks: [...view.chunks, ...chunks], session: event.session,
      ...(event.type === 'exit' ? { exitCode: event.exitCode } : {}),
      ...(event.type === 'error' ? { error: safeRunMessage(event.error) } : {}) })
  }

  async resolveTargets(): Promise<void> {
    const projectId = this.snapshot.projectId
    if (!projectId || !this.snapshot.available || this.snapshot.targetBusy) return
    const generation = this.generation, request = ++this.targetRequest
    this.patchSnapshot({ targetBusy: true, targetError: undefined })
    try {
      await this.pendingTargetCancellation
      if (generation !== this.generation || request !== this.targetRequest) return
      const result = await this.api.resolveTargets({ projectId })
      if (generation !== this.generation || request !== this.targetRequest) return
      if (!result.ok) this.patchSnapshot({ targetResolution: undefined, targetError: safeTargetMessage(result.error) })
      else this.patchSnapshot({ targetResolution: result.value, targetError: undefined })
    } catch {
      if (generation === this.generation && request === this.targetRequest) {
        this.patchSnapshot({ targetResolution: undefined, targetError: 'Console projects could not be loaded. Try again.' })
      }
    } finally {
      if (generation === this.generation && request === this.targetRequest) this.patchSnapshot({ targetBusy: false })
    }
  }

  async selectTarget(target: CSharpProjectRunTarget): Promise<boolean> {
    const projectId = this.snapshot.projectId
    if (!projectId || target.projectId !== projectId || !this.snapshot.available || this.snapshot.targetBusy) return false
    const generation = this.generation, request = ++this.targetRequest
    this.patchSnapshot({ targetBusy: true, targetError: undefined })
    try {
      const result = await this.api.selectTarget(target)
      if (generation !== this.generation || request !== this.targetRequest) return false
      if (!result.ok) { this.patchSnapshot({ targetError: safeTargetMessage(result.error) }); return false }
      this.patchSnapshot({ targetResolution: result.value, targetError: undefined }); return true
    } catch {
      if (generation === this.generation && request === this.targetRequest) this.patchSnapshot({ targetError: 'The target could not be saved. Try again.' })
      return false
    } finally {
      if (generation === this.generation && request === this.targetRequest) this.patchSnapshot({ targetBusy: false })
    }
  }

  async clearTarget(): Promise<void> {
    const projectId = this.snapshot.projectId
    if (!projectId || !this.snapshot.available || this.snapshot.targetBusy) return
    const generation = this.generation, request = ++this.targetRequest
    this.patchSnapshot({ targetBusy: true, targetError: undefined })
    try {
      const result = await this.api.clearTarget({ projectId })
      if (generation !== this.generation || request !== this.targetRequest) return
      if (!result.ok) this.patchSnapshot({ targetError: safeTargetMessage(result.error) })
      else this.patchSnapshot({ targetResolution: result.value, targetError: undefined })
    } catch {
      if (generation === this.generation && request === this.targetRequest) this.patchSnapshot({ targetError: 'The saved target could not be cleared. Try again.' })
    } finally {
      if (generation === this.generation && request === this.targetRequest) this.patchSnapshot({ targetBusy: false })
    }
  }

  async cancelTargetRequest(): Promise<boolean> {
    const projectId = this.snapshot.projectId
    if (!projectId || !this.snapshot.targetBusy) return true
    const request = ++this.targetRequest, generation = this.generation
    try {
      const result = await this.api.cancelResolution({ projectId })
      if (generation === this.generation && request === this.targetRequest) {
        this.patchSnapshot({ targetBusy: !result.ok, targetError: result.ok ? undefined : safeTargetMessage(result.error) })
      }
      return result.ok
    } catch {
      if (generation === this.generation && request === this.targetRequest) {
        this.patchSnapshot({ targetBusy: true, targetError: 'The target request could not be cancelled. Retry cancellation before making another target request.' })
      }
      return false
    }
  }

  private patchSnapshot(patch: Partial<RunViewSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.notify()
  }

  async startProjectRun(target: CSharpProjectRunTarget, dirty: boolean, conflict: boolean, locked: boolean): Promise<void> {
    const projectId = this.snapshot.projectId, resolution = this.snapshot.targetResolution
    if (locked || !projectId || !this.snapshot.available || this.projectAttempt
      || !resolution || resolution.state !== 'READY' || resolution.target.relativePath !== target.relativePath
      || target.projectId !== projectId) return
    const key = projectKey(target.relativePath), generation = this.generation
    this.projectAttempt = { generation, target }
    this.snapshot = { ...this.snapshot, selected: key }
    if (dirty || conflict) {
      this.update(key, { kind: 'csharp-project', relativePath: target.relativePath, chunks: [],
        error: dirty ? 'Save changed files before running.' : 'Resolve changed or missing files before running.' })
      this.projectAttempt = undefined
      return
    }
    this.update(key, { kind: 'csharp-project', relativePath: target.relativePath, chunks: [], pending: 'start', phase: 'PREPARING' })
    try {
      const result = await this.api.startProject({ ...target, dirty: false })
      if (generation !== this.generation) return
      const attempt = this.projectAttempt
      if (!result.ok) {
        if (attempt?.generation === generation) this.update(key, { ...this.getView(key)!, pending: undefined, error: safeTargetMessage(result.error) })
        this.projectAttempt = undefined
      } else if (attempt?.sessionId === result.value.sessionId) {
        const current = this.getView(key)!
        this.update(key, { ...current, pending: undefined })
        if (attempt.stopRequested) void this.stopProjectSession(result.value.sessionId, key)
      } else if (attempt && !attempt.sessionId) {
        attempt.sessionId = result.value.sessionId
        this.update(key, { ...this.getView(key)!, projectSession: result.value, phase: result.value.phase, pending: undefined })
        if (projectTerminal(result.value)) this.projectAttempt = undefined
        else if (attempt.stopRequested) void this.stopProjectSession(result.value.sessionId, key)
      }
    } catch {
      if (generation === this.generation) this.update(key, { ...this.getView(key)!, pending: undefined,
        error: 'The C# Run request could not be completed.' })
      this.projectAttempt = undefined
    }
  }

  async stopProject(): Promise<void> {
    const attempt = this.projectAttempt
    if (!attempt || attempt.generation !== this.generation) return
    if (!attempt.sessionId) { attempt.stopRequested = true; return }
    await this.stopProjectSession(attempt.sessionId, projectKey(attempt.target.relativePath))
  }

  private async stopProjectSession(sessionId: RunSessionId, key: string): Promise<void> {
    const generation = this.generation, request = ++this.projectStopRequest
    const view = this.getView(key)
    if (!view?.projectSession || projectTerminal(view.projectSession)) return
    this.update(key, { ...view, pending: 'stop', error: undefined })
    try {
      const result = await this.api.stop(sessionId)
      if (generation !== this.generation || request !== this.projectStopRequest) return
      const current = this.getView(key)
      if (current?.projectSession?.sessionId !== sessionId) return
      this.update(key, { ...current, pending: undefined, ...(!result.ok ? { error: safeTargetMessage(result.error) } : {}) })
    } catch {
      if (generation === this.generation && request === this.projectStopRequest) {
        const current = this.getView(key)
        if (current?.projectSession?.sessionId === sessionId) this.update(key, { ...current, pending: undefined,
          error: 'The Stop request could not be completed. Retry Stop.' })
      }
    }
  }

  private receiveProject(event: ProjectRunEvent): void {
    const attempt = this.projectAttempt
    if (!this.snapshot.available || event.session.projectId !== this.snapshot.projectId || !attempt
      || attempt.generation !== this.generation || event.session.relativePath !== attempt.target.relativePath) return
    if (!attempt.sessionId) {
      if (event.type !== 'state' || event.session.state !== 'STARTING') return
      attempt.sessionId = event.session.sessionId
    }
    if (attempt.sessionId !== event.session.sessionId) return
    const key = projectKey(event.session.relativePath), previous = this.getView(key)
    if (!previous || (previous.projectSession && previous.projectSession.sessionId !== event.session.sessionId)
      || (!previous.projectSession && previous.pending !== 'start')) return
    const chunks = [...previous.chunks]
    const phaseLabel = event.session.phase === 'BUILD_RESTORE' ? 'Build / restore'
      : event.session.phase === 'EXECUTING' ? 'Execution' : null
    const queuedChunks = this.buffered.get(key) ?? []
    if (phaseLabel && previous.phase !== event.session.phase || event.type === 'exit' || event.type === 'error') {
      chunks.push(...queuedChunks)
      this.buffered.delete(key)
    }
    if (phaseLabel && previous.phase !== event.session.phase) chunks.push({ stream: 'phase', data: phaseLabel })
    if (event.type === 'stdout' || event.type === 'stderr') {
      const buffer = this.buffered.get(key) ?? []
      buffer.push({ stream: event.type, data: event.data, phase: event.session.phase })
      this.buffered.set(key, buffer)
      this.frame ??= this.requestFrame(this.flush)
    }
    const failure = event.type === 'error' ? projectFailureMessage(event.failure) : previous.failure
    const terminalEvent = event.type === 'exit' || projectTerminal(event.session)
    this.update(key, { ...previous, chunks, projectSession: event.session, phase: event.session.phase,
      ...(event.type === 'exit' ? { exitCode: event.exitCode } : {}),
      ...(failure ? { failure, ...(event.type === 'error' ? { failureReason: event.failure.reason } : {}) } : {}), ...(terminalEvent ? { pending: undefined } : {}),
      ...(event.type === 'error' ? { error: failure } : {}) })
    if (attempt.stopRequested && attempt.sessionId && !previous.pending) void this.stopProjectSession(attempt.sessionId, key)
    if (event.type === 'exit') this.projectAttempt = undefined
  }
  async start(target: Target, locked = false): Promise<void> {
    if (locked || runUnavailableReason(target, this.snapshot.projectId, this.snapshot.available)) return
    const key = identity(target.relativePath)
    const old = this.getView(target.relativePath)
    if (old?.pending || old?.session?.state === 'STOPPING') return
    const generation = this.generation
    const request: { candidate?: RunSessionId } = {}
    this.requests.set(key, request)
    this.snapshot = { ...this.snapshot, selected: key }
    this.update(key, { ...(!terminal(old?.session) && old ? old : { relativePath: target.relativePath, chunks: [] }), error: undefined, pending: 'start' })
    try {
      const result = await this.api.start({ projectId: target.projectId, relativePath: target.relativePath, dirty: target.dirty })
      if (generation !== this.generation) return
      const current = this.getView(target.relativePath)!
      if (!result.ok) this.update(key, { ...current, error: safeRunMessage(result.error), pending: undefined })
      else if (current.session?.sessionId === result.value.sessionId) {
        // A fast process can already have exited before its invoke response arrives.
        this.update(key, { ...current, pending: undefined })
      } else if (!request.candidate) {
        this.seen.add(result.value.sessionId)
        this.buffered.delete(key)
        this.update(key, { relativePath: target.relativePath, session: result.value, chunks: [] })
      }
    } catch {
      if (generation === this.generation) this.update(key, { ...this.getView(target.relativePath)!,
        pending: undefined, error: 'The Run request could not be completed.' })
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key)
    }
  }
  async stop(path: string): Promise<void> {
    const key = identity(path), view = this.getView(path)
    if (!view?.session || view.pending || terminal(view.session)) return
    const generation = this.generation, sessionId = view.session.sessionId
    this.snapshot = { ...this.snapshot, selected: key }
    this.update(key, { ...view, pending: 'stop', error: undefined })
    try {
      const result = await this.api.stop(sessionId)
      if (generation !== this.generation) return
      const current = this.getView(path)
      if (current?.session?.sessionId !== sessionId) return
      this.update(key, { ...current, pending: undefined, ...(!result.ok ? { error: safeRunMessage(result.error) } : {}) })
    } catch {
      if (generation === this.generation) this.update(key, { ...this.getView(path)!, pending: undefined,
        error: 'The Stop request could not be completed. Retry Stop.' })
    }
  }
}

function safeRunMessage(error: AppError): string {
  if (error.code === 'DEPENDENCY_MISSING') return 'Node.js was not found on PATH. Install Node.js and restart the IDE.'
  // Main already serializes domain errors. Native exceptions never reach this view.
  return error.message
}

function safeTargetMessage(error: AppError): string {
  if (error.code === 'DEPENDENCY_MISSING') return 'The .NET SDK is unavailable. Install or repair the .NET SDK, then refresh targets.'
  return error.message
}

function projectFailureMessage(failure: ProjectRunFailure): string {
  switch (failure.reason) {
    case 'BUILD_OR_RESTORE_FAILED': return `Build or restore failed (exit ${failure.exitCode}).`
    case 'EXECUTION_FAILED': return failure.exitCode === null ? 'Execution failed.' : `Execution failed (exit ${failure.exitCode}).`
    case 'DEPENDENCY_MISSING': return 'The .NET SDK is unavailable. Install or repair the .NET SDK, then try again.'
    case 'INVALID_CONFIGURATION': return 'The .NET SDK configuration is invalid. Check the project SDK configuration, then try again.'
    case 'SELECTION_REQUIRED': return 'Choose a Console project before running.'
    case 'NO_RUNNABLE_PROJECT': return 'No runnable Console project was found.'
    case 'STALE_TARGET': return 'The selected project is no longer available or eligible. Choose a target again.'
    case 'PERSISTENCE_RECOVERED': return 'The saved target selection was recovered. Confirm a target before running.'
    case 'SOURCE_DIRTY': return 'Save changed files before running.'
    case 'SOURCE_CONFLICT': return 'Resolve changed or missing files before running.'
    case 'SOURCE_STATE_UNKNOWN': case 'SOURCE_GUARD_TIMEOUT': case 'SOURCE_GUARD_UNAVAILABLE':
      return 'The IDE could not verify saved files. Restore project access and try again.'
    case 'SOURCE_CHANGED': return 'A file changed while preparing to run. Review and run again.'
    case 'SOURCE_GUARD_CANCELLED': return 'The saved-file check was cancelled. Try Run again.'
    case 'SOURCE_GUARD_LIMIT_EXCEEDED': return 'Too many Run checks are active. Stop other runs and try again.'
    case 'PROJECT_CHANGED': return 'The active project changed. Select a target again.'
    case 'INVALID_TARGET': case 'INVALID_PROJECT': case 'INVALID_PROJECT_REFERENCE':
      return 'The selected Console project is no longer available or eligible. Refresh targets.'
    case 'PERSISTENCE_FAILED': return 'The target choice could not be saved. Try again.'
    case 'DISCOVERY_LIMIT_EXCEEDED': return 'Too many Console projects were found to list. Narrow the project folder and refresh.'
    case 'PREFLIGHT_FAILED': return 'The Console project could not be prepared. Check the project and .NET SDK configuration.'
    case 'SPAWN_FAILED': return 'The Console project could not be started.'
    case 'OBSERVATION_FAILED': return 'The Console process could not be monitored safely.'
    case 'CLEANUP_FAILED': return 'The Console process is still stopping. Retry Stop before running again.'
    default: return 'The Console project could not be run. Review the project and try again.'
  }
}
