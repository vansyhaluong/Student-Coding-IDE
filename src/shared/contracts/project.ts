import type { AppResult } from './app-error'
import {
  validateEmptyObject,
  validateExactObject,
  type ValidationResult,
} from './validation'

export type ProjectId = string & { readonly __brand: 'ProjectId' }

export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && /^project_[a-f0-9]{24}$/.test(value)
}

export interface ProjectIdentity {
  id: ProjectId
  name: string
}

export interface RecentProjectMetadata extends ProjectIdentity {
  rootPath: string
  lastOpenedAt: string
}

export const PROJECT_CHANNELS = {
  getActive: 'project:get-active',
  open: 'project:open',
  create: 'project:create',
  close: 'project:close',
  changed: 'project:changed',
} as const

export type GetActiveProjectRequest = Record<string, never>
export type OpenProjectRequest = Record<string, never>
export type CloseProjectRequest = Record<string, never>

export interface CreateProjectRequest {
  name: string
}

export interface ProjectChangedEvent {
  activeProject: ProjectIdentity | null
}

export interface ProjectApi {
  getActive(): Promise<AppResult<ProjectIdentity | null>>
  open(): Promise<AppResult<ProjectIdentity | null>>
  create(name: string): Promise<AppResult<ProjectIdentity | null>>
  close(): Promise<AppResult<null>>
  onChanged(listener: (event: ProjectChangedEvent) => void): () => void
}

export const validateGetActiveProjectRequest = validateEmptyObject
export const validateOpenProjectRequest = validateEmptyObject
export const validateCloseProjectRequest = validateEmptyObject

export function validateCreateProjectRequest(
  value: unknown,
): ValidationResult<CreateProjectRequest> {
  const object = validateExactObject(value, ['name'])
  if (!object.ok) {
    return object
  }
  if (
    typeof object.value.name !== 'string'
    || !isValidProjectName(object.value.name)
  ) {
    return {
      ok: false,
      issues: [{ path: '$.name', message: 'Expected a non-empty string' }],
    }
  }
  return { ok: true, value: { name: object.value.name } }
}

function isValidProjectName(name: string): boolean {
  const baseName = name.split('.')[0]?.toUpperCase() ?? ''
  return name.length > 0
    && name !== '.'
    && name !== '..'
    && !name.includes('\0')
    && !/[\\/<>:"|?*]/.test(name)
    && !/[. ]$/.test(name)
    && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName)
}
