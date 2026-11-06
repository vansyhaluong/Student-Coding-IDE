/* global console, process, setTimeout */
// Isolated reproducer. No SH provider override, Run, Submit, network or app edits.
import { app, BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const scenario = process.argv.find(a => a.startsWith('--case='))?.slice(7) ?? 'baseline'
assert.ok(['baseline', 'diff', 'redo', 'resize-auto', 'resize-sync', 'resize-raf', 'resize-manual'].includes(scenario))
const directory = resolve('out', `sh3-diagnosis-${scenario}-${Date.now()}`)
const evidence = { scenario, result: 'NOT_OBSERVED', errors: [], trace: [], environment: process.versions }
let window
const pause = ms => new Promise(r => setTimeout(r, ms))
const until = async (check, label) => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await check()) return; await pause(40) }
  throw Error(`diagnostic observation timeout: ${label}`)
}
async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data'))
  delete process.env.ELECTRON_RENDERER_URL
  BrowserWindow.prototype.show = function () {}
  createRequire(import.meta.url)(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length, 'window')
  window = BrowserWindow.getAllWindows()[0]
  window.webContents.setBackgroundThrottling(false)
  window.webContents.on('console-message', e => { if (e.level === 'error') evidence.errors.push(e.message) })
  window.webContents.on('render-process-gone', (_e, details) => evidence.errors.push(details.reason))
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  await until(() => evaluate(`!!document.querySelector('script[type="module"][src]')`).catch(() => false), 'module')
  await evaluate(`(async()=>{
    const module=await import(document.querySelector('script[type="module"][src]').src);
    const api=Object.values(module).find(v=>v&&typeof v.createDiffEditor==='function');
    if(!api)throw Error('Missing Monaco API');
    const host=()=>{const h=document.createElement('div');h.style.cssText='position:absolute;inset:0;width:800px;height:400px;z-index:100';document.body.append(h);return h};
    globalThis.diagnostic={api,host,trace:[],stage:'ready'};
  })()`)
  if (scenario.startsWith('resize-')) {
    await evaluate(`(()=>{
      const d=diagnostic;d.container=d.host();d.container.style.cssText='position:absolute;left:24px;top:24px;width:calc(100vw - 48px);height:55vh;z-index:100';
      d.original=d.api.createModel('// original\\nreturn x + 0;', 'javascript');d.modified=d.api.createModel('// modified\\nreturn x + 1;', 'javascript');
      d.side=d.container.clientWidth>=900;d.frame=0;d.dead=false;
      d.ed=d.api.createDiffEditor(d.container,{readOnly:true,automaticLayout:${scenario !== 'resize-manual'},renderSideBySide:d.side});
      d.ed.setModel({original:d.original,modified:d.modified});
      const update=()=>{if(d.dead)return;const width=d.container.clientWidth,height=d.container.clientHeight,next=width>=900;
        if(next!==d.side){d.side=next;d.ed.updateOptions({renderSideBySide:next})}
        if(${JSON.stringify(scenario)}==='resize-manual')d.ed.layout({width,height});
        d.trace.push({event:'layout',width,height,side:d.side});
      };
      if(${JSON.stringify(scenario)}!=='resize-auto'){
        d.observer=new ResizeObserver(()=>{if(${JSON.stringify(scenario)}==='resize-sync')update();else if(!d.frame)d.frame=requestAnimationFrame(()=>{d.frame=0;update()})});d.observer.observe(d.container);
      }
    })()`)
    await until(() => evaluate('diagnostic.ed.getLineChanges()!==null'), 'computed resize diff')
    for (let cycle = 0; cycle < 4; cycle++) for (const [width, height] of [[1440, 1000], [900, 800]]) {
      window.setSize(width, height)
      await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
      await pause(100)
    }
    await evaluate(`(()=>{const d=diagnostic;d.dead=true;d.observer?.disconnect();cancelAnimationFrame(d.frame);d.ed.setModel(null);d.ed.dispose();d.original.dispose();d.modified.dispose();d.container.remove()})()`)
  } else if (scenario !== 'redo') {
    await evaluate(`(()=>{const d=diagnostic;d.liveContainer=d.host();d.liveModel=d.api.createModel('const item = { value: 1 };\\nitem.', 'javascript');d.live=d.api.create(d.liveContainer,{model:d.liveModel,automaticLayout:false});d.live.setPosition({lineNumber:2,column:6})})()`)
    for (let cycle = 0; cycle < 4; cycle++) {
      await evaluate(`(()=>{
        const d=diagnostic;d.stage='create-${scenario}-${cycle}';d.container=d.host();
        d.original=d.api.createModel('// baseline\\nreturn x + 0;', 'javascript');
        if(${JSON.stringify(scenario)}==='diff'){
          d.modified=d.api.createModel('// baseline\\nreturn x + 1;', 'javascript');
          d.ed=d.api.createDiffEditor(d.container,{automaticLayout:false,readOnly:true});
          d.ed.setModel({original:d.original,modified:d.modified});
        }else d.ed=d.api.create(d.container,{model:d.original,automaticLayout:false});
      })()`)
      if (scenario === 'diff') await until(() => evaluate('diagnostic.ed.getLineChanges()!==null'), 'computed diff')
      await evaluate(`(()=>{const d=diagnostic;d.stage='dispose-${cycle}';d.ed.setModel(null);d.ed.dispose();d.original.dispose();d.modified?.dispose();d.container.remove();d.trace.push(d.stage)})()`)
      await evaluate(`(()=>{const d=diagnostic;d.stage='live-suggest-${cycle}';d.live.focus();d.live.getAction('editor.action.triggerSuggest').run();d.trace.push(d.stage)})()`)
      await pause(300)
      await evaluate(`(()=>{const d=diagnostic;d.stage='replacement-${cycle}';d.container=d.host();d.original=d.api.createModel('// replacement\\nconst n = 1;', 'javascript');d.ed=d.api.create(d.container,{model:d.original,automaticLayout:false});d.ed.focus();d.ed.getAction('editor.action.triggerSuggest').run();d.trace.push(d.stage)})()`)
      await pause(200)
      await evaluate(`(()=>{const d=diagnostic;d.ed.setModel(null);d.ed.dispose();d.original.dispose();d.container.remove()})()`)
    }
  } else {
    await evaluate(`(()=>{const d=diagnostic;d.container=d.host();d.model=d.api.createModel('// 🐟\\r\\nreturn x + 0;\\r\\n// end','javascript');d.ed=d.api.create(d.container,{model:d.model,automaticLayout:false});d.ed.focus();d.source=d.model.getValue();d.candidate=d.source.replace('0;','1;');d.model.onDidChangeContent(e=>d.trace.push({event:'content',undo:e.isUndoing,redo:e.isRedoing,value:d.model.getValue(),version:d.model.getVersionId()}))})()`)
    const key = async (key, code, virtual) => {
      for (const type of ['keyDown', 'keyUp']) await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: virtual, modifiers: 2 })
    }
    for (let cycle = 0; cycle < 24; cycle++) {
      await evaluate(`(()=>{const d=diagnostic;d.stage='native-edit-${cycle}';d.ed.pushUndoStop();d.ed.executeEdits('diagnostic.baseline',[{range:{startLineNumber:2,startColumn:12,endLineNumber:2,endColumn:13},text:'1'}]);d.ed.pushUndoStop();d.ed.focus();d.trace.push({stage:d.stage,focus:d.ed.hasTextFocus(),canRedo:d.model.canRedo()})})()`)
      assert.equal(await evaluate('diagnostic.model.getValue()===diagnostic.candidate'), true)
      await key('z', 'KeyZ', 90)
      await until(() => evaluate('diagnostic.model.getValue()===diagnostic.source'), 'keyboard Undo')
      await evaluate(`diagnostic.trace.push({stage:'before-redo-${cycle}',focus:diagnostic.ed.hasTextFocus(),canRedo:diagnostic.model.canRedo(),active:document.activeElement.tagName})`)
      await key('y', 'KeyY', 89)
      await until(() => evaluate('diagnostic.model.getValue()===diagnostic.candidate'), 'keyboard Redo')
      await evaluate(`diagnostic.ed.trigger('diagnostic','undo',null)`)
      await until(() => evaluate('diagnostic.model.getValue()===diagnostic.source'), 'native reset Undo')
    }
  }
  await pause(300)
  evidence.trace = await evaluate('diagnostic.trace')
  assert.deepEqual(evidence.errors, [])
  evidence.result = 'PASS'
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error)
  if (window && !window.isDestroyed()) {
    evidence.trace = await window.webContents.executeJavaScript('diagnostic.trace').catch(() => [])
    evidence.stage = await window.webContents.executeJavaScript('diagnostic.stage').catch(() => null)
  }
}).finally(async () => {
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ result: evidence.result, scenario, directory, errorCount: evidence.errors.length,
    errors: [...new Set(evidence.errors.map(e => e.split('\n')[0]))] }))
  app.exit(evidence.result === 'PASS' ? 0 : 1)
})
