// Authorized T1-T7 isolated experiment, not production.
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile, readdir, cp } from 'node:fs/promises'
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { PolicySession, until } from '../policy-b-runtime'
import { readCheckpoint } from '../policy-b-checkpoint'
import { ProcessManager } from '../../../src/main/services/process/process-manager'
import { RunService } from '../../../src/main/services/run/run-service'
import { WindowsPipedProcessAdapter as ProjectAdapter } from '../../../src/main/services/run/windows-piped-process-adapter'
import { ProjectService } from '../../../src/main/services/project/project-service'
import { TerminalService } from '../../../src/main/services/terminal/terminal-service'
import { NodePtyPort } from '../../../src/main/services/terminal/node-pty-adapter'
import { WindowsProcessTreeTerminator } from '../../../src/main/services/process/windows-process-tree-terminator'

const arg = key => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const config = JSON.parse(readFileSync(arg('config'), 'utf8')), id = arg('variant'), caseRoot = arg('case-root')
const plan = config.plan, nativePath = join(config.output, 'exercise-process.node'), native = createRequire(__filename)(nativePath)
const root = join(caseRoot, 'learning'), sessions = [], samples = [], gates = []
const r = { name: id, status: 'PASS', started: new Date().toISOString(), timeline: [], commands: [] }
const now = () => performance.now(), mark = (event, extra = {}) => r.timeline.push({ event, monotonicMs: now(), ...extra })
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
app.setPath('userData', join(caseRoot, 'userData'))
let sampler, isolation, sampleError
function sample(s) {
  if (!s.handle || s.released) return
  const memory = native.memory(s.handle), members = native.jobMembers(s.handle)
  const identities = [...s.records.values()].map(p => ({ ...p, handle: undefined }))
  const value = { at: now(), sessionId: s.sessionId, phase: s.phase, memory, members, identities }
  samples.push(value); appendFileSync(join(caseRoot, 'samples.jsonl'), JSON.stringify(value) + '\n')
}
async function session(quota) {
  const s = new PolicySession(root, nativePath)
  s.quota = quota; sessions.push(s); await s.prepare(); return s
}
async function launch(s, executable, args, phase = 'execute') {
  native.configureMemory(s.quota); s.launchAt = now()
  r.commands.push({ sessionId: s.sessionId, executable, args, phase, quota: s.quota, launchAt: s.launchAt })
  await s.launch(executable, args, phase)
  const memory = native.memory(s.handle)
  assert.equal(memory.quotaBytes, s.quota); assert.equal(memory.configuredBeforeLaunch, s.quota)
  s.quotaReadback = memory; sample(s)
}
async function seen(s) {
  s.scan(); sample(s)
  await until(() => {
    const path = join(caseRoot, 'retained.json')
    if (!existsSync(path)) return false
    let retained; try { retained = JSON.parse(readFileSync(path, 'utf8')) } catch { return false }
    return [...s.records.values()].every(p => retained.some(q => q.pid === p.pid && q.created === p.created))
  }, plan.observationMs)
}
async function clean(s, failure = null) {
  const began = now(); mark('cleanup-start', { sessionId: s.sessionId })
  if (failure === 'terminate') native.setFault(3)
  if (failure === 'finalized') s.faults.persistence = 'FINALIZED'
  if (failure) {
    await assert.rejects(s.close(plan.cleanupMs)); r.failureState = s.summary()
    assert.equal(s.manager.size, 1); assert.equal(s.finalized, false); assert.equal(s.cleanupComplete, false)
    if (failure === 'terminate') { assert.equal(s.released, false); assert.equal(s.disposition, 'PROCESS_UNRESOLVED') }
    else { assert.equal(s.nativeStage, 'HANDLES_CLOSED'); assert.equal(s.lastError.kind, 'PERSISTENCE'); assert.equal(s.processClean, false) }
    if (isolation) await isolation.check('failure')
    const counters = { ...s.counters }; native.setFault(0); s.faults = {}
    await s.close(plan.cleanupMs)
    if (failure === 'finalized') for (const key of ['spawn', 'query', 'terminate', 'release']) assert.equal(s.counters[key], counters[key])
    r.retry = { before: counters, after: { ...s.counters } }
  } else await s.close(plan.cleanupMs)
  const finished = now()
  assert.equal(s.finalized, true); assert.equal(s.manager.size, 0); assert.equal(s.nativeStage, 'HANDLES_CLOSED')
  assert.deepEqual(s.beforeRelease, []); assert.ok(s.proof.allRetainedSignaled)
  const checkpoint = await readCheckpoint(s.recordPath, root)
  if (s.proof.kind === 'VERIFIED') {
    assert.equal(checkpoint.checkpoint, 'CLEANUP_COMPLETE'); assert.equal(s.processClean, true); assert.equal(existsSync(s.workspace), false)
  } else {
    assert.equal(s.proof.kind, 'HISTORY_UNVERIFIED'); assert.equal(s.processClean, false); assert.equal(checkpoint.workspaceState, 'QUARANTINED')
  }
  r.cleanups ??= []; r.cleanups.push({ sessionId: s.sessionId, ms: finished - began, state: s.summary(), checkpoint })
  mark('cleanup-finished', { sessionId: s.sessionId, ms: finished - began })
}
async function setupIsolation() {
  const projectRoot = join(caseRoot, 'project'); await mkdir(projectRoot)
  const source = 'setInterval(()=>console.log("project-live"),150)'; await writeFile(join(projectRoot, 'live.js'), source)
  const projects = new ProjectService(), project = await projects.openRoot(projectRoot), manager = new ProcessManager(), runEvents = [], terminalEvents = []
  const run = new RunService({ authorize: async request => ({ projectId: project.id, relativePath: request.relativePath, canonicalRoot: projectRoot, canonicalFile: join(projectRoot, request.relativePath) }), resolveRuntime: async () => ({ executable: config.node }) },
    { adapter: new ProjectAdapter(join(config.repo, 'out/main/native/run-process.node')), manager, onEvent: (_, e) => runEvents.push(e), onEventSinkError() {} })
  const terminal = new TerminalService({ ptyPort: new NodePtyPort(), projectService: projects, processManager: manager, processTreeTerminator: new WindowsProcessTreeTerminator(),
    shellResolver: { resolve: async () => ({ executable: join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), args: ['-NoLogo', '-NoProfile'], shellLabel: 'Windows PowerShell' }) }, publish: (_, e) => terminalEvents.push(e) })
  terminal.start()
  const rs = await run.startRun({ projectId: project.id, relativePath: 'live.js', dirty: false }, 77)
  const ts = await terminal.create({ projectId: project.id, cols: 80, rows: 24 }, { ownerWebContentsId: 77, projectId: project.id })
  const baseline = manager.size; assert.equal(baseline, 2)
  const checks = []
  return { async check(tag) {
    assert.equal(manager.size, baseline); assert.equal(run.getSession(rs.sessionId, 77).state, 'RUNNING'); assert.equal(terminal.getSessionSnapshot(ts.sessionId)?.state, 'RUNNING')
    const count = runEvents.filter(e => e.type === 'stdout').length, marker = `limits-${tag}`
    await terminal.input({ sessionId: ts.sessionId, data: `Write-Output ('limits-'+'${tag}')\r` }, { ownerWebContentsId: 77, projectId: project.id })
    await until(() => terminalEvents.filter(e => e.type === 'data').map(e => e.data).join('').includes(marker))
    await until(() => runEvents.filter(e => e.type === 'stdout').length > count)
    assert.equal(await readFile(join(projectRoot, 'live.js'), 'utf8'), source)
    checks.push({ tag, at: now(), projectResources: manager.size, stdoutCount: runEvents.filter(e => e.type === 'stdout').length, terminalMarker: marker })
    r.isolation = { status: 'PASS', runSession: rs.sessionId, terminalSession: ts.sessionId, checks }
  }, async stop() { await run.stop(); await terminal.stop(); await manager.stop(); await projects.stop() } }
}
function jsSource(mode, gate) {
  const wait = `const fs=require('node:fs');console.log('RUNTIME_READY');const t=setInterval(()=>{if(!fs.existsSync('go'))return;clearInterval(t);console.log('CALL_START');`
  const child = `const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(config.node)},['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});c.unref();console.log('CHILD '+c.pid);`
  const memory = `const blocks=[];for(let i=0;i<8;i++)blocks.push(Buffer.alloc(8*1024*1024,0x5a));globalThis.kept=blocks;const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(join(config.output, 'allocator.exe'))},[${JSON.stringify(gate)},'320','hold'],{stdio:['ignore','inherit','inherit'],windowsHide:true});console.log('CHILD '+c.pid);`
  const normal = `let total=0;for(let i=0;i<100000;i++)total+=i%7;console.log('RESULT '+total);const f=setInterval(()=>{if(fs.existsSync('finish')){clearInterval(f);process.exit(0)}},5);`
  return wait + (mode === 'normal' ? normal : mode === 'memory' ? memory : child + 'while(true){}') + '},5);'
}
function csSource(mode, gate) {
  const normal = 'long n=0;for(int i=0;i<100000;i++)n+=i%7;System.Console.WriteLine("RESULT "+n);while(!System.IO.File.Exists("finish"))System.Threading.Thread.Yield();'
  const loop = `var child=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(${JSON.stringify(config.node)}) {UseShellExecute=false,CreateNoWindow=true,ArgumentList={"-e","setInterval(()=>{},1000)"}});System.Console.WriteLine("CHILD "+child!.Id);while(true){}`
  // Subscribe before Start, then drain both streams concurrently. ReadToEnd or
  // WaitForExit here would block the allocator-ready -> gate handshake.
  const memory = `var blocks=new System.Collections.Generic.List<byte[]>();for(int i=0;i<8;i++){var b=new byte[8*1024*1024];System.Array.Fill(b,(byte)0x5a);blocks.Add(b);}var child=new System.Diagnostics.Process{StartInfo=new System.Diagnostics.ProcessStartInfo(${JSON.stringify(join(config.output, 'allocator.exe'))}) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,ArgumentList={${JSON.stringify(gate)},"320","hold"}}};child.OutputDataReceived+=(_,e)=>{if(e.Data!=null){System.Console.Out.WriteLine(e.Data);System.Console.Out.Flush();}};child.ErrorDataReceived+=(_,e)=>{if(e.Data!=null){System.Console.Error.WriteLine(e.Data);System.Console.Error.Flush();}};child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();System.Console.WriteLine("CHILD "+child.Id);System.Console.Out.Flush();System.GC.KeepAlive(blocks);while(true){System.GC.KeepAlive(blocks);System.Threading.Thread.Yield();}`
  return `class Program{static void Main(){System.Console.WriteLine("RUNTIME_READY");while(!System.IO.File.Exists("go"))System.Threading.Thread.Yield();System.Console.WriteLine("CALL_START");${mode === 'normal' ? normal : mode === 'memory' ? memory : loop}}}`
}
async function compile(source, direct = false) {
  const s = await session(plan.compileQuotaBytes)
  s.environment = { ...process.env, DOTNET_CLI_HOME: join(s.workspace, 'cli'), NUGET_PACKAGES: join(s.workspace, 'packages'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', MSBUILDDISABLENODEREUSE: '1', DOTNET_NOLOGO: '1', DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true' }
  await writeFile(join(s.workspace, 'global.json'), JSON.stringify({ sdk: { version: config.sdk, rollForward: 'latestPatch', allowPrerelease: false } }))
  await writeFile(join(s.workspace, 'Program.cs'), source)
  let args
  if (direct) {
    const packRoot = join(dirname(config.dotnet), 'packs/Microsoft.NETCore.App.Ref')
    const version = (await readdir(packRoot)).filter(v => /^10\.\d+\.\d+$/.test(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
    assert.ok(version); const refs = join(packRoot, version, 'ref/net10.0')
    await writeFile(join(s.workspace, 'compile.rsp'), ['/nologo', '/target:exe', '/nostdlib+', '/out:Exercise.dll', ...(await readdir(refs)).filter(f => f.endsWith('.dll')).map(f => `/reference:"${join(refs, f)}"`), 'Program.cs'].join('\n'))
    args = ['exec', join(dirname(config.dotnet), 'sdk', config.sdk, 'Roslyn/bincore/csc.dll'), '@compile.rsp']
  } else {
    await writeFile(join(s.workspace, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
    await writeFile(join(s.workspace, 'Exercise.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><UseSharedCompilation>false</UseSharedCompilation><NuGetAudit>false</NuGetAudit><ImportDirectoryBuildProps>false</ImportDirectoryBuildProps><ImportDirectoryBuildTargets>false</ImportDirectoryBuildTargets></PropertyGroup></Project>')
    args = ['build', join(s.workspace, 'Exercise.csproj'), '-c', 'Release', '--disable-build-servers', '-nodeReuse:false', '--configfile', join(s.workspace, 'NuGet.Config')]
  }
  await launch(s, config.dotnet, args, 'compile')
  if (direct) return s
  await until(() => s.exitCode !== null, plan.compileMs)
  assert.equal(s.exitCode, 0, s.output); r.compileMs = now() - s.launchAt
  const artifact = join(caseRoot, `artifact-${s.sessionId}`); await cp(join(s.workspace, 'bin/Release/net10.0'), artifact, { recursive: true })
  await clean(s); return join(artifact, 'Exercise.dll')
}
async function runtime(mode, language, quota) {
  const name = `Local\\student-9d-${randomUUID()}`, gate = native.gate(name); gates.push(gate)
  const artifact = language === 'csharp' ? await compile(csSource(mode, name)) : null
  const s = await session(quota); s.gate = gate
  if (language === 'javascript') await writeFile(join(s.workspace, 'driver.cjs'), jsSource(mode, name))
  await launch(s, language === 'csharp' ? config.dotnet : config.node, [artifact ?? join(s.workspace, 'driver.cjs')])
  await until(() => s.output.includes('RUNTIME_READY'), plan.probeMs)
  r.startupMs = now() - s.launchAt; await seen(s)
  s.callAt = now(); await writeFile(join(s.workspace, 'go'), 'go')
  return s
}
async function deadline(s, phaseMs, operationMs = plan.operationMs, failure = null) {
  const phaseAt = s.launchAt + phaseMs, operationAt = s.launchAt + operationMs, due = Math.min(phaseAt, operationAt)
  const reason = operationAt < phaseAt ? 'OPERATION_TIMEOUT' : s.phase === 'compile' ? 'COMPILE_TIMEOUT' : 'EXECUTE_TIMEOUT'
  await until(() => now() >= due, Math.max(phaseMs, operationMs) + 1000)
  r.timeout = { reason, due, requestedAt: now(), overshootMs: now() - due, phaseMs, operationMs }
  mark('cancellation-requested', r.timeout)
  s.scan(); sample(s)
  if (s.phase === 'compile' && s.exitCode !== null) { r.status = 'NOT_OBSERVED'; r.reason = 'Compiler finished before timeout'; await clean(s); return }
  if (id.startsWith('T2')) {
    const pid = Number(/CHILD (\d+)/.exec(s.output)?.[1]); assert.ok(pid); assert.ok(native.jobMembers(s.handle).includes(pid))
  }
  assert.equal(native.waitState([...s.records.values()].find(p => p.root).handle), 'PENDING')
  if (id.startsWith('T3')) r.compiler = { pid: s.rootPid, command: r.commands.at(-1), liveAtCancellation: true }
  await clean(s, failure)
  r.timeout.terminationConfirmedMs = now() - r.timeout.requestedAt
}
async function memory(s, failure = null) {
  await until(() => /ALLOCATOR_READY/.test(s.output), plan.observationMs)
  await seen(s); native.signalGate(s.gate)
  await until(() => /ALLOC_DENIED|ALLOC_CEILING/.test(s.output), plan.observationMs)
  // Ceiling in a tree parent is not the child's outcome; wait for denial when needed.
  if (!/ALLOC_DENIED/.test(s.output)) await until(() => /ALLOC_DENIED/.test(s.output) || s.exitCode !== null, plan.observationMs)
  s.scan(); sample(s); await seen(s)
  const denial = /ALLOC_DENIED (\d+) (\d+)/.exec(s.output)
  const memoryEvents = samples.filter(x => x.sessionId === s.sessionId).flatMap(x => x.memory.events).filter(e => e.message === 10)
  r.memoryEvidence = { denial: denial ? { committedByAllocator: Number(denial[1]), win32Error: Number(denial[2]) } : null, memoryEvents, output: s.output }
  if (!denial || !memoryEvents.length) { r.status = 'NOT_OBSERVED'; r.reason = 'No paired native allocation denial and Job-memory-limit event; runtime OOM/exit alone is insufficient' }
  else {
    assert.ok([8, 14, 1455, 1816].includes(Number(denial[2])), 'Expected memory/quota allocation error')
    assert.ok(Number(denial[1]) < (id.startsWith('T4') ? 96 : 320) * 1024 * 1024)
    if (id === 'T4-tree') assert.ok(/ALLOC_CHILD/.test(s.output))
  }
  r.cancellationAt = now(); await clean(s, failure)
}
async function execute() {
  if (/^T[256]/.test(id)) { isolation = await setupIsolation(); await isolation.check('before') }
  if (id.startsWith('T1')) {
    const s = await runtime('normal', id.includes('csharp') ? 'csharp' : 'javascript', plan.executeQuotaBytes)
    const due = s.launchAt + plan.executeMs
    await until(() => s.output.includes('RESULT '), Math.max(1, due - now()))
    assert.ok(s.output.includes('RESULT 299995')); r.executionMs = now() - s.callAt; r.launchToResultMs = now() - s.launchAt
    assert.ok(now() <= due, 'Normal runtime must finish within 2s from launch')
    sample(s)
    assert.ok(!samples.filter(x => x.sessionId === s.sessionId).flatMap(x => x.memory.events).some(e => e.message === 10), 'Normal execution must not hit Job memory limit')
    await writeFile(join(s.workspace, 'finish'), 'finish'); await until(() => s.exitCode !== null); assert.equal(s.exitCode, 0); await clean(s)
  } else if (id.startsWith('T2') || id === 'T6-timeout-terminate') {
    const s = await runtime('loop', id.includes('csharp') ? 'csharp' : 'javascript', plan.executeQuotaBytes)
    await deadline(s, plan.executeMs, plan.operationMs, id.startsWith('T6') ? 'terminate' : null)
  } else if (id.startsWith('T3')) {
    let source = 'class Program{static void Main(){}}'; for (let i = 0; i < 12000; i++) source += `class C${i}{public static int F(int n)=>n+${i};}\n`
    const s = await compile(source, true); await seen(s); await deadline(s, plan.compileTimeoutTrialMs)
  } else if (id.startsWith('T4')) {
    const s = await session(plan.lowQuotaBytes), name = `Local\\student-9d-${randomUUID()}`; s.gate = native.gate(name); gates.push(s.gate)
    await launch(s, join(config.output, 'allocator.exe'), [name, id === 'T4-tree' ? '32' : '96', id === 'T4-tree' ? 'tree' : 'hold'])
    await memory(s)
  } else if (id.startsWith('T5') || id === 'T6-memory-finalized') {
    const s = await runtime('memory', id.includes('csharp') ? 'csharp' : 'javascript', plan.runtimeTestQuotaBytes)
    await memory(s, id.startsWith('T6') ? 'finalized' : null)
  } else if (id === 'T7-phase' || id === 'T7-operation') {
    const s = await runtime('loop', 'javascript', plan.executeQuotaBytes)
    await deadline(s, id === 'T7-phase' ? 500 : 2000, id === 'T7-phase' ? 1500 : 750)
    assert.equal(r.timeout.reason, id === 'T7-phase' ? 'EXECUTE_TIMEOUT' : 'OPERATION_TIMEOUT')
  } else if (id === 'T7-pending-io') {
    const s = await runtime('loop', 'javascript', plan.executeQuotaBytes)
    let release, entered = false, complete = false
    const io = new Promise(resolve => { release = resolve }), persist = s.persist.bind(s)
    s.persist = async stage => { if (stage === 'FINALIZED') { entered = true; await io } return persist(stage) }
    const start = now(), pending = s.close(plan.cleanupMs).then(() => { complete = true })
    let timer
    const caller = Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CLEANUP_DEADLINE')), 200) })])
    // Attach rejection observation immediately, retain and join the underlying task.
    const rejected = assert.rejects(caller, /CLEANUP_DEADLINE/)
    await until(() => entered); assert.equal(s.close(), s.task)
    await rejected; clearTimeout(timer)
    assert.equal(complete, false); assert.equal(s.finalized, false); assert.equal(s.manager.size, 1)
    const record = await readCheckpoint(s.recordPath, root); assert.equal(record.checkpoint, 'RELEASE_READY')
    r.pendingIO = { deadlineMs: 200, observedMs: now() - start, pendingRetained: true, underlyingPolicySessionRejectsAtDeadline: false, stage: s.nativeStage, record: record.checkpoint,
      limit: 'Observer/caller detects timeout; unchanged PolicySession itself has no whole-cleanup pending-I/O deadline' }
    release(); await pending; await clean(s)
  } else throw Error('Unknown variant')
  if (isolation) await isolation.check('after')
}
async function main() {
  await mkdir(caseRoot, { recursive: true }); await app.whenReady(); app.on('window-all-closed', () => {})
  sampler = setInterval(() => { try { for (const s of sessions) sample(s) } catch (e) { sampleError ??= e } }, plan.pollMs)
  try { await execute(); if (sampleError) throw sampleError }
  catch (e) { r.status = 'FAIL'; r.error = { message: e.message, stack: e.stack } }
  finally {
    clearInterval(sampler); native.setFault(0)
    for (const s of sessions) { try { await s.safety() } catch (e) { r.status = 'FAIL'; r.safetyError = e.message } }
    if (isolation) { try { await isolation.stop() } catch (e) { r.status = 'FAIL'; r.isolationStopError = e.message } }
    for (const gate of gates) native.closeHandle(gate)
    r.sessions = sessions.map(s => ({ ...s.summary(), quotaReadback: s.quotaReadback }))
    r.memorySummary = sessions.map(s => {
      const entries = samples.filter(x => x.sessionId === s.sessionId)
      return { sessionId: s.sessionId, phase: s.phase, quota: s.quota, peakJobCommitBytes: Math.max(0, ...entries.map(x => x.memory.peakJobCommitBytes)),
        maxReportedJobCommitBytes: Math.max(0, ...entries.map(x => x.memory.jobCommitReportedBytes ?? 0)), samples: entries.length }
    })
    save(join(caseRoot, 'result.json'), r); app.exit(r.status === 'FAIL' ? 1 : 0)
  }
}
void main().catch(e => { save(join(caseRoot, 'fatal.json'), { message: e.message, stack: e.stack }); app.exit(1) })
