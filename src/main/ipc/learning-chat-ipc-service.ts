import { randomUUID } from 'node:crypto'
import { CHAT_CHANNELS as C, CHAT_POLICY, type ChatContext, type ChatContextInput } from '../../shared/contracts/learning-chat'
import { validateChatOpen, validateChatClose, validateChatSessionReference, validateChatUpdate, validateChatPrepare, validateChatSend,
  validateChatReference, isChatSession, isChatStatus, validateChatPrepared } from '../../shared/contracts/learning-chat-validation'
import { DomainError } from '../errors/app-error'
import type { ChatService } from '../services/learning/chat/service'
import { chatTextHash } from '../services/learning/chat/context-builder'
import type { ExerciseOwner } from '../services/learning/exercise-service'
import type { IpcHandlerRegistry, IpcRequestContext, IpcSenderFrame } from './ipc-handler-registry'

const sameFrame = (a: IpcSenderFrame | null | undefined, b: IpcSenderFrame | undefined) => !!a && !!b
  && a.processId === b.processId && a.frameToken === b.frameToken
const denied = () => new DomainError({ code: 'INVALID_INPUT', operation: 'learning-chat', message: 'Invalid or stale Learning Chat request.', retryable: false })
interface DocumentOwner { owner: ExerciseOwner; scope: string; frame?: IpcSenderFrame; remove(): void }

/** Semantic Chat channels only. Authorizers are Main capabilities, not DTOs. */
export class LearningChatIpcService {
  readonly name = 'LearningChatIpcService'
  private readonly owners = new Map<number, DocumentOwner>()
  private removers: (() => void)[] = []
  private sealed = false
  constructor(private readonly registry: IpcHandlerRegistry, private readonly service: ChatService,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly authorizeContext: (context: ChatContext) => void) {}
  observe(owner: ExerciseOwner): void {
    if (this.sealed || owner.isDestroyed() || this.owners.has(owner.id)) return
    const invalidate = () => {
      this.service.closeSession({ id: owner.id, scope: entry.scope }, 'NAVIGATION')
      entry.scope = randomUUID(); entry.frame = undefined
    }
    const navigate = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace && !this.sealed) invalidate() }
    const gone = () => { if (!this.sealed) invalidate() }
    const destroyed = () => { gone(); entry.remove() }
    const entry: DocumentOwner = { owner, scope: randomUUID(), remove: () => {
      owner.removeListener('did-start-navigation', navigate); owner.removeListener('render-process-gone', gone); owner.removeListener('destroyed', destroyed)
      if (this.owners.get(owner.id) === entry) this.owners.delete(owner.id)
    } }
    this.owners.set(owner.id, entry)
    owner.on('did-start-navigation', navigate); owner.on('render-process-gone', gone); owner.on('destroyed', destroyed)
  }
  private owner(context: IpcRequestContext) {
    if (this.sealed) throw denied()
    this.authorize(context)
    const entry = this.owners.get(context.senderId), frame = context.senderFrame
    if (!entry || entry.owner.isDestroyed() || !frame || frame.detached || frame.isDestroyed()) throw denied()
    if (entry.frame && !sameFrame(frame, entry.frame)) {
      this.service.closeSession({ id: context.senderId, scope: entry.scope }, 'NAVIGATION')
      entry.scope = randomUUID()
    }
    entry.frame = frame
    return entry
  }
  private boundary<T>(context: IpcRequestContext, action: (owner: { id: number; scope: string }, check: () => void) => T): T {
    const entry = this.owner(context), scope = entry.scope, frame = context.senderFrame
    const check = () => {
      if (this.owner(context) !== entry || entry.scope !== scope || !sameFrame(frame, entry.frame)) throw denied()
    }
    const result = action({ id: context.senderId, scope }, check); check()
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > CHAT_POLICY.requestBytes) throw denied()
    return result
  }
  private context(input: ChatContextInput): ChatContext {
    let result: ChatContext
    if (input.kind === 'LEARNING') result = input
    else { const { source, ...identity } = input; result = { ...identity, sourceFingerprint: chatTextHash(source) } }
    this.authorizeContext(result); return result
  }
  start(): void {
    const session = (value: unknown) => { if (!isChatSession(value)) throw denied(); return value }
    const status = (value: unknown) => { if (!isChatStatus(value)) throw denied(); return value }
    this.removers = [
      this.registry.register({ channel: C.openSession, validate: validateChatOpen, handle: (q, c) => this.boundary(c, (owner, check) => {
        const target = this.context(q.context)
        return session(this.service.openSession(owner, target, () => { check(); this.authorizeContext(target) }))
      }) }),
      this.registry.register({ channel: C.getSession, validate: validateChatSessionReference,
        handle: (q, c) => this.boundary(c, owner => session(this.service.getSession(owner, q.sessionId))) }),
      this.registry.register({ channel: C.closeSession, validate: validateChatClose, handle: (q, c) => this.boundary(c, owner => {
        if (this.service.getSession(owner, q.sessionId).revision !== q.revision) throw denied()
        this.service.closeSession(owner, q.reason); return null
      }) }),
      this.registry.register({ channel: C.updateContext, validate: validateChatUpdate, handle: (q, c) => this.boundary(c, (owner, check) => {
        const target = this.context(q.context)
        return session(this.service.updateContext(owner, q.sessionId, q.revision, target, () => { check(); this.authorizeContext(target) }))
      }) }),
      this.registry.register({ channel: C.prepare, validate: validateChatPrepare, handle: (q, c) => this.boundary(c, owner => {
        const result = validateChatPrepared(this.service.prepare(owner, q)); if (!result.ok) throw denied(); return result.value
      }) }),
      this.registry.register({ channel: C.start, validate: validateChatSend, handle: (q, c) => this.boundary(c, owner => status(this.service.start(owner, q))) }),
      this.registry.register({ channel: C.status, validate: validateChatReference, handle: (q, c) => this.boundary(c, owner => status(this.service.status(owner, q))) }),
      this.registry.register({ channel: C.cancel, validate: validateChatReference, handle: (q, c) => this.boundary(c, owner => status(this.service.cancel(owner, q))) }),
    ]
  }
  beginShutdown(): void { this.sealed = true; this.service.beginShutdown() }
  /** Existing Main Learning context invalidation, never an owner ID from a DTO. */
  invalidateOwner(id: number): void {
    const entry = this.owners.get(id)
    if (!this.sealed && entry) this.service.closeSession({ id, scope: entry.scope }, 'CONTEXT_CHANGED')
  }
  async stop(): Promise<void> {
    this.beginShutdown(); for (const remove of this.removers.splice(0)) remove()
    for (const entry of [...this.owners.values()]) entry.remove()
    await this.service.stop()
  }
}
