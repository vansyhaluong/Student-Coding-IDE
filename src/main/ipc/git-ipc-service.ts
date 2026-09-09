import {
  GIT_CHANNELS,
  validateGetGitStateRequest,
  validateGitPathRequest,
  validateGitCommitRequest,
  validateGitSwitchRequest,
  validateGitHistoryRequest,
  type GitBranchSnapshot,
  type GitHistoryItem,
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
  commit(projectId: ProjectId, message: string): Promise<GitMutationOutcome>
  getBranches(projectId: ProjectId): Promise<GitBranchSnapshot>
  switchBranch(projectId: ProjectId, branch: string): Promise<GitMutationOutcome>
  getHistory(projectId: ProjectId, limit: number): Promise<readonly GitHistoryItem[]>
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
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.commit, validate: validateGitCommitRequest,
      handle: ({ projectId, message }) => this.git.commit(projectId, message),
    }))
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.getBranches, validate: validateGetGitStateRequest,
      handle: ({ projectId }) => this.git.getBranches(projectId),
    }))
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.switchBranch, validate: validateGitSwitchRequest,
      handle: ({ projectId, branch }) => this.git.switchBranch(projectId, branch),
    }))
    this.cleanup.push(this.registry.register({
      channel: GIT_CHANNELS.getHistory, validate: validateGitHistoryRequest,
      handle: ({ projectId, limit }) => this.git.getHistory(projectId, limit),
    }))
  }

  stop(): void {
    for (const remove of this.cleanup.splice(0).reverse()) remove()
  }
}
