import { join } from 'node:path'
import { PersistenceService } from '../persistence/persistence-service'
import type { ActiveProject } from '../project/project-identity'
import { LanguageError } from './language-error'

interface WorkspaceState { csharpSolution?: string }
export interface CsharpSelectionStore {
  read(project: ActiveProject): Promise<string | undefined>
  select(project: ActiveProject, relativePath: string): Promise<void>
}

/** ADR-010/Architecture 13: per-workspace JSON, stable canonical-path hash ID. */
export class CsharpWorkspaceStore implements CsharpSelectionStore {
  constructor(private readonly directory: string) {}

  async read(project: ActiveProject): Promise<string | undefined> {
    return (await this.store(project).load()).value.csharpSolution
  }

  async select(project: ActiveProject, relativePath: string): Promise<void> {
    try { await this.store(project).save({ csharpSolution: relativePath }) }
    catch { throw new LanguageError('persistence-failed') }
  }

  private readonly stores = new Map<string, PersistenceService<WorkspaceState>>()
  private store(project: ActiveProject): PersistenceService<WorkspaceState> {
    if (!/^project_[0-9a-f]{24}$/.test(project.id)) throw new LanguageError('invalid-context')
    let store = this.stores.get(project.id)
    if (!store) {
      store = new PersistenceService<WorkspaceState>({
        filePath: join(this.directory, project.id + '.json'), schemaVersion: 1,
        defaultValue: () => ({}),
        validate: (value): value is WorkspaceState => typeof value === 'object' && value !== null
          && (!('csharpSolution' in value) || typeof value.csharpSolution === 'string'),
      })
      this.stores.set(project.id, store)
    }
    return store
  }

  async stop(): Promise<void> {
    await Promise.all([...this.stores.values()].map((store) => store.stop()))
    this.stores.clear()
  }
}
