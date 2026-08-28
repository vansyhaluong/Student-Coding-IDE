import type {
  ApplicationState,
  LifecycleStatus,
} from '../../shared/contracts'

export interface ManagedService {
  readonly name: string
  start?(): Promise<void> | void
  stop(): Promise<void> | void
}

export class DesktopApplication {
  private state: ApplicationState = 'CREATED'
  private readonly startedServices: ManagedService[] = []
  private readonly listeners = new Set<(status: LifecycleStatus) => void>()
  private shutdownPromise: Promise<void> | undefined

  constructor(private readonly services: readonly ManagedService[]) {}

  getStatus(): LifecycleStatus {
    return { state: this.state }
  }

  subscribe(
    listener: (status: LifecycleStatus) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async start(): Promise<void> {
    if (this.state !== 'CREATED') {
      throw new Error(`Application cannot start from state ${this.state}`)
    }

    this.transition('STARTING')
    try {
      for (const service of this.services) {
        await service.start?.()
        this.startedServices.push(service)
      }
      this.transition('RUNNING')
    } catch (startupError) {
      let cleanupError: unknown
      try {
        await this.stopStartedServices()
      } catch (error) {
        cleanupError = error
      }
      this.transition('FAILED')
      if (cleanupError) {
        throw new AggregateError(
          [startupError, cleanupError],
          'Application startup and cleanup failed',
          { cause: startupError },
        )
      }
      throw startupError
    }
  }

  shutdown(): Promise<void> {
    if (this.state === 'STOPPED') {
      return Promise.resolve()
    }
    if (this.shutdownPromise) {
      return this.shutdownPromise
    }

    this.transition('STOPPING')
    this.shutdownPromise = (async () => {
      try {
        await this.stopStartedServices()
      } finally {
        this.transition('STOPPED')
      }
    })()
    return this.shutdownPromise
  }

  private async stopStartedServices(): Promise<void> {
    const errors: unknown[] = []

    for (const service of this.startedServices.splice(0).reverse()) {
      try {
        await service.stop()
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Application cleanup failed')
    }
  }

  private transition(state: ApplicationState): void {
    this.state = state
    const status = this.getStatus()
    for (const listener of this.listeners) {
      listener(status)
    }
  }
}
