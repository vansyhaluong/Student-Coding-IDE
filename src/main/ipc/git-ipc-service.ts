import {
  GIT_CHANNELS,
  validateGetGitStateRequest,
  validateGitPathRequest,
  type GitState,
  type GitStatus,
  type GitMutationOutcome,
  type ProjectId,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export interface GitQueries {
  getState(projectId: ProjectId): Promise<GitState>
  getStatus(projectId: ProjectId): Promise<GitStatus>
  stage(projectId: ProjectId, path: string): Promise<GitMutationOutcome>
  unstage(projectId: ProjectId, path: string): Promise<GitMutationOutcome>
}

/** Narrow semantic Git surface; no executable, cwd, or args cross IPC. */
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
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.getStatus,
      validate: validateGetGitStateRequest,
      handle: ({ projectId }) => this.git.getStatus(projectId),
    }))
    for (const action of ['stage', 'unstage'] as const) {
      this.cleanup.push(this.registry.register({
        channel: GIT_CHANNELS[action],
        validate: validateGitPathRequest,
        handle: ({ projectId, path }) => this.git[action](projectId, path),
      }))
    }
  }

  stop(): void {
    for (const remove of this.cleanup.splice(0).reverse()) remove()
  }
}
