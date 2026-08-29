import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import { UnsavedTransitionService } from '../../src/main/services/lifecycle/unsaved-transition-service'
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

async function setup(rendererId = 7) {
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
    expect(context.projectService.getActiveProject()).toEqual(context.project)

    await expect(context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: request.transitionId, proceed: true },
    )).resolves.toEqual({ ok: true, value: null })
    await expect(closing).resolves.toBeUndefined()
    expect(context.projectService.getActiveProject()).toBeNull()
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
    const context = await setup()
    const closing = context.service.requestApplicationClose()
    expect(context.events[0]?.reason).toBe('application-close')
    await context.ipcMain.invoke(
      context.rendererId,
      LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      { transitionId: context.events[0]!.transitionId, proceed: true },
    )
    await expect(closing).resolves.toBe(true)
  })
})
