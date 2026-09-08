/* global console, process */
import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { once } from 'node:events'

const require = createRequire(import.meta.url)
// Exercise the production coordinator without adding a production build entry.
const { buildSync } = require('esbuild')
const compiled = buildSync({ entryPoints: [resolve('src/main/services/git/git-document-owners.ts')],
  bundle: true, platform: 'node', format: 'cjs', write: false })
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, loaded, loaded.exports)
const { GitDocumentOwners } = loaded.exports

async function main() {
  await app.whenReady()
  let generation = 0, available = false, window
  let rejectedContexts = 0, rejectedRequests = 0
  const documents = new GitDocumentOwners({
    loseOwner: () => { available = false },
    restoreOwner: () => { available = true; generation++ },
  })
  ipcMain.handle('git:get-context', (event) => {
    try { documents.assertCurrent({ senderId: event.sender.id, senderFrame: event.senderFrame }) }
    catch { rejectedContexts++; return { ok: false, error: { code: 'PERMISSION_DENIED', message: 'stale document', retryable: false } } }
    assert.equal(available, true)
    return { ok: true, value: { generation: `document_${generation}` } }
  })
  ipcMain.handle('git:get-status', (event, request) => {
    try { documents.assertCurrent({ senderId: event.sender.id, senderFrame: event.senderFrame }) }
    catch { rejectedRequests++; return { ok: false, error: { code: 'PERMISSION_DENIED', message: 'stale document', retryable: false } } }
    assert.equal(request.identity.generation, `document_${generation}`)
    return { ok: true, value: { identity: request.identity, result: { ok: true, value: { entries: [], didHitLimit: false } } } }
  })
  try {
    window = new BrowserWindow({ show: false, webPreferences: { preload: resolve('out/preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true } })
    documents.observe(window.webContents)
    const old = [], tokens = new Set()
    const check = () => {
      const current = window.webContents.mainFrame
      const token = `${current.processId}:${current.frameToken}`
      assert.equal(tokens.has(token), false, 'cross-document navigation must replace the frame token')
      tokens.add(token)
      documents.assertCurrent({ senderId: window.webContents.id, senderFrame: current })
      for (const frame of old) assert.throws(() => documents.assertCurrent({ senderId: window.webContents.id, senderFrame: frame }))
      // WebContents.mainFrame is a live view; retain values, not its mutable wrapper.
      old.push({ processId: current.processId, frameToken: current.frameToken,
        detached: current.detached, isDestroyed: () => false })
    }
    await window.loadFile(resolve('tests/fixtures/git-document.html'))
    check()
    for (let i = 0; i < 3; i++) {
      await window.webContents.executeJavaScript('window.addEventListener("beforeunload", () => { void window.studentIde.git.getStatus("project_1234567890abcdef12345678") })')
      const previous = generation
      const priorFrame = window.webContents.mainFrame
      const started = once(window.webContents, 'did-start-navigation').then(() => {
        assert.equal(available, false)
        assert.throws(() => documents.assertCurrent({ senderId: window.webContents.id, senderFrame: priorFrame }))
      })
      const finished = once(window.webContents, 'did-finish-load')
      window.webContents.reload()
      await started; await finished
      assert.equal(generation, previous + 1)
      check()
      const reply = await window.webContents.executeJavaScript(
        'window.studentIde.git.getStatus("project_1234567890abcdef12345678")')
      assert.equal(reply.ok, true, JSON.stringify(reply))
    }
    // beforeunload can acquire context before did-start-navigation; its delayed
    // semantic request must nevertheless be denied once navigation revokes it.
    assert.equal(rejectedContexts + rejectedRequests, 3, 'old document work must be rejected after owner loss')
    console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron, reloads: 3,
      distinctDocumentFrames: tokens.size, rejectedContexts, rejectedRequests, checks: ['same-WebContents reload', 'old-frame rejection',
        'commit-only restoration', 'sandboxed Preload to Main senderFrame IPC'] }))
  } finally {
    documents.stop()
    window?.destroy()
    ipcMain.removeHandler('git:get-context'); ipcMain.removeHandler('git:get-status')
  }
}
void main().then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })
