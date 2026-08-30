import type {
  AppError,
  SearchApi,
  SearchEvent,
  SearchMatch,
} from '../../shared/contracts'
import {
  APP_ERROR_CODES,
  SEARCH_CHANNELS,
} from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { isRecord, parseAppResult } from './result'

export function createSearchBridge(ipcRenderer: IpcRendererLike): SearchApi {
  return {
    async start(projectId, operationId, query) {
      return parseAppResult(
        await ipcRenderer.invoke(SEARCH_CHANNELS.start, {
          projectId,
          operationId,
          query,
        }),
        (value): value is null => value === null,
        SEARCH_CHANNELS.start,
      )
    },
    async cancel(operationId) {
      return parseAppResult(
        await ipcRenderer.invoke(SEARCH_CHANNELS.cancel, { operationId }),
        (value): value is null => value === null,
        SEARCH_CHANNELS.cancel,
      )
    },
    onEvent(listener): () => void {
      const wrapped = (_event: unknown, payload: unknown): void => {
        if (isSearchEvent(payload)) listener(payload)
      }
      ipcRenderer.on(SEARCH_CHANNELS.event, wrapped)
      return () => ipcRenderer.removeListener(SEARCH_CHANNELS.event, wrapped)
    },
  }
}

function isSearchEvent(value: unknown): value is SearchEvent {
  if (
    !isRecord(value)
    || !isProjectId(value.projectId)
    || !isOperationId(value.operationId)
    || typeof value.type !== 'string'
  ) return false

  if (value.type === 'batch') {
    return Array.isArray(value.matches)
      && value.matches.every((match) => (
        isSearchMatch(match) && match.projectId === value.projectId
      ))
  }
  if (value.type === 'complete') {
    return (value.status === 'completed' || value.status === 'cancelled')
      && isNonNegativeInteger(value.scannedFiles)
      && isNonNegativeInteger(value.skippedFiles)
      && typeof value.limitReached === 'boolean'
  }
  return value.type === 'error' && isAppError(value.error)
}

function isSearchMatch(value: unknown): value is SearchMatch {
  return isRecord(value)
    && isProjectId(value.projectId)
    && isRelativePath(value.relativePath)
    && isPositiveInteger(value.lineNumber)
    && isPositiveInteger(value.columnStart)
    && isPositiveInteger(value.columnEnd)
    && value.columnEnd >= value.columnStart
    && typeof value.preview === 'string'
}

function isAppError(value: unknown): value is AppError {
  return isRecord(value)
    && typeof value.code === 'string'
    && APP_ERROR_CODES.some((code) => code === value.code)
    && typeof value.message === 'string'
    && typeof value.retryable === 'boolean'
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^project_[a-f0-9]{24}$/.test(value)
}

function isOperationId(value: unknown): value is string {
  return typeof value === 'string'
    && /^search_[a-zA-Z0-9_-]{1,80}$/.test(value)
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').includes('..')
    && !/^[a-z]:/i.test(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
