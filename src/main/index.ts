import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from 'electron'
import { join } from 'node:path'

import {
  LIFECYCLE_CHANNELS,
  type RecentProjectMetadata,
} from '../shared/contracts'
import { DesktopApplication } from './app/desktop-application'
import { FoundationIpcService } from './ipc/foundation-ipc-service'
import { IpcHandlerRegistry } from './ipc/ipc-handler-registry'
import { PersistenceService } from './services/persistence/persistence-service'
import { ProcessManager } from './services/process/process-manager'
import { ProjectService } from './services/project/project-service'
import { WindowManager } from './window/window-manager'

interface AppMetadata {
  recentProjects: RecentProjectMetadata[]
}

let desktopApplication: DesktopApplication | undefined
let windowManager: WindowManager | undefined
let shutdownRequested = false
let removeLifecyclePublisher: (() => void) | undefined

void app.whenReady().then(async () => {
  const processManager = new ProcessManager()
  const projectService = new ProjectService()
  const persistenceService = new PersistenceService<AppMetadata>({
    filePath: join(app.getPath('userData'), 'app-state.json'),
    schemaVersion: 1,
    defaultValue: () => ({ recentProjects: [] }),
    validate: isAppMetadata,
  })

  windowManager = new WindowManager({
    createWindow: (options) => new BrowserWindow(options),
    openExternal: (url) => shell.openExternal(url),
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererFile: join(__dirname, '../renderer/index.html'),
    developmentRendererUrl: !app.isPackaged
      ? process.env.ELECTRON_RENDERER_URL
      : undefined,
    onExternalOpenError: () => {
      console.error('Failed to open an approved external URL.')
    },
  })

  const ipcRegistry = new IpcHandlerRegistry(ipcMain)
  const foundationIpc = new FoundationIpcService(
    ipcRegistry,
    () => desktopApplication?.getStatus() ?? { state: 'CREATED' },
  )

  desktopApplication = new DesktopApplication([
    persistenceService,
    processManager,
    projectService,
    foundationIpc,
    windowManager,
  ])

  removeLifecyclePublisher = desktopApplication.subscribe((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(LIFECYCLE_CHANNELS.statusChanged, status)
      }
    }
  })

  await desktopApplication.start()
}).catch(() => {
  console.error('Student Coding IDE failed to start.')
  app.exit(1)
})

app.on('activate', () => {
  void windowManager?.ensureMainWindow().catch(() => {
    console.error('Student Coding IDE failed to create its main window.')
  })
})

app.on('before-quit', (event) => {
  if (!desktopApplication || desktopApplication.getStatus().state === 'STOPPED') {
    return
  }

  event.preventDefault()
  if (shutdownRequested) {
    return
  }
  shutdownRequested = true

  void desktopApplication.shutdown()
    .catch(() => {
      console.error('Student Coding IDE cleanup did not finish cleanly.')
    })
    .finally(() => {
      removeLifecyclePublisher?.()
      removeLifecyclePublisher = undefined
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function isAppMetadata(value: unknown): value is AppMetadata {
  return typeof value === 'object'
    && value !== null
    && 'recentProjects' in value
    && Array.isArray(value.recentProjects)
    && value.recentProjects.every(isRecentProjectMetadata)
}

function isRecentProjectMetadata(
  value: unknown,
): value is RecentProjectMetadata {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'name' in value
    && typeof value.name === 'string'
    && 'rootPath' in value
    && typeof value.rootPath === 'string'
    && 'lastOpenedAt' in value
    && typeof value.lastOpenedAt === 'string'
}
