import * as fs from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, normalize, parse, resolve } from 'node:path'
import { SUBMISSION_STORE_POLICY as P, type SubmissionStoreKind } from './submission-contracts'
import { StoreIOError, storeIOError, withStoreLease, type StoreLease } from './store-lease'

export interface StoreFileHandle {
  stat(): Promise<BigIntStats>
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>
  write(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>
  sync(): Promise<void>
  close(): Promise<void>
}
/** Inject only filesystem calls, not trusted identity/containment decisions. Main-only. */
export interface StoreFilePort {
  lstat(path: string): Promise<BigIntStats>
  realpath(path: string): Promise<string>
  mkdir(path: string): Promise<unknown>
  open(path: string, flags: 'r' | 'wx'): Promise<StoreFileHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  statfs(path: string): Promise<{ bavail: bigint; bsize: bigint }>
}
export const nodeStoreFilePort: StoreFilePort = {
  lstat: path => fs.lstat(path, { bigint: true }), realpath: fs.realpath, mkdir: fs.mkdir,
  open: async (path, flags) => {
    const h = await fs.open(path, flags)
    return { stat: () => h.stat({ bigint: true }), read: (...args) => h.read(...args),
      write: (...args) => h.write(...args), sync: () => h.sync(), close: () => h.close() }
  },
  rename: fs.rename, unlink: fs.unlink, readdir: fs.readdir,
  statfs: path => fs.statfs(path, { bigint: true }),
}
export interface StoreFileIdentity {
  readonly dev: string; readonly ino: string; readonly birthtimeNs: string
  readonly size: string; readonly mtimeNs: string; readonly ctimeNs: string
}
export type StoreCopy = 'PRIMARY' | 'BACKUP'
export interface StoreStage {
  readonly storeKind: SubmissionStoreKind
  readonly state: 'WRITING' | 'READY' | 'FAILED' | 'REPLACED' | 'DISCARDED' | 'REPLACEMENT_UNVERIFIED'
}
interface StageEntry {
  path: string; identity?: StoreFileIdentity; bytes: number; digest: string; state: StoreStage['state']
  copy?: StoreCopy
}
const canonical = (p: string) => process.platform === 'win32' ? normalize(p).toLowerCase() : normalize(p)
const identity = (s: BigIntStats): StoreFileIdentity => Object.freeze({ dev: String(s.dev), ino: String(s.ino),
  birthtimeNs: String(s.birthtimeNs), size: String(s.size), mtimeNs: String(s.mtimeNs), ctimeNs: String(s.ctimeNs) })
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const validKind = (v: unknown): v is SubmissionStoreKind => v === 'ACCEPTED' || v === 'FAILED'

/** Checked byte primitives only. No schemas, append/backup policy, commit or recovery. */
export class SubmissionStoreFiles {
  private readonly stages = new Map<StoreStage, StageEntry>()
  private readonly handles = new Set<StoreFileHandle>()
  private operations = 0
  private constructor(private readonly root: string, private readonly ancestors: readonly { path: string; identity: StoreFileIdentity }[],
    private readonly io: StoreFilePort) {}
  static async open(trustedLearningRoot: string, io: StoreFilePort = nodeStoreFilePort): Promise<SubmissionStoreFiles> {
    if (typeof trustedLearningRoot !== 'string' || !isAbsolute(trustedLearningRoot)
      || trustedLearningRoot.split(/[\\/]/).some(s => s === '.' || s === '..') || /^\\\\[?.]\\/.test(trustedLearningRoot)) throw new StoreIOError('UNSAFE')
    const root = resolve(trustedLearningRoot), paths: string[] = []
    for (let p = root;; p = dirname(p)) { paths.unshift(p); if (p === parse(p).root) break }
    const ancestors: { path: string; identity: StoreFileIdentity }[] = []
    try {
      for (const path of paths) {
        let stat: BigIntStats
        try { stat = await io.lstat(path) }
        catch (error) {
          if (storeIOError(error).reason !== 'MISSING' || path !== root) throw error
          // Only the selected Learning directory may be created; never create arbitrary ancestors.
          for (const a of ancestors) {
            const current = await io.lstat(a.path)
            if (!current.isDirectory() || current.isSymbolicLink() || canonical(await io.realpath(a.path)) !== canonical(a.path)
              || current.ino.toString() !== a.identity.ino || current.dev.toString() !== a.identity.dev
              || current.birthtimeNs.toString() !== a.identity.birthtimeNs) throw new StoreIOError('UNSAFE')
          }
          try { await io.mkdir(path) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e }
          stat = await io.lstat(path)
        }
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n
          || canonical(await io.realpath(path)) !== canonical(path)) throw new StoreIOError('UNSAFE')
        ancestors.push({ path, identity: identity(stat) })
      }
      const files = new SubmissionStoreFiles(root, ancestors, io)
      await files.checkRoot()
      return files
    } catch (error) { throw storeIOError(error) }
  }
  get lockPath(): string { return join(this.root, 'submissions.lock') }
  get pendingHandles(): number { return this.handles.size }
  get hasRetainedResources(): boolean {
    return this.operations > 0 || this.handles.size > 0 || [...this.stages.values()].some(s => !['REPLACED', 'DISCARDED'].includes(s.state))
  }
  ownedStages(): readonly StoreStage[] {
    return Object.freeze([...this.stages].filter(([, e]) => !['REPLACED', 'DISCARDED'].includes(e.state)).map(([s]) => s))
  }
  sameIdentity(a: StoreFileIdentity, b: StoreFileIdentity, contents = false): boolean {
    return a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
      && (!contents || a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs)
  }
  private async checkRoot(): Promise<void> {
    for (const a of this.ancestors) {
      const stat = await this.io.lstat(a.path)
      if (!stat.isDirectory() || stat.isSymbolicLink() || !this.sameIdentity(a.identity, identity(stat))
        || canonical(await this.io.realpath(a.path)) !== canonical(a.path)) throw new StoreIOError('UNSAFE')
    }
  }
  private path(storeKind: SubmissionStoreKind, copy: StoreCopy): string {
    if (!validKind(storeKind) || copy !== 'PRIMARY' && copy !== 'BACKUP') throw new StoreIOError('INVALID_INPUT')
    return join(this.root, P[storeKind].filename + (copy === 'BACKUP' ? '.bak' : ''))
  }
  private async file(path: string): Promise<StoreFileIdentity | null> {
    await this.checkRoot()
    let stat: BigIntStats
    try { stat = await this.io.lstat(path) }
    catch (error) { if (storeIOError(error).reason === 'MISSING') { await this.checkRoot(); return null }; throw error }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.ino === 0n
      || canonical(await this.io.realpath(path)) !== canonical(path)) throw new StoreIOError('UNSAFE')
    await this.checkRoot()
    return identity(stat)
  }
  private track<T>(work: () => Promise<T>): Promise<T> {
    this.operations++
    return work().catch(error => { throw storeIOError(error) }).finally(() => { this.operations-- })
  }
  inspect(storeKind: SubmissionStoreKind, copy: StoreCopy = 'PRIMARY'): Promise<StoreFileIdentity | null> {
    return this.track(() => this.file(this.path(storeKind, copy)))
  }
  inspectLock(): Promise<StoreFileIdentity | null> { return this.track(() => this.file(this.lockPath)) }
  /** Evidence only: orphan siblings never become commit authority. */
  evidence(storeKind: SubmissionStoreKind): Promise<boolean> {
    return this.track(async () => {
      if (!validKind(storeKind)) throw new StoreIOError('INVALID_INPUT')
      await this.checkRoot()
      const names = await this.io.readdir(this.root)
      await this.checkRoot()
      return names.some(n => n.startsWith(P[storeKind].filename + '.stage-'))
    })
  }
  freeBytes(): Promise<bigint> {
    return this.track(async () => {
      await this.checkRoot()
      const s = await this.io.statfs(this.root)
      await this.checkRoot()
      if (s.bavail < 0n || s.bsize <= 0n) throw new StoreIOError('UNAVAILABLE')
      return s.bavail * s.bsize
    })
  }
  private async close(handle: StoreFileHandle): Promise<void> {
    await handle.close(); this.handles.delete(handle) // Retain on rejection, for explicit retry.
  }
  async retryClose(): Promise<void> {
    if (this.operations) throw new StoreIOError('BUSY')
    await this.track(async () => { for (const handle of this.handles) await this.close(handle) })
  }
  private async readPath(path: string, maximum: number): Promise<{ bytes: Buffer; identity: StoreFileIdentity }> {
    const before = await this.file(path)
    if (!before) throw new StoreIOError('MISSING')
    if (BigInt(before.size) > BigInt(maximum)) throw new StoreIOError('TOO_LARGE')
    const handle = await this.io.open(path, 'r'); this.handles.add(handle)
    try {
      const first = await handle.stat()
      if (!first.isFile() || first.nlink !== 1n || !this.sameIdentity(before, identity(first), true)) throw new StoreIOError('UNSAFE')
      await this.checkRoot()
      const bytes = Buffer.alloc(Number(first.size))
      let used = 0
      while (used < bytes.length) {
        const r = await handle.read(bytes, used, bytes.length - used, used)
        if (!Number.isSafeInteger(r.bytesRead) || r.bytesRead <= 0 || r.bytesRead > bytes.length - used) throw new StoreIOError('IO')
        used += r.bytesRead
      }
      const extra = await handle.read(Buffer.alloc(1), 0, 1, used)
      const after = await handle.stat(), pathAfter = await this.file(path)
      if (extra.bytesRead !== 0 || !pathAfter || after.nlink !== 1n || !this.sameIdentity(before, identity(after), true)
        || !this.sameIdentity(before, pathAfter, true)) throw new StoreIOError('UNSAFE')
      return { bytes, identity: before }
    } finally { await this.close(handle) }
  }
  read(storeKind: SubmissionStoreKind, copy: StoreCopy = 'PRIMARY', maximum?: number): Promise<{ bytes: Buffer; identity: StoreFileIdentity }> {
    return this.track(async () => {
      const path = this.path(storeKind, copy), cap = maximum ?? P[storeKind].snapshotBytes
      if (!Number.isSafeInteger(cap) || cap < 0 || cap > P[storeKind].snapshotBytes) throw new StoreIOError('INVALID_INPUT')
      return this.readPath(path, cap)
    })
  }
  stage(lease: StoreLease, storeKind: SubmissionStoreKind, input: Uint8Array): Promise<StoreStage> {
    if (!validKind(storeKind) || !(input instanceof Uint8Array)) return Promise.reject(new StoreIOError('INVALID_INPUT'))
    if (input.byteLength > P[storeKind].snapshotBytes) return Promise.reject(new StoreIOError('TOO_LARGE'))
    const bytes = Buffer.from(input) // Capture before any yield; caller mutation cannot alter the stage.
    return withStoreLease(this, lease, () => this.track(async () => {
      await this.checkRoot()
      const path = join(this.root, `${P[storeKind].filename}.stage-${randomUUID()}.tmp`)
      const handle = await this.io.open(path, 'wx'); this.handles.add(handle)
      const entry: StageEntry = { path, bytes: bytes.length, digest: hash(bytes), state: 'WRITING' }
      const token: StoreStage = Object.freeze({ storeKind, get state() { return entry.state } })
      this.stages.set(token, entry)
      try {
        try {
          const first = await handle.stat(), onPath = await this.file(path)
          if (!onPath || !first.isFile() || first.nlink !== 1n || !this.sameIdentity(identity(first), onPath)) throw new StoreIOError('UNSAFE')
          entry.identity = identity(first)
          let used = 0
          while (used < bytes.length) {
            const r = await handle.write(bytes, used, bytes.length - used, used)
            if (!Number.isSafeInteger(r.bytesWritten) || r.bytesWritten <= 0 || r.bytesWritten > bytes.length - used) throw new StoreIOError('IO')
            used += r.bytesWritten
          }
          await handle.sync()
        } finally { await this.close(handle) }
        const verified = await this.readPath(path, bytes.length)
        if (!entry.identity || !this.sameIdentity(entry.identity, verified.identity) || hash(verified.bytes) !== entry.digest) throw new StoreIOError('UNSAFE')
        entry.identity = verified.identity; entry.state = 'READY'
        return token
      } catch (error) { entry.state = 'FAILED'; throw error }
    }))
  }
  discard(lease: StoreLease, stage: StoreStage): Promise<void> {
    return withStoreLease(this, lease, () => this.track(async () => {
      const e = this.stages.get(stage)
      if (!e || !e.identity || !['READY', 'FAILED'].includes(e.state)) throw new StoreIOError('UNSAFE')
      const current = await this.file(e.path)
      if (!current || !this.sameIdentity(e.identity, current)) throw new StoreIOError('UNSAFE')
      await this.io.unlink(e.path); e.state = 'DISCARDED'; this.stages.delete(stage)
    }))
  }
  /** Schema-blind byte replacement. The later service must supply its live guard.
   * No await separates guard and rename dispatch; no unlink/copy-over fallback. */
  replace(lease: StoreLease, stage: StoreStage, copy: StoreCopy, expected: StoreFileIdentity | null, guard: () => void): Promise<void> {
    return withStoreLease(this, lease, () => this.track(async () => {
      const e = this.stages.get(stage)
      if (!e || e.state !== 'READY' || !e.identity || typeof guard !== 'function') throw new StoreIOError('UNSAFE')
      const target = this.path(stage.storeKind, copy)
      const original = await this.readPath(e.path, e.bytes)
      if (!this.sameIdentity(e.identity, original.identity, true) || hash(original.bytes) !== e.digest) throw new StoreIOError('UNSAFE')
      const destination = await this.file(target)
      if (expected === null ? destination !== null : !destination || !this.sameIdentity(expected, destination, true)) throw new StoreIOError('UNSAFE')
      const admission: unknown = guard()
      if (admission !== undefined) throw new StoreIOError('INVALID_INPUT')
      let dispatched = false
      try {
        e.copy = copy
        dispatched = true
        const work = this.io.rename(e.path, target)
        await work
        const result = await this.readPath(target, e.bytes)
        if (!this.sameIdentity(e.identity, result.identity) || hash(result.bytes) !== e.digest) throw new StoreIOError('UNSAFE')
        e.state = 'REPLACED'; this.stages.delete(stage)
      } catch (error) { e.state = 'REPLACEMENT_UNVERIFIED'; throw storeIOError(error, dispatched) }
    }))
  }
  /** Called only after the original replace promise settles. No new rename. */
  reconcileReplacement(lease: StoreLease, stage: StoreStage): Promise<'REPLACED' | 'NOT_REPLACED'> {
    return withStoreLease(this, lease, () => this.track(async () => {
      const e = this.stages.get(stage)
      if (!e || e.state !== 'REPLACEMENT_UNVERIFIED' || !e.identity || !e.copy) throw new StoreIOError('UNSAFE')
      const destination = await this.file(this.path(stage.storeKind, e.copy))
      if (destination && this.sameIdentity(e.identity, destination)) {
        const read = await this.readPath(this.path(stage.storeKind, e.copy), e.bytes)
        if (hash(read.bytes) !== e.digest) throw new StoreIOError('UNSAFE')
        e.state = 'REPLACED'; this.stages.delete(stage)
        return 'REPLACED'
      }
      const source = await this.readPath(e.path, e.bytes)
      if (!this.sameIdentity(e.identity, source.identity, true) || hash(source.bytes) !== e.digest) throw new StoreIOError('UNSAFE')
      e.state = 'READY'
      return 'NOT_REPLACED'
    }))
  }
}
