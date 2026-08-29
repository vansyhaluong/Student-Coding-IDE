import type { ManagedService } from '../../app/desktop-application'

export interface OwnedResource {
  id: string
  ownerId: string
  close(): Promise<void> | void
}

export class ProcessManager implements ManagedService {
  readonly name = 'ProcessManager'
  private readonly resources = new Map<string, OwnedResource>()

  register(resource: OwnedResource): () => void {
    if (this.resources.has(resource.id)) {
      throw new Error(`Owned resource already registered: ${resource.id}`)
    }
    this.resources.set(resource.id, resource)
    return () => {
      this.resources.delete(resource.id)
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
      if (!this.resources.delete(resource.id)) {
        continue
      }

      try {
        await resource.close()
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Owned resource cleanup failed')
    }
  }
}
