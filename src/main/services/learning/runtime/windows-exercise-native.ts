import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DomainError } from '../../../errors/app-error'
import type { ExerciseProcessIdentity } from './exercise-runtime-adapter'

export interface LearningJobSample {
  rootPid: number
  members: number[]
  retained: (ExerciseProcessIdentity & { signaled: boolean })[]
  activeProcesses: number
  totalProcesses: number
  coverageComplete: boolean
  observerSettled: boolean
  exitCode: number
  quotaBytes: number
  peakJobCommitBytes: number
  reportedJobCommitBytes: number
  events: { message: number; pid: number }[]
  stdout: Buffer
  stderr: Buffer
}
export interface LearningNativeBinding {
  capability: 'student-ide-learning-job-v1'
  start(executable: string, args: readonly string[], cwd: string, quotaBytes: number, environment: string[]): object
  poll(job: object): LearningJobSample
  control(job: object, operation: 'resume' | 'terminate' | 'release' | 'closeHandles'): void
  state(job: object): { terminated: boolean; released: boolean; handlesClosed: boolean }
  acquireLease(path: string): object | null
  watch(pid: number): object
  observation(handle: object, operation: 'identity'): ExerciseProcessIdentity & { signaled: boolean }
  observation(handle: object, operation: 'close'): void
}
const nativeCodes = new Set(['LEARNING_ARGUMENT', 'LEARNING_CLOSE', 'LEARNING_CREATE', 'LEARNING_PIPE',
  'LEARNING_IDENTITY', 'LEARNING_OWNERSHIP', 'LEARNING_WAIT', 'LEARNING_QUERY', 'LEARNING_QUOTA',
  'LEARNING_SPAWN', 'LEARNING_NOT_READY', 'LEARNING_TERMINATE', 'LEARNING_LEASE'])
export function mapLearningNativeError(error: unknown): DomainError {
  const detail = error !== null && typeof error === 'object' ? error as Record<string, unknown> : {}
  const nativeCode = typeof detail.code === 'string' && nativeCodes.has(detail.code) ? detail.code : 'LEARNING_NATIVE'
  const win32 = typeof detail.win32 === 'number' && Number.isSafeInteger(detail.win32) && detail.win32 >= 0 ? detail.win32 : 0
  return new DomainError({ code: 'PROCESS_FAILED', operation: 'exercise:native', retryable: true,
    message: 'Learning process ownership or native operation failed.', details: { reason: 'NATIVE_FAILURE', nativeCode, win32 } })
}
export function loadLearningNative(path = join(__dirname, 'native/learning/learning-job.node')): LearningNativeBinding {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new DomainError({ code: 'UNSUPPORTED',
    message: 'Learning native execution requires Windows x64.', operation: 'exercise:native', retryable: false })
  try {
    const module: LearningNativeBinding = createRequire(__filename)(path)
    if (module.capability !== 'student-ide-learning-job-v1'
      || !['start', 'poll', 'control', 'state', 'acquireLease', 'watch', 'observation'].every(k => typeof module[k as keyof LearningNativeBinding] === 'function')) {
      throw Error('Native capability mismatch')
    }
    return module
  } catch {
    throw new DomainError({ code: 'DEPENDENCY_MISSING', operation: 'exercise:native', retryable: false,
      message: 'The Learning native component is unavailable or incompatible.' })
  }
}
