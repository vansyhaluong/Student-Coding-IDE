/* global console, process, setTimeout, structuredClone */
// Step 6 only. Loads the unchanged production application; faults are labelled
// native-boundary test instrumentation. Never replaces IPC responses or actuals.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { release } from 'node:os'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { captureMonacoSourceAndRun, assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const group = process.argv[2] ?? 'functional'
const directory = resolve(process.argv[3] ?? join('out', `learning-javascript-step6-${group}-${Date.now()}`))
const evidence = { group, result: 'IN_PROGRESS', environment: { windows: release(), electron: process.versions.electron,
  electronNode: process.version, arch: process.arch, abi: process.versions.modules }, operations: [],
  console: [], exceptions: [], isolation: [], jobs: [], leases: [], transport: [], network: [], failures: [], watchdog: false }
const require = createRequire(import.meta.url), pause = ms => new Promise(r => setTimeout(r, ms))
const jobs = [], leases = [], watches = new Map(), snapshots = []
const originalPath = process.env.PATH
let native, window, current, capture, label = 'startup', fault = '', blockCleanup = false, observerFaulted = false
let catalog, projectRun, terminal, activeSource, projectId
let sendEvent, holdNextSnapshot = false, heldReply
const flush = () => writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
async function until(check, name, ms = 45000) {
  const due = performance.now() + ms
  while (performance.now() < due) { if (await check()) return; await pause(25) }
  throw Error(`Observation deadline: ${name}; a timeout/watchdog is never cleanup proof`)
}
function observe(s) {
  if (!s?.sessionId) return
  assert.ok(Buffer.byteLength(JSON.stringify(s)) <= 1048576)
  snapshots.push({ label, sessionId: s.sessionId, generation: s.generation, sequence: s.sequence, phase: s.phase,
    sourceRevision: s.sourceRevision, language: s.language, exerciseId: s.exerciseId, cleanup: s.cleanup, reason: s.reason })
  if (current?.sessionId === s.sessionId && s.sequence >= current.sequence) current = s
}
const originalLoad = Module._load
Module._load = function (name, ...args) {
  const loaded = originalLoad.call(this, name, ...args)
  if (!String(name).endsWith('learning-job.node')) return loaded
  native = loaded
  return { capability: native.capability, state: native.state, watch: native.watch,
    acquireLease: path => {
      const handle = native.acquireLease(path)
      if (handle) leases.push({ handle, path, closed: false })
      return handle
    },
    observation: (handle, op) => {
      const result = native.observation(handle, op)
      if (op === 'close') { const lease = leases.find(l => l.handle === handle); if (lease) lease.closed = true }
      return result
    },
    start: (exe, args, cwd, quota, env) => {
      const mode = args.at(-1) === 'syntax' || args.some(a=>a.endsWith('csc.dll')) ? 'syntax'
        : args.at(-1) === 'execute' || /dotnet\.exe$/i.test(exe) && args.some(a=>a.endsWith('.dll')) ? 'execute' : 'prepare'
      for (const previous of jobs.filter(j => j.label === label)) {
        const s = native.poll(previous.handle)
        assert.equal(s.activeProcesses, 0); assert.deepEqual(s.members, [])
        assert.equal(s.observerSettled, true); assert.equal(s.stdinSettled, true)
        assert.ok(s.retained.every(p => p.signaled)); assert.equal(native.state(previous.handle).handlesClosed, false)
      }
      let changed = args
      const preload = text => ['--import', 'data:text/javascript,' + encodeURIComponent(text), ...args]
      if (fault === mode + '-hang') changed = preload('for(;;){}')
      if (mode === 'execute' && fault === 'protocol') changed = preload('process.stdout.write("unframed");')
      if (mode === 'execute' && fault === 'output') changed = preload('process.stdout.write(" ".repeat(600000));')
      if (mode === 'execute' && fault === 'descendant') changed = preload('import{spawn}from"node:child_process";spawn(process.execPath,["--eval","setTimeout(()=>{},180)"],{stdio:"ignore"});')
      const handle = native.start(mode === 'execute' && fault === 'launch' ? join(cwd, 'absent-acceptance.exe') : exe, changed, cwd, quota, env)
      const s = native.poll(handle)
      assert.equal(s.quotaBytes, mode === 'syntax' ? 2147483648 : 536870912)
      assert.ok(s.members.includes(s.rootPid)); assert.ok(s.retained.some(p => p.pid === s.rootPid && !p.signaled))
      const job = { handle, label, mode, cwd, executable: exe, quota, pid: s.rootPid, rawBytes: 0,
        inputBytes: 0, inputCase: null, releases: 0, closes: 0, events: [], totalProcesses: 1, settled: false,
        injected: changed !== args || fault === 'launch', started: performance.now() }
      jobs.push(job); watches.set(`${s.rootPid}:${s.retained[0].created}`, native.watch(s.rootPid))
      return handle
    },
    submitInput: (handle, input) => {
      const job = jobs.find(j => j.handle === handle)
      job.inputBytes += input.length
      if (input.length) job.inputCase = JSON.parse(input.toString()).caseIndex
      native.submitInput(handle, input)
    },
    poll: handle => {
      const s = native.poll(handle), job = jobs.find(j => j.handle === handle)
      job.rawBytes += s.stdout.length + s.stderr.length
      job.events.push(...s.events); job.totalProcesses = Math.max(job.totalProcesses, s.totalProcesses)
      job.settled = s.stdinSettled && s.observerSettled && s.activeProcesses === 0 && s.retained.every(p => p.signaled)
      job.finalSample = { stdinSettled: s.stdinSettled, observerSettled: s.observerSettled,
        coverageComplete: s.coverageComplete, activeProcesses: s.activeProcesses, retained: s.retained, exitCode: s.exitCode }
      for (const p of s.retained) if (!p.signaled && !watches.has(`${p.pid}:${p.created}`)) watches.set(`${p.pid}:${p.created}`, native.watch(p.pid))
      if (job.mode === 'prepare' && s.stdout.length) {
        try { const r = JSON.parse(s.stdout.toString()); if (r.version) evidence.environment.installedNode = { version: r.version, arch: r.architecture, execPath: r.execPath } } catch { /* A chunk may be partial; original parser remains authority. */ }
      }
      if (fault === 'observer' && job.mode === 'execute' && !observerFaulted) { observerFaulted = true; throw { code: 'LEARNING_QUERY', win32: 5 } }
      if (fault === 'history') return { ...s, totalProcesses: s.totalProcesses + 1, coverageComplete: false }
      return s
    },
    control: (handle, op) => {
      if (blockCleanup && op === 'terminate') throw { code: 'LEARNING_QUERY', win32: 5 }
      native.control(handle, op)
      const job = jobs.find(j => j.handle === handle)
      if (op === 'release') job.releases++
      if (op === 'closeHandles') job.closes++
    } }
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => originalHandle(channel, channel.startsWith('exercise:') ? async (event, ...args) => {
  if (channel === 'exercise:run' && capture) assertMonacoRunSource(args[0], await capture)
  const result = await listener(event, ...args)
  if(channel==='exercise:snapshot' && holdNextSnapshot) {
    holdNextSnapshot=false
    await new Promise(resolve=>{heldReply=resolve})
  }
  evidence.transport.push({ label, channel, ok: result.ok, code: result.error?.code })
  if (channel === 'exercise:run' && result.ok) current = result.value
  if (result.ok) observe(result.value)
  return result
} : listener)
const evaluate = code => { evidence.stage = code; return window.webContents.executeJavaScript(code, true) }
const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
async function click(selector) { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
async function language(value) {
  await evaluate(`(()=>{const s=document.querySelector('.practice-workspace select');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`document.querySelector('.practice-workspace select')?.value===${JSON.stringify(value)} && !!document.querySelector('.practice-workspace .monaco-editor textarea')`)
}
async function openExercise(id, lang = 'javascript') {
  if (await evaluate(`!!document.querySelector('.practice-workspace')`)) await click('.practice-heading button:first-child')
  await click(`#learning-chapters button:nth-child(${Number(id[2])})`)
  await click('.learning-section-nav [data-tabs-value="practice"]')
  const exercise = catalog.find(e => e.id === id)
  await evaluate(`Array.from(document.querySelectorAll('.practice-row')).find(e=>e.textContent.includes(${JSON.stringify(exercise.title)})).click()`)
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`); await language(lang)
}
async function edit(source) {
  activeSource = source
  await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  await evaluate(`(document.querySelector('.practice-workspace .native-edit-context')??document.querySelector('.practice-workspace .monaco-editor textarea')).focus()`)
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await window.webContents.debugger.sendCommand('Input.insertText', { text: source }); await pause(100)
}
async function start(name, source, injected = '') {
  label = name; fault = injected; observerFaulted = false; current = undefined
  await edit(source); await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
  capture = evaluate(`(${captureMonacoSourceAndRun.toString()})()`)
  const captured = await capture; assert.equal(captured.source, activeSource)
  await until(() => current?.sessionId, name + ' admission')
}
async function audit(name, s, allowQuarantine = false) {
  assert.equal(s.cleanup.proof, allowQuarantine ? 'HISTORY_UNVERIFIED' : 'VERIFIED')
  assert.equal(s.cleanup.cleanupComplete, !allowQuarantine)
  const owned = jobs.filter(j => j.label === name)
  assert.ok(owned.every(j => native.state(j.handle).released && native.state(j.handle).handlesClosed))
  const root = join(app.getPath('userData'), 'learning', 'exercise-runtime')
  assert.equal(existsSync(join(root, 'sessions', s.sessionId)), allowQuarantine)
  const checkpoint = JSON.parse(await readFile(join(root, 'checkpoints', s.sessionId + '.json'), 'utf8'))
  evidence.operations.push({ name, classification: fault ? 'REAL_PRODUCTION_WITH_LABELLED_NATIVE_BOUNDARY_FAULT' : 'REAL_PRODUCTION_CATALOGUE',
    status: 'PASS', snapshot: s, checkpoint, rawBytes: owned.reduce((n,j) => n+j.rawBytes,0), jobs: owned.length })
}
async function run(name, source, expected, kind = null, injected = '') {
  const began=performance.now()
  await start(name, source, injected)
  await until(() => current?.phase === 'finished', name + ' final', injected === 'syntax-hang' ? 40000 : 45000)
  const s = structuredClone(current), result = s.javascript?.result ?? s.csharp?.result
  assert.equal(result.failure?.kind ?? null, kind, name)
  if (expected) assert.deepEqual(result.cases.map(c => c.actual), expected, name)
  assert.equal(s.language === 'javascript' ? s.csharp : s.javascript, undefined)
  await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
  for (const row of result.cases) if (row.outcome === 'RETURNED') {
    await click(`#result-case-${s.exerciseId}-${row.caseIndex}`)
    await wait(`document.querySelector('[aria-label="Actual Case ${row.caseIndex+1}"]')?.textContent===${JSON.stringify(JSON.stringify(row.actual))}`)
  }
  const ui = await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`)
  assert.ok(!/Accepted|Wrong Answer|Passed|Failed/.test(ui)); assert.ok(!/private-stack-marker|node:vm|Harness\.mjs|Source\.json/.test(ui))
  assert.equal(await evaluate(`document.querySelector('button[title^="Submit"]').disabled`), true)
  if (kind && result.notRunCaseIndices.length) {
    const index = result.notRunCaseIndices[0]
    await click(`#result-case-${s.exerciseId}-${index}`)
    await wait(`document.querySelector('[aria-label="Output Case ${index+1}"]')?.textContent.includes('NOT_RUN')`)
  }
  await audit(name, s, injected === 'history')
  const elapsedMs=performance.now()-began;evidence.operations.at(-1).elapsedMs=elapsedMs
  if(injected==='prepare-hang')assert.ok(elapsedMs>=10000&&elapsedMs<16000)
  if(injected==='syntax-hang')assert.ok(elapsedMs>=30000&&elapsedMs<37000)
  await flush()
  console.log(JSON.stringify({ name, kind, reason: s.reason, jobs: jobs.filter(j=>j.label===name).length }))
  return s
}
async function isolation(name) {
  const before = await evaluate('projectText.length'), marker = `STEP6_${Date.now()}`
  const r = await evaluate(`window.studentIde.terminal.input({sessionId:${JSON.stringify(terminal.sessionId)},data:${JSON.stringify('echo '+marker+'\r')}})`)
  assert.equal(r.ok, true)
  await wait(`projectText.length>${before} && terminalText.includes(${JSON.stringify(marker)})`)
  assert.equal(await evaluate('projectState'), 'RUNNING'); evidence.isolation.push({ name, heartbeat: true, ptyRoundTrip: true })
}
async function cancel(name, mode, trigger) {
  await start(name, 'function Sum(){for(;;){}}', mode === 'execute' ? '' : mode + '-hang')
  await until(() => jobs.some(j => j.label === name && j.mode === mode), name + ' phase')
  const reference = { sessionId: current.sessionId, generation: current.generation }
  if (trigger === 'language') await language('csharp')
  else if (trigger === 'exercise') { await click('.practice-heading button:first-child'); await click('.practice-row:nth-child(3)') }
  else if (trigger === 'leave') await click('[aria-label="Back to Project"]')
  else if (trigger === 'pagehide') await evaluate(`window.dispatchEvent(new Event('pagehide'))`)
  else if (trigger === 'reload') {
    const loaded = new Promise(r => window.webContents.once('did-finish-load', r)); window.webContents.reload(); await loaded
  }
  await until(() => jobs.filter(j => j.label === name).every(j => native.state(j.handle).handlesClosed), name + ' cancellation cleanup')
  const stale = await evaluate(`window.studentIde.learning.exercise.snapshot(${JSON.stringify(reference)})`)
  assert.equal(stale.ok, false)
  evidence.operations.push({ name, status: 'PASS', classification: 'REAL_PRODUCTION_LIFECYCLE', reference,
    trigger, nativeHandlesClosed: true, staleRejected: true })
  if (trigger === 'leave') await click('[aria-label="Open Learning"]')
  if (trigger === 'pagehide' || trigger === 'reload') {
    if (trigger === 'pagehide') { const loaded = new Promise(r=>window.webContents.once('did-finish-load',r)); window.webContents.reload(); await loaded }
    await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`); await click('[aria-label="Open Learning"]')
  }
  await openExercise('ch2-01'); await flush()
}
async function main() {
  await mkdir(join(directory,'user-data'),{recursive:true}); app.setPath('userData',join(directory,'user-data'))
  delete process.env.ELECTRON_RENDERER_URL; BrowserWindow.prototype.show=function(){}
  const project=join(directory,'project'); await mkdir(project); await writeFile(join(project,'heartbeat.js'),"console.log('READY');setInterval(()=>console.log('BEAT'),100)")
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]})
  require(resolve('out/main/index.js'))
  await until(()=>BrowserWindow.getAllWindows().length,'production window'); window=BrowserWindow.getAllWindows()[0]
  window.setSize(1440,1000); window.webContents.setBackgroundThrottling(false)
  window.webContents.debugger.attach('1.3')
  window.webContents.debugger.on('message',(_event,method,params)=>{
    if(method==='Runtime.exceptionThrown') evidence.exceptions.push({label,...params.exceptionDetails})
  })
  window.webContents.on('console-message',event=>{ if(event.level==='error') evidence.console.push({label,message:event.message,source:event.sourceId,line:event.lineNumber}) })
  await window.webContents.debugger.sendCommand('Runtime.enable')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true})
  await window.webContents.debugger.sendCommand('Network.enable')
  await window.webContents.debugger.sendCommand('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,done)=>{evidence.network.push({url:details.url,cancelled:true});done({cancel:true})})
  evidence.offline={rendererNetworkOffline:true,remoteRequestsBlocked:true,noRuntimeDownload:true,noNpmInstall:true,wholeMachineNicDisabled:false}
  const preferences=window.webContents.getLastWebPreferences();assert.equal(preferences.sandbox,true);assert.equal(preferences.contextIsolation,true);assert.equal(preferences.nodeIntegration,false)
  const frame=window.webContents.mainFrame,send=frame.send.bind(frame);sendEvent=send
  frame.send=(channel,...args)=>{if(channel==='exercise:changed')observe(args[0]);return send(channel,...args)}
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  const loaded=await evaluate('window.studentIde.learning.practice.load()');assert.equal(loaded.ok,true);catalog=loaded.value.exercises
  evidence.catalogueTypes={returns:[...new Set(catalog.map(e=>e.returnType))],parameters:[...new Set(catalog.flatMap(e=>e.parameters.map(p=>p.type)))]}
  if(group==='isolation') {
    const opened=await evaluate('window.studentIde.project.open()');assert.equal(opened.ok,true);projectId=opened.value.id
    await evaluate(`globalThis.projectText='';globalThis.terminalText='';globalThis.projectState='';window.studentIde.run.onEvent(e=>{if(e.type==='stdout')projectText+=e.data;if(e.type==='state')projectState=e.session.state});window.studentIde.terminal.onEvent(e=>{if(e.type==='data')terminalText+=e.data});true`)
    const r=await evaluate(`window.studentIde.run.start({projectId:${JSON.stringify(projectId)},relativePath:'heartbeat.js',dirty:false})`);assert.equal(r.ok,true);projectRun=r.value
    const t=await evaluate(`window.studentIde.terminal.create({projectId:${JSON.stringify(projectId)},cols:80,rows:24})`);assert.equal(t.ok,true);terminal=t.value
    await isolation('before Learning')
  }
  await click('[aria-label="Open Learning"]');await openExercise('ch2-01')
  if(group==='functional') {
    await run('int32','function Sum(a,b){return a+b;}',[8,0])
    await run('int32-boundaries','function Sum(a,b){return a===14?-2147483648:2147483647;}',[-2147483648,2147483647])
    await openExercise('ch3-01');await run('boolean','function IsEven(n){return n%2===0;}',[true,false])
    await openExercise('ch5-04');await run('unicode-string','function ReverseWords(){return "Việt Ω 😀";}',['Việt Ω 😀','Việt Ω 😀'])
    await openExercise('ch5-03');await run('string-array-input','function CommonPrefix(words){return words.join("|");}',catalog.find(e=>e.id==='ch5-03').samples.map(s=>s.args[0].join('|')))
    await openExercise('ch2-04');await run('int32-array','function Divide(a,b){return [Math.floor(a/b),a%b];}',[[4,5],[0,3]])
    await run('empty-int32-array','function Divide(){return [];}',[[],[]])
    await openExercise('ch8-02');await run('rectangular-matrix','function Transpose(m){return m[0].map((_,i)=>m.map(r=>r[i]));}',[[[1,2],[3,4],[5,6]],[[7]]])
    await run('empty-matrix','function Transpose(){return [];}',[[],[]])
    evidence.productionStringArrayReturn={status:'UNVERIFIED',reason:'Unchanged production catalogue has no string[] return exercise; native real-harness regression covers string[] returns. No custom cases or catalogue changes added.'}
  } else if(group==='errors') {
    const invalids=[['wrong-type','"8"'],['undefined','undefined'],['nan','NaN'],['infinity','Infinity'],['range','2147483648'],['bigint','1n'],['null','null'],['object','({})'],['thenable','({then(){}})'],['promise','Promise.resolve(8)']]
    for(const [name,value]of invalids)await run(name,'function Sum(){return '+value+';}',null,'RUNTIME_ERROR')
    await run('async','async function Sum(){return 8;}',null,'RUNTIME_ERROR')
    await run('missing-function','function Different(){return 8;}',null,'RUNTIME_ERROR')
    await run('runtime-middle','function Sum(a,b){if(a===0)throw Error("private-stack-marker");return a+b;}',null,'RUNTIME_ERROR')
    assert.deepEqual(current.javascript.result.cases.map(c=>c.outcome),['RETURNED','FAILED'])
    await run('syntax','function Sum(a,b){return a+;}',null,'SYNTAX_ERROR')
    await run('esm-import','import fs from "node:fs";function Sum(){return 8;}',null,'SYNTAX_ERROR')
    await run('esm-export','export function Sum(){return 8;}',null,'SYNTAX_ERROR')
    await run('commonjs-npm','function Sum(){return require("some-package");}',null,'RUNTIME_ERROR')
    await run('commonjs-module','module.exports={};function Sum(){return 8;}',null,'RUNTIME_ERROR')
    await run('timeout-middle','function Sum(a,b){if(a===0)for(;;){};return a+b;}',null,'TIMEOUT')
    process.env.PATH='';await run('missing-node','function Sum(a,b){return a+b;}',null,'NODE_MISSING');process.env.PATH=originalPath
    const invalid=join(directory,'invalid-node');await mkdir(invalid);await writeFile(join(invalid,'node.exe'),'invalid PE candidate')
    process.env.PATH=invalid;await run('invalid-node','function Sum(a,b){return a+b;}',null,'NODE_INCOMPATIBLE');process.env.PATH=originalPath
  } else if(group==='faults') {
    await run('protocol','function Sum(a,b){return a+b;}',null,'PROTOCOL_FAILURE','protocol')
    await run('raw-cumulative-output','function Sum(a,b){return a+b;}',null,'OUTPUT_LIMIT','output')
    assert.ok(jobs.filter(j=>j.label==='raw-cumulative-output').reduce((n,j)=>n+j.rawBytes,0)>1048576)
    await run('native-launch','function Sum(a,b){return a+b;}',null,'INFRASTRUCTURE_FAILURE','launch')
    await run('native-observer','function Sum(a,b){return a+b;}',null,'INFRASTRUCTURE_FAILURE','observer')
    await run('descendant','function Sum(a,b){return a+b;}',[8,0],null,'descendant')
    assert.ok(jobs.some(j=>j.label==='descendant'&&j.totalProcesses>1))
    await run('prepare-deadline','function Sum(a,b){return a+b;}',null,'TIMEOUT','prepare-hang')
    await run('syntax-deadline','function Sum(a,b){return a+b;}',null,'TIMEOUT','syntax-hang')
    await run('memory','function Sum(a,b){if(a===0){let x=[];for(;;)x.push(new Array(1048576).fill(1));}return a+b;}',null,'JOB_MEMORY_LIMIT')
    assert.ok(jobs.filter(j=>j.label==='memory').some(j=>j.events.some(e=>e.message===10)))
  } else if(group==='syntax-timeout-repro') {
    await run('syntax-timeout-repro','function Sum(a,b){return a+b;}',null,'TIMEOUT','syntax-hang')
  } else if(group==='prepare-timeout-repro') {
    const snapshot=await run('prepare-timeout-repro','function Sum(a,b){return a+b;}',null,'TIMEOUT','prepare-hang')
    assert.equal(snapshot.reason,'PREPARE_TIMEOUT')
    assert.deepEqual(snapshot.javascript.result,{syntax:null,cases:[],notRunCaseIndices:[0,1],
      failure:{kind:'TIMEOUT',phase:'prepare',caseIndex:null}})
  } else if(group==='lifecycle') {
    await cancel('cancel-prepare','prepare','language');await cancel('cancel-syntax','syntax','language')
    await cancel('cancel-language','execute','language');await cancel('cancel-exercise','execute','exercise')
    await cancel('cancel-leave','execute','leave');await cancel('cancel-pagehide','execute','pagehide');await cancel('cancel-reload','execute','reload')
    await run('after-context-cleanup','function Sum(a,b){return a+b;}',[8,0])
  } else if(group==='isolation') {
    await start('while-project-pty','function Sum(){for(;;){}}');await until(()=>jobs.some(j=>j.label===label&&j.mode==='execute'),'live execute')
    await isolation('while real Learning execute active');await until(()=>current.phase==='finished','Learning timeout')
    await audit(label,current);await isolation('after Learning timeout')
  } else if(group==='console') {
    label='before-run-edit-only';await edit('function Sum(a,b){return a+b;}');await pause(1200)
    evidence.beforeRunConsole=evidence.exceptions.length
    await run('console-run','function Sum(a,b){return a+b;}',[8,0])
    await language('csharp');label='csharp-edit-only';await edit('public class Solution { public int Sum(int a,int b){return a+b;} }');await pause(1200)
    await language('javascript');await run('console-after-switch','function Sum(a,b){return a+b;}',[8,0])
  } else if(group==='shutdown') {
    await start('active-managed-shutdown','function Sum(){for(;;){}}')
    await until(()=>jobs.some(j=>j.label===label&&j.mode==='execute'),'active before shutdown')
  } else if(group==='retained') {
    blockCleanup=true;await start('retained-cleanup','function Sum(a,b){return a+b;}')
    await until(()=>current?.cleanup.state==='FAILED','retained cleanup')
    assert.equal(current.cleanup.cleanupComplete,false)
    capture=undefined
    const rejected=await evaluate(`window.studentIde.learning.exercise.run({exerciseId:'ch2-01',language:'javascript',code:'function Sum(){return 8;}',sourceRevision:999})`)
    assert.equal(rejected.ok,false);evidence.retained={snapshot:current,readmissionRejected:true}
    blockCleanup=false
  } else if(group==='history') {
    await start('history-quarantine','function Sum(a,b){return a+b;}','history')
    await until(()=>current?.phase==='finished','historical gap finalization')
    assert.equal(current.cleanup.processClean,false);assert.equal(current.cleanup.cleanupComplete,false)
    await audit('history-quarantine',current,true)
  } else if(group==='stale') {
    await run('stale-baseline','function Sum(a,b){return a+b;}',[8,0])
    const final=structuredClone(current),before=await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`)
    for(const change of [
      {sequence:final.sequence-1}, {sessionId:'exercise_12345678-1234-4234-8234-123456789abc',sequence:999},
      {generation:final.generation+1,sequence:999}, {sourceRevision:final.sourceRevision+1,sequence:999},
      {exerciseId:'ch2-02',sequence:999}, {language:'csharp',sequence:999}, {csharp:{},sequence:999},
      {stdout:'x'.repeat(1048576),sequence:999},
    ]) sendEvent('exercise:changed',{...final,...change})
    await pause(100)
    assert.equal(await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`),before)
    holdNextSnapshot=true
    await run('late-snapshot-after-event','function Sum(a,b){return a+b+1;}',[9,1])
    await until(()=>!!heldReply,'held genuine invoke reply')
    heldReply();await pause(100)
    assert.equal(await evaluate(`document.querySelector('.practice-result-header [role="status"]').textContent`),'Đã chạy xong')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Actual Case 2"]').textContent`),'1')
    evidence.stale={wrongSessionGenerationSequenceRevisionContextAndOversizeRejected:true,lateGenuineInvokePreservesNewerFinalEvent:true}
  } else if(group==='paths') {
    await run('baseline-path','function Sum(a,b){return a+b;}',[8,0])
    const exe=jobs[0].executable,alias=join(directory,'Node Việt nvm space');symlinkSync(dirname(exe),alias,'junction')
    process.env.PATH=alias.toUpperCase();await run('space-unicode-case-junction','function Sum(a,b){return a+b;}',[8,0]);process.env.PATH=originalPath
  }
  if(group==='isolation') {
    await language('csharp')
    await run('csharp-real-regression','public class Solution { public int Sum(int a,int b){return a+b;} }',[8,0])
    await isolation('after C# regression');await evaluate(`window.studentIde.run.stop(${JSON.stringify(projectRun.sessionId)})`)
    await evaluate(`window.studentIde.terminal.close({sessionId:${JSON.stringify(terminal.sessionId)}})`)
  }
  evidence.hashes=Object.fromEntries(await Promise.all(['out/main/index.js','out/preload/index.js','out/main/native/learning/learning-job.node','scripts/accept-learning-javascript-run.mjs'].map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])))
  evidence.snapshots=snapshots
  app.once('will-quit',()=>{
    try {
      assert.ok(jobs.every(j=>native.state(j.handle).released&&native.state(j.handle).handlesClosed&&j.releases===1&&j.closes===1))
      const identities=[...watches.values()].map(h=>native.observation(h,'identity'));assert.ok(identities.every(p=>p.signaled))
      for(const h of watches.values())native.observation(h,'close')
      assert.ok(leases.every(l=>l.closed));evidence.identities=identities
      evidence.jobs=jobs.map(({handle,...j})=>({...j,state:native.state(handle)}));evidence.leases=leases.map(l=>({path:l.path,closed:l.closed}))
      evidence.managedShutdown=true;evidence.result=evidence.failures.length?'FAIL':'PASS'
    } catch(error){evidence.result='FAIL';evidence.failure=String(error);process.exitCode=1}
    writeFileSync(join(directory,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({result:evidence.result,group,directory,jobs:jobs.length}))
  })
  await flush();app.quit()
}
void main().catch(async error=>{
  blockCleanup=false;process.env.PATH=originalPath;process.exitCode=1;evidence.result='FAIL';evidence.failure=String(error);evidence.snapshots=snapshots;evidence.finalSnapshot=current
  evidence.jobs=jobs.map(({handle,...j})=>({...j,state:native.state(handle)}));console.error(error)
  if(window&&!window.isDestroyed()) {
    evidence.ui=await evaluate(`document.querySelector('.practice-tests')?.textContent`).catch(()=>null)
    await writeFile(join(directory,'failure.png'),(await window.webContents.capturePage()).toPNG()).catch(()=>{})
  }
  await flush();app.once('will-quit',()=>app.exit(1));app.quit()
})
