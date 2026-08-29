import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron'
import { join } from 'node:path'

import {
  LIFECYCLE_CHANNELS,
  FILE_CHANNELS,
  PROJECT_CHANNELS,
  type FileChangedEvent,
  type ProjectChangedEvent,
  type RecentProjectMetadata,
  type UnsavedTransitionRequestEvent,
} from '../shared/contracts'
import { DesktopApplication } from './app/desktop-application'
import { FoundationIpcService } from './ipc/foundation-ipc-service'
import { FileIpcService } from './ipc/file-ipc-service'
import { IpcHandlerRegistry } from './ipc/ipc-handler-registry'
import { ProjectIpcService } from './ipc/project-ipc-service'
import { FileSystemService } from './services/filesystem/filesystem-service'
import { PersistenceService } from './services/persistence/persistence-service'
import { ProcessManager } from './services/process/process-manager'
import { UnsavedTransitionService } from './services/lifecycle/unsaved-transition-service'
import { ProjectService } from './services/project/project-service'
import { WindowManager } from './window/window-manager'

interface AppMetadata {
  recentProjects: RecentProjectMetadata[]
}

let desktopApplication: DesktopApplication | undefined
let windowManager: WindowManager | undefined
let unsavedTransitionService: UnsavedTransitionService | undefined
let shutdownRequested = false
let applicationCloseApproved = false
let removeLifecyclePublisher: (() => void) | undefined

void app.whenReady().then(async () => {
  const processManager = new ProcessManager()
  const persistenceService = new PersistenceService<AppMetadata>({
    filePath: join(app.getPath('userData'), 'app-state.json'),
    schemaVersion: 1,
    defaultValue: () => ({ recentProjects: [] }),
    validate: isAppMetadata,
  })
  const projectService = new ProjectService(
    undefined,
    process.platform,
    {
      getRecentProjects: () => persistenceService.getValue().recentProjects,
      updateRecentProjects: (recentProjects) => persistenceService.update({
        ...persistenceService.getValue(),
        recentProjects,
      }),
    },
    () => {
      console.error('A project state listener failed unexpectedly.')
    },
  )
  const fileSystemService = new FileSystemService(projectService, {
    trashItem: (path) => shell.trashItem(path),
    onWatcherError: () => {
      console.error('The active project watcher stopped unexpectedly.')
    },
  })

  const ipcRegistry = new IpcHandlerRegistry(ipcMain)
  unsavedTransitionService = new UnsavedTransitionService(
    ipcRegistry,
    projectService,
    {
      getRenderer: () => {
        const window = BrowserWindow.getAllWindows().find(
          (candidate) => !candidate.isDestroyed(),
        )
        return window
          ? {
              senderId: window.webContents.id,
              send: (event: UnsavedTransitionRequestEvent) => {
                window.webContents.send(
                  LIFECYCLE_CHANNELS.unsavedTransitionRequested,
                  event,
                )
              },
            }
          : null
      },
    },
  )

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
    requestClose: async () => {
      const approved = await unsavedTransitionService?.requestApplicationClose() ?? false
      if (approved) applicationCloseApproved = true
      return approved
    },
    onCloseRequestError: () => {
      console.error('Application close coordination failed.')
    },
  })

  const foundationIpc = new FoundationIpcService(
    ipcRegistry,
    () => desktopApplication?.getStatus() ?? { state: 'CREATED' },
  )
  const projectIpc = new ProjectIpcService(
    ipcRegistry,
    projectService,
    {
      selectDirectory: async (purpose) => {
        const result = await dialog.showOpenDialog({
          title: purpose === 'open-project'
            ? 'Open Project'
            : 'Choose Project Location',
          properties: ['openDirectory', 'createDirectory'],
        })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      publishChanged: (event) => publishToWindows(
        PROJECT_CHANNELS.changed,
        event,
      ),
    },
  )
  const fileIpc = new FileIpcService(
    ipcRegistry,
    fileSystemService,
    (event) => publishToWindows(FILE_CHANNELS.changed, event),
  )

  desktopApplication = new DesktopApplication([
    persistenceService,
    processManager,
    projectService,
    fileSystemService,
    foundationIpc,
    unsavedTransitionService,
    projectIpc,
    fileIpc,
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

function publishToWindows(
  channel: string,
  event: ProjectChangedEvent | FileChangedEvent,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, event)
    }
  }
}

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

  const requestApproval = applicationCloseApproved
    ? Promise.resolve(true)
    : BrowserWindow.getAllWindows().some((window) => !window.isDestroyed())
      ? unsavedTransitionService?.requestApplicationClose() ?? Promise.resolve(false)
      : Promise.resolve(false)

  void requestApproval.then((approved) => {
    if (!approved) {
      shutdownRequested = false
      return
    }
    applicationCloseApproved = true
    return desktopApplication?.shutdown()
  })
    .catch(() => {
      console.error('Student Coding IDE cleanup did not finish cleanly.')
    })
    .finally(() => {
      if (!applicationCloseApproved) return
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
