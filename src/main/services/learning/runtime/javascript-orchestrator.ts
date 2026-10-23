import type { JavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution'
import type { JavascriptExecutionAdapter } from './javascript-execution-contracts'
import type { ExerciseSession } from './exercise-session'

/** Main-only driver for one already admitted session. No factory, queue or IPC. */
export async function runJavascriptSamples(session: ExerciseSession, adapter: JavascriptExecutionAdapter, progress: () => void = () => {}): Promise<JavascriptExecutionResult> {
  session.claimOrchestration(adapter)
  let failure: unknown
  try {
    await session.runPhase('prepare')
    progress()
    await session.verifyExecutionBarrier()
    await session.runPhase('compile')
    progress()
    await session.verifyExecutionBarrier()
    while (adapter.hasNextCase()) {
      session.limits.checkOperation()
      await session.runPhase('execute')
      progress()
      await session.verifyExecutionBarrier()
    }
    session.limits.checkOperation()
  } catch (error) { failure = error }
  // Core retains its original cleanup task. A retry never re-enters the case loop.
  await session.close('COMPLETED')
  const result = adapter.result()
  if (failure && !result.failure) throw failure
  return result
}
