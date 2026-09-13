import type { Readable, Writable } from 'node:stream'
import { CancellationTokenSource, createMessageConnection, StreamMessageReader,
  StreamMessageWriter, type Disposable } from 'vscode-jsonrpc/node'
import { LanguageError, type LanguageFailure } from './language-error'

/** Internal transport only. Semantic callers go through CSharpLsAdapter. */
export class LspConnection {
  private readonly connection
  private readonly pending = new Map<string, (reason: LanguageFailure) => void>()
  private closed = false
  private listening = false

  constructor(input: Readable, output: Writable, private readonly onFailure: () => void = () => {}) {
    this.connection = createMessageConnection(new StreamMessageReader(input), new StreamMessageWriter(output))
    this.connection.onClose(() => this.fail())
    this.connection.onError(() => this.fail())
  }

  listen(): void {
    if (this.closed) throw new LanguageError('closed')
    if (!this.listening) { this.listening = true; this.connection.listen() }
  }

  onRequest(method: string, handler: (params: unknown) => unknown): Disposable {
    return this.connection.onRequest(method, handler)
  }

  onNotification(method: string, handler: (params: unknown) => void): Disposable {
    return this.connection.onNotification(method, handler)
  }

  request<T>(operation: string, method: string, params: unknown, milliseconds = 15_000): Promise<T> {
    if (this.closed) return Promise.reject(new LanguageError('closed'))
    if (this.pending.has(operation)) return Promise.reject(new LanguageError('busy'))
    const source = new CancellationTokenSource()
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (error?: LanguageError, result?: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.pending.delete(operation)
        if (error) reject(error)
        else resolve(result as T)
      }
      const cancel = (reason: LanguageFailure) => {
        // vscode-jsonrpc maps this token to its private numeric wire request ID.
        source.cancel()
        finish(new LanguageError(reason))
      }
      const timer = setTimeout(() => cancel('timeout'), milliseconds)
      this.pending.set(operation, cancel)
      this.connection.sendRequest<T>(method, params, source.token).then(
        (result) => finish(undefined, result),
        () => finish(new LanguageError('protocol-error')),
      ).finally(() => source.dispose())
    })
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.closed) throw new LanguageError('closed')
    try { await this.connection.sendNotification(method, params) }
    catch { throw new LanguageError('protocol-error') }
  }

  cancel(operation: string): void { this.pending.get(operation)?.('cancelled') }
  cancelAll(reason: LanguageFailure = 'stale-session'): void {
    for (const cancel of [...this.pending.values()]) cancel(reason)
  }
  get pendingCount(): number { return this.pending.size }

  dispose(): void {
    if (this.closed) return
    this.cancelAll('closed')
    this.closed = true
    this.connection.dispose()
  }

  private fail(): void {
    if (this.closed) return
    this.dispose()
    this.onFailure()
  }
}
