import type {
  FileApi,
  FileChangedEvent,
  FileEntry,
  FileStat,
} from '../../shared/contracts'
import { FILE_CHANNELS } from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { isRecord, parseAppResult } from './result'

export function createFileBridge(ipcRenderer: IpcRendererLike): FileApi {
  return {
    async listDirectory(projectId, relativePath) {
      return parseAppResult(
        await ipcRenderer.invoke(FILE_CHANNELS.listDirectory, {
          projectId,
          relativePath,
        }),
        isFileEntryArray,
        FILE_CHANNELS.listDirectory,
      )
    },
    async stat(projectId, relativePath) {
      return parseAppResult(
        await ipcRenderer.invoke(FILE_CHANNELS.stat, {
          projectId,
          relativePath,
        }),
        isFileStat,
        FILE_CHANNELS.stat,
      )
    },
    async read(projectId, relativePath) {
      return parseAppResult(
        await ipcRenderer.invoke(FILE_CHANNELS.read, {
          projectId,
          relativePath,
        }),
        (value): value is string => typeof value === 'string',
        FILE_CHANNELS.read,
      )
    },
    async write(projectId, relativePath, content) {
      return parseAppResult(
        await ipcRenderer.invoke(FILE_CHANNELS.write, {
          projectId,
          relativePath,
          content,
        }),
        (value): value is null => value === null,
        FILE_CHANNELS.write,
      )
    },
    async createFile(projectId, parentPath, name) {
      return invokeEntry(ipcRenderer, FILE_CHANNELS.createFile, {
        projectId,
        parentPath,
        name,
      })
    },
    async createDirectory(projectId, parentPath, name) {
      return invokeEntry(ipcRenderer, FILE_CHANNELS.createDirectory, {
        projectId,
        parentPath,
        name,
      })
    },
    async rename(projectId, relativePath, newName) {
      return invokeEntry(ipcRenderer, FILE_CHANNELS.rename, {
        projectId,
        relativePath,
        newName,
      })
    },
    async delete(projectId, relativePath) {
      return parseAppResult(
        await ipcRenderer.invoke(FILE_CHANNELS.delete, {
          projectId,
          relativePath,
        }),
        (value): value is null => value === null,
        FILE_CHANNELS.delete,
      )
    },
    onChanged(listener): () => void {
      const wrapped = (_event: unknown, payload: unknown): void => {
        if (isFileChangedEvent(payload)) {
          listener(payload)
        }
      }
      ipcRenderer.on(FILE_CHANNELS.changed, wrapped)
      return () => {
        ipcRenderer.removeListener(FILE_CHANNELS.changed, wrapped)
      }
    },
  }
}

async function invokeEntry(
  ipcRenderer: IpcRendererLike,
  channel: string,
  payload: Record<string, string>,
) {
  return parseAppResult(
    await ipcRenderer.invoke(channel, payload),
    isFileEntry,
    channel,
  )
}

function isFileEntryArray(value: unknown): value is FileEntry[] {
  return Array.isArray(value) && value.every(isFileEntry)
}

function isFileEntry(value: unknown): value is FileEntry {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.relativePath === 'string'
    && (value.kind === 'file' || value.kind === 'directory' || value.kind === 'other')
    && typeof value.isSymbolicLink === 'boolean'
}

function isFileStat(value: unknown): value is FileStat {
  return isFileEntry(value)
    && 'size' in value
    && typeof value.size === 'number'
    && 'modifiedAt' in value
    && typeof value.modifiedAt === 'string'
}

function isFileChangedEvent(value: unknown): value is FileChangedEvent {
  return isRecord(value)
    && typeof value.projectId === 'string'
    && typeof value.relativePath === 'string'
    && (value.kind === 'changed' || value.kind === 'renamed')
}
