/* global console, process, setTimeout */
// Production bundle, secure window, real Renderer/Preload/IPC and native C# Jobs.
// Native instrumentation observes authority; only the final cleanup-query case injects a fault.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { release } from 'node:os'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { captureMonacoSourceAndRun, assertMonacoRunSource } from './learning-monaco-source-observer.mjs'

const require = createRequire(import.meta.url)
const diagnostic = process.argv.includes('--diagnostic')
const presentation = diagnostic || process.argv.includes('--presentation')
const directory = resolve('out', `${diagnostic ? 'learning-run-diagnostic' : presentation ? 'learning-result-ui' : 'learning-csharp-ui-step7'}-${Date.now()}`)
const trace = [], io = []
const mark = (event, data = {}) => { if (diagnostic) trace.push({ t: performance.now(), event, ...data }) }
const evidence = { result: 'NOT_OBSERVED', windows: release(), electron: process.versions.electron, checks: [], operations: [], isolation: [],
  limitations: presentation ? ['Presentation-only smoke; Windows 10/packaging and full Step 7 matrix not rerun']
    : ['Windows 10 and packaging not tested', 'Cleanup-query failure is an explicit native-boundary fault injection'], watchdog: false }
const pause = ms => new Promise(r => setTimeout(r, ms))
let window, native, failCleanup = false, label = 'startup', current, sourceCapture
const jobs = [], watches = [], snapshots = []
const until = async (check, name) => {
  const due = Date.now() + 45000
  while (Date.now() < due) { if (await check()) return; await pause(40) }
  throw Error(`Acceptance observation deadline: ${name}`)
}
const originalLoad = Module._load
Module._load = function (request, ...rest) {
  const loaded = originalLoad.call(this, request, ...rest)
  if (diagnostic && request === 'node:fs/promises' && !loaded.__diagnosticObserved) {
    Object.defineProperty(loaded, '__diagnosticObserved', { value: true })
    for (const op of ['lstat', 'realpath', 'readdir', 'open', 'mkdir', 'writeFile', 'rename', 'rm']) {
      const original = loaded[op]
      loaded[op] = function (...args) {
        const file = String(args[0])
        const record = { t: performance.now(), op, name: file.split(/[\\/]/).pop(), bigint: !!args[1]?.bigint,
          group: /[\\/]dotnet[\\/]/i.test(file) ? 'sdk' : file.includes(directory) ? 'workspace' : 'other' }
        return original.apply(this, args).finally(() => { record.end = performance.now(); io.push(record) })
      }
    }
  }
  if (!String(request).endsWith('learning-job.node')) return loaded
  native = loaded
  return { capability: native.capability, acquireLease: native.acquireLease, state: native.state, watch: native.watch, observation: native.observation,
    start: (...args) => {
      for (const previous of jobs.filter(j => j.label === label)) {
        const sample = native.poll(previous.handle)
        assert.equal(sample.activeProcesses, 0); assert.deepEqual(sample.members, [])
        assert.equal(sample.observerSettled, true); assert.equal(sample.stdinSettled, true)
        assert.ok(sample.retained.every(p => p.signaled)); assert.equal(native.state(previous.handle).handlesClosed, false)
      }
      mark('native-start-enter', { compiling: args[1].some(a => a.endsWith('csc.dll')) })
      const handle = native.start(...args), sample = native.poll(handle)
      mark('native-start-return', { pid: sample.rootPid })
      const compiling = args[1].some(a => a.endsWith('csc.dll'))
      assert.equal(sample.quotaBytes, compiling ? 2147483648 : 536870912)
      assert.ok(sample.members.includes(sample.rootPid)); assert.equal(sample.retained[0].signaled, false)
      const job = { handle, label, compiling, pid: sample.rootPid, quota: sample.quotaBytes, releases: 0, closes: 0, inputCase: null,
        runtimeVersion: args[1][2], sdkVersion: args[1].find(a => a.endsWith('csc.dll'))?.match(/[\\/]sdk[\\/]([^\\/]+)[\\/]/)?.[1] ?? null }
      jobs.push(job); watches.push(native.watch(sample.rootPid))
      return handle
    },
    submitInput: (handle, input) => {
      const job = jobs.find(j => j.handle === handle)
      if (input.length) job.inputCase = JSON.parse(input.toString()).caseIndex
      native.submitInput(handle, input)
    },
    poll: handle => {
      if (failCleanup && native.state(handle).terminated) throw { code: 'LEARNING_QUERY', win32: 5 }
      const sample = native.poll(handle), job = jobs.find(j => j.handle === handle)
      if (diagnostic && job && !job.exitObserved && sample.retained.some(p => p.pid === sample.rootPid && p.signaled)) {
        job.exitObserved = true
        mark('process-exit-observed', { pid: sample.rootPid, compiling: job.compiling, caseIndex: job.inputCase, exitCode: sample.exitCode })
      }
      return sample
    },
    control: (handle, operation) => {
      mark('native-control', { operation, pid: jobs.find(j => j.handle === handle)?.pid })
      native.control(handle, operation)
      const job = jobs.find(j => j.handle === handle)
      if (operation === 'release') job.releases++
      if (operation === 'closeHandles') job.closes++
    } }
}
const summary = s => ({ sessionId: s.sessionId, generation: s.generation, sequence: s.sequence, phase: s.phase, reason: s.reason,
  cleanup: s.cleanup, bytes: Buffer.byteLength(JSON.stringify(s)), csharp: s.csharp && { schema: s.csharp.schema, failure: s.csharp.result.failure,
    compile: s.csharp.result.compile && { status: s.csharp.result.compile.status, diagnostics: s.csharp.result.compile.diagnostics },
    cases: s.csharp.result.cases.map(c => ({ caseIndex: c.caseIndex, outcome: c.outcome, actual: c.actual, failure: c.failure,
      stdoutBytes: Buffer.byteLength(c.stdout), stderrBytes: Buffer.byteLength(c.stderr) })), notRunCaseIndices: s.csharp.result.notRunCaseIndices } })
const observe = s => {
  if (!s?.sessionId) return
  mark('snapshot', { phase: s.phase, sequence: s.sequence, reason: s.reason, cleanup: s.cleanup })
  const observed = summary(s); assert.ok(observed.bytes <= 1048576)
  snapshots.push(observed); if (current && s.sessionId === current.sessionId) current = observed
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => originalHandle(channel, channel.startsWith('exercise:') ? async (event, ...args) => {
  mark('ipc-enter', { channel })
  if (channel === 'exercise:run' && args[0]?.language === 'csharp') {
    // Capture is assigned before the real click; await it before admitting work.
    const capture = await sourceCapture
    assertMonacoRunSource(args[0], capture)
    mark('source-verified', { uri: capture.uri, version: capture.version, length: capture.source.length,
      sha256: createHash('sha256').update(capture.source).digest('hex') })
  }
  const result = await listener(event, ...args)
  mark('ipc-return', { channel, ok: result.ok, error: result.error })
  if (channel === 'exercise:run') {
    if (result.ok) { current = summary(result.value); current.label = label }
    else evidence.checks.push({ language: args[0]?.language, code: result.error?.code, label })
  }
  if (result.ok) observe(result.value)
  return result
} : listener)

async function main() {
  await mkdir(join(directory, 'user-data'), { recursive: true })
  const project = join(directory, 'project'); await mkdir(project)
  await writeFile(join(project, 'heartbeat.js'), "console.log('PROJECT_READY');setInterval(()=>console.log('BEAT'),100)")
  app.setPath('userData', join(directory, 'user-data')); delete process.env.ELECTRON_RENDERER_URL
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] })
  BrowserWindow.prototype.show = function () {}
  require(resolve('out/main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'production window')
  window = BrowserWindow.getAllWindows()[0]; window.setSize(1440, 1000); window.webContents.setBackgroundThrottling(false)
  window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const send = window.webContents.send.bind(window.webContents)
  window.webContents.send = (channel, ...args) => { if (channel === 'exercise:changed') observe(args[0]); return send(channel, ...args) }
  const frame = window.webContents.mainFrame, frameSend = frame.send.bind(frame)
  frame.send = (channel, ...args) => { if (channel === 'exercise:changed') observe(args[0]); return frameSend(channel, ...args) }
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()` ) }
  const screenshot = async name => {
    await pause(100) // Allow the committed React layout/resize to paint in the hidden test window.
    await writeFile(join(directory, name), (await window.webContents.capturePage()).toPNG())
  }
  const prefs = window.webContents.getLastWebPreferences()
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  let projectRun, terminal
  if (!diagnostic) {
  const opened = await evaluate('window.studentIde.project.open()'); assert.equal(opened.ok, true)
  await evaluate(`globalThis.projectText='';globalThis.terminalText='';globalThis.projectState='';
    window.studentIde.run.onEvent(e=>{if(e.type==='stdout')projectText+=e.data;if(e.type==='state')projectState=e.session.state});
    window.studentIde.terminal.onEvent(e=>{if(e.type==='data')terminalText+=e.data});true`)
  projectRun = await evaluate(`window.studentIde.run.start({projectId:${JSON.stringify(opened.value.id)},relativePath:'heartbeat.js',dirty:false})`)
  assert.equal(projectRun.ok, true)
  terminal = await evaluate(`window.studentIde.terminal.create({projectId:${JSON.stringify(opened.value.id)},cols:80,rows:24})`)
  assert.equal(terminal.ok, true)
  }
  async function isolation(name) {
    const before = await evaluate('projectText.length'), marker = `ISOLATION_${Date.now()}`
    const result = await evaluate(`window.studentIde.terminal.input({sessionId:${JSON.stringify(terminal.value.sessionId)},data:${JSON.stringify(`echo ${marker}\r`)}})`)
    assert.equal(result.ok, true)
    await wait(`projectText.length>${before} && terminalText.includes(${JSON.stringify(marker)})`)
    assert.equal(await evaluate('projectState'), 'RUNNING')
    evidence.isolation.push({ name, heartbeat: true, ptyRoundTrip: true })
  }
  if (!diagnostic) await isolation('before Learning')
  async function enter() {
    await click('[aria-label="Open Learning"]')
    await click(`#learning-chapters button:nth-child(${diagnostic ? 3 : 2})`)
    await click('.learning-section-nav [data-tabs-value="practice"]')
    // Registry-backed public pages are asynchronous. Do not skip opening the
    // exercise merely because the row has not arrived in this animation frame.
    await wait(`!!document.querySelector('.practice-row') || !!document.querySelector('.practice-workspace .monaco-editor textarea')`)
    if (await evaluate(`!!document.querySelector('.practice-row')`)) await click('.practice-row')
    await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
  }
  await enter()
  async function code(text) {
    await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
    // Browser input with focus emulation supports a hidden acceptance window;
    // production Monaco/onChange and the real UI draft remain authoritative.
    await evaluate(`(document.querySelector('.practice-workspace .native-edit-context') ?? document.querySelector('.practice-workspace .monaco-editor textarea')).focus()`)
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await window.webContents.debugger.sendCommand('Input.insertText', { text })
    await pause(150)
  }
  async function run(name, text, expectedFailure, partial = false) {
    label = name; current = undefined
    await code(text); await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    mark('click-dispatch-start')
    sourceCapture = evaluate(`(${captureMonacoSourceAndRun.toString()})()`)
    await sourceCapture
    await until(() => current?.sessionId, 'admission')
    if (partial) return
    await until(() => current?.phase === 'finished', `${name} completion`)
    assert.equal(current.cleanup.cleanupComplete, true); assert.equal(current.cleanup.proof, 'VERIFIED')
    await wait(`!document.querySelector('[aria-label="Run"]').disabled`)
    if (diagnostic) {
      if (current.reason === 'COMPLETED' && !current.csharp?.failure) {
        await wait(`document.querySelector('.practice-result-header [role="status"]')?.textContent==='Đã chạy xong'`)
        const row = current.csharp.cases[0]
        assert.equal(await evaluate(`document.querySelector('[aria-label="Actual Case 1"]')?.textContent`), JSON.stringify(row.actual))
      } else {
        await wait(`!!document.querySelector('.practice-result-header [role="alert"]')`)
      }
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      mark('ui-publication', { text: await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`) })
    }
    const textResult = await evaluate(`document.querySelector('[id^="test-result-panel-"]').textContent`)
    assert.ok(!/Accepted|Wrong Answer/.test(textResult))
    evidence.operations.push({ name, ...current })
    assert.equal(current.csharp.failure?.kind ?? null, expectedFailure)
    console.log(JSON.stringify({ name, reason: current.reason, failure: current.csharp.failure?.kind ?? null }))
  }
  if (diagnostic) {
    const saved = JSON.parse(await readFile(join(process.env.APPDATA, 'coding-ide', 'learning', 'drafts.json'), 'utf8'))
    const draft = saved.data.drafts.find(d => d.exerciseId === 'ch3-01' && d.language === 'csharp')
    assert.ok(draft, 'Existing diagnostic sample draft must be present')
    evidence.classification = 'SINGLE_RUN_DIAGNOSTIC_OBSERVATION'
    evidence.sample = { exerciseId: draft.exerciseId, language: draft.language, sourceOrigin: 'existing saved draft' }
    await run('current-saved-sample', draft.code, null)
    assert.equal(current.reason, 'COMPLETED')
    await screenshot('result.png')
    assert.equal(trace.filter(t => t.event === 'ipc-enter' && t.channel === 'exercise:run').length, 1)
    assert.equal(trace.filter(t => t.event === 'ipc-enter' && t.channel === 'exercise:stop').length, 0)
    assert.ok(jobs.filter(j => j.compiling).length <= 1)
    if (current.csharp.compile?.status === 'SUCCEEDED') assert.equal(jobs.filter(j => j.compiling).length, 1)
    evidence.execution = { reason: current.reason, failure: current.csharp.failure, cleanup: current.cleanup }
    evidence.checks = ['exact pre-click Monaco model/IPC source assertion; one Run; phase/native trace; terminal UI publication']
  } else {
  const sum = 'public class Solution { public int Sum(int a,int b) { System.Console.WriteLine("console Ω"); return a+b; } }'
  await run('sum', sum, null)
  assert.deepEqual(current.csharp.cases.map(c => c.actual), [8, 0])
  assert.equal(jobs.filter(j => j.label === 'sum' && j.compiling).length, 1)
  assert.equal(jobs.filter(j => j.label === 'sum' && !j.compiling).length, 2)
  await wait(`document.querySelector('[aria-label="Actual Case 1"]')?.textContent==='8' && !document.querySelector('[aria-label="Actual Case 2"]')`)
  await click('#result-case-ch2-01-1')
  await wait(`document.querySelector('[aria-label="Actual Case 2"]')?.textContent==='0' && !document.querySelector('[aria-label="Actual Case 1"]')`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Expected Case 2"]').textContent`), '0')
  await click('#result-case-ch2-01-0')
  await wait(`document.querySelector('.practice-result-header [role="status"]')?.textContent==='Đã chạy xong'`)
  await click('[aria-label="Phóng to panel kiểm thử"]')
  await wait(`document.querySelector('.practice-tests').dataset.size==='expanded' && document.querySelector('[aria-label="Actual Case 1"]')?.textContent==='8'`)
  await screenshot('actual-results.png')
  window.setSize(1100, 900)
  await wait(`document.querySelector('.practice-result-detail').clientWidth > 0 && document.querySelector('.practice-result-detail').scrollWidth <= document.querySelector('.practice-result-detail').clientWidth`)
  await screenshot('narrow-result.png')
  window.setSize(1440, 1000)
  await click('[aria-label="Khôi phục kích thước panel"]')
  await isolation('after real samples')
  await run('syntax', 'public class Solution { public int Sum(int a,int b) => a+; }', 'COMPILE_ERROR')
  assert.equal(current.csharp.compile.diagnostics.some(d => d.severity === 'error'), true)
  await wait(`!!document.querySelector('[aria-label="Compiler diagnostics"]')`)
  if (presentation) {
    await click('[aria-label="Phóng to panel kiểm thử"]')
    await wait(`document.querySelector('.practice-tests').dataset.size==='expanded'`)
    await screenshot('compile-error.png')
    await click('[aria-label="Khôi phục kích thước panel"]')
  }
  if (!presentation) {
  await run('signature', 'public class Solution { public string Sum(int a,int b) => "wrong"; }', 'COMPILE_ERROR')
  }
  await run('runtime-middle', 'public class Solution { public int Sum(int a,int b) { if(a!=14) throw new System.Exception("private error"); return a+b; } }', 'RUNTIME_ERROR')
  assert.deepEqual(current.csharp.cases.map(c => c.outcome), ['RETURNED', 'FAILED'])
  await run('timeout', 'public class Solution { public int Sum(int a,int b) { while(true) {} } }', 'TIMEOUT')
  assert.deepEqual(current.csharp.notRunCaseIndices, [1])
  await click('#result-case-ch2-01-1')
  await wait(`document.querySelector('[aria-label="Output Case 2"]')?.textContent.includes('NOT_RUN') && !document.querySelector('[aria-label="Actual Case 2"]')`)
  if (presentation) {
    await click('[aria-label="Phóng to panel kiểm thử"]')
    await wait(`document.querySelector('.practice-tests').dataset.size==='expanded'`)
    await screenshot('not-run.png')
  }
  await isolation('after timeout')
  if (!presentation) {
  await run('output', "public class Solution { public int Sum(int a,int b) { System.Console.Write(new string('x',1100000)); return a+b; } }", 'OUTPUT_LIMIT')
  await run('memory', 'using System; using System.Runtime.InteropServices; public class Solution { [DllImport("kernel32.dll")] static extern IntPtr VirtualAlloc(IntPtr p, UIntPtr n, uint type, uint protection); public int Sum(int a,int b) { VirtualAlloc(IntPtr.Zero,new UIntPtr(600u*1024*1024),0x3000,4); System.Threading.Thread.Sleep(500); return 0; } }', 'JOB_MEMORY_LIMIT')
  const looping = 'public class Solution { public int Sum(int a,int b) { while(true) {} } }'
  await run('language-cancel', looping, null, true)
  await until(() => jobs.some(j => j.label === label && !j.compiling), 'executing before language switch')
  const retired = { sessionId: current.sessionId, generation: current.generation }
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');s.value='javascript';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await wait(`!document.querySelector('[aria-label="Actual Case 1"]') && !document.querySelector('[aria-label="Run"]').disabled`)
  await until(() => jobs.filter(j => j.label === 'language-cancel').every(j => native.state(j.handle).handlesClosed), 'cancellation native cleanup')
  label = 'javascript'; current = undefined; await click('[aria-label="Run"]')
  await wait(`document.querySelector('.practice-tests [role="alert"]')?.textContent.includes('chưa có backend')`)
  assert.equal(evidence.checks.at(-1).code, 'UNSUPPORTED')
  assert.equal(await evaluate(`document.querySelector('.practice-heading button[title^="Submit"]').disabled`), true)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.practice-heading button')).some(b=>/^(Stop|Cancel)$/.test(b.textContent||b.ariaLabel))`), false)
  const stale = await evaluate(`window.studentIde.learning.exercise.snapshot(${JSON.stringify(retired)})`)
  assert.equal(stale.ok, false)
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');s.value='csharp';s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await run('exercise-cancel', looping, null, true)
  await until(() => jobs.some(j => j.label === label && !j.compiling), 'executing before exercise switch')
  await click('.practice-heading button:first-child'); await wait(`!!document.querySelector('.practice-list')`)
  await evaluate(`document.querySelectorAll('.practice-row')[1].click()`)
  await wait(`!!document.querySelector('.practice-workspace') && !document.querySelector('[aria-label="Actual Case 1"]')`)
  await until(() => jobs.filter(j => j.label === 'exercise-cancel').every(j => native.state(j.handle).handlesClosed), 'exercise cancellation cleanup')
  // Return to the first catalogue signature without changing production content.
  await click('.practice-heading button:first-child'); await click('.practice-row')
  await run('leave-cancel', looping, null, true)
  await until(() => jobs.some(j => j.label === label && !j.compiling), 'executing before leaving')
  await click('[aria-label="Back to Project"]')
  await until(() => jobs.filter(j => j.label === 'leave-cancel').every(j => native.state(j.handle).handlesClosed), 'leaving cleanup')
  await isolation('after leaving Learning')
  await enter()
  await run('reload-owner-loss', looping, null, true)
  await until(() => jobs.some(j => j.label === label && !j.compiling), 'executing before reload')
  const beforeReload = { sessionId: current.sessionId, generation: current.generation }
  const loaded = new Promise(r => window.webContents.once('did-finish-load', r)); window.webContents.reload(); await loaded
  await until(() => jobs.filter(j => j.label === 'reload-owner-loss').every(j => native.state(j.handle).handlesClosed), 'reload owner loss cleanup')
  await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
  assert.equal((await evaluate(`window.studentIde.learning.exercise.snapshot(${JSON.stringify(beforeReload)})`)).ok, false)
  evidence.checks.push('real navigation/reload invalidates Learning owner, cleans Jobs and rejects stale results')
  // Reload also retires document-owned Project/PTY subscriptions; create fresh real sessions.
  const reopened = await evaluate('window.studentIde.project.getActive()'); assert.equal(reopened.ok, true)
  await evaluate(`window.studentIde.run.stop(${JSON.stringify(projectRun.value.sessionId)})`)
  await evaluate(`window.studentIde.terminal.close({sessionId:${JSON.stringify(terminal.value.sessionId)}})`)
  await evaluate(`globalThis.projectText='';globalThis.terminalText='';globalThis.projectState='';window.studentIde.run.onEvent(e=>{if(e.type==='stdout')projectText+=e.data;if(e.type==='state')projectState=e.session.state});window.studentIde.terminal.onEvent(e=>{if(e.type==='data')terminalText+=e.data});true`)
  const secondRun = await evaluate(`window.studentIde.run.start({projectId:${JSON.stringify(reopened.value.id)},relativePath:'heartbeat.js',dirty:false})`); assert.equal(secondRun.ok, true)
  const secondTerminal = await evaluate(`window.studentIde.terminal.create({projectId:${JSON.stringify(reopened.value.id)},cols:80,rows:24})`); assert.equal(secondTerminal.ok, true)
  terminal.value = secondTerminal.value
  await enter()
  failCleanup = true; await run('cleanup-failure', sum, null, true)
  await until(() => current?.cleanup.state === 'FAILED', 'retained cleanup failure')
  await wait(`document.querySelector('[aria-label="Run"]').disabled && document.querySelector('.practice-tests [role="status"]')?.textContent.includes('Chưa thu hồi')`)
  assert.equal(current.cleanup.cleanupComplete, false); assert.ok(jobs.some(j => j.label === 'cleanup-failure' && !native.state(j.handle).released))
  await isolation('during retained Learning cleanup failure')
  evidence.operations.push({ name: 'cleanup-failure-retained', ...current })
  failCleanup = false
  }
  evidence.checks.push('C# UI production Run, diagnostics/failures/NOT_RUN, lifecycle cancellation, JavaScript UNSUPPORTED and disabled Submit verified')
  if (presentation) evidence.checks = ['presentation-only smoke: real sample source/actuals, case switching, catalogue Input/Expected, compile/runtime errors, timeout/NOT_RUN, narrow layout and managed shutdown']
  }
  evidence.hashes = Object.fromEntries(await Promise.all(['out/main/index.js','out/preload/index.js','out/main/native/learning/learning-job.node',
    'scripts/smoke-learning-csharp-run.mjs', 'scripts/learning-monaco-source-observer.mjs'].map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])))
  app.once('will-quit', () => {
    try {
      for (const job of jobs) { assert.equal(native.state(job.handle).handlesClosed, true); assert.equal(job.releases, 1); assert.equal(job.closes, 1) }
      for (const handle of watches) { assert.equal(native.observation(handle, 'identity').signaled, true); native.observation(handle, 'close') }
      evidence.jobs = jobs.map(job => ({ label: job.label, compiling: job.compiling, pid: job.pid, quota: job.quota,
        releases: job.releases, closes: job.closes, inputCase: job.inputCase, runtimeVersion: job.runtimeVersion, sdkVersion: job.sdkVersion }))
      evidence.snapshots = snapshots
      if (diagnostic) { evidence.trace = trace; evidence.io = io }
      evidence.result = 'PASS'; evidence.checks.push(presentation
        ? 'managed shutdown; all identities signaled and handles closed once'
        : 'managed shutdown retried retained Learning cleanup; all identities signaled and handles closed once')
      writeFileSync(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ result: evidence.result, directory, checks: evidence.checks }))
    } catch (error) { evidence.result='FAIL'; evidence.failure=String(error); writeFileSync(join(directory,'evidence.json'),JSON.stringify(evidence,null,2)); process.exitCode=1 }
  })
  app.quit()
}
void main().catch(async error => {
  failCleanup = false; evidence.result = 'FAIL'; evidence.failure = String(error); console.error(error)
  evidence.snapshots = snapshots
  if (diagnostic) { evidence.trace = trace; evidence.io = io; evidence.execution = current }
  if (window && !window.isDestroyed()) {
    evidence.ui = await window.webContents.executeJavaScript(`document.querySelector('.practice-tests')?.textContent`).catch(() => null)
    await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {})
  }
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  // Failed-run containment is never used as successful cleanup evidence.
  app.exit(1)
})
