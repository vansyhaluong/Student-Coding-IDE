/* global process, console, AbortController, queueMicrotask */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const { CsharpRunProbe, DotnetRunRuntimeResolver, CsharpRunPreflight, ProcessManager,
  WindowsPipedProcessAdapter, ProjectService, FileSystemService } = require(resolve('out/main/run-runtime.js'))
// Read-only inspection from the existing isolated spike; execution uses production binding.
const inspection = require(resolve('spikes/csharp-project-run/out/native/run-probe.node'))
const manager = new ProcessManager(), projects = new ProjectService()
const files = new FileSystemService(projects, { trashItem: async () => {}, watchFactory: () => ({ close() {} }) })
const native = new WindowsPipedProcessAdapter()
const children = [], commands = [], cases = []
let cancelEvaluation
const probe = new CsharpRunProbe(manager, 'm1-05-smoke', () => ({ create(run, observe) {
  commands.push({ executable: run.executable, args: run.args, cwd: run.cwd, shell: run.shell })
  const child = native.create(run, observe); children.push(child)
  if (cancelEvaluation && run.args[0] === 'msbuild') queueMicrotask(() => cancelEvaluation?.abort())
  return child
} }))
const resolver = new DotnetRunRuntimeResolver(probe)
const preflight = new CsharpRunPreflight(files, resolver, probe)
const runId = new Date().toISOString().replaceAll(':', '-')
// Keep synthetic .csproj outside this IDE workspace so an already-running language
// server/editor cannot independently generate obj files in the measured fixture.
const root = resolve(process.env.SystemRoot, 'Temp', `coding-ide-m1-05-${runId}`, 'Workspace Việt # 😀')
const evidenceDirectory = resolve('out/m1-05-smoke', runId)
const evidence = { runId, platform: process.platform, arch: process.arch, cases, commands }
let identity
const signal = () => new AbortController().signal
async function put(path, content) {
  const full = join(root, path); await mkdir(dirname(full), { recursive: true }); await writeFile(full, content)
}
const pin = (version, extra = {}) => JSON.stringify({ sdk: { version, rollForward: 'disable', ...extra } })
const project = (tfm, body = '', output = 'Exe') => `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>${output}</OutputType><TargetFramework>${tfm}</TargetFramework></PropertyGroup>${body}<Target Name="Build"><Error Text="Build must never run" /></Target><Target Name="Restore"><Error Text="Restore must never run" /></Target></Project>`
async function evaluate(relativePath, abort = signal()) {
  const result = await preflight.evaluate({ kind: 'csharp-project', projectId: identity.id, relativePath }, abort)
  assert.equal(manager.size, 0)
  assert.ok(children.every(child => child.isReleased()))
  return result
}
async function pass(name, test) {
  const detail = await test(); cases.push({ name, result: 'PASS', ...detail }); console.log(`PASS ${name}`)
}
async function snapshot(directory) {
  const hashes = {}
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) Object.assign(hashes, await snapshot(path))
    else hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  return hashes
}
async function main() {
  const baseline = inspection.inspect()
  evidence.initialProcesses = baseline.processes
  try {
    await app.whenReady()
    evidence.sourceHashes = {}
    for (const path of ['src/main/services/dependencies/dotnet-run-runtime.ts',
      'src/main/services/run/csharp-run-preflight.ts', 'src/main/services/run/csharp-run-probe.ts',
      'src/main/services/run/windows-piped-process-adapter.ts', 'src/main/services/run/native/run-process.cpp']) {
      evidence.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    await mkdir(root, { recursive: true })
    identity = await projects.openRoot(root); files.start()
    await put('unPinned/App.csproj', project('net8.0'))
    const initial = await evaluate('unPinned/App.csproj')
    assert.equal(initial.ok, true, JSON.stringify(initial))
    const installed = initial.evaluation.runtime.installedSdks
    evidence.inventory = installed
    evidence.executable = initial.evaluation.runtime.executable
    const versions = [8, 10].map(major => installed.filter(v => v.major === major && !v.prerelease)
      .sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true })).at(-1)?.version)
    if (versions.some(version => !version)) throw Error('BLOCKED: installed SDK 8 and SDK 10 required; no auto-install')
    await pass('no global.json / real default selection', async () => ({ effectiveSdk: initial.evaluation.runtime.effectiveSdk.version }))
    for (const version of versions) {
      const major = Number(version.split('.')[0]), folder = `sdk${major}`, tfm = `net${major}.0`
      await put(`${folder}/global.json`, pin(version))
      await put(`${folder}/nested/Console App.csproj`, project(tfm,
        '<ItemGroup><ProjectReference Include="../Library/Library.csproj" /></ItemGroup>'))
      await put(`${folder}/Library/Library.csproj`, project(tfm, '', 'Library'))
      await put(`${folder}/Multi.csproj`, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFrameworks>net8.0;net10.0</TargetFrameworks></PropertyGroup></Project>`)
      const before = await snapshot(join(root, folder))
      await pass(`SDK ${major}: ancestor global.json, spaces/Unicode, Console and reference facts`, async () => {
        const result = await evaluate(`${folder}/nested/Console App.csproj`)
        assert.equal(result.ok, true, JSON.stringify(result))
        assert.equal(result.evaluation.runtime.effectiveSdk.version, version)
        assert.equal(result.evaluation.properties.OutputType, 'Exe')
        assert.equal(result.evaluation.properties.TargetFramework, tfm)
        assert.equal(result.evaluation.properties.UsingMicrosoftNETSdk, 'true')
        assert.deepEqual(result.evaluation.projectReferences, ['../Library/Library.csproj'])
        return { effectiveSdk: version, properties: result.evaluation.properties }
      })
      await pass(`SDK ${major}: Library and multi-target facts without runnable classification`, async () => {
        const library = await evaluate(`${folder}/Library/Library.csproj`)
        assert.equal(library.ok, true); assert.equal(library.evaluation.properties.OutputType, 'Library')
        const multi = await evaluate(`${folder}/Multi.csproj`)
        assert.equal(multi.ok, true); assert.equal(multi.evaluation.properties.TargetFrameworks, 'net8.0;net10.0')
        assert.equal(multi.evaluation.properties.TargetFramework, '')
      })
      await pass(`SDK ${major}: evaluation never builds/restores or modifies fixtures`, async () => {
        assert.deepEqual(await snapshot(join(root, folder)), before)
      })
    }
    await put('sdk8/nested/global.json', pin(versions[1]))
    await pass('nearest global.json overrides ancestor / same candidate re-resolves SDK', async () => {
      const result = await evaluate('sdk8/nested/Console App.csproj')
      assert.equal(result.ok, true); assert.equal(result.evaluation.runtime.effectiveSdk.version, versions[1])
    })
    await put('roll/global.json', pin('8.0.100', { rollForward: 'latestFeature' }))
    await put('roll/App.csproj', project('net8.0'))
    await pass('real CLI roll-forward to installed SDK 8 feature band', async () => {
      const result = await evaluate('roll/App.csproj')
      assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.evaluation.runtime.effectiveSdk.version, versions[0])
    })
    await put('props/global.json', pin(versions[0]))
    await put('props/Directory.Build.props', '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework><OutputType Condition="\'$(Configuration)\' == \'Debug\'">Exe</OutputType></PropertyGroup></Project>')
    await put('props/import.props', '<Project><PropertyGroup><IsTestProject>true</IsTestProject><UseWindowsForms>false</UseWindowsForms></PropertyGroup></Project>')
    await put('props/nested/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><Import Project="../import.props" /></Project>')
    await pass('Directory.Build.props, Debug condition and explicit import are evaluated', async () => {
      const result = await evaluate('props/nested/App.csproj')
      assert.equal(result.ok, true, JSON.stringify(result))
      assert.equal(result.evaluation.properties.TargetFramework, 'net8.0')
      assert.equal(result.evaluation.properties.OutputType, 'Exe')
      assert.equal(result.evaluation.properties.IsTestProject, 'true')
    })
    await put('comments/global.json', `{// allowed comment\n"sdk":{"version":"${versions[0]}","rollForward":"disable"}}`)
    await put('comments/App.csproj', project('net8.0'))
    await pass('global.json comments follow real CLI behavior', async () => {
      const result = await evaluate('comments/App.csproj')
      assert.equal(result.ok, true, JSON.stringify(result))
      assert.equal(result.evaluation.runtime.effectiveSdk.version, versions[0])
    })
    await put('sdk8/Future.csproj', project('net99.0'))
    await pass('future TFM remains an evaluated fact; no M1-06 classification or targeting-pack claim', async () => {
      const result = await evaluate('sdk8/Future.csproj')
      assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.evaluation.properties.TargetFramework, 'net99.0')
    })
    for (const [folder, config, expected] of [
      ['missing-sdk', pin('88.0.100'), 'SDK_RESOLUTION_FAILED'],
      ['malformed-global', '{invalid', 'INVALID_GLOBAL_JSON'],
      ['trailing-comma-global', '{"sdk":{"version":"8.0.410",},}', 'INVALID_GLOBAL_JSON'],
      ['invalid-global', pin('8.0'), 'INVALID_GLOBAL_JSON'],
    ]) {
      await put(`${folder}/global.json`, config); await put(`${folder}/App.csproj`, project('net8.0'))
      await pass(folder, async () => {
        const result = await evaluate(`${folder}/App.csproj`)
        assert.equal(result.ok, false); assert.equal(result.sdk?.detail, expected, JSON.stringify(result))
      })
    }
    await put('sdk8/Broken.csproj', '<Project malformed')
    await pass('malformed project returns evaluation failure and releases native Job', async () => {
      const result = await evaluate('sdk8/Broken.csproj')
      assert.equal(result.ok, false); assert.equal(result.detail, 'EVALUATION_FAILED')
    })
    await pass('missing project and traversal rejected without process launch', async () => {
      const count = commands.length
      for (const path of ['sdk8/Missing.csproj', '../outside.csproj']) {
        assert.equal((await evaluate(path)).detail, 'INVALID_PROJECT_PATH')
      }
      assert.equal(commands.length, count)
    })
    await pass('real evaluation cancellation after native process creation', async () => {
      cancelEvaluation = new AbortController()
      try { assert.equal((await evaluate('sdk8/Library/Library.csproj', cancelEvaluation.signal)).detail, 'CANCELLED') }
      finally { cancelEvaluation = undefined }
    })
    await evaluate('sdk8/Library/Library.csproj') // warm-up before measured cycles
    const handleCounts = []
    for (let i = 0; i < 8; ++i) {
      assert.equal((await evaluate('sdk8/Library/Library.csproj')).ok, true)
      handleCounts.push(inspection.inspect().handles)
    }
    await pass('eight repeated production evaluations release every Job/resource', async () => {
      assert.equal(handleCounts.at(-1), handleCounts[0])
      return { handleCounts, sessions: children.length, allReleased: children.every(child => child.isReleased()) }
    })
    const beforeIds = new Set(baseline.processes.map(p => `${p.pid}:${p.created}`))
    evidence.newSurvivingProcesses = inspection.inspect().processes.filter(p => !beforeIds.has(`${p.pid}:${p.created}`))
    assert.deepEqual(evidence.newSurvivingProcesses, [])
    assert.ok(commands.every(command => command.shell === false && /dotnet\.exe$/i.test(command.executable)))
    evidence.result = 'PASS'
  } catch (error) {
    evidence.result = 'NOT_PASS'; evidence.failure = String(error); console.error(error); process.exitCode = 1
  } finally {
    await probe.stop(); files.stop(); await projects.stop()
    evidence.resources = manager.size
    await mkdir(evidenceDirectory, { recursive: true })
    await writeFile(join(evidenceDirectory, 'results.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ result: evidence.result, cases: cases.length, resources: manager.size,
      evidence: join(evidenceDirectory, 'results.json') }))
    app.exit(process.exitCode ?? 0)
  }
}
void main()
