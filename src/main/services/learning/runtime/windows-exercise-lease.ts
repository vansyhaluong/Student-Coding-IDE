import { join, resolve } from 'node:path'
import { isExerciseSessionId } from '../../../../shared/contracts/exercise-validation'
import { ensureExerciseDirectory } from './exercise-workspace'
import { exerciseCoreError } from './exercise-limits'
import { mapLearningNativeError, type LearningNativeBinding } from './windows-exercise-native'
import type { ExerciseLeaseProvider } from './exercise-runtime-adapter'

export class WindowsExerciseLeaseProvider implements ExerciseLeaseProvider {
  private readonly directory: string
  constructor(root: string, private readonly native: LearningNativeBinding) { this.directory = join(resolve(root), 'leases') }
  async acquire(sessionId: string) {
    if (!isExerciseSessionId(sessionId)) throw exerciseCoreError('WORKSPACE_SESSION')
    await ensureExerciseDirectory(this.directory)
    let handle: object | null
    try { handle = this.native.acquireLease(join(this.directory, `${sessionId}.lock`)) }
    catch (error) { throw mapLearningNativeError(error) }
    if (!handle) return null
    let closed = false
    // Keep a strong reference until successful native close. Crash releases the
    // non-inheritable FILE_SHARE_NONE OS handle without deleting/trusting a PID.
    return { release: async () => {
      if (closed) return
      try { this.native.observation(handle, 'close'); closed = true }
      catch (error) { throw mapLearningNativeError(error) }
    } }
  }
}
