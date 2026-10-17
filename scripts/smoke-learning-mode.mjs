/* global console, process, setTimeout */
// 9A-only native smoke: production services, isolated userData and test project.
// Observation globals exist only in the separate smoke renderer build.
import { app, BrowserWindow, dialog } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const pause = ms => new Promise(done => setTimeout(done, ms))
async function until(check, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await check()) return
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}

async function main() {
  await mkdir(resolve('out'), { recursive: true })
  const directory = await mkdtemp(resolve('out/phase9a-smoke-'))
  const fixture = join(directory, 'project')
  const userData = join(directory, 'user-data')
  await mkdir(fixture)
  await mkdir(userData)
  const original = 'console.log("saved");\n'
  await writeFile(join(fixture, 'main.js'), original)
  await writeFile(join(fixture, 'second.js'), 'export const second = 2;\n')
  app.setPath('userData', userData)
  delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const { default: tailwind } = await import('@tailwindcss/vite')
  const renderer = join(directory, 'renderer')
  await build({ configFile: false, root: resolve('src/renderer'), base: './', logLevel: 'warn',
    plugins: [react(), tailwind(), { name: 'learning-observation', enforce: 'pre', transform(source, id) {
      if (id.endsWith('/features/editor/editor-session.ts')) return source + '\nglobalThis.__learningManager = editorModelManager;'
      if (id.endsWith('/features/terminal/terminal-session.ts')) return source + '\nglobalThis.__learningTerminal = terminalController;'
    } }], build: { outDir: renderer, emptyOutDir: false } })
  const loadFile = BrowserWindow.prototype.loadFile
  BrowserWindow.prototype.loadFile = function (file, ...args) {
    return loadFile.call(this, file === resolve('out/renderer/index.html') ? join(renderer, 'index.html') : file, ...args)
  }
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'application window')
  const window = BrowserWindow.getAllWindows()[0]
  window.setSize(1280, 900)
  window.webContents.setBackgroundThrottling(false)
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const capture = async name => {
    await pause(250)
    window.webContents.invalidate()
    await writeFile(join(directory, name + '.png'), (await window.webContents.capturePage()).toPNG())
  }
  try {
    await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
    const security = window.webContents.getLastWebPreferences()
    assert.equal(security.contextIsolation, true)
    assert.equal(security.nodeIntegration, false)
    assert.equal(security.sandbox, true)
    assert.equal((await evaluate('window.studentIde.project.open()')).ok, true)
    await wait(`!!document.querySelector('[title="main.js"]')`)
    await click('[title="main.js"]')
    await wait(`!!document.querySelector('.monaco-editor textarea')`)
    await click('[title="second.js"]')
    await wait(`globalThis.__learningManager.getOpenDocuments().length === 2`)
    await evaluate(`(() => {
      const manager = globalThis.__learningManager;
      manager.activate(manager.getOpenDocuments()[0].key);
      manager.getActiveDocument().model.setValue('console.log("unsaved learning test");');
      globalThis.__retainedModels = manager.getOpenDocuments().map(d => d.model);
    })()`)
    await click('.status-bar [aria-label="Open Terminal"]')
    await wait(`globalThis.__learningTerminal.getSnapshot().sessions.some(s => s.state === 'RUNNING')`)
    const session = await evaluate('globalThis.__learningTerminal.getSnapshot().sessions[0].sessionId')
    await evaluate(`(() => { globalThis.__terminalText = ''; globalThis.__stopTerminalObservation = window.studentIde.terminal.onEvent(e => { if(e.type === 'data') globalThis.__terminalText += e.data; }); })()`)
    await evaluate(`(() => { globalThis.__projectBefore = {
      editor: document.querySelector('.monaco-editor'), terminal: document.querySelector('.xterm'),
      styles: ['.project-sidebar', '.preview-surface', '.app-chrome'].map(s => {
        const c = getComputedStyle(document.querySelector(s)); return [c.backgroundColor, c.color, c.gridTemplateColumns];
      })
    }; })()`)
    await capture('project-before')
    await click('[aria-label="Open Learning"]')
    await wait(`document.querySelector('.ide-shell').dataset.workspaceMode === 'learning'`)
    assert.equal(await evaluate(`document.querySelectorAll('#learning-chapters button').length`), 8)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.learning-workspace')).backgroundColor`), 'rgb(247, 247, 244)')
    assert.equal(await evaluate(`['.workbench', '.chrome-center[hidden]', '.status-bar'].every(s => { const e = document.querySelector(s); return e.inert && getComputedStyle(e).display === 'none'; })`), true)
    assert.equal(await evaluate(`(() => { const e = document.querySelector('[aria-label="Close project"]'); e.focus(); return document.activeElement !== e; })()`), true)
    await evaluate(`for (const [key, shiftKey] of [['o',false],['n',false],['f',true],['\u0060',false]]) window.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,shiftKey,bubbles:true,cancelable:true}));`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Project tools"]').closest('.workbench').hidden`), true)
    assert.equal(await evaluate(`document.querySelector('[role="dialog"]') === null`), true)
    await capture('learning-introduction')
    await click('.learning-intro-link')
    await wait(`document.querySelector('.learning-page:not([hidden])').scrollTop > 0`)
    const scroll = await evaluate(`document.querySelector('.learning-page:not([hidden])').scrollTop`)
    assert.equal(await evaluate(`document.querySelector('#learning-chapter-one').getBoundingClientRect().top < 400`), true)
    await capture('learning-chapter-one')
    await click('[aria-label="Back to Project"]')
    await click('[aria-label="Open Learning"]')
    assert.equal(await evaluate(`document.querySelector('.learning-page:not([hidden])').scrollTop`), scroll)
    await click('#learning-chapters button:nth-child(6)')
    await click('[aria-label="Thu gọn lộ trình"]')
    const collapsedWidth = await evaluate(`document.querySelector('.learning-pages').clientWidth`)
    await click('[aria-label="Mở rộng lộ trình"]')
    assert(collapsedWidth > await evaluate(`document.querySelector('.learning-pages').clientWidth`))
    await click('[aria-label="Open Local AI"]')
    await wait(`!!document.querySelector('.learning-ai-overlay #local-ai-panel')`)
    assert.equal(await evaluate(`document.querySelector('.learning-workspace-content').inert`), true)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.workbench')).display`), 'none')
    await capture('learning-local-ai')
    await click('[aria-label="Close Local AI chat"]')
    assert.equal(await evaluate(`document.querySelector('#learning-chapters [aria-current="page"]').textContent.includes('Hàm')`), true)
    await capture('learning-chapter-six')
    // A real shell receives input while its Project presentation is hidden.
    assert.equal((await evaluate(`window.studentIde.terminal.input({sessionId:${JSON.stringify(session)},data:'echo LEARNING_SESSION_ALIVE\r'})`)).ok, true)
    await wait(`globalThis.__terminalText.includes('LEARNING_SESSION_ALIVE')`)
    await click('[aria-label="Back to Project"]')
    await pause(250)
    assert.equal(await evaluate(`globalThis.__learningManager.getOpenDocuments().every((d,i) => d.model === globalThis.__retainedModels[i] && !d.model.isDisposed())`), true)
    assert.equal(await evaluate(`globalThis.__learningManager.getActiveDocument().dirty`), true)
    assert.equal(await evaluate(`globalThis.__learningManager.getActiveDocument().model.getValue()`), 'console.log("unsaved learning test");')
    assert.equal(await evaluate(`document.querySelectorAll('.editor-tab').length`), 2)
    assert.equal(await evaluate(`document.querySelector('.monaco-editor') === globalThis.__projectBefore.editor && document.querySelector('.xterm') === globalThis.__projectBefore.terminal`), true)
    assert.equal(await evaluate(`globalThis.__learningTerminal.getSnapshot().sessions[0].sessionId`), session)
    assert.equal(await evaluate(`globalThis.__learningTerminal.getSnapshot().sessions[0].state`), 'RUNNING')
    assert.equal(await evaluate(`document.querySelector('.status-bar [aria-label="Hide Terminal"]').getAttribute('aria-expanded')`), 'true')
    assert.equal(await readFile(join(fixture, 'main.js'), 'utf8'), original)
    assert.equal(await evaluate(`JSON.stringify(globalThis.__projectBefore.styles) === JSON.stringify(['.project-sidebar', '.preview-surface', '.app-chrome'].map(s => { const c=getComputedStyle(document.querySelector(s)); return [c.backgroundColor,c.color,c.gridTemplateColumns]; }))`), true)
    await capture('project-after')
    await click('[aria-label="Open Learning"]')
    assert.equal(await evaluate(`document.querySelector('#learning-chapters [aria-current="page"]').textContent.includes('Hàm')`), true)
    const report = { result: 'PASS', electron: process.versions.electron, directory,
      checks: ['8 chapters', 'intro and Chapter 1 scroll', 'scroll retention', 'collapse width', 'chapter retention',
        'Project hidden/inert/focus', 'Project shortcuts blocked', 'AI overlay close restores Learning',
        'same Monaco models and DOM', 'dirty buffer and two tabs retained', 'same live terminal session and xterm DOM',
        'disk unchanged', 'Project style restoration', 'Electron security preferences'] }
    await writeFile(join(directory, 'result.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally {
    await evaluate(`Promise.all(globalThis.__learningTerminal.getSnapshot().sessions.map(s => window.studentIde.terminal.close({sessionId:s.sessionId})))`).catch(() => {})
    await evaluate(`globalThis.__stopTerminalObservation?.(); globalThis.__learningManager.getOpenDocuments().forEach(d => d.model.setValue(d.relativePath === 'main.js' ? ${JSON.stringify(original)} : 'export const second = 2;\n'));`).catch(() => {})
    app.quit()
  }
}
void main().catch(error => { console.error(error); app.exit(1) })
