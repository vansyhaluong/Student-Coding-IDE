import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  webContents,
} from 'electron'
import { join } from 'node:path'

import {
  LIFECYCLE_CHANNELS,
  FILE_CHANNELS,
  PROJECT_CHANNELS,
  SEARCH_CHANNELS,
  RUN_CHANNELS,
  type RunEvent,
  type FileChangedEvent,
  type ProjectFileSystemStatus,
  type ProjectChangedEvent,
  type ProjectTransitionSettledEvent,
  type RecentProjectMetadata,
  type SearchEvent,
  type UnsavedTransitionRequestEvent,
} from '../shared/contracts'
import { DesktopApplication } from './app/desktop-application'
import { ApplicationQuitCoordinator } from './app/application-quit-coordinator'
import { FoundationIpcService } from './ipc/foundation-ipc-service'
import { FileIpcService } from './ipc/file-ipc-service'
import { IpcHandlerRegistry } from './ipc/ipc-handler-registry'
import { ProjectIpcService } from './ipc/project-ipc-service'
import { SearchIpcService } from './ipc/search-ipc-service'
import { TerminalIpcService } from './ipc/terminal-ipc-service'
import { FileSystemService } from './services/filesystem/filesystem-service'
import { PersistenceService } from './services/persistence/persistence-service'
import { ProcessManager } from './services/process/process-manager'
import { WindowsProcessTreeTerminator } from './services/process/windows-process-tree-terminator'
import { UnsavedTransitionService } from './services/lifecycle/unsaved-transition-service'
import { ProjectService } from './services/project/project-service'
import { SearchService } from './services/search/search-service'
import { NodePtyPort } from './services/terminal/node-pty-adapter'
import { WindowsShellResolver } from './services/terminal/shell-resolver'
import { TerminalService } from './services/terminal/terminal-service'
import { RunService } from './services/run/run-service'
import { RunProjectLifecycle } from './services/run/run-project-lifecycle'
import { WindowsPipedProcessAdapter } from './services/run/windows-piped-process-adapter'
import { NodeRuntimeDetector } from './services/dependencies/node-runtime'
import { DomainError } from './errors/app-error'
import { RunIpcService } from './ipc/run-ipc-service'
import { WindowManager } from './window/window-manager'

interface AppMetadata {
  recentProjects: RecentProjectMetadata[]
}

let desktopApplication: DesktopApplication | undefined
let windowManager: WindowManager | undefined
let unsavedTransitionService: UnsavedTransitionService | undefined
let quitCoordinator: ApplicationQuitCoordinator | undefined
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
  const searchService = new SearchService(projectService, {
    isOwnerAlive: (ownerId) => BrowserWindow.getAllWindows().some(
      (window) => !window.isDestroyed()
        && !window.webContents.isDestroyed()
        && window.webContents.id === ownerId,
    ),
  })
  const terminalIpcReference: { current?: TerminalIpcService } = {}
  const terminalService = new TerminalService({
    ptyPort: new NodePtyPort(),
    projectService,
    processManager,
    processTreeTerminator: new WindowsProcessTreeTerminator(),
    shellResolver: new WindowsShellResolver(),
    publish: (ownerId, event) => terminalIpcReference.current?.publish(ownerId, event),
    onEventSinkError: () => {
      console.error('A terminal event listener failed unexpectedly.')
    },
  })

  const ipcRegistry = new IpcHandlerRegistry(ipcMain)
  const nodeRuntime = new NodeRuntimeDetector()
  let runAdapter: WindowsPipedProcessAdapter | undefined
  const runService = new RunService({
    authorize: async (target, ownerId) => {
      const assertOwner = () => {
        const owner = webContents.fromId(ownerId)
        if (!owner || owner.isDestroyed()) throw new DomainError({ code: 'PERMISSION_DENIED',
          message: 'The Run window is no longer available.', operation: 'run:authorize', retryable: false })
      }
      assertOwner()
      const file = await fileSystemService.authorizeRunFile(target.projectId, target.relativePath)
      assertOwner()
      return { projectId: target.projectId, relativePath: target.relativePath, ...file }
    },
    resolveRuntime: () => nodeRuntime.resolve(),
  }, {
    // Delay loading until an authorized Run; unsupported hosts retain normal IDE startup.
    adapter: { create: (execution, observe) => {
      runAdapter ??= new WindowsPipedProcessAdapter()
      return runAdapter.create(execution, observe)
    } },
    manager: processManager,
    onEvent: (ownerId, event) => publishToRenderer(ownerId, RUN_CHANNELS.event, event),
    onEventSinkError: () => console.error('A Run event could not be delivered.'),
  })
  const runLifecycle = new RunProjectLifecycle(runService, projectService, fileSystemService,
    () => console.error('Unavailable-project Run cleanup failed; cleanup remains retryable.'))
  unsavedTransitionService = new UnsavedTransitionService(
    ipcRegistry,
    projectService,
    {
      terminalLifecycle: terminalService,
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
      app.quit()
      return false
    },
    isApplicationQuitAuthorized: () => (
      quitCoordinator?.isFinalQuitAuthorized() ?? false
    ),
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
  projectService.subscribeTransitionSettled((transitionId) => {
    const event: ProjectTransitionSettledEvent = {
      transitionId,
      outcome: 'failed',
    }
    publishLifecycleToWindows(
      LIFECYCLE_CHANNELS.projectTransitionSettled,
      event,
    )
  })
  const fileIpc = new FileIpcService(
    ipcRegistry,
    fileSystemService,
    (event) => publishToWindows(FILE_CHANNELS.changed, event),
    (status) => publishToWindows(FILE_CHANNELS.statusChanged, status),
  )
  const searchIpc = new SearchIpcService(
    ipcRegistry,
    searchService,
    (ownerId, event) => publishToRenderer(
      ownerId,
      SEARCH_CHANNELS.event,
      event,
    ),
  )
  const terminalIpc = new TerminalIpcService(
    ipcRegistry,
    terminalService,
    {
      getWebContents: (ownerId) => {
        const owner = webContents.fromId(ownerId)
        return owner
          ? {
              id: owner.id,
              isDestroyed: () => owner.isDestroyed(),
              send: (channel, event) => owner.send(channel, event),
              on: (_event, listener) => owner.on('did-start-navigation', listener),
              once: (_event, listener) => owner.once('destroyed', listener),
              removeNavigationListener: (listener) => {
                owner.removeListener('did-start-navigation', listener)
              },
              removeDestroyedListener: (listener) => {
                owner.removeListener('destroyed', listener)
              },
            }
          : null
      },
      onCleanupError: () => {
        console.error('Terminal owner cleanup did not finish cleanly.')
      },
      onEventRoutingError: () => {
        console.error('A terminal event could not be delivered.')
      },
    },
  )
  terminalIpcReference.current = terminalIpc

  const runOwners = new Map<number, () => void>()
  const runIpc = new RunIpcService(ipcRegistry, runService, (ownerId) => {
    if (runOwners.has(ownerId)) return
    const owner = webContents.fromId(ownerId)
    if (!owner || owner.isDestroyed()) throw new DomainError({ code: 'PERMISSION_DENIED',
      message: 'The Run window is no longer available.', retryable: false })
    const cleanup = () => {
      void runService.stopOwner(ownerId).catch(() => {
        console.error('Run window cleanup failed; resources remain tracked for shutdown retry.')
      })
    }
    const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) cleanup()
    }
    const destroyed = () => { cleanup(); remove() }
    const remove = () => {
      owner.removeListener('did-start-navigation', navigation)
      owner.removeListener('destroyed', destroyed)
      runOwners.delete(ownerId)
    }
    owner.on('did-start-navigation', navigation)
    owner.once('destroyed', destroyed)
    runOwners.set(ownerId, remove)
  })

  desktopApplication = new DesktopApplication([
    persistenceService,
    processManager,
    projectService,
    fileSystemService,
    searchService,
    terminalService,
    foundationIpc,
    unsavedTransitionService,
    // Starts after the unsaved guard; stops before it and all Run dependencies.
    runLifecycle,
    { name: 'RunOwnerSubscriptions', stop: () => {
      for (const remove of [...runOwners.values()]) remove()
    } },
    runIpc,
    projectIpc,
    fileIpc,
    searchIpc,
    terminalIpc,
    windowManager,
  ], {
    // Keep the close/retry surface alive until every mandatory service cleanup
    // has succeeded. Electron performs the final window close afterward.
    shutdownLast: [windowManager],
  })

  removeLifecyclePublisher = desktopApplication.subscribe((status) => {
    // Block starts/events at STOPPING; cleanup stays in managed-service order.
    if (status.state === 'STOPPING') runService.beginShutdown()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(LIFECYCLE_CHANNELS.statusChanged, status)
      }
    }
  })

  quitCoordinator = new ApplicationQuitCoordinator({
    getApplication: () => desktopApplication,
    requestApproval: () => (
      BrowserWindow.getAllWindows().some((window) => !window.isDestroyed())
        ? unsavedTransitionService?.requestApplicationClose() ?? Promise.resolve(false)
        : Promise.resolve(false)
    ),
    quit: () => app.quit(),
    onCleanupError: () => {
      console.error('Student Coding IDE cleanup did not finish cleanly.')
    },
    onShutdownSucceeded: () => {
      removeLifecyclePublisher?.()
      removeLifecyclePublisher = undefined
    },
  })

  await desktopApplication.start()
}).catch(() => {
  console.error('Student Coding IDE failed to start.')
  app.exit(1)
})

function publishToWindows(
  channel: string,
  event: ProjectChangedEvent | FileChangedEvent | ProjectFileSystemStatus,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, event)
    }
  }
}

function publishLifecycleToWindows(
  channel: string,
  event: ProjectTransitionSettledEvent,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, event)
    }
  }
}

function publishToRenderer(
  ownerId: number,
  channel: string,
  event: SearchEvent | RunEvent,
): void {
  const window = BrowserWindow.getAllWindows().find(
    (candidate) => !candidate.isDestroyed()
      && !candidate.webContents.isDestroyed()
      && candidate.webContents.id === ownerId,
  )
  window?.webContents.send(channel, event)
}

app.on('activate', () => {
  if (desktopApplication?.getStatus().state !== 'RUNNING') return
  void windowManager?.ensureMainWindow().catch(() => {
    console.error('Student Coding IDE failed to create its main window.')
  })
})

app.on('before-quit', (event) => {
  quitCoordinator?.handleBeforeQuit(event)
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
