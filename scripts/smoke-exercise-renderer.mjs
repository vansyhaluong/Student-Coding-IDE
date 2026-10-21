/* global console, process, setTimeout */
// Production Renderer -> Preload -> IPC. Records real unsupported backends, never simulates a successful Run.
import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const directory = resolve('out', `learning-renderer-step6-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', electron: process.versions.electron, checks: [], invokes: [],
  limitations: ['No native C#/JS execution drivers', 'Active-operation lifecycle uses mock adapters in unit tests', 'No concurrent live Project Run/PTY acceptance'] }
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(check, label) {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await pause(50) }
  throw Error(`Smoke observation deadline: ${label}`)
}
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data')); delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  // Observe the original handler's real result; no replacement response or authority.
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => handle(channel, channel === 'exercise:run' ? async (event, ...args) => {
    const result = await listener(event, ...args)
    evidence.invokes.push({ language: args[0]?.language, sourceRevision: args[0]?.sourceRevision, ok: result.ok, code: result.error?.code })
    return result
  } : listener)
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'window')
  const window = BrowserWindow.getAllWindows()[0]; window.setSize(1280, 900)
  window.webContents.setBackgroundThrottling(false)
  const evaluate = async code => {
    evidence.stage = code
    return window.webContents.executeJavaScript(code, true)
  }
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const click = async selector => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`)
    return evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  const prefs = window.webContents.getLastWebPreferences()
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  evidence.checks.push('production secure window and renderer loaded')
  await click('[aria-label="Open Learning"]')
  await click('#learning-chapters button:nth-child(2)')
  // beUI paints an aria-hidden duplicate label; textContent is intentionally doubled.
  await click('.learning-section-nav [role="tab"][data-tabs-value="practice"]')
  await wait(`!!document.querySelector('.practice-row:not(:disabled)')`)
  await click('.practice-row')
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  await click('[aria-label="Run"]')
  await until(() => evidence.invokes.length === 1, 'C# real invoke')
  await wait(`document.querySelector('.practice-tests [role=alert]')?.textContent.includes('chưa có backend thực thi')`)
  assert.deepEqual(evidence.invokes[0], { language: 'csharp', sourceRevision: 1, ok: false, code: 'UNSUPPORTED' })
  await writeFile(join(directory, 'unsupported.png'), (await window.webContents.capturePage()).toPNG())
  evidence.checks.push('real C# UI Run -> typed UNSUPPORTED, no fake execution result')
  assert.equal(await evaluate(`document.querySelector('.practice-workspace button[title^=Submit]').disabled`), true)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.practice-workspace button')).some(b => /^(Stop|Cancel)$/.test(b.textContent || b.ariaLabel))`), false)
  await evaluate(`(() => { const select = document.querySelector('[aria-label="Ngôn ngữ bài tập"]'); select.value = 'javascript'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await wait(`document.querySelector('[aria-label="Ngôn ngữ bài tập"]').value === 'javascript' && !document.querySelector('.practice-tests [role=alert]')`)
  await click('[aria-label="Run"]')
  await until(() => evidence.invokes.length === 2, 'JavaScript real invoke')
  await wait(`document.querySelector('.practice-tests [role=alert]')?.textContent.includes('chưa có backend thực thi')`)
  assert.equal(evidence.invokes[1].language, 'javascript'); assert.equal(evidence.invokes[1].code, 'UNSUPPORTED')
  evidence.checks.push('language switch resets stale result and JavaScript Run returns real UNSUPPORTED; Submit remains disabled; no Stop/Cancel')
  await click('[aria-label="Back to Project"]')
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  await click('[aria-label="Open Learning"]')
  await wait(`!!document.querySelector('.practice-workspace') && !document.querySelector('.practice-tests [role=alert]')`)
  evidence.checks.push('leaving/re-entering kept-mounted Learning clears prior result')
  await evaluate(`Array.from(document.querySelectorAll('.practice-heading button')).find(b => b.textContent.includes('Danh sách')).click()`)
  await wait(`!!document.querySelector('.practice-list')`); await click('.practice-row')
  await wait(`!!document.querySelector('.practice-workspace') && !document.querySelector('.practice-tests [role=alert]')`)
  evidence.checks.push('exercise list/reopen clears previous unsupported result')
  const loaded = new Promise(r => window.webContents.once('did-finish-load', r))
  window.webContents.reload(); await loaded
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  evidence.checks.push('production renderer reload completed without stale result')
  evidence.result = 'PASS'
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.once('will-quit', () => {
    evidence.checks.push('managed idle shutdown reached will-quit without force')
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ ...evidence, directory }))
  })
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.exit(1) // Failed-smoke containment, never PASS proof.
})
