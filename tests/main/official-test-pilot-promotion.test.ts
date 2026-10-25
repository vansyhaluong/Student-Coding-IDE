import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { preparePilotRelease, promotePilotRelease, PILOT_BASELINE, PILOT_RELEASE } from '../../scripts/learning-official-tests/pilot-release'
import { ExerciseResourceRoot, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'

vi.mock('node:fs/promises', async () => ({ ...await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises') }))
const temporary: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const p of temporary.splice(0)) {
    if (dirname(resolve(p)) !== resolve(tmpdir()) || !basename(p).startsWith('pilot-promotion-')) throw Error('Unsafe cleanup')
    await fs.rm(p, { recursive: true, force: true })
  }
})
async function fixture() {
  const repo = await fs.mkdtemp(join(tmpdir(), 'pilot-promotion-')); temporary.push(repo)
  const active = join(repo, 'resources/learning/exercises')
  // S5 tests run after promotion: transaction's retained baseline is immutable input.
  const entries = await fs.readdir('out/official-tests', { withFileTypes: true })
  let baseline = resolve('resources/learning/exercises')
  for (const e of entries.filter(e => e.isDirectory() && e.name.startsWith('e2-s5-release-'))) {
    const p = resolve('out/official-tests', e.name, 'baseline-exercises')
    try { if (rawPackageDigest(await fs.readFile(join(p, 'manifest.json'))) === PILOT_BASELINE) { baseline = p; break } } catch { /* uncommitted staging is not a baseline */ }
  }
  await fs.cp(baseline, active, { recursive: true })
  for (const name of ['e2-s3-hRjMzc', 'e2-s3-Tq7kmR', 'e2-s3-evidence-VSpHnc']) await fs.cp(resolve('out/official-tests', name), join(repo, 'out/official-tests', name), { recursive: true })
  // Historical S5 replay uses the accepted immutable tool-source snapshot.
  // Wave A legitimately revises shared developer drivers, not that old evidence.
  await fs.cp(resolve('out/official-tests/e2-s5-accepted-sources'), join(repo, 'scripts/learning-official-tests'), { recursive: true })
  return { repo, active, hash: async () => rawPackageDigest(await fs.readFile(join(active, 'manifest.json'))) }
}
// Frozen authoring evidence is intentionally ignored/private, never fabricated
// on a clean checkout. Missing acceptance inputs are a visible skipped gate.
describe.skipIf(!existsSync('out/official-tests/e2-s3-evidence-VSpHnc/reproducibility.json') || !existsSync('out/official-tests/e2-s5-accepted-sources/model.ts'))('E2-S5 accepted-byte release transaction', () => {
  it('installs complete mixed release, retaining exact baseline and excluding evidence/references', async () => {
    const f = await fixture(), work = await preparePilotRelease(f.repo)
    await promotePilotRelease(f.repo, work)
    expect(await f.hash()).toBe(PILOT_RELEASE.sha256)
    expect(rawPackageDigest(await fs.readFile(join(work, 'baseline-exercises/manifest.json')))).toBe(PILOT_BASELINE)
    const root = await ExerciseResourceRoot.open(f.repo, ['resources', 'learning', 'exercises'])
    const { manifest } = await root.manifest(PILOT_RELEASE)
    expect(manifest.packages.filter(p => 'profile' in p && p.profile === 'full')).toHaveLength(9)
    expect(manifest.packages.filter(p => 'profile' in p && p.profile === 'public-only')).toHaveLength(54)
    await expect(fs.stat(join(f.active, 'evidence'))).rejects.toHaveProperty('code', 'ENOENT')
    await expect(fs.stat(join(f.repo, 'out/official-tests/pilot-promotion.lock'))).rejects.toHaveProperty('code', 'ENOENT')
  }, 30000)
  it('rejects accepted artifact or baseline drift without changing active data', async () => {
    const f = await fixture()
    await fs.appendFile(join(f.repo, 'out/official-tests/e2-s3-Tq7kmR/resources/learning/exercises/ch8-01/judge/v1.json'), ' ')
    await expect(preparePilotRelease(f.repo)).rejects.toThrow('ACCEPTED_ARTIFACT_CHANGED')
    expect(await f.hash()).toBe(PILOT_BASELINE)
  }, 30000)
  it('rolls back the complete baseline if the second directory rename fails', async () => {
    const f = await fixture(), work = await preparePilotRelease(f.repo), rename = fs.rename
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(from) === join(work, 'resources/learning/exercises')) throw Error('INJECTED_RENAME_FAILURE')
      return rename(from, to)
    })
    await expect(promotePilotRelease(f.repo, work)).rejects.toThrow('INJECTED_RENAME_FAILURE')
    expect(await f.hash()).toBe(PILOT_BASELINE)
    await expect(fs.stat(join(work, 'COMMITTED.json'))).rejects.toHaveProperty('code', 'ENOENT')
  }, 30000)
  it('rechecks prepared resources before moving active data and enforces an exclusive lock', async () => {
    const f = await fixture(), work = await preparePilotRelease(f.repo)
    const lock = join(f.repo, 'out/official-tests/pilot-promotion.lock')
    await fs.writeFile(lock, 'other owner', { flag: 'wx' })
    await expect(promotePilotRelease(f.repo, work)).rejects.toHaveProperty('code', 'EEXIST')
    await fs.unlink(lock)
    await fs.appendFile(join(work, 'resources/learning/exercises/ch8-01/judge/v1.json'), ' ')
    await expect(promotePilotRelease(f.repo, work)).rejects.toHaveProperty('code', 'PACKAGE_INTEGRITY_FAILED')
    expect(await f.hash()).toBe(PILOT_BASELINE)
  }, 30000)
})
