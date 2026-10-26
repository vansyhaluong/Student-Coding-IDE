import { createHash } from 'node:crypto'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  SUBMISSION_LIMITS as L, SUBMISSION_STORE_POLICY as P,
  type AcceptedSubmissionRecord, type FailedSubmissionRecord, type SubmissionCapture,
  type SubmissionDocument, type SubmissionRecord, type SubmissionStorageResult, type SubmissionValidation,
} from '../../src/main/services/learning/storage/submission-contracts'
import {
  bindSubmissionTarget, compareSubmissionIdentity, decodeSubmissionDocument, encodeSubmissionDocument,
  encodeSubmissionRecord, hashSubmissionSource, routeSubmissionCandidate, sealSubmissionDocument,
  validateSubmissionCapacity, validateSubmissionCapture, validateSubmissionDocument, validateSubmissionForCandidate,
  validateSubmissionLineage, validateSubmissionRecord, validateSubmissionSource,
} from '../../src/main/services/learning/storage/submission-validation'

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
const when = '2026-10-26T12:00:00.000Z'
function unwrap<T>(r: SubmissionValidation<T>): T {
  if (!r.ok) throw new Error(`Unexpected validation failure: ${r.reason}`)
  return r.value
}
function capture(code = 'return 1;\r\n', n = 1): SubmissionCapture {
  return { schemaVersion: 1, id: uuid(n), submissionId: uuid(n + 10000), exerciseId: 'synthetic-exercise', language: 'csharp',
    code, sourceRevision: 4, codeHash: hash(code), submittedAt: when, packageVersion: 2,
    signatureVersion: 1, signatureHash: hash('synthetic signature'),
    testSet: { id: 'synthetic-official', version: 3, hash: hash('synthetic set, no actual cases') },
    comparator: { id: 'exact-typed', version: 1 } }
}
function accepted(code?: string, n = 1): AcceptedSubmissionRecord {
  const c = capture(code, n)
  return { ...c, testSet: { ...c.testSet, total: 7, passed: 7 }, result: 'Accepted', acceptedAt: when, cleanupProof: 'VERIFIED' }
}
function failed(verdict: FailedSubmissionRecord['verdict'] = 'WrongAnswer', code?: string, n = 1): FailedSubmissionRecord {
  return { ...capture(code, n), language: 'javascript', verdict, gradedAt: when, recordedAt: when }
}
function unsigned(records: readonly SubmissionRecord[], sequence = 1, previousCommit: SubmissionDocument['previousCommit'] = null) {
  return { schemaVersion: 1, storeKind: 'result' in records[0] ? 'ACCEPTED' : 'FAILED', commitSequence: sequence,
    lastCommitId: uuid(50000 + sequence), previousCommit, records }
}
function genesis(record: SubmissionRecord = accepted()): SubmissionDocument {
  return unwrap(sealSubmissionDocument(unsigned([record])))
}
const candidate = { state: 'FINAL', verdict: 'Accepted', eligibility: 'ACCEPTED_CANDIDATE' }

describe('S1 immutable record shape and data-only eligibility', () => {
  it('validates and detaches an Accepted record/capture without issuing commit authority', () => {
    const input = accepted(), validated = unwrap(validateSubmissionRecord(input, capture()))
    expect(validated).toEqual(input)
    expect(validated).not.toBe(input)
    expect(Object.isFrozen(validated)).toBe(true)
    expect(Object.isFrozen(validated.testSet)).toBe(true)
    expect(Object.isFrozen(validated.comparator)).toBe(true)
    expect(unwrap(validateSubmissionCapture(capture()))).toEqual(capture())
    expect(unwrap(validateSubmissionForCandidate(input, candidate, capture()))).toEqual(input)
    expect(Object.keys(validated)).not.toContain('completed')
    expect(Object.keys(validated)).not.toContain('commitCapability')
    expectTypeOf<SubmissionRecord>().not.toMatchTypeOf<SubmissionStorageResult>()
  })
  it.each(['WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'] as const)(
    'allows trusted final %s shape without inventing case rows or completion', verdict => {
      const r = failed(verdict)
      expect(unwrap(validateSubmissionRecord(r))).toEqual(r)
      expect(routeSubmissionCandidate({ state: 'FINAL', verdict, eligibility: 'GRADED_FAILURE_CANDIDATE' })).toEqual({ ok: true, value: 'FAILED' })
      expect('decisions' in r || 'completed' in r || 'attemptedCases' in r).toBe(false)
    })
  it('allows zero-case compile/syntax records without fabricated counters; validates matching immutable capture', () => {
    for (const verdict of ['CompilationError', 'SyntaxError'] as const) {
      const record = failed(verdict)
      const expected = { ...capture(), language: 'javascript' }
      expect(validateSubmissionForCandidate(record, { state: 'FINAL', verdict, eligibility: 'GRADED_FAILURE_CANDIDATE' }, expected).ok).toBe(true)
      expect(validateSubmissionRecord({ ...record, attemptedCases: 0 }).ok).toBe(false)
    }
  })
  it.each(['InfrastructureFailure', 'ProtocolFailure', 'CancelledInvalidated', 'Cancelled', 'Accepted', 'unknown'])(
    'rejects %s as a Failed record verdict', verdict => {
      expect(validateSubmissionRecord({ ...failed(), verdict }).ok).toBe(false)
      expect(routeSubmissionCandidate({ state: 'FINAL', verdict, eligibility: 'GRADED_FAILURE_CANDIDATE' }).ok).toBe(false)
    })
  it('rejects pending/mismatched eligibility and record routing, while never authenticating a supplied projection', () => {
    for (const c of [{ ...candidate, state: 'PENDING' }, { ...candidate, eligibility: 'GRADED_FAILURE_CANDIDATE' },
      { ...candidate, ownerCurrent: true }]) expect(routeSubmissionCandidate(c).ok).toBe(false)
    expect(validateSubmissionForCandidate(failed(), candidate, { ...capture(), language: 'javascript' }).ok).toBe(false)
    expect(validateSubmissionForCandidate(failed('RuntimeError'), { state: 'FINAL', verdict: 'WrongAnswer', eligibility: 'GRADED_FAILURE_CANDIDATE' },
      { ...capture(), language: 'javascript' }).ok).toBe(false)
    // This is intentionally only structural validity; a string proof is not an OS/service capability.
    expect(validateSubmissionRecord(JSON.parse(JSON.stringify(accepted()))).ok).toBe(true)
  })
  it.each(['id', 'code', 'testSet', 'sourceRevision', 'acceptedAt', 'cleanupProof'])('rejects a missing %s', key => {
    const r = { ...accepted() } as Record<string, unknown>
    delete r[key]
    expect(validateSubmissionRecord(r).ok).toBe(false)
  })
  it.each(['expected', 'hiddenCases', 'actual', 'diagnostics', 'judgeResult', 'ownerEntry', 'session', 'completed', 'saved', 'toJSON'])(
    'rejects forbidden/unknown persisted field %s rather than dropping it', key => {
      expect(validateSubmissionRecord({ ...accepted(), [key]: 'private' }).ok).toBe(false)
      expect(validateSubmissionRecord({ ...failed(), [key]: 'private' }).ok).toBe(false)
    })
  it('rejects extra nested fields, accessors, symbols and non-plain records without invoking hooks', () => {
    expect(validateSubmissionRecord({ ...accepted(), testSet: { ...accepted().testSet, expected: 1 } }).ok).toBe(false)
    expect(validateSubmissionRecord({ ...accepted(), comparator: { id: 'exact-typed', version: 1, checker: 'code' } }).ok).toBe(false)
    let calls = 0
    const r = { ...accepted(), get code() { calls++; return 'secret' } }
    expect(validateSubmissionRecord(r).ok).toBe(false)
    expect(calls).toBe(0)
    expect(validateSubmissionRecord({ ...accepted(), [Symbol('hidden')]: true }).ok).toBe(false)
    expect(validateSubmissionRecord(Object.assign(new Date(), accepted())).ok).toBe(false)
  })
  it.each([
    ['schemaVersion', 2], ['id', '../escape'], ['submissionId', uuid(1).toUpperCase() + 'x'], ['exerciseId', 'C:\\escape'],
    ['language', 'python'], ['language', { toString() { throw new Error('must not coerce') } }],
    ['sourceRevision', -1], ['sourceRevision', -0], ['sourceRevision', 0.5], ['sourceRevision', Number.MAX_SAFE_INTEGER + 1],
    ['packageVersion', 0], ['signatureVersion', Infinity], ['sourceRevision', NaN], ['codeHash', 'A'.repeat(64)],
    ['signatureHash', '0'.repeat(63)], ['submittedAt', '2026-02-30T12:00:00.000Z'], ['submittedAt', '2026-10-26'],
  ])('rejects malformed record field %s (%#)', (field, value) => {
    expect(validateSubmissionRecord({ ...accepted(), [field]: value }).ok).toBe(false)
  })
  it('rejects partial-pass/zero/unsafe Accepted counters and unverified cleanup', () => {
    for (const [total, passed] of [[0, 0], [7, 6], [7, 8], [Infinity, Infinity], [1.5, 1.5]]) {
      expect(validateSubmissionRecord({ ...accepted(), testSet: { ...accepted().testSet, total, passed } }).ok).toBe(false)
    }
    expect(validateSubmissionRecord({ ...accepted(), cleanupProof: 'HISTORY_UNVERIFIED' }).ok).toBe(false)
  })
  it('validates hashes and compares every capture field, not just revision/code hash', () => {
    expect(validateSubmissionRecord({ ...accepted(), code: 'changed' })).toEqual({ ok: false, reason: 'HASH_MISMATCH' })
    const changes = [{ sourceRevision: 5 }, { code: 'x', codeHash: hash('x') }, { packageVersion: 3 },
      { signatureVersion: 2 }, { signatureHash: hash('other') }, { language: 'javascript' }, { submissionId: uuid(555) },
      { testSet: { ...capture().testSet, version: 4 } }, { testSet: { ...capture().testSet, hash: hash('other') } }]
    for (const change of changes) expect(validateSubmissionRecord(accepted(), { ...capture(), ...change })).toEqual({ ok: false, reason: 'IDENTITY_MISMATCH' })
    expect(validateSubmissionCapture({ ...capture(), sourceRevision: Number.MAX_SAFE_INTEGER }).ok).toBe(true)
  })
  it('distinguishes retry from new deliberate submission and conflicts on either identity or route', () => {
    expect(compareSubmissionIdentity(accepted(), accepted())).toEqual({ ok: true, value: 'MATCHING_RETRY' })
    expect(compareSubmissionIdentity(accepted(), accepted(undefined, 2))).toEqual({ ok: true, value: 'DISTINCT' })
    for (const r of [accepted('different'), { ...accepted(), id: uuid(2) }, { ...accepted(), submissionId: uuid(2) }, failed()]) {
      expect(compareSubmissionIdentity(accepted(), r)).toEqual({ ok: true, value: 'IDEMPOTENCY_CONFLICT' })
    }
    const target = unwrap(bindSubmissionTarget(accepted()))
    expect(target.storeKind).toBe('ACCEPTED')
    expect(target.payloadDigest).toBe(hash(unwrap(encodeSubmissionRecord(accepted()))))
    expect(Object.isFrozen(target)).toBe(true)
    expect(unwrap(bindSubmissionTarget(failed())).storeKind).toBe('FAILED')
  })
})

describe('Submit-only exact source and byte contracts', () => {
  it.each(['', ' \t\r\n', '\u0000\u0001\b\f', 'Tiếng Việt', '😀𐐷', 'é', 'e\u0301', '"\\', 'a\r\nb\n'])(
    'round-trips exact source %j without normalization', code => {
      const encoded = unwrap(encodeSubmissionRecord(accepted(code)))
      const decoded = JSON.parse(encoded)
      expect(decoded.code).toBe(code)
      expect(decoded.codeHash).toBe(hash(code))
      expect(hashSubmissionSource(code)).toEqual({ ok: true, value: hash(code) })
    })
  it.each(['\ud800', '\udfff', 'a\ud800x', '😀\udfff', '\ud800\ud800'])(
    'rejects lone surrogate %j rather than replacing source', code => {
      expect(validateSubmissionSource(code).ok).toBe(false)
      expect(hashSubmissionSource(code).ok).toBe(false)
      expect(validateSubmissionRecord(accepted(code)).ok).toBe(false)
    })
  it('checks source code units independently from UTF-8/JSON escaping and preserves the boundary', () => {
    for (const code of ['a'.repeat(L.sourceCodeUnits), '😀'.repeat(L.sourceCodeUnits / 2), '\u0001'.repeat(L.sourceCodeUnits)]) {
      const r = accepted(code)
      const text = unwrap(encodeSubmissionRecord(r))
      expect(validateSubmissionSource(code).ok).toBe(true)
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(L.recordBytes)
      expect(JSON.parse(text).code).toBe(code)
      expect(validateSubmissionSource(code + 'x').ok).toBe(false)
    }
    expect(validateSubmissionSource(42).ok).toBe(false)
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('checks exact/just-over byte preflights for %s', storeKind => {
    const exact = { recordBytes: L.recordBytes, metadataBytes: L.metadataBytes, snapshotBytes: P[storeKind].snapshotBytes }
    expect(validateSubmissionCapacity(storeKind, exact).ok).toBe(true)
    for (const field of ['recordBytes', 'metadataBytes', 'snapshotBytes'] as const) {
      expect(validateSubmissionCapacity(storeKind, { ...exact, [field]: exact[field] + 1 })).toEqual({ ok: false, reason: 'CAPACITY_EXCEEDED' })
      expect(validateSubmissionCapacity(storeKind, { ...exact, [field]: Number.MAX_SAFE_INTEGER + 1 }).ok).toBe(false)
    }
    expect(validateSubmissionCapacity(storeKind, { ...exact, metadataBytes: -1 }).ok).toBe(false)
    expect(validateSubmissionCapacity('OTHER', exact).ok).toBe(false)
  })
  it('pins approved configuration without executing waits, disk checks or pruning', () => {
    expect(P.ACCEPTED).toEqual({ filename: 'accepted.json', snapshotBytes: 64 * 1024 ** 2,
      warningBytes: 48 * 1024 ** 2, highWarningBytes: 56 * 1024 ** 2, callerWaitMs: 15000,
      shutdownWaitMs: 15000, slowNoticeMs: 5000, precommitWindowMs: 15000 })
    expect(P.FAILED.filename).toBe('failed-submissions.json')
    expect([P.FAILED.warningBytes, P.FAILED.highWarningBytes]).toEqual([24 * 1024 ** 2, 28 * 1024 ** 2])
    expect([P.FAILED.callerWaitMs, P.FAILED.shutdownWaitMs, P.FAILED.slowNoticeMs, P.FAILED.precommitWindowMs]).toEqual([10000, 10000, 3000, 10000])
    expect([L.candidateSpaceMultiplier, L.reserveBytes, L.maxTransientAttempts, ...L.retryBackoffMs]).toEqual([2, 16 * 1024 ** 2, 3, 250, 1000])
    expect(Object.isFrozen(P.ACCEPTED) && Object.isFrozen(L.retryBackoffMs)).toBe(true)
  })
})

describe('canonical document data, checksum and lineage', () => {
  it.each([accepted(), failed()])('encodes an independent store and round-trips canonical UTF-8 (%#)', r => {
    const doc = genesis(r), text = unwrap(encodeSubmissionDocument(doc))
    expect(text.endsWith('\n')).toBe(true)
    expect(unwrap(decodeSubmissionDocument(text))).toEqual(doc)
    expect(unwrap(decodeSubmissionDocument(Buffer.from(text, 'utf8')))).toEqual(doc)
    const withoutChecksum = text.replace(/,"checksum":"[a-f0-9]{64}"}\n$/, '}')
    expect(doc.checksum).toBe(hash(withoutChecksum))
    expect(validateSubmissionDocument(doc).ok).toBe(true) // data validation, not a saved acknowledgement
  })
  it('ignores object insertion order but keeps record/source order meaningful', () => {
    const doc = genesis()
    const reorder = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(reorder)
      return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v
    }
    expect(encodeSubmissionDocument(reorder(doc))).toEqual(encodeSubmissionDocument(doc))
    expect(encodeSubmissionRecord(reorder(accepted()))).toEqual(encodeSubmissionRecord(accepted()))
    expect(genesis(accepted('a\r\n')).checksum).not.toBe(genesis(accepted('a\n')).checksum)
  })
  it('checks an actual predecessor and exact append-only prefix without performing a transaction', () => {
    const prior = genesis()
    const next = unwrap(sealSubmissionDocument(unsigned([accepted(), accepted('new code', 2)], 2,
      { commitSequence: 1, commitId: prior.lastCommitId, digest: prior.checksum })))
    expect(validateSubmissionLineage(next, prior).ok).toBe(true)
    const forgedLink = unwrap(sealSubmissionDocument({ ...unsigned(next.records, 2, { ...next.previousCommit!, digest: hash('not prior') }) }))
    expect(validateSubmissionDocument(forgedLink).ok).toBe(true) // standalone structure cannot prove history
    expect(validateSubmissionLineage(forgedLink, prior)).toEqual({ ok: false, reason: 'INVALID_LINEAGE' })
    const changed = unwrap(sealSubmissionDocument(unsigned([accepted('edited old'), accepted('new code', 2)], 2, next.previousCommit)))
    expect(validateSubmissionLineage(changed, prior).ok).toBe(false)
    expect(validateSubmissionLineage(next, genesis(failed())).ok).toBe(false)
  })
  it('rejects invalid genesis, sequence, previous identities and unsupported schema without resetting', () => {
    const base = unsigned([accepted()])
    for (const change of [{ schemaVersion: 2 }, { commitSequence: 0 }, { commitSequence: -0 },
      { commitSequence: Number.MAX_SAFE_INTEGER + 1 }, { previousCommit: { commitSequence: 1, commitId: uuid(1), digest: hash('x') } },
      { commitSequence: 2, previousCommit: null }, { records: [] }, { records: [accepted(), accepted(undefined, 2)] }]) {
      expect(sealSubmissionDocument({ ...base, ...change }).ok).toBe(false)
    }
    for (const prev of [{ commitSequence: 3, commitId: uuid(1), digest: hash('x') },
      { commitSequence: 1, commitId: uuid(50002), digest: hash('x') },
      { commitSequence: 1, commitId: uuid(1), digest: 'bad' },
      { commitSequence: 1, commitId: uuid(1), digest: hash('x'), path: 'escape' }]) {
      expect(sealSubmissionDocument(unsigned([accepted(), accepted(undefined, 2)], 2, prev)).ok).toBe(false)
    }
  })
  it('rejects duplicate/conflicting identities in document scope and wrong-store records', () => {
    const previous = { commitSequence: 1, commitId: uuid(1), digest: hash('prior') }
    for (const r of [accepted(), accepted('different'), { ...accepted(undefined, 2), id: accepted().id },
      { ...accepted(undefined, 2), submissionId: accepted().submissionId }]) {
      expect(sealSubmissionDocument(unsigned([accepted(), r], 2, previous))).toEqual({ ok: false, reason: 'DUPLICATE_ID' })
    }
    expect(sealSubmissionDocument({ ...unsigned([accepted()]), storeKind: 'FAILED' }).ok).toBe(false)
    expect(sealSubmissionDocument({ ...unsigned([failed()]), storeKind: 'ACCEPTED' }).ok).toBe(false)
    const sparse = new Array(2)
    sparse[0] = accepted()
    expect(sealSubmissionDocument({ ...unsigned([accepted()]), records: sparse }).ok).toBe(false)
  })
  it('rejects corruption, malformed bytes, duplicate JSON keys and noncanonical encoded input', () => {
    const doc = genesis(), text = unwrap(encodeSubmissionDocument(doc))
    expect(validateSubmissionDocument({ ...doc, checksum: hash('wrong') })).toEqual({ ok: false, reason: 'CHECKSUM_MISMATCH' })
    expect(validateSubmissionDocument({ ...doc, unexpected: true }).ok).toBe(false)
    expect(validateSubmissionDocument({ ...doc, records: [{ ...accepted(), code: 'changed' }] }).ok).toBe(false)
    for (const input of ['{', text + '{}', text.slice(0, -1), '\ufeff' + text,
      text.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
      text.replace('"schemaVersion":1', '"schemaVersion":2'), Buffer.from([0xc0, 0xaf]),
      Buffer.from([0xed, 0xa0, 0x80]), new Uint8Array([0xff]), '\ud800', {}]) {
      expect(decodeSubmissionDocument(input).ok).toBe(false)
    }
  })
  it('does not mutate frozen nested inputs or retain mutable aliases', () => {
    const record = accepted()
    Object.freeze(record.testSet); Object.freeze(record.comparator); Object.freeze(record)
    const raw = unsigned(Object.freeze([record]))
    Object.freeze(raw)
    const doc = unwrap(sealSubmissionDocument(raw))
    const before = JSON.stringify(raw)
    encodeSubmissionDocument(doc); validateSubmissionDocument(doc); bindSubmissionTarget(record)
    expect(JSON.stringify(raw)).toBe(before)
    expect(Object.isFrozen(doc) && Object.isFrozen(doc.records)).toBe(true)
    expect(doc.records[0]).not.toBe(record)
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('measures real canonical %s snapshots at exact cap and one byte over without allocating a snapshot string', storeKind => {
    const limit = P[storeKind].snapshotBytes
    const count = Math.ceil(limit / L.sourceCodeUnits)
    const empty = Array.from({ length: count }, (_, i) => storeKind === 'ACCEPTED' ? accepted('', i + 1) : failed('WrongAnswer', '', i + 1))
    const prev = { commitSequence: count - 1, commitId: uuid(60000), digest: hash('prior verified snapshot') }
    const template = unsigned(empty, count, prev)
    const overhead = Buffer.byteLength(unwrap(encodeSubmissionDocument(unwrap(sealSubmissionDocument(template)))), 'utf8')
    let remaining = limit - overhead
    const fullCode = 'a'.repeat(L.sourceCodeUnits)
    const fullHash = hash(fullCode)
    const records = empty.map(r => {
      const length = Math.min(remaining, L.sourceCodeUnits)
      remaining -= length
      const code = length === L.sourceCodeUnits ? fullCode : 'a'.repeat(length)
      return { ...r, code, codeHash: length === L.sourceCodeUnits ? fullHash : hash(code) }
    })
    expect(remaining).toBe(0)
    expect(sealSubmissionDocument({ ...template, records }).ok).toBe(true)
    const last = records.at(-1)!
    expect(last.code.length).toBeLessThan(L.sourceCodeUnits)
    const over = [...records.slice(0, -1), { ...last, code: last.code + 'a', codeHash: hash(last.code + 'a') }]
    expect(sealSubmissionDocument({ ...template, records: over })).toEqual({ ok: false, reason: 'CAPACITY_EXCEEDED' })
  }, 30000)
})
