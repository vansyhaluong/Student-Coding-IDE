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
  createFile: 'file:create',
  createDirectory: 'file:create-directory',
  rename: 'file:rename',
  delete: 'file:delete',
  changed: 'file:changed',
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

export interface FileChangedEvent {
  projectId: ProjectId
  relativePath: string
  kind: 'changed' | 'renamed'
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
  onChanged(listener: (event: FileChangedEvent) => void): () => void
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
