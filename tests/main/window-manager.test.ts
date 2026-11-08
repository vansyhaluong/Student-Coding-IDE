import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import {
  createSecureWindowOptions,
  isAllowedApplicationNavigation,
  isAllowedExternalUrl,
  WindowManager,
  type BrowserWindowLike,
  type WebContentsLike,
} from '../../src/main/window/window-manager'

class FakeWebContents implements WebContentsLike {
  destroyed = false
  readonly destroyedListeners = new Set<() => void>()
  isDestroyed() { return this.destroyed }
  once(_event: 'destroyed', listener: () => void) { this.destroyedListeners.add(listener) }
  removeListener(_event: 'destroyed', listener: () => void) { this.destroyedListeners.delete(listener) }
  finishDestroy() {
    this.destroyed = true
    const listeners = [...this.destroyedListeners]; this.destroyedListeners.clear()
    for (const listener of listeners) listener()
  }
  navigationHandler:
    | ((event: { preventDefault(): void }, url: string) => void)
    | undefined
  windowOpenHandler:
    | ((details: { url: string }) => { action: 'deny' })
    | undefined

  on(
    _event: 'will-navigate',
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): void {
    this.navigationHandler = listener
  }

  setWindowOpenHandler(
    handler: (details: { url: string }) => { action: 'deny' },
  ): void {
    this.windowOpenHandler = handler
  }
}

class FakeWindow implements BrowserWindowLike {
  readonly webContents = new FakeWebContents()
  readonly loadURL = vi.fn(async () => undefined)
  readonly loadFile = vi.fn(async () => undefined)
  readonly destroy = vi.fn(() => { this.isDestroyed.mockReturnValue(true); this.webContents.finishDestroy() })
  readonly close = vi.fn()
  readonly isDestroyed = vi.fn(() => false)
  closeListener: ((event: { preventDefault(): void }) => void) | undefined
  readonly on = vi.fn((
    event: 'close',
    listener: (event: { preventDefault(): void }) => void,
  ) => {
    void event
    this.closeListener = listener
  })
}

describe('WindowManager security', () => {
  const lifecycleFixture = async () => {
    const window = new FakeWindow(), manager = new WindowManager({ createWindow: () => window,
      openExternal: async () => {}, preloadPath: 'preload.js', rendererFile: 'index.html' })
    await manager.start(); return { window, manager }
  }
  it('awaits delayed WebContents destruction and shares concurrent stop ownership', async () => {
    const { window, manager } = await lifecycleFixture()
    window.destroy.mockImplementation(() => { window.isDestroyed.mockReturnValue(true) })
    let stopped = false
    const pending = manager.stop(); void pending.then(() => { stopped = true })
    expect(manager.stop()).toBe(pending)
    await Promise.resolve()
    expect(stopped).toBe(false); expect(window.isDestroyed()).toBe(true)
    expect(window.webContents.destroyedListeners.size).toBe(1)
    window.webContents.finishDestroy(); await pending
    expect(stopped).toBe(true); expect(window.webContents.destroyedListeners.size).toBe(0)
    await manager.stop(); expect(window.destroy).toHaveBeenCalledOnce()
  })
  it('joins a WebContents teardown already started by a closed window', async () => {
    const { window, manager } = await lifecycleFixture()
    window.isDestroyed.mockReturnValue(true)
    let stopped = false; const pending = manager.stop().then(() => { stopped = true })
    await Promise.resolve(); expect(stopped).toBe(false); expect(window.destroy).not.toHaveBeenCalled()
    window.webContents.finishDestroy(); await pending
    expect(window.webContents.destroyedListeners.size).toBe(0)
  })
  it('propagates destroy failure, removes the listener and retains cleanup for retry', async () => {
    const { window, manager } = await lifecycleFixture()
    window.destroy.mockImplementationOnce(() => { throw Error('CONTROLLED_DESTROY_FAILURE') })
    await expect(manager.stop()).rejects.toThrow('CONTROLLED_DESTROY_FAILURE')
    expect(window.webContents.destroyedListeners.size).toBe(0)
    await manager.stop(); expect(window.destroy).toHaveBeenCalledTimes(2)
    expect(window.webContents.isDestroyed()).toBe(true)
  })
  it('still destroys the window when its WebContents was already destroyed', async () => {
    const { window, manager } = await lifecycleFixture()
    window.webContents.finishDestroy(); await manager.stop()
    expect(window.destroy).toHaveBeenCalledOnce(); expect(window.webContents.destroyedListeners.size).toBe(0)
  })
  it('does not swallow a destroy exception after the destroyed event fired', async () => {
    const { window, manager } = await lifecycleFixture()
    window.destroy.mockImplementationOnce(() => {
      window.isDestroyed.mockReturnValue(true); window.webContents.finishDestroy()
      throw Error('CONTROLLED_AFTER_DESTROY_FAILURE')
    })
    await expect(manager.stop()).rejects.toThrow('CONTROLLED_AFTER_DESTROY_FAILURE')
    expect(window.webContents.destroyedListeners.size).toBe(0)
    await manager.stop(); expect(window.destroy).toHaveBeenCalledOnce()
  })
  it('preserves the required BrowserWindow security flags', () => {
    const options = createSecureWindowOptions('preload.js')
    expect(options.webPreferences).toMatchObject({
      preload: 'preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
    expect(options).toMatchObject({
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: 36 },
    })
  })

  it('fails window close closed until asynchronous unsaved coordination approves', async () => {
    const window = new FakeWindow()
    const requestClose = vi.fn(async () => true)
    const manager = new WindowManager({
      createWindow: () => window,
      openExternal: async () => undefined,
      preloadPath: 'preload.js',
      rendererFile: 'index.html',
      requestClose,
    })
    await manager.start()
    const preventDefault = vi.fn()

    window.closeListener?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.close).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce())
    expect(requestClose).toHaveBeenCalledOnce()
  })

  it('allows Electron final quit to close the window without reopening coordination', async () => {
    const window = new FakeWindow()
    const requestClose = vi.fn(async () => false)
    const manager = new WindowManager({
      createWindow: () => window,
      openExternal: async () => undefined,
      preloadPath: 'preload.js',
      rendererFile: 'index.html',
      requestClose,
      isApplicationQuitAuthorized: () => true,
    })
    await manager.start()
    const preventDefault = vi.fn()

    window.closeListener?.({ preventDefault })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(requestClose).not.toHaveBeenCalled()
  })

  it.each([
    ['https://example.com/docs', true],
    ['http://example.com', false],
    ['mailto:student@example.com', false],
    ['file:///C:/secret.txt', false],
    ['student-ide://settings', false],
    ['not a url', false],
  ])('validates external URL %s', (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected)
  })

  it('allows only the exact development application origin', () => {
    const policy = {
      developmentRendererUrl: 'http://localhost:5173/index.html',
      rendererFile: 'D:\\app\\renderer\\index.html',
    }
    expect(isAllowedApplicationNavigation(
      'http://localhost:5173/another-route',
      policy,
    )).toBe(true)
    expect(isAllowedApplicationNavigation(
      'http://localhost:5174/',
      policy,
    )).toBe(false)
    expect(isAllowedApplicationNavigation(
      'https://localhost:5173/',
      policy,
    )).toBe(false)
  })

  it('restricts packaged navigation to the packaged renderer file', () => {
    const rendererDirectory = resolve('test-fixtures', 'renderer')
    const rendererFile = join(rendererDirectory, 'index.html')
    const policy = { rendererFile }
    const rendererUrl = pathToFileURL(rendererFile).href
    const otherRendererUrl = pathToFileURL(
      join(rendererDirectory, 'other.html'),
    ).href
    const arbitraryFileUrl = pathToFileURL(
      resolve('test-fixtures', 'outside', 'secret.html'),
    ).href

    expect(isAllowedApplicationNavigation(rendererUrl, policy)).toBe(true)
    expect(isAllowedApplicationNavigation(otherRendererUrl, policy)).toBe(false)
    expect(isAllowedApplicationNavigation(arbitraryFileUrl, policy))
      .toBe(false)
  })

  it('denies new windows and opens only approved HTTPS URLs externally', async () => {
    const window = new FakeWindow()
    const openExternal = vi.fn(async () => undefined)
    const manager = new WindowManager({
      createWindow: () => window,
      openExternal,
      preloadPath: 'preload.js',
      rendererFile: 'D:\\app\\renderer\\index.html',
      developmentRendererUrl: 'http://localhost:5173/',
    })
    await manager.start()

    expect(window.webContents.windowOpenHandler?.({
      url: 'https://example.com',
    })).toEqual({ action: 'deny' })
    window.webContents.windowOpenHandler?.({ url: 'http://example.com' })
    await Promise.resolve()

    expect(openExternal).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('blocks in-window navigation away from the application origin', async () => {
    const window = new FakeWindow()
    const manager = new WindowManager({
      createWindow: () => window,
      openExternal: vi.fn(async () => undefined),
      preloadPath: 'preload.js',
      rendererFile: 'D:\\app\\renderer\\index.html',
      developmentRendererUrl: 'http://localhost:5173/',
    })
    await manager.start()
    const preventDefault = vi.fn()

    window.webContents.navigationHandler?.(
      { preventDefault },
      'http://localhost:5173/editor',
    )
    expect(preventDefault).not.toHaveBeenCalled()

    window.webContents.navigationHandler?.(
      { preventDefault },
      'http://example.com',
    )
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})
