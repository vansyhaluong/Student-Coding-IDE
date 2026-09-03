import { watch } from 'node:fs'
import {
  lstat as lstatAsync,
  mkdir as mkdirAsync,
  readFile as readFileAsync,
  readdir as readdirAsync,
  realpath as realpathAsync,
  rename as renameAsync,
  writeFile as writeFileAsync,
} from 'node:fs/promises'
import { basename, posix } from 'node:path'
import { basename as basenameWindows } from 'node:path/win32'

import type {
  FileChangedEvent,
  FileEntry,
  FileStat,
  ProjectId,
  ProjectFileSystemStatus,
} from '../../../shared/contracts'
import type { ManagedService } from '../../app/desktop-application'
import { DomainError } from '../../errors/app-error'
import {
  normalizePathIdentity,
  resolveProjectRelativePath,
  type ActiveProject,
} from '../project/project-identity'
import { ProjectService } from '../project/project-service'

export interface FileSystemPort {
  realpath(path: string): Promise<string>
  lstat(path: string): Promise<StatsLike>
  readdir(path: string): Promise<readonly DirectoryEntryLike[]>
  readFile(path: string): Promise<string>
  writeFile(
    path: string,
    data: string,
    options?: { exclusive: boolean },
  ): Promise<void>
  mkdir(path: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
}

export interface StatsLike {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  size: number
  mtime: Date
}

export interface DirectoryEntryLike {
  name: string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export interface WatcherLike {
  close(): void
  onError?(listener: (error: unknown) => void): void
}

export type WatchFactory = (
  rootPath: string,
  listener: (eventType: string, fileName: string | null) => void,
) => WatcherLike

export interface FileSystemServiceOptions {
  fileSystem?: FileSystemPort
  trashItem(path: string): Promise<void>
  watchFactory?: WatchFactory
  platform?: NodeJS.Platform
  onWatcherError?(error: unknown): void
}

const nodeFileSystem: FileSystemPort = {
  realpath: realpathAsync,
  lstat: lstatAsync,
  readdir: (path) => readdirAsync(path, { withFileTypes: true }),
  readFile: (path) => readFileAsync(path, 'utf8'),
  writeFile: (path, data, options) => writeFileAsync(
    path,
    data,
    options?.exclusive ? { flag: 'wx' } : undefined,
  ),
  mkdir: (path) => mkdirAsync(path),
  rename: renameAsync,
}

const nodeWatchFactory: WatchFactory = (rootPath, listener) => {
  const watcher = watch(
    rootPath,
    { recursive: true },
    (eventType, fileName) => listener(
      eventType,
      typeof fileName === 'string' ? fileName : null,
    ),
  )
  return {
    close: () => watcher.close(),
    onError: (onError) => watcher.on('error', onError),
  }
}

export class FileSystemService implements ManagedService {
  readonly name = 'FileSystemService'
  private readonly fileSystem: FileSystemPort
  private readonly watchFactory: WatchFactory
  private readonly platform: NodeJS.Platform
  private readonly listeners = new Set<(event: FileChangedEvent) => void>()
  private readonly statusListeners = new Set<(status: ProjectFileSystemStatus) => void>()
  private removeProjectListener: (() => void) | undefined
  private watcher: WatcherLike | undefined
  private watcherGeneration = 0
  private status: ProjectFileSystemStatus | null = null

  constructor(
    private readonly projectService: ProjectService,
    private readonly options: FileSystemServiceOptions,
  ) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem
    this.watchFactory = options.watchFactory ?? nodeWatchFactory
    this.platform = options.platform ?? process.platform
  }

  start(): void {
    this.removeProjectListener = this.projectService.subscribe(() => {
      this.replaceWatcher()
    })
    this.replaceWatcher()
  }

  async listDirectory(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<FileEntry[]> {
    const project = this.projectService.getAuthorizedProject(projectId)
    const target = await this.resolveExisting(project, relativePath, true).catch((error) => {
      if (relativePath.length === 0 && isRootUnavailableError(error)) {
        this.setStatus(project.id, 'UNAVAILABLE')
      }
      throw error
    })
    if (!target.stats.isDirectory()) {
      throw invalidPath('The requested path is not a directory.', 'file:list-directory')
    }

    this.projectService.getAuthorizedProject(project.id)
    const entries = await this.fileSystem.readdir(target.canonicalPath).catch((error) => {
      if (relativePath.length === 0 && isRootUnavailableError(error)) {
        this.setStatus(project.id, 'UNAVAILABLE')
      }
      throw error
    })
    return entries
      .map((entry) => toFileEntry(entry, relativePath))
      .sort(compareEntries)
  }

  async stat(projectId: ProjectId, relativePath: string): Promise<FileStat> {
    const project = this.projectService.getAuthorizedProject(projectId)
    const target = await this.resolveExisting(project, relativePath, true)
    return {
      name: relativePath.length === 0
        ? project.name
        : this.platform === 'win32'
          ? basenameWindows(target.lexicalPath)
          : basename(target.lexicalPath),
      relativePath,
      kind: toEntryKind(target.stats),
      isSymbolicLink: target.stats.isSymbolicLink(),
      size: target.stats.size,
      modifiedAt: target.stats.mtime.toISOString(),
    }
  }

  async read(projectId: ProjectId, relativePath: string): Promise<string> {
    const project = this.projectService.getAuthorizedProject(projectId)
    const target = await this.resolveExisting(project, relativePath, false)
    if (!target.stats.isFile() && !target.stats.isSymbolicLink()) {
      throw invalidPath('The requested path is not a file.', 'file:read')
    }
    this.projectService.getAuthorizedProject(project.id)
    return this.fileSystem.readFile(target.canonicalPath)
  }

  async write(
    projectId: ProjectId,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const project = this.projectService.getAuthorizedProject(projectId)
    const target = await this.resolveExisting(project, relativePath, false)
    if (!target.stats.isFile() && !target.stats.isSymbolicLink()) {
      throw invalidPath('The requested path is not a file.', 'file:write')
    }
    const revalidated = await this.resolveExisting(project, relativePath, false)
    this.projectService.getAuthorizedProject(project.id)
    await this.fileSystem.writeFile(revalidated.canonicalPath, content)
  }

  createFile(
    projectId: ProjectId,
    parentPath: string,
    name: string,
  ): Promise<FileEntry> {
    return this.createEntry(projectId, parentPath, name, 'file')
  }

  createDirectory(
    projectId: ProjectId,
    parentPath: string,
    name: string,
  ): Promise<FileEntry> {
    return this.createEntry(projectId, parentPath, name, 'directory')
  }

  async rename(
    projectId: ProjectId,
    relativePath: string,
    newName: string,
  ): Promise<FileEntry> {
    validateEntryName(newName, this.platform, 'file:rename')
    const project = this.projectService.getAuthorizedProject(projectId)
    await this.resolveExisting(project, relativePath, false)
    const parentPath = posix.dirname(toContractPath(relativePath))
    const normalizedParent = parentPath === '.' ? '' : parentPath
    const parent = await this.resolveExisting(project, normalizedParent, true)
    if (!parent.stats.isDirectory()) {
      throw invalidPath('The parent path is not a directory.', 'file:rename')
    }

    const destinationRelativePath = joinContractPath(normalizedParent, newName)
    const destinationPath = resolveProjectRelativePath(
      project.canonicalRoot,
      destinationRelativePath,
      this.platform,
    )
    await this.assertMissing(destinationPath, 'file:rename')
    const revalidatedSource = await this.resolveExisting(
      project,
      relativePath,
      false,
    )
    await this.resolveExisting(project, normalizedParent, true)
    await this.assertMissing(destinationPath, 'file:rename')
    this.projectService.getAuthorizedProject(project.id)
    await this.fileSystem.rename(revalidatedSource.lexicalPath, destinationPath)
    const renamed = await this.fileSystem.lstat(destinationPath)
    return toFileEntryFromStats(renamed, destinationRelativePath, newName)
  }

  async delete(projectId: ProjectId, relativePath: string): Promise<void> {
    const project = this.projectService.getAuthorizedProject(projectId)
    await this.resolveExisting(project, relativePath, false)
    const target = await this.resolveExisting(project, relativePath, false)
    this.projectService.getAuthorizedProject(project.id)
    await this.options.trashItem(target.lexicalPath)
  }

  subscribe(listener: (event: FileChangedEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getStatus(projectId: ProjectId): ProjectFileSystemStatus {
    this.projectService.getAuthorizedProject(projectId)
    return this.status?.projectId === projectId
      ? this.status
      : { projectId, state: 'UNAVAILABLE' }
  }

  subscribeStatus(listener: (status: ProjectFileSystemStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  stop(): void {
    this.removeProjectListener?.()
    this.removeProjectListener = undefined
    this.closeWatcher()
    this.listeners.clear()
    this.statusListeners.clear()
    this.status = null
  }

  private async createEntry(
    projectId: ProjectId,
    parentPath: string,
    name: string,
    kind: 'file' | 'directory',
  ): Promise<FileEntry> {
    const operation = kind === 'file' ? 'file:create' : 'file:create-directory'
    validateEntryName(name, this.platform, operation)
    const project = this.projectService.getAuthorizedProject(projectId)
    const parent = await this.resolveExisting(project, parentPath, true)
    if (!parent.stats.isDirectory()) {
      throw invalidPath('The parent path is not a directory.', operation)
    }
    const relativePath = joinContractPath(parentPath, name)
    const targetPath = resolveProjectRelativePath(
      project.canonicalRoot,
      relativePath,
      this.platform,
    )
    await this.assertMissing(targetPath, operation)
    await this.resolveExisting(project, parentPath, true)
    await this.assertMissing(targetPath, operation)
    this.projectService.getAuthorizedProject(project.id)
    if (kind === 'file') {
      await this.fileSystem.writeFile(targetPath, '', { exclusive: true })
    } else {
      await this.fileSystem.mkdir(targetPath)
    }
    const stats = await this.fileSystem.lstat(targetPath)
    return toFileEntryFromStats(stats, relativePath, name)
  }

  private async resolveExisting(
    project: ActiveProject,
    relativePath: string,
    allowRoot: boolean,
  ): Promise<{
    lexicalPath: string
    canonicalPath: string
    stats: StatsLike
  }> {
    if (relativePath.length === 0 && !allowRoot) {
      throw invalidPath('The project root cannot be mutated.', 'file:resolve-path')
    }
    const lexicalPath = relativePath.length === 0
      ? project.canonicalRoot
      : resolveProjectRelativePath(
        project.canonicalRoot,
        relativePath,
        this.platform,
      )
    const stats = await this.fileSystem.lstat(lexicalPath)
    const canonicalPath = await this.fileSystem.realpath(lexicalPath)
    if (!isPathWithinRoot(project.canonicalRoot, canonicalPath, this.platform)) {
      throw new DomainError({
        code: 'PERMISSION_DENIED',
        message: 'The requested path escapes the authorized project.',
        operation: 'file:resolve-path',
        retryable: false,
      })
    }
    return { lexicalPath, canonicalPath, stats }
  }

  private async assertMissing(path: string, operation: string): Promise<void> {
    try {
      await this.fileSystem.lstat(path)
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        return
      }
      throw error
    }
    throw new DomainError({
      code: 'INVALID_INPUT',
      message: 'A file or folder with that name already exists.',
      operation,
      retryable: false,
    })
  }

  private replaceWatcher(): void {
    this.closeWatcher()
    const project = this.projectService.getActiveProject()
    if (!project) {
      this.status = null
      return
    }
    const active = this.projectService.getAuthorizedProject(project.id)
    const generation = this.watcherGeneration
    try {
      this.watcher = this.watchFactory(active.canonicalRoot, (eventType, fileName) => {
        if (generation !== this.watcherGeneration || !fileName) {
          return
        }
        const current = this.projectService.getActiveProject()
        if (!current || current.id !== project.id) {
          return
        }
        const relativePath = toContractPath(fileName)
        try {
          resolveProjectRelativePath(active.canonicalRoot, relativePath, this.platform)
        } catch {
          return
        }
        const event: FileChangedEvent = {
          projectId: project.id,
          relativePath,
          kind: eventType === 'rename' ? 'renamed' : 'changed',
        }
        for (const listener of this.listeners) {
          listener(event)
        }
      })
      this.watcher.onError?.((error) => {
        if (generation !== this.watcherGeneration) return
        this.closeWatcher()
        this.setStatus(project.id, 'UNAVAILABLE')
        this.options.onWatcherError?.(error)
      })
      this.setStatus(project.id, 'AVAILABLE')
    } catch (error) {
      this.watcher = undefined
      this.setStatus(project.id, 'UNAVAILABLE')
      this.options.onWatcherError?.(error)
    }
  }

  private setStatus(
    projectId: ProjectId,
    state: ProjectFileSystemStatus['state'],
  ): void {
    if (this.projectService.getActiveProject()?.id !== projectId) return
    if (this.status?.projectId === projectId && this.status.state === state) return
    this.status = { projectId, state }
    for (const listener of this.statusListeners) listener(this.status)
  }

  private closeWatcher(): void {
    this.watcherGeneration += 1
    try {
      this.watcher?.close()
    } catch (error) {
      this.options.onWatcherError?.(error)
    }
    this.watcher = undefined
  }
}

export function isPathWithinRoot(
  rootPath: string,
  candidatePath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const root = normalizePathIdentity(rootPath, platform)
  const candidate = normalizePathIdentity(candidatePath, platform)
  const separator = platform === 'win32' ? '\\' : '/'
  const descendantPrefix = root.endsWith(separator) ? root : `${root}${separator}`
  return candidate === root || candidate.startsWith(descendantPrefix)
}

function validateEntryName(
  name: string,
  platform: NodeJS.Platform,
  operation: string,
): void {
  const baseName = name.split('.')[0]?.toUpperCase() ?? ''
  const invalid = name.length === 0
    || name === '.'
    || name === '..'
    || name.includes('\0')
    || name.includes('/')
    || name.includes('\\')
    || (platform === 'win32' && (
      /[<>:"|?*]/.test(name)
      || /[. ]$/.test(name)
      || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName)
    ))
  if (invalid) {
    throw invalidPath('The file or folder name is invalid.', operation)
  }
}

function toFileEntry(
  entry: DirectoryEntryLike,
  parentPath: string,
): FileEntry {
  return {
    name: entry.name,
    relativePath: joinContractPath(parentPath, entry.name),
    kind: toEntryKind(entry),
    isSymbolicLink: entry.isSymbolicLink(),
  }
}

function toFileEntryFromStats(
  stats: StatsLike,
  relativePath: string,
  name: string,
): FileEntry {
  return {
    name,
    relativePath,
    kind: toEntryKind(stats),
    isSymbolicLink: stats.isSymbolicLink(),
  }
}

function toEntryKind(entry: Pick<
  DirectoryEntryLike,
  'isFile' | 'isDirectory'
>): FileEntry['kind'] {
  if (entry.isFile()) {
    return 'file'
  }
  if (entry.isDirectory()) {
    return 'directory'
  }
  return 'other'
}

function compareEntries(left: FileEntry, right: FileEntry): number {
  if (left.kind !== right.kind) {
    if (left.kind === 'directory') return -1
    if (right.kind === 'directory') return 1
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

function joinContractPath(parentPath: string, name: string): string {
  return parentPath.length === 0
    ? name
    : posix.join(toContractPath(parentPath), name)
}

function toContractPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function invalidPath(message: string, operation: string): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message,
    operation,
    retryable: false,
  })
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function isRootUnavailableError(error: unknown): boolean {
  return ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR'].some((code) => isNodeErrorCode(error, code))
}
