import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import {
  SUBMISSION_LIMITS as L, SUBMISSION_STORE_POLICY as P,
  type FailedSubmissionRecord, type SubmissionByteLengths,
  type SubmissionCapture, type SubmissionDocument, type SubmissionIdempotency, type SubmissionRecord,
  type SubmissionStoreKind, type SubmissionTargetBinding, type SubmissionValidation,
  type SubmissionValidationReason, type UnsignedSubmissionDocument,
} from './submission-contracts'

const common = ['schemaVersion', 'id', 'submissionId', 'exerciseId', 'language', 'code', 'sourceRevision',
  'codeHash', 'submittedAt', 'packageVersion', 'signatureVersion', 'signatureHash', 'testSet', 'comparator'] as const
const accepted = ['result', 'acceptedAt', 'cleanupProof']
const failed = ['verdict', 'gradedAt', 'recordedAt']
const envelope = ['schemaVersion', 'storeKind', 'commitSequence', 'lastCommitId', 'previousCommit', 'records']
const failures = new Set(['WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError',
  'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'])
const uuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)
const integer = (v: unknown, minimum = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= minimum && !Object.is(v, -0)
const kind = (v: unknown): v is SubmissionStoreKind => v === 'ACCEPTED' || v === 'FAILED'
const ok = <T>(value: T): SubmissionValidation<T> => ({ ok: true, value })
const bad = <T>(reason: SubmissionValidationReason = 'INVALID_SCHEMA'): SubmissionValidation<T> => ({ ok: false, reason })
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Require ordinary own enumerable data fields; never invoke getters/toJSON. */
function exact(v: unknown, fields: readonly string[]): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
  const keys = Reflect.ownKeys(v)
  return keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)
    && Object.getOwnPropertyDescriptor(v, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(v, key)!, 'value'))
}
function dense(v: unknown): v is unknown[] {
  if (!Array.isArray(v) || Reflect.ownKeys(v).length !== v.length + 1) return false
  for (let i = 0; i < v.length; i++) {
    const d = Object.getOwnPropertyDescriptor(v, String(i))
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) return false
  }
  return true
}
function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}
function timestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) return false
  const time = Date.parse(v)
  return Number.isFinite(time) && new Date(time).toISOString() === v
}
export function validateSubmissionSource(value: unknown): SubmissionValidation<string> {
  return typeof value === 'string' && value.length <= L.sourceCodeUnits && wellFormed(value)
    ? ok(value) : bad('INVALID_SOURCE')
}
export function hashSubmissionSource(value: string): SubmissionValidation<string> {
  const checked = validateSubmissionSource(value)
  return checked.ok ? ok(digest(checked.value)) : checked
}

function capture(v: Record<string, unknown>): SubmissionValidation<SubmissionCapture> {
  if (v.schemaVersion !== 1) return bad('UNSUPPORTED_SCHEMA')
  if (!uuid(v.id) || !uuid(v.submissionId) || !id(v.exerciseId) || (v.language !== 'csharp' && v.language !== 'javascript')
    || !integer(v.sourceRevision) || !timestamp(v.submittedAt)
    || !integer(v.packageVersion, 1) || !integer(v.signatureVersion, 1) || !hash(v.signatureHash)
    || !hash(v.codeHash) || !exact(v.testSet, ['id', 'version', 'hash']) || !id(v.testSet.id)
    || !integer(v.testSet.version, 1) || !hash(v.testSet.hash)
    || !exact(v.comparator, ['id', 'version']) || v.comparator.id !== 'exact-typed' || v.comparator.version !== 1) return bad()
  const source = validateSubmissionSource(v.code)
  if (!source.ok) return source
  if (digest(source.value) !== v.codeHash) return bad('HASH_MISMATCH')
  // Every field checked above; copy only the allowlist and detach nested data.
  return ok(Object.freeze({ schemaVersion: 1, id: v.id, submissionId: v.submissionId, exerciseId: v.exerciseId,
    language: v.language as SubmissionCapture['language'], code: source.value, sourceRevision: v.sourceRevision,
    codeHash: v.codeHash, submittedAt: v.submittedAt, packageVersion: v.packageVersion,
    signatureVersion: v.signatureVersion, signatureHash: v.signatureHash,
    testSet: Object.freeze({ id: v.testSet.id, version: v.testSet.version, hash: v.testSet.hash }),
    comparator: Object.freeze({ id: 'exact-typed', version: 1 }) }))
}
export function validateSubmissionCapture(value: unknown): SubmissionValidation<SubmissionCapture> {
  return exact(value, common) ? capture(value) : bad()
}
function recordKind(record: SubmissionRecord): SubmissionStoreKind { return 'result' in record ? 'ACCEPTED' : 'FAILED' }
function recordText(record: SubmissionRecord, metadata = false): string {
  // Explicit order and nested projections: property insertion order of input has no effect.
  const c = record
  const fields = { schemaVersion: c.schemaVersion, id: c.id, submissionId: c.submissionId,
    exerciseId: c.exerciseId, language: c.language, ...(metadata ? {} : { code: c.code }),
    sourceRevision: c.sourceRevision, codeHash: c.codeHash, submittedAt: c.submittedAt,
    packageVersion: c.packageVersion, signatureVersion: c.signatureVersion, signatureHash: c.signatureHash,
    testSet: 'result' in c ? { id: c.testSet.id, version: c.testSet.version, hash: c.testSet.hash,
      total: c.testSet.total, passed: c.testSet.passed } : { id: c.testSet.id, version: c.testSet.version, hash: c.testSet.hash },
    comparator: { id: c.comparator.id, version: c.comparator.version } }
  return JSON.stringify('result' in c ? { ...fields, result: c.result, acceptedAt: c.acceptedAt, cleanupProof: c.cleanupProof }
    : { ...fields, verdict: c.verdict, gradedAt: c.gradedAt, recordedAt: c.recordedAt })
}
/** Actual encoded-length preflight for later writers. It performs no disk check. */
export function validateSubmissionCapacity(storeKind: unknown, lengths: SubmissionByteLengths): SubmissionValidation<SubmissionByteLengths> {
  if (!kind(storeKind) || !exact(lengths, ['recordBytes', 'metadataBytes', 'snapshotBytes'])
    || !integer(lengths.recordBytes) || !integer(lengths.metadataBytes) || !integer(lengths.snapshotBytes)) return bad()
  return lengths.recordBytes <= L.recordBytes && lengths.metadataBytes <= L.metadataBytes
    && lengths.snapshotBytes <= P[storeKind].snapshotBytes ? ok(Object.freeze({ ...lengths })) : bad('CAPACITY_EXCEEDED')
}
export function validateSubmissionRecord(value: unknown, expectedCapture?: unknown): SubmissionValidation<SubmissionRecord> {
  if (!value || typeof value !== 'object') return bad()
  const isAccepted = Object.hasOwn(value, 'result')
  if (!exact(value, [...common, ...(isAccepted ? accepted : failed)])) return bad()
  const testFields = isAccepted ? ['id', 'version', 'hash', 'total', 'passed'] : ['id', 'version', 'hash']
  if (!exact(value.testSet, testFields)) return bad()
  const t = value.testSet
  const c = capture({ ...value, testSet: { id: t.id, version: t.version, hash: t.hash } })
  if (!c.ok) return c
  let record: SubmissionRecord
  if (isAccepted) {
    if (value.result !== 'Accepted' || value.cleanupProof !== 'VERIFIED' || !timestamp(value.acceptedAt)
      || !integer(t.total, 1) || !integer(t.passed, 1) || t.total !== t.passed) return bad()
    record = Object.freeze({ ...c.value, testSet: Object.freeze({ ...c.value.testSet, total: t.total, passed: t.passed }),
      result: 'Accepted', acceptedAt: value.acceptedAt, cleanupProof: 'VERIFIED' })
  } else {
    if (typeof value.verdict !== 'string' || !failures.has(value.verdict) || !timestamp(value.gradedAt) || !timestamp(value.recordedAt)) return bad()
    record = Object.freeze({ ...c.value, verdict: value.verdict as FailedSubmissionRecord['verdict'],
      gradedAt: value.gradedAt, recordedAt: value.recordedAt })
  }
  if (expectedCapture !== undefined) {
    const expected = validateSubmissionCapture(expectedCapture)
    if (!expected.ok) return expected
    if (JSON.stringify(c.value) !== JSON.stringify(expected.value)) return bad('IDENTITY_MISMATCH')
  }
  const bounds = validateSubmissionCapacity(recordKind(record), { recordBytes: Buffer.byteLength(recordText(record), 'utf8'),
    metadataBytes: Buffer.byteLength(recordText(record, true), 'utf8'), snapshotBytes: 0 })
  return bounds.ok ? ok(record) : bounds
}
export function encodeSubmissionRecord(value: unknown): SubmissionValidation<string> {
  const checked = validateSubmissionRecord(value)
  return checked.ok ? ok(recordText(checked.value)) : checked
}

/** Pure consistency check. A forged matching projection still grants NO authority. */
export function routeSubmissionCandidate(value: unknown): SubmissionValidation<SubmissionStoreKind> {
  if (!exact(value, ['state', 'verdict', 'eligibility']) || value.state !== 'FINAL') return bad('INELIGIBLE')
  if (value.verdict === 'Accepted' && value.eligibility === 'ACCEPTED_CANDIDATE') return ok('ACCEPTED')
  if (typeof value.verdict === 'string' && failures.has(value.verdict) && value.eligibility === 'GRADED_FAILURE_CANDIDATE') return ok('FAILED')
  return bad('INELIGIBLE')
}
export function validateSubmissionForCandidate(value: unknown, candidate: unknown, expectedCapture: unknown): SubmissionValidation<SubmissionRecord> {
  const route = routeSubmissionCandidate(candidate)
  if (!route.ok) return route
  const checked = validateSubmissionRecord(value, expectedCapture)
  if (!checked.ok) return checked
  const verdict = 'result' in checked.value ? checked.value.result : checked.value.verdict
  return recordKind(checked.value) === route.value && verdict === (candidate as { verdict: unknown }).verdict
    ? checked : bad('IDENTITY_MISMATCH')
}
export function bindSubmissionTarget(value: unknown): SubmissionValidation<Readonly<SubmissionTargetBinding>> {
  const checked = validateSubmissionRecord(value)
  return checked.ok ? ok(Object.freeze({ id: checked.value.id, submissionId: checked.value.submissionId,
    storeKind: recordKind(checked.value), payloadDigest: digest(recordText(checked.value)) })) : checked
}
export function compareSubmissionIdentity(a: unknown, b: unknown): SubmissionValidation<SubmissionIdempotency> {
  const left = validateSubmissionRecord(a), right = validateSubmissionRecord(b)
  if (!left.ok) return left
  if (!right.ok) return right
  if (left.value.id !== right.value.id && left.value.submissionId !== right.value.submissionId) return ok('DISTINCT')
  return ok(recordText(left.value) === recordText(right.value) ? 'MATCHING_RETRY' : 'IDEMPOTENCY_CONFLICT')
}

function header(doc: UnsignedSubmissionDocument): string {
  return JSON.stringify({ schemaVersion: 1, storeKind: doc.storeKind, commitSequence: doc.commitSequence,
    lastCommitId: doc.lastCommitId, previousCommit: doc.previousCommit === null ? null : {
      commitSequence: doc.previousCommit.commitSequence, commitId: doc.previousCommit.commitId, digest: doc.previousCommit.digest },
  }).slice(0, -1) + ',"records":['
}
/** Hash/measure canonical chunks without constructing another whole snapshot. */
function documentFacts(doc: UnsignedSubmissionDocument): { checksum: string; bytes: number } {
  const h = createHash('sha256')
  let bytes = 0
  const add = (text: string) => { h.update(text, 'utf8'); bytes += Buffer.byteLength(text, 'utf8') }
  add(header(doc))
  doc.records.forEach((r, i) => { if (i) add(','); add(recordText(r)) })
  add(']}')
  // Persisted checksum field (64 ASCII hex), closing delimiter and one LF.
  return { checksum: h.digest('hex'), bytes: bytes - 1 + ',"checksum":"'.length + 64 + '"}\n'.length }
}
function document(value: unknown, signed: boolean): SubmissionValidation<SubmissionDocument> {
  if (!exact(value, [...envelope, ...(signed ? ['checksum'] : [])])) return bad()
  if (value.schemaVersion !== 1) return bad('UNSUPPORTED_SCHEMA')
  if (!kind(value.storeKind) || !integer(value.commitSequence, 1) || !uuid(value.lastCommitId)
    || !dense(value.records) || !value.records.length) return bad()
  // Every record has at least 1 encoded byte: reject impossible sizes before traversing.
  if (value.records.length > P[value.storeKind].snapshotBytes) return bad('CAPACITY_EXCEEDED')
  let previous: SubmissionDocument['previousCommit'] = null
  if (value.commitSequence === 1) {
    if (value.previousCommit !== null || value.records.length !== 1) return bad('INVALID_LINEAGE')
  } else {
    if (!exact(value.previousCommit, ['commitSequence', 'commitId', 'digest'])
      || !integer(value.previousCommit.commitSequence, 1) || value.previousCommit.commitSequence !== value.commitSequence - 1
      || !uuid(value.previousCommit.commitId) || value.previousCommit.commitId === value.lastCommitId
      || !hash(value.previousCommit.digest)) return bad('INVALID_LINEAGE')
    previous = Object.freeze({ commitSequence: value.previousCommit.commitSequence,
      commitId: value.previousCommit.commitId, digest: value.previousCommit.digest })
  }
  const records: SubmissionRecord[] = [], ids = new Set<string>(), submissions = new Set<string>()
  let recordBytes = 0
  for (const raw of value.records) {
    const checked = validateSubmissionRecord(raw)
    if (!checked.ok) return checked
    if (recordKind(checked.value) !== value.storeKind) return bad('IDENTITY_MISMATCH')
    const r = checked.value
    if (ids.has(r.id) || submissions.has(r.submissionId)) return bad('DUPLICATE_ID')
    ids.add(r.id); submissions.add(r.submissionId)
    recordBytes += Buffer.byteLength(recordText(r), 'utf8') + (records.length ? 1 : 0)
    if (recordBytes > P[value.storeKind].snapshotBytes) return bad('CAPACITY_EXCEEDED')
    records.push(r)
  }
  const base = { schemaVersion: 1 as const, storeKind: value.storeKind, commitSequence: value.commitSequence,
    lastCommitId: value.lastCommitId, previousCommit: previous, records: Object.freeze(records) } as UnsignedSubmissionDocument
  const facts = documentFacts(base)
  if (facts.bytes > P[value.storeKind].snapshotBytes) return bad('CAPACITY_EXCEEDED')
  if (signed && (!hash(value.checksum) || value.checksum !== facts.checksum)) return bad('CHECKSUM_MISMATCH')
  return ok(Object.freeze({ ...base, checksum: facts.checksum }))
}
/** Constructs data/checksum only. Does not issue IDs, append, commit or verify disk. */
export function sealSubmissionDocument(value: unknown): SubmissionValidation<SubmissionDocument> { return document(value, false) }
export function validateSubmissionDocument(value: unknown): SubmissionValidation<SubmissionDocument> { return document(value, true) }
export function encodeSubmissionDocument(value: unknown): SubmissionValidation<string> {
  const checked = validateSubmissionDocument(value)
  if (!checked.ok) return checked
  const d = checked.value
  return ok(header(d) + d.records.map(r => recordText(r)).join(',') + '],"checksum":"' + d.checksum + '"}\n')
}
/** Canonical-only wire bytes reject duplicate JSON keys, BOM and trailing material.
 * This is a pure decoder; validity says nothing about filesystem commit status. */
export function decodeSubmissionDocument(value: unknown): SubmissionValidation<SubmissionDocument> {
  let text: string
  try {
    if (typeof value === 'string') {
      if (!wellFormed(value) || Buffer.byteLength(value, 'utf8') > P.ACCEPTED.snapshotBytes) return bad('INVALID_ENCODING')
      text = value
    } else if (value instanceof Uint8Array && value.byteLength <= P.ACCEPTED.snapshotBytes) {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value)
    } else return bad('INVALID_ENCODING')
    const parsed: unknown = JSON.parse(text)
    const checked = validateSubmissionDocument(parsed)
    if (!checked.ok) return checked
    const encoded = encodeSubmissionDocument(checked.value)
    return encoded.ok && encoded.value === text ? checked : bad('INVALID_ENCODING')
  } catch { return bad('INVALID_ENCODING') }
}
/** Check an actual supplied predecessor; a standalone previous digest cannot prove history. */
export function validateSubmissionLineage(next: unknown, prior: unknown): SubmissionValidation<SubmissionDocument> {
  const n = validateSubmissionDocument(next), p = validateSubmissionDocument(prior)
  if (!n.ok) return n
  if (!p.ok) return p
  const ref = n.value.previousCommit
  if (!ref || n.value.storeKind !== p.value.storeKind || ref.commitId !== p.value.lastCommitId
    || ref.digest !== p.value.checksum || ref.commitSequence !== p.value.commitSequence
    || n.value.records.length !== p.value.records.length + 1
    || p.value.records.some((r, i) => recordText(r) !== recordText(n.value.records[i]))) return bad('INVALID_LINEAGE')
  return n
}
