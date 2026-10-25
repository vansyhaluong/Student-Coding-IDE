import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { PackageSignature } from '../../../../shared/contracts/exercise-package'
import type { ExercisePackageAssetBytes, PackageManifest, ValidatedExercisePackage, ValidatedPublicPackage } from './exercise-package-contracts'
import { PACKAGE_POLICY as P, PACKAGE_ASSET_LIMITS, PackageValidationError } from './exercise-package-policy'
import { validateExercisePackageAssetsCooperative, validatePackageManifestCooperative, validatePublicPackageAssetsCooperative } from './exercise-package-validation'
import type { PackageAllocationObserver } from './exercise-package-budget'
import { PackageWorkControl, PackageWorkInterrupted, freezePackageWork, runPackageWork } from './exercise-package-work'

export interface PackageManifestAnchor { version: number; rawBytes: number; sha256: string }
export type ResourceFailure = 'PACKAGE_ROOT_INVALID' | 'PACKAGE_PATH_INVALID' | 'PACKAGE_ASSET_MISSING'
  | 'PACKAGE_READ_FAILED' | 'PACKAGE_ASSET_LIMIT' | 'PACKAGE_INTEGRITY_FAILED' | 'PACKAGE_UNEXPECTED_ASSET'
export class PackageResourceError extends Error {
  constructor(readonly code: ResourceFailure) { super(code) }
}
const requireResource = (ok: unknown, code: ResourceFailure): void => { if (!ok) throw new PackageResourceError(code) }
export const rawPackageDigest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
async function cooperativeDigest(bytes: Uint8Array, control: PackageWorkControl): Promise<string> {
  await control.checkpoint({}, true)
  const hash = createHash('sha256')
  for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
    control.check()
    const pending = control.checkpoint({ steps: 1, guard: true })
    if (pending) await pending
    hash.update(bytes.subarray(offset, offset + 64 * 1024))
  }
  control.check()
  const digest = hash.digest('hex')
  await control.checkpoint({}, true)
  return digest
}
/** Call only on a Step1-validated signature. Order/encoding is S2-R3 v1. */
function canonicalSignatureText(s: PackageSignature): string {
  return JSON.stringify({ version: s.version, functionName: s.functionName,
    parameters: s.parameters.map(p => ({ name: p.name, type: p.type })), returnType: s.returnType })
}
export function canonicalSignatureBytes(s: PackageSignature): Buffer {
  return Buffer.from(canonicalSignatureText(s), 'utf8')
}
export function exerciseResourceLocation(environment: { packaged: boolean; mainOutput: string; resourcesPath: string }): { base: string; suffix: string[] } {
  return environment.packaged ? { base: environment.resourcesPath, suffix: ['learning', 'exercises'] }
    : { base: environment.mainOutput, suffix: ['resources', 'learning', 'exercises'] }
}
const canonical = (s: string): string => process.platform === 'win32' ? resolve(s).toLowerCase() : resolve(s)
const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
  && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.nlink === b.nlink
const component = (s: string): boolean => s.length > 0 && s.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(s)
  && s !== '.' && s !== '..' && !/[. ]$/.test(s) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)
type Identity = { path: string; stat: BigIntStats }
async function checkedIo<T>(control: PackageWorkControl | undefined, work: () => Promise<T>): Promise<T> {
  control?.check()
  const value = await work()
  control?.check()
  return value
}

async function safeIo<T>(work: () => Promise<T>, root = false): Promise<T> {
  try { return await work() }
  catch (error) {
    if (error instanceof PackageResourceError || error instanceof PackageValidationError || error instanceof PackageWorkInterrupted) throw error
    const code = (error as NodeJS.ErrnoException)?.code
    throw new PackageResourceError(root ? 'PACKAGE_ROOT_INVALID' : code === 'ENOENT' ? 'PACKAGE_ASSET_MISSING' : 'PACKAGE_READ_FAILED')
  }
}
/** Main-only capability, built from trusted bootstrap facts, never Renderer paths.
 * Node identity observations are NOT atomic namespace resolution against a local
 * malicious swap-and-restore. No protection against modification of app+anchor. */
export class ExerciseResourceRoot {
  private constructor(readonly path: string, private readonly roots: Identity[]) {}
  static async open(base: string, suffix: readonly string[], control?: PackageWorkControl): Promise<ExerciseResourceRoot> {
    return safeIo(async () => {
      requireResource(isAbsolute(base) && suffix.every(component), 'PACKAGE_ROOT_INVALID')
      const trustedBase = await checkedIo(control, () => fs.realpath(base))
      let current = trustedBase
      const roots: Identity[] = []
      for (const part of [null, ...suffix]) {
        if (part !== null) current = join(current, part)
        const stat = await checkedIo(control, () => fs.lstat(current, { bigint: true }))
        requireResource(stat.isDirectory() && !stat.isSymbolicLink() && stat.ino !== 0n
          && canonical(await checkedIo(control, () => fs.realpath(current))) === canonical(current), 'PACKAGE_ROOT_INVALID')
        roots.push({ path: current, stat })
      }
      return new ExerciseResourceRoot(current, roots)
    }, true)
  }
  private async checkRoots(control?: PackageWorkControl): Promise<void> {
    for (const item of this.roots) {
      const stat = await checkedIo(control, () => fs.lstat(item.path, { bigint: true }))
      requireResource(stat.isDirectory() && !stat.isSymbolicLink() && same(stat, item.stat)
        && canonical(await checkedIo(control, () => fs.realpath(item.path))) === canonical(item.path), 'PACKAGE_ROOT_INVALID')
    }
  }
  private async parents(parts: readonly string[], control?: PackageWorkControl): Promise<Identity[]> {
    await this.checkRoots(control)
    // Five-asset schema: exerciseId / starters-or-judge / fixed filename.
    requireResource(parts.length > 0 && parts.length <= 3 && parts.every(component), 'PACKAGE_PATH_INVALID')
    const target = join(this.path, ...parts), r = relative(this.path, target)
    requireResource(r !== '' && !isAbsolute(r) && r !== '..' && !r.startsWith('..' + sep), 'PACKAGE_PATH_INVALID')
    const parents: Identity[] = []
    let current = this.path
    for (const part of parts.slice(0, -1)) {
      current = join(current, part)
      const stat = await checkedIo(control, () => fs.lstat(current, { bigint: true }))
      requireResource(stat.isDirectory() && !stat.isSymbolicLink() && stat.ino !== 0n
        && canonical(await checkedIo(control, () => fs.realpath(current))) === canonical(current), 'PACKAGE_PATH_INVALID')
      parents.push({ path: current, stat })
    }
    return parents
  }
  private async recheck(parents: Identity[], control?: PackageWorkControl): Promise<void> {
    await this.checkRoots(control)
    for (const p of parents) {
      const stat = await checkedIo(control, () => fs.lstat(p.path, { bigint: true }))
      requireResource(same(stat, p.stat) && stat.isDirectory() && !stat.isSymbolicLink()
        && canonical(await checkedIo(control, () => fs.realpath(p.path))) === canonical(p.path), 'PACKAGE_PATH_INVALID')
    }
  }
  private async read(parts: readonly string[], maximum: number, expected?: { bytes: number; sha256: string }, allocations?: PackageAllocationObserver,
    control = new PackageWorkControl()): Promise<Buffer> {
    return safeIo(async () => {
      control.check()
      const parents = await this.parents(parts, control), file = join(this.path, ...parts)
      control.check()
      if (expected) requireResource(Number.isSafeInteger(expected.bytes) && expected.bytes >= 0 && expected.bytes <= maximum, 'PACKAGE_ASSET_LIMIT')
      const before = await checkedIo(control, () => fs.lstat(file, { bigint: true }))
      requireResource(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.ino !== 0n
        && canonical(await checkedIo(control, () => fs.realpath(file))) === canonical(file), 'PACKAGE_PATH_INVALID')
      requireResource(before.size >= 0n && before.size <= BigInt(maximum), 'PACKAGE_ASSET_LIMIT')
      if (expected) requireResource(before.size === BigInt(expected.bytes), 'PACKAGE_INTEGRITY_FAILED')
      const handle = await fs.open(file, 'r')
      try {
        control.check()
        requireResource(same(before, await checkedIo(control, () => handle.stat({ bigint: true }))), 'PACKAGE_INTEGRITY_FAILED')
        await this.recheck(parents, control)
        control.check()
        allocations?.raw(Number(before.size))
        const contents = Buffer.alloc(Number(before.size))
        let used = 0
        while (used < contents.byteLength) {
          const { bytesRead } = await handle.read(contents, used, contents.byteLength - used, used)
          control.check()
          requireResource(bytesRead > 0, 'PACKAGE_INTEGRITY_FAILED'); used += bytesRead
        }
        const releaseProbe = allocations?.raw(1)
        let extra: number
        try { extra = (await checkedIo(control, () => handle.read(Buffer.alloc(1), 0, 1, used))).bytesRead }
        finally { releaseProbe?.() }
        requireResource(extra === 0 && same(before, await checkedIo(control, () => handle.stat({ bigint: true })))
          && same(before, await checkedIo(control, () => fs.lstat(file, { bigint: true }))), 'PACKAGE_INTEGRITY_FAILED')
        await this.recheck(parents, control)
        control.check()
        requireResource(canonical(await checkedIo(control, () => fs.realpath(file))) === canonical(file), 'PACKAGE_PATH_INVALID')
        control.check()
        if (expected) requireResource(await cooperativeDigest(contents, control) === expected.sha256, 'PACKAGE_INTEGRITY_FAILED')
        return contents
      } finally { await handle.close() }
    })
  }
  async manifest(anchor?: Readonly<PackageManifestAnchor>, allocations?: PackageAllocationObserver, control = new PackageWorkControl()): Promise<{ manifest: PackageManifest; anchor: PackageManifestAnchor; bytes: Buffer }> {
    // No anchor is allowed only at trusted BUILD SOURCE. Runtime wrapper always
    // supplies the compiled anchor. This method does not establish runtime trust.
    const bytes = await this.read(['manifest.json'], P.manifestBytes, anchor && { bytes: anchor.rawBytes, sha256: anchor.sha256 }, allocations, control)
    const result = await validatePackageManifestCooperative(bytes, allocations, control)
    if (!result.ok) throw new PackageValidationError(result.code)
    if (anchor) requireResource(result.value.version === anchor.version, 'PACKAGE_INTEGRITY_FAILED')
    return { bytes, manifest: result.value, anchor: { version: result.value.version, rawBytes: bytes.byteLength, sha256: await cooperativeDigest(bytes, control) } }
  }
  async package(manifest: PackageManifest, exerciseId: string, allocations?: PackageAllocationObserver, control = new PackageWorkControl()): Promise<{ data: ValidatedExercisePackage; bytes: ExercisePackageAssetBytes }> {
    control.check()
    // Main supplies an already validated manifest; revalidate through bounded
    // bytes at callers, never accept a descriptor from Renderer or IPC.
    const candidate = manifest.packages.find(p => p.exerciseId === exerciseId)
    requireResource(candidate && component(exerciseId), 'PACKAGE_PATH_INVALID')
    requireResource(candidate && !('profile' in candidate && candidate.profile === 'public-only'), 'PACKAGE_INTEGRITY_FAILED')
    const descriptor = candidate as import('./exercise-package-contracts').ExercisePackageDescriptor
    requireResource(descriptor !== undefined && component(exerciseId), 'PACKAGE_PATH_INVALID')
    await this.exactDirectory([exerciseId], ['exercise.json', 'samples.json', 'starters', 'judge'], control)
    await this.exactDirectory([exerciseId, 'starters'], ['csharp.txt', 'javascript.txt'], control)
    await this.exactDirectory([exerciseId, 'judge'], [descriptor!.assets.judge.path.split('/')[1]], control)
    const bytes = {} as ExercisePackageAssetBytes
    for (const kind of Object.keys(PACKAGE_ASSET_LIMITS) as (keyof ExercisePackageAssetBytes)[]) {
      const asset = descriptor!.assets[kind]
      bytes[kind] = await this.read([exerciseId, ...asset.path.split('/')], PACKAGE_ASSET_LIMITS[kind], asset, allocations, control)
    }
    const checked = await validateExercisePackageAssetsCooperative(bytes, allocations, control)
    if (!checked.ok) throw new PackageValidationError(checked.code)
    const data = checked.value
    const signatureText = canonicalSignatureText(data.metadata.signature)
    const releaseSignature = allocations?.raw(Buffer.byteLength(signatureText, 'utf8'))
    let signatureHash: string
    try { signatureHash = await cooperativeDigest(Buffer.from(signatureText, 'utf8'), control) }
    finally { releaseSignature?.() }
    requireResource(data.metadata.exerciseId === exerciseId && data.metadata.packageVersion === descriptor!.packageVersion
      && descriptor!.assets.judge.path === `judge/v${data.judge.version}.json`
      && data.metadata.official.hash === await cooperativeDigest(bytes.judge, control)
      && data.metadata.signature.hash === signatureHash, 'PACKAGE_INTEGRITY_FAILED')
    return { data, bytes }
  }
  async publicPackage(manifest: PackageManifest, exerciseId: string, allocations?: PackageAllocationObserver, control = new PackageWorkControl()): Promise<{ data: ValidatedPublicPackage; bytes: Omit<ExercisePackageAssetBytes, 'judge'> }> {
    control.check()
    const descriptor = manifest.packages.find(p => p.exerciseId === exerciseId)
    requireResource(descriptor && component(exerciseId), 'PACKAGE_PATH_INVALID')
    const publicOnly = 'profile' in descriptor! && descriptor.profile === 'public-only'
    await this.exactDirectory([exerciseId], publicOnly ? ['exercise.json', 'samples.json', 'starters'] : ['exercise.json', 'samples.json', 'starters', 'judge'], control)
    await this.exactDirectory([exerciseId, 'starters'], ['csharp.txt', 'javascript.txt'], control)
    const bytes = {} as Omit<ExercisePackageAssetBytes, 'judge'>
    for (const kind of ['metadata', 'samples', 'csharp', 'javascript'] as const) {
      const asset = descriptor!.assets[kind]
      bytes[kind] = await this.read([exerciseId, ...asset.path.split('/')], PACKAGE_ASSET_LIMITS[kind], asset, allocations, control)
    }
    const checked = await validatePublicPackageAssetsCooperative(bytes, publicOnly, allocations, control)
    if (!checked.ok) throw new PackageValidationError(checked.code)
    const data = checked.value, text = canonicalSignatureText(data.metadata.signature)
    const release = allocations?.raw(Buffer.byteLength(text))
    let hash: string
    try { hash = await cooperativeDigest(Buffer.from(text), control) } finally { release?.() }
    requireResource(data.metadata.exerciseId === exerciseId && data.metadata.packageVersion === descriptor!.packageVersion
      && data.metadata.signature.hash === hash, 'PACKAGE_INTEGRITY_FAILED')
    return { data, bytes }
  }
  /** Exact tree inspection, bounded by the allowed entries; no recursive glob or
   * unbounded readdir allocation. Only the build uses whole-tree completeness. */
  async exactDirectory(parts: readonly string[], names: readonly string[], control?: PackageWorkControl): Promise<void> {
    return safeIo(async () => {
      const parents = await this.parents([...parts, 'inspection'], control)
      const directory = join(this.path, ...parts), remaining = new Set(names)
      const stream = await fs.opendir(directory)
      for await (const entry of stream) {
        control?.check()
        requireResource(remaining.delete(entry.name) && !entry.isSymbolicLink(), 'PACKAGE_UNEXPECTED_ASSET')
      }
      requireResource(remaining.size === 0, 'PACKAGE_ASSET_MISSING')
      await this.recheck(parents, control)
    })
  }
}

/** Runtime integrity API. Anchor comes from compiled Main, not adjacent data.
 * Structural+integrity verification only; never implies Step3 readiness. */
export async function openAnchoredExerciseResources(environment: Parameters<typeof exerciseResourceLocation>[0], anchor: Readonly<PackageManifestAnchor>, allocations?: PackageAllocationObserver,
  control = new PackageWorkControl()) {
  control.check()
  requireResource(anchor && Number.isSafeInteger(anchor.version) && anchor.version > 0 && anchor.version <= P.versionMaximum
    && Number.isSafeInteger(anchor.rawBytes) && anchor.rawBytes >= 0 && anchor.rawBytes <= P.manifestBytes
    && typeof anchor.sha256 === 'string' && /^[a-f0-9]{64}$/.test(anchor.sha256), 'PACKAGE_INTEGRITY_FAILED')
  const location = exerciseResourceLocation(environment)
  const root = await ExerciseResourceRoot.open(location.base, location.suffix, control)
  const { manifest } = await root.manifest(anchor, allocations, control)
  await control.checkpoint({}, true)
  await runPackageWork(freezePackageWork(manifest), control)
  control.check()
  return { manifest, readPackage: (exerciseId: string, scope?: PackageAllocationObserver, work?: PackageWorkControl) => root.package(manifest, exerciseId, scope, work),
    readPublicPackage: (exerciseId: string, scope?: PackageAllocationObserver, work?: PackageWorkControl) => root.publicPackage(manifest, exerciseId, scope, work) }
}
