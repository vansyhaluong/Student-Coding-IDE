import { randomUUID } from 'node:crypto'
import { RUN_SOURCE_GUARD_CHANNELS, RUN_SOURCE_GUARD_LIMITS, validateRunSourceGuardReply,
  type RunSourceGuardRequest, type RunSourceGuardReply, type RunSourceGuardReason } from '../../../shared/contracts/run-source-guard'
import type { RunSession, RunSessionId } from '../../../shared/contracts/run'
import type { ManagedService } from '../../app/desktop-application'
import { DomainError, invalidInputError } from '../../errors/app-error'
import type { IpcHandlerRegistry, IpcRequestContext } from '../../ipc/ipc-handler-registry'

export interface RunSourceLease {
  check(): Promise<void>
  assertValid(): void
  release(): void
}
export interface RunSourceGuardPort {
  open(session: RunSession, ownerId: number, signal: AbortSignal,
    invalidated: (error: DomainError) => void): RunSourceLease
}
interface RecordState {
  session: RunSession
  ownerId: number
  signal: AbortSignal
  invalidated(error: DomainError): void
  baseline?: number
  request?: RunSourceGuardRequest
  pending?: { resolve(): void; reject(error: DomainError): void; timer: ReturnType<typeof setTimeout> }
  failure?: DomainError
  abort(): void
}
export interface RunSourceGuardOptions {
  /** Synchronous Main authority: live owner/frame, active project and owned session. */
  authorize(session: RunSession, ownerId: number): void
  authorizeReply?(context: IpcRequestContext): void
  send(ownerId: number, channel: string, request: RunSourceGuardRequest): void
}

/** Approval/revision records only; no Monaco state or filesystem/process capability. */
export class RunSourceGuard implements RunSourceGuardPort, ManagedService {
  readonly name = 'RunSourceGuard'
  private readonly records = new Map<RunSessionId, RecordState>()
  private removeHandler?: () => void
  private stopped = false
  constructor(private readonly registry: IpcHandlerRegistry, private readonly options: RunSourceGuardOptions) {}
  start(): void {
    this.removeHandler = this.registry.register({ channel: RUN_SOURCE_GUARD_CHANNELS.reply,
      validate: validateRunSourceGuardReply,
      handle: (reply, context) => {
        this.options.authorizeReply?.(context)
        this.receive(reply, context.senderId); return null
      } })
  }
  open(session: RunSession, ownerId: number, signal: AbortSignal,
    invalidated: (error: DomainError) => void): RunSourceLease {
    if (this.stopped || signal.aborted) throw sourceGuardError('SOURCE_GUARD_CANCELLED')
    this.options.authorize(session, ownerId)
    if (this.records.has(session.sessionId)) throw invalidInputError('run:source-guard', ['session'])
    if (this.records.size >= RUN_SOURCE_GUARD_LIMITS.maximumSessions) throw sourceGuardError('SOURCE_GUARD_LIMIT_EXCEEDED')
    const record: RecordState = { session, ownerId, signal, invalidated,
      abort: () => this.release(record) }
    this.records.set(session.sessionId, record)
    signal.addEventListener('abort', record.abort, { once: true })
    const assertValid = () => {
      if (record.failure) throw record.failure
      if (signal.aborted || this.records.get(session.sessionId) !== record) throw sourceGuardError('SOURCE_GUARD_CANCELLED')
      try { this.options.authorize(session, ownerId) }
      catch { throw sourceGuardError('SOURCE_GUARD_UNAVAILABLE') }
    }
    return {
      assertValid: () => { assertValid(); if (record.baseline === undefined) throw sourceGuardError('SOURCE_STATE_UNKNOWN') },
      release: () => this.release(record),
      check: () => {
        try { assertValid() } catch (error) { return Promise.reject(error) }
        if (record.pending) return Promise.reject(invalidInputError('run:source-guard', ['request']))
        this.retireRequest(record)
        record.request = Object.freeze({ projectId: session.projectId, sessionId: session.sessionId,
          requestId: `source_${randomUUID().replaceAll('-', '')}` })
        return new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => this.fail(record, 'SOURCE_GUARD_TIMEOUT'), RUN_SOURCE_GUARD_LIMITS.timeoutMs)
          record.pending = { resolve, reject, timer }
          try { this.options.send(ownerId, RUN_SOURCE_GUARD_CHANNELS.requested, record.request!) }
          catch { this.fail(record, 'SOURCE_GUARD_UNAVAILABLE') }
        })
      },
    }
  }
  receive(value: RunSourceGuardReply, ownerId: number): void {
    const validated = validateRunSourceGuardReply(value)
    if (!validated.ok) throw invalidInputError('run:source-guard', ['reply'])
    const reply = validated.value, record = this.records.get(reply.sessionId)
    if (!record || record.failure || record.signal.aborted || record.ownerId !== ownerId) {
      throw new DomainError({ code: 'PERMISSION_DENIED', retryable: false, operation: 'run:source-guard',
        message: 'The source guard request is not owned by this window.' })
    }
    if (record.request?.requestId !== reply.requestId || record.session.projectId !== reply.projectId) {
      throw invalidInputError('run:source-guard', ['request', 'project'])
    }
    try { this.options.authorize(record.session, ownerId) }
    catch { this.fail(record, 'SOURCE_GUARD_UNAVAILABLE'); throw sourceGuardError('SOURCE_GUARD_UNAVAILABLE') }
    const reason = reply.revision === null ? 'SOURCE_STATE_UNKNOWN'
      : reply.conflict ? 'SOURCE_CONFLICT' : reply.dirty ? 'SOURCE_DIRTY'
        : record.baseline !== undefined && record.baseline !== reply.revision ? 'SOURCE_CHANGED' : undefined
    if (reason) { this.fail(record, reason); return }
    if (!record.pending) throw invalidInputError('run:source-guard', ['staleReply'])
    record.baseline ??= reply.revision!
    const pending = record.pending
    clearTimeout(pending.timer); record.pending = undefined
    pending.resolve()
  }
  invalidateOwner(ownerId: number): void {
    for (const record of this.records.values()) if (record.ownerId === ownerId) this.fail(record, 'SOURCE_GUARD_UNAVAILABLE')
  }
  stop(): void {
    this.stopped = true
    for (const record of [...this.records.values()]) {
      this.fail(record, 'SOURCE_GUARD_UNAVAILABLE'); this.release(record)
    }
    this.removeHandler?.(); this.removeHandler = undefined
  }
  get size(): number { return this.records.size }
  private fail(record: RecordState, reason: RunSourceGuardReason): void {
    if (record.failure || this.records.get(record.session.sessionId) !== record) return
    const error = sourceGuardError(reason)
    record.failure = error
    const pending = record.pending
    if (pending) { clearTimeout(pending.timer); record.pending = undefined; pending.reject(error) }
    // Initial refusal is handled by check(); after approval, invalidate active preparation/build.
    if (record.baseline !== undefined) record.invalidated(error)
  }
  private retireRequest(record: RecordState): void {
    if (!record.request) return
    try { this.options.send(record.ownerId, RUN_SOURCE_GUARD_CHANNELS.released, record.request) }
    catch { /* The record still retires when its owner is already gone. */ }
    record.request = undefined
  }
  private release(record: RecordState): void {
    if (this.records.get(record.session.sessionId) !== record) return
    this.records.delete(record.session.sessionId)
    record.signal.removeEventListener('abort', record.abort)
    if (record.pending) {
      clearTimeout(record.pending.timer)
      record.pending.reject(record.failure ?? sourceGuardError('SOURCE_GUARD_CANCELLED'))
      record.pending = undefined
    }
    this.retireRequest(record)
  }
}
export function sourceGuardError(reason: RunSourceGuardReason): DomainError {
  return new DomainError({ code: 'PROCESS_CANCELLED', retryable: false, operation: 'run:source-guard',
    message: reason === 'SOURCE_DIRTY' ? 'Save all project files before running.'
      : reason === 'SOURCE_CONFLICT' ? 'Resolve project file conflicts before running.'
        : 'Saved-source verification failed. Check the project files and run again.', details: { reason } })
}
