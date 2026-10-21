import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS, type ExerciseEndReason } from '../../../../shared/contracts/exercise'
import { DomainError } from '../../../errors/app-error'
import type { ExerciseExecutionPhase } from './exercise-runtime-adapter'

export interface ExerciseClock {
  now(): number
  schedule(callback: () => void, ms: number): () => void
}
export const exerciseClock: ExerciseClock = {
  now: () => performance.now(),
  schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
}
export function exerciseCoreError(reason: string): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', operation: 'exercise:core',
    message: 'Learning execution or cleanup could not complete safely.', details: { reason }, retryable: true })
}

/** Budgets are immutable policy; only the monotonic clock is injectable in tests. */
export class ExerciseLimits {
  readonly operationDeadline: number
  readonly controller = new AbortController()
  reason: ExerciseEndReason | null = null
  private cancelOperation: () => void
  constructor(readonly clock: ExerciseClock = exerciseClock) {
    this.operationDeadline = clock.now() + EXERCISE_LIMITS.operationMs
    this.cancelOperation = clock.schedule(() => this.cancel('OPERATION_TIMEOUT'), EXERCISE_LIMITS.operationMs)
  }
  cancel(reason: ExerciseEndReason): void {
    if (this.reason !== null) return
    this.reason = reason
    this.cancelOperation()
    this.controller.abort(exerciseCoreError(reason))
  }
  phaseDeadline(phase: ExerciseExecutionPhase): number {
    const budget = phase === 'prepare' ? EXERCISE_LIMITS.prepareMs
      : phase === 'compile' ? EXERCISE_LIMITS.compileMs : EXERCISE_LIMITS.executeCaseMs
    return Math.min(this.operationDeadline, this.clock.now() + budget)
  }
  async phase<T>(phase: ExerciseExecutionPhase, work: (deadline: number) => Promise<T>): Promise<T> {
    if (this.clock.now() >= this.operationDeadline) this.cancel('OPERATION_TIMEOUT')
    if (this.controller.signal.aborted) throw this.controller.signal.reason
    const due = this.phaseDeadline(phase)
    const reason = due === this.operationDeadline ? 'OPERATION_TIMEOUT'
      : phase === 'prepare' ? 'PREPARE_TIMEOUT' : phase === 'compile' ? 'COMPILE_TIMEOUT' : 'EXECUTE_TIMEOUT'
    const cancelTimer = this.clock.schedule(() => this.cancel(reason), Math.max(0, due - this.clock.now()))
    let remove = () => {}
    const aborted = new Promise<never>((_, reject) => {
      const listener = () => reject(this.controller.signal.reason)
      this.controller.signal.addEventListener('abort', listener, { once: true })
      remove = () => this.controller.signal.removeEventListener('abort', listener)
    })
    try {
      const result = await Promise.race([Promise.resolve().then(() => work(due)), aborted])
      // A blocked event loop must not turn a result arriving after due into success.
      if (this.clock.now() >= due) { this.cancel(reason); throw this.controller.signal.reason }
      return result
    } catch (error) {
      if (this.clock.now() >= due) this.cancel(reason)
      if (this.controller.signal.aborted) throw this.controller.signal.reason
      throw error
    } finally { cancelTimer(); remove() }
  }
  finishOperation(): void { this.cancelOperation() }
  /** This races only the caller. It never cancels/forgets the underlying task. */
  async waitCleanup<T>(task: Promise<T>): Promise<T> {
    return waitForExerciseCleanup(task, this.clock)
  }
}

export async function waitForExerciseCleanup<T>(task: Promise<T>, clock: ExerciseClock = exerciseClock): Promise<T> {
  const due = clock.now() + EXERCISE_LIMITS.cleanupWaitMs
  let cancel = () => {}
  const deadline = new Promise<never>((_, reject) => {
    cancel = clock.schedule(() => reject(exerciseCoreError('CLEANUP_DEADLINE')), EXERCISE_LIMITS.cleanupWaitMs)
  })
  try {
    const result = await Promise.race([task, deadline])
    if (clock.now() >= due) throw exerciseCoreError('CLEANUP_DEADLINE')
    return result
  } catch (error) {
    if (clock.now() >= due) throw exerciseCoreError('CLEANUP_DEADLINE')
    throw error
  } finally { cancel() }
}
