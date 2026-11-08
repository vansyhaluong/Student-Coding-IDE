import { isExerciseId } from './practice'
import { smartFields as fields, smartBytes, smartText, smartInteger as integer, smartUuid as uuid, smartBoundary, smartPosition } from './smart-hints-validation'
import { CHAT_POLICY as P, CHAT_SCOPES, CHAT_FAILURES, type ChatContext, type ChatPrepare, type ChatReply, type ChatSend,
  type ChatReference, type ChatProvenance, type ChatMessage, type ChatSession, type ChatStatus, type ChatBinding,
  type ChatConsentManifest, type ChatPrepared, type ChatContextInput, type ChatOpen, type ChatSessionReference, type ChatUpdate, type ChatClose } from './learning-chat'
import type { ValidationResult } from './validation'

const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function array(v: unknown, max: number): v is unknown[] {
  return Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= max
    && Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i)))
      .every(d => !!d && d.enumerable && Object.hasOwn(d, 'value'))
}
export function isChatContext(v: unknown): v is ChatContext {
  return fields(v, ['kind', 'courseId', 'chapter']) && v.kind === 'LEARNING' && isExerciseId(v.courseId) && integer(v.chapter, 1) && v.chapter <= 1000
    || fields(v, ['kind', 'exerciseId', 'language', 'sourceRevision', 'modelId', 'modelVersion', 'eol', 'sourceFingerprint'])
      && v.kind === 'PRACTICE' && isExerciseId(v.exerciseId) && ['csharp', 'javascript'].includes(v.language as string)
      && integer(v.sourceRevision) && uuid(v.modelId) && integer(v.modelVersion, 1) && ['LF', 'CRLF'].includes(v.eol as string) && digest(v.sourceFingerprint)
}
function boundSelection(v: unknown): boolean {
  return fields(v, ['startOffset', 'endOffset', 'startLine', 'startColumn', 'endLine', 'endColumn', 'fingerprint'])
    && integer(v.startOffset) && integer(v.endOffset) && v.endOffset > v.startOffset
    && v.endOffset <= P.sourceBytes && [v.startLine, v.startColumn, v.endLine, v.endColumn].every(n => integer(n, 1))
    && (v.endLine as number) >= (v.startLine as number) && (v.endLine !== v.startLine || (v.endColumn as number) > (v.startColumn as number)) && digest(v.fingerprint)
}
export function isChatProvenance(v: unknown): v is ChatProvenance {
  return fields(v, ['context', 'providerGeneration', 'scope', 'selection']) && isChatContext(v.context) && integer(v.providerGeneration, 1)
    && CHAT_SCOPES.includes(v.scope as never) && (v.scope === 'QUESTION_ONLY' ? v.selection === null
      : v.context.kind === 'PRACTICE' && (v.scope === 'QUESTION_WITH_SOURCE' ? v.selection === null : boundSelection(v.selection)))
}
export function isChatPrepare(v: unknown): v is ChatPrepare {
  if (!fields(v, ['sessionId', 'revision', 'requestId', 'question', 'scope', 'attachment']) || !uuid(v.sessionId) || !uuid(v.requestId)
    || !integer(v.revision) || !smartText(v.question, P.questionBytes)) return false
  if (v.scope === 'QUESTION_ONLY') return v.attachment === null
  const a = v.attachment
  if (v.scope === 'QUESTION_WITH_SOURCE') return fields(a, ['source']) && smartText(a.source, P.sourceBytes, true) && !/\r(?!\n)/.test(a.source)
    && smartBytes(v) <= P.requestBytes
  if (v.scope !== 'QUESTION_WITH_SELECTION' || !fields(a, ['source', 'selection']) || !smartText(a.source, P.sourceBytes, true) || /\r(?!\n)/.test(a.source)) return false
  const s = a.selection
  if (!fields(s, ['startOffset', 'endOffset', 'text', 'startLine', 'startColumn', 'endLine', 'endColumn'])
    || !integer(s.startOffset) || !integer(s.endOffset) || s.endOffset <= s.startOffset || s.endOffset > a.source.length
    || !smartText(s.text, P.selectionBytes) || s.text !== a.source.slice(s.startOffset, s.endOffset)
    || !smartBoundary(a.source, s.startOffset) || !smartBoundary(a.source, s.endOffset)) return false
  const start = smartPosition(a.source, s.startOffset), end = smartPosition(a.source, s.endOffset)
  return s.startLine === start.line && s.startColumn === start.column && s.endLine === end.line && s.endColumn === end.column && smartBytes(v) <= P.requestBytes
}
export function isChatMessage(v: unknown): v is ChatMessage {
  return fields(v, ['messageId', 'operationId', 'role', 'state', 'text', 'provenance']) && uuid(v.messageId) && uuid(v.operationId)
    && ['user', 'assistant'].includes(v.role as string) && v.state === 'COMPLETE'
    && smartText(v.text, v.role === 'user' ? P.questionBytes : P.replyBytes) && isChatProvenance(v.provenance)
}
function pairs(v: unknown, max: number): v is ChatMessage[] {
  if (!array(v, max) || v.length % 2 || !v.every(isChatMessage) || new Set(v.map(m => m.messageId)).size !== v.length) return false
  const operations = new Set<string>()
  for (let i = 0; i < v.length; i += 2) {
    if (v[i].role !== 'user' || v[i + 1].role !== 'assistant' || v[i].operationId !== v[i + 1].operationId
      || JSON.stringify(v[i].provenance) !== JSON.stringify(v[i + 1].provenance) || operations.has(v[i].operationId)) return false
    operations.add(v[i].operationId)
  }
  return true
}
export function isChatSession(v: unknown): v is ChatSession {
  return fields(v, ['schemaVersion', 'sessionId', 'generation', 'revision', 'state', 'context', 'providerGeneration', 'createdAt', 'expiresAt', 'messages'])
    && v.schemaVersion === 1 && uuid(v.sessionId) && integer(v.generation, 1) && integer(v.revision) && v.state === 'ACTIVE'
    && isChatContext(v.context) && integer(v.providerGeneration, 1) && integer(v.createdAt) && integer(v.expiresAt, 1)
    && v.expiresAt - v.createdAt === P.sessionMs && pairs(v.messages, P.messages)
    && v.messages.every(m => m.provenance.providerGeneration === v.providerGeneration && sameTimelineContext(m.provenance.context, v.context as ChatContext))
    && smartBytes(v.messages) <= P.historyBytes && smartBytes(v) <= P.requestBytes
}
function sameTimelineContext(before: ChatContext, current: ChatContext): boolean {
  return before.kind === 'LEARNING' && current.kind === 'LEARNING' ? before.courseId === current.courseId && before.chapter === current.chapter
    : before.kind === 'PRACTICE' && current.kind === 'PRACTICE' && before.exerciseId === current.exerciseId
      && before.language === current.language && before.sourceRevision <= current.sourceRevision
}
export function isChatBinding(v: unknown): v is ChatBinding {
  return fields(v, ['sessionId', 'generation', 'revision', 'context', 'providerGeneration', 'scope', 'digest'])
    && uuid(v.sessionId) && integer(v.generation, 1) && integer(v.revision) && isChatContext(v.context)
    && integer(v.providerGeneration, 1) && CHAT_SCOPES.includes(v.scope as never) && digest(v.digest)
    && (v.scope === 'QUESTION_ONLY' || v.context.kind === 'PRACTICE')
}
export function isChatConsentManifest(v: unknown): v is ChatConsentManifest {
  return fields(v, ['digest', 'scope', 'questionBytes', 'historyMessageIds', 'historyBytes', 'attachmentBytes', 'requestBytes', 'tokenCount', 'publicRun'])
    && digest(v.digest) && CHAT_SCOPES.includes(v.scope as never) && integer(v.questionBytes, 1) && v.questionBytes <= P.questionBytes
    && array(v.historyMessageIds, P.replayPairs * 2) && v.historyMessageIds.length % 2 === 0 && v.historyMessageIds.every(uuid)
    && new Set(v.historyMessageIds).size === v.historyMessageIds.length && integer(v.historyBytes) && v.historyBytes <= P.historyBytes
    && integer(v.attachmentBytes) && v.attachmentBytes <= (v.scope === 'QUESTION_WITH_SELECTION' ? P.selectionBytes : P.sourceBytes)
    && (v.scope !== 'QUESTION_ONLY' || v.attachmentBytes === 0) && integer(v.requestBytes, 1) && v.requestBytes <= P.requestBytes
    && v.tokenCount === null && v.publicRun === false
}
export function isChatReply(v: unknown): v is ChatReply {
  return fields(v, ['kind', 'text']) && v.kind === 'CHAT_REPLY' && smartText(v.text, P.replyBytes) && smartBytes(v) <= P.replyBytes
}
export function isChatReference(v: unknown): v is ChatReference {
  return fields(v, ['sessionId', 'requestId', 'operationId']) && uuid(v.sessionId) && uuid(v.requestId) && uuid(v.operationId)
}
export function isChatSend(v: unknown): v is ChatSend {
  return fields(v, ['sessionId', 'requestId', 'operationId', 'consentToken', 'consentVersion', 'consentGranted', 'digest'])
    && uuid(v.sessionId) && uuid(v.requestId) && uuid(v.operationId) && uuid(v.consentToken) && v.consentVersion === 1 && v.consentGranted === true && digest(v.digest)
}
export function isChatStatus(v: unknown): v is ChatStatus {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    || !Reflect.ownKeys(v).every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))) return false
  const o = v as Record<string, unknown>, base = ['schemaVersion', 'sessionId', 'requestId', 'operationId', 'sequence', 'binding', 'state']
  if (o.schemaVersion !== 1 || !uuid(o.sessionId) || !uuid(o.requestId) || !uuid(o.operationId) || !integer(o.sequence)
    || !isChatBinding(o.binding) || o.binding.sessionId !== o.sessionId) return false
  if (['PREPARING', 'RUNNING', 'CANCELLED', 'EXPIRED'].includes(o.state as string)) return fields(o, base)
  if (o.state === 'FAILED') return fields(o, [...base, 'code']) && CHAT_FAILURES.includes(o.code as never)
  if (o.state === 'PREPARED') return fields(o, [...base, 'consentToken', 'consentVersion', 'expiresAt', 'manifest']) && uuid(o.consentToken)
    && o.consentVersion === 1 && integer(o.expiresAt, 1) && isChatConsentManifest(o.manifest)
    && o.manifest.digest === o.binding.digest && o.manifest.scope === o.binding.scope
  const binding = o.binding
  return o.state === 'COMPLETE' && fields(o, [...base, 'messages']) && pairs(o.messages, 2) && o.messages.length === 2
    && o.messages.every(m => m.operationId === o.operationId && m.provenance.scope === binding.scope
      && m.provenance.providerGeneration === binding.providerGeneration && JSON.stringify(m.provenance.context) === JSON.stringify(binding.context))
    && smartBytes(o) <= P.requestBytes
}
function checked<T>(v: unknown, check: (v: unknown) => boolean): ValidationResult<T> {
  try { return check(v) ? { ok: true, value: structuredClone(v) as T } : invalid() } catch { return invalid() }
}
const invalid = () => ({ ok: false as const, issues: [{ path: '$', message: 'Invalid Learning Chat data.' }] })
export const validateChatContext = (v: unknown) => checked<ChatContext>(v, isChatContext)
export const validateChatPrepare = (v: unknown) => checked<ChatPrepare>(v, isChatPrepare)
export const validateChatSend = (v: unknown) => checked<ChatSend>(v, isChatSend)
export const validateChatReference = (v: unknown) => checked<ChatReference>(v, isChatReference)
export const validateChatReply = (v: unknown) => checked<ChatReply>(v, isChatReply)
export const validateChatMessage = (v: unknown) => checked<ChatMessage>(v, isChatMessage)
export const validateChatSession = (v: unknown) => checked<ChatSession>(v, isChatSession)
export const validateChatStatus = (v: unknown) => checked<ChatStatus>(v, isChatStatus)
export const validateChatPrepared = (v: unknown) => checked<ChatPrepared>(v, x => isChatStatus(x) && x.state === 'PREPARED')
export function isChatContextInput(v: unknown): v is ChatContextInput {
  if (isChatContext(v) && v.kind === 'LEARNING') return true
  if (!fields(v, ['kind', 'exerciseId', 'language', 'sourceRevision', 'modelId', 'modelVersion', 'eol', 'source'])
    || !smartText(v.source, P.sourceBytes, true)) return false
  const { source, ...context } = v
  return isChatContext({ ...context, sourceFingerprint: '0'.repeat(64) })
    && (v.eol === 'LF' ? !source.includes('\r') : !/(?<!\r)\n/.test(source))
}
export const validateChatOpen = (v: unknown) => checked<ChatOpen>(v, x => fields(x, ['context']) && isChatContextInput(x.context))
export const validateChatSessionReference = (v: unknown) => checked<ChatSessionReference>(v, x => fields(x, ['sessionId']) && uuid(x.sessionId))
export const validateChatUpdate = (v: unknown) => checked<ChatUpdate>(v, x => fields(x, ['sessionId', 'revision', 'context'])
  && uuid(x.sessionId) && integer(x.revision) && isChatContextInput(x.context))
export const validateChatClose = (v: unknown) => checked<ChatClose>(v, x => fields(x, ['sessionId', 'revision', 'reason'])
  && uuid(x.sessionId) && integer(x.revision) && ['PANEL_CLOSED', 'NAVIGATION', 'CONTEXT_CHANGED'].includes(x.reason as string))
export const validateChatProvenance = (v: unknown) => checked<ChatProvenance>(v, isChatProvenance)
export const validateChatBinding = (v: unknown) => checked<ChatBinding>(v, isChatBinding)
export const validateChatConsentManifest = (v: unknown) => checked<ChatConsentManifest>(v, isChatConsentManifest)
