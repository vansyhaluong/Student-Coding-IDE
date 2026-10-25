import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { ExercisePackageRegistry, type PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'
import { openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { acquireOfficialCasePlan, type OfficialPlanIdentity, type OfficialPlanOwner } from '../../src/main/services/learning/official-case-plan'
import type { ExerciseExecutionPhase, ExercisePhaseContext } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'

const temporary: string[] = []
afterEach(async () => {
  for (const root of temporary.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e3-s1-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  }
})
/** Real bounded reader/validation/Registry; only the test's temporary dataset is expanded. */
async function fixture(count = 21) {
  const root = await mkdtemp(join(tmpdir(), 'e3-s1-')); temporary.push(root)
  const output = join(root, 'learning/exercises'), source = resolve('resources/learning/exercises')
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
  const entry = manifest.packages[0]
  manifest.packages = [entry]
  const assets: Record<string, Buffer> = {}
  for (const [kind, asset] of Object.entries(entry.assets) as [string, { path: string }][]) assets[kind] = await readFile(join(source, entry.exerciseId, asset.path))
  const metadata = JSON.parse(assets.metadata.toString()), judge = JSON.parse(assets.judge.toString())
  const seed = judge.cases.find((c: { visibility: string }) => c.visibility === 'hidden')
  judge.cases = [...judge.cases.filter((c: { visibility: string }) => c.visibility === 'public'),
    ...Array.from({ length: count - 2 }, (_, i) => ({ ...seed, id: `s1-hidden-${i + 1}` }))]
  assets.judge = Buffer.from(JSON.stringify(judge)); metadata.official.hash = rawPackageDigest(assets.judge)
  assets.metadata = Buffer.from(JSON.stringify(metadata))
  for (const [kind, bytes] of Object.entries(assets)) {
    const asset = entry.assets[kind], target = join(output, entry.exerciseId, asset.path)
    asset.bytes = bytes.length; asset.sha256 = rawPackageDigest(bytes)
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes)
  }
  const raw = Buffer.from(JSON.stringify(manifest)); await writeFile(join(output, 'manifest.json'), raw)
  const registry = new ExercisePackageRegistry((scope, control) => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath: root },
    { version: manifest.version, rawBytes: raw.length, sha256: rawPackageDigest(raw) }, scope, control))
  await registry.whenStarted()
  expect(registry.status().state).toBe('AVAILABLE')
  const identity: OfficialPlanIdentity = { exerciseId: metadata.exerciseId, packageVersion: metadata.packageVersion, testSetId: judge.testSetId,
    testSetVersion: judge.version, signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash, officialHash: metadata.official.hash,
    comparatorId: 'exact-typed', comparatorVersion: 1 }
  return { registry, identity, judge }
}
function ownership() {
  const controller = new AbortController(), tasks = new Set<Promise<unknown>>()
  let phase: ExerciseExecutionPhase = 'prepare', context: ExercisePhaseContext = { signal: controller.signal, deadline: performance.now() + 60000, jobMemoryBytes: null, output() {} }
  let active = true, clean = false, settled = true, release: (() => void) | undefined
  const packageOwner: PackagePrepareOwner = { owner: {}, generation: 3, phase: 'prepare', isCurrent: () => active,
    check() { throw Error('Captured Prepare check must not be reused') },
    retain(task) { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}) }, canRelease: () => settled && tasks.size === 0 }
  const owner: OfficialPlanOwner = { packageOwner, currentPhase: () => ({ phase, context }),
    cleanup: () => ({ state: clean ? 'FINALIZED' : 'PENDING', proof: clean ? 'VERIFIED' : 'HISTORY_UNVERIFIED', cleanupComplete: clean, processClean: clean,
      workspace: clean ? 'REMOVED' : 'RETAINED', pendingIo: !clean }), retainContent(r) { release = r } }
  return { owner, controller, tasks, phase(p: ExerciseExecutionPhase, deadline = performance.now() + 60000, signal = controller.signal) {
    phase = p; context = { ...context, deadline, signal }
  }, active(v: boolean) { active = v }, clean(v = true) { clean = v }, settled(v: boolean) { settled = v },
  async dispose() { await Promise.allSettled([...tasks]); clean = true; settled = true; release?.() } }
}

describe('E3-S1 leased Main-private Official plan (no runtime)', () => {
  it.each([17, 21, 128])('supports %i ordered inputs with no private metadata in the language view', async count => {
    const f = await fixture(count), o = ownership()
    try {
      const plan = await acquireOfficialCasePlan(f.registry, f.identity, o.owner)
      expect(plan.identity).toEqual(f.identity); expect(plan.execution.caseCount).toBe(count)
      expect(plan.caseAt(count - 1)).toEqual(f.judge.cases[count - 1])
      expect(Object.keys(plan.execution).sort()).toEqual(['caseCount', 'inputAt', 'signature'])
      expect(Object.keys(plan.execution.signature).sort()).toEqual(['functionName', 'parameters', 'returnType'])
      expect(JSON.stringify(plan.execution)).not.toMatch(/expected|visibility|hidden|testSetId|officialHash/)
      for (let i = 0; i < count; i++) expect(plan.execution.inputAt(i)).toEqual(f.judge.cases[i].args)
      expect(Object.isFrozen(plan.execution.inputAt(0))).toBe(true)
      expect(() => plan.execution.inputAt(count)).toThrow(); expect(() => plan.execution.inputAt(-1)).toThrow()
      expect(() => plan.release()).toThrow()
      o.clean(); o.settled(false); expect(() => plan.release()).toThrow(); o.settled(true)
      plan.release(); plan.release(); expect(() => plan.execution.inputAt(0)).toThrow()
    } finally { await o.dispose(); await f.registry.stop() }
    expect(f.registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('uses the current phase deadline, registers input representations, and retains the pin until derived uses settle', async () => {
    const f = await fixture(), o = ownership()
    try {
      const plan = await acquireOfficialCasePlan(f.registry, f.identity, o.owner), resident = f.registry.status()
      o.owner.currentPhase().context.deadline = 0 // Old Prepare must no longer govern input work.
      o.phase('execute') // Separate current context, not the expired Prepare check.
      const pending = plan.representInput(20)
      expect(o.tasks.size).toBeGreaterThan(0)
      expect(() => { o.clean(); plan.release() }).toThrow()
      const input = await pending
      expect(input.data).toEqual({ protocolVersion: 1, caseIndex: 20, args: f.judge.cases[20].args })
      expect(f.registry.status().parsedBytes).toBeGreaterThan(resident.parsedBytes)
      expect(f.registry.status().nodes).toBeGreaterThan(resident.nodes)
      input.release(); expect(f.registry.status().parsedBytes).toBe(resident.parsedBytes)
      o.phase('execute', 0); expect(() => plan.execution.inputAt(0)).toThrow()
      o.phase('execute', performance.now() + 1000, new AbortController().signal); expect(() => plan.execution.inputAt(0)).toThrow()
    } finally { await o.dispose(); await f.registry.stop() }
  })
  it.each(['packageVersion', 'testSetVersion', 'testSetId', 'signatureVersion', 'signatureHash', 'officialHash'] as const)('rejects stale %s without losing the failed Prepare release handle', async key => {
    const f = await fixture(), o = ownership()
    try {
      const bad = { ...f.identity, [key]: typeof f.identity[key] === 'number' ? 9999 : 'stale' }
      await expect(acquireOfficialCasePlan(f.registry, bad, o.owner)).rejects.toThrow()
      await expect(f.registry.acquire(f.identity.exerciseId, { ...ownership().owner.packageOwner, check() {} })).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    } finally { await o.dispose(); await f.registry.stop() }
  })
  it('rejects non-Prepare/public capability before acquisition', async () => {
    const f = await fixture(), o = ownership(), acquire = vi.spyOn(f.registry, 'acquire')
    try {
      o.phase('execute'); await expect(acquireOfficialCasePlan(f.registry, f.identity, o.owner)).rejects.toThrow()
      o.phase('prepare')
      await expect(acquireOfficialCasePlan(f.registry, f.identity, { ...o.owner, packageOwner: { ...o.owner.packageOwner, phase: 'public' } })).rejects.toThrow()
      expect(acquire).not.toHaveBeenCalled()
    } finally { await o.dispose(); await f.registry.stop() }
  })
  it.each(['cancel', 'owner', 'invalidate', 'shutdown'] as const)('revokes private reads on %s and drains the same Registry ledger', async mode => {
    const f = await fixture(), o = ownership()
    try {
      const plan = await acquireOfficialCasePlan(f.registry, f.identity, o.owner)
      if (mode === 'cancel') o.controller.abort()
      if (mode === 'owner') o.active(false)
      if (mode === 'invalidate') f.registry.invalidate(o.owner.packageOwner.owner, 3)
      if (mode === 'shutdown') f.registry.beginShutdown()
      expect(() => plan.execution.inputAt(0)).toThrow()
      expect(() => plan.release()).toThrow()
    } finally { await o.dispose(); await f.registry.stop() }
  })
  it('does not publish a late acquisition after owner cancellation', async () => {
    const f = await fixture(), o = ownership()
    try {
      const pending = acquireOfficialCasePlan(f.registry, f.identity, o.owner)
      o.controller.abort()
      await expect(pending).rejects.toThrow()
    } finally { await o.dispose(); await f.registry.stop() }
  })
  it('rejects a phase switch during acquisition and retains shutdown until cleanup releases the pin', async () => {
    const f = await fixture(), o = ownership()
    try {
      const pending = acquireOfficialCasePlan(f.registry, f.identity, o.owner)
      o.phase('execute')
      await expect(pending).rejects.toThrow()
    } finally { await o.dispose(); await f.registry.stop() }
    const next = await fixture(), n = ownership()
    const plan = await acquireOfficialCasePlan(next.registry, next.identity, n.owner)
    let stopped = false
    const stopping = next.registry.stop().then(() => { stopped = true })
    await Promise.resolve(); expect(stopped).toBe(false)
    expect(() => plan.release()).toThrow()
    await n.dispose(); await stopping
    expect(next.registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})
