/* global console, setTimeout */
// M1-11 only: built workspace UI -> production Preload/IPC -> real SDK/native Run.
// Bundle runtime + CsharpRunTargetRequests to out/m1-11-smoke/main/runtime.js;
// Build normal Preload/Renderer into sibling preload/renderer folders and compile
// the unchanged Run native source into the smoke's own native folder.
import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { RunService, CSharpRunStrategy, CsharpRunPreparation, CsharpRunProbe,
  RunSourceGuard, ProcessManager, ProjectService, FileSystemService, IpcHandlerRegistry,
  RunIpcService, FileIpcService, RunProjectLifecycle, CsharpRunTargetRequests,
  CsharpRunPreflight, DotnetRunRuntimeResolver, CsharpRunTargetResolver, CsharpRunTargetStore,
  WindowsPipedProcessAdapter } = require(resolve('out/m1-11-smoke/main/runtime.js'))

async function smoke() {
  await app.whenReady()
  const fixture = await mkdtemp(join(tmpdir(), 'coding-ide-m1-11-'))
  const folder = join(fixture, 'Console Việt 😀'), preferences = join(fixture, 'preferences')
  await mkdir(folder)
  const projectFile = join(folder, 'App.csproj'), source = join(folder, 'Program.cs')
  await writeFile(projectFile, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><NuGetAudit>false</NuGetAudit></PropertyGroup></Project>')
  await writeFile(join(folder, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
  const program = code => writeFile(source, code)
  await program('Console.WriteLine("M111 Xin chào 😀"); Console.Error.WriteLine("M111 stderr");')
  const window = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: {
    preload: resolve('out/m1-11-smoke/preload/index.js'), contextIsolation: true,
    nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } })
  const projects = new ProjectService(), manager = new ProcessManager()
  const files = new FileSystemService(projects, { trashItem: async () => {} })
  const registry = new IpcHandlerRegistry(ipcMain)
  const native = new WindowsPipedProcessAdapter(resolve('out/m1-11-smoke/native/run-process.node'))
  const children = [], events = []
  const adapter = { create(spec, observe) { const child = native.create(spec, observe); children.push(child); return child } }
  const probe = owner => new CsharpRunProbe(manager, owner, () => adapter)
  const preparation = CsharpRunPreparation.production(preferences, projects, files, manager, probe)
  const targets = new CsharpRunTargetRequests(manager, owner => {
    const owned = probe(owner), evaluation = new CsharpRunPreflight(files, new DotnetRunRuntimeResolver(owned), owned)
    const resolver = new CsharpRunTargetResolver(projects, files, evaluation)
    const store = new CsharpRunTargetStore(preferences, projects, files, resolver)
    return { store, close: async () => { try { await store.stop() } finally { await owned.stop() } } }
  })
  const guard = new RunSourceGuard(registry, {
    authorize: session => assert.equal(projects.getActiveProject()?.id, session.projectId),
    send: (_owner, channel, request) => window.webContents.send(channel, request),
  })
  let runIpc
  const run = new RunService({ authorize: async target => ({ ...target, ...await files.authorizeRunFile(target.projectId, target.relativePath) }),
    resolveRuntime: context => preparation.resolve(context),
  }, [new CSharpRunStrategy()], { manager, adapter, sourceGuard: guard,
    onEvent: (owner, event) => runIpc.publish(owner, event),
    onPhase: (owner, session, phase) => runIpc.publishPhase(owner, session, phase),
    onFinalized: (owner, session) => runIpc.retireSession(owner, session),
  })
  runIpc = new RunIpcService(registry, run, () => {}, { targets,
    authorize: (context, projectId) => {
      assert.equal(context.senderId, window.webContents.id)
      return projectId ? projects.getAuthorizedProject(projectId) : undefined
    }, start: (request, owner) => run.startPlannedRun(request, owner),
    publish: (_owner, event) => { events.push(event); window.webContents.send('run:project-event', event) },
  })
  const lifecycle = new RunProjectLifecycle(run, projects, files, () => assert.fail('cleanup failed'))
  const fileIpc = new FileIpcService(registry, files, event => window.webContents.send('file:changed', event),
    status => window.webContents.send('file:status-changed', status))
  ipcMain.handle('project:get-active', () => ({ ok: true, value: projects.getActiveProject() }))
  ipcMain.handle('lifecycle:get-status', () => ({ ok: true, value: { state: 'RUNNING' } }))
  // Unrelated shell data is fixed for this scoped Run harness.
  ipcMain.handle('project:list-recent', () => ({ ok: true, value: [] }))
  ipcMain.handle('settings:get', () => ({ ok: true, value: { settings: { theme: 'dark', fontSize: 13, tabSize: 2, autoSave: false }, recovered: false } }))
  ipcMain.handle('git:get-context', () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'Git unavailable in Run smoke.', retryable: false } }))
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  async function until(predicate, label) {
    const deadline = Date.now() + 90_000
    while (!await predicate()) {
      if (Date.now() > deadline) throw Error(`Timeout: ${label}; last events ${JSON.stringify(events.slice(-3))}`)
      await new Promise(done => setTimeout(done, 40))
    }
  }
  const ui = expression => until(() => evaluate(expression), expression)
  async function startAndWait(expected) {
    const count = events.filter(event => event.type === 'exit').length
    await ui(`!!document.querySelector('[aria-label="Run"]:not(:disabled)')`)
    await click('[aria-label="Run"]')
    await until(() => events.filter(event => event.type === 'exit').length === count + 1, expected)
    await ui(`document.querySelector('.output-context [role="status"]')?.textContent.includes(${JSON.stringify(expected)})`)
    assert.equal(manager.size, 0); assert.equal(guard.size, 0)
    assert(children.every(child => child.isReleased()))
  }
  try {
    files.start(); lifecycle.start(); guard.start(); runIpc.start(); fileIpc.start()
    await projects.openRoot(folder)
    await window.loadFile(resolve('out/m1-11-smoke/renderer/index.html'))
    if (!app.commandLine.hasSwitch('visual-only')) {
      await startAndWait('Exited successfully (0)')
      await ui(`document.querySelector('.output-log')?.textContent.includes('M111 Xin chào 😀') && document.querySelector('.output-log')?.textContent.includes('M111 stderr')`)
      assert(events.some(event => event.session.phase === 'BUILD_RESTORE'))
      assert(events.some(event => event.session.phase === 'EXECUTING'))
      await startAndWait('Exited successfully (0)')
      await program('Console.Error.WriteLine("M111 runtime failure"); Environment.Exit(23);')
      await startAndWait('Execution failed (exit 23)')
      await program('this is invalid C#;')
      await startAndWait('Build or restore failed (exit 1)')
      await program('Console.WriteLine("M111 ready"); Thread.Sleep(60000);')
      await ui(`!!document.querySelector('[aria-label="Run"]:not(:disabled)')`)
      await click('[aria-label="Run"]')
      await ui(`document.querySelector('.output-log')?.textContent.includes('M111 ready')`)
      await click('[aria-label="Stop Console project"]')
      await ui(`document.querySelector('.output-context [role="status"]')?.textContent === 'Stopped'`)
      for (const phaseText of ['Preparing…', 'Building…']) {
        const exits = events.filter(event => event.type === 'exit').length
        await ui(`!!document.querySelector('[aria-label="Run"]:not(:disabled)')`)
        await click('[aria-label="Run"]')
        await ui(`document.querySelector('.output-context [role="status"]')?.textContent === ${JSON.stringify(phaseText)}`)
        await click('[aria-label="Stop Console project"]')
        await until(() => events.filter(event => event.type === 'exit').length === exits + 1, `Stop ${phaseText}`)
        await ui(`document.querySelector('.output-context [role="status"]')?.textContent === 'Stopped'`)
      }
      assert.equal(manager.size, 0); assert.equal(guard.size, 0)
      assert(children.every(child => child.isReleased()))
    }
    // Verify production dialog, bounded toolbar and Unicode target in both themes.
    await window.setSize(900, 700)
    await ui(`!!document.querySelector('[aria-label="Choose Run target"]:not(:disabled)')`)
    await click('[aria-label="Choose Run target"]')
    await ui(`!!document.querySelector('[role="dialog"] input[type="radio"]')`)
    await evaluate(`document.documentElement.dataset.theme = 'dark'`)
    window.webContents.invalidate()
    await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
    await writeFile(resolve('out/m1-11-smoke/dark.png'), (await window.capturePage()).toPNG())
    await evaluate(`document.documentElement.dataset.theme = 'light'`)
    window.webContents.invalidate()
    await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ui-dialog')).backgroundColor`), 'rgb(255, 255, 255)')
    await window.capturePage() // Start capture and allow the hidden compositor to refresh.
    await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
    await writeFile(resolve('out/m1-11-smoke/light.png'), (await window.capturePage()).toPNG())
    console.info(JSON.stringify({ result: 'PASS', smoke: app.commandLine.hasSwitch('visual-only') ? 'M1-11 theme/layout only' : 'M1-11 built C# Run UI', sessions: events.filter(event => event.type === 'exit').length,
      scenarios: app.commandLine.hasSwitch('visual-only') ? ['900px dialog', 'dark/light themes']
        : ['single target/no editor', 'build/execute phases', 'UTF-8 stdout/stderr', 're-run', 'runtime exit 23', 'build failure', 'Stop preparation/build/execution', 'native cleanup', '900px dialog', 'dark/light themes'],
      remainingResources: manager.size, fixture }))
  } finally {
    await run.stop(); await runIpc.stop(); await guard.stop(); await lifecycle.stop(); await fileIpc.stop(); await files.stop(); await projects.stop(); await manager.stop()
    ipcMain.removeHandler('project:get-active'); ipcMain.removeHandler('lifecycle:get-status')
    ipcMain.removeHandler('project:list-recent'); ipcMain.removeHandler('settings:get'); ipcMain.removeHandler('git:get-context')
    if (!window.isDestroyed()) window.destroy()
    app.quit()
  }
}
smoke().catch(error => { console.error(error); app.exit(1) })
