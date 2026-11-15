import type { WebContents } from 'electron'

import {
  PROJECT_AGENT_CHANNELS as CHANNELS,
} from '../../shared/contracts/project-agent'
import {
  validateAgentApplyRequest,
  validateProjectAgentCancelRequest,
  validateProjectAgentSessionRequest,
  validateProjectAgentTurnRequest,
} from '../../shared/contracts/project-agent-validation'
import type { ManagedService } from '../app/desktop-application'
import { DomainError } from '../errors/app-error'
import type { ProjectAgentOwner, ProjectAgentService } from '../services/ai/project-agent-service'
import type { IpcHandlerRegistry, IpcRequestContext, IpcSenderFrame } from './ipc-handler-registry'

const sameFrame = (left: IpcSenderFrame | null | undefined, right: IpcSenderFrame | null | undefined) => (
  !!left && !!right && left.processId === right.processId && left.frameToken === right.frameToken
)

/**
 * Typed Project Agent IPC. Read, list, and propose stay inside Main.
 * The renderer can start a turn, cancel it, and apply one confirmed edit.
 */
export class ProjectAgentIpcService implements ManagedService {
  readonly name = 'ProjectAgentIpcService'
  private readonly removers: Array<() => void> = []
  private readonly owners = new Map<number, () => void>()
  private readonly frames = new Map<number, IpcSenderFrame>()
  private sealed = false

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly service: ProjectAgentService,
    private readonly authorize: (context: IpcRequestContext) => void,
  ) {}

  observe(owner: Pick<WebContents, 'id' | 'on' | 'removeListener'>): void {
    if (this.owners.has(owner.id)) return
    const lost = () => {
      this.service.dropOwner(owner.id)
      this.frames.delete(owner.id)
    }
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

  start(): void {
    this.removers.push(
      this.registry.register({
        channel: CHANNELS.session,
        validate: validateProjectAgentSessionRequest,
        handle: (_request, context) => {
          const owner = this.bind(context)
          const session = this.service.session()
          this.sameOwner(context, owner)
          return session
        },
      }),
      this.registry.register({
        channel: CHANNELS.turn,
        validate: validateProjectAgentTurnRequest,
        handle: async (request, context) => {
          const owner = this.bind(context)
          const result = await this.service.turn(owner, request)
          this.sameOwner(context, owner)
          return result
        },
      }),
      this.registry.register({
        channel: CHANNELS.cancel,
        validate: validateProjectAgentCancelRequest,
        handle: (request, context) => {
          const owner = this.bind(context)
          this.service.cancel(owner, request)
          return null
        },
      }),
      this.registry.register({
        channel: CHANNELS.apply,
        validate: validateAgentApplyRequest,
        handle: async (request, context) => {
          const owner = this.bind(context)
          const result = await this.service.apply(owner, request)
          this.sameOwner(context, owner)
          return result
        },
      }),
    )
  }

  beginShutdown(): void {
    this.sealed = true
    this.service.beginShutdown()
  }

  stop(): Promise<void> {
    this.beginShutdown()
    for (const remove of this.removers.splice(0)) remove()
    for (const remove of this.owners.values()) remove()
    this.owners.clear()
    return this.service.stop()
  }

  private bind(context: IpcRequestContext): ProjectAgentOwner {
    if (this.sealed) throw denied()
    this.authorize(context)
    const frame = context.senderFrame
    if (!frame || frame.detached || frame.isDestroyed()) throw denied()
    const previous = this.frames.get(context.senderId)
    if (previous && !sameFrame(previous, frame)) this.service.dropOwner(context.senderId)
    this.frames.set(context.senderId, frame)
    return { id: context.senderId, scope: frame.frameToken }
  }

  private sameOwner(context: IpcRequestContext, owner: ProjectAgentOwner): void {
    const current = this.bind(context)
    if (current.id !== owner.id || current.scope !== owner.scope) throw denied()
  }
}

function denied(): DomainError {
  return new DomainError({
    code: 'PERMISSION_DENIED',
    message: 'The project agent request is stale.',
    operation: 'project-agent:authorize',
    retryable: false,
  })
}
