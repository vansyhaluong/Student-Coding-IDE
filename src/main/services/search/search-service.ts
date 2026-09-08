import {
  lstat,
  opendir,
  readFile,
  realpath,
} from 'node:fs/promises'
import { join } from 'node:path'
import { posix } from 'node:path'

import {
  SEARCH_EXCLUDED_DIRECTORIES,
  SEARCH_LIMITS,
  type SearchEvent,
  type SearchMatch,
  type StartSearchRequest,
  type NamesSearchEvent,
  type NamesMatch,
} from '../../../shared/contracts'
import type { ManagedService } from '../../app/desktop-application'
import { DomainError, serializeAppError } from '../../errors/app-error'
import { isPathWithinRoot } from '../filesystem/filesystem-service'
import type { ActiveProject } from '../project/project-identity'
import { ProjectService } from '../project/project-service'

export interface SearchDirectoryEntry {
  name: string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export interface SearchStats {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  size: number
}

export interface SearchFileSystem {
  openDirectory(path: string): Promise<AsyncIterable<SearchDirectoryEntry>>
  lstat(path: string): Promise<SearchStats>
  realpath(path: string): Promise<string>
  readFile(path: string): Promise<Buffer>
}

export interface SearchServiceOptions {
  fileSystem?: SearchFileSystem
  platform?: NodeJS.Platform
  isOwnerAlive?(ownerId: number): boolean
}

interface SearchOperation {
  request: StartSearchRequest
  ownerId: number
  cancelled: boolean
  scannedFiles: number
  skippedFiles: number
  visitedEntries: number
  matchCount: number
  limitReached: boolean
  batch: SearchMatch[]
  publish(event: SearchEvent): void
  names?: { batch: NamesMatch[]; publish(event: NamesSearchEvent): void }
}

const nodeSearchFileSystem: SearchFileSystem = {
  openDirectory: (path) => opendir(path),
  lstat,
  realpath,
  readFile,
}

const binaryExtensions = new Set([
  '7z', 'avi', 'bmp', 'class', 'dll', 'doc', 'docx', 'exe', 'gif', 'gz',
  'ico', 'jar', 'jpeg', 'jpg', 'mov', 'mp3', 'mp4', 'o', 'obj', 'pdf',
  'png', 'ppt', 'pptx', 'pyc', 'so', 'tar', 'ttf', 'wav', 'webp', 'woff',
  'woff2', 'xls', 'xlsx', 'zip',
])

export class SearchService implements ManagedService {
  readonly name = 'SearchService'
  private readonly fileSystem: SearchFileSystem
  private readonly platform: NodeJS.Platform
  private readonly isOwnerAlive: (ownerId: number) => boolean
  private readonly operations = new Map<string, SearchOperation>()
  private removeProjectListener: (() => void) | undefined
  private stopped = false

  constructor(
    private readonly projectService: ProjectService,
    options: SearchServiceOptions = {},
  ) {
    this.fileSystem = options.fileSystem ?? nodeSearchFileSystem
    this.platform = options.platform ?? process.platform
    this.isOwnerAlive = options.isOwnerAlive ?? (() => true)
  }

  start(): void {
    this.stopped = false
    this.removeProjectListener = this.projectService.subscribe((project) => {
      for (const operation of this.operations.values()) {
        if (operation.request.projectId !== project?.id) {
          operation.cancelled = true
        }
      }
    })
  }

  startSearch(
    request: StartSearchRequest,
    ownerId: number,
    publish: (event: SearchEvent) => void,
    names?: SearchOperation['names'],
  ): void {
    if (this.stopped) {
      throw new DomainError({
        code: 'SERVICE_CRASHED',
        message: 'Project search is not available.',
        operation: SEARCH_CHANNEL_START,
        retryable: true,
      })
    }
    if (
      request.query.trim().length === 0
      || request.query.length > SEARCH_LIMITS.maximumQueryLength
      || /[\0\r\n]/.test(request.query)
    ) {
      throw new DomainError({
        code: 'INVALID_INPUT',
        message: 'The search query is invalid.',
        operation: SEARCH_CHANNEL_START,
        retryable: false,
      })
    }
    this.projectService.getAuthorizedProject(request.projectId)
    if (this.operations.has(request.operationId)) {
      throw new DomainError({
        code: 'INVALID_INPUT',
        message: 'The search operation ID is already in use.',
        operation: SEARCH_CHANNEL_START,
        retryable: false,
      })
    }

    this.cancelOwner(ownerId)
    const operation: SearchOperation = {
      request,
      ownerId,
      cancelled: false,
      scannedFiles: 0,
      skippedFiles: 0,
      visitedEntries: 0,
      matchCount: 0,
      limitReached: false,
      batch: [],
      publish,
      names,
    }
    this.operations.set(request.operationId, operation)
    void this.run(operation).finally(() => {
      if (this.operations.get(request.operationId) === operation) {
        this.operations.delete(request.operationId)
      }
    })
  }

  cancel(operationId: string, ownerId: number): void {
    const operation = this.operations.get(operationId)
    if (!operation) return
    if (operation.ownerId !== ownerId) {
      throw new DomainError({
        code: 'PERMISSION_DENIED',
        message: 'The search operation belongs to another renderer.',
        operation: 'search:cancel',
        retryable: false,
      })
    }
    operation.cancelled = true
  }

  startNames(request: StartSearchRequest, ownerId: number, publish: (event: NamesSearchEvent) => void): void {
    this.startSearch(request, ownerId, () => {}, { batch: [], publish })
  }

  cancelOwner(ownerId: number): void {
    for (const operation of this.operations.values()) {
      if (operation.ownerId === ownerId) operation.cancelled = true
    }
  }

  stop(): void {
    this.stopped = true
    this.removeProjectListener?.()
    this.removeProjectListener = undefined
    for (const operation of this.operations.values()) {
      operation.cancelled = true
    }
    this.operations.clear()
  }

  private async run(operation: SearchOperation): Promise<void> {
    try {
      const project = this.projectService.getAuthorizedProject(
        operation.request.projectId,
      )
      await this.traverse(project, operation)
      if (!this.isAuthoritative(operation)) {
        this.publishComplete(operation, 'cancelled')
        return
      }
      this.flushBatch(operation)
      this.publishComplete(operation, 'completed')
    } catch (error) {
      if (!this.isAuthoritative(operation)) {
        this.publishComplete(operation, 'cancelled')
        return
      }
      const publish = operation.names?.publish ?? operation.publish
      publish({
        type: 'error',
        projectId: operation.request.projectId,
        operationId: operation.request.operationId,
        error: serializeAppError(error, SEARCH_CHANNEL_START),
      })
    }
  }

  private async traverse(
    project: ActiveProject,
    operation: SearchOperation,
  ): Promise<void> {
    const directories: Array<{ absolutePath: string; relativePath: string }> = [{
      absolutePath: project.canonicalRoot,
      relativePath: '',
    }]

    while (directories.length > 0 && this.isAuthoritative(operation)) {
      const directory = directories.pop()!
      let entries: AsyncIterable<SearchDirectoryEntry>
      try {
        entries = await this.fileSystem.openDirectory(directory.absolutePath)
      } catch (error) {
        if (directory.relativePath.length === 0) throw error
        operation.skippedFiles += 1
        continue
      }

      try {
        for await (const entry of entries) {
          if (!this.isAuthoritative(operation)) return
          operation.visitedEntries += 1
          if (operation.visitedEntries > SEARCH_LIMITS.maximumEntries) {
            operation.limitReached = true
            return
          }
          if (
            entry.isSymbolicLink()
            || (entry.isDirectory() && isExcludedDirectory(entry.name))
          ) {
            operation.skippedFiles += 1
            continue
          }

          const absolutePath = join(directory.absolutePath, entry.name)
          const relativePath = directory.relativePath.length === 0
            ? entry.name
            : posix.join(directory.relativePath, entry.name)
          if (entry.isDirectory()) {
            const canonicalPath = await this.canonicalContainedPath(
              project,
              absolutePath,
            )
            if (canonicalPath) {
              directories.push({ absolutePath: canonicalPath, relativePath })
            } else {
              operation.skippedFiles += 1
            }
          } else if (entry.isFile()) {
            if (operation.names) await this.searchName(project, absolutePath, relativePath, operation)
            else await this.searchFile(project, absolutePath, relativePath, operation)
            if (
              operation.matchCount >= SEARCH_LIMITS.maximumMatches
              || operation.scannedFiles >= SEARCH_LIMITS.maximumFiles
            ) {
              operation.limitReached = true
              return
            }
          }
        }
      } catch (error) {
        if (!this.isAuthoritative(operation)) return
        if (directory.relativePath.length === 0) throw error
        operation.skippedFiles += 1
      }
    }
  }

  private async searchFile(
    project: ActiveProject,
    absolutePath: string,
    relativePath: string,
    operation: SearchOperation,
  ): Promise<void> {
    if (hasBinaryExtension(relativePath)) {
      operation.skippedFiles += 1
      return
    }
    try {
      const stats = await this.fileSystem.lstat(absolutePath)
      if (
        stats.isSymbolicLink()
        || !stats.isFile()
        || stats.size > SEARCH_LIMITS.maximumFileBytes
      ) {
        operation.skippedFiles += 1
        return
      }
      const canonicalPath = await this.canonicalContainedPath(project, absolutePath)
      if (!canonicalPath || !this.isAuthoritative(operation)) {
        operation.skippedFiles += 1
        return
      }
      const bytes = await this.fileSystem.readFile(canonicalPath)
      if (!this.isAuthoritative(operation)) return
      if (isProbablyBinary(bytes)) {
        operation.skippedFiles += 1
        return
      }
      operation.scannedFiles += 1
      this.collectMatches(bytes.toString('utf8'), relativePath, operation)
    } catch {
      operation.skippedFiles += 1
    }
  }

  private async searchName(project: ActiveProject, absolutePath: string,
    relativePath: string, operation: SearchOperation): Promise<void> {
    const names = operation.names
    if (!names) return
    try {
      const stats = await this.fileSystem.lstat(absolutePath)
      if (stats.isSymbolicLink() || !stats.isFile()
        || !await this.canonicalContainedPath(project, absolutePath)) {
        operation.skippedFiles++
        return
      }
      if (!this.isAuthoritative(operation)) return
      operation.scannedFiles++
      // Same literal Unicode case-insensitive matching as Contents, against paths only.
      if (new RegExp(escapeRegExp(operation.request.query), 'iu').test(relativePath)) {
        names.batch.push({ relativePath })
        operation.matchCount++
        if (names.batch.length >= SEARCH_LIMITS.batchSize) this.flushBatch(operation)
      }
    } catch { operation.skippedFiles++ }
  }

  private collectMatches(
    content: string,
    relativePath: string,
    operation: SearchOperation,
  ): void {
    const expression = new RegExp(escapeRegExp(operation.request.query), 'giu')
    const lines = content.split(/\r?\n/)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? ''
      expression.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = expression.exec(line))) {
        const columnStart = match.index + 1
        const columnEnd = columnStart + match[0].length
        operation.batch.push({
          projectId: operation.request.projectId,
          relativePath,
          lineNumber: lineIndex + 1,
          columnStart,
          columnEnd,
          preview: createPreview(line, match.index, match[0].length),
        })
        operation.matchCount += 1
        if (operation.batch.length >= SEARCH_LIMITS.batchSize) {
          this.flushBatch(operation)
        }
        if (operation.matchCount >= SEARCH_LIMITS.maximumMatches) return
      }
    }
  }

  private async canonicalContainedPath(
    project: ActiveProject,
    lexicalPath: string,
  ): Promise<string | null> {
    try {
      const canonicalPath = await this.fileSystem.realpath(lexicalPath)
      return isPathWithinRoot(
        project.canonicalRoot,
        canonicalPath,
        this.platform,
      ) ? canonicalPath : null
    } catch {
      return null
    }
  }

  private flushBatch(operation: SearchOperation): void {
    if (operation.names) {
      if (operation.names.batch.length && this.isAuthoritative(operation)) {
        operation.names.publish({ type: 'batch', projectId: operation.request.projectId,
          operationId: operation.request.operationId, matches: operation.names.batch.splice(0) })
      }
      return
    }
    if (operation.batch.length === 0 || !this.isAuthoritative(operation)) return
    const matches = operation.batch.splice(0)
    operation.publish({
      type: 'batch',
      projectId: operation.request.projectId,
      operationId: operation.request.operationId,
      matches,
    })
  }

  private publishComplete(
    operation: SearchOperation,
    status: 'completed' | 'cancelled',
  ): void {
    if (this.stopped || !this.isOwnerAlive(operation.ownerId)) return
    const publish = operation.names?.publish ?? operation.publish
    publish({
      type: 'complete',
      projectId: operation.request.projectId,
      operationId: operation.request.operationId,
      status,
      scannedFiles: operation.scannedFiles,
      skippedFiles: operation.skippedFiles,
      limitReached: operation.limitReached,
    })
  }

  private isAuthoritative(operation: SearchOperation): boolean {
    if (
      this.stopped
      || operation.cancelled
      || !this.isOwnerAlive(operation.ownerId)
    ) return false
    try {
      this.projectService.getAuthorizedProject(operation.request.projectId)
      return true
    } catch {
      operation.cancelled = true
      return false
    }
  }
}

const SEARCH_CHANNEL_START = 'search:start'

function isExcludedDirectory(name: string): boolean {
  const identity = name.toLocaleLowerCase('en-US')
  return SEARCH_EXCLUDED_DIRECTORIES.some((excluded) => excluded === identity)
}

function hasBinaryExtension(relativePath: string): boolean {
  const extension = relativePath.split('.').at(-1)?.toLocaleLowerCase('en-US')
  return extension ? binaryExtensions.has(extension) : false
}

function isProbablyBinary(bytes: Buffer): boolean {
  const sampleLength = Math.min(bytes.length, 8_192)
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) return true
  }
  return false
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createPreview(line: string, matchIndex: number, matchLength: number): string {
  const maximum = SEARCH_LIMITS.previewLength
  if (line.length <= maximum) return line
  const contentLength = maximum - 2
  const context = Math.max(20, Math.floor((contentLength - matchLength) / 2))
  const start = Math.max(
    0,
    Math.min(matchIndex - context, line.length - contentLength),
  )
  const end = Math.min(line.length, start + contentLength)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < line.length ? '…' : ''
  const unusedMarkerSpace = 2 - prefix.length - suffix.length
  return `${prefix}${line.slice(start, end + unusedMarkerSpace)}${suffix}`
}
