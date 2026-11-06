import * as fs from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { captureSavedAnalysis } from '../../src/main/services/learning/analysis/capture'
import { document, fixture, record, uuid, type ReadFixture } from '../fixtures/learning/submission-read-fixture'
import { input, publicPackages, analysisBinding as sourceRequest } from '../fixtures/learning/analysis'
import type { SubmissionGradedFailure } from '../../src/main/services/learning/storage/submission-contracts'
import { SubmissionProjection } from '../../src/main/services/learning/submission-projection'
const opened: ReadFixture[] = []
afterEach(async () => { for (const f of opened.splice(0)) await f.dispose() })
async function setup() { const f = await fixture(); opened.push(f); return f }
const check = () => {}
describe('D2 exact saved source and public statement capture', () => {
  it.each<SubmissionGradedFailure>(['WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError',
    'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'])('captures verified graded Failed %s without sending verdict', async verdict => {
    const f = await setup(), base = record('FAILED', { code: input.source })
    if (!('verdict' in base)) throw Error()
    const r = { ...base, verdict }; await f.write(document([r]))
    const saved = await captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(r), check)
    expect(saved.input).toEqual(input); expect(Object.keys(saved.input).sort()).toEqual(['language', 'packageVersion', 'publicStatement', 'source'])
  })
  it.each(['ACCEPTED', 'FAILED'] as const)('%s is captured exactly with released storage/public resources', async kind => {
    const f = await setup(), r = record(kind, { code: input.source, language: 'csharp', sourceRevision: 7 })
    await f.write(document([r])); const p = publicPackages()
    const before = await f.store.completion(r.exerciseId)
    const result = await captureSavedAnalysis(f.store, p.packages, sourceRequest(r), () => {})
    expect(result).toEqual({ input: { ...input, language: 'csharp' }, submissionId: r.submissionId, exerciseId: r.exerciseId })
    expect(f.lease.ownsLease).toBe(false); expect(f.store.hasRetainedReads).toBe(false)
    expect(p.release).toHaveBeenCalledOnce(); expect(p.pinned).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|HIDDEN_|EXPECTED_|DRAFT_|verdict|comparator|testSet/)
    expect(await f.store.completion(r.exerciseId)).toEqual(before)
  })
  it.each(['submissionId', 'sourceHash', 'sourceRevision', 'key'] as const)('rejects mismatched %s', async field => {
    const f = await setup(), r = record(); await f.write(document([r])); const q = sourceRequest(r), p = publicPackages()
    const forged = { ...q, [field]: field === 'sourceRevision' ? 999 : field === 'sourceHash' ? 'a'.repeat(64)
      : field === 'key' ? { ...q.key, recordId: uuid(999) } : uuid(999) }
    await expect(captureSavedAnalysis(f.store, p.packages, forged, check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(p.acquirePublic).not.toHaveBeenCalled()
  })
  it('rejects old source with new public version, and releases pin', async () => {
    const f = await setup(), r = record(); await f.write(document([r])); const p = publicPackages(2)
    await expect(captureSavedAnalysis(f.store, p.packages, sourceRequest(r), check)).rejects.toMatchObject({ code: 'CONTENT_VERSION_MISMATCH' })
    expect(p.release).toHaveBeenCalledOnce(); expect(f.lease.ownsLease).toBe(false)
  })
  it('partial availability permits only a verified readable selected record', async () => {
    const f = await setup(), r = record(); await f.write(document([r])); await fs.writeFile(f.path('FAILED'), 'corrupt')
    const h = await f.store.history(); expect(h).toMatchObject({ ok: true, coverage: 'PARTIAL' })
    expect(await captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(r), check)).toMatchObject({ submissionId: r.submissionId })
    const absent = record('FAILED')
    await expect(captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(absent), check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
  })
  it('recovers a verified backup; never manufactures source from corrupt stores', async () => {
    const f = await setup(), r = record(); await f.write(document([r]), true); await fs.writeFile(f.path('ACCEPTED'), 'corrupt')
    expect(await captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(r), check)).toMatchObject({ submissionId: r.submissionId })
    await fs.writeFile(f.path('ACCEPTED', true), 'also corrupt')
    await expect(captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(r), check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
  })
  it('blocks retained lease cleanup and does not pin public package', async () => {
    const f = await setup(), r = record(); await f.write(document([r])); f.closeFault = true; const p = publicPackages()
    await expect(captureSavedAnalysis(f.store, p.packages, sourceRequest(r), check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(p.acquirePublic).not.toHaveBeenCalled(); f.closeFault = false; await f.store.settleReads()
  })
  it.each([16385, 32769])('refuses %i-byte source without truncation', async bytes => {
    const f = await setup(), r = record('FAILED', { code: 'x'.repeat(bytes) }); await f.write(document([r]))
    const p = publicPackages()
    await expect(captureSavedAnalysis(f.store, p.packages, sourceRequest(r), check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(p.acquirePublic).not.toHaveBeenCalled()
  })
  it('rechecks context after source read before acquiring public content', async () => {
    const f = await setup(), r = record(); await f.write(document([r])); const p = publicPackages(); let count = 0
    await expect(captureSavedAnalysis(f.store, p.packages, sourceRequest(r), () => { if (++count > 1) throw Error('revoked') })).rejects.toThrow('revoked')
    expect(p.acquirePublic).not.toHaveBeenCalled(); expect(f.lease.ownsLease).toBe(false)
  })
  it('source mutation with stale hash is rejected by committed recovery', async () => {
    const f = await setup(), r = record(); await f.write(document([r])); const path = f.path('ACCEPTED')
    await fs.writeFile(path, (await fs.readFile(path, 'utf8')).replace('synthetic source', 'synthetic changed'))
    await expect(captureSavedAnalysis(f.store, publicPackages().packages, sourceRequest(r), check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
  })
  it('rejects mismatched exercise identity and oversized statement, always releasing public pin', async () => {
    const f = await setup(), r = record(); await f.write(document([r]))
    for (const patch of [{ exerciseId: 'foreign' }, { statement: 'x'.repeat(8193) }]) {
      const p = publicPackages(), acquire = p.acquirePublic.getMockImplementation()!
      p.acquirePublic.mockImplementationOnce(async (id, owner) => {
        const lease = await acquire(id, owner)
        Object.assign(lease.data.metadata, patch); return lease
      })
      await expect(captureSavedAnalysis(f.store, p.packages, sourceRequest(r), check)).rejects.toThrow()
      expect(p.release).toHaveBeenCalledOnce(); expect(f.lease.ownsLease).toBe(false)
    }
  })
  it.each([{ exerciseId: 'foreign' }, { language: 'csharp' as const }, { packageVersion: 2 }])('rejects changed saved metadata %j under the same record/hash/revision', async patch => {
    const f = await setup(), r = record(); await f.write(document([r])); const p = publicPackages()
    await expect(captureSavedAnalysis(f.store, p.packages, { ...sourceRequest(r), ...patch }, check)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(p.acquirePublic).not.toHaveBeenCalled()
  })
  it('full metadata source binding fits existing token limits at maximum identity lengths', async () => {
    const f = await setup(), r = record('ACCEPTED', { exerciseId: 'x'.repeat(64), language: 'javascript',
      packageVersion: Number.MAX_SAFE_INTEGER, sourceRevision: Number.MAX_SAFE_INTEGER })
    await f.write(document([r])); const projection = new SubmissionProjection(), scope = uuid(1) + ':' + Number.MAX_SAFE_INTEGER
    const history = projection.history(await f.store.history(), scope)
    if (!history.ok) throw Error()
    const ref = history.rows[0].source.reference; expect(ref.length).toBeLessThanOrEqual(512)
    expect(projection.analysisBinding(ref, scope)).toEqual(sourceRequest(r))
    expect(await f.store.source(projection.sourceBinding(ref, scope, 0))).toMatchObject({ ok: true, code: r.code })
  })
})
