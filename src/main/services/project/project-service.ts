import { mkdir, realpath, rmdir, stat } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { join as joinWindows } from 'node:path/win32'

import type { ManagedService } from '../../app/desktop-application'
import { DomainError } from '../../errors/app-error'
import type {
  ProjectIdentity,
  RecentProjectMetadata,
} from '../../../shared/contracts'
import {
  createProjectIdentity,
  type ActiveProject,
  type ProjectFileSystem,
} from './project-identity'

export interface ProjectServiceFileSystem extends ProjectFileSystem {
  mkdir(path: string): Promise<void>
  rmdir(path: string): Promise<void>
}

export interface RecentProjectStore {
  getRecentProjects(): readonly RecentProjectMetadata[]
  updateRecentProjects(projects: RecentProjectMetadata[]): Promise<void>
}

export interface ProjectTransition {
  transitionId: string
  reason: 'close' | 'switch'
  currentProject: ProjectIdentity
}

export type ProjectTransitionGuard = (
  transition: ProjectTransition,
) => Promise<boolean> | boolean

const nodeProjectFileSystem: ProjectServiceFileSystem = {
  mkdir: (path) => mkdir(path),
  realpath,
  rmdir,
  stat,
}

export class ProjectService implements ManagedService {
  readonly name = 'ProjectService'
  private activeProject: ActiveProject | undefined
  private readonly transitionGuards = new Set<ProjectTransitionGuard>()
  private readonly listeners = new Set<(
    project: ProjectIdentity | null,
  ) => void>()
  private readonly transitionSettledListeners = new Set<(
    transitionId: string,
  ) => void>()
  private transitionQueue: Promise<void> = Promise.resolve()
  private acceptingTransitions = true
  private readonly transitionContext = new AsyncLocalStorage<boolean>()

  constructor(
    private readonly fileSystem: ProjectServiceFileSystem = nodeProjectFileSystem,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly recentProjectStore?: RecentProjectStore,
    private readonly onListenerError: (error: unknown) => void = () => undefined,
  ) {}

  openRoot(rootPath: string): Promise<ProjectIdentity> {
    return this.runTransition('project:open', async () => {
      const transition = this.createTransition('switch')
      try {
        await this.approveTransition(transition)
        const project = await createProjectIdentity(
          rootPath,
          this.fileSystem,
          this.platform,
        )
        await this.recordRecentProject(project)
        this.activeProject = project
        this.notifyProjectChanged()
        return toPublicIdentity(project)
      } catch (error) {
        this.notifyTransitionFailed(transition)
        throw error
      }
    })
  }

  createProject(
    parentPath: string,
    projectName: string,
  ): Promise<ProjectIdentity> {
    return this.runTransition('project:create', async () => {
      validateProjectName(projectName, this.platform)
      const transition = this.createTransition('switch')
      try {
        await this.approveTransition(transition)

        const parent = await createProjectIdentity(
          parentPath,
          this.fileSystem,
          this.platform,
        )
        const targetPath = this.platform === 'win32'
          ? joinWindows(parent.canonicalRoot, projectName)
          : join(parent.canonicalRoot, projectName)

        try {
          await this.fileSystem.mkdir(targetPath)
        } catch (error) {
          if (isNodeErrorCode(error, 'EEXIST')) {
            throw new DomainError({
              code: 'INVALID_INPUT',
              message: 'A file or folder with that project name already exists.',
              operation: 'project:create',
              retryable: false,
            })
          }
          throw error
        }

        try {
          return await this.activateCreatedRoot(targetPath)
        } catch (error) {
          await this.rollbackCreatedDirectory(targetPath, error)
          throw error
        }
      } catch (error) {
        this.notifyTransitionFailed(transition)
        throw error
      }
    })
  }

  getActiveProject(): ProjectIdentity | null {
    return this.activeProject ? toPublicIdentity(this.activeProject) : null
  }

  getAuthorizedProject(projectId: string): ActiveProject {
    if (!this.activeProject || this.activeProject.id !== projectId) {
      throw new DomainError({
        code: 'PERMISSION_DENIED',
        message: 'The project is no longer authorized.',
        operation: 'project:authorize',
        retryable: false,
      })
    }
    return this.activeProject
  }

  listRecent() {
    return [...(this.recentProjectStore?.getRecentProjects() ?? [])]
      .sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt))
      .map(p => ({ id: p.id, name: p.name, displayPath: p.rootPath, lastOpenedAt: p.lastOpenedAt }))
  }

  openRecent(id: string): Promise<ProjectIdentity> {
    const entry = this.recentProjectStore?.getRecentProjects().find(p => p.id === id)
    if (!entry) return Promise.reject(new DomainError({ code: 'NOT_FOUND', message: 'This recent project is no longer listed. Open the folder again.', retryable: true }))
    return this.openRoot(entry.rootPath).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        throw new DomainError({ code: 'NOT_FOUND', message: 'This project folder is missing. Restore it, open its new location, or remove it from recent projects.', retryable: true })
      }
      throw error
    })
  }

  removeRecent(id: string): Promise<void> {
    return this.runTransition('project:remove-recent', async () => {
      if (this.recentProjectStore) await this.recentProjectStore.updateRecentProjects(
        this.recentProjectStore.getRecentProjects().filter(p => p.id !== id))
    })
  }

  closeProject(): Promise<void> {
    return this.runTransition('project:close', async () => {
      if (!this.activeProject) {
        return
      }
      const transition = this.createTransition('close')
      try {
        await this.approveTransition(transition)
        this.activeProject = undefined
        this.notifyProjectChanged()
      } catch (error) {
        this.notifyTransitionFailed(transition)
        throw error
      }
    })
  }

  registerTransitionGuard(guard: ProjectTransitionGuard): () => void {
    this.transitionGuards.add(guard)
    return () => {
      this.transitionGuards.delete(guard)
    }
  }

  subscribe(listener: (project: ProjectIdentity | null) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeTransitionSettled(listener: (transitionId: string) => void): () => void {
    this.transitionSettledListeners.add(listener)
    return () => {
      this.transitionSettledListeners.delete(listener)
    }
  }

  stop(): Promise<void> {
    this.acceptingTransitions = false
    return this.enqueueTransition(async () => {
      this.activeProject = undefined
      this.transitionGuards.clear()
      this.listeners.clear()
      this.transitionSettledListeners.clear()
    })
  }

  private async activateCreatedRoot(targetPath: string): Promise<ProjectIdentity> {
    const project = await createProjectIdentity(
      targetPath,
      this.fileSystem,
      this.platform,
    )
    await this.recordRecentProject(project)
    this.activeProject = project
    this.notifyProjectChanged()
    return toPublicIdentity(project)
  }

  private createTransition(reason: 'close' | 'switch'): ProjectTransition | null {
    if (!this.activeProject) {
      return null
    }
    return {
      transitionId: randomUUID(),
      reason,
      currentProject: toPublicIdentity(this.activeProject),
    }
  }

  private async approveTransition(transition: ProjectTransition | null): Promise<void> {
    if (!transition) return
    for (const guard of this.transitionGuards) {
      if (!await guard(transition)) {
        throw new DomainError({
          code: 'PROCESS_CANCELLED',
          message: 'The project transition was cancelled.',
          operation: `project:${transition.reason}`,
          retryable: false,
        })
      }
    }
  }

  private async recordRecentProject(project: ActiveProject): Promise<void> {
    if (!this.recentProjectStore) {
      return
    }
    const recent = this.recentProjectStore.getRecentProjects()
      .filter((item) => item.id !== project.id)
    await this.recentProjectStore.updateRecentProjects([{
      id: project.id,
      name: project.name,
      rootPath: project.canonicalRoot,
      lastOpenedAt: new Date().toISOString(),
    }, ...recent])
  }

  private async rollbackCreatedDirectory(
    targetPath: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.fileSystem.rmdir(targetPath)
    } catch (cleanupError) {
      throw new DomainError({
        code: 'INTERNAL_ERROR',
        message: 'Project creation failed and its empty directory could not be rolled back safely.',
        operation: 'project:create',
        details: { rollback: 'failed' },
        retryable: false,
      }, {
        cause: new AggregateError(
          [originalError, cleanupError],
          'Project creation and safe rollback failed',
        ),
      })
    }
  }

  private runTransition<T>(
    operation: string,
    transition: () => Promise<T>,
  ): Promise<T> {
    if (this.transitionContext.getStore()) {
      return Promise.reject(new DomainError({
        code: 'PROCESS_CANCELLED',
        message: 'A project transition cannot start from inside another transition.',
        operation,
        retryable: false,
      }))
    }
    if (!this.acceptingTransitions) {
      return Promise.reject(transitionUnavailable(operation))
    }

    return this.enqueueTransition(() => this.transitionContext.run(
      true,
      async () => {
        if (!this.acceptingTransitions) {
          throw transitionUnavailable(operation)
        }
        return transition()
      },
    ))
  }

  private enqueueTransition<T>(transition: () => Promise<T>): Promise<T> {
    const result = this.transitionQueue.then(transition, transition)
    this.transitionQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private notifyProjectChanged(): void {
    const project = this.getActiveProject()
    for (const listener of this.listeners) {
      try {
        listener(project)
      } catch (error) {
        this.onListenerError(error)
      }
    }
  }

  private notifyTransitionFailed(transition: ProjectTransition | null): void {
    if (!transition) return
    for (const listener of this.transitionSettledListeners) {
      try {
        listener(transition.transitionId)
      } catch (error) {
        this.onListenerError(error)
      }
    }
  }
}

function validateProjectName(name: string, platform: NodeJS.Platform): void {
  const invalid = name.length === 0
    || name === '.'
    || name === '..'
    || name.includes('\0')
    || name.includes('/')
    || name.includes('\\')
    || (platform === 'win32' && isInvalidWindowsName(name))
  if (invalid) {
    throw new DomainError({
      code: 'INVALID_INPUT',
      message: 'The project name is invalid.',
      operation: 'project:create',
      retryable: false,
    })
  }
}

function isInvalidWindowsName(name: string): boolean {
  const baseName = name.split('.')[0]?.toUpperCase() ?? ''
  return /[<>:"|?*]/.test(name)
    || /[. ]$/.test(name)
    || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName)
}

function toPublicIdentity(project: ActiveProject): ProjectIdentity {
  return { id: project.id, name: project.name }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function transitionUnavailable(operation: string): DomainError {
  return new DomainError({
    code: 'PROCESS_CANCELLED',
    message: 'Project transitions are no longer available.',
    operation,
    retryable: false,
  })
}
