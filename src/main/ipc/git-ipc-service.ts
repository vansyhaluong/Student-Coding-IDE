import {
  GIT_CHANNELS,
  validateGetGitStateRequest,
  type GitState,
  type ProjectId,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export interface GitQueries {
  getState(projectId: ProjectId): Promise<GitState>
}

/** Narrow Phase 5A query surface; no Git executable, cwd, or args cross IPC. */
export class GitIpcService implements ManagedService {
  readonly name = 'GitIpcService'
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly git: GitQueries,
  ) {}

  start(): void {
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.getState,
      validate: validateGetGitStateRequest,
      handle: ({ projectId }) => this.git.getState(projectId),
    }))
  }

  stop(): void {
    for (const remove of this.cleanup.splice(0).reverse()) remove()
  }
}
