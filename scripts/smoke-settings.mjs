/* global console, process, setTimeout */
// Production Main/Preload/Renderer, isolated fixture data, hidden native windows.
import { app, BrowserWindow, dialog } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const directory = resolve('out/phase6-smoke')
const data = join(directory, 'user-data')
const fixture = join(directory, 'student-project')
const stage = process.argv.find(arg => arg.startsWith('--stage='))?.slice(8) ?? 'initial'
const settings = { theme: 'light', fontSize: 20, tabSize: 4, autoSave: true }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(run, label) {
  const end = Date.now() + 30000
  while (Date.now() < end) { if (await run()) return; await pause(100) }
  throw Error('Timed out: ' + label)
}
async function main() {
  await mkdir(fixture, { recursive: true })
  await mkdir(data, { recursive: true })
  if (stage === 'initial') {
    await writeFile(join(fixture, 'main.js'), 'console.log("original");\n')
    await writeFile(join(data, 'app-state.json'), JSON.stringify({ schemaVersion: 1, data: { recentProjects: [] } }))
  }
  if (stage === 'recovery') await writeFile(join(data, 'app-state.json'), '{ damaged preferences')
  app.setPath('userData', data)
  delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
  if (stage === 'initial' && !process.argv.includes('--reuse-renderer')) {
    const { build } = await import('vite')
    const { default: react } = await import('@vitejs/plugin-react')
    const { default: tailwind } = await import('@tailwindcss/vite')
    await build({ configFile: false, root: resolve('src/renderer'), base: './', logLevel: 'warn',
      plugins: [react(), tailwind(), { name: 'phase6-observation', enforce: 'pre', transform(source, id) {
        if (id.endsWith('/features/editor/editor-session.ts')) return source + '\nglobalThis.__phase6Manager = editorModelManager;'
      } }], build: { outDir: resolve('out/phase6-renderer'), emptyOutDir: true } })
  }
  const loadFile = BrowserWindow.prototype.loadFile
  BrowserWindow.prototype.loadFile = function(file, ...args) {
    return loadFile.call(this, file === resolve('out/renderer/index.html') ? resolve('out/phase6-renderer/index.html') : file, ...args)
  }
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'window')
  const window = BrowserWindow.getAllWindows()[0]
  window.webContents.setBackgroundThrottling(false)
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const click = text => evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent === " + JSON.stringify(text) + " && !b.disabled).click()")
  await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Settings' && !b.disabled)").catch(() => false), 'settings ready')
  const security = window.webContents.getLastWebPreferences()
  assert.equal(security.contextIsolation, true)
  assert.equal(security.nodeIntegration, false)
  assert.equal(security.sandbox, true)
  if (stage === 'initial') {
    await click('Settings')
    await until(() => evaluate("!!document.querySelector('.settings-content')"), 'settings dialog')
    await pause(300); window.webContents.invalidate(); await window.webContents.capturePage(); await pause(100)
    await writeFile(join(directory, 'settings-dark.png'), (await window.webContents.capturePage()).toPNG())
    for (const [selector, value] of [['select', 'light'], ['input[type=number]', '20']]) {
      await evaluate("(() => { const e=document.querySelector('.settings-content " + selector + "'); Object.getOwnPropertyDescriptor(" + (selector === 'select' ? 'HTMLSelectElement' : 'HTMLInputElement') + ".prototype,'value').set.call(e," + JSON.stringify(value) + "); e.dispatchEvent(new Event('" + (selector === 'select' ? 'change' : 'input') + "',{bubbles:true})); })()")
    }
    await evaluate("(() => { const tabs=document.querySelectorAll('.settings-content select')[1]; tabs.value='4'; tabs.dispatchEvent(new Event('change',{bubbles:true})); })()")
    await evaluate("document.querySelector('.settings-content input[type=checkbox]').click()")
    await click('Save settings')
    await until(() => evaluate("!document.querySelector('.settings-content') && document.documentElement.dataset.theme === 'light'"), 'applied settings')
    assert.deepEqual((await evaluate('window.studentIde.settings.get()')).value.settings, settings)
    const opened = await evaluate('window.studentIde.project.open()')
    assert.equal(opened.ok, true)
    await until(() => evaluate('!!document.querySelector(\'[title="main.js"]\')'), 'explorer')
    await evaluate('document.querySelector(\'[title="main.js"]\').click()')
    await until(() => evaluate("!!document.querySelector('.monaco-editor textarea')"), 'editor')
    await evaluate('globalThis.__phase6Manager.getActiveDocument().model.setValue(' + JSON.stringify('console.log("auto saved");') + ')')
    await until(async () => (await readFile(join(fixture, 'main.js'), 'utf8')).includes('auto saved'), 'Auto Save to disk')
    await click('Settings')
    await until(() => evaluate("!!document.querySelector('.settings-content')"), 'light settings')
    await pause(300); window.webContents.invalidate(); await window.webContents.capturePage(); await pause(100)
    await writeFile(join(directory, 'settings-light.png'), (await window.webContents.capturePage()).toPNG())
    assert.equal(await evaluate("document.querySelector('.ui-dialog').scrollWidth <= document.querySelector('.ui-dialog').clientWidth"), true)
    await click('Cancel')
    assert.equal((await evaluate('window.studentIde.project.listRecent()')).value.length, 1)
  } else if (stage === 'restart') {
    const snapshot = await evaluate('window.studentIde.settings.get()')
    assert.deepEqual(snapshot.value.settings, settings)
    assert.equal(snapshot.value.recovered, false)
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light')
    const recent = await evaluate('window.studentIde.project.listRecent()')
    assert.equal(recent.value.length, 1)
    const id = recent.value[0].id
    assert.equal((await evaluate('window.studentIde.project.openRecent(' + JSON.stringify(id) + ')')).ok, true)
    assert.equal((await evaluate('window.studentIde.project.removeRecent(' + JSON.stringify(id) + ')')).ok, true)
    assert.equal((await evaluate('window.studentIde.project.getActive()')).value.id, id)
    assert.equal(await readFile(join(fixture, 'main.js'), 'utf8'), 'console.log("auto saved");')
  } else if (stage === 'recovery') {
    const snapshot = await evaluate('window.studentIde.settings.get()')
    assert.equal(snapshot.value.recovered, true)
    assert.deepEqual(snapshot.value.settings, settings)
    await until(() => evaluate("document.body.innerText.includes('Application preferences were recovered')"), 'visible recovery warning')
    assert.equal(await readFile(join(fixture, 'main.js'), 'utf8'), 'console.log("auto saved");')
    assert.equal((await evaluate('window.studentIde.settings.update(' + JSON.stringify(settings) + ')')).ok, true)
    assert.equal(await readFile(join(data, 'app-state.json.corrupt'), 'utf8'), '{ damaged preferences')
  } else throw Error('Unknown stage')
  console.log(JSON.stringify({ result: 'PASS', stage, electron: process.versions.electron, security: { contextIsolation: true, nodeIntegration: false, sandbox: true } }))
  await writeFile(join(directory, stage + '.json'), JSON.stringify({ result: 'PASS', stage, settings, electron: process.versions.electron }, null, 2))
  app.quit()
}
void main().catch(error => { console.error(error); app.exit(1) })
