import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, normalizePath } from 'vite'
import * as fs from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { stagePilot, compareStaging, jsonStatistics, BASELINE } from '../../scripts/learning-official-tests/pilot-staging'
import { freezePilot, digest, frozenBytes } from '../../scripts/learning-official-tests/pilot-freeze'
import { oracle } from '../../scripts/learning-official-tests/oracles'
import { domain } from '../../scripts/learning-official-tests/domains'
import { IDS } from '../../scripts/learning-official-tests/model'
import { evidenceRoot } from '../../scripts/learning-official-tests/references'
import { verifyRows } from '../../scripts/learning-official-tests/verify'
import * as catalog from '../../scripts/learning-official-tests/pilot-mutants'
import { exercisePackageRendererBoundary } from '../../src/main/services/learning/content/exercise-package-build'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { validateExercisePackageAssets, validateExercisePackageAssetsCooperative } from '../../src/main/services/learning/content/exercise-package-validation'
import { PackageWorkControl } from '../../src/main/services/learning/content/exercise-package-work'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import type { ExercisePackageAssetBytes, PublicPackageManifest } from '../../src/main/services/learning/content/exercise-package-contracts'

describe('E2-S3 actual frozen pilot staging and integrity', () => {
  let first: Extract<Awaited<ReturnType<typeof stagePilot>>, { status: 'PASS_WITH_LIMITATIONS' }>
  let second: typeof first
  let reproduction: Awaited<ReturnType<typeof compareStaging>>
  let source: ExerciseResourceRoot
  let staged: ExerciseResourceRoot
  let manifest: PublicPackageManifest
  let compiledBefore: string | null
  const compiledDigest = async () => {
    try { return digest(await fs.readFile(resolve('out/main/index.js'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  beforeAll(async () => {
    compiledBefore = await compiledDigest()
    const a = await stagePilot(resolve('.'), 20261024)
    if (a.status !== 'PASS_WITH_LIMITATIONS') throw new Error(JSON.stringify(a))
    first = a
    const b = await stagePilot(resolve('.'), 20261024)
    if (b.status !== 'PASS_WITH_LIMITATIONS') throw new Error(JSON.stringify(b))
    second = b; reproduction = await compareStaging(first.rootPath, second.rootPath)
    source = await ExerciseResourceRoot.open(resolve('.'), ['resources', 'learning', 'exercises'])
    staged = await ExerciseResourceRoot.open(first.rootPath, ['resources', 'learning', 'exercises'])
    manifest = (await staged.manifest(first.manifest)).manifest as PublicPackageManifest
    await fs.writeFile(join(await evidenceRoot(resolve('.')), 's3-test-evidence.json'), frozenBytes({ first: first.rootPath, second: second.rootPath, reproduction }))
  }, 300_000)

  it.each(IDS)('%s: full schema, precise public prefix, C#/JS/oracle readback, coverage and budgets', async id => {
    const { data, bytes } = await staged.package(manifest, id)
    const src = await source.publicPackage((await source.manifest()).manifest, id)
    expect(data.judge.cases.slice(0, 2).map(c => ({ id: c.id, args: c.args, expected: c.expected }))).toEqual(src.data.samples.samples)
    expect(data.judge.cases.slice(0, 2).every(c => c.visibility === 'public' && c.id === c.sampleId)).toBe(true)
    expect(data.judge.cases.slice(2).every(c => c.visibility === 'hidden' && !Object.hasOwn(c, 'sampleId'))).toBe(true)
    for (const c of data.judge.cases) { expect(() => domain(id, c.args)).not.toThrow(); expect(oracle(id, c.args)).toEqual(c.expected) }
    expect(validateExercisePackageAssets(bytes).ok).toBe(true)
    expect(await validateExercisePackageAssetsCooperative(bytes, undefined, new PackageWorkControl())).toEqual(validateExercisePackageAssets(bytes))
    const proof = first.results.find(r => r.exercise === id)!
    expect(proof.critical.killed + proof.critical.pending.length).toBe(proof.critical.total)
    expect(proof.broader.score).toBe(1)
    expect(proof.cases.slice(2).every(c => c.soleWitnessFor.length > 0)).toBe(true)
    expect(proof.wire.runtime60s).toBe('UNVERIFIED')
    expect(proof.judge.nodes).toBeLessThan(200000)
    expect(proof.judge.rawBytes).toBe(bytes.judge.length)
    expect(publicExercise(data)).toEqual(publicExercise(src.data))
    expect(Object.hasOwn(publicExercise(data), 'official')).toBe(false)
  })
  it('regenerates byte-identical assets and deterministic evidence from two clean roots', () => {
    expect(first.rootPath).not.toBe(second.rootPath)
    expect(reproduction.byteIdentical).toBe(true)
    expect(reproduction.files).toBeGreaterThan(262)
    expect(manifest.packages).toHaveLength(63)
    expect(manifest.packages.filter(p => p.profile === 'full')).toHaveLength(9)
    expect(manifest.packages.filter(p => p.profile === 'public-only')).toHaveLength(54)
    expect(first.results.flatMap(r => r.critical.pending)).toHaveLength(2)
    expect(first.ledger.afterShutdown).toEqual({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
    for (const r of first.ledger.measured) {
      expect(r.registeredClone.parsedBytes).toBeGreaterThan(r.resident.parsedBytes)
      expect(r.withRepresentation.parsedBytes).toBeGreaterThan(r.registeredClone.parsedBytes)
      expect(r.withRepresentation.parsedBytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    }
  })
  it('does not change production manifest/compiled anchor or introduce reference data in packages', async () => {
    expect(digest(await fs.readFile(resolve('resources/learning/exercises/manifest.json')))).toBe(BASELINE)
    expect(await compiledDigest()).toBe(compiledBefore)
    for (const p of manifest.packages) {
      const publicData = await staged.publicPackage(manifest, p.exerciseId)
      const json = JSON.stringify(publicExercise(publicData.data))
      expect(json).not.toContain('hidden-001')
      expect(json).not.toContain('E2-PILOT-REFERENCE-ONLY')
      expect(json).not.toContain('testSetId')
      expect(Object.keys(p.assets).sort()).toEqual(p.profile === 'full' ? ['csharp', 'javascript', 'judge', 'metadata', 'samples'] : ['csharp', 'javascript', 'metadata', 'samples'])
    }
  })

  it.each(['duplicate-id', 'prefix-order', 'missing-sampleId', 'hidden-sampleId', 'wrong-signature', 'wrong-version', 'unknown-reference-field', 'malformed-expected'])(
    'rejects malformed candidate %s with shared sync/cooperative semantics', async mutation => {
      const { bytes } = await staged.package(manifest, 'ch2-04'), assets = { ...bytes }
      const judge = JSON.parse(Buffer.from(bytes.judge).toString('utf8'))
      switch (mutation) {
        case 'duplicate-id': judge.cases[2].id = judge.cases[0].id; break
        case 'prefix-order': [judge.cases[0], judge.cases[1]] = [judge.cases[1], judge.cases[0]]; break
        case 'missing-sampleId': delete judge.cases[0].sampleId; break
        case 'hidden-sampleId': judge.cases[2].sampleId = null; break
        case 'wrong-signature': judge.signatureHash = '0'.repeat(64); break
        case 'wrong-version': judge.version = 0; break
        case 'unknown-reference-field': judge.referenceSolution = 'DO-NOT-LEAK'; break
        case 'malformed-expected': judge.cases[2].expected = 'not-an-int-array'; break
      }
      assets.judge = frozenBytes(judge)
      const a = validateExercisePackageAssets(assets)
      expect(a.ok).toBe(false)
      expect(await validateExercisePackageAssetsCooperative(assets, undefined, new PackageWorkControl())).toEqual(a)
    })
  it('rejects whole-asset node overflow despite valid per-case max matrices', async () => {
    const { bytes } = await staged.package(manifest, 'ch8-08'), judge = JSON.parse(Buffer.from(bytes.judge).toString('utf8'))
    const matrix = Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => r * 50 + (r % 2 ? 49 - c : c)))
    judge.cases = [...judge.cases.slice(0, 2), ...Array.from({ length: 126 }, (_, i) => ({ id: 'large-' + i, visibility: 'hidden', args: [matrix], expected: 2500 }))]
    // Compact encoding isolates node count from the separate raw-byte ceiling.
    const raw = Buffer.from(JSON.stringify(judge))
    expect(raw.length).toBeLessThan(4 * 1024 * 1024)
    expect(validateExercisePackageAssets({ ...bytes, judge: raw })).toEqual({ ok: false, code: 'PACKAGE_STRUCTURE_LIMIT' })
  })
  it('quarantines a wrong Expected/oracle or invalid domain before returning a frozen candidate', async () => {
    const { data } = await source.publicPackage((await source.manifest()).manifest, 'ch2-04')
    const p = { reference: async (_: 'csharp' | 'javascript', args: unknown[][]) => args.map(a => oracle('ch2-04', a)), oracle: (a: unknown[]) => oracle('ch2-04', a) }
    await expect(freezePilot('ch2-04', data, { ...p, oracle: () => [0, 0] }, { seed: 1 })).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
    const broken = structuredClone(data); broken.samples.samples[0].args = [1, 0]
    await expect(freezePilot('ch2-04', broken, p, { seed: 1 })).rejects.toThrow('DOMAIN')
    const expected = structuredClone(data); expected.samples.samples[0].expected = [99, 99]
    await expect(freezePilot('ch2-04', expected, p, { seed: 1 })).rejects.toThrow('PUBLIC_EXPECTED_DISAGREEMENT')
  })
  it('independent checking rejects a typed but mathematically wrong hidden Expected that schema accepts', async () => {
    const { data, bytes } = await staged.package(manifest, 'ch2-04'), judge = structuredClone(data.judge)
    ;(judge.cases[2].expected as number[])[0]++
    expect(validateExercisePackageAssets({ ...bytes, judge: frozenBytes(judge) }).ok).toBe(true)
    const rows = judge.cases.map((c, i) => ({ key: c.id, source: i < 2 ? 'public' as const : 'curated' as const, args: c.args, obligations: [] }))
    await expect(verifyRows('ch2-04', rows, { reference: async (_, args) => args.map(a => oracle('ch2-04', a)), oracle: a => oracle('ch2-04', a) },
      { expectedClaims: judge.cases.map(c => c.expected) })).rejects.toThrow('EXPECTED_DISAGREEMENT')
  })
  it('quarantines an injected surviving critical mutant without dropping it from denominator', async () => {
    const { data } = await source.publicPackage((await source.manifest()).manifest, 'ch2-04')
    const actual = catalog.pilotMutants('ch2-04')
    const spy = vi.spyOn(catalog, 'pilotMutants').mockReturnValue([...actual, { name: 'surviving-critical', tier: 'critical', kind: 'value', obligations: ['D1'], rationale: 'fault injection, not an exclusion', run: (_, e) => e }])
    try {
      await expect(freezePilot('ch2-04', data, { reference: async (_, args) => args.map(a => oracle('ch2-04', a)), oracle: a => oracle('ch2-04', a) }, { seed: 1 })).rejects.toThrow('MUTANT_QUARANTINE')
    } finally { spy.mockRestore() }
  })
  it('actual staged Judge files remain blocked on canonical and encoded Renderer /@fs routes', async () => {
    const server = await createServer({ configFile: false, root: resolve('.'), logLevel: 'silent', plugins: [exercisePackageRendererBoundary()],
      optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } } })
    try {
      await server.listen(); const a = server.httpServer!.address(); if (!a || typeof a === 'string') throw new Error('address')
      const file = normalizePath(join(first.rootPath, 'resources/learning/exercises/ch8-08/judge/v1.json'))
      for (const path of [file, file.replace('official-tests', '%256f' + 'fficial-tests'), file.replaceAll('/', '%2f')]) {
        expect(decodeURIComponent(decodeURIComponent(path))).toBe(file)
        const response = await fetch(`http://127.0.0.1:${a.port}/@fs/` + path)
        expect(response.status).toBe(403)
        expect(await response.text()).not.toContain('hidden-001')
      }
    } finally { await server.close() }
  })
  it('reader rejects stale anchor, bad raw hash, path/version and recomputed bad signature', async () => {
    await expect(staged.manifest({ ...first.manifest, sha256: '0'.repeat(64) })).rejects.toThrow('PACKAGE_INTEGRITY_FAILED')
    const { bytes } = await staged.package(manifest, 'ch2-04')
    const base = await evidenceRoot(resolve('.'))
    for (const fault of ['raw-hash', 'version-path', 'canonical-signature']) {
      const root = await fs.mkdtemp(join(base, 'e2-s3-negative-')), exercise = 'ch2-04', assets: ExercisePackageAssetBytes = { ...bytes }
      const descriptor = structuredClone(manifest.packages.find(p => p.exerciseId === exercise)!)
      const m = JSON.parse(Buffer.from(assets.metadata).toString('utf8')), j = JSON.parse(Buffer.from(assets.judge).toString('utf8'))
      if (fault === 'version-path') { m.official.version = 2; j.version = 2 }
      if (fault === 'canonical-signature') {
        m.signature.hash = '0'.repeat(64); j.signatureHash = m.signature.hash
        const s = JSON.parse(Buffer.from(assets.samples).toString('utf8')); s.signatureHash = m.signature.hash; assets.samples = frozenBytes(s)
      }
      if (fault !== 'raw-hash') { assets.judge = frozenBytes(j); m.official.hash = digest(assets.judge); assets.metadata = frozenBytes(m) }
      for (const [kind, raw] of Object.entries(assets)) {
        const d = descriptor.assets[kind as keyof typeof descriptor.assets]!
        if (fault !== 'raw-hash') { d.bytes = raw.length; d.sha256 = digest(raw) }
        const target = join(root, exercise, d.path); await fs.mkdir(resolve(target, '..'), { recursive: true })
        const corrupted = Buffer.from(raw)
        if (fault === 'raw-hash' && kind === 'judge') corrupted[corrupted.length - 1] = 32 // Same length, valid JSON whitespace, different raw digest.
        await fs.writeFile(target, corrupted)
      }
      const rawManifest = frozenBytes({ schemaVersion: 2, policyVersion: 2, version: 3, packages: [descriptor] })
      await fs.writeFile(join(root, 'manifest.json'), rawManifest)
      const opened = await ExerciseResourceRoot.open(root, []), parsed = await opened.manifest()
      await expect(opened.package(parsed.manifest, exercise)).rejects.toThrow('PACKAGE_INTEGRITY_FAILED')
    }
  })
  it('shared scanner reports canonical statistics for the complete Judge', async () => {
    const { bytes } = await staged.package(manifest, 'ch5-07'), stats = jsonStatistics(bytes.judge)
    expect(stats.properties).toBeGreaterThan(20)
    expect(stats.maximumObjectProperties).toBeLessThanOrEqual(32)
    expect(stats.maximumDepth).toBeLessThanOrEqual(12)
    expect(stats.canonicalBytes).toBeLessThan(stats.rawBytes)
  })
  it('uses only ten explicitly reviewed C# source inputs, independent of adjacent obj/Debug artifacts', async () => {
    const project = await fs.readFile(resolve('scripts/learning-official-tests/references/Pilot.csproj'), 'utf8')
    expect(project).toContain('<EnableDefaultCompileItems>false</EnableDefaultCompileItems>')
    expect([...project.matchAll(/<Compile Include="([^"]+)"/g)].map(m => m[1])).toEqual(['Program.cs', ...IDS.map(id => id + '/Solution.cs')])
  })
})
