/* global console */

import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const labels = ['editor', 'typescript', 'javascript', 'html', 'css', 'json']

async function run() {
  await app.whenReady()
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(scriptDirectory, '../out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  ipcMain.handle('lifecycle:get-status', () => ({
    ok: true,
    value: { state: 'RUNNING' },
  }))
  ipcMain.handle('project:get-active', () => ({ ok: true, value: null }))

  try {
    await window.loadFile(join(scriptDirectory, '../out/renderer/index.html'))
    const loaded = await window.webContents.executeJavaScript(`
      Promise.all(${JSON.stringify(labels)}.map((label) => new Promise((resolve, reject) => {
        const environment = globalThis.MonacoEnvironment
        if (!environment?.getWorker) {
          reject(new Error('MonacoEnvironment.getWorker is unavailable.'))
          return
        }
        const worker = environment.getWorker('', label)
        const timer = setTimeout(() => {
          worker.terminate()
          resolve(label)
        }, 750)
        worker.addEventListener('error', (event) => {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(label + ': ' + event.message))
        }, { once: true })
      })))
    `, true)

    console.info(JSON.stringify({
      smoke: 'monaco-production-worker-discovery',
      protocol: 'file:',
      security: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      loaded,
    }))
  } finally {
    ipcMain.removeHandler('lifecycle:get-status')
    ipcMain.removeHandler('project:get-active')
    if (!window.isDestroyed()) window.destroy()
    app.quit()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
