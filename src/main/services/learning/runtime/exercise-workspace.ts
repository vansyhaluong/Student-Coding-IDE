import { lstat, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { isExerciseSessionId } from '../../../../shared/contracts/exercise-validation'
import { exerciseCoreError } from './exercise-limits'
import type { ExerciseLease, ExerciseLeaseProvider } from './exercise-runtime-adapter'

export interface ExerciseWorkspaceIdentity { dev: string; ino: string; birthtimeNs: string }
export async function workspaceIdentity(path: string): Promise<ExerciseWorkspaceIdentity> {
  const stat = await lstat(path, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw exerciseCoreError('WORKSPACE_IDENTITY')
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) }
}
export function sameWorkspace(a: ExerciseWorkspaceIdentity, b: ExerciseWorkspaceIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
}
/** Reject symlinks/junctions in every existing ancestor, including the trusted root. */
export async function assertExerciseDirectory(path: string): Promise<void> {
  const absolute = resolve(path), parent = dirname(absolute)
  if (parent !== absolute) await assertExerciseDirectory(parent)
  const s = await lstat(absolute)
  if (!s.isDirectory() || s.isSymbolicLink()) throw exerciseCoreError('WORKSPACE_CONTAINMENT')
}
export async function ensureExerciseDirectory(path: string): Promise<void> {
  const absolute = resolve(path)
  try { await assertExerciseDirectory(absolute) }
  catch (e) {
    if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT') throw e
    const parent = dirname(absolute)
    if (parent === parse(absolute).root && parent === absolute) throw e
    await ensureExerciseDirectory(parent)
    try { await mkdir(absolute) } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
    await assertExerciseDirectory(absolute)
  }
}

export class ExerciseWorkspace {
  readonly root: string
  readonly path: string
  identity?: ExerciseWorkspaceIdentity
  private lease?: ExerciseLease
  constructor(root: string, readonly sessionId: string, private readonly leases: ExerciseLeaseProvider) {
    if (!isExerciseSessionId(sessionId)) throw exerciseCoreError('WORKSPACE_SESSION')
    this.root = resolve(root)
    this.path = join(this.root, 'sessions', sessionId)
  }
  get ownsLease(): boolean { return this.lease !== undefined }
  async acquire(): Promise<void> {
    if (this.lease) return
    const lease = await this.leases.acquire(this.sessionId)
    if (!lease) throw exerciseCoreError('OWNERSHIP')
    this.lease = lease
  }
  async prepare(): Promise<void> {
    await this.acquire()
    await ensureExerciseDirectory(join(this.root, 'sessions'))
    await mkdir(this.path) // Never adopt or overwrite an existing session directory.
    this.identity = await workspaceIdentity(this.path)
  }
  async releaseLease(): Promise<void> {
    if (!this.lease) return
    await this.lease.release()
    this.lease = undefined
  }
  async remove(expected: ExerciseWorkspaceIdentity): Promise<void> {
    if (!this.ownsLease) throw exerciseCoreError('OWNERSHIP')
    await assertExerciseDirectory(join(this.root, 'sessions'))
    let current: ExerciseWorkspaceIdentity
    try { current = await workspaceIdentity(this.path) } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return
      throw e
    }
    if (!sameWorkspace(current, expected)) throw exerciseCoreError('WORKSPACE_REPLACED')
    const inspect = async (path: string): Promise<void> => {
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw exerciseCoreError('WORKSPACE_REPARSE')
      if (stat.isDirectory()) for (const name of await readdir(path)) await inspect(join(path, name))
    }
    await inspect(this.path)
    // Recheck identity after traversal; never follow a replacement root on delete.
    if (!sameWorkspace(await workspaceIdentity(this.path), expected)) throw exerciseCoreError('WORKSPACE_REPLACED')
    await rm(this.path, { recursive: true, force: false, maxRetries: 0 })
  }
}
