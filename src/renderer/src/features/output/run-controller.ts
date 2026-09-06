import type { AppError, ProjectId, RunApi, RunEvent, RunSession, RunSessionId } from '../../../../shared/contracts'
import type { EditorDocument } from '../editor/models/editor-model-manager'

export interface OutputChunk { readonly stream: 'stdout' | 'stderr'; readonly data: string }
export interface RunView {
  readonly relativePath: string
  readonly session?: RunSession
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
  private unsubscribe?: () => void

  constructor(private readonly api: RunApi,
    private readonly requestFrame: (callback: () => void) => number,
    private readonly cancelFrame: (frame: number) => void) {}

  connect(): () => void {
    this.unsubscribe ??= this.api.onEvent((event) => this.receive(event))
    return () => this.disconnect()
  }
  private disconnect(): void {
    this.unsubscribe?.(); this.unsubscribe = undefined
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
    this.generation++
    this.clearBuffered()
    this.requests.clear(); this.seen.clear()
    this.snapshot = { projectId, available: projectId !== null, views: new Map(), selected: null }
    this.notify()
  }
  setAvailable(available: boolean): void {
    if (available === this.snapshot.available) return
    // Main mutes unavailable project sessions. Clear the active view without inventing exit states.
    this.generation++
    this.clearBuffered(); this.requests.clear(); this.seen.clear()
    this.snapshot = { ...this.snapshot, available, views: new Map(), selected: null }
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
