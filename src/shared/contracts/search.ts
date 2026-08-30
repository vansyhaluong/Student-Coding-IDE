import type { AppError, AppResult } from './app-error'
import type { ProjectId } from './project'
import {
  validateExactObject,
  type ValidationIssue,
  type ValidationResult,
} from './validation'

export const SEARCH_CHANNELS = {
  start: 'search:start',
  cancel: 'search:cancel',
  event: 'search:event',
} as const

export const SEARCH_LIMITS = {
  maximumQueryLength: 256,
  maximumFileBytes: 1024 * 1024,
  maximumFiles: 10_000,
  maximumEntries: 50_000,
  maximumMatches: 1_000,
  batchSize: 50,
  previewLength: 240,
} as const

export const SEARCH_EXCLUDED_DIRECTORIES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
] as const

export interface StartSearchRequest {
  projectId: ProjectId
  operationId: string
  query: string
}

export interface CancelSearchRequest {
  operationId: string
}

export interface SearchMatch {
  projectId: ProjectId
  relativePath: string
  lineNumber: number
  columnStart: number
  columnEnd: number
  preview: string
}

export interface SearchBatchEvent {
  type: 'batch'
  projectId: ProjectId
  operationId: string
  matches: SearchMatch[]
}

export interface SearchCompleteEvent {
  type: 'complete'
  projectId: ProjectId
  operationId: string
  status: 'completed' | 'cancelled'
  scannedFiles: number
  skippedFiles: number
  limitReached: boolean
}

export interface SearchErrorEvent {
  type: 'error'
  projectId: ProjectId
  operationId: string
  error: AppError
}

export type SearchEvent =
  | SearchBatchEvent
  | SearchCompleteEvent
  | SearchErrorEvent

export interface SearchApi {
  start(
    projectId: ProjectId,
    operationId: string,
    query: string,
  ): Promise<AppResult<null>>
  cancel(operationId: string): Promise<AppResult<null>>
  onEvent(listener: (event: SearchEvent) => void): () => void
}

export function validateStartSearchRequest(
  value: unknown,
): ValidationResult<StartSearchRequest> {
  const object = validateExactObject(
    value,
    ['projectId', 'operationId', 'query'],
  )
  if (!object.ok) return object

  const issues: ValidationIssue[] = []
  validateProjectId(object.value.projectId, issues)
  validateOperationId(object.value.operationId, issues)
  const query = object.value.query
  if (typeof query !== 'string') {
    issues.push({ path: '$.query', message: 'Expected a string' })
  } else if (query.trim().length === 0) {
    issues.push({ path: '$.query', message: 'Expected a non-empty query' })
  } else if (/[\0\r\n]/.test(query)) {
    issues.push({ path: '$.query', message: 'Query contains unsupported characters' })
  } else if (query.length > SEARCH_LIMITS.maximumQueryLength) {
    issues.push({ path: '$.query', message: 'Query is too long' })
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as StartSearchRequest }
}

export function validateCancelSearchRequest(
  value: unknown,
): ValidationResult<CancelSearchRequest> {
  const object = validateExactObject(value, ['operationId'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateOperationId(object.value.operationId, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: object.value as unknown as CancelSearchRequest }
}

function validateProjectId(value: unknown, issues: ValidationIssue[]): void {
  if (typeof value !== 'string' || !/^project_[a-f0-9]{24}$/.test(value)) {
    issues.push({ path: '$.projectId', message: 'Expected a valid ProjectId' })
  }
}

function validateOperationId(value: unknown, issues: ValidationIssue[]): void {
  if (
    typeof value !== 'string'
    || !/^search_[a-zA-Z0-9_-]{1,80}$/.test(value)
  ) {
    issues.push({
      path: '$.operationId',
      message: 'Expected a valid search operation ID',
    })
  }
}
