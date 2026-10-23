/* global console, process, setTimeout, structuredClone */
// A03 only: production app + actual SDK resolver, labelled filesystem delay.
import { app, BrowserWindow, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { captureMonacoSourceAndRun, assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const directory = resolve(process.argv[2])
const require = createRequire(import.meta.url), fs = require('node:fs/promises')
const pause = ms => new Promise(r => setTimeout(r, ms))
const evidence = { result: 'IN_PROGRESS', classification: 'REAL_PRODUCTION_CSHARP_RESOLVER_WITH_LABELLED_FILESYSTEM_DELAY',
  windows: process.getSystemVersion(), electron: process.versions.electron, arch: process.arch,
  operations: [], delays: [], jobs: [], leases: [], exceptions: [], network: [] }
let win, current, capture, native, label = 'startup', injectDelay = false, heldDelay
const jobs = [], leases = [], watches = []
const originalLstat = fs.lstat
fs.lstat = async function (path, ...args) {
  if (injectDelay && !heldDelay && /[\\/]dotnet[\\/]dotnet\.exe$/i.test(String(path))) {
    const record = { label, operation: 'lstat', path: String(path), delayMs: 10500, entered: performance.now() }
    heldDelay = record; evidence.delays.push(record)
    await pause(record.delayMs); record.resumed = performance.now()
    const result = await originalLstat.call(this, path, ...args)
    record.actualFileRead = true; return result
  }
  return originalLstat.call(this, path, ...args)
}
const originalLoad = Module._load
Module._load = function (name, ...args) {
  const loaded = originalLoad.call(this, name, ...args)
  if (!String(name).endsWith('learning-job.node')) return loaded
  native = loaded
  return { capability: native.capability, state: native.state, poll: native.poll, submitInput: native.submitInput, watch: native.watch,
    acquireLease: path => { const handle = native.acquireLease(path); if (handle) leases.push({ handle, path, label, closed: false }); return handle },
    observation: (handle, op) => { const result = native.observation(handle, op); if (op === 'close') {
      const lease = leases.find(l => l.handle === handle); if (lease) lease.closed = true
    } return result },
    start: (...input) => {
      const handle = native.start(...input), sample = native.poll(handle)
      const expected = input[1].some(a => a.endsWith('csc.dll')) ? 2147483648 : 536870912
      assert.equal(sample.quotaBytes, expected)
      const job = { handle, label, pid: sample.rootPid, quota: sample.quotaBytes, executable: input[0], args: input[1], releases: 0, closes: 0 }
      jobs.push(job); watches.push(native.watch(sample.rootPid)); return handle
    },
    control: (handle, op) => { const result = native.control(handle, op), job = jobs.find(j => j.handle === handle)
      if (job && op === 'release') job.releases++; if (job && op === 'closeHandles') job.closes++
      return result
    },
  }
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => originalHandle(channel, channel.startsWith('exercise:') ? async (event, ...args) => {
  if (channel === 'exercise:run') assertMonacoRunSource(args[0], await capture)
  const result = await listener(event, ...args)
  if (channel === 'exercise:run') { assert.equal(result.ok, true); current = result.value }
  if (result.ok && result.value?.sessionId === current?.sessionId && result.value.sequence > current.sequence) current = result.value
  return result
} : listener)
async function until(check, name) {
  const due = performance.now() + 45000
  while (performance.now() < due) { if (await check()) return; await pause(30) }
  throw Error('A03 observation deadline: ' + name)
}
const evaluate = source => win.webContents.executeJavaScript(source, true)
const wait = source => until(() => evaluate(source), source)
async function click(selector) { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
async function start(name, delayed) {
  label = name; injectDelay = delayed; heldDelay = undefined; current = undefined
  await evaluate(`(document.querySelector('.practice-workspace .native-edit-context')??document.querySelector('.practice-workspace .monaco-editor textarea')).focus()`)
  for (const type of ['keyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await win.webContents.debugger.sendCommand('Input.insertText', { text: 'public class Solution { public int Sum(int a,int b){return a+b;} }' })
  await pause(100); await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
  const began = performance.now(); capture = evaluate(`(${captureMonacoSourceAndRun.toString()})()`); await capture
  await until(() => !!current?.sessionId, 'admission'); return began
}
async function audit(name, snapshot) {
  const root = join(app.getPath('userData'), 'learning', 'exercise-runtime')
  await until(() => leases.filter(l => l.label === name).every(l => l.closed), 'lease close')
  assert.equal(leases.filter(l => l.label === name).length, 1)
  assert.equal(existsSync(join(root, 'sessions', snapshot.sessionId)), false)
  const checkpoint = JSON.parse(await readFile(join(root, 'checkpoints', snapshot.sessionId + '.json'), 'utf8'))
  assert.equal(checkpoint.checkpoint, 'CLEANUP_COMPLETE'); assert.equal(checkpoint.proof, 'VERIFIED')
  assert.equal(checkpoint.nativeStage, 'HANDLES_CLOSED'); assert.equal(checkpoint.workspaceState, 'REMOVED')
  return checkpoint
}
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true }); app.setPath('userData', join(directory, 'user-data'))
  delete process.env.ELECTRON_RENDERER_URL; BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length, 'production window'); win = BrowserWindow.getAllWindows()[0]
  win.setSize(1440, 1000); win.webContents.setBackgroundThrottling(false); win.webContents.debugger.attach('1.3')
  win.webContents.debugger.on('message', (_event, method, params) => { if (method === 'Runtime.exceptionThrown') evidence.exceptions.push(params.exceptionDetails) })
  await win.webContents.debugger.sendCommand('Runtime.enable')
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (request, done) => { evidence.network.push(request.url); done({ cancel: true }) })
  const prefs = win.webContents.getLastWebPreferences(); assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  const frame = win.webContents.mainFrame, send = frame.send.bind(frame)
  frame.send = (channel, ...args) => { const s = args[0]; if (channel === 'exercise:changed' && s.sessionId === current?.sessionId && s.sequence > current.sequence) current = s; return send(channel, ...args) }
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  await click('[aria-label="Open Learning"]'); await click('#learning-chapters button:nth-child(2)')
  await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row')
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  assert.equal(await evaluate(`document.querySelector('.practice-workspace select').value`), 'csharp')
  await start('real-resolver-baseline', false)
  await until(() => current?.phase === 'finished', 'baseline complete')
  assert.deepEqual(current.csharp.result.cases.map(c => c.actual), [8, 0])
  assert.equal(current.csharp.result.failure, null)
  evidence.operations.push({ name: label, snapshot: structuredClone(current), checkpoint: await audit(label, current) })
  const began = await start('prepare-timeout', true)
  await until(() => !!heldDelay, 'real SDK filesystem delay entered')
  await until(() => current?.phase === 'finished', 'Prepare timeout cleanup')
  const snapshot = structuredClone(current)
  assert.equal(snapshot.reason, 'PREPARE_TIMEOUT')
  assert.deepEqual(snapshot.csharp.result, { compile: null, cases: [], notRunCaseIndices: [0, 1], failure: { kind: 'TIMEOUT', phase: 'prepare', caseIndex: null } })
  assert.equal(snapshot.javascript, undefined)
  assert.deepEqual(snapshot.cleanup, { state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true, workspace: 'REMOVED', pendingIo: false })
  assert.ok(heldDelay.actualFileRead)
  assert.equal(jobs.filter(j => j.label === label).length, 0)
  evidence.operations.push({ name: label, elapsedMs: performance.now() - began, snapshot, checkpoint: await audit(label, snapshot) })
  assert.ok(evidence.operations.at(-1).elapsedMs >= 10000)
  const started = await start('prepare-context-cancel', true)
  await until(() => !!heldDelay, 'cancel SDK delay entered'); const cancelled = structuredClone(current)
  await evaluate(`(() => {const s=document.querySelector('.practice-workspace select');s.value='javascript';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`document.querySelector('.practice-workspace select').value==='javascript'`)
  const checkpoint = await audit(label, cancelled)
  const ui = await evaluate(`document.querySelector('.practice-tests').textContent`)
  assert.ok(!/PREPARE_TIMEOUT|TIMEOUT|CS1525/.test(ui))
  assert.equal(jobs.filter(j => j.label === label).length, 0)
  evidence.operations.push({ name: label, elapsedMs: performance.now() - started, reference: cancelled.sessionId, checkpoint, noStaleResult: true })
  assert.equal(await evaluate(`document.querySelector('button[title^="Submit"]').disabled`), true)
  assert.ok(!/Accepted|Wrong Answer|Passed|Failed/.test(await evaluate(`document.querySelector('[id^="test-result-panel-"]')?.textContent??''`)))
  assert.deepEqual(evidence.exceptions, [])
  injectDelay = false; fs.lstat = originalLstat
  app.once('will-quit', () => {
    try {
      assert.ok(jobs.length === 3 && jobs.every(j => native.state(j.handle).released && native.state(j.handle).handlesClosed && j.releases === 1 && j.closes === 1))
      evidence.identities = watches.map(h => native.observation(h, 'identity')); assert.ok(evidence.identities.every(p => p.signaled))
      for (const h of watches) native.observation(h, 'close')
      assert.ok(leases.length === 3 && leases.every(l => l.closed))
      evidence.jobs = jobs.map(({ handle, ...j }) => ({ ...j, state: native.state(handle) }))
      evidence.leases = leases.map(l => ({ label: l.label, path: l.path, closed: l.closed }))
      evidence.managedShutdown = true; evidence.result = 'PASS'
    } catch (error) { evidence.result = 'FAIL'; evidence.failure = String(error); process.exitCode = 1 }
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ result: evidence.result, directory }))
  })
  app.quit()
}
void main().catch(async error => {
  fs.lstat = originalLstat; evidence.result = 'FAIL'; evidence.failure = String(error); evidence.finalSnapshot = current
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.error(error); app.exit(1)
})
