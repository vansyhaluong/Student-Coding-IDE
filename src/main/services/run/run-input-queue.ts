import { Buffer } from 'node:buffer'
import type { ProjectId } from '../../../shared/contracts/project'
import { prepareRunInputText, RUN_INPUT_LIMITS, type CloseRunInputRequest,
  type RunInputAcknowledgement, type RunInputGateReason, type RunInputRejectionReason,
  type RunInputStatus, type RunSessionId, type SendRunInputRequest } from '../../../shared/contracts/run'
import type { RunInputWriteStatus } from './piped-process-adapter'

/** Pipe delivery for one owned execute step. Completion is the write, not ReadLine. */
export interface RunInputWriter {
  writeInput(bytes: Uint8Array): Promise<RunInputWriteStatus>
  closeInput(): Promise<void>
}

interface QueuedInput {
  readonly sequence: number
  readonly kind: 'bytes' | 'eof'
  readonly payload: Uint8Array
  done: boolean
  resolve(acknowledgement: RunInputAcknowledgement): void
}

/**
 * One session, one ordered queue. Bytes already accepted stay put when a new
 * submission is busy. Stop and the other lifecycle closes discard the tail
 * instead of writing it. EOF drains the tail, then closes the pipe once.
 */
export class RunInputQueue {
  private nextSequence = RUN_INPUT_LIMITS.minimumSequence
  private reason: RunInputGateReason | undefined
  private readonly pending: QueuedInput[] = []
  private active: QueuedInput | undefined
  private bytes = 0
  private pumping = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private eofSequence: number | undefined
  private eofPromise: Promise<RunInputAcknowledgement> | undefined

  constructor(private readonly projectId: ProjectId, private readonly sessionId: RunSessionId,
    private readonly writer: RunInputWriter, private readonly onWriteTimeout: () => void) {}

  submit(request: SendRunInputRequest): Promise<RunInputAcknowledgement> {
    if (this.reason !== undefined) return Promise.resolve(this.rejected(request.sequence, 'INPUT_CLOSED'))
    if (request.sequence !== this.nextSequence) return Promise.resolve(this.rejected(request.sequence, 'SEQUENCE_MISMATCH'))
    const prepared = prepareRunInputText(request.text)
    if (!prepared.ok) return Promise.resolve(this.rejected(request.sequence, 'INVALID_INPUT'))
    const payload = Buffer.from(prepared.value, 'utf8')
    if (this.full(payload.byteLength)) return Promise.resolve(this.rejected(request.sequence, 'INPUT_BUSY'))
    return this.enqueue(request.sequence, 'bytes', payload)
  }

  close(request: CloseRunInputRequest): Promise<RunInputAcknowledgement> {
    if (this.eofSequence !== undefined) {
      return request.sequence === this.eofSequence && this.eofPromise
        ? this.eofPromise
        : Promise.resolve(this.rejected(request.sequence, 'INPUT_CLOSED'))
    }
    if (this.reason !== undefined) return Promise.resolve(this.rejected(request.sequence, 'INPUT_CLOSED'))
    if (request.sequence !== this.nextSequence) return Promise.resolve(this.rejected(request.sequence, 'SEQUENCE_MISMATCH'))
    if (this.full(0)) return Promise.resolve(this.rejected(request.sequence, 'INPUT_BUSY'))
    const promise = this.enqueue(request.sequence, 'eof', Buffer.alloc(0))
    this.eofSequence = request.sequence
    this.eofPromise = promise
    this.closeGate('EOF')
    return promise
  }

  /** Lifecycle close. EOF keeps draining; every other reason drops the tail. */
  closeGate(reason: RunInputGateReason): void {
    if (reason === 'EOF') {
      if (this.reason === undefined) this.reason = 'EOF'
      return
    }
    if (this.reason === undefined || this.reason === 'EOF') this.reason = reason
    this.clearTimer()
    this.rejectQueued()
  }

  status(): RunInputStatus {
    const pressure = this.pressure()
    const snapshot = {
      projectId: this.projectId,
      sessionId: this.sessionId,
      capability: { mode: 'line-input' as const, acceptsInput: true as const },
      nextSequence: this.nextSequence,
      queuedSubmissions: pressure.submissions,
      queuedUtf8Bytes: pressure.bytes,
    }
    return this.reason === undefined
      ? { ...snapshot, gate: 'OPEN' }
      : { ...snapshot, gate: 'CLOSED', reason: this.reason }
  }

  private enqueue(sequence: number, kind: QueuedInput['kind'], payload: Uint8Array): Promise<RunInputAcknowledgement> {
    this.bytes += payload.byteLength
    this.nextSequence += 1
    const promise = new Promise<RunInputAcknowledgement>(resolve => {
      this.pending.push({ sequence, kind, payload, done: false, resolve })
    })
    void this.pump()
    return promise
  }

  private full(extra: number): boolean {
    const pressure = this.pressure()
    return pressure.submissions + 1 > RUN_INPUT_LIMITS.maximumQueuedSubmissions
      || pressure.bytes + extra > RUN_INPUT_LIMITS.maximumQueuedUtf8Bytes
  }

  private pressure(): { submissions: number; bytes: number } {
    return {
      submissions: this.pending.length + (this.active && !this.active.done ? 1 : 0),
      bytes: this.bytes,
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.canDrain()) {
        const item = this.pending.shift()
        if (!item) break
        this.active = item
        if (item.kind === 'eof') await this.finishEof(item)
        else await this.finishWrite(item)
        this.active = undefined
        if (this.reason !== undefined && this.reason !== 'EOF') break
      }
    } finally {
      this.pumping = false
      this.active = undefined
      if (this.canDrain()) void this.pump()
    }
  }

  private canDrain(): boolean {
    return this.pending.length > 0 && (this.reason === undefined || this.reason === 'EOF')
  }

  private async finishWrite(item: QueuedInput): Promise<void> {
    const outcome = await this.writeLimited(item.payload)
    if (outcome === 'timeout') {
      this.drop(item, 'WRITE_TIMEOUT')
      return
    }
    if (this.reason !== undefined && this.reason !== 'EOF') {
      this.drop(item, 'INPUT_CLOSED')
      return
    }
    if (outcome === 'delivered') {
      this.drop(item, 'DELIVERED')
      return
    }
    this.closeGate('WRITE_FAILED')
    this.drop(item, 'WRITE_FAILED')
  }

  private async finishEof(item: QueuedInput): Promise<void> {
    let failed = false
    try { await this.writer.closeInput() }
    catch { failed = true }
    if (this.reason !== undefined && this.reason !== 'EOF') {
      this.drop(item, 'INPUT_CLOSED')
      return
    }
    if (failed) {
      this.closeGate('WRITE_FAILED')
      this.drop(item, 'WRITE_FAILED')
      return
    }
    this.drop(item, 'DELIVERED')
  }

  private writeLimited(bytes: Uint8Array): Promise<'delivered' | 'broken' | 'cancelled' | 'timeout'> {
    return new Promise(resolve => {
      let settled = false
      const finish = (outcome: 'delivered' | 'broken' | 'cancelled' | 'timeout') => {
        if (settled) return
        settled = true
        this.clearTimer()
        resolve(outcome)
      }
      this.timer = setTimeout(() => {
        this.closeGate('WRITE_TIMEOUT')
        this.onWriteTimeout()
        finish('timeout')
      }, RUN_INPUT_LIMITS.writeDeadlineMilliseconds)
      void this.writer.writeInput(bytes).then(status => {
        finish(status === 'delivered' || status === 'cancelled' ? status : 'broken')
      }, () => finish('broken'))
    })
  }

  private rejectQueued(): void {
    const queued = this.pending.splice(0)
    for (const item of queued) this.drop(item, 'INPUT_CLOSED')
  }

  private drop(item: QueuedInput, outcome: 'DELIVERED' | RunInputRejectionReason): void {
    if (item.done) return
    item.done = true
    this.bytes -= item.payload.byteLength
    item.resolve(outcome === 'DELIVERED'
      ? { projectId: this.projectId, sessionId: this.sessionId, sequence: item.sequence, state: 'DELIVERED' }
      : this.rejected(item.sequence, outcome))
  }

  private rejected(sequence: number, reason: RunInputRejectionReason): RunInputAcknowledgement {
    return {
      projectId: this.projectId, sessionId: this.sessionId, sequence, state: 'REJECTED', reason,
      retryable: reason === 'INPUT_BUSY',
    }
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

export function runInputRejection(projectId: ProjectId, sessionId: RunSessionId, sequence: number,
  reason: RunInputRejectionReason): RunInputAcknowledgement {
  return { projectId, sessionId, sequence, state: 'REJECTED', reason, retryable: reason === 'INPUT_BUSY' }
}
