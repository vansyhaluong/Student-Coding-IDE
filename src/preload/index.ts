import { contextBridge, ipcRenderer } from 'electron'

import { createPreloadApi } from './bridge'

contextBridge.exposeInMainWorld('studentIde', createPreloadApi(ipcRenderer))
