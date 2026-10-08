import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IpcHandlerRegistry, type IpcMainLike, type IpcRequestContext } from '../../src/main/ipc/ipc-handler-registry'
import { RunIpcService } from '../../src/main/ipc/run-ipc-service'
import { CsharpRunTargetRequests } from '../../src/main/services/run/csharp-run-target-requests'
import { CsharpRunTargetStore } from '../../src/main/services/run/csharp-run-target-store'
import { CsharpRunTargetResolver } from '../../src/main/services/run/csharp-run-target-resolver'
import { CsharpRunPreflight } from '../../src/main/services/run/csharp-run-preflight'
import { CsharpRunPreparation } from '../../src/main/services/run/csharp-run-preparation'
import { CSharpRunStrategy } from '../../src/main/services/run/csharp-run-strategy'
import { DotnetRunRuntimeResolver } from '../../src/main/services/dependencies/dotnet-run-runtime'
import { RUN_EVALUATION_PROPERTIES, type RunSdkProbe } from '../../src/main/services/run/csharp-run-probe'
import { RunService } from '../../src/main/services/run/run-service'
import { RunSourceGuard } from '../../src/main/services/run/run-source-guard'
import { RunProjectLifecycle } from '../../src/main/services/run/run-project-lifecycle'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { DomainError } from '../../src/main/errors/app-error'
import { createRunBridge } from '../../src/preload/bridge/run'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import { RUN_PROJECT_CHANNELS, type ProjectRunEvent } from '../../src/shared/contracts/run-project'
import { RUN_SOURCE_GUARD_CHANNELS } from '../../src/shared/contracts/run-source-guard'
import { RUN_CHANNELS, type ProjectId, type RunSessionId } from '../../src/shared/contracts'
import type { PipedProcessEvent } from '../../src/main/services/run/piped-process-adapter'

const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

async function setup(paths = ['App.csproj']) {
  const temp = await mkdtemp(join(tmpdir(), 'm110-')), root = join(temp, 'Việt project 😀')
  cleanups.push(() => rm(temp, { recursive: true, force: true }))
  await mkdir(root); for (const path of paths) await writeFile(join(root, path), '')
  const projects = new ProjectService(), project = await projects.openRoot(root)
  const files = new FileSystemService(projects, { watchFactory: () => ({ close() {} }), trashItem: async () => {} })
  files.start()
  cleanups.push(async () => { files.stop(); await projects.stop() })
  const execute = vi.fn<RunSdkProbe['execute']>(async (_exe, command) => ({ exitCode: 0, stderr: '',
    stdout: command.kind === 'inventory' ? '8.0.410 [C:\\dotnet\\sdk]' : command.kind === 'version' ? '8.0.410'
      : JSON.stringify({ Properties: { ...Object.fromEntries(RUN_EVALUATION_PROPERTIES.map(key => [key, ''])),
        OutputType: 'Exe', TargetFramework: 'net8.0', UsingMicrosoftNETSdk: 'true' }, Items: { ProjectReference: [] } }) }))
  const manager = new ProcessManager(), scopes: ReturnType<typeof scope>[] = []
  function scope() {
    const sdk = new DotnetRunRuntimeResolver({ execute }, { PATH: 'C:\\dotnet' },
      { resolveFile: async path => path }, async () => 'valid-or-absent')
    const evaluator = new CsharpRunPreflight(files, sdk, { execute })
    const resolver = new CsharpRunTargetResolver(projects, files, evaluator)
    const store = new CsharpRunTargetStore(join(temp, 'prefs'), projects, files, resolver)
    return { store, evaluator, close: vi.fn(async () => { await store.stop() }) }
  }
  const createScope = vi.fn(() => { const result = scope(); scopes.push(result); return result })
  const targets = new CsharpRunTargetRequests(manager, createScope, { projects, files,
    onCleanupError: error => { throw error } })
  targets.start()
  const preparation = new CsharpRunPreparation(createScope)
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) },
    removeHandler: channel => { handlers.delete(channel) } })
  let frameToken = 'trusted', ownerId = 7, dirty = false, reply = true
  const frame = () => ({ processId: 1, frameToken, detached: false, isDestroyed: () => false })
  const authorize = (context: IpcRequestContext, id?: ProjectId) => {
    if (![7, 8].includes(context.senderId) || context.senderFrame?.frameToken !== frameToken || context.senderFrame?.detached) {
      throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Untrusted window.', retryable: false })
    }
    if (id && targets.isTransitioning) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Project transition.', retryable: false })
    return id ? projects.getAuthorizedProject(id) : undefined
  }
  const guard = new RunSourceGuard(registry, { authorizeReply: authorize,
    authorize: session => { projects.getAuthorizedProject(session.projectId) },
    send: (owner, channel, request) => {
      if (channel === RUN_SOURCE_GUARD_CHANNELS.requested && reply) queueMicrotask(() => {
        void handlers.get(RUN_SOURCE_GUARD_CHANNELS.reply)!({ sender: { id: owner }, senderFrame: frame() },
          { ...request, revision: 1, dirty, conflict: false })
      })
    } })
  guard.start()
  const events: ProjectRunEvent[] = [], legacy: unknown[] = []
  type Listener = (event: { readonly sender?: unknown }, payload: unknown) => void
  const listeners = new Map<string, Set<Listener>>()
  const send = (channel: string, event: unknown) => { for (const listener of listeners.get(channel) ?? []) listener({}, event) }
  const children: { emit(event: PipedProcessEvent): void; finish(code?: number): void }[] = []
  const adapter = { create: vi.fn((_spec: unknown, emit: (event: PipedProcessEvent) => void) => {
    let released = false, exited = false
    const finish = (exitCode = 0) => { if (!exited) { exited = true; emit({ type: 'exit', exitCode }) }
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' }) }
    children.push({ emit, finish })
    return { ownership: { mode: 'LEGACY_ROOT_OWNED' as const, rootPid: 12 }, settled: Promise.resolve(),
      close: async () => { finish(); released = true }, isReleased: () => released }
  }) }
  const run = new RunService({ authorize: async target => ({ ...target, ...await files.authorizeRunFile(target.projectId, target.relativePath) }),
    resolveRuntime: context => context.strategyKind === 'javascript-file' ? Promise.resolve({ executable: 'C:\\node\\node.exe' }) : preparation.resolve(context),
  }, [new CSharpRunStrategy(), new JavaScriptRunStrategy()], { manager, adapter, sourceGuard: guard,
    onEvent: (owner, event) => /\.csproj$/i.test(event.session.relativePath) ? ipc.publish(owner, event) : send(RUN_CHANNELS.event, event),
    onPhase: (owner, session, phase) => ipc.publishPhase(owner, session, phase),
  })
  const runLifecycle = new RunProjectLifecycle(run, projects, files, error => { throw error })
  runLifecycle.start()
  const ipc = new RunIpcService(registry, run, () => {}, { targets, authorize,
    start: (request, owner) => run.startPlannedRun(request, owner), publish: (_owner, event) => send(RUN_PROJECT_CHANNELS.event, event) })
  ipc.start()
  const transport = { invoke: vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: ownerId }, senderFrame: frame() }, payload)),
    on: (channel: string, listener: Listener) => {
      const set = listeners.get(channel) ?? new Set(); set.add(listener); listeners.set(channel, set)
    }, removeListener: (channel: string, listener: Listener) => { listeners.get(channel)?.delete(listener) } }
  const api = createRunBridge(transport)
  const off = api.onProjectEvent(event => events.push(event)), offJs = api.onEvent(event => legacy.push(event))
  cleanups.push(async () => { await ipc.stop(); await runLifecycle.stop(); guard.stop(); off(); offJs(); expect(manager.size).toBe(0) })
  const target = (relativePath = paths[0]) => ({ kind: 'csharp-project' as const, projectId: project.id, relativePath })
  const start = (path?: string) => api.startProject({ ...target(path), dirty: false })
  const wait = (count: number) => vi.waitFor(() => expect(children).toHaveLength(count))
  const terminal = () => vi.waitFor(() => expect(events.some(event => event.type === 'exit')).toBe(true))
  return { temp, root, project, projects, files, manager, targets, scopes, createScope, execute, handlers, api, transport,
    ipc, run, events, legacy, children, adapter, target, start, wait, terminal, off, send, listeners,
    dirty: () => { dirty = true }, noReply: () => { reply = false }, owner: (id: number) => { ownerId = id },
    reload: async () => { frameToken = 'reloaded'; await Promise.all([ipc.invalidateOwner(7), run.stopOwner(7)]) },
  }
}

describe('M1-10 production IPC/preload/store/strategy/guard integration', () => {
  it('resolves one target without persisting and returns only semantic candidates', async () => {
    const h = await setup(), result = await h.api.resolveTargets({ projectId: h.project.id })
    expect(result).toMatchObject({ ok: true, value: { state: 'READY', target: h.target() } })
    expect(JSON.stringify(result)).not.toContain(h.root); expect(JSON.stringify(result)).not.toContain('executable')
    await expect(readFile(join(h.temp, 'prefs/csharp-run-targets', `${h.project.id}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('requires explicit selection, persists/restores across scopes, changes and clears it', async () => {
    const h = await setup(['A.csproj', 'B.csproj'])
    expect(await h.api.resolveTargets({ projectId: h.project.id })).toMatchObject({ ok: true, value: { state: 'SELECTION_REQUIRED' } })
    expect(await h.api.selectTarget(h.target('B.csproj'))).toMatchObject({ ok: true, value: { state: 'READY', target: h.target('B.csproj') } })
    expect(await h.api.resolveTargets({ projectId: h.project.id })).toMatchObject({ ok: true, value: { target: h.target('B.csproj') } })
    expect(await h.api.selectTarget(h.target('A.csproj'))).toMatchObject({ ok: true, value: { target: h.target('A.csproj') } })
    expect(await h.api.clearTarget({ projectId: h.project.id })).toMatchObject({ ok: true, value: { state: 'SELECTION_REQUIRED' } })
  })
  it('isolates selection between IDE projects and restores it on reopening', async () => {
    const h = await setup(['A.csproj', 'B.csproj']); await h.api.selectTarget(h.target('B.csproj'))
    const otherRoot = join(h.temp, 'Other'); await mkdir(otherRoot)
    await writeFile(join(otherRoot, 'A.csproj'), ''); await writeFile(join(otherRoot, 'B.csproj'), '')
    const other = await h.projects.openRoot(otherRoot)
    expect(await h.api.resolveTargets({ projectId: other.id })).toMatchObject({ ok: true, value: { state: 'SELECTION_REQUIRED' } })
    await h.projects.openRoot(h.root)
    expect(await h.api.resolveTargets({ projectId: h.project.id })).toMatchObject({ ok: true, value: { target: h.target('B.csproj') } })
  })
  it('starts early, streams phases/pipes/exit in one session and avoids JS duplicate delivery', async () => {
    const h = await setup(), result = await h.start()
    expect(result).toMatchObject({ ok: true, value: { state: 'STARTING', phase: 'PREPARING', kind: 'csharp-project' } })
    await h.wait(1); h.children[0].emit({ type: 'stdout', data: 'build' }); h.children[0].finish()
    await h.wait(2); h.children[1].emit({ type: 'stderr', data: 'stderr' }); h.children[1].finish(23)
    await h.terminal()
    expect(h.events.filter(e => e.type === 'phase').map(e => e.session.phase)).toEqual(['PREPARING', 'BUILD_RESTORE', 'EXECUTING'])
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', failure: { reason: 'EXECUTION_FAILED', exitCode: 23 } }))
    expect(h.events.filter(e => e.type === 'exit')).toHaveLength(1)
    expect(new Set(h.events.map(e => e.session.sessionId)).size).toBe(1); expect(h.legacy).toHaveLength(0)
  })
  it('unselected multiple targets cannot bypass selection by sending a path', async () => {
    const h = await setup(['A.csproj', 'B.csproj']); await h.start('B.csproj'); await h.terminal()
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', failure: { reason: 'SELECTION_REQUIRED' } }))
    expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('saved selection rejects an alternate renderer target', async () => {
    const h = await setup(['A.csproj', 'B.csproj']); await h.api.selectTarget(h.target('A.csproj'))
    await h.start('B.csproj'); await h.terminal()
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', failure: { reason: 'INVALID_TARGET' } }))
    expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('dirty source cannot be bypassed by dirty:false in start', async () => {
    const h = await setup(); h.dirty(); await h.start(); await h.terminal()
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', failure: { reason: 'SOURCE_DIRTY' } }))
    expect(h.execute).not.toHaveBeenCalled(); expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('a disappeared target is reauthorized rather than using a prior resolution', async () => {
    const h = await setup(); await h.api.resolveTargets({ projectId: h.project.id })
    await rm(join(h.root, 'App.csproj')); expect((await h.start()).ok).toBe(false)
    expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('Stop during handshake uses the early session and prevents all process creation', async () => {
    const h = await setup(); h.noReply(); const result = await h.start()
    if (!result.ok) throw Error('missing session')
    expect(await h.api.stop(result.value.sessionId)).toEqual({ ok: true, value: null })
    await h.terminal(); expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('re-run retires the old session and ignores old process callbacks', async () => {
    const h = await setup(), first = await h.start(); await h.wait(1)
    const next = await h.start(); await h.wait(2)
    expect(first.ok && next.ok && first.value.sessionId !== next.value.sessionId).toBe(true)
    const count = h.events.length; h.children[0].emit({ type: 'stdout', data: 'stale' })
    expect(h.events).toHaveLength(count)
    if (next.ok) await h.api.stop(next.value.sessionId)
  })
  it('rejects unauthorized senders, frames, projects and session owners', async () => {
    const h = await setup(); h.owner(99)
    expect((await h.api.resolveTargets({ projectId: h.project.id })).ok).toBe(false)
    expect((await h.start()).ok).toBe(false); h.owner(7)
    expect(await h.handlers.get(RUN_PROJECT_CHANNELS.resolve)!({ sender: { id: 7 } }, { projectId: h.project.id }))
      .toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect((await h.api.resolveTargets({ projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId })).ok).toBe(false)
    expect((await h.api.stop('run_12345678-1234-1234-1234-123456789abc' as RunSessionId)).ok).toBe(false)
    expect(h.createScope).not.toHaveBeenCalled()
  })
  it('another trusted owner cannot stop or replace the session', async () => {
    const h = await setup(), result = await h.start(); await h.wait(1)
    if (!result.ok) throw Error('missing session')
    h.owner(8)
    expect((await h.api.stop(result.value.sessionId)).ok).toBe(false)
    expect((await h.start()).ok).toBe(false)
    expect(h.children).toHaveLength(1)
    h.owner(7); expect((await h.api.stop(result.value.sessionId)).ok).toBe(true)
  })
  it('validates IPC independently when a caller bypasses preload', async () => {
    const h = await setup()
    for (const channel of [RUN_PROJECT_CHANNELS.resolve, RUN_PROJECT_CHANNELS.select, RUN_PROJECT_CHANNELS.start]) {
      expect(await h.handlers.get(channel)!({ sender: { id: 7 } }, { ...h.target(), executable: 'cmd.exe' }))
        .toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    expect(h.createScope).not.toHaveBeenCalled()
  })
  it('project switch rejects a late discovery response', async () => {
    const h = await setup(), gate = deferred<void>(), original = h.execute.getMockImplementation()!
    h.execute.mockImplementationOnce(async (...args) => { await gate.promise; return original(...args) })
    const pending = h.api.resolveTargets({ projectId: h.project.id })
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalled())
    const next = join(h.temp, 'next'); await mkdir(next)
    const switching = h.projects.openRoot(next); await Promise.resolve(); gate.resolve(); await switching
    expect((await pending).ok).toBe(false); expect(h.manager.size).toBe(0)
  })
  it('reload rejects pending approval and suppresses old-session events', async () => {
    const h = await setup(); h.noReply(); await h.start(); await h.reload()
    const count = h.events.length; await Promise.resolve(); expect(h.events).toHaveLength(count)
    expect(h.adapter.create).not.toHaveBeenCalled(); expect(h.manager.size).toBe(0)
  })
  it.each(['cancel', 'reload', 'shutdown', 'close'] as const)('%s rejects stale discovery and joins its scope cleanup', async action => {
    const h = await setup(), gate = deferred<void>(), original = h.execute.getMockImplementation()!
    h.execute.mockImplementationOnce(async (...args) => { await gate.promise; return original(...args) })
    const pending = h.api.resolveTargets({ projectId: h.project.id })
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalled())
    const ending = action === 'cancel' ? h.api.cancelResolution({ projectId: h.project.id })
      : action === 'reload' ? h.reload() : action === 'close' ? h.projects.closeProject() : h.ipc.stop()
    gate.resolve(); await ending
    expect((await pending).ok).toBe(false); expect(h.manager.size).toBe(0)
  })
  it('project close cancels an active build and retires old output callbacks', async () => {
    const h = await setup(); await h.start(); await h.wait(1)
    await h.projects.closeProject()
    const count = h.events.length; h.children[0].emit({ type: 'stdout', data: 'late' })
    expect(h.events).toHaveLength(count); expect(h.children).toHaveLength(1); expect(h.manager.size).toBe(0)
  })
  it('sanitizes failure events into the reason allowlist rather than exposing raw error data', async () => {
    const h = await setup(), result = await h.start(); await h.wait(1)
    if (!result.ok) throw Error('missing session')
    const { projectId, relativePath, sessionId, state } = result.value
    const session = { projectId, relativePath, sessionId, state }
    h.ipc.publish(7, { type: 'error', session, error: { code: 'PROCESS_FAILED', message: 'private native path',
      retryable: false, details: { reason: 'SPAWN_FAILED', executable: 'C:\\secret.exe', stderr: 'raw' } } })
    const event = h.events.at(-1)
    expect(event).toMatchObject({ type: 'error', failure: { reason: 'SPAWN_FAILED' } })
    expect(JSON.stringify(event)).not.toMatch(/secret|private|stderr|executable/)
  })
  it('keeps JavaScript start/stop and legacy event wire unchanged', async () => {
    const h = await setup(['app.js']), result = await h.api.start({ projectId: h.project.id, relativePath: 'app.js', dirty: false })
    expect(result.ok).toBe(true); await h.wait(1)
    if (result.ok) expect(await h.api.stop(result.value.sessionId)).toEqual({ ok: true, value: null })
    expect(h.events).toHaveLength(0); expect(h.legacy.length).toBeGreaterThan(0)
    expect(h.execute).not.toHaveBeenCalled()
  })
  it('listener removal and repeated IPC start do not duplicate delivery; stop removes handlers', async () => {
    const h = await setup(); h.ipc.start(); h.off(); await h.start(); await h.wait(1)
    expect(h.events).toHaveLength(0)
    expect(h.listeners.get(RUN_PROJECT_CHANNELS.event)?.size).toBe(0)
    await h.ipc.stop(); expect([...h.handlers.keys()].filter(key => key.startsWith('run:') && !key.startsWith('run:source-guard'))).toEqual([])
  })
})
