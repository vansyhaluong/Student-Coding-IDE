import { realpath, stat } from 'node:fs/promises'

import type { ManagedService } from '../../app/desktop-application'
import {
  createProjectIdentity,
  type ActiveProject,
  type ProjectFileSystem,
} from './project-identity'

const nodeProjectFileSystem: ProjectFileSystem = { realpath, stat }

export class ProjectService implements ManagedService {
  readonly name = 'ProjectService'
  private activeProject: ActiveProject | undefined

  constructor(
    private readonly fileSystem: ProjectFileSystem = nodeProjectFileSystem,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async activateRoot(rootPath: string): Promise<ActiveProject> {
    const project = await createProjectIdentity(
      rootPath,
      this.fileSystem,
      this.platform,
    )
    this.activeProject = project
    return project
  }

  getActiveProject(): ActiveProject | undefined {
    return this.activeProject
  }

  stop(): void {
    this.activeProject = undefined
  }
}
