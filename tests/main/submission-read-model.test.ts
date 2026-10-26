import * as fs from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { SUBMISSION_LIMITS as L } from '../../src/main/services/learning/storage/submission-contracts'
import { nodeStoreFilePort } from '../../src/main/services/learning/storage/store-files'
import type { SubmissionHistoryResult, SubmissionSourceResult } from '../../src/main/services/learning/storage/submission-read-model'
import { document, fault, fixture, hash, record, sourceRequest, uuid, type ReadFixture } from '../fixtures/learning/submission-read-fixture'

const opened: ReadFixture[] = []
async function setup(...args: Parameters<typeof fixture>) { const s = await fixture(...args); opened.push(s); return s }
afterEach(async () => { for (const s of opened.splice(0)) await s.dispose() })
function history(v: SubmissionHistoryResult) { if (!v.ok) throw Error(v.reason); return v }
function source(v: SubmissionSourceResult) { if (!v.ok) throw Error(v.reason); return v }
const encodedBytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8')

describe('E5-S4 committed history and partial availability', () => {
  it('merges committed snapshots in descending timestamp/submissionId/key order independently of file insertion order', async () => {
    const s = await setup()
    const a = record('ACCEPTED', { id: uuid(1), submissionId: uuid(10), submittedAt: '2026-10-25T00:00:00.000Z' })
    const b = record('FAILED', { id: uuid(2), submissionId: uuid(20) })
    const c = record('ACCEPTED', { id: uuid(3), submissionId: uuid(30) })
    await s.write(document([c, a])); await s.write(document([b]))
    const all = history(await s.store.history())
    expect(all.rows.map(r => r.key.recordId)).toEqual([c.id, b.id, a.id])
    expect(all).toMatchObject({ coverage: 'COMPLETE', countScope: 'ALL_SELECTED', knownCount: 3, total: 3, nextCursor: null })
    expect(history(await s.store.history()).rows).toEqual(all.rows)
    expect(history(await s.store.history({ scope: 'FAILED' })).rows[0].verdict).toBe('WrongAnswer')
  })
  it('applies exercise/language/packageVersion filters only to history', async () => {
    const s = await setup(), a = record('ACCEPTED', { language: 'csharp', packageVersion: 2 }), b = record('ACCEPTED', { exerciseId: 'other' })
    await s.write(document([a, b])); await s.write(document([record('FAILED')]))
    expect(history(await s.store.history({ scope: 'ACCEPTED', exerciseId: 'synthetic', language: 'csharp', packageVersion: 2 })).rows.map(r => r.key.recordId)).toEqual([a.id])
    expect(history(await s.store.history({ packageVersion: 999 })).total).toBe(0)
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it('distinguishes confirmed missing stores from unreadable empty-looking partial history', async () => {
    const s = await setup()
    expect(history(await s.store.history())).toMatchObject({ rows: [], total: 0, coverage: 'COMPLETE', stores: { ACCEPTED: { state: 'MISSING' } } })
    await fs.writeFile(s.path('FAILED'), 'corrupt evidence')
    expect(history(await s.store.history())).toMatchObject({ rows: [], total: null, knownCount: 0, coverage: 'PARTIAL', countScope: 'READABLE_ONLY', stores: { FAILED: { state: 'CORRUPT', readable: false } } })
    expect(history(await s.store.history({ scope: 'ACCEPTED' })).total).toBe(0)
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('returns readable opposite history while %s is permission-unavailable', async kind => {
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (path.endsWith(kind === 'ACCEPTED' ? 'accepted.json' : 'failed-submissions.json')) throw fault()
      return nodeStoreFilePort.open(path, flags)
    } })
    await s.write(document([record(kind)]))
    const opposite = kind === 'ACCEPTED' ? 'FAILED' : 'ACCEPTED', r = record(opposite)
    await s.write(document([r]))
    const all = history(await s.store.history())
    expect(all.rows.map(v => v.key.recordId)).toEqual([r.id]); expect(all.total).toBeNull()
    expect(all.stores[kind]).toEqual({ state: 'UNAVAILABLE', readable: false })
    expect(history(await s.store.history({ scope: opposite }))).toMatchObject({ total: 1, coverage: 'COMPLETE' })
    expect(JSON.stringify(all)).not.toContain('private injected diagnostic')
  })
  it('reads older verified backup with data-loss warning without repairing corrupt primary', async () => {
    const s = await setup(), r = record(), prior = document([r]), latest = document([r, record()], prior)
    await s.write(prior, true); await s.write(latest); await fs.writeFile(s.path('ACCEPTED'), 'keep corrupt')
    const result = history(await s.store.history())
    expect(result).toMatchObject({ coverage: 'PARTIAL', total: null, knownCount: 1,
      stores: { ACCEPTED: { state: 'RECOVERED', readable: true, warning: 'POSSIBLE_DATA_LOSS' } } })
    expect(result.rows[0].key.recordId).toBe(r.id)
    expect(source(await s.store.source(sourceRequest(r))).code).toBe(r.code)
    expect(await fs.readFile(s.path('ACCEPTED'), 'utf8')).toBe('keep corrupt')
    expect(await fs.readFile(s.path('ACCEPTED', true), 'utf8')).toContain(prior.checksum)
  })
  it('keeps valid primary readable with corrupt backup and preserves backup classification', async () => {
    const s = await setup(), r = record(); await s.write(document([r])); await fs.writeFile(s.path('ACCEPTED', true), 'bad backup')
    expect(history(await s.store.history())).toMatchObject({ coverage: 'COMPLETE', total: 1,
      stores: { ACCEPTED: { state: 'READ_ONLY', readable: true, backupState: 'CORRUPT' } } })
    expect(source(await s.store.source(sourceRequest(r))).code).toBe(r.code)
    expect(await fs.readFile(s.path('ACCEPTED', true), 'utf8')).toBe('bad backup')
  })
  it.each(['id', 'submissionId'] as const)('reports cross-store %s conflicts without merging or silently choosing a source', async field => {
    const s = await setup(), a = record(), b = record('FAILED', { [field]: a[field] })
    await s.write(document([a])); await s.write(document([b]))
    expect(await s.store.history()).toMatchObject({ ok: false, reason: 'CONFLICT' })
    expect(await s.store.history({ scope: 'ACCEPTED', exerciseId: 'does-not-hide-conflict' })).toMatchObject({ reason: 'CONFLICT' })
    expect(await s.store.source(sourceRequest(a))).toMatchObject({ ok: false, reason: 'CONFLICT' })
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it('rejects duplicate records inside a snapshot as corrupt instead of counting duplicates', async () => {
    const s = await setup(), r = record(), raw = JSON.parse(await encodedDocument([r]))
    raw.records.push(raw.records[0]); await fs.writeFile(s.path('ACCEPTED'), JSON.stringify(raw))
    expect(history(await s.store.history())).toMatchObject({ total: null, knownCount: 0, stores: { ACCEPTED: { state: 'CORRUPT' } } })
  })
  it('reports incoherent primary/backup lineage explicitly', async () => {
    const s = await setup(); await s.write(document([record()])); await s.write(document([record()]), true)
    expect(history(await s.store.history())).toMatchObject({ total: null, stores: { ACCEPTED: { state: 'CONFLICT', readable: false } } })
  })
  it('never promotes a valid orphan staging file or treats an evidence-only store as empty', async () => {
    const s = await setup(), r = record()
    await fs.writeFile(s.path('ACCEPTED') + '.stage-orphan.tmp', await encodedDocument([r]))
    expect(history(await s.store.history())).toMatchObject({ total: null, rows: [], stores: { ACCEPTED: { state: 'RECOVERY_PENDING' } } })
    expect(await s.store.source(sourceRequest(r))).toMatchObject({ reason: 'UNAVAILABLE' })
  })
})

async function encodedDocument(records: Parameters<typeof document>[0]) {
  const { encodeSubmissionDocument } = await import('../../src/main/services/learning/storage/submission-validation')
  const v = encodeSubmissionDocument(document(records)); if (!v.ok) throw Error(v.reason); return v.value
}

describe('E5-S4 bounded generation pagination', () => {
  it('uses default32/max100 and walks deterministic pages without duplicate or missing rows', async () => {
    const s = await setup(), records = Array.from({ length: 137 }, (_, n) => record('ACCEPTED', { id: uuid(n + 1), submissionId: uuid(n + 1000) }))
    await s.write(document(records))
    const first = history(await s.store.history()); expect(first.rows).toHaveLength(32)
    expect(Buffer.byteLength(first.nextCursor!)).toBeLessThanOrEqual(L.cursorBytes)
    const next = history(await s.store.history({ cursor: first.nextCursor! })); expect(next.rows).toHaveLength(32)
    const ids = [...first.rows, ...next.rows].map(r => r.key.recordId); expect(new Set(ids).size).toBe(64)
    const large = history(await s.store.history({ limit: 100 })); expect(large.rows).toHaveLength(100)
    const tail = history(await s.store.history({ limit: 100, cursor: large.nextCursor! })); expect(tail.rows).toHaveLength(37)
    expect(tail.nextCursor).toBeNull()
    expect([...large.rows, ...tail.rows].map(r => r.key.recordId)).toEqual([...records].reverse().map(r => r.id))
    expect(large.rows.every(r => encodedBytes(r) <= L.summaryRowBytes)).toBe(true)
    expect(encodedBytes(large)).toBeLessThanOrEqual(L.responseBytes)
  })
  it.each(['generation', 'availability', 'backup', 'filter', 'limit'] as const)('rejects a cursor after %s changes', async mode => {
    const s = await setup(), records = [record(), record()]
    const old = document(records); await s.write(old)
    const first = history(await s.store.history({ limit: 1 }))
    if (mode === 'generation') await s.write(document([...records, record()], old))
    if (mode === 'availability') await fs.writeFile(s.path('FAILED'), 'corrupt changes availability')
    if (mode === 'backup') await fs.writeFile(s.path('ACCEPTED', true), 'corrupt changes read-only availability')
    const request = { limit: mode === 'limit' ? 2 : 1, cursor: first.nextCursor!, ...(mode === 'filter' ? { language: 'csharp' } : {}) }
    expect(await s.store.history(request)).toMatchObject({ ok: false, reason: 'STALE_CURSOR' })
  })
  it('binds even an Accepted-only cursor to both stores and cannot bypass integrity by editing offset', async () => {
    const s = await setup(); await s.write(document([record(), record()]))
    const first = history(await s.store.history({ scope: 'ACCEPTED', limit: 1 }))
    const [body, signature] = first.nextCursor!.split('.'), parsed = JSON.parse(Buffer.from(body, 'base64url').toString())
    parsed.o = 999
    expect(await s.store.history({ scope: 'ACCEPTED', limit: 1, cursor: Buffer.from(JSON.stringify(parsed)).toString('base64url') + '.' + signature })).toMatchObject({ reason: 'INVALID_REQUEST' })
    await s.write(document([record('FAILED')]))
    expect(await s.store.history({ scope: 'ACCEPTED', limit: 1, cursor: first.nextCursor! })).toMatchObject({ reason: 'STALE_CURSOR' })
  })
  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: -0 }, { cursor: 'a'.repeat(513) }, { cursor: '' },
    { scope: 'all' }, { language: 'python' }, { exerciseId: '../path' }, { packageVersion: 0 }, { privateField: 'no' }, { limit: undefined }])('rejects invalid history request %j', async request => {
    const s = await setup(); expect(await s.store.history(request)).toMatchObject({ ok: false, reason: 'INVALID_REQUEST' })
  })
  it('does not invoke request getters or expose mutable summary objects', async () => {
    const s = await setup(), r = record(); await s.write(document([r]))
    let getters = 0
    expect(await s.store.history({ get limit() { getters++; return 1 } })).toMatchObject({ reason: 'INVALID_REQUEST' })
    expect(getters).toBe(0)
    const result = history(await s.store.history())
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.rows)).toBe(true)
    expect(Object.isFrozen(result.rows[0].source)).toBe(true)
  })
})

describe('E5-S4 immutable UTF-8 source reads and privacy', () => {
  it.each(['ACCEPTED', 'FAILED'] as const)('reassembles exact %s source within32KiB UTF-8 chunks and response limit', async kind => {
    const s = await setup(), code = 'a'.repeat(32767) + '🙂\r\n漢字"\\' + '\0'.repeat(40000), r = record(kind, { code })
    await s.write(document([r]))
    const chunks: string[] = []; let offset = 0
    for (;;) {
      const chunk = source(await s.store.source(sourceRequest(r, offset)))
      expect(Buffer.byteLength(chunk.code)).toBeLessThanOrEqual(L.sourceChunkBytes)
      expect(encodedBytes(chunk)).toBeLessThanOrEqual(L.responseBytes)
      expect(chunk.code).not.toContain('\ufffd'); expect(chunk.offset).toBe(offset)
      chunks.push(chunk.code); offset = chunk.nextOffset
      if (chunk.eof) break
    }
    expect(chunks[0].length).toBe(32767); expect(chunks.join('')).toBe(code)
    expect(hash(chunks.join(''))).toBe(r.codeHash)
    expect(source(await s.store.source(sourceRequest(r, offset)))).toMatchObject({ code: '', eof: true, offset, nextOffset: offset })
  })
  it('enforces the encoded response limit even for worst-case JSON source escaping', async () => {
    const s = await setup(), r = record('FAILED', { code: '\0'.repeat(32768) }); await s.write(document([r]))
    const chunk = source(await s.store.source(sourceRequest(r)))
    expect(chunk.code).toHaveLength(32768); expect(encodedBytes(chunk)).toBeGreaterThan(190000)
    expect(encodedBytes(chunk)).toBeLessThanOrEqual(L.responseBytes)
  })
  it.each([1, 2, 3, 6, -1, 0.5, -0])('rejects invalid UTF-8 byte offset %s', async offset => {
    const s = await setup(), r = record('ACCEPTED', { code: '🙂a' }); await s.write(document([r]))
    expect(await s.store.source(sourceRequest(r, offset))).toMatchObject({ reason: offset < 0 || !Number.isInteger(offset) || Object.is(offset, -0) ? 'INVALID_REQUEST' : 'INVALID_RANGE' })
  })
  it('rejects insufficient chunk size, oversized limits and invalid identities without leaking source', async () => {
    const s = await setup(), r = record('ACCEPTED', { code: '🙂a' }); await s.write(document([r]))
    expect(await s.store.source(sourceRequest(r, 0, 1))).toMatchObject({ reason: 'INVALID_RANGE' })
    for (const limit of [0, 32769, -1, 1.5]) expect(await s.store.source(sourceRequest(r, 0, limit))).toMatchObject({ reason: 'INVALID_REQUEST' })
    const request = sourceRequest(r)
    for (const changed of [{ ...request, sourceHash: hash('wrong') }, { ...request, sourceRevision: 2 }, { ...request, submissionId: uuid(999) }]) {
      const failed = await s.store.source(changed); expect(failed).toMatchObject({ reason: 'IDENTITY_MISMATCH' }); expect('code' in failed).toBe(false)
    }
    expect(await s.store.source({ ...request, key: { storeKind: 'ACCEPTED', recordId: '../path' } })).toMatchObject({ reason: 'INVALID_REQUEST' })
    expect(await s.store.source({ ...request, key: { storeKind: 'FAILED', recordId: r.id } })).toMatchObject({ reason: 'NOT_FOUND' })
  })
  it('binds immutable identity across reads, permits unrelated appends and rejects replaced same-ID payload', async () => {
    const s = await setup(), r = record(), old = document([r]); await s.write(old)
    const request = sourceRequest(r)
    await s.write(document([r, record()], old)); expect(source(await s.store.source(request)).code).toBe(r.code)
    const changed = record('ACCEPTED', { id: r.id, submissionId: r.submissionId, code: 'changed' })
    await s.write(document([changed]))
    expect(await s.store.source(request)).toMatchObject({ reason: 'IDENTITY_MISMATCH' })
  })
  it('does not claim recovered missing record is definitively not-found', async () => {
    const s = await setup(); await s.write(document([record()]), true)
    expect(await s.store.source(sourceRequest(record()))).toMatchObject({ reason: 'UNAVAILABLE', stores: { ACCEPTED: { warning: 'POSSIBLE_DATA_LOSS' } } })
  })
  it('projects explicit safe fields and rejects records containing hidden Judge evidence', async () => {
    const s = await setup(), r = record(); await s.write(document([r]))
    const rows = history(await s.store.history()).rows
    expect(Object.keys(rows[0]).sort()).toEqual(['key', 'submissionId', 'exerciseId', 'language', 'submittedAt', 'verdict', 'packageVersion', 'source'].sort())
    const chunk = source(await s.store.source(sourceRequest(r)))
    expect(Object.keys(chunk).sort()).toEqual(['ok', 'stores', 'key', 'submissionId', 'sourceHash', 'sourceRevision', 'offset', 'nextOffset', 'totalBytes', 'eof', 'code'].sort())
    for (const v of [JSON.stringify(rows), JSON.stringify(chunk)]) for (const privateValue of [r.signatureHash, r.testSet.hash, 'private-official', 'cleanupProof', 'signatureVersion', 'comparator']) expect(v).not.toContain(privateValue)
    const raw = JSON.parse(await encodedDocument([r])); raw.records[0].Expected = 'hidden sentinel'
    await fs.writeFile(s.path('ACCEPTED'), JSON.stringify(raw))
    const result = await s.store.history(); expect(JSON.stringify(result)).not.toContain('hidden sentinel')
    expect(history(result).stores.ACCEPTED.state).toBe('CORRUPT')
  })
})

describe('E5-S4 façade ownership during reads', () => {
  it('never releases an existing lease when a read cannot acquire its own token', async () => {
    const s = await setup(), token = await s.lease.acquire()
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'UNKNOWN' })
    expect(s.closes).toBe(0); expect(token.state).toBe('HELD'); expect(s.store.hasRetainedReads).toBe(false)
    await token.release()
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'NOT_COMPLETED' })
  })
  it('joins concurrent reads, blocks new commits during delayed I/O, and releases only after settlement', async () => {
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(r => { enter = r }), gate = new Promise<void>(r => { release = r })
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, read: async (...args) => { if (path.endsWith('accepted.json')) { enter(); await gate }; return h.read(...args) } }
    } })
    await s.write(document([record()]))
    const a = s.store.history(); await entered
    const b = s.store.history({ scope: 'ACCEPTED' })
    expect(s.store.hasRetainedReads).toBe(true); expect(s.closes).toBe(0)
    expect(() => s.store.begin(record(), () => {})).toThrowError(expect.objectContaining({ reason: 'BUSY' }))
    release(); expect(history(await a).total).toBe(1); expect(history(await b).total).toBe(1)
    expect(s.acquisitions).toBe(1); expect(s.closes).toBe(1); expect(s.store.hasRetainedReads).toBe(false)
  })
  it('does not queue a completion behind unrelated pending Failed I/O', async () => {
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(r => { enter = r }), gate = new Promise<void>(r => { release = r })
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, read: async (...args) => { if (path.endsWith('failed-submissions.json')) { enter(); await gate }; return h.read(...args) } }
    } })
    await s.write(document([record()])); await s.write(document([record('FAILED')]))
    const reading = s.store.history(); await entered
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'UNKNOWN', accepted: { state: 'RECOVERY_PENDING' } })
    release(); expect(history(await reading).total).toBe(2)
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it('retains failed native-close ownership and explicitly settles without exposing new candidates', async () => {
    const s = await setup(); await s.write(document([record()])); s.closeFault = true
    expect(history(await s.store.history()).total).toBe(1)
    expect(s.store.hasRetainedReads).toBe(true); expect(s.lease.ownsLease).toBe(true)
    expect(() => s.store.begin(record(), () => {})).toThrowError(expect.objectContaining({ reason: 'BUSY' }))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'UNKNOWN' })
    await expect(s.store.settleReads()).rejects.toMatchObject({ reason: 'IO' })
    s.closeFault = false; await s.store.settleReads(); expect(s.store.hasRetainedReads).toBe(false)
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
})
