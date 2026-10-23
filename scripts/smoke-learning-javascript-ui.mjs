/* global console, process, setTimeout */
// Controlled Step 5 smoke: real production window/Monaco/IPC/Main/Node, no replacement results.
import { app, BrowserWindow, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { release } from 'node:os'
import assert from 'node:assert/strict'
import { captureMonacoSourceAndRun, assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const directory = resolve('out', `learning-javascript-ui-step5-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', windows: release(), electron: process.versions.electron, operations: [], jobs: [],
  limitations: ['Windows 10, packaging, full Step 6 matrix and concurrent Project/PTY not tested'] }
const require = createRequire(import.meta.url), pause = ms => new Promise(r => setTimeout(r, ms))
let current, capture, native
const handles = []
const originalLoad = Module._load
Module._load = function (name, ...args) {
  const loaded = originalLoad.call(this, name, ...args)
  if (!String(name).endsWith('learning-job.node')) return loaded
  native = loaded
  return { capability: native.capability, submitInput: native.submitInput, poll: native.poll,
    control: native.control, state: native.state, acquireLease: native.acquireLease,
    watch: native.watch, observation: native.observation, start: (...input) => {
    const handle = native.start(...input), sample = native.poll(handle)
    assert.ok([536870912, 2147483648].includes(sample.quotaBytes))
    handles.push(handle); return handle
  } }
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, channel.startsWith('exercise:') ? async (event, ...args) => {
  if (channel === 'exercise:run') assertMonacoRunSource(args[0], await capture)
  const result = await listener(event, ...args)
  if (channel === 'exercise:run') { evidence.admission = result; assert.equal(result.ok, true); current = result.value }
  if (result.ok && result.value?.sessionId === current?.sessionId && result.value.sequence >= current.sequence) current = result.value
  return result
} : listener)
async function until(check, name) {
  const due = Date.now() + 45000
  while (Date.now() < due) { if (await check()) return; await pause(40) }
  throw Error(`Smoke deadline: ${name}`)
}
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data')); delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length, 'window')
  const window = BrowserWindow.getAllWindows()[0]
  window.setSize(1440, 1000); window.webContents.setBackgroundThrottling(false)
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const prefs = window.webContents.getLastWebPreferences()
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  const frame = window.webContents.mainFrame, send = frame.send.bind(frame)
  frame.send = (channel, ...args) => {
    const s = args[0]
    if (channel === 'exercise:changed' && s.sessionId === current?.sessionId && s.sequence > current.sequence) current = s
    return send(channel, ...args)
  }
  window.webContents.on('console-message', event => {
    if (event.level === 'error') { evidence.rendererError = event.message; console.error(event.message) }
  })
  const evaluate = code => { evidence.stage = code; return window.webContents.executeJavaScript(code, true) }
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  await click('[aria-label="Open Learning"]'); await click('#learning-chapters button:nth-child(2)')
  await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row')
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  await evaluate(`(() => { const s=document.querySelector('.practice-workspace select');s.value='javascript';s.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await wait(`document.querySelector('.practice-workspace select').value==='javascript'`)
  async function run(name, source, failure) {
    await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
    await evaluate(`(document.querySelector('.practice-workspace .native-edit-context') ?? document.querySelector('.practice-workspace .monaco-editor textarea')).focus()`)
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.insertText', { text: source }); await pause(150)
    await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    current = undefined; capture = evaluate(`(${captureMonacoSourceAndRun.toString()})()`); await capture
    await until(() => current?.phase === 'finished', name)
    assert.equal(current.cleanup.cleanupComplete, true); assert.equal(current.cleanup.proof, 'VERIFIED')
    assert.equal(current.language, 'javascript'); assert.equal(current.csharp, undefined)
    assert.equal(current.javascript.result.failure?.kind ?? null, failure)
    await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    if (!failure) {
      assert.deepEqual(current.javascript.result.cases.map(c => c.actual), [8, 0])
      await wait(`document.querySelector('[aria-label="Actual Case 1"]')?.textContent==='8'`)
      await click('[role="tab"][id$="-1"]')
      await wait(`document.querySelector('[aria-label="Actual Case 2"]')?.textContent==='0'`)
    } else await wait(`!!document.querySelector('.practice-result-header [role="alert"]')`)
    const text = await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`)
    assert.ok(!/Accepted|Wrong Answer|Passed|Failed/.test(text))
    assert.equal(await evaluate(`document.querySelector('button[title^="Submit"]').disabled`), true)
    evidence.operations.push({ name, sourceRevision: current.sourceRevision, snapshot: current })
    await writeFile(join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG())
  }
  await run('samples', 'function Sum(a,b){return a+b;}', null)
  await run('syntax', 'function Sum( {', 'SYNTAX_ERROR')
  await run('runtime', 'function Sum(a,b){throw new Error("student");}', 'RUNTIME_ERROR')
  for (const h of handles) {
    const state = native.state(h); assert.equal(state.released, true); assert.equal(state.handlesClosed, true)
    evidence.jobs.push(state)
  }
  evidence.result = 'PASS'
  app.once('will-quit', () => {
    evidence.managedShutdown = true
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ result: evidence.result, directory, jobs: handles.length }))
  })
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); app.exit(1)
})
