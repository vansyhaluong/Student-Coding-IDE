/* global console, process, setTimeout */
// E2-S5 promoted Divide: real production window/Monaco/IPC/Main, C#/JS public samples only.
import { app, BrowserWindow, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { release } from 'node:os'
import assert from 'node:assert/strict'
import { captureMonacoSourceAndRun, assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const waveC = process.argv.includes('--wave-c'), waveB = process.argv.includes('--wave-b'), waveA = process.argv.includes('--wave-a'), exerciseId = waveC ? 'ch7-02' : waveB ? 'ch6-02' : waveA ? 'ch2-01' : 'ch2-04'
const expectedActuals = waveC ? [6,0] : waveB ? [-27,1] : waveA ? [8,0] : [[4,5],[0,3]]
const directory = resolve('out', `${waveC ? 'learning-wave-c-promotion' : waveB ? 'learning-wave-b-promotion' : waveA ? 'learning-wave-a-promotion' : 'learning-pilot-promotion'}-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', windows: release(), electron: process.versions.electron, operations: [], jobs: [], publicPackets: 0,
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
ipcMain.handle = (channel, listener) => handle(channel, (channel.startsWith('exercise:') || channel.startsWith('practice:')) ? async (event, ...args) => {
  if (channel === 'exercise:run') { assert.equal(args[0].exerciseId, exerciseId); assertMonacoRunSource(args[0], await capture) }
  const result = await listener(event, ...args)
  if (channel.startsWith('practice:')) { assert.ok(!/"(?:official|judge|testSetId|signatureHash)"|hidden-\d/.test(JSON.stringify(result))); evidence.publicPackets++ }
  if (channel === 'exercise:run') { evidence.admission = result; assert.equal(result.ok, true); current = result.value }
  if (current && result.ok && result.value?.sessionId === current.sessionId && result.value.sequence >= current.sequence) current = result.value
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
  await click('[aria-label="Open Learning"]'); await click(`#learning-chapters button:nth-child(${waveC ? 7 : waveB ? 6 : 2})`)
  const title = JSON.parse(await readFile(`resources/learning/exercises/${exerciseId}/exercise.json`, 'utf8')).metadata.title
  await click('.learning-section-nav [data-tabs-value="practice"]')
  await wait(`Array.from(document.querySelectorAll('.practice-row')).some(e=>e.textContent.includes(${JSON.stringify(title)}))`)
  await evaluate(`Array.from(document.querySelectorAll('.practice-row')).find(e=>e.textContent.includes(${JSON.stringify(title)})).click()`)
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  async function run(name, source, failure) {
    await evaluate(`(() => { const s=document.querySelector('.practice-workspace select');s.value=${JSON.stringify(name)};s.dispatchEvent(new Event('change',{bubbles:true})); })()`)
    await wait(`document.querySelector('.practice-workspace select').value===${JSON.stringify(name)}`)

    await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
    await evaluate(`(document.querySelector('.practice-workspace .native-edit-context') ?? document.querySelector('.practice-workspace .monaco-editor textarea')).focus()`)
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.insertText', { text: source }); await pause(150)
    await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    current = undefined; capture = evaluate(`(${captureMonacoSourceAndRun.toString()})()`); await capture
    await until(() => current?.phase === 'finished', name)
    assert.equal(current.cleanup.cleanupComplete, true); assert.equal(current.cleanup.proof, 'VERIFIED')
    assert.equal(current.language, name)
    const result = name === 'csharp' ? current.csharp.result : current.javascript.result
    assert.equal(result.failure?.kind ?? null, failure)
    assert.equal(current.reason, 'COMPLETED')
    assert.equal(result.cases.length, 2)
    await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    if (!failure) {
      assert.deepEqual(result.cases.map(c => c.actual), expectedActuals)
      await click('[role="tab"][id$="-0"]')
      await wait(`JSON.stringify(JSON.parse(document.querySelector('[aria-label="Actual Case 1"]')?.textContent ?? 'null'))===${JSON.stringify(JSON.stringify(expectedActuals[0]))}`)
      await click('[role="tab"][id$="-1"]')
      await wait(`JSON.stringify(JSON.parse(document.querySelector('[aria-label="Actual Case 2"]')?.textContent ?? 'null'))===${JSON.stringify(JSON.stringify(expectedActuals[1]))}`)
    } else await wait(`!!document.querySelector('.practice-result-header [role="alert"]')`)
    const text = await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`)
    assert.ok(!/Accepted|Wrong Answer|Passed|Failed/.test(text))
    assert.equal(await evaluate(`document.querySelector('button[title^="Submit"]').disabled`), true)
    evidence.operations.push({ name, sourceRevision: current.sourceRevision, snapshot: current })
    await writeFile(join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG())
  }
  await run('javascript', waveC ? 'function MaxProfit(prices){let low=prices[0],best=0;for(const p of prices){best=Math.max(best,p-low);low=Math.min(low,p);}return best;}' : waveB ? 'function Power(b,e){let p=1;for(let i=0;i<e;i++)p*=b;return p;}' : waveA ? 'function Sum(a,b){return a+b;}' : 'function Divide(a,b){return [Math.floor(a/b),a%b];}', null)
  await run('csharp', waveC ? 'public class Solution { public int MaxProfit(int[] prices){int low=prices[0],best=0;foreach(int p in prices){best=System.Math.Max(best,p-low);low=System.Math.Min(low,p);}return best;} }' : waveB ? 'public class Solution { public int Power(int b,int e){int p=1;for(int i=0;i<e;i++)p*=b;return p;} }' : waveA ? 'public class Solution { public int Sum(int a,int b) { return a+b; } }' : 'public class Solution { public int[] Divide(int a,int b) { return new int[]{a/b,a%b}; } }', null)
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
  evidence.result = 'FAIL'; evidence.failure = String(error); evidence.execution = current; console.error(error)
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); app.exit(1)
})
