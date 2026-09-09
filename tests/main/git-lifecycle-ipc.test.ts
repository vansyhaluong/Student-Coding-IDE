import { describe, expect, it, vi } from 'vitest'
import { GitLifecycleIpcService } from '../../src/main/ipc/git-lifecycle-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { GitOperationLifecycle } from '../../src/main/services/git/git-operation-lifecycle'
import { ProjectService } from '../../src/main/services/project/project-service'
import { createGitBridge } from '../../src/preload/bridge/git'
import { FILE_CHANNELS, LIFECYCLE_CHANNELS, GIT_CHANNELS, PROJECT_CHANNELS, type ProjectId } from '../../src/shared/contracts'

function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

async function setup() {
  const projects = new ProjectService({ realpath: async (path) => path,
    stat: async () => ({ isDirectory: () => true }), mkdir: async () => {}, rmdir: async () => {} }, 'win32')
  const project = await projects.openRoot('C:\\a')
  const lifecycle = new GitOperationLifecycle(projects,
    { getStatus: (projectId: ProjectId) => ({ projectId, state: 'AVAILABLE' }), subscribeStatus: () => () => {} },
    { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }), stop: async () => {} })
  lifecycle.start()
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, fn) => { handlers.set(channel, fn) }, removeHandler: (channel) => { handlers.delete(channel) } })
  const status = { entries: [], didHitLimit: false }
  const git = { getState: vi.fn(async () => ({ dependency: 'MISSING' as const, repository: null })),
    getStatus: vi.fn(async () => status),
    getBranches: vi.fn(async () => ({ state: 'UNBORN' as const, currentBranch: 'main', branches: [] })),
    getHistory: vi.fn(async (_project: ProjectId, limit: number) => { expect(limit).toBeGreaterThan(0); return [] }),
    stage: vi.fn(async () => ({ applied: true as const, status, refreshRequired: false as const })),
    unstage: vi.fn(), commit: vi.fn(), switchBranch: vi.fn() }
  const service = new GitLifecycleIpcService(registry, git, lifecycle, () => {})
  service.start()
  const listeners = new Map<string, Set<(event: { sender?: unknown }, payload: unknown) => void>>()
  const invoke = vi.fn(async (channel: string, payload: unknown): Promise<unknown> => handlers.get(channel)!({ sender: { id: 1 } }, payload))
  const transport = { invoke,
    on: (channel: string, fn: (event: { sender?: unknown }, payload: unknown) => void) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set())
      listeners.get(channel)!.add(fn)
    },
    removeListener: (channel: string, fn: (event: { sender?: unknown }, payload: unknown) => void) => { listeners.get(channel)?.delete(fn) } }
  const remove = projects.subscribe((activeProject) => {
    for (const fn of listeners.get(PROJECT_CHANNELS.changed) ?? []) fn({}, { activeProject })
  })
  const bridge = createGitBridge(transport)
  return { projects, project, lifecycle, git, service, handlers, invoke, bridge, listeners,
    stop: async () => { remove(); service.stop(); await lifecycle.stop(); await projects.stop() } }
}

describe('Phase 5D production IPC identity and receiving guards', () => {
  it.each([
    [FILE_CHANNELS.statusChanged, 'UNAVAILABLE'],
    [LIFECYCLE_CHANNELS.statusChanged, 'STOPPING'],
  ])('rejects replies held in transport when %s arrives', async (channel, state) => {
    const f = await setup(), entered = barrier(), release = barrier()
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (name, payload) => {
      const result = await original(name, payload)
      if (name === GIT_CHANNELS.getStatus) { entered.release(); await release.promise }
      return result
    })
    const old = f.bridge.getStatus(f.project.id)
    await entered.promise
    for (const fn of f.listeners.get(channel) ?? []) fn({}, { projectId: f.project.id, state })
    release.release()
    expect(await old).toMatchObject({ ok: false, error: { details: { reason: 'stale-request' } } })
    expect([...f.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true)
    await f.stop()
  })

  it.each(['getState', 'getStatus', 'getBranches', 'getHistory'] as const)('rejects superseded %s replies already returned by Main', async (api) => {
    const f = await setup(), entered = barrier(), release = barrier()
    const original = f.invoke.getMockImplementation()!
    let first = true
    f.invoke.mockImplementation(async (channel, payload) => {
      const result = await original(channel, payload)
      if (channel === GIT_CHANNELS[api] && first) { first = false; entered.release(); await release.promise }
      return result
    })
    const old = f.bridge[api](f.project.id, 1)
    await entered.promise
    expect(await f.bridge[api](f.project.id, 100)).toMatchObject({ ok: true })
    release.release()
    expect(await old).toMatchObject({ ok: false, error: { details: { reason: 'stale-request' } } })
    if (api === 'getHistory') expect(f.git.getHistory.mock.calls.map(([, limit]) => limit)).toEqual([1, 100])
    expect(f.listeners.get(PROJECT_CHANNELS.changed)?.size).toBe(0)
    await f.stop()
  })

  it.each(['switch', 'close'] as const)('%s rejects an old project reply held between Main and Preload', async (action) => {
    const f = await setup(), entered = barrier(), release = barrier()
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (channel, payload) => {
      const result = await original(channel, payload)
      if (channel === GIT_CHANNELS.getStatus) { entered.release(); await release.promise }
      return result
    })
    const old = f.bridge.getStatus(f.project.id)
    await entered.promise
    if (action === 'switch') await f.projects.openRoot('C:\\b')
    else await f.projects.closeProject()
    release.release()
    expect(await old).toMatchObject({ ok: false, error: { details: { reason: 'stale-request' } } })
    await f.stop()
  })

  it('preserves applied but drops an old mutation snapshot after a project event', async () => {
    const f = await setup(), entered = barrier(), release = barrier()
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (channel, payload) => {
      const result = await original(channel, payload)
      if (channel === GIT_CHANNELS.stage) { entered.release(); await release.promise }
      return result
    })
    const old = f.bridge.stage(f.project.id, 'file.txt')
    await entered.promise
    await f.projects.openRoot('C:\\b')
    release.release()
    expect(await old).toEqual({ ok: true, value: { applied: true, status: null, refreshRequired: true } })
    await f.stop()
  })

  it('validates generation, project, request identity and rejects raw process fields before dispatch', async () => {
    const f = await setup()
    const identity = { requestId: 'request_1', projectId: f.project.id, generation: f.lifecycle.getContext(f.project.id, 1) }
    const send = (request: unknown) => f.handlers.get(GIT_CHANNELS.getStatus)!({ sender: { id: 1 } }, request)
    for (const field of ['cwd', 'args', 'shell', 'executable', 'pid', 'command']) {
      expect(await send({ identity: { ...identity, [field]: 'injected' }, payload: { projectId: f.project.id } })).toMatchObject({ ok: false })
      expect(await send({ identity, payload: { projectId: f.project.id, [field]: 'injected' } })).toMatchObject({ ok: false })
    }
    expect(await send({ identity: { ...identity, generation: 'stale' }, payload: { projectId: f.project.id } }))
      .toMatchObject({ value: { identity: { generation: 'stale' }, result: { ok: false, error: { details: { reason: 'stale-generation' } } } } })
    expect(f.git.getStatus).not.toHaveBeenCalled()
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (channel, payload) => {
      const result = await original(channel, payload)
      if (channel !== GIT_CHANNELS.getStatus) return result
      return { ok: true, value: { identity: { ...identity, generation: 'forged' }, result: { ok: true, value: { entries: [], didHitLimit: false } } } }
    })
    expect(await f.bridge.getStatus(f.project.id)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    await f.stop()
  })
})
