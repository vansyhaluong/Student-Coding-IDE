import { describe, expect, it, vi } from 'vitest'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import { RunService } from '../../src/main/services/run/run-service'
import { IpcHandlerRegistry, type IpcInvokeEventLike } from '../../src/main/ipc/ipc-handler-registry'
import { RunIpcService } from '../../src/main/ipc/run-ipc-service'
import { createRunBridge } from '../../src/preload/bridge/run'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { RUN_CHANNELS, RUN_STATES, validateRunSession, validateRunEvent,
  validateStartRunRequest, validateStopRunRequest, type RunSession,
  type RunSessionId } from '../../src/shared/contracts/run'
import type { ProjectId } from '../../src/shared/contracts/project'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request = { projectId, relativePath: 'src/hello world.js', dirty: false }
const target = { projectId, relativePath: request.relativePath,
  canonicalRoot: 'C:\\student project', canonicalFile: 'C:\\student project\\src\\hello world.js' }
const runtime = { executable: 'C:\\Program Files\\nodejs\\node.exe' }
const session: RunSession = { ...request, sessionId: 'run_12345678-1234-1234-1234-123456789abc' as RunSessionId,
  state: 'STARTING' }
// Session wire objects intentionally omit dirty (request-only state).
const snapshot = { projectId, relativePath: request.relativePath, sessionId: session.sessionId, state: session.state }

describe('Phase 4A contracts and validation', () => {
  it('accepts narrow requests and every defined session state', () => {
    expect(validateStartRunRequest(request).ok).toBe(true)
    expect(validateStopRunRequest({ sessionId: session.sessionId }).ok).toBe(true)
    for (const state of RUN_STATES) expect(validateRunSession({ ...snapshot, state }).ok).toBe(true)
  })
  it.each(['../evil.js', '/evil.js', 'C:/evil.js', 'C:evil.js', '\\\\server\\a.js',
    'src/../a.js', 'src\\a.js', 'src//a.js', 'a.js\0', 'NUL.js', 'src/a.js:stream'])(
    'rejects unsafe lexical target %s', (relativePath) => {
    expect(validateStartRunRequest({ ...request, relativePath }).ok).toBe(false)
  })
  it.each(['executable', 'cwd', 'args', 'command', 'env', 'ownerId', 'sessionId'])(
    'rejects renderer authority field %s', (field) => {
    expect(validateStartRunRequest({ ...request, [field]: 'injected' }).ok).toBe(false)
  })
  it('rejects malformed values without treating assertions as validation', () => {
    for (const value of [null, [], {}, { ...request, projectId: 'wrong' },
      { ...request, dirty: 'false' }, { ...request, relativePath: 42 }]) {
      expect(validateStartRunRequest(value).ok).toBe(false)
    }
    expect(validateStopRunRequest({ sessionId: 123 }).ok).toBe(false)
    expect(validateStopRunRequest({ sessionId: 'run_123', pid: 123 }).ok).toBe(false)
  })
  it('keeps stdout/stderr separate, rejects native authority and malformed exits', () => {
    for (const type of ['stdout', 'stderr']) {
      expect(validateRunEvent({ type, session: snapshot, data: 'text' }).ok).toBe(true)
    }
    expect(validateRunEvent({ type: 'state', session: snapshot }).ok).toBe(true)
    expect(validateRunEvent({ type: 'stdout', session: snapshot, data: 'text', pid: 4 }).ok).toBe(false)
    expect(validateRunEvent({ type: 'state', session: { ...snapshot, canonicalRoot: 'C:\\private' } }).ok).toBe(false)
    expect(validateRunEvent({ type: 'exit', session: snapshot, exitCode: 0 }).ok).toBe(false)
    for (const exitCode of [0, 1, 0xffff_ffff, null]) {
      expect(validateRunEvent({ type: 'exit', session: { ...snapshot, state: 'EXITED' }, exitCode }).ok).toBe(true)
    }
    for (const exitCode of [NaN, Infinity, -1, 0.5, '0']) {
      expect(validateRunEvent({ type: 'exit', session: { ...snapshot, state: 'EXITED' }, exitCode }).ok).toBe(false)
    }
    expect(validateRunEvent({ type: 'error', session: snapshot, error: new Error('private') }).ok).toBe(false)
  })
})

describe('JavaScriptRunStrategy', () => {
  const strategy = new JavaScriptRunStrategy()
  it('prepares explicit executable and a single file argument without shell construction', () => {
    expect(strategy.supports(target)).toBe(true)
    expect(strategy.prepare(target, runtime)).toEqual({ executable: runtime.executable,
      args: [target.canonicalFile], cwd: target.canonicalRoot, shell: false, environmentAdditions: {} })
  })
  it.each(['ts', 'tsx', 'jsx', 'mjs', 'cjs', 'py', 'JS'])('does not expand to .%s', (extension) => {
    const unsupported = { ...target, relativePath: `file.${extension}` }
    expect(strategy.supports(unsupported)).toBe(false)
    expect(() => strategy.prepare(unsupported, runtime)).toThrow(/current V1/)
  })
  it('rejects traversal, outside-root canonical targets and invalid runtimes', () => {
    for (const changed of [{ relativePath: '../a.js' }, { canonicalFile: 'C:\\elsewhere\\a.js' },
      { canonicalFile: 'C:\\student project-other\\a.js' }, { canonicalFile: 'relative.js' }]) {
      expect(() => strategy.prepare({ ...target, ...changed }, runtime)).toThrow()
    }
    for (const executable of ['node.exe', 'C:\\tools\\cmd.exe', 'C:\\tools\\node.exe\0']) {
      expect(() => strategy.prepare(target, { executable })).toThrow()
    }
  })
})

describe('RunService preparation ownership (no execution)', () => {
  function setup() {
    const authority = { authorize: vi.fn(async () => target), resolveRuntime: vi.fn(async () => runtime) }
    return { authority, service: new RunService(authority, [new JavaScriptRunStrategy()]) }
  }
  it('generates opaque IDs in Main and does not expose executable data in session DTO', async () => {
    const { service, authority } = setup()
    const first = await service.prepare(request, 7)
    expect(validateRunSession(first.session).ok).toBe(true)
    expect(first.session).not.toHaveProperty('executable')
    expect(first.session).not.toHaveProperty('canonicalRoot')
    expect(authority.authorize).toHaveBeenCalledWith(request, 7)
    expect(service.getPreparation(first.session.sessionId, 7)).toEqual(first)
    expect(() => service.getPreparation(first.session.sessionId, 8)).toThrow(/not owned/)
    expect(() => service.releasePreparation(first.session.sessionId, 8)).toThrow(/not owned/)
    await expect(service.prepare(request, 7)).rejects.toThrow(/released first/)
    service.releasePreparation(first.session.sessionId, 7)
    const second = await service.prepare(request, 7)
    expect(second.session.sessionId).not.toBe(first.session.sessionId)
    expect(() => service.getPreparation(first.session.sessionId, 7)).toThrow(/not owned/)
  })
  it('blocks dirty and unsupported targets before authority/runtime operations', async () => {
    const { service, authority } = setup()
    await expect(service.prepare({ ...request, dirty: true }, 7)).rejects.toThrow(/Save/)
    await expect(service.prepare({ ...request, relativePath: 'a.ts' }, 7)).rejects.toThrow(/current V1/)
    expect(authority.authorize).not.toHaveBeenCalled()
    expect(authority.resolveRuntime).not.toHaveBeenCalled()
  })
  it('fails closed on authorization failure or target substitution', async () => {
    const { service, authority } = setup()
    authority.authorize.mockRejectedValueOnce(new Error('project unavailable'))
    await expect(service.prepare(request, 7)).rejects.toThrow('project unavailable')
    expect(authority.resolveRuntime).not.toHaveBeenCalled()
    authority.authorize.mockResolvedValueOnce({ ...target, relativePath: 'other.js' })
    await expect(service.prepare(request, 7)).rejects.toThrow(/invalid/i)
    await expect(service.prepare(request, 0)).rejects.toThrow(/invalid/i)
  })
  it('does not reserve a session if runtime resolution fails; independent retry can prepare', async () => {
    const { service, authority } = setup()
    authority.resolveRuntime.mockRejectedValueOnce(new Error('Node missing'))
    await expect(service.prepare(request, 7)).rejects.toThrow('Node missing')
    expect((await service.prepare(request, 7)).session.state).toBe('STARTING')
  })
  it('allows only one concurrent preparation for a target', async () => {
    const { service } = setup()
    const results = await Promise.allSettled([service.prepare(request, 7), service.prepare(request, 7)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })
})

describe('Run IPC and preload foundation', () => {
  it('validates before dispatch, derives owner from sender, and removes handlers', async () => {
    const handlers = new Map<string, (event: IpcInvokeEventLike, value: unknown) => Promise<unknown>>()
    const registry = new IpcHandlerRegistry({ handle: (channel, listener) => { handlers.set(channel, listener) },
      removeHandler: (channel) => { handlers.delete(channel) } })
    const commands = { startRun: vi.fn(async () => snapshot), stopRun: vi.fn(async () => {}) }
    const ipc = new RunIpcService(registry, commands)
    ipc.start()
    const start = handlers.get(RUN_CHANNELS.start)!
    expect(await start({ sender: { id: 7 } }, { ...request, executable: 'cmd.exe' })).toMatchObject({ ok: false })
    expect(commands.startRun).not.toHaveBeenCalled()
    expect(await start({ sender: { id: 7 } }, request)).toEqual({ ok: true, value: snapshot })
    expect(commands.startRun).toHaveBeenCalledWith(request, 7)
    const stop = handlers.get(RUN_CHANNELS.stop)!
    await stop({ sender: { id: 8 } }, { sessionId: snapshot.sessionId })
    expect(commands.stopRun).toHaveBeenCalledWith(snapshot.sessionId, 8)
    commands.startRun.mockRejectedValueOnce(new Error('private stack/path'))
    expect(JSON.stringify(await start({ sender: { id: 7 } }, request))).not.toContain('private stack/path')
    ipc.stop()
    expect(handlers.size).toBe(0)
  })
  it('exposes only semantic methods, validates replies/events and unsubscribes', async () => {
    let listener: ((event: unknown, value: unknown) => void) | undefined
    const transport: IpcRendererLike = { invoke: vi.fn(async () => ({ ok: true, value: snapshot })),
      on: vi.fn((_channel, callback) => { listener = callback }), removeListener: vi.fn() }
    const api = createRunBridge(transport)
    expect(Object.keys(api).sort()).toEqual(['cancelResolution', 'clearTarget', 'onEvent', 'onProjectEvent',
      'resolveTargets', 'selectTarget', 'start', 'startProject', 'stop'])
    expect(await api.start(request)).toEqual({ ok: true, value: snapshot })
    expect(await api.start({ ...request, dirty: 'false' } as never)).toMatchObject({ ok: false })
    expect(transport.invoke).toHaveBeenCalledTimes(1)
    vi.mocked(transport.invoke).mockResolvedValueOnce({ ok: true, value: { ...snapshot, pid: 4 } })
    expect(await api.start(request)).toMatchObject({ ok: false })
    const receive = vi.fn()
    const unsubscribe = api.onEvent(receive)
    listener?.({}, { type: 'stdout', session: snapshot, data: 'hello' })
    listener?.({}, { type: 'stderr', session: snapshot, data: 'warning' })
    listener?.({}, { type: 'stdout', session: snapshot, data: 'private', nativeHandle: 1 })
    expect(receive.mock.calls.map(([event]) => event.type)).toEqual(['stdout', 'stderr'])
    unsubscribe()
    expect(transport.removeListener).toHaveBeenCalledWith(RUN_CHANNELS.event, listener)
  })
})
