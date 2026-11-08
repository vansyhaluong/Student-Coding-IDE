import { randomUUID } from 'node:crypto'
import type { ChatContext, ChatPrepare, ChatPrepared, ChatReference, ChatScope, ChatSend } from '../../../src/shared/contracts/learning-chat'
import { smartPosition } from '../../../src/shared/contracts/smart-hints-validation'
import { ContextBuilder, chatTextHash } from '../../../src/main/services/learning/chat/context-builder'
import { ConversationManager } from '../../../src/main/services/learning/chat/conversation-manager'

export const secret = 'AQ.SYNTHETIC_CHAT_PRIVATE_SECRET'
export const defaultSource = '// 🐟 é\r\nfunction solve(n) { return n; }\r\nconst tail = 1;'
export function selection(source: string, text = 'return n;') {
  const startOffset = source.indexOf(text), endOffset = startOffset + text.length
  if (startOffset < 0) throw Error('Synthetic selection missing')
  const a = smartPosition(source, startOffset), b = smartPosition(source, endOffset)
  return { startOffset, endOffset, text, startLine: a.line, startColumn: a.column, endLine: b.line, endColumn: b.column }
}
export const ref = (p: ChatReference): ChatReference => ({ sessionId: p.sessionId, requestId: p.requestId, operationId: p.operationId })
export const send = (p: ChatPrepared): ChatSend => ({ ...ref(p), consentToken: p.consentToken, consentGranted: true, consentVersion: 1, digest: p.binding.digest })
export function chatFixture(source = defaultSource, inputBudget?: number) {
  let now = Date.UTC(2026, 10, 6, 12), currentSource = source
  const owner = { id: 1, scope: randomUUID() }
  const builder = new ContextBuilder({ allows: text => ![secret, Buffer.from(secret).toString('base64')].some(s => text.includes(s)) }, inputBudget)
  const manager = new ConversationManager(builder, () => now)
  let context: ChatContext = { kind: 'PRACTICE', exerciseId: 'synthetic', language: 'javascript', sourceRevision: 1,
    modelId: randomUUID(), modelVersion: 1, eol: source.includes('\r\n') ? 'CRLF' : 'LF', sourceFingerprint: chatTextHash(source) }
  const initial = manager.open(owner, context, 1, () => {})
  const snapshot = () => manager.snapshot(owner, initial.sessionId)
  const request = (scope: ChatScope = 'QUESTION_ONLY', question = 'Explain the loop.', selected = 'return n;'): ChatPrepare => {
    const base = { sessionId: initial.sessionId, revision: snapshot().revision, requestId: randomUUID(), question }
    return scope === 'QUESTION_ONLY' ? { ...base, scope, attachment: null } : scope === 'QUESTION_WITH_SOURCE'
      ? { ...base, scope, attachment: { source: currentSource } } : { ...base, scope, attachment: { source: currentSource, selection: selection(currentSource, selected) } }
  }
  const commit = (scope: ChatScope = 'QUESTION_ONLY', question = 'Explain the loop.', text = 'Synthetic advisory.', selected?: string) => {
    const q = request(scope, question, selected), p = manager.prepare(owner, q), execution = manager.start(owner, send(p))
    const status = manager.complete(execution, { kind: 'CHAT_REPLY', text })
    if (status.state !== 'COMPLETE') throw Error('Synthetic completion rejected')
    return status
  }
  const update = (source: string) => {
    if (context.kind !== 'PRACTICE') throw Error()
    context = { ...context, sourceRevision: context.sourceRevision + 1, modelVersion: context.modelVersion + 1,
      sourceFingerprint: chatTextHash(source), eol: source.includes('\r\n') ? 'CRLF' : 'LF' }
    currentSource = source
    return manager.updateContext(owner, initial.sessionId, snapshot().revision, context, () => {})
  }
  return { owner, builder, manager, initial, snapshot, request, commit, update, source: () => currentSource, advance: (ms: number) => { now += ms } }
}
