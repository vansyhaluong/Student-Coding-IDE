/* global console, process, setTimeout, clearTimeout */
// M1-12 core plus M2-06 console input. Production Renderer/Preload, real Run
// services, SDKs and Windows Jobs. Run npm run build, then
// node scripts/build-csharp-run-ui-smoke.mjs first.
// Raw execution evidence stays in ignored out/m2-06; acceptance is recorded in docs.
import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
// Keep the test driver alive until asynchronous owner/service cleanup has joined.
app.on('window-all-closed', () => {})
const { RunService, CSharpRunStrategy, JavaScriptRunStrategy, NodeRuntimeDetector,
  CsharpRunPreparation, CsharpRunProbe, RunSourceGuard, ProcessManager, ProjectService,
  FileSystemService, IpcHandlerRegistry, RunIpcService, FileIpcService, RunProjectLifecycle,
  CsharpRunTargetRequests, CsharpRunPreflight, DotnetRunRuntimeResolver,
  CsharpRunTargetResolver, CsharpRunTargetStore, WindowsPipedProcessAdapter,
} = require(resolve('out/m1-11-smoke/main/runtime.js'))
const inspection = require(resolve('spikes/csharp-project-run/out/native/run-probe.node'))
const evidence = { platform: process.platform, arch: process.arch, electron: process.versions.electron, cases: [], commands: [] }
const output = resolve('out/m2-06')
const archive = join(output, `core-${Date.now()}.json`)
await mkdir(output, { recursive: true })

const projectXml = (tfm, extra = '', outputType = 'Exe') => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>${outputType}</OutputType><TargetFramework>${tfm}</TargetFramework><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit></PropertyGroup>${extra}</Project>`
const holdBuild = `<UsingTask TaskName="HoldBuild" TaskFactory="RoslynCodeTaskFactory" AssemblyFile="$(MSBuildToolsPath)/Microsoft.Build.Tasks.Core.dll"><Task><Code Type="Fragment" Language="cs"><![CDATA[Log.LogMessage(Microsoft.Build.Framework.MessageImportance.High, "M112_BUILD_READY"); System.Threading.Thread.Sleep(60000);]]></Code></Task></UsingTask><Target Name="HoldForStop" AfterTargets="CoreCompile"><HoldBuild /></Target>`
const good = 'Console.Write("M112 Xin chào 😀"); Console.Error.WriteLine("M112 stderr");'
const long = 'Console.WriteLine("M112_EXEC_READY"); Thread.Sleep(60000);'
const descendant = `if(args.Length>0){Thread.Sleep(60000);return;}
using var child=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!){ArgumentList={"child"},UseShellExecute=false});
Console.WriteLine("M112_DESCENDANT:"+child!.Id);`
const utf8Console = `Console.InputEncoding = new System.Text.UTF8Encoding(false);
Console.OutputEncoding = new System.Text.UTF8Encoding(false);
`
const reader = `${utf8Console}Console.WriteLine("M206_READY");
string Next() => Console.ReadLine();
var first = Next();
Console.WriteLine("M206_A:" + first);
var second = Next();
Console.WriteLine("M206_B:" + second);
var third = Next();
Console.WriteLine("M206_C:" + third);
var fourth = Next();
Console.WriteLine("M206_D:[" + fourth + "]");`
const waiting = `${utf8Console}Console.WriteLine("M206_WAIT");
var line = Console.ReadLine();
Console.WriteLine(line == null ? "M206_NULL" : "M206_GOT:" + line);`
const blocking = `${utf8Console}Console.WriteLine("M206_BLOCK"); Thread.Sleep(120000);`
const killed = `${utf8Console}if(args.Length>0){Thread.Sleep(120000);return;}
using var child=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!){ArgumentList={"child"},UseShellExecute=false});
Console.WriteLine("M206_APP:"+Environment.ProcessId);
Console.WriteLine("M206_CHILD:"+child!.Id);
Console.ReadLine();
Console.WriteLine("M206_AFTER_KILL");`

async function main() {
  await app.whenReady()
  evidence.sourceHashes = {}
  for (const path of ['src/renderer/src/features/output/run-controller.ts', 'src/main/services/run/run-service.ts',
    'src/main/services/run/csharp-run-strategy.ts', 'src/main/services/run/native/run-process.cpp', 'out/main/native/run-process.node']) {
    evidence.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  const fixture = await mkdtemp(join(tmpdir(), 'coding-ide-m1-12-'))
  evidence.fixture = fixture
  const projects = new ProjectService(), manager = new ProcessManager(), children = [], events = []
  const files = new FileSystemService(projects, { trashItem: async () => {} })
  const registry = new IpcHandlerRegistry(ipcMain)
  const native = new WindowsPipedProcessAdapter(resolve('out/main/native/run-process.node'))
  const baseline = inspection.inspect()
  let failExecutionClose = false
  const adapter = { create(spec, observe, stdin = 'closed') {
    const command = { args: spec.args, cwd: spec.cwd, shell: spec.shell, stdout: '', stdin }
    evidence.commands.push(command)
    const child = native.create(spec, event => {
      if (event.type === 'stdout') command.stdout += event.data
      observe(event)
    }, stdin); children.push(child)
    return { ...child, close: async () => {
      // Controlled failure fixture; all production native/process code is unchanged.
      if (failExecutionClose && spec.args[0] === 'run') throw Error('M112 injected close failure')
      await child.close()
    } }
  } }
  const probe = owner => new CsharpRunProbe(manager, owner, () => adapter)
  const preferences = join(fixture, 'preferences')
  const preparation = CsharpRunPreparation.production(preferences, projects, files, manager, probe)
  let window, ownerCleanup = Promise.resolve(), runIpc
  const send = (channel, value) => { if (window && !window.isDestroyed()) window.webContents.send(channel, value) }
  const targets = new CsharpRunTargetRequests(manager, owner => {
    const owned = probe(owner), evaluator = new CsharpRunPreflight(files, new DotnetRunRuntimeResolver(owned), owned)
    const resolver = new CsharpRunTargetResolver(projects, files, evaluator)
    const store = new CsharpRunTargetStore(preferences, projects, files, resolver)
    return { store, close: async () => { try { await store.stop() } finally { await owned.stop() } } }
  }, { projects, files, onCleanupError: error => { evidence.cleanupError = String(error) } })
  const authorize = (context, id) => {
    assert.equal(context.senderId, window.webContents.id)
    assert.equal(context.senderFrame.frameToken, window.webContents.mainFrame.frameToken)
    return id ? projects.getAuthorizedProject(id) : undefined
  }
  const guard = new RunSourceGuard(registry, { authorize: session => projects.getAuthorizedProject(session.projectId),
    authorizeReply: authorize, send: (_owner, channel, request) => send(channel, request) })
  const node = new NodeRuntimeDetector()
  const run = new RunService({ authorize: async target => ({ ...target, ...await files.authorizeRunFile(target.projectId, target.relativePath) }),
    resolveRuntime: context => context.strategyKind === 'javascript-file' ? node.resolve() : preparation.resolve(context),
  }, [new CSharpRunStrategy(), new JavaScriptRunStrategy()], { manager, adapter, sourceGuard: guard,
    onEvent: (owner, event) => /\.csproj$/i.test(event.session.relativePath) ? runIpc.publish(owner, event) : send('run:event', event),
    onPhase: (owner, session, phase) => runIpc.publishPhase(owner, session, phase),
    onFinalized: (owner, session) => runIpc.retireSession(owner, session),
  })
  runIpc = new RunIpcService(registry, run, () => {}, { targets, authorize,
    start: (request, owner) => run.startPlannedRun(request, owner),
    publish: (_owner, event) => { events.push(event); if (projects.getActiveProject()?.id === event.session.projectId) send('run:project-event', event) },
  })
  const lifecycle = new RunProjectLifecycle(run, projects, files, error => { evidence.cleanupError = String(error) })
  const fileIpc = new FileIpcService(registry, files, event => send('file:changed', event), status => send('file:status-changed', status))
  const unsubProject = projects.subscribe(activeProject => send('project:changed', { activeProject }))
  const shellHandlers = {
    'project:get-active': () => ({ ok: true, value: projects.getActiveProject() }),
    'lifecycle:get-status': () => ({ ok: true, value: { state: 'RUNNING' } }),
    'project:list-recent': () => ({ ok: true, value: [] }),
    'settings:get': () => ({ ok: true, value: { settings: { theme: 'dark', fontSize: 13, tabSize: 2, autoSave: false }, recovered: false } }),
    'git:get-context': () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'Git unavailable in Run acceptance fixture.', retryable: false } }),
  }
  for (const [channel, handler] of Object.entries(shellHandlers)) ipcMain.handle(channel, handler)
  function createWindow() {
    window = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: {
      preload: resolve('out/preload/index.js'), contextIsolation: true, nodeIntegration: false,
      sandbox: true, backgroundThrottling: false,
    } })
    const owner = window.webContents.id
    const cleanup = () => { ownerCleanup = Promise.all([runIpc.invalidateOwner(owner), run.stopOwner(owner)]) }
    window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (!inPlace && mainFrame) cleanup() })
    window.webContents.once('destroyed', cleanup)
  }
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  async function until(predicate, label, timeout = 90_000) {
    const deadline = Date.now() + timeout
    while (!await predicate()) {
      if (Date.now() > deadline) throw Error(`Timeout ${label}; ${JSON.stringify(events.slice(-3))}`)
      await new Promise(done => setTimeout(done, 25))
    }
  }
  const ui = expression => until(() => evaluate(expression), expression)
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const button = text => evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`)
  const bodyIncludes = text => ui(`document.body.textContent.includes(${JSON.stringify(text)})`)
  async function clean() {
    await until(() => manager.size === 0 && guard.size === 0 && children.every(child => child.isReleased()), 'all Jobs/leases released')
    assert.equal(evidence.cleanupError, undefined)
    const initial = new Set(baseline.processes.map(item => `${item.pid}:${item.created}`))
    const survivors = inspection.inspect().processes.filter(item => !initial.has(`${item.pid}:${item.created}`))
    assert.deepEqual(survivors, [], 'No new dotnet/MSBuild/compiler/GateApp process survives')
  }
  async function pass(sdk, name, action) {
    const filter = app.commandLine.getSwitchValue('case')
    if (filter && !filter.split(',').some(part => name.includes(part))) return
    const start = Date.now(), commandIndex = evidence.commands.length, eventIndex = events.length
    let timer
    try {
      await Promise.race([action(), new Promise((_done, reject) => { timer = setTimeout(() => reject(Error(`Case deadline: ${name}`)), 120_000) })])
      await clean()
      evidence.cases.push({ sdk, name, result: 'PASS', durationMs: Date.now() - start,
        nativeSessions: evidence.commands.length - commandIndex, events: events.slice(eventIndex), handles: inspection.inspect().handles })
      console.log(`PASS ${sdk} ${name}`)
    } catch (error) {
      if (window && !window.isDestroyed()) {
        evidence.failureUi = await evaluate(`document.querySelector('[role="dialog"]')?.textContent ?? document.querySelector('.editor-run-actions')?.textContent`).catch(() => 'Renderer unavailable')
        await writeFile(join(output, 'failure.png'), (await window.capturePage()).toPNG())
      }
      evidence.cases.push({ sdk, name, result: 'FAIL', error: String(error.stack ?? error) }); throw error
    } finally {
      clearTimeout(timer)
      await writeFile(join(output, 'core.json'), JSON.stringify(evidence, null, 2))
      await writeFile(archive, JSON.stringify(evidence, null, 2))
    }
  }
  async function load(folder) {
    // Settle the outgoing page before changing project and booting a fresh page.
    // Actual in-place project switching is exercised separately below.
    await window.loadURL('about:blank'); await ownerCleanup
    await projects.openRoot(folder)
    await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup
    await ui(`!!document.querySelector('[aria-label="Choose Run target"]:not(:disabled)')`)
  }
  async function ready() { await ui(`!!document.querySelector('[aria-label="Run"]:not(:disabled)')`) }
  async function runTo(result) {
    const exits = events.filter(event => event.type === 'exit').length
    await ready(); await click('[aria-label="Run"]')
    await until(() => events.filter(event => event.type === 'exit').length === exits + 1, result)
    await ui(`document.querySelector('.output-context [role="status"]')?.textContent.includes(${JSON.stringify(result)})`)
  }
  const composer = () => ui(`!!document.querySelector('[aria-label="Console input"]:not(:disabled)')`)
  async function setComposer(text) {
    await composer()
    const value = await evaluate(`(() => {
      const field = document.querySelector('[aria-label="Console input"]')
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      set.call(field, ${JSON.stringify(text)})
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return field.value
    })()`)
    assert.equal(value, text)
  }
  const pressEnter = () => evaluate(`(() => {
    const field = document.querySelector('[aria-label="Console input"]')
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  })()`)
  const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
  const logHas = text => evaluate(`(() => {
    const log = document.querySelector('.output-log')
    if (!log) return false
    const copy = log.cloneNode(true)
    copy.querySelector('[aria-label="Console input"]')?.remove()
    return (copy.textContent ?? '').includes(${JSON.stringify(text)})
  })()`)
  async function stopAt(label, marker) {
    const eventIndex = events.length
    await ready(); await click('[aria-label="Run"]')
    if (marker) await ui(`document.querySelector('.output-log')?.textContent.includes(${JSON.stringify(marker)})`)
    else await ui(`document.querySelector('.output-context [role="status"]')?.textContent===${JSON.stringify(label)}`)
    await click('[aria-label="Stop Console project"]')
    await bodyIncludes('Stopped')
    assert(!events.slice(eventIndex).some(event => event.session.phase === 'EXECUTING') || label === 'execution')
  }
  async function put(path, data) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
  async function pin(folder, sdk) {
    await put(join(folder, 'global.json'), JSON.stringify({ sdk: { version: sdk, rollForward: 'disable' } }))
    await put(join(folder, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
  }
  try {
    createWindow(); files.start(); guard.start(); lifecycle.start(); targets.start(); runIpc.start(); fileIpc.start()
    const versions = app.commandLine.getSwitchValue('sdk') ? [app.commandLine.getSwitchValue('sdk')] : ['8.0.410', '10.0.112']
    for (const sdk of versions) {
      const tfm = `net${sdk.split('.')[0]}.0`, root = join(fixture, `sdk${sdk}`), single = join(root, 'Single Việt # 😀')
      const csproj = join(single, 'GateApp.csproj'), source = join(single, 'Program.cs')
      await pin(single, sdk); await put(csproj, projectXml(tfm)); await put(source, good)
      await pass(sdk, 'single target/no editor, stdout/stderr/exit 0 and exact SDK', async () => {
        const commandIndex = evidence.commands.length
        await load(single); await runTo('Exited successfully (0)')
        await bodyIncludes('M112 Xin chào 😀'); await bodyIncludes('M112 stderr')
        assert(evidence.commands.slice(commandIndex).filter(command => command.args[0] === '--version').every(command => command.stdout.trim() === sdk))
        const build = evidence.commands.slice(commandIndex).find(command => command.args[0] === 'build')
        const execute = evidence.commands.slice(commandIndex).find(command => command.args[0] === 'run')
        assert(build.args.includes('--disable-build-servers') && build.args.includes('-nodeReuse:false'))
        assert.equal(build.stdin, 'closed')
        assert(execute.args.includes('--no-build') && execute.args.includes('--no-restore') && execute.args.includes('--no-launch-profile'))
        assert.equal(execute.stdin, 'line-input')
      })
      await pass(sdk, 're-run creates a fresh owned session', async () => { await runTo('Exited successfully (0)') })
      await pass(sdk, 'runtime failure and exact exit 23', async () => { await put(source, 'Console.Error.WriteLine("M112 runtime"); Environment.Exit(23);'); await runTo('Execution failed (exit 23)') })
      await pass(sdk, 'build failure suppresses execute', async () => {
        await put(source, 'invalid C# syntax;'); const start = evidence.commands.length
        await runTo('Build or restore failed (exit 1)')
        assert(!evidence.commands.slice(start).some(command => command.args[0] === 'run'))
      })
      await pass(sdk, 'restore failure suppresses execute', async () => {
        await put(source, good); await put(csproj, projectXml(tfm, '<ItemGroup><PackageReference Include="M112.Nonexistent.Package" Version="1.0.0" /></ItemGroup>'))
        const start = evidence.commands.length; await runTo('Build or restore failed (exit 1)')
        assert(!evidence.commands.slice(start).some(command => command.args[0] === 'run'))
        await put(csproj, projectXml(tfm))
      })
      await pass(sdk, 'Stop owned preparation', async () => { await put(source, long); await stopAt('Preparing…') })
      await pass(sdk, 'Stop actual long build task', async () => {
        await put(csproj, projectXml(tfm, holdBuild)); await stopAt('building', 'M112_BUILD_READY'); await put(csproj, projectXml(tfm))
      })
      await pass(sdk, 'Stop execution', async () => { await stopAt('execution', 'M112_EXEC_READY') })
      await pass(sdk, 'Console input ReadLine unicode empty multiline', async () => {
        await put(source, reader); await load(single); await ready(); await click('[aria-label="Run"]')
        await ui(`document.querySelector('.output-context [role="status"]')?.textContent==='Building…'`)
        assert.equal(await evaluate(`document.querySelector('[aria-label="Console input"]')`), null)
        await bodyIncludes('M206_READY'); await composer()
        const execute = evidence.commands.findLast(command => command.args[0] === 'run')
        const built = evidence.commands.findLast(command => command.args[0] === 'build')
        assert.equal(execute.stdin, 'line-input'); assert.equal(built.stdin, 'closed')
        await setComposer('shift')
        await evaluate(`document.querySelector('[aria-label="Console input"]').focus()`)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['shift'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['shift'] })
        await new Promise(done => setTimeout(done, 400))
        assert.equal(await logHas('M206_A:'), false)
        await setComposer('xin chào 😀')
        await evaluate(`document.querySelector('[aria-label="Console input"]').focus()`)
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
        await bodyIncludes('M206_A:xin chào 😀')
        await setComposer('left\nright'); await pressEnter()
        await bodyIncludes('M206_B:left'); await bodyIncludes('M206_C:right')
        await setComposer(''); await pressEnter(); await bodyIncludes('M206_D:[]')
        await ui(`document.querySelector('.output-context [role="status"]')?.textContent.includes('Exited successfully')`)
        assert.equal(await evaluate(`document.querySelector('button') && Array.from(document.querySelectorAll('button')).some(e => ['Send','EOF'].includes(e.textContent.trim()))`), false)
      })
      await pass(sdk, 'Stop during ReadLine', async () => {
        await put(source, waiting); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M206_WAIT'); await composer()
        await click('[aria-label="Stop Console project"]'); await bodyIncludes('Stopped')
        assert.equal(await logHas('M206_GOT:'), false)
      })
      await pass(sdk, 'Stop during blocked stdin write', async () => {
        await put(source, blocking); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M206_BLOCK'); await setComposer('Z'.repeat(8000))
        const started = Date.now(); await pressEnter()
        await ui(`!!document.querySelector('[aria-label="Console input"]:disabled')`)
        await click('[aria-label="Stop Console project"]'); await bodyIncludes('Stopped')
        assert.ok(Date.now() - started < 8_000, 'Stop must unblock a full stdin pipe before the write deadline')
      })
      await pass(sdk, 're-run does not send the previous draft', async () => {
        await put(source, waiting); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M206_WAIT'); await setComposer('not sent')
        await click('[aria-label="Stop Console project"]'); await bodyIncludes('Stopped')
        await click('[aria-label="Run"]'); await bodyIncludes('M206_WAIT')
        assert.equal(await evaluate(`document.querySelector('[aria-label="Console input"]').value`), '')
        await click('[aria-label="Stop Console project"]'); await bodyIncludes('Stopped')
        assert.equal(await logHas('M206_GOT:'), false)
        assert.equal(await logHas('not sent'), false)
      })
      await pass(sdk, 'hard root kill retains descendant until cleanup', async () => {
        await put(source, killed); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M206_CHILD:')
        const hosted = children.at(-1)
        assert.equal(hosted.ownership.mode, 'JOB_OWNED')
        const taskkill = pid => new Promise((done, fail) => {
          execFile(join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/F'],
            { windowsHide: true }, error => error ? fail(error) : done())
        })
        // dotnet run puts the app in the host job, so killing that root ends the tree.
        // Cleanup must still leave no owned process. Survival is proven on the direct host below.
        await taskkill(hosted.ownership.rootPid)
        await until(() => manager.size === 0 && children.every(child => child.isReleased()), 'hosted root kill cleanup')
        assert.equal(await logHas('M206_AFTER_KILL'), false)
        const exe = join(single, 'bin', 'Debug', tfm, 'GateApp.exe')
        let directOut = ''
        const direct = adapter.create({ executable: exe, args: [], cwd: dirname(exe), shell: false, environmentAdditions: {} },
          event => { if (event.type === 'stdout') directOut += event.data }, 'line-input')
        await until(() => /M206_CHILD:(\d+)/.test(directOut), 'direct host child')
        const directChild = Number(/M206_CHILD:(\d+)/.exec(directOut)[1])
        assert.notEqual(direct.ownership.rootPid, directChild)
        await new Promise((done, fail) => {
          execFile(join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(direct.ownership.rootPid), '/F'],
            { windowsHide: true }, error => {
              if (error) return fail(error)
              if (!alive(directChild) || direct.ownership.job.activeProcessCount() < 1) {
                return fail(Error(`direct descendant died with the app root alive=${alive(directChild)} job=${direct.ownership.job.activeProcessCount()}`))
              }
              done()
            })
        })
        await direct.close()
        assert.equal(alive(directChild), false)
        assert.equal(direct.isReleased(), true)
      })
      await pass(sdk, 'project switch during ReadLine', async () => {
        await put(source, waiting); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M206_WAIT'); await composer()
        const away = join(root, 'Switch away'); await mkdir(away, { recursive: true })
        await projects.openRoot(away)
        await until(() => manager.size === 0 && children.every(child => child.isReleased()), 'ReadLine switch cleanup')
        await ui(`!document.querySelector('[aria-label="Stop Console project"]')`)
        assert.equal(await logHas('M206_WAIT'), false)
        assert.equal(await evaluate(`document.querySelector('[aria-label="Console input"]')`), null)
      })
      await pass(sdk, 'cleanup failure injection retains owner and Retry Stop releases native Job', async () => {
        await put(source, long); await load(single); await ready(); await click('[aria-label="Run"]')
        await bodyIncludes('M112_EXEC_READY'); const projectId = projects.getActiveProject().id
        failExecutionClose = true
        try {
          await click('[aria-label="Stop Console project"]')
          await ui(`!!document.querySelector('[aria-label="Retry Stop"]:not(:disabled)')`)
          assert(manager.size > 0 && children.some(child => !child.isReleased()))
          assert(await evaluate(`document.querySelector('.editor-run-button').disabled`))
          const other = join(root, 'Blocked transition'); await mkdir(other)
          await assert.rejects(() => projects.openRoot(other))
          assert.equal(projects.getActiveProject().id, projectId)
          failExecutionClose = false; await click('[aria-label="Retry Stop"]'); await bodyIncludes('Stopped')
        } finally { failExecutionClose = false }
      })
      await pass(sdk, 'natural root exit cleans surviving descendant', async () => {
        await put(source, descendant); await runTo('Exited successfully (0)'); await bodyIncludes('M112_DESCENDANT:')
      })
      await pass(sdk, 'deleted selected target keeps its preflight error visible', async () => {
        await ready(); await rename(csproj, csproj + '.bak')
        try {
          const start = evidence.commands.length; await click('[aria-label="Run"]')
          await ui(`!!document.querySelector('.output-panel [role="alert"]')`)
          await ui(`document.querySelector('.output-context [role="status"]')?.textContent === 'Run failed'`)
          assert(!evidence.commands.slice(start).some(command => ['build', 'run'].includes(command.args[0])))
          await ui(`!document.querySelector('.run-target-trigger')?.textContent.includes('Finding targets')`)
          assert(await evaluate(`!!document.querySelector('.output-panel [role="alert"]')`), 'Preflight error must survive until explicit refresh')
        } finally { await rename(csproj + '.bak', csproj) }
      })
      const multi = join(root, 'Multiple nested'), alpha = join(multi, 'Alpha', 'GateApp.csproj'), beta = join(multi, 'Beta', 'GateApp.csproj')
      await pin(multi, sdk)
      for (const [path, label] of [[alpha, 'ALPHA'], [beta, 'BETA']]) { await put(path, projectXml(tfm)); await put(join(dirname(path), 'Program.cs'), `Console.WriteLine("M112_${label}");`) }
      await pass(sdk, 'multiple/nested chooser and correct target', async () => {
        await load(multi); await click('[aria-label="Choose Run target"]'); await bodyIncludes('Choose a Console project.')
        assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] input[type="radio"]:checked').length`), 0)
        await evaluate(`Array.from(document.querySelectorAll('.run-target-option')).find(e=>e.textContent.includes('Beta/GateApp.csproj')).querySelector('input').click()`)
        await button('Use target'); await bodyIncludes('Ready: Beta/GateApp.csproj'); await button('Cancel')
        await runTo('Exited successfully (0)'); await bodyIncludes('M112_BETA')
        assert(!await evaluate(`document.querySelector('.output-log').textContent.includes('M112_ALPHA')`))
      })
      await pass(sdk, 'owned discovery cancellation joins probes before replacement', async () => {
        await click('[aria-label="Choose Run target"]'); const start = evidence.commands.length
        await button('Refresh targets')
        await until(() => evidence.commands.length > start, 'owned discovery probe launched')
        await button('Cancel discovery'); await bodyIncludes('Target discovery cancelled. Refresh to try again.')
        assert(!evidence.commands.slice(start).some(command => ['build', 'run'].includes(command.args[0])))
        await button('Cancel')
      })
      await pass(sdk, 'remembered target survives renderer restart', async () => {
        await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup; await ready()
        assert.equal(await evaluate(`document.querySelector('[aria-label="Choose Run target"]').title`), 'Beta/GateApp.csproj')
        await runTo('Exited successfully (0)'); await bodyIncludes('M112_BETA')
      })
      await pass(sdk, 'stale saved target requires fresh explicit selection', async () => {
        await rename(beta, join(dirname(beta), 'Deleted.csproj.bak'))
        await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup
        await ui(`!!document.querySelector('[aria-label="Choose Run target"]:not(:disabled)')`)
        await click('[aria-label="Choose Run target"]'); await bodyIncludes('The previous target is no longer available or eligible.')
        assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] input:checked').length`), 0)
        await button('Cancel')
      })
      await pass(sdk, 'project switch during actual build retires session and events', async () => {
        await put(source, long); await put(csproj, projectXml(tfm, holdBuild)); await load(single)
        await ready(); await click('[aria-label="Run"]'); await bodyIncludes('M112_BUILD_READY')
        await projects.openRoot(multi)
        await until(() => manager.size === 0 && children.every(child => child.isReleased()), 'project switch cleanup')
        await ui(`!document.querySelector('[aria-label="Stop Console project"]')`)
        assert(!await evaluate(`document.querySelector('.output-log')?.textContent.includes('M112_BUILD_READY') ?? false`))
        await put(csproj, projectXml(tfm))
      })
      await pass(sdk, 'renderer loss during execution cleans owner', async () => {
        await load(single); await ready(); await click('[aria-label="Run"]'); await bodyIncludes('M112_EXEC_READY')
        await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup
        await ui(`!document.querySelector('[aria-label="Stop Console project"]')`)
      })
      await pass(sdk, 'dirty source blocks Run; explicit editor Save permits Run', async () => {
        await put(source, good); await load(single); await ready()
        await ui(`!!document.querySelector('[title="Program.cs"]')`); await click('[title="Program.cs"]')
        await ui(`!!document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')`)
        await evaluate(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea').focus()`)
        await window.webContents.insertText('// M112_DIRTY\n')
        await ui(`!!document.querySelector('[aria-label="Run unavailable: Save changed files before running."]:disabled')`)
        assert(!(await readFile(source, 'utf8')).includes('M112_DIRTY'), 'Run never auto-saves')
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 's', modifiers: ['control'] })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 's', modifiers: ['control'] })
        await until(async () => (await readFile(source, 'utf8')).includes('M112_DIRTY'), 'explicit Ctrl+S')
        await runTo('Exited successfully (0)')
      })
      await pass(sdk, 'external conflict blocks Run and preserves unsaved editor text', async () => {
        await load(single); await ready(); await ui(`!!document.querySelector('[title="Program.cs"]')`); await click('[title="Program.cs"]')
        await ui(`!!document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')`)
        await evaluate(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea').focus()`)
        await window.webContents.insertText('/*M112_BUFFER*/')
        await ui(`!!document.querySelector('[aria-label="Run unavailable: Save changed files before running."]:disabled')`)
        await put(source, good + '\n// M112_EXTERNAL')
        await ui(`!!document.querySelector('[aria-label="Run unavailable: Resolve project source conflicts before running."]:disabled')`)
        await ui(`(document.querySelector('.monaco-editor .native-edit-context')?.editContext?.text
          ?? document.querySelector('.monaco-editor .view-lines')?.textContent ?? '').includes('M112_BUFFER')`)
        assert(!(await readFile(source, 'utf8')).includes('M112_BUFFER'))
        await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup
      })
      await pass(sdk, 'source edit during actual build invalidates approval and prevents execution', async () => {
        await put(source, good); await put(csproj, projectXml(tfm, holdBuild)); await load(single)
        await ready(); await click('[aria-label="Run"]'); await bodyIncludes('M112_BUILD_READY')
        await ui(`!!document.querySelector('[title="Program.cs"]')`); await click('[title="Program.cs"]')
        await ui(`!!document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')`)
        await evaluate(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea').focus()`)
        await window.webContents.insertText('// M112_CHANGED\n')
        await until(() => events.some(event => event.type === 'error' && event.failure.reason === 'SOURCE_CHANGED'), 'source revision invalidation')
        await bodyIncludes('Source changed during Run. Save and run again.')
        assert(!(await readFile(source, 'utf8')).includes('M112_CHANGED'))
        await put(csproj, projectXml(tfm)); await window.loadFile(resolve('out/renderer/index.html')); await ownerCleanup
      })
      await pass(sdk, 'no runnable project and Library reason', async () => {
        const library = join(root, 'Library'); await pin(library, sdk); await put(join(library, 'Library.csproj'), projectXml(tfm, '', 'Library'))
        await load(library); await click('[aria-label="Choose Run target"]'); await bodyIncludes('No runnable Console project found.')
        await bodyIncludes('not console project'); await button('Cancel')
      })
      await pass(sdk, 'empty folder has no runnable project', async () => {
        const empty = join(root, 'Empty'); await mkdir(empty)
        await load(empty); await click('[aria-label="Choose Run target"]'); await bodyIncludes('No runnable Console project found.')
        assert.equal(await evaluate(`document.querySelectorAll('.run-target-option').length`), 0); await button('Cancel')
      })
      await pass(sdk, 'missing PATH dotnet is an actionable dependency failure', async () => {
        const previous = process.env.PATH
        try {
          process.env.PATH = join(root, 'Missing dotnet')
          await load(single); await click('[aria-label="Choose Run target"]'); await bodyIncludes('dotnet host missing')
          assert(!await evaluate(`!!document.querySelector('[aria-label="Run"]:not(:disabled)')`)); await button('Cancel')
        } finally { process.env.PATH = previous }
      })
      await pass(sdk, 'invalid global.json produces dependency guidance', async () => {
        await put(join(single, 'global.json'), '{ invalid json'); await load(single)
        await click('[aria-label="Choose Run target"]'); await bodyIncludes('.NET dependency:')
        await button('Cancel'); await pin(single, sdk)
      })
    }
    evidence.result = app.commandLine.hasSwitch('case') ? 'PARTIAL' : 'PASS'
  } catch (error) { evidence.result = 'FAIL'; evidence.error = String(error.stack ?? error); console.error(evidence.error) }
  finally {
    try {
      if (window && !window.isDestroyed()) window.destroy()
      await ownerCleanup; await run.stop(); await runIpc.stop(); await targets.stop(); await guard.stop()
      await lifecycle.stop(); await fileIpc.stop(); files.stop(); await projects.stop(); await manager.stop()
      await clean()
    } catch (error) { evidence.result = 'FAIL'; evidence.finalCleanupError = String(error.stack ?? error) }
    unsubProject(); for (const channel of Object.keys(shellHandlers)) ipcMain.removeHandler(channel)
    evidence.resources = manager.size; evidence.sourceLeases = guard.size
    evidence.nativeSessions = children.length; evidence.allReleased = children.every(child => child.isReleased())
    evidence.finalHandles = inspection.inspect().handles; evidence.initialHandles = baseline.handles
    await writeFile(join(output, 'core.json'), JSON.stringify(evidence, null, 2))
    await writeFile(archive, JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ result: evidence.result, cases: evidence.cases.length, resources: manager.size, allReleased: evidence.allReleased }))
    app.exit(evidence.result === 'FAIL' ? 1 : 0)
  }
}
main().catch(error => { console.error(error); app.exit(1) })
