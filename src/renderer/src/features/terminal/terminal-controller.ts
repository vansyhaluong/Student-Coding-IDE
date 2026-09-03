import type {
  AppError,
  ProjectId,
  TerminalContractApi,
  TerminalEvent,
  TerminalSessionId,
} from '../../../../shared/contracts'

export interface DisposableLike {
  dispose(): void
}

export interface TerminalViewLike {
  readonly cols: number
  readonly rows: number
  loadAddon(addon: TerminalFitAddonLike): void
  open(parent: HTMLElement): void
  focus(): void
  write(data: string, callback?: () => void): void
  onData(listener: (data: string) => void): DisposableLike
  dispose(): void
}

export interface TerminalFitAddonLike extends DisposableLike {
  fit(): void
}

export interface TerminalViewPair {
  terminal: TerminalViewLike
  fitAddon: TerminalFitAddonLike
}

export interface TerminalViewFactory {
  create(): TerminalViewPair
}

export interface ResizeObserverLike {
  observe(target: Element): void
  disconnect(): void
}

export type TerminalRendererState = 'RUNNING' | 'CLOSING' | 'EXITED' | 'FAILED'

export interface TerminalSessionView {
  sessionId: TerminalSessionId
  projectId: ProjectId
  label: string
  state: TerminalRendererState
  exitCode: number | null
  error: string | null
}

export interface TerminalControllerSnapshot {
  sessions: readonly TerminalSessionView[]
  creating: boolean
  createError: string | null
}

interface TerminalSessionRecord extends TerminalSessionView {
  terminal: TerminalViewLike
  fitAddon: TerminalFitAddonLike
  host: HTMLDivElement
  inputSubscription: DisposableLike
  resizeObserver: ResizeObserverLike
  visible: boolean
  disposed: boolean
  latestSequence: number
  lastSentCols: number
  lastSentRows: number
  resizeFrame: number | null
  writing: boolean
  writeQueue: string[]
  queuedWriteBytes: number
}

interface PendingTerminalRecord {
  projectId: ProjectId
  terminal: TerminalViewLike
  fitAddon: TerminalFitAddonLike
  host: HTMLDivElement
  inputSubscription: DisposableLike
  resizeObserver: ResizeObserverLike
  sessionId: TerminalSessionId | null
  disposed: boolean
}

export interface TerminalControllerOptions {
  getApi(): TerminalContractApi
  viewFactory: TerminalViewFactory
  createResizeObserver(listener: () => void): ResizeObserverLike
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(frame: number): void
  maximumQueuedWriteBytes?: number
}

const DEFAULT_MAXIMUM_QUEUED_WRITE_BYTES = 1024 * 1024

export class TerminalController {
  private readonly records = new Map<TerminalSessionId, TerminalSessionRecord>()
  private readonly listeners = new Set<() => void>()
  private readonly shellOrdinals = new Map<string, number>()
  private readonly maximumQueuedWriteBytes: number
  private unsubscribeEvents: (() => void) | null = null
  private pending: PendingTerminalRecord | null = null
  private snapshot: TerminalControllerSnapshot = {
    sessions: [],
    creating: false,
    createError: null,
  }
  private shutdownComplete = false

  constructor(private readonly options: TerminalControllerOptions) {
    this.maximumQueuedWriteBytes = options.maximumQueuedWriteBytes
      ?? DEFAULT_MAXIMUM_QUEUED_WRITE_BYTES
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): TerminalControllerSnapshot {
    return this.snapshot
  }

  getHost(sessionId: TerminalSessionId): HTMLElement | null {
    return this.records.get(sessionId)?.host ?? null
  }

  async createSession(projectId: ProjectId, mount: HTMLElement): Promise<TerminalSessionId | null> {
    if (this.shutdownComplete || this.pending) return null
    this.ensureEventSubscription()
    this.updateSnapshot(true, null)

    const { terminal, fitAddon } = this.options.viewFactory.create()
    const host = document.createElement('div')
    host.className = 'terminal-xterm-host'
    host.setAttribute('aria-label', 'Terminal input')
    mount.replaceChildren(host)
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    const pending: PendingTerminalRecord = {
      projectId,
      terminal,
      fitAddon,
      host,
      sessionId: null,
      disposed: false,
      inputSubscription: terminal.onData((data) => {
        const sessionId = pending.sessionId
        if (sessionId) this.forwardInput(sessionId, data)
      }),
      resizeObserver: this.options.createResizeObserver(() => {
        const sessionId = pending.sessionId
        if (sessionId) this.scheduleFit(sessionId)
      }),
    }
    this.pending = pending
    pending.resizeObserver.observe(host)
    this.fitPending(pending)

    const result = await this.options.getApi().create({
      projectId,
      cols: terminal.cols,
      rows: terminal.rows,
    })
    if (pending.disposed || this.pending !== pending) return null
    if (!result.ok) {
      this.disposePending(pending)
      if (this.pending === pending) this.pending = null
      this.updateSnapshot(false, result.error.message)
      return null
    }

    pending.sessionId = result.value.sessionId
    const labelOrdinal = (this.shellOrdinals.get(result.value.shellLabel) ?? 0) + 1
    this.shellOrdinals.set(result.value.shellLabel, labelOrdinal)
    const record: TerminalSessionRecord = {
      sessionId: result.value.sessionId,
      projectId: result.value.projectId,
      label: `${result.value.shellLabel} ${labelOrdinal}`,
      state: 'RUNNING',
      exitCode: null,
      error: null,
      terminal,
      fitAddon,
      host,
      inputSubscription: pending.inputSubscription,
      resizeObserver: pending.resizeObserver,
      visible: true,
      disposed: false,
      latestSequence: -1,
      lastSentCols: result.value.cols,
      lastSentRows: result.value.rows,
      resizeFrame: null,
      writing: false,
      writeQueue: [],
      queuedWriteBytes: 0,
    }
    this.records.set(record.sessionId, record)
    this.pending = null
    this.updateSnapshot(false, null)
    this.scheduleFit(record.sessionId)
    this.options.requestFrame(() => {
      if (!record.disposed && record.visible) record.terminal.focus()
    })
    return record.sessionId
  }

  setSessionVisible(sessionId: TerminalSessionId, visible: boolean): void {
    const record = this.records.get(sessionId)
    if (!record || record.disposed) return
    record.visible = visible
    if (visible) this.scheduleFit(sessionId)
  }

  reconcileProject(projectId: ProjectId | null): void {
    let changed = false
    if (this.pending && this.pending.projectId !== projectId) {
      this.disposePending(this.pending)
      this.pending = null
      changed = true
    }
    for (const [sessionId, record] of this.records) {
      if (record.projectId === projectId) continue
      this.disposeRecord(record)
      this.records.delete(sessionId)
      changed = true
    }
    if (changed) this.updateSnapshot(false, null)
  }

  focus(sessionId: TerminalSessionId): void {
    const record = this.records.get(sessionId)
    if (!record || record.disposed || !record.visible) return
    this.options.requestFrame(() => {
      if (!record.disposed && record.visible) record.terminal.focus()
    })
  }

  async closeSession(sessionId: TerminalSessionId): Promise<boolean> {
    const record = this.records.get(sessionId)
    if (!record || record.disposed || record.state === 'CLOSING') return false
    record.state = 'CLOSING'
    this.updateSnapshot()
    const result = await this.options.getApi().close({ sessionId })
    if (!result.ok) {
      record.state = 'FAILED'
      record.error = result.error.message
      this.updateSnapshot()
      return false
    }
    this.disposeRecord(record)
    this.records.delete(sessionId)
    this.updateSnapshot()
    return true
  }

  fitSession(sessionId: TerminalSessionId): void {
    const record = this.records.get(sessionId)
    if (!this.canFit(record)) return
    try {
      record.fitAddon.fit()
    } catch {
      return
    }
    const cols = record.terminal.cols
    const rows = record.terminal.rows
    if (
      cols === record.lastSentCols
      && rows === record.lastSentRows
    ) return
    record.lastSentCols = cols
    record.lastSentRows = rows
    void this.options.getApi().resize({ sessionId, cols, rows }).then((result) => {
      if (!result.ok && !record.disposed && record.state === 'RUNNING') {
        record.error = result.error.message
        this.updateSnapshot()
      }
    })
  }

  shutdown(): void {
    if (this.shutdownComplete) return
    this.shutdownComplete = true
    this.unsubscribeEvents?.()
    this.unsubscribeEvents = null
    if (this.pending) this.disposePending(this.pending)
    this.pending = null
    for (const record of this.records.values()) this.disposeRecord(record)
    this.records.clear()
    this.updateSnapshot(false, null)
  }

  private ensureEventSubscription(): void {
    if (this.unsubscribeEvents || this.shutdownComplete) return
    this.unsubscribeEvents = this.options.getApi().onEvent((event) => {
      this.handleEvent(event)
    })
  }

  private handleEvent(event: TerminalEvent): void {
    const record = this.records.get(event.sessionId)
    if (!record || record.disposed || record.projectId !== event.projectId) return
    if (event.type === 'data') {
      if (record.state !== 'RUNNING') return
      if (event.sequence <= record.latestSequence) return
      record.latestSequence = event.sequence
      this.enqueueWrite(record, event.data)
      return
    }
    if (event.type === 'exit') {
      record.state = 'EXITED'
      record.exitCode = event.exitCode
      this.cancelResize(record)
      this.updateSnapshot()
      return
    }
    record.state = 'FAILED'
    record.error = safeTerminalError(event.error)
    this.cancelResize(record)
    this.updateSnapshot()
  }

  private forwardInput(sessionId: TerminalSessionId, data: string): void {
    const record = this.records.get(sessionId)
    if (!record || record.disposed || record.state !== 'RUNNING') return
    void this.options.getApi().input({ sessionId, data }).then((result) => {
      if (!result.ok && !record.disposed && record.state === 'RUNNING') {
        record.error = result.error.message
        this.updateSnapshot()
      }
    })
  }

  private enqueueWrite(record: TerminalSessionRecord, data: string): void {
    const bytes = new TextEncoder().encode(data).byteLength
    if (record.queuedWriteBytes + bytes > this.maximumQueuedWriteBytes) {
      record.state = 'FAILED'
      record.error = 'Terminal output exceeded the renderer queue limit.'
      this.cancelResize(record)
      this.updateSnapshot()
      return
    }
    record.writeQueue.push(data)
    record.queuedWriteBytes += bytes
    this.drainWrites(record)
  }

  private drainWrites(record: TerminalSessionRecord): void {
    if (record.writing || record.disposed) return
    const data = record.writeQueue.shift()
    if (data === undefined) return
    record.writing = true
    record.terminal.write(data, () => {
      record.queuedWriteBytes -= new TextEncoder().encode(data).byteLength
      record.writing = false
      this.drainWrites(record)
    })
  }

  private scheduleFit(sessionId: TerminalSessionId): void {
    const record = this.records.get(sessionId)
    if (!record || record.resizeFrame !== null || !this.canFit(record)) return
    record.resizeFrame = this.options.requestFrame(() => {
      record.resizeFrame = null
      this.fitSession(sessionId)
    })
  }

  private fitPending(pending: PendingTerminalRecord): void {
    if (!isMeasurable(pending.host)) return
    try {
      pending.fitAddon.fit()
    } catch {
      // The default xterm dimensions remain valid for terminal creation.
    }
  }

  private canFit(
    record: TerminalSessionRecord | undefined,
  ): record is TerminalSessionRecord {
    return Boolean(
      record
      && !record.disposed
      && record.visible
      && record.state === 'RUNNING'
      && isMeasurable(record.host),
    )
  }

  private cancelResize(record: TerminalSessionRecord): void {
    if (record.resizeFrame === null) return
    this.options.cancelFrame(record.resizeFrame)
    record.resizeFrame = null
  }

  private disposePending(pending: PendingTerminalRecord): void {
    if (pending.disposed) return
    pending.disposed = true
    pending.resizeObserver.disconnect()
    pending.inputSubscription.dispose()
    pending.terminal.dispose()
    pending.host.remove()
  }

  private disposeRecord(record: TerminalSessionRecord): void {
    if (record.disposed) return
    record.disposed = true
    this.cancelResize(record)
    record.resizeObserver.disconnect()
    record.inputSubscription.dispose()
    record.terminal.dispose()
    record.host.remove()
    record.writeQueue.length = 0
    record.queuedWriteBytes = 0
  }

  private updateSnapshot(
    creating = this.snapshot.creating,
    createError = this.snapshot.createError,
  ): void {
    this.snapshot = {
      creating,
      createError,
      sessions: [...this.records.values()].map((record) => ({
        sessionId: record.sessionId,
        projectId: record.projectId,
        label: record.label,
        state: record.state,
        exitCode: record.exitCode,
        error: record.error,
      })),
    }
    for (const listener of this.listeners) listener()
  }
}

function isMeasurable(host: HTMLElement): boolean {
  return host.isConnected && host.clientWidth > 0 && host.clientHeight > 0
}

function safeTerminalError(error: AppError): string {
  return error.message || 'The terminal stopped unexpectedly.'
}
