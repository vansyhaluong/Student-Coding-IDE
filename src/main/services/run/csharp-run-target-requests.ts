import { randomUUID } from 'node:crypto'
import type { ProjectId } from '../../../shared/contracts/project'
import { validateCSharpRunTargetResolution, type CSharpProjectRunTarget, type CSharpRunTargetResolution } from '../../../shared/contracts/run'
import { DomainError } from '../../errors/app-error'
import type { ProcessManager } from '../process/process-manager'
import type { CsharpRunTargetStore } from './csharp-run-target-store'
import type { ProjectService } from '../project/project-service'
import type { FileSystemService } from '../filesystem/filesystem-service'

export interface CsharpTargetRequestScope {
  readonly store: Pick<CsharpRunTargetStore, 'resolve' | 'select' | 'clear'>
  close(): Promise<void>
}
type Action = { kind: 'resolve' | 'clear' } | { kind: 'select'; target: CSharpProjectRunTarget }
interface Operation {
  owner: number
  project: ProjectId
  controller: AbortController
  close(): Promise<void>
  done: Promise<CSharpRunTargetResolution>
  release(): void
  cleanupFailed: boolean
  cancelled: boolean
}
const denied = (reason: string) => new DomainError({ code: 'PERMISSION_DENIED', retryable: false,
  message: 'The Run target request is no longer available.', operation: 'run:targets', details: { reason } })

/** One discovery/mutation at a time for the single active IDE project. Explicit
 * owner cancellation joins probes; retained cleanup prevents a replacement scope.
 * This owns finite target requests, not Run sessions or execution.
 */
export class CsharpRunTargetRequests {
  readonly name = 'RunTargetRequests'
  private current?: Operation
  private stopped = false
  private transition = false
  private readonly subscriptions: (() => void)[] = []
  constructor(private readonly manager: ProcessManager,
    private readonly createScope: (probeOwner: string) => CsharpTargetRequestScope,
    private readonly lifecycle?: {
      projects: Pick<ProjectService, 'registerTransitionGuard' | 'subscribeTransitionSettled' | 'subscribe' | 'getActiveProject'>
      files: Pick<FileSystemService, 'subscribeStatus'>
      onCleanupError(error: unknown): void
    }) {}

  start(): void {
    if (!this.lifecycle || this.subscriptions.length) return
    const { projects, files, onCleanupError } = this.lifecycle
    this.subscriptions.push(projects.registerTransitionGuard(async () => {
      this.transition = true; await this.cancel(); return true
    }), projects.subscribeTransitionSettled(() => { this.transition = false }),
    projects.subscribe(() => { this.transition = false }), files.subscribeStatus(status => {
      if (status.state === 'UNAVAILABLE' && projects.getActiveProject()?.id === status.projectId) {
        void this.cancel().catch(onCleanupError)
      }
    }))
  }

  perform(owner: number, project: ProjectId, action: Action, check: () => void): Promise<CSharpRunTargetResolution> {
    if (this.stopped || this.transition) return Promise.reject(denied('STOPPED'))
    if (this.current) return Promise.reject(denied(this.current.cleanupFailed ? 'CLEANUP_FAILED' : 'REQUEST_IN_PROGRESS'))
    check()
    const id = randomUUID(), controller = new AbortController()
    let scope: CsharpTargetRequestScope | undefined, closing: Promise<void> | undefined, closed = false
    const operation: Operation = { owner, project, controller, release: () => {}, cleanupFailed: false, cancelled: false,
      done: Promise.resolve({ projectId: project, state: 'FAILED', reason: 'PREFLIGHT_FAILED' }),
      close: () => {
        controller.abort()
        if (closed) return Promise.resolve()
        return closing ??= Promise.resolve().then(() => scope?.close()).then(() => { closed = true; operation.cleanupFailed = false })
          .catch(() => {
            operation.cleanupFailed = true
            throw new DomainError({ code: 'PROCESS_FAILED', message: 'Run target cleanup failed. Retry cancellation.',
              operation: 'run:targets', retryable: true, details: { reason: 'CLEANUP_FAILED' } })
          })
          .finally(() => { closing = undefined })
      } }
    this.current = operation
    const valid = () => { check(); if (controller.signal.aborted || this.stopped) throw denied('CANCELLED') }
    operation.done = Promise.resolve().then(async () => {
      let response: CSharpRunTargetResolution
      try {
        valid()
        operation.release = this.manager.register({ id: `run-target-request:${id}`, ownerId: `run-target-owner:${owner}`,
          close: () => { operation.cancelled = true; return operation.close() } })
        scope = this.createScope(`run-target-probes:${id}`)
        const result = action.kind === 'select' ? await scope.store.select(action.target, controller.signal)
          : await scope.store[action.kind](project, controller.signal)
        valid()
        // Only the two public semantic issues cross the boundary, never storage
        // recovery details, internal assessments or the remembered path.
        const selectionDiagnostic = result.issue === 'STALE_TARGET' || result.issue === 'PERSISTENCE_RECOVERED'
          ? result.issue : undefined
        const validated = validateCSharpRunTargetResolution({ ...result.resolution,
          ...(selectionDiagnostic ? { selectionDiagnostic } : {}) })
        if (!validated.ok || validated.value.projectId !== project) throw denied('INVALID_RESPONSE')
        response = validated.value
      } finally {
        // A failed close intentionally retains current + registered ownership.
        await operation.close()
        operation.release()
        if (this.current === operation) this.current = undefined
      }
      if (operation.cancelled || this.stopped) throw denied('CANCELLED')
      check()
      return response
    })
    return operation.done
  }

  async cancel(owner?: number, project?: ProjectId): Promise<void> {
    const operation = this.current
    if (!operation) return
    if (owner !== undefined && operation.owner !== owner || project !== undefined && operation.project !== project) {
      throw denied('WRONG_OWNER_OR_PROJECT')
    }
    operation.cancelled = true
    await operation.close()
    await operation.done.catch(() => undefined)
    operation.release()
    if (this.current === operation) this.current = undefined
  }
  async stop(): Promise<void> {
    this.stopped = true; await this.cancel()
    for (const remove of this.subscriptions.splice(0).reverse()) remove()
  }
  get ownerId(): number | undefined { return this.current?.owner }
  get isTransitioning(): boolean { return this.transition }
}
