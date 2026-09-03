import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import {
  UnsavedTransitionService,
  type TerminalProjectLifecycle,
  type TerminalProjectTransitionLease,
} from '../../src/main/services/lifecycle/unsaved-transition-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import {
  LIFECYCLE_CHANNELS,
  type UnsavedTransitionRequestEvent,
} from '../../src/shared/contracts'

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>>()

  handle(channel: string, listener: (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(senderId: number, channel: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: senderId } }, payload)
  }
}

const roots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })))
})

class FakeTerminalLifecycle implements TerminalProjectLifecycle {
  live = false
  readonly closeSessions = vi.fn<() => Promise<void>>(async () => undefined)
  readonly release = vi.fn()
  readonly acquireProjectTransition = vi.fn(async (): Promise<
    TerminalProjectTransitionLease
  > => ({
    hasLiveSessions: this.live,
    closeSessions: () => this.closeSessions(),
    release: () => this.release(),
  }))
}

async function setup(rendererId = 7, terminalLifecycle?: FakeTerminalLifecycle) {
  const root = await mkdtemp(join(tmpdir(), 'student-ide-unsaved-'))
  roots.push(root)
  const projectService = new ProjectService()
  const project = await projectService.openRoot(root)
  const ipcMain = new FakeIpcMain()
  const events: UnsavedTransitionRequestEvent[] = []
  const service = new UnsavedTransitionService(
    new IpcHandlerRegistry(ipcMain),
    projectService,
    {
      getRenderer: () => ({
        senderId: rendererId,
        send: (event) => events.push(event),
      }),
      terminalLifecycle,
      timeoutMs: 1_000,
    },
  )
  service.start()
  return { service, projectService, project, ipcMain, events, rendererId }
}

describe('UnsavedTransitionService', () => {
  it('blocks the serialized project transition until the owning renderer approves', async () => {
    const context = await setup()
    const closing = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))
    const request = context.events[0]!
    expect(request.reason).toBe('project-close')
    expect(request.project).toEqual(context.project)
    expect(request.terminalConfirmationRequired).toBe(false)
    expect(context.projectService.getActiveProject()).toEqual(context.project)

    await expect(context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: true },
    )).resolves.toEqual({ ok: true, value: null })
    await expect(closing).resolves.toBeUndefined()
    expect(context.projectService.getActiveProject()).toBeNull()
  })

  it('keeps live terminals and the current project when terminal confirmation is cancelled', async () => {
    const terminal = new FakeTerminalLifecycle()
    terminal.live = true
    const context = await setup(7, terminal)
    const closing = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))
    expect(context.events[0]?.terminalConfirmationRequired).toBe(true)

    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: false },
    )
    await expect(closing).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(terminal.closeSessions).not.toHaveBeenCalled()
    expect(terminal.release).toHaveBeenCalledOnce()
    expect(context.projectService.getActiveProject()).toEqual(context.project)
  })

  it('waits for confirmed terminal cleanup before changing project authority', async () => {
    const terminal = new FakeTerminalLifecycle()
    terminal.live = true
    const cleanup = deferred<void>()
    terminal.closeSessions.mockImplementationOnce(() => cleanup.promise)
    const context = await setup(7, terminal)
    const closing = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))

    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: true },
    )
    await vi.waitFor(() => expect(terminal.closeSessions).toHaveBeenCalledOnce())
    expect(context.projectService.getActiveProject()).toEqual(context.project)
    cleanup.resolve()
    await expect(closing).resolves.toBeUndefined()
    expect(context.projectService.getActiveProject()).toBeNull()
    expect(terminal.release).toHaveBeenCalledOnce()
  })

  it('fails closed with a concise error when terminal cleanup fails', async () => {
    const terminal = new FakeTerminalLifecycle()
    terminal.live = true
    terminal.closeSessions.mockRejectedValueOnce(new AggregateError([
      new Error('native terminal detail'),
    ]))
    const context = await setup(7, terminal)
    const settled = vi.fn()
    context.projectService.subscribeTransitionSettled(settled)
    const closing = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))
    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: true },
    )

    await expect(closing).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
      message: 'Running terminals could not be closed. The project was not changed.',
    })
    expect(context.projectService.getActiveProject()).toEqual(context.project)
    expect(settled).toHaveBeenCalledWith(context.events[0]!.transitionId)
    expect(terminal.release).toHaveBeenCalledOnce()
  })

  it('serializes rapid transitions without overlapping terminal confirmation or cleanup', async () => {
    const terminal = new FakeTerminalLifecycle()
    terminal.live = true
    const context = await setup(7, terminal)
    const first = context.projectService.closeProject()
    const second = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))
    expect(terminal.acquireProjectTransition).toHaveBeenCalledTimes(1)

    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: false },
    )
    await expect(first).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    await vi.waitFor(() => expect(context.events).toHaveLength(2))
    expect(terminal.acquireProjectTransition).toHaveBeenCalledTimes(2)
    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[1]!.transitionId, proceed: true },
    )
    await expect(second).resolves.toBeUndefined()
    expect(terminal.closeSessions).toHaveBeenCalledOnce()
  })

  it('rejects mismatched and stale transition IDs without releasing the guard', async () => {
    const context = await setup()
    const closing = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(1))
    const request = context.events[0]!

    await expect(context.ipcMain.invoke(
      99,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: true },
    )).resolves.toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(context.projectService.getActiveProject()).not.toBeNull()

    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: false },
    )
    await expect(closing).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    await expect(context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: true },
    )).resolves.toMatchObject({ ok: false, error: { code: 'PROCESS_CANCELLED' } })
  })

  it('fails closed when no renderer exists', async () => {
    const context = await setup()
    context.service.stop()
    const service = new UnsavedTransitionService(
      new IpcHandlerRegistry(context.ipcMain),
      context.projectService,
      { getRenderer: () => null },
    )
    service.start()
    await expect(context.projectService.closeProject())
      .rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(context.projectService.getActiveProject()).not.toBeNull()
  })

  it('fails closed on a deterministic timeout and releases later transitions', async () => {
    vi.useFakeTimers()
    const context = await setup()
    const closing = context.projectService.closeProject()
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(closing).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(context.projectService.getActiveProject()).not.toBeNull()

    const second = context.projectService.closeProject()
    await vi.waitFor(() => expect(context.events).toHaveLength(2))
    const request = context.events[1]!
    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: true },
    )
    await expect(second).resolves.toBeUndefined()
  })

  it('uses the same coordinator for application close', async () => {
    const terminal = new FakeTerminalLifecycle()
    terminal.live = true
    const context = await setup(7, terminal)
    const closing = context.service.requestApplicationClose()
    expect(context.events[0]?.reason).toBe('application-close')
    expect(context.events[0]?.terminalConfirmationRequired).toBe(false)
    expect(terminal.acquireProjectTransition).not.toHaveBeenCalled()
    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: true },
    )
    await expect(closing).resolves.toBe(true)
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}
