import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseWorkspace, workspaceIdentity } from '../../src/main/services/learning/runtime/exercise-workspace'
import { FileExerciseCheckpointStore, makeExerciseCheckpoint, validateExerciseCheckpoint,
  type ExerciseCheckpointStore, type ExerciseFinalProof } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { recoverExercise } from '../../src/main/services/learning/runtime/exercise-recovery'
import type { ExerciseLeaseProvider } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'

const sessionId = 'exercise_12345678-1234-4234-8234-123456789abc'
const hostEpoch = '12345678-1234-4234-8234-123456789abc'
const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'exercise-core-')); roots.push(root)
  const active = new Set<string>()
  const release = vi.fn(async (id: string) => { active.delete(id) })
  const leases: ExerciseLeaseProvider = { acquire: vi.fn(async id => {
    if (active.has(id)) return null
    active.add(id); return { release: () => release(id) }
  }) }
  const workspace = new ExerciseWorkspace(root, sessionId, leases)
  const store = new FileExerciseCheckpointStore(workspace)
  await workspace.prepare()
  const base = { sessionId, hostEpoch, ownerId: 'owner-1', workspaceIdentity: workspace.identity! }
  async function seed(proof: ExerciseFinalProof = 'VERIFIED') {
    await store.write(makeExerciseCheckpoint(base, 'OWNED', null))
    await store.write(makeExerciseCheckpoint(base, 'RELEASE_READY', proof))
    await store.write(makeExerciseCheckpoint(base, 'FINALIZED', proof))
  }
  function fresh() {
    const next = new ExerciseWorkspace(root, sessionId, leases)
    return { workspace: next, store: new FileExerciseCheckpointStore(next) }
  }
  return { root, leases, workspace, store, base, seed, fresh, release, active }
}
afterEach(async () => {
  vi.useRealTimers()
  for (const root of roots.splice(0)) {
    // Recursive removal is limited to this test's mkdtemp children.
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('exercise-core-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  }
})

describe('Learning workspace and checkpoint filesystem scope', () => {
  it('derives paths solely from session identity and rejects traversal/absolute identities', async () => {
    const f = await fixture()
    for (const id of ['../outside', 'C:\\outside', '..', 'exercise_123']) {
      expect(() => new ExerciseWorkspace(f.root, id, f.leases)).toThrow()
    }
    expect(f.workspace.path).toBe(join(f.root, 'sessions', sessionId))
    await f.workspace.releaseLease()
  })

  it('rejects another owner and never adopts an existing session directory', async () => {
    const f = await fixture(), next = f.fresh()
    await expect(next.workspace.acquire()).rejects.toThrow()
    await f.workspace.releaseLease()
    await expect(next.workspace.prepare()).rejects.toThrow()
    expect(await workspaceIdentity(f.workspace.path)).toEqual(f.base.workspaceIdentity)
    await next.workspace.releaseLease()
  })

  it('requires lease plus exact directory identity; deletion is idempotent only after a safe removal', async () => {
    const f = await fixture()
    await expect(f.workspace.remove({ ...f.base.workspaceIdentity, ino: '0' })).rejects.toThrow()
    await f.workspace.remove(f.base.workspaceIdentity)
    await f.workspace.remove(f.base.workspaceIdentity)
    await f.workspace.releaseLease()
    await expect(f.workspace.remove(f.base.workspaceIdentity)).rejects.toThrow()
  })

  it('rejects a junction/symlink descendant without touching its target', async () => {
    const f = await fixture(), outside = await fixture()
    const sentinel = join(outside.workspace.path, 'keep.txt'); await writeFile(sentinel, 'keep')
    await symlink(outside.workspace.path, join(f.workspace.path, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(f.workspace.remove(f.base.workspaceIdentity)).rejects.toThrow()
    expect(await readFile(sentinel, 'utf8')).toBe('keep')
    await f.workspace.releaseLease(); await outside.workspace.releaseLease()
  })

  it('rejects reparse ancestors for workspace creation and checkpoint writes', async () => {
    const f = await fixture(), outside = await fixture()
    const alias = join(f.root, 'alias')
    await symlink(outside.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const aliased = new ExerciseWorkspace(alias, 'exercise_22345678-1234-4234-8234-123456789abc', f.leases)
    await expect(aliased.prepare()).rejects.toThrow()
    await symlink(outside.root, join(f.root, 'checkpoints'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(f.store.write(makeExerciseCheckpoint(f.base, 'OWNED', null))).rejects.toThrow()
    await aliased.releaseLease(); await f.workspace.releaseLease(); await outside.workspace.releaseLease()
  })

  it('round-trips acknowledged records, rejects regressions, stage skips and changed ownership', async () => {
    const f = await fixture()
    await expect(f.store.write(makeExerciseCheckpoint(f.base, 'FINALIZED', 'VERIFIED'))).rejects.toThrow()
    await f.store.write(makeExerciseCheckpoint(f.base, 'OWNED', null))
    await expect(f.store.write(makeExerciseCheckpoint(f.base, 'CLEANUP_COMPLETE', 'VERIFIED'))).rejects.toThrow()
    await expect(f.store.write(makeExerciseCheckpoint({ ...f.base, ownerId: 'other-owner' }, 'RELEASE_READY', 'VERIFIED'))).rejects.toThrow()
    await f.seed()
    expect(await f.store.read()).toEqual(makeExerciseCheckpoint(f.base, 'FINALIZED', 'VERIFIED'))
    await f.store.write(makeExerciseCheckpoint(f.base, 'FINALIZED', 'VERIFIED')) // read-back retry, same immutable payload
    await expect(f.store.write(makeExerciseCheckpoint(f.base, 'RELEASE_READY', 'VERIFIED'))).rejects.toThrow()
    await expect(f.store.write(makeExerciseCheckpoint(f.base, 'FINALIZED', 'HISTORY_UNVERIFIED'))).rejects.toThrow()
    await f.workspace.releaseLease()
    await expect(f.store.read()).rejects.toThrow()
  })

  it('rejects malformed records, historical PID authority and wrong session scope', async () => {
    const f = await fixture(), owned = makeExerciseCheckpoint(f.base, 'OWNED', null)
    for (const record of [null, { ...owned, pid: 123 }, { ...owned, processClean: true },
      { ...owned, workspace: 'C:\\outside' }, { ...owned, workspaceIdentity: { ...owned.workspaceIdentity, extra: 1 } },
      { ...owned, hostEpoch: 'invalid' }, { ...owned, checkpoint: 'FINALIZED', proof: 'VERIFIED' }]) {
      expect(() => validateExerciseCheckpoint(record)).toThrow()
    }
    await f.store.write(owned)
    await writeFile(f.store.path, JSON.stringify({ ...owned, sessionId: 'exercise_22345678-1234-4234-8234-123456789abc' }))
    await expect(f.store.read()).rejects.toThrow()
    await writeFile(f.store.path, '{broken')
    await expect(f.store.read()).rejects.toThrow()
    await f.workspace.releaseLease()
  })
})

describe('Lease-owned Learning recovery', () => {
  it.each(['OWNED', 'RELEASE_READY', 'HISTORY_UNVERIFIED'] as const)('quarantines %s without deleting or using a process adapter', async stage => {
    const f = await fixture()
    if (stage === 'HISTORY_UNVERIFIED') await f.seed('HISTORY_UNVERIFIED')
    else {
      await f.store.write(makeExerciseCheckpoint(f.base, 'OWNED', null))
      if (stage === 'RELEASE_READY') await f.store.write(makeExerciseCheckpoint(f.base, stage, 'VERIFIED'))
    }
    const next = f.fresh(); await expect(recoverExercise(next.workspace, next.store)).rejects.toThrow()
    await f.workspace.releaseLease()
    await expect(recoverExercise(next.workspace, next.store)).resolves.toBe('QUARANTINED')
    expect(await workspaceIdentity(f.workspace.path)).toEqual(f.base.workspaceIdentity)
    expect(next.workspace.ownsLease).toBe(false)
  })

  it('recovers VERIFIED FINALIZED deletion and subsequently returns ALREADY_COMPLETE', async () => {
    const f = await fixture(); await f.seed(); await f.workspace.releaseLease()
    const next = f.fresh()
    await expect(recoverExercise(next.workspace, next.store)).resolves.toBe('CLEANUP_COMPLETE')
    await expect(workspaceIdentity(f.workspace.path)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(recoverExercise(next.workspace, next.store)).resolves.toBe('ALREADY_COMPLETE')
    expect(next.workspace.ownsLease).toBe(false)
  })

  it('retains a replaced/mismatching workspace instead of trusting historical metadata', async () => {
    const f = await fixture()
    await f.store.write(makeExerciseCheckpoint({ ...f.base, workspaceIdentity: { ...f.base.workspaceIdentity, ino: '0' } }, 'OWNED', null))
    for (const stage of ['RELEASE_READY', 'FINALIZED'] as const) {
      await f.store.write(makeExerciseCheckpoint({ ...f.base, workspaceIdentity: { ...f.base.workspaceIdentity, ino: '0' } }, stage, 'VERIFIED'))
    }
    await f.workspace.releaseLease(); const next = f.fresh()
    await expect(recoverExercise(next.workspace, next.store)).rejects.toThrow()
    expect(await workspaceIdentity(f.workspace.path)).toEqual(f.base.workspaceIdentity)
    expect(next.workspace.ownsLease).toBe(false)
  })

  it('dedupes pending recovery I/O across 12s caller deadlines and retains its lease', async () => {
    const f = await fixture(); await f.seed(); await f.workspace.releaseLease()
    const next = f.fresh(); let unblock!: () => void
    const pending = new Promise<void>(r => { unblock = r })
    const ioEntered = new Promise<void>(resolve => {
      const write = next.store.write.bind(next.store)
      vi.spyOn(next.store, 'write').mockImplementation(async r => { resolve(); await pending; await write(r) })
    })
    vi.useFakeTimers()
    const clock = { now: () => Date.now(), schedule: (callback: () => void, ms: number) => {
      const timer = setTimeout(callback, ms); return () => clearTimeout(timer)
    } }
    const first = recoverExercise(next.workspace, next.store, clock)
    const failed = expect(first).rejects.toMatchObject({ details: { reason: 'CLEANUP_DEADLINE' } })
    await ioEntered; await vi.advanceTimersByTimeAsync(12_000); await failed
    expect(next.workspace.ownsLease).toBe(true)
    const retry = recoverExercise(next.workspace, next.store, clock)
    unblock(); await expect(retry).resolves.toBe('CLEANUP_COMPLETE')
    expect(next.store.write).toHaveBeenCalledOnce()
    expect(next.workspace.ownsLease).toBe(false)
  })

  it('revalidates records even for an injected store and releases the recovery lease on failure', async () => {
    const f = await fixture(); await f.workspace.releaseLease(); const next = f.fresh()
    const corrupt = { ...makeExerciseCheckpoint(f.base, 'FINALIZED', 'VERIFIED'), processClean: false }
    const store: ExerciseCheckpointStore = { read: async () => corrupt, write: vi.fn() }
    await expect(recoverExercise(next.workspace, store)).rejects.toThrow()
    expect(store.write).not.toHaveBeenCalled(); expect(next.workspace.ownsLease).toBe(false)
  })
})
