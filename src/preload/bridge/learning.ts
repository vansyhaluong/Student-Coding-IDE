import { isLearningCourse, LEARNING_CHANNELS, type LearningApi } from '../../shared/contracts/learning'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { createPracticeBridge } from './practice'
import { createExerciseBridge } from './exercise'
import { createSubmissionBridge } from './submission'
import { createLearningOrder } from './learning-order'

export function createLearningBridge(ipc: IpcRendererLike): LearningApi {
  const order = createLearningOrder()
  return { exercise: createExerciseBridge(ipc, undefined, order), submission: createSubmissionBridge(ipc, undefined, order), practice: createPracticeBridge(ipc), getCourse: async () => parseAppResult(await invokeSafely(ipc, LEARNING_CHANNELS.getCourse, {}),
    isLearningCourse, LEARNING_CHANNELS.getCourse) }
}
