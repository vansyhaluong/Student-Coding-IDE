import type { JavascriptSampleSchema } from '../../../../shared/contracts/javascript-execution'
import { validateJavascriptHarnessResponse } from '../../../../shared/contracts/javascript-execution-validation'
import { parseExecutionJson } from '../../../../shared/contracts/execution-json'
import type { LearningProcessResult } from './exercise-runtime-adapter'
import type { OfficialCaseObservation } from './official-execution-contracts'

/** Main-private JS v1 evidence. Caller charges all physical bytes BEFORE decoding.
 * JS RETURNED requires exit0; valid FAILED requires exit1. No comparison. */
export function javascriptOfficialResponse(raw: Uint8Array, stderrBytes: number, schema: JavascriptSampleSchema,
  caseIndex: number, process: Readonly<LearningProcessResult> | null): OfficialCaseObservation {
  const base = { caseIndex, language: 'javascript' as const, process }
  if (!process || !process.processExited || !process.observerSettled || !process.stdoutSettled || !process.stderrSettled)
    return { ...base, kind: 'INFRASTRUCTURE_FAILURE', reason: 'UNSETTLED' }
  if (process.jobMemoryLimitObserved) return { ...base, kind: 'INTERRUPTED', reason: 'JOB_MEMORY_LIMIT' }
  if (process.failure && process.failure !== 'NONZERO_EXIT') {
    return process.failure === 'INFRASTRUCTURE_FAILURE' ? { ...base, kind: 'INFRASTRUCTURE_FAILURE', reason: 'RESOURCE_FAILURE' }
      : { ...base, kind: 'INTERRUPTED', reason: process.failure }
  }
  if (process.exitCode !== 0 && process.exitCode !== 1
    || (process.exitCode === 0) === (process.failure === 'NONZERO_EXIT'))
    return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' }
  if (!raw.length) return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MISSING_RESPONSE' }
  if (stderrBytes) return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }
  try {
    const data = parseExecutionJson(raw)
    const response = validateJavascriptHarnessResponse(data, schema, caseIndex, process.exitCode)
    if (response.ok) {
      const r = response.value
      return r.outcome === 'RETURNED' ? { ...base, kind: 'RETURNED', actual: r.actual, stdout: r.stdout, stderr: r.stderr }
        : { ...base, kind: r.error, stdout: r.stdout, stderr: r.stderr }
    }
    // Distinguish a valid envelope with the wrong exit from malformed transport.
    if (validateJavascriptHarnessResponse(data, schema, caseIndex, process.exitCode === 0 ? 1 : 0).ok)
      return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' }
  } catch { /* Untrusted wire data; never expose bytes/engine errors. */ }
  return { ...base, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }
}
