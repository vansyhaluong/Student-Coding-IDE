import { randomUUID } from 'node:crypto'

import type { ManagedService } from '../../app/desktop-application'
import { DomainError, invalidInputError, serializeAppError } from '../../errors/app-error'
import type { ProcessManager } from '../process/process-manager'
import type {
  ProcessTreeIdentity,
  ProcessTreeTerminator,
} from '../process/process-tree-terminator'
import type { ProjectService } from '../project/project-service'
import {
  canTransitionTerminalSession,
  isProjectId,
  isTerminalSessionId,
  validateCloseTerminalRequest,
  validateCreateTerminalRequest,
  validateResizeTerminalRequest,
  validateTerminalInputRequest,
  type CloseTerminalRequest,
  type CloseTerminalResponse,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type ProjectId,
  type ResizeTerminalRequest,
  type TerminalEvent,
  type TerminalEventSequence,
  type TerminalInputRequest,
  type TerminalSessionId,
  type TerminalSessionState,
} from '../../../shared/contracts'
import type { PtyExit, PtyPort, PtyProcessPort, PtySubscription } from './pty-port'
import type { TerminalShellResolver } from './shell-resolver'
import { createPtyEnvironment } from './terminal-environment'
import {
  systemTerminalScheduler,
  type TerminalScheduledTask,
  type TerminalScheduler,
} from './terminal-scheduler'

export interface TerminalOwnershipContext {
  ownerWebContentsId: number
  projectId: ProjectId
}

export interface TerminalSessionSnapshot {
  sessionId: TerminalSessionId
  ownerWebContentsId: number
  projectId: ProjectId
  shellLabel: string
  cols: number
  rows: number
  state: TerminalSessionState
}

export interface TerminalProjectTransitionLease {
  readonly hasLiveSessions: boolean
  closeSessions(): Promise<void>
  release(): void
}

export interface TerminalServiceOptions {
  ptyPort: PtyPort
  projectService: ProjectService
  processManager: ProcessManager
  processTreeTerminator: ProcessTreeTerminator
  shellResolver: TerminalShellResolver
  publish: (ownerWebContentsId: number, event: TerminalEvent) => void
  environment?: NodeJS.ProcessEnv
  scheduler?: TerminalScheduler
  createSessionId?: () => TerminalSessionId
  batchDelayMilliseconds?: number
  maximumBatchBytes?: number
  closeTimeoutMilliseconds?: number
  tombstoneLimit?: number
  onEventSinkError?: (error: unknown) => void
}

interface SessionCompletion {
  status: 'exited' | 'failed'
  error?: DomainError
}

interface DeferredCompletion {
  promise: Promise<SessionCompletion>
  resolve(value: SessionCompletion): void
}

interface PendingCreate {
  projectId: ProjectId
  ownerWebContentsId: number
  completion: Promise<void>
  complete(): void
}

interface TerminalSessionRecord {
  sessionId: TerminalSessionId
  ownerWebContentsId: number
  projectId: ProjectId
  cwd: string
  shellLabel: string
  cols: number
  rows: number
  state: TerminalSessionState
  pty: PtyProcessPort | null
  processTreeIdentity: ProcessTreeIdentity | undefined
  nextSequence: number
  queuedData: string
  queuedBytes: number
  batchTask: TerminalScheduledTask | undefined
  dataSubscription: PtySubscription | undefined
  exitSubscription: PtySubscription | undefined
  unregisterResource: (() => void) | undefined
  completion: DeferredCompletion
  pendingCreatingExit: PtyExit | undefined
  rootExit: PtyExit | undefined
  creatingOutputOverflow: boolean
  closeRequested: boolean
  terminationTask: Promise<void> | undefined
  treeTerminationComplete: boolean
  exitEmitted: boolean
  errorEmitted: boolean
  failure: DomainError | undefined
}

const DEFAULT_BATCH_DELAY_MILLISECONDS = 8
const DEFAULT_MAXIMUM_BATCH_BYTES = 64 * 1024
const DEFAULT_CLOSE_TIMEOUT_MILLISECONDS = 2_000
const DEFAULT_TOMBSTONE_LIMIT = 256

export class TerminalService implements ManagedService {
  readonly name = 'TerminalService'
  private readonly sessions = new Map<TerminalSessionId, TerminalSessionRecord>()
  private readonly pendingCreates = new Set<PendingCreate>()
  private readonly blockedProjects = new Map<ProjectId, number>()
  private readonly blockedOwners = new Map<number, number>()
  private readonly tombstones: TerminalSessionId[] = []
  private readonly scheduler: TerminalScheduler
  private readonly createSessionId: () => TerminalSessionId
  private readonly batchDelayMilliseconds: number
  private readonly maximumBatchBytes: number
  private readonly closeTimeoutMilliseconds: number
  private readonly tombstoneLimit: number
  private started = false

  constructor(private readonly options: TerminalServiceOptions) {
    this.scheduler = options.scheduler ?? systemTerminalScheduler
    this.createSessionId = options.createSessionId
      ?? (() => `terminal_${randomUUID()}` as TerminalSessionId)
    this.batchDelayMilliseconds = positiveInteger(
      options.batchDelayMilliseconds,
      DEFAULT_BATCH_DELAY_MILLISECONDS,
    )
    this.maximumBatchBytes = positiveInteger(
      options.maximumBatchBytes,
      DEFAULT_MAXIMUM_BATCH_BYTES,
    )
    this.closeTimeoutMilliseconds = positiveInteger(
      options.closeTimeoutMilliseconds,
      DEFAULT_CLOSE_TIMEOUT_MILLISECONDS,
    )
    this.tombstoneLimit = positiveInteger(
      options.tombstoneLimit,
      DEFAULT_TOMBSTONE_LIMIT,
    )
  }

  start(): void {
    this.started = true
  }

  async stop(): Promise<void> {
    this.started = false
    await this.shutdownAll()
    this.sessions.clear()
    this.tombstones.length = 0
  }

  async create(
    request: CreateTerminalRequest,
    context: TerminalOwnershipContext,
  ): Promise<CreateTerminalResponse> {
    this.ensureStarted('terminal:create')
    assertValid(validateCreateTerminalRequest(request), 'terminal:create')
    this.validateContext(context, request.projectId, 'terminal:create')
    this.ensureCreateAllowed(request.projectId, context.ownerWebContentsId)
    const pending = createPendingCreate(request.projectId, context.ownerWebContentsId)
    this.pendingCreates.add(pending)
    try {
      return await this.createTracked(request, context)
    } finally {
      this.pendingCreates.delete(pending)
      pending.complete()
    }
  }

  private async createTracked(
    request: CreateTerminalRequest,
    context: TerminalOwnershipContext,
  ): Promise<CreateTerminalResponse> {
    this.options.projectService.getAuthorizedProject(request.projectId)
    const shell = await this.options.shellResolver.resolve()
    this.ensureStarted('terminal:create')
    this.ensureCreateAllowed(request.projectId, context.ownerWebContentsId)
    const project = this.options.projectService.getAuthorizedProject(request.projectId)
    const sessionId = this.generateSessionId()
    let pty: PtyProcessPort
    try {
      pty = this.options.ptyPort.spawn({
        executable: shell.executable,
        args: shell.args,
        cwd: project.canonicalRoot,
        env: createPtyEnvironment(this.options.environment ?? process.env),
        cols: request.cols,
        rows: request.rows,
        name: 'xterm-256color',
      })
    } catch (error) {
      throw spawnFailure(error)
    }

    const record: TerminalSessionRecord = {
      sessionId,
      ownerWebContentsId: context.ownerWebContentsId,
      projectId: project.id,
      cwd: project.canonicalRoot,
      shellLabel: shell.shellLabel,
      cols: request.cols,
      rows: request.rows,
      state: 'CREATING',
      pty,
      processTreeIdentity: undefined,
      nextSequence: 0,
      queuedData: '',
      queuedBytes: 0,
      batchTask: undefined,
      dataSubscription: undefined,
      exitSubscription: undefined,
      unregisterResource: undefined,
      completion: deferredCompletion(),
      pendingCreatingExit: undefined,
      rootExit: undefined,
      creatingOutputOverflow: false,
      closeRequested: false,
      terminationTask: undefined,
      treeTerminationComplete: false,
      exitEmitted: false,
      errorEmitted: false,
      failure: undefined,
    }
    this.sessions.set(sessionId, record)

    try {
      record.dataSubscription = pty.onData((data) => this.handleData(record, data))
      record.exitSubscription = pty.onExit((event) => this.handleExit(record, event))
      record.processTreeIdentity = await this.options.processTreeTerminator.capture(
        pty.processTreeOwnership,
      )
      if (record.pendingCreatingExit) {
        throw new Error('The terminal process exited during creation.')
      }
      if (record.creatingOutputOverflow) {
        throw new Error('The terminal emitted excessive output during creation.')
      }
      record.unregisterResource = this.options.processManager.register({
        id: resourceId(sessionId),
        ownerId: processOwnerId(context.ownerWebContentsId),
        close: () => this.closeOwnedRecord(record),
      })
      this.transition(record, 'RUNNING')
      if (record.queuedBytes > 0) this.scheduleBatch(record)
    } catch (error) {
      let cleanupError: unknown
      try {
        await this.cleanupPartialCreate(record)
      } catch (candidate) {
        cleanupError = candidate
      }
      const code = error instanceof Error && error.message.includes('already registered')
        ? 'SERVICE_CRASHED'
        : 'PROCESS_FAILED'
      throw new DomainError({
        code,
        message: code === 'SERVICE_CRASHED'
          ? 'Terminal resource registration failed.'
          : 'The terminal process failed during creation.',
        operation: 'terminal:create',
        retryable: false,
      }, {
        cause: cleanupError === undefined
          ? error
          : new AggregateError(
              [error, cleanupError],
              'Terminal creation and fail-closed cleanup both failed.',
            ),
      })
    }

    return {
      sessionId,
      projectId: project.id,
      state: 'RUNNING',
      cols: record.cols,
      rows: record.rows,
      shellLabel: record.shellLabel,
    }
  }

  input(request: TerminalInputRequest, context: TerminalOwnershipContext): void {
    this.ensureStarted('terminal:input')
    assertValid(validateTerminalInputRequest(request), 'terminal:input')
    const record = this.authorize(request.sessionId, context, 'terminal:input')
    this.requireRunning(record, 'terminal:input')
    try {
      record.pty?.write(request.data)
    } catch (error) {
      const failure = processFailure(
        'terminal:input',
        'The terminal process rejected input.',
        error,
      )
      this.failRecord(record, failure, true)
      throw failure
    }
  }

  resize(request: ResizeTerminalRequest, context: TerminalOwnershipContext): void {
    this.ensureStarted('terminal:resize')
    assertValid(validateResizeTerminalRequest(request), 'terminal:resize')
    const record = this.authorize(request.sessionId, context, 'terminal:resize')
    this.requireRunning(record, 'terminal:resize')
    if (record.cols === request.cols && record.rows === request.rows) return
    try {
      record.pty?.resize(request.cols, request.rows)
    } catch (error) {
      const failure = processFailure(
        'terminal:resize',
        'The terminal process could not be resized.',
        error,
      )
      this.failRecord(record, failure, true)
      throw failure
    }
    record.cols = request.cols
    record.rows = request.rows
  }

  async close(
    request: CloseTerminalRequest,
    context: TerminalOwnershipContext,
  ): Promise<CloseTerminalResponse> {
    this.ensureStarted('terminal:close')
    assertValid(validateCloseTerminalRequest(request), 'terminal:close')
    const record = this.authorize(request.sessionId, context, 'terminal:close')
    const firstClose = record.state === 'RUNNING'
    await this.requestClose(record, 'terminal:close')
    return { status: firstClose ? 'closed' : 'already-closed' }
  }

  hasLiveSessionsForProject(projectId: ProjectId): boolean {
    return [...this.sessions.values()].some(
      (record) => record.projectId === projectId && record.pty !== null,
    )
  }

  async acquireProjectTransition(
    projectId: ProjectId,
  ): Promise<TerminalProjectTransitionLease> {
    if (!isProjectId(projectId)) {
      throw invalidInputError('terminal:project-transition', ['$.projectId'])
    }
    this.blockScope(this.blockedProjects, projectId)
    let released = false
    try {
      await this.waitForPendingCreates(
        (pending) => pending.projectId === projectId,
      )
    } catch (error) {
      this.unblockScope(this.blockedProjects, projectId)
      throw error
    }
    return {
      hasLiveSessions: this.hasLiveSessionsForProject(projectId),
      closeSessions: () => this.closeSessionsForProject(projectId),
      release: () => {
        if (released) return
        released = true
        this.unblockScope(this.blockedProjects, projectId)
      },
    }
  }

  getSessionSnapshot(sessionId: TerminalSessionId): TerminalSessionSnapshot | null {
    const record = this.sessions.get(sessionId)
    return record ? snapshot(record) : null
  }

  listSessionsForProject(projectId: ProjectId): TerminalSessionSnapshot[] {
    return [...this.sessions.values()]
      .filter((record) => record.projectId === projectId)
      .map(snapshot)
  }

  async closeSessionsForOwner(ownerWebContentsId: number): Promise<void> {
    this.blockScope(this.blockedOwners, ownerWebContentsId)
    try {
      await this.waitForPendingCreates(
        (pending) => pending.ownerWebContentsId === ownerWebContentsId,
      )
      await this.closeRecords(
        [...this.sessions.values()].filter(
          (record) => record.ownerWebContentsId === ownerWebContentsId && record.pty !== null,
        ),
        'terminal:close-owner',
      )
    } finally {
      this.unblockScope(this.blockedOwners, ownerWebContentsId)
    }
  }

  async closeSessionsForProject(projectId: ProjectId): Promise<void> {
    this.blockScope(this.blockedProjects, projectId)
    try {
      await this.waitForPendingCreates((pending) => pending.projectId === projectId)
      await this.closeRecords(
        [...this.sessions.values()].filter(
          (record) => record.projectId === projectId && record.pty !== null,
        ),
        'terminal:close-project',
      )
    } finally {
      this.unblockScope(this.blockedProjects, projectId)
    }
  }

  async shutdownAll(): Promise<void> {
    this.started = false
    await this.waitForPendingCreates(() => true)
    await this.closeRecords(
      [...this.sessions.values()].filter((record) => record.pty !== null),
      'terminal:shutdown',
    )
  }

  private async closeRecords(
    records: readonly TerminalSessionRecord[],
    operation: string,
  ): Promise<void> {
    const errors: unknown[] = []
    for (const record of records) {
      try {
        await this.requestClose(record, operation)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more terminal sessions failed to close.')
    }
  }

  private async requestClose(
    record: TerminalSessionRecord,
    operation: string,
  ): Promise<void> {
    if (record.pty === null) return
    if (record.state === 'RUNNING') this.transition(record, 'CLOSING')
    if (record.state === 'CREATING') {
      throw serviceInvariant('A creating terminal cannot be closed publicly.', operation)
    }

    if (!record.terminationTask) {
      record.terminationTask = this.terminateOwnedTree(record, operation)
    }
    await record.terminationTask

    const completion = await this.waitForCompletion(record)
    if (!completion) {
      throw processFailure(
        operation,
        'Timed out waiting for the terminal process to exit.',
      )
    }
  }

  private closeOwnedRecord(record: TerminalSessionRecord): Promise<void> {
    return this.requestClose(record, 'terminal:owned-cleanup')
  }

  private async terminateOwnedTree(
    record: TerminalSessionRecord,
    operation: string,
  ): Promise<void> {
    const pty = record.pty
    const identity = record.processTreeIdentity
    if (!pty || !identity || identity.rootPid !== pty.pid) {
      const failure = processFailure(
        operation,
        'The terminal process identity is unavailable for safe cleanup.',
      )
      this.failRecord(record, failure, false)
      record.terminationTask = undefined
      throw failure
    }

    try {
      await this.options.processTreeTerminator.terminate(
        identity,
        (candidate) => this.stillOwnsIdentity(record, pty, candidate),
      )
      record.treeTerminationComplete = true
      pty.close()
      record.closeRequested = true
      if (record.rootExit && record.pty !== null) {
        this.finalizeExit(record, record.rootExit)
      }
    } catch (error) {
      const failure = processFailure(
        operation,
        'The owned terminal process tree could not be closed safely.',
        error,
      )
      this.failRecord(record, failure, false)
      record.terminationTask = undefined
      throw failure
    }
  }

  private stillOwnsIdentity(
    record: TerminalSessionRecord,
    pty: PtyProcessPort,
    identity: ProcessTreeIdentity,
  ): boolean {
    const recordedIdentity = record.processTreeIdentity
    return this.sessions.get(record.sessionId) === record
      && record.pty === pty
      && pty.pid === identity.rootPid
      && recordedIdentity === identity
      && (
        identity.mode === 'LEGACY_ROOT_OWNED'
        || (
          pty.processTreeOwnership.mode === 'JOB_OWNED'
          && pty.processTreeOwnership.job.token === identity.token
        )
      )
      && (record.state === 'CLOSING' || record.state === 'FAILED')
  }

  private waitForCompletion(
    record: TerminalSessionRecord,
  ): Promise<SessionCompletion | null> {
    return new Promise((resolve) => {
      let settled = false
      const timeout = this.scheduler.schedule(() => {
        if (settled) return
        settled = true
        resolve(null)
      }, this.closeTimeoutMilliseconds)
      void record.completion.promise.then((completion) => {
        if (settled) return
        settled = true
        timeout.cancel()
        resolve(completion)
      })
    })
  }

  private authorize(
    sessionId: TerminalSessionId,
    context: TerminalOwnershipContext,
    operation: string,
  ): TerminalSessionRecord {
    const record = this.sessions.get(sessionId)
    if (!record) {
      throw new DomainError({
        code: 'NOT_FOUND',
        message: 'The terminal session was not found.',
        operation,
        retryable: false,
      })
    }
    this.validateContext(context, record.projectId, operation)
    if (record.ownerWebContentsId !== context.ownerWebContentsId) {
      throw permissionDenied(operation)
    }
    this.options.projectService.getAuthorizedProject(context.projectId)
    return record
  }

  private validateContext(
    context: TerminalOwnershipContext,
    expectedProjectId: ProjectId,
    operation: string,
  ): void {
    if (
      !Number.isSafeInteger(context.ownerWebContentsId)
      || context.ownerWebContentsId <= 0
      || !isProjectId(context.projectId)
    ) {
      throw new DomainError({
        code: 'INVALID_INPUT',
        message: 'The terminal ownership context is invalid.',
        operation,
        retryable: false,
      })
    }
    if (context.projectId !== expectedProjectId) throw permissionDenied(operation)
  }

  private requireRunning(record: TerminalSessionRecord, operation: string): void {
    if (record.state !== 'RUNNING' || !record.pty) {
      throw processFailure(operation, 'The terminal session is not running.')
    }
  }

  private handleData(record: TerminalSessionRecord, data: string): void {
    if (!data || record.pty === null) return
    if (record.state !== 'CREATING' && record.state !== 'RUNNING' && record.state !== 'CLOSING') {
      return
    }

    for (const part of splitUtf8(data, this.maximumBatchBytes)) {
      const bytes = Buffer.byteLength(part, 'utf8')
      if (record.state === 'CREATING' && record.queuedBytes + bytes > this.maximumBatchBytes) {
        record.creatingOutputOverflow = true
        return
      }
      if (record.queuedBytes > 0 && record.queuedBytes + bytes > this.maximumBatchBytes) {
        this.flushOutput(record)
      }
      record.queuedData += part
      record.queuedBytes += bytes
      if (record.queuedBytes >= this.maximumBatchBytes && record.state !== 'CREATING') {
        this.flushOutput(record)
      }
    }
    if (record.state !== 'CREATING' && record.queuedBytes > 0) this.scheduleBatch(record)
  }

  private scheduleBatch(record: TerminalSessionRecord): void {
    if (record.batchTask || record.queuedBytes === 0) return
    record.batchTask = this.scheduler.schedule(() => {
      record.batchTask = undefined
      if (record.state === 'RUNNING' || record.state === 'CLOSING') {
        this.flushOutput(record)
      }
    }, this.batchDelayMilliseconds)
  }

  private flushOutput(record: TerminalSessionRecord): void {
    record.batchTask?.cancel()
    record.batchTask = undefined
    if (record.queuedBytes === 0) return
    const data = record.queuedData
    record.queuedData = ''
    record.queuedBytes = 0
    const sequence = record.nextSequence as TerminalEventSequence
    record.nextSequence += 1
    this.publish(record, {
      type: 'data',
      sessionId: record.sessionId,
      projectId: record.projectId,
      sequence,
      data,
    })
  }

  private handleExit(record: TerminalSessionRecord, event: PtyExit): void {
    if (record.pty === null) return
    if (record.state === 'CREATING') {
      record.pendingCreatingExit = event
      return
    }
    if (record.state === 'EXITED') return
    if (record.state !== 'RUNNING' && record.state !== 'CLOSING' && record.state !== 'FAILED') {
      return
    }

    record.rootExit ??= event
    if (record.treeTerminationComplete) {
      this.finalizeExit(record, record.rootExit)
      return
    }
    if (record.state === 'RUNNING') this.transition(record, 'CLOSING')
    if (!record.terminationTask) {
      record.terminationTask = this.terminateOwnedTree(record, 'terminal:natural-exit')
      void record.terminationTask.catch(() => undefined)
    }
  }

  private finalizeExit(record: TerminalSessionRecord, event: PtyExit): void {
    if (!record.treeTerminationComplete) {
      throw serviceInvariant(
        'Terminal exit cannot finalize before process-tree cleanup.',
        'terminal:exit',
      )
    }
    this.flushOutput(record)
    if (record.state !== 'FAILED' && record.state !== 'EXITED') {
      this.transition(record, 'EXITED')
    }
    this.releaseProcess(record)
    record.completion.resolve(record.state === 'FAILED'
      ? { status: 'failed', error: record.failure }
      : { status: 'exited' })
    this.rememberTombstone(record)
    if (record.exitEmitted) return
    record.exitEmitted = true
    this.publish(record, {
      type: 'exit',
      sessionId: record.sessionId,
      projectId: record.projectId,
      exitCode: event.exitCode,
      signal: event.signal,
    })
  }

  private failRecord(
    record: TerminalSessionRecord,
    failure: DomainError,
    requestClose: boolean,
  ): void {
    if (record.state === 'EXITED' || record.state === 'FAILED') return
    this.flushOutput(record)
    this.transition(record, 'FAILED')
    record.failure = failure
    this.cancelBatch(record)
    if (!record.errorEmitted) {
      record.errorEmitted = true
      this.publish(record, {
        type: 'error',
        sessionId: record.sessionId,
        projectId: record.projectId,
        error: serializeAppError(failure),
      })
    }
    if (requestClose && record.pty && !record.closeRequested) {
      try {
        record.pty.close()
        record.closeRequested = true
      } catch {
        // Keep the owned resource registered so a later bounded cleanup can retry.
      }
    }
  }

  private async cleanupPartialCreate(record: TerminalSessionRecord): Promise<void> {
    const pty = record.pty
    if (!pty) return
    if (record.state === 'CREATING') this.transition(record, 'FAILED')
    record.processTreeIdentity ??= await this.options.processTreeTerminator.capture(
      pty.processTreeOwnership,
    )

    try {
      await this.options.processTreeTerminator.terminate(
        record.processTreeIdentity,
        (candidate) => this.stillOwnsIdentity(record, pty, candidate),
      )
      record.treeTerminationComplete = true
      pty.close()
      record.closeRequested = true
    } catch (error) {
      // Creation is not returned to the caller, but cleanup authority must remain
      // reachable for owner/project/service cleanup if fail-closed finalization fails.
      if (!record.unregisterResource) {
        record.unregisterResource = this.options.processManager.register({
          id: recoveryResourceId(record.sessionId),
          ownerId: processOwnerId(record.ownerWebContentsId),
          close: () => this.closeOwnedRecord(record),
        })
      }
      record.terminationTask = undefined
      throw error
    }

    this.sessions.delete(record.sessionId)
    this.releaseProcess(record)
  }

  private releaseProcess(record: TerminalSessionRecord): void {
    this.cancelBatch(record)
    record.dataSubscription?.dispose()
    record.dataSubscription = undefined
    record.exitSubscription?.dispose()
    record.exitSubscription = undefined
    record.unregisterResource?.()
    record.unregisterResource = undefined
    record.processTreeIdentity = undefined
    record.pty?.dispose()
    record.pty = null
  }

  private cancelBatch(record: TerminalSessionRecord): void {
    record.batchTask?.cancel()
    record.batchTask = undefined
    record.queuedData = ''
    record.queuedBytes = 0
  }

  private rememberTombstone(record: TerminalSessionRecord): void {
    this.tombstones.push(record.sessionId)
    while (this.tombstones.length > this.tombstoneLimit) {
      const expired = this.tombstones.shift()
      if (expired) this.sessions.delete(expired)
    }
  }

  private transition(record: TerminalSessionRecord, next: TerminalSessionState): void {
    if (!canTransitionTerminalSession(record.state, next)) {
      throw serviceInvariant(
        `Invalid terminal transition ${record.state} -> ${next}.`,
        'terminal:transition',
      )
    }
    record.state = next
  }

  private publish(record: TerminalSessionRecord, event: TerminalEvent): void {
    try {
      this.options.publish(record.ownerWebContentsId, event)
    } catch (error) {
      this.options.onEventSinkError?.(error)
    }
  }

  private generateSessionId(): TerminalSessionId {
    const sessionId = this.createSessionId()
    if (!isTerminalSessionId(sessionId) || this.sessions.has(sessionId)) {
      throw serviceInvariant('Terminal session ID generation failed.', 'terminal:create')
    }
    return sessionId
  }

  private ensureStarted(operation: string): void {
    if (!this.started) {
      throw new DomainError({
        code: 'SERVICE_CRASHED',
        message: 'The terminal service is not available.',
        operation,
        retryable: true,
      })
    }
  }

  private ensureCreateAllowed(
    projectId: ProjectId,
    ownerWebContentsId: number,
  ): void {
    if (
      (this.blockedProjects.get(projectId) ?? 0) > 0
      || (this.blockedOwners.get(ownerWebContentsId) ?? 0) > 0
    ) {
      throw new DomainError({
        code: 'PROCESS_CANCELLED',
        message: 'Terminal creation was cancelled by a lifecycle transition.',
        operation: 'terminal:create',
        retryable: true,
      })
    }
  }

  private waitForPendingCreates(
    matches: (pending: PendingCreate) => boolean,
  ): Promise<void> {
    return Promise.all(
      [...this.pendingCreates].filter(matches).map((pending) => pending.completion),
    ).then(() => undefined)
  }

  private blockScope<TKey>(scopes: Map<TKey, number>, key: TKey): void {
    scopes.set(key, (scopes.get(key) ?? 0) + 1)
  }

  private unblockScope<TKey>(scopes: Map<TKey, number>, key: TKey): void {
    const count = scopes.get(key) ?? 0
    if (count <= 1) scopes.delete(key)
    else scopes.set(key, count - 1)
  }
}

function createPendingCreate(
  projectId: ProjectId,
  ownerWebContentsId: number,
): PendingCreate {
  let complete = (): void => undefined
  const completion = new Promise<void>((resolve) => { complete = resolve })
  return { projectId, ownerWebContentsId, completion, complete }
}

function assertValid(
  validation: { ok: true } | { ok: false; issues: Array<{ path: string }> },
  operation: string,
): void {
  if (!validation.ok) {
    throw invalidInputError(operation, validation.issues.map((issue) => issue.path))
  }
}

function permissionDenied(operation: string): DomainError {
  return new DomainError({
    code: 'PERMISSION_DENIED',
    message: 'The terminal session is owned by another renderer or project.',
    operation,
    retryable: false,
  })
}

function processFailure(
  operation: string,
  message: string,
  cause?: unknown,
): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED',
    message,
    operation,
    retryable: false,
  }, cause === undefined ? undefined : { cause })
}

function spawnFailure(error: unknown): DomainError {
  const nativeCode = error instanceof Error && 'code' in error
    ? String(error.code)
    : ''
  const nativeMessage = error instanceof Error ? error.message : ''
  const missingNativeDependency = nativeCode === 'MODULE_NOT_FOUND'
    || nativeCode === 'ERR_DLOPEN_FAILED'
    || /(?:conpty|pty)\.node|winpty\.dll/i.test(nativeMessage)
  return new DomainError({
    code: missingNativeDependency ? 'DEPENDENCY_MISSING' : 'PROCESS_FAILED',
    message: missingNativeDependency
      ? 'The native terminal provider is unavailable.'
      : 'The terminal process could not be started.',
    operation: 'terminal:create',
    retryable: false,
  }, { cause: error })
}

function serviceInvariant(message: string, operation: string): DomainError {
  return new DomainError({
    code: 'SERVICE_CRASHED',
    message,
    operation,
    retryable: false,
  })
}

function deferredCompletion(): DeferredCompletion {
  let resolvePromise: (value: SessionCompletion) => void = () => undefined
  const promise = new Promise<SessionCompletion>((resolve) => {
    resolvePromise = resolve
  })
  let resolved = false
  return {
    promise,
    resolve(value): void {
      if (resolved) return
      resolved = true
      resolvePromise(value)
    },
  }
}

function resourceId(sessionId: TerminalSessionId): string {
  return `terminal:${sessionId}`
}

function recoveryResourceId(sessionId: TerminalSessionId): string {
  return `terminal-recovery:${sessionId}`
}

function processOwnerId(ownerWebContentsId: number): string {
  return `terminal-owner:${ownerWebContentsId}`
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback
}

function snapshot(record: TerminalSessionRecord): TerminalSessionSnapshot {
  return {
    sessionId: record.sessionId,
    ownerWebContentsId: record.ownerWebContentsId,
    projectId: record.projectId,
    shellLabel: record.shellLabel,
    cols: record.cols,
    rows: record.rows,
    state: record.state,
  }
}

function splitUtf8(value: string, maximumBytes: number): string[] {
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) return [value]
  const parts: string[] = []
  let current = ''
  let currentBytes = 0
  for (const character of value) {
    const bytes = Buffer.byteLength(character, 'utf8')
    if (currentBytes + bytes > maximumBytes && current) {
      parts.push(current)
      current = ''
      currentBytes = 0
    }
    current += character
    currentBytes += bytes
  }
  if (current) parts.push(current)
  return parts
}
