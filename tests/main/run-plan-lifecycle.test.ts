import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import type { RunExecutionPlan, RunPreparationContext, RunStrategy } from '../../src/main/services/run/run-strategy'
import type { PipedProcessEvent, PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'
import type { ProjectId, RunEvent, RunExecutionPhase, SemanticStartRunRequest } from '../../src/shared/contracts'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request: SemanticStartRunRequest = { kind: 'csharp-project', projectId, relativePath: 'App.csproj', dirty: false }
const spec = (arg: string) => ({ executable: 'C:\\sdk\\dotnet.exe', args: [arg],
  cwd: 'C:\\project', shell: false as const, environmentAdditions: {} })
const plan = (): RunExecutionPlan => ({ steps: [
  { phase: 'BUILD_RESTORE', execution: spec('build-fixture') },
  { phase: 'EXECUTING', execution: spec('execute-fixture') },
] })

function setup() {
  const events: RunEvent[] = [], phases: RunExecutionPhase[] = []
  const manager = new ProcessManager()
  let context: RunPreparationContext | undefined
  const authority = {
    authorize: vi.fn(async (target: { projectId: ProjectId; relativePath: string }) => ({ ...target,
      canonicalRoot: 'C:\\project', canonicalFile: win32.join('C:\\project', target.relativePath) })),
    resolveRuntime: vi.fn(async (value: { strategyKind?: string; preparation?: RunPreparationContext }) => {
      context = value.preparation
      return { executable: value.strategyKind === 'javascript-file' ? 'C:\\node\\node.exe' : 'C:\\sdk\\dotnet.exe' }
    }),
  }
  const preparePlan = vi.fn(async () => plan())
  const strategy: RunStrategy = { kind: 'csharp-project', supports: target => /\.csproj$/i.test(target.relativePath),
    prepare: () => spec('unused'), preparePlan }
  const natives: ReturnType<typeof fake>[] = []
  function fake(observe: (event: PipedProcessEvent) => void) {
    const root = deferred(), stdout = deferred(), stderr = deferred(), tree = deferred(), release = deferred()
    const closing = deferred()
    let released = false, exit = false, automatic = true
    const emit = (event: PipedProcessEvent) => {
      observe(event)
      if (event.type === 'exit') { exit = true; root.resolve() }
      if (event.type === 'stdout-eof') stdout.resolve()
      if (event.type === 'stderr-eof') stderr.resolve()
    }
    const finish = (code = 0) => {
      if (!exit) emit({ type: 'exit', exitCode: code })
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' })
      tree.resolve(); release.resolve()
    }
    const close = vi.fn(async () => {
      closing.resolve()
      if (automatic) finish()
      await Promise.all([root.promise, stdout.promise, stderr.promise, tree.promise, release.promise])
      released = true
    })
    const process: PipedRunProcess = { ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 123 },
      settled: Promise.all([root.promise, stdout.promise, stderr.promise]).then(() => undefined),
      close, isReleased: () => released }
    return { emit, finish, close, closing, root, stdout, stderr, tree, release, process,
      manual: () => { automatic = false } }
  }
  const adapter = { create: vi.fn((_execution: unknown, observe: (event: PipedProcessEvent) => void) => {
    expect(manager.size).toBeGreaterThan(0)
    const native = fake(observe); natives.push(native); return native.process
  }) }
  const onPhase = vi.fn((_owner: number, _session: unknown, phase: RunExecutionPhase) => { phases.push(phase) })
  const service = new RunService(authority, [strategy, new JavaScriptRunStrategy()], {
    adapter, manager, onEvent: (_owner, event) => events.push(event), onPhase,
  })
  const waitProcesses = (count: number) => vi.waitFor(() => expect(natives).toHaveLength(count))
  const terminal = () => vi.waitFor(() => expect(events.filter(event => event.type === 'exit')).toHaveLength(1))
  return { service, authority, preparePlan, adapter, natives, events, phases, manager, onPhase,
    context: () => context!, waitProcesses, terminal }
}

describe('M1-08 owned execution plans', () => {
  it('returns STARTING before an unbounded preparation completes; Stop aborts without waiting', async () => {
    const h = setup(), gate = deferred<{ executable: string }>()
    h.authority.resolveRuntime.mockImplementationOnce(async value => {
      const context = value.preparation!
      context.signal.addEventListener('abort', () => {})
      return gate.promise
    })
    const session = await h.service.startPlannedRun(request, 7)
    expect(session.state).toBe('STARTING')
    await h.service.stopRun(session.sessionId, 7)
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
    gate.resolve({ executable: 'C:\\sdk\\dotnet.exe' })
    await Promise.resolve()
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
  })

  it('cleans owned preparation resources on Stop and rejects late registrations', async () => {
    const h = setup(), gate = deferred<{ executable: string }>(), entered = deferred()
    const close = vi.fn(async () => {})
    let captured!: RunPreparationContext
    h.authority.resolveRuntime.mockImplementationOnce(async value => {
      captured = value.preparation!; captured.registerResource(close); entered.resolve()
      return gate.promise
    })
    const session = await h.service.startPlannedRun(request, 7)
    await entered.promise
    await h.service.stopRun(session.sessionId, 7)
    expect(captured.signal.aborted).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(() => captured.registerResource(close)).toThrow()
    expect(h.manager.size).toBe(0)
    gate.resolve({ executable: 'C:\\sdk\\dotnet.exe' })
  })

  it('retains failed preparation cleanup and blocks replacement until retry succeeds', async () => {
    const h = setup(), gate = deferred<{ executable: string }>()
    const close = vi.fn(async (): Promise<void> => { throw new Error('private cleanup') })
    h.authority.resolveRuntime.mockImplementationOnce(async value => {
      value.preparation!.registerResource(close); return gate.promise
    })
    const session = await h.service.startPlannedRun(request, 7)
    await expect(h.service.stopRun(session.sessionId, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    await expect(h.service.startPlannedRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1)
    expect(h.adapter.create).not.toHaveBeenCalled()
    close.mockImplementation(async () => {})
    await h.service.stopRun(session.sessionId, 7)
    expect(h.manager.size).toBe(0)
    gate.resolve({ executable: 'C:\\sdk\\dotnet.exe' })
  })

  it('executes build then execution under one identity, with intermediate exit suppressed', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    h.natives[0].finish()
    await h.waitProcesses(2)
    expect(h.natives[0].process.isReleased()).toBe(true)
    expect(h.events.filter(event => event.type === 'exit')).toHaveLength(0)
    expect(h.phases).toEqual(['PREPARING', 'BUILD_RESTORE', 'EXECUTING'])
    expect(h.adapter.create.mock.calls.map(([execution]) => execution)).toEqual([spec('build-fixture'), spec('execute-fixture')])
    h.natives[0].emit({ type: 'stdout', data: 'stale build' })
    h.natives[0].emit({ type: 'error', message: 'stale failure' })
    h.natives[1].emit({ type: 'stdout', data: 'execution' })
    h.natives[1].finish()
    await h.terminal(); await h.service.stop()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('EXITED')
    expect(h.events.every(event => event.session.sessionId === session.sessionId)).toBe(true)
    expect(h.events.filter(event => event.type === 'stdout')).toMatchObject([{ data: 'execution' }])
    expect(h.events.filter(event => event.type === 'error')).toHaveLength(0)
    expect(h.manager.size).toBe(0)
    expect(h.natives.every(native => native.process.isReleased())).toBe(true)
  })

  it.each([1, 17])('build exit %s prevents execution and finalizes once', async code => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1); h.natives[0].finish(code)
    await h.terminal(); await h.service.stop()
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.service.getSession(session.sessionId, 7).state).toBe('FAILED')
    expect(h.events.filter(event => event.type === 'exit')).toMatchObject([{ exitCode: code }])
  })

  it.each(['BUILD_RESTORE', 'EXECUTING'] as const)('Stop during %s prevents later launches', async phase => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    if (phase === 'EXECUTING') { h.natives[0].finish(); await h.waitProcesses(2) }
    await Promise.all([h.service.stopRun(session.sessionId, 7), h.service.stopRun(session.sessionId, 7)])
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
    expect(h.adapter.create).toHaveBeenCalledTimes(phase === 'EXECUTING' ? 2 : 1)
    expect(h.events.filter(event => event.type === 'exit')).toHaveLength(1)
    expect(h.manager.size).toBe(0)
  })

  it('awaits tree, root, both EOFs and native release before execution', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    const native = h.natives[0]; native.manual(); native.emit({ type: 'exit', exitCode: 0 })
    await native.closing.promise
    for (const action of [() => native.tree.resolve(), () => native.emit({ type: 'stdout-eof' }),
      () => native.emit({ type: 'stderr-eof' })]) {
      action(); await Promise.resolve(); expect(h.adapter.create).toHaveBeenCalledTimes(1)
    }
    native.release.resolve(); await h.waitProcesses(2)
    await h.service.stopRun(session.sessionId, 7)
    expect(h.manager.size).toBe(0)
  })

  it('Stop in the gap aborts revalidation and never creates the execution process', async () => {
    const h = setup(), gate = deferred<{ executable: string }>(), entered = deferred()
    const session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    h.authority.resolveRuntime.mockImplementationOnce(async () => { entered.resolve(); return gate.promise })
    h.natives[0].finish(); await entered.promise
    const count = h.events.length
    h.natives[0].emit({ type: 'error', message: 'stale gap error' })
    expect(h.events).toHaveLength(count)
    await h.service.stopRun(session.sessionId, 7)
    gate.resolve({ executable: 'C:\\sdk\\dotnet.exe' })
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
  })

  it('Stop from the execute phase observer prevents synchronous creation', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    let stop: Promise<void> | undefined
    h.onPhase.mockImplementation((_owner, _session, phase) => {
      if (phase === 'EXECUTING') stop = h.service.stopRun(session.sessionId, 7)
    })
    h.natives[0].finish(); await h.terminal(); await stop
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
  })

  it.each(['project', 'owner', 'shutdown'] as const)('%s cleanup cancels preparation and stale async work', async scope => {
    const h = setup(), gate = deferred<{ executable: string }>()
    h.authority.resolveRuntime.mockImplementationOnce(async () => gate.promise)
    const session = await h.service.startPlannedRun(request, 7)
    await (scope === 'project' ? h.service.stopProject(projectId)
      : scope === 'owner' ? h.service.stopOwner(7) : h.service.stop())
    gate.resolve({ executable: 'C:\\sdk\\dotnet.exe' })
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
  })

  it.each(['project', 'shutdown'] as const)('%s remains fail-closed on retained build cleanup', async scope => {
    const h = setup(); await h.service.startPlannedRun(request, 7); await h.waitProcesses(1)
    const original = h.natives[0].close.getMockImplementation()!
    h.natives[0].close.mockRejectedValue(new Error('private retained Job'))
    await expect(scope === 'project' ? h.service.stopProject(projectId) : h.service.stop()).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1)
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.events)).not.toContain('private retained')
    h.natives[0].close.mockImplementation(original)
    await h.service.stop()
    expect(h.manager.size).toBe(0)
  })

  it('retains natural-exit cleanup failure without automatically retrying or advancing', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    const original = h.natives[0].close.getMockImplementation()!
    h.natives[0].close.mockRejectedValue(new Error('private cleanup'))
    h.natives[0].finish()
    await vi.waitFor(() => expect(h.service.getSession(session.sessionId, 7).state).toBe('STOPPING'))
    expect(h.natives[0].close).toHaveBeenCalledTimes(1)
    expect(h.events.filter(event => event.type === 'exit')).toHaveLength(0)
    expect(h.manager.size).toBe(1)
    const next = h.service.startPlannedRun(request, 7)
    await expect(next).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    h.natives[0].close.mockImplementation(original)
    await h.service.stopRun(session.sessionId, 7)
  })

  it('serializes re-run cleanup and rejects replacement by another owner', async () => {
    const h = setup(), first = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    await expect(h.service.startPlannedRun(request, 8)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(h.service.stopRun(first.sessionId, 8)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    const second = await h.service.startPlannedRun(request, 7)
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(h.service.getSession(first.sessionId, 7).state).toBe('CANCELLED')
    await h.waitProcesses(2); await h.service.stop()
  })

  it.each(['identity', 'fingerprint', 'missing'] as const)('rejects %s drift before the second launch', async change => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    if (change === 'identity') h.authority.authorize.mockResolvedValue({ projectId, relativePath: 'App.csproj',
      canonicalRoot: 'C:\\project', canonicalFile: 'C:\\project\\Other.csproj' })
    if (change === 'missing') h.authority.authorize.mockRejectedValue(new Error('private disappeared file'))
    if (change === 'fingerprint') h.preparePlan.mockResolvedValue({ steps: [
      { phase: 'BUILD_RESTORE', execution: spec('changed') }, { phase: 'EXECUTING', execution: spec('execute-fixture') },
    ] })
    h.natives[0].finish(); await h.terminal()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('FAILED')
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.manager.size).toBe(0)
  })

  it('fails on observation error, suppresses execution and safely releases ownership', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1); h.natives[0].emit({ type: 'error', message: 'raw provider log' })
    await h.terminal()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('FAILED')
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.events)).not.toContain('raw provider log')
    expect(h.manager.size).toBe(0)
  })

  it('rejects outside-root authority and malformed plan before native creation', async () => {
    const h = setup()
    h.authority.authorize.mockResolvedValueOnce({ projectId, relativePath: 'App.csproj',
      canonicalRoot: 'C:\\project', canonicalFile: 'C:\\outside\\App.csproj' })
    await expect(h.service.startPlannedRun(request, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    h.preparePlan.mockResolvedValue({ steps: [{ phase: 'EXECUTING', execution: spec('wrong-shape') }] })
    const session = await h.service.startPlannedRun(request, 7); await h.terminal()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('FAILED')
    expect(h.adapter.create).not.toHaveBeenCalled()
  })

  it('keeps the JavaScript one-step plan free of build phase and finalizes once', async () => {
    const h = setup(), session = await h.service.startPlannedRun({ ...request,
      kind: 'javascript-file', relativePath: 'main.js' }, 7)
    await h.waitProcesses(1); h.natives[0].finish(); await h.terminal()
    expect(h.phases).toEqual(['PREPARING', 'EXECUTING'])
    expect(h.service.getSession(session.sessionId, 7).state).toBe('EXITED')
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.manager.size).toBe(0)
  })

  it('cancels asynchronous strategy preparation, preserving the immutable plan snapshot', async () => {
    const h = setup(), gate = deferred<RunExecutionPlan>()
    h.preparePlan.mockImplementationOnce(async () => gate.promise)
    const session = await h.service.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(h.preparePlan).toHaveBeenCalledTimes(1))
    await h.service.stopRun(session.sessionId, 7)
    gate.resolve(plan())
    expect(h.context().signal.aborted).toBe(true)
    expect(h.adapter.create).not.toHaveBeenCalled()
  })

  it('serializes simultaneous duplicates, stopping the first session before the second builds', async () => {
    const h = setup()
    const [first, second] = await Promise.all([
      h.service.startPlannedRun(request, 7), h.service.startPlannedRun(request, 7),
    ])
    expect(first.sessionId).not.toBe(second.sessionId)
    expect(h.service.getSession(first.sessionId, 7).state).toBe('CANCELLED')
    await vi.waitFor(() => expect(h.phases.at(-1)).toBe('BUILD_RESTORE'))
    expect(h.manager.size).toBe(1)
    await h.service.stop()
    expect(h.manager.size).toBe(0)
  })

  it('rejects a stale initial authorization after a project transition lease', async () => {
    const h = setup(), gate = deferred(), entered = deferred()
    const original = h.authority.authorize.getMockImplementation()!
    h.authority.authorize.mockImplementationOnce(async target => {
      entered.resolve(); await gate.promise; return original(target)
    })
    const start = h.service.startPlannedRun(request, 7)
    const rejected = expect(start).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    await entered.promise
    const release = h.service.suspendProject(projectId)
    gate.resolve(); await rejected; release()
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.events).toHaveLength(0)
  })

  it.each(['BUILD_RESTORE', 'EXECUTING'] as const)('spawn failure during %s releases registration', async phase => {
    const h = setup()
    if (phase === 'BUILD_RESTORE') h.adapter.create.mockImplementationOnce(() => { throw new Error('private spawn') })
    const session = await h.service.startPlannedRun(request, 7)
    if (phase === 'EXECUTING') {
      await h.waitProcesses(1)
      h.adapter.create.mockImplementationOnce(() => { throw new Error('private spawn') })
      h.natives[0].finish()
    }
    await h.terminal()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('FAILED')
    expect(h.manager.size).toBe(0)
    expect(JSON.stringify(h.events)).not.toContain('private spawn')
  })

  it('keeps canonical target concurrency and project isolation', async () => {
    const h = setup()
    const sessions = await Promise.all([
      h.service.startPlannedRun(request, 7),
      h.service.startPlannedRun({ ...request, relativePath: 'Other.csproj' }, 7),
      h.service.startPlannedRun({ ...request, projectId: 'project_abcdef123456789012345678' as ProjectId }, 7),
    ])
    await h.waitProcesses(3)
    expect(new Set(sessions.map(session => session.sessionId)).size).toBe(3)
    await h.service.stopProject(projectId)
    expect(h.service.getSession(sessions[2].sessionId, 7).state).toBe('RUNNING')
    expect(h.manager.size).toBe(1)
    await h.service.stop()
  })

  it('retains ownership when close reports missing EOF/native release', async () => {
    const h = setup(), session = await h.service.startPlannedRun(request, 7)
    await h.waitProcesses(1)
    const original = h.natives[0].close.getMockImplementation()!
    h.natives[0].close.mockImplementation(async () => {})
    h.natives[0].emit({ type: 'exit', exitCode: 0 })
    await vi.waitFor(() => expect(h.service.getSession(session.sessionId, 7).state).toBe('STOPPING'))
    expect(h.manager.size).toBe(1)
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    h.natives[0].close.mockImplementation(original)
    await h.service.stopRun(session.sessionId, 7)
    expect(h.manager.size).toBe(0)
  })
})
