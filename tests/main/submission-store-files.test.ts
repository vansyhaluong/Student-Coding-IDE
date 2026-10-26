import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SubmissionStoreFiles, nodeStoreFilePort, type StoreFilePort } from '../../src/main/services/learning/storage/store-files'
import { SharedSubmissionStoreLease, StoreIOError, storeIOError, type StoreLeaseNativePort } from '../../src/main/services/learning/storage/store-lease'

let fixture: string
const opened: SubmissionStoreFiles[] = []
const native: StoreLeaseNativePort = { capability: 'student-ide-learning-job-v1', acquireLease: () => ({}), observation() {} }
async function setup(io: StoreFilePort = nodeStoreFilePort) {
  const root = join(fixture, 'learning')
  await fs.mkdir(root)
  const files = await SubmissionStoreFiles.open(root, io); opened.push(files)
  // Fake only native handle exclusion here; actual Windows contention is in the lease suite.
  const port: StoreLeaseNativePort = { ...native, acquireLease: path => {
    if (path !== files.lockPath) throw Error('Wrong fixed lock path')
    return {}
  } }
  await fs.writeFile(files.lockPath, '')
  const owner = new SharedSubmissionStoreLease(files, port), lease = await owner.acquire()
  return { files, owner, lease, root }
}
beforeEach(async () => { fixture = await fs.mkdtemp(join(resolve(tmpdir()), 'student-submission-s2-files-')) })
afterEach(async () => {
  for (const files of opened.splice(0)) await files.retryClose()
  const base = resolve(tmpdir()) + sep
  if (!resolve(fixture).startsWith(base) || !fixture.includes('student-submission-s2-files-')) throw Error('Fixture scope')
  await fs.rm(fixture, { recursive: true, force: false })
})

describe('S2 checked Learning-only file primitives', () => {
  it('creates only the selected leaf and uses fixed primary/backup paths with explicit missing', async () => {
    const files = await SubmissionStoreFiles.open(join(fixture, 'learning')); opened.push(files)
    expect(await files.inspect('ACCEPTED')).toBeNull()
    await expect(files.read('FAILED')).rejects.toMatchObject({ reason: 'MISSING' })
    await fs.writeFile(join(fixture, 'learning', 'accepted.json'), 'old data')
    expect((await files.read('ACCEPTED')).bytes.toString()).toBe('old data')
    await fs.writeFile(join(fixture, 'learning', 'failed-submissions.json.bak'), 'backup bytes')
    expect((await files.read('FAILED', 'BACKUP')).bytes.toString()).toBe('backup bytes')
    await expect(SubmissionStoreFiles.open(join(fixture, 'absent-parent', 'learning'))).rejects.toMatchObject({ reason: 'MISSING' })
  })
  it('rejects traversal/relative/device roots, unknown kinds and copies without generic path access', async () => {
    for (const root of ['relative', join(fixture, 'x') + sep + '..' + sep + 'learning', '\\\\?\\C:\\learning']) {
      await expect(SubmissionStoreFiles.open(root)).rejects.toMatchObject({ reason: 'UNSAFE' })
    }
    const { files } = await setup()
    await expect(files.read('../escape' as 'ACCEPTED')).rejects.toMatchObject({ reason: 'INVALID_INPUT' })
    await expect(files.read('ACCEPTED', '../../outside' as 'PRIMARY')).rejects.toMatchObject({ reason: 'INVALID_INPUT' })
    expect(await fs.readdir(fixture)).toEqual(['learning'])
  })
  it('rejects junction roots/ancestors and a reparse target without touching its destination', async () => {
    const outside = join(fixture, 'outside'); await fs.mkdir(outside)
    await fs.writeFile(join(outside, 'sentinel'), 'preserve')
    const link = join(fixture, 'linked'); await fs.symlink(outside, link, 'junction')
    await expect(SubmissionStoreFiles.open(link)).rejects.toMatchObject({ reason: 'UNSAFE' })
    await expect(SubmissionStoreFiles.open(join(link, 'learning'))).rejects.toMatchObject({ reason: 'UNSAFE' })
    const { files, root } = await setup()
    await fs.symlink(outside, join(root, 'accepted.json'), 'junction')
    await expect(files.read('ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect(await fs.readFile(join(outside, 'sentinel'), 'utf8')).toBe('preserve')
  })
  it('rejects hardlinked primary, backup and lock files', async () => {
    const { files, root, lease } = await setup()
    const source = join(fixture, 'hard-source'); await fs.writeFile(source, 'unchanged')
    await fs.link(source, join(root, 'accepted.json'))
    await fs.link(source, join(root, 'failed-submissions.json.bak'))
    await expect(files.inspect('ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
    await expect(files.read('FAILED', 'BACKUP')).rejects.toMatchObject({ reason: 'UNSAFE' })
    await lease.release()
    await fs.link(files.lockPath, join(fixture, 'hard-lock'))
    await expect(new SharedSubmissionStoreLease(files, native).acquire()).rejects.toMatchObject({ reason: 'UNSAFE' })
  })
  it('detects replacement of the trusted directory identity', async () => {
    const { files, root, lease } = await setup()
    await fs.rename(root, join(fixture, 'old-learning')); await fs.mkdir(root)
    await fs.writeFile(join(root, 'accepted.json'), 'replacement sentinel')
    await expect(files.inspect('ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect(await fs.readFile(join(root, 'accepted.json'), 'utf8')).toBe('replacement sentinel')
    await lease.release()
  })
  it('bounds reads before allocation and catches handle/path identity swaps', async () => {
    let swap = false
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      const handle = await nodeStoreFilePort.open(path, flags)
      if (swap && flags === 'r') {
        await fs.rename(path, path + '.old'); await fs.writeFile(path, 'evil')
      }
      return handle
    } }
    const { files, root } = await setup(io)
    await fs.writeFile(join(root, 'accepted.json'), 'safe')
    await expect(files.read('ACCEPTED', 'PRIMARY', 3)).rejects.toMatchObject({ reason: 'TOO_LARGE' })
    expect((await files.read('ACCEPTED', 'PRIMARY', 4)).bytes.toString()).toBe('safe')
    await expect(files.read('ACCEPTED', 'PRIMARY', -1)).rejects.toMatchObject({ reason: 'INVALID_INPUT' })
    swap = true
    await expect(files.read('ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect(files.pendingHandles).toBe(0)
  })
  it('handles short reads and rejects growth/mutation while reading', async () => {
    let mutate = false
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, read: async (buffer, offset, length, position) => {
        const result = await h.read(buffer, offset, Math.min(length, 2), position)
        if (mutate) { mutate = false; await fs.appendFile(path, 'growth') }
        return result
      } }
    } }
    const { files, root } = await setup(io)
    await fs.writeFile(join(root, 'accepted.json'), 'abcdef')
    expect((await files.read('ACCEPTED')).bytes.toString()).toBe('abcdef')
    mutate = true
    await expect(files.read('ACCEPTED')).rejects.toMatchObject({ reason: 'UNSAFE' })
  })
  it('captures bytes before yield, syncs/closes and reads back an exclusive sibling stage', async () => {
    let syncs = 0, closes = 0
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, sync: async () => { syncs++; await h.sync() }, close: async () => { closes++; await h.close() } }
    } }
    const { files, lease, root, owner } = await setup(io)
    const bytes = Buffer.from('fixture only')
    const work = files.stage(lease, 'FAILED', bytes); bytes.fill(0)
    const stage = await work
    expect(stage.state).toBe('READY'); expect(syncs).toBe(1); expect(closes).toBe(2)
    const name = (await fs.readdir(root)).find(n => n.startsWith('failed-submissions.json.stage-'))!
    expect(await fs.readFile(join(root, name), 'utf8')).toBe('fixture only')
    await expect(lease.release()).rejects.toMatchObject({ reason: 'BUSY' })
    expect(owner.ownsLease).toBe(true)
    await files.discard(lease, stage)
    expect(stage.state).toBe('DISCARDED'); expect(files.ownedStages()).toHaveLength(0)
    await lease.release()
  })
  it('rejects forged/foreign lease or staging tokens and retains no authority from names', async () => {
    const { files, lease } = await setup()
    await expect(files.stage({ state: 'HELD', release: async () => {} }, 'ACCEPTED', Buffer.from('x'))).rejects.toMatchObject({ reason: 'UNSAFE' })
    await expect(files.discard(lease, { storeKind: 'ACCEPTED', state: 'READY' })).rejects.toMatchObject({ reason: 'UNSAFE' })
    await fs.mkdir(join(fixture, 'second'))
    const second = await SubmissionStoreFiles.open(join(fixture, 'second')); opened.push(second)
    await expect(second.stage(lease, 'ACCEPTED', Buffer.from('x'))).rejects.toMatchObject({ reason: 'BUSY' })
    await lease.release()
    await expect(files.stage(lease, 'FAILED', Buffer.from('x'))).rejects.toMatchObject({ reason: 'BUSY' })
  })
  it('never adopts an exclusive-create collision or deletes another file', async () => {
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      if (flags === 'wx') await fs.writeFile(path, 'foreign sentinel')
      return nodeStoreFilePort.open(path, flags)
    } }
    const { files, lease, root } = await setup(io)
    await expect(files.stage(lease, 'ACCEPTED', Buffer.from('new'))).rejects.toMatchObject({ reason: 'BUSY' })
    expect(files.ownedStages()).toHaveLength(0)
    const name = (await fs.readdir(root)).find(n => n.endsWith('.tmp'))!
    expect(await fs.readFile(join(root, name), 'utf8')).toBe('foreign sentinel')
    await lease.release()
  })
  it('retains partial staging and a failed-close handle, then permits explicit close/discard retry', async () => {
    let failClose = true
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, sync: async () => { throw Object.assign(Error('private path'), { code: 'EIO' }) },
        close: async () => { if (failClose) { failClose = false; throw Error('injected close failure') }; await h.close() } }
    } }
    const { files, lease } = await setup(io)
    await expect(files.stage(lease, 'ACCEPTED', Buffer.from('partial'))).rejects.toMatchObject({ reason: 'IO' })
    expect(files.pendingHandles).toBe(1)
    await expect(lease.release()).rejects.toMatchObject({ reason: 'BUSY' })
    await expect(files.stage(lease, 'FAILED', Buffer.from('x'))).rejects.toMatchObject({ reason: 'BUSY' })
    await files.retryClose(); expect(files.pendingHandles).toBe(0)
    const retained = files.ownedStages()[0]
    expect(retained.state).toBe('FAILED')
    await files.discard(lease, retained); await lease.release()
  })
  it('writes partial buffers safely and prevents releasing the lease during pending original I/O', async () => {
    let resume!: () => void
    const gate = new Promise<void>(r => { resume = r })
    let entered!: () => void
    const started = new Promise<void>(r => { entered = r })
    const io: StoreFilePort = { ...nodeStoreFilePort, open: async (path, flags) => {
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, write: async (buffer, offset, length, position) => {
        entered(); await gate; return h.write(buffer, offset, Math.min(length, 2), position)
      } }
    } }
    const { files, lease } = await setup(io)
    const pending = files.stage(lease, 'ACCEPTED', Buffer.from('abcdef'))
    await started
    await expect(lease.release()).rejects.toMatchObject({ reason: 'BUSY' })
    await expect(files.stage(lease, 'FAILED', Buffer.from('x'))).rejects.toMatchObject({ reason: 'BUSY' })
    resume(); const stage = await pending
    await files.discard(lease, stage); await lease.release()
  })
  it('does not delete a hardlinked or replaced owned stage', async () => {
    const { files, lease, root } = await setup()
    const stage = await files.stage(lease, 'ACCEPTED', Buffer.from('own'))
    const name = (await fs.readdir(root)).find(n => n.endsWith('.tmp'))!
    await fs.link(join(root, name), join(fixture, 'hard-stage'))
    await expect(files.discard(lease, stage)).rejects.toMatchObject({ reason: 'UNSAFE' })
    await fs.unlink(join(fixture, 'hard-stage'))
    await fs.rename(join(root, name), join(root, name + '.old')); await fs.writeFile(join(root, name), 'foreign')
    await expect(files.discard(lease, stage)).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect(await fs.readFile(join(root, name), 'utf8')).toBe('foreign')
  })
  it('replaces only expected identities, invokes guard immediately before rename, and verifies bytes', async () => {
    const order: string[] = []
    const io: StoreFilePort = { ...nodeStoreFilePort, rename: (from, to) => { order.push('rename'); return fs.rename(from, to) } }
    const { files, lease, root } = await setup(io)
    await fs.writeFile(join(root, 'accepted.json'), 'previous fixture')
    const old = await files.inspect('ACCEPTED')
    const stage = await files.stage(lease, 'ACCEPTED', Buffer.from('replacement fixture'))
    await files.replace(lease, stage, 'PRIMARY', old, () => { order.push('guard') })
    expect(order).toEqual(['guard', 'rename'])
    expect(stage.state).toBe('REPLACED')
    expect((await files.read('ACCEPTED')).bytes.toString()).toBe('replacement fixture')
    expect(files.hasRetainedResources).toBe(false)
    await lease.release()
  })
  it('refuses stale targets and pre-dispatch guard failure without altering primary or staging', async () => {
    const { files, lease, root } = await setup()
    await fs.writeFile(join(root, 'accepted.json'), 'old')
    const old = await files.inspect('ACCEPTED')
    const stage = await files.stage(lease, 'ACCEPTED', Buffer.from('new'))
    await fs.writeFile(join(root, 'accepted.json'), 'modified target')
    await expect(files.replace(lease, stage, 'PRIMARY', old, () => {})).rejects.toMatchObject({ reason: 'UNSAFE' })
    const current = await files.inspect('ACCEPTED')
    await expect(files.replace(lease, stage, 'PRIMARY', current, () => { throw new StoreIOError('BUSY') })).rejects.toMatchObject({ reason: 'BUSY' })
    expect(stage.state).toBe('READY')
    expect(await fs.readFile(join(root, 'accepted.json'), 'utf8')).toBe('modified target')
    await files.discard(lease, stage); await lease.release()
  })
  it('marks dispatched replacement failure unverified without unlink-primary fallback or blind retry', async () => {
    let renames = 0, unlinks = 0
    const io: StoreFilePort = { ...nodeStoreFilePort,
      rename: async () => { renames++; throw Object.assign(Error('locked private path'), { code: 'EACCES' }) },
      unlink: async path => { unlinks++; await fs.unlink(path) } }
    const { files, lease, root } = await setup(io)
    await fs.writeFile(join(root, 'accepted.json'), 'sentinel')
    const stage = await files.stage(lease, 'ACCEPTED', Buffer.from('candidate'))
    await expect(files.replace(lease, stage, 'PRIMARY', await files.inspect('ACCEPTED'), () => {}))
      .rejects.toMatchObject({ reason: 'PERMISSION', replacementDispatched: true })
    expect(stage.state).toBe('REPLACEMENT_UNVERIFIED')
    await expect(files.replace(lease, stage, 'PRIMARY', null, () => {})).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect([renames, unlinks]).toEqual([1, 0])
    expect(await fs.readFile(join(root, 'accepted.json'), 'utf8')).toBe('sentinel')
    await expect(lease.release()).rejects.toMatchObject({ reason: 'BUSY' })
  })
  it('creates a backup only through explicit stage/expected-absence replacement and rejects async guards', async () => {
    const { files, lease } = await setup()
    const stage = await files.stage(lease, 'FAILED', Buffer.from('explicit backup fixture'))
    await expect(files.replace(lease, stage, 'BACKUP', null, async () => {})).rejects.toMatchObject({ reason: 'INVALID_INPUT' })
    expect(stage.state).toBe('READY'); expect(await files.inspect('FAILED', 'BACKUP')).toBeNull()
    await files.replace(lease, stage, 'BACKUP', null, () => {})
    expect((await files.read('FAILED', 'BACKUP')).bytes.toString()).toBe('explicit backup fixture')
    expect(await files.inspect('FAILED')).toBeNull()
    await lease.release()
  })
  it('preserves classified errors and redacts raw paths/messages', async () => {
    for (const [code, reason] of [['ENOENT', 'MISSING'], ['EACCES', 'PERMISSION'], ['EPERM', 'PERMISSION'],
      ['EBUSY', 'BUSY'], ['EEXIST', 'BUSY'], ['ELOOP', 'UNSAFE'], ['EIO', 'IO']]) {
      const error = storeIOError(Object.assign(Error('secret path and source'), { code }))
      expect(error.reason).toBe(reason)
      expect(JSON.stringify(error)).not.toContain('secret')
    }
    const io: StoreFilePort = { ...nodeStoreFilePort, lstat: async () => { throw Object.assign(Error('private'), { code: 'EACCES' }) } }
    await expect(SubmissionStoreFiles.open(join(fixture, 'learning'), io)).rejects.toMatchObject({ reason: 'PERMISSION' })
    expect(await fs.readdir(fixture)).toEqual([])
  })
})
