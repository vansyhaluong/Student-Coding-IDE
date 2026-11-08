import type { ChatContext, ChatPrepared, ChatReference, ChatSession, ChatStatus } from '../../../../shared/contracts/learning-chat'
import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartInteger } from '../../../../shared/contracts/smart-hints-validation'
import type { ProviderTransport } from '../analysis/contracts'
import { SmartProviderError } from '../smart-hints/adapter'
import { SharedExecutionCoordinator } from '../smart-hints/execution-coordinator'
import { SharedGeminiTransport, type GeminiCredential } from '../smart-hints/gemini-transport'
import { ChatDomainError, ContextBuilder, type ChatContentPolicy } from './context-builder'
import { ConversationManager, type ChatOwner, type ChatRetireReason } from './conversation-manager'
import { GeminiChatAdapter } from './gemini-chat-adapter'

/** Main-only borrowed configuration capabilities, never an IPC input. The same
 * configuration owner supplies the coordinator/ledger, key and generation.
 * Retirement notification must precede provider/key replacement. */
export interface ChatProviderPort {
  /** Configuration/key readiness only. Rate/daily exhaustion belongs to the
   * coordinator; reserving the last budget unit must not invalidate this turn. */
  current(): { generation: number; available: boolean }
  transport: ProviderTransport
  credential: Pick<GeminiCredential, 'value'>
  onRetire(listener: (reason: 'PROVIDER_CHANGED' | 'KEY_CHANGED') => void): () => void
  failed?(error: unknown): Promise<void>
  succeeded?(): Promise<void>
}
export interface ChatServiceOptions {
  coordinator: SharedExecutionCoordinator
  provider: ChatProviderPort
  contentPolicy: ChatContentPolicy
  clock?(): number
}

/** Main domain orchestration only. No alternate quota, provider configuration,
 * editor authority, IPC or application event subscription is created here. */
export class ChatService {
  private readonly clock: () => number
  private readonly builder: ContextBuilder
  private readonly conversations: ConversationManager
  private readonly unsubscribe: () => void
  private readonly tasks = new Set<Promise<void>>()
  private stopped = false
  constructor(private readonly options: ChatServiceOptions) {
    this.clock = options.clock ?? Date.now
    this.builder = new ContextBuilder(options.contentPolicy)
    this.conversations = new ConversationManager(this.builder, this.clock)
    this.unsubscribe = options.provider.onRetire(reason => this.conversations.retireAll(reason))
  }
  private provider(): number {
    if (this.stopped) throw new ChatDomainError('UNCONFIGURED')
    const current = this.options.provider.current()
    if (!smartInteger(current.generation, 1) || current.available !== true) throw new ChatDomainError('UNCONFIGURED')
    return current.generation
  }
  openSession(owner: ChatOwner, context: ChatContext, check: () => void): ChatSession {
    const generation = this.provider()
    return this.conversations.open(owner, context, generation, () => {
      check()
      if (this.stopped || this.options.provider.current().generation !== generation) throw new ChatDomainError('CONTEXT_STALE')
    })
  }
  getSession(owner: ChatOwner, sessionId: string): ChatSession { return this.conversations.snapshot(owner, sessionId) }
  closeSession(owner: ChatOwner, reason: ChatRetireReason = 'PANEL_CLOSED'): void { this.conversations.retire(owner, reason) }
  updateContext(owner: ChatOwner, sessionId: string, revision: number, context: ChatContext, check: () => void): ChatSession {
    const generation = this.getSession(owner, sessionId).providerGeneration
    return this.conversations.updateContext(owner, sessionId, revision, context, () => {
      check()
      if (this.stopped || this.options.provider.current().generation !== generation) throw new ChatDomainError('CONTEXT_STALE')
    })
  }
  prepare(owner: ChatOwner, value: unknown): ChatPrepared { return this.conversations.prepare(owner, value) }
  status(owner: ChatOwner, reference: ChatReference): ChatStatus { return this.conversations.status(owner, reference) }
  cancel(owner: ChatOwner, reference: ChatReference): ChatStatus { return this.conversations.cancel(owner, reference) }

  start(owner: ChatOwner, value: unknown): ChatStatus {
    // Consent/owner/digest/revision/TTL checks precede admission and all HTTP.
    const execution = this.conversations.start(owner, value), reference = this.conversations.reference(execution)
    try { this.provider() } catch { return this.conversations.fail(execution, 'UNCONFIGURED') }
    const deadline = Math.min(this.clock() + P.timeoutMs, this.getSession(owner, reference.sessionId).expiresAt)
    const admitted = this.options.coordinator.admit({ signal: execution.signal, deadline,
      cancel: () => {
        try { this.cancel(owner, reference) } catch (lost) { if (!(lost instanceof ChatDomainError)) throw lost }
      } })
    if (!admitted.ok) return this.conversations.fail(execution, admitted.code)
    const live = () => {
      this.conversations.capture(execution)
      if (execution.signal.aborted || this.clock() >= deadline) throw new SmartProviderError('TIMEOUT')
    }
    const fail = (error: unknown) => {
      // Retired/stale/terminal executions have no commit authority. Domain errors
      // here describe a lost owner, never a provider error string to publish.
      try {
        this.conversations.fail(execution, error instanceof SmartProviderError ? error.code
          : error instanceof ChatDomainError ? error.reason : 'PROVIDER')
      } catch (lost) { if (!(lost instanceof ChatDomainError)) throw lost }
    }
    const timer = setTimeout(() => fail(new SmartProviderError('TIMEOUT')), Math.max(0, deadline - this.clock()))
    const clear = () => clearTimeout(timer)
    execution.signal.addEventListener('abort', clear, { once: true })
    const http = new SharedGeminiTransport(this.options.provider.transport,
      // Borrow the existing key. Per-operation cleanup must not erase it.
      { value: () => this.options.provider.credential.value(), clear() {} }, { beforeInference: async signal => {
        live(); await admitted.admission.reserveInference(signal); live()
      } })
    const adapter = new GeminiChatAdapter(http, { capture: e => this.conversations.capture(e), reply: v => this.builder.reply(v) })
    const task = Promise.resolve().then(async () => {
      try {
        live()
        const reply = await adapter.run(execution, { deadline, clock: this.clock })
        live(); await this.options.provider.succeeded?.()
        live(); this.conversations.complete(execution, reply)
      } catch (error) {
        if (!execution.signal.aborted) {
          // Configuration remains the only owner of remote-limit/readiness state.
          try { await this.options.provider.failed?.(error) } catch { /* Original fixed error wins. */ }
        }
        fail(error)
      }
      finally {
        clear(); execution.signal.removeEventListener('abort', clear)
        admitted.admission.release()
      }
    })
    this.tasks.add(task)
    void task.then(() => this.tasks.delete(task), () => this.tasks.delete(task))
    return this.status(owner, reference)
  }
  /** Join this consumer only; configuration owns shared shutdown/drain. */
  async drain(): Promise<void> { await Promise.all([...this.tasks]) }
  beginShutdown(): void {
    if (!this.stopped) { this.stopped = true; this.unsubscribe(); this.conversations.stop() }
  }
  async stop(): Promise<void> {
    this.beginShutdown()
    await this.drain()
  }
}
