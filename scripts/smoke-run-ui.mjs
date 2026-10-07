/* global console */
import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { WindowsPipedProcessAdapter, NodeRuntimeDetector, RunService, JavaScriptRunStrategy, ProcessManager,
  RunProjectLifecycle, ProjectService, FileSystemService, IpcHandlerRegistry, RunIpcService,
  FileIpcService, DesktopApplication } = require(resolve(root, 'out/main/run-runtime.js'))

async function smoke() {
  await app.whenReady()
  const window = new BrowserWindow({ show: false, width: 1280, height: 800,
    webPreferences: { preload: resolve(root, 'out/preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } })
  const projects = new ProjectService(), manager = new ProcessManager()
  const files = new FileSystemService(projects, { trashItem: async () => {} })
  const registry = new IpcHandlerRegistry(ipcMain)
  const detector = new NodeRuntimeDetector(), adapter = new WindowsPipedProcessAdapter()
  const natives = [], requests = []
  const run = new RunService({ authorize: async (target) => ({ ...target,
    ...await files.authorizeRunFile(target.projectId, target.relativePath) }), resolveRuntime: () => detector.resolve() }, [new JavaScriptRunStrategy()], {
    manager, adapter: { create(execution, observe) { const native = adapter.create(execution, observe); natives.push(native); return native } },
    onEvent: (ownerId, event) => { assert.equal(ownerId, window.webContents.id); window.webContents.send('run:event', event) },
  })
  const lifecycle = new RunProjectLifecycle(run, projects, files, () => assert.fail('Run cleanup failed'))
  const runIpc = new RunIpcService(registry, {
    startRun(request, owner) { requests.push(request); return run.startRun(request, owner) },
    stopRun: (id, owner) => run.stopRun(id, owner),
  })
  const fileIpc = new FileIpcService(registry, files,
    (event) => window.webContents.send('file:changed', event),
    (status) => window.webContents.send('file:status-changed', status))
  const desktop = new DesktopApplication([manager, projects, files, lifecycle, runIpc, fileIpc])
  const screenshot = join(tmpdir(), 'student-ide-phase-4e.png')
  ipcMain.handle('project:get-active', () => ({ ok: true, value: projects.getActiveProject() }))
  ipcMain.handle('lifecycle:get-status', () => ({ ok: true, value: { state: 'RUNNING' } }))
  const evaluate = (code) => window.webContents.executeJavaScript(code, true)
  const wait = (expression) => evaluate(`new Promise((resolve, reject) => {
    const ready = () => { if (${expression}) { observer.disconnect(); clearTimeout(timer); resolve(true); } };
    const observer = new MutationObserver(ready);
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Run UI condition: ' + ${JSON.stringify(expression)})); }, 10000);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); ready();
  })`)
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  try {
    await desktop.start()
    await projects.openRoot(resolve(root, 'tests/fixtures/run'))
    await window.loadFile(resolve(root, 'out/renderer/index.html'))
    await wait(`document.querySelector('[title="long.js"]')`)
    await click('[title="long.js"]')
    await wait(`document.querySelector('[aria-label="Run"]:not(:disabled)')`)
    await click('[aria-label="Run"]')
    await wait(`document.querySelector('.output-log')?.textContent.includes('ready') && document.querySelector('[aria-label="Run again"]:not(:disabled)')`)
    // Re-run repeatedly through the built Renderer and narrow production Preload.
    // Each next session is observed only after Main fully releases its predecessor.
    const reRunCycles = 6
    for (let cycle = 1; cycle < reRunCycles; cycle++) {
      const prior = natives.at(-1)
      await click('[aria-label="Run again"]')
      await wait(`document.querySelector('[aria-label="Run again"]:not(:disabled)') && document.querySelector('.output-log')?.textContent.includes('ready')`)
      assert.equal(natives.length, cycle + 1)
      assert.equal(prior.isReleased(), true)
      assert.equal(manager.size, 1)
    }
    await click('[aria-label="Stop current file"]')
    await wait(`document.querySelector('.output-context [role="status"]')?.textContent === 'Stopped'`)
    assert.equal(manager.size, 0)
    // Built UI retains output while switching existing panel tabs.
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e => e.textContent === 'Problems').click()`)
    await wait(`document.querySelector('[aria-label="Problems panel"]')`)
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(e => e.textContent === 'Output').click()`)
    await wait(`document.querySelector('.output-context [role="status"]')?.textContent === 'Stopped'`)
    await click('[title="basic.js"]')
    await wait(`document.querySelector('.editor-tab.active [title="basic.js"]') && document.querySelector('[aria-label="Run"]:not(:disabled)')`)
    await click('[aria-label="Run"]')
    await wait(`document.querySelector('.output-context [role="status"]')?.textContent === 'Exited successfully (0)'`)
    await wait(`document.querySelector('.output-log')?.textContent.includes('[stderr] stderr-test') && document.querySelector('.monaco-editor')`)
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await writeFile(screenshot, (await window.capturePage()).toPNG())
    await click('[title="nonzero.js"]')
    await wait(`document.querySelector('.editor-tab.active [title="nonzero.js"]') && document.querySelector('[aria-label="Run"]:not(:disabled)')`)
    await click('[aria-label="Run"]')
    await wait(`document.querySelector('.output-context [role="status"]')?.textContent === 'Exited with code 7'`)
    await desktop.shutdown()
    assert.equal(manager.size, 0)
    assert(natives.every((native) => native.isReleased()))
    assert(requests.every((request) => Object.keys(request).sort().join(',') === 'dirty,projectId,relativePath'))
    console.info(JSON.stringify({ result: 'PASS', smoke: 'run-production-ui', sessions: natives.length,
      scenarios: ['Run', 'stdout', 'stderr', `${reRunCycles - 1} re-runs`, 'Stop', 'Problems/Output tabs', 'exit 0', 'exit 7'],
      reRunCycles, remainingResources: manager.size, screenshot }))
  } finally {
    await desktop.shutdown()
    ipcMain.removeHandler('project:get-active'); ipcMain.removeHandler('lifecycle:get-status')
    if (!window.isDestroyed()) window.destroy()
    app.quit()
  }
}
smoke().catch((error) => { console.error(error); app.exit(1) })
