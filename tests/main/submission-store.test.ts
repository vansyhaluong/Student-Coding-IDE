import * as fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LearningStore } from '../../src/main/services/learning/learning-store'
import { SnapshotTransaction, recoverSnapshot, type TransactionClock } from '../../src/main/services/learning/storage/snapshot-transaction'
import { SubmissionStoreFiles, nodeStoreFilePort, type StoreFilePort } from '../../src/main/services/learning/storage/store-files'
import { SharedSubmissionStoreLease, StoreIOError } from '../../src/main/services/learning/storage/store-lease'
import { SUBMISSION_STORE_POLICY as P, type SubmissionDocument, type SubmissionRecord, type SubmissionStoreKind, type SubmissionValidation } from '../../src/main/services/learning/storage/submission-contracts'
import { decodeSubmissionDocument, encodeSubmissionDocument, sealSubmissionDocument } from '../../src/main/services/learning/storage/submission-validation'

const digest = (s: string) => createHash('sha256').update(s).digest('hex')
const when = '2026-10-26T12:00:00.000Z'
function unwrap<T>(r: SubmissionValidation<T>): T { if (!r.ok) throw Error(r.reason); return r.value }
function record(kind: SubmissionStoreKind = 'ACCEPTED', code = 'synthetic'): SubmissionRecord {
  const common = { schemaVersion: 1 as const, id: randomUUID(), submissionId: randomUUID(), exerciseId: 'synthetic',
    language: 'javascript' as const, code, sourceRevision: 1, codeHash: digest(code), submittedAt: when,
    packageVersion: 1, signatureVersion: 1, signatureHash: digest('signature'),
    testSet: { id: 'synthetic', version: 1, hash: digest('testset') }, comparator: { id: 'exact-typed' as const, version: 1 as const } }
  return kind === 'ACCEPTED' ? { ...common, result: 'Accepted', acceptedAt: when, cleanupProof: 'VERIFIED',
    testSet: { ...common.testSet, total: 1, passed: 1 } } : { ...common, verdict: 'WrongAnswer', gradedAt: when, recordedAt: when }
}
function document(records: SubmissionRecord[], previous?: SubmissionDocument): SubmissionDocument {
  return unwrap(sealSubmissionDocument({ schemaVersion: 1, storeKind: 'result' in records[0] ? 'ACCEPTED' : 'FAILED',
    commitSequence: (previous?.commitSequence ?? 0) + 1, lastCommitId: randomUUID(),
    previousCommit: previous ? { commitSequence: previous.commitSequence, commitId: previous.lastCommitId, digest: previous.checksum } : null, records }))
}
const bytes = (d: SubmissionDocument) => unwrap(encodeSubmissionDocument(d))
let fixture: string
beforeEach(async () => { fixture = await fs.mkdtemp(join(resolve(tmpdir()), 'student-submission-s3-')) })
afterEach(async () => {
  if (!resolve(fixture).startsWith(resolve(tmpdir()) + sep) || !fixture.includes('student-submission-s3-')) throw Error('Fixture scope')
  await fs.rm(fixture, { recursive: true })
})
async function setup(io: StoreFilePort = nodeStoreFilePort, time?: TransactionClock) {
  const root = join(fixture, randomUUID()); await fs.mkdir(root)
  const files = await SubmissionStoreFiles.open(root, io)
  await fs.writeFile(files.lockPath, '')
  let held = false, closes = 0, closeFault = false
  const lease = new SharedSubmissionStoreLease(files, { capability: 'student-ide-learning-job-v1',
    acquireLease() { if (held) return null; held = true; return {} },
    observation() { if (closeFault) throw Error('injected close'); held = false; closes++ } })
  const store = new LearningStore({ files, lease, clock: time })
  return { root, files, lease, store, get closes() { return closes }, set closeFault(v: boolean) { closeFault = v },
    start: (r = record(), guard = () => {}, acknowledge?: () => void) => store.begin(r, guard, acknowledge),
    read: async (kind: SubmissionStoreKind = 'ACCEPTED', backup = false) => unwrap(decodeSubmissionDocument(await fs.readFile(join(root, P[kind].filename + (backup ? '.bak' : ''))))) }
}
const failure = (code = 'EIO') => Object.assign(Error('synthetic fault'), { code })
const manualClock = () => {
  let now = 0
  const sleeps: number[] = []
  return { now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms },
    advance: (ms: number) => { now += ms }, sleeps }
}

describe('E5-S3 one-target retained transactions', () => {
  it.each(['ACCEPTED', 'FAILED'] as const)('commits %s, verifies backup and exact append lineage, dedupes across restart', async kind => {
    const s = await setup(), a = record(kind), b = record(kind)
    const first = s.start(a); expect(first.status.state).toBe('pending')
    expect((await first.task).state).toBe('saved'); expect(first.settled).toBe(true)
    const old = await s.read(kind)
    expect(s.start(a)).toBe(first)
    const second = s.start(b); expect((await second.task).state).toBe('saved')
    const latest = await s.read(kind)
    expect(latest.records).toEqual([a, b]); expect(await s.read(kind, true)).toEqual(old)
    expect(latest.previousCommit?.digest).toBe(old.checksum)
    const opposite = kind === 'ACCEPTED' ? 'FAILED' : 'ACCEPTED'
    expect(await s.files.inspect(opposite)).toBeNull()
    // Use a new matching files/lease pair after restart, just as composition must.
    const reopened = await SubmissionStoreFiles.open(s.root)
    const newLease = new SharedSubmissionStoreLease(reopened, { capability: 'student-ide-learning-job-v1', acquireLease: () => ({}), observation() {} })
    const retry = new LearningStore({ files: reopened, lease: newLease }).begin(a, () => { throw Error('duplicate must not dispatch') })
    expect((await retry.task).state).toBe('saved'); expect(await s.read(kind)).toEqual(latest)
  })
  it('joins one frozen continuation and rejects same-ID changed payload or route', async () => {
    const s = await setup(), a = record(), tx = s.start(a)
    expect(s.start({ ...a })).toBe(tx)
    expect(() => s.start({ ...a, code: 'different', codeHash: digest('different') })).toThrowError(expect.objectContaining({ reason: 'CONFLICT' }))
    const failed = { ...record('FAILED'), id: a.id, submissionId: a.submissionId }
    expect(() => s.start(failed)).toThrowError(expect.objectContaining({ reason: 'CONFLICT' }))
    expect((await tx.task).state).toBe('saved')
    const direct = new SnapshotTransaction({ files: s.files, lease: s.lease, record: failed, guard() {} })
    expect(await direct.task).toMatchObject({ state: 'failed', reason: 'CONFLICT' })
  })
  it('keeps healthy target independent of unavailable opposite store', async () => {
    const io = { ...nodeStoreFilePort, open: async (path: string, flags: 'r' | 'wx') => {
      if (path.endsWith('failed-submissions.json')) throw failure('EACCES')
      return nodeStoreFilePort.open(path, flags)
    } }
    const s = await setup(io); await fs.writeFile(join(s.root, P.FAILED.filename), 'unreadable')
    expect((await s.start().task).state).toBe('saved')
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('refuses %s reserve exhaustion and never routes elsewhere', async kind => {
    const s = await setup({ ...nodeStoreFilePort, statfs: async () => ({ bavail: 1n, bsize: 1n }) })
    const tx = s.start(record(kind))
    expect(await tx.task).toMatchObject({ state: 'failed', reason: 'FULL' })
    expect(tx.settled).toBe(true); expect(await s.files.inspect(kind)).toBeNull()
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('expires %s from first entry across 250/1000ms backoff without reset', async kind => {
    const time = manualClock(); let calls = 0
    const s = await setup({ ...nodeStoreFilePort, statfs: async () => {
      calls++; time.advance(P[kind].precommitWindowMs - 500); throw failure('EBUSY')
    } }, time)
    const tx = s.start(record(kind)); expect(await tx.task).toMatchObject({ state: 'failed', reason: 'EXPIRED' })
    expect(time.sleeps).toEqual([250, 1000]); expect(calls).toBe(2)
    expect(s.start(tx.record)).toBe(tx); expect(await s.files.inspect(kind)).toBeNull()
  })
  it('limits safe transient attempts to three and records approved backoff', async () => {
    const time = manualClock(); let calls = 0
    const s = await setup({ ...nodeStoreFilePort, statfs: async () => { calls++; throw failure('EBUSY') } }, time)
    expect((await s.start().task).state).toBe('failed'); expect(calls).toBe(3); expect(time.sleeps).toEqual([250, 1000])
  })
  it('retries a settled pre-admission write failure safely', async () => {
    let writes = 0
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, write: async (...args) => { if (++writes === 1) throw failure(); return h.write(...args) } }
    } }, manualClock())
    expect((await s.start().task).state).toBe('saved'); expect((await s.read()).records).toHaveLength(1)
    expect(s.files.hasRetainedResources).toBe(false)
  })
  it.each(['write', 'sync', 'close', 'stage-read'] as const)('preserves old primary/backup on %s failure', async mode => {
    let fault = false
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (fault && mode === 'stage-read' && flags === 'r' && path.includes('.stage-')) throw failure('EACCES')
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h,
        write: async (...args) => { if (fault && mode === 'write') throw failure('ENOSPC'); return h.write(...args) },
        sync: async () => { if (fault && mode === 'sync') throw failure(); return h.sync() },
        close: async () => { if (fault && mode === 'close') throw failure(); return h.close() } }
    } }, manualClock())
    await s.start().task; await s.start().task
    const old = await s.read(), backup = await s.read('ACCEPTED', true)
    fault = true
    const tx = s.start(); expect((await tx.task).state).toBe('failed')
    if (mode === 'close') { expect(s.lease.ownsLease).toBe(true); expect(tx.settled).toBe(false) }
    fault = false; await tx.settle()
    expect(await s.read()).toEqual(old); expect(await s.read('ACCEPTED', true)).toEqual(backup)
    expect(tx.settled).toBe(true)
  })
  it('refuses a throwing/async guard with no dispatch, and checks expiry at final guard site', async () => {
    const s = await setup(), tx = s.start(record(), () => { throw Error('owner invalid') })
    expect(await tx.task).toMatchObject({ state: 'failed', reason: 'CANCELLED' })
    expect(await s.files.inspect('ACCEPTED')).toBeNull()
    const asyncGuard = s.start(record(), (async () => {}) as () => void)
    expect(await asyncGuard.task).toMatchObject({ state: 'failed', reason: 'CANCELLED' })
    const time = manualClock(); let advanced = false
    const p = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, read: async (...args) => { const r = await h.read(...args)
        if (path.includes('.stage-') && !advanced) { advanced = true; time.advance(15000) }; return r } }
    } }, time)
    expect(await p.start().task).toMatchObject({ state: 'failed', reason: 'EXPIRED' })
  })
  it.each(['before', 'after'] as const)('reconciles primary rename rejection %s replacement without blind retry', async mode => {
    let fault = false, renames = 0
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => {
      if (to.endsWith('accepted.json')) { renames++; if (fault) { if (mode === 'after') await fs.rename(from, to); throw failure('EBUSY') } }
      await fs.rename(from, to)
    } })
    await s.start().task; const old = await s.read(); fault = true
    const tx = s.start(); expect((await tx.task).state).toBe('unknown')
    expect(s.lease.ownsLease).toBe(true); expect(renames).toBe(2)
    expect(await tx.settle()).toMatchObject({ state: mode === 'after' ? 'saved' : 'failed' })
    expect(tx.settled).toBe(true); expect(renames).toBe(2)
    expect((await s.read()).records).toHaveLength(mode === 'after' ? 2 : 1)
    expect(await s.read('ACCEPTED', true)).toEqual(old)
  })
  it('retains unresolved rename/task/lease after caller deadline and expires only precommit', async () => {
    let unblock!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { unblock = resolve }), dispatched = new Promise<void>(resolve => { entered = resolve })
    const time = manualClock()
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => {
      if (to.endsWith('accepted.json')) { entered(); await gate }; await fs.rename(from, to)
    } }, time)
    const tx = s.start(); await dispatched; time.advance(20000)
    expect(await tx.wait(1)).toMatchObject({ state: 'pending' }); expect(tx.slow).toBe(true)
    expect(s.closes).toBe(0); await expect(s.lease.retryRelease()).rejects.toMatchObject({ reason: 'BUSY' })
    expect(() => s.start()).toThrowError(expect.objectContaining({ reason: 'BUSY' }))
    expect(s.start(tx.record)).toBe(tx)
    unblock(); expect((await tx.task).state).toBe('saved'); expect(tx.settled).toBe(true); expect(s.closes).toBe(1)
  })
  it('keeps unknown/read-back error excluded until exact verification succeeds', async () => {
    let blockRead = false
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => { await fs.rename(from, to); if (to.endsWith('accepted.json')) blockRead = true },
      open: async (path, flags) => { if (blockRead && path.endsWith('accepted.json')) throw failure('EACCES'); return nodeStoreFilePort.open(path, flags) } })
    const tx = s.start(); expect((await tx.task).state).toBe('unknown'); expect((await tx.settle()).state).toBe('unknown')
    expect(s.lease.ownsLease).toBe(true); expect(() => s.start()).toThrow(StoreIOError)
    blockRead = false; expect((await tx.settle()).state).toBe('saved'); expect(tx.settled).toBe(true)
  })
  it('recovers lost ACK as one saved record after restart, never promotes temp', async () => {
    const s = await setup(), tx = s.start(record(), () => {}, () => { throw failure() })
    expect((await tx.task).state).toBe('unknown'); expect((await tx.settle()).state).toBe('saved')
    const committed = await s.read()
    await fs.writeFile(join(s.root, 'accepted.json.stage-orphan.tmp'), bytes(document([record()])))
    const reopen = await SubmissionStoreFiles.open(s.root), lease = new SharedSubmissionStoreLease(reopen,
      { capability: 'student-ide-learning-job-v1', acquireLease: () => ({}), observation() {} })
    const lock = await lease.acquire()
    expect((await recoverSnapshot(reopen, lock, 'ACCEPTED')).document).toEqual(committed)
    await lock.release(); expect((await s.read()).records).toHaveLength(1)
  })
  it('settles failed native close without rewriting a verified saved commit', async () => {
    const s = await setup(); s.closeFault = true
    const tx = s.start(); expect((await tx.task).state).toBe('saved'); expect(tx.settled).toBe(false)
    const old = await s.read(); expect(s.lease.ownsLease).toBe(true)
    s.closeFault = false; await tx.settle(); expect(tx.settled).toBe(true); expect(await s.read()).toEqual(old)
  })
  it('expires delayed staging before admission and keeps the original lease until write settles', async () => {
    const time = manualClock()
    let unblock!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { unblock = resolve }), writing = new Promise<void>(resolve => { entered = resolve })
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, write: async (...args) => { entered(); await gate; return h.write(...args) } }
    } }, time)
    let guards = 0
    const tx = s.start(record('FAILED'), () => { guards++ }); await writing
    time.advance(10001); expect((await tx.wait(1)).state).toBe('pending')
    await expect(s.lease.retryRelease()).rejects.toMatchObject({ reason: 'BUSY' }); expect(s.closes).toBe(0)
    unblock(); expect(await tx.task).toMatchObject({ state: 'failed', reason: 'EXPIRED' })
    expect(guards).toBe(0); expect(tx.settled).toBe(true); expect(await s.files.inspect('FAILED')).toBeNull()
  })
  it('rechecks expiry after injected guard synchronously and passes exact base/target binding', async () => {
    const time = manualClock(), s = await setup(nodeStoreFilePort, time)
    await s.start().task; const base = await s.read(), nextRecord = record()
    const tx = s.store.begin(nextRecord, context => {
      expect(context.base).toEqual(base); expect(context.target.submissionId).toBe(nextRecord.submissionId)
      expect(context.next.previousCommit?.digest).toBe(base.checksum)
      time.advance(15000)
    })
    expect(await tx.task).toMatchObject({ state: 'failed', reason: 'EXPIRED' }); expect(await s.read()).toEqual(base)
  })
  it('returns unavailable for failed free-space capability instead of assuming sufficient capacity', async () => {
    const s = await setup({ ...nodeStoreFilePort, statfs: async () => { throw new StoreIOError('UNAVAILABLE') } })
    expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'UNAVAILABLE' })
    expect(await s.files.inspect('ACCEPTED')).toBeNull()
  })
  it('fails closed on missing-store evidence scan failure while allowing an already verified healthy opposite target', async () => {
    const s = await setup({ ...nodeStoreFilePort, readdir: async () => { throw failure('EACCES') } })
    expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'UNAVAILABLE' })
    const base = document([record()]); await fs.writeFile(join(s.root, 'accepted.json'), bytes(base))
    expect((await s.start().task).state).toBe('saved')
    expect((await s.read()).records).toHaveLength(2)
  })
})

describe('E5-S3 restart classification and preservation', () => {
  it.each(['MISSING', 'CORRUPT', 'UNSUPPORTED_SCHEMA', 'READ_ONLY', 'RECOVERY_PENDING'] as const)('classifies %s without reset or temp promotion', async state => {
    const s = await setup(), path = join(s.root, 'accepted.json')
    if (state === 'CORRUPT') await fs.writeFile(path, 'corrupt evidence')
    if (state === 'UNSUPPORTED_SCHEMA') { const d = JSON.parse(bytes(document([record()]))); d.schemaVersion = 2; await fs.writeFile(path, JSON.stringify(d)) }
    if (state === 'READ_ONLY') { const h = await fs.open(path, 'wx'); await h.truncate(P.ACCEPTED.snapshotBytes + 1); await h.close() }
    if (state === 'RECOVERY_PENDING') await fs.writeFile(path + '.stage-orphan.tmp', bytes(document([record()])))
    const lock = await s.lease.acquire(); expect((await recoverSnapshot(s.files, lock, 'ACCEPTED')).availability).toBe(state); await lock.release()
    if (state !== 'MISSING') {
      expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'UNAVAILABLE' })
      if (state === 'CORRUPT') expect(await fs.readFile(path, 'utf8')).toBe('corrupt evidence')
    }
  })
  it.each(['corrupt', 'missing'] as const)('exposes verified backup with data-loss warning for %s primary; preserves evidence and blocks mutation', async mode => {
    const s = await setup(); await s.start().task; await s.start().task
    const backup = await s.read('ACCEPTED', true)
    if (mode === 'corrupt') await fs.writeFile(join(s.root, 'accepted.json'), 'corrupt preserve')
    else await fs.unlink(join(s.root, 'accepted.json'))
    const lock = await s.lease.acquire(), recovered = await recoverSnapshot(s.files, lock, 'ACCEPTED')
    expect(recovered).toMatchObject({ availability: 'RECOVERED', document: backup, warning: 'POSSIBLE_DATA_LOSS' }); await lock.release()
    expect((await s.start().task).state).toBe('failed'); expect(await s.read('ACCEPTED', true)).toEqual(backup)
    if (mode === 'corrupt') expect(await fs.readFile(join(s.root, 'accepted.json'), 'utf8')).toBe('corrupt preserve')
  })
  it('refuses incoherent/equal-sequence conflicting lineage and both-corrupt evidence', async () => {
    const s = await setup(), a = document([record()]), b = document([record()])
    await fs.writeFile(join(s.root, 'accepted.json'), bytes(a)); await fs.writeFile(join(s.root, 'accepted.json.bak'), bytes(b))
    expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'CONFLICT' })
    expect(await s.read()).toEqual(a); expect(await s.read('ACCEPTED', true)).toEqual(b)
    await fs.writeFile(join(s.root, 'accepted.json'), 'bad1'); await fs.writeFile(join(s.root, 'accepted.json.bak'), 'bad2')
    const lock = await s.lease.acquire(); expect((await recoverSnapshot(s.files, lock, 'ACCEPTED')).availability).toBe('CORRUPT'); await lock.release()
  })
  it('preserves old primary on backup replacement failure, settles without primary admission', async () => {
    let fail = false, primaryDispatch = 0
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => {
      if (fail && to.endsWith('.bak')) throw failure('EBUSY')
      if (to.endsWith('accepted.json')) primaryDispatch++
      await fs.rename(from, to)
    } })
    await s.start().task; const old = await s.read(); fail = true
    const tx = s.start(); expect((await tx.task).state).toBe('failed'); expect(primaryDispatch).toBe(1)
    expect(tx.settled).toBe(true); expect(await s.read()).toEqual(old)
  })
  it('reconciles a replaced backup with lost rename response; restart keeps old primary authoritative', async () => {
    let fail = false, guards = 0
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => {
      await fs.rename(from, to); if (fail && to.endsWith('.bak')) throw failure()
    } })
    await s.start().task; const old = await s.read(); fail = true
    const tx = s.start(record(), () => { guards++ }); expect((await tx.task).state).toBe('failed')
    expect(guards).toBe(0); expect(tx.settled).toBe(true)
    expect(await s.read()).toEqual(old); expect(await s.read('ACCEPTED', true)).toEqual(old)
    const lock = await s.lease.acquire()
    expect(await recoverSnapshot(s.files, lock, 'ACCEPTED')).toMatchObject({ availability: 'AVAILABLE', document: old })
    await lock.release()
  })
  it('requires authenticated shared lease for restart recovery', async () => {
    const s = await setup()
    await expect(recoverSnapshot(s.files, { state: 'HELD', release: async () => {} }, 'ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
  })
  it('reports permission failure as unavailable rather than missing', async () => {
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (path.endsWith('accepted.json')) throw failure('EACCES'); return nodeStoreFilePort.open(path, flags)
    } })
    await fs.writeFile(join(s.root, 'accepted.json'), 'preserve locked evidence')
    const lock = await s.lease.acquire()
    expect((await recoverSnapshot(s.files, lock, 'ACCEPTED')).availability).toBe('UNAVAILABLE'); await lock.release()
    expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'UNAVAILABLE' })
    expect(await fs.readFile(join(s.root, 'accepted.json'), 'utf8')).toBe('preserve locked evidence')
  })
  it('keeps verified primary authoritative with corrupt backup, dedupes saved ID but blocks new mutation', async () => {
    const s = await setup(), a = record(); await s.start(a).task
    const primary = await s.read(); await fs.writeFile(join(s.root, 'accepted.json.bak'), 'preserve bad backup')
    const lock = await s.lease.acquire()
    expect(await recoverSnapshot(s.files, lock, 'ACCEPTED')).toMatchObject({ availability: 'READ_ONLY', document: primary, backupAvailability: 'CORRUPT' })
    await lock.release()
    const retry = new SnapshotTransaction({ files: s.files, lease: s.lease, record: a, guard() { throw Error('no dispatch') } })
    expect((await retry.task).state).toBe('saved')
    expect(await s.start().task).toMatchObject({ state: 'failed', reason: 'UNAVAILABLE' })
    expect(await s.read()).toEqual(primary)
    expect(await fs.readFile(join(s.root, 'accepted.json.bak'), 'utf8')).toBe('preserve bad backup')
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('refuses actual encoded %s snapshot capacity without pruning', async kind => {
    const s = await setup(), records: SubmissionRecord[] = [], code = '\0'.repeat(256 * 1024)
    // A valid near-full document assembled with a valid direct predecessor.
    const count = kind === 'ACCEPTED' ? 42 : 21
    for (let i = 0; i < count; i++) records.push(record(kind, code))
    const base = unwrap(sealSubmissionDocument({ schemaVersion: 1, storeKind: kind, commitSequence: count,
      lastCommitId: randomUUID(), previousCommit: { commitSequence: count - 1, commitId: randomUUID(), digest: digest('synthetic predecessor') }, records }))
    const original = bytes(base); await fs.writeFile(join(s.root, P[kind].filename), original)
    const tx = s.start(record(kind, code)); expect(await tx.task).toMatchObject({ state: 'failed', reason: 'FULL' })
    expect(await fs.readFile(join(s.root, P[kind].filename), 'utf8')).toBe(original)
  }, 30000)
})
