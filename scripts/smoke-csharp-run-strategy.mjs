/* global process, console, setTimeout, queueMicrotask */
// Scoped bundle: node -e "require('esbuild').buildSync({entryPoints:['src/main/services/run/run-runtime.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'out/m1-09-smoke/runtime.cjs'})"
// Run with Electron, using the existing unchanged production native adapter.
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const { RunService, CSharpRunStrategy, CsharpRunPreparation, CsharpRunProbe, RunSourceGuard,
  IpcHandlerRegistry, ProcessManager, ProjectService, FileSystemService, WindowsPipedProcessAdapter } = require(resolve('out/m1-09-smoke/runtime.cjs'))
const inspection = require(resolve('spikes/csharp-project-run/out/native/run-probe.node'))
const runId = new Date().toISOString().replaceAll(':', '-')
const root = resolve(process.env.SystemRoot, 'Temp', `coding-ide-m1-09-${runId}`, 'Console Việt # 😀')
const output = resolve('out/m1-09-smoke', runId)
const evidence = { runId, platform: process.platform, arch: process.arch, electron: process.versions.electron,
  fixtureRoot: root, cases: [], commands: [], hashes: {} }
const manager = new ProcessManager(), projects = new ProjectService()
const files = new FileSystemService(projects, { trashItem: async () => {}, watchFactory: () => ({ close() {} }) })
const native = new WindowsPipedProcessAdapter(resolve('out/main/native/run-process.node'))
const children = []
const tracked = { create(spec, observe) {
  evidence.commands.push({ args: spec.args, executable: spec.executable, cwd: spec.cwd, shell: spec.shell })
  const child = native.create(spec, observe); children.push(child); return child
} }
const preparation = CsharpRunPreparation.production(join(root, 'preferences'), projects, files, manager,
  owner => new CsharpRunProbe(manager, owner, () => tracked))
const handlers = new Map()
const registry = new IpcHandlerRegistry({ handle: (channel, handler) => handlers.set(channel, handler),
  removeHandler: channel => handlers.delete(channel) })
let dirty = false, revision = 0, phaseAction, outputAction, events = [], phases = [], replies = 0
const guard = new RunSourceGuard(registry, {
  authorize: session => assert.equal(projects.getActiveProject()?.id, session.projectId),
  send: (owner, channel, request) => {
    if (channel !== 'run:source-guard-requested') return
    replies++
    queueMicrotask(() => { void handlers.get('run:source-guard-reply')({ sender: { id: owner } },
      { ...request, revision, dirty, conflict: false }) })
  },
})
const run = new RunService({
  authorize: async target => ({ ...target, ...await files.authorizeRunFile(target.projectId, target.relativePath) }),
  resolveRuntime: context => preparation.resolve(context),
}, [new CSharpRunStrategy()], { manager, adapter: tracked, sourceGuard: guard,
  onEvent: (_owner, event) => { events.push(event); outputAction?.(event) },
  onPhase: (_owner, session, phase) => { phases.push(phase); phaseAction?.(session, phase) },
})
async function until(predicate, label, timeout = 90_000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw Error(`Timeout: ${label}; ${JSON.stringify(events.slice(-4))}`)
    await new Promise(done => setTimeout(done, 20))
  }
}
const csproj = (tfm, slow) => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>${tfm}</TargetFramework><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit></PropertyGroup>${slow ? `
<UsingTask TaskName="HoldBuild" TaskFactory="RoslynCodeTaskFactory" AssemblyFile="$(MSBuildToolsPath)/Microsoft.Build.Tasks.Core.dll"><Task><Code Type="Fragment" Language="cs"><![CDATA[Log.LogMessage(Microsoft.Build.Framework.MessageImportance.High, "M109_BUILD_READY"); System.Threading.Thread.Sleep(60000);]]></Code></Task></UsingTask>
<Target Name="HoldForStop" AfterTargets="CoreCompile"><HoldBuild /></Target>` : ''}</Project>`
const program = mode => mode === 'build-failure' ? 'this is not valid C#;'
  : mode === 'stop-execute' ? `
if (args.Length > 0) { Thread.Sleep(60000); return; }
using var child = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!) { ArgumentList = { "child" }, UseShellExecute = false });
Console.WriteLine("M109_EXEC_READY"); Thread.Sleep(60000);`
  : `Console.WriteLine("M109 Xin chào 😀"); Console.Error.WriteLine("M109 stderr"); Environment.Exit(${mode === 'nonzero' ? 23 : 0});`
async function scenario(version, mode) {
  const major = version.split('.')[0], folder = join(root, `sdk${major}-${mode}`)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'global.json'), JSON.stringify({ sdk: { version, rollForward: 'disable' } }))
  await writeFile(join(folder, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
  await writeFile(join(folder, 'App.csproj'), csproj(`net${major}.0`, mode === 'stop-build'))
  await writeFile(join(folder, 'Program.cs'), program(mode))
  const project = await projects.openRoot(folder)
  events = []; phases = []; replies = 0; dirty = mode === 'dirty'; revision++
  let stop
  const requestStop = session => { stop ??= run.stopRun(session.sessionId, 7); void stop.catch(() => {}) }
  phaseAction = (session, phase) => { if (mode === 'stop-transition' && phase === 'EXECUTING') requestStop(session) }
  outputAction = event => {
    if (event.type === 'stdout' && ((mode === 'stop-build' && event.data.includes('M109_BUILD_READY'))
      || (mode === 'stop-execute' && event.data.includes('M109_EXEC_READY')))) requestStop(event.session)
  }
  const before = evidence.commands.length, initialChildren = children.length
  const session = await run.startPlannedRun({ kind: 'csharp-project', projectId: project.id, relativePath: 'App.csproj', dirty: false }, 7)
  await until(() => events.some(e => e.type === 'exit'), mode)
  await stop
  const exits = events.filter(e => e.type === 'exit'), commands = evidence.commands.slice(before)
  const execution = commands.filter(c => ['build', 'run'].includes(c.args[0]))
  const expected = mode.startsWith('stop-') ? 'CANCELLED' : ['build-failure', 'nonzero', 'dirty'].includes(mode) ? 'FAILED' : 'EXITED'
  assert.equal(exits.length, 1); assert.equal(exits[0].session.state, expected, JSON.stringify(events))
  assert.ok(events.every(e => e.session.sessionId === session.sessionId))
  assert.equal(execution.length, mode === 'dirty' ? 0 : ['stop-build', 'stop-transition', 'build-failure'].includes(mode) ? 1 : 2)
  if (mode === 'success' || mode === 'nonzero') {
    assert.ok(events.some(e => e.type === 'stdout' && e.data.includes('M109 Xin chào 😀')))
    assert.ok(events.some(e => e.type === 'stderr' && e.data.includes('M109 stderr')))
    assert.equal(exits[0].exitCode, mode === 'success' ? 0 : 23)
  }
  if (mode === 'build-failure' || mode === 'nonzero' || mode === 'dirty') {
    assert.ok(events.some(e => e.type === 'error' && e.error.details?.reason ===
      (mode === 'build-failure' ? 'BUILD_OR_RESTORE_FAILED' : mode === 'nonzero' ? 'EXECUTION_FAILED' : 'SOURCE_DIRTY')))
  }
  assert.equal(manager.size, 0); assert.equal(guard.size, 0)
  assert.ok(children.every(child => child.isReleased()))
  evidence.cases.push({ sdk: version, tfm: `net${major}.0`, mode, result: 'PASS', phases, replies,
    exit: exits[0], launched: children.length - initialChildren, managerSize: manager.size,
    allNativeReleased: true, handles: inspection.inspect().handles,
    execution, errors: events.filter(e => e.type === 'error') })
  console.log(`PASS SDK ${version} ${mode}`)
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'progress.json'), JSON.stringify(evidence, null, 2))
}
async function main() {
  const baseline = inspection.inspect(); evidence.initialProcesses = baseline.processes
  try {
    await app.whenReady(); files.start(); guard.start()
    for (const path of ['src/main/services/run/csharp-run-strategy.ts', 'src/main/services/run/csharp-run-preparation.ts',
      'src/main/services/run/run-service.ts', 'src/main/services/run/run-strategy.ts',
      'out/main/native/run-process.node', 'out/m1-09-smoke/runtime.cjs']) {
      evidence.hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    if (process.argv.includes('--resource-repeat')) {
      for (let attempt = 0; attempt < 4; attempt++) await scenario('8.0.410', 'success')
      const handles = evidence.cases.map(item => item.handles)
      assert.equal(handles.at(-1), handles[1], `Warm handle growth: ${handles.join(',')}`)
      evidence.warmHandles = handles
    } else for (const version of ['8.0.410', '10.0.112']) {
      for (const mode of ['success', 'build-failure', 'nonzero', 'stop-build', 'stop-execute', 'stop-transition', 'dirty']) {
        await scenario(version, mode)
      }
    }
    evidence.result = 'PASS'
  } catch (error) { evidence.result = 'FAIL'; evidence.error = String(error.stack ?? error); console.error(evidence.error) }
  finally {
    try { await run.stop(); guard.stop(); files.stop(); await manager.stop() }
    catch (error) { evidence.result = 'FAIL'; evidence.cleanupError = String(error) }
    const after = inspection.inspect()
    evidence.newSurvivors = after.processes.filter(p => !baseline.processes.some(b => b.pid === p.pid && b.created === p.created))
    evidence.managerSize = manager.size; evidence.nativeCount = children.length
    evidence.allNativeReleased = children.every(child => child.isReleased())
    evidence.handlesBefore = baseline.handles; evidence.handlesAfter = after.handles
    if (evidence.newSurvivors.length || manager.size || !evidence.allNativeReleased) evidence.result = 'FAIL'
    await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2))
    console.log(`Evidence: ${join(output, 'results.json')} (${evidence.result})`)
    app.exit(evidence.result === 'PASS' ? 0 : 1)
  }
}
void main()
