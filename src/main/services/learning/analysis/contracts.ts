/** Main-private provider types; never add provider credentials/endpoints to IPC. */
import type { Analysis } from '../../../../shared/contracts/analysis'
export type { Analysis } from '../../../../shared/contracts/analysis'
export interface AnalysisInput {
  language: 'csharp' | 'javascript'
  source: string
  publicStatement: string
  packageVersion: number
}
export type FailureCode = 'INVALID_INPUT' | 'ALREADY_USED' | 'KEY_UNAVAILABLE' | 'CANCELLED'
  | 'TIMEOUT' | 'NETWORK_ERROR' | 'AUTHENTICATION' | 'BALANCE' | 'RATE_LIMIT'
  | 'PROVIDER_ERROR' | 'REQUEST_REJECTED' | 'INVALID_RESPONSE' | 'RESPONSE_LIMIT' | 'INCOMPLETE_OUTPUT'
export type AnalysisResult = { ok: true; advisory: true; analysis: Analysis;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null }
  | { ok: false; code: FailureCode; message: string; retryable: false }
export interface AnalysisOperation { run(signal?: AbortSignal): Promise<AnalysisResult> }
export interface AnalysisProvider { createOperation(input: unknown): AnalysisOperation }
/** Trusted Main composition seam; never a renderer-supplied transport. No default live transport in D1. */
export interface ProviderTransport { send(request: Request): Promise<Response> }
export interface SessionCredential { authorization(): string; clear(): void }
export const POLICY = Object.freeze({ sourceBytes: 16 * 1024, statementBytes: 8 * 1024,
  requestBytes: 40 * 1024, wireBytes: 96 * 1024, analysisBytes: 32 * 1024,
  maxOutputTokens: 1024, timeoutMs: 10_000 })
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions'
export const DEEPSEEK_MODEL = 'deepseek-flash'
export function failure(code: FailureCode): AnalysisResult {
  return { ok: false, code, message: 'Analysis is unavailable (' + code + ').', retryable: false }
}
