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
  listRecent: 'project:list-recent',
  openRecent: 'project:open-recent',
  removeRecent: 'project:remove-recent',
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

export interface RecentProject { id: ProjectId; name: string; displayPath: string; lastOpenedAt: string }
export interface ProjectApi {
  listRecent(): Promise<AppResult<RecentProject[]>>
  openRecent(id: ProjectId): Promise<AppResult<ProjectIdentity | null>>
  removeRecent(id: ProjectId): Promise<AppResult<null>>
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

export function validateRecentRequest(v: unknown): ValidationResult<{ id: ProjectId }> {
  const r = validateExactObject(v, ['id'])
  if (!r.ok) return r
  return isProjectId(r.value.id) ? { ok: true, value: { id: r.value.id } }
    : { ok: false, issues: [{ path: '$.id', message: 'Invalid recent project' }] }
}
export function isRecentProjects(v: unknown): v is RecentProject[] {
  return Array.isArray(v) && v.every(item => {
    const r = validateExactObject(item, ['id', 'name', 'displayPath', 'lastOpenedAt'])
    return r.ok && isProjectId(r.value.id) && typeof r.value.name === 'string'
      && typeof r.value.displayPath === 'string' && typeof r.value.lastOpenedAt === 'string'
      && Number.isFinite(Date.parse(r.value.lastOpenedAt))
  })
}
