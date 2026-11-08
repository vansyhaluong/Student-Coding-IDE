import { OllamaService } from './services/ai/ollama-service'
import { getBundledCourse } from './services/learning/content/course'
import { LearningIpcService } from './ipc/learning-ipc-service'
import { PracticeIpcService } from './ipc/practice-ipc-service'
import { createPracticeStore } from './services/learning/practice-store'
import { ExercisePackageRegistry } from './services/learning/content/exercise-package-registry'
import { openBundledExerciseResources } from './services/learning/content/exercise-package-resources-runtime'
import { createWindowsExerciseService } from './services/learning/exercise-service'
import { LearningStore } from './services/learning/learning-store'
import { SubmissionStoreFiles } from './services/learning/storage/store-files'
import { SharedSubmissionStoreLease } from './services/learning/storage/store-lease'
import { loadLearningNative, type LearningNativeBinding } from './services/learning/runtime/windows-exercise-native'
import { SUBMISSION_CHANNELS } from '../shared/contracts/submission'
import { ExerciseIpcService } from './ipc/exercise-ipc-service'
import { SubmissionAnalysisService } from './services/learning/analysis/service'
import { captureSavedAnalysis } from './services/learning/analysis/capture'
import { SmartHintsConfiguration } from './services/learning/smart-hints/configuration'
import { MainSelectionFixGuard } from './services/learning/smart-hints/selection-fix-parser-runtime'
import { NativeSmartHintsKeyEntry } from './services/learning/smart-hints/native-key'
import { SmartHintsSettingsIpcService } from './ipc/smart-hints-settings-ipc-service'
import { captureSmartHints } from './services/learning/smart-hints/capture'
import { LearningChatIpcService } from './ipc/learning-chat-ipc-service'
import { EXERCISE_CHANNELS } from '../shared/contracts/exercise'
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
  safeStorage,
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
  // Normal feature uses only the user's native Settings entry, never a developer environment key.
  delete process.env.GEMINI_API_KEY
  const keyEntry = new NativeSmartHintsKeyEntry()
  const smartHintsConfiguration = new SmartHintsConfiguration({
    selectionFixGuard: new MainSelectionFixGuard(),
    file: join(app.getPath('userData'), 'smart-hints-settings.json'),
    encryption: {
      available: () => process.platform === 'win32' ? safeStorage.isAsyncEncryptionAvailable() : Promise.resolve(false),
      encrypt: value => safeStorage.encryptStringAsync(value),
      decrypt: async value => (await safeStorage.decryptStringAsync(value)).result,
    },
    transport: { send: request => fetch(request) },
    onDiagnostic: diagnostic => console.info('[SmartHints execution]', JSON.stringify(diagnostic)),
    onDiagnosticStoreError: () => console.warn('Smart Hints diagnostic could not be saved.'),
    promptKey: async () => { throw Error('Owned Settings key request required.') }, cancelPrompt: () => keyEntry.cancel(),
    confirm: async (kind, count) => {
      const options = { type: 'question' as const, buttons: ['Hủy', 'Xác nhận'], defaultId: 0, cancelId: 0, noLink: true,
        title: 'AI Smart Hints · Google Gemini',
        message: kind === 'ENABLE' ? 'Bật AI Smart Hints?' : kind === 'BUDGET' ? `Đặt hạn mức cục bộ ${count} yêu cầu AI mỗi ngày UTC?` : 'Xóa API Key đã lưu?',
        detail: kind === 'REMOVE_KEY' ? 'AI sẽ tắt. Số lượt đã dùng được giữ nguyên.'
          : `Model gemini-3.1-flash-lite. Có thể phát sinh phí theo project của bạn; ứng dụng không xác minh Free Tier hoặc bật billing. Nội dung có thể được Google xử lý/lưu theo chính sách tài khoản. Chỉ chia sẻ code bạn có quyền gửi, không chứa secrets. Còn/được phép ${count} yêu cầu. Mỗi lần gửi source vẫn cần bạn xác nhận snapshot. Không tự retry, đổi model, Apply, Run hoặc Submit.` }
      const owner = BrowserWindow.getFocusedWindow()
      return (await (owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options))).response === 1
    },
  })
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
  const practiceStore = createPracticeStore(join(app.getPath('userData'), 'learning', 'drafts.json'))
  const exercisePackages = new ExercisePackageRegistry((scope, control) => openBundledExerciseResources({
    packaged: app.isPackaged, resourcesPath: process.resourcesPath,
  }, scope, control))
  const exerciseIpcReference: { current?: ExerciseIpcService } = {}
  let submissionFiles: SubmissionStoreFiles | undefined, submissionLease: SharedSubmissionStoreLease | undefined
  let submissionStore: LearningStore | undefined, submissionNative: LearningNativeBinding | undefined
  const submissionBinding = () => submissionNative ??= loadLearningNative()
  // Managed dependency only, not a second operation/lifecycle coordinator.
  const submissionStorage = {
    name: 'LearningSubmissionStorage',
    async start() {
      try {
        submissionFiles = await SubmissionStoreFiles.open(join(app.getPath('userData'), 'learning'))
        submissionLease = new SharedSubmissionStoreLease(submissionFiles, { capability: 'student-ide-learning-job-v1',
          acquireLease: path => submissionBinding().acquireLease(path), observation: (handle, operation) => submissionBinding().observation(handle, operation) })
        submissionStore = new LearningStore({ files: submissionFiles, lease: submissionLease })
      } catch {
        // Storage unavailability must not silently fabricate save or disable sample Run.
        console.error('Learning submission storage is unavailable; eligible submissions cannot be saved.')
      }
    },
    async stop() {
      await submissionStore?.settleReads()
      await submissionFiles?.retryClose()
      await submissionLease?.retryRelease()
    },
  }
  const getSubmissionStore = () => {
    if (!submissionStore) throw new DomainError({ code: 'PROCESS_FAILED', operation: 'learning:submission-storage',
      message: 'Learning submission storage is unavailable.', retryable: true })
    return submissionStore
  }
  const exerciseService = createWindowsExerciseService(join(app.getPath('userData'), 'learning', 'exercise-runtime'), {
    packages: exercisePackages,
    submissions: { store: getSubmissionStore, ownsLease: () => submissionLease?.ownsLease === true },
    onCleanupError: () => console.error('Learning cleanup/recovery failed; ownership remains tracked for retry.'),
    onSnapshot: (owner, snapshot) => exerciseIpcReference.current?.publish(owner, snapshot),
  })
  const exerciseIpc = new ExerciseIpcService(ipcRegistry, exerciseService, authorizePreferencesFrame,
    (context, snapshot) => {
      authorizePreferencesFrame(context)
      webContents.fromId(context.senderId)?.mainFrame.send(EXERCISE_CHANNELS.changed, snapshot)
    }, { store: getSubmissionStore, send: (context, status) => {
      authorizePreferencesFrame(context)
      webContents.fromId(context.senderId)?.mainFrame.send(SUBMISSION_CHANNELS.changed, status)
    } }, { service: new SubmissionAnalysisService(), // Fail closed: D4 provisioning is not authorized.
      capture: (binding, check) => captureSavedAnalysis(getSubmissionStore(), exercisePackages, binding, check) },
    { service: smartHintsConfiguration.service,
      capture: (request, generation, check, receipt) => captureSmartHints(exercisePackages, request, generation, check, receipt) },
    owner => chatIpc.invalidateOwner(owner))
  const chatIpc = new LearningChatIpcService(ipcRegistry, smartHintsConfiguration.chat, authorizePreferencesFrame, context => {
    if (context.kind === 'PRACTICE') {
      if (exercisePackages.status().state !== 'AVAILABLE' || !exercisePackages.has(context.exerciseId)
        || exercisePackages.readiness(context.exerciseId).phase === 'UNAVAILABLE') throw new DomainError({ code: 'INVALID_INPUT',
        operation: 'learning-chat', message: 'Learning exercise is unavailable.', retryable: false })
    } else {
      const course = getBundledCourse().manifest
      if (context.courseId !== course.courseId || !course.chapters.some(c => c.order === context.chapter)) throw new DomainError({
        code: 'INVALID_INPUT', operation: 'learning-chat', message: 'Learning chapter is unavailable.', retryable: false })
    }
  })
  exerciseIpcReference.current = exerciseIpc
  const practiceIpc = new PracticeIpcService(ipcRegistry, practiceStore, authorizePreferencesFrame,
    (owner, channel, payload) => {
      const target = webContents.fromId(owner)
      if (target && !target.isDestroyed()) target.send(channel, payload)
    }, exercisePackages)
  const aiService = new OllamaService()
  const aiIpc = new AiIpcService(ipcRegistry, aiService, authorizePreferencesFrame,
    (ownerId, event) => {
      const owner = webContents.fromId(ownerId)
      if (owner && !owner.isDestroyed()) owner.send(AI_CHANNELS.event, event)
    })
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
    createWindow: (options) => {
      const window = new BrowserWindow(options)
      gitDocuments.observe(window.webContents)
      csharpOwners.observe(window.webContents)
      aiIpc.observe(window.webContents)
      exerciseService.observe(window.webContents)
      exerciseIpc.observe(window.webContents)
      chatIpc.observe(window.webContents)
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
  const smartHintsSettingsIpc = new SmartHintsSettingsIpcService(ipcRegistry, smartHintsConfiguration, authorizePreferencesFrame,
    (context, cancel) => {
      const owner = webContents.fromId(context.senderId)
      if (!owner || owner.isDestroyed()) throw Error('Settings owner unavailable.')
      owner.once('destroyed', cancel); owner.on('did-start-navigation', cancel)
      return () => { owner.removeListener('destroyed', cancel); owner.removeListener('did-start-navigation', cancel) }
    }, async (context, signal) => {
      authorizePreferencesFrame(context)
      const owner = BrowserWindow.fromWebContents(webContents.fromId(context.senderId)!)
      if (!owner || owner.isDestroyed()) throw Error('Settings owner unavailable.')
      return keyEntry.prompt(owner.getNativeWindowHandle(), signal)
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
    practiceStore,
    processManager,
    projectService,
    fileSystemService,
    searchService,
    terminalService,
    foundationIpc,
    settingsIpc,
    smartHintsConfiguration,
    smartHintsSettingsIpc,
    aiService,
    aiIpc,
    new LearningIpcService(ipcRegistry, getBundledCourse, authorizePreferencesFrame),
    exercisePackages,
    practiceIpc,
    unsavedTransitionService,
    // Starts after the unsaved guard; stops before it and all Run dependencies.
    runLifecycle,
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
    // Additive Learning barrier; relative order of every existing service stays intact.
    submissionStorage,
    exerciseService,
    exerciseIpc,
    chatIpc,
    windowManager,
  ], {
    // Business cleanup (including configuration's Chat drain) precedes the
    // recovery window. Keep sealed Chat handlers until that window is destroyed
    // so an already-sent teardown request receives a structured denial.
    // The final pass reverses service order: windowManager, then chatIpc.
    shutdownLast: [windowManager, chatIpc],
  })

  removeLifecyclePublisher = desktopApplication.subscribe((status) => {
    // Block starts/events at STOPPING; cleanup stays in managed-service order.
    if (status.state === 'STOPPING') {
      runService.beginShutdown(); gitLifecycle.beginShutdown(); csharpSession.beginShutdown()
      exerciseService.beginShutdown()
      practiceIpc.beginShutdown()
      exercisePackages.beginShutdown()
      exerciseIpc.beginShutdown()
      chatIpc.beginShutdown()
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(LIFECYCLE_CHANNELS.statusChanged, status)
      }
    }
  })

  quitCoordinator = new ApplicationQuitCoordinator({
    getApplication: () => desktopApplication,
    requestApproval: async () => {
      const owner = BrowserWindow.getAllWindows().find(window => !window.isDestroyed())?.webContents.id
      if (owner === undefined) return false
      if (!await practiceIpc.prepareClose(owner)) {
        await dialog.showMessageBox({ type: 'error', title: 'Code Draft chưa được lưu',
          message: 'Chưa thể lưu hoặc xác nhận Code Draft. Ứng dụng vẫn mở để bạn kiểm tra và thử lại.', buttons: ['Tiếp tục chỉnh sửa'] })
        return false
      }
      const approved = await (unsavedTransitionService?.requestApplicationClose() ?? Promise.resolve(false))
      if (!approved) practiceIpc.resume(owner)
      return approved
    },
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
  event: SearchEvent | NamesSearchEvent | RunEvent,
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
