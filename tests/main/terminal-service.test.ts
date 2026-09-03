import { describe, expect, it, vi } from 'vitest'

import type {
  ProjectId,
  TerminalDataEvent,
  TerminalEvent,
  TerminalSessionId,
} from '../../src/shared/contracts'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../../src/main/app/application-quit-coordinator'
import type {
  ProcessTreeIdentity,
  ProcessTreeOwnership,
  ProcessTreeTerminator,
} from '../../src/main/services/process/process-tree-terminator'
import {
  ProjectService,
  type ProjectServiceFileSystem,
} from '../../src/main/services/project/project-service'
import type { TerminalShellResolver } from '../../src/main/services/terminal/shell-resolver'
import type { TerminalShellProfile } from '../../src/main/services/terminal/shell-resolver'
import {
  TerminalService,
  type TerminalOwnershipContext,
} from '../../src/main/services/terminal/terminal-service'
import { FakePtyPort } from '../support/fake-pty'
import { ManualTerminalScheduler } from '../support/manual-terminal-scheduler'

const ROOT = 'D:\\coding-ide'
const OTHER_PROJECT_ID = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const BATCH_DELAY = 8
const CLOSE_TIMEOUT = 50

interface PublishedEvent {
  ownerId: number
  event: TerminalEvent
}

interface Harness {
  service: TerminalService
  projectService: ProjectService
  processManager: ProcessManager
  processTreeTerminator: FakeProcessTreeTerminator
  ptyPort: FakePtyPort
  scheduler: ManualTerminalScheduler
  events: PublishedEvent[]
  context: TerminalOwnershipContext
  projectId: ProjectId
}

describe('Phase 2E-D TerminalService create and authority', () => {
  it('creates unique Main-owned sessions at the authorized canonical project root', async () => {
    const harness = await createHarness()
    const first = await createSession(harness, 80, 24)
    const second = await createSession(harness, 100, 30)

    expect(first.sessionId).not.toBe(second.sessionId)
    expect(first).toMatchObject({
      projectId: harness.projectId,
      state: 'RUNNING',
      cols: 80,
      rows: 24,
      shellLabel: 'Windows PowerShell',
    })
    expect(harness.ptyPort.spawnCalls[0]).toEqual({
      executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      args: [],
      cwd: ROOT,
      env: {
        PATH: 'C:\\Windows\\System32',
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\student',
      },
      cols: 80,
      rows: 24,
      name: 'xterm-256color',
    })
    expect(harness.processManager.size).toBe(2)
  })

  it('cleans spawn and ProcessManager registration failures without a session leak', async () => {
    const spawnHarness = await createHarness()
    spawnHarness.ptyPort.failNextSpawn(new Error('controlled spawn failure'))
    await expect(createSession(spawnHarness)).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
    })
    expect(spawnHarness.processManager.size).toBe(0)
    expect(spawnHarness.ptyPort.processes).toHaveLength(0)

    const nativeMissingHarness = await createHarness()
    const nativeMissing = Object.assign(new Error('conpty.node was not found'), {
      code: 'MODULE_NOT_FOUND',
    })
    nativeMissingHarness.ptyPort.failNextSpawn(nativeMissing)
    await expect(createSession(nativeMissingHarness)).rejects.toMatchObject({
      code: 'DEPENDENCY_MISSING',
    })

    const collisionId = 'terminal_collision' as TerminalSessionId
    const registrationHarness = await createHarness(() => collisionId)
    registrationHarness.processManager.register({
      id: `terminal:${collisionId}`,
      ownerId: 'existing-owner',
      close: vi.fn(),
    })
    await expect(createSession(registrationHarness)).rejects.toMatchObject({
      code: 'SERVICE_CRASHED',
    })
    const process = registrationHarness.ptyPort.processes[0]
    expect(process?.closeCallCount).toBe(1)
    expect(process?.disposeCallCount).toBe(1)
    expect(registrationHarness.service.getSessionSnapshot(collisionId)).toBeNull()
    expect(registrationHarness.processManager.size).toBe(1)
  })

  it('fails an immediate native exit during creation without registering a tombstone', async () => {
    const harness = await createHarness()
    harness.ptyPort.exitImmediatelyOnNextSpawn({ exitCode: 1, signal: null })

    await expect(createSession(harness)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(harness.processManager.size).toBe(0)
    expect(harness.ptyPort.processes[0]?.disposeCallCount).toBe(1)
  })

  it('denies unknown, cross-owner, and cross-project session access', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)

    expect(() => harness.service.input({
      sessionId: 'terminal_unknown' as TerminalSessionId,
      data: 'x',
    }, harness.context)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
    expect(() => harness.service.input({ sessionId: session.sessionId, data: 'x' }, {
      ...harness.context,
      ownerWebContentsId: 99,
    })).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
    expect(() => harness.service.input({ sessionId: session.sessionId, data: 'x' }, {
      ownerWebContentsId: harness.context.ownerWebContentsId,
      projectId: OTHER_PROJECT_ID,
    })).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('cancels an in-flight create before a project transition can miss its PTY', async () => {
    const shell = deferred<TerminalShellProfile>()
    const harness = await createHarness(undefined, 16, 256, {
      resolve: () => shell.promise,
    })
    const creating = createSession(harness)
    const acquiring = harness.service.acquireProjectTransition(harness.projectId)
    shell.resolve(shellProfile())

    const lease = await acquiring
    await expect(creating).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(lease.hasLiveSessions).toBe(false)
    expect(harness.ptyPort.spawnCalls).toHaveLength(0)
    lease.release()
    await expect(createSession(harness)).resolves.toMatchObject({ state: 'RUNNING' })
  })

  it('waits for pending owner creation during renderer-loss cleanup without leaking a PTY', async () => {
    const shell = deferred<TerminalShellProfile>()
    const harness = await createHarness(undefined, 16, 256, {
      resolve: () => shell.promise,
    })
    const creating = createSession(harness)
    const cleaning = harness.service.closeSessionsForOwner(
      harness.context.ownerWebContentsId,
    )
    shell.resolve(shellProfile())

    await expect(creating).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    await expect(cleaning).resolves.toBeUndefined()
    expect(harness.ptyPort.spawnCalls).toHaveLength(0)
    expect(harness.processManager.size).toBe(0)
  })

  it('blocks new work and drains pending creates before bounded shutdown cleanup', async () => {
    const shell = deferred<TerminalShellProfile>()
    const harness = await createHarness(undefined, 16, 256, {
      resolve: () => shell.promise,
    })
    const creating = createSession(harness)
    const shutdown = harness.service.shutdownAll()
    shell.resolve(shellProfile())

    await expect(creating).rejects.toMatchObject({ code: 'SERVICE_CRASHED' })
    await expect(shutdown).resolves.toBeUndefined()
    await expect(createSession(harness)).rejects.toMatchObject({ code: 'SERVICE_CRASHED' })
    expect(harness.ptyPort.spawnCalls).toHaveLength(0)
    expect(harness.processManager.size).toBe(0)
  })
})

describe('Phase 2E-D TerminalService input and resize', () => {
  it('forwards normal, Unicode, and Ctrl+C bytes without interpretation', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!

    harness.service.input({ sessionId: session.sessionId, data: 'dir\r' }, harness.context)
    harness.service.input({ sessionId: session.sessionId, data: 'xin chào 🌏\r' }, harness.context)
    harness.service.input({ sessionId: session.sessionId, data: '\x03' }, harness.context)
    expect(process.writes).toEqual(['dir\r', 'xin chào 🌏\r', '\x03'])
  })

  it('maps write failure, emits a safe error, and rejects later input', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 1, signal: null })
    const session = await createSession(harness)
    harness.ptyPort.processes[0]!.failNextWrite(new Error('native secret'))

    expect(() => harness.service.input({
      sessionId: session.sessionId,
      data: 'x',
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('FAILED')
    expect(harness.events.at(-1)?.event).toMatchObject({
      type: 'error',
      error: { code: 'PROCESS_FAILED' },
    })
    expect(JSON.stringify(harness.events)).not.toContain('native secret')
    expect(() => harness.service.input({
      sessionId: session.sessionId,
      data: 'again',
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
  })

  it('resizes once, deduplicates exact dimensions, and commits dimensions after success', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!

    harness.service.resize({ sessionId: session.sessionId, cols: 80, rows: 24 }, harness.context)
    harness.service.resize({ sessionId: session.sessionId, cols: 100, rows: 30 }, harness.context)
    expect(process.resizes).toEqual([{ cols: 100, rows: 30 }])
    expect(harness.service.getSessionSnapshot(session.sessionId)).toMatchObject({
      cols: 100,
      rows: 30,
    })
  })

  it('does not commit dimensions after adapter resize failure', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 1, signal: null })
    const session = await createSession(harness)
    harness.ptyPort.processes[0]!.failNextResize(new Error('resize failed'))

    expect(() => harness.service.resize({
      sessionId: session.sessionId,
      cols: 100,
      rows: 30,
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
    expect(harness.service.getSessionSnapshot(session.sessionId)).toMatchObject({
      cols: 80,
      rows: 24,
      state: 'FAILED',
    })
  })
})

describe('Phase 2E-D TerminalService output and exit', () => {
  it('batches ordered output with monotonic per-session sequences', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!

    process.emitData('one')
    process.emitData('two')
    expect(harness.events).toHaveLength(0)
    harness.scheduler.runDelay(BATCH_DELAY)
    process.emitData('three')
    harness.scheduler.runDelay(BATCH_DELAY)

    expect(harness.events.map(({ event }) => event)).toEqual([
      {
        type: 'data',
        sessionId: session.sessionId,
        projectId: harness.projectId,
        sequence: 0,
        data: 'onetwo',
      },
      {
        type: 'data',
        sessionId: session.sessionId,
        projectId: harness.projectId,
        sequence: 1,
        data: 'three',
      },
    ])
  })

  it('bounds burst queues, preserves Unicode ordering, and isolates sessions', async () => {
    const harness = await createHarness(undefined, 8)
    const first = await createSession(harness)
    const second = await createSession(harness)
    harness.ptyPort.processes[0]!.emitData('ab🌏cdefgh')
    harness.ptyPort.processes[1]!.emitData('second')
    harness.scheduler.runDelay(BATCH_DELAY)

    const firstData = harness.events
      .map(({ event }) => event)
      .filter((event): event is TerminalDataEvent => (
        event.type === 'data' && event.sessionId === first.sessionId
      ))
    const secondData = harness.events
      .map(({ event }) => event)
      .filter((event): event is TerminalDataEvent => (
        event.type === 'data' && event.sessionId === second.sessionId
      ))
    expect(firstData.map((event) => event.data).join('')).toBe('ab🌏cdefgh')
    expect(firstData.map((event) => event.sequence)).toEqual([0, 1])
    expect(secondData).toEqual([expect.objectContaining({
      sessionId: second.sessionId,
      sequence: 0,
      data: 'second',
    })])
    expect(harness.scheduler.pendingCount).toBe(0)
  })

  it('flushes trailing output before one exit and suppresses late native callbacks', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!
    process.emitData('tail')
    process.emitExit({ exitCode: 0, signal: null })
    await vi.waitFor(() => expect(harness.processManager.size).toBe(0))
    process.emitLateData('late')
    process.emitLateExit({ exitCode: 9, signal: 2 })

    expect(harness.events.map(({ event }) => event.type)).toEqual(['data', 'exit'])
    expect(harness.events[0]?.event).toMatchObject({ data: 'tail', sequence: 0 })
    expect(harness.events[1]?.event).toMatchObject({ exitCode: 0, signal: null })
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('EXITED')
    expect(process.disposeCallCount).toBe(1)
    expect(harness.processManager.size).toBe(0)
    expect(harness.scheduler.pendingCount).toBe(0)
    expect(() => harness.service.resize({
      sessionId: session.sessionId,
      cols: 90,
      rows: 25,
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
  })

  it('retains Job and ProcessManager ownership after natural root exit until finalization', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const finalization = deferred<void>()
    harness.processTreeTerminator.terminationBarrier = finalization.promise

    harness.ptyPort.processes[0]!.emitExit({ exitCode: 0, signal: null })
    await vi.waitFor(() => expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1))
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('CLOSING')
    expect(harness.processManager.size).toBe(1)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(0)

    finalization.resolve()
    await vi.waitFor(() => expect(harness.processManager.size).toBe(0))
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
  })

  it.each([
    ['renderer loss', (harness: Harness) => harness.service.closeSessionsForOwner(1)],
    ['project cleanup', (harness: Harness) => (
      harness.service.closeSessionsForProject(harness.projectId)
    )],
  ])('shares one Job finalization when natural root exit races with %s', async (_, trigger) => {
    const harness = await createHarness()
    await createSession(harness)
    const finalization = deferred<void>()
    harness.processTreeTerminator.terminationBarrier = finalization.promise

    harness.ptyPort.processes[0]!.emitExit({ exitCode: 0, signal: null })
    const cleanup = trigger(harness)
    await vi.waitFor(() => expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1))
    expect(harness.processManager.size).toBe(1)

    finalization.resolve()
    await expect(cleanup).resolves.toBeUndefined()
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
    expect(harness.processManager.size).toBe(0)
  })

  it('rejects input and resize during natural-root finalization without duplicating cleanup', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const finalization = deferred<void>()
    harness.processTreeTerminator.terminationBarrier = finalization.promise

    harness.ptyPort.processes[0]!.emitExit({ exitCode: 0, signal: null })
    expect(() => harness.service.input({
      sessionId: session.sessionId,
      data: 'late input',
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
    expect(() => harness.service.resize({
      sessionId: session.sessionId,
      cols: 100,
      rows: 30,
    }, harness.context)).toThrow(expect.objectContaining({ code: 'PROCESS_FAILED' }))
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)

    finalization.resolve()
    await vi.waitFor(() => expect(harness.processManager.size).toBe(0))
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
  })

  it('keeps failed natural-root finalization owned and succeeds on one explicit retry', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    harness.processTreeTerminator.terminateFailure = new Error('private Job failure')

    harness.ptyPort.processes[0]!.emitExit({ exitCode: 7, signal: null })
    await vi.waitFor(() => {
      expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('FAILED')
    })
    expect(harness.processManager.size).toBe(1)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(0)
    expect(JSON.stringify(harness.events)).not.toContain('private Job failure')

    harness.processTreeTerminator.terminateFailure = undefined
    await expect(harness.service.close({ sessionId: session.sessionId }, harness.context))
      .resolves.toEqual({ status: 'already-closed' })
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(2)
    expect(harness.processManager.size).toBe(0)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
  })
})

describe('Phase 2E-D TerminalService close and cleanup', () => {
  it('keeps CLOSING ownership registered until process-tree termination completes', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const session = await createSession(harness)
    const treeCleanup = deferred<void>()
    harness.processTreeTerminator.terminationBarrier = treeCleanup.promise

    const closing = harness.service.close({ sessionId: session.sessionId }, harness.context)
    await vi.waitFor(() => expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1))
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('CLOSING')
    expect(harness.processManager.size).toBe(1)
    expect(harness.ptyPort.processes[0]?.closeCallCount).toBe(0)
    harness.ptyPort.processes[0]!.emitExit({ exitCode: 1, signal: null })
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('CLOSING')
    expect(harness.processManager.size).toBe(1)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(0)

    treeCleanup.resolve()
    await expect(closing).resolves.toEqual({ status: 'closed' })
    expect(harness.processManager.size).toBe(0)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
  })

  it('transitions RUNNING to CLOSING to EXITED and makes concurrent close idempotent', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!

    const first = harness.service.close({ sessionId: session.sessionId }, harness.context)
    const second = harness.service.close({ sessionId: session.sessionId }, harness.context)
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('CLOSING')
    await vi.waitFor(() => expect(process.closeCallCount).toBe(1))
    process.emitExit({ exitCode: 0, signal: null })

    await expect(first).resolves.toEqual({ status: 'closed' })
    await expect(second).resolves.toEqual({ status: 'already-closed' })
    await expect(harness.service.close(
      { sessionId: session.sessionId },
      harness.context,
    )).resolves.toEqual({ status: 'already-closed' })
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)
    expect(process.disposeCallCount).toBe(1)
  })

  it('fails closed without unregistering ownership when tree termination fails', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    harness.processTreeTerminator.terminateFailure = new Error('private taskkill output')

    await expect(harness.service.close(
      { sessionId: session.sessionId },
      harness.context,
    )).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('FAILED')
    expect(harness.processManager.size).toBe(1)
    expect(harness.ptyPort.processes[0]?.closeCallCount).toBe(0)
    expect(JSON.stringify(harness.events)).not.toContain('private taskkill output')
  })

  it('maps close failure, retains fallback ownership, and cleans on eventual exit', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const process = harness.ptyPort.processes[0]!
    process.failNextClose(new Error('close failed'))

    await expect(harness.service.close(
      { sessionId: session.sessionId },
      harness.context,
    )).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('FAILED')
    expect(harness.processManager.size).toBe(1)
    process.emitExit({ exitCode: 1, signal: null })
    expect(harness.processManager.size).toBe(0)
    expect(process.disposeCallCount).toBe(1)
  })

  it('times out bounded close without erasing the owned fallback resource', async () => {
    const harness = await createHarness()
    const session = await createSession(harness)
    const closing = harness.service.close({ sessionId: session.sessionId }, harness.context)
    await vi.waitFor(() => expect(harness.ptyPort.processes[0]?.closeCallCount).toBe(1))
    harness.scheduler.runDelay(CLOSE_TIMEOUT)

    await expect(closing).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('CLOSING')
    expect(harness.processManager.size).toBe(1)
    harness.ptyPort.processes[0]!.emitExit({ exitCode: 0, signal: null })
    expect(harness.processManager.size).toBe(0)
  })

  it('closes only one owner and continues after another owned session fails', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const first = await createSession(harness)
    const second = await createSession(harness)
    const otherContext = { ...harness.context, ownerWebContentsId: 2 }
    const other = await harness.service.create(
      { projectId: harness.projectId, cols: 80, rows: 24 },
      otherContext,
    )
    harness.ptyPort.processes[0]!.failNextClose(new Error('first close failed'))

    await expect(harness.service.closeSessionsForOwner(1)).rejects.toBeInstanceOf(AggregateError)
    expect(harness.service.getSessionSnapshot(first.sessionId)?.state).toBe('FAILED')
    expect(harness.service.getSessionSnapshot(second.sessionId)?.state).toBe('EXITED')
    expect(harness.service.getSessionSnapshot(other.sessionId)?.state).toBe('RUNNING')
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(2)
    harness.ptyPort.processes[0]!.emitExit({ exitCode: 1, signal: null })
  })

  it('closes by immutable project without retargeting another project session', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const oldSession = await createSession(harness)
    const newProject = await harness.projectService.openRoot('E:\\second-project')
    const newContext = {
      ownerWebContentsId: 1,
      projectId: newProject.id,
    }
    const newSession = await harness.service.create(
      { projectId: newProject.id, cols: 80, rows: 24 },
      newContext,
    )

    expect(harness.service.hasLiveSessionsForProject(harness.projectId)).toBe(true)
    await harness.service.closeSessionsForProject(harness.projectId)
    expect(harness.service.getSessionSnapshot(oldSession.sessionId)?.state).toBe('EXITED')
    expect(harness.service.getSessionSnapshot(newSession.sessionId)?.state).toBe('RUNNING')
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)
  })

  it('supports ProcessManager owner fallback and shutdownAll without cross-owner leakage', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const ownerOne = await createSession(harness)
    const ownerTwoContext = { ...harness.context, ownerWebContentsId: 2 }
    const ownerTwo = await harness.service.create(
      { projectId: harness.projectId, cols: 80, rows: 24 },
      ownerTwoContext,
    )

    await harness.processManager.cleanupOwner('terminal-owner:1')
    expect(harness.service.getSessionSnapshot(ownerOne.sessionId)?.state).toBe('EXITED')
    expect(harness.service.getSessionSnapshot(ownerTwo.sessionId)?.state).toBe('RUNNING')
    await harness.service.shutdownAll()
    expect(harness.service.getSessionSnapshot(ownerTwo.sessionId)?.state).toBe('EXITED')
    expect(harness.processManager.size).toBe(0)
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(2)
  })

  it('bounds exited-session tombstones without retaining native handles', async () => {
    const harness = await createHarness(undefined, 16, 2)
    const sessions = []
    for (let index = 0; index < 3; index += 1) {
      sessions.push(await createSession(harness))
      harness.ptyPort.processes[index]!.emitExit({ exitCode: 0, signal: null })
      await vi.waitFor(() => expect(harness.processManager.size).toBe(0))
    }

    expect(harness.service.getSessionSnapshot(sessions[0]!.sessionId)).toBeNull()
    expect(harness.service.getSessionSnapshot(sessions[1]!.sessionId)?.state).toBe('EXITED')
    expect(harness.service.getSessionSnapshot(sessions[2]!.sessionId)?.state).toBe('EXITED')
    expect(harness.ptyPort.processes.every((process) => process.disposeCallCount === 1))
      .toBe(true)
  })
})

describe('Phase 2E-J Step 3 application shutdown integration', () => {
  it('reaches STOPPED only after a live Job-owned terminal is finalized', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const application = new DesktopApplication([
      harness.processManager,
      harness.service,
    ])
    await application.start()
    await createSession(harness)
    const ownership = harness.ptyPort.processes[0]!.processTreeOwnership

    await expect(application.shutdown()).resolves.toBeUndefined()

    expect(application.getStatus().state).toBe('STOPPED')
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)
    expect(harness.processManager.size).toBe(0)
    expect(ownership.job.isReleased()).toBe(true)
  })

  it('blocks final Electron quit on Job failure and succeeds on a later quit retry', async () => {
    const harness = await createHarness()
    harness.ptyPort.setExitOnClose({ exitCode: 0, signal: null })
    const application = new DesktopApplication([
      harness.processManager,
      harness.service,
    ])
    await application.start()
    const session = await createSession(harness)
    const ownership = harness.ptyPort.processes[0]!.processTreeOwnership
    harness.processTreeTerminator.terminateFailure = new Error('private Job failure')
    const quit = vi.fn()
    const cleanupError = vi.fn()
    const coordinator = new ApplicationQuitCoordinator({
      getApplication: () => application,
      requestApproval: async () => true,
      quit,
      onCleanupError: cleanupError,
    })

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(cleanupError).toHaveBeenCalledOnce())

    expect(application.getStatus().state).toBe('STOPPING')
    expect(harness.processManager.size).toBe(1)
    expect(harness.service.getSessionSnapshot(session.sessionId)?.state).toBe('FAILED')
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1)
    expect(ownership.job.isReleased()).toBe(false)
    expect(quit).not.toHaveBeenCalled()

    harness.processTreeTerminator.terminateFailure = undefined
    coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce())

    expect(application.getStatus().state).toBe('STOPPED')
    expect(harness.processTreeTerminator.terminateCalls).toHaveLength(2)
    expect(harness.processManager.size).toBe(0)
    expect(ownership.job.isReleased()).toBe(true)
  })

  it('waits for natural-root Job finalization before reporting STOPPED', async () => {
    const harness = await createHarness()
    const application = new DesktopApplication([
      harness.processManager,
      harness.service,
    ])
    await application.start()
    await createSession(harness)
    const finalization = deferred<void>()
    harness.processTreeTerminator.terminationBarrier = finalization.promise

    harness.ptyPort.processes[0]!.emitExit({ exitCode: 0, signal: null })
    const shutdown = application.shutdown()
    await vi.waitFor(() => expect(harness.processTreeTerminator.terminateCalls).toHaveLength(1))

    expect(application.getStatus().state).toBe('STOPPING')
    expect(harness.processManager.size).toBe(1)

    finalization.resolve()
    await expect(shutdown).resolves.toBeUndefined()
    expect(application.getStatus().state).toBe('STOPPED')
    expect(harness.processManager.size).toBe(0)
    expect(harness.events.filter(({ event }) => event.type === 'exit')).toHaveLength(1)
  })
})

async function createHarness(
  createSessionId?: () => TerminalSessionId,
  maximumBatchBytes = 16,
  tombstoneLimit = 256,
  shellResolverOverride?: TerminalShellResolver,
): Promise<Harness> {
  const fileSystem: ProjectServiceFileSystem = {
    mkdir: () => Promise.resolve(),
    realpath: (path) => Promise.resolve(path),
    rmdir: () => Promise.resolve(),
    stat: () => Promise.resolve({ isDirectory: () => true }),
  }
  const projectService = new ProjectService(fileSystem, 'win32')
  const project = await projectService.openRoot(ROOT)
  const processManager = new ProcessManager()
  const processTreeTerminator = new FakeProcessTreeTerminator()
  const ptyPort = new FakePtyPort()
  const scheduler = new ManualTerminalScheduler()
  const events: PublishedEvent[] = []
  let nextId = 1
  const shellResolver: TerminalShellResolver = shellResolverOverride ?? {
    resolve: () => Promise.resolve(shellProfile()),
  }
  const service = new TerminalService({
    ptyPort,
    projectService,
    processManager,
    processTreeTerminator,
    shellResolver,
    scheduler,
    createSessionId: createSessionId ?? (() => (
      `terminal_test_${nextId++}` as TerminalSessionId
    )),
    environment: {
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\student',
      OMITTED: undefined,
    },
    batchDelayMilliseconds: BATCH_DELAY,
    maximumBatchBytes,
    tombstoneLimit,
    closeTimeoutMilliseconds: CLOSE_TIMEOUT,
    publish: (ownerId, event) => events.push({ ownerId, event }),
  })
  service.start()
  const context = { ownerWebContentsId: 1, projectId: project.id }
  return {
    service,
    projectService,
    processManager,
    processTreeTerminator,
    ptyPort,
    scheduler,
    events,
    context,
    projectId: project.id,
  }
}

class FakeProcessTreeTerminator implements ProcessTreeTerminator {
  readonly captureCalls: number[] = []
  readonly terminateCalls: ProcessTreeIdentity[] = []
  captureFailure: Error | undefined
  terminateFailure: Error | undefined
  terminationBarrier: Promise<void> | undefined

  async capture(ownership: ProcessTreeOwnership): Promise<ProcessTreeIdentity> {
    this.captureCalls.push(ownership.rootPid)
    if (this.captureFailure) throw this.captureFailure
    return ownership.mode === 'JOB_OWNED'
      ? {
          mode: 'JOB_OWNED',
          rootPid: ownership.rootPid,
          token: ownership.job.token,
          job: ownership.job,
        }
      : {
          mode: 'LEGACY_ROOT_OWNED',
          rootPid: ownership.rootPid,
          fingerprint: `fake:${ownership.rootPid}`,
        }
  }

  async terminate(
    identity: ProcessTreeIdentity,
    stillOwnsIdentity: (identity: ProcessTreeIdentity) => boolean,
  ): Promise<'terminated'> {
    this.terminateCalls.push(identity)
    if (!stillOwnsIdentity(identity)) throw new Error('ownership lost')
    await this.terminationBarrier
    if (this.terminateFailure) throw this.terminateFailure
    if (identity.mode === 'JOB_OWNED') {
      identity.job.terminate()
      identity.job.release()
    }
    return 'terminated'
  }
}

function createSession(harness: Harness, cols = 80, rows = 24) {
  return harness.service.create({
    projectId: harness.projectId,
    cols,
    rows,
  }, harness.context)
}

function shellProfile(): TerminalShellProfile {
  return {
    executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    args: [],
    shellLabel: 'Windows PowerShell',
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}
