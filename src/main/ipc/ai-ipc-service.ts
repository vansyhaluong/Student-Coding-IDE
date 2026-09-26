import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { AI_CHANNELS, validateAiChatRequest, validateAiSession, type AiChatEvent } from '../../shared/contracts/ai'
import { DomainError, serializeAppError } from '../errors/app-error'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { OllamaService } from '../services/ai/ollama-service'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'

export class AiIpcService {
  readonly name = 'AiIpcService'
  private removers: Array<() => void> = []
  private readonly active = new Map<number, { requestId: string; controller: AbortController; context: IpcRequestContext }>()
  private readonly owners = new Map<number, () => void>()
  constructor(private readonly registry: IpcHandlerRegistry, private readonly ai: OllamaService,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly publish: (ownerId: number, event: AiChatEvent) => void) {}

  observe(owner: Pick<WebContents, 'id' | 'on' | 'removeListener'>): void {
    if (this.owners.has(owner.id)) return
    const lost = () => this.cancelOwner(owner.id)
    const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) lost()
    }
    const remove = () => {
      lost()
      owner.removeListener('did-start-navigation', navigation)
      owner.removeListener('render-process-gone', lost)
      owner.removeListener('destroyed', remove)
      this.owners.delete(owner.id)
    }
    owner.on('did-start-navigation', navigation)
    owner.on('render-process-gone', lost)
    owner.on('destroyed', remove)
    this.owners.set(owner.id, remove)
  }

  private cancelOwner(ownerId: number): void {
    const request = this.active.get(ownerId)
    this.active.delete(ownerId)
    request?.controller.abort()
  }
  start(): void {
    this.removers.push(
      this.registry.register({ channel: AI_CHANNELS.getStatus, validate: validateEmptyObject, handle: async (_, context) => {
        this.authorize(context)
        const value = await this.ai.getStatus()
        this.authorize(context)
        return value
      } }),
      this.registry.register({ channel: AI_CHANNELS.startChat, validate: validateAiChatRequest, handle: (request, context) => {
        this.authorize(context)
        if (this.active.has(context.senderId)) throw new DomainError({ code: 'INVALID_INPUT',
          message: 'An AI response is already in progress.', retryable: false })
        const entry = { requestId: randomUUID(), controller: new AbortController(), context }
        this.active.set(context.senderId, entry)
        const emit = (event: AiChatEvent) => {
          if (this.active.get(context.senderId) !== entry) return
          try { this.authorize(context) } catch { this.cancelOwner(context.senderId); return }
          if (event.type !== 'chunk') this.active.delete(context.senderId)
          try { this.publish(context.senderId, event) } catch { this.cancelOwner(context.senderId); entry.controller.abort() }
        }
        void this.ai.streamChat(request, entry.controller.signal,
          content => emit({ requestId: entry.requestId, type: 'chunk', content })).then(
          () => emit({ requestId: entry.requestId, type: 'complete' }),
          error => {
            const safe = serializeAppError(error, AI_CHANNELS.startChat)
            emit({ requestId: entry.requestId, type: 'error', error: {
              code: safe.code, message: safe.message, retryable: safe.retryable, operation: AI_CHANNELS.startChat,
            } })
          },
        )
        return { requestId: entry.requestId }
      } }),
      this.registry.register({ channel: AI_CHANNELS.stopChat, validate: validateAiSession, handle: ({ requestId }, context) => {
        this.authorize(context)
        const entry = this.active.get(context.senderId)
        // Completed/stopped requests are idempotent; another window's request is never touched.
        if (!entry || entry.requestId !== requestId) return null
        this.authorize(entry.context)
        if (entry.context.senderFrame?.frameToken !== context.senderFrame?.frameToken
          || entry.context.senderFrame?.processId !== context.senderFrame?.processId) {
          throw new DomainError({ code: 'PERMISSION_DENIED', message: 'The AI request belongs to another document.', retryable: false })
        }
        this.cancelOwner(context.senderId)
        this.publish(context.senderId, { requestId, type: 'stopped' })
        return null
      } }),
    )
  }
  stop(): void {
    for (const remove of this.removers.splice(0)) remove()
    for (const remove of [...this.owners.values()]) remove()
    for (const ownerId of this.active.keys()) this.cancelOwner(ownerId)
  }
}
