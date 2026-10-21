import type { CsharpExecutionResult } from '../../../../shared/contracts/csharp-execution'
import type { CsharpExecutionAdapter } from './csharp-execution-contracts'
import type { ExerciseSession } from './exercise-session'

/** Main-only driver for an ALREADY admitted session. No factory, queue, IPC or UI wiring. */
export async function runCsharpSamples(session: ExerciseSession, adapter: CsharpExecutionAdapter, onProgress?: () => void): Promise<CsharpExecutionResult> {
  session.claimOrchestration(adapter) // Reject duplicate/mismatched drivers before affecting ownership.
  const phase = async (name: 'prepare' | 'compile' | 'execute') => {
    const pending = session.runPhase(name)
    onProgress?.()
    await pending
    onProgress?.()
  }
  let failure: unknown
  try {
    await phase('prepare')
    await phase('compile')
    await session.verifyExecutionBarrier()
    while (adapter.hasNextCase()) {
      session.limits.checkOperation()
      await phase('execute')
      await session.verifyExecutionBarrier()
    }
    session.limits.checkOperation()
  } catch (error) { failure = error }
  // close retains/dedupes its original task on timeout/failure; never relaunch cases on retry.
  await session.close('COMPLETED')
  const result = adapter.result() // Invalidated owners cannot publish a stale DTO.
  if (failure && !result.failure) throw failure
  return result
}
