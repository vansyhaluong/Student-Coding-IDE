import { describe, expect, it, vi } from 'vitest'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService, type FileSystemPort } from '../../src/main/services/filesystem/filesystem-service'
import { UnsavedTransitionService } from '../../src/main/services/lifecycle/unsaved-transition-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { RunService } from '../../src/main/services/run/run-service'
import { RunProjectLifecycle } from '../../src/main/services/run/run-project-lifecycle'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../../src/main/app/application-quit-coordinator'
import { LIFECYCLE_CHANNELS, type UnsavedTransitionRequestEvent, type RunEvent } from '../../src/shared/contracts'
import type { PipedProcessEvent } from '../../src/main/services/run/piped-process-adapter'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function setup() {
  const projects = new ProjectService({ realpath: async (path) => path,
    stat: async () => ({ isDirectory: () => true }), mkdir: async () => {}, rmdir: async () => {} }, 'win32')
  const project = await projects.openRoot('C:\\A')
  const disk: FileSystemPort = { realpath: vi.fn(async (path) => path),
    lstat: async (path) => ({ isFile: () => path.endsWith('.js'), isDirectory: () => !path.endsWith('.js'),
      isSymbolicLink: () => false, mtime: new Date(0), size: 1 }),
    readdir: async () => [], readFile: async () => '', writeFile: async () => {},
    mkdir: async () => {}, rename: async () => {} }
  let unavailable!: (error: unknown) => void
  const files = new FileSystemService(projects, { fileSystem: disk, platform: 'win32',
    trashItem: async () => {}, watchFactory: () => ({ close: () => {}, onError: (callback) => { unavailable = callback } }) })
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) },
    removeHandler: (channel) => { handlers.delete(channel) } })
  let nextPrompt = deferred<UnsavedTransitionRequestEvent>()
  const terminal = { acquireProjectTransition: vi.fn(async () => ({ hasLiveSessions: true,
    closeSessions: vi.fn(async () => {}), release: vi.fn() })) }
  const unsaved = new UnsavedTransitionService(registry, projects, { terminalLifecycle: terminal,
    getRenderer: () => ({ senderId: 7, send: (event) => { nextPrompt.resolve(event) } }) })
  const manager = new ProcessManager()
  const events: RunEvent[] = []
  let manual = false
  function fakeProcess(observe: (event: PipedProcessEvent) => void) {
    const closing = deferred(), gate = deferred(), settled = deferred()
    let released = false
    const close = vi.fn(async () => {
      closing.resolve()
      if (manual) await gate.promise
      observe({ type: 'exit', exitCode: 1 })
      observe({ type: 'stdout-eof' }); observe({ type: 'stderr-eof' })
      settled.resolve(); released = true
    })
    return { closing, gate, close, observe, process: { close, settled: settled.promise,
      isReleased: () => released, ownership: { mode: 'LEGACY_ROOT_OWNED' as const, rootPid: 123 } } }
  }
  const natives: ReturnType<typeof fakeProcess>[] = []
  const adapter = { create: vi.fn((_execution: unknown, observe: (event: PipedProcessEvent) => void) => {
    const native = fakeProcess(observe); natives.push(native); return native.process
  }) }
  const authority = { authorize: vi.fn(async (target: { projectId: typeof project.id; relativePath: string }) => ({
    ...target, ...await files.authorizeRunFile(target.projectId, target.relativePath),
  })), resolveRuntime: vi.fn(async () => ({ executable: 'C:\\Node\\node.exe' })) }
  const run = new RunService(authority, { adapter, manager, onEvent: (_owner, event) => events.push(event) })
  const failed = deferred<unknown>()
  const lifecycle = new RunProjectLifecycle(run, projects, files, (error) => failed.resolve(error))
  const window = { name: 'Window', stop: vi.fn() }
  const desktop = new DesktopApplication([manager, projects, files, unsaved, lifecycle, window], { shutdownLast: [window] })
  desktop.subscribe((status) => { if (status.state === 'STOPPING') run.beginShutdown() })
  await desktop.start()
  const start = (relativePath = 'main.js', id = projects.getActiveProject()!.id) => run.startRun({
    projectId: id, relativePath, dirty: false,
  }, 7)
  const prompt = () => nextPrompt.promise
  const confirm = async (proceed: boolean) => {
    const event = await nextPrompt.promise
    nextPrompt = deferred()
    const result = await handlers.get(LIFECYCLE_CHANNELS.resolveUnsavedTransition)!({ sender: { id: 7 } }, {
      transitionId: event.transitionId, proceed,
    })
    expect(result).toMatchObject({ ok: true })
  }
  return { projects, project, files, disk, authority, run, lifecycle, desktop, manager, window, terminal,
    events, natives, adapter, failed, prompt, confirm, start, unsaved,
    manual: () => { manual = true }, unavailable: () => unavailable(new Error('watch root unavailable')) }
}

describe('Phase 4D project transitions', () => {
  it('cleans all project targets while a cleanup request for another project does nothing', async () => {
    const h = await setup()
    await h.start(); await h.start('other.js')
    await h.run.stopProject('unrelated-project')
    expect(h.manager.size).toBe(2)
    const close = h.projects.closeProject()
    await h.confirm(true); await close
    expect(h.natives.every((native) => native.process.isReleased())).toBe(true)
    expect(h.manager.size).toBe(0)
    await h.desktop.shutdown()
  })
  it.each(['switch', 'close'] as const)('%s waits for confirmation and full Run cleanup before mutation', async (kind) => {
    const h = await setup(); h.manual()
    const session = await h.start()
    const transition = kind === 'switch' ? h.projects.openRoot('C:\\B') : h.projects.closeProject()
    const prompt = await h.prompt()
    expect(prompt.terminalConfirmationRequired).toBe(true)
    expect(h.natives[0].close).not.toHaveBeenCalled()
    expect(h.projects.getActiveProject()).toEqual(h.project)
    await h.confirm(true)
    await h.natives[0].closing.promise
    expect(h.projects.getActiveProject()).toEqual(h.project)
    expect(h.manager.size).toBe(1)
    await expect(h.start('other.js')).rejects.toThrow(/unavailable/)
    h.natives[0].gate.resolve()
    await transition
    expect(h.manager.size).toBe(0)
    expect(h.projects.getActiveProject()?.id).not.toBe(h.project.id)
    expect(h.run.getSession(session.sessionId, 7).state).toBe('CANCELLED')
    const count = h.events.length
    h.natives[0].observe({ type: 'stdout', data: 'late A' })
    h.natives[0].observe({ type: 'stderr', data: 'late A' })
    h.natives[0].observe({ type: 'exit', exitCode: 0 })
    expect(h.events.length).toBe(count)
    if (kind === 'switch') {
      const b = await h.start()
      expect(b.projectId).not.toBe(h.project.id)
      h.natives[1].gate.resolve()
    }
    await h.desktop.shutdown()
  })
  it.each(['switch', 'close'] as const)('cancelled %s preserves active project and Run', async (kind) => {
    const h = await setup()
    const session = await h.start()
    const transition = kind === 'switch' ? h.projects.openRoot('C:\\B') : h.projects.closeProject()
    const rejected = expect(transition).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    await h.confirm(false)
    await rejected
    expect(h.projects.getActiveProject()).toEqual(h.project)
    expect(h.run.getSession(session.sessionId, 7).state).toBe('RUNNING')
    expect(h.natives[0].close).not.toHaveBeenCalled()
    await h.desktop.shutdown()
  })
  it.each(['switch', 'close'] as const)('failed Run cleanup aborts %s without project mutation and permits retry', async (kind) => {
    const h = await setup()
    const session = await h.start()
    h.natives[0].close.mockRejectedValueOnce(new Error('private failure'))
    const changed = vi.fn(); const remove = h.projects.subscribe(changed)
    const transition = kind === 'switch' ? h.projects.openRoot('C:\\B') : h.projects.closeProject()
    const rejected = expect(transition).rejects.toMatchObject({ code: 'PROCESS_FAILED', retryable: true })
    await h.confirm(true); await rejected
    expect(h.projects.getActiveProject()).toEqual(h.project)
    expect(changed).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(1)
    expect(h.run.getSession(session.sessionId, 7).state).toBe('STOPPING')
    const retry = kind === 'switch' ? h.projects.openRoot('C:\\B') : h.projects.closeProject()
    await h.confirm(true); await retry
    expect(h.manager.size).toBe(0)
    expect(h.natives[0].close).toHaveBeenCalledTimes(2)
    remove(); await h.desktop.shutdown()
  })
  it('uses the existing queue for overlapping switch/close without duplicate cleanup', async () => {
    const h = await setup(); h.manual()
    await h.start()
    const switched = h.projects.openRoot('C:\\B')
    await h.confirm(true); await h.natives[0].closing.promise
    const closed = h.projects.closeProject()
    h.natives[0].gate.resolve()
    await switched
    expect((await h.prompt()).project.id).not.toBe(h.project.id)
    await h.confirm(true); await closed
    expect(h.projects.getActiveProject()).toBeNull()
    expect(h.natives[0].close).toHaveBeenCalledTimes(1)
    await h.desktop.shutdown()
  })
  it('invalidates a start awaiting authority before confirmed transition can finish', async () => {
    const h = await setup()
    const entered = deferred(), gate = deferred()
    const original = h.authority.authorize.getMockImplementation()!
    h.authority.authorize.mockImplementationOnce(async (target) => {
      entered.resolve(); await gate.promise; return original(target)
    })
    const start = h.start()
    const rejected = expect(start).rejects.toThrow(/unavailable/)
    await entered.promise
    const transition = h.projects.openRoot('C:\\B')
    await h.confirm(true)
    gate.resolve(); await rejected; await transition
    expect(h.adapter.create).not.toHaveBeenCalled()
    await h.desktop.shutdown()
  })
})

describe('Phase 4D root availability', () => {
  it('mutes stale output immediately, rejects starts, awaits cleanup, and isolates reopened project', async () => {
    const h = await setup(); h.manual()
    await h.start()
    h.unavailable()
    const count = h.events.length
    h.natives[0].observe({ type: 'stdout', data: 'stale unavailable output' })
    await expect(h.start('other.js')).rejects.toThrow(/unavailable/)
    await h.natives[0].closing.promise
    expect(h.manager.size).toBe(1)
    h.natives[0].gate.resolve()
    await h.run.stopProject(h.project.id)
    expect(h.manager.size).toBe(0)
    expect(h.events.length).toBe(count)
    const reopen = h.projects.openRoot('C:\\A')
    await h.confirm(true); await reopen
    const fresh = await h.start()
    const freshCount = h.events.length
    h.natives[0].observe({ type: 'exit', exitCode: 0 })
    h.natives[0].observe({ type: 'stderr', data: 'late' })
    expect(h.events.length).toBe(freshCount)
    expect(h.run.getSession(fresh.sessionId, 7).state).toBe('RUNNING')
    h.natives[1].gate.resolve(); await h.desktop.shutdown()
  })
  it('retains failed unavailable cleanup for later transition/shutdown retry', async () => {
    const h = await setup()
    await h.start()
    h.natives[0].close.mockRejectedValueOnce(new Error('private cleanup'))
    h.unavailable()
    expect(await h.failed.promise).toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1)
    await expect(h.start()).rejects.toThrow(/unavailable/)
    await h.desktop.shutdown()
    expect(h.manager.size).toBe(0)
  })
})

describe('Phase 4D shutdown coordination', () => {
  it('invalidates a start paused at final runtime resolution before native creation', async () => {
    const h = await setup()
    const entered = deferred(), gate = deferred()
    h.authority.resolveRuntime.mockImplementation(async () => {
      if (h.events.some((event) => event.session.state === 'STARTING')) {
        entered.resolve(); await gate.promise
      }
      return { executable: 'C:\\Node\\node.exe' }
    })
    const start = h.start()
    const rejected = expect(start).rejects.toThrow(/unavailable/)
    await entered.promise
    const shutdown = h.desktop.shutdown()
    gate.resolve(); await rejected; await shutdown
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
  })
  it('awaits full cleanup and shares duplicate shutdown before window/dependencies stop', async () => {
    const h = await setup(); h.manual()
    await h.start()
    const shutdown = h.desktop.shutdown()
    expect(h.desktop.shutdown()).toBe(shutdown)
    await h.natives[0].closing.promise
    expect(h.desktop.getStatus().state).toBe('STOPPING')
    expect(h.projects.getActiveProject()).toEqual(h.project)
    expect(h.window.stop).not.toHaveBeenCalled()
    await expect(h.start()).rejects.toThrow(/unavailable/)
    const count = h.events.length
    h.natives[0].observe({ type: 'stdout', data: 'late shutdown output' })
    expect(h.events.length).toBe(count)
    h.natives[0].gate.resolve(); await shutdown
    expect(h.desktop.getStatus().state).toBe('STOPPED')
    expect(h.manager.size).toBe(0)
    expect(h.natives[0].close).toHaveBeenCalledTimes(1)
    expect(h.window.stop).toHaveBeenCalledTimes(1)
  })
  it('retains STOPPING, window and dependencies on failure; retry completes without coordinator changes', async () => {
    const h = await setup()
    await h.start()
    h.natives[0].close.mockRejectedValueOnce(new Error('private cleanup'))
    await expect(h.desktop.shutdown()).rejects.toThrow('Application cleanup failed')
    expect(h.desktop.getStatus().state).toBe('STOPPING')
    expect(h.window.stop).not.toHaveBeenCalled()
    expect(h.projects.getActiveProject()).toEqual(h.project)
    expect(h.manager.size).toBe(1)
    await h.desktop.shutdown()
    expect(h.desktop.getStatus().state).toBe('STOPPED')
    expect(h.manager.size).toBe(0)
  })
  it('existing quit coordinator gates final quit on approval and successful Run cleanup', async () => {
    const h = await setup()
    await h.start()
    h.natives[0].close.mockRejectedValueOnce(new Error('cleanup'))
    const failure = deferred(), success = deferred()
    const quit = vi.fn(() => success.resolve())
    const coordinator = new ApplicationQuitCoordinator({ getApplication: () => h.desktop,
      requestApproval: () => h.unsaved.requestApplicationClose(), quit, onCleanupError: () => failure.resolve() })
    const event = { preventDefault: vi.fn() }
    coordinator.handleBeforeQuit(event)
    expect((await h.prompt()).reason).toBe('application-close')
    expect(h.natives[0].close).not.toHaveBeenCalled()
    await h.confirm(true); await failure.promise
    expect(coordinator.isFinalQuitAuthorized()).toBe(false)
    expect(quit).not.toHaveBeenCalled()
    // Drain the coordinator's promise-finally, not a time-based readiness sleep.
    await Promise.resolve(); await Promise.resolve()
    coordinator.handleBeforeQuit(event)
    await success.promise
    expect(coordinator.isFinalQuitAuthorized()).toBe(true)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(h.manager.size).toBe(0)
  })
})

describe('Phase 4D concrete file authority', () => {
  it('rejects stale projects, out-of-root canonical paths, directories, and unavailable roots', async () => {
    const h = await setup()
    await expect(h.files.authorizeRunFile(h.project.id, 'folder')).rejects.toThrow(/not a file/)
    vi.mocked(h.disk.realpath).mockResolvedValueOnce('C:\\outside\\evil.js')
    await expect(h.start()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    h.unavailable()
    await expect(h.files.authorizeRunFile(h.project.id, 'main.js')).rejects.toThrow(/unavailable/)
    const close = h.projects.closeProject(); await h.confirm(true); await close
    await expect(h.files.authorizeRunFile(h.project.id, 'main.js')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await h.desktop.shutdown()
  })
})
