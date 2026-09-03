import { randomUUID } from 'node:crypto'

import {
  LIFECYCLE_CHANNELS,
  validateResolveUnsavedTransitionRequest,
  type ProjectIdentity,
  type UnsavedTransitionReason,
  type UnsavedTransitionRequestEvent,
} from '../../../shared/contracts'
import type { ManagedService } from '../../app/desktop-application'
import { DomainError } from '../../errors/app-error'
import { IpcHandlerRegistry } from '../../ipc/ipc-handler-registry'
import {
  ProjectService,
  type ProjectTransition,
} from '../project/project-service'

export interface UnsavedTransitionRenderer {
  senderId: number
  send(event: UnsavedTransitionRequestEvent): void
}

export interface UnsavedTransitionServiceOptions {
  getRenderer(): UnsavedTransitionRenderer | null
  terminalLifecycle?: TerminalProjectLifecycle
  timeoutMs?: number
}

export interface TerminalProjectTransitionLease {
  readonly hasLiveSessions: boolean
  closeSessions(): Promise<void>
  release(): void
}

export interface TerminalProjectLifecycle {
  acquireProjectTransition(projectId: ProjectIdentity['id']): Promise<TerminalProjectTransitionLease>
}

interface PendingTransition {
  senderId: number
  resolve(proceed: boolean): void
  timeout: ReturnType<typeof setTimeout>
}

export class UnsavedTransitionService implements ManagedService {
  readonly name = 'UnsavedTransitionService'
  private readonly pending = new Map<string, PendingTransition>()
  private removeHandler: (() => void) | undefined
  private removeProjectGuard: (() => void) | undefined

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly projectService: ProjectService,
    private readonly options: UnsavedTransitionServiceOptions,
  ) {}

  start(): void {
    this.removeHandler = this.registry.register({
      channel: LIFECYCLE_CHANNELS.resolveUnsavedTransition,
      validate: validateResolveUnsavedTransitionRequest,
      handle: ({ transitionId, proceed }, context) => {
        const pending = this.pending.get(transitionId)
        if (!pending) {
          throw resolutionError('The unsaved transition request is no longer active.')
        }
        if (pending.senderId !== context.senderId) {
          throw new DomainError({
            code: 'PERMISSION_DENIED',
            message: 'The unsaved transition belongs to another renderer.',
            operation: LIFECYCLE_CHANNELS.resolveUnsavedTransition,
            retryable: false,
          })
        }
        clearTimeout(pending.timeout)
        this.pending.delete(transitionId)
        pending.resolve(proceed)
        return null
      },
    })
    this.removeProjectGuard = this.projectService.registerTransitionGuard(
      (transition) => this.requestProjectTransition(transition),
    )
  }

  requestApplicationClose(): Promise<boolean> {
    const project = this.projectService.getActiveProject()
    return project
      ? this.request('application-close', project, false)
      : Promise.resolve(true)
  }

  stop(): void {
    this.removeProjectGuard?.()
    this.removeProjectGuard = undefined
    this.removeHandler?.()
    this.removeHandler = undefined
    for (const [transitionId, pending] of this.pending) {
      clearTimeout(pending.timeout)
      this.pending.delete(transitionId)
      pending.resolve(false)
    }
  }

  private async requestProjectTransition(
    transition: ProjectTransition,
  ): Promise<boolean> {
    const lease = await this.options.terminalLifecycle
      ?.acquireProjectTransition(transition.currentProject.id)
    try {
      const approved = await this.request(
        transition.reason === 'close' ? 'project-close' : 'project-switch',
        transition.currentProject,
        lease?.hasLiveSessions ?? false,
      )
      if (!approved) return false
      try {
        await lease?.closeSessions()
      } catch (error) {
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'Running terminals could not be closed. The project was not changed.',
          operation: 'terminal:project-transition',
          retryable: true,
        }, { cause: error })
      }
      return true
    } finally {
      lease?.release()
    }
  }

  private request(
    reason: UnsavedTransitionReason,
    project: ProjectIdentity,
    terminalConfirmationRequired: boolean,
  ): Promise<boolean> {
    const renderer = this.options.getRenderer()
    if (!renderer) return Promise.resolve(false)

    const transitionId = randomUUID()
    const event: UnsavedTransitionRequestEvent = {
      transitionId,
      reason,
      project,
      terminalConfirmationRequired,
    }
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(transitionId)
        resolve(false)
      }, this.options.timeoutMs ?? 30_000)
      this.pending.set(transitionId, {
        senderId: renderer.senderId,
        resolve,
        timeout,
      })
      try {
        renderer.send(event)
      } catch {
        clearTimeout(timeout)
        this.pending.delete(transitionId)
        resolve(false)
      }
    })
  }
}

function resolutionError(message: string): DomainError {
  return new DomainError({
    code: 'PROCESS_CANCELLED',
    message,
    operation: LIFECYCLE_CHANNELS.resolveUnsavedTransition,
    retryable: false,
  })
}
