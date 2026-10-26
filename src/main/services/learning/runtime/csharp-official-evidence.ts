import type { CsharpSampleSchema } from '../../../../shared/contracts/csharp-execution'
import { validateCsharpHarnessResponse } from '../../../../shared/contracts/csharp-execution-validation'
import { parseExecutionJson } from '../../../../shared/contracts/execution-json'
import type { LearningProcessResult } from './exercise-runtime-adapter'
import type { OfficialCaseObservation } from './official-execution-contracts'

/** Raw bytes have already been charged by Runtime/Core. This is C# wire v1:
 * both RETURNED and a valid FAILED envelope require exit zero. No comparison. */
export function csharpOfficialResponse(raw: Uint8Array, stderrBytes: number, schema: CsharpSampleSchema,
  caseIndex: number, process: Readonly<LearningProcessResult> | null): OfficialCaseObservation {
  const base = { caseIndex, language: 'csharp' as const, process }
  if (!process || !process.processExited || !process.observerSettled || !process.stdoutSettled || !process.stderrSettled)
    return { ...base, kind: 'INFRASTRUCTURE_FAILURE', reason: 'UNSETTLED' }
  if (process.jobMemoryLimitObserved) return { ...base, kind: 'INTERRUPTED', reason: 'JOB_MEMORY_LIMIT' }
  if (process.failure && process.failure !== 'NONZERO_EXIT') {
    if (process.failure === 'INFRASTRUCTURE_FAILURE') return { ...base, kind: 'INFRASTRUCTURE_FAILURE', reason: 'RESOURCE_FAILURE' }
    return { ...base, kind: 'INTERRUPTED', reason: process.failure }
  }
  if (process.exitCode !== 0 || process.failure === 'NONZERO_EXIT') return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' }
  if (!raw.length) return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MISSING_RESPONSE' }
  // Harness captures student stderr in the envelope. Physical stderr is a host/
  // protocol inconsistency, never evidence of a student exception.
  if (stderrBytes) return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }
  try {
    const response = validateCsharpHarnessResponse(parseExecutionJson(raw), schema, caseIndex)
    if (response.ok) {
      const r = response.value
      return r.outcome === 'RETURNED' ? { ...base, kind: 'RETURNED', actual: r.actual, stdout: r.stdout, stderr: r.stderr }
        : { ...base, kind: r.error, stdout: r.stdout, stderr: r.stderr }
    }
  } catch { /* Untrusted wire data; no raw bytes/errors escape. */ }
  return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }
}
