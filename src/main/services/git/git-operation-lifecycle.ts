import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { ManagedService } from '../../app/desktop-application'
import { DomainError } from '../../errors/app-error'
import type { ProjectId, GitMutationOutcome } from '../../../shared/contracts'
import type { GitRequestIdentity } from '../../../shared/contracts/git-lifecycle'
import type { ProjectService } from '../project/project-service'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { GitCommandExecutor } from './git-service'
import { GitCleanupFailure } from './git-owned-command-runner'

interface Operation {
  identity: GitRequestIdentity
  projectGeneration: string
  owner: number
  api: string
  mutation: boolean
  dispatched: boolean
  obsolete: boolean
  abort: AbortController
  done: Promise<void>
  finish(): void
}

/** Git-specific ownership on top of the existing ProjectService transition queue. */
export class GitOperationLifecycle implements ManagedService {
  readonly name = 'GitOperationLifecycle'
  private generation = randomUUID()
  private readonly context = new AsyncLocalStorage<Operation>()
  private readonly active = new Set<Operation>()
  private readonly latest = new Map<string, Operation>()
  private readonly subscriptions: (() => void)[] = []
  private transition: string | undefined
  private shuttingDown = false
  private cleanupFailed = false
  private readonly lostOwners = new Set<number>()
  private readonly ownerEpochs = new Map<number, string>()
  readonly commands: GitCommandExecutor

  constructor(private readonly projects: ProjectService,
    private readonly files: Pick<FileSystemService, 'getStatus' | 'subscribeStatus'>,
    private readonly runner: GitCommandExecutor & { stop(): Promise<void> }) {
    this.commands = {
      execute: async (exe, args, cwd, options) => {
        const operation = this.beforeDispatch(args)
        try {
          return await runner.execute(exe, args, cwd, { ...options,
            signal: operation.dispatched ? undefined : operation.abort.signal })
        } catch (error) {
          if (error instanceof GitCleanupFailure) {
            this.cleanupFailed = true
            // A proven successful direct mutation remains applied even if cleanup failed.
            if (error.result && isMutationCommand(args) && args[0] !== 'symbolic-ref') return error.result
          }
          throw error
        }
      },
      stream: async (exe, args, cwd, consume, options) => {
        const operation = this.beforeDispatch(args)
        if (!runner.stream) throw unavailable('stream-unavailable')
        try {
          return await runner.stream(exe, args, cwd, consume, { ...options,
            signal: operation.dispatched ? undefined : operation.abort.signal })
        } catch (error) {
          if (error instanceof GitCleanupFailure) this.cleanupFailed = true
          throw error
        }
      },
    }
  }

  start(): void {
    this.subscriptions.push(this.projects.registerTransitionGuard(async (transition) => {
      this.transition = transition.transitionId
      this.invalidate()
      await this.drain()
      return true
    }))
    this.subscriptions.push(this.projects.subscribeTransitionSettled((id) => {
      if (this.transition === id) this.transition = undefined
    }))
    this.subscriptions.push(this.projects.subscribe(() => {
      this.generation = randomUUID()
      this.invalidate()
      this.transition = undefined
    }))
    this.subscriptions.push(this.files.subscribeStatus((status) => {
      if (status.projectId === this.projects.getActiveProject()?.id && status.state === 'UNAVAILABLE') this.invalidate()
    }))
  }

  getContext(projectId: ProjectId, owner: number): string {
    this.assertAccepting(projectId, owner)
    return this.ownerGeneration(owner)
  }

  async run<T>(identity: GitRequestIdentity, owner: number, api: string,
    mutation: boolean, work: () => Promise<T>): Promise<T> {
    this.assertAccepting(identity.projectId, owner)
    if (identity.generation !== this.ownerGeneration(owner)) throw unavailable('stale-generation')
    if ([...this.active].some((op) => op.mutation && op.identity.projectId === identity.projectId)) throw unavailable('busy')
    const key = `${owner}:${identity.generation}:${api}`
    if (mutation) this.invalidate()
    else {
      const old = this.latest.get(key)
      if (old) this.cancel(old)
    }
    let finish!: () => void
    const operation: Operation = { identity, projectGeneration: this.generation, owner, api, mutation, dispatched: false,
      obsolete: false, abort: new AbortController(), done: new Promise((resolve) => { finish = resolve }), finish: () => finish() }
    this.active.add(operation)
    if (!mutation) this.latest.set(key, operation)
    try {
      const result = await this.context.run(operation, work)
      if (!mutation) this.assertCurrent(operation)
      else if (operation.obsolete || operation.projectGeneration !== this.generation || this.cleanupFailed) {
        const outcome = result as GitMutationOutcome
        if (outcome.applied) return { applied: true, status: null, refreshRequired: true } as T
      }
      return result
    } catch (error) {
      if (!operation.dispatched && operation.obsolete) throw unavailable('stale-request')
      throw error
    } finally {
      this.active.delete(operation)
      if (this.latest.get(key) === operation) this.latest.delete(key)
      operation.finish()
    }
  }

  loseOwner(owner: number): void {
    this.lostOwners.add(owner)
    this.ownerEpochs.delete(owner)
    for (const op of this.active) if (op.owner === owner) this.cancel(op)
  }

  /** Main document coordinator only, after a verified new main-frame commit. */
  restoreOwner(owner: number): void { this.lostOwners.delete(owner) }

  beginShutdown(): void { this.shuttingDown = true; this.invalidate() }

  async stop(): Promise<void> {
    this.beginShutdown()
    await this.drain()
    for (const remove of this.subscriptions.splice(0).reverse()) remove()
  }

  private async drain(): Promise<void> {
    await Promise.all([...this.active].map((op) => op.done))
    try { await this.runner.stop() } catch (error) { this.cleanupFailed = true; throw error }
    this.cleanupFailed = false
  }

  private invalidate(): void { for (const op of this.active) this.cancel(op) }
  private cancel(op: Operation): void {
    op.obsolete = true
    if (!op.dispatched) op.abort.abort()
  }

  private assertAccepting(projectId: ProjectId, owner: number): void {
    this.projects.getAuthorizedProject(projectId)
    if (this.shuttingDown || this.transition || this.cleanupFailed || this.lostOwners.has(owner)
      || this.files.getStatus(projectId).state !== 'AVAILABLE') throw unavailable('unavailable')
  }

  private assertCurrent(op: Operation): void {
    if (op.obsolete || op.abort.signal.aborted || op.projectGeneration !== this.generation) throw unavailable('stale-request')
    this.assertAccepting(op.identity.projectId, op.owner)
  }

  private beforeDispatch(args: readonly string[]): Operation {
    const op = this.context.getStore()
    if (!op) throw unavailable('missing-operation')
    // A drained mutation keeps project authority, but root failure forbids further dispatch.
    this.projects.getAuthorizedProject(op.identity.projectId)
    if (this.cleanupFailed || this.files.getStatus(op.identity.projectId).state !== 'AVAILABLE'
      || op.projectGeneration !== this.generation) throw unavailable('unavailable')
    if (!op.dispatched) this.assertCurrent(op)
    if (op.mutation && isMutationCommand(args)) op.dispatched = true
    return op
  }

  private ownerGeneration(owner: number): string {
    let epoch = this.ownerEpochs.get(owner)
    if (!epoch) { epoch = randomUUID(); this.ownerEpochs.set(owner, epoch) }
    return `${this.generation}_${epoch}`
  }
}

function isMutationCommand(args: readonly string[]): boolean {
  return ['add', 'restore', 'reset', 'commit', 'switch'].some((arg) => args[0] === arg || args[0] === '--literal-pathspecs' && args[1] === arg)
    || args[0] === 'symbolic-ref' && args[1] === 'HEAD'
}

function unavailable(reason: string): DomainError {
  return new DomainError({ code: 'PROCESS_CANCELLED', message: 'The Git request is no longer available.',
    details: { reason }, retryable: false })
}
