import type { ManagedService } from '../../app/desktop-application'
import type { ProjectId } from '../../../shared/contracts'
import type { ProjectService } from '../project/project-service'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { RunService } from './run-service'

/** Registered after the existing unsaved guard; no independent transition queue. */
export class RunProjectLifecycle implements ManagedService {
  readonly name = 'RunProjectLifecycle'
  private readonly subscriptions: (() => void)[] = []
  private transition: { id: string; release: () => void } | undefined
  private readonly unavailable = new Map<ProjectId, () => void>()
  private readonly cleanups = new Map<ProjectId, Promise<void>>()
  private active: ProjectId | undefined

  constructor(private readonly run: RunService, private readonly projects: ProjectService,
    private readonly files: Pick<FileSystemService, 'getStatus' | 'subscribeStatus'>,
    private readonly onCleanupError: (error: unknown) => void) {}

  start(): void {
    this.active = this.projects.getActiveProject()?.id
    this.subscriptions.push(this.projects.registerTransitionGuard(async (transition) => {
      this.transition = { id: transition.transitionId,
        release: this.run.suspendProject(transition.currentProject.id) }
      // The lease stays held through asynchronous project creation/persistence.
      await this.run.stopProject(transition.currentProject.id)
      return true
    }))
    this.subscriptions.push(this.projects.subscribeTransitionSettled((id) => {
      if (this.transition?.id === id) this.releaseTransition()
    }))
    this.subscriptions.push(this.projects.subscribe((project) => {
      if (this.active) this.run.suppressProjectEvents(this.active)
      this.releaseTransition()
      for (const [id, release] of this.unavailable) {
        if (id !== project?.id) { release(); this.unavailable.delete(id) }
      }
      this.active = project?.id
      if (project && this.files.getStatus(project.id).state === 'UNAVAILABLE') this.markUnavailable(project.id)
    }))
    this.subscriptions.push(this.files.subscribeStatus((status) => {
      if (this.projects.getActiveProject()?.id !== status.projectId) return
      if (status.state === 'UNAVAILABLE') this.markUnavailable(status.projectId)
      else { this.unavailable.get(status.projectId)?.(); this.unavailable.delete(status.projectId) }
    }))
    if (this.active && this.files.getStatus(this.active).state === 'UNAVAILABLE') this.markUnavailable(this.active)
  }

  private markUnavailable(id: ProjectId): void {
    if (!this.unavailable.has(id)) this.unavailable.set(id, this.run.suspendProject(id))
    this.run.suppressProjectEvents(id)
    if (this.cleanups.has(id)) return
    const task = this.run.stopProject(id)
    this.cleanups.set(id, task)
    void task.catch((error) => this.onCleanupError(error)).finally(() => {
      if (this.cleanups.get(id) === task) this.cleanups.delete(id)
    })
  }

  async stop(): Promise<void> {
    // DesktopApplication retains this service and its dependencies on failure.
    await this.run.stop()
    await Promise.allSettled(this.cleanups.values())
    for (const remove of this.subscriptions.splice(0).reverse()) remove()
    this.releaseTransition()
    for (const release of this.unavailable.values()) release()
    this.unavailable.clear()
  }

  private releaseTransition(): void {
    this.transition?.release()
    this.transition = undefined
  }
}
