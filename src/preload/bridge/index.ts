import { createAiBridge } from './ai'
import { createSettingsBridge } from './settings'
import { createLanguageBridge } from './language'
import type { StudentIdeApi } from '../../shared/contracts'
import { createFileBridge } from './file'
import { createGitBridge } from './git'
import {
  createLifecycleBridge,
  type IpcRendererLike,
} from './lifecycle'
import { createProjectBridge } from './project'
import { createSearchBridge } from './search'
import { createTerminalBridge } from './terminal'
import { createRunBridge } from './run'
import { createRunSourceGuardBridge } from './run-source-guard'

export function createPreloadApi(
  ipcRenderer: IpcRendererLike,
): StudentIdeApi {
  return {
    ai: createAiBridge(ipcRenderer),
    settings: createSettingsBridge(ipcRenderer),
    language: createLanguageBridge(ipcRenderer),
    file: createFileBridge(ipcRenderer),
    git: createGitBridge(ipcRenderer),
    lifecycle: createLifecycleBridge(ipcRenderer),
    project: createProjectBridge(ipcRenderer),
    search: createSearchBridge(ipcRenderer),
    terminal: createTerminalBridge(ipcRenderer),
    run: createRunBridge(ipcRenderer),
    runSourceGuard: createRunSourceGuardBridge(ipcRenderer),
  }
}
