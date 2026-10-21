import { lstat, open, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isExerciseSessionId } from '../../../../shared/contracts/exercise-validation'
import { validateExactObject } from '../../../../shared/contracts/validation'
import { exerciseCoreError } from './exercise-limits'
import { assertExerciseDirectory, ensureExerciseDirectory, type ExerciseWorkspace, type ExerciseWorkspaceIdentity } from './exercise-workspace'

export const EXERCISE_CHECKPOINT_RANK = { OWNED: 0, RELEASE_READY: 1, FINALIZED: 2, CLEANUP_COMPLETE: 3 } as const
export type ExerciseCheckpointStage = keyof typeof EXERCISE_CHECKPOINT_RANK
export type ExerciseFinalProof = 'VERIFIED' | 'HISTORY_UNVERIFIED'
export interface ExerciseCheckpoint {
  schemaVersion: 1
  sessionId: string
  ownerId: string
  hostEpoch: string
  workspaceIdentity: ExerciseWorkspaceIdentity
  checkpoint: ExerciseCheckpointStage
  proof: ExerciseFinalProof | null
  nativeStage: 'OWNED' | 'HANDLES_CLOSED'
  processClean: boolean
  cleanupComplete: boolean
  workspaceState: 'RETAINED' | 'QUARANTINED' | 'DELETE_PENDING' | 'REMOVED'
}
export interface ExerciseCheckpointStore {
  read(): Promise<ExerciseCheckpoint>
  /** Resolve only after write/sync/atomic replace/validated read-back. */
  write(record: ExerciseCheckpoint): Promise<void>
}
export function makeExerciseCheckpoint(base: Pick<ExerciseCheckpoint, 'sessionId' | 'ownerId' | 'hostEpoch' | 'workspaceIdentity'>,
  checkpoint: ExerciseCheckpointStage, proof: ExerciseFinalProof | null): ExerciseCheckpoint {
  const finalized = checkpoint === 'FINALIZED' || checkpoint === 'CLEANUP_COMPLETE'
  return validateExerciseCheckpoint({ ...base, schemaVersion: 1, checkpoint,
    proof: checkpoint === 'OWNED' ? null : proof, nativeStage: finalized ? 'HANDLES_CLOSED' : 'OWNED',
    processClean: finalized && proof === 'VERIFIED', cleanupComplete: checkpoint === 'CLEANUP_COMPLETE',
    workspaceState: proof === 'HISTORY_UNVERIFIED' ? 'QUARANTINED'
      : checkpoint === 'CLEANUP_COMPLETE' ? 'REMOVED' : finalized ? 'DELETE_PENDING' : 'RETAINED' })
}
export function validateExerciseCheckpoint(value: unknown): ExerciseCheckpoint {
  const exact = validateExactObject(value, ['schemaVersion', 'sessionId', 'ownerId', 'hostEpoch', 'workspaceIdentity',
    'checkpoint', 'proof', 'nativeStage', 'processClean', 'cleanupComplete', 'workspaceState'])
  if (!exact.ok) throw exerciseCoreError('CHECKPOINT_SCHEMA')
  const r = exact.value
  const id = validateExactObject(r.workspaceIdentity, ['dev', 'ino', 'birthtimeNs'])
  if (r.schemaVersion !== 1 || !isExerciseSessionId(r.sessionId)
    || typeof r.ownerId !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(r.ownerId)
    || typeof r.hostEpoch !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.hostEpoch)
    || typeof r.checkpoint !== 'string' || !Object.hasOwn(EXERCISE_CHECKPOINT_RANK, r.checkpoint)
    || !id.ok || !['dev', 'ino', 'birthtimeNs'].every(k => typeof id.value[k] === 'string' && /^\d+$/.test(id.value[k] as string))) {
    throw exerciseCoreError('CHECKPOINT_SCHEMA')
  }
  const finalized = r.checkpoint === 'FINALIZED' || r.checkpoint === 'CLEANUP_COMPLETE'
  if (r.checkpoint === 'OWNED' ? r.proof !== null : r.proof !== 'VERIFIED' && r.proof !== 'HISTORY_UNVERIFIED') throw exerciseCoreError('CHECKPOINT_PROOF')
  if (r.nativeStage !== (finalized ? 'HANDLES_CLOSED' : 'OWNED')
    || r.processClean !== (finalized && r.proof === 'VERIFIED')
    || r.cleanupComplete !== (r.checkpoint === 'CLEANUP_COMPLETE')
    || r.workspaceState !== (r.proof === 'HISTORY_UNVERIFIED' ? 'QUARANTINED'
      : r.checkpoint === 'CLEANUP_COMPLETE' ? 'REMOVED' : finalized ? 'DELETE_PENDING' : 'RETAINED')
    || (r.checkpoint === 'CLEANUP_COMPLETE' && r.proof !== 'VERIFIED')) throw exerciseCoreError('CHECKPOINT_STATE')
  // Every field has now been checked; clone so callers cannot mutate stored state.
  return structuredClone(r) as unknown as ExerciseCheckpoint
}

/** Paths derive from a validated identity, never persisted absolute paths or PIDs. */
export class FileExerciseCheckpointStore implements ExerciseCheckpointStore {
  readonly path: string
  private readonly directory: string
  constructor(private readonly workspace: ExerciseWorkspace) {
    this.directory = join(workspace.root, 'checkpoints')
    this.path = join(this.directory, `${workspace.sessionId}.json`)
  }
  private assertOwner(): void { if (!this.workspace.ownsLease) throw exerciseCoreError('OWNERSHIP') }
  async read(): Promise<ExerciseCheckpoint> {
    this.assertOwner()
    await assertExerciseDirectory(this.directory)
    const stat = await lstat(this.path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw exerciseCoreError('CHECKPOINT_FILE')
    const r = validateExerciseCheckpoint(JSON.parse(await readFile(this.path, 'utf8')))
    if (r.sessionId !== this.workspace.sessionId) throw exerciseCoreError('CHECKPOINT_SCOPE')
    return r
  }
  async write(record: ExerciseCheckpoint): Promise<void> {
    this.assertOwner()
    const r = validateExerciseCheckpoint(record)
    if (r.sessionId !== this.workspace.sessionId) throw exerciseCoreError('CHECKPOINT_SCOPE')
    await ensureExerciseDirectory(this.directory)
    let previous: ExerciseCheckpoint | undefined
    try { previous = await this.read() } catch (e) {
      if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT') throw e
    }
    const body = JSON.stringify(r)
    if (previous) {
      if (previous.ownerId !== r.ownerId || previous.hostEpoch !== r.hostEpoch
        || JSON.stringify(previous.workspaceIdentity) !== JSON.stringify(r.workspaceIdentity)
        || EXERCISE_CHECKPOINT_RANK[previous.checkpoint] > EXERCISE_CHECKPOINT_RANK[r.checkpoint]
        || EXERCISE_CHECKPOINT_RANK[r.checkpoint] > EXERCISE_CHECKPOINT_RANK[previous.checkpoint] + 1
        || (previous.checkpoint === r.checkpoint && JSON.stringify(previous) !== body)
        || (previous.proof !== null && previous.proof !== r.proof)) throw exerciseCoreError('CHECKPOINT_REGRESSION')
    }
    if (!previous && r.checkpoint !== 'OWNED') throw exerciseCoreError('CHECKPOINT_REGRESSION')
    if (!previous || JSON.stringify(previous) !== body) {
      const temporary = `${this.path}.${randomUUID()}.tmp`
      const file = await open(temporary, 'wx')
      try { await file.writeFile(body); await file.sync() } finally { await file.close() }
      await assertExerciseDirectory(this.directory)
      await rename(temporary, this.path)
    }
    if (JSON.stringify(await this.read()) !== body) throw exerciseCoreError('CHECKPOINT_READBACK')
  }
}
