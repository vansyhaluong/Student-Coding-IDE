import { isLearningCourse, LEARNING_CHANNELS, type LearningApi } from '../../shared/contracts/learning'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { createPracticeBridge } from './practice'

export function createLearningBridge(ipc: IpcRendererLike): LearningApi {
  return { practice: createPracticeBridge(ipc), getCourse: async () => parseAppResult(await invokeSafely(ipc, LEARNING_CHANNELS.getCourse, {}),
    isLearningCourse, LEARNING_CHANNELS.getCourse) }
}
