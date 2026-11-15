/* global process, console, AbortController, queueMicrotask */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { mkdir, writeFile, readFile, readdir, symlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const { CsharpRunTargetResolver, CsharpRunProbe, DotnetRunRuntimeResolver, CsharpRunPreflight,
  ProcessManager, WindowsPipedProcessAdapter, ProjectService, FileSystemService } = require(resolve('out/main/run-runtime.js'))
const inspection = require(resolve('spikes/csharp-project-run/out/native/run-probe.node'))
const manager = new ProcessManager(), projects = new ProjectService()
const files = new FileSystemService(projects, { trashItem: async () => {}, watchFactory: () => ({ close() {} }) })
const native = new WindowsPipedProcessAdapter(), children = [], commands = [], cases = []
let cancelOnEvaluation
const probe = new CsharpRunProbe(manager, 'm1-06-smoke', () => ({ create(run, observe) {
  commands.push({ executable: run.executable, args: run.args, cwd: run.cwd, shell: run.shell })
  const child = native.create(run, observe); children.push(child)
  if (cancelOnEvaluation && run.args[0] === 'msbuild') queueMicrotask(() => cancelOnEvaluation?.abort())
  return child
} }))
const sdk = new DotnetRunRuntimeResolver(probe)
const preflight = new CsharpRunPreflight(files, sdk, probe)
const resolver = new CsharpRunTargetResolver(projects, files, preflight)
const runId = new Date().toISOString().replaceAll(':', '-')
const root = resolve(process.env.SystemRoot, 'Temp', `coding-ide-m1-06-${runId}`, 'Discovery Việt # 😀')
const evidenceDirectory = resolve('out/m1-06-smoke', runId)
const evidence = { runId, platform: process.platform, arch: process.arch, cases, commands }
const signal = () => new AbortController().signal
const pin = version => JSON.stringify({ sdk: { version, rollForward: 'disable' } })
const project = (tfm, output = 'Exe', properties = '', items = '', sdkName = 'Microsoft.NET.Sdk') =>
  `<Project Sdk="${sdkName}"><PropertyGroup><TargetFramework>${tfm}</TargetFramework><OutputType>${output}</OutputType>${properties}</PropertyGroup>${items}<Target Name="Build"><Error Text="Build must not run" /></Target><Target Name="Restore"><Error Text="Restore must not run" /></Target></Project>`
async function put(path, content) {
  const full = join(root, path); await mkdir(dirname(full), { recursive: true }); await writeFile(full, content)
}
async function snapshot(directory) {
  const hashes = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(hashes, await snapshot(path))
    else hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  return hashes
}
async function discover(folder, abort = signal()) {
  const identity = await projects.openRoot(join(root, folder))
  const result = await resolver.resolve(identity.id, abort)
  assert.equal(manager.size, 0)
  assert.ok(children.every(child => child.isReleased()))
  assert.ok(!JSON.stringify(result).includes(root))
  return result
}
async function pass(name, test) {
  const detail = await test(); cases.push({ name, result: 'PASS', ...detail }); console.log(`PASS ${name}`)
}
async function main() {
  const baseline = inspection.inspect()
  evidence.initialProcesses = baseline.processes
  try {
    await app.whenReady(); await mkdir(root, { recursive: true }); files.start()
    evidence.sourceHashes = {}
    for (const path of ['src/main/services/run/csharp-run-target-resolver.ts',
      'src/main/services/dependencies/dotnet-run-runtime.ts', 'src/main/services/run/csharp-run-preflight.ts',
      'src/main/services/run/csharp-run-probe.ts', 'src/main/services/run/windows-piped-process-adapter.ts',
      'src/main/services/run/native/run-process.cpp']) {
      evidence.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    await put('inventory/App.csproj', project('net8.0'))
    const identity = await projects.openRoot(join(root, 'inventory'))
    const initial = await preflight.evaluate({ kind: 'csharp-project', projectId: identity.id, relativePath: 'App.csproj' }, signal())
    assert.equal(initial.ok, true, JSON.stringify(initial))
    evidence.inventory = initial.evaluation.runtime.installedSdks
    const versions = [8, 10].map(major => evidence.inventory.filter(v => v.major === major && !v.prerelease)
      .sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true })).at(-1)?.version)
    if (versions.some(v => !v)) throw Error('BLOCKED: installed SDK 8 and SDK 10 required; no automatic installation')
    for (const version of versions) {
      const major = Number(version.split('.')[0]), folder = `sdk${major}`, tfm = `net${major}.0`
      await put(`${folder}/global.json`, pin(version))
      await put(`${folder}/src/Ứng dụng # 😀/Console App.csproj`, project(tfm, 'Exe', '',
        '<ItemGroup><ProjectReference Include="../../Library/Library.csproj" /><ProjectReference Include="../../Library/Library.csproj" /></ItemGroup>'))
      await put(`${folder}/Library/Library.csproj`, project(tfm, 'Library'))
      await put(`${folder}/Web/Web.csproj`, project(tfm, 'Exe', '', '', 'Microsoft.NET.Sdk.Web'))
      await put(`${folder}/tests/Test.csproj`, project(tfm, 'Exe', '<IsTestProject>true</IsTestProject>'))
      await put(`${folder}/Wpf/Wpf.csproj`, project(`${tfm}-windows`, 'WinExe', '<UseWPF>true</UseWPF>'))
      await put(`${folder}/Forms/Forms.csproj`, project(`${tfm}-windows`, 'WinExe', '<UseWindowsForms>true</UseWindowsForms>'))
      await put(`${folder}/Multi/Multi.csproj`, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFrameworks>${tfm};net9.0</TargetFrameworks></PropertyGroup></Project>`)
      await put(`${folder}/Future/Future.csproj`, project('net999.0'))
      await put(`${folder}/Window/Window.csproj`, project(`${tfm}-windows`, 'Exe'))
      // Solution files do not determine membership or entry target.
      await put(`${folder}/OnlyLibrary.slnx`, '<Solution><Project Path="Library/Library.csproj" /></Solution>')
      await put(`${folder}/Other.sln`, 'Intentionally unused solution content')
      for (const excluded of ['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out']) await put(`${folder}/${excluded}/Ignored.csproj`, 'invalid project')
      const before = await snapshot(join(root, folder))
      await pass(`SDK ${major}: real nested Console/library/Web/test/WPF/WinForms/multi/future matrix`, async () => {
        const result = await discover(folder)
        assert.equal(result.resolution.state, 'SELECTION_REQUIRED', JSON.stringify(result))
        assert.ok(!('target' in result.resolution))
        assert.equal(result.assessments.length, 9)
        const expected = { 'Library/Library.csproj': 'LIBRARY', 'Web/Web.csproj': 'WEB', 'tests/Test.csproj': 'TEST',
          'Wpf/Wpf.csproj': 'WPF', 'Forms/Forms.csproj': 'WINDOWS_FORMS', 'Multi/Multi.csproj': 'MULTIPLE_FRAMEWORKS',
          'Future/Future.csproj': 'UNSUPPORTED_FRAMEWORK', 'Window/Window.csproj': 'CONSOLE', 'src/Ứng dụng # 😀/Console App.csproj': 'CONSOLE' }
        for (const item of result.assessments) assert.equal(item.detail, expected[item.candidate.relativePath], JSON.stringify(item))
        return { sdk: version, resolution: result }
      })
      await pass(`SDK ${major}: evaluation leaves fixture tree unchanged`, async () => { assert.deepEqual(await snapshot(join(root, folder)), before) })
    }
    const version = versions[0]
    await put('single/global.json', pin(version)); await put('single/src/App.csproj', project('net8.0'))
    await pass('exactly one eligible Console returns READY semantic target', async () => {
      const result = await discover('single'); assert.equal(result.resolution.state, 'READY'); return { resolution: result }
    })
    await put('none/global.json', pin(version)); await put('none/Library.csproj', project('net8.0', 'Library'))
    await pass('library-only returns NO_RUNNABLE_PROJECT', async () => { assert.equal((await discover('none')).resolution.state, 'NO_RUNNABLE_PROJECT') })
    await put('empty/Program.cs', '// no csproj')
    await pass('no csproj does not spawn', async () => {
      const count = commands.length; assert.equal((await discover('empty')).resolution.state, 'NO_RUNNABLE_PROJECT'); assert.equal(commands.length, count)
    })
    await put('broken/global.json', pin(version)); await put('broken/App.csproj', project('net8.0')); await put('broken/Broken.csproj', '<broken')
    await pass('malformed candidate prevents implicit choice of the valid Console', async () => {
      const result = await discover('broken'); assert.equal(result.resolution.state, 'SELECTION_REQUIRED')
      assert.equal(result.assessments.find(a => a.candidate.relativePath === 'Broken.csproj').detail, 'EVALUATION_FAILED')
      return { resolution: result }
    })
    await put('missing/global.json', pin('8.0.999')); await put('missing/App.csproj', project('net8.0'))
    await pass('unavailable pinned SDK is a dependency failure, not no-project', async () => {
      const result = await discover('missing'); assert.equal(result.resolution.state, 'DEPENDENCY_FAILED'); return { resolution: result }
    })
    await put('cycle/global.json', pin(version))
    await put('cycle/App.csproj', project('net8.0', 'Exe', '', '<ItemGroup><ProjectReference Include="A.csproj" /></ItemGroup>'))
    await put('cycle/A.csproj', project('net8.0', 'Library', '', '<ItemGroup><ProjectReference Include="B.csproj" /></ItemGroup>'))
    await put('cycle/B.csproj', project('net8.0', 'Library', '', '<ItemGroup><ProjectReference Include="A.csproj" /></ItemGroup>'))
    await pass('recursive reference cycle fails closed without repeated evaluation', async () => {
      const count = commands.length, result = await discover('cycle')
      assert.equal(result.resolution.state, 'FAILED'); assert.ok(result.assessments.every(a => a.detail === 'REFERENCE_CYCLE'))
      assert.equal(commands.slice(count).filter(c => c.args[0] === 'msbuild').length, 3)
      return { resolution: result }
    })
    await put('escape/global.json', pin(version)); await put('external/Library.csproj', project('net8.0', 'Library'))
    await put('escape/App.csproj', project('net8.0', 'Exe', '', '<ItemGroup><ProjectReference Include="../external/Library.csproj" /></ItemGroup>'))
    await pass('evaluated outside-root reference is rejected without external evaluation', async () => {
      const count = commands.length, result = await discover('escape')
      assert.equal(result.assessments[0].detail, 'INVALID_REFERENCE'); assert.equal(result.resolution.state, 'FAILED')
      assert.equal(commands.slice(count).filter(c => c.args[0] === 'msbuild').length, 1)
    })
    await symlink(join(root, 'external'), join(root, 'single', 'external'), 'junction')
    await symlink(join(root, 'single'), join(root, 'single', 'src', 'cycle'), 'junction')
    await pass('outside/cyclic junctions are skipped during real discovery', async () => {
      const result = await discover('single'); assert.equal(result.resolution.state, 'READY'); assert.equal(result.assessments.length, 1)
    })
    await pass('cancellation after evaluation process creation releases native resources', async () => {
      cancelOnEvaluation = new AbortController()
      try { assert.equal((await discover('single', cancelOnEvaluation.signal)).failure, 'CANCELLED') }
      finally { cancelOnEvaluation = undefined }
    })
    await discover('single')
    const handleCounts = []
    for (let i = 0; i < 8; ++i) { assert.equal((await discover('single')).resolution.state, 'READY'); handleCounts.push(inspection.inspect().handles) }
    await pass('eight repeated resolutions release every native Job/resource', async () => {
      assert.equal(handleCounts.at(-1), handleCounts[0])
      return { handleCounts, sessions: children.length, allReleased: children.every(child => child.isReleased()) }
    })
    const beforeIds = new Set(baseline.processes.map(p => `${p.pid}:${p.created}`))
    evidence.newSurvivingProcesses = inspection.inspect().processes.filter(p => !beforeIds.has(`${p.pid}:${p.created}`))
    assert.deepEqual(evidence.newSurvivingProcesses, [])
    assert.ok(commands.every(c => c.shell === false && (c.args[0] === '--list-sdks' || c.args[0] === '--version'
      || c.args[0] === 'msbuild' && c.args.includes('-getItem:ProjectReference') && !c.args.some(a => /^(-t:|-restore|build|run)$/i.test(a)))))
    evidence.result = 'PASS'
  } catch (error) { evidence.result = 'NOT_PASS'; evidence.failure = String(error); console.error(error); process.exitCode = 1 }
  finally {
    await probe.stop(); files.stop(); await projects.stop()
    evidence.resources = manager.size
    await mkdir(evidenceDirectory, { recursive: true }); await writeFile(join(evidenceDirectory, 'results.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ result: evidence.result, cases: cases.length, resources: manager.size, evidence: join(evidenceDirectory, 'results.json') }))
    app.exit(process.exitCode ?? 0)
  }
}
void main()
