import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { DomainError } from '../../src/main/errors/app-error'
import { isRunSessionId, validateRunEvent, type RunEvent, type RunSessionId,
  type StartRunRequest } from '../../src/shared/contracts/run'
import type { ProjectId } from '../../src/shared/contracts'
import type { PipedProcessEvent, PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request: StartRunRequest = { projectId, relativePath: 'main.js', dirty: false }

function setup() {
  const events: RunEvent[] = []
  const waiters = new Set<(event: RunEvent) => void>()
  const manager = new ProcessManager()
  const authority = {
    authorize: vi.fn(async (target: StartRunRequest) => ({ projectId: target.projectId,
      relativePath: target.relativePath, canonicalRoot: 'C:\\project',
      canonicalFile: win32.join('C:\\project', target.relativePath) })),
    resolveRuntime: vi.fn(async () => ({ executable: 'C:\\node\\node.exe' })),
  }
  let automatic = true
  function createFake(observe: (event: PipedProcessEvent) => void) {
    const root = deferred(), out = deferred(), err = deferred(), tree = deferred(), release = deferred()
    const closing = deferred()
    let released = false
    const emit = (event: PipedProcessEvent) => {
      observe(event)
      if (event.type === 'exit') root.resolve()
      if (event.type === 'stdout-eof') out.resolve()
      if (event.type === 'stderr-eof') err.resolve()
    }
    const complete = () => {
      emit({ type: 'exit', exitCode: 0 })
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' })
      tree.resolve(); release.resolve()
    }
    const close = vi.fn(async () => {
      closing.resolve()
      if (automatic) complete()
      await Promise.all([tree.promise, root.promise, out.promise, err.promise, release.promise])
      released = true
    })
    const process: PipedRunProcess = { ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 123 },
      settled: Promise.all([root.promise, out.promise, err.promise]).then(() => undefined),
      close, isReleased: () => released }
    return { process, emit, complete, close, closing, root, out, err, tree, release }
  }
  const processes: ReturnType<typeof createFake>[] = []
  const adapter = { create: vi.fn((_run: unknown, observe: (event: PipedProcessEvent) => void) => {
    expect(manager.size).toBeGreaterThan(0)
    const native = createFake(observe)
    processes.push(native)
    return native.process
  }) }
  const sink = vi.fn((owner: number, event: RunEvent) => {
    expect(owner).toBe(7)
    expect(validateRunEvent(event).ok).toBe(true)
    events.push(event)
    for (const waiter of waiters) waiter(event)
  })
  const service = new RunService(authority, { adapter, manager, onEvent: sink })
  function waitFor(predicate: (event: RunEvent) => boolean): Promise<RunEvent> {
    const existing = events.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => {
      const listener = (event: RunEvent) => {
        if (predicate(event)) { waiters.delete(listener); resolve(event) }
      }
      waiters.add(listener)
    })
  }
  const terminal = (id: RunSessionId) => waitFor((event) => event.type === 'exit' && event.session.sessionId === id)
  return { service, manager, authority, adapter, processes, events, sink, waitFor, terminal,
    manual: () => { automatic = false } }
}

describe('Phase 4C start and exit lifecycle', () => {
  it('4E owner invalidation mutes events, waits for native cleanup, and permits a fresh renderer generation', async () => {
    const h = setup(); h.manual()
    await h.service.startRun(request, 7)
    const cleanup = h.service.stopOwner(7)
    await h.processes[0].closing.promise
    const count = h.events.length
    h.processes[0].emit({ type: 'stdout', data: 'late renderer output' })
    expect(h.events).toHaveLength(count)
    expect(h.manager.size).toBe(1)
    h.processes[0].complete(); await cleanup
    expect(h.manager.size).toBe(0)
    const fresh = await h.service.startRun(request, 7)
    expect(fresh.state).toBe('RUNNING')
    h.processes[1].complete(); await h.service.stop()
  })
  it('4E owner invalidation cancels a pending start before native creation', async () => {
    const h = setup(), entered = deferred(), gate = deferred()
    const authorize = h.authority.authorize.getMockImplementation()!
    h.authority.authorize.mockImplementationOnce(async (target) => {
      entered.resolve(); await gate.promise; return authorize(target)
    })
    const start = h.service.startRun(request, 7)
    const rejected = expect(start).rejects.toThrow(/unavailable/)
    await entered.promise
    const cleanup = h.service.stopOwner(7)
    gate.resolve(); await rejected; await cleanup
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
  })
  it('4E owner cleanup is scoped and retains failed cleanup for shutdown retry', async () => {
    const h = setup()
    await h.service.startRun(request, 7)
    await h.service.stopOwner(8)
    expect(h.manager.size).toBe(1)
    h.processes[0].close.mockRejectedValueOnce(new Error('private cleanup'))
    await expect(h.service.stopOwner(7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1)
    await h.service.stop()
    expect(h.manager.size).toBe(0)
  })
  it('starts a saved JS target with opaque identity, registered ownership and immutable states', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    expect(isRunSessionId(run.sessionId)).toBe(true)
    expect(run.state).toBe('RUNNING')
    expect(h.manager.size).toBe(1)
    expect(h.events.map((event) => event.session.state)).toEqual(['STARTING', 'RUNNING'])
    expect(h.events[0].session.state).toBe('STARTING')
    expect(Object.isFrozen(run)).toBe(true)
    await h.service.stopRun(run.sessionId, 7)
  })
  it.each([0, 7])('finalizes exit %s once, preserving stream identity/order and scoped exit code', async (exitCode) => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    const native = h.processes[0]
    native.emit({ type: 'stdout', data: 'one' })
    native.emit({ type: 'stderr', data: 'two' })
    native.emit({ type: 'stdout', data: 'three' })
    native.emit({ type: 'exit', exitCode })
    await h.terminal(run.sessionId)
    await h.manager.stop()
    expect(h.events.flatMap((event) => event.type === 'stdout' || event.type === 'stderr'
      ? [[event.type, event.data]] : [])).toEqual([['stdout', 'one'], ['stderr', 'two'], ['stdout', 'three']])
    expect(h.service.getSession(run.sessionId, 7).state).toBe(exitCode === 0 ? 'EXITED' : 'FAILED')
    expect(h.events.filter((event) => event.type === 'exit')).toEqual([
      { type: 'exit', session: h.service.getSession(run.sessionId, 7), exitCode },
    ])
    expect(h.manager.size).toBe(0)
    expect(native.process.isReleased()).toBe(true)
    native.emit({ type: 'exit', exitCode: 99 })
    await h.service.stopRun(run.sessionId, 7)
    expect(native.close).toHaveBeenCalledTimes(1)
    expect(h.events.filter((event) => event.type === 'exit')).toHaveLength(1)
  })
  it.each([
    { ...request, dirty: true }, { ...request, relativePath: 'x.ts' },
    { ...request, relativePath: '../escape.js' }, { ...request, executable: 'cmd.exe' },
  ])('rejects invalid/dirty/unsupported input before spawning: %j', async (target) => {
    const h = setup()
    await expect(h.service.startRun(target, 7)).rejects.toBeInstanceOf(DomainError)
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
  })
  it('reports missing runtime safely, creates no session, and permits retry', async () => {
    const h = setup()
    h.authority.resolveRuntime.mockRejectedValueOnce(new DomainError({ code: 'DEPENDENCY_MISSING',
      message: 'Node.js was not found on PATH.', retryable: true }))
    await expect(h.service.startRun(request, 7)).rejects.toMatchObject({ code: 'DEPENDENCY_MISSING' })
    expect(h.events).toEqual([])
    const run = await h.service.startRun(request, 7)
    await h.service.stopRun(run.sessionId, 7)
  })
  it('reports spawn failure safely and finalizes FAILED once with null exit', async () => {
    const h = setup()
    h.adapter.create.mockImplementationOnce(() => { throw new Error('private path and stack') })
    await expect(h.service.startRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(JSON.stringify(h.events)).not.toContain('private path')
    expect(h.events.filter((event) => event.type === 'error')).toHaveLength(1)
    expect(h.sink.mock.calls.every(([, event]) => validateRunEvent(event).ok)).toBe(true)
    expect(h.events.filter((event) => event.type === 'exit')).toMatchObject([{ exitCode: null, session: { state: 'FAILED' } }])
    expect(h.manager.size).toBe(0)
    const next = await h.service.startRun(request, 7)
    await h.service.stopRun(next.sessionId, 7)
  })
  it('revalidates authority before spawn and releases a failed preparation', async () => {
    const h = setup()
    h.authority.authorize.mockImplementationOnce(async (target) => ({ ...target,
      canonicalRoot: 'C:\\project', canonicalFile: 'C:\\project\\main.js' }))
    h.authority.authorize.mockImplementationOnce(async (target) => ({ ...target,
      canonicalRoot: 'C:\\project', canonicalFile: 'C:\\project\\main.js' }))
    h.authority.authorize.mockRejectedValueOnce(new Error('private missing target'))
    await expect(h.service.startRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(0)
    expect(h.adapter.create).not.toHaveBeenCalled()
    const next = await h.service.startRun(request, 7)
    await h.service.stopRun(next.sessionId, 7)
  })
})

describe('Phase 4C Stop and cleanup ownership', () => {
  it('awaits tree, root, stdout EOF, stderr EOF and native release; duplicate Stop shares cleanup', async () => {
    const h = setup(); h.manual()
    const run = await h.service.startRun(request, 7)
    const native = h.processes[0]
    let done = false
    const stop = h.service.stopRun(run.sessionId, 7).then(() => { done = true })
    const duplicate = h.service.stopRun(run.sessionId, 7)
    await native.closing.promise
    expect(h.service.getSession(run.sessionId, 7).state).toBe('STOPPING')
    for (const action of [() => native.tree.resolve(),
      () => native.emit({ type: 'exit', exitCode: 1 }),
      () => native.emit({ type: 'stdout-eof' }), () => native.emit({ type: 'stderr-eof' })]) {
      action()
      await Promise.resolve()
      expect(done).toBe(false)
      expect(h.manager.size).toBe(1)
      expect(h.events.filter((event) => event.type === 'exit')).toHaveLength(0)
    }
    native.release.resolve()
    await Promise.all([stop, duplicate])
    expect(h.service.getSession(run.sessionId, 7).state).toBe('CANCELLED')
    expect(native.close).toHaveBeenCalledTimes(1)
    expect(native.process.isReleased()).toBe(true)
    expect(h.manager.size).toBe(0)
    expect(h.events.filter((event) => event.type === 'state').map((event) => event.session.state))
      .toEqual(['STARTING', 'RUNNING', 'STOPPING', 'CANCELLED'])
  })
  it('keeps STOPPING and ProcessManager ownership on cleanup failure, then retries explicitly', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    const native = h.processes[0]
    native.close.mockRejectedValueOnce(new Error('secret native error'))
    await expect(h.service.stopRun(run.sessionId, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED', retryable: true })
    expect(h.service.getSession(run.sessionId, 7).state).toBe('STOPPING')
    expect(h.manager.size).toBe(1)
    expect(h.events.filter((event) => event.type === 'exit')).toHaveLength(0)
    expect(JSON.stringify(h.events)).not.toContain('secret')
    expect(h.events.filter((event) => event.type === 'error')).toHaveLength(1)
    await h.service.stopRun(run.sessionId, 7)
    expect(native.close).toHaveBeenCalledTimes(2)
    expect(h.manager.size).toBe(0)
  })
  it('ProcessManager callback awaits finalization and preserves retry semantics unchanged', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    h.processes[0].close.mockRejectedValueOnce(new Error('failed'))
    await expect(h.manager.stop()).rejects.toThrow('Owned resource cleanup failed')
    expect(h.manager.size).toBe(1)
    await h.manager.stop()
    expect(h.manager.size).toBe(0)
    expect(h.service.getSession(run.sessionId, 7).state).toBe('EXITED')
    expect(h.events.filter((event) => event.type === 'exit')).toHaveLength(1)
  })
  it('does not finalize if the adapter returns without native release', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    h.processes[0].close.mockResolvedValueOnce(undefined)
    await expect(h.service.stopRun(run.sessionId, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1)
    expect(h.service.getSession(run.sessionId, 7).state).toBe('STOPPING')
    await h.service.stopRun(run.sessionId, 7)
  })
  it('rejects another owner and invalid session IDs without touching an active run', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    await expect(h.service.stopRun(run.sessionId, 8)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(h.service.stopRun('wrong' as RunSessionId, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(h.service.startRun(request, 8)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(h.processes[0].close).not.toHaveBeenCalled()
    await h.service.stopRun(run.sessionId, 7)
    await expect(h.service.stopRun(run.sessionId, 8)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
  it('stops a STARTING session safely while authority is pending', async () => {
    const h = setup()
    const gate = deferred()
    const original = h.authority.authorize.getMockImplementation()!
    h.authority.authorize.mockImplementation(async (target) => {
      if (h.events.some((event) => event.session.state === 'STARTING')) await gate.promise
      return original(target)
    })
    const start = h.service.startRun(request, 7)
    const starting = await h.waitFor((event) => event.session.state === 'STARTING')
    const stop = h.service.stopRun(starting.session.sessionId, 7)
    gate.resolve()
    await Promise.all([start, stop])
    expect(h.manager.size).toBe(0)
    expect(h.service.getSession(starting.session.sessionId, 7).state).toBe('CANCELLED')
    expect(h.processes[0].close).toHaveBeenCalledTimes(1)
  })
})

describe('Phase 4C re-run, concurrency and stale protection', () => {
  it('fully cleans A before B is created and rejects every late A event', async () => {
    const h = setup(); h.manual()
    const a = await h.service.startRun(request, 7)
    const native = h.processes[0]
    native.emit({ type: 'stdout', data: 'A output' })
    const replacement = h.service.startRun(request, 7)
    await native.closing.promise
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.manager.size).toBe(1)
    native.complete()
    const b = await replacement
    expect(a.sessionId).not.toBe(b.sessionId)
    expect(native.process.isReleased()).toBe(true)
    expect(h.manager.size).toBe(1)
    const count = h.events.length
    for (const event of [{ type: 'stdout', data: 'late' }, { type: 'stderr', data: 'late' },
      { type: 'exit', exitCode: 99 }, { type: 'error', message: 'late error' }] as PipedProcessEvent[]) native.emit(event)
    await h.service.stopRun(a.sessionId, 7)
    expect(h.events).toHaveLength(count)
    expect(h.service.getSession(b.sessionId, 7).state).toBe('RUNNING')
    expect(h.processes[1].close).not.toHaveBeenCalled()
    h.processes[1].complete()
    await h.service.stopRun(b.sessionId, 7)
  })
  it('blocks replacement on A cleanup failure and retains exact A ownership', async () => {
    const h = setup()
    const a = await h.service.startRun(request, 7)
    h.processes[0].close.mockRejectedValueOnce(new Error('cleanup failed'))
    await expect(h.service.startRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.adapter.create).toHaveBeenCalledTimes(1)
    expect(h.manager.size).toBe(1)
    expect(h.service.getSession(a.sessionId, 7).state).toBe('STOPPING')
    const b = await h.service.startRun(request, 7)
    expect(h.processes[0].process.isReleased()).toBe(true)
    await h.service.stopRun(b.sessionId, 7)
  })
  it('serializes simultaneous same-target starts, including case-insensitive canonical aliases', async () => {
    const h = setup()
    const runs = await Promise.all([h.service.startRun(request, 7),
      h.service.startRun({ ...request, relativePath: 'MAIN.js' }, 7), h.service.startRun(request, 7)])
    expect(new Set(runs.map((run) => run.sessionId)).size).toBe(3)
    expect(h.processes.slice(0, 2).every((native) => native.process.isReleased())).toBe(true)
    expect(h.manager.size).toBe(1)
    await h.service.stopRun(runs[2].sessionId, 7)
  })
  it('runs different targets concurrently and Stop affects only the exact session', async () => {
    const h = setup()
    const [a, b] = await Promise.all([h.service.startRun(request, 7),
      h.service.startRun({ ...request, relativePath: 'other.js' }, 7)])
    expect(h.manager.size).toBe(2)
    await h.service.stopRun(a.sessionId, 7)
    expect(h.manager.size).toBe(1)
    expect(h.service.getSession(b.sessionId, 7).state).toBe('RUNNING')
    await h.service.stopRun(b.sessionId, 7)
  })
  it('does not stop A for a dirty re-run request', async () => {
    const h = setup()
    const a = await h.service.startRun(request, 7)
    await expect(h.service.startRun({ ...request, dirty: true }, 7)).rejects.toThrow(/Save/)
    expect(h.processes[0].close).not.toHaveBeenCalled()
    await h.service.stopRun(a.sessionId, 7)
  })
  it('turns observation failure into safe FAILED finalization after resource cleanup', async () => {
    const h = setup()
    const run = await h.service.startRun(request, 7)
    h.processes[0].emit({ type: 'error', message: 'private native error' })
    await h.terminal(run.sessionId)
    await h.manager.stop()
    expect(h.service.getSession(run.sessionId, 7).state).toBe('FAILED')
    expect(JSON.stringify(h.events)).not.toContain('private native')
    expect(h.manager.size).toBe(0)
  })
})
