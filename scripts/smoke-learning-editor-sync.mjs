/* global console, process, setTimeout */
// Real Monaco/browser input and production draft IPC. Never launches Learning Run.
import { app, BrowserWindow, clipboard, ipcMain } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const directory = resolve('out', `learning-editor-sync-${Date.now()}`)
const evidence = { result: 'NOT_OBSERVED', checks: [], runCalls: 0, saves: [] }
let window
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (fn, label) => {
  const due = Date.now() + 20000
  while (Date.now() < due) { if (await fn()) return; await pause(20) }
  throw Error(`Editor observation deadline: ${label}`)
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, ...args) => {
  if (channel === 'exercise:run') evidence.runCalls++
  const result = await listener(event, ...args)
  if (channel === 'practice:save' && result.ok) evidence.saves.push({ ...args[0] })
  return result
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
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
  const connect = async suffix => {
    await wait(`!!document.querySelector('.practice-workspace .monaco-editor')`)
    await until(async () => {
      const result = await evaluate(`(async()=>{
        const bundle=await import(document.querySelector('script[type="module"][src]').src);
        const api=Object.values(bundle).find(v=>v && typeof v.getEditors==='function');
        const ed=api.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode()));
        const model=ed?.getModel(); if(!model || !model.uri.path.endsWith(${JSON.stringify(suffix)})) return false;
        globalThis.editorSyncProbe ??= {events:[],seen:new WeakSet()};
        const p=editorSyncProbe; p.ed=ed;p.model=model;
        if(!p.seen.has(ed)) { p.seen.add(ed);
          const original=ed.executeEdits.bind(ed);
          ed.executeEdits=(source,edits,...rest)=>{p.events.push({kind:'executeEdits',source,uri:model.uri.toString(),version:model.getVersionId(),position:ed.getPosition()});return original(source,edits,...rest)};
          ed.onDidChangeCursorPosition(e=>p.events.push({kind:'cursor',source:e.source,reason:e.reason,uri:model.uri.toString(),position:e.position}));
        }
        ed.focus();return true;
      })()`)
      return result
    }, `model ${suffix}`)
  }
  const snapshot = () => evaluate(`({code:editorSyncProbe.model.getValue(),position:editorSyncProbe.ed.getPosition(),selection:editorSyncProbe.ed.getSelection(),version:editorSyncProbe.model.getVersionId()})`)
  const input = text => window.webContents.debugger.sendCommand('Input.insertText', { text })
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers,
      ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
  }
  const enter = async () => {
    await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
    await click('[aria-label="Open Learning"]')
    await wait(`document.querySelector('.ide-shell')?.dataset.workspaceMode==='learning' && document.getElementById('learning-workspace')?.hidden===false`)
    await click('#learning-chapters button:nth-child(3)')
    await click('.learning-section-nav [data-tabs-value="practice"]')
    await click('.practice-row')
    await connect('/ch3-01/solution.cs')
  }
  const language = async value => {
    await evaluate(`(()=>{const el=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await connect(`/ch3-01/solution.${value === 'csharp' ? 'cs' : 'js'}`)
  }
  const stored = async (exerciseId, language, code) => {
    await until(() => evidence.saves.some(s => s.exerciseId === exerciseId && s.language === language && s.code === code), 'draft IPC save')
    await until(async () => {
      const data = JSON.parse(await readFile(join(directory, 'user-data/learning/drafts.json'), 'utf8'))
      return data.data.drafts.some(s => s.exerciseId === exerciseId && s.language === language && s.code === code)
    }, 'draft on disk')
  }
  await enter()
  const initial = await snapshot()
  const body = await evaluate(`(()=>{const p=editorSyncProbe;const line=p.model.getLinesContent().findIndex(l=>l.includes('throw new'))+1;
    if(!line)throw Error('Starter body missing');p.ed.setSelection({startLineNumber:line,startColumn:1,endLineNumber:line,endColumn:p.model.getLineMaxColumn(line)});return {line,start:p.model.getOffsetAt({lineNumber:line,column:1}),end:p.model.getOffsetAt({lineNumber:line,column:p.model.getLineMaxColumn(line)})}})()`)
  await input('        ')
  for (const char of 'int total = 0;') await input(char)
  const rapid = initial.code.slice(0, body.start) + '        int total = 0;' + initial.code.slice(body.end)
  await pause(700)
  assert.equal((await snapshot()).code, rapid)
  assert.deepEqual((await snapshot()).position, { lineNumber: body.line, column: 23 })
  evidence.rapidTyping = await snapshot()
  evidence.checks.push('rapid input at the previously failing method-body position: exact characters and caret retained')

  await evaluate('editorSyncProbe.ed.pushUndoStop()')
  const paste = ' // Việt Ω 😀 "a  b"'
  clipboard.writeText(paste)
  await key('v', 'KeyV', 86, 2)
  const pasted = rapid.slice(0, body.start) + '        int total = 0;' + paste + initial.code.slice(body.end)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(pasted)}`)
  await evaluate('editorSyncProbe.ed.pushUndoStop()')
  await key('z', 'KeyZ', 90, 2)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(rapid)}`)
  await key('y', 'KeyY', 89, 2)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(pasted)}`)
  evidence.checks.push('real clipboard Unicode/string-literal whitespace paste and keyboard undo/redo preserve exact source')

  const begin = pasted.indexOf('total')
  await evaluate(`(()=>{const p=editorSyncProbe,a=p.model.getPositionAt(${begin}),b=p.model.getPositionAt(${begin + 5});p.ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
  const selection = (await snapshot()).selection
  await pause(700) // Includes draft-save/error-clear rerenders while selection is live.
  assert.deepEqual((await snapshot()).selection, selection)
  evidence.selectionAcrossAutosave = { before: selection, after: (await snapshot()).selection }
  await input('count')
  let selectedEdit = pasted.slice(0, begin) + 'count' + pasted.slice(begin + 5)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(selectedEdit)}`)
  await key('Backspace', 'Backspace', 8)
  const deleted = selectedEdit.slice(0, begin + 4) + selectedEdit.slice(begin + 5)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(deleted)}`)
  await input('t')
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(selectedEdit)}`)
  await stored('ch3-01', 'csharp', selectedEdit)
  evidence.checks.push('selection survives autosave rerender; replacement/backspace retain exact draft on disk')

  const lineEnd = await evaluate(`(()=>{const p=editorSyncProbe,pos={lineNumber:${body.line},column:p.model.getLineMaxColumn(${body.line})};p.ed.setPosition(pos);return p.model.getOffsetAt(pos)})()`)
  await key('Enter', 'Enter', 13)
  const afterEnter = selectedEdit.slice(0, lineEnd) + '\n        ' + selectedEdit.slice(lineEnd)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(afterEnter)}`)
  for (const char of 'return n % 2 == 0;') await input(char)
  selectedEdit = selectedEdit.slice(0, lineEnd) + '\n        return n % 2 == 0;' + selectedEdit.slice(lineEnd)
  await pause(700)
  assert.equal((await snapshot()).code, selectedEdit)
  assert.equal((await snapshot()).position.lineNumber, body.line + 1)
  await stored('ch3-01', 'csharp', selectedEdit)
  evidence.checks.push('Enter/autoindent followed by rapid typing remains inside the method')

  await language('javascript')
  const js = (await snapshot()).code
  await evaluate(`editorSyncProbe.ed.setPosition({lineNumber:1,column:1})`)
  await input('// Unicode Ω 😀\n')
  const jsDraft = (await snapshot()).code
  assert.notEqual(jsDraft, js)
  assert.ok(jsDraft.includes('// Unicode Ω 😀'))
  await stored('ch3-01', 'javascript', jsDraft)
  await language('csharp')
  assert.equal((await snapshot()).code, selectedEdit)
  await click('.practice-heading button:first-child')
  await wait(`document.querySelectorAll('.practice-row').length===9`)
  await evaluate(`document.querySelectorAll('.practice-row')[1].click()`)
  await connect('/ch3-02/solution.cs')
  const other = (await snapshot()).code
  assert.notEqual(other, selectedEdit)
  await click('.practice-heading button:first-child'); await click('.practice-row')
  await connect('/ch3-01/solution.cs')
  assert.equal((await snapshot()).code, selectedEdit)
  evidence.checks.push('exercise and language switches restore independent context drafts')

  await click('[aria-label="Reset Code"]')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Xác nhận Reset').click()`)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(initial.code)}`)
  await connect('/ch3-01/solution.cs')
  await key('z', 'KeyZ', 90, 2)
  await wait(`editorSyncProbe.model.getValue()===${JSON.stringify(selectedEdit)}`)
  await stored('ch3-01', 'csharp', selectedEdit)
  // The reset intent must not replay over the undo result on the next context mount.
  await language('javascript'); assert.equal((await snapshot()).code, jsDraft)
  await language('csharp'); assert.equal((await snapshot()).code, selectedEdit)
  evidence.checks.push('confirmed Reset is undoable; consumed Reset never replays after context switch')

  evidence.events = await evaluate('editorSyncProbe.events')
  assert.equal(evidence.events.filter(e => e.kind === 'executeEdits' && e.source !== 'learning.source.replace').length, 0)
  assert.equal(evidence.events.filter(e => e.kind === 'executeEdits' && e.source === 'learning.source.replace').length, 1)
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
  window.webContents.reload(); await loaded
  await enter()
  assert.equal((await snapshot()).code, selectedEdit)
  await language('javascript'); assert.equal((await snapshot()).code, jsDraft)
  await language('csharp')
  assert.equal(evidence.runCalls, 0)
  evidence.checks.push('reload restores persisted drafts; zero Learning Run calls; zero stale full-model writes')
  if (process.argv.includes('--workspace')) {
    await click('[aria-label="Back to Project"]')
    await wait(`document.querySelector('.ide-shell')?.dataset.workspaceMode==='project' && document.getElementById('learning-workspace')?.hidden===true`)
    assert.equal(await evaluate(`document.querySelector('.project-sidebar').getBoundingClientRect().width>0`), true)
    await stored('ch3-01', 'csharp', selectedEdit)
    await stored('ch3-01', 'javascript', jsDraft)
    await click('[aria-label="Open Learning"]')
    await wait(`document.querySelector('.ide-shell')?.dataset.workspaceMode==='learning' && document.getElementById('learning-workspace')?.hidden===false`)
    await connect('/ch3-01/solution.cs')
    assert.equal((await snapshot()).code, selectedEdit)
    await language('javascript'); assert.equal((await snapshot()).code, jsDraft)
    await language('csharp'); assert.equal(evidence.runCalls, 0)
    evidence.checks.push('real Learning ↔ Project workspace round trip preserves both drafts and visible Project shell; zero Learning Run calls')
  }
  evidence.final = await snapshot()
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await pause(100) // Let the hidden acceptance window paint after reload/context changes.
  await writeFile(join(directory, 'result.png'), (await window.webContents.capturePage()).toPNG())
  evidence.result = 'PASS'
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, directory, checks: evidence.checks }))
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  if (window && !window.isDestroyed()) {
    evidence.events = await window.webContents.executeJavaScript('globalThis.editorSyncProbe?.events').catch(() => null)
    evidence.final = await window.webContents.executeJavaScript('globalThis.editorSyncProbe && ({code:editorSyncProbe.model.getValue(),position:editorSyncProbe.ed.getPosition(),focus:editorSyncProbe.ed.hasTextFocus()})').catch(() => null)
    await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  app.once('will-quit', () => app.exit(1)); app.quit()
})
