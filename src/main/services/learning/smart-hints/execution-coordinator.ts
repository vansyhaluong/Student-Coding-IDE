import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { SmartProviderError } from './adapter'

export interface InferenceScope {
  signal: AbortSignal
  deadline: number
  /** The consumer owns terminal status, abort and resource cleanup. */
  cancel(): void
}
export interface InferenceAdmission {
  /** Main-private, one durable reservation attempt per admitted operation. */
  reserveInference(signal: AbortSignal): Promise<void>
  /** Call from the consumer's finally, after owned execution/cleanup settles. */
  release(): void
}
interface Active {
  scope: InferenceScope; released: boolean; reservation?: Promise<void>
  done: Promise<void>; complete(): void
}

/** One Main-owned admission/rate window, shared by consumers, not by IPC callers.
 * Daily storage remains in the injected configuration port: no second ledger.
 * Consumer deadlines/timers and status/ownership rules are deliberately unchanged.
 */
export class SharedExecutionCoordinator {
  private starts: number[] = []
  private active?: Active
  private stopped = false
  constructor(private readonly clock: () => number,
    private readonly reserveDaily: (signal: AbortSignal) => Promise<void>) {}

  rateLimitReset(): number | null {
    const now = this.clock(), hour = this.starts.filter(t => now - t < 3600000), minute = hour.filter(t => now - t < 60000)
    return Math.max(hour.length >= P.perHour ? hour[hour.length - P.perHour] + 3600000 : 0,
      minute.length >= P.perMinute ? minute[minute.length - P.perMinute] + 60000 : 0) || null
  }

  admit(scope: InferenceScope): { ok: true; admission: InferenceAdmission } | { ok: false; code: 'BUSY' | 'RATE_LIMIT' | 'TIMEOUT' } {
    const now = this.clock()
    if (this.stopped || scope.signal.aborted || !Number.isSafeInteger(scope.deadline) || now >= scope.deadline) return { ok: false, code: 'TIMEOUT' }
    if (this.active) return { ok: false, code: 'BUSY' }
    this.starts = this.starts.filter(t => now - t < 3600000)
    if (this.starts.length >= P.perHour || this.starts.filter(t => now - t < 60000).length >= P.perMinute) return { ok: false, code: 'RATE_LIMIT' }
    let complete!: () => void
    const entry: Active = { scope, released: false, done: new Promise(resolve => { complete = resolve }), complete: () => complete() }
    this.active = entry; this.starts.push(now) // Preserve reservation before dispatch, without refunds.
    const check = (signal: AbortSignal) => {
      if (this.stopped || this.active !== entry || entry.released || scope.signal.aborted || signal.aborted || this.clock() >= scope.deadline)
        throw new SmartProviderError('TIMEOUT')
    }
    const clear = () => {
      if (this.active === entry) this.active = undefined
      entry.complete()
    }
    return { ok: true, admission: Object.freeze({
      reserveInference: (signal: AbortSignal): Promise<void> => {
        try { check(signal) } catch (error) { return Promise.reject(error) }
        // Store the promise before invoking any asynchronous ledger I/O. A failed
        // or uncertain attempt cannot be repeated with another signal/call.
        entry.reservation ??= Promise.resolve().then(async () => {
          check(signal); await this.reserveDaily(signal); check(signal)
        })
        return entry.reservation
      },
      release: () => {
        if (entry.released) return
        entry.released = true
        // Even an early/misordered consumer release cannot overlap ledger I/O.
        if (entry.reservation) void entry.reservation.then(clear, clear)
        else clear()
      },
    }) }
  }

  cancelActive(): Promise<void> {
    const entry = this.active
    entry?.scope.cancel()
    return entry?.done ?? Promise.resolve()
  }
  beginShutdown(): void { this.stopped = true; this.active?.scope.cancel() }
  async drain(): Promise<void> { await this.active?.done }
}
