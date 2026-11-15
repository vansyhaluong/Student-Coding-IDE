import { JavaScriptRunStrategy } from './services/run/javascript-run-strategy'
import { CSharpRunStrategy } from './services/run/csharp-run-strategy'
import { CsharpRunPreparation } from './services/run/csharp-run-preparation'
import { CsharpRunTargetRequests } from './services/run/csharp-run-target-requests'
import { CsharpRunTargetStore } from './services/run/csharp-run-target-store'
import { CsharpRunTargetResolver } from './services/run/csharp-run-target-resolver'
import { CsharpRunPreflight } from './services/run/csharp-run-preflight'
import { CsharpRunProbe } from './services/run/csharp-run-probe'
import { DotnetRunRuntimeResolver } from './services/dependencies/dotnet-run-runtime'
import { RUN_PROJECT_CHANNELS, type ProjectRunEvent } from '../shared/contracts/run-project'
import { OllamaService } from './services/ai/ollama-service'
import { AI_CHANNELS } from '../shared/contracts/ai'
import { AiIpcService } from './ipc/ai-ipc-service'
import { CsharpSemanticService } from './services/language/csharp-semantic-service'
import { LanguageIpcService } from './ipc/language-ipc-service'
import { LANGUAGE_CHANNELS } from '../shared/contracts/language'
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
  type SearchEvent,
  type NamesSearchEvent,
  type UnsavedTransitionRequestEvent,
} from '../shared/contracts'
import { DesktopApplication } from './app/desktop-application'
import { ApplicationQuitCoordinator } from './app/application-quit-coordinator'
import { FoundationIpcService } from './ipc/foundation-ipc-service'
import { FileIpcService } from './ipc/file-ipc-service'
import { GitLifecycleIpcService } from './ipc/git-lifecycle-ipc-service'
import { IpcHandlerRegistry, type IpcRequestContext } from './ipc/ipc-handler-registry'
import { ProjectIpcService } from './ipc/project-ipc-service'
import { SearchIpcService } from './ipc/search-ipc-service'
import { TerminalIpcService } from './ipc/terminal-ipc-service'
import { FileSystemService } from './services/filesystem/filesystem-service'
import { createAppPersistence, SettingsService } from './services/settings/settings-service'
import { SettingsIpcService } from './ipc/settings-ipc-service'
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
import { GitExecutableDetector } from './services/dependencies/git-executable'
import { GitOwnedCommandRunner } from './services/git/git-owned-command-runner'
import { GitOperationLifecycle } from './services/git/git-operation-lifecycle'
import { GitDocumentOwners } from './services/git/git-document-owners'
import { GitService } from './services/git/git-service'
import { DomainError } from './errors/app-error'
import { RunIpcService } from './ipc/run-ipc-service'
import { RunSourceGuard } from './services/run/run-source-guard'
import { WindowManager } from './window/window-manager'
import { createCsharpLanguageManager } from './services/language/language-service-manager'
import { CsharpWorkspaceStore } from './services/language/csharp-workspace-store'
import { CsharpPreflightProcess } from './services/language/csharp-preflight-process'
import { CsharpWorkspace } from './services/language/csharp-workspace'
import { CsharpWorkspaceSession } from './services/language/csharp-workspace-session'
import { CsharpOwnerLifecycle } from './services/language/csharp-owner-lifecycle'

let desktopApplication: DesktopApplication | undefined
let windowManager: WindowManager | undefined
let unsavedTransitionService: UnsavedTransitionService | undefined
let quitCoordinator: ApplicationQuitCoordinator | undefined
let removeLifecyclePublisher: (() => void) | undefined

void app.whenReady().then(async () => {
  const processManager = new ProcessManager()
  const persistenceService = createAppPersistence(join(app.getPath('userData'), 'app-state.json'))
  const settingsService = new SettingsService(persistenceService)
  const projectService = new ProjectService(
    undefined,
    process.platform,
    {
      getRecentProjects: () => persistenceService.getValue().recentProjects,
      updateRecentProjects: (recentProjects) => persistenceService.updateWith(current => ({ ...current, recentProjects })),
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
  // Lazy internal composition only: 5.5F supplies the future typed document entry.
  // Packaged provider provisioning remains Phase 7; absence fails closed.
  const csharpStore = new CsharpWorkspaceStore(join(app.getPath('userData'), 'workspaces'))
  const csharpCommands = new CsharpPreflightProcess()
  const csharpManager = createCsharpLanguageManager({ mode: app.isPackaged ? 'packaged' : 'development' }, processManager)
  const csharpSession = new CsharpWorkspaceSession(projectService, fileSystemService,
    new CsharpWorkspace(fileSystemService, csharpStore, csharpCommands), csharpManager, csharpCommands,
    () => console.error('C# synchronization or cleanup failed; owned resources remain tracked.'))
  const csharpOwners = new CsharpOwnerLifecycle(csharpSession,
    () => console.error('C# owner cleanup failed; owned resources remain tracked.'))
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
  const aiService = new OllamaService()
  const aiIpc = new AiIpcService(ipcRegistry, aiService, authorizePreferencesFrame,
    (ownerId, event) => {
      const owner = webContents.fromId(ownerId)
      if (owner && !owner.isDestroyed()) owner.send(AI_CHANNELS.event, event)
    })
  const nodeRuntime = new NodeRuntimeDetector()
  let runAdapter: WindowsPipedProcessAdapter | undefined
  const runSourceGuard = new RunSourceGuard(ipcRegistry, {
    authorizeReply: authorizePreferencesFrame,
    authorize: (session, ownerId) => {
      const owner = webContents.fromId(ownerId)
      if (!owner || owner.isDestroyed() || projectService.getActiveProject()?.id !== session.projectId
        || fileSystemService.getStatus(session.projectId).state !== 'AVAILABLE'
        || !['STARTING', 'RUNNING'].includes(runService.getSession(session.sessionId, ownerId).state)) {
        throw new DomainError({ code: 'PERMISSION_DENIED', retryable: false,
          message: 'The Run project or window is no longer available.' })
      }
      observeRunOwner(ownerId)
    },
    send: (ownerId, channel, request) => {
      const owner = webContents.fromId(ownerId)
      if (!owner || owner.isDestroyed()) throw new Error('Run owner unavailable')
      owner.send(channel, request)
    },
  })
  const csharpRunPreparation = CsharpRunPreparation.production(app.getPath('userData'),
    projectService, fileSystemService, processManager)
  const runIpcReference: { current?: RunIpcService } = {}
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
    resolveRuntime: context => {
      return context.strategyKind === 'javascript-file' ? nodeRuntime.resolve() : csharpRunPreparation.resolve(context)
    },
  }, [new JavaScriptRunStrategy(), new CSharpRunStrategy()], {
    // Delay loading until an authorized Run; unsupported hosts retain normal IDE startup.
    adapter: { create: (execution, observe) => {
      runAdapter ??= new WindowsPipedProcessAdapter()
      return runAdapter.create(execution, observe)
    } },
    manager: processManager,
    onEvent: (ownerId, event) => /\.csproj$/i.test(event.session.relativePath)
      ? runIpcReference.current?.publish(ownerId, event) : publishToRenderer(ownerId, RUN_CHANNELS.event, event),
    onPhase: (ownerId, session, phase) => runIpcReference.current?.publishPhase(ownerId, session, phase),
    onFinalized: (ownerId, session) => runIpcReference.current?.retireSession(ownerId, session),
    onEventSinkError: () => console.error('A Run event could not be delivered.'),
    sourceGuard: runSourceGuard,
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
    createWindow: (options) => {
      const window = new BrowserWindow(options)
      gitDocuments.observe(window.webContents)
      csharpOwners.observe(window.webContents)
      aiIpc.observe(window.webContents)
      return window
    },
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
      authorizeRecent: authorizePreferencesFrame,
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
  const gitLifecycle = new GitOperationLifecycle(projectService, fileSystemService, new GitOwnedCommandRunner())
  const gitDetector = new GitExecutableDetector()
  const settingsIpc = new SettingsIpcService(ipcRegistry, settingsService, authorizePreferencesFrame, async () => {
    const node = await nodeRuntime.detect()
    let git: 'AVAILABLE' | 'MISSING' | 'INVALID_CONFIGURATION'
    try { git = (await gitDetector.detect()).state } catch { git = 'INVALID_CONFIGURATION' }
    return { node: node.state, git }
  })
  const gitService = new GitService(
    projectService,
    fileSystemService,
    gitDetector,
    gitLifecycle.commands,
  )
  const gitDocuments = new GitDocumentOwners(gitLifecycle)
  const gitIpc = new GitLifecycleIpcService(ipcRegistry, gitService, gitLifecycle,
    (context) => gitDocuments.assertCurrent(context))
  const searchIpc = new SearchIpcService(
    ipcRegistry,
    searchService,
    (ownerId, event) => publishToRenderer(
      ownerId,
      SEARCH_CHANNELS.event,
      event,
    ),
    (ownerId, event) => publishToRenderer(ownerId, SEARCH_CHANNELS.namesEvent, event),
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
  const observeRunOwner = (ownerId: number) => {
    if (runOwners.has(ownerId)) return
    const owner = webContents.fromId(ownerId)
    if (!owner || owner.isDestroyed()) throw new DomainError({ code: 'PERMISSION_DENIED',
      message: 'The Run window is no longer available.', retryable: false })
    const cleanup = () => {
      runSourceGuard.invalidateOwner(ownerId)
      void Promise.all([runService.stopOwner(ownerId), runIpcReference.current?.invalidateOwner(ownerId)]).catch(() => {
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
      owner.removeListener('render-process-gone', cleanup)
      runOwners.delete(ownerId)
    }
    owner.on('did-start-navigation', navigation)
    owner.once('destroyed', destroyed)
    owner.on('render-process-gone', cleanup)
    runOwners.set(ownerId, remove)
  }
  const targetRequests = new CsharpRunTargetRequests(processManager, probeOwner => {
    const probe = new CsharpRunProbe(processManager, probeOwner)
    const evaluator = new CsharpRunPreflight(fileSystemService, new DotnetRunRuntimeResolver(probe), probe)
    const resolver = new CsharpRunTargetResolver(projectService, fileSystemService, evaluator)
    const store = new CsharpRunTargetStore(app.getPath('userData'), projectService, fileSystemService, resolver)
    return { store, close: async () => { try { await store.stop() } finally { await probe.stop() } } }
  }, { projects: projectService, files: fileSystemService,
    onCleanupError: () => console.error('Run target cleanup remains pending.') })
  const runIpc = new RunIpcService(ipcRegistry, runService, observeRunOwner, {
    targets: targetRequests,
    authorize: (context, projectId) => {
      authorizePreferencesFrame(context)
      if (!projectId) return undefined
      if (targetRequests.isTransitioning || fileSystemService.getStatus(projectId).state !== 'AVAILABLE') throw new DomainError({
        code: 'PERMISSION_DENIED', message: 'The Run project is unavailable.', retryable: false })
      return projectService.getAuthorizedProject(projectId)
    },
    start: (request, ownerId) => runService.startPlannedRun(request, ownerId),
    publish: (ownerId, event) => {
      if (projectService.getActiveProject()?.id === event.session.projectId) publishToRenderer(ownerId, RUN_PROJECT_CHANNELS.event, event)
    },
  })
  runIpcReference.current = runIpc

  desktopApplication = new DesktopApplication([
    persistenceService,
    processManager,
    projectService,
    fileSystemService,
    searchService,
    terminalService,
    foundationIpc,
    settingsIpc,
    aiService,
    aiIpc,
    unsavedTransitionService,
    runSourceGuard,
    // Starts after the unsaved guard; stops before it and all Run dependencies.
    runLifecycle,
    targetRequests,
    { name: 'CsharpWorkspaceStore', stop: () => csharpStore.stop() },
    csharpSession,
    csharpOwners,
    new LanguageIpcService(ipcRegistry, new CsharpSemanticService(projectService, fileSystemService,
      csharpSession, csharpManager, csharpOwners, (senderId, projectId, status) => {
        const window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.id === senderId)
        window?.webContents.send(LANGUAGE_CHANNELS.status, { projectId, status })
      })),
    gitLifecycle,
    gitDocuments,
    { name: 'RunOwnerSubscriptions', stop: () => {
      for (const remove of [...runOwners.values()]) remove()
    } },
    runIpc,
    projectIpc,
    fileIpc,
    gitIpc,
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
    if (status.state === 'STOPPING') { runService.beginShutdown(); gitLifecycle.beginShutdown(); csharpSession.beginShutdown() }
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
  event: SearchEvent | NamesSearchEvent | RunEvent | ProjectRunEvent,
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

function authorizePreferencesFrame(context: IpcRequestContext): void {
  const owner = webContents.fromId(context.senderId)
  const frame = context.senderFrame
  if (!owner || owner.isDestroyed() || !frame || frame.detached || frame.isDestroyed()
    || owner.mainFrame.frameToken !== frame.frameToken || owner.mainFrame.processId !== frame.processId) {
    throw new DomainError({
      code: 'PERMISSION_DENIED',
      message: 'The application window is no longer available.',
      retryable: false,
    })
  }
}
