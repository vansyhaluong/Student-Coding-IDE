import { win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunService } from '../../src/main/services/run/run-service'
import { RunSourceGuard } from '../../src/main/services/run/run-source-guard'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { createRunSourceGuardBridge } from '../../src/preload/bridge/run-source-guard'
import { RunSourceGuardController } from '../../src/renderer/src/features/output/run-source-guard-controller'
import { EditorModelManager, type EditorTextModel } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { RUN_SOURCE_GUARD_CHANNELS, type RunSourceGuardRequest } from '../../src/shared/contracts/run-source-guard'
import type { ProjectId, RunEvent, SemanticStartRunRequest } from '../../src/shared/contracts'
import type { PipedProcessEvent } from '../../src/main/services/run/piped-process-adapter'
import type { RunExecutionPlan } from '../../src/main/services/run/run-strategy'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request: SemanticStartRunRequest = { kind: 'csharp-project', projectId, relativePath: 'App.csproj', dirty: false }
function model(value: string): EditorTextModel {
  let content = value, version = 1
  const listeners = new Set<() => void>()
  return { getValue: () => content, getVersionId: () => version,
    setValue: text => { content = text; version++; for (const listener of listeners) listener() },
    onDidChangeContent: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) } },
    dispose: () => listeners.clear() }
}
function setup() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (name, handler) => { handlers.set(name, handler) },
    removeHandler: name => { handlers.delete(name) } })
  const listeners = new Map<string, (event: { readonly sender?: unknown }, payload: unknown) => void>()
  let respond = true, activeProject: ProjectId | null = projectId
  const messages: RunSourceGuardRequest[] = [], events: RunEvent[] = []
  const transport = {
    invoke: vi.fn(async (channel: string, payload: unknown) => respond
      ? handlers.get(channel)!({ sender: { id: 7 } }, payload) : new Promise<never>(() => {})),
    on: (channel: string, listener: (event: { readonly sender?: unknown }, payload: unknown) => void) => { listeners.set(channel, listener) },
    removeListener: (channel: string) => { listeners.delete(channel) },
  }
  const guard = new RunSourceGuard(registry, {
    authorize: session => {
      if (session.projectId !== activeProject) throw new Error('Project changed')
    },
    send: (_owner, channel, event) => {
      if (channel === RUN_SOURCE_GUARD_CHANNELS.requested) messages.push(event)
      listeners.get(channel)?.({}, event)
    },
  })
  guard.start()
  const api = createRunSourceGuardBridge(transport)
  const models = new EditorModelManager({ createModel: value => model(value) })
  const document = models.openDocument(projectId, 'src/Program.cs', 'saved')
  const controller = new RunSourceGuardController(api, models)
  controller.activateProject(projectId); controller.setAvailable(true)
  const disconnect = controller.connect()
  const manager = new ProcessManager()
  const authority = {
    authorize: vi.fn(async (target: { projectId: ProjectId; relativePath: string }) => ({ ...target,
      canonicalRoot: 'C:\\project', canonicalFile: win32.join('C:\\project', target.relativePath) })),
    resolveRuntime: vi.fn(async ({ strategyKind }: { strategyKind: string }) => ({
      executable: strategyKind === 'javascript-file' ? 'C:\\node\\node.exe' : 'C:\\sdk\\dotnet.exe' })),
  }
  const spec = { executable: 'C:\\sdk\\dotnet.exe', args: ['fixture'], cwd: 'C:\\project', shell: false as const, environmentAdditions: {} }
  const preparePlan = vi.fn(async (): Promise<RunExecutionPlan> => ({ steps: [
    { phase: 'BUILD_RESTORE', execution: spec }, { phase: 'EXECUTING', execution: spec },
  ] }))
  const natives: { emit(event: PipedProcessEvent): void; close: ReturnType<typeof vi.fn<() => Promise<void>>> }[] = []
  const adapter = { create: vi.fn((_spec: unknown, observe: (event: PipedProcessEvent) => void) => {
    let released = false
    const close = vi.fn(async () => {
      observe({ type: 'exit', exitCode: 0 }); observe({ type: 'stdout-eof' }); observe({ type: 'stderr-eof' }); released = true
    })
    natives.push({ emit: observe, close })
    return { ownership: { mode: 'LEGACY_ROOT_OWNED' as const, rootPid: 12 }, settled: Promise.resolve(),
      close, isReleased: () => released }
  }) }
  const run = new RunService(authority, [{ kind: 'csharp-project', supports: target => target.relativePath.endsWith('.csproj'),
    prepare: () => spec, preparePlan }, new JavaScriptRunStrategy()], {
    adapter, manager, sourceGuard: guard, onEvent: (_owner, event) => events.push(event),
  })
  const waitProcesses = (count: number) => vi.waitFor(() => expect(natives).toHaveLength(count))
  const terminal = (state: string) => vi.waitFor(() => expect(events.filter(event => event.type === 'exit')).toMatchObject([
    { session: { state } },
  ]))
  const cleanup = async () => { await run.stop(); guard.stop(); disconnect(); expect(manager.size).toBe(0); expect(guard.size).toBe(0) }
  return { run, guard, models, document, controller, transport, authority, preparePlan, adapter, manager, natives,
    messages, events, waitProcesses, terminal, cleanup,
    noReplies: () => { respond = false },
    resumeReplies: () => { respond = true },
    switchProject: () => { activeProject = null; controller.activateProject(null) },
  }
}
afterEach(() => vi.useRealTimers())
describe('M1-09a Main/preload/retained-editor handshake integration', () => {
  it('saved source passes each checkpoint and retires the guard when execution begins', async () => {
    const h = setup(), save = vi.spyOn(h.models, 'createSaveSnapshot')
    await h.run.startPlannedRun(request, 7); await h.waitProcesses(1)
    h.natives[0].emit({ type: 'exit', exitCode: 0 }); await h.waitProcesses(2)
    expect(h.messages).toHaveLength(5)
    expect(new Set(h.messages.map(message => message.requestId)).size).toBe(5)
    expect(h.guard.size).toBe(0)
    h.document.model.setValue('edit while executing')
    expect(h.natives[1].close).not.toHaveBeenCalled()
    h.natives[1].emit({ type: 'exit', exitCode: 0 }); await h.terminal('EXITED')
    expect(save).not.toHaveBeenCalled(); await h.cleanup()
  })
  it.each(['dirty', 'conflict', 'missing', 'unknown'] as const)('%s source blocks preparation and all launches', async state => {
    const h = setup(), other = h.models.openDocument(projectId, 'references/Other.cs', 'saved', false)
    if (state === 'dirty') other.model.setValue('dirty')
    if (state === 'conflict') h.models.markExternalConflict(other.key)
    if (state === 'missing') h.models.markDiskMissing(other.key)
    if (state === 'unknown') h.controller.setAvailable(false)
    await h.run.startPlannedRun(request, 7); await h.terminal('FAILED')
    expect(h.authority.resolveRuntime).not.toHaveBeenCalled()
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.events.find(event => event.type === 'error')).toMatchObject({ error: { operation: 'run:source-guard' } })
    await h.cleanup()
  })
  it('no renderer response times out and never spawns', async () => {
    vi.useFakeTimers()
    const h = setup(); h.noReplies()
    await h.run.startPlannedRun(request, 7)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(h.events.filter(event => event.type === 'exit')).toMatchObject([{ session: { state: 'FAILED' } }])
    expect(h.events.find(event => event.type === 'error')).toMatchObject({ error: { details: { reason: 'SOURCE_GUARD_TIMEOUT' } } })
    expect(h.adapter.create).not.toHaveBeenCalled(); await h.cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['Stop', 'project', 'owner', 'shutdown'] as const)('%s cancels a pending handshake', async action => {
    const h = setup(); h.noReplies()
    const session = await h.run.startPlannedRun(request, 7)
    await (action === 'Stop' ? h.run.stopRun(session.sessionId, 7)
      : action === 'project' ? h.run.stopProject(projectId) : action === 'owner' ? h.run.stopOwner(7) : h.run.stop())
    expect(h.run.getSession(session.sessionId, 7).state).toBe('CANCELLED')
    expect(h.guard.size).toBe(0)
    expect(h.adapter.create).not.toHaveBeenCalled(); await h.cleanup()
  })
  it('edit and immediate manual Save during build invalidate the old revision and prevent execution', async () => {
    const h = setup(); await h.run.startPlannedRun(request, 7); await h.waitProcesses(1)
    h.document.model.setValue('edited')
    h.models.acceptSave(h.models.createSaveSnapshot(h.document.key)!)
    await h.terminal('FAILED')
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.natives[0].close).toHaveBeenCalledTimes(1)
    expect(h.models.getSourceState(projectId).dirty).toBe(false)
    await h.cleanup()
  })
  it('edit while strategy preparation awaits prevents build', async () => {
    const h = setup()
    let complete!: (plan: RunExecutionPlan) => void
    h.preparePlan.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await h.run.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(h.preparePlan).toHaveBeenCalledTimes(1))
    h.document.model.setValue('new edit'); await h.terminal('FAILED')
    complete({ steps: [] })
    expect(h.adapter.create).not.toHaveBeenCalled(); await h.cleanup()
  })
  it('a missed invalidation is caught by the next handshake revision check', async () => {
    const h = setup(); await h.run.startPlannedRun(request, 7); await h.waitProcesses(1)
    // Simulate dropped unsolicited invalidation only; checkpoint replies still use real bridge.
    h.transport.invoke.mockImplementationOnce(async () => ({ ok: true, value: null }))
    h.transport.invoke.mockImplementationOnce(async () => ({ ok: true, value: null }))
    h.document.model.setValue('edited and saved')
    h.models.acceptSave(h.models.createSaveSnapshot(h.document.key)!)
    h.natives[0].emit({ type: 'exit', exitCode: 0 }); await h.terminal('FAILED')
    expect(h.events.find(event => event.type === 'error')).toMatchObject({ error: { details: { reason: 'SOURCE_CHANGED' } } })
    expect(h.adapter.create).toHaveBeenCalledTimes(1); await h.cleanup()
  })
  it('project change invalidates an approved build, while stale old replies cannot approve a re-run', async () => {
    const h = setup(); await h.run.startPlannedRun(request, 7); await h.waitProcesses(1)
    const old = h.messages.at(-1)!
    h.switchProject(); await h.terminal('FAILED')
    expect(() => h.guard.receive({ ...old, revision: 1, dirty: false, conflict: false }, 7)).toThrow()
    expect(h.adapter.create).toHaveBeenCalledTimes(1); await h.cleanup()
  })
  it('retains failed build cleanup after source invalidation and blocks replacement', async () => {
    const h = setup(), session = await h.run.startPlannedRun(request, 7); await h.waitProcesses(1)
    const original = h.natives[0].close.getMockImplementation()!
    h.natives[0].close.mockRejectedValue(new Error('private retained process'))
    h.document.model.setValue('dirty')
    await vi.waitFor(() => expect(h.run.getSession(session.sessionId, 7).state).toBe('STOPPING'))
    await expect(h.run.startPlannedRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1); expect(h.adapter.create).toHaveBeenCalledTimes(1)
    h.natives[0].close.mockImplementation(original); await h.cleanup()
  })
  it('JavaScript start ignores C# source guards and retains its existing single-step behavior', async () => {
    const h = setup(); h.noReplies(); h.document.model.setValue('dirty C#')
    const session = await h.run.startRun({ projectId, relativePath: 'main.js', dirty: false }, 7)
    expect(session.state).toBe('RUNNING'); expect(h.messages).toHaveLength(0)
    await h.run.stopRun(session.sessionId, 7); await h.cleanup()
  })
  it('C# fails closed if no source guard was configured', async () => {
    const events: RunEvent[] = [], manager = new ProcessManager(), create = vi.fn()
    const run = new RunService({ authorize: async target => ({ ...target, canonicalRoot: 'C:\\project', canonicalFile: 'C:\\project\\App.csproj' }),
      resolveRuntime: vi.fn() }, [{ kind: 'csharp-project', supports: () => true, prepare: vi.fn() }],
    { adapter: { create }, manager, onEvent: (_owner, event) => events.push(event) })
    const session = await run.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(run.getSession(session.sessionId, 7).state).toBe('FAILED'))
    expect(create).not.toHaveBeenCalled()
    expect(events.find(event => event.type === 'error')).toMatchObject({ error: { details: { reason: 'SOURCE_STATE_UNKNOWN' } } })
    await run.stop()
  })

  it('re-run cancels the pending guard and rejects responses from the old session', async () => {
    const h = setup(); h.noReplies()
    const first = await h.run.startPlannedRun(request, 7), old = h.messages[0]
    h.resumeReplies()
    const second = await h.run.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    expect(h.run.getSession(first.sessionId, 7).state).toBe('CANCELLED')
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(() => h.guard.receive({ ...old, revision: 1, dirty: false, conflict: false }, 7)).toThrow()
    expect(h.run.getSession(second.sessionId, 7).state).toBe('RUNNING')
    await h.cleanup()
  })
})
