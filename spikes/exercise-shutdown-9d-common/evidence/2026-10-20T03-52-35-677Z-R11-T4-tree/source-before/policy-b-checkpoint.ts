// @ts-nocheck -- Spike-only records, not a production persistence API.
import { open, readFile, rename, mkdir, lstat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const ranks = { OWNED: 0, RELEASE_READY: 1, FINALIZED: 2, CLEANUP_COMPLETE: 3 }
export function failure(kind, message) { return Object.assign(new Error(message), { kind }) }
export function recordPaths(root, sessionId) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw failure('OWNERSHIP', 'Invalid session identity')
  return { workspace: join(root, 'sessions', `session-${sessionId}`), recordPath: join(root, 'dispositions', `${sessionId}.json`), leasePath: join(root, 'leases', `${sessionId}.lock`) }
}
export async function identity(path) {
  const s = await lstat(path, { bigint: true })
  if (!s.isDirectory() || s.isSymbolicLink()) throw failure('OWNERSHIP', 'Workspace identity/reparse failure')
  return { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }
}
export function validateRecord(r, root) {
  if (!r || r.schemaVersion !== 2 || !Object.hasOwn(ranks, r.checkpoint) || r.revision !== ranks[r.checkpoint]) throw failure('PERSISTENCE', 'Invalid checkpoint schema')
  const p = recordPaths(resolve(root), r.sessionId)
  if (r.owner !== `exercise:${r.sessionId}` || r.root !== resolve(root) || r.workspace !== p.workspace || !r.workspaceIdentity || !r.hostEpoch) throw failure('OWNERSHIP', 'Checkpoint scope/owner mismatch')
  if (r.checkpoint !== 'OWNED') {
    const proof = r.proof
    if (!proof || !['VERIFIED', 'HISTORY_UNVERIFIED'].includes(proof.kind) || !proof.allRetainedSignaled || !proof.jobEmpty || !proof.observerSettled || proof.unresolvedErrors !== 0) throw failure('PERSISTENCE', 'Missing termination evidence')
    if (proof.kind === 'HISTORY_UNVERIFIED' && (r.processClean || r.cleanupComplete || r.workspaceState !== 'QUARANTINED')) throw failure('PERSISTENCE', 'Historical gap mislabeled clean')
  }
  if (r.checkpoint === 'RELEASE_READY' && (r.finalized || r.processClean || r.cleanupComplete)) throw failure('PERSISTENCE', 'Unreleased record claims finalization')
  if (r.checkpoint === 'FINALIZED' || r.checkpoint === 'CLEANUP_COMPLETE') {
    if (!r.finalized || r.nativeStage !== 'HANDLES_CLOSED' || r.processClean !== (r.proof.kind === 'VERIFIED')) throw failure('PERSISTENCE', 'Invalid finalization evidence')
  }
  if (r.checkpoint === 'CLEANUP_COMPLETE' && (!r.processClean || !r.cleanupComplete || r.workspaceState !== 'REMOVED')) throw failure('PERSISTENCE', 'Invalid complete record')
  return r
}
export async function readCheckpoint(path, root) {
  if (dirname(resolve(path)) !== join(resolve(root), 'dispositions')) throw failure('OWNERSHIP', 'Record path outside dispositions')
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw failure('PERSISTENCE', 'Unsafe checkpoint file')
  const r = validateRecord(JSON.parse(await readFile(path, 'utf8')), root)
  if (recordPaths(root, r.sessionId).recordPath !== path) throw failure('OWNERSHIP', 'Record/session identity mismatch')
  return r
}
export async function acknowledge(path, record, inject = () => {}) {
  validateRecord(record, record.root)
  try {
    let previous
    try { previous = await readCheckpoint(path, record.root) } catch (e) { if (e.code !== 'ENOENT') throw e }
    if (previous && previous.revision > record.revision) throw failure('PERSISTENCE', 'Checkpoint regression refused')
    const body = JSON.stringify(record)
    if (!previous || JSON.stringify(previous) !== body) {
      inject(record.checkpoint, 'before-write')
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      const f = await open(temporary, 'wx')
      try { await f.writeFile(body); await f.sync() } finally { await f.close() }
      inject(record.checkpoint, 'before-replace')
      await rename(temporary, path)
    }
    inject(record.checkpoint, 'before-readback')
    const written = await readCheckpoint(path, record.root)
    if (JSON.stringify(written) !== body) throw failure('PERSISTENCE', 'Checkpoint read-back mismatch')
    return written
  } catch (e) { throw Object.assign(e, { kind: 'PERSISTENCE' }) }
}
