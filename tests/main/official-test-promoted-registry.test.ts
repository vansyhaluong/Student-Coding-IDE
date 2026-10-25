import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import { IDS } from '../../scripts/learning-official-tests/model'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import type { PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'

function owner() {
  const tasks = new Set<Promise<unknown>>()
  const context: PackagePrepareOwner = { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => true, check() {},
    retain(p) { tasks.add(p); void p.finally(() => tasks.delete(p)).catch(() => {}) }, canRelease: () => tasks.size === 0 }
  return { context, tasks }
}
describe.skipIf(!existsSync('out/official-tests/e2-s3-hRjMzc/evidence/candidate-report.json'))('E2-S5 real promoted Registry', () => {
  it('pins all nine exact accepted Judges, registers copies/representations and drains accounting', async () => {
    const r = await sourceRegistry(), proof = JSON.parse(await fs.readFile('out/official-tests/e2-s3-hRjMzc/evidence/candidate-report.json', 'utf8'))
    let cases = 0
    try {
      for (const id of IDS) {
        const o = owner(), first = r.acquire(id, o.context)
        expect(r.acquire(id, o.context)).toBe(first)
        const lease = await first
        try {
          await expect(r.acquirePublic(id, owner().context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
          const accepted = JSON.parse(await fs.readFile(join('out/official-tests/e2-s3-hRjMzc/resources/learning/exercises', id, 'judge/v1.json'), 'utf8'))
          expect(lease.data.judge).toEqual(accepted); cases += accepted.cases.length
          const resident = r.status(), task = lease.copyCooperative()
          await expect(lease.copyCooperative()).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
          const copy = await task
          try {
            const representation = await lease.representCooperative(JSON.stringify(lease.data.judge), P.publicDetailBytes)
            try {
              const old = proof.ledger.measured.find((x: { exercise: string }) => x.exercise === id)
              // Manifest/index grows in Wave A; exact derived reservations for
              // unchanged pilot package bytes must remain unchanged.
              expect(r.status().parsedBytes-resident.parsedBytes).toBe(old.withRepresentation.parsedBytes-old.resident.parsedBytes)
              expect(r.status().nodes-resident.nodes).toBe(old.withRepresentation.nodes-old.resident.nodes)
              expect(r.status().rawBytes).toBe(0)
              expect(r.status().parsedBytes).toBeLessThan(P.residentLogicalBytes)
              expect(r.status().nodes).toBeLessThan(P.residentNodes)
              expect(copy.data.judge).toEqual(accepted)
              expect(Object.isFrozen(copy.data.judge.cases)).toBe(true)
              const dto = publicExercise(lease.data)
              expect(dto.samples).toHaveLength(2)
              expect(JSON.stringify(dto)).not.toMatch(/hidden-\d|testSetId|signatureHash|"official"|"judge"/)
            } finally { representation.release() }
          } finally { copy.release() }
        } finally { await Promise.allSettled([...o.tasks]); lease.release() }
      }
      expect(cases).toBe(73)
    } finally { await r.stop() }
    expect(r.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  }, 30000)
  it('invalidates an in-flight official load and waits for retained work at shutdown', async () => {
    const r = await sourceRegistry(), o = owner(), load = r.acquire('ch8-08', o.context)
    const rejected = expect(load).rejects.toHaveProperty('code', 'PACKAGE_CANCELLED')
    r.invalidate(o.context.owner, o.context.generation)
    await rejected; await Promise.allSettled([...o.tasks]); await r.stop()
    expect(r.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})
