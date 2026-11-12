// Offline smoke against the actual packaged executable; no production test hooks.
import process from 'node:process'
import console from 'node:console'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, cp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { setTimeout as pause } from 'node:timers/promises'
import { setTimeout, clearTimeout } from 'node:timers'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(join(tmpdir(), 'student-ide-packaged-'))
const p2 = process.argv.includes('--p2')
const exeIndex = process.argv.indexOf('--exe')
const originalExe = exeIndex < 0 ? join(root, 'release/win-unpacked/Student Coding IDE.exe') : resolve(process.argv[exeIndex + 1] ?? '')
if (p2) await cp(dirname(originalExe), join(temp, 'Relocated IDE # Việt'), { recursive: true })
const exe = p2 ? join(temp, 'Relocated IDE # Việt/Student Coding IDE.exe') : originalExe
const resources = join(dirname(exe), 'resources')
const env = { ...process.env }
delete env.GEMINI_API_KEY
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
if (p2) {
  delete env.DOTNET_ROOT
  delete env.DOTNET_ROOT_X64
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = env[pathKey].split(';').filter(entry => !/spikes|\.tools|coding-ide/i.test(entry)).join(';')
  assert.match(execFileSync(join(resources, 'csharp-ls/csharp-ls.exe'), ['--version'],
    { cwd: temp, env, windowsHide: true, encoding: 'utf8', timeout: 30000 }), /^csharp-ls,\s+0\.27\.0\s/)
}
// Load packaged assets under the bundled Electron ABI, with a foreign cwd.
execFileSync(exe, ['-e', `
const assert = require('node:assert/strict'), path = require('node:path');
const r = ${JSON.stringify(resources)}, app = path.join(r, 'app.asar');
assert.equal(require(path.join(app,'node_modules/node-pty')).supportsWindowsJobOwnership(), 'student-coding-ide-windows-job-v1');
for (const name of ['run-process.node','learning/learning-job.node','smart-hints-key.node']) require(path.join(app,'out/main/native',name));
(async () => {
  const {openBundledExerciseResources} = require(path.join(app,'out/main/exercise-package-resources-runtime.js'));
  await openBundledExerciseResources({packaged:true,resourcesPath:r});
  const {MainSelectionFixGuard} = require(path.join(app,'out/main/selection-fix-runtime.js'));
  const guard = new MainSelectionFixGuard({assetDirectory:path.join(r,'smart-hints-parser')});
  for (const language of ['javascript','csharp']) {
    const scope = {signal:new AbortController().signal,clock:()=>performance.now(),deadline:performance.now()+30000,check(){}};
    assert.equal(await guard.availability(language,scope),true,language+' parser unavailable');
  }
  console.log('Packaged native ABI, anchored Learning resources and JS/C# parser probes PASS');
})().catch(() => { console.error('Packaged resource/parser probe failed');process.exitCode=1 });
`], { cwd: temp, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true, timeout: 60000 })

const server = createServer()
await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port
await new Promise(done => server.close(done))
await mkdir(join(temp, 'profile'))
const projectId = 'project_0123456789abcdef01234567'
if (p2) {
  const project = join(temp, 'CSharp project # Việt')
  await mkdir(project)
  await writeFile(join(project, 'Packaging.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>')
  await writeFile(join(project, 'Program.cs'), 'using System;\nConsole.WriteLine("PACKAGED_CSHARP_RUN");\n')
  await writeFile(join(project, 'hello.js'), 'console.log("PACKAGED_JAVASCRIPT_RUN");\n')
  await writeFile(join(project, 'NuGet.Config'), '<configuration><packageSources><clear/></packageSources></configuration>')
  execFileSync('dotnet', ['restore', 'Packaging.csproj', '--configfile', 'NuGet.Config'],
    { cwd: project, env, windowsHide: true, stdio: 'pipe', timeout: 60000 })
  await writeFile(join(temp, 'profile/app-state.json'), JSON.stringify({ schemaVersion: 2, data: {
    settings: { theme: 'dark', fontSize: 13, tabSize: 2, autoSave: false },
    recentProjects: [{ id: projectId, name: 'Packaging', rootPath: project, lastOpenedAt: new Date().toISOString() }],
  } }))
}
// A normal visible application window is required for the native Windows close
// request below; windowsHide would leave MainWindowHandle unavailable.
const child = spawn(exe, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${join(temp, 'profile')}`, '--no-first-run'], { cwd: temp, env, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
child.stderr.on('data', bytes => { stderr += bytes.toString() })
const closed = new Promise((done, reject) => { child.on('error', reject); child.on('close', (code, signal) => done({ code, signal })) })
let socket
try {
  let target
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      target = (await (await globalThis.fetch(`http://127.0.0.1:${port}/json/list`)).json())
        .find(item => item.type === 'page' && item.url.includes('app.asar'))
      if (target) break
    } catch { /* Main/Chromium startup is bounded by the deadline. */ }
    await pause(200)
  }
  assert.ok(target, 'Packaged renderer did not load')
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data), entry = pending.get(result.id)
    if (!entry) return
    pending.delete(result.id); clearTimeout(entry.timer)
    if (result.error) entry.reject(Error(result.error.message)); else entry.done(result.result)
  })
  const call = (method, params) => new Promise((done, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout')) }, 240000)
    pending.set(id, { done, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  let ready = false
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const probe = await call('Runtime.evaluate', { returnByValue: true,
        expression: `document.readyState==='complete' && !!window.studentIde && !!document.querySelector('[aria-label="Open Learning"]')` })
      if (probe.result?.value === true) { ready = true; break }
    } catch { /* Navigation replaces the initial about:blank execution context. */ }
    await pause(200)
  }
  assert.ok(ready, 'Packaged renderer/Preload readiness timed out')
  if (p2) {
    const languageProbe = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
      const pause=ms=>new Promise(r=>setTimeout(r,ms));
      const until=async(read,accept,label)=>{const due=Date.now()+65000;let last;while(Date.now()<due){last=await read();if(accept(last))return last;await pause(200)}throw Error(label+': '+JSON.stringify(last));};
      const api=window.studentIde;
      const opened=await api.project.openRecent(${JSON.stringify(projectId)});if(!opened.ok||!opened.value)throw Error('Open recent failed');
      const id=opened.value.id;
      await until(async()=>document.querySelector('[title="Program.cs"]'),Boolean,'Program.cs in Explorer');
      document.querySelector('[title="Program.cs"]').click();
      const bundle=await import(document.querySelector('script[type="module"][src]').src);
      const monaco=Object.values(bundle).find(v=>v&&typeof v.getEditors==='function');
      const editor=await until(async()=>monaco?.getEditors().find(e=>e.getModel()?.getLanguageId()==='csharp'),Boolean,'C# Monaco');
      const initial=editor.getValue();
      const status=await until(()=>api.language.getStatus(id),r=>r.ok&&r.value.service.state==='RUNNING'&&r.value.workspace.state==='READY','C# RUNNING/READY');
      // Filter the virtualized list so WriteLine is rendered in its visible rows.
      editor.setValue('using System;\\nConsole.Wri');editor.setPosition({lineNumber:2,column:12});editor.focus();
      await until(async()=>{editor.trigger('packaging','editor.action.triggerSuggest',{});return document.querySelector('.suggest-widget.visible')?.innerText},r=>r?.includes('WriteLine'),'Monaco WriteLine completion');
      editor.trigger('packaging','hideSuggestWidget',{});
      editor.setValue('using System;\\nint x = "bad";\\nConsole.WriteLine(x);\\n');
      const markers=await until(async()=>monaco.getModelMarkers({resource:editor.getModel().uri}),r=>r.some(m=>String(m.code)==='CS0029'),'Monaco CS0029 diagnostics');
      editor.setValue(initial);editor.focus();
      editor.getDomNode().dispatchEvent(new KeyboardEvent('keydown',{key:'s',code:'KeyS',keyCode:83,which:83,ctrlKey:true,bubbles:true,cancelable:true}));
      await until(async()=>monaco.getModelMarkers({resource:editor.getModel().uri}),r=>!r.some(m=>String(m.code)==='CS0029'),'diagnostics clear');
      await pause(1000);
      const runs=[];
      // Project Run currently exposes JavaScript only; the C# Run regression
      // below uses the existing Learning C# execution domain.
      for(const [relativePath,expected] of [['hello.js','PACKAGED_JAVASCRIPT_RUN']]){
        let output='',exit;const unsubscribe=api.run.onEvent(event=>{if(event.type==='stdout')output+=event.data;if(event.type==='exit')exit=event;});
        try{const started=await api.run.start({projectId:id,relativePath,dirty:false});if(!started.ok)throw Error('Run start: '+JSON.stringify(started));
          await until(async()=>exit,Boolean,'Project Run exit');if(exit.exitCode!==0||!output.includes(expected))throw Error('Project Run failed: '+JSON.stringify({relativePath,exit,output}));runs.push(relativePath);
        }finally{unsubscribe();}
      }
      return {provider:status.value.providerId,dependency:status.value.dependency.state,service:status.value.service.state,workspace:status.value.workspace.state,completion:'WriteLine',diagnostic:markers.find(m=>String(m.code)==='CS0029').code,runs};
    })()` })
    if (languageProbe.exceptionDetails) throw Error(JSON.stringify(languageProbe.exceptionDetails))
    console.info(JSON.stringify({ smoke: 'relocated-packaged-csharp-monaco', ...languageProbe.result.value }))
  }
  const evaluation = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const wait = ms => new Promise(done => setTimeout(done,ms));
    const until = async (read,accept) => {
      const deadline = Date.now()+65000;
      while (Date.now()<deadline) {const value = await read();if(accept(value))return value;await wait(100)}
      throw Error('Packaged runtime deadline');
    };
    await until(async () => window.studentIde,Boolean);
    const api = window.studentIde;
    const lifecycle = await until(() => api.lifecycle.getStatus(),r => r.ok && r.value.state==='RUNNING');
    await until(async () => document.querySelector('[aria-label="Open Learning"]'),Boolean);
    document.querySelector('[aria-label="Open Learning"]')?.click();
    await until(async () => document.querySelectorAll('#learning-chapters button').length,r => r===8);
    document.querySelectorAll('#learning-chapters button')[1].click();
    await until(async () => document.querySelector('[id$="-practice-tab"]'),Boolean);
    document.querySelector('[id$="-practice-tab"]').click();
    // The normal catalogue reader has a single package lease; wait for its UI
    // readiness before admitting independent smoke requests.
    await until(async () => document.querySelectorAll('.practice-row').length,r => r>0);
    const course = await api.learning.getCourse();
    const practice = await api.learning.practice.list({limit:10});
    const settings = await api.settings.smartHints.get();
    const workers = await Promise.all(['editor','typescript','javascript','html','css','json'].map(label => new Promise((resolve,reject) => {
      const worker = globalThis.MonacoEnvironment.getWorker('',label);
      const timer = setTimeout(() => {worker.terminate();resolve(label)},1000);
      worker.addEventListener('error',() => {clearTimeout(timer);worker.terminate();reject(Error(label))},{once:true});
    })));
    const execution = [];
    for (const language of ['javascript','csharp']) {
      const request = {exerciseId:'ch2-01',language,sourceRevision:1,code:language==='javascript'
        ? 'function Sum(a,b){return a+b;}' : 'public class Solution { public int Sum(int a,int b) { return a+b; } }'};
      const started = await api.learning.exercise.run(request);
      if(!started.ok)throw Error('Sample start: '+JSON.stringify(started));
      const reference = {sessionId:started.value.sessionId,generation:started.value.generation};
      const sample = await until(() => api.learning.exercise.snapshot(reference),r => r.ok && r.value.phase==='finished');
      if(sample.value.reason!=='COMPLETED'||sample.value.cleanup.proof!=='VERIFIED')throw Error('Sample: '+JSON.stringify(sample));
      const submitted = await api.learning.submission.submit(request);
      if(!submitted.ok)throw Error('Submit start: '+JSON.stringify(submitted));
      const judged = await until(() => api.learning.submission.status(submitted.value.reference),r => r.ok && r.value.stage==='SETTLED');
      if(judged.value.verdict!=='Accepted'||judged.value.storage.state!=='saved')throw Error('Judge: '+JSON.stringify(judged));
      execution.push({language,sample:sample.value.reason,cleanup:sample.value.cleanup.proof,verdict:judged.value.verdict,storage:judged.value.storage.state});
    }
    return { lifecycle, execution, chapters:course.ok ? course.value.materials.length : -1,
      exercises:practice.ok ? practice.value.items.length : -1,
      ai:settings.ok ? {enabled:settings.value.enabled,hasKey:settings.value.hasKey,state:settings.value.state} : null,
      workers, nodeAccess:typeof window.require, url:location.href };
  })()` })
  assert.equal(evaluation.exceptionDetails, undefined, 'Renderer probe threw')
  const result = evaluation.result.value
  assert.equal(result.lifecycle.value.state, 'RUNNING')
  assert.equal(result.chapters, 8); assert.ok(result.exercises > 0)
  assert.equal(result.nodeAccess, 'undefined')
  assert.deepEqual(result.ai, { enabled: false, hasKey: false, state: 'DISABLED' })
  console.info(JSON.stringify({ smoke: 'actual-packaged-window', ...result }))
  // Use the real Windows close request, which goes through BrowserWindow's
  // unsaved/draft approval and managed shutdown (CDP Page.close is different).
  const closeRequested = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-Process -Id ${child.pid}).CloseMainWindow()`], { windowsHide: true, encoding: 'utf8' }).trim()
  assert.equal(closeRequested, 'True', 'Windows close request was not delivered')
  const exit = await Promise.race([closed, pause(15000).then(() => { throw Error('Packaged shutdown timed out') })])
  assert.equal(exit.code, 0, 'Packaged app exited abnormally')
  assert.ok(!/Unhandled|Uncaught|Error invoking remote|invalid handle/i.test(stderr), 'Packaged stderr contains a runtime error')
  console.info('Packaged startup, file:// workers, IPC, offline AI defaults and clean exit PASS')
} finally {
  socket?.close()
  if (child.exitCode === null) child.kill()
}
