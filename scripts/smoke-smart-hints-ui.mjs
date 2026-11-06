/* global console, process, setTimeout, structuredClone, Buffer */
// SH-2 only: production renderer/preload + real Monaco; synthetic SH IPC replies.
// No provider/network, Run/Submit or native Judge execution. Isolated userData.
import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const directory = resolve('out', `sh2-smoke-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', checks: [], calls: [], errors: [] }
evidence.environment = { platform: process.platform, arch: process.arch, electron: process.versions.electron, chromium: process.versions.chrome }
const hash = value => createHash('sha256').update(value).digest('hex')
let synthetic = false, pending = false, operation, window
const pause = ms => new Promise(done => setTimeout(done, ms))
const until = async (check, label) => {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await pause(40) }
  throw Error(`SH-2 observation timeout: ${label}`)
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
  if (/^(exercise:run|submission:submit|analysis:(prepare|start))$/.test(channel)) {
    evidence.calls.push({ channel }); throw Error('SH-2 smoke prohibits execution/analysis')
  }
  if (!channel.startsWith('smart-hints:')) return listener(event, ...args)
  const q = args[0]
  evidence.calls.push({ channel, ...(q?.action ? { action: q.action.kind, origin: q.origin.kind, language: q.language } : {}) })
  if (!synthetic) return listener(event, ...args)
  if (channel === 'smart-hints:capabilities') return { ok: true, value: { enabled: true, providerMode: 'FAKE', applyEnabled: false, consentVersion: 1 } }
  if (channel === 'smart-hints:retire-context') { if (operation?.q.clientContextId === q.clientContextId) operation.retired = true; return { ok: true, value: null } }
  if (channel === 'smart-hints:prepare') {
    const action = structuredClone(q.action)
    if (action.kind === 'EXPLAIN') { action.selection.fingerprint = hash(action.selection.text); delete action.selection.text }
    operation = { q, status: { schemaVersion: 1, requestId: q.requestId, operationId: randomUUID(), sequence: 0,
      binding: { clientContextId: q.clientContextId, contextGeneration: 1, exerciseId: q.exerciseId, language: q.language,
        sourceRevision: q.sourceRevision, packageVersion: 1, fingerprint: hash(q.source), sourceBytes: Buffer.byteLength(q.source), origin: q.origin, action },
      state: 'PREPARED', captureToken: randomUUID(), expiresAt: Date.now() + 60000, consentVersion: 1, statementBytes: 30, runContextKind: 'CODE_ONLY' } }
    return { ok: true, value: operation.status }
  }
  if (channel === 'smart-hints:start') {
    assert.equal(q.consentGranted, true); assert.equal(q.consentVersion, 1)
    const op = operation, a = op.q.action
    const output = a.kind === 'HINT' ? { kind: 'HINT', level: a.level, paragraphs: [`Synthetic Hint ${a.level}`], nextQuestion: 'Check a public boundary?', evidence: [] }
      : a.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'Synthetic exact selection', variables: 'Variables.', controlFlow: 'Flow.', algorithm: 'Algorithm.', illustrativeExamples: [] }
        : a.kind === 'SUGGEST_FIX' ? { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: 0, endOffset: 0, expectedOldText: '', replacementText: '// suggestion only\n', rationale: 'Synthetic suggestion.' }], rationale: 'Synthetic read-only proposal.', evidence: [] }
          : { kind: 'ANALYSIS', hypotheses: ['Synthetic hypothesis.'], suggestions: ['Check public input.'], evidence: [] }
    if (pending) { op.status = { ...op.status, state: 'RUNNING', sequence: 1 }; delete op.status.captureToken; delete op.status.expiresAt; delete op.status.consentVersion; delete op.status.statementBytes; delete op.status.runContextKind }
    else {
      const { schemaVersion, requestId, operationId, binding } = op.status
      op.status = { schemaVersion, requestId, operationId, binding, state: 'COMPLETE', sequence: 1, output,
        expiresAt: Date.now() + 300000, proposalId: output.kind === 'EDIT_PROPOSAL' ? randomUUID() : null,
        runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } }
    }
    return { ok: true, value: op.status }
  }
  if (channel === 'smart-hints:status') return { ok: true, value: operation.status }
  throw Error(`Unexpected synthetic channel ${channel}`)
})
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data'))
  delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'production window')
  window = BrowserWindow.getAllWindows()[0]
  window.setSize(1440, 1000); window.webContents.setBackgroundThrottling(false)
  window.webContents.on('render-process-gone', (_event, details) => evidence.errors.push(details.reason))
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const click = async selector => {
    await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e && !e.disabled && e.getBoundingClientRect().width>0})()`)
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
  const button = async label => {
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)} && !b.disabled)`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)} && !b.disabled).click()`)
  }
  const key = async (key, code, virtual, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: virtual, modifiers })
  }
  const connect = async () => {
    await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
    await evaluate(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);
      const api=Object.values(b).find(v=>v && typeof v.getEditors==='function');
      const ed=api?.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode()));
      if(!ed)throw Error('Missing real Monaco');globalThis.sh2Probe={ed,model:ed.getModel(),source:ed.getModel().getValue()};ed.focus()})()`)
  }
  const unchanged = async () => assert.equal(await evaluate(`sh2Probe.ed.getModel()===sh2Probe.model && !sh2Probe.model.isDisposed() && sh2Probe.model.getValue()===sh2Probe.source`), true)
  const enter = async () => {
    await click('[aria-label="Open Learning"]')
    await wait(`document.querySelector('.ide-shell')?.dataset.workspaceMode==='learning'`)
    await click('#learning-chapters button:nth-child(2)')
    await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row'); await connect()
  }
  const prefs = window.webContents.getLastWebPreferences()
  await wait(`!!document.querySelector('script[type="module"][src]')`)
  evidence.rendererEntry = await evaluate(`document.querySelector('script[type="module"][src]').src`)
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  await enter(); assert.equal(evidence.calls.length, 0)
  await button('Smart Hints'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('AI chưa được cấu hình')`)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.smart-hints-actions button')).every(b=>b.disabled)`), true)
  await unchanged(); await click('[aria-label="Đóng Smart Hints"]')
  assert.equal(await evaluate(`document.activeElement.textContent.trim()`), 'Smart Hints')
  evidence.checks.push('secure production window; default DISABLED; mount/open sends no prepare/start; real editor/model/source retained')

  synthetic = true
  const loaded = new Promise(done => window.webContents.once('did-finish-load', done)); window.webContents.reload(); await loaded
  await enter(); await button('Smart Hints'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('provider giả')`)
  const sends = () => evidence.calls.filter(c => c.channel === 'smart-hints:start').length
  for (const level of [1, 2, 3]) {
    await button(`Get Hint · Level ${level}`); await wait(`!!document.querySelector('dialog[open]')`)
    assert.equal(sends(), level - 1)
    assert.equal(await evaluate(`document.activeElement.textContent`), 'Hủy')
    if (level === 1) {
      assert.equal(await evaluate(`(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<2 && Math.abs(r.top+r.height/2-innerHeight/2)<2})()`), true)
      await key('Tab', 'Tab', 9); assert.equal(await evaluate('document.activeElement.textContent'), 'Đồng ý gửi snapshot')
      await key('Tab', 'Tab', 9); assert.equal(await evaluate('document.activeElement.textContent'), 'Hủy')
      await writeFile(join(directory, 'consent.png'), (await window.webContents.capturePage()).toPNG())
    }
    await button('Đồng ý gửi snapshot'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('Synthetic Hint ${level}')`)
    await unchanged()
  }
  evidence.checks.push('real native consent cancel-first focus, one explicit start per L1/L2/L3, no editor remount or source mutation')
  await button('Suggest Fix'); await wait(`!!document.querySelector('dialog[open]')`); await button('Đồng ý gửi snapshot')
  await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('Synthetic read-only proposal.')`); await unchanged()
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.smart-hints-drawer button')).some(b=>/Apply|Diff|Undo/.test(b.textContent))`), false)
  evidence.checks.push('Suggest Fix displays escaped structured proposal without editing the real model or exposing Apply/Diff/Undo')

  await click('[aria-label="Đóng Smart Hints"]')
  await evaluate(`sh2Probe.ed.focus();sh2Probe.ed.setPosition({lineNumber:1,column:1})`)
  await key('a', 'KeyA', 65, 2)
  await window.webContents.debugger.sendCommand('Input.insertText', { text: '// 🐟\nfunction solve(x) {\n  return x;\n}\n' })
  await evaluate(`sh2Probe.source=sh2Probe.model.getValue();sh2Probe.ed.setSelection({selectionStartLineNumber:3,selectionStartColumn:10,positionLineNumber:1,positionColumn:1})`)
  const expected = await evaluate(`sh2Probe.model.getValueInRange(sh2Probe.ed.getSelection())`)
  await key('E', 'KeyE', 69, 2 | 8)
  await wait(`!!document.querySelector('dialog[open]')`)
  assert.equal(operation.q.action.selection.text, expected); assert.equal(operation.q.language, 'csharp')
  assert.equal(operation.q.origin.modelVersion, await evaluate('sh2Probe.model.getVersionId()'))
  await key('Escape', 'Escape', 27); await wait(`!document.querySelector('dialog[open]')`); await unchanged()
  assert.equal(await evaluate('sh2Probe.ed.hasTextFocus()'), true)
  await evaluate(`sh2Probe.ed.setSelections([{selectionStartLineNumber:1,selectionStartColumn:1,positionLineNumber:1,positionColumn:8},{selectionStartLineNumber:3,selectionStartColumn:3,positionLineNumber:3,positionColumn:9}]);sh2Probe.ed.focus()`)
  const primary = await evaluate('sh2Probe.model.getValueInRange(sh2Probe.ed.getSelection())')
  await evaluate(`sh2Probe.ed.getAction('learning.smartHints.explain').run()`); await wait(`!!document.querySelector('dialog[open]')`)
  assert.equal(operation.q.action.selection.text, primary); await button('Hủy'); await unchanged()
  evidence.checks.push('real keyboard shortcut and Monaco action capture reversed multiline Unicode and primary multi-cursor selection exactly; Cancel sends no start')

  await button('Analyze Code & Run'); await wait(`!!document.querySelector('dialog[open]')`)
  pending = true; await button('Đồng ý gửi snapshot'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('Đang chờ AI')`)
  const retired = operation
  await evaluate(`sh2Probe.ed.focus();sh2Probe.ed.setPosition({lineNumber:1,column:1})`)
  await window.webContents.debugger.sendCommand('Input.insertText', { text: '// edit\n' })
  await until(() => retired.retired, 'source edit retirement')
  await wait(`!document.querySelector('dialog[open]') && !document.querySelector('.smart-hints-body')?.textContent.includes('Đang chờ AI')`)
  pending = false
  evidence.checks.push('real editor content event retires pending request; Run/Submit remain independent and no stale waiting/result persists')
  await button('Analyze Code & Run'); await wait(`!!document.querySelector('dialog[open]')`)
  pending = true; await button('Đồng ý gửi snapshot')
  const resetOperation = operation
  await click('[aria-label="Reset Code"]'); await button('Xác nhận Reset')
  await until(() => resetOperation.retired, 'confirmed Reset retirement')
  assert.equal(await evaluate(`sh2Probe.ed.getModel()===sh2Probe.model && !sh2Probe.model.getValue().includes('// edit')`), true)
  pending = false
  evidence.checks.push('confirmed Reset retires pending AI without replacing the editor/model identity')
  await click('[aria-label="Đóng Smart Hints"]')

  await evaluate(`Array.from(document.querySelectorAll('.practice-description-pane [role="tab"]')).find(b=>b.textContent.includes('Solution')).click()`)
  await wait(`!!document.querySelector('.practice-solution')`)
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent==='JavaScript').click()`)
  await wait(`document.querySelector('pre[aria-label="Code hoàn chỉnh"] code')?.dataset.highlighted==='true'`)
  await evaluate(`(()=>{const pre=document.querySelector('pre[aria-label="Code hoàn chỉnh"]');pre.focus();const r=document.createRange();r.selectNodeContents(pre.querySelector('code'));const s=getSelection();s.removeAllRanges();s.addRange(r)})()`)
  const solution = await evaluate(`document.querySelector('pre[aria-label="Code hoàn chỉnh"] code').textContent`)
  await key('E', 'KeyE', 69, 2 | 8); await wait(`!!document.querySelector('dialog[open]')`)
  assert.equal(operation.q.action.selection.text, solution); assert.equal(operation.q.language, 'javascript'); assert.equal(operation.q.origin.kind, 'SOLUTION')
  await button('Đồng ý gửi snapshot'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('Synthetic exact selection')`)
  await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent==='C#').click()`)
  await wait(`!document.querySelector('.smart-hints-body')?.textContent.includes('Synthetic exact selection')`)
  evidence.checks.push('real token-span Solution full selection/keyboard explanation uses independent JavaScript origin; language switch retires it')
  // Respect the application's existing 900px window/root minimum.
  window.setSize(900, 800)
  await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
  evidence.narrowViewport = await evaluate('({width:innerWidth,height:innerHeight})')
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('.smart-hints-drawer').getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth+1})()`), true)
  await writeFile(join(directory, 'narrow.png'), (await window.webContents.capturePage()).toPNG())
  await button('Analyze Code & Run'); await wait(`!!document.querySelector('dialog[open]')`)
  pending = true; await button('Đồng ý gửi snapshot'); const leaving = operation
  await click('[aria-label="Back to Project"]')
  await wait(`!document.querySelector('.smart-hints-drawer')`)
  await until(() => leaving.retired, 'Learning leave retirement')
  evidence.checks.push('narrow drawer fits viewport; leaving kept-mounted Learning closes/retire UI')
  assert.equal(evidence.calls.some(c => /^(exercise:run|submission:submit|analysis:(prepare|start))$/.test(c.channel)), false)
  assert.deepEqual(evidence.errors, [])
  evidence.result = 'PASS'
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, directory, checks: evidence.checks }))
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  if (window && !window.isDestroyed()) {
    evidence.dom = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="tab"]')).map(b=>({text:b.textContent,value:b.dataset.tabsValue,visible:b.getBoundingClientRect().width>0}))`).catch(() => [])
    await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.exit(1)
})
