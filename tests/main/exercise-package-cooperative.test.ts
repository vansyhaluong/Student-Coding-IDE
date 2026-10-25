import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBoundedPackageJson, parseBoundedPackageJsonCooperative, parsePackageJsonWork } from '../../src/main/services/learning/content/bounded-package-json'
import { PackageResidentBudget } from '../../src/main/services/learning/content/exercise-package-budget'
import { PackageWorkControl, PackageWorkInterrupted, runPackageWork, type PackageWorkCharge } from '../../src/main/services/learning/content/exercise-package-work'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import type { PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { validatePackageManifest, validatePackageManifestCooperative } from '../../src/main/services/learning/content/exercise-package-validation'

const immediate = () => new Promise<void>(resolve => setImmediate(resolve))
afterEach(() => vi.restoreAllMocks())
function owner() {
  const tasks: Promise<unknown>[] = []
  const state = { current: true, clean: true }
  const context: PackagePrepareOwner = { owner: {}, generation: 1, phase: 'public', isCurrent: () => state.current,
    check: () => { if (!state.current) throw Error('owner expired') }, retain: task => { tasks.push(task) }, canRelease: () => state.clean }
  return { context, tasks, state }
}

describe('one resumable JSON kernel', () => {
  const vectors = [
    'null', 'true', 'false', '0', '-0', '1e-5', '1e+25', '1.2300', '1e309', '01', '+1', '1.', '1e', '--1',
    '', ' ', '[1,]', '{"x":1,}', '{"x":1,"\\u0078":2}', '{"__proto__":0}', '{"prototype":0}', '{"constructor":0}',
    '{"x":{"x":1}}', '"\\uD83D\\uDE00"', '"😀"', '"\\uD83D😀"', '"\\uD800"', '"\\uDC00"',
    JSON.stringify('a\n\r\t\b\f/\\"z'), '"\\u0000"', '"\\u00q0"', '"\\u12"', '"\\', '"a\nb"',
    ' [ { "a" : [true, null, -0, "😀"] } ] \r\n', 'true false', 'nul', '[]', '{}',
    '1'.repeat(64), '1'.repeat(65), '['.repeat(12) + '0' + ']'.repeat(12), '['.repeat(13) + '0' + ']'.repeat(13),
    JSON.stringify({ ['x'.repeat(64)]: 1 }), JSON.stringify({ ['x'.repeat(65)]: 1 }),
  ]
  it.each(vectors)('sync/cooperative outcome and allocation parity: %j', async text => {
    const bytes = Buffer.from(text), syncStats: unknown[] = [], asyncStats: unknown[] = []
    const observer = (stats: unknown[]) => ({ raw: () => () => {}, parsed: (value: unknown) => { stats.push(value) } })
    const sync = parseBoundedPackageJson(bytes, P.jsonBytes, observer(syncStats))
    const async = await parseBoundedPackageJsonCooperative(bytes, P.jsonBytes, observer(asyncStats), new PackageWorkControl())
    expect(async).toEqual(sync); expect(asyncStats).toEqual(syncStats)
    if (sync.ok) {
      expect(syncStats).toEqual([{ canonicalBytes: Buffer.byteLength(JSON.stringify(sync.value)), nodes: countNodes(sync.value) }])
    } else expect(syncStats).toEqual([])
  })
  it('resumes at every lexical transition, including each escape digit and surrogate half', async () => {
    const text = ' {"\\u0078":["\\uD83D\\uDE00",-1.25e+03,true,null,"é\\n"]} '
    const stats: unknown[] = [], work = parsePackageJsonWork(Buffer.from(text), P.jsonBytes, { raw: () => () => {}, parsed: v => { stats.push(v) } })
    let step = work.next(), transitions = 0
    while (!step.done) {
      transitions++
      step.value.batch?.advance({ chars: 1, nodes: 1, steps: 1, entries: 1 })
      await immediate(); step = work.next()
    }
    expect(transitions).toBeGreaterThan(60)
    expect(step.value).toEqual(JSON.parse(text))
    expect(stats).toEqual([{ canonicalBytes: Buffer.byteLength(JSON.stringify(step.value)), nodes: countNodes(step.value) }])
  })
  it.each([Buffer.from([0xef, 0xbb, 0xbf, 0x30]), Buffer.from([0xc0, 0xaf]), Buffer.from([0xed, 0xa0, 0x80])])('rejects invalid bytes before parse: %j', async bytes => {
    const parse = vi.spyOn(JSON, 'parse')
    expect(await parseBoundedPackageJsonCooperative(bytes, P.jsonBytes, undefined, new PackageWorkControl())).toEqual({ ok: false, code: 'PACKAGE_JSON_INVALID' })
    expect(parse).not.toHaveBeenCalled()
  })
  it.each([P.generalStringUnits - 1, P.generalStringUnits, P.generalStringUnits + 1])('retains string boundary %i with internal yields', async length => {
    let yields = 0
    const control = new PackageWorkControl(() => {}, { now: () => 0, yield: async () => { yields++; await immediate() } })
    const bytes = Buffer.from(JSON.stringify('x'.repeat(length)))
    const result = await parseBoundedPackageJsonCooperative(bytes, P.jsonBytes, undefined, control)
    expect(result).toEqual(parseBoundedPackageJson(bytes)); expect(yields).toBeGreaterThan(100)
  })
  it('manifest sync/cooperative fields, order and exact statistics agree', async () => {
    const bytes = await readFile('resources/learning/exercises/manifest.json')
    const a: unknown[] = [], b: unknown[] = []
    const observe = (values: unknown[]) => ({ raw: () => () => {}, parsed: (stats: unknown) => { values.push(stats) } })
    expect(await validatePackageManifestCooperative(bytes, observe(b), new PackageWorkControl())).toEqual(validatePackageManifest(bytes, observe(a)))
    expect(b).toEqual(a)
  })
  it('owner interruption keeps its identity and denial prevents native parse', async () => {
    const reason = Error('deadline'), parse = vi.spyOn(JSON, 'parse')
    let resumes = 0
    const control = new PackageWorkControl(() => { if (resumes >= 2) throw reason }, { now: () => 0, yield: async () => { resumes++; await immediate() } })
    await expect(parseBoundedPackageJsonCooperative(Buffer.from('"' + 'x'.repeat(10000) + '"'), P.jsonBytes, undefined, control))
      .rejects.toMatchObject({ reason })
    expect(parse).not.toHaveBeenCalled()
    const ledger = new PackageResidentBudget(), scope = ledger.scope()
    scope.parsed({ canonicalBytes: P.residentLogicalBytes, nodes: 1 })
    expect(await parseBoundedPackageJsonCooperative(Buffer.from('0'), P.jsonBytes, scope, new PackageWorkControl()))
      .toEqual({ ok: false, code: 'PACKAGE_RESIDENT_LIMIT' })
    expect(parse).not.toHaveBeenCalled(); scope.release()
  })
  it('rechecks lifecycle after exact reservation and before native materialization', async () => {
    let current = true
    const ledger = new PackageResidentBudget(), scope = ledger.scope(), parse = vi.spyOn(JSON, 'parse')
    const control = new PackageWorkControl(() => { if (!current) throw Error('expired after reservation') })
    const allocation = { raw: (bytes: number) => scope.raw(bytes), parsed: (stats: { canonicalBytes: number; nodes: number }) => { scope.parsed(stats); current = false } }
    await expect(parseBoundedPackageJsonCooperative(Buffer.from('[1]'), P.jsonBytes, allocation, control)).rejects.toBeInstanceOf(PackageWorkInterrupted)
    expect(parse).not.toHaveBeenCalled()
    expect(ledger.snapshot()).toEqual({ parsedBytes: 3, nodes: 2, rawBytes: 0 })
    scope.release(); expect(ledger.snapshot().parsedBytes).toBe(0)
  })
})

function countNodes(v: unknown): number {
  if (!v || typeof v !== 'object') return 1
  return 1 + Object.values(v).reduce<number>((n, child) => n + countNodes(child), 0)
}

describe('private shared slice scheduling', () => {
  it.each<[PackageWorkCharge, number]>([[{ chars: 256 }, 32], [{ nodes: 1 }, 512], [{ steps: 1 }, 2048], [{ entries: 1 }, 32]])('bounds a slice by %j', async (charge, maximum) => {
    let yields = 0
    const control = new PackageWorkControl(() => {}, { now: () => 0, yield: async () => { yields++ } })
    for (let i = 0; i < maximum; i++) { const pending = control.checkpoint(charge); if (pending) await pending }
    expect(yields).toBe(0)
    await control.checkpoint(charge)
    expect(yields).toBe(1)
  })
  it('does not reset across ready I/O promises, and yields at the soft deadline', async () => {
    let now = 0, yields = 0, checks = 0
    const control = new PackageWorkControl(() => { checks++ }, { now: () => now, yield: async () => { yields++ } })
    for (let i = 0; i < 63; i++) control.checkpoint({ steps: 1 })
    await Promise.resolve(); now = 6
    await control.checkpoint({ steps: 1 })
    expect(yields).toBe(1); expect(checks).toBeGreaterThanOrEqual(3)
  })
  it('injects cancellation into paused generator allocation owners', async () => {
    const ledger = new PackageResidentBudget(), scope = ledger.scope()
    let invalid = false
    const control = new PackageWorkControl(() => { if (invalid) throw Error('cancel') }, { now: () => 0, yield: async () => { invalid = true } })
    await expect(runPackageWork((function* () {
      try { scope.parsed({ canonicalBytes: 123, nodes: 2 }); yield { barrier: true } }
      catch (error) { scope.release(); throw error }
    })(), control)).rejects.toBeInstanceOf(PackageWorkInterrupted)
    expect(ledger.snapshot()).toEqual({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})

describe('real Registry cooperative ownership and representations', () => {
  it('shutdown resumes a paused startup task, closes the retained reader and never publishes a partial index', async () => {
    const resourcesPath = resolve('resources'), bytes = await readFile('resources/learning/exercises/manifest.json')
    let paused!: () => void, resume!: () => void
    const atPause = new Promise<void>(resolve => { paused = resolve })
    const resumeWork = new Promise<void>(resolve => { resume = resolve })
    const registry = new ExercisePackageRegistry((scope, guard) => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath },
      { version: 7, rawBytes: bytes.length, sha256: rawPackageDigest(bytes) }, scope,
      new PackageWorkControl(() => guard.check(), { now: () => 0, yield: () => { paused(); return resumeWork } })))
    registry.start(); await atPause
    expect(registry.status()).toMatchObject({ state: 'STARTING', declared: 0, rawBytes: bytes.length })
    expect([...registry.ids()]).toEqual([])
    let stopped = false
    const stopping = registry.stop().then(() => { stopped = true })
    await immediate(); expect(stopped).toBe(false)
    expect(registry.status().state).toBe('STOPPING')
    resume(); await stopping
    expect(registry.status()).toMatchObject({ state: 'STOPPED', declared: 0, parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('retains one derived task, rejects overlap, and holds a released parent until its copy settles', async () => {
    const registry = await sourceRegistry(), o = owner(), id = [...registry.ids()][0]
    const lease = await registry.acquirePublic(id, o.context)
    const baseline = registry.status(), task = lease.copyCooperative()
    expect(o.tasks.at(-1)).toBe(task)
    await expect(lease.copyCooperative()).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    expect(() => lease.copy()).toThrow('PACKAGE_BUSY')
    lease.release()
    await expect(registry.acquirePublic(id, owner().context)).rejects.toHaveProperty('code', 'PACKAGE_BUSY')
    const clone = await task
    expect(Object.isFrozen(clone.data.samples.samples)).toBe(true)
    expect(registry.status().parsedBytes).toBeGreaterThan(baseline.parsedBytes)
    clone.release(); clone.release()
    const next = await registry.acquirePublic(id, owner().context); next.release()
    await registry.stop()
    expect(registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('cancellation after clone allocation rolls back only the derived scope', async () => {
    const registry = await sourceRegistry(), o = owner(), id = [...registry.ids()][0]
    const lease = await registry.acquirePublic(id, o.context), baseline = registry.status()
    const clone = structuredClone
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(value => {
      const result = clone(value); registry.invalidate(o.context.owner, o.context.generation); return result
    })
    await expect(lease.copyCooperative()).rejects.toThrow('PACKAGE_CANCELLED')
    expect(registry.status()).toMatchObject({ parsedBytes: baseline.parsedBytes, nodes: baseline.nodes, rawBytes: baseline.rawBytes })
    lease.release(); await registry.stop()
  })
  it('shutdown while a representation is paused waits for pending work and cleanup guard', async () => {
    const registry = await sourceRegistry(), o = owner(), id = [...registry.ids()][0]
    const lease = await registry.acquirePublic(id, o.context)
    o.state.clean = false
    const task = lease.representCooperative(JSON.stringify({ value: 'x'.repeat(100000) }), P.publicDetailBytes, 2)
    const rejection = expect(task).rejects.toThrow('PACKAGE_CANCELLED')
    await Promise.resolve()
    registry.beginShutdown()
    let stopped = false
    const stopping = registry.stop().then(() => { stopped = true })
    await rejection; await immediate()
    expect(stopped).toBe(false)
    expect(() => lease.release()).toThrow('PACKAGE_LEASE_ACTIVE')
    o.state.clean = true; lease.release(); await stopping
    expect(registry.status()).toMatchObject({ state: 'STOPPED', parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('cooperative packets detach allowed public data and retain accounting through handoff', async () => {
    const registry = await sourceRegistry(), o = owner(), id = [...registry.ids()][0]
    const lease = await registry.acquirePublic(id, o.context)
    const packet = await lease.packetCooperative(JSON.stringify(publicExercise(lease.data)), P.publicDetailBytes)
    const before = registry.status()
    lease.release()
    expect(JSON.stringify(packet.data)).not.toMatch(/signatureHash|testSetId|official|sha256|judge/)
    expect(Object.isFrozen(packet.data)).toBe(true)
    packet.release(); expect(registry.status().parsedBytes).toBeLessThan(before.parsedBytes)
    await registry.stop()
  })
})
