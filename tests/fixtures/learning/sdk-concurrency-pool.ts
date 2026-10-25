/** Isolated S5-R1 experiment. Never imported by production. */
import { AsyncLocalStorage } from 'node:async_hooks'

export class PrototypeVerifier {
  private readonly scope = new AsyncLocalStorage<(() => void)[]>()
  private readonly waiters: (() => void)[] = []
  readonly metrics = { active: 0, peakTasks: 0, bytes: 0, peakBytes: 0, pendingCredits: 0, completed: 0 }
  constructor(private readonly check: () => void, readonly limit = 4, readonly byteLimit = 64 * 1024 ** 2) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 4 || !Number.isSafeInteger(byteLimit) || byteLimit < 1 || byteLimit > 64 * 1024 ** 2) throw Error('Invalid prototype bounds')
  }
  async reserve(bytes: number): Promise<void> {
    const scope = this.scope.getStore()
    if (!scope || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.byteLimit) throw Error('Invalid prototype buffer reservation')
    this.check()
    while (this.metrics.bytes + bytes > this.byteLimit) {
      this.metrics.pendingCredits++
      try { await new Promise<void>(resolve => this.waiters.push(resolve)) }
      finally { this.metrics.pendingCredits-- }
      this.check()
    }
    this.check(); this.metrics.bytes += bytes; this.metrics.peakBytes = Math.max(this.metrics.peakBytes, this.metrics.bytes)
    scope.push(() => { this.metrics.bytes -= bytes; for (const wake of this.waiters.splice(0)) wake() })
  }
  async single<T>(work: () => Promise<T>): Promise<T> {
    if (this.scope.getStore()) return work()
    this.check(); const releases: (() => void)[] = []
    return this.scope.run(releases, async () => {
      this.metrics.active++; this.metrics.peakTasks = Math.max(this.metrics.peakTasks, this.metrics.active)
      try { return await work() }
      finally { for (const release of releases.reverse()) release(); this.metrics.active--; this.metrics.completed++ }
    })
  }
  async ordered<T, R>(items: Iterable<T>, work: (item: T) => Promise<R>, commit: (value: R) => void): Promise<void> {
    const iterator = items[Symbol.iterator]()
    try {
      for (;;) {
        this.check(); const batch: Promise<R>[] = []
        for (let index = 0; index < this.limit; index++) {
          const next = iterator.next(); if (next.done) break
          batch.push(this.single(() => work(next.value)))
        }
        if (!batch.length) return
        // Every rejection is observed and every handle/buffer scope settles
        // before an ordered error can leave the batch. Never race away I/O.
        const results = await Promise.allSettled(batch)
        for (const result of results) { if (result.status === 'rejected') throw result.reason; commit(result.value) }
      }
    } finally { iterator.return?.() }
  }
}
