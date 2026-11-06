import { SnapshotTransaction, type SnapshotTransactionOptions } from './storage/snapshot-transaction'
import { compareSubmissionIdentity } from './storage/submission-validation'
import { StoreIOError, storeIOError } from './storage/store-lease'
import type { StoreLease } from './storage/store-lease'
import { SubmissionReadModel, type SubmissionCompletionResult, type SubmissionHistoryResult, type SubmissionSourceResult, type SubmissionSourceRequest } from './storage/submission-read-model'

/** Main-private storage façade. No service wiring or commit authority. */
export class LearningStore {
  private readonly continuations = new Map<string, SnapshotTransaction>()
  private active?: SnapshotTransaction
  private readTask?: Promise<SubmissionReadModel>
  private readScope?: 'ALL' | 'ACCEPTED'
  private readLease?: StoreLease
  private readRetained = false
  private readSettlement?: Promise<void>
  constructor(private readonly storage: Pick<SnapshotTransactionOptions, 'files' | 'lease' | 'clock'>) {}
  begin(record: unknown, guard: SnapshotTransactionOptions['guard'], acknowledge?: () => void): SnapshotTransaction {
    for (const transaction of this.continuations.values()) {
      const compared = compareSubmissionIdentity(transaction.record, record)
      if (!compared.ok) throw new StoreIOError('INVALID_INPUT')
      if (compared.value === 'IDEMPOTENCY_CONFLICT') throw new StoreIOError('CONFLICT')
      if (compared.value === 'MATCHING_RETRY') return transaction
    }
    if (this.active && !this.active.settled || this.readRetained || this.readSettlement) throw new StoreIOError('BUSY')
    const transaction = new SnapshotTransaction({ ...this.storage, record, guard, acknowledge })
    this.continuations.set(transaction.target.submissionId, transaction)
    this.active = transaction
    return transaction
  }
  get hasRetainedReads(): boolean { return this.readRetained }
  private async closeReads(): Promise<void> {
    await this.storage.files.retryClose()
    if (this.readLease) await this.readLease.release()
    else if (this.storage.lease.ownsLease) await this.storage.lease.retryRelease()
    this.readLease = undefined; this.readRetained = false
  }
  /** No stale cached positive/negative: load current committed snapshots only.
   * Concurrent matching readers join one load; other reads report pending. */
  private loadReads(scope: 'ALL' | 'ACCEPTED' = 'ALL'): Promise<SubmissionReadModel> {
    if (this.active && !this.active.settled) return Promise.resolve(SubmissionReadModel.unavailable('RECOVERY_PENDING'))
    if (this.readTask) return this.readScope === scope ? this.readTask : Promise.resolve(SubmissionReadModel.unavailable('RECOVERY_PENDING'))
    if (this.readRetained || this.readSettlement) return Promise.resolve(SubmissionReadModel.unavailable())
    if (this.storage.lease.ownsLease) return Promise.resolve(SubmissionReadModel.unavailable())
    this.readRetained = true
    this.readScope = scope
    const task = Promise.resolve().then(async () => {
      try {
        this.readLease = await this.storage.lease.acquire()
        return await SubmissionReadModel.load(this.storage.files, this.readLease, scope)
      } catch (error) {
        // A refused acquisition never owns another borrower's task, handles or lease.
        if (storeIOError(error).reason === 'BUSY') this.readRetained = false
        return SubmissionReadModel.unavailable()
      }
      finally {
        if (this.readRetained) {
          try { await this.closeReads() } catch { /* Retain ownership; explicit settlement blocks competing writes. */ }
        }
      }
    })
    this.readTask = task
    void task.finally(() => { if (this.readTask === task) { this.readTask = undefined; this.readScope = undefined } }).catch(() => {})
    return task
  }
  /** Retry resource closure only, after the original read I/O settles. */
  settleReads(): Promise<void> {
    if (this.readSettlement) return this.readSettlement
    const task = Promise.resolve(this.readTask).then(async () => { if (this.readRetained) await this.closeReads() })
    this.readSettlement = task
    void task.finally(() => { if (this.readSettlement === task) this.readSettlement = undefined }).catch(() => {})
    return task
  }
  async history(request: unknown = {}): Promise<SubmissionHistoryResult> { return (await this.loadReads()).history(request) }
  async source(request: unknown): Promise<SubmissionSourceResult> { return (await this.loadReads()).source(request) }
  async analysisSource(request: SubmissionSourceRequest) {
    const model = await this.loadReads()
    // Never dispatch while a failed read cleanup still retains the shared lease.
    return (this.readRetained ? SubmissionReadModel.unavailable() : model).analysisSource(request)
  }
  async completion(exerciseId: unknown): Promise<SubmissionCompletionResult> { return (await this.loadReads('ACCEPTED')).completion(exerciseId) }
}
