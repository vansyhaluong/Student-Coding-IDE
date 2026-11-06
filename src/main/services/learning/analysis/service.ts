import { randomUUID } from 'node:crypto'
import { type AnalysisPrepare, type AnalysisStart, type AnalysisStatus, type AnalysisFailureCode } from '../../../../shared/contracts/analysis'
import { isAnalysis } from '../../../../shared/contracts/analysis-validation'
import type { AnalysisProvider } from './contracts'
import { inputSnapshot } from './validation'
import { AnalysisCaptureError, type SavedAnalysisCapture } from './capture'
import { DomainError } from '../../../errors/app-error'

interface Operation {
  owner: number; scope: string; reference: string; check(): void
  abort: AbortController; status: AnalysisStatus; token: string; expiresAt: number
  capture?: SavedAnalysisCapture; spent: boolean; released: boolean
  timer?: ReturnType<typeof setTimeout>; monitor?: ReturnType<typeof setInterval>
}
type StatusValue = AnalysisStatus extends infer T ? T extends AnalysisStatus ? Omit<T, 'requestId' | 'sequence'> : never : never
const denied = () => new DomainError({ code: 'PERMISSION_DENIED', operation: 'analysis',
  message: 'Analysis context is no longer authorized.', retryable: false })
const invalid = () => new DomainError({ code: 'INVALID_INPUT', operation: 'analysis',
  message: 'Analysis request is invalid or already used.', retryable: false })
/** One retained operation per observed owner; no queue, persistence, retry or fallback. */
export class SubmissionAnalysisService {
  private readonly operations = new Map<number, Operation>()
  private readonly tasks = new Set<Promise<unknown>>()
  private stopped = false
  constructor(private readonly provider?: AnalysisProvider, private readonly clock = Date.now,
    private readonly ttlMs = 60_000) {}
  private track(task: Promise<unknown>): void {
    this.tasks.add(task); void task.finally(() => this.tasks.delete(task)).catch(() => {})
  }
  private set(op: Operation, value: StatusValue): void {
    op.status = { ...value, requestId: op.status.requestId, sequence: op.status.sequence + 1 } as AnalysisStatus
    if (['COMPLETE', 'FAILED', 'CANCELLED'].includes(value.state)) clearInterval(op.monitor)
  }
  private fail(op: Operation, code: AnalysisFailureCode): void {
    op.capture = undefined; op.spent = true; clearTimeout(op.timer); op.abort.abort()
    this.set(op, { state: 'FAILED', code })
  }
  private check(op: Operation): void {
    if (this.stopped || this.operations.get(op.owner) !== op || op.abort.signal.aborted) throw denied()
    try { op.check() } catch { this.invalidate(op.owner, op); throw denied() }
  }
  prepare(owner: number, scope: string, request: AnalysisPrepare, check: () => void,
    capture: (check: () => void) => Promise<SavedAnalysisCapture>): AnalysisStatus {
    check()
    if (this.stopped) throw denied()
    const previous = this.operations.get(owner)
    if (previous?.scope === scope) {
      if (previous.status.requestId === request.requestId) {
        if (previous.reference !== request.sourceReference) throw invalid()
        return this.status(owner, scope, request.requestId)
      }
      // Double-click with a different requestId cannot acquire a fresh provider permit.
      if (previous.reference === request.sourceReference && !previous.released) throw invalid()
    }
    this.invalidate(owner)
    const op: Operation = { owner, scope, reference: request.sourceReference, check, abort: new AbortController(),
      status: { requestId: request.requestId, sequence: 0, state: 'PREPARING' }, token: randomUUID(),
      expiresAt: this.clock() + this.ttlMs, spent: false, released: false }
    this.operations.set(owner, op)
    op.timer = setTimeout(() => { if (!op.spent) this.fail(op, 'CAPTURE_EXPIRED') }, this.ttlMs)
    // Also observes service epoch changes originating outside submission:context.
    op.monitor = setInterval(() => {
      try { this.check(op) } catch { this.invalidate(owner, op) }
    }, 50)
    this.track(Promise.resolve().then(async () => {
      try {
        this.check(op)
        const saved = await capture(() => this.check(op))
        this.check(op)
        const input = inputSnapshot(saved.input)
        if (this.clock() >= op.expiresAt) { this.fail(op, 'CAPTURE_EXPIRED'); return }
        op.capture = { input, submissionId: saved.submissionId, exerciseId: saved.exerciseId }
        this.set(op, { state: 'PREPARED', captureToken: op.token, expiresAt: op.expiresAt, consentVersion: 1,
          submissionId: saved.submissionId, exerciseId: saved.exerciseId, language: input.language,
          packageVersion: input.packageVersion, sourceBytes: Buffer.byteLength(input.source), statementBytes: Buffer.byteLength(input.publicStatement) })
      } catch (error) {
        if (op.abort.signal.aborted) return
        this.fail(op, error instanceof AnalysisCaptureError ? error.code : 'SOURCE_UNAVAILABLE')
      }
    }))
    return structuredClone(op.status)
  }
  private get(owner: number, scope: string, requestId: string): Operation {
    const op = this.operations.get(owner)
    if (!op || op.scope !== scope || op.status.requestId !== requestId) throw denied()
    try { op.check() } catch { this.invalidate(owner, op); throw denied() }
    if (this.stopped) throw denied()
    return op
  }
  status(owner: number, scope: string, requestId: string): AnalysisStatus {
    const op = this.get(owner, scope, requestId)
    if (!op.spent && this.clock() >= op.expiresAt) this.fail(op, 'CAPTURE_EXPIRED')
    return structuredClone(op.status)
  }
  start(owner: number, scope: string, request: AnalysisStart): AnalysisStatus {
    const op = this.get(owner, scope, request.requestId)
    if (request.consentVersion !== 1 || request.captureToken !== op.token) throw invalid()
    if (op.spent) return structuredClone(op.status) // Lost ACK returns same operation, never run again.
    if (this.clock() >= op.expiresAt) { this.fail(op, 'CAPTURE_EXPIRED'); return structuredClone(op.status) }
    if (op.status.state !== 'PREPARED' || !op.capture) throw invalid()
    this.check(op)
    op.spent = true; clearTimeout(op.timer)
    const input = op.capture.input; op.capture = undefined
    if (!this.provider) { this.fail(op, 'KEY_UNAVAILABLE'); return structuredClone(op.status) }
    this.set(op, { state: 'RUNNING' })
    // Reserve the permit synchronously, then check owner immediately before provider dispatch.
    this.track(Promise.resolve().then(async () => {
      try {
        this.check(op)
        const result = await this.provider!.createOperation(input).run(op.abort.signal)
        this.check(op)
        if (result.ok && isAnalysis(result.analysis)) this.set(op, { state: 'COMPLETE', advisory: true,
          analysis: structuredClone(result.analysis) })
        else this.fail(op, result.ok ? 'INVALID_RESPONSE' : result.code)
      } catch {
        if (!op.abort.signal.aborted) this.fail(op, 'PROVIDER_ERROR')
      }
    }))
    return structuredClone(op.status)
  }
  cancel(owner: number, scope: string, requestId: string): AnalysisStatus {
    const op = this.get(owner, scope, requestId)
    // Explicit cancellation (including Details close) discards any advisory result.
    // A later, intentional operation needs a new requestId, token and consent.
    op.released = true
    if (op.status.state !== 'CANCELLED') {
      op.spent = true; op.capture = undefined; clearTimeout(op.timer); op.abort.abort(); this.set(op, { state: 'CANCELLED' })
    }
    return structuredClone(op.status)
  }
  invalidate(owner: number, expected?: Operation): void {
    const op = this.operations.get(owner)
    if (!op || expected && op !== expected) return
    op.capture = undefined; op.abort.abort(); clearTimeout(op.timer); clearInterval(op.monitor); this.operations.delete(owner)
  }
  beginShutdown(): void { this.stopped = true; for (const owner of this.operations.keys()) this.invalidate(owner) }
  async stop(): Promise<void> { this.beginShutdown(); await Promise.allSettled([...this.tasks]) }
}
