/* global console, process, setTimeout, structuredClone, Buffer */
// SH-3: production renderer/preload + real standalone Monaco; synthetic SH IPC.
// Accepted SH-3 regression: isolated fake capabilities exercise Apply while the
// actual unconfigured production capability is verified DISABLED before injection.
// No provider/network, Run/Submit or native Judge execution. Isolated userData.
import { app, BrowserWindow, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const baseline = process.argv.includes('--baseline')
const matrixOnly = process.argv.includes('--matrix-only')
const traceResize = process.argv.includes('--trace-resize')
let diagnosticStage = 'startup'
const directory = resolve('out', `sh3-${baseline ? 'baseline' : 'smoke'}-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', checks: [], calls: [], errors: [] }
evidence.baseline = baseline
evidence.consoleErrors = []
evidence.consoleEvents = []
evidence.environment = { platform: process.platform, arch: process.arch, electron: process.versions.electron, chromium: process.versions.chrome }
const hash = value => createHash('sha256').update(value).digest('hex')
let synthetic = false, pending = false, operation, window, failSave = false, oneEdit = false
const saved = []
const pause = ms => new Promise(done => setTimeout(done, ms))
const until = async (check, label) => {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await pause(40) }
  throw Error(`SH-2 observation timeout: ${label}`)
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
  if (channel === 'practice:save') {
    saved.push(structuredClone(args[0]))
    if (failSave) return { ok: false, error: { code: 'PROCESS_FAILED', message: 'Synthetic save failure', retryable: true } }
  }
  if (/^(exercise:run|submission:submit|analysis:(prepare|start))$/.test(channel)) {
    evidence.calls.push({ channel }); throw Error('SH-2 smoke prohibits execution/analysis')
  }
  if (!channel.startsWith('smart-hints:')) return listener(event, ...args)
  const q = args[0]
  evidence.calls.push({ channel, ...(q?.action ? { action: q.action.kind, origin: q.origin.kind, language: q.language } : {}) })
  if (!synthetic) return listener(event, ...args)
  if (channel === 'smart-hints:capabilities') return { ok: true, value: { enabled: true, providerMode: 'FAKE', applyEnabled: !baseline, consentVersion: 1 } }
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
        : a.kind === 'SUGGEST_FIX' ? { kind: 'EDIT_PROPOSAL', edits: op.q.source.includes('return x + 0;') ? [
          { startOffset: op.q.source.indexOf('0;'), endOffset: op.q.source.indexOf('0;') + 1, expectedOldText: '0', replacementText: '1', rationale: 'Synthetic boundary.' },
          ...(!oneEdit ? [{ startOffset: op.q.source.indexOf('// end') + 3, endOffset: op.q.source.indexOf('// end') + 6, expectedOldText: 'end', replacementText: 'done 🐟', rationale: 'Synthetic comment.' }] : [])]
          : [{ startOffset: 0, endOffset: 0, expectedOldText: '', replacementText: '// suggestion only' + (op.q.origin.eol === 'CRLF' ? '\r\n' : '\n'), rationale: 'Synthetic suggestion.' }], rationale: 'Synthetic read-only proposal.', evidence: [] }
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
  window.webContents.on('console-message', event => { if (event.level === 'error') { evidence.consoleErrors.push(event.message); evidence.consoleEvents.push({ stage: diagnosticStage, message: event.message }) } })
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const resizeProbe = `(()=>{
    if(globalThis.sh3ResizeErrors)return;const Native=ResizeObserver;let sequence=0;const deliveries=[];globalThis.sh3ResizeErrors=[];
    globalThis.ResizeObserver=class extends Native{constructor(callback){const id=++sequence,created=new Error().stack;
      super((entries,observer)=>{const before=entries.map(e=>({node:e.target.className,width:e.contentRect.width,height:e.contentRect.height}));
        callback(entries,observer);deliveries.push({id,created,before,stage:globalThis.sh3Stage});if(deliveries.length>64)deliveries.shift()})}};
    addEventListener('error',event=>{if(event.message.includes('ResizeObserver'))sh3ResizeErrors.push({message:event.message,deliveries:[...deliveries]})});
  })()`
  if (traceResize) await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: resizeProbe })
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
    await wait(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);
      const api=Object.values(b).find(v=>v && typeof v.getEditors==='function');
      const language=document.querySelector('[aria-label="Ngôn ngữ bài tập"]')?.value;
      const ed=api?.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode()) && e.getModel()?.uri.path.endsWith(language==='csharp'?'.cs':'.js'));
      if(!ed)return false;globalThis.sh2Probe={ed,model:ed.getModel(),source:ed.getModel().getValue()};ed.focus();return true})()`)
  }
  const unchanged = async () => assert.equal(await evaluate(`sh2Probe.ed.getModel()===sh2Probe.model && !sh2Probe.model.isDisposed() && sh2Probe.model.getValue()===sh2Probe.source`), true)
  const enter = async () => {
    await click('[aria-label="Open Learning"]')
    await wait(`document.querySelector('.ide-shell')?.dataset.workspaceMode==='learning'`)
    await click('#learning-chapters button:nth-child(2)')
    await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row'); await connect()
  }
  const prefs = window.webContents.getLastWebPreferences()
  await evaluate(`(()=>{globalThis.sh3Trace=[];document.addEventListener('keydown',e=>queueMicrotask(()=>sh3Trace.push({event:'key',key:e.key,code:e.code,ctrl:e.ctrlKey,prevented:e.defaultPrevented,target:e.target.tagName,focus:globalThis.sh2Probe?.ed.hasTextFocus()})),true)})()`)
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
  diagnosticStage = 'synthetic-start'
  const loaded = new Promise(done => window.webContents.once('did-finish-load', done)); window.webContents.reload(); await loaded
  if (traceResize) await evaluate(resizeProbe)
  await enter(); await button('Smart Hints'); await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('provider giả')`)
  await evaluate(`(()=>{globalThis.sh3Trace=[];document.addEventListener('keydown',e=>queueMicrotask(()=>sh3Trace.push({event:'key',key:e.key,code:e.code,ctrl:e.ctrlKey,prevented:e.defaultPrevented,target:e.target.tagName,focus:globalThis.sh2Probe?.ed.hasTextFocus()})),true)})()`)
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
  if (!baseline) {
  await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
  await unchanged()
  await button('Discard'); await wait(`!document.querySelector('.smart-hint-diff')`); await unchanged()
  assert.equal(await evaluate('sh2Probe.ed.hasTextFocus()'), true)
  evidence.checks.push('real readonly DiffEditor and Discard leave live model/source untouched and return editor focus')
  } else { assert.equal(await evaluate(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Diff Preview')`), false); await click('[aria-label="Đóng Smart Hints"]'); await button('Smart Hints') }

  for (const language of ['csharp', 'javascript']) for (const eol of ['\n', '\r\n']) for (const count of [1, 2]) {
    diagnosticStage = `${language}/${JSON.stringify(eol)}/${count}`
    oneEdit = count === 1
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');if(e.value!==${JSON.stringify(language)}){const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(e,${JSON.stringify(language)});e.dispatchEvent(new Event('change',{bubbles:true}))}})()`)
    await wait(`document.querySelector('[aria-label="Ngôn ngữ bài tập"]').value===${JSON.stringify(language)}`)
    await connect()
    await evaluate(`(()=>{globalThis.sh3Stage=${JSON.stringify(`${language}/${JSON.stringify(eol)}/${count}`)};const model=sh2Probe.model;globalThis.sh3TraceSubscription?.dispose();globalThis.sh3TraceSubscription=model.onDidChangeContent(e=>sh3Trace.push({event:'content',undo:e.isUndoing,redo:e.isRedoing,version:model.getVersionId(),value:model.getValue()}));sh3Trace.push({event:'case',language:${JSON.stringify(language)},eol:${JSON.stringify(eol)},count:${count}})})()`)
    await wait(`sh2Probe.model.uri.path.endsWith(${JSON.stringify(language === 'csharp' ? '.cs' : '.js')})`)
    const base = ['// 🐟 é', 'return x + 0;', '// end', ...Array.from({ length: 80 }, (_, i) => '// padding ' + i)].join(eol)
    await evaluate(`(()=>{const {ed,model}=sh2Probe;ed.executeEdits('sh3.test.setup',[{range:model.getFullModelRange(),text:''}]);model.pushEOL(${eol === '\r\n' ? 1 : 0});ed.executeEdits('sh3.test.setup',[{range:model.getFullModelRange(),text:${JSON.stringify(base)}}]);ed.pushUndoStop();ed.setSelections([{selectionStartLineNumber:3,selectionStartColumn:7,positionLineNumber:2,positionColumn:1},{selectionStartLineNumber:50,selectionStartColumn:3,positionLineNumber:50,positionColumn:3}]);ed.setScrollPosition({scrollTop:450});sh2Probe.source=model.getValue();sh2Probe.beforeSelections=ed.getSelections().map(s=>s.toString());sh2Probe.scroll=ed.getScrollTop()})()`)
    await button('Suggest Fix'); await wait(`!!document.querySelector('dialog[open]')`); await button('Đồng ý gửi snapshot')
    await wait(`!!document.querySelector('.smart-hints-edit')`)
    // Measure Apply against editor state immediately before opening the preview.
    await evaluate(`(()=>{const {ed}=sh2Probe;ed.setSelections([{selectionStartLineNumber:3,selectionStartColumn:7,positionLineNumber:2,positionColumn:1},{selectionStartLineNumber:50,selectionStartColumn:3,positionLineNumber:50,positionColumn:3}]);sh2Probe.beforeSelections=ed.getSelections().map(s=>s.toString())})()`)
    const candidate = count === 1 ? base.replace('return x + 0;', 'return x + 1;') : base.replace('return x + 0;', 'return x + 1;').replace('// end', '// done 🐟')
    const beforeModels = await evaluate(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);return Object.values(b).find(v=>v&&typeof v.getModels==='function').getModels().length})()`)
    const saveAt = saved.length
    failSave = language === 'javascript' && eol === '\r\n' && count === 2
    if (!baseline) {
    await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
    await unchanged()
    assert.equal(await evaluate(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);const api=Object.values(b).find(v=>v&&typeof v.getModels==='function');const m=api.getModels().filter(m=>m.uri.scheme==='smart-hint-preview');return m.length===2 && m.some(m=>m.getValue()===${JSON.stringify(base)}) && m.some(m=>m.getValue()===${JSON.stringify(candidate)})})()`), true)
    if (language === 'javascript' && count === 2 && eol === '\r\n') {
      diagnosticStage += '/resize'
      window.setSize(900, 800); await pause(100)
      await wait(`(()=>{const host=document.querySelector('.smart-hint-diff-editor'),root=host?.querySelector('.monaco-diff-editor');return !!root&&!root.classList.contains('side-by-side')&&Math.abs(root.getBoundingClientRect().width-host.clientWidth)<2&&Math.abs(root.getBoundingClientRect().height-host.clientHeight)<2})()`)
      assert.equal(await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.smart-hint-diff button')).find(b=>b.textContent==='Apply Fix'),r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth})()`), true)
      await writeFile(join(directory, 'diff-narrow.png'), (await window.webContents.capturePage()).toPNG())
      window.setSize(1440, 1000)
      await wait(`(()=>{const host=document.querySelector('.smart-hint-diff-editor'),root=host?.querySelector('.monaco-diff-editor');return !!root&&root.classList.contains('side-by-side')&&Math.abs(root.getBoundingClientRect().width-host.clientWidth)<2})()`)
    }
    await wait(`Array.from(document.querySelectorAll('.smart-hint-diff button')).some(b=>b.textContent==='Apply Fix'&&!b.disabled)`)
    evidence.checks.push({ beforeApply: await evaluate('sh2Probe.ed.getSelections().map(s=>s.toString())'), initial: await evaluate('sh2Probe.beforeSelections') })
    await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('.smart-hint-diff button')).find(b=>b.textContent==='Apply Fix');b.click();b.click()})()`)
    await wait(`!document.querySelector('.smart-hint-diff')`)
    } else {
      if (language === 'javascript' && count === 2 && eol === '\r\n') { window.setSize(900,800); await pause(100); window.setSize(1440,1000) }
      await evaluate(`(()=>{const {ed}=sh2Probe;ed.pushUndoStop();ed.executeEdits('diagnostic.baseline',[{range:{startLineNumber:2,startColumn:12,endLineNumber:2,endColumn:13},text:'1',forceMoveMarkers:true},...(${count}===2?[{range:{startLineNumber:3,startColumn:4,endLineNumber:3,endColumn:7},text:'done 🐟',forceMoveMarkers:true}]:[])]);ed.pushUndoStop();ed.focus()})()`)
    }
    assert.equal(await evaluate('sh2Probe.model.getValue()'), candidate)
    assert.equal(await evaluate('sh2Probe.ed.hasTextFocus()'), true)
    assert.equal(await evaluate('sh2Probe.ed.getScrollTop()'), await evaluate('sh2Probe.scroll'))
    assert.equal(await evaluate('sh2Probe.ed.getSelections().length'), 2)
    assert.equal(await evaluate(`sh2Probe.ed.getSelections()[0].getDirection()===1`), true)
    const appliedSelections = await evaluate(`sh2Probe.ed.getSelections().map(s=>[s.selectionStartLineNumber,s.selectionStartColumn,s.positionLineNumber,s.positionColumn])`)
    assert.deepEqual(appliedSelections, [[3, count === 2 ? 11 : 7, 2, 1], [50, 3, 50, 3]])
    assert.equal(await evaluate(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);return Object.values(b).find(v=>v&&typeof v.getModels==='function').getModels().length})()`), beforeModels)
    await pause(650)
    if (failSave) await wait(`document.body.textContent.includes('Không thể lưu Code Draft')`)
    await key('z', 'KeyZ', 90, 2); await wait(`sh2Probe.model.getValue()===${JSON.stringify(base)}`)
    assert.deepEqual(await evaluate('sh2Probe.ed.getSelections().map(s=>s.toString())'), await evaluate('sh2Probe.beforeSelections'))
    await pause(650)
    assert.equal(await evaluate('sh2Probe.ed.hasTextFocus()'), true, 'editor focus before Redo')
    await evaluate(`sh3Trace.push({event:'before-redo',canRedo:sh2Probe.model.canRedo(),version:sh2Probe.model.getVersionId(),active:document.activeElement.tagName,focus:sh2Probe.ed.hasTextFocus()})`)
    await key('y', 'KeyY', 89, 2); await wait(`sh2Probe.model.getValue()===${JSON.stringify(candidate)}`)
    assert.deepEqual(await evaluate(`sh2Probe.ed.getSelections().map(s=>[s.selectionStartLineNumber,s.selectionStartColumn,s.positionLineNumber,s.positionColumn])`), appliedSelections)
    await pause(650)
    assert.equal(saved.slice(saveAt).some(d => !d.code), false)
    assert.equal(saved.slice(saveAt).every(d => d.code === base || d.code === candidate), true)
    failSave = false
    const retry = await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Thử lại lưu / tải'))?.textContent`)
    if (retry) { await button(retry); await wait(`!document.body.textContent.includes('Không thể lưu Code Draft')`) }
    evidence.checks.push(`${language} ${JSON.stringify(eol)} ${count} edits: readonly exact diff; duplicate Apply once; one keyboard Undo/Redo; selections/scroll/focus; preview models disposed; autosave${retry ? ' error/retry' : ''}`)
  }
  evidence.trace = await evaluate('sh3Trace')
  evidence.resizeDiagnostics = await evaluate('globalThis.sh3ResizeErrors')
  if (baseline || matrixOnly) {
    assert.deepEqual(evidence.consoleErrors, []); assert.deepEqual(evidence.errors, []); evidence.result='PASS'
    await writeFile(join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({result:evidence.result,directory,baseline}));app.quit();return
  }
  await button('Suggest Fix'); await wait(`!!document.querySelector('dialog[open]')`); await button('Đồng ý gửi snapshot')
  await wait(`!!document.querySelector('.smart-hints-edit')`); await button('Diff Preview')
  await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
  await evaluate(`(()=>{globalThis.retiredApply=Array.from(document.querySelectorAll('.smart-hint-diff button')).find(b=>b.textContent==='Apply Fix');const {ed}=sh2Probe;ed.executeEdits('sh3.test.concurrent',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'// concurrent\\r\\n'}]);sh2Probe.concurrent=ed.getModel().getValue()})()`)
  await wait(`!document.querySelector('.smart-hint-diff')`)
  await evaluate('retiredApply.click()')
  assert.equal(await evaluate('sh2Probe.model.getValue()===sh2Probe.concurrent'), true)
  await evaluate('sh2Probe.ed.trigger("sh3.test", "undo", null)')
  await wait(`!document.querySelector('.smart-hint-diff') && !document.querySelector('.smart-hints-edit')`)
  evidence.checks.push('real concurrent source edit retires preview/models; detached Apply cannot mutate; Undo never revives proposal')
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');e.value='csharp';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await connect()

  // Run the inherited SH-2 selection/lifecycle controls in a fresh Renderer after
  // the SH-3 stress cases; retain the same isolated persisted drafts.
  const reloaded = new Promise(done => window.webContents.once('did-finish-load', done))
  window.webContents.reload(); await reloaded; await enter(); await button('Smart Hints')
  await wait(`document.querySelector('.smart-hints-body')?.textContent.includes('provider giả')`)
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
  assert.deepEqual(evidence.consoleErrors, [])
  evidence.result = 'PASS'
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, directory, checks: evidence.checks.length,
    transactions: evidence.checks.filter(c => typeof c === 'string' && c.includes('edits: readonly')).length }))
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  if (window && !window.isDestroyed()) {
    evidence.resizeDiagnostics = await window.webContents.executeJavaScript('globalThis.sh3ResizeErrors').catch(() => undefined) ?? evidence.resizeDiagnostics
    evidence.trace = await window.webContents.executeJavaScript('globalThis.sh3Trace').catch(() => undefined) ?? evidence.trace
    evidence.editorFailure = await window.webContents.executeJavaScript(`(()=>{if(!globalThis.sh2Probe)return null;const {ed,model}=sh2Probe;return {disposed:model.isDisposed(),sameModel:ed.getModel()===model,focus:ed.hasTextFocus(),canUndo:model.canUndo(),canRedo:model.canRedo(),value:model.getValue(),active:{tag:document.activeElement.tagName,text:document.activeElement.textContent.slice(0,100)}}})()`).catch(() => null)
    evidence.dom = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="tab"]')).map(b=>({text:b.textContent,value:b.dataset.tabsValue,visible:b.getBoundingClientRect().width>0}))`).catch(() => [])
    await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.exit(1)
})
