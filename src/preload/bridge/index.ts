import type { LifecycleApi } from '../../shared/contracts'
import {
  createLifecycleBridge,
  type IpcRendererLike,
} from './lifecycle'

export interface StudentIdeApi {
  lifecycle: LifecycleApi
}

export function createPreloadApi(
  ipcRenderer: IpcRendererLike,
): StudentIdeApi {
  return {
    lifecycle: createLifecycleBridge(ipcRenderer),
  }
}
