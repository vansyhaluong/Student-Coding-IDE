/* global console, process, setTimeout */
// Runs built production Main/Preload. No language driver, fake successful Run or spike matrix.
import { app, BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const directory = resolve('out', `learning-ipc-step5-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', electron: process.versions.electron, checks: [],
  limitations: ['No language execution drivers', 'No active native operation or live PTY concurrency in this smoke'] }
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(check, label) {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await pause(50) }
  throw Error(`Smoke observation deadline: ${label}`)
}
async function main() {
  await mkdir(directory, { recursive: true })
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data'))
  delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'managed window creation')
  const window = BrowserWindow.getAllWindows()[0]
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  await until(() => evaluate('!!window.studentIde?.learning?.exercise').catch(() => false), 'production bridge')
  const prefs = window.webContents.getLastWebPreferences()
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  assert.deepEqual(await evaluate('Object.keys(window.studentIde.learning.exercise).sort()'), ['onChanged', 'run', 'snapshot', 'stop'])
  assert.equal(await evaluate('typeof window.require'), 'undefined')
  evidence.checks.push('production context-isolated sandboxed narrow bridge')
  const request = { exerciseId: 'ch2-01', language: 'javascript', code: 'source', sourceRevision: 1 }
  // Startup recovery is asynchronous; observe the documented unsupported backend once ready.
  let result
  await until(async () => {
    result = await evaluate(`window.studentIde.learning.exercise.run(${JSON.stringify(request)})`)
    return !result.ok && result.error.code === 'UNSUPPORTED'
  }, 'Learning recovery/admission ready')
  assert.equal(result.ok, false); assert.equal(result.error.operation, 'exercise:run')
  evidence.checks.push('real renderer-to-Main run returns typed UNSUPPORTED without a driver')
  for (const payload of [null, { ...request, owner: 3 }, { ...request, command: 'cmd.exe' }]) {
    const invalid = await evaluate(`window.studentIde.learning.exercise.run(${JSON.stringify(payload)})`)
    assert.equal(invalid.ok, false); assert.equal(invalid.error.code, 'INVALID_INPUT')
  }
  const reference = { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1 }
  assert.equal((await evaluate(`window.studentIde.learning.exercise.snapshot(${JSON.stringify(reference)})`)).error.code, 'PERMISSION_DENIED')
  assert.equal((await evaluate(`window.studentIde.learning.exercise.stop(${JSON.stringify({ ...reference, reason: 'LEARNING_LEFT' })})`)).error.code, 'PERMISSION_DENIED')
  evidence.checks.push('malformed/privileged payload and stale session rejected')
  await evaluate('globalThis.__exerciseUnsubscribe = window.studentIde.learning.exercise.onChanged(() => {}); __exerciseUnsubscribe(); __exerciseUnsubscribe(); true')
  const loaded = new Promise(r => window.webContents.once('did-finish-load', r))
  window.webContents.reload(); await loaded
  assert.equal((await evaluate(`window.studentIde.learning.exercise.run(${JSON.stringify(request)})`)).error.code, 'UNSUPPORTED')
  evidence.checks.push('unsubscribe idempotence and production preload reload')
  // An independent real WebContents has the same preload but is not an observed app owner.
  const foreign = new BrowserWindow({ show: false, webPreferences: { preload: resolve('out/preload/index.js'),
    contextIsolation: true, nodeIntegration: false, sandbox: true } })
  await foreign.loadURL('data:text/html,<html><body>foreign owner</body></html>')
  const denied = await foreign.webContents.executeJavaScript(`window.studentIde.learning.exercise.run(${JSON.stringify(request)})`)
  assert.equal(denied.ok, false); assert.equal(denied.error.code, 'PERMISSION_DENIED')
  foreign.destroy()
  evidence.checks.push('real unregistered WebContents cannot claim Learning ownership')
  evidence.result = 'PASS'
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.once('will-quit', () => {
    evidence.checks.push('managed shutdown reached will-quit without forced termination')
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ ...evidence, directory }))
  })
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error)
  console.error(error)
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.exit(1) // Failed smoke containment, never a PASS proof.
})
