import type {
  ProjectApi,
  ProjectChangedEvent,
  ProjectIdentity,
} from '../../shared/contracts'
import { PROJECT_CHANNELS, validateRecentRequest, isRecentProjects } from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { isRecord, parseAppResult } from './result'

export function createProjectBridge(ipcRenderer: IpcRendererLike): ProjectApi {
  return {
    async listRecent() { return parseAppResult(await invokeSafely(ipcRenderer, PROJECT_CHANNELS.listRecent, {}), isRecentProjects, PROJECT_CHANNELS.listRecent) },
    async openRecent(id) {
      if (!validateRecentRequest({ id }).ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid recent project.', retryable: false } }
      return parseAppResult(await invokeSafely(ipcRenderer, PROJECT_CHANNELS.openRecent, { id }), isNullableProjectIdentity, PROJECT_CHANNELS.openRecent)
    },
    async removeRecent(id) {
      if (!validateRecentRequest({ id }).ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid recent project.', retryable: false } }
      return parseAppResult(await invokeSafely(ipcRenderer, PROJECT_CHANNELS.removeRecent, { id }), (v): v is null => v === null, PROJECT_CHANNELS.removeRecent)
    },
    async getActive() {
      return parseAppResult(
        await invokeSafely(ipcRenderer, PROJECT_CHANNELS.getActive, {}),
        isNullableProjectIdentity,
        PROJECT_CHANNELS.getActive,
      )
    },
    async open() {
      return parseAppResult(
        await invokeSafely(ipcRenderer, PROJECT_CHANNELS.open, {}),
        isNullableProjectIdentity,
        PROJECT_CHANNELS.open,
      )
    },
    async create(name) {
      return parseAppResult(
        await invokeSafely(ipcRenderer, PROJECT_CHANNELS.create, { name }),
        isNullableProjectIdentity,
        PROJECT_CHANNELS.create,
      )
    },
    async close() {
      return parseAppResult(
        await invokeSafely(ipcRenderer, PROJECT_CHANNELS.close, {}),
        (value): value is null => value === null,
        PROJECT_CHANNELS.close,
      )
    },
    onChanged(listener): () => void {
      const wrapped = (_event: unknown, payload: unknown): void => {
        if (isProjectChangedEvent(payload)) {
          listener(payload)
        }
      }
      ipcRenderer.on(PROJECT_CHANNELS.changed, wrapped)
      return () => {
        ipcRenderer.removeListener(PROJECT_CHANNELS.changed, wrapped)
      }
    },
  }
}

function isProjectIdentity(value: unknown): value is ProjectIdentity {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
}

function isNullableProjectIdentity(
  value: unknown,
): value is ProjectIdentity | null {
  return value === null || isProjectIdentity(value)
}

function isProjectChangedEvent(value: unknown): value is ProjectChangedEvent {
  return isRecord(value) && isNullableProjectIdentity(value.activeProject)
}
