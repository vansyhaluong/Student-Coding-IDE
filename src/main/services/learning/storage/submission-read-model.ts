import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  SUBMISSION_LIMITS as L, type SubmissionAvailability, type SubmissionGradedFailure,
  type SubmissionLanguage, type SubmissionRecord, type SubmissionStoreKind,
} from './submission-contracts'
import { recoverSnapshot, type SnapshotRecovery } from './snapshot-transaction'
import type { SubmissionStoreFiles } from './store-files'
import type { StoreLease } from './store-lease'

export interface SubmissionRecordKey { readonly storeKind: SubmissionStoreKind; readonly recordId: string }
export interface SubmissionReadAvailability {
  readonly state: SubmissionAvailability
  readonly readable: boolean
  readonly warning?: 'POSSIBLE_DATA_LOSS'
  readonly backupState?: SubmissionAvailability
}
export type SubmissionReadStores = Readonly<Record<SubmissionStoreKind, SubmissionReadAvailability>>
export interface SubmissionSummary {
  readonly key: Readonly<SubmissionRecordKey>
  readonly submissionId: string
  readonly exerciseId: string
  readonly language: SubmissionLanguage
  readonly submittedAt: string
  readonly verdict: 'Accepted' | SubmissionGradedFailure
  readonly packageVersion: number
  readonly source: Readonly<{ hash: string; revision: number; byteLength: number }>
}
export interface SubmissionHistoryRequest {
  readonly scope?: 'ALL' | SubmissionStoreKind
  readonly exerciseId?: string
  readonly language?: SubmissionLanguage
  readonly packageVersion?: number
  readonly limit?: number
  readonly cursor?: string
}
export interface SubmissionSourceRequest {
  readonly key: Readonly<SubmissionRecordKey>
  readonly submissionId: string
  readonly sourceHash: string
  readonly sourceRevision: number
  readonly offset: number
  readonly limit?: number
}
export type SubmissionReadReason = 'INVALID_REQUEST' | 'STALE_CURSOR' | 'CONFLICT' | 'UNAVAILABLE'
  | 'NOT_FOUND' | 'IDENTITY_MISMATCH' | 'INVALID_RANGE' | 'RESPONSE_TOO_LARGE'
export interface SubmissionReadFailure {
  readonly ok: false
  readonly reason: SubmissionReadReason
  readonly stores: SubmissionReadStores
}
export type SubmissionHistoryResult = SubmissionReadFailure | {
  readonly ok: true
  readonly stores: SubmissionReadStores
  readonly coverage: 'COMPLETE' | 'PARTIAL'
  readonly countScope: 'ALL_SELECTED' | 'READABLE_ONLY'
  readonly knownCount: number
  readonly total: number | null
  readonly rows: readonly SubmissionSummary[]
  readonly nextCursor: string | null
}
export type SubmissionSourceResult = SubmissionReadFailure | {
  readonly ok: true
  readonly stores: SubmissionReadStores
  readonly key: Readonly<SubmissionRecordKey>
  readonly submissionId: string
  readonly sourceHash: string
  readonly sourceRevision: number
  readonly offset: number
  readonly nextOffset: number
  readonly totalBytes: number
  readonly eof: boolean
  readonly code: string
}
export type SubmissionCompletionResult = SubmissionReadFailure | {
  readonly ok: true
  readonly exerciseId: string
  readonly state: 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN'
  readonly accepted: SubmissionReadAvailability
}

const kinds = ['ACCEPTED', 'FAILED'] as const
const uuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const exercise = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number'
  && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max
function fields(v: unknown, allowed: readonly string[], required: readonly string[] = []): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
  const keys = Reflect.ownKeys(v)
  return required.every(k => keys.includes(k)) && keys.every(k => typeof k === 'string' && allowed.includes(k)
    && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))
}
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const keyOf = (kind: SubmissionStoreKind, id: string) => `${kind}:${id}`
const readable = (s: SnapshotRecovery) => !!s.document || s.availability === 'MISSING'
const complete = (s: SnapshotRecovery) => readable(s) && s.availability !== 'RECOVERED'
function availability(s: SnapshotRecovery): SubmissionReadAvailability {
  return Object.freeze({ state: s.availability, readable: readable(s),
    ...(s.warning ? { warning: s.warning } : {}), ...(s.backupAvailability ? { backupState: s.backupAvailability } : {}) })
}
interface Entry { readonly kind: SubmissionStoreKind; readonly record: SubmissionRecord }
interface Filter {
  scope: 'ALL' | SubmissionStoreKind
  exerciseId: string | null
  language: SubmissionLanguage | null
  packageVersion: number | null
  limit: number
}
function filter(request: unknown): Filter | undefined {
  if (!fields(request, ['scope', 'exerciseId', 'language', 'packageVersion', 'limit', 'cursor'])) return
  if (Object.hasOwn(request, 'scope') && !['ALL', ...kinds].includes(request.scope as SubmissionStoreKind)) return
  if (Object.hasOwn(request, 'exerciseId') && !exercise(request.exerciseId)) return
  if (Object.hasOwn(request, 'language') && request.language !== 'csharp' && request.language !== 'javascript') return
  if (Object.hasOwn(request, 'packageVersion') && !integer(request.packageVersion, 1)) return
  if (Object.hasOwn(request, 'limit') && !integer(request.limit, 1, L.summaryMaximum)) return
  if (Object.hasOwn(request, 'cursor') && (typeof request.cursor !== 'string' || !request.cursor.length
    || Buffer.byteLength(request.cursor, 'utf8') > L.cursorBytes)) return
  return { scope: (request.scope ?? 'ALL') as Filter['scope'], exerciseId: (request.exerciseId ?? null) as Filter['exerciseId'],
    language: (request.language ?? null) as Filter['language'], packageVersion: (request.packageVersion ?? null) as Filter['packageVersion'],
    limit: (request.limit ?? L.summaryDefault) as number }
}
// Ephemeral process-local integrity key only, not commit authority or persisted progress.
// Restart invalidates old cursors; callers obtain a new first page.
const cursorSecret = randomBytes(32)
const sign = (body: string) => createHmac('sha256', cursorSecret).update(body).digest()
interface Cursor { v: 1; f: string; g: string; o: number }
function encodeCursor(c: Cursor): string {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url')
  return body + '.' + sign(body).toString('base64url')
}
function decodeCursor(text: string): Cursor | undefined {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text) || Buffer.byteLength(text) > L.cursorBytes) return
  const [body, signature] = text.split('.'), supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== 32 || supplied.toString('base64url') !== signature || !timingSafeEqual(sign(body), supplied)) return
  try {
    const raw = Buffer.from(body, 'base64url')
    if (raw.toString('base64url') !== body) return
    const v: unknown = JSON.parse(raw.toString('utf8'))
    if (!fields(v, ['v', 'f', 'g', 'o'], ['v', 'f', 'g', 'o']) || v.v !== 1 || !hash(v.f) || !hash(v.g) || !integer(v.o, 1)) return
    const cursor: Cursor = { v: 1, f: v.f, g: v.g, o: v.o }
    return JSON.stringify(cursor) === raw.toString('utf8') ? cursor : undefined
  } catch { return }
}

/** Derived in-memory view only. Construction loads committed files through S3 recovery
 * under an authenticated lease. No arbitrary document/receipt constructor is exposed. */
export class SubmissionReadModel {
  readonly stores: SubmissionReadStores
  private readonly entries: readonly Entry[]
  private readonly conflicts = new Set<string>()
  private readonly generation: string
  private constructor(private readonly snapshots: Readonly<Record<SubmissionStoreKind, SnapshotRecovery>>) {
    this.stores = Object.freeze({ ACCEPTED: availability(snapshots.ACCEPTED), FAILED: availability(snapshots.FAILED) })
    this.generation = sha(JSON.stringify(kinds.map(k => [this.stores[k], snapshots[k].document?.commitSequence ?? null,
      snapshots[k].document?.lastCommitId ?? null, snapshots[k].document?.checksum ?? null])))
    const entries: Entry[] = [], ids = new Map<string, Entry>(), submissions = new Map<string, Entry>()
    for (const kind of kinds) for (const record of snapshots[kind].document?.records ?? []) {
      const entry = Object.freeze({ kind, record })
      for (const prior of [ids.get(record.id), submissions.get(record.submissionId)]) if (prior) {
        this.conflicts.add(keyOf(prior.kind, prior.record.id)); this.conflicts.add(keyOf(kind, record.id))
      }
      ids.set(record.id, entry); submissions.set(record.submissionId, entry); entries.push(entry)
    }
    const compare = (a: string, b: string) => a < b ? 1 : a > b ? -1 : 0
    entries.sort((a, b) => compare(a.record.submittedAt, b.record.submittedAt)
      || compare(a.record.submissionId, b.record.submissionId) || compare(keyOf(a.kind, a.record.id), keyOf(b.kind, b.record.id)))
    this.entries = Object.freeze(entries)
  }
  static async load(files: SubmissionStoreFiles, lease: StoreLease, scope: 'ALL' | 'ACCEPTED' = 'ALL'): Promise<SubmissionReadModel> {
    const accepted = await recoverSnapshot(files, lease, 'ACCEPTED')
    // Completion never probes Failed I/O. The unobserved store has no readable
    // evidence in this view; completion exposes only Accepted availability.
    const failed: SnapshotRecovery = scope === 'ALL' ? await recoverSnapshot(files, lease, 'FAILED') : { availability: 'UNAVAILABLE' }
    return new SubmissionReadModel({ ACCEPTED: accepted, FAILED: failed })
  }
  static unavailable(state: 'UNAVAILABLE' | 'RECOVERY_PENDING' = 'UNAVAILABLE'): SubmissionReadModel {
    return new SubmissionReadModel({ ACCEPTED: { availability: state }, FAILED: { availability: state } })
  }
  private failure(reason: SubmissionReadReason): SubmissionReadFailure { return Object.freeze({ ok: false, reason, stores: this.stores }) }
  private bounded<T extends object>(response: T): T | SubmissionReadFailure {
    return size(response) <= L.responseBytes ? Object.freeze(response) : this.failure('RESPONSE_TOO_LARGE')
  }
  history(request: unknown = {}): SubmissionHistoryResult {
    const selected = filter(request)
    if (!selected) return this.failure('INVALID_REQUEST')
    const scope = selected.scope === 'ALL' ? kinds : [selected.scope]
    const f = sha(JSON.stringify(selected)), input = request as SubmissionHistoryRequest
    let offset = 0
    if (input.cursor !== undefined) {
      const cursor = decodeCursor(input.cursor)
      if (!cursor) return this.failure('INVALID_REQUEST')
      if (cursor.f !== f || cursor.g !== this.generation) return this.failure('STALE_CURSOR')
      offset = cursor.o
    }
    // Detect conflicts before filtering: never hide a conflicting identity with a filter.
    if (this.entries.some(e => scope.includes(e.kind) && this.conflicts.has(keyOf(e.kind, e.record.id)))) return this.failure('CONFLICT')
    const records = this.entries.filter(e => scope.includes(e.kind)
      && (selected.exerciseId === null || e.record.exerciseId === selected.exerciseId)
      && (selected.language === null || e.record.language === selected.language)
      && (selected.packageVersion === null || e.record.packageVersion === selected.packageVersion))
    if (offset > records.length) return this.failure('INVALID_REQUEST')
    const rows: SubmissionSummary[] = []
    for (const { kind, record: r } of records.slice(offset, offset + selected.limit)) {
      const row: SubmissionSummary = Object.freeze({ key: Object.freeze({ storeKind: kind, recordId: r.id }),
        submissionId: r.submissionId, exerciseId: r.exerciseId, language: r.language, submittedAt: r.submittedAt,
        verdict: 'result' in r ? 'Accepted' : r.verdict, packageVersion: r.packageVersion,
        source: Object.freeze({ hash: r.codeHash, revision: r.sourceRevision, byteLength: Buffer.byteLength(r.code, 'utf8') }) })
      if (size(row) > L.summaryRowBytes) return this.failure('RESPONSE_TOO_LARGE')
      rows.push(row)
    }
    const full = scope.every(k => complete(this.snapshots[k]))
    const nextCursor = offset + rows.length < records.length ? encodeCursor({ v: 1, f, g: this.generation, o: offset + rows.length }) : null
    if (nextCursor && Buffer.byteLength(nextCursor) > L.cursorBytes) return this.failure('RESPONSE_TOO_LARGE')
    return this.bounded({ ok: true as const, stores: this.stores, coverage: full ? 'COMPLETE' as const : 'PARTIAL' as const,
      countScope: full ? 'ALL_SELECTED' as const : 'READABLE_ONLY' as const, knownCount: records.length,
      total: full ? records.length : null, rows: Object.freeze(rows), nextCursor })
  }
  completion(exerciseId: unknown): SubmissionCompletionResult {
    if (!exercise(exerciseId)) return this.failure('INVALID_REQUEST')
    const accepted = this.snapshots.ACCEPTED
    const found = accepted.document?.records.some(r => r.exerciseId === exerciseId) ?? false
    return this.bounded({ ok: true as const, exerciseId, accepted: this.stores.ACCEPTED,
      state: found ? 'COMPLETED' as const : complete(accepted) ? 'NOT_COMPLETED' as const : 'UNKNOWN' as const })
  }
  source(request: unknown): SubmissionSourceResult {
    if (!fields(request, ['key', 'submissionId', 'sourceHash', 'sourceRevision', 'offset', 'limit'],
      ['key', 'submissionId', 'sourceHash', 'sourceRevision', 'offset'])
      || !fields(request.key, ['storeKind', 'recordId'], ['storeKind', 'recordId'])
      || !kinds.includes(request.key.storeKind as SubmissionStoreKind) || !uuid(request.key.recordId)
      || !uuid(request.submissionId) || !hash(request.sourceHash) || !integer(request.sourceRevision)
      || !integer(request.offset) || Object.hasOwn(request, 'limit') && !integer(request.limit, 1, L.sourceChunkBytes)) return this.failure('INVALID_REQUEST')
    const kind = request.key.storeKind as SubmissionStoreKind, recordId = request.key.recordId, snapshot = this.snapshots[kind]
    if (!readable(snapshot)) return this.failure('UNAVAILABLE')
    const r = snapshot.document?.records.find(r => r.id === recordId)
    if (!r) return this.failure(complete(snapshot) ? 'NOT_FOUND' : 'UNAVAILABLE')
    if (this.conflicts.has(keyOf(kind, r.id))) return this.failure('CONFLICT')
    if (r.submissionId !== request.submissionId || r.codeHash !== request.sourceHash || r.sourceRevision !== request.sourceRevision
      || sha(r.code) !== r.codeHash) return this.failure('IDENTITY_MISMATCH')
    const bytes = Buffer.from(r.code, 'utf8'), offset = request.offset
    if (offset > bytes.length || offset < bytes.length && (bytes[offset] & 0xc0) === 0x80) return this.failure('INVALID_RANGE')
    let end = Math.min(offset + (request.limit as number | undefined ?? L.sourceChunkBytes), bytes.length)
    while (end < bytes.length && end > offset && (bytes[end] & 0xc0) === 0x80) end--
    if (end === offset && offset < bytes.length) return this.failure('INVALID_RANGE')
    return this.bounded({ ok: true as const, stores: this.stores, key: Object.freeze({ storeKind: kind, recordId: r.id }),
      submissionId: r.submissionId, sourceHash: r.codeHash, sourceRevision: r.sourceRevision,
      offset, nextOffset: end, totalBytes: bytes.length, eof: end === bytes.length, code: bytes.toString('utf8', offset, end) })
  }
}
