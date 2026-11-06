import type { AppResult } from './app-error'

export const ANALYSIS_CHANNELS = Object.freeze({ prepare: 'analysis:prepare', start: 'analysis:start',
  status: 'analysis:status', cancel: 'analysis:cancel' })
export const ANALYSIS_CONSENT_VERSION = 1
export interface Analysis {
  schemaVersion: 1
  algorithmAnalysis: string
  timeComplexity: { bigO: string; explanation: string }
  spaceComplexity: { bigO: string; explanation: string }
  codeQuality: string[]
  improvements: string[]
}
export const ANALYSIS_FAILURE_CODES = ['INVALID_INPUT', 'ALREADY_USED', 'KEY_UNAVAILABLE', 'CANCELLED',
  'TIMEOUT', 'NETWORK_ERROR', 'AUTHENTICATION', 'BALANCE', 'RATE_LIMIT', 'PROVIDER_ERROR',
  'REQUEST_REJECTED', 'INVALID_RESPONSE', 'RESPONSE_LIMIT', 'INCOMPLETE_OUTPUT',
  'SOURCE_UNAVAILABLE', 'CONTENT_VERSION_MISMATCH', 'CONTEXT_INVALID', 'CAPTURE_EXPIRED', 'BUSY'] as const
export type AnalysisFailureCode = typeof ANALYSIS_FAILURE_CODES[number]
export interface AnalysisReference { requestId: string }
export interface AnalysisPrepare extends AnalysisReference { sourceReference: string }
export interface AnalysisStart extends AnalysisReference { captureToken: string; consentVersion: 1 }
/** Ephemeral advisory data only. Status polling recovers a lost start ACK without replay. */
export type AnalysisStatus = { requestId: string; sequence: number } & (
  { state: 'PREPARING' | 'RUNNING' | 'CANCELLED' }
  | { state: 'PREPARED'; captureToken: string; expiresAt: number; consentVersion: 1;
    submissionId: string; exerciseId: string; language: 'csharp' | 'javascript'; packageVersion: number;
    sourceBytes: number; statementBytes: number }
  | { state: 'COMPLETE'; advisory: true; analysis: Analysis }
  | { state: 'FAILED'; code: AnalysisFailureCode })
export interface AnalysisApi {
  prepare(request: AnalysisPrepare): Promise<AppResult<AnalysisStatus>>
  start(request: AnalysisStart): Promise<AppResult<AnalysisStatus>>
  status(request: AnalysisReference): Promise<AppResult<AnalysisStatus>>
  cancel(request: AnalysisReference): Promise<AppResult<AnalysisStatus>>
}
