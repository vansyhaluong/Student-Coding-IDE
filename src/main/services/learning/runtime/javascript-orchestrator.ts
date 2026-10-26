import type { JavascriptExecutionResult } from '../../../../shared/contracts/javascript-execution'
import type { JavascriptExecutionAdapter } from './javascript-execution-contracts'
import type { ExerciseSession } from './exercise-session'
import { runExecutionDriver } from './execution-driver'

/** Main-only driver for one already admitted session. No factory, queue or IPC. */
export async function runJavascriptSamples(session: ExerciseSession, adapter: JavascriptExecutionAdapter, progress: () => void = () => {}): Promise<JavascriptExecutionResult> {
  const { failure } = await runExecutionDriver(session, adapter, { language: 'javascript', progress })
  const result = adapter.result()
  if (failure && !result.failure) throw failure
  return result
}
