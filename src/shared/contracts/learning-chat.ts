import type { ExerciseLanguage } from './practice'
import type { AppResult } from './app-error'
import { SMART_HINT_POLICY, SMART_FAILURES, type SmartSelection } from './smart-hints'

export const CHAT_POLICY = Object.freeze({ questionBytes: 4096, messages: 32, historyBytes: 49152, replayPairs: 8,
  sourceBytes: SMART_HINT_POLICY.sourceBytes, selectionBytes: SMART_HINT_POLICY.selectionBytes,
  requestBytes: SMART_HINT_POLICY.requestBytes, replyBytes: SMART_HINT_POLICY.resultBytes,
  sessionMs: SMART_HINT_POLICY.sessionMs, prepareMs: SMART_HINT_POLICY.prepareMs, operations: 128 })
export const CHAT_SCOPES = ['QUESTION_ONLY', 'QUESTION_WITH_SELECTION', 'QUESTION_WITH_SOURCE'] as const
export type ChatScope = typeof CHAT_SCOPES[number]
export type ChatContext = { kind: 'LEARNING'; courseId: string; chapter: number }
  | { kind: 'PRACTICE'; exerciseId: string; language: ExerciseLanguage; sourceRevision: number;
    modelId: string; modelVersion: number; eol: 'LF' | 'CRLF'; sourceFingerprint: string }
export type ChatBoundSelection = Omit<SmartSelection, 'text'> & { fingerprint: string }
export interface ChatProvenance { context: ChatContext; providerGeneration: number; scope: ChatScope; selection: ChatBoundSelection | null }
export interface ChatMessage {
  messageId: string; operationId: string; role: 'user' | 'assistant'; state: 'COMPLETE'; text: string
  provenance: ChatProvenance
}
export interface ChatSession {
  schemaVersion: 1; sessionId: string; generation: number; revision: number; state: 'ACTIVE'
  context: ChatContext; providerGeneration: number; createdAt: number; expiresAt: number; messages: ChatMessage[]
}
interface PrepareBase { sessionId: string; revision: number; requestId: string; question: string }
export type ChatPrepare = PrepareBase & (
  { scope: 'QUESTION_ONLY'; attachment: null }
  | { scope: 'QUESTION_WITH_SOURCE'; attachment: { source: string } }
  | { scope: 'QUESTION_WITH_SELECTION'; attachment: { source: string; selection: SmartSelection } })
export interface ChatBinding {
  sessionId: string; generation: number; revision: number; context: ChatContext
  providerGeneration: number; scope: ChatScope; digest: string
}
export interface ChatConsentManifest {
  digest: string; scope: ChatScope; questionBytes: number; historyMessageIds: string[]; historyBytes: number
  attachmentBytes: number; requestBytes: number; tokenCount: null; publicRun: false
}
export interface ChatReference { sessionId: string; requestId: string; operationId: string }
export interface ChatSend extends ChatReference { consentToken: string; consentVersion: 1; consentGranted: true; digest: string }
export interface ChatReply { kind: 'CHAT_REPLY'; text: string }
export const CHAT_FAILURES = [...SMART_FAILURES, 'SESSION_EXPIRED', 'HISTORY_STALE', 'CONTEXT_TOO_LARGE'] as const
export type ChatFailure = typeof CHAT_FAILURES[number]
interface StatusBase extends ChatReference { schemaVersion: 1; sequence: number; binding: ChatBinding }
export type ChatStatus = StatusBase & (
  { state: 'PREPARING' | 'RUNNING' | 'CANCELLED' | 'EXPIRED' }
  | { state: 'PREPARED'; consentToken: string; consentVersion: 1; expiresAt: number; manifest: ChatConsentManifest }
  | { state: 'FAILED'; code: ChatFailure }
  | { state: 'COMPLETE'; messages: [ChatMessage, ChatMessage] })
export type ChatPrepared = Extract<ChatStatus, { state: 'PREPARED' }>

export const CHAT_CHANNELS = { openSession: 'learning-chat:open', getSession: 'learning-chat:get', closeSession: 'learning-chat:close',
  updateContext: 'learning-chat:update', prepare: 'learning-chat:prepare', start: 'learning-chat:start', status: 'learning-chat:status', cancel: 'learning-chat:cancel' } as const
/** Local Monaco snapshot only; Main validates catalogue identity and computes its
 * fingerprint. This does not consent to provider upload. */
export type ChatContextInput = Extract<ChatContext, { kind: 'LEARNING' }>
  | Omit<Extract<ChatContext, { kind: 'PRACTICE' }>, 'sourceFingerprint'> & { source: string }
export interface ChatOpen { context: ChatContextInput }
export interface ChatSessionReference { sessionId: string }
export interface ChatUpdate extends ChatSessionReference { revision: number; context: ChatContextInput }
export interface ChatClose extends ChatSessionReference { revision: number; reason: 'PANEL_CLOSED' | 'NAVIGATION' | 'CONTEXT_CHANGED' }
export interface LearningChatApi {
  openSession(request: ChatOpen): Promise<AppResult<ChatSession>>
  getSession(request: ChatSessionReference): Promise<AppResult<ChatSession>>
  closeSession(request: ChatClose): Promise<AppResult<null>>
  updateContext(request: ChatUpdate): Promise<AppResult<ChatSession>>
  prepare(request: ChatPrepare): Promise<AppResult<ChatPrepared>>
  start(request: ChatSend): Promise<AppResult<ChatStatus>>
  status(request: ChatReference): Promise<AppResult<ChatStatus>>
  cancel(request: ChatReference): Promise<AppResult<ChatStatus>>
}
