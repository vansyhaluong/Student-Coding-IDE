import {
  TERMINAL_CHANNELS,
  validateCloseTerminalRequest,
  validateCreateTerminalRequest,
  validateResizeTerminalRequest,
  validateTerminalEvent,
  validateTerminalInputRequest,
  type CloseTerminalResponse,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type ProjectId,
  type TerminalEvent,
  type TerminalSessionId,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { DomainError } from '../errors/app-error'
import type {
  TerminalOwnershipContext,
  TerminalSessionSnapshot,
} from '../services/terminal/terminal-service'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export interface TerminalIpcServiceBoundary {
  create(
    request: CreateTerminalRequest,
    context: TerminalOwnershipContext,
  ): Promise<CreateTerminalResponse>
  input(
    request: { sessionId: TerminalSessionId; data: string },
    context: TerminalOwnershipContext,
  ): void
  resize(
    request: { sessionId: TerminalSessionId; cols: number; rows: number },
    context: TerminalOwnershipContext,
  ): void
  close(
    request: { sessionId: TerminalSessionId },
    context: TerminalOwnershipContext,
  ): Promise<CloseTerminalResponse>
  getSessionSnapshot(sessionId: TerminalSessionId): TerminalSessionSnapshot | null
  closeSessionsForOwner(ownerWebContentsId: number): Promise<void>
}

export interface TerminalWebContents {
  readonly id: number
  isDestroyed(): boolean
  send(channel: string, event: TerminalEvent): void
  on(
    event: 'did-start-navigation',
    listener: (
      event: unknown,
      url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ) => void,
  ): void
  once(event: 'destroyed', listener: () => void): void
  removeNavigationListener(
    listener: (
      event: unknown,
      url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ) => void,
  ): void
  removeDestroyedListener(listener: () => void): void
}

export interface TerminalIpcServiceOptions {
  getWebContents(ownerWebContentsId: number): TerminalWebContents | null
  onCleanupError?(error: unknown): void
  onEventRoutingError?(error: unknown): void
}

interface OwnerSubscription {
  webContents: TerminalWebContents
  onDestroyed: () => void
  onNavigation: (
    event: unknown,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean,
  ) => void
}

export class TerminalIpcService implements ManagedService {
  readonly name = 'TerminalIpcService'
  private readonly cleanup: (() => void)[] = []
  private readonly owners = new Map<number, OwnerSubscription>()

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly terminalService: TerminalIpcServiceBoundary,
    private readonly options: TerminalIpcServiceOptions,
  ) {}

  start(): void {
    this.cleanup.push(
      this.registry.register({
        channel: TERMINAL_CHANNELS.create,
        validate: validateCreateTerminalRequest,
        handle: async (request, context) => {
          const response = await this.terminalService.create(request, {
            ownerWebContentsId: context.senderId,
            projectId: request.projectId,
          })
          this.observeOwner(context.senderId)
          return response
        },
      }),
      this.registry.register({
        channel: TERMINAL_CHANNELS.input,
        validate: validateTerminalInputRequest,
        handle: (request, context) => {
          this.terminalService.input(
            request,
            this.contextForSession(request.sessionId, context.senderId),
          )
          return null
        },
      }),
      this.registry.register({
        channel: TERMINAL_CHANNELS.resize,
        validate: validateResizeTerminalRequest,
        handle: (request, context) => {
          this.terminalService.resize(
            request,
            this.contextForSession(request.sessionId, context.senderId),
          )
          return null
        },
      }),
      this.registry.register({
        channel: TERMINAL_CHANNELS.close,
        validate: validateCloseTerminalRequest,
        handle: (request, context) => this.terminalService.close(
          request,
          this.contextForSession(request.sessionId, context.senderId),
        ),
      }),
    )
  }

  stop(): void {
    for (const cleanup of this.cleanup.splice(0).reverse()) cleanup()
    for (const ownerId of [...this.owners.keys()]) this.removeOwner(ownerId)
  }

  publish(ownerWebContentsId: number, event: TerminalEvent): void {
    if (!validateTerminalEvent(event).ok) return
    const webContents = this.options.getWebContents(ownerWebContentsId)
    if (!webContents || webContents.isDestroyed()) return
    try {
      webContents.send(TERMINAL_CHANNELS.event, event)
    } catch (error) {
      this.options.onEventRoutingError?.(error)
    }
  }

  private contextForSession(
    sessionId: TerminalSessionId,
    ownerWebContentsId: number,
  ): TerminalOwnershipContext {
    const session = this.terminalService.getSessionSnapshot(sessionId)
    if (!session) {
      throw new DomainError({
        code: 'NOT_FOUND',
        message: 'The terminal session does not exist.',
        operation: 'terminal:authorize',
        retryable: false,
      })
    }
    return {
      ownerWebContentsId,
      projectId: session.projectId as ProjectId,
    }
  }

  private observeOwner(ownerWebContentsId: number): void {
    if (this.owners.has(ownerWebContentsId)) return
    const webContents = this.options.getWebContents(ownerWebContentsId)
    if (!webContents || webContents.isDestroyed()) {
      void this.cleanupOwner(ownerWebContentsId)
      return
    }
    const onDestroyed = (): void => {
      void this.cleanupOwner(ownerWebContentsId)
    }
    const onNavigation = (
      _event: unknown,
      _url: string,
      isInPlace: boolean,
      isMainFrame: boolean,
    ): void => {
      if (!isInPlace && isMainFrame) void this.cleanupOwner(ownerWebContentsId)
    }
    this.owners.set(ownerWebContentsId, {
      webContents,
      onDestroyed,
      onNavigation,
    })
    webContents.once('destroyed', onDestroyed)
    webContents.on('did-start-navigation', onNavigation)
  }

  private async cleanupOwner(ownerWebContentsId: number): Promise<void> {
    this.removeOwner(ownerWebContentsId)
    try {
      await this.terminalService.closeSessionsForOwner(ownerWebContentsId)
    } catch (error) {
      this.options.onCleanupError?.(error)
    }
  }

  private removeOwner(ownerWebContentsId: number): void {
    const owner = this.owners.get(ownerWebContentsId)
    if (!owner) return
    this.owners.delete(ownerWebContentsId)
    owner.webContents.removeDestroyedListener(owner.onDestroyed)
    owner.webContents.removeNavigationListener(owner.onNavigation)
  }
}
