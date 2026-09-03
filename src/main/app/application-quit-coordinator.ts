import type { LifecycleStatus } from '../../shared/contracts'

interface PreventableQuitEvent {
  preventDefault(): void
}

export interface QuitApplication {
  getStatus(): LifecycleStatus
  shutdown(): Promise<void>
}

export interface ApplicationQuitCoordinatorOptions {
  getApplication(): QuitApplication | undefined
  requestApproval(): Promise<boolean>
  quit(): void
  onCleanupError?(error: unknown): void
  onShutdownSucceeded?(): void
}

/** Coordinates Electron's synchronous before-quit event with async cleanup. */
export class ApplicationQuitCoordinator {
  private cleanupTask: Promise<void> | undefined
  private approvalGranted = false
  private finalQuitAuthorized = false
  private finalQuitRequested = false

  constructor(private readonly options: ApplicationQuitCoordinatorOptions) {}

  isFinalQuitAuthorized(): boolean {
    return this.finalQuitAuthorized
  }

  handleBeforeQuit(event: PreventableQuitEvent): void {
    if (this.finalQuitAuthorized) return

    const application = this.options.getApplication()
    if (!application || application.getStatus().state === 'STOPPED') {
      this.finalQuitAuthorized = true
      return
    }

    event.preventDefault()
    if (this.cleanupTask) return

    const cleanupTask = this.attemptShutdown(application)
    this.cleanupTask = cleanupTask
    void cleanupTask.then(
      () => undefined,
      (error: unknown) => this.options.onCleanupError?.(error),
    ).finally(() => {
      if (this.cleanupTask === cleanupTask) {
        this.cleanupTask = undefined
      }
    })
  }

  private async attemptShutdown(application: QuitApplication): Promise<void> {
    if (!this.approvalGranted) {
      const approved = await this.options.requestApproval()
      if (!approved) return
      this.approvalGranted = true
    }

    await application.shutdown()
    this.finalQuitAuthorized = true
    this.options.onShutdownSucceeded?.()
    if (this.finalQuitRequested) return
    this.finalQuitRequested = true
    this.options.quit()
  }
}
