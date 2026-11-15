/* global require, __dirname, console */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron artifact runner intentionally uses CommonJS. */
// Artifact-only renderer. Does not load IDE production code or Run services.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
app.setPath('userData', path.join(require('node:os').tmpdir(), 'coding-ide-m1-11-mockup'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, useContentSize: true,
    show: false, frame: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  try {
    for (const state of ['main', 'dialog']) {
      await win.loadFile(path.join(__dirname, 'prototype.html'), { query: { state }, hash: state })
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))')
      const image = await win.webContents.capturePage()
      await fs.writeFile(path.join(__dirname, `m1-11-prototype-${state}.png`), image.toPNG())
      console.log(`${state}: ${image.getSize().width}x${image.getSize().height}`)
    }
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
