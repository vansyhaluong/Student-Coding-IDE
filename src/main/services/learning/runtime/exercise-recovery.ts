import { makeExerciseCheckpoint, validateExerciseCheckpoint, type ExerciseCheckpointStore } from './exercise-checkpoint'
import { exerciseCoreError, waitForExerciseCleanup, type ExerciseClock } from './exercise-limits'
import type { ExerciseWorkspace } from './exercise-workspace'

/** Requires a fresh workspace/lease object; never adopts a live session object. */
type RecoveryResult = 'QUARANTINED' | 'ALREADY_COMPLETE' | 'CLEANUP_COMPLETE'
const tasks = new WeakMap<ExerciseWorkspace, Promise<RecoveryResult>>()
export function recoverExercise(workspace: ExerciseWorkspace, store: ExerciseCheckpointStore, clock?: ExerciseClock): Promise<RecoveryResult> {
  let task = tasks.get(workspace)
  if (!task) {
    task = Promise.resolve().then(() => recover(workspace, store))
    tasks.set(workspace, task)
    void task.finally(() => { if (tasks.get(workspace) === task) tasks.delete(workspace) }).catch(() => {})
  }
  return waitForExerciseCleanup(task, clock)
}
async function recover(workspace: ExerciseWorkspace, store: ExerciseCheckpointStore): Promise<RecoveryResult> {
  await workspace.acquire()
  try {
    // The store rereads under the exclusive lease and validates schema/session scope.
    const record = validateExerciseCheckpoint(await store.read())
    if (record.sessionId !== workspace.sessionId) throw exerciseCoreError('CHECKPOINT_SCOPE')
    if (record.checkpoint === 'OWNED' || record.checkpoint === 'RELEASE_READY' || record.proof === 'HISTORY_UNVERIFIED') {
      return 'QUARANTINED'
    }
    if (record.checkpoint === 'CLEANUP_COMPLETE') return 'ALREADY_COMPLETE'
    await workspace.remove(record.workspaceIdentity)
    await store.write(makeExerciseCheckpoint(record, 'CLEANUP_COMPLETE', record.proof))
    return 'CLEANUP_COMPLETE'
  } finally { await workspace.releaseLease() }
}
