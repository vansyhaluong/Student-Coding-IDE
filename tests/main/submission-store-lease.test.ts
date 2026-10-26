import * as fs from 'node:fs/promises'
import { linkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fork, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SubmissionStoreFiles } from '../../src/main/services/learning/storage/store-files'
import { SharedSubmissionStoreLease, type StoreLeaseNativePort } from '../../src/main/services/learning/storage/store-lease'

let fixture: string
const children = new Set<ChildProcess>()
beforeEach(async () => { fixture = await fs.mkdtemp(join(resolve(tmpdir()), 'student-submission-s2-lease-')) })
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null) {
      const exited = new Promise<void>(r => child.once('exit', () => r()))
      child.kill(); await exited
    }
  }
  children.clear()
  if (!resolve(fixture).startsWith(resolve(tmpdir()) + sep) || !fixture.includes('student-submission-s2-lease-')) throw Error('Fixture scope')
  await fs.rm(fixture, { recursive: true, force: false })
})
async function files() {
  const f = await SubmissionStoreFiles.open(join(fixture, 'learning'))
  await fs.writeFile(f.lockPath, 'lock file presence is not ownership')
  return f
}
const basicPort = (): StoreLeaseNativePort => ({ capability: 'student-ide-learning-job-v1', acquireLease: () => ({}), observation() {} })

describe('S2 retained shared store-family lease', () => {
  it('returns busy on an existing owner, has no queue, and never removes the lock file', async () => {
    const f = await files(), paths: string[] = []
    let held = false
    const native: StoreLeaseNativePort = { ...basicPort(), acquireLease: path => {
      paths.push(path); if (held) return null; held = true; return {}
    }, observation: () => { held = false } }
    const owner = new SharedSubmissionStoreLease(f, native), other = new SharedSubmissionStoreLease(f, native)
    const token = await owner.acquire()
    await expect(owner.acquire()).rejects.toMatchObject({ reason: 'BUSY' })
    await expect(other.acquire()).rejects.toMatchObject({ reason: 'BUSY' })
    expect(paths).toEqual([f.lockPath, f.lockPath])
    await token.release(); await token.release()
    expect(token.state).toBe('RELEASED'); expect(owner.ownsLease).toBe(false)
    const acquired = await other.acquire(); await acquired.release()
    expect(await fs.readFile(f.lockPath, 'utf8')).toBe('lock file presence is not ownership')
  })
  it('keeps the strong native handle and blocks writes/reacquisition after close failure until explicit retry', async () => {
    const f = await files()
    let fail = true, acquisitions = 0, closes = 0
    const native: StoreLeaseNativePort = { ...basicPort(), acquireLease: () => { acquisitions++; return {} }, observation: () => {
      closes++; if (fail) { fail = false; throw Object.assign(Error('native private detail'), { code: 'LEARNING_CLOSE' }) }
    } }
    const owner = new SharedSubmissionStoreLease(f, native), token = await owner.acquire()
    await expect(token.release()).rejects.toMatchObject({ reason: 'IO' })
    expect(owner.ownsLease).toBe(true); expect(token.state).toBe('CLOSE_FAILED')
    await expect(f.stage(token, 'FAILED', Buffer.from('refused'))).rejects.toMatchObject({ reason: 'BUSY' })
    await expect(owner.acquire()).rejects.toMatchObject({ reason: 'BUSY' })
    expect(acquisitions).toBe(1)
    await owner.retryRelease()
    expect([closes, owner.ownsLease, token.state]).toEqual([2, false, 'RELEASED'])
  })
  it('joins concurrent release callers and closes exactly once', async () => {
    const f = await files()
    let closes = 0
    const owner = new SharedSubmissionStoreLease(f, { ...basicPort(), observation: () => { closes++ } })
    const token = await owner.acquire()
    const a = token.release(), b = token.release()
    expect(a).toBe(b)
    await Promise.all([a, b]); expect(closes).toBe(1)
  })
  it('cannot close a newly acquired handle through an already released token', async () => {
    const f = await files()
    let closes = 0
    const owner = new SharedSubmissionStoreLease(f, { ...basicPort(), observation: () => { closes++ } })
    const old = await owner.acquire(); await old.release()
    const current = await owner.acquire()
    expect(old.state).toBe('RELEASED')
    await old.release()
    expect(closes).toBe(1); expect(owner.ownsLease).toBe(true); expect(current.state).toBe('HELD')
    await expect(f.stage(old, 'ACCEPTED', Buffer.from('stale'))).rejects.toMatchObject({ reason: 'BUSY' })
    await current.release(); expect(closes).toBe(2)
  })
  it('rejects absent/incompatible native capability rather than falling back to an in-memory lock', async () => {
    const f = await files()
    for (const port of [{}, { ...basicPort(), capability: 'other' }, { ...basicPort(), acquireLease: undefined }]) {
      expect(() => new SharedSubmissionStoreLease(f, port as StoreLeaseNativePort)).toThrowError(expect.objectContaining({ reason: 'UNAVAILABLE' }))
    }
  })
  it.each([[5, 'PERMISSION'], [32, 'BUSY'], [6, 'IO']] as const)('classifies native win32=%i as %s', async (win32, reason) => {
    const f = await files()
    const owner = new SharedSubmissionStoreLease(f, { ...basicPort(), acquireLease: () => {
      throw Object.assign(Error('sensitive native path'), { code: 'LEARNING_LEASE', win32 })
    } })
    await expect(owner.acquire()).rejects.toMatchObject({ reason })
    expect(owner.ownsLease).toBe(false)
    expect(await fs.readFile(f.lockPath, 'utf8')).toBe('lock file presence is not ownership')
  })
  it('retains an acquired handle if post-acquire safety validation and close both fail', async () => {
    const f = await files()
    let closes = 0
    const native: StoreLeaseNativePort = { ...basicPort(), acquireLease: path => {
      linkSync(path, join(fixture, 'hostile-hardlink')); return {}
    }, observation: () => { if (++closes === 1) throw Error('injected close failure') } }
    const owner = new SharedSubmissionStoreLease(f, native)
    await expect(owner.acquire()).rejects.toMatchObject({ reason: 'IO' })
    expect(owner.ownsLease).toBe(true)
    await expect(owner.acquire()).rejects.toMatchObject({ reason: 'BUSY' })
    await owner.retryRelease(); expect(owner.ownsLease).toBe(false)
  })
  it('refuses an unsafe lock before calling native and does not delete stale/suspicious files', async () => {
    const f = await files()
    await fs.link(f.lockPath, join(fixture, 'lock-alias'))
    let acquisitions = 0
    const owner = new SharedSubmissionStoreLease(f, { ...basicPort(), acquireLease: () => { acquisitions++; return {} } })
    await expect(owner.acquire()).rejects.toMatchObject({ reason: 'UNSAFE' })
    expect(acquisitions).toBe(0)
    expect((await fs.lstat(f.lockPath, { bigint: true })).nlink).toBe(2n)
  })
})

function message(child: ChildProcess): Promise<{ type: string }> {
  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(Error('Lease peer response timed out')) }, 5000)
    const cleanup = () => { clearTimeout(timeout); child.removeListener('message', received); child.removeListener('error', failed); child.removeListener('exit', exited) }
    const received = (m: unknown) => {
      cleanup()
      if (!m || typeof m !== 'object' || !('type' in m) || typeof m.type !== 'string') reject(Error('Invalid peer response'))
      else resolveMessage({ type: m.type })
    }
    const failed = () => { cleanup(); reject(Error('Lease peer failed')) }
    const exited = () => { cleanup(); reject(Error('Lease peer exited before reply')) }
    child.once('message', received); child.once('error', failed); child.once('exit', exited)
  })
}
function peer(binary: string, lock: string) {
  const child = fork(resolve('tests/fixtures/learning/submission-lease-peer.mjs'), [binary, lock], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  children.add(child)
  return child
}

it.skipIf(process.env.LEARNING_SUBMISSION_STORE_LIVE !== '1')('proves Windows cross-process native exclusion, release/reacquisition and unchanged binary', async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Authorized Windows x64 host required')
  const binary = resolve('out/main/native/learning/learning-job.node')
  const fingerprint = async () => createHash('sha256').update(await fs.readFile(binary)).digest('hex')
  const before = await fingerprint()
  const native = createRequire(import.meta.url)(binary) as StoreLeaseNativePort
  const f = await files(), owner = new SharedSubmissionStoreLease(f, native)
  const token = await owner.acquire()
  try {
    const competing = peer(binary, f.lockPath)
    expect(await message(competing)).toEqual({ type: 'busy' })
    const stage = await f.stage(token, 'FAILED', Buffer.from('S2 test fixture, not a submission'))
    await f.discard(token, stage)
  } finally { await token.release() }
  const external = peer(binary, f.lockPath)
  expect(await message(external)).toEqual({ type: 'acquired' })
  await expect(owner.acquire()).rejects.toMatchObject({ reason: 'BUSY' })
  const released = message(external)
  external.send('release')
  expect(await released).toEqual({ type: 'released' })
  const again = await owner.acquire(); await again.release()
  expect(f.pendingHandles).toBe(0); expect(f.hasRetainedResources).toBe(false)
  expect(await fs.readFile(f.lockPath, 'utf8')).toBe('lock file presence is not ownership')
  const after = await fingerprint()
  expect(after).toBe(before)
  const evidence = { nativeSha256Before: before, nativeSha256After: after, unchanged: before === after,
    platform: process.platform, arch: process.arch, node: process.version, abi: process.versions.modules,
    capability: native.capability, parentHeldChildBusy: true, childHeldParentBusy: true,
    releaseReacquired: true, realLeaseStageDiscard: true, lockBytesPreserved: true,
    retainedFileHandles: f.pendingHandles, retainedFileResources: f.hasRetainedResources,
    jobs: 0, runtimeOperations: 0, judgeOperations: 0 }
  await fs.mkdir(resolve('out/e5-s2'), { recursive: true })
  await fs.writeFile(resolve('out/e5-s2/native-lease-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.info('S2 native lease evidence: ' + JSON.stringify(evidence))
}, 30000)
