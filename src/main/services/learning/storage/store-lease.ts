import { DomainError } from '../../../errors/app-error'
import type { SubmissionStoreFiles } from './store-files'

export type StoreIOReason = 'MISSING' | 'BUSY' | 'PERMISSION' | 'UNSAFE' | 'IO' | 'UNAVAILABLE' | 'FULL' | 'CONFLICT' | 'TOO_LARGE' | 'INVALID_INPUT'
export class StoreIOError extends DomainError {
  constructor(readonly reason: StoreIOReason, readonly replacementDispatched = false) {
    super({ code: reason === 'MISSING' ? 'NOT_FOUND' : reason === 'PERMISSION' ? 'PERMISSION_DENIED'
      : reason === 'UNSAFE' || reason === 'INVALID_INPUT' || reason === 'CONFLICT' ? 'INVALID_INPUT' : 'PROCESS_FAILED',
    operation: 'learning:store-files', message: 'Learning storage is unavailable or could not be safely accessed.',
    retryable: ['BUSY', 'PERMISSION', 'IO'].includes(reason), details: { reason, replacementDispatched } })
  }
}
export function storeIOError(error: unknown, dispatched = false): StoreIOError {
  if (error instanceof StoreIOError) return dispatched ? new StoreIOError(error.reason, true) : error
  const e = error && typeof error === 'object' ? error as { code?: unknown; win32?: unknown } : {}
  const reason: StoreIOReason = e.code === 'ENOSPC' || e.code === 'EDQUOT' ? 'FULL' : e.code === 'ENOENT' ? 'MISSING'
    : e.code === 'EBUSY' || e.code === 'EEXIST' || e.win32 === 32 || e.win32 === 33 ? 'BUSY'
      : e.code === 'EACCES' || e.code === 'EPERM' || e.win32 === 5 ? 'PERMISSION'
        : ['ELOOP', 'ENOTDIR', 'EISDIR'].includes(String(e.code)) ? 'UNSAFE' : 'IO'
  return new StoreIOError(reason, dispatched)
}
/** Only these existing native primitives are used; no process/Job capability. */
export interface StoreLeaseNativePort {
  readonly capability: 'student-ide-learning-job-v1'
  acquireLease(path: string): object | null
  observation(handle: object, operation: 'close'): void
}
export interface StoreLease {
  readonly state: 'HELD' | 'RELEASING' | 'CLOSE_FAILED' | 'RELEASED'
  release(): Promise<void>
}
const leases = new WeakMap<StoreLease, SharedSubmissionStoreLease>()

/** One OS lock for both stores. No admission queue, stale-lock deletion or fallback. */
export class SharedSubmissionStoreLease {
  private handle?: object
  private acquiring = false
  private releasing?: Promise<void>
  private failedClose = false
  private uses = 0
  private token?: StoreLease
  constructor(readonly files: SubmissionStoreFiles, private readonly native: StoreLeaseNativePort) {
    if (native?.capability !== 'student-ide-learning-job-v1' || typeof native.acquireLease !== 'function'
      || typeof native.observation !== 'function') throw new StoreIOError('UNAVAILABLE')
  }
  get ownsLease(): boolean { return this.handle !== undefined }
  async acquire(): Promise<StoreLease> {
    if (this.acquiring || this.handle || this.releasing) throw new StoreIOError('BUSY')
    this.acquiring = true
    try {
      const before = await this.files.inspectLock()
      const path = this.files.lockPath
      const handle = this.native.acquireLease(path)
      if (!handle) throw new StoreIOError('BUSY')
      this.handle = handle
      const after = await this.files.inspectLock()
      if (!after || before && !this.files.sameIdentity(before, after)) throw new StoreIOError('UNSAFE')
      const state = (): StoreLease['state'] => this.token !== token || !this.handle ? 'RELEASED'
        : this.releasing ? 'RELEASING' : this.failedClose ? 'CLOSE_FAILED' : 'HELD'
      const token: StoreLease = Object.freeze({
        get state() { return state() },
        release: () => this.token === token ? this.retryRelease() : Promise.resolve(),
      })
      this.token = token; leases.set(token, this)
      return token
    } catch (error) {
      if (this.handle) {
        try { this.native.observation(this.handle, 'close'); this.handle = undefined }
        catch { this.failedClose = true; throw new StoreIOError('IO') }
      }
      throw storeIOError(error)
    } finally { this.acquiring = false }
  }
  /** Failed native close retains the strong handle and revokes write use until retry. */
  retryRelease(): Promise<void> {
    if (this.releasing) return this.releasing
    if (!this.handle) return Promise.resolve()
    if (this.acquiring || this.uses || this.files.hasRetainedResources) return Promise.reject(new StoreIOError('BUSY'))
    const work = Promise.resolve().then(() => {
      try { this.native.observation(this.handle!, 'close'); this.handle = undefined; this.token = undefined; this.failedClose = false }
      catch (error) { this.failedClose = true; throw storeIOError(error) }
    })
    this.releasing = work
    void work.finally(() => { if (this.releasing === work) this.releasing = undefined }).catch(() => {})
    return work
  }
  /** Internal borrow lasts through original I/O; release cannot race a pending write. */
  async use<T>(files: SubmissionStoreFiles, token: StoreLease, work: () => Promise<T>): Promise<T> {
    if (files !== this.files || token !== this.token || !this.handle || this.acquiring || this.releasing || this.failedClose
      || this.uses || files.pendingHandles) throw new StoreIOError('BUSY')
    this.uses++
    try { return await work() } finally { this.uses-- }
  }
}
/** Tokens are authenticated by module-private identity, never a boolean/string. */
export function withStoreLease<T>(files: SubmissionStoreFiles, token: StoreLease, work: () => Promise<T>): Promise<T> {
  const owner = leases.get(token)
  if (!owner) return Promise.reject(new StoreIOError('UNSAFE'))
  return owner.use(files, token, work)
}
