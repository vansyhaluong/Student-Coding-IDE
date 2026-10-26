import * as fs from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { SUBMISSION_STORE_POLICY as P } from '../../src/main/services/learning/storage/submission-contracts'
import { nodeStoreFilePort } from '../../src/main/services/learning/storage/store-files'
import { document, fault, fixture, record, type ReadFixture } from '../fixtures/learning/submission-read-fixture'

const opened: ReadFixture[] = []
async function setup(...args: Parameters<typeof fixture>) { const s = await fixture(...args); opened.push(s); return s }
afterEach(async () => { for (const s of opened.splice(0)) await s.dispose() })

describe('E5-S4 Accepted-derived completion', () => {
  it('does not perform any Failed filesystem probe to determine completion', async () => {
    let failedProbes = 0
    const s = await setup({ ...nodeStoreFilePort, lstat: async path => {
      if (path.includes('failed-submissions.json')) { failedProbes++; throw fault() }
      return nodeStoreFilePort.lstat(path)
    } })
    await s.write(document([record()]))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
    expect(await s.store.completion('absent')).toMatchObject({ state: 'NOT_COMPLETED' })
    expect(failedProbes).toBe(0)
  })
  it('reports confirmed missing Accepted as NOT_COMPLETED and Failed never creates completion', async () => {
    const s = await setup()
    expect(await s.store.completion('synthetic')).toMatchObject({ ok: true, state: 'NOT_COMPLETED', accepted: { state: 'MISSING' } })
    await s.write(document([record('FAILED')]))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'NOT_COMPLETED' })
  })
  it('completion is exercise-specific and independent of language/package filters or current Official assets', async () => {
    const s = await setup(); await s.write(document([record('ACCEPTED', { exerciseId: 'old-exercise', language: 'csharp', packageVersion: 77 })]))
    expect(await s.store.completion('old-exercise')).toMatchObject({ state: 'COMPLETED' })
    expect(await s.store.completion('other')).toMatchObject({ state: 'NOT_COMPLETED' })
    expect(await s.store.history({ exerciseId: 'old-exercise', language: 'javascript', packageVersion: 1 })).toMatchObject({ total: 0 })
    expect(await s.store.completion('old-exercise')).toMatchObject({ state: 'COMPLETED' })
  })
  it.each(['missing', 'failed', 'corrupt', 'unavailable', 'oversized'] as const)('valid Accepted completion survives %s Failed store', async mode => {
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (mode === 'unavailable' && path.endsWith('failed-submissions.json')) throw fault()
      return nodeStoreFilePort.open(path, flags)
    } })
    await s.write(document([record()]))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
    if (mode === 'failed' || mode === 'unavailable') await s.write(document([record('FAILED')]))
    if (mode === 'corrupt') await fs.writeFile(s.path('FAILED'), 'corrupt Failed')
    if (mode === 'oversized') { const h = await fs.open(s.path('FAILED'), 'wx'); await h.truncate(P.FAILED.snapshotBytes + 1); await h.close() }
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it.each(['corrupt', 'unsupported', 'unavailable', 'oversized', 'orphan'] as const)('returns UNKNOWN for %s Accepted with no verified fallback', async mode => {
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (mode === 'unavailable' && path.endsWith('accepted.json')) throw fault()
      return nodeStoreFilePort.open(path, flags)
    } })
    if (mode === 'corrupt' || mode === 'unavailable') await fs.writeFile(s.path('ACCEPTED'), 'evidence')
    if (mode === 'unsupported') {
      const doc = document([record()]); await fs.writeFile(s.path('ACCEPTED'), JSON.stringify({ ...doc, schemaVersion: 2 }))
    }
    if (mode === 'oversized') { const h = await fs.open(s.path('ACCEPTED'), 'wx'); await h.truncate(P.ACCEPTED.snapshotBytes + 1); await h.close() }
    if (mode === 'orphan') await fs.writeFile(s.path('ACCEPTED') + '.stage-orphan.tmp', 'pending evidence')
    await s.write(document([record('FAILED')]))
    expect(await s.store.completion('synthetic')).toMatchObject({ ok: true, state: 'UNKNOWN' })
  })
  it('does not cache a previous positive when Accepted becomes unreadable', async () => {
    let denied = false
    const s = await setup({ ...nodeStoreFilePort, open: async (path, flags) => {
      if (denied && path.endsWith('accepted.json')) throw fault(); return nodeStoreFilePort.open(path, flags)
    } })
    await s.write(document([record()]))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
    denied = true; expect(await s.store.completion('synthetic')).toMatchObject({ state: 'UNKNOWN' })
    denied = false; expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it('uses only records present in recovered backup and preserves possible-data-loss warning', async () => {
    const s = await setup(), r = record('ACCEPTED', { exerciseId: 'older' }), prior = document([r])
    await s.write(prior, true); await fs.writeFile(s.path('ACCEPTED'), 'corrupt newest')
    expect(await s.store.completion('older')).toMatchObject({ state: 'COMPLETED', accepted: { state: 'RECOVERED', warning: 'POSSIBLE_DATA_LOSS' } })
    expect(await s.store.completion('possibly-lost')).toMatchObject({ state: 'UNKNOWN', accepted: { warning: 'POSSIBLE_DATA_LOSS' } })
    expect(await fs.readFile(s.path('ACCEPTED'), 'utf8')).toBe('corrupt newest')
  })
  it('finds committed-but-unacknowledged records by load without a receipt or runtime replay', async () => {
    const s = await setup(); await s.write(document([record()]))
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
    expect((await fs.readdir(s.root)).sort()).toEqual(['accepted.json', 'submissions.lock'])
  })
  it('reports UNKNOWN during an unresolved live commit and does not promote its candidate', async () => {
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(r => { enter = r }), gate = new Promise<void>(r => { release = r })
    const s = await setup({ ...nodeStoreFilePort, rename: async (from, to) => {
      if (to.endsWith('accepted.json')) { enter(); await gate }; await fs.rename(from, to)
    } })
    const tx = s.store.begin(record(), () => {}); await entered
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'UNKNOWN', accepted: { state: 'RECOVERY_PENDING' } })
    release(); expect((await tx.task).state).toBe('saved')
    expect(await s.store.completion('synthetic')).toMatchObject({ state: 'COMPLETED' })
  })
  it.each(['', '../exercise', 'a'.repeat(65), null, { exerciseId: 'synthetic' }])('rejects malformed completion identity %j', async id => {
    const s = await setup(); expect(await s.store.completion(id)).toMatchObject({ ok: false, reason: 'INVALID_REQUEST' })
  })
})
