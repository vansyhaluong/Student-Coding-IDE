import { createHash } from 'node:crypto'
import { DomainError } from '../../../errors/app-error'
import { CHAT_POLICY as P, type ChatBinding, type ChatConsentManifest, type ChatContext, type ChatFailure,
  type ChatMessage, type ChatProvenance, type ChatReply, type ChatSession } from '../../../../shared/contracts/learning-chat'
import { validateChatPrepare, validateChatReply, validateChatSession } from '../../../../shared/contracts/learning-chat-validation'
import { smartBytes } from '../../../../shared/contracts/smart-hints-validation'

export class ChatDomainError extends DomainError {
  constructor(readonly reason: ChatFailure) {
    super({ code: 'INVALID_INPUT', operation: 'learning-chat', message: 'Learning Chat request rejected.', details: { reason }, retryable: false })
  }
}
export const chatTextHash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]))
  return value
}
export const chatDigest = (value: unknown): string => chatTextHash(JSON.stringify(canonical(value)))
function immutable<T>(value: T): T {
  const copy = structuredClone(value)
  const freeze = (v: unknown) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } }
  freeze(copy); return copy
}
export interface ChatInput {
  question: string; history: { role: 'user' | 'assistant'; text: string }[]
  attachment: null | { kind: 'SOURCE'; source: string; eol: 'LF' | 'CRLF' }
    | { kind: 'SELECTION'; text: string; startOffset: number; endOffset: number; eol: 'LF' | 'CRLF' }
}
export interface ChatCapture { binding: ChatBinding; manifest: ChatConsentManifest; input: ChatInput; provenance: ChatProvenance }
/** A mandatory Main policy port. Credential storage/known-secret detection stays
 * in the composition owner, not in conversations; no permissive runtime default.
 */
export interface ChatContentPolicy { allows(text: string): boolean }

export class ContextBuilder {
  constructor(private readonly policy: ChatContentPolicy, private readonly inputBudget = P.requestBytes - 8192) {
    // Reserve envelope/instruction space; the future adapter must also bound its
    // final HTTP body. This is a byte budget, never an exact token estimate.
    if (!Number.isSafeInteger(inputBudget) || inputBudget < 1 || inputBudget > P.requestBytes - 8192) throw new ChatDomainError('INVALID_INPUT')
  }
  assertSafe(value: unknown): void {
    try { if (this.policy.allows(JSON.stringify(value))) return } catch { /* Do not forward policy errors or content. */ }
    throw new ChatDomainError('INVALID_INPUT')
  }
  reply(value: unknown): ChatReply {
    const checked = validateChatReply(value)
    if (!checked.ok) throw new ChatDomainError('INVALID_RESPONSE')
    try { this.assertSafe(checked.value) } catch { throw new ChatDomainError('INVALID_RESPONSE') }
    return checked.value
  }
  /** Only ConversationManager supplies this Main-owned session snapshot/history.
   * Neither history, provenance nor system instructions are prepare inputs.
   */
  build(session: ChatSession, value: unknown, check: () => void): ChatCapture {
    const validated = validateChatPrepare(value), trusted = validateChatSession(session)
    if (!validated.ok || !trusted.ok) throw new ChatDomainError('INVALID_INPUT')
    const q = validated.value, s = trusted.value
    check()
    if (q.sessionId !== s.sessionId || q.revision !== s.revision) throw new ChatDomainError('HISTORY_STALE')
    const context = s.context
    let attachment: ChatInput['attachment'] = null, selection: ChatProvenance['selection'] = null
    if (q.scope !== 'QUESTION_ONLY') {
      if (context.kind !== 'PRACTICE') throw new ChatDomainError('INVALID_INPUT')
      const source = q.attachment.source
      if (chatTextHash(source) !== context.sourceFingerprint || (context.eol === 'LF' ? source.includes('\r') : /(?<!\r)\n/.test(source)))
        throw new ChatDomainError('CONTEXT_STALE')
      if (q.scope === 'QUESTION_WITH_SOURCE') attachment = { kind: 'SOURCE', source, eol: context.eol }
      else {
        const { text, ...range } = q.attachment.selection
        selection = { ...range, fingerprint: chatTextHash(text) }
        attachment = { kind: 'SELECTION', text, startOffset: range.startOffset, endOffset: range.endOffset, eol: context.eol }
      }
    }
    const provenance: ChatProvenance = { context, providerGeneration: s.providerGeneration, scope: q.scope, selection }
    const eligible = (p: ChatProvenance) => chatDigest(p.context) === chatDigest(context) && p.providerGeneration === s.providerGeneration
      && (p.scope === 'QUESTION_ONLY' || q.scope === 'QUESTION_WITH_SOURCE'
        || q.scope === 'QUESTION_WITH_SELECTION' && p.scope === q.scope && chatDigest(p.selection) === chatDigest(selection))
    let history: ChatMessage[] = []
    for (let i = 0; i < s.messages.length; i += 2)
      if (eligible(s.messages[i].provenance) && eligible(s.messages[i + 1].provenance)) history.push(s.messages[i], s.messages[i + 1])
    history = history.slice(-P.replayPairs * 2)
    const input: ChatInput = { question: q.question, history: [], attachment }
    for (;;) {
      input.history = history.map(m => ({ role: m.role, text: m.text }))
      if (smartBytes(input) <= this.inputBudget) break
      if (!history.length) throw new ChatDomainError('CONTEXT_TOO_LARGE')
      history = history.slice(2)
    }
    this.assertSafe(input)
    const digest = chatDigest({ question: q.question, history, context, providerGeneration: s.providerGeneration, scope: q.scope, attachment,
      sessionId: s.sessionId, generation: s.generation, revision: s.revision })
    const binding: ChatBinding = { sessionId: s.sessionId, generation: s.generation, revision: s.revision, context,
      providerGeneration: s.providerGeneration, scope: q.scope, digest }
    const manifest: ChatConsentManifest = { digest, scope: q.scope, questionBytes: Buffer.byteLength(q.question, 'utf8'),
      historyMessageIds: history.map(m => m.messageId), historyBytes: smartBytes(input.history),
      attachmentBytes: attachment === null ? 0 : Buffer.byteLength(attachment.kind === 'SOURCE' ? attachment.source : attachment.text, 'utf8'),
      requestBytes: smartBytes(input), tokenCount: null, publicRun: false }
    check()
    return immutable({ binding, manifest, input, provenance })
  }
}

export function chatContextIdentity(context: ChatContext): string {
  return context.kind === 'PRACTICE' ? chatDigest([context.kind, context.exerciseId, context.language]) : chatDigest(context)
}
