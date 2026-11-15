// @ts-nocheck -- Test-only Electron host; no production imports this file.
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, access, cp, lstat } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { PolicySession, until, pause } from './policy-b-runtime'

const output = resolve(__dirname), config = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'))
const plan = JSON.parse(readFileSync(config.plan, 'utf8'))
const mode = process.argv.find(a => a.startsWith('--policy-mode='))?.slice(14) ?? 'suite'
const root = join(output, `${config.runId}-${mode}-${randomUUID()}`), nativePath = join(output, 'exercise-process.node')
const native = createRequire(__filename)(nativePath), records = [], sessions = [], externalHandles = []
app.setPath('userData', join(root, 'userData')); app.setPath('crashDumps', join(root, 'crashes'))
function persist() { writeFileSync(join(output, `${config.runId}-${mode}.json`), JSON.stringify({
  mode, hostPid: process.pid, root, electron: process.versions.electron, embeddedNode: process.versions.node, records }, null, 2)) }
async function test(name, work) {
  const r = { name, started: new Date().toISOString() }, start = performance.now()
  try { await work(r); r.status ??= 'PASS' }
  catch (e) { r.status = 'FAIL'; r.error = { name: e.name, message: String(e.message), stack: String(e.stack).slice(0, 1800) }; throw e }
  finally { r.elapsedMs = performance.now() - start; records.push(r); persist(); console.log(`${r.status}: ${name}`) }
}
async function session(environment = process.env) { const s = new PolicySession(root, nativePath, environment); sessions.push(s); await s.prepare(); return s }
const exists = async path => { try { await access(path); return true } catch { return false } }
function observe(pid) { const h = native.watch(pid); externalHandles.push(h); return h }
async function waitFile(path) { await until(() => exists(path)); return JSON.parse(await readFile(path, 'utf8')) }
async function fixture(s, code) { const path = join(s.workspace, 'fixture.cjs'); await writeFile(path, code); return path }
async function nodeSession(code, suppressTracking = false) {
  const s = await session(); s.capturesEnabled = !suppressTracking
  await s.launch(config.node, [await fixture(s, code)]); return s
}
function verifyOutcome(s, r) {
  r.session = s.summary()
  assert.equal(s.released, true); assert.equal(s.manager.size, 0)
  assert.deepEqual(s.beforeRelease, []); assert.equal(s.disposition === 'CLEAN' || s.disposition === 'HISTORY_UNVERIFIED', true)
  if (s.disposition === 'CLEAN') { assert.equal(s.processClean, true); assert.equal(s.cleanupComplete, true) }
  else { assert.equal(s.processClean, false); assert.equal(s.cleanupComplete, false) }
}

function treeCode(workspace, held) {
  const release = join(workspace, 'release'), childReady = join(workspace, 'child.json'), grandReady = join(workspace, 'grand.json')
  const grand = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(grandReady)},JSON.stringify({pid:process.pid}));
    ${held ? `setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)` : 'setTimeout(()=>process.exit(0),1)'}`
  const child = `const fs=require('node:fs'),{spawn}=require('node:child_process');
    const p=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(grand)}],{detached:true,stdio:'ignore',windowsHide:true});
    p.once('error',()=>process.exit(9));p.unref(); fs.writeFileSync(${JSON.stringify(childReady)},JSON.stringify({pid:process.pid,grandPid:p.pid}));
    ${held ? `setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)` : 'setTimeout(()=>process.exit(0),1)'}`
  return `const fs=require('node:fs'),{spawn}=require('node:child_process');
    const p=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(child)}],{detached:true,stdio:'ignore',windowsHide:true});
    p.once('error',()=>process.exit(9));p.unref();
    fs.writeFileSync('root-ready.json',JSON.stringify({pid:process.pid}));
    setInterval(()=>{if(fs.existsSync(${JSON.stringify(held ? release : grandReady)}))process.exit(0)},5);`
}
async function heldHistory() {
  const s = await session(); s.capturesEnabled = false
  await s.launch(config.node, [await fixture(s, treeCode(s.workspace, true))])
  const child = await waitFile(join(s.workspace, 'child.json')), grand = await waitFile(join(s.workspace, 'grand.json'))
  const memberPids = native.jobMembers(s.handle)
  assert.ok(memberPids.includes(child.pid)); assert.ok(memberPids.includes(grand.pid))
  const observed = memberPids.map(pid => ({ pid, handle: observe(pid) }))
  await writeFile(join(s.workspace, 'release'), 'release real short-lived tree after independent handles retained')
  await until(() => observed.every(p => native.waitState(p.handle) === 'SIGNALED'))
  return { s, observed, child, grand, memberPids }
}

async function runSuite() {
  for (const warm of ['cold', 'warm']) await test(`node-${warm}`, async r => {
    const s = await nodeSession('function Sum(a,b){return a+b}; console.log(JSON.stringify({ok:true,value:Sum(2,3)}))')
    await until(() => s.exitCode !== null); assert.equal(s.exitCode, 0); assert.equal(JSON.parse(s.output.trim()).value, 5)
    await s.close(); verifyOutcome(s, r)
  })
  for (const warm of ['cold', 'warm']) await test(`csharp-${warm}`, async r => {
    const compile = await session(), env = { ...process.env,
      DOTNET_CLI_HOME: join(compile.workspace, 'cli-home'), NUGET_PACKAGES: join(compile.workspace, 'packages'),
      DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true',
      MSBUILDDISABLENODEREUSE: '1', DOTNET_NOLOGO: '1' }
    compile.environment = env
    await writeFile(join(compile.workspace, 'global.json'), JSON.stringify({ sdk: { version: config.sdk, rollForward: 'disable' } }))
    await writeFile(join(compile.workspace, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
    await writeFile(join(compile.workspace, 'Exercise.csproj'), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
      <OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><EnableDefaultCompileItems>false</EnableDefaultCompileItems>
      <UseSharedCompilation>false</UseSharedCompilation><NuGetAudit>false</NuGetAudit><ImportDirectoryBuildProps>false</ImportDirectoryBuildProps>
      <ImportDirectoryBuildTargets>false</ImportDirectoryBuildTargets></PropertyGroup><ItemGroup><Compile Include="Program.cs"/></ItemGroup></Project>`)
    await writeFile(join(compile.workspace, 'Program.cs'), 'using System; using System.Text.Json; class Solution { public int Sum(int a,int b)=>a+b; } class Driver { static void Main(){Console.WriteLine(JsonSerializer.Serialize(new {ok=true,value=new Solution().Sum(2,3)}));} }')
    await compile.launch(config.dotnet, ['build', join(compile.workspace, 'Exercise.csproj'), '-c', 'Release', '--disable-build-servers',
      '-nodeReuse:false', '--configfile', join(compile.workspace, 'NuGet.Config'), '-p:NuGetAudit=false',
      '-p:ImportDirectoryBuildProps=false', '-p:ImportDirectoryBuildTargets=false'], 'compile')
    await until(() => compile.exitCode !== null, plan.compileDeadlineMs); assert.equal(compile.exitCode, 0, compile.output)
    const assets = JSON.parse(await readFile(join(compile.workspace, 'obj/project.assets.json'), 'utf8'))
    assert.equal(Object.keys(assets.libraries).length, 0)
    const artifact = join(root, `csharp-artifact-${warm}`); await cp(join(compile.workspace, 'bin/Release/net10.0'), artifact, { recursive: true })
    await compile.close(); r.compile = compile.summary()
    const execute = await session(); await execute.launch(config.dotnet, [join(artifact, 'Exercise.dll')])
    await until(() => execute.exitCode !== null); assert.equal(execute.exitCode, 0)
    assert.equal(JSON.parse(execute.output.trim()).value, 5); await execute.close(); verifyOutcome(execute, r)
    r.offlinePackages = Object.keys(assets.libraries).length; r.coldWarm = 'two fresh workspaces, second benefits from host/OS caches only'
  })
  await test('root-first', async r => {
    const s = await session(), release = join(s.workspace, 'root-release'), ready = join(s.workspace, 'child.json')
    const childCode = `require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)`
    await s.launch(config.node, [await fixture(s, `const fs=require('node:fs'),{spawn}=require('node:child_process');
      const c=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore',windowsHide:true});c.unref();
      setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},5)` )])
    const child = await waitFile(ready), external = observe(child.pid)
    s.scan(); const before = native.jobMembers(s.handle)
    assert.ok(before.includes(s.rootPid)); assert.ok(before.includes(child.pid))
    const helpers = before.filter(pid => pid !== s.rootPid && pid !== child.pid).map(pid => ({ pid, handle: observe(pid) }))
    r.additionalProcesses = helpers.map(p => ({ pid: p.pid, image: native.processImage(p.handle) }))
    for (const p of r.additionalProcesses) assert.match(p.image, /\\(?:conhost|OpenConsole)\.exe$/i)
    await writeFile(release, 'root exit after Job membership established'); await until(() => s.exitCode !== null)
    assert.equal(native.waitState(external), 'PENDING'); const after = native.jobMembers(s.handle)
    assert.ok(after.includes(child.pid)); assert.equal(after.includes(s.rootPid), false)
    await s.close(); assert.equal(native.waitState(external), 'SIGNALED')
    for (const p of helpers) assert.equal(native.waitState(p.handle), 'SIGNALED')
    verifyOutcome(s, r); assert.equal(s.disposition, 'CLEAN'); r.membersBefore = before; r.membersAfterRoot = after
  })
  for (const iteration of [1, 2]) await test(`short-natural-${iteration}`, async r => {
    const s = await session(); await s.launch(config.node, [await fixture(s, treeCode(s.workspace, false))])
    await until(() => s.exitCode !== null); assert.equal(s.exitCode, 0); await s.close(); verifyOutcome(s, r)
    if (s.disposition === 'CLEAN') { r.status = 'NOT_OBSERVED'; r.phenomenon = 'Natural tracker history gap not observed; cleanup invariants passed' }
    else { await access(s.workspace); assert.equal(JSON.parse(await readFile(s.recordPath, 'utf8')).finalized, true) }
  })
  for (const iteration of [1, 2]) await test(`short-held-${iteration}`, async r => {
    const h = await heldHistory(); await h.s.close(); verifyOutcome(h.s, r)
    assert.equal(h.s.disposition, 'HISTORY_UNVERIFIED'); await access(h.s.workspace)
    assert.equal(h.observed.every(p => native.waitState(p.handle) === 'SIGNALED'), true)
    r.independentProcessHandles = h.memberPids; r.trackerSuppression = 'Deliberate historical observation gap; no fake counter changes'
  })
  for (const offset of [0, 15, 30, 60]) await test(`race-${offset}`, async r => {
    const s = await session(); await s.launch(config.node, [await fixture(s, `const fs=require('node:fs'),{spawn}=require('node:child_process');
      fs.writeFileSync('root-ready.json','{}');setTimeout(()=>{const p=spawn(${JSON.stringify(config.node)},['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});
      p.unref();fs.writeFileSync('spawned.json',JSON.stringify({pid:p.pid}))},15);setInterval(()=>{},1000)` )])
    await waitFile(join(s.workspace, 'root-ready.json')); await pause(offset)
    const spawned = await exists(join(s.workspace, 'spawned.json'))
    await s.close(); verifyOutcome(s, r); await assert.rejects(s.launch(config.node, []), /ADMISSION_CLOSED/)
    r.cancelOffsetMs = offset; r.spawnObservedBeforeCancel = spawned
    if (!spawned) { r.status = 'NOT_OBSERVED'; r.phenomenon = 'No completed child spawn before cancellation in this scheduled slot' }
  })
  await test('failed-association', async r => {
    const probe = native.failedAssociation(config.node)
    try {
      assert.equal(probe.assigned, false); assert.notEqual(probe.win32Error, 0)
      await until(() => native.waitState(probe.accepted) === 'SIGNALED' && native.waitState(probe.rejected) === 'SIGNALED')
      r.before = probe.before; r.after = probe.after; r.assigned = probe.assigned; r.win32Error = probe.win32Error
      r.userCodeResumed = false; r.proof = 'Both CreateProcess calls were CREATE_SUSPENDED; ResumeThread never called; no PID killing'
      r.interpretation = 'Raw accounting is diagnostic, failed association is not counted as student code execution'
      if (probe.after.totalProcesses <= probe.before.totalProcesses) { r.status = 'NOT_OBSERVED'; r.phenomenon = 'Expected counter increment not observed on this host' }
    } finally { native.closeHandle(probe.accepted); native.closeHandle(probe.rejected); native.closeHandle(probe.job) }
  })
  await test('history-restart', async r => {
    const h = await heldHistory(); await h.s.close(); verifyOutcome(h.s, r); assert.equal(h.s.disposition, 'HISTORY_UNVERIFIED')
    const before = await readFile(join(h.s.workspace, 'manifest.json'), 'utf8')
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(config.electron, [join(output, 'host.cjs'), '--policy-mode=recovery', `--record=${h.s.recordPath}`, `--workspace=${h.s.workspace}`],
      { cwd: config.root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''; child.stderr.on('data', b => { stderr += b })
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({code,signal})) })
    assert.equal(result.code, 0, stderr)
    const recovered = JSON.parse(await readFile(join(output, `${config.runId}-recovery.json`), 'utf8'))
    assert.notEqual(recovered.hostPid, process.pid); assert.equal(recovered.record.disposition, 'HISTORY_UNVERIFIED')
    assert.equal(recovered.workspacePreserved, true); assert.equal(await readFile(join(h.s.workspace, 'manifest.json'), 'utf8'), before)
    r.recovery = recovered; r.parentHostPid = process.pid
  })
  for (const kind of ['unsignaled', 'member', 'query', 'ownership', 'native', 'record']) await test(`deny-${kind}`, async r => {
    let s
    if (kind === 'record') { const h = await heldHistory(); s = h.s; s.faults.record = true }
    else {
      s = await nodeSession('setInterval(()=>{},1000)')
      if (kind === 'unsignaled' || kind === 'member') s.faults.skipTerminate = true
      if (kind === 'member') s.capturesEnabled = false
      if (kind === 'query') s.faults.query = true
      if (kind === 'ownership') s.faults.ownership = true
      if (kind === 'native') native.setFault(3)
    }
    await assert.rejects(s.close(kind === 'unsignaled' || kind === 'member' ? plan.negativeUnresolvedDeadlineMs : plan.cleanupDeadlineMs))
    assert.equal(s.disposition, 'PROCESS_UNRESOLVED'); assert.equal(s.manager.size, 1)
    assert.equal(s.processClean, false); assert.equal(s.cleanupComplete, false); assert.equal(s.released, false)
    await access(s.workspace); r.session = s.summary(); r.expectedPolicyRejection = kind
    native.setFault(0); await s.safety()
  })
  assert.deepEqual(records.map(r => r.name), plan.slots)
}
async function recovery() {
  const recordPath = process.argv.find(a => a.startsWith('--record='))?.slice(9)
  const workspace = process.argv.find(a => a.startsWith('--workspace='))?.slice(12)
  if (!recordPath || !workspace || !resolve(recordPath).startsWith(resolve(output) + '\\') || !resolve(workspace).startsWith(resolve(output) + '\\')) throw Error('Recovery path outside isolated artifact root')
  const record = JSON.parse(await readFile(recordPath, 'utf8'))
  assert.equal(record.disposition, 'HISTORY_UNVERIFIED'); assert.equal(record.finalized, true)
  assert.equal(record.processClean, false); assert.equal(record.cleanupComplete, false); assert.equal(record.workspace, workspace)
  const info = await lstat(workspace); assert.equal(info.isDirectory(), true); assert.equal(info.isSymbolicLink(), false)
  writeFileSync(join(output, `${config.runId}-recovery.json`), JSON.stringify({ hostPid: process.pid, record,
    workspacePreserved: true, action: 'quarantined; no delete, no PID lookup or killing' }, null, 2))
}
async function main() {
  await mkdir(root, { recursive: true }); await app.whenReady(); app.on('window-all-closed', () => {})
  let failed = false
  try { if (mode === 'recovery') await recovery(); else await runSuite() }
  catch (e) { failed = true; console.error(e.stack); persist() }
  finally {
    native.setFault(0)
    for (const s of sessions) await s.safety().catch(e => { failed = true; console.error('Safety cleanup failed:', e.message) })
    for (const h of externalHandles) native.closeHandle(h)
    if (mode !== 'recovery') persist()
    app.exit(failed ? 1 : 0)
  }
}
void main().catch(e => { console.error(e.stack); app.exit(1) })
