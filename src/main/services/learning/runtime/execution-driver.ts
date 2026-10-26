import { isPromise } from 'node:util/types'
import type { ExerciseRuntimeAdapter } from './exercise-runtime-adapter'
import type { ExerciseSession } from './exercise-session'
import { exerciseCoreError } from './exercise-limits'
import type { OfficialCaseObservation, OfficialSettledCaseConsumer } from './official-execution-contracts'

export interface ExecutionDriverState {
  disposition: 'EXHAUSTED' | 'CONSUMER_STOP' | 'EXECUTION_FAILURE' | 'INVALIDATED'
  failure?: unknown
  consumerFailure: boolean
}
export const executionDriverState = (): ExecutionDriverState => ({ disposition: 'EXHAUSTED', consumerFailure: false })

/** Borrow the bounded runtime payload, without a second retained actual clone. */
function immutableCase(row: OfficialCaseObservation): Readonly<OfficialCaseObservation> {
  if (row.kind === 'RETURNED' && Array.isArray(row.actual)) {
    for (const item of row.actual) if (Array.isArray(item)) Object.freeze(item)
    Object.freeze(row.actual)
  }
  if (row.process) Object.freeze(row.process)
  return Object.freeze(row)
}

/** Same admitted Core and exact binding identity for Run and Official. No
 * admission, timers, public result mapping, comparator or content-release owner. */
export async function runExecutionDriver(session: ExerciseSession, adapter: ExerciseRuntimeAdapter & { hasNextCase(): boolean }, options: {
  language: 'csharp' | 'javascript'
  progress?: () => void
  current?: () => boolean
  consumer?: OfficialSettledCaseConsumer
  currentCase?: () => OfficialCaseObservation | undefined
}, state = executionDriverState()): Promise<ExecutionDriverState> {
  session.claimOrchestration(adapter)
  const check = () => {
    session.limits.checkOperation()
    if (options.current && !options.current()) throw exerciseCoreError('RESULT_INVALIDATED')
  }
  const phase = async (name: 'prepare' | 'compile' | 'execute') => {
    const pending = session.runPhase(name)
    if (options.language === 'csharp') options.progress?.()
    await pending
    options.progress?.()
  }
  try {
    check(); await phase('prepare')
    if (options.language === 'javascript') await session.verifyExecutionBarrier()
    check(); await phase('compile'); await session.verifyExecutionBarrier()
    let index = 0
    while (adapter.hasNextCase()) {
      check(); await phase('execute'); await session.verifyExecutionBarrier(); check()
      if (options.consumer) {
        const row = options.currentCase?.()
        if (!row || row.caseIndex !== index || row.kind !== 'RETURNED') throw exerciseCoreError('OFFICIAL_OBSERVATION_INVALID')
        const observation = immutableCase(row)
        check()
        let decision: unknown
        try {
          decision = options.consumer(observation)
          if (decision !== 'CONTINUE' && decision !== 'STOP') {
            // Reject async hooks without awaiting/owning an async consumer. Drain
            // native Promise rejection only; never invoke arbitrary then getters.
            if (isPromise(decision)) void Promise.prototype.then.call(decision, undefined, () => {})
            throw exerciseCoreError('OFFICIAL_CONSUMER_FAILED')
          }
        } catch {
          state.consumerFailure = true
          check() // A throwing/invalid hook cannot hide an expired trusted deadline.
          throw exerciseCoreError('OFFICIAL_CONSUMER_FAILED')
        }
        check()
        if (decision === 'STOP') { state.disposition = 'CONSUMER_STOP'; break }
      }
      index++
    }
    check()
  } catch (error) {
    state.failure = error
    state.disposition = options.current && !options.current() ? 'INVALIDATED' : 'EXECUTION_FAILURE'
  }
  // State is retained before close: a failed/12s caller wait never restarts cases.
  await session.close(options.consumer && state.failure ? 'INTERNAL_ERROR' : 'COMPLETED')
  return state
}
