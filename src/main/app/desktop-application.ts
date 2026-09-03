import type {
  ApplicationState,
  LifecycleStatus,
} from '../../shared/contracts'

export interface ManagedService {
  readonly name: string
  start?(): Promise<void> | void
  stop(): Promise<void> | void
}

export interface DesktopApplicationOptions {
  /**
   * Services that keep the application recoverable while mandatory cleanup is
   * incomplete. They stop only after every other started service has stopped.
   */
  shutdownLast?: readonly ManagedService[]
}

export class DesktopApplication {
  private state: ApplicationState = 'CREATED'
  private readonly startedServices: ManagedService[] = []
  private readonly listeners = new Set<(status: LifecycleStatus) => void>()
  private shutdownPromise: Promise<void> | undefined

  private readonly shutdownLast: ReadonlySet<ManagedService>

  constructor(
    private readonly services: readonly ManagedService[],
    options: DesktopApplicationOptions = {},
  ) {
    this.shutdownLast = new Set(options.shutdownLast)
    for (const service of this.shutdownLast) {
      if (!services.includes(service)) {
        throw new Error(`Shutdown-last service is not managed: ${service.name}`)
      }
    }
  }

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
        await this.stopStartedServices(false)
        await this.stopStartedServices(true)
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

    if (this.state !== 'STOPPING') {
      this.transition('STOPPING')
    }

    const shutdownPromise = (async () => {
      await this.stopStartedServices(false)
      await this.stopStartedServices(true)
      this.transition('STOPPED')
    })()
    this.shutdownPromise = shutdownPromise
    void shutdownPromise.finally(() => {
      if (this.shutdownPromise === shutdownPromise) {
        this.shutdownPromise = undefined
      }
    }).catch(() => undefined)
    return shutdownPromise
  }

  private async stopStartedServices(shutdownLastOnly = false): Promise<void> {
    const services = this.startedServices
      .filter((service) => this.shutdownLast.has(service) === shutdownLastOnly)
      .reverse()

    for (const service of services) {
      try {
        await service.stop()
        const index = this.startedServices.lastIndexOf(service)
        if (index >= 0) this.startedServices.splice(index, 1)
      } catch (error) {
        throw new AggregateError([error], 'Application cleanup failed', {
          cause: error,
        })
      }
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
