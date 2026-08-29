import {
  PROJECT_CHANNELS,
  validateCloseProjectRequest,
  validateCreateProjectRequest,
  validateGetActiveProjectRequest,
  validateOpenProjectRequest,
  type ProjectChangedEvent,
} from '../../shared/contracts'
import type { ManagedService } from '../app/desktop-application'
import { ProjectService } from '../services/project/project-service'
import { IpcHandlerRegistry } from './ipc-handler-registry'

export interface ProjectIpcServiceOptions {
  selectDirectory(purpose: 'open-project' | 'create-parent'): Promise<string | null>
  publishChanged(event: ProjectChangedEvent): void
}

export class ProjectIpcService implements ManagedService {
  readonly name = 'ProjectIpcService'
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly registry: IpcHandlerRegistry,
    private readonly projectService: ProjectService,
    private readonly options: ProjectIpcServiceOptions,
  ) {}

  start(): void {
    this.cleanup.push(
      this.registry.register({
        channel: PROJECT_CHANNELS.getActive,
        validate: validateGetActiveProjectRequest,
        handle: () => this.projectService.getActiveProject(),
      }),
      this.registry.register({
        channel: PROJECT_CHANNELS.open,
        validate: validateOpenProjectRequest,
        handle: async () => {
          const rootPath = await this.options.selectDirectory('open-project')
          return rootPath ? this.projectService.openRoot(rootPath) : null
        },
      }),
      this.registry.register({
        channel: PROJECT_CHANNELS.create,
        validate: validateCreateProjectRequest,
        handle: async ({ name }) => {
          const parentPath = await this.options.selectDirectory('create-parent')
          return parentPath
            ? this.projectService.createProject(parentPath, name)
            : null
        },
      }),
      this.registry.register({
        channel: PROJECT_CHANNELS.close,
        validate: validateCloseProjectRequest,
        handle: async () => {
          await this.projectService.closeProject()
          return null
        },
      }),
      this.projectService.subscribe((activeProject) => {
        this.options.publishChanged({ activeProject })
      }),
    )
  }

  stop(): void {
    for (const cleanup of this.cleanup.splice(0).reverse()) {
      cleanup()
    }
  }
}
