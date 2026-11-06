import type { AppResult } from './app-error'
import type { ExerciseLanguage, ExerciseValue, ExerciseType } from './practice'

export const SMART_HINT_CHANNELS = {
  capabilities: 'smart-hints:capabilities', prepare: 'smart-hints:prepare', start: 'smart-hints:start',
  status: 'smart-hints:status', cancel: 'smart-hints:cancel', retireContext: 'smart-hints:retire-context',
} as const
export const SMART_HINT_POLICY = Object.freeze({ sourceBytes: 16384, statementBytes: 8192,
  taskBytes: 8192, selectionBytes: 8192, runBytes: 8192, requestBytes: 65536, wireBytes: 98304,
  resultBytes: 32768, maxOutputTokens: 2048, timeoutMs: 10000, prepareMs: 60000,
  resultMs: 300000, sessionMs: 1800000, edits: 4, editBytes: 16384, editLines: 200,
  perMinute: 6, perHour: 30, summaryBytes: 1024 })
/** Normal Gemini action policy; other providers and shared defaults stay unchanged. */
export const geminiActionTimeoutMs = (kind: SmartAction['kind']): number => kind === 'SUGGEST_FIX' ? 30000 : SMART_HINT_POLICY.timeoutMs
export interface SmartSelection {
  startOffset: number; endOffset: number; text: string
  startLine: number; startColumn: number; endLine: number; endColumn: number
}
export type SmartAction = { kind: 'HINT'; level: 1 | 2 | 3 } | { kind: 'ANALYZE' }
  | { kind: 'EXPLAIN'; selection: SmartSelection } | { kind: 'SUGGEST_FIX'; selection: SmartSelection }
export type SmartOrigin = { kind: 'PRACTICE'; modelId: string; modelVersion: number; eol: 'LF' | 'CRLF' }
  | { kind: 'SOLUTION'; blockId: string }
export type SmartBoundAction = Exclude<SmartAction, { kind: 'EXPLAIN' | 'SUGGEST_FIX' }>
  | { kind: 'EXPLAIN' | 'SUGGEST_FIX'; selection: Omit<SmartSelection, 'text'> & { fingerprint: string } }
export interface SmartRunReference { sessionId: string; generation: number; sequence: number }
export interface SmartPrepare {
  requestId: string; clientContextId: string; exerciseId: string; language: ExerciseLanguage
  sourceRevision: number; source: string; origin: SmartOrigin; action: SmartAction; run: SmartRunReference | null
}
export interface SmartReference { requestId: string; operationId: string }
export interface SmartStart extends SmartReference { captureToken: string; consentVersion: 1; consentGranted: true }
export interface SmartRetire { clientContextId: string; reason: 'EDIT' | 'RESET' | 'RESTORE' | 'EXERCISE' | 'LANGUAGE' | 'LEARNING_LEFT' }
export interface SmartBinding {
  clientContextId: string; contextGeneration: number; exerciseId: string; language: ExerciseLanguage
  packageVersion: number; sourceRevision: number; fingerprint: string; sourceBytes: number
  origin: SmartOrigin; action: SmartBoundAction
}
export interface SmartEdit { startOffset: number; endOffset: number; expectedOldText: string; replacementText: string; rationale: string }
export type SmartOutput =
  | { kind: 'HINT'; level: 1 | 2 | 3; paragraphs: string[]; nextQuestion: string; evidence: string[] }
  | { kind: 'ANALYSIS'; hypotheses: string[]; suggestions: string[]; evidence: string[] }
  | { kind: 'EXPLANATION'; syntax: string; variables: string; controlFlow: string; algorithm: string; illustrativeExamples: string[] }
  | { kind: 'EDIT_PROPOSAL'; edits: SmartEdit[]; rationale: string; evidence: string[] }
  | { kind: 'NO_FIX'; reason: 'INSUFFICIENT_CONTEXT' | 'LOCATION_UNKNOWN' | 'NO_FOCUSED_CHANGE'; advice: string }
export interface SmartRunObservation {
  evidenceId: string; sampleOrdinal: number; input: ExerciseValue[]; expected: ExerciseValue; actual: ExerciseValue
}
export type SmartRunContext = { kind: 'CODE_ONLY'; reason: 'NO_MATCHING_PUBLIC_RUN' | 'DETAIL_LIMIT_EXCEEDED' }
  | { kind: 'RUN_PUBLIC'; parameterTypes: ExerciseType[]; returnType: ExerciseType; observations: SmartRunObservation[];
    failure: 'COMPILE_ERROR' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | null; locations: { line: number; column: number }[] }
export const SMART_FAILURES = ['UNCONFIGURED', 'INVALID_INPUT', 'CONTEXT_STALE', 'CAPTURE_EXPIRED', 'LIMIT_EXCEEDED',
  'BUSY', 'CONSENT_REQUIRED', 'CANCELLED', 'TIMEOUT', 'NETWORK', 'AUTH', 'BALANCE', 'RATE_LIMIT',
  'PROVIDER', 'INVALID_RESPONSE', 'DUPLICATE_HINT'] as const
export type SmartFailure = typeof SMART_FAILURES[number]
interface StatusBase extends SmartReference { schemaVersion: 1; sequence: number; binding: SmartBinding }
export type SmartStatus = StatusBase & (
  { state: 'PREPARING' | 'RUNNING' | 'CANCELLED' | 'EXPIRED' }
  | { state: 'PREPARED'; captureToken: string; expiresAt: number; consentVersion: 1;
    statementBytes: number; runContextKind: SmartRunContext['kind'] }
  | { state: 'FAILED'; code: SmartFailure }
  | { state: 'COMPLETE'; output: SmartOutput; runContext: SmartRunContext; expiresAt: number; proposalId: string | null })
export interface SmartCapabilities {
  enabled: boolean; providerMode: 'DISABLED' | 'FAKE' | 'OPENROUTER_FREE' | 'GEMINI_FREE'; applyEnabled: boolean; consentVersion: 1
  suggestFixMode: 'DISABLED' | 'SELECTION_V1'; suggestFixLanguages: ExerciseLanguage[]
}
export interface SmartHintsApi {
  capabilities(): Promise<AppResult<SmartCapabilities>>
  prepare(request: SmartPrepare): Promise<AppResult<SmartStatus>>
  start(request: SmartStart): Promise<AppResult<SmartStatus>>
  status(request: SmartReference): Promise<AppResult<SmartStatus>>
  cancel(request: SmartReference): Promise<AppResult<SmartStatus>>
  retireContext(request: SmartRetire): Promise<AppResult<null>>
}
