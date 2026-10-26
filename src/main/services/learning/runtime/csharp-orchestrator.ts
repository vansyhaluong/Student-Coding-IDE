import type { CsharpExecutionResult } from '../../../../shared/contracts/csharp-execution'
import type { CsharpExecutionAdapter } from './csharp-execution-contracts'
import type { ExerciseSession } from './exercise-session'
import { runExecutionDriver } from './execution-driver'

/** Main-only driver for an ALREADY admitted session. No factory, queue, IPC or UI wiring. */
export async function runCsharpSamples(session: ExerciseSession, adapter: CsharpExecutionAdapter, onProgress?: () => void): Promise<CsharpExecutionResult> {
  const { failure } = await runExecutionDriver(session, adapter, { language: 'csharp', progress: onProgress })
  const result = adapter.result() // Invalidated owners cannot publish a stale DTO.
  if (failure && !result.failure) throw failure
  return result
}
