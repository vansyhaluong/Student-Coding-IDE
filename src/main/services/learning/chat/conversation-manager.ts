import { randomUUID } from 'node:crypto'
import { CHAT_POLICY as P, CHAT_FAILURES, type ChatContext, type ChatFailure, type ChatMessage, type ChatPrepared,
  type ChatReference, type ChatSession, type ChatStatus } from '../../../../shared/contracts/learning-chat'
import { validateChatContext, validateChatPrepare, validateChatSend, validateChatReference } from '../../../../shared/contracts/learning-chat-validation'
import { smartBytes, smartInteger, smartUuid } from '../../../../shared/contracts/smart-hints-validation'
import { ChatDomainError, ContextBuilder, chatContextIdentity, chatDigest, type ChatCapture } from './context-builder'

/** Main obtains this from the owning WebContents/document, never an IPC DTO. */
export interface ChatOwner { id: number; scope: string }
export interface ChatExecution {
  readonly signal: AbortSignal
  /** A live Main-only getter, not a history/editor authority or public DTO. */
  capture(): ChatCapture
}
interface Turn {
  requestDigest: string; capture?: ChatCapture; status: ChatStatus; abort: AbortController
  timer?: ReturnType<typeof setTimeout>; execution?: ChatExecution
}
interface Session {
  owner: ChatOwner; data: ChatSession; check(): void; timer: ReturnType<typeof setTimeout>
  seen: Set<string>; turn?: Turn
}
export const CHAT_RETIRE_REASONS = ['PANEL_CLOSED', 'CONTEXT_CHANGED', 'NAVIGATION', 'PROVIDER_CHANGED', 'KEY_CHANGED', 'SHUTDOWN'] as const
export type ChatRetireReason = typeof CHAT_RETIRE_REASONS[number]

/** In-memory domain only. No transport, credentials, quota or inference timers. */
export class ConversationManager {
  private sessions = new Map<number, Session>()
  private executions = new WeakMap<ChatExecution, { session: Session; turn: Turn }>()
  private generation = 0
  private stopped = false
  constructor(private readonly builder: ContextBuilder, private readonly clock = Date.now) {}
  private owner(owner: ChatOwner): void {
    if (!owner || !smartInteger(owner.id, 1) || !smartUuid(owner.scope) || this.stopped) throw new ChatDomainError('INVALID_INPUT')
  }
  private authority(s: Session): void {
    if (this.stopped || this.sessions.get(s.owner.id) !== s) throw new ChatDomainError('CONTEXT_STALE')
    if (this.clock() >= s.data.expiresAt) { this.purge(s); throw new ChatDomainError('SESSION_EXPIRED') }
    try { s.check() } catch { this.purge(s); throw new ChatDomainError('CONTEXT_STALE') }
    if (this.stopped || this.sessions.get(s.owner.id) !== s) throw new ChatDomainError('CONTEXT_STALE')
    if (this.clock() >= s.data.expiresAt) { this.purge(s); throw new ChatDomainError('SESSION_EXPIRED') }
  }
  private get(owner: ChatOwner, sessionId: string): Session {
    this.owner(owner)
    const s = this.sessions.get(owner.id)
    if (!s || s.owner.scope !== owner.scope || s.data.sessionId !== sessionId) throw new ChatDomainError('CONTEXT_STALE')
    this.authority(s); return s
  }
  private terminate(turn: Turn, state: 'CANCELLED' | 'EXPIRED' | 'FAILED', code?: ChatFailure): void {
    const { schemaVersion, sessionId, requestId, operationId, sequence, binding } = turn.status
    turn.capture = undefined; clearTimeout(turn.timer)
    const base = { schemaVersion, sessionId, requestId, operationId, sequence: sequence + 1, binding }
    turn.status = state === 'FAILED' ? { ...base, state, code: code ?? 'INVALID_INPUT' } : { ...base, state }
    turn.abort.abort()
  }
  private purge(s: Session): void {
    if (s.turn) this.terminate(s.turn, 'CANCELLED')
    s.data.messages = []; s.seen.clear(); clearTimeout(s.timer)
    if (this.sessions.get(s.owner.id) === s) this.sessions.delete(s.owner.id)
  }
  open(owner: ChatOwner, context: ChatContext, providerGeneration: number, check: () => void): ChatSession {
    this.owner(owner)
    const checked = validateChatContext(context)
    if (!checked.ok || !smartInteger(providerGeneration, 1)) throw new ChatDomainError('INVALID_INPUT')
    try { check() } catch { throw new ChatDomainError('CONTEXT_STALE') }
    const old = this.sessions.get(owner.id)
    if (old) {
      if (old.owner.scope === owner.scope && old.data.providerGeneration === providerGeneration && chatContextIdentity(old.data.context) === chatContextIdentity(checked.value)
        && this.clock() < old.data.expiresAt) {
        this.authority(old)
        return this.updateContext(owner, old.data.sessionId, old.data.revision, checked.value, check)
      }
      this.purge(old)
    }
    const now = this.clock(), data: ChatSession = { schemaVersion: 1, sessionId: randomUUID(), generation: ++this.generation, revision: 0,
      state: 'ACTIVE', context: checked.value, providerGeneration, createdAt: now, expiresAt: now + P.sessionMs, messages: [] }
    const s: Session = { owner: { ...owner }, data, check, seen: new Set(), timer: setTimeout(() => {
      if (this.sessions.get(s.owner.id) === s) this.purge(s)
    }, P.sessionMs) }
    s.timer.unref?.(); this.sessions.set(owner.id, s)
    return structuredClone(data)
  }
  snapshot(owner: ChatOwner, sessionId: string): ChatSession { return structuredClone(this.get(owner, sessionId).data) }
  updateContext(owner: ChatOwner, sessionId: string, revision: number, context: ChatContext, check: () => void): ChatSession {
    const s = this.get(owner, sessionId), next = validateChatContext(context)
    if (!next.ok || revision !== s.data.revision) throw new ChatDomainError('HISTORY_STALE')
    if (chatContextIdentity(next.value) !== chatContextIdentity(s.data.context)) { this.purge(s); throw new ChatDomainError('CONTEXT_STALE') }
    try { check() } catch { this.purge(s); throw new ChatDomainError('CONTEXT_STALE') }
    if (chatDigest(next.value) !== chatDigest(s.data.context)) {
      const before = s.data.context
      if (before.kind !== 'PRACTICE' || next.value.kind !== 'PRACTICE' || next.value.sourceRevision <= before.sourceRevision
        || next.value.modelId === before.modelId && next.value.modelVersion <= before.modelVersion) throw new ChatDomainError('CONTEXT_STALE')
      if (s.turn) this.terminate(s.turn, 'CANCELLED')
      s.data.context = next.value; s.data.revision++
    }
    s.check = check
    return structuredClone(s.data)
  }
  prepare(owner: ChatOwner, value: unknown): ChatPrepared {
    const q = validateChatPrepare(value)
    if (!q.ok) throw new ChatDomainError('INVALID_INPUT')
    const s = this.get(owner, q.value.sessionId), requestDigest = chatDigest(q.value), previous = s.turn
    if (s.seen.has(q.value.requestId)) {
      if (previous?.status.state === 'PREPARED' && previous.status.requestId === q.value.requestId && previous.requestDigest === requestDigest) {
        if (this.clock() >= previous.status.expiresAt) { this.terminate(previous, 'EXPIRED'); throw new ChatDomainError('CAPTURE_EXPIRED') }
        return structuredClone(previous.status)
      }
      throw new ChatDomainError('INVALID_INPUT')
    }
    if (previous?.status.state === 'RUNNING') throw new ChatDomainError('BUSY')
    if (s.seen.size >= P.operations) throw new ChatDomainError('LIMIT_EXCEEDED')
    const capture = this.builder.build(s.data, q.value, () => {
      this.authority(s)
      if (s.data.revision !== q.value.revision) throw new ChatDomainError('HISTORY_STALE')
    })
    if (previous) this.terminate(previous, 'CANCELLED')
    const status: ChatPrepared = { schemaVersion: 1, sessionId: s.data.sessionId, requestId: q.value.requestId, operationId: randomUUID(),
      sequence: 0, binding: capture.binding, state: 'PREPARED', consentToken: randomUUID(), consentVersion: 1,
      expiresAt: Math.min(this.clock() + P.prepareMs, s.data.expiresAt), manifest: capture.manifest }
    const turn: Turn = { requestDigest, capture, status, abort: new AbortController() }
    turn.timer = setTimeout(() => { if (s.turn === turn && turn.status.state === 'PREPARED') this.terminate(turn, 'EXPIRED') }, Math.max(0, status.expiresAt - this.clock()))
    turn.timer.unref?.(); s.turn = turn; s.seen.add(q.value.requestId)
    return structuredClone(status)
  }
  private operation(owner: ChatOwner, value: unknown): { session: Session; turn: Turn } {
    const q = validateChatReference(value)
    if (!q.ok) throw new ChatDomainError('INVALID_INPUT')
    const session = this.get(owner, q.value.sessionId), turn = session.turn
    if (!turn || turn.status.operationId !== q.value.operationId || turn.status.requestId !== q.value.requestId) throw new ChatDomainError('CONTEXT_STALE')
    if (turn.status.state === 'PREPARED' && this.clock() >= turn.status.expiresAt) this.terminate(turn, 'EXPIRED')
    return { session, turn }
  }
  status(owner: ChatOwner, reference: ChatReference): ChatStatus { return structuredClone(this.operation(owner, reference).turn.status) }
  start(owner: ChatOwner, value: unknown): ChatExecution {
    const q = validateChatSend(value)
    if (!q.ok) throw new ChatDomainError('CONSENT_REQUIRED')
    const { session, turn } = this.operation(owner, { sessionId: q.value.sessionId, requestId: q.value.requestId, operationId: q.value.operationId })
    if (turn.status.state !== 'PREPARED' || !turn.capture || turn.status.consentToken !== q.value.consentToken || turn.status.binding.digest !== q.value.digest)
      throw new ChatDomainError('CAPTURE_EXPIRED')
    if (turn.status.binding.revision !== session.data.revision) throw new ChatDomainError('HISTORY_STALE')
    clearTimeout(turn.timer)
    const { schemaVersion, sessionId, requestId, operationId, sequence, binding } = turn.status
    turn.status = { schemaVersion, sessionId, requestId, operationId, binding, state: 'RUNNING', sequence: sequence + 1 }
    const execution: ChatExecution = Object.freeze({ signal: turn.abort.signal, capture: () => {
      this.live(execution)
      return turn.capture!
    } })
    turn.execution = execution; this.executions.set(execution, { session, turn })
    return execution
  }
  private live(execution: ChatExecution): { session: Session; turn: Turn } {
    const state = this.executions.get(execution)
    if (!state) throw new ChatDomainError('INVALID_INPUT')
    const { session, turn } = state
    this.authority(session)
    if (session.turn !== turn || turn.status.state !== 'RUNNING' || turn.abort.signal.aborted || !turn.capture
      || turn.status.binding.revision !== session.data.revision) throw new ChatDomainError('CONTEXT_STALE')
    return state
  }
  /** Main-only identity-checked reader for adapters. Never invoke a capture()
   * function supplied through an untrusted/structurally forged execution. */
  capture(execution: ChatExecution): ChatCapture { return this.live(execution).turn.capture! }
  reference(execution: ChatExecution): ChatReference {
    const { sessionId, requestId, operationId } = this.live(execution).turn.status
    return { sessionId, requestId, operationId }
  }
  complete(execution: ChatExecution, value: unknown): ChatStatus {
    const { session, turn } = this.live(execution), capture = turn.capture!
    try {
      const reply = this.builder.reply(value)
      const pair: [ChatMessage, ChatMessage] = [
        { messageId: randomUUID(), operationId: turn.status.operationId, role: 'user', state: 'COMPLETE', text: capture.input.question, provenance: capture.provenance },
        { messageId: randomUUID(), operationId: turn.status.operationId, role: 'assistant', state: 'COMPLETE', text: reply.text, provenance: capture.provenance },
      ]
      if (smartBytes(pair) > P.historyBytes) throw new ChatDomainError('CONTEXT_TOO_LARGE')
      this.live(execution)
      const messages = [...session.data.messages, ...pair]
      while (messages.length > P.messages || smartBytes(messages) > P.historyBytes) messages.splice(0, 2)
      session.data.messages = messages; session.data.revision++
      turn.capture = undefined
      turn.status = { ...turn.status, state: 'COMPLETE', sequence: turn.status.sequence + 1, messages: pair }
      turn.abort.abort()
    } catch (error) { this.terminate(turn, 'FAILED', error instanceof ChatDomainError ? error.reason : 'INVALID_RESPONSE') }
    return structuredClone(turn.status)
  }
  fail(execution: ChatExecution, code: ChatFailure): ChatStatus {
    const { turn } = this.live(execution)
    if (!CHAT_FAILURES.includes(code)) throw new ChatDomainError('INVALID_INPUT')
    this.terminate(turn, 'FAILED', code); return structuredClone(turn.status)
  }
  cancel(owner: ChatOwner, reference: ChatReference): ChatStatus {
    const { turn } = this.operation(owner, reference)
    if (turn.status.state === 'PREPARED' || turn.status.state === 'RUNNING') this.terminate(turn, 'CANCELLED')
    return structuredClone(turn.status)
  }
  retire(owner: ChatOwner, reason: ChatRetireReason): void {
    this.owner(owner)
    if (!CHAT_RETIRE_REASONS.includes(reason)) throw new ChatDomainError('INVALID_INPUT')
    const s = this.sessions.get(owner.id)
    if (s?.owner.scope === owner.scope) this.purge(s)
  }
  retireAll(reason: ChatRetireReason): void {
    if (!CHAT_RETIRE_REASONS.includes(reason)) throw new ChatDomainError('INVALID_INPUT')
    for (const s of this.sessions.values()) this.purge(s)
  }
  stop(): void { this.retireAll('SHUTDOWN'); this.stopped = true }
}
