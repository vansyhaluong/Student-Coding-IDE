// @ts-nocheck -- Dedicated Electron host for the approved R6 spike only.
import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile, access, lstat, symlink, rm, cp } from 'node:fs/promises'
import { readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { PolicySession, until, pause } from './policy-b-runtime'
import { readCheckpoint, identity } from './policy-b-checkpoint'
import { recover, safeRemove } from './policy-b-recovery'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../../src/main/app/application-quit-coordinator'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { RunService } from '../../src/main/services/run/run-service'
import { WindowsPipedProcessAdapter as ProjectAdapter } from '../../src/main/services/run/windows-piped-process-adapter'
import { ProjectService } from '../../src/main/services/project/project-service'
import { TerminalService } from '../../src/main/services/terminal/terminal-service'
import { NodePtyPort } from '../../src/main/services/terminal/node-pty-adapter'
import { WindowsProcessTreeTerminator } from '../../src/main/services/process/windows-process-tree-terminator'

const arg = key => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const config = JSON.parse(readFileSync(arg('config'), 'utf8')), id = arg('case'), mode = arg('mode') ?? 'test'
const caseRoot = resolve(arg('case-root')), root = join(caseRoot, 'learning'), records = [], sessions = [], observers = []
const nativePath = join(config.output, 'exercise-process.node'), native = createRequire(__filename)(nativePath)
if (!caseRoot.startsWith(resolve(config.output) + '\\')) throw Error('Host outside isolated artifact root')
app.setPath('userData', join(caseRoot, `userData-${mode}`)); app.setPath('crashDumps', join(caseRoot, 'crashes'))
const exists = async p => { try { await access(p); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
function json(path, value) { const temporary = `${path}.tmp`; writeFileSync(temporary, JSON.stringify(value, null, 2)); renameSync(temporary, path) }
function persist() { json(join(caseRoot, 'results.json'), { hostPid: process.pid, embeddedNode: process.versions.node, electron: process.versions.electron, id, records }) }
async function test(name, fn) {
  const r = { name, started: new Date().toISOString(), monotonicStart: performance.now() }
  try { await fn(r); r.status ??= 'PASS' }
  catch (e) { r.status = 'FAIL'; r.error = { name: e.name, message: e.message, stack: String(e.stack).slice(0, 2400) }; throw e }
  finally { r.elapsedMs = performance.now() - r.monotonicStart; records.push(r); persist(); console.log(`${r.status}: ${name}`) }
}
async function session() { const s = new PolicySession(root, nativePath); sessions.push(s); await s.prepare(); return s }
async function fixture(s, source) { const path = join(s.workspace, 'fixture.cjs'); await writeFile(path, source); return path }
async function node(s = null, source = 'console.log("READY");setInterval(()=>{},1000)') {
  s ??= await session(); await s.launch(config.node, [await fixture(s, source)])
  await until(() => s.output.includes('READY')); if (s.capturesEnabled) s.scan(); return s
}
function observe(pid) { const h = native.watch(pid); observers.push(h); return h }
async function file(path) { await until(() => exists(path)); return JSON.parse(await readFile(path, 'utf8')) }
async function finished(s, r, requireClean = false) {
  assert.equal(s.released, true); assert.equal(s.nativeStage, 'HANDLES_CLOSED'); assert.equal(s.manager.size, 0)
  assert.equal(s.finalized, true); assert.deepEqual(s.beforeRelease, [])
  assert.ok(s.proof.allRetainedSignaled); assert.ok([...s.records.values()].every(x => x.signaled && x.closed))
  const record = await readCheckpoint(s.recordPath, root)
  if (s.proof.kind === 'VERIFIED') {
    assert.equal(s.processClean, true); assert.equal(s.cleanupComplete, true); assert.equal(await exists(s.workspace), false)
    assert.equal(record.checkpoint, 'CLEANUP_COMPLETE')
  } else {
    assert.equal(s.processClean, false); assert.equal(s.cleanupComplete, false); assert.equal(await exists(s.workspace), true)
    assert.equal(record.checkpoint, 'FINALIZED'); assert.equal(record.workspaceState, 'QUARANTINED')
  }
  if (requireClean) assert.equal(s.proof.kind, 'VERIFIED')
  r.session = s.summary(); r.record = record
}
async function heldHistory() {
  const s = await session(); s.capturesEnabled = false
  const release = join(s.workspace, 'release'), childFile = join(s.workspace, 'child.json'), grandFile = join(s.workspace, 'grand.json')
  const grand = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(grandFile)},JSON.stringify({pid:process.pid}));setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)`
  const child = `const fs=require('node:fs'),{spawn}=require('node:child_process');const p=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(grand)}],{detached:true,stdio:'ignore',windowsHide:true});p.unref();fs.writeFileSync(${JSON.stringify(childFile)},JSON.stringify({pid:process.pid,grand:p.pid}));setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)`
  await s.launch(config.node, [await fixture(s, `const fs=require('node:fs'),{spawn}=require('node:child_process');const p=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore',windowsHide:true});p.unref();setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)`)])
  const c = await file(childFile), g = await file(grandFile), members = native.jobMembers(s.handle)
  assert.ok(members.includes(c.pid)); assert.ok(members.includes(g.pid))
  const handles = members.map(observe)
  return { s, members, handles, release, child: c, grand: g }
}
async function releaseHistory(h) {
  await writeFile(h.release, 'release')
  await until(() => h.handles.every(p => native.waitState(p) === 'SIGNALED'))
}
async function baseline(r) {
  const s = await session(), childFile = join(s.workspace, 'child.json'), release = join(s.workspace, 'release-root')
  const childSource = 'setInterval(()=>{},1000)'
  await s.launch(config.node, [await fixture(s, `const fs=require('node:fs'),{spawn}=require('node:child_process');const c=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(childSource)}],{detached:true,stdio:'ignore',windowsHide:true});c.unref();fs.writeFileSync(${JSON.stringify(childFile)},JSON.stringify({pid:c.pid}));setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)`)])
  const child = await file(childFile); s.scan(); const childHandle = observe(child.pid)
  const before = native.jobMembers(s.handle); assert.ok(before.includes(s.rootPid)); assert.ok(before.includes(child.pid))
  r.before = before; r.members = before.map(pid => { const h = observe(pid); return { pid, image: native.processImage(h) } })
  await writeFile(release, 'release'); await until(() => s.exitCode !== null)
  const after = native.jobMembers(s.handle); assert.ok(!after.includes(s.rootPid)); assert.ok(after.includes(child.pid))
  assert.equal(native.waitState(childHandle), 'PENDING'); r.afterRoot = after
  await s.close(); assert.equal(native.waitState(childHandle), 'SIGNALED'); await finished(s, r, true)
}
function lifecycle(s, project = { name: 'Project', stop() {} }) {
  const trace = [], window = { name: 'WindowManager', stop() { trace.push('WindowManager') } }
  const dependency = { name: 'ProjectDependency', stop() { trace.push('ProjectDependency') } }
  const projectWrapper = { name: project.name, async stop() { trace.push('Project'); await project.stop() } }
  const learning = { name: 'Learning', start() {}, async stop() { trace.push('Learning'); await s.stop() } }
  const application = new DesktopApplication([learning, dependency, projectWrapper, window], { shutdownLast: [window] })
  let stopping = 0
  application.subscribe(status => { if (status.state === 'STOPPING') { stopping++; trace.push('STOPPING'); s.beginShutdown() } })
  return { application, trace, stopping: () => stopping }
}
async function shutdownTest(r) {
  const s = await node(); let rejecting = true, release
  const pending = new Promise(resolve => { release = resolve })
  const project = { name: 'Project', stop() { if (id === 'S03' && rejecting) throw Error('Injected Project cleanup'); if (id === 'S04') return pending } }
  const h = lifecycle(s, project); await h.application.start()
  if (id === 'S01') { await h.application.shutdown(); assert.deepEqual(h.trace, ['STOPPING', 'Project', 'ProjectDependency', 'Learning', 'WindowManager']) }
  if (id === 'S02') {
    native.setFault(3); await assert.rejects(h.application.shutdown()); assert.ok(h.trace.includes('ProjectDependency')); assert.ok(!h.trace.includes('WindowManager'))
    assert.equal(s.disposition, 'PROCESS_UNRESOLVED'); assert.equal(s.manager.size, 1); native.setFault(0)
    await h.application.shutdown(); assert.equal(h.stopping(), 1)
  }
  if (id === 'S03') {
    await assert.rejects(h.application.shutdown()); await s.backgroundTask; assert.equal(s.finalized, true)
    assert.ok(!h.trace.includes('Learning')); rejecting = false; await h.application.shutdown(); assert.equal(h.stopping(), 1)
  }
  if (id === 'S04') {
    const a = h.application.shutdown(), b = h.application.shutdown(); assert.equal(a, b)
    await s.backgroundTask; assert.equal(h.application.getStatus().state, 'STOPPING'); assert.ok(!h.trace.includes('Learning'))
    release(); await a
  }
  if (id === 'S05') {
    let approvals = 0, approved = false, quit = 0
    const q = new ApplicationQuitCoordinator({ getApplication: () => h.application, requestApproval: async () => { approvals++; return approved }, quit() { quit++ } })
    q.handleBeforeQuit({ preventDefault() {} }); await until(() => approvals === 1); await pause()
    assert.equal(h.stopping(), 0); assert.equal(s.sealed, false); assert.equal(native.waitState(s.records.values().next().value.handle), 'PENDING')
    approved = true; q.handleBeforeQuit({ preventDefault() {} }); await until(() => quit === 1); assert.equal(h.stopping(), 1)
  }
  if (id === 'S06') {
    s.beginShutdown(); const a = s.close(), b = s.close(); assert.equal(a, b); await Promise.all([a, b, s.stop()])
    const count = { ...s.counters }; await s.close(); await assert.rejects(s.launch(config.node, []), /ADMISSION_CLOSED/)
    assert.deepEqual(s.counters, count); await h.application.shutdown()
  }
  assert.equal(h.application.getStatus().state, 'STOPPED'); r.trace = h.trace; r.stoppingEvents = h.stopping(); await finished(s, r)
}
async function rendererTest(r) {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(config.output, 'staged-preload.cjs') } })
  await w.loadURL('data:text/html,<title>old</title>')
  const s = await node(), original = { owner: w.webContents.id, generation: 1, document: 'old' }
  let current = { ...original }, invalidations = 0, attempts = 0, sent = 0
  const invalidate = () => { invalidations++; current = { owner: original.owner, generation: current.generation + 1, document: 'new' }; s.beginShutdown() }
  const navigation = (_e, _url, inPlace, mainFrame) => { if (!inPlace && mainFrame) invalidate() }
  w.webContents.on('did-start-navigation', navigation); w.webContents.on('render-process-gone', invalidate); w.webContents.once('destroyed', invalidate)
  const send = token => { attempts++; if (!w.isDestroyed() && token.owner === current.owner && token.generation === current.generation && token.document === current.document && !s.sealed) { w.webContents.send('staged-exercise-result', token); sent++ } }
  send(original)
  await until(async () => (await w.webContents.executeJavaScript('window.stagedResults.snapshot()')).length === 1)
  assert.equal(sent, 1); r.receiveBridgePositiveControl = true; attempts = 0; sent = 0
  if (id === 'R01') { w.webContents.reload(); await until(() => invalidations > 0); await until(() => !w.webContents.isLoading()) }
  if (id === 'R02') await w.loadURL('data:text/html,<title>new</title>')
  if (id === 'R03') { w.webContents.forcefullyCrashRenderer(); await until(() => invalidations > 0); await w.loadURL('data:text/html,<title>replacement</title>') }
  if (id === 'R04') w.destroy()
  await until(() => invalidations > 0); await s.backgroundTask; send(original)
  assert.equal(attempts, 1); assert.equal(sent, 0)
  if (!w.isDestroyed()) { const received = await w.webContents.executeJavaScript('window.stagedResults.snapshot()'); assert.deepEqual(received, []); r.receivedByNewDocument = received; w.destroy() }
  r.invalidations = invalidations; r.staleSendAttempts = attempts; r.staleSent = sent; await finished(s, r)
}
async function makeCsharp(s, large = false, looping = true) {
  s.environment = { ...process.env, DOTNET_CLI_HOME: join(s.workspace, 'cli-home'), NUGET_PACKAGES: join(s.workspace, 'packages'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true', MSBUILDDISABLENODEREUSE: '1', DOTNET_NOLOGO: '1' }
  await writeFile(join(s.workspace, 'global.json'), JSON.stringify({ sdk: { version: config.sdk, rollForward: 'disable' } }))
  await writeFile(join(s.workspace, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
  await writeFile(join(s.workspace, 'Exercise.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><EnableDefaultCompileItems>false</EnableDefaultCompileItems><UseSharedCompilation>false</UseSharedCompilation><NuGetAudit>false</NuGetAudit><ImportDirectoryBuildProps>false</ImportDirectoryBuildProps><ImportDirectoryBuildTargets>false</ImportDirectoryBuildTargets></PropertyGroup><ItemGroup><Compile Include="Program.cs"/></ItemGroup></Project>')
  const body = looping ? 'System.Console.WriteLine("READY-CSHARP");System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite);' : 'System.Console.WriteLine("READY-CSHARP");'
  let code = `class Program {static void Main(){${body}}}`
  if (large) for (let i = 0; i < 12000; i++) code += `\nclass C${i} {public static int F(int n)=>n+${i};}`
  await writeFile(join(s.workspace, 'Program.cs'), code)
  return ['build', join(s.workspace, 'Exercise.csproj'), '-c', 'Release', '--disable-build-servers', '-nodeReuse:false', '--configfile', join(s.workspace, 'NuGet.Config'), '-p:NuGetAudit=false', '-p:ImportDirectoryBuildProps=false', '-p:ImportDirectoryBuildTargets=false']
}
async function crashFixture() {
  let s, history
  if (id === 'P03') { history = await heldHistory(); s = history.s }
  else if (id === 'C01' || id === 'C02') {
    s = await session(); const args = await makeCsharp(s, id === 'C02')
    if (id === 'C02') await s.launch(config.dotnet, args, 'compile')
  } else if (id === 'C03') {
    const compile = await session(), args = await makeCsharp(compile)
    await compile.launch(config.dotnet, args, 'compile'); await until(() => compile.exitCode !== null, 30000); assert.equal(compile.exitCode, 0, compile.output)
    const assets = JSON.parse(await readFile(join(compile.workspace, 'obj/project.assets.json'), 'utf8')); assert.equal(Object.keys(assets.libraries).length, 0)
    const artifact = join(caseRoot, 'csharp-artifact'); await cp(join(compile.workspace, 'bin/Release/net10.0'), artifact, { recursive: true }); await compile.close()
    s = await session(); await s.launch(config.dotnet, [join(artifact, 'Exercise.dll')]); await until(() => s.output.includes('READY-CSHARP')); s.scan()
  } else {
    s = await session(); const childFile = join(s.workspace, 'child.json')
    await node(s, `const fs=require('node:fs'),{spawn}=require('node:child_process');const c=spawn(${JSON.stringify(config.node)},['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});c.unref();fs.writeFileSync(${JSON.stringify(childFile)},JSON.stringify({pid:c.pid}));console.log('READY');setInterval(()=>{},1000)`)
    const c = await file(childFile); s.scan(); assert.ok(native.jobMembers(s.handle).includes(c.pid))
  }
  let sequence = 0
  const diagnostic = (event, extra = {}) => appendFileSync(join(caseRoot, 'c02-diagnostics.jsonl'), JSON.stringify({ event, hostPid: process.pid, monotonicMs: performance.now(), ...extra }) + '\n')
  function publish() {
    const members = s.handle && !s.released ? native.jobMembers(s.handle) : []
    const identities = members.map(pid => {
      let h
      try { h = native.watch(pid); return { ...native.memberIdentity(s.handle, h), image: native.processImage(h) } }
      catch (e) { if (!native.jobMembers(s.handle).includes(pid)) return { pid, vanished: true }; throw e }
      finally { if (h) native.closeHandle(h) }
    })
    const snapshot = { hostPid: process.pid, id, root, workspace: s.workspace, recordPath: s.recordPath,
      session: { ...s.summary(), timeline: undefined }, members, identities, sequence: ++sequence, monotonicMs: performance.now() }
    // C02 readers consume complete newline-terminated records. Never replace a file
    // that the independent Windows observer may have open without delete sharing.
    if (id === 'C02') appendFileSync(join(caseRoot, 'c02-snapshots.jsonl'), JSON.stringify(snapshot) + '\n')
    else json(join(caseRoot, 'ready.json'), snapshot)
  }
  publish()
  if (id === 'C02') {
    let publicationError
    const timer = setInterval(() => {
      try { publish() } catch (e) {
        publicationError = e; clearInterval(timer)
        diagnostic('publisher-error', { code: e.code, message: e.message, sequence })
      }
    }, 15)
    try {
      await until(async () => {
        if (publicationError) throw publicationError
        return (await exists(join(caseRoot, 'observer-continue.json'))) || (await exists(join(caseRoot, 'observer-abort.json')))
      }, 30000)
    } finally { clearInterval(timer); diagnostic('publisher-stopped', { sequence }) }
    if (await exists(join(caseRoot, 'observer-abort.json'))) { diagnostic('abort-observed'); await s.close(); diagnostic('abort-cleanup-complete'); return }
  } else await until(() => exists(join(caseRoot, 'observer-continue.json')))
  if (id === 'P03') {
    s.hooks.afterRelease = async () => { json(join(caseRoot, 'released.json'), { session: s.summary(), checkpoint: await readCheckpoint(s.recordPath, root) }); await new Promise(() => {}) }
    await releaseHistory(history); await s.close()
  }
  await new Promise(() => {}) // Only the independent controller terminates this dedicated host.
}
async function workspaceTest(r) {
  if (id === 'W03') {
    const outside = join(caseRoot, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'preserve')
    await assert.rejects(safeRemove(join(root, 'sessions'), outside, await identity(outside)), /containment/)
    const s = await node(); await symlink(outside, join(s.workspace, 'junction'), 'junction')
    await assert.rejects(s.close(), /reparse/); assert.equal(s.cleanupComplete, false)
    assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'preserve')
    await rm(join(s.workspace, 'junction')); await s.close(); await finished(s, r); return
  }
  if (id === 'W04') {
    const s = await node(); await assert.rejects(recover(root, s.recordPath, native), /owner still active/)
    await s.safety(); const result = await recover(root, s.recordPath, native)
    assert.equal(result.action, 'QUARANTINED'); assert.equal(await exists(s.workspace), true); r.recovery = result; r.session = s.summary(); return
  }
  if (id === 'W05') {
    const h = await heldHistory(); await releaseHistory(h); await h.s.close(); await finished(h.s, r)
    r.restart = { root, recordPath: h.s.recordPath, workspace: h.s.workspace }; return
  }
  const s = await node(), lockedPath = join(s.workspace, 'locked.txt'); let lock
  if (id === 'W01') { await writeFile(lockedPath, 'lock'); lock = native.lockFile(lockedPath) }
  else s.faults.delete = true
  const h = lifecycle(s); await h.application.start()
  try {
    await assert.rejects(h.application.shutdown()); assert.equal(h.application.getStatus().state, 'STOPPING'); assert.ok(!h.trace.includes('WindowManager'))
    assert.equal(s.processClean, true); assert.equal(s.cleanupComplete, false); assert.equal(s.manager.size, 0)
    const checkpoint = await readCheckpoint(s.recordPath, root); assert.equal(checkpoint.checkpoint, 'FINALIZED'); assert.equal(checkpoint.workspaceState, 'DELETE_PENDING')
    r.pending = s.summary(); r.checkpoint = checkpoint; r.countersBeforeRetry = { ...s.counters }
  } finally { if (lock) native.closeHandle(lock) }
  if (id === 'W01') { s.closeLease(); r.restart = { root, recordPath: s.recordPath, workspace: s.workspace }; return }
  s.faults.delete = false; await h.application.shutdown(); assert.equal(h.stopping(), 1)
  for (const key of ['spawn', 'query', 'terminate', 'release']) assert.equal(s.counters[key], r.countersBeforeRetry[key])
  await finished(s, r, true)
}
async function isolation(r) {
  const projectRoot = join(caseRoot, 'project-fixture'); await mkdir(projectRoot)
  const code = 'setInterval(()=>console.log("project-live"),150)'; await writeFile(join(projectRoot, 'live.js'), code)
  const projects = new ProjectService(), project = await projects.openRoot(projectRoot), manager = new ProcessManager(), runEvents = [], terminalEvents = []
  const run = new RunService({ authorize: async request => ({ projectId: project.id, relativePath: request.relativePath, canonicalRoot: projectRoot, canonicalFile: join(projectRoot, request.relativePath) }), resolveRuntime: async () => ({ executable: config.node }) },
    { adapter: new ProjectAdapter(join(config.repo, 'out/main/native/run-process.node')), manager, onEvent: (_owner, e) => runEvents.push(e), onEventSinkError() {} })
  const terminal = new TerminalService({ ptyPort: new NodePtyPort(), projectService: projects, processManager: manager, processTreeTerminator: new WindowsProcessTreeTerminator(),
    shellResolver: { resolve: async () => ({ executable: join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), args: ['-NoLogo', '-NoProfile'], shellLabel: 'Windows PowerShell' }) }, publish: (_owner, e) => terminalEvents.push(e) })
  terminal.start()
  try {
    const rs = await run.startRun({ projectId: project.id, relativePath: 'live.js', dirty: false }, 77)
    const ts = await terminal.create({ projectId: project.id, cols: 80, rows: 24 }, { ownerWebContentsId: 77, projectId: project.id })
    await until(() => runEvents.some(e => e.type === 'stdout'))
    const before = manager.size
    const s = id === 'I03' ? (await heldHistory()) : { s: await node() }
    if (id === 'I03') { await releaseHistory(s); s.s.faults.persistence = 'FINALIZED' }
    if (id === 'I02') native.setFault(3)
    if (id === 'I01') await s.s.close()
    else {
      await assert.rejects(s.s.close()); assert.equal(manager.size, before)
      if (id === 'I02') { assert.equal(s.s.disposition, 'PROCESS_UNRESOLVED'); assert.equal(s.s.released, false) }
      else { assert.equal(s.s.lastError.kind, 'PERSISTENCE'); assert.equal(s.s.released, true) }
    }
    const checkLive = async tag => {
      assert.equal(manager.size, before); assert.equal(run.getSession(rs.sessionId, 77).state, 'RUNNING'); assert.equal(terminal.getSessionSnapshot(ts.sessionId)?.state, 'RUNNING')
      const count = runEvents.filter(e => e.type === 'stdout').length, marker = `terminal-${tag}`
      await terminal.input({ sessionId: ts.sessionId, data: `Write-Output ('terminal-'+'${tag}')\r` }, { ownerWebContentsId: 77, projectId: project.id })
      await until(() => terminalEvents.filter(e => e.type === 'data').map(e => e.data).join('').includes(marker))
      await until(() => runEvents.filter(e => e.type === 'stdout').length > count)
    }
    await checkLive('during')
    native.setFault(0); s.s.faults = {}; if (!s.s.finalized) await s.s.close(); await checkLive('after')
    assert.equal(await readFile(join(projectRoot, 'live.js'), 'utf8'), code)
    r.projectResources = before; r.projectSession = rs.sessionId; r.terminalSession = ts.sessionId
    r.authority = 'fixture authorize/resolveRuntime; real unchanged RunService/native adapter/TerminalService/PTY'; await finished(s.s, r)
  } finally { native.setFault(0); await run.stop(); await terminal.stop(); await manager.stop(); await projects.stop() }
}
async function run() {
  if (id === 'B01') await test(id, baseline)
  else if (id === 'P01') {
    const h = await heldHistory(); await releaseHistory(h); h.s.faults.persistence = 'FINALIZED'
    await test('P01', async r => {
      await assert.rejects(h.s.close()); assert.equal(h.s.lastError.kind, 'PERSISTENCE'); assert.equal(h.s.proof.kind, 'HISTORY_UNVERIFIED')
      assert.equal(h.s.disposition, 'HISTORY_UNVERIFIED'); assert.equal(h.s.nativeStage, 'HANDLES_CLOSED'); assert.equal(h.s.manager.size, 1)
      assert.equal(h.s.finalized, false); assert.equal(h.s.processClean, false); assert.equal(h.s.cleanupComplete, false)
      assert.equal((await readCheckpoint(h.s.recordPath, root)).checkpoint, 'RELEASE_READY'); assert.equal(await exists(h.s.workspace), true)
      r.session = h.s.summary()
    })
    await test('P02', async r => {
      const before = { ...h.s.counters }; h.s.faults = {}; await h.s.close()
      for (const k of ['query', 'terminate', 'release', 'spawn']) assert.equal(h.s.counters[k], before[k])
      r.before = before; await finished(h.s, r)
    })
  } else if (id.startsWith('N')) await test(id, async r => {
    const fault = Number(id.slice(1)), s = await session(); native.setFault(fault)
    if (fault <= 2) {
      await assert.rejects(s.launch(config.node, [await fixture(s, 'setInterval(()=>{},1000)')]))
      assert.equal(s.manager.size, 0); assert.equal(s.counters.spawn, 0); assert.equal(s.handle, null); native.setFault(0); await s.close()
      assert.equal(s.processClean, false); assert.equal(s.cleanupComplete, false); r.session = s.summary(); return
    }
    native.setFault(0); await node(s); native.setFault(fault)
    await assert.rejects(s.close()); assert.equal(s.disposition, 'PROCESS_UNRESOLVED'); assert.equal(s.manager.size, 1); assert.equal(s.released, false); assert.equal(await exists(s.workspace), true)
    r.failed = s.summary(); native.setFault(0); await s.close(); await finished(s, r)
  })
  else if (id.startsWith('S')) await test(id, shutdownTest)
  else if (id.startsWith('R')) await test(id, rendererTest)
  else if (id.startsWith('W')) await test(id, workspaceTest)
  else if (id.startsWith('I')) await test(id, isolation)
  else throw Error('Unknown case')
}
async function main() {
  await mkdir(caseRoot, { recursive: true }); await app.whenReady(); app.on('window-all-closed', () => {})
  let failed = false
  try {
    if (mode === 'crash') await crashFixture()
    else if (mode === 'recovery') {
      const result = await recover(arg('recovery-root'), arg('record'), native)
      json(join(caseRoot, 'recovery.json'), { hostPid: process.pid, ...result })
    } else await run()
  } catch (e) { failed = true; console.error(e.stack); json(join(caseRoot, 'host-error.json'), { message: e.message, stack: e.stack }); persist() }
  finally {
    native.setFault(0)
    for (const s of sessions) {
      try { await s.safety() } catch (e) { failed = true; console.error('Safety failed:', e.message) }
    }
    for (const h of observers) native.closeHandle(h)
    if (mode === 'test') persist()
    app.exit(failed ? 1 : 0)
  }
}
void main().catch(e => { console.error(e.stack); app.exit(1) })
