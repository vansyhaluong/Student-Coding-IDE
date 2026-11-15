import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { RunIpcService } from '../../src/main/ipc/run-ipc-service'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import type { CsharpRunTargetRequests } from '../../src/main/services/run/csharp-run-target-requests'
import type { RunExecutionPlan, RunStrategy } from '../../src/main/services/run/run-strategy'
import type { PipedProcessEvent, PipedRunProcess, RunStdinMode } from '../../src/main/services/run/piped-process-adapter'
import { createRunBridge } from '../../src/preload/bridge/run'
import { RUN_INPUT_CHANNELS, type ProjectId, type RunInputAcknowledgement } from '../../src/shared/contracts'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const projectId = 'project_1234567890abcdef12345678' as ProjectId
const spec = (arg: string) => ({ executable: 'C:\\sdk\\dotnet.exe', args: [arg], cwd: 'C:\\project',
  shell: false as const, environmentAdditions: {} })

function setup() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({
    handle: (channel, handler) => { handlers.set(channel, handler) },
    removeHandler: channel => { handlers.delete(channel) },
  })
  const manager = new ProcessManager()
  const natives: Array<{ writes: Buffer[]; finish: () => void; releaseHeld: () => void }> = []
  const adapter = { create: vi.fn((_execution: unknown, observe: (event: PipedProcessEvent) => void, stdin?: RunStdinMode) => {
    const root = deferred(), stdout = deferred(), stderr = deferred()
    let released = false, exited = false
    const writes: Buffer[] = []
    const held: Array<(value: 'delivered') => void> = []
    let hold = false
    const emit = (event: PipedProcessEvent) => {
      observe(event)
      if (event.type === 'exit') root.resolve()
      if (event.type === 'stdout-eof') stdout.resolve()
      if (event.type === 'stderr-eof') stderr.resolve()
    }
    const finish = () => {
      if (!exited) { exited = true; emit({ type: 'exit', exitCode: 0 }) }
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' }); released = true
    }
    const process: PipedRunProcess = {
      ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 4 },
      settled: Promise.all([root.promise, stdout.promise, stderr.promise]).then(() => undefined),
      close: async () => { for (const resolve of held.splice(0)) resolve('delivered'); finish() },
      isReleased: () => released,
      ...(stdin === 'line-input' ? {
        stdin: 'line-input' as const,
        writeInput: (bytes: Uint8Array) => {
          writes.push(Buffer.from(bytes))
          return hold ? new Promise(resolve => { held.push(resolve) }) : Promise.resolve('delivered' as const)
        },
        closeInput: () => Promise.resolve(),
      } : {}),
    }
    natives.push({ writes, finish, releaseHeld: () => { const resolve = held.shift(); resolve?.('delivered') } })
    return Object.assign(process, { hold: () => { hold = true } })
  }) }
  const strategy: RunStrategy = {
    kind: 'csharp-project', supports: target => /\.csproj$/i.test(target.relativePath),
    prepare: () => spec('unused'), preparePlan: async (): Promise<RunExecutionPlan> => ({ steps: [
      { phase: 'BUILD_RESTORE', execution: spec('build') },
      { phase: 'EXECUTING', execution: spec('execute') },
    ] }),
  }
  const run = new RunService({
    authorize: async target => ({ ...target, canonicalRoot: 'C:\\project',
      canonicalFile: win32.join('C:\\project', target.relativePath) }),
    resolveRuntime: async value => ({ executable: value.strategyKind === 'javascript-file' ? 'C:\\node\\node.exe' : 'C:\\sdk\\dotnet.exe' }),
  }, [strategy, new JavaScriptRunStrategy()], {
    adapter, manager, onEvent: () => undefined,
    sourceGuard: { open: () => ({ check: async () => undefined, assertValid: () => undefined, release: () => undefined }) },
  })
  const token = { projectId }
  const targets = { ownerId: 0, isTransitioning: false, perform: async () => { throw new Error('unused') },
    cancel: async () => undefined, stop: async () => undefined } as unknown as CsharpRunTargetRequests
  const ipc = new RunIpcService(registry, run, () => undefined, {
    targets, authorize: () => token,
    start: (request, ownerId) => run.startPlannedRun(request, ownerId),
    publish: () => undefined,
  })
  ipc.start()
  const frame = { processId: 1, frameToken: 'trusted', detached: false, isDestroyed: () => false }
  const transport = {
    invoke: vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: 7 }, senderFrame: frame }, payload)),
    on: vi.fn(), removeListener: vi.fn(),
  }
  const api = createRunBridge(transport)
  const executing = async () => {
    const buildIndex = natives.length
    const started = await api.startProject({ kind: 'csharp-project', projectId, relativePath: 'App.csproj', dirty: false })
    if (!started.ok) throw new Error('start failed')
    await vi.waitFor(() => expect(natives).toHaveLength(buildIndex + 1))
    natives[buildIndex].finish()
    await vi.waitFor(() => expect(natives).toHaveLength(buildIndex + 2))
    return started.value
  }
  return { api, transport, ipc, run, natives, adapter, executing }
}

const delivered = (sequence: number, sessionId: string): RunInputAcknowledgement => ({
  projectId, sessionId: sessionId as RunInputAcknowledgement['sessionId'], sequence, state: 'DELIVERED',
})

describe('M2-04 input IPC and preload', () => {
  it('rejects a malformed input before a domain call and normalizes transport failure', async () => {
    const h = setup()
    const malformed = { projectId, sessionId: 'run_12345678-1234-1234-1234-123456789abc' as RunInputAcknowledgement['sessionId'],
      sequence: 1, text: 'x', command: 'dotnet' }
    expect(await h.api.sendInput(malformed)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(h.transport.invoke).not.toHaveBeenCalled()
    h.transport.invoke.mockRejectedValueOnce(new Error('private socket'))
    const failed = await h.api.sendInput({ projectId, sessionId: 'run_12345678-1234-1234-1234-123456789abc' as RunInputAcknowledgement['sessionId'],
      sequence: 1, text: 'x' })
    expect(failed).toMatchObject({ ok: false, error: { details: { boundaryFailure: 'transport' } } })
    expect(JSON.stringify(failed)).not.toContain('private socket')
    await h.ipc.stop(); await h.run.stop()
  })

  it('rejects JavaScript input and delivers one C# execute line', async () => {
    const h = setup()
    const javascript = await h.run.startRun({ projectId, relativePath: 'main.js', dirty: false }, 7)
    const denied = await h.api.sendInput({ projectId, sessionId: javascript.sessionId, sequence: 1, text: 'nope' })
    expect(denied).toEqual({ ok: true, value: { projectId, sessionId: javascript.sessionId, sequence: 1,
      state: 'REJECTED', reason: 'CAPABILITY_DENIED', retryable: false } })
    const session = await h.executing()
    const result = await h.api.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'xin chào' })
    expect(result).toEqual({ ok: true, value: delivered(1, session.sessionId) })
    expect(h.natives[2].writes.map(bytes => bytes.toString('utf8'))).toEqual(['xin chào\n'])
    expect(h.transport.invoke).toHaveBeenCalledWith(RUN_INPUT_CHANNELS.send, expect.objectContaining({ text: 'xin chào' }))
    const status = await h.api.inputStatus({ projectId, sessionId: session.sessionId })
    expect(status).toMatchObject({ ok: true, value: { gate: 'OPEN', nextSequence: 2, capability: { mode: 'line-input' } } })
    const closed = await h.api.closeInput({ projectId, sessionId: session.sessionId, sequence: 2 })
    expect(closed).toEqual({ ok: true, value: delivered(2, session.sessionId) })
    expect(h.transport.invoke).toHaveBeenCalledWith(RUN_INPUT_CHANNELS.close, expect.objectContaining({ sequence: 2 }))
    const afterEof = await h.api.inputStatus({ projectId, sessionId: session.sessionId })
    expect(afterEof).toMatchObject({ ok: true, value: { gate: 'CLOSED', reason: 'EOF', nextSequence: 3 } })
    await h.ipc.stop(); await h.run.stop()
  })

  it('drops a late acknowledgement after the owner generation changes', async () => {
    const h = setup()
    const session = await h.executing()
    const opened = h.adapter.create.mock.results[1].value as PipedRunProcess & { hold: () => void }
    opened.hold()
    const pending = h.api.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'late' })
    await vi.waitFor(() => expect(h.natives[1].writes).toHaveLength(1))
    await h.ipc.invalidateOwner(7)
    h.natives[1].releaseHeld()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('DELIVERED')
    await h.ipc.stop(); await h.run.stop()
  })

  it('does not accept an acknowledgement for a different project or session', async () => {
    const h = setup()
    const session = await h.executing()
    h.transport.invoke.mockResolvedValueOnce({ ok: true, value: { ...delivered(1, session.sessionId),
      projectId: 'project_abcdefabcdefabcdefabcdef' } })
    expect((await h.api.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'x' })).ok).toBe(false)
    h.transport.invoke.mockResolvedValueOnce({ ok: true, value: { ...delivered(1, 'run_abcdefab-1234-1234-1234-123456789abc'),
      sessionId: 'run_abcdefab-1234-1234-1234-123456789abc' } })
    expect((await h.api.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'x' })).ok).toBe(false)
    await h.ipc.stop(); await h.run.stop()
  })
})
