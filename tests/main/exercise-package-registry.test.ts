import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { ExercisePackageRegistry, type PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'
import { canonicalSignatureBytes, exerciseResourceLocation, openAnchoredExerciseResources, rawPackageDigest, type PackageManifestAnchor } from '../../src/main/services/learning/content/exercise-package-resources'
import type { ExerciseMetadataAsset, ExercisePackageDescriptor, ExercisePackageManifest } from '../../src/main/services/learning/content/exercise-package-contracts'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { PackageResidentBudget } from '../../src/main/services/learning/content/exercise-package-budget'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
vi.mock('node:fs/promises', async () => ({ ...await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises') }))
const temporary: string[] = []
const encoder = (v: unknown) => Buffer.from(JSON.stringify(v))
const kinds = ['metadata', 'samples', 'judge', 'csharp', 'javascript'] as const
const paths = { metadata: 'exercise.json', samples: 'samples.json', judge: 'judge/v1.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of temporary.splice(0)) {
    // Delete only the explicit test-owned temp directory, never arbitrary roots.
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('exercise-package-step3-')) throw new Error('unsafe test cleanup')
    await fs.rm(dir, { recursive: true, force: true })
  }
})
async function fixture(empty = false, packaged = false) {
  const base = await fs.mkdtemp(join(tmpdir(), 'exercise-package-step3-')); temporary.push(base)
  const environment = { packaged, mainOutput: join(base, 'out', 'main'), resourcesPath: join(base, 'installed', 'resources') }
  const location = exerciseResourceLocation(environment), root = join(location.base, ...location.suffix)
  await fs.mkdir(root, { recursive: true })
  const metadata: ExerciseMetadataAsset = { schemaVersion: 1, exerciseId: 'synthetic-64', packageVersion: 1,
    metadata: { chapter: 2, order: 0, title: 'Synthetic fixture', difficulty: 'Easy', source: {
      url: 'https://leetcode.com/problems/synthetic/', publisher: 'Fixture', usage: 'Not production Official Tests' } },
    statement: 'Synthetic contract fixture only.', constraints: [],
    signature: { version: 1, hash: '', functionName: 'Solve', parameters: [{ name: 'value', type: 'int32' }], returnType: 'int32' },
    comparator: { id: 'exact-typed', version: 1 }, official: { testSetId: 'synthetic-tests', version: 1, hash: '' } }
  metadata.signature.hash = rawPackageDigest(canonicalSignatureBytes(metadata.signature))
  const samples = { schemaVersion: 1, exerciseId: metadata.exerciseId, signatureVersion: 1, signatureHash: metadata.signature.hash,
    samples: [{ id: 'public-1', args: [1], expected: 1 }] }
  const judge = { schemaVersion: 1, exerciseId: metadata.exerciseId, testSetId: metadata.official.testSetId, version: 1,
    signatureVersion: 1, signatureHash: metadata.signature.hash, comparator: metadata.comparator, cases: [
      { id: 'public-1', sampleId: 'public-1', visibility: 'public', args: [1], expected: 1 },
      { id: 'hidden-1', visibility: 'hidden', args: [2], expected: 2 },
    ] }
  const judgeBytes = encoder(judge); metadata.official.hash = rawPackageDigest(judgeBytes)
  const assets = { metadata: encoder(metadata), samples: encoder(samples), judge: judgeBytes,
    csharp: Buffer.from('// synthetic C#'), javascript: Buffer.from('// synthetic JavaScript') }
  const descriptor: ExercisePackageDescriptor = { exerciseId: metadata.exerciseId, packageVersion: 1,
    assets: Object.fromEntries(kinds.map(k => [k, { path: paths[k], bytes: assets[k].byteLength, sha256: rawPackageDigest(assets[k]) }])) as ExercisePackageDescriptor['assets'] }
  const manifest: ExercisePackageManifest = { schemaVersion: 1, policyVersion: 1, version: 1, packages: empty ? [] : [descriptor] }
  if (!empty) for (const kind of kinds) {
    const target = join(root, metadata.exerciseId, paths[kind]); await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, assets[kind])
  }
  let anchor: PackageManifestAnchor
  async function writeManifest() {
    const b = encoder(manifest); await fs.writeFile(join(root, 'manifest.json'), b)
    anchor = { version: manifest.version, rawBytes: b.byteLength, sha256: rawPackageDigest(b) }
    return anchor
  }
  await writeManifest()
  return { base, root, environment, metadata, manifest, assets, descriptor, writeManifest,
    get anchor() { return anchor }, target: (kind: keyof typeof paths) => join(root, metadata.exerciseId, paths[kind]) }
}

function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function owner() {
  const tasks: Promise<unknown>[] = []
  const control = { current: true, clean: true }
  const context: PackagePrepareOwner = { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => control.current,
    check: vi.fn(), retain: t => { tasks.push(t) }, canRelease: () => control.clean }
  return { context, control, tasks }
}
async function setup(empty = false) {
  const f = await fixture(empty)
  let reads = 0
  const registry = new ExercisePackageRegistry(async (scope, control) => {
    const r = await openAnchoredExerciseResources(f.environment, f.anchor, scope, control)
    return { ...r, readPackage: (...args: Parameters<typeof r.readPackage>) => { reads++; return r.readPackage(...args) } }
  })
  expect(registry.start()).toBeUndefined()
  await registry.whenStarted()
  return { ...f, registry, get reads() { return reads } }
}
describe('S3 lazy registry through real Step2 integrity', () => {
  it('evicts only an unpinned slot; local failures preserve other declared packages', async () => {
    const f = await fixture()
    const secondId = 'synthetic-65'
    const secondAssets = { ...f.assets }
    for (const kind of ['metadata', 'samples', 'judge'] as const) {
      secondAssets[kind] = Buffer.from(f.assets[kind].toString().replaceAll(f.metadata.exerciseId, secondId))
    }
    const metadata = JSON.parse(secondAssets.metadata.toString())
    metadata.official.hash = rawPackageDigest(secondAssets.judge)
    secondAssets.metadata = encoder(metadata)
    const descriptor: ExercisePackageDescriptor = { exerciseId: secondId, packageVersion: 1,
      assets: Object.fromEntries(kinds.map(k => [k, { path: paths[k], bytes: secondAssets[k].byteLength, sha256: rawPackageDigest(secondAssets[k]) }])) as ExercisePackageDescriptor['assets'] }
    for (const k of kinds) {
      const target = join(f.root, secondId, paths[k]); await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, secondAssets[k])
    }
    f.manifest.packages.push(descriptor)
    const anchor = await f.writeManifest()
    const registry = new ExercisePackageRegistry(scope => openAnchoredExerciseResources(f.environment, anchor, scope))
    await registry.whenStarted()
    const o = owner(), first = await registry.acquire(f.metadata.exerciseId, o.context)
    await expect(registry.acquire(secondId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    first.release()
    await fs.appendFile(join(f.root, secondId, paths.judge), ' ')
    await expect(registry.acquire(secondId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_LOAD_FAILED')
    expect(registry.status().state).toBe('AVAILABLE')
    expect(registry.readiness(f.metadata.exerciseId)).toMatchObject({ phase: 'DECLARED', integrityVerified: false })
    expect(() => first.data).toThrow('PACKAGE_CANCELLED')
    const again = await registry.acquire(f.metadata.exerciseId, o.context); again.release()
    await fs.writeFile(join(f.root, secondId, paths.judge), secondAssets.judge)
    const second = await registry.acquire(secondId, o.context)
    expect(second.data.metadata.exerciseId).toBe(secondId)
    expect(registry.readiness(f.metadata.exerciseId).phase).toBe('DECLARED')
    second.release(); await registry.stop()
  })
  it('loads manifest only; empty bootstrap never supplies operational readiness', async () => {
    const f = await setup(true)
    expect(f.reads).toBe(0)
    expect(f.registry.status()).toMatchObject({ state: 'AVAILABLE', declared: 0, rawBytes: 0 })
    expect(f.registry.readiness('synthetic-64')).toMatchObject({ declared: false, resourcesBorrowable: false, publicRunReady: false, judgeReady: false, submitReady: false, releaseReady: false })
    await expect(f.registry.acquire('missing', owner().context)).rejects.toHaveProperty('code', 'PACKAGE_NOT_DECLARED')
    await f.registry.stop(); expect(f.registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('coalesces same owner exactly, rejects other owners and reuses frozen aliases', async () => {
    const f = await setup(), o = owner(), other = owner()
    expect(f.reads).toBe(0)
    expect(f.registry.readiness(f.metadata.exerciseId)).toMatchObject({ phase: 'DECLARED', integrityVerified: false })
    const task = f.registry.acquire(f.metadata.exerciseId, o.context)
    expect(f.registry.acquire(f.metadata.exerciseId, o.context)).toBe(task)
    await expect(f.registry.acquire(f.metadata.exerciseId, { ...o.context, generation: 2 })).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    expect(o.tasks).toEqual([task])
    await expect(f.registry.acquire(f.metadata.exerciseId, other.context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    const lease = await task, before = f.registry.status()
    expect(f.registry.readiness(f.metadata.exerciseId)).toMatchObject({ phase: 'VERIFIED_RESIDENT', integrityVerified: true, resourcesBorrowable: true, pinned: true, judgeReady: false })
    expect(Object.isFrozen(lease.data.judge.cases[1].args)).toBe(true)
    expect(() => { lease.data.judge.cases[1].expected = 999 }).toThrow()
    expect(await f.registry.acquire(f.metadata.exerciseId, o.context)).toBe(lease)
    await expect(f.registry.acquire(f.metadata.exerciseId, other.context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    lease.release(); lease.release()
    const reused = await f.registry.acquire(f.metadata.exerciseId, other.context)
    expect(f.reads).toBe(1); expect(f.registry.status().parsedBytes).toBe(before.parsedBytes)
    reused.release(); await f.registry.stop()
  })
  it('accounts exact package JSON tree and copies before allocation; copies retain pin', async () => {
    const f = await setup(), baseline = f.registry.status(), o = owner()
    const lease = await f.registry.acquire(f.metadata.exerciseId, o.context)
    const size = Buffer.byteLength(JSON.stringify(lease.data)), original = f.registry.status()
    expect(original.parsedBytes - baseline.parsedBytes).toBe(size)
    expect(original.rawBytes).toBe(0)
    const copy = lease.copy()
    expect(copy.data).toEqual(lease.data); expect(copy.data).not.toBe(lease.data)
    expect(f.registry.status().parsedBytes).toBe(original.parsedBytes + size)
    lease.release()
    await expect(f.registry.acquire(f.metadata.exerciseId, owner().context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    copy.release(); copy.release()
    expect(f.registry.status().parsedBytes).toBe(original.parsedBytes)
    expect(() => copy.data).toThrow('PACKAGE_CANCELLED')
    const next = await f.registry.acquire(f.metadata.exerciseId, owner().context); next.release()
    await f.registry.stop()
  })
  it('denies copy allocation at the ledger ceiling without silently evicting pins', async () => {
    const f = await setup(), o = owner(), lease = await f.registry.acquire(f.metadata.exerciseId, o.context)
    const copies = []
    // Use the real fixed budget, not a configurable smaller test policy.
    const spy = vi.spyOn(globalThis, 'structuredClone')
    try {
      while (true) {
        const before = spy.mock.calls.length
        try { copies.push(lease.copy()) }
        catch (error) { expect(error).toHaveProperty('code', 'PACKAGE_RESIDENT_LIMIT'); expect(spy.mock.calls.length).toBe(before); break }
      }
      expect(f.registry.status().parsedBytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    } finally { spy.mockRestore(); copies.forEach(c => c.release()); lease.release(); await f.registry.stop() }
  })
  it.each(['judge', 'metadata', 'samples', 'csharp', 'javascript'] as const)('never bypasses %s integrity; explicit retry only', async kind => {
    const f = await setup(), o = owner(), before = f.registry.status()
    await fs.appendFile(f.target(kind), ' ')
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_LOAD_FAILED')
    expect(f.registry.readiness(f.metadata.exerciseId)).toMatchObject({ phase: 'UNAVAILABLE', failure: 'PACKAGE_INTEGRITY_FAILED', resourcesBorrowable: false })
    expect(f.registry.status()).toMatchObject({ parsedBytes: before.parsedBytes, nodes: before.nodes, rawBytes: 0 })
    expect(f.reads).toBe(1)
    await fs.writeFile(f.target(kind), f.assets[kind])
    const lease = await f.registry.acquire(f.metadata.exerciseId, o.context)
    expect(f.reads).toBe(2); lease.release(); await f.registry.stop()
  })
  it('global root mutation blocks further admissions without exposing paths/content', async () => {
    const f = await setup(), o = owner()
    await fs.mkdir(join(f.root, 'unexpected-root-mutation'))
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_LOAD_FAILED')
    expect(f.registry.status()).toMatchObject({ state: 'UNAVAILABLE', failure: 'PACKAGE_ROOT_INVALID' })
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_NOT_AVAILABLE')
    expect(JSON.stringify(f.registry.status())).not.toContain(f.root)
    expect(JSON.stringify(f.registry.readiness(f.metadata.exerciseId))).not.toContain('expected')
    await f.registry.stop()
  })
  it('lease release is guarded by required cleanup; shutdown retains pin and copies', async () => {
    const f = await setup(), o = owner(), lease = await f.registry.acquire(f.metadata.exerciseId, o.context), copy = lease.copy()
    o.control.clean = false
    expect(() => lease.release()).toThrow('PACKAGE_LEASE_ACTIVE')
    const stop = f.registry.stop(); expect(f.registry.stop()).toBe(stop)
    let settled = false; void stop.then(() => { settled = true })
    await Promise.resolve(); expect(settled).toBe(false)
    expect(() => lease.data).toThrow('PACKAGE_CANCELLED')
    o.control.clean = true; lease.release()
    await Promise.resolve(); expect(settled).toBe(false)
    copy.release(); await stop
    expect(f.registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})

describe('S3 owned admission and retained pending work', () => {
  it('publishes flight admission before the owner retention callback can re-enter', async () => {
    const f = await setup(), o = owner()
    let joined: Promise<unknown> | undefined
    o.context.retain = task => { joined = f.registry.acquire(f.metadata.exerciseId, o.context); expect(joined).toBe(task) }
    const task = f.registry.acquire(f.metadata.exerciseId, o.context), lease = await task
    expect(joined).toBe(task); expect(f.reads).toBe(1)
    lease.release(); await f.registry.stop()
  })
  it('denies raw buffer allocation before Buffer.alloc in the sole Step2 reader', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    const budget = new PackageResidentBudget(), scope = budget.scope()
    scope.raw(P.rawBufferBytes)
    const spy = vi.spyOn(Buffer, 'alloc')
    try {
      await expect(resources.readPackage(f.metadata.exerciseId, scope)).rejects.toHaveProperty('code', 'PACKAGE_RESIDENT_LIMIT')
      expect(spy).not.toHaveBeenCalledWith(f.assets.metadata.byteLength)
      expect(budget.snapshot().rawBytes).toBe(P.rawBufferBytes)
    } finally { spy.mockRestore(); scope.release() }
  })
  it('shutdown waits for an actual pending file-handle read and its close', async () => {
    const f = await setup(), pending = deferred<void>(), entered = deferred<void>(), o = owner()
    const open = fs.open
    let closed = false
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args)
      if (String(args[0]).endsWith('v1.json')) {
        const read = handle.read.bind(handle), close = handle.close.bind(handle)
        vi.spyOn(handle, 'read').mockImplementation((...args) => {
          entered.resolve(); return pending.promise.then(() => Reflect.apply(read, handle, args))
        })
        vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed = true })
      }
      return handle
    })
    const task = f.registry.acquire(f.metadata.exerciseId, o.context)
    const rejected = expect(task).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    await entered.promise
    const retained = f.registry.status(), stop = f.registry.stop()
    let stopped = false; void stop.then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false); expect(closed).toBe(false)
    expect(retained.rawBytes).toBeGreaterThan(0)
    expect(f.registry.status().rawBytes).toBe(retained.rawBytes)
    pending.resolve(); await rejected; await stop
    expect(closed).toBe(true)
    expect(f.registry.status()).toMatchObject({ state: 'STOPPED', rawBytes: 0, parsedBytes: 0, nodes: 0 })
  })
  it('Project startup does not await manifest; managed shutdown does', async () => {
    const f = await fixture(true), pending = deferred<void>()
    const registry = new ExercisePackageRegistry(async scope => { await pending.promise; return openAnchoredExerciseResources(f.environment, f.anchor, scope) })
    const project = { name: 'Project fixture', start: vi.fn(), stop: vi.fn() }
    const app = new DesktopApplication([registry, project])
    await app.start(); expect(project.start).toHaveBeenCalledOnce(); expect(registry.status().state).toBe('STARTING')
    const stop = app.shutdown(); let settled = false; void stop.then(() => { settled = true })
    await Promise.resolve(); expect(settled).toBe(false)
    pending.resolve(); await stop
    expect(registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, rawBytes: 0 })
  })
  it.each(['cancel', 'shutdown'] as const)('retains original I/O and reservations during %s; stale result never publishes', async action => {
    const f = await fixture(), pending = deferred<void>(), entered = deferred<void>(), o = owner()
    const registry = new ExercisePackageRegistry(async scope => {
      const resources = await openAnchoredExerciseResources(f.environment, f.anchor, scope)
      return { ...resources, readPackage: async (id, allocation) => {
        // Real verified reader completes, but the owned I/O task has not settled.
        const result = await resources.readPackage(id, allocation); entered.resolve(); await pending.promise; return result
      } }
    })
    await registry.whenStarted()
    const baseline = registry.status(), task = registry.acquire(f.metadata.exerciseId, o.context)
    const rejected = expect(task).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    await entered.promise
    expect(registry.status().rawBytes).toBeGreaterThan(0)
    expect(registry.status().parsedBytes).toBeGreaterThan(baseline.parsedBytes)
    let stop: Promise<void> | undefined
    if (action === 'cancel') { o.control.current = false; registry.invalidate(o.context.owner, o.context.generation) }
    else stop = registry.stop()
    await Promise.resolve(); expect(registry.status().rawBytes).toBeGreaterThan(0)
    pending.resolve(); await rejected
    expect(registry.status()).toMatchObject({ rawBytes: 0 })
    expect(registry.readiness(f.metadata.exerciseId).resourcesBorrowable).toBe(false)
    if (!stop) { expect(registry.status().parsedBytes).toBe(baseline.parsedBytes); stop = registry.stop() }
    await stop
    expect(registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0 })
  })
  it('invalidates a resident owner without dropping its active pin', async () => {
    const f = await setup(), o = owner(), lease = await f.registry.acquire(f.metadata.exerciseId, o.context)
    f.registry.invalidate(o.context.owner, o.context.generation)
    expect(() => lease.data).toThrow('PACKAGE_CANCELLED')
    await expect(f.registry.acquire(f.metadata.exerciseId, owner().context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    lease.release(); await f.registry.stop()
  })
  it('rejects before I/O on stale owner, failed Prepare guard or failed retention', async () => {
    const f = await setup(), o = owner()
    o.control.current = false
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    o.control.current = true; o.context.check = () => { throw new Error('private deadline detail') }
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    o.context.check = () => {}; o.context.retain = () => { throw new Error('retention failed') }
    await expect(f.registry.acquire(f.metadata.exerciseId, o.context)).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    await Promise.resolve(); await Promise.resolve()
    expect(f.reads).toBe(0); await f.registry.stop()
  })
  it('manifest corruption is global, no automatic restart/fallback', async () => {
    const f = await fixture(true); await fs.appendFile(join(f.root, 'manifest.json'), ' ')
    const registry = new ExercisePackageRegistry(scope => openAnchoredExerciseResources(f.environment, f.anchor, scope))
    await registry.whenStarted(); expect(registry.status()).toMatchObject({ state: 'UNAVAILABLE', failure: 'PACKAGE_INTEGRITY_FAILED' })
    expect(registry.status().parsedBytes).toBe(0)
    await registry.whenStarted(); expect(registry.status().state).toBe('UNAVAILABLE')
    await registry.stop()
  })
})
