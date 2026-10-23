/* global console, process, setTimeout */
// Test-only acceptance fixture. Loads production bundles and the production app.
import { app, BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const directory = resolve(process.argv[2])
const evidence = { result: 'IN_PROGRESS', diagnostics: [], workers: [], exceptions: [], console: [], network: [] }
const require = createRequire(import.meta.url), pause = ms => new Promise(r => setTimeout(r, ms))
let win
async function until(check, name) {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await pause(50) }
  throw Error('Acceptance deadline: ' + name)
}
const evaluate = source => win.webContents.executeJavaScript(source, true)
const wait = source => until(() => evaluate(source), source)
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data')); delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length, 'production window')
  win = BrowserWindow.getAllWindows()[0]; win.setSize(1440, 1000)
  win.webContents.setBackgroundThrottling(false)
  win.webContents.debugger.attach('1.3')
  win.webContents.debugger.on('message', (_event, method, params) => {
    if (method === 'Runtime.exceptionThrown') evidence.exceptions.push(params.exceptionDetails)
  })
  win.webContents.on('console-message', event => {
    if (event.level === 'error') evidence.console.push({ message: event.message, source: event.sourceId })
  })
  await win.webContents.debugger.sendCommand('Runtime.enable')
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (request, done) => {
    evidence.network.push(request.url); done({ cancel: true })
  })
  const prefs = win.webContents.getLastWebPreferences()
  assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.sandbox, true)
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  await click('[aria-label="Open Learning"]'); await wait(`!!document.querySelector('#learning-chapters button:nth-child(2)')`)
  await click('#learning-chapters button:nth-child(2)'); await click('.learning-section-nav [data-tabs-value="practice"]')
  await wait(`!!document.querySelector('.practice-row')`); await click('.practice-row')
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  await evaluate(`(() => {const s=document.querySelector('.practice-workspace select');s.value='javascript';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`document.querySelector('.practice-workspace select').value==='javascript'`)
  const assets = await readdir('out/renderer/assets')
  const modes = Object.fromEntries(['ts', 'css', 'html', 'json'].map(kind => [kind, assets.find(n => n.startsWith(kind + 'Mode-') && n.endsWith('.js'))]))
  await evaluate(`(async () => {
    const entry=document.querySelector('script[type="module"][src]');const bundle=await import(entry.src);
    const editor=Object.values(bundle).find(v=>v&&typeof v.getEditors==='function');
    const uri=Object.values(bundle).find(v=>v&&typeof v.parse==='function'&&typeof v.file==='function');
    window.a02={editor,uri,modes:{}};
    for(const [kind,name] of Object.entries(${JSON.stringify(modes)})) window.a02.modes[kind]=await import(new URL(name,entry.src).href);
    window.a02.practice=()=>editor.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode()));
    return true;
  })()`)
  for (const language of ['javascript', 'typescript']) {
    await evaluate(`(() => {const a=window.a02;const node=document.createElement('div');node.style='position:fixed;inset:60px;background:white;z-index:9999';document.body.append(node);
      a.node=node;a.model=a.editor.createModel('const value = 1;',${JSON.stringify(language)},a.uri.parse('inmemory:///a02.${language === 'javascript' ? 'js' : 'ts'}'));
      a.instance=a.editor.create(node,{model:a.model,automaticLayout:true});})()`)
    await pause(300)
    const result = await evaluate(`(async () => {
      const a=window.a02,start=performance.now();const getter=await a.modes.ts.${language === 'javascript' ? 'getJavaScriptWorker' : 'getTypeScriptWorker'}();
      a.worker=await getter(a.model.uri);const path=a.model.uri.toString();
      const syntax=await a.worker.getSyntacticDiagnostics(path),semantic=await a.worker.getSemanticDiagnostics(path);
      return {language:${JSON.stringify(language)},syntax,semantic,firstReadyMs:performance.now()-start};
    })()`)
    assert.deepEqual(result.syntax, []); assert.deepEqual(result.semantic, [])
    await evaluate(`window.a02.model.setValue('const value = ;')`)
    await wait(`window.a02.editor.getModelMarkers({resource:window.a02.model.uri}).some(m=>m.severity===8)`)
    result.invalid = await evaluate(`(async () => ({syntax:await window.a02.worker.getSyntacticDiagnostics(window.a02.model.uri.toString()),markers:window.a02.editor.getModelMarkers({resource:window.a02.model.uri})}))()`)
    assert.ok(result.invalid.syntax.some(d => d.code === 1109 && d.start === 14))
    assert.ok(result.invalid.markers.some(m => m.startLineNumber === 1 && m.startColumn === 15))
    await writeFile(join(directory, language + '-syntax.png'), (await win.webContents.capturePage()).toPNG())
    await evaluate(`window.a02.model.setValue(${JSON.stringify(language === 'javascript' ? 'const value = 1; value = 2;' : 'let value: number = "bad";')})`)
    await wait(`window.a02.editor.getModelMarkers({resource:window.a02.model.uri}).some(m=>String(m.code)==='${language === 'javascript' ? '2588' : '2322'}')`)
    result.semanticError = await evaluate(`window.a02.worker.getSemanticDiagnostics(window.a02.model.uri.toString())`)
    await evaluate(`window.a02.model.setValue('const value = 1;')`)
    await wait(`window.a02.editor.getModelMarkers({resource:window.a02.model.uri}).length===0`)
    result.corrected = await evaluate(`(async () => ({syntax:await window.a02.worker.getSyntacticDiagnostics(window.a02.model.uri.toString()),semantic:await window.a02.worker.getSemanticDiagnostics(window.a02.model.uri.toString())}))()`)
    assert.deepEqual(result.corrected, { syntax: [], semantic: [] })
    evidence.diagnostics.push(result)
    await evaluate(`window.a02.instance.dispose();window.a02.model.dispose();window.a02.node.remove()`)
  }
  evidence.workers = await evaluate(`(async () => {
    const a=window.a02,results=[];
    for(const kind of ['css','html','json']) {
      const text=kind==='css'?'.card { color: #12; }':kind==='html'?'<di':'{"value": }';
      const model=a.editor.createModel(text,kind,a.uri.parse('inmemory:///a02.'+kind));
      const manager=new a.modes[kind].WorkerManager({languageId:kind,options:{validate:true,data:{useDefaultDataProvider:true}},
        diagnosticsOptions:{validate:true,enableSchemaRequest:false},onDidChange:()=>({dispose(){}})});
      try {
        const worker=await manager.getLanguageServiceWorker(model.uri),uri=model.uri.toString();
        if(kind==='html') {const completion=await worker.doComplete(uri,{line:0,character:3});results.push({kind,labels:completion.items.map(i=>i.label)});}
        else {const invalid=await worker.doValidation(uri);model.setValue(kind==='css'?'.card { color: red; }':'{"value": 1}');
          await manager.getLanguageServiceWorker(model.uri);results.push({kind,invalid,corrected:await worker.doValidation(uri)});}
      }finally{manager.dispose();model.dispose();}
    }
    return results;
  })()`)
  for (const record of evidence.workers) {
    if (record.kind === 'html') assert.ok(record.labels.includes('div'))
    else { assert.ok(record.invalid.length); assert.deepEqual(record.corrected, []) }
  }
  // Real Learning editor input via Chromium; no React source replacement.
  await evaluate(`window.a02.practice().focus()`)
  async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers })
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
  }
  await key('a', 'KeyA', 65, 2)
  const draft = 'function Sum(a,b){return a+b;} // Việt Ω'
  await win.webContents.debugger.sendCommand('Input.insertText', { text: draft })
  await wait(`window.a02.practice().getValue()===${JSON.stringify(draft)}`)
  const position = await evaluate(`window.a02.practice().getPosition()`)
  assert.equal(position.lineNumber, 1); assert.equal(position.column, draft.length + 1)
  // Invoke Monaco's actual selection command; CDP modifier-only ArrowLeft is
  // unreliable with Chromium's native EditContext and is not a native-key proof.
  await evaluate(`window.a02.practice().trigger('keyboard','cursorLeftSelect',{})`)
  const selection = await evaluate(`window.a02.practice().getSelection()`)
  assert.equal(selection.endColumn - selection.startColumn, 1)
  await pause(800)
  const persisted = await evaluate(`window.studentIde.learning.practice.load()`)
  assert.equal(persisted.ok, true)
  assert.equal(persisted.value.state.drafts.find(d => d.exerciseId === 'ch2-01' && d.language === 'javascript').code, draft)
  await click('[aria-label="Reset Code"]')
  await evaluate(`document.querySelector('.practice-confirm button:last-child').click()`)
  assert.equal(await evaluate(`window.a02.practice().getValue()`), draft)
  await click('[aria-label="Reset Code"]'); await evaluate(`document.querySelector('.practice-confirm button:first-of-type').click()`)
  const starter = persisted.value.exercises.find(e => e.id === 'ch2-01').languages.javascript.starter
  await wait(`window.a02.practice().getValue()===${JSON.stringify(starter)}`)
  // Restore the pre-reset buffer through Monaco's existing undo boundary.
  await evaluate(`window.a02.practice().focus()`); await key('z', 'KeyZ', 90, 2)
  await wait(`window.a02.practice().getValue()===${JSON.stringify(draft)}`)
  await pause(800)
  const saved = await evaluate(`window.studentIde.learning.practice.load()`)
  assert.equal(saved.value.state.drafts.find(d => d.exerciseId === 'ch2-01' && d.language === 'javascript').code, draft)
  await evaluate(`(() => {const s=document.querySelector('.practice-workspace select');s.value='csharp';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`window.a02.practice()?.getModel()?.uri.path.endsWith('.cs')`)
  await evaluate(`(() => {const s=document.querySelector('.practice-workspace select');s.value='javascript';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`window.a02.practice()?.getModel()?.uri.path.endsWith('.js')&&window.a02.practice().getValue()===${JSON.stringify(draft)}`)
  evidence.editor = { typing: true, position, selection, selectionMethod: 'Monaco cursorLeftSelect command', autosave: true, resetCancel: true, resetConfirm: true, undoReset: true, draftRestoreAfterLanguageSwitch: true,
    acceptedRestore: 'UNVERIFIED: production Accepted records are not supplied until Phase 9E' }
  await pause(1000)
  assert.deepEqual(evidence.exceptions, [])
  assert.ok(!evidence.console.some(e => /typescript.worker|ts.worker|reading.*get|worker.*error/i.test(e.message + e.source)))
  evidence.result = 'PASS'
  app.once('will-quit', () => { evidence.managedShutdown = true; writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ result: evidence.result, directory })) })
  app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error); evidence.stack = error.stack
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.error(error); app.exit(1)
})
