import type { ManagedService } from '../../app/desktop-application'

export interface OwnedResource {
  id: string
  ownerId: string
  close(): Promise<void> | void
}

export class ProcessManager implements ManagedService {
  readonly name = 'ProcessManager'
  private readonly resources = new Map<string, OwnedResource>()
  private readonly cleanupTasks = new Map<string, Promise<void>>()

  register(resource: OwnedResource): () => void {
    if (this.resources.has(resource.id)) {
      throw new Error(`Owned resource already registered: ${resource.id}`)
    }
    this.resources.set(resource.id, resource)
    return () => {
      if (
        !this.cleanupTasks.has(resource.id)
        && this.resources.get(resource.id) === resource
      ) {
        this.resources.delete(resource.id)
      }
    }
  }

  async cleanupOwner(ownerId: string): Promise<void> {
    const owned = [...this.resources.values()]
      .filter((resource) => resource.ownerId === ownerId)
    await this.cleanup(owned)
  }

  async stop(): Promise<void> {
    await this.cleanup([...this.resources.values()])
  }

  get size(): number {
    return this.resources.size
  }

  private async cleanup(resources: OwnedResource[]): Promise<void> {
    const errors: unknown[] = []

    for (const resource of resources.reverse()) {
      try {
        await this.cleanupResource(resource)
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Owned resource cleanup failed')
    }
  }

  private cleanupResource(resource: OwnedResource): Promise<void> {
    if (this.resources.get(resource.id) !== resource) {
      return Promise.resolve()
    }

    const existingTask = this.cleanupTasks.get(resource.id)
    if (existingTask) return existingTask

    const task = Promise.resolve()
      .then(() => resource.close())
      .then(() => {
        if (this.resources.get(resource.id) === resource) {
          this.resources.delete(resource.id)
        }
      })
    this.cleanupTasks.set(resource.id, task)
    void task.finally(() => {
      if (this.cleanupTasks.get(resource.id) === task) {
        this.cleanupTasks.delete(resource.id)
      }
    }).catch(() => undefined)
    return task
  }
}
