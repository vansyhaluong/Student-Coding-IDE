import { Buffer } from 'node:buffer'
import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RunService } from '../../src/main/services/run/run-service'
import { RunInputQueue } from '../../src/main/services/run/run-input-queue'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import type { RunExecutionPlan, RunPreparationContext, RunStrategy } from '../../src/main/services/run/run-strategy'
import type { PipedProcessEvent, PipedRunProcess, RunInputWriteStatus, RunStdinMode } from '../../src/main/services/run/piped-process-adapter'
import { RUN_INPUT_LIMITS, type ProjectId, type RunSession,
  type SemanticStartRunRequest } from '../../src/shared/contracts'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const projectId = 'project_1234567890abcdef12345678' as ProjectId
const otherProjectId = 'project_abcdefabcdefabcdefabcdef' as ProjectId
const request: SemanticStartRunRequest = { kind: 'csharp-project', projectId, relativePath: 'App.csproj', dirty: false }
const spec = (arg: string) => ({ executable: 'C:\\sdk\\dotnet.exe', args: [arg],
  cwd: 'C:\\project', shell: false as const, environmentAdditions: {} })
interface Native {
  process: PipedRunProcess
  emit: (event: PipedProcessEvent) => void
  finish: (code?: number) => void
  writes: Buffer[]
  held: Array<(status: RunInputWriteStatus) => void>
  closes: () => number
  setMode: (next: 'deliver' | 'hold' | 'broken') => void
}

function setup() {
  const manager = new ProcessManager()
  const authority = {
    authorize: vi.fn(async (target: { projectId: ProjectId; relativePath: string }) => ({ ...target,
      canonicalRoot: 'C:\\project', canonicalFile: win32.join('C:\\project', target.relativePath) })),
    resolveRuntime: vi.fn(async (value: { strategyKind?: string; preparation?: RunPreparationContext }) => ({
      executable: value.strategyKind === 'javascript-file' ? 'C:\\node\\node.exe' : 'C:\\sdk\\dotnet.exe',
    })),
  }
  const strategy: RunStrategy = {
    kind: 'csharp-project', supports: target => /\.csproj$/i.test(target.relativePath),
    prepare: () => spec('unused'), preparePlan: async (): Promise<RunExecutionPlan> => ({ steps: [
      { phase: 'BUILD_RESTORE', execution: spec('build-fixture') },
      { phase: 'EXECUTING', execution: spec('execute-fixture') },
    ] }),
  }
  const natives: Native[] = []
  function fake(observe: (event: PipedProcessEvent) => void, stdin?: RunStdinMode): Native {
    const root = deferred(), stdout = deferred(), stderr = deferred(), tree = deferred(), release = deferred()
    let released = false
    let exitSeen = false
    const writes: Buffer[] = []
    const held: Array<(status: RunInputWriteStatus) => void> = []
    let mode: 'deliver' | 'hold' | 'broken' = 'deliver'
    let closes = 0
    const emit = (event: PipedProcessEvent) => {
      observe(event)
      if (event.type === 'exit') { exitSeen = true; root.resolve() }
      if (event.type === 'stdout-eof') stdout.resolve()
      if (event.type === 'stderr-eof') stderr.resolve()
    }
    const finish = (code = 0) => {
      if (!exitSeen) emit({ type: 'exit', exitCode: code })
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' })
      tree.resolve(); release.resolve()
    }
    const close = vi.fn(async () => {
      for (const resolve of held.splice(0)) resolve('delivered')
      finish()
      await Promise.all([root.promise, stdout.promise, stderr.promise, tree.promise, release.promise])
      released = true
    })
    const process: PipedRunProcess = {
      ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 123 },
      settled: Promise.all([root.promise, stdout.promise, stderr.promise]).then(() => undefined),
      close, isReleased: () => released,
      ...(stdin === 'line-input' ? {
        stdin: 'line-input' as const,
        writeInput: (bytes: Uint8Array) => {
          writes.push(Buffer.from(bytes))
          if (mode === 'broken') return Promise.resolve('broken' as const)
          if (mode === 'deliver') return Promise.resolve('delivered' as const)
          return new Promise<RunInputWriteStatus>(resolve => { held.push(resolve) })
        },
        closeInput: () => { closes += 1; return Promise.resolve() },
      } : {}),
    }
    return { process, emit, finish, writes, held, closes: () => closes, setMode: (next: typeof mode) => { mode = next } }
  }
  const adapter = { create: vi.fn((_execution: unknown, observe: (event: PipedProcessEvent) => void, stdin?: RunStdinMode) => {
    const native = fake(observe, stdin)
    natives.push(native)
    return native.process
  }) }
  const service = new RunService(authority, [strategy, new JavaScriptRunStrategy()], {
    adapter, manager, onEvent: () => undefined,
    sourceGuard: { open: () => ({ check: async () => undefined, assertValid: () => undefined, release: () => undefined }) },
  })
  const executing = async () => {
    const session = await service.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(natives).toHaveLength(1))
    natives[0].finish()
    await vi.waitFor(() => expect(natives).toHaveLength(2))
    return session
  }
  return { service, adapter, natives, executing }
}

const line = (text: string) => Buffer.from(text.endsWith('\n') ? text : `${text}\n`, 'utf8')

describe('M2-03 session input queue', () => {
  it('denies the wrong owner, project, session, and build step', async () => {
    const h = setup()
    const session = await h.service.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(h.natives).toHaveLength(1))
    const build = { projectId, sessionId: session.sessionId, sequence: 1, text: 'early' }
    expect(await h.service.sendInput(build, 7)).toMatchObject({ state: 'REJECTED', reason: 'CAPABILITY_DENIED', retryable: false })
    expect(await h.service.sendInput({ ...build, command: 'dotnet' }, 7)).toMatchObject({ reason: 'CAPABILITY_DENIED' })
    expect(h.adapter.create.mock.calls[0]).toHaveLength(2)
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({
      capability: { mode: 'closed', acceptsInput: false }, gate: 'CLOSED', reason: 'EOF',
    })
    h.natives[0].finish()
    await vi.waitFor(() => expect(h.natives).toHaveLength(2))
    expect(h.adapter.create.mock.calls[1][2]).toBe('line-input')
    expect(await h.service.sendInput({ ...build, projectId: otherProjectId }, 7)).toMatchObject({ reason: 'SESSION_UNAVAILABLE' })
    expect(await h.service.sendInput(build, 8)).toMatchObject({ reason: 'SESSION_UNAVAILABLE' })
    expect(await h.service.sendInput({ ...build, sessionId: 'run_12345678-1234-1234-1234-123456789abc' }, 7)).toMatchObject({ reason: 'SESSION_UNAVAILABLE' })
    expect(h.service.getInputStatus(session.sessionId, 7).gate).toBe('OPEN')
    expect(() => h.service.getInputStatus(session.sessionId, 8)).toThrow(/not owned/)
    await h.service.stop()
  })

  it('keeps JavaScript input closed', async () => {
    const h = setup()
    const session = await h.service.startRun({ projectId, relativePath: 'main.js', dirty: false }, 7)
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'nope' }, 7))
      .toMatchObject({ reason: 'CAPABILITY_DENIED' })
    expect(h.service.getInputStatus(session.sessionId, 7).capability).toEqual({ mode: 'closed', acceptsInput: false })
    expect(h.adapter.create.mock.calls[0]).toHaveLength(2)
    await h.service.stopRun(session.sessionId, 7)
  })

  it('writes normalized empty and multiline input in order and does not replay', async () => {
    const h = setup()
    const session = await h.executing()
    const execute = h.natives[1]
    execute.setMode('hold')
    const first = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'a\r\nb\r' }, 7)
    const second = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 2, text: '' }, 7)
    const third = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 3, text: 'xin chào 😀' }, 7)
    await vi.waitFor(() => expect(execute.writes).toHaveLength(1))
    expect(execute.writes[0]).toEqual(Buffer.from('a\nb\n', 'utf8'))
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'a\r\nb\r' }, 7))
      .toMatchObject({ reason: 'SEQUENCE_MISMATCH', retryable: false })
    expect(execute.writes).toHaveLength(1)
    execute.setMode('deliver')
    execute.held.shift()?.('delivered')
    await expect(first).resolves.toMatchObject({ state: 'DELIVERED', sequence: 1 })
    await expect(second).resolves.toMatchObject({ state: 'DELIVERED', sequence: 2 })
    await expect(third).resolves.toMatchObject({ state: 'DELIVERED', sequence: 3 })
    expect(execute.writes.map(bytes => bytes.toString('utf8'))).toEqual(['a\nb\n', '\n', 'xin chào 😀\n'])
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({ gate: 'OPEN', nextSequence: 4, queuedSubmissions: 0 })
    await h.service.stop()
  })

  it('rejects an oversized or invalid submission without consuming the sequence', async () => {
    const h = setup()
    const session = await h.executing()
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'x\0' }, 7))
      .toMatchObject({ reason: 'INVALID_INPUT', retryable: false })
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'x'.repeat(16 * 1024) }, 7))
      .toMatchObject({ reason: 'INVALID_INPUT' })
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'ok', command: 'dotnet' }, 7))
      .toMatchObject({ reason: 'INVALID_INPUT' })
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'ok' }, 7))
      .toMatchObject({ state: 'DELIVERED' })
    expect(h.natives[1].writes).toEqual([line('ok')])
    await h.service.stop()
  })

  it('rejects a full queue without dropping accepted bytes', async () => {
    const h = setup()
    const session = await h.executing()
    const execute = h.natives[1]
    execute.setMode('hold')
    const payload = 'x'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes - 1)
    const accepted = []
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      accepted.push(h.service.sendInput({ projectId, sessionId: session.sessionId, sequence, text: payload }, 7))
    }
    await vi.waitFor(() => expect(execute.writes).toHaveLength(1))
    const busy = await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 5, text: payload }, 7)
    expect(busy).toMatchObject({ state: 'REJECTED', reason: 'INPUT_BUSY', retryable: true })
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({
      gate: 'OPEN', queuedSubmissions: 4, queuedUtf8Bytes: RUN_INPUT_LIMITS.maximumQueuedUtf8Bytes, nextSequence: 5,
    })
    expect(execute.writes).toHaveLength(1)
    execute.setMode('deliver')
    execute.held.shift()?.('delivered')
    await Promise.all(accepted)
    expect(execute.writes).toHaveLength(4)
    expect(execute.writes.every(bytes => bytes.equals(line(payload)))).toBe(true)
    await h.service.stop()
  })

  it('rejects the 33rd submission and still writes the accepted 32', async () => {
    const h = setup()
    const session = await h.executing()
    const execute = h.natives[1]
    execute.setMode('hold')
    const accepted = []
    for (let sequence = 1; sequence <= 32; sequence += 1) {
      accepted.push(h.service.sendInput({ projectId, sessionId: session.sessionId, sequence, text: '' }, 7))
    }
    await vi.waitFor(() => expect(execute.held).toHaveLength(1))
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 33, text: 'overflow' }, 7))
      .toMatchObject({ reason: 'INPUT_BUSY', retryable: true })
    expect(h.service.getInputStatus(session.sessionId, 7).queuedSubmissions).toBe(32)
    execute.setMode('deliver')
    execute.held.shift()?.('delivered')
    await Promise.all(accepted)
    expect(execute.writes.map(bytes => bytes.toString('utf8')).filter(text => text === 'overflow\n')).toEqual([])
    expect(execute.writes).toHaveLength(32)
    await h.service.stop()
  })

  it('orders EOF behind accepted bytes and ignores a repeated close', async () => {
    const h = setup()
    const session = await h.executing()
    const execute = h.natives[1]
    execute.setMode('hold')
    const sent = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'line' }, 7)
    const closed = h.service.closeInput({ projectId, sessionId: session.sessionId, sequence: 2 }, 7)
    await vi.waitFor(() => expect(execute.writes).toHaveLength(1))
    expect(execute.closes()).toBe(0)
    execute.setMode('deliver')
    execute.held.shift()?.('delivered')
    await expect(sent).resolves.toMatchObject({ state: 'DELIVERED' })
    await expect(closed).resolves.toMatchObject({ state: 'DELIVERED', sequence: 2 })
    expect(execute.closes()).toBe(1)
    await expect(h.service.closeInput({ projectId, sessionId: session.sessionId, sequence: 2 }, 7)).resolves.toMatchObject({ state: 'DELIVERED' })
    expect(execute.closes()).toBe(1)
    expect(await h.service.closeInput({ projectId, sessionId: session.sessionId, sequence: 3 }, 7)).toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(await h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 3, text: 'late' }, 7)).toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({ gate: 'CLOSED', reason: 'EOF', nextSequence: 3 })
    expect(execute.writes.map(bytes => bytes.toString('utf8'))).toEqual(['line\n'])
    await h.service.stop()
  })

  it('closes the gate before Stop and does not deliver a stale write acknowledgement', async () => {
    const h = setup()
    const session = await h.executing()
    const execute = h.natives[1]
    execute.setMode('hold')
    const first = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'keep' }, 7)
    const second = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 2, text: 'drop' }, 7)
    await vi.waitFor(() => expect(execute.writes).toHaveLength(1))
    const stopping = h.service.stopRun(session.sessionId, 7)
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({ gate: 'CLOSED', reason: 'STOPPED' })
    await expect(second).resolves.toMatchObject({ reason: 'INPUT_CLOSED', retryable: false })
    await expect(first).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(execute.writes.map(bytes => bytes.toString('utf8'))).toEqual(['keep\n'])
    await stopping
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
  })

  it('closes input before exit, re-run, project switch, owner loss, and shutdown', async () => {
    const exit = setup()
    const exited = await exit.executing()
    exit.natives[1].setMode('hold')
    const live = exit.service.sendInput({ projectId, sessionId: exited.sessionId, sequence: 1, text: 'now' }, 7)
    const dropped = exit.service.sendInput({ projectId, sessionId: exited.sessionId, sequence: 2, text: 'later' }, 7)
    await vi.waitFor(() => expect(exit.natives[1].writes).toHaveLength(1))
    exit.natives[1].emit({ type: 'exit', exitCode: 0 })
    expect(exit.service.getInputStatus(exited.sessionId, 7)).toMatchObject({ reason: 'EXITED' })
    await expect(live).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    await expect(dropped).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(exit.natives[1].writes.map(bytes => bytes.toString('utf8'))).toEqual(['now\n'])
    exit.natives[1].finish()
    await exit.service.stop()

    const rerun = setup()
    const first = await rerun.executing()
    rerun.natives[1].setMode('hold')
    const stale = rerun.service.sendInput({ projectId, sessionId: first.sessionId, sequence: 1, text: 'stale' }, 7)
    const tail = rerun.service.sendInput({ projectId, sessionId: first.sessionId, sequence: 2, text: 'tail' }, 7)
    await vi.waitFor(() => expect(rerun.natives[1].writes).toHaveLength(1))
    const replacement = rerun.service.startPlannedRun(request, 7)
    await expect(stale).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    await expect(tail).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    const second = await replacement
    await vi.waitFor(() => expect(rerun.natives).toHaveLength(3))
    rerun.natives[2].finish()
    await vi.waitFor(() => expect(rerun.natives).toHaveLength(4))
    await rerun.service.sendInput({ projectId, sessionId: second.sessionId, sequence: 1, text: 'fresh' }, 7)
    expect(rerun.natives[1].writes.map(bytes => bytes.toString('utf8'))).toEqual(['stale\n'])
    expect(rerun.natives[3].writes.map(bytes => bytes.toString('utf8'))).toEqual(['fresh\n'])
    expect(rerun.natives.flatMap(native => native.writes.map(bytes => bytes.toString('utf8')))).not.toContain('tail\n')
    await rerun.service.stop()

    const switched = setup()
    const switching = await switched.executing()
    switched.natives[1].setMode('hold')
    const queued = switched.service.sendInput({ projectId, sessionId: switching.sessionId, sequence: 1, text: 'queued' }, 7)
    const switchTail = switched.service.sendInput({ projectId, sessionId: switching.sessionId, sequence: 2, text: 'tail' }, 7)
    await vi.waitFor(() => expect(switched.natives[1].writes).toHaveLength(1))
    const stopping = switched.service.stopProject(projectId)
    expect(switched.service.getInputStatus(switching.sessionId, 7)).toMatchObject({ reason: 'PROJECT_CHANGED' })
    await expect(switchTail).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    await expect(queued).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    await stopping

    const owned = setup()
    const owner = await owned.executing()
    const pendingStop = owned.service.stopOwner(7)
    expect(owned.service.getInputStatus(owner.sessionId, 7)).toMatchObject({ reason: 'OWNER_LOST' })
    await pendingStop

    const shutting = setup()
    const app = await shutting.executing()
    shutting.natives[1].setMode('hold')
    const shutdownLive = shutting.service.sendInput({ projectId, sessionId: app.sessionId, sequence: 1, text: 'live' }, 7)
    const late = shutting.service.sendInput({ projectId, sessionId: app.sessionId, sequence: 2, text: 'late' }, 7)
    await vi.waitFor(() => expect(shutting.natives[1].held).toHaveLength(1))
    const shutdown = shutting.service.stop()
    expect(shutting.service.getInputStatus(app.sessionId, 7)).toMatchObject({ reason: 'SHUTDOWN' })
    await expect(shutdownLive).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    await expect(late).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(shutting.natives[1].writes.map(bytes => bytes.toString('utf8'))).toEqual(['live\n'])
    await shutdown
  })

  it('times out a blocked write, drops the tail, and stops the session', async () => {
    vi.useFakeTimers()
    const stopped: string[] = []
    let resolveWrite: ((status: RunInputWriteStatus) => void) | undefined
    const queue = new RunInputQueue(projectId, 'run_12345678-1234-1234-1234-123456789abc' as RunSession['sessionId'], {
      writeInput: () => new Promise(resolve => { resolveWrite = resolve }),
      closeInput: () => Promise.resolve(),
    }, () => stopped.push('timeout'))
    const first = queue.submit({ projectId, sessionId: queue.status().sessionId, sequence: 1, text: 'blocked' })
    const second = queue.submit({ projectId, sessionId: queue.status().sessionId, sequence: 2, text: 'tail' })
    await vi.advanceTimersByTimeAsync(RUN_INPUT_LIMITS.writeDeadlineMilliseconds - 1)
    expect(stopped).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toMatchObject({ reason: 'WRITE_TIMEOUT', retryable: false })
    await expect(second).resolves.toMatchObject({ reason: 'INPUT_CLOSED', retryable: false })
    expect(stopped).toEqual(['timeout'])
    expect(queue.status()).toMatchObject({ gate: 'CLOSED', reason: 'WRITE_TIMEOUT', queuedSubmissions: 0, queuedUtf8Bytes: 0 })
    resolveWrite?.('delivered')
    vi.useRealTimers()

    const h = setup()
    const session = await h.executing()
    h.natives[1].setMode('hold')
    vi.useFakeTimers()
    const ack = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'block' }, 7)
    await vi.advanceTimersByTimeAsync(RUN_INPUT_LIMITS.writeDeadlineMilliseconds)
    await expect(ack).resolves.toMatchObject({ reason: 'WRITE_TIMEOUT' })
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({ reason: 'WRITE_TIMEOUT' })
    vi.useRealTimers()
    await h.service.stop()
    expect(h.service.getSession(session.sessionId, 7).state).toBe('CANCELLED')
  })

  it('reports a broken pipe without writing the rest', async () => {
    const h = setup()
    const session = await h.executing()
    h.natives[1].setMode('broken')
    const first = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 1, text: 'pipe' }, 7)
    const second = h.service.sendInput({ projectId, sessionId: session.sessionId, sequence: 2, text: 'more' }, 7)
    await expect(first).resolves.toMatchObject({ reason: 'WRITE_FAILED', retryable: false })
    await expect(second).resolves.toMatchObject({ reason: 'INPUT_CLOSED' })
    expect(h.natives[1].writes).toHaveLength(1)
    expect(h.service.getInputStatus(session.sessionId, 7)).toMatchObject({ reason: 'WRITE_FAILED' })
    expect(h.natives[1].process.isReleased()).toBe(false)
    await h.service.stop()
  })
})
