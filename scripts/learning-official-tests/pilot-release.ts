// E2-S5 developer-only release driver. Copies accepted bytes; never authors cases.
import * as fs from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { ExerciseResourceRoot, rawPackageDigest, type PackageManifestAnchor } from '../../src/main/services/learning/content/exercise-package-resources'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import { demand, IDS, same } from './model'

export const PILOT_BASELINE = '97ec50d939d36f31dcf07bd77d03b0225ffc06f1bd233633da7b5caee2ddf80b'
export const PILOT_RELEASE: PackageManifestAnchor = Object.freeze({ version: 3, rawBytes: 55671, sha256: 'fe5fd520835b8e8928da185bd388b4a07d554a2a31c3dd1e77ce05bfb8435dc7' })
const treeHash = 'afbe336f6cfdbaa0fd79e7ebd8725f10a40d4b4666f3ecac1d9a6b480bfca9af'
const suffix = ['resources', 'learning', 'exercises']
const encoded = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2) + '\n')
async function json(file: string) { return JSON.parse(await fs.readFile(file, 'utf8')) }
function contained(base: string, target: string) {
  const rel = relative(resolve(base), resolve(target))
  demand(!!rel && !rel.startsWith('..') && !resolve(target).startsWith('\\\\') && !rel.includes(':'), 'RELEASE_PATH')
}
async function inspect(rootPath: string, anchor?: PackageManifestAnchor) {
  const root = await ExerciseResourceRoot.open(rootPath, suffix), loaded = await root.manifest(anchor)
  await root.exactDirectory([], ['manifest.json', ...loaded.manifest.packages.map(p => p.exerciseId)])
  const full = [], projections = new Map<string, unknown>()
  for (const d of loaded.manifest.packages) {
    const isFull = !('profile' in d) || d.profile === 'full'
    const p = isFull ? await root.package(loaded.manifest, d.exerciseId) : await root.publicPackage(loaded.manifest, d.exerciseId)
    if (isFull) full.push(d.exerciseId)
    projections.set(d.exerciseId, publicExercise(p.data))
  }
  return { root, ...loaded, full, projections }
}
export async function preparePilotRelease(repo: string) {
  repo = resolve(repo)
  const evidence = join(repo, 'out', 'official-tests'), accepted = join(evidence, 'e2-s3-hRjMzc')
  const inventory = await json(join(evidence, 'e2-s3-evidence-VSpHnc', 'reproducibility.json'))
  const hashes = inventory.reproduction.fileHashes as Record<string, string>
  demand(Object.keys(hashes).length === 274 && rawPackageDigest(encoded(hashes)) === treeHash, 'ACCEPTED_INVENTORY')
  for (const root of [accepted, join(evidence, 'e2-s3-Tq7kmR')]) {
    for (const [rel, hash] of Object.entries(hashes)) {
      const file = resolve(root, rel); contained(root, file)
      demand(rawPackageDigest(await fs.readFile(file)) === hash, 'ACCEPTED_ARTIFACT_CHANGED')
    }
  }
  const baseline = await inspect(repo)
  demand(baseline.anchor.sha256 === PILOT_BASELINE && baseline.manifest.version === 2 && baseline.full.length === 0, 'BASELINE_CHANGED')
  const candidate = await inspect(accepted, PILOT_RELEASE)
  demand(same(candidate.full, [...IDS]) && candidate.manifest.packages.length === 63, 'PROFILE_INVENTORY')
  for (const d of baseline.manifest.packages) {
    demand(same(baseline.projections.get(d.exerciseId), candidate.projections.get(d.exerciseId)), 'PUBLIC_DRIFT')
    const next = candidate.manifest.packages.find(p => p.exerciseId === d.exerciseId)!
    if (!(IDS as readonly string[]).includes(d.exerciseId)) demand(same(d, next), 'NONPILOT_DRIFT')
    for (const kind of ['samples', 'csharp', 'javascript'] as const) demand(same(d.assets[kind], next.assets[kind]), 'PUBLIC_ASSET_DRIFT')
  }
  const proof = await json(join(accepted, 'evidence/candidate-report.json'))
  for (const [rel, hash] of Object.entries(proof.sourceHashes)) demand(rawPackageDigest(await fs.readFile(join(repo, 'scripts/learning-official-tests', rel))) === hash, 'SOURCE_CHANGED')
  const work = await fs.mkdtemp(join(evidence, 'e2-s5-release-'))
  contained(evidence, work)
  await fs.mkdir(join(work, 'resources', 'learning'), { recursive: true })
  // Only declared, already verified resources. No proof, reference or anchor copy.
  await fs.cp(join(accepted, ...suffix), join(work, ...suffix), { recursive: true, errorOnExist: true, force: false })
  await inspect(work, PILOT_RELEASE)
  await fs.writeFile(join(work, 'PREPARED.json'), encoded({ baseline: PILOT_BASELINE, release: PILOT_RELEASE, sets: IDS, candidateCases: 73, runtime60s: 'UNVERIFIED' }), { flag: 'wx' })
  return work
}
export async function promotePilotRelease(repo: string, work: string) {
  return promotePreparedRelease(repo, work, PILOT_BASELINE, PILOT_RELEASE, 'e2-s5-release-')
}
/** Existing offline transaction reused by separately authorized bounded waves. */
export async function promotePreparedRelease(repo: string, work: string, baseline: string, target: PackageManifestAnchor,
  prefix: 'e2-s5-release-' | 'e2-s6-wave-a-' | 'e2-s6-wave-b-' | 'e2-s6-wave-c-' | 'e2-s6-wave-d-') {
  repo = resolve(repo); work = resolve(work)
  const evidence = join(repo, 'out', 'official-tests')
  contained(evidence, work)
  demand(dirname(work) === evidence && work.split(sep).at(-1)!.startsWith(prefix), 'RELEASE_PATH')
  const active = join(repo, ...suffix), ready = join(work, ...suffix), backup = join(work, 'baseline-exercises')
  for (const p of [active, ready, backup]) contained(repo, p)
  const lockPath = join(evidence, 'pilot-promotion.lock'), lock = await fs.open(lockPath, 'wx')
  let moved = false, installed = false
  try {
    await inspect(work, target)
    const current = await inspect(repo)
    demand(current.anchor.sha256 === baseline, 'BASELINE_CHANGED')
    const journal = { active, ready, backup, baseline, release: target }
    // Complete-tree rename on the same volume, offline only. No partial assets.
    // Crash recovery locations are persisted before the first move; backup retained.
    await fs.writeFile(join(work, 'TRANSACTION.json'), encoded({ ...journal, state: 'PREPARED' }), { flag: 'wx' })
    await fs.rename(active, backup); moved = true
    await fs.rename(ready, active); installed = true
    await inspect(repo, target)
    await fs.writeFile(join(work, 'COMMITTED.json'), encoded({ ...journal, state: 'COMMITTED', runtime60s: 'UNVERIFIED' }), { flag: 'wx' })
  } catch (error) {
    if (installed) await fs.rename(active, ready)
    if (moved) await fs.rename(backup, active)
    throw error
  } finally { await lock.close(); await fs.unlink(lockPath) }
}
