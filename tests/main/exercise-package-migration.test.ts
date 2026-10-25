import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { ExercisePackageRegistry, type PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'
import { openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import { validatePackageManifest } from '../../src/main/services/learning/content/exercise-package-validation'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { PracticeIpcService } from '../../src/main/ipc/practice-ipc-service'
import { createPracticeStore, savePracticeDraft } from '../../src/main/services/learning/practice-store'
import { createPracticeBridge } from '../../src/preload/bridge/practice'
import { isExercise, isPracticeState, PRACTICE_CHANNELS, validatePracticePage } from '../../src/shared/contracts/practice'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'

const registries: ExercisePackageRegistry[] = [], dirs: string[] = []
const owner = (phase: 'public' | 'prepare' = 'public'): PackagePrepareOwner => ({ owner: {}, generation: 1, phase, isCurrent: () => true, check() {}, retain() {}, canRelease: () => true })
afterEach(async () => {
  vi.restoreAllMocks()
  for (const r of registries.splice(0)) await r.stop()
  for (const dir of dirs.splice(0)) {
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('exercise-package-step4-')) throw Error('Unsafe cleanup')
    await fs.rm(dir, { recursive: true, force: true })
  }
})
async function registry() { const r = await sourceRegistry(); registries.push(r); return r }

describe('S4-D1 production63 public migration parity', () => {
  it('preserves every old public field/ID/starter/signature/sample except the approved ProductExceptSelf correction', async () => {
    const r = await registry()
    expect([...r.ids()]).toEqual(exercises.map(e => e.id))
    const manifest = JSON.parse(await fs.readFile('resources/learning/exercises/manifest.json', 'utf8'))
    expect(manifest.packages).toHaveLength(63)
    for (const old of exercises) {
      const lease = await r.acquirePublic(old.id, owner())
      try {
        const next = publicExercise(lease.data)
        expect(isExercise(next)).toBe(true)
        const descriptor = manifest.packages.find((p: { exerciseId: string }) => p.exerciseId === old.id)
        if (descriptor.profile === 'full') {
          expect(descriptor.packageVersion).toBe(2)
          expect(descriptor.assets).toHaveProperty('judge')
          expect(lease.data.metadata.official).toMatchObject({ testSetId: old.id + '-official', version: 1 })
        } else {
          expect(lease.data.metadata.official).toBeNull()
          expect(descriptor.assets).not.toHaveProperty('judge')
        }
        expect(lease.data).not.toHaveProperty('judge')
        if (old.id === 'ch7-05') {
          expect({ ...next, samples: old.samples }).toEqual(old)
          expect(next.samples).toEqual([{ args: [[2, 0, 2]], expected: [0, 4, 0] }, { args: [[2, 1, 2]], expected: [2, 4, 2] }])
          for (const sample of next.samples) expect((sample.args[0] as number[]).every(n => n >= -2 && n <= 2)).toBe(true)
        } else expect(next).toEqual(old)
        expect(r.readiness(old.id)).toMatchObject({ verifiedCapability: 'public', judgeReady: false, submitReady: false, releaseReady: false })
      } finally { lease.release() }
    }
    expect(r.status().rawBytes).toBe(0)
    expect(r.status().parsedBytes).toBeLessThan(P.residentLogicalBytes)
  }, 30000)
  it('public-only cannot satisfy an official acquisition and never silently downgrades a declared full profile', async () => {
    const { r, dir } = await synthetic()
    const manifest = JSON.parse(await fs.readFile(join(dir, 'learning/exercises/manifest.json'), 'utf8'))
    const publicId = 'synthetic-64', descriptor = manifest.packages.find((p: { exerciseId: string }) => p.exerciseId === publicId)
    expect(descriptor.profile).toBe('public-only')
    await expect(r.acquire(publicId, owner())).rejects.toHaveProperty('code', 'PACKAGE_NOT_AVAILABLE')
    // Redact unexpected private success and release it, rather than pretty-print
    // a real Judge in assertion output or retain an orphaned test pin.
    const outcome = await r.acquire(publicId, owner('prepare')).then(lease => { lease.release(); return { unexpectedSuccess: true } }, error => ({ code: error.code }))
    expect(outcome).toEqual({ code: 'PACKAGE_LOAD_FAILED' })
    const publicLease = await r.acquirePublic(publicId, owner()); publicLease.release()
    descriptor.profile = 'full'
    expect(validatePackageManifest(Buffer.from(JSON.stringify(manifest))).ok).toBe(false)
    descriptor.profile = 'public-only'; descriptor.assets.judge = { path: 'judge/v1.json', bytes: 0, sha256: '0'.repeat(64) }
    expect(validatePackageManifest(Buffer.from(JSON.stringify(manifest))).ok).toBe(false)
  })
})

async function synthetic() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'exercise-package-step4-')); dirs.push(dir)
  await fs.mkdir(join(dir, 'user-data'))
  const root = join(dir, 'learning/exercises'), paths = { metadata: 'exercise.json', samples: 'samples.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
  const packages = []
  for (const id of ['synthetic-64', 'synthetic-65']) {
    const assets: Record<string, { path: string; bytes: number; sha256: string }> = {}
    for (const [kind, path] of Object.entries(paths)) {
      let bytes = await fs.readFile(join('resources/learning/exercises/ch8-02', path))
      if (kind === 'metadata' || kind === 'samples') { const value = JSON.parse(bytes.toString()); value.exerciseId = id; if (kind === 'metadata') { value.schemaVersion = 2; value.packageVersion = 1; value.official = null } bytes = Buffer.from(JSON.stringify(value)) }
      const target = join(root, id, path); await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, bytes)
      assets[kind] = { path, bytes: bytes.length, sha256: rawPackageDigest(bytes) }
    }
    packages.push({ profile: 'public-only', exerciseId: id, packageVersion: 1, assets })
  }
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 2, policyVersion: 2, version: 1, packages }))
  await fs.writeFile(join(root, 'manifest.json'), raw)
  const r = new ExercisePackageRegistry(scope => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath: dir },
    { version: 1, rawBytes: raw.length, sha256: rawPackageDigest(raw) }, scope))
  registries.push(r); await r.whenStarted()
  return { dir, r }
}
describe('S4-D2 generic public ownership and bounded transport', () => {
  it('adds exercises64/65 solely with data and manifest; preserves cancelled leases and BUSY rules', async () => {
    const { r } = await synthetic(), context = owner()
    const a = r.acquirePublic('synthetic-64', context)
    expect(r.acquirePublic('synthetic-64', context)).toBe(a)
    await expect(r.acquirePublic('synthetic-65', owner())).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    const lease = await a
    expect(publicExercise(lease.data).id).toBe('synthetic-64')
    const representation = lease.represent(JSON.stringify(publicExercise(lease.data)), P.publicDetailBytes)
    r.invalidate(context.owner, context.generation)
    expect(() => representation.data).toThrow('PACKAGE_CANCELLED')
    lease.release()
    await expect(r.acquirePublic('synthetic-65', owner())).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    representation.release()
    const next = await r.acquirePublic('synthetic-65', owner())
    expect(publicExercise(next.data).id).toBe('synthetic-65'); next.release()
    expect(r.readiness('synthetic-64').phase).toBe('DECLARED')
  })
  it('rejects late publication on public-owner cancellation and retains the actual read task', async () => {
    const { r } = await synthetic(), c = owner()
    const retained: Promise<unknown>[] = []; c.retain = task => retained.push(task)
    const task = r.acquirePublic('synthetic-64', c)
    r.invalidate(c.owner, c.generation)
    await expect(task).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    expect(retained).toEqual([task]); expect(r.status().rawBytes).toBe(0)
  })
  it('accounts detached summary packets across slot eviction and retains them through shutdown', async () => {
    const { r } = await synthetic(), context = owner(), first = await r.acquirePublic('synthetic-64', context)
    const baseline = r.status().parsedBytes
    const json = JSON.stringify({ id: 'synthetic-64', title: 'summary' }), packet = first.packet(json, P.pageBytes)
    expect(r.status().parsedBytes).toBe(baseline + Buffer.byteLength(json))
    first.release()
    const second = await r.acquirePublic('synthetic-65', owner()); second.release()
    expect(packet.data).toEqual(JSON.parse(json))
    r.invalidate(context.owner, context.generation)
    expect(() => packet.data).toThrow('PACKAGE_CANCELLED')
    let done = false
    const stop = r.stop(); void stop.then(() => { done = true })
    await Promise.resolve(); expect(done).toBe(false)
    packet.release(); await stop
    expect(r.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('uses bounded authenticated pages/detail/draft reads without hidden fields and detects draft mutation', async () => {
    const { r, dir } = await synthetic(), store = createPracticeStore(join(dir, 'user-data', 'drafts.json')); await store.start()
    const code = '\ud800\u03a9'.repeat(5000)
    await savePracticeDraft(store, { exerciseId: 'synthetic-64', language: 'javascript', code })
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const ipc = new IpcHandlerRegistry({ handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => { handlers.delete(channel) } })
    let authorized = true
    const service = new PracticeIpcService(ipc, store, () => { if (!authorized) throw Error('private permission detail') }, () => {}, r)
    service.start()
    const invoke = async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: 7 } }, payload)
    const bridge = createPracticeBridge({ invoke, on() {}, removeListener() {} })
    try {
      const first = await bridge.list({ limit: 1 }); expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.value.items[0]).toMatchObject({ id: 'synthetic-64', hasDraft: true })
      expect(Buffer.byteLength(JSON.stringify(first.value))).toBeLessThanOrEqual(P.pageBytes)
      const second = await bridge.list({ cursor: first.value.nextCursor!, limit: 1 })
      expect(second).toMatchObject({ ok: true, value: { items: [{ id: 'synthetic-65' }], nextCursor: null } })
      await fs.appendFile(join(dir, 'learning/exercises/synthetic-65/samples.json'), ' ')
      const partial = await bridge.list({ limit: 100 })
      expect(partial).toMatchObject({ ok: true, value: { items: [{ id: 'synthetic-64', available: true }, { id: 'synthetic-65', available: false, chapter: null }] } })
      expect(r.status().state).toBe('AVAILABLE')
      for (const payload of [{ limit: 101 }, { limit: 0 }, { limit: 1, path: '../judge' }, { cursor: 'x'.repeat(513) }, { cursor: '00000000-0000-0000-0000-000000000000:1' }]) expect(await invoke(PRACTICE_CHANNELS.list, payload)).toMatchObject({ ok: false })
      expect(validatePracticePage({ limit: 100 }).ok).toBe(true)
      const detail = await bridge.detail({ exerciseId: 'synthetic-64' })
      expect(detail).toMatchObject({ ok: true, value: { language: 'javascript', exercise: { id: 'synthetic-64' } } })
      const encoded = JSON.stringify(detail)
      for (const key of ['official', 'judge', 'signatureHash', 'sha256', 'asset', 'testSetId', 'comparator']) expect(encoded).not.toContain('"' + key + '"')
      expect(await invoke(PRACTICE_CHANNELS.detail, { exerciseId: 'synthetic-64', expected: 2 })).toMatchObject({ ok: false })
      expect((await bridge.detail({ exerciseId: '../../escape' })).ok).toBe(false)
      const part = await bridge.draft({ exerciseId: 'synthetic-64', language: 'javascript', offset: 0 })
      expect(part.ok).toBe(true)
      if (!part.ok) return
      expect(part.value.text).toBe(code.slice(0, 4096))
      const next = await bridge.draft({ exerciseId: 'synthetic-64', language: 'javascript', offset: 4096, revision: part.value.revision })
      expect(next).toMatchObject({ ok: true, value: { text: code.slice(4096, 8192) } })
      await savePracticeDraft(store, { exerciseId: 'synthetic-64', language: 'javascript', code: code + 'changed' })
      expect((await bridge.draft({ exerciseId: 'synthetic-64', language: 'javascript', offset: 4096, revision: part.value.revision })).ok).toBe(false)
      authorized = false
      expect((await bridge.list({})).ok).toBe(false); expect((await bridge.draft({ exerciseId: 'synthetic-64', language: 'javascript', offset: 0 })).ok).toBe(false)
      expect((await bridge.detail({ exerciseId: 'synthetic-64' })).ok).toBe(false)
    } finally { await service.stop(); await store.stop() }
  })
  it('retains legacy/orphaned drafts and expands cardinality without granting runtime membership', () => {
    const drafts = Array.from({ length: 130 }, (_, n) => ({ exerciseId: `opaque-${n}`, language: 'csharp', code: '' }))
    expect(isPracticeState({ drafts, languages: drafts.map(d => ({ exerciseId: d.exerciseId, language: d.language })) })).toBe(true)
    expect(isExercise({ ...exercises[0], id: 'opaque-64', chapter: 3 })).toBe(true)
    expect(isExercise({ ...exercises[0], id: 'opaque-64', chapter: 9 })).toBe(false)
    expect(isPracticeState({ drafts: [drafts[0], drafts[0]], languages: [] })).toBe(false)
  })
})
