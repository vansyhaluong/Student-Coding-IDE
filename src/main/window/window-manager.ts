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
  onCloseRequestError?(error: unknown): void
}

export class WindowManager implements ManagedService {
  readonly name = 'WindowManager'
  private mainWindow: BrowserWindowLike | undefined
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

    if (this.options.developmentRendererUrl) {
      await mainWindow.loadURL(this.options.developmentRendererUrl)
    } else {
      await mainWindow.loadFile(this.options.rendererFile)
    }
  }

  stop(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy()
    }
    this.mainWindow = undefined
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
      if (this.closeApproved || !this.options.requestClose) return
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
