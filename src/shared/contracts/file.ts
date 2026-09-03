import type { AppResult } from './app-error'
import type { ProjectId } from './project'
import {
  validateExactObject,
  type ValidationIssue,
  type ValidationResult,
} from './validation'

export const FILE_CHANNELS = {
  listDirectory: 'file:list-directory',
  stat: 'file:stat',
  read: 'file:read',
  write: 'file:write',
  createFile: 'file:create',
  createDirectory: 'file:create-directory',
  rename: 'file:rename',
  delete: 'file:delete',
  getStatus: 'file:get-status',
  changed: 'file:changed',
  statusChanged: 'file:status-changed',
} as const

export type FileEntryKind = 'file' | 'directory' | 'other'

export interface FileEntry {
  name: string
  relativePath: string
  kind: FileEntryKind
  isSymbolicLink: boolean
}

export interface FileStat extends FileEntry {
  size: number
  modifiedAt: string
}

export interface ProjectPathRequest {
  projectId: ProjectId
  relativePath: string
}

export interface CreateEntryRequest {
  projectId: ProjectId
  parentPath: string
  name: string
}

export interface RenameEntryRequest extends ProjectPathRequest {
  newName: string
}

export interface WriteFileRequest extends ProjectPathRequest {
  content: string
}

export interface FileChangedEvent {
  projectId: ProjectId
  relativePath: string
  kind: 'changed' | 'renamed'
}

export interface ProjectFileSystemStatus {
  projectId: ProjectId
  state: 'AVAILABLE' | 'UNAVAILABLE'
}

export interface FileApi {
  listDirectory(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<FileEntry[]>>
  stat(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<FileStat>>
  read(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<string>>
  write(
    projectId: ProjectId,
    relativePath: string,
    content: string,
  ): Promise<AppResult<null>>
  createFile(
    projectId: ProjectId,
    parentPath: string,
    name: string,
  ): Promise<AppResult<FileEntry>>
  createDirectory(
    projectId: ProjectId,
    parentPath: string,
    name: string,
  ): Promise<AppResult<FileEntry>>
  rename(
    projectId: ProjectId,
    relativePath: string,
    newName: string,
  ): Promise<AppResult<FileEntry>>
  delete(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<null>>
  getStatus(projectId: ProjectId): Promise<AppResult<ProjectFileSystemStatus>>
  onChanged(listener: (event: FileChangedEvent) => void): () => void
  onStatusChanged(listener: (status: ProjectFileSystemStatus) => void): () => void
}

export function validateProjectFileSystemStatusRequest(
  value: unknown,
): ValidationResult<{ projectId: ProjectId }> {
  return validateStrings<{ projectId: ProjectId }>(value, ['projectId'])
}

export function validateProjectPathRequest(
  value: unknown,
): ValidationResult<ProjectPathRequest> {
  return validateStrings<ProjectPathRequest>(
    value,
    ['projectId', 'relativePath'],
  )
}

export function validateCreateEntryRequest(
  value: unknown,
): ValidationResult<CreateEntryRequest> {
  return validateStrings<CreateEntryRequest>(
    value,
    ['projectId', 'parentPath', 'name'],
  )
}

export function validateRenameEntryRequest(
  value: unknown,
): ValidationResult<RenameEntryRequest> {
  return validateStrings<RenameEntryRequest>(
    value,
    ['projectId', 'relativePath', 'newName'],
  )
}

export function validateWriteFileRequest(
  value: unknown,
): ValidationResult<WriteFileRequest> {
  return validateStrings<WriteFileRequest>(
    value,
    ['projectId', 'relativePath', 'content'],
  )
}

function validateStrings<T extends object>(
  value: unknown,
  fields: readonly (keyof T & string)[],
): ValidationResult<T> {
  const object = validateExactObject(value, fields)
  if (!object.ok) {
    return object
  }

  const issues: ValidationIssue[] = []
  const result: Record<string, string> = {}
  for (const field of fields) {
    const fieldValue = object.value[field]
    if (typeof fieldValue !== 'string') {
      issues.push({ path: `$.${field}`, message: 'Expected a string' })
    } else {
      result[field] = fieldValue
    }
  }
  if (
    typeof result.projectId === 'string'
    && !/^project_[a-f0-9]{24}$/.test(result.projectId)
  ) {
    issues.push({ path: '$.projectId', message: 'Expected a valid ProjectId' })
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: result as T }
}
