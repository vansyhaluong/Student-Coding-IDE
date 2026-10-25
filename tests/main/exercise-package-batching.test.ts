import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBoundedPackageJson, parseBoundedPackageJsonCooperative } from '../../src/main/services/learning/content/bounded-package-json'
import { PackageWorkBatch, PackageWorkControl, CHARACTER_WORK, NODE_WORK, ENTRY_WORK, freezePackageWork, runPackageWork,
  type PackageWork, type PackageWorkCharge } from '../../src/main/services/learning/content/exercise-package-work'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import { sourceRegistry } from '../fixtures/learning/package-registry'

type Golden = { text: string; ok: boolean; stats?: { canonicalBytes: number; nodes: number }; code?: string }
const goldens = JSON.parse(readFileSync('tests/fixtures/learning/package-batching-baseline.json', 'utf8')) as {
  provenance: string; kernelSha256: string; workSha256: string; cases: Golden[]
}

describe('S5-O1 captured pre-optimization outcomes', () => {
  it('preserves 1089 original accept/reject codes and exact canonical statistics in both drivers', async () => {
    expect(goldens.kernelSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(goldens.workSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(goldens.cases).toHaveLength(1089)
    for (const golden of goldens.cases) {
      const syncStats: unknown[] = [], asyncStats: unknown[] = []
      const observe = (list: unknown[]) => ({ raw: () => () => {}, parsed: (value: unknown) => { list.push(value) } })
      const bytes = Buffer.from(golden.text)
      const sync = parseBoundedPackageJson(bytes, P.jsonBytes, observe(syncStats))
      const cooperative = await parseBoundedPackageJsonCooperative(bytes, P.jsonBytes, observe(asyncStats), new PackageWorkControl())
      expect(sync, golden.text).toEqual(cooperative)
      if (golden.ok) {
        expect(sync, golden.text).toEqual({ ok: true, value: JSON.parse(golden.text) as unknown })
        expect(syncStats, golden.text).toEqual([golden.stats])
      } else {
        expect(sync, golden.text).toEqual({ ok: false, code: golden.code })
        expect(syncStats, golden.text).toEqual([])
      }
      expect(asyncStats, golden.text).toEqual(syncStats)
    }
  })
})

async function traceBatch(batched: boolean, prefix: number, charge: PackageWorkCharge, count: number, timeDriven = false) {
  let position = 0
  const checks: number[] = [], yields: number[] = []
  const control = new PackageWorkControl(() => { checks.push(position) }, {
    now: () => timeDriven ? position / 10 : 0,
    yield: async () => { yields.push(position) },
  })
  function* work(): PackageWork<void> {
    for (let i = 0; i < prefix; i++) { yield NODE_WORK; position++ }
    if (batched) {
      let completed = 0
      const batch = new PackageWorkBatch(charge, () => { position++; return ++completed === count })
      while (!batch.done) yield { batch }
    } else for (let i = 0; i < count; i++) { yield charge; position++ }
  }
  await runPackageWork(work(), control)
  return { position, checks, yields }
}

describe('batch allowance preserves the exact existing scheduling sequence', () => {
  for (const prefix of [0, 1, 31, 62, 63, 64, 127, 511, 2047]) {
    it(`keeps character guard/slice positions after ${prefix} preceding node steps`, async () => {
      expect(await traceBatch(true, prefix, CHARACTER_WORK, 8195)).toEqual(await traceBatch(false, prefix, CHARACTER_WORK, 8195))
    })
  }
  it.each([NODE_WORK, ENTRY_WORK, { chars: 1 }, { nodes: 1, steps: 1 }])('retains every cap and guard for %j', async charge => {
    expect(await traceBatch(true, 63, charge, 4097)).toEqual(await traceBatch(false, 63, charge, 4097))
  })
  it('keeps soft5ms yield positions with monotonic logical work', async () => {
    expect(await traceBatch(true, 31, CHARACTER_WORK, 8195, true)).toEqual(await traceBatch(false, 31, CHARACTER_WORK, 8195, true))
  })
  it('accounts only performed work when a lexical batch ends early or throws', () => {
    let completed = 0
    const batch = new PackageWorkBatch(CHARACTER_WORK, () => ++completed === 3)
    batch.advance({ chars: 64, nodes: 64, steps: 64, entries: 32 })
    expect(batch.consumed).toEqual({ chars: 3, nodes: 0, steps: 3, entries: 0 })
    expect(batch.done).toBe(true)
    let failedSteps = 0
    const failing = new PackageWorkBatch(CHARACTER_WORK, () => { if (++failedSteps === 7) throw Error('malformed'); return false })
    expect(() => failing.advance({ chars: 64, nodes: 64, steps: 64, entries: 32 })).toThrow('malformed')
    expect(failing.consumed).toEqual({ chars: 7, nodes: 0, steps: 7, entries: 0 })
  })
  it('detects invalidation by the same next64-step guard without extending work', async () => {
    for (const batched of [false, true]) {
      let position = 0
      const control = new PackageWorkControl(() => { if (position >= 70) throw Error('cancelled') }, { now: () => 0, yield: async () => {} })
      function* work(): PackageWork<void> {
        if (batched) {
          const batch = new PackageWorkBatch(CHARACTER_WORK, () => ++position === 1000)
          while (!batch.done) yield { batch }
        } else for (let i = 0; i < 1000; i++) { yield CHARACTER_WORK; position++ }
      }
      await expect(runPackageWork(work(), control)).rejects.toMatchObject({ reason: Error('cancelled') })
      expect(position).toBe(127)
    }
  })
  it.each([0, 1, 62, 63, 64, 2044, 2045, 2046, 2047, 2048, 8191])('preserves all four parser barriers and cap yields for string length %i', async units => {
    let yields = 0
    const control = new PackageWorkControl(() => {}, { now: () => 0, yield: async () => { yields++ } })
    expect((await parseBoundedPackageJsonCooperative(Buffer.from(JSON.stringify('x'.repeat(units))), P.jsonBytes, undefined, control)).ok).toBe(true)
    expect(yields).toBe(4 + Math.floor((units + 2) / 2048))
  })
})

describe('batched postorder freeze', () => {
  it('visits aliases once after they are frozen, preserving old node charges and deep immutability', async () => {
    const shared = { values: [1, 2, 3] }, root = { a: [shared, 3], b: shared }
    const work = freezePackageWork(root)
    let step = work.next(), nodes = 0
    while (!step.done) {
      const batch = step.value.batch!
      batch.advance({ chars: 1, nodes: 1, steps: 1, entries: 1 })
      nodes += batch.consumed.nodes ?? 0
      step = work.next()
    }
    expect(nodes).toBe(9)
    expect(Object.isFrozen(root)).toBe(true)
    expect(Object.isFrozen(root.a)).toBe(true)
    expect(Object.isFrozen(shared)).toBe(true)
    expect(Object.isFrozen(shared.values)).toBe(true)
    expect(() => { shared.values[0] = 4 }).toThrow()
  })
  it('retains node512 and step64 limits on a large array without queueing every child', async () => {
    const root = Array.from({ length: 1537 }, (_, i) => i)
    let checks = 0, yields = 0
    const control = new PackageWorkControl(() => { checks++ }, { now: () => 0, yield: async () => { yields++ } })
    await runPackageWork(freezePackageWork(root), control)
    expect(Object.isFrozen(root)).toBe(true)
    expect(yields).toBe(3) // 1538 logical node visits; no added barrier
    expect(checks).toBeGreaterThanOrEqual(Math.floor(1538 / 64))
  })
  it('unwinds synchronous and cooperative representation scopes on a lexical batch failure', async () => {
    const registry = await sourceRegistry(), id = [...registry.ids()][0]
    const lease = await registry.acquirePublic(id, { owner: {}, generation: 1, phase: 'public', isCurrent: () => true,
      check() {}, retain() {}, canRelease: () => true })
    const baseline = registry.status()
    const malformed = '{"value":"\\uD800"}'
    expect(() => lease.represent(malformed, P.publicDetailBytes)).toThrow('PACKAGE_JSON_INVALID')
    expect(registry.status()).toEqual(baseline)
    await expect(lease.representCooperative(malformed, P.publicDetailBytes)).rejects.toThrow('PACKAGE_JSON_INVALID')
    expect(registry.status()).toEqual(baseline)
    lease.release(); await registry.stop()
    expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})
