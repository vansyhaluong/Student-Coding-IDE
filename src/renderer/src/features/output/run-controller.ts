import type { AppError, AppResult, ProjectId, RunApi, RunEvent, RunSession, RunSessionId } from '../../../../shared/contracts'
import { prepareRunInputText, type RunInputAcknowledgement, type RunInputRejectionReason, type RunInputStatus } from '../../../../shared/contracts'
import type { CSharpRunTargetResolution, CSharpRunSession, ProjectRunEvent, ProjectRunFailure, RunExecutionPhase } from '../../../../shared/contracts'
import type { EditorDocument } from '../editor/models/editor-model-manager'

export interface OutputChunk { readonly stream: 'stdout' | 'stderr' | 'phase' | 'input'; readonly data: string }
export interface RunView {
  readonly relativePath: string
  readonly session?: RunSession
  readonly chunks: readonly OutputChunk[]
  readonly exitCode?: number | null
  readonly error?: string
  readonly pending?: 'start' | 'stop'
  readonly phase?: RunExecutionPhase
  readonly failure?: ProjectRunFailure
}
export interface ConsoleInputState {
  readonly key: string
  readonly sessionId: RunSessionId
  readonly status: RunInputStatus
  readonly draft: string
  readonly busy: boolean
  readonly notice?: string
}
export interface RunViewSnapshot {
  readonly projectId: ProjectId | null
  readonly available: boolean
  readonly views: ReadonlyMap<string, RunView>
  readonly selected: string | null
  readonly resolution?: CSharpRunTargetResolution
  readonly resolving?: boolean
  readonly targetError?: string
  readonly cancellationFailed?: boolean
  readonly mode?: 'javascript' | 'csharp'
  readonly consoleInput?: ConsoleInputState
}
type Target = Pick<EditorDocument, 'projectId' | 'relativePath' | 'dirty' | 'diskState' | 'externalConflict'>
const identity = (path: string) => path.toLowerCase()
const terminal = (session?: RunSession) => !!session && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.state)

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
  private targetGeneration = 0
  private activation = 0
  private unsubscribe?: () => void
  private unsubscribeProject?: () => void
  private targetOperation?: { projectId: ProjectId; done: Promise<AppResult<CSharpRunTargetResolution>> }
  private cancellation?: Promise<void>
  private blockedCancellation?: ProjectId
  private readonly cancelStarts = new Set<string>()
  private readonly drafts = new Map<RunSessionId, string>()
  private inputEpoch = 0

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
  getProjectView(): RunView | undefined {
    return [...this.snapshot.views].find(([key]) => key.startsWith('csharp:'))?.[1]
  }

  setMode(mode: 'javascript' | 'csharp'): void {
    if (this.projectBusy()) return
    this.snapshot = { ...this.snapshot, mode }; this.notify()
  }
  projectBusy(): boolean {
    const view = this.getProjectView()
    return !!view && (!!view.pending || !!view.session && !terminal(view.session))
  }

  /** Main owns discovery/selection. Never infer READY from the candidate count. */
  async resolveTargets(action: 'resolve' | 'select' | 'clear' = 'resolve', path?: string): Promise<void> {
    const projectId = this.snapshot.projectId, generation = this.targetGeneration
    if (!projectId || !this.snapshot.available || this.projectBusy() || this.snapshot.resolving) return
    for (const key of this.snapshot.views.keys()) if (key.startsWith('csharp:')) this.buffered.delete(key)
    this.dropConsoleInput()
    this.snapshot = { ...this.snapshot,
      views: new Map([...this.snapshot.views].filter(([key]) => !key.startsWith('csharp:'))),
      selected: this.snapshot.selected?.startsWith('csharp:') ? null : this.snapshot.selected }
    this.snapshot = { ...this.snapshot, resolving: true, resolution: undefined, targetError: undefined }; this.notify()
    try {
      await this.cancellation
      if (generation !== this.targetGeneration) return
      if (this.blockedCancellation) throw new Error('cleanup')
      const done = action === 'select' && path
        ? this.api.selectTarget({ kind: 'csharp-project', projectId, relativePath: path })
        : action === 'clear' ? this.api.clearTarget({ projectId }) : this.api.resolveTargets({ projectId })
      const operation = { projectId, done }
      this.targetOperation = operation
      try {
        const result = await done
        if (generation !== this.targetGeneration) return
        if (!result.ok && result.error.details?.reason === 'CLEANUP_FAILED') this.blockedCancellation = projectId
        this.snapshot = { ...this.snapshot, resolving: false,
          cancellationFailed: !!this.blockedCancellation,
          ...(result.ok && result.value.projectId === projectId ? { resolution: result.value }
            : { targetError: result.ok ? 'Project changed. Refresh targets.' : result.error.message }) }
        this.notify()
      } finally {
        if (this.targetOperation === operation) this.targetOperation = undefined
      }
    } catch {
      if (generation === this.targetGeneration) {
        this.snapshot = { ...this.snapshot, resolving: false, cancellationFailed: !!this.blockedCancellation,
          targetError: this.blockedCancellation ? 'Target cleanup failed. Retry cancellation before refreshing.' : 'Could not resolve Console projects. Refresh to retry.' }
        this.notify()
      }
    }
  }
  async cancelTargets(): Promise<void> {
    if (this.cancellation) return this.cancellation
    const operation = this.targetOperation
    const projectId = this.blockedCancellation ?? operation?.projectId
    if (!projectId) {
      if (this.snapshot.resolving) {
        this.targetGeneration++
        this.snapshot = { ...this.snapshot, resolving: false, targetError: 'Target discovery cancelled. Refresh to try again.' }; this.notify()
      }
      return
    }
    // Invalidate the invoke result before cancellation; replacement waits for cleanup AND the old invoke.
    const generation = ++this.targetGeneration, activation = this.activation
    this.snapshot = { ...this.snapshot, resolution: undefined, resolving: true }; this.notify()
    this.cancellation = (async () => {
      try {
        const result = await this.api.cancelResolution({ projectId })
        // A completed Main project transition already joined old-project cleanup.
        // Its late renderer cancellation may now be denied by project authority.
        if (!result.ok && !(result.error.code === 'PERMISSION_DENIED' && activation !== this.activation)) throw new Error('cleanup')
        const retired = await operation?.done.catch(() => undefined)
        if (!result.ok && retired && !retired.ok && retired.error.details?.reason === 'CLEANUP_FAILED') throw new Error('cleanup')
        this.blockedCancellation = undefined
      } catch { this.blockedCancellation = projectId }
      finally {
        this.cancellation = undefined
        if (generation === this.targetGeneration) {
          this.snapshot = { ...this.snapshot, resolving: false, cancellationFailed: !!this.blockedCancellation,
            targetError: this.blockedCancellation ? 'Target cleanup failed. Retry cancellation before refreshing.' : 'Target discovery cancelled. Refresh to try again.' }
          this.notify()
        }
      }
    })()
    return this.cancellation
  }

  activateProject(projectId: ProjectId | null, force = false): void {
    if (!force && projectId === this.snapshot.projectId && projectId !== null) return
    void this.cancelTargets()
    this.activation++; this.targetGeneration++
    this.generation++
    this.clearBuffered()
    this.requests.clear(); this.cancelStarts.clear()
    this.dropConsoleInput()
    this.snapshot = { projectId, available: projectId !== null, views: new Map(), selected: null }
    this.notify()
  }
  setAvailable(available: boolean): void {
    if (available === this.snapshot.available) return
    void this.cancelTargets()
    this.activation++; this.targetGeneration++
    // Main mutes unavailable project sessions. Clear the active view without inventing exit states.
    this.generation++
    this.clearBuffered(); this.requests.clear(); this.cancelStarts.clear()
    this.dropConsoleInput()
    this.snapshot = { ...this.snapshot, available, views: new Map(), selected: null, resolution: undefined, resolving: false, consoleInput: undefined }
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
  private receiveProject(event: ProjectRunEvent): void { this.receive(event, true) }
  private receive(event: RunEvent | ProjectRunEvent, project = false): void {
    if (!this.snapshot.available || event.session.projectId !== this.snapshot.projectId) return
    const key = (project ? 'csharp:' : '') + identity(event.session.relativePath)
    let view = this.snapshot.views.get(key)
    const request = this.requests.get(key)
    if (view?.session?.sessionId !== event.session.sessionId) {
      // Only a new STARTING event during our semantic start may select a replacement.
      if (!request || request.candidate || this.seen.has(event.session.sessionId)
        || event.type !== 'state' || event.session.state !== 'STARTING') return
      request.candidate = event.session.sessionId
      this.seen.add(event.session.sessionId)
      this.buffered.delete(key)
      this.dropConsoleInput()
      view = { relativePath: event.session.relativePath, chunks: [], pending: 'start' }
    }
    if (!view || (terminal(view.session) && event.type !== 'exit' && event.type !== 'error')) return
    if (event.type === 'stdout' || event.type === 'stderr') {
      const chunks = this.buffered.get(key) ?? []
      chunks.push({ stream: event.type, data: event.data })
      this.buffered.set(key, chunks)
      this.frame ??= this.requestFrame(this.flush)
      return
    }
    const chunks = this.buffered.get(key) ?? []
    this.buffered.delete(key)
    const phase = project ? (event.session as CSharpRunSession).phase : undefined
    const marker: OutputChunk[] = phase && phase !== view.phase ? [{ stream: 'phase', data: phaseLabel(phase) + '\n' }] : []
    this.update(key, { ...view, chunks: [...view.chunks, ...chunks, ...marker], session: event.session, phase,
      ...(event.type === 'exit' ? { exitCode: event.exitCode } : {}),
      ...(event.type === 'error' ? 'failure' in event ? { failure: event.failure, error: projectFailureMessage(event.failure) }
        : { error: safeRunMessage(event.error) } : {}) })
    if (project && event.type === 'error' && 'failure' in event &&
      ['STALE_TARGET', 'INVALID_TARGET', 'SELECTION_REQUIRED', 'NO_RUNNABLE_PROJECT'].includes(event.failure.reason)) {
      this.snapshot = { ...this.snapshot, resolution: undefined, targetError: projectFailureMessage(event.failure) }; this.notify()
    }
    if (project && this.cancelStarts.delete(key) && !terminal(event.session)) void this.stopProject()
    if (project && (phase === 'EXECUTING' || terminal(event.session))) void this.syncInput(event.session.sessionId)
  }

  async startProject(source: { dirty: boolean; conflict: boolean }, locked = false): Promise<void> {
    const resolution = this.snapshot.resolution
    if (locked || !this.snapshot.available || this.snapshot.resolving || this.blockedCancellation
      || resolution?.state !== 'READY' || this.projectBusy()) return
    const target = resolution.target, key = 'csharp:' + identity(target.relativePath)
    this.snapshot = { ...this.snapshot, mode: 'csharp', selected: key, views: new Map([...this.snapshot.views].filter(([key]) => !key.startsWith('csharp:'))) }
    if (source.dirty || source.conflict) {
      this.update(key, { relativePath: target.relativePath, chunks: [], error: source.conflict
        ? 'Resolve project source conflicts before running.' : 'Save changed files before running.' }); return
    }
    const generation = this.generation, request: { candidate?: RunSessionId } = {}
    this.requests.set(key, request)
    this.dropConsoleInput()
    this.update(key, { relativePath: target.relativePath, chunks: [], pending: 'start' })
    try {
      const result = await this.api.startProject({ ...target, dirty: source.dirty })
      if (generation !== this.generation) return
      const current = this.snapshot.views.get(key)!
      if (!result.ok) {
        this.update(key, { ...current, pending: undefined, error: result.error.message })
        // Any rejected preflight requires fresh Main resolution; never reuse stale READY.
        this.snapshot = { ...this.snapshot, resolution: undefined, targetError: result.error.message }; this.notify()
      } else if (!request.candidate || current.session?.sessionId === result.value.sessionId) {
        this.seen.add(result.value.sessionId)
        this.update(key, { ...current, session: current.session ?? result.value,
          chunks: current.phase ? current.chunks : [...current.chunks, { stream: 'phase', data: phaseLabel(result.value.phase) + '\n' }],
          phase: current.phase ?? result.value.phase, pending: current.pending === 'stop' ? 'stop' : undefined })
        if (this.cancelStarts.delete(key)) await this.stopProject()
      }
    } catch {
      if (generation === this.generation) this.update(key, { ...this.snapshot.views.get(key)!, pending: undefined,
        error: 'The C# Run request could not be completed.' })
    } finally {
      if (this.requests.get(key) === request) { this.requests.delete(key); this.cancelStarts.delete(key) }
    }
  }
  async stopProject(): Promise<void> {
    const view = this.getProjectView()
    if (!view) return
    const key = 'csharp:' + identity(view.relativePath)
    if (!view.session && view.pending === 'start') { this.cancelStarts.add(key); return }
    await this.stopKey(key)
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
    await this.stopKey(identity(path))
  }
  private async stopKey(key: string): Promise<void> {
    const view = this.snapshot.views.get(key)
    if (!view?.session || view.pending === 'stop' || terminal(view.session)) return
    const generation = this.generation, sessionId = view.session.sessionId
    this.snapshot = { ...this.snapshot, selected: key }
    this.update(key, { ...view, pending: 'stop',
      error: view.failure && view.failure.reason !== 'CLEANUP_FAILED' ? view.error : undefined,
      failure: view.failure?.reason === 'CLEANUP_FAILED' ? undefined : view.failure })
    try {
      const result = await this.api.stop(sessionId)
      if (generation !== this.generation) return
      const current = this.snapshot.views.get(key)
      if (current?.session?.sessionId !== sessionId) return
      this.update(key, { ...current, pending: undefined, ...(!result.ok ? { error: safeRunMessage(result.error) } : {}) })
    } catch {
      if (generation === this.generation) this.update(key, { ...this.snapshot.views.get(key)!, pending: undefined,
        error: 'The Stop request could not be completed. Retry Stop.' })
    }
  }

  setInputDraft(text: string): void {
    const input = this.snapshot.consoleInput
    if (!input || input.busy || input.status.gate !== 'OPEN') return
    this.drafts.set(input.sessionId, text)
    this.snapshot = { ...this.snapshot, consoleInput: { ...input, draft: text, notice: undefined } }
    this.notify()
  }

  async submitInput(): Promise<void> {
    const input = this.snapshot.consoleInput
    const projectId = this.snapshot.projectId
    if (!input || !projectId || input.busy || input.status.gate !== 'OPEN') return
    if (!prepareRunInputText(input.draft).ok) {
      this.snapshot = { ...this.snapshot, consoleInput: { ...input, notice: 'That line cannot be sent.' } }
      this.notify()
      return
    }
    const sessionId = input.sessionId, sequence = input.status.nextSequence, text = input.draft, generation = this.generation
    this.snapshot = { ...this.snapshot, consoleInput: { ...input, busy: true, notice: undefined } }
    this.notify()
    let result: AppResult<RunInputAcknowledgement> | undefined
    try { result = await this.api.sendInput({ projectId, sessionId, sequence, text }) }
    catch { result = undefined }
    await this.finishInput(sessionId, generation, current => {
      const next = this.afterAcknowledgement(current, result, sequence, true, 'Input could not be sent.')
      if (result?.ok && result.value.state === 'DELIVERED' && result.value.sessionId === sessionId && result.value.sequence === sequence) {
        this.appendInputEcho(sessionId, text)
      }
      return next
    })
  }

  /** Keep a delivered line on the prompt that was showing. The pipe does not echo keystrokes. */
  private appendInputEcho(sessionId: RunSessionId, text: string): void {
    const key = this.inputKey(sessionId)
    const view = key ? this.snapshot.views.get(key) : undefined
    if (!key || !view) return
    const pending = this.buffered.get(key) ?? []
    this.buffered.delete(key)
    const chunks = [...view.chunks, ...pending]
    const last = chunks.at(-1)
    // WriteLine stores the prompt plus a trailing break. Fold the typed text in front of that break
    // so "Nhập tên:" and the name stay on one line. A prompt from Console.Write has no break to fold.
    if (last && (last.stream === 'stdout' || last.stream === 'stderr')) {
      const breakLength = trailingLineBreakLength(last.data)
      if (breakLength > 0) {
        const data = last.data.slice(0, -breakLength)
        if (data.length === 0) chunks.pop()
        else chunks[chunks.length - 1] = { ...last, data }
      }
    }
    chunks.push({ stream: 'input', data: `${text}\n` })
    this.update(key, { ...view, chunks })
  }

  async submitEof(): Promise<void> {
    const input = this.snapshot.consoleInput
    const projectId = this.snapshot.projectId
    if (!input || !projectId || input.busy || input.status.gate !== 'OPEN') return
    const sessionId = input.sessionId, sequence = input.status.nextSequence, generation = this.generation
    this.snapshot = { ...this.snapshot, consoleInput: { ...input, busy: true, notice: undefined } }
    this.notify()
    let result: AppResult<RunInputAcknowledgement> | undefined
    try { result = await this.api.closeInput({ projectId, sessionId, sequence }) }
    catch { result = undefined }
    await this.finishInput(sessionId, generation, current => this.afterAcknowledgement(current, result, sequence, false, 'Input could not be closed.'))
  }

  private afterAcknowledgement(current: ConsoleInputState, result: AppResult<RunInputAcknowledgement> | undefined,
    sequence: number, clearDraft: boolean, failure: string): ConsoleInputState {
    if (!result?.ok || result.value.sessionId !== current.sessionId || result.value.sequence !== sequence) {
      return { ...current, notice: failure }
    }
    if (result.value.state === 'REJECTED') return { ...current, notice: inputNotice(result.value.reason) }
    if (!clearDraft) return { ...current, notice: undefined }
    this.drafts.set(current.sessionId, '')
    return { ...current, draft: '', notice: undefined }
  }

  private async finishInput(sessionId: RunSessionId, generation: number,
    apply: (input: ConsoleInputState) => ConsoleInputState): Promise<void> {
    const current = this.snapshot.consoleInput
    if (generation !== this.generation || current?.sessionId !== sessionId) return
    const next = apply(current)
    this.snapshot = { ...this.snapshot, consoleInput: next }
    this.notify()
    await this.syncInput(sessionId)
    const latest = this.snapshot.consoleInput
    if (generation !== this.generation || latest?.sessionId !== sessionId) return
    this.snapshot = { ...this.snapshot, consoleInput: { ...latest, busy: false } }
    this.notify()
  }

  /** Line-input capability is the authority. A no-writer EOF stays hidden. */
  private async syncInput(sessionId: RunSessionId): Promise<boolean> {
    const epoch = ++this.inputEpoch
    const projectId = this.snapshot.projectId
    const generation = this.generation
    if (!projectId) return false
    let result: AppResult<RunInputStatus> | undefined
    try { result = await this.api.inputStatus({ projectId, sessionId }) }
    catch { return false }
    if (epoch !== this.inputEpoch || generation !== this.generation || this.snapshot.projectId !== projectId) return false
    const key = this.inputKey(sessionId)
    if (!key || !result?.ok || result.value.projectId !== projectId || result.value.sessionId !== sessionId) return false
    if (!result.value.capability.acceptsInput) {
      this.drafts.delete(sessionId)
      if (this.snapshot.consoleInput?.sessionId === sessionId) {
        this.snapshot = { ...this.snapshot, consoleInput: undefined }
        this.notify()
      }
      return true
    }
    const previous = this.snapshot.consoleInput?.sessionId === sessionId ? this.snapshot.consoleInput : undefined
    this.snapshot = { ...this.snapshot, consoleInput: {
      key, sessionId, status: result.value, draft: this.drafts.get(sessionId) ?? '',
      busy: previous?.busy ?? false, ...(previous?.notice ? { notice: previous.notice } : {}),
    } }
    this.notify()
    return true
  }

  private inputKey(sessionId: RunSessionId): string | undefined {
    const view = this.getProjectView()
    return view?.session?.sessionId === sessionId ? 'csharp:' + identity(view.relativePath) : undefined
  }

  private dropConsoleInput(): void {
    this.inputEpoch++
    this.drafts.clear()
    if (!this.snapshot.consoleInput) return
    this.snapshot = { ...this.snapshot, consoleInput: undefined }
    this.notify()
  }
}

/** Length of one trailing CR, LF, or CRLF. Zero when the text stays on the same line. */
export function trailingLineBreakLength(data: string): number {
  if (data.endsWith('\r\n')) return 2
  if (data.endsWith('\n') || data.endsWith('\r')) return 1
  return 0
}

export function phaseLabel(phase: RunExecutionPhase): string {
  return { PREPARING: 'Preparing', BUILD_RESTORE: 'Build / restore', EXECUTING: 'Execution' }[phase]
}
export function projectFailureMessage(failure: ProjectRunFailure): string {
  if (failure.reason === 'BUILD_OR_RESTORE_FAILED') return `Build or restore failed (exit ${failure.exitCode})`
  if (failure.reason === 'EXECUTION_FAILED') return `Execution failed (exit ${failure.exitCode ?? 'unknown'})`
  const messages: Partial<Record<ProjectRunFailure['reason'], string>> = {
    SOURCE_DIRTY: 'Save changed files before running.', SOURCE_CONFLICT: 'Resolve project source conflicts before running.',
    SOURCE_CHANGED: 'Source changed during Run. Save and run again.', SOURCE_STATE_UNKNOWN: 'Source state is unknown. Reopen the project and try again.',
    SOURCE_GUARD_TIMEOUT: 'Source check timed out. Run again.', SOURCE_GUARD_UNAVAILABLE: 'Source check unavailable. Reopen the project.',
    CLEANUP_FAILED: 'Run cleanup failed. Retry Stop.', DEPENDENCY_MISSING: '.NET host or SDK is missing. Install a supported SDK and restart the IDE.',
    STALE_TARGET: 'Run target is no longer eligible. Refresh and choose a target again.',
  }
  return messages[failure.reason] ?? `C# Run failed: ${failure.reason.toLowerCase().replaceAll('_', ' ')}.`
}

function inputNotice(reason: RunInputRejectionReason): string {
  if (reason === 'INPUT_BUSY') return 'Input is busy. Send the line again.'
  if (reason === 'INVALID_INPUT') return 'That line cannot be sent.'
  if (reason === 'INPUT_CLOSED') return 'Input is closed.'
  if (reason === 'WRITE_FAILED') return 'Input could not be written.'
  if (reason === 'WRITE_TIMEOUT') return 'Input timed out.'
  if (reason === 'SEQUENCE_MISMATCH') return 'Input is out of date. Send the line again.'
  return 'Input is unavailable.'
}

function safeRunMessage(error: AppError): string {
  if (error.code === 'DEPENDENCY_MISSING') return 'Node.js was not found on PATH. Install Node.js and restart the IDE.'
  // Main already serializes domain errors. Native exceptions never reach this view.
  return error.message
}
