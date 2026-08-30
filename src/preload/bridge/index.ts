import type { StudentIdeApi } from '../../shared/contracts'
import { createFileBridge } from './file'
import {
  createLifecycleBridge,
  type IpcRendererLike,
} from './lifecycle'
import { createProjectBridge } from './project'
import { createSearchBridge } from './search'

export function createPreloadApi(
  ipcRenderer: IpcRendererLike,
): StudentIdeApi {
  return {
    file: createFileBridge(ipcRenderer),
    lifecycle: createLifecycleBridge(ipcRenderer),
    project: createProjectBridge(ipcRenderer),
    search: createSearchBridge(ipcRenderer),
  }
}
