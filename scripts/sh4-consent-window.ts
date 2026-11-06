import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'

export interface ConsentWindowState {
  stage: 'PREFLIGHT' | 'SNAPSHOT'; visible: boolean; focused: boolean; minimized: boolean
  taskbar: true; parentedNativeDialog: false
}
interface Options {
  provider?: 'GEMINI'
  stage: 'PREFLIGHT' | 'SNAPSHOT'; details: string; offline: boolean; signal: AbortSignal
  onShown?(state: ConsentWindowState): Promise<void>
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** Standalone manual-runner UI. No preload, Node access, public IPC or external page. */
export function showRunnerConsent(options: Options): Promise<boolean> {
  if (options.signal.aborted) return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    const token = randomUUID(), origin = 'https://sh4-consent.invalid'
    const title = `SH-4 ${options.offline ? 'OFFLINE' : 'LIVE'} — ${options.stage} consent`
    const window = new BrowserWindow({ width: 780, height: 680, minWidth: 540, minHeight: 460,
      title,
      show: false, skipTaskbar: false, autoHideMenuBar: true, backgroundColor: '#f4f5f7',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
        devTools: false, partition: `sh4-consent-${token}` } })
    let settled = false, shown = false, shownTask = Promise.resolve()
    const finish = async (approved: boolean, failed = false) => {
      if (settled) return
      settled = true
      options.signal.removeEventListener('abort', abort)
      if (!window.isDestroyed()) { window.flashFrame(false); window.destroy() }
      try {
        await shownTask
        if (failed) reject(new Error('CONSENT_WINDOW_FAILED'))
        else resolve(approved)
      } catch { reject(new Error('CONSENT_EVIDENCE_FAILED')) }
    }
    const abort = () => { void finish(false) }
    options.signal.addEventListener('abort', abort, { once: true })
    window.on('closed', () => { void finish(false) })
    window.on('unresponsive', () => { void finish(false, true) })
    window.webContents.on('render-process-gone', () => { void finish(false, true) })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
    window.webContents.on('will-navigate', (event, url) => {
      event.preventDefault() // These two local decisions never navigate or send HTTP.
      if (!shown || settled || options.signal.aborted) return
      try {
        const target = new URL(url)
        if (target.origin !== origin || target.search || target.hash) return
        if (target.pathname === `/${token}/confirm`) void finish(true)
        else if (target.pathname === `/${token}/cancel`) void finish(false)
      } catch { /* All other navigation stays denied. */ }
    })
    window.once('ready-to-show', () => {
      if (settled || options.signal.aborted) { void finish(false); return }
      window.center(); window.show(); window.restore(); window.moveTop(); window.focus()
      if (!window.isFocused()) window.flashFrame(true)
      shown = true
      shownTask = options.onShown?.({ stage: options.stage, visible: window.isVisible(), focused: window.isFocused(),
        minimized: window.isMinimized(), taskbar: true, parentedNativeDialog: false }) ?? Promise.resolve()
      void shownTask.catch(() => finish(false, true))
    })
    const heading = options.stage === 'PREFLIGHT' ? 'Confirm account and free-route verification' : 'Confirm this Hint Level 1 snapshot'
    const mode = options.offline ? 'OFFLINE TEST — synthetic key and transport. No real API requests.' : options.provider === 'GEMINI' ? 'LIVE API — Google Gemini API · Free Tier project only.' : 'LIVE API — OpenRouter and its selected free provider.'
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action ${origin}; base-uri 'none'; frame-src 'none'"><title>${escapeHtml(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;color:#172033;background:#f4f5f7;font:16px 'Segoe UI',sans-serif;height:100vh;display:grid;grid-template-rows:auto 1fr auto}header,footer{padding:22px 28px;background:white}header{border-bottom:1px solid #dce1e9}h1{font-size:23px;margin:12px 0 0}.mode{font-weight:650;color:#31528b}main{padding:22px 28px;overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 Consolas,monospace;margin:0}footer{border-top:1px solid #dce1e9}.note{margin:0 0 16px;line-height:1.5}.actions{display:flex;gap:12px;justify-content:flex-end}form{margin:0}button{font:600 16px 'Segoe UI',sans-serif;padding:11px 22px;border:1px solid #a8b2c3;border-radius:5px;background:white;color:#172033;cursor:pointer}button.confirm{background:#245cb5;color:white;border-color:#245cb5}button:focus-visible{outline:3px solid #e8a317;outline-offset:3px}
      </style></head><body><header><div class="mode">${escapeHtml(mode)}</div><h1>${heading}</h1></header><main><pre>${escapeHtml(options.details)}</pre></main><footer><p class="note">Expires after 60 seconds. Cancel or close this window to stop. Nothing is confirmed automatically.</p><div class="actions"><form action="${origin}/${token}/cancel"><button autofocus type="submit">Cancel</button></form><form action="${origin}/${token}/confirm"><button class="confirm" type="submit">Confirm ${options.stage === 'PREFLIGHT' ? 'preflight' : 'snapshot'}</button></form></div></footer></body></html>`
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => finish(false, true))
  })
}
