// @ts-nocheck -- Learning-only spike recovery. Never looks up or kills a PID.
import { lstat, readdir, rm } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { readCheckpoint, recordPaths, identity, acknowledge, failure } from './policy-b-checkpoint'

export async function safeRemove(root, workspace, expectedIdentity, denied = false) {
  if (dirname(resolve(workspace)) !== resolve(root) || !/^session-[0-9a-f-]{36}$/.test(workspace.slice(workspace.lastIndexOf('\\') + 1))) throw failure('OWNERSHIP', 'Unsafe workspace containment')
  let current
  try { current = await identity(workspace) } catch (e) { if (e.code === 'ENOENT') return; throw e }
  if (expectedIdentity && JSON.stringify(current) !== JSON.stringify(expectedIdentity)) throw failure('OWNERSHIP', 'Workspace identity changed')
  async function check(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw failure('OWNERSHIP', 'Workspace reparse point')
    if (info.isDirectory()) for (const name of await readdir(path)) await check(join(path, name))
  }
  await check(workspace)
  if (denied) throw Object.assign(failure('WORKSPACE', 'Injected EACCES'), { code: 'EACCES' })
  try { await rm(workspace, { recursive: true, force: false, maxRetries: 0 }) }
  catch (e) { throw Object.assign(e, { kind: 'WORKSPACE' }) }
}
export async function recover(root, recordPath, native) {
  const record = await readCheckpoint(recordPath, root)
  const paths = recordPaths(root, record.sessionId)
  const lease = native.acquireLease(paths.leasePath)
  if (!lease) throw failure('OWNERSHIP', 'Workspace owner still active')
  try {
    // Reread under exclusive ownership, never trust a pre-lease snapshot.
    const r = await readCheckpoint(recordPath, root)
    if (r.checkpoint === 'OWNED' || r.checkpoint === 'RELEASE_READY' || r.proof?.kind === 'HISTORY_UNVERIFIED') {
      return { action: 'QUARANTINED', record: r, processClean: false, cleanupComplete: false }
    }
    if (r.checkpoint === 'CLEANUP_COMPLETE') return { action: 'ALREADY_COMPLETE', record: r }
    if (!r.processClean || !r.finalized || r.workspaceState !== 'DELETE_PENDING') throw failure('PERSISTENCE', 'Recovery deletion not authorized')
    await safeRemove(join(root, 'sessions'), r.workspace, r.workspaceIdentity)
    const completed = { ...r, revision: 3, checkpoint: 'CLEANUP_COMPLETE', workspaceState: 'REMOVED', cleanupComplete: true }
    await acknowledge(recordPath, completed)
    return { action: 'CLEANUP_COMPLETE', record: completed }
  } finally { native.closeHandle(lease) }
}
