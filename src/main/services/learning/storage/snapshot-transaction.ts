import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  SUBMISSION_LIMITS as L, SUBMISSION_STORE_POLICY as P,
  type SubmissionAvailability, type SubmissionDocument, type SubmissionRecord,
  type SubmissionStorageResult, type SubmissionStoreKind, type SubmissionTargetBinding,
} from './submission-contracts'
import {
  bindSubmissionTarget, compareSubmissionIdentity, decodeSubmissionDocument, encodeSubmissionDocument,
  sealSubmissionDocument, validateSubmissionLineage, validateSubmissionRecord,
} from './submission-validation'
import { SubmissionStoreFiles, type StoreCopy, type StoreFileIdentity } from './store-files'
import { SharedSubmissionStoreLease, StoreIOError, storeIOError, withStoreLease, type StoreLease } from './store-lease'

export interface SnapshotRecovery {
  readonly availability: SubmissionAvailability
  readonly document?: SubmissionDocument
  readonly identity?: StoreFileIdentity
  readonly warning?: 'POSSIBLE_DATA_LOSS'
  readonly backupAvailability?: SubmissionAvailability
}
async function readCopy(files: SubmissionStoreFiles, kind: SubmissionStoreKind, copy: StoreCopy): Promise<SnapshotRecovery> {
  try {
    const read = await files.read(kind, copy), decoded = decodeSubmissionDocument(read.bytes)
    if (!decoded.ok) return { availability: decoded.reason === 'UNSUPPORTED_SCHEMA' ? 'UNSUPPORTED_SCHEMA' : 'CORRUPT' }
    if (decoded.value.storeKind !== kind) return { availability: 'CORRUPT' }
    return { availability: 'AVAILABLE', document: decoded.value, identity: read.identity }
  } catch (error) {
    const reason = storeIOError(error).reason
    return { availability: reason === 'MISSING' ? 'MISSING' : reason === 'TOO_LARGE' ? 'READ_ONLY' : 'UNAVAILABLE' }
  }
}
/** Caller must hold the family lease. No repair, temp promotion or candidate replay. */
export function recoverSnapshot(files: SubmissionStoreFiles, lease: StoreLease, kind: SubmissionStoreKind): Promise<SnapshotRecovery> {
  return withStoreLease(files, lease, () => recoverUnderLease(files, kind))
}
async function recoverUnderLease(files: SubmissionStoreFiles, kind: SubmissionStoreKind): Promise<SnapshotRecovery> {
  const primary = await readCopy(files, kind, 'PRIMARY'), backup = await readCopy(files, kind, 'BACKUP')
  if (primary.document) {
    if (backup.document) {
      if (primary.document.checksum !== backup.document.checksum
        && !validateSubmissionLineage(primary.document, backup.document).ok) return { availability: 'CONFLICT' }
    } else if (backup.availability !== 'MISSING') {
      return { ...primary, availability: 'READ_ONLY', backupAvailability: backup.availability }
    }
    return primary
  }
  if (['CORRUPT', 'MISSING'].includes(primary.availability) && backup.document) {
    return { availability: 'RECOVERED', document: backup.document, warning: 'POSSIBLE_DATA_LOSS' }
  }
  if (primary.availability === 'MISSING' && backup.availability === 'MISSING') {
    try { return { availability: await files.evidence(kind) ? 'RECOVERY_PENDING' : 'MISSING' } }
    catch { return { availability: 'UNAVAILABLE' } }
  }
  return { availability: primary.availability === 'MISSING' ? backup.availability : primary.availability }
}

export interface CommitGuardContext {
  readonly target: Readonly<SubmissionTargetBinding>
  readonly base: SubmissionDocument | null
  readonly next: SubmissionDocument
}
/** Main integration seam only. S5 must authenticate the live operation here.
 * Must throw to refuse, return void synchronously; never grants authority itself. */
export type SubmissionCommitGuard = (context: CommitGuardContext) => void
export interface TransactionClock {
  now(): number
  sleep(ms: number): Promise<void>
}
const clock: TransactionClock = { now: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) }
export interface SnapshotTransactionOptions {
  readonly files: SubmissionStoreFiles
  readonly lease: SharedSubmissionStoreLease
  readonly record: unknown
  readonly guard: SubmissionCommitGuard
  readonly clock?: TransactionClock
  /** Optional acknowledgement notification; an exception never implies rollback. */
  readonly acknowledge?: () => void
}
class Refusal extends Error {
  constructor(readonly reason: 'FULL' | 'UNAVAILABLE' | 'CANCELLED' | 'EXPIRED' | 'CONFLICT' | 'IO_FAILURE') { super(reason) }
}

/** One retained continuation. wait() deadlines never cancel I/O or renew expiry. */
export class SnapshotTransaction {
  readonly record: SubmissionRecord
  readonly target: Readonly<SubmissionTargetBinding>
  readonly task: Promise<SubmissionStorageResult>
  private result: SubmissionStorageResult
  private readonly time: TransactionClock
  private readonly enteredAt: number
  private lease?: StoreLease
  private admitted = false
  private expected?: SubmissionDocument
  private base?: SubmissionDocument
  private settling?: Promise<SubmissionStorageResult>
  private released = false
  private dispatchRefusal?: Refusal['reason']
  private readonly options: Pick<SnapshotTransactionOptions, 'files' | 'lease'>
  private guard?: SubmissionCommitGuard
  private acknowledge?: () => void
  warning: 'NEAR_CAPACITY' | 'HIGH_CAPACITY' | undefined
  constructor(options: SnapshotTransactionOptions) {
    const record = validateSubmissionRecord(options.record), target = bindSubmissionTarget(options.record)
    if (!record.ok || !target.ok || typeof options.guard !== 'function') throw new StoreIOError('INVALID_INPUT')
    this.record = record.value; this.target = target.value
    this.options = Object.freeze({ files: options.files, lease: options.lease })
    this.guard = options.guard; this.acknowledge = options.acknowledge
    this.time = options.clock ?? clock; this.enteredAt = this.time.now()
    this.result = { state: 'pending', target: this.target }
    this.task = Promise.resolve().then(() => this.run())
  }
  get status(): SubmissionStorageResult { return this.result }
  get settled(): boolean { return this.released }
  get slow(): boolean { return this.time.now() - this.enteredAt >= P[this.target.storeKind].slowNoticeMs }
  async wait(ms: number = P[this.target.storeKind].callerWaitMs): Promise<SubmissionStorageResult> {
    if (!Number.isFinite(ms) || ms < 0) throw new StoreIOError('INVALID_INPUT')
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([this.task, new Promise<SubmissionStorageResult>(resolve => {
      timer = setTimeout(() => resolve(this.result), ms)
    })]) } finally { if (timer) clearTimeout(timer) }
  }
  private precommit(): void {
    if (this.time.now() - this.enteredAt >= P[this.target.storeKind].precommitWindowMs) throw new Refusal('EXPIRED')
  }
  private saved(doc: SubmissionDocument): void {
    this.result = { state: 'saved', target: this.target, commit: { commitId: doc.lastCommitId, commitSequence: doc.commitSequence } }
  }
  private unknown(): void { this.result = { state: 'unknown', target: this.target, recoveryPending: true } }
  private async attempt(): Promise<void> {
    const { files } = this.options, kind = this.target.storeKind
    this.precommit()
    this.lease ??= await this.options.lease.acquire()
    const recovered = await recoverSnapshot(files, this.lease, kind)
    this.precommit()
    if (!['AVAILABLE', 'MISSING'].includes(recovered.availability)
      && !(recovered.availability === 'READ_ONLY' && recovered.document)) {
      throw new Refusal(recovered.availability === 'CONFLICT' ? 'CONFLICT' : 'UNAVAILABLE')
    }
    this.base = recovered.document
    // Partial availability is intentional; a readable opposite store still detects conflicts.
    const other = await recoverSnapshot(files, this.lease, kind === 'ACCEPTED' ? 'FAILED' : 'ACCEPTED')
    for (const r of other.document?.records ?? []) {
      const comparison = compareSubmissionIdentity(r, this.record)
      if (!comparison.ok || comparison.value !== 'DISTINCT') throw new Refusal('CONFLICT')
    }
    for (const r of this.base?.records ?? []) {
      const comparison = compareSubmissionIdentity(r, this.record)
      if (!comparison.ok || comparison.value === 'IDEMPOTENCY_CONFLICT') throw new Refusal('CONFLICT')
      if (comparison.value === 'MATCHING_RETRY') { this.saved(this.base!); return }
    }
    if (recovered.availability === 'READ_ONLY') throw new Refusal('UNAVAILABLE')
    const base = this.base
    const next = sealSubmissionDocument({ schemaVersion: 1, storeKind: kind,
      commitSequence: (base?.commitSequence ?? 0) + 1, lastCommitId: randomUUID(),
      previousCommit: base ? { commitSequence: base.commitSequence, commitId: base.lastCommitId, digest: base.checksum } : null,
      records: [...(base?.records ?? []), this.record] })
    if (!next.ok) throw new Refusal(next.reason === 'CAPACITY_EXCEEDED' ? 'FULL' : 'UNAVAILABLE')
    const encoded = encodeSubmissionDocument(next.value)
    if (!encoded.ok) throw new Refusal('UNAVAILABLE')
    const bytes = Buffer.from(encoded.value)
    this.warning = bytes.length >= P[kind].highWarningBytes ? 'HIGH_CAPACITY'
      : bytes.length >= P[kind].warningBytes ? 'NEAR_CAPACITY' : undefined
    if (await files.freeBytes() < BigInt(L.candidateSpaceMultiplier * bytes.length + L.reserveBytes)) throw new Refusal('FULL')
    this.precommit()
    const stage = await files.stage(this.lease, kind, bytes)
    this.precommit()
    if (base) {
      const prior = encodeSubmissionDocument(base)
      if (!prior.ok) throw new Refusal('UNAVAILABLE')
      const backup = await files.inspect(kind, 'BACKUP')
      const stagedBackup = await files.stage(this.lease, kind, Buffer.from(prior.value))
      await files.replace(this.lease, stagedBackup, 'BACKUP', backup, () => {
        try { this.precommit() } catch { this.dispatchRefusal = 'EXPIRED'; throw new StoreIOError('UNAVAILABLE') }
      })
    }
    this.expected = next.value
    await files.replace(this.lease, stage, 'PRIMARY', recovered.identity ?? null, () => {
      try { this.precommit() } catch { this.dispatchRefusal = 'EXPIRED'; throw new StoreIOError('UNAVAILABLE') }
      try {
        const answer: unknown = this.guard!(Object.freeze({ target: this.target, base: base ?? null, next: next.value }))
        if (answer !== undefined) {
          if (answer instanceof Promise) void answer.catch(() => {})
          throw new StoreIOError('INVALID_INPUT')
        }
      } catch { this.dispatchRefusal = 'CANCELLED'; throw new StoreIOError('UNAVAILABLE') }
      try { this.precommit() } catch { this.dispatchRefusal = 'EXPIRED'; throw new StoreIOError('UNAVAILABLE') }
      this.admitted = true
    })
    await this.verify()
    this.acknowledge?.()
  }
  private async verify(): Promise<void> {
    const read = await readCopy(this.options.files, this.target.storeKind, 'PRIMARY')
    if (read.document && this.expected && read.document.checksum === this.expected.checksum
      && read.document.lastCommitId === this.expected.lastCommitId) this.saved(read.document)
    else throw new StoreIOError('IO', true)
  }
  private async clean(final = true): Promise<void> {
    const files = this.options.files
    await files.retryClose()
    if (this.lease) {
      for (const stage of files.ownedStages()) {
        if (stage.state === 'REPLACEMENT_UNVERIFIED') await files.reconcileReplacement(this.lease, stage)
        if (stage.state === 'READY' || stage.state === 'FAILED') await files.discard(this.lease, stage)
      }
      await this.lease.release()
    } else if (this.options.lease.ownsLease) await this.options.lease.retryRelease()
    if (final) {
      this.released = true
      this.base = undefined; this.expected = undefined; this.guard = undefined; this.acknowledge = undefined
    }
  }
  private async run(): Promise<SubmissionStorageResult> {
    for (let attempt = 0; attempt < L.maxTransientAttempts; attempt++) {
      try { await this.attempt(); break }
      catch (error) {
        if (this.admitted) { this.unknown(); break }
        const io = storeIOError(error)
        // Backup dispatch is also never blindly retried; settle it first, preserving primary.
        if (!this.dispatchRefusal && !(error instanceof Refusal) && !io.replacementDispatched && ['BUSY', 'PERMISSION', 'IO'].includes(io.reason)
          && attempt + 1 < L.maxTransientAttempts) {
          try { await this.clean(false); this.lease = undefined }
          catch { this.result = { state: 'failed', target: this.target, reason: 'IO_FAILURE' }; break }
          await this.time.sleep(L.retryBackoffMs[attempt]); continue
        }
        this.result = { state: 'failed', target: this.target, reason: this.dispatchRefusal ?? (error instanceof Refusal ? error.reason
          : io.reason === 'FULL' || io.reason === 'TOO_LARGE' ? 'FULL' : 'UNAVAILABLE') }
        break
      }
    }
    if (this.result.state !== 'unknown') {
      try { await this.clean() } catch { /* Retained resources block façade reuse; settle() retries only cleanup. */ }
    }
    return this.result
  }
  /** Join original I/O first; unknown reconciliation never appends or invokes guard again. */
  settle(): Promise<SubmissionStorageResult> {
    if (this.settling) return this.settling
    const work = this.task.then(async () => {
      if (this.result.state === 'unknown') {
        try {
          await this.options.files.retryClose()
          const primary = await readCopy(this.options.files, this.target.storeKind, 'PRIMARY')
          if (primary.document && this.expected && primary.document.checksum === this.expected.checksum) this.saved(primary.document)
          else if (primary.document && this.base && primary.document.checksum === this.base.checksum
            || primary.availability === 'MISSING' && !this.base) {
            // Original promise has settled. Prove source stage still exists before declaring failure.
            let proven = false
            for (const stage of this.options.files.ownedStages()) if (stage.state === 'REPLACEMENT_UNVERIFIED') {
              if (await this.options.files.reconcileReplacement(this.lease!, stage) !== 'NOT_REPLACED') throw new StoreIOError('UNSAFE')
              proven = true
            }
            if (!proven) return this.result
            this.result = { state: 'failed', target: this.target, reason: 'IO_FAILURE' }
          } else return this.result
        } catch { return this.result }
      }
      try { await this.clean() } catch { /* Preserve ownership for the next settlement join. */ }
      return this.result
    })
    this.settling = work
    void work.finally(() => { if (this.settling === work) this.settling = undefined }).catch(() => {})
    return work
  }
}
