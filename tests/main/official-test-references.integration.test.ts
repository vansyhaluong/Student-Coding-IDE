import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { campaign } from '../../scripts/learning-official-tests/verify'
import { createReferences, evidenceRoot } from '../../scripts/learning-official-tests/references'
import { IDS } from '../../scripts/learning-official-tests/model'

describe('E2-S2 real offline SDK/Node exploration, not Runtime measurement', () => {
  let result: Awaited<ReturnType<typeof campaign>>
  beforeAll(async () => { result = await campaign(resolve('.'), 20261024) }, 150_000)
  it.each(IDS)('%s: real C#/JS agree with independent oracle including maximum curated inputs', id => {
    const row = result.results.find(r => r.exercise === id)!
    expect(row.rows).toBeGreaterThan(8)
    expect(row.unwitnessed).toEqual([])
    expect(row.mutation.filter(m => m.status === 'INVALID_REVIEW_REQUIRED')).toEqual([])
  })
  it('does not promote/claim runtime or critical-performance coverage', () => {
    expect(result.runtimeCertification).toBe('NOT_MEASURED')
    expect(result.results.flatMap(r => r.mutation).filter(m => m.status === 'PENDING_RUNTIME')).toHaveLength(2)
    expect(result.versions.sdk).toMatch(/^10\./)
  })
  it('JS library references do not emit console output and are not production imports', () => {
    const load = createRequire(resolve('package.json'))
    expect(load(resolve('scripts/learning-official-tests/references/ch2-04/solution.js'))(29, 6)).toEqual([4, 5])
  })
  it('enforces single flight and close drains the active reference before removing workspace', async () => {
    const refs = await createReferences(resolve('.'))
    try {
      const first = refs.run('javascript', 'ch5-07', Array.from({ length: 64 }, () => ['a'.repeat(1000), 'a'.repeat(1000)]))
      const settledFirst = first.then(() => 'completed', e => (e as Error).message)
      await expect(refs.run('csharp', 'ch2-04', [[29, 6]])).rejects.toThrow('REFERENCE_BUSY_OR_CLOSED')
      await refs.close()
      expect(['CANCELLED', 'completed']).toContain(await settledFirst)
      await expect(refs.run('javascript', 'ch2-04', [[29, 6]])).rejects.toThrow('REFERENCE_CLOSED_OR_COUNT')
    } finally { await refs.close() }
  }, 90_000)
  afterAll(async () => {
    if (result) await writeFile(resolve(await evidenceRoot(resolve('.')), 's2-integration-report.json'), JSON.stringify(result, null, 2) + '\n')
  })
})
