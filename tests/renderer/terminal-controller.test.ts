/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

import {
  TerminalController,
  type DisposableLike,
  type ResizeObserverLike,
  type TerminalFitAddonLike,
  type TerminalViewFactory,
  type TerminalViewLike,
} from '../../src/renderer/src/features/terminal/terminal-controller'
import type {
  AppResult,
  CloseTerminalResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  ProjectId,
  TerminalContractApi,
  TerminalEvent,
  TerminalSessionId,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const otherProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId

class FakeTerminal implements TerminalViewLike {
  cols = 80
  rows = 24
  disposed = 0
  focused = 0
  openedWith: HTMLElement | null = null
  readonly writes: string[] = []
  private readonly inputListeners = new Set<(data: string) => void>()
  private readonly writeCallbacks: Array<() => void> = []

  constructor(private readonly completeWritesImmediately = true) {}

  loadAddon(addon: TerminalFitAddonLike): void { void addon }
  open(parent: HTMLElement): void { this.openedWith = parent }
  focus(): void { this.focused += 1 }
  write(data: string, callback?: () => void): void {
    this.writes.push(data)
    if (!callback) return
    if (this.completeWritesImmediately) callback()
    else this.writeCallbacks.push(callback)
  }
  onData(listener: (data: string) => void): DisposableLike {
    this.inputListeners.add(listener)
    return { dispose: () => this.inputListeners.delete(listener) }
  }
  dispose(): void {
    this.disposed += 1
    this.inputListeners.clear()
  }
  emitInput(data: string): void {
    for (const listener of this.inputListeners) listener(data)
  }
  completeWrite(): void { this.writeCallbacks.shift()?.() }
}

class FakeFitAddon implements TerminalFitAddonLike {
  fitCalls = 0
  disposed = 0

  constructor(
    private readonly terminal: FakeTerminal,
    private readonly nextDimensions?: { cols: number; rows: number },
  ) {}

  fit(): void {
    this.fitCalls += 1
    if (this.nextDimensions) {
      this.terminal.cols = this.nextDimensions.cols
      this.terminal.rows = this.nextDimensions.rows
    }
  }
  dispose(): void { this.disposed += 1 }
}

class FakeObserver implements ResizeObserverLike {
  observed: Element | null = null
  disconnected = 0

  constructor(private readonly listener: () => void) {}
  observe(target: Element): void { this.observed = target }
  disconnect(): void { this.disconnected += 1 }
  trigger(): void { this.listener() }
}

function createHarness(options: {
  completeWritesImmediately?: boolean
  fitDimensions?: { cols: number; rows: number }
  maximumQueuedWriteBytes?: number
} = {}) {
  let eventListener: ((event: TerminalEvent) => void) | null = null
  let sessionOrdinal = 0
  const createResults: Array<AppResult<CreateTerminalResponse>> = []
  const terminals: FakeTerminal[] = []
  const addons: FakeFitAddon[] = []
  const observers: FakeObserver[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const api: TerminalContractApi = {
    create: vi.fn(async (
      request: CreateTerminalRequest,
    ): Promise<AppResult<CreateTerminalResponse>> => {
      const queued = createResults.shift()
      if (queued) return queued
      sessionOrdinal += 1
      return success({
        sessionId: `terminal_${sessionOrdinal}` as TerminalSessionId,
        projectId: request.projectId,
        state: 'RUNNING',
        cols: request.cols,
        rows: request.rows,
        shellLabel: 'PowerShell',
      })
    }),
    input: vi.fn(async () => success(null)),
    resize: vi.fn(async () => success(null)),
    close: vi.fn(async (): Promise<AppResult<CloseTerminalResponse>> => success({
      status: 'closed',
    })),
    onEvent: vi.fn((listener) => {
      eventListener = listener
      return vi.fn(() => { eventListener = null })
    }),
  }
  const viewFactory: TerminalViewFactory = {
    create: () => {
      const terminal = new FakeTerminal(options.completeWritesImmediately ?? true)
      const addon = new FakeFitAddon(terminal, options.fitDimensions)
      terminals.push(terminal)
      addons.push(addon)
      return { terminal, fitAddon: addon }
    },
  }
  const controller = new TerminalController({
    getApi: () => api,
    viewFactory,
    createResizeObserver: (listener) => {
      const observer = new FakeObserver(listener)
      observers.push(observer)
      return observer
    },
    requestFrame: (callback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    },
    cancelFrame: (id) => { frames.delete(id) },
    maximumQueuedWriteBytes: options.maximumQueuedWriteBytes,
  })
  const mount = document.createElement('div')
  document.body.append(mount)
  const emit = (event: TerminalEvent): void => { eventListener?.(event) }
  const flushFrames = (): void => {
    const queued = [...frames.values()]
    frames.clear()
    for (const callback of queued) callback(0)
  }
  return {
    controller,
    api,
    mount,
    terminals,
    addons,
    observers,
    createResults,
    emit,
    flushFrames,
  }
}

describe('Phase 2E-F TerminalController', () => {
  it('does not start terminal work while renderer interaction is locked', async () => {
    const harness = createHarness()
    harness.controller.setInteractionLocked(true)

    await expect(harness.controller.createSession(projectId, harness.mount))
      .resolves.toBeNull()
    expect(harness.api.create).not.toHaveBeenCalled()
    expect(harness.terminals).toHaveLength(0)

    harness.controller.setInteractionLocked(false)
    const sessionId = await harness.controller.createSession(projectId, harness.mount)
    expect(sessionId).not.toBeNull()
    harness.controller.setInteractionLocked(true)
    harness.terminals[0]!.emitInput('blocked input')
    await expect(harness.controller.closeSession(sessionId!)).resolves.toBe(false)
    expect(harness.api.input).not.toHaveBeenCalled()
    expect(harness.api.close).not.toHaveBeenCalled()
  })

  it('subscribes before first create and does not duplicate on UI remounts', async () => {
    const harness = createHarness()
    const firstUi = harness.controller.subscribe(vi.fn())
    firstUi()
    const secondUi = harness.controller.subscribe(vi.fn())

    expect(harness.api.onEvent).not.toHaveBeenCalled()
    await harness.controller.createSession(projectId, harness.mount)
    expect(harness.api.onEvent).toHaveBeenCalledOnce()
    expect(vi.mocked(harness.api.onEvent).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(harness.api.create).mock.invocationCallOrder[0]!)

    secondUi()
    harness.controller.subscribe(vi.fn())()
    expect(harness.api.onEvent).toHaveBeenCalledOnce()
    expect(harness.terminals[0]?.disposed).toBe(0)
  })

  it('creates no terminal until requested, binds success, and focuses it', async () => {
    const harness = createHarness()
    expect(harness.controller.getSnapshot().sessions).toEqual([])
    expect(harness.terminals).toEqual([])

    const sessionId = await harness.controller.createSession(projectId, harness.mount)
    harness.observers[0]!.trigger()
    harness.flushFrames()
    expect(sessionId).toBe('terminal_1')
    expect(harness.api.create).toHaveBeenCalledWith({ projectId, cols: 80, rows: 24 })
    expect(harness.controller.getSnapshot().sessions[0]).toMatchObject({
      sessionId: 'terminal_1', label: 'PowerShell 1', state: 'RUNNING',
    })
    expect(harness.terminals[0]?.focused).toBe(1)
  })

  it('cleans a failed placeholder and allows retry', async () => {
    const harness = createHarness()
    harness.createResults.push(failure('Terminal unavailable'))
    await expect(harness.controller.createSession(projectId, harness.mount)).resolves.toBeNull()
    expect(harness.terminals[0]?.disposed).toBe(1)
    expect(harness.observers[0]?.disconnected).toBe(1)
    expect(harness.controller.getSnapshot()).toMatchObject({
      creating: false, createError: 'Terminal unavailable', sessions: [],
    })

    await expect(harness.controller.createSession(projectId, harness.mount))
      .resolves.toBe('terminal_1')
    expect(harness.controller.getSnapshot().sessions).toHaveLength(1)
  })

  it('supports isolated sessions and closes only the selected record', async () => {
    const harness = createHarness()
    const first = await harness.controller.createSession(projectId, harness.mount)
    const second = await harness.controller.createSession(projectId, harness.mount)
    expect(harness.controller.getSnapshot().sessions.map((session) => session.label))
      .toEqual(['PowerShell 1', 'PowerShell 2'])

    await harness.controller.closeSession(first!)
    expect(harness.api.close).toHaveBeenCalledWith({ sessionId: first })
    expect(harness.terminals[0]?.disposed).toBe(1)
    expect(harness.terminals[1]?.disposed).toBe(0)
    expect(harness.controller.getSnapshot().sessions.map((session) => session.sessionId))
      .toEqual([second])
  })

  it('invalidates a pending old-project create and rejects its stale response', async () => {
    const harness = createHarness()
    const response = deferred<AppResult<CreateTerminalResponse>>()
    vi.mocked(harness.api.create).mockImplementationOnce(() => response.promise)
    const creating = harness.controller.createSession(projectId, harness.mount)
    expect(harness.controller.getSnapshot().creating).toBe(true)

    harness.controller.reconcileProject(otherProjectId)
    expect(harness.terminals[0]?.disposed).toBe(1)
    response.resolve(success({
      sessionId: 'terminal_stale' as TerminalSessionId,
      projectId,
      state: 'RUNNING',
      cols: 80,
      rows: 24,
      shellLabel: 'PowerShell',
    }))

    await expect(creating).resolves.toBeNull()
    expect(harness.controller.getSnapshot()).toEqual({
      sessions: [], creating: false, createError: null,
    })
    harness.emit(dataEvent('terminal_stale' as TerminalSessionId, 0, 'ignored'))
    expect(harness.terminals[0]?.writes).toEqual([])
  })

  it('reconciles only old-project sessions and ignores their late output', async () => {
    const harness = createHarness()
    const oldSession = await harness.controller.createSession(projectId, harness.mount)
    const newSession = await harness.controller.createSession(otherProjectId, harness.mount)
    harness.controller.reconcileProject(otherProjectId)

    expect(harness.terminals[0]?.disposed).toBe(1)
    expect(harness.terminals[1]?.disposed).toBe(0)
    expect(harness.controller.getSnapshot().sessions.map((session) => session.sessionId))
      .toEqual([newSession])
    harness.emit(dataEvent(oldSession!, 0, 'late old output'))
    harness.emit({
      ...dataEvent(newSession!, 0, 'new output'),
      projectId: otherProjectId,
    })
    expect(harness.terminals[0]?.writes).toEqual([])
    expect(harness.terminals[1]?.writes).toEqual(['new output'])
  })

  it('handles concurrent close and exit with one removal and one disposal', async () => {
    const harness = createHarness()
    const sessionId = await harness.controller.createSession(projectId, harness.mount)
    const closeResult = deferred<AppResult<CloseTerminalResponse>>()
    vi.mocked(harness.api.close).mockImplementationOnce(() => closeResult.promise)
    const closing = harness.controller.closeSession(sessionId!)
    harness.emit({
      type: 'exit', sessionId: sessionId!, projectId, exitCode: 0, signal: null,
    })
    closeResult.resolve(success({ status: 'closed' }))

    await expect(closing).resolves.toBe(true)
    expect(harness.terminals[0]?.disposed).toBe(1)
    expect(harness.observers[0]?.disconnected).toBe(1)
    expect(harness.controller.getSnapshot().sessions).toEqual([])
  })

  it('forwards exact input including Ctrl+C and Unicode only while running', async () => {
    const harness = createHarness()
    const sessionId = await harness.controller.createSession(projectId, harness.mount)
    harness.terminals[0]!.emitInput('\x03')
    harness.terminals[0]!.emitInput('Tiếng Việt')
    expect(harness.api.input).toHaveBeenNthCalledWith(1, { sessionId, data: '\x03' })
    expect(harness.api.input).toHaveBeenNthCalledWith(2, { sessionId, data: 'Tiếng Việt' })

    harness.emit({
      type: 'exit', sessionId: sessionId!, projectId, exitCode: 0, signal: null,
    })
    harness.terminals[0]!.emitInput('ignored')
    expect(harness.api.input).toHaveBeenCalledTimes(2)
  })

  it('serializes ordered writes and rejects duplicate, old, stale, and cross-session events', async () => {
    const harness = createHarness({ completeWritesImmediately: false })
    const first = await harness.controller.createSession(projectId, harness.mount)
    const second = await harness.controller.createSession(projectId, harness.mount)
    harness.emit(dataEvent(first!, 0, 'a'))
    harness.emit(dataEvent(first!, 2, 'c'))
    harness.emit(dataEvent(first!, 1, 'old'))
    harness.emit(dataEvent(second!, 0, 'b'))
    harness.emit(dataEvent('terminal_unknown' as TerminalSessionId, 0, 'stale'))

    expect(harness.terminals[0]?.writes).toEqual(['a'])
    expect(harness.terminals[1]?.writes).toEqual(['b'])
    harness.terminals[0]!.completeWrite()
    expect(harness.terminals[0]?.writes).toEqual(['a', 'c'])
    harness.terminals[0]!.completeWrite()
    expect(harness.terminals[0]?.writes).not.toContain('old')
  })

  it('retains exited scrollback and exposes only the matching safe error state', async () => {
    const harness = createHarness()
    const first = await harness.controller.createSession(projectId, harness.mount)
    const second = await harness.controller.createSession(projectId, harness.mount)
    harness.emit(dataEvent(first!, 0, 'kept output'))
    harness.emit({ type: 'exit', sessionId: first!, projectId, exitCode: 7, signal: null })
    harness.emit(dataEvent(first!, 1, 'late output'))
    harness.emit({
      type: 'error',
      sessionId: second!,
      projectId,
      error: {
        code: 'PROCESS_FAILED',
        message: 'Terminal process stopped.',
        operation: 'terminal:event',
        retryable: false,
      },
    })
    expect(harness.terminals[0]?.writes).toEqual(['kept output'])
    expect(harness.terminals[0]?.disposed).toBe(0)
    expect(harness.controller.getSnapshot().sessions).toEqual([
      expect.objectContaining({ sessionId: first, state: 'EXITED', exitCode: 7 }),
      expect.objectContaining({
        sessionId: second, state: 'FAILED', error: 'Terminal process stopped.',
      }),
    ])
  })

  it('fits only visible measurable running sessions and deduplicates resize', async () => {
    const harness = createHarness({ fitDimensions: { cols: 100, rows: 30 } })
    const sessionId = await harness.controller.createSession(projectId, harness.mount)
    const host = harness.controller.getHost(sessionId!)!
    Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 220 },
    })
    harness.observers[0]!.trigger()
    harness.flushFrames()
    expect(harness.api.resize).toHaveBeenCalledWith({ sessionId, cols: 100, rows: 30 })

    harness.observers[0]!.trigger()
    harness.flushFrames()
    expect(harness.api.resize).toHaveBeenCalledTimes(1)
    harness.controller.setSessionVisible(sessionId!, false)
    harness.observers[0]!.trigger()
    harness.flushFrames()
    expect(harness.addons[0]?.fitCalls).toBe(2)

    harness.controller.setSessionVisible(sessionId!, true)
    harness.emit({ type: 'exit', sessionId: sessionId!, projectId, exitCode: 0, signal: null })
    harness.observers[0]!.trigger()
    harness.flushFrames()
    expect(harness.api.resize).toHaveBeenCalledTimes(1)
  })

  it('disposes subscription, observers, and terminals exactly once on renderer shutdown', async () => {
    const harness = createHarness()
    await harness.controller.createSession(projectId, harness.mount)
    const unsubscribe = vi.mocked(harness.api.onEvent).mock.results[0]!.value
    harness.controller.shutdown()
    harness.controller.shutdown()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(harness.observers[0]?.disconnected).toBe(1)
    expect(harness.terminals[0]?.disposed).toBe(1)
  })
})

function dataEvent(
  sessionId: TerminalSessionId,
  sequence: number,
  data: string,
): TerminalEvent {
  return { type: 'data', sessionId, projectId, sequence: sequence as never, data }
}

function success<T>(value: T): AppResult<T> {
  return { ok: true, value }
}

function failure<T>(message: string): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'PROCESS_FAILED',
      message,
      operation: 'terminal:test',
      retryable: false,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}
