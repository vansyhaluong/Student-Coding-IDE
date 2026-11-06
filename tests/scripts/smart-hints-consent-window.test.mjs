import { afterEach, expect, it, vi } from 'vitest'
import { showRunnerConsent } from '../../scripts/sh4-consent-window'
const { windows } = vi.hoisted(() => ({ windows: [] }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { BrowserWindow: class extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.visible = false; this.focused = false
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = vi.fn()
      this.webContents.session = { webRequest: { onBeforeRequest: vi.fn() } }
      this.loadURL = vi.fn(async url => { this.url = url })
      windows.push(this)
    }
    center() {} show() { this.visible = true } restore() {} moveTop() {} focus() { this.focused = true }
    flashFrame() {} isFocused() { return this.focused } isVisible() { return this.visible }
    isMinimized() { return false } isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.emit('closed') }
  } }
})
afterEach(() => { windows.splice(0) })
function fixture(patch = {}) {
  const controller = new globalThis.AbortController(), onShown = vi.fn(async () => {})
  const task = showRunnerConsent({ stage: 'PREFLIGHT', details: '<script>private</script>', offline: true,
    signal: controller.signal, onShown, ...patch })
  const window = windows.at(-1)
  const html = decodeURIComponent(window.url.split(',').slice(1).join(','))
  return { controller, task, window, html, onShown }
}
function navigate(window, url) {
  const event = { preventDefault: vi.fn() }
  window.webContents.emit('will-navigate', event, url)
  expect(event.preventDefault).toHaveBeenCalledOnce()
}
it('shows a taskbar window with safe defaults and never approves on load/focus', async () => {
  const f = fixture(); let settled = false
  void f.task.then(() => { settled = true })
  expect(f.window.visible).toBe(false)
  f.window.emit('ready-to-show'); await Promise.resolve()
  expect(f.window.options).toMatchObject({ show: false, skipTaskbar: false, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: false } })
  expect(f.window.options.webPreferences.preload).toBeUndefined()
  expect(f.onShown).toHaveBeenCalledWith(expect.objectContaining({ visible: true, focused: true, minimized: false }))
  expect(f.html).toContain('&lt;script&gt;private&lt;/script&gt;')
  expect(f.html).toContain('button autofocus type="submit">Cancel')
  expect(f.html).toContain('OFFLINE TEST'); expect(settled).toBe(false)
  f.controller.abort(); expect(await f.task).toBe(false)
})
it('only an exact local Confirm decision can approve; all navigation/network is blocked', async () => {
  const f = fixture(), confirm = f.html.match(/action="([^"]+\/confirm)"/)[1]
  navigate(f.window, confirm) // Before ready-to-show is not an approval.
  f.window.emit('ready-to-show')
  for (const url of ['https://example.com/', confirm + '?unexpected=1', confirm.replace('/confirm', '/other'), confirm.replace('https:', 'http:')]) navigate(f.window, url)
  const callback = vi.fn(), requestBlock = f.window.webContents.session.webRequest.onBeforeRequest.mock.calls[0][1]
  requestBlock({}, callback); expect(callback).toHaveBeenCalledWith({ cancel: true })
  expect(f.window.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
  navigate(f.window, confirm)
  expect(await f.task).toBe(true); expect(f.window.destroyed).toBe(true)
})
it.each(['cancel', 'close', 'abort'])('%s destroys the consent window and denies approval', async action => {
  const f = fixture(); f.window.emit('ready-to-show')
  if (action === 'cancel') navigate(f.window, f.html.match(/action="([^"]+\/cancel)"/)[1])
  if (action === 'close') f.window.emit('closed')
  if (action === 'abort') f.controller.abort()
  expect(await f.task).toBe(false)
  expect(f.window.destroyed).toBe(true)
})
it('ignores a late confirmation after abort', async () => {
  const f = fixture(); f.window.emit('ready-to-show'); f.controller.abort()
  navigate(f.window, f.html.match(/action="([^"]+\/confirm)"/)[1])
  expect(await f.task).toBe(false)
})
it('aborted consent creates no window', async () => {
  const controller = new globalThis.AbortController(); controller.abort()
  expect(await showRunnerConsent({ stage: 'PREFLIGHT', details: '', offline: true, signal: controller.signal })).toBe(false)
  expect(windows).toHaveLength(0)
})
it('renderer failure rejects safely and destroys its window', async () => {
  const f = fixture(), assertion = expect(f.task).rejects.toThrow('CONSENT_WINDOW_FAILED')
  f.window.webContents.emit('render-process-gone')
  await assertion; expect(f.window.destroyed).toBe(true)
})
it('does not authorize dispatch when shown evidence cannot persist', async () => {
  const f = fixture({ onShown: async () => { throw Error('PRIVATE') } })
  const assertion = expect(f.task).rejects.toThrow('CONSENT_EVIDENCE_FAILED')
  f.window.emit('ready-to-show'); await assertion
  expect(f.window.destroyed).toBe(true)
})
