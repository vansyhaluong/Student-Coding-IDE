import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { ExerciseResourceRoot, openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { exercisePackageAssetsPlugin } from '../../src/main/services/learning/content/exercise-package-build'
const PILOT_RELEASE={version:4,rawBytes:59741,sha256:'dab51425d8f0e3cdc8ced4cec32e6bba8048d376a9669203111a8629138d2482'}
const dirs: string[] = []
afterEach(async () => {
  for (const p of dirs.splice(0)) {
    if (dirname(resolve(p)) !== resolve(tmpdir()) || !basename(p).startsWith('promoted-integrity-')) throw Error('Unsafe cleanup')
    await fs.rm(p, { recursive: true, force: true })
  }
})
async function fixture() {
  const repo = await fs.mkdtemp(join(tmpdir(), 'promoted-integrity-')); dirs.push(repo)
  const root = join(repo, 'resources/learning/exercises')
  await fs.cp(resolve('resources/learning/exercises'), root, { recursive: true })
  const bytes = await fs.readFile(join(root,'manifest.json'))
  return { repo, root, anchor: { version: JSON.parse(bytes.toString()).version, rawBytes: bytes.length, sha256: rawPackageDigest(bytes) } }
}
describe('Wave B promoted bytes fail closed without public fallback', () => {
  it.each(['missing', 'corrupt'] as const)('rejects %s Official asset in private read and normal resource build', async fault => {
    const f = await fixture(), file = join(f.root, 'ch5-08/judge/v1.json')
    if (fault === 'missing') await fs.unlink(file); else await fs.appendFile(file, ' ')
    const reader = await openAnchoredExerciseResources({ packaged: true, resourcesPath: join(f.repo, 'resources'), mainOutput: '' }, f.anchor)
    const pub = await reader.readPublicPackage('ch5-08')
    expect(pub.data).not.toHaveProperty('judge'); expect(pub.data.samples.samples).toHaveLength(2)
    await expect(reader.readPackage('ch5-08')).rejects.toHaveProperty('code')
    const entry = join(f.repo, 'entry.js'); await fs.writeFile(entry, 'import a from "virtual:exercise-package-anchor"; export default a;')
    await expect(build({ configFile: false, logLevel: 'silent', plugins: [exercisePackageAssetsPlugin(f.repo)],
      build: { write: false, lib: { entry, formats: ['cjs'] } } })).rejects.toThrow(/PACKAGE_/)
  }, 30000)
  it('rejects old compiled anchor against new manifest, and vice versa', async () => {
    const root = await ExerciseResourceRoot.open(resolve('.'), ['resources', 'learning', 'exercises'])
    await expect(root.manifest(PILOT_RELEASE)).rejects.toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
    await expect(root.manifest({ ...PILOT_RELEASE, version: 2 })).rejects.toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
    await expect(root.manifest({ version: 2, rawBytes: 54137, sha256: '97ec50d939d36f31dcf07bd77d03b0225ffc06f1bd233633da7b5caee2ddf80b' })).rejects.toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
  })
  it.each(['hash', 'version', 'signature'] as const)('rejects internally rehashed metadata %s disagreement', async fault => {
    const f = await fixture(), manifest = JSON.parse(await fs.readFile(join(f.root, 'manifest.json'), 'utf8'))
    const metaPath = join(f.root, 'ch5-08/exercise.json'), meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    if (fault === 'hash') meta.official.hash = 'b'.repeat(64)
    if (fault === 'version') meta.official.version++
    if (fault === 'signature') meta.signature.hash = 'b'.repeat(64)
    const raw = Buffer.from(JSON.stringify(meta)); await fs.writeFile(metaPath, raw)
    const d = manifest.packages.find((p: { exerciseId: string }) => p.exerciseId === 'ch5-08')
    d.assets.metadata.bytes = raw.length; d.assets.metadata.sha256 = rawPackageDigest(raw)
    const bytes = Buffer.from(JSON.stringify(manifest)); await fs.writeFile(join(f.root, 'manifest.json'), bytes)
    const reader = await openAnchoredExerciseResources({ packaged: true, resourcesPath: join(f.repo, 'resources'), mainOutput: '' },
      { version: manifest.version, rawBytes: bytes.length, sha256: rawPackageDigest(bytes) })
    await expect(reader.readPackage('ch5-08')).rejects.toHaveProperty('code')
  }, 30000)
})
