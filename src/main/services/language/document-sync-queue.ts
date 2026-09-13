import { LanguageError } from './language-error'

interface Pending<T> { value: T; resolve(): void; reject(error: unknown): void }

/** Internal transport batching. Every entry survives; no debounce/latest-wins. */
export class DocumentSyncQueue<T> {
  private pending: Pending<T>[] = []
  private tail: Promise<void> = Promise.resolve()
  private scheduled = false
  private failure?: LanguageError

  constructor(private readonly send: (batch: readonly T[]) => Promise<void>) {}

  enqueue(value: T): Promise<void> {
    if (this.failure) return Promise.reject(this.failure)
    const result = new Promise<void>((resolve, reject) => {
      this.pending.push({ value, resolve, reject })
    })
    if (!this.scheduled) {
      this.scheduled = true
      queueMicrotask(() => { this.scheduled = false; this.drain() })
    }
    return result
  }

  async flush(): Promise<void> {
    this.drain()
    await this.tail
    if (this.failure) throw this.failure
  }

  invalidate(): void {
    this.failure ??= new LanguageError('stale-session')
    for (const entry of this.pending.splice(0)) entry.reject(this.failure)
  }

  private drain(): void {
    if (!this.pending.length) return
    const batch = this.pending.splice(0)
    this.tail = this.tail.then(async () => {
      try {
        if (this.failure) throw this.failure
        await this.send(batch.map((entry) => entry.value))
        if (this.failure) throw this.failure
        for (const entry of batch) entry.resolve()
      } catch (error) {
        this.failure = error instanceof LanguageError ? error : new LanguageError('protocol-error')
        for (const entry of batch) entry.reject(this.failure)
        for (const entry of this.pending.splice(0)) entry.reject(this.failure)
      }
    })
  }
}
