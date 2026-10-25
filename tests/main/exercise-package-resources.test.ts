import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { build, isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite'
import { createRequire } from 'node:module'
import { ExerciseResourceRoot, canonicalSignatureBytes, exerciseResourceLocation,
  openAnchoredExerciseResources, rawPackageDigest, type PackageManifestAnchor } from '../../src/main/services/learning/content/exercise-package-resources'
import { exercisePackageAssetsPlugin, exercisePackageRendererBoundary } from '../../src/main/services/learning/content/exercise-package-build'
import type { ExerciseMetadataAsset, ExercisePackageDescriptor, ExercisePackageManifest } from '../../src/main/services/learning/content/exercise-package-contracts'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'

// Configurable facade over real fs functions: deterministic races, real disk and
// real file handles. Native ESM namespace exports themselves cannot be spied on.
vi.mock('node:fs/promises', async () => ({ ...await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises') }))

const temporary: string[] = []
const encoder = (v: unknown) => Buffer.from(JSON.stringify(v))
const kinds = ['metadata', 'samples', 'judge', 'csharp', 'javascript'] as const
const paths = { metadata: 'exercise.json', samples: 'samples.json', judge: 'judge/v1.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of temporary.splice(0)) {
    // Delete only the explicit test-owned temp directory, never arbitrary roots.
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('exercise-package-step2-')) throw new Error('unsafe test cleanup')
    await fs.rm(dir, { recursive: true, force: true })
  }
})
async function fixture(empty = false, packaged = false) {
  const base = await fs.mkdtemp(join(tmpdir(), 'exercise-package-step2-')); temporary.push(base)
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

describe('S2-R1/R3 anchored resources and deterministic digests', () => {
  it('public capability never opens Judge bytes, while official integrity remains fail-closed', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await fs.appendFile(f.target('judge'), ' hidden-corruption')
    const open = vi.spyOn(fs, 'open')
    const result = await resources.readPublicPackage(f.metadata.exerciseId)
    expect(result.data).not.toHaveProperty('judge')
    expect(open.mock.calls.some(args => String(args[0]).endsWith('v1.json'))).toBe(false)
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
  })
  it('has a fixed signature v1 byte vector and independent SHA-256 vector', () => {
    const s = { version: 1, hash: 'ignored', functionName: 'Solve', parameters: [{ name: 'value', type: 'int32' as const }], returnType: 'int32' as const }
    const expected = '{"version":1,"functionName":"Solve","parameters":[{"name":"value","type":"int32"}],"returnType":"int32"}'
    expect(canonicalSignatureBytes(s).toString()).toBe(expected)
    expect(rawPackageDigest(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(rawPackageDigest(canonicalSignatureBytes({ ...s, hash: 'changed' }))).toBe(createHash('sha256').update(expected, 'utf8').digest('hex'))
    expect(canonicalSignatureBytes({ ...s, functionName: 'Different' })).not.toEqual(canonicalSignatureBytes(s))
    const pair = { ...s, parameters: [...s.parameters, { name: 'next', type: 'int32' as const }] }
    expect(canonicalSignatureBytes(pair)).not.toEqual(canonicalSignatureBytes({ ...pair, parameters: [...pair.parameters].reverse() }))
  })
  it.each([false, true])('verifies raw bytes and schema for packaged=%s (directory fixture only)', async packaged => {
    const f = await fixture(false, packaged), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    expect((await resources.readPackage(f.metadata.exerciseId)).data.judge.cases).toHaveLength(2)
    expect(Object.isFrozen(resources.manifest)).toBe(true)
    await expect(resources.readPackage('../escape')).rejects.toMatchObject({ code: 'PACKAGE_PATH_INVALID' })
  })
  it('does not fall back to an available alternate root', async () => {
    const f = await fixture(true)
    await expect(openAnchoredExerciseResources({ ...f.environment, packaged: true }, f.anchor)).rejects.toMatchObject({ code: 'PACKAGE_ROOT_INVALID' })
    await fs.unlink(join(f.root, 'manifest.json'))
    await expect(openAnchoredExerciseResources(f.environment, f.anchor)).rejects.toMatchObject({ code: 'PACKAGE_ASSET_MISSING' })
  })
  it('rejects modified manifest bytes even if still valid JSON; no adjacent-hash trust', async () => {
    const f = await fixture(true)
    await fs.writeFile(join(f.root, 'manifest.json'), Buffer.from(encoder(f.manifest).toString().replace('"version":1', '"version":2')))
    await expect(openAnchoredExerciseResources(f.environment, f.anchor)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
    await expect(openAnchoredExerciseResources(f.environment, undefined as unknown as PackageManifestAnchor)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
  })
  it.each(['length', 'digest', 'missing', 'oversize'])('rejects %s before package schema use', async mutation => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor), file = f.target('judge')
    if (mutation === 'length') await fs.appendFile(file, ' ')
    if (mutation === 'digest') { const changed = Buffer.from(f.assets.judge); changed[10] ^= 1; await fs.writeFile(file, changed) }
    if (mutation === 'missing') await fs.unlink(file)
    if (mutation === 'oversize') await fs.writeFile(file, Buffer.alloc(P.judgeBytes + 1))
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: mutation === 'missing' ? 'PACKAGE_ASSET_MISSING' : mutation === 'oversize' ? 'PACKAGE_ASSET_LIMIT' : 'PACKAGE_INTEGRITY_FAILED' })
  })
  it.each(['json', 'utf8', 'schema', 'signature', 'official'])('rejects integrity-matching but invalid %s data', async mutation => {
    const f = await fixture()
    let b: Buffer
    if (mutation === 'json') b = Buffer.from('{"broken":')
    else if (mutation === 'utf8') b = Buffer.from([0xff])
    else {
      if (mutation === 'schema') Object.assign(f.metadata, { schemaVersion: 2 })
      if (mutation === 'signature') f.metadata.signature.hash = 'b'.repeat(64)
      if (mutation === 'official') f.metadata.official.hash = 'b'.repeat(64)
      b = encoder(f.metadata)
    }
    await fs.writeFile(f.target('metadata'), b)
    f.descriptor.assets.metadata.bytes = b.byteLength; f.descriptor.assets.metadata.sha256 = rawPackageDigest(b)
    const resources = await openAnchoredExerciseResources(f.environment, await f.writeManifest())
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toHaveProperty('code')
  })
  it('verifies the actual canonical signature digest even when all declared links agree', async () => {
    const f = await fixture(), wrong = 'b'.repeat(64)
    const samples = JSON.parse(f.assets.samples.toString()), judge = JSON.parse(f.assets.judge.toString())
    samples.signatureHash = wrong; judge.signatureHash = wrong; f.metadata.signature.hash = wrong
    f.assets.samples = encoder(samples); f.assets.judge = encoder(judge)
    f.metadata.official.hash = rawPackageDigest(f.assets.judge); f.assets.metadata = encoder(f.metadata)
    for (const kind of ['metadata', 'samples', 'judge'] as const) {
      await fs.writeFile(f.target(kind), f.assets[kind])
      f.descriptor.assets[kind].bytes = f.assets[kind].byteLength; f.descriptor.assets[kind].sha256 = rawPackageDigest(f.assets[kind])
    }
    const resources = await openAnchoredExerciseResources(f.environment, await f.writeManifest())
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
  })
})

describe('S2-R2 filesystem boundary and identity observations (not absolute TOCTOU)', () => {
  it('rejects linked asset root and linked package parents', async () => {
    const f = await fixture(), outside = join(f.base, 'outside')
    await fs.rename(f.root, outside); await fs.symlink(outside, f.root, 'junction')
    await expect(openAnchoredExerciseResources(f.environment, f.anchor)).rejects.toMatchObject({ code: 'PACKAGE_ROOT_INVALID' })
    await fs.unlink(f.root); await fs.rename(outside, f.root)
    const resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await fs.rename(join(f.root, f.metadata.exerciseId), outside)
    await fs.symlink(outside, join(f.root, f.metadata.exerciseId), 'junction')
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toHaveProperty('code')
  })
  it('rejects hardlinked asset files', async () => {
    const f = await fixture()
    await fs.link(f.target('judge'), join(f.base, 'hardlink.json'))
    const resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_PATH_INVALID' })
  })
  it('rejects file symlinks when the host permits creating them', async ({ skip }) => {
    const f = await fixture(), original = join(f.base, 'original-judge.json')
    await fs.rename(f.target('judge'), original)
    try { await fs.symlink(original, f.target('judge'), 'file') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { skip('File symlink permission unavailable; UNVERIFIED on this host'); return }
      throw error
    }
    const resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toHaveProperty('code')
  })
  it('rejects directories in place of files and unsafe root components', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await fs.unlink(f.target('judge')); await fs.mkdir(f.target('judge'))
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_PATH_INVALID' })
    for (const p of ['..', 'C:', 'NUL', 'CON.txt', 'name.', 'x:y', '/absolute']) {
      await expect(ExerciseResourceRoot.open(f.base, [p])).rejects.toMatchObject({ code: 'PACKAGE_ROOT_INVALID' })
    }
  })
  it('fails closed when file identity or read authority cannot be verified', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    vi.spyOn(fs, 'open').mockRejectedValueOnce(Object.assign(new Error('unsafe native path'), { code: 'EACCES' }))
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_READ_FAILED' })
    vi.restoreAllMocks()
    const original = fs.lstat
    vi.spyOn(fs, 'lstat').mockImplementationOnce(async (...args) => {
      const stat = await original(...args)
      Object.defineProperty(stat, 'ino', { value: 0n })
      return stat
    })
    await expect(ExerciseResourceRoot.open(f.environment.mainOutput, ['resources', 'learning', 'exercises'])).rejects.toMatchObject({ code: 'PACKAGE_ROOT_INVALID' })
  })
  it('rejects unlisted runtime package files without returning their contents', async () => {
    const f = await fixture()
    await fs.writeFile(join(f.root, f.metadata.exerciseId, 'reference.js'), 'DO_NOT_EXPOSE')
    const resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_UNEXPECTED_ASSET' })
  })
  it('detects mutation between lstat and handle observation and sanitizes failure', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    const original = fs.open
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const handle = await original(...args)
      await fs.appendFile(f.target('metadata'), ' hidden-secret-marker')
      return handle
    })
    try { await resources.readPackage(f.metadata.exerciseId); expect.fail('mutation accepted') }
    catch (error) {
      expect(error).toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
      expect(String(error)).not.toContain('hidden-secret-marker'); expect(String(error)).not.toContain(f.root)
    }
  })
  it('detects truncation during a read, retains no partial result and closes the handle', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor)
    const original = fs.open
    let closed = false
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const handle = await original(...args), close = handle.close.bind(handle)
      handle.close = async () => { closed = true; return close() }
      const read = handle.read.bind(handle)
      Object.defineProperty(handle, 'read', { value: async (buffer: Buffer, offset: number, length: number, position: number) => {
        await fs.truncate(f.target('metadata'), 0)
        return read(buffer, offset, length, position)
      } })
      return handle
    })
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
    expect(closed).toBe(true)
  })
  it('detects growth during the actual read with an EOF probe', async () => {
    const f = await fixture(), resources = await openAnchoredExerciseResources(f.environment, f.anchor), original = fs.open
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const handle = await original(...args), read = handle.read.bind(handle)
      let changed = false
      Object.defineProperty(handle, 'read', { value: async (buffer: Buffer, offset: number, length: number, position: number) => {
        const result = await read(buffer, offset, length, position)
        if (!changed) { changed = true; await fs.appendFile(f.target('metadata'), 'x') }
        return result
      } })
      return handle
    })
    await expect(resources.readPackage(f.metadata.exerciseId)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
  })
})

describe('S2-R4 actual Rollup build integration with fixture-only packages', () => {
  it('denies Renderer dev-server file access to private source/emitted trees and preserves secret denials', async () => {
    const f = await fixture()
    const config = await resolveConfig({ configFile: false, root: f.base,
      plugins: [exercisePackageRendererBoundary()], server: { fs: { allow: [f.base] } } }, 'serve')
    for (const file of [f.target('judge'), join(f.base, 'resources', 'learning', 'exercises', 'manifest.json'), join(f.base, '.env')]) {
      expect(isFileLoadingAllowed(config, normalizePath(file))).toBe(false)
    }
    expect(isFileLoadingAllowed(config, normalizePath(join(f.base, 'public.json')))).toBe(true)
  })
  async function fixtureBuild(f: Awaited<ReturnType<typeof fixture>>) {
    const configBase = join(f.base, 'build-source'), source = join(configBase, 'resources', 'learning', 'exercises')
    await fs.mkdir(dirname(source), { recursive: true }); await fs.cp(f.root, source, { recursive: true })
    const entry = join(f.base, 'entry.js'), out = join(f.base, 'compiled', 'main')
    await fs.writeFile(entry, 'import anchor from "virtual:exercise-package-anchor"; export {anchor};')
    const run = () => build({ configFile: false, logLevel: 'silent', plugins: [exercisePackageAssetsPlugin(configBase)],
      build: { outDir: out, emptyOutDir: true, lib: { entry, formats: ['cjs'], fileName: () => 'anchor.cjs' } } })
    return { run, source, out }
  }
  it.each([true, false])('emits exact Main-only bytes and a compiled anchor (empty=%s)', async empty => {
    const f = await fixture(empty), b = await fixtureBuild(f); await b.run()
    const emittedRoot = join(b.out, 'resources', 'learning', 'exercises')
    expect(await fs.readFile(join(emittedRoot, 'manifest.json'))).toEqual(encoder(f.manifest))
    const compiled = createRequire(import.meta.url)(join(b.out, 'anchor.cjs')) as { anchor: PackageManifestAnchor }
    expect(compiled.anchor).toEqual(f.anchor)
    const resources = await openAnchoredExerciseResources({ packaged: false, mainOutput: b.out, resourcesPath: '' }, compiled.anchor)
    expect(resources.manifest.packages).toHaveLength(empty ? 0 : 1)
    if (!empty) expect((await resources.readPackage(f.metadata.exerciseId)).bytes.judge).toEqual(f.assets.judge)
    await fs.appendFile(join(emittedRoot, 'manifest.json'), ' ')
    await expect(openAnchoredExerciseResources({ packaged: false, mainOutput: b.out, resourcesPath: '' }, compiled.anchor)).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY_FAILED' })
  })
  it.each(['missing', 'corrupt', 'extra'])('fails the build for %s declared/extra assets', async fault => {
    const f = await fixture(), b = await fixtureBuild(f), target = join(b.source, f.metadata.exerciseId, 'judge', 'v1.json')
    if (fault === 'missing') await fs.unlink(target)
    if (fault === 'corrupt') await fs.appendFile(target, ' ')
    if (fault === 'extra') await fs.writeFile(join(b.source, f.metadata.exerciseId, 'reference.js'), 'MUST_NOT_SHIP')
    await expect(b.run()).rejects.toThrow(/PACKAGE_/)
  })
  it('fails build for absent bootstrap and permits no source fallback', async () => {
    const f = await fixture(true), b = await fixtureBuild(f)
    await fs.unlink(join(b.source, 'manifest.json'))
    await expect(b.run()).rejects.toThrow(/PACKAGE_ASSET_MISSING/)
  })
})
