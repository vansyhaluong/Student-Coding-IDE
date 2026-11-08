import type { BrowserWindowConstructorOptions } from 'electron'
import { pathToFileURL } from 'node:url'

import type { ManagedService } from '../app/desktop-application'

interface PreventableEvent {
  preventDefault(): void
}

interface WindowOpenDetails {
  url: string
}

interface WindowOpenResult {
  action: 'deny'
}

export interface WebContentsLike {
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): void
  removeListener(event: 'destroyed', listener: () => void): void
  on(
    event: 'will-navigate',
    listener: (event: PreventableEvent, url: string) => void,
  ): void
  setWindowOpenHandler(
    handler: (details: WindowOpenDetails) => WindowOpenResult,
  ): void
}

export interface BrowserWindowLike {
  readonly webContents: WebContentsLike
  loadURL(url: string): Promise<void>
  loadFile(path: string): Promise<void>
  destroy(): void
  close(): void
  isDestroyed(): boolean
  on(event: 'close', listener: (event: PreventableEvent) => void): void
}

export interface WindowManagerOptions {
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindowLike
  openExternal(url: string): Promise<void>
  preloadPath: string
  rendererFile: string
  developmentRendererUrl?: string
  onExternalOpenError?(error: unknown): void
  requestClose?(): Promise<boolean>
  isApplicationQuitAuthorized?(): boolean
  onCloseRequestError?(error: unknown): void
}

export class WindowManager implements ManagedService {
  readonly name = 'WindowManager'
  private mainWindow: BrowserWindowLike | undefined
  private mainContents: WebContentsLike | undefined
  private stopping: Promise<void> | undefined
  private closeApproved = false
  private closeRequestPending = false

  constructor(private readonly options: WindowManagerOptions) {}

  async start(): Promise<void> {
    await this.ensureMainWindow()
  }

  async ensureMainWindow(): Promise<void> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return
    }

    const mainWindow = this.options.createWindow(createSecureWindowOptions(
      this.options.preloadPath,
    ))
    this.closeApproved = false
    this.closeRequestPending = false
    this.configureNavigation(mainWindow)
    this.configureClose(mainWindow)
    this.mainWindow = mainWindow
    this.mainContents = mainWindow.webContents

    if (this.options.developmentRendererUrl) {
      await mainWindow.loadURL(this.options.developmentRendererUrl)
    } else {
      await mainWindow.loadFile(this.options.rendererFile)
    }
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    const window = this.mainWindow, contents = this.mainContents
    if (!window || !contents) return Promise.resolve()
    const task = (async () => {
      // BrowserWindow.destroy()/closed can precede WebContents destruction.
      // Keep Node/IPC alive until the renderer endpoint actually releases it.
      if (contents.isDestroyed()) {
        if (!window.isDestroyed()) window.destroy()
      } else {
        let destroyed!: () => void
        const finished = new Promise<void>(resolve => { destroyed = resolve })
        contents.once('destroyed', destroyed)
        try {
          if (!window.isDestroyed()) window.destroy()
          await finished
        } finally { contents.removeListener('destroyed', destroyed) }
      }
      if (this.mainWindow === window) { this.mainWindow = undefined; this.mainContents = undefined }
    })()
    this.stopping = task
    const clear = () => { if (this.stopping === task) this.stopping = undefined }
    void task.then(clear, clear)
    return task
  }

  private configureNavigation(window: BrowserWindowLike): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
      this.openApprovedExternalUrl(url)
      return { action: 'deny' }
    })

    window.webContents.on('will-navigate', (event, url) => {
      if (isAllowedApplicationNavigation(url, {
        developmentRendererUrl: this.options.developmentRendererUrl,
        rendererFile: this.options.rendererFile,
      })) {
        return
      }

      event.preventDefault()
      this.openApprovedExternalUrl(url)
    })
  }

  private configureClose(window: BrowserWindowLike): void {
    window.on('close', (event) => {
      if (
        this.closeApproved
        || this.options.isApplicationQuitAuthorized?.()
        || !this.options.requestClose
      ) return
      event.preventDefault()
      if (this.closeRequestPending) return
      this.closeRequestPending = true
      void this.options.requestClose().then((approved) => {
        this.closeRequestPending = false
        if (!approved || window.isDestroyed() || this.mainWindow !== window) return
        this.closeApproved = true
        window.close()
      }).catch((error: unknown) => {
        this.closeRequestPending = false
        this.options.onCloseRequestError?.(error)
      })
    })
  }

  private openApprovedExternalUrl(url: string): void {
    if (!isAllowedExternalUrl(url)) {
      return
    }

    void this.options.openExternal(url).catch((error: unknown) => {
      this.options.onExternalOpenError?.(error)
    })
  }
}

export function createSecureWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#171717',
      symbolColor: '#b8b8bc',
      height: 36,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isAllowedApplicationNavigation(
  value: string,
  policy: Pick<
    WindowManagerOptions,
    'developmentRendererUrl' | 'rendererFile'
  >,
): boolean {
  try {
    const candidate = new URL(value)
    if (policy.developmentRendererUrl) {
      return candidate.origin === new URL(policy.developmentRendererUrl).origin
    }

    const rendererUrl = pathToFileURL(policy.rendererFile)
    return candidate.protocol === 'file:'
      && candidate.pathname === rendererUrl.pathname
      && candidate.search === rendererUrl.search
  } catch {
    return false
  }
}
