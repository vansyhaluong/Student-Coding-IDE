/* global process, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, copyFile, cp, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { StringDecoder } from 'node:string_decoder'

const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const require = createRequire(import.meta.url)
const native = require(join(spike, 'out/native/run-probe.node'))
const { ProcessManager } = require(join(root, 'out/main/run-runtime.js'))
const manager = new ProcessManager(), live = new Set(), evidence = { cases: [], commands: [] }
const runId = new Date().toISOString().replace(/[:.]/g, '-')
evidence.runId = runId
const delay = (ms) => new Promise(done => setTimeout(done, ms))
const pathValue = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
const dotnet = pathValue.split(';').map(value => join(value.replace(/^"|"$/g, ''), 'dotnet.exe'))
  .find(value => /^[a-z]:[\\/]/i.test(value) && existsSync(value))
const environment = Object.entries(process.env).filter(([key, value]) => value !== undefined
  && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|GATE_PROFILE)$/i.test(key)
  && !key.includes('=') && !key.includes('\0') && !value.includes('\0'))
  .sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([key, value]) => `${key}=${value}`)
// Only evidence hygiene, not production environment policy or user-supplied env.
environment.push('DOTNET_CLI_TELEMETRY_OPTOUT=1', 'DOTNET_NOLOGO=1')
const identity = value => `${value.pid}:${value.created}`
async function bounded(promise, ms = 30000) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Evidence deadline ${ms}ms`)), ms)
  })]) } finally { clearTimeout(timer) }
}
async function until(predicate, ms = 15000) {
  const deadline = Date.now() + ms
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Condition deadline'); await delay(20) }
}
function start(args, cwd, { input = false, owner = 'scenario' } = {}) {
  const record = { args, cwd, input, owner, samples: [], stdout: '', stderr: '', errors: [] }
  evidence.commands.push(record)
  const out = new StringDecoder('utf8'), err = new StringDecoder('utf8')
  let handle, timer, resolveSettled, closed = false, closing
  const pending = new Set(), settled = new Promise(done => { resolveSettled = done })
  const seen = new Map()
  function sample() {
    if (closed) return
    const state = native.inspect(handle)
    const key = JSON.stringify(state.processes)
    if (record.samples.at(-1)?.key !== key) record.samples.push({ key, elapsed: Date.now() - record.started,
      active: state.active, processes: state.processes })
    for (const value of state.processes.filter(value => value.owned)) seen.set(identity(value), value)
  }
  const session = { record, settled,
    inspect: () => native.inspect(handle),
    rootStop: () => native.probeControl(handle, 'root-stop'),
    eof: () => native.probeControl(handle, 'eof'),
    write(bytes) {
      assert.ok(!closed)
      const promise = new Promise(done => native.writeProbe(handle, Buffer.from(bytes), done))
      pending.add(promise); promise.finally(() => pending.delete(promise))
      return promise
    },
    async close() {
      if (closed) return
      if (closing) return closing
      closing = (async () => {
        sample(); native.control(handle, 'terminate')
        await bounded(Promise.all([settled, ...pending]), 10000)
        await until(() => native.control(handle, 'count') === 0, 5000)
        clearInterval(timer)
        const before = native.inspect(handle)
        assert.equal(before.pendingWrites, 0)
        native.control(handle, 'release')
        closed = true
        const after = native.inspect(handle)
        assert.equal(after.released, 1); assert.equal(after.openSessionHandles, 0)
        assert.equal(after.active, 0); assert.equal(after.pendingWrites, 0)
        const survivors = after.processes.filter(value => seen.has(identity(value)))
        assert.deepEqual(survivors, [], 'Previously owned processes survived cleanup')
        record.cleanup = { released: true, openSessionHandles: after.openSessionHandles,
          active: after.active, pendingWrites: after.pendingWrites, ownedObserved: [...seen.values()], survivors }
        live.delete(session); unregister()
      })()
      return closing
    },
  }
  const unregister = manager.register({ id: `probe-${evidence.commands.length}`, ownerId: owner, close: session.close })
  record.started = Date.now()
  try {
    handle = native[input ? 'createProbe' : 'createRun'](dotnet, args, cwd, environment, event => {
      if (event.type === 'stdout') record.stdout += out.write(event.data)
      if (event.type === 'stderr') record.stderr += err.write(event.data)
      if (event.type === 'stdout-eof') { record.stdout += out.end(); record.stdoutEof = true }
      if (event.type === 'stderr-eof') { record.stderr += err.end(); record.stderrEof = true }
      if (event.type === 'exit') { record.exitCode = event.exitCode; record.rootExitObserved = true }
      if (event.type === 'error') record.errors.push('native-observation')
      if (event.type === 'settled') resolveSettled()
    })
  } catch (error) { unregister(); throw error }
  record.pid = native.control(handle, 'pid')
  sample(); timer = setInterval(sample, 30); live.add(session)
  return session
}
async function execute(args, cwd, expected = 0) {
  const session = start(args, cwd)
  try {
    await bounded(session.settled, 90000)
    assert.equal(session.record.exitCode, expected, session.record.stdout + session.record.stderr)
    assert.deepEqual(session.record.errors, [])
    return session.record
  } finally { await session.close() }
}
async function test(name, action) {
  const record = { name, result: 'IN_PROGRESS' }; evidence.cases.push(record)
  console.log(`START ${name}`)
  try { record.details = await action(); record.result = 'PASS' }
  catch (error) { record.result = 'NOT_PASS'; record.error = String(error.stack ?? error); console.error(record.error) }
  finally { await manager.cleanupOwner('scenario') }
  assert.equal([...live].filter(session => session.record.owner === 'scenario').length, 0)
  console.log(`${record.result} ${name}`)
  await save()
  return record.result === 'PASS'
}
async function save() {
  await mkdir(join(spike, 'evidence'), { recursive: true })
  // Avoid duplicate process arrays; key is only used for sample deduplication.
  await writeFile(join(spike, 'evidence/results.json'), JSON.stringify(evidence,
    (key, value) => key === 'key' ? undefined : value, 2) + '\n')
}
const buildArgs = project => ['build', project, '--configuration', 'Debug', '--disable-build-servers', '-nodeReuse:false']
const runArgs = (project, args = []) => ['run', '--project', project, '--configuration', 'Debug',
  '--no-build', '--no-restore', '--no-launch-profile', '--disable-build-servers', '--', ...args]

async function fixture(major, version) {
  const cwd = join(spike, 'out', runId, `SDK ${major} Đường dẫn # Việt 😀`)
  await mkdir(join(cwd, 'Properties'), { recursive: true })
  await writeFile(join(cwd, 'global.json'), JSON.stringify({ sdk: { version, rollForward: 'disable' } }))
  await writeFile(join(cwd, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
  await copyFile(join(spike, 'fixtures/Program.cs'), join(cwd, 'Program.cs'))
  await copyFile(join(spike, 'fixtures/Directory.Build.targets'), join(cwd, 'Directory.Build.targets'))
  await writeFile(join(cwd, 'Properties/launchSettings.json'), JSON.stringify({ profiles: {
    GateProfile: { commandName: 'Project', environmentVariables: { GATE_PROFILE: 'MUST_NOT_APPLY' } },
  } }))
  for (const name of ['LibraryA', 'LibraryB']) {
    await mkdir(join(cwd, name), { recursive: true })
    await writeFile(join(cwd, name, `${name}.csproj`), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net${major}.0</TargetFramework></PropertyGroup></Project>`)
    await writeFile(join(cwd, name, 'Value.cs'), `namespace ${name}; public static class Value { public const int Number = 1; }`)
  }
  const project = join(cwd, 'GateApp.csproj')
  await writeFile(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
    <OutputType>Exe</OutputType><TargetFramework>net${major}.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable><EnableDefaultCompileItems>false</EnableDefaultCompileItems></PropertyGroup><ItemGroup><Compile Include="Program.cs" />
    <ProjectReference Include="LibraryA/LibraryA.csproj" /><ProjectReference Include="LibraryB/LibraryB.csproj" />
    </ItemGroup></Project>`)
  return { cwd, project, major, version }
}
async function cases(f) {
  const { cwd, project, major } = f
  const built = await test(`sdk${major}: selection/evaluation/build`, async () => {
    const selection = await execute(['--version'], cwd)
    assert.equal(selection.stdout.trim(), f.version)
    const evaluation = await execute(['msbuild', project,
      '-getProperty:OutputType,TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion,UsingMicrosoftNETSdk,UsingMicrosoftNETSdkWeb,UseWPF,UseWindowsForms,IsTestProject',
      '-getItem:ProjectReference', '-nodeReuse:false'], cwd)
    const properties = JSON.parse(evaluation.stdout)
    assert.equal(properties.Properties.OutputType, 'Exe')
    assert.equal(properties.Properties.TargetFramework, `net${major}.0`)
    assert.equal(properties.Items.ProjectReference.length, 2)
    const built = await execute(buildArgs(project), cwd)
    assert.ok(existsSync(join(cwd, `bin/Debug/net${major}.0/GateApp.dll`)))
    return { selected: selection.stdout.trim(), evaluation: properties, buildExit: built.exitCode }
  })
  if (!built) return
  const baseline = native.inspect().processes
  // Independent output copy: a control must not lock the target being rebuilt.
  const controlCwd = join(cwd, 'control-output')
  await cp(join(cwd, `bin/Debug/net${major}.0`), controlCwd, { recursive: true })
  const control = start([join(controlCwd, 'GateApp.dll'), 'control'], controlCwd, { owner: 'control' })
  await until(() => control.record.stdout.includes('WAITING'))
  const handlesBefore = native.inspect().handles
  await test(`sdk${major}: flags/streams/argv/nonzero`, async () => {
    const target = join(cwd, `bin/Debug/net${major}.0/GateApp.dll`), assets = join(cwd, 'obj/project.assets.json')
    const before = { dll: (await stat(target)).mtimeMs, assets: (await stat(assets)).mtimeMs }
    const original = await readFile(join(cwd, 'Program.cs'), 'utf8')
    await writeFile(join(cwd, 'Program.cs'), 'this is deliberately invalid C#; no-build must not compile it')
    try {
      const result = await execute([...runArgs(project).slice(0, -1), '-p:GateRejectBuild=true',
        '-p:GateRejectRestore=true', '--', 'basic', 'space # Việt 😀', 'a"b', 'tail\\', ''], cwd)
      assert.ok(result.stdout.includes('stdout: Việt Nam 😀'))
      assert.ok(result.stdout.includes('PROFILE:absent'))
      assert.ok(result.stderr.includes('stderr: evidence'))
      const args = JSON.parse(result.stdout.split('ARGS:')[1].trim())
      assert.deepEqual(args, ['space # Việt 😀', 'a"b', 'tail\\', ''])
      assert.deepEqual({ dll: (await stat(target)).mtimeMs, assets: (await stat(assets)).mtimeMs }, before)
      await execute(runArgs(project, ['nonzero']), cwd, 23)
      return { outputUnchanged: before, invalidSourceNotBuilt: true, restoreGuardNotInvoked: true, profileAbsent: true }
    } finally { await writeFile(join(cwd, 'Program.cs'), original) }
  })
  await test(`sdk${major}: Stop during actual build workers`, async () => {
    const session = start([...buildArgs(project), '-t:Rebuild', '-p:GateHoldBuild=true'], cwd)
    await until(() => session.record.stdout.includes('BUILD_HELD:'), 60000)
    const state = session.inspect()
    assert.ok(state.active >= 2, 'Expected actual SDK/MSBuild worker descendants')
    assert.ok(state.processes.filter(value => value.owned).length >= 2)
    const ownedPids = state.processes.filter(value => value.owned && value.name === 'dotnet.exe').map(value => value.pid)
    const commandInfo = await promisify(execFile)(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ownedPids.join(',')}) } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`],
      { shell: false, windowsHide: true })
    const ownedCommands = [JSON.parse(commandInfo.stdout)].flat()
    assert.ok(ownedCommands.some(value => value.ProcessId !== session.record.pid
      && /MSBuild\.dll.*nodemode:1.*nodeReuse:false/i.test(value.CommandLine)), 'Actual owned no-reuse MSBuild worker required')
    await session.close()
    return { signal: session.record.stdout.match(/BUILD_HELD:\d+/g), snapshot: state,
      ownedCommands, cleanup: session.record.cleanup }
  })
  // Restore/build cancelled above can leave partial outputs; rebuild as a separate owned step.
  if (!await test(`sdk${major}: rebuild after Stop`, () => execute(buildArgs(project), cwd).then(value => ({ exitCode: value.exitCode })))) {
    await control.close(); return
  }
  await test(`sdk${major}: Stop during NuGet restore request`, async () => {
    let requested = false
    const server = createServer(() => { requested = true })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const restoreCwd = join(cwd, 'RestoreOnly')
    await mkdir(restoreCwd, { recursive: true })
    await writeFile(join(restoreCwd, 'NuGet.Config'), `<configuration><packageSources><clear />
      <add key="local-evidence" value="http://127.0.0.1:${server.address().port}/v3/index.json" allowInsecureConnections="true" />
      </packageSources></configuration>`)
    const restoreProject = join(restoreCwd, 'RestoreOnly.csproj')
    await writeFile(restoreProject, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net${major}.0</TargetFramework>
      <NuGetAudit>false</NuGetAudit>
      </PropertyGroup><ItemGroup><PackageReference Include="M104.Nonexistent.Evidence" Version="1.0.0" /></ItemGroup></Project>`)
    try {
      const session = start(buildArgs(restoreProject), restoreCwd)
      await until(() => requested, 30000)
      const state = session.inspect(); assert.ok(state.active > 0)
      await session.close()
      return { actualHttpRequestObserved: true, snapshot: state, cleanup: session.record.cleanup }
    } finally { server.closeAllConnections(); await new Promise(done => server.close(done)) }
  })
  for (const mode of ['tree', 'cli-root-first', 'cli-hard-root', 'root-first', 'hard-root', 'cancel']) await test(`sdk${major}: ${mode} cleanup`, async () => {
    const appMode = mode.endsWith('root-first') ? 'root-first' : 'tree'
    const directHost = mode === 'root-first' || mode === 'hard-root'
    const session = start(directHost ? [join(cwd, `bin/Debug/net${major}.0/GateApp.dll`), appMode]
      : runArgs(project, [appMode]), cwd)
    await until(() => session.record.stdout.includes('CHILD:'))
    const childPid = Number(/CHILD:(\d+)/.exec(session.record.stdout)[1])
    await until(() => session.inspect().processes.some(value => value.pid === childPid && value.owned))
    const before = session.inspect(); assert.ok(before.active >= 1)
    if (mode.endsWith('hard-root')) {
      session.rootStop(); await until(() => session.record.rootExitObserved)
    }
    if (mode.endsWith('root-first')) await until(() => session.record.rootExitObserved)
    const afterRoot = session.inspect()
    if (directHost) assert.ok(afterRoot.active > 0, 'Direct host descendant must survive until owned cleanup')
    if (mode === 'cancel') await manager.cleanupOwner('scenario')
    else await session.close()
    assert.ok(control.inspect().active > 0, 'Unrelated control owner must survive')
    return { directHost, childPid, snapshot: before, afterRoot, cleanup: session.record.cleanup, controlSurvived: true }
  })
  await test(`sdk${major}: inherited stdin UTF8/repeated/empty/EOF`, async () => {
    const session = start(runArgs(project, ['read']), cwd, { input: true })
    await until(() => session.record.stdout.includes('Name: '))
    assert.equal(await session.write('Việt 😀\n'), true)
    await until(() => session.record.stdout.includes('Hello Việt 😀'))
    assert.equal(await session.write('first\n\nthird\n'), true)
    await until(() => session.record.stdout.includes('LINE:third'))
    session.eof(); await bounded(session.settled)
    assert.ok(session.record.stdout.includes('LINE:first\r\nLINE:\r\nLINE:third'))
    assert.ok(session.record.stdout.includes('EOF')); assert.equal(session.record.exitCode, 0)
    await session.close()
    return { promptBeforeInput: true, stdout: session.record.stdout, cleanup: session.record.cleanup }
  })
  await test(`sdk${major}: Stop waiting ReadLine`, async () => {
    const session = start(runArgs(project, ['read']), cwd, { input: true })
    await until(() => session.record.stdout.includes('Name: ')); await session.close()
    return session.record.cleanup
  })
  await test(`sdk${major}: blocked stdin write Stop`, async () => {
    const session = start(runArgs(project, ['wait']), cwd, { input: true })
    await until(() => session.record.stdout.includes('WAITING'))
    let written = false
    const writing = session.write(Buffer.alloc(8 * 1024 * 1024, 65)).then(value => { written = true; return value })
    await delay(200)
    assert.equal(written, false); assert.equal(session.inspect().pendingWrites, 1)
    await session.close(); assert.equal(await writing, false)
    return { actuallyBlocked: true, cleanup: session.record.cleanup }
  })
  await test(`sdk${major}: failed build/run cleanup`, async () => {
    const original = await readFile(join(cwd, 'Program.cs'), 'utf8')
    await writeFile(join(cwd, 'Program.cs'), 'broken C# source')
    try { await execute(buildArgs(project), cwd, 1) }
    finally { await writeFile(join(cwd, 'Program.cs'), original) }
    const bad = start(runArgs(join(cwd, 'Missing.csproj')), cwd)
    await bounded(bad.settled); assert.notEqual(bad.record.exitCode, 0); await bad.close()
    return { buildNonzero: true, runNonzero: true, noAutomaticExecuteAfterBuildFailure: true }
  })
  await test(`sdk${major}: repeated cleanup/no new shared workers`, async () => {
    await execute(buildArgs(project), cwd)
    await execute(runArgs(project, ['basic']), cwd)
    const repeatedHandlesBefore = native.inspect().handles, cycleHandles = []
    for (let i = 0; i < 8; i++) {
      await execute(runArgs(project, ['basic']), cwd)
      cycleHandles.push(native.inspect().handles)
    }
    const handlesAfter = native.inspect().handles
    assert.ok(handlesAfter <= repeatedHandlesBefore + 2, `Repeated-cycle handle growth ${repeatedHandlesBefore} -> ${handlesAfter}`)
    const controlPids = new Set(control.inspect().processes.filter(value => value.owned).map(identity))
    const original = new Set(baseline.map(identity))
    const newUnowned = native.inspect().processes.filter(value => !original.has(identity(value)) && !controlPids.has(identity(value)))
    assert.deepEqual(newUnowned, [], 'New SDK/compiler process outside retained ownership')
    return { initialHandles: handlesBefore, repeatedHandlesBefore, handlesAfter, cycleHandles,
      baseline, newUnowned, controlSurvived: control.inspect().active > 0 }
  })
  await control.close()
}
async function main() {
  await app.whenReady()
  assert.ok(dotnet, 'BLOCKED: dotnet.exe missing on PATH')
  assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64')
  const initialProcesses = native.inspect().processes
  const systemRoot = process.env.SystemRoot
  const os = await promisify(execFile)(join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture | ConvertTo-Json -Compress'],
    { windowsHide: true, shell: false })
  evidence.inventory = { dotnet, windows: JSON.parse(os.stdout), arch: process.arch, initialProcesses,
    electron: process.versions.electron, abi: process.versions.modules,
    info: (await execute(['--info'], spike)).stdout, sdks: (await execute(['--list-sdks'], spike)).stdout,
    nativeSourceSha256: createHash('sha256').update(await readFile(join(root, 'src/main/services/run/native/run-process.cpp'))).digest('hex'),
    harnessSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    prototypeSha256: createHash('sha256').update(await readFile(join(spike, 'native-prototype.cpp'))).digest('hex') }
  for (const major of [8, 10]) {
    const version = evidence.inventory.sdks.split(/\r?\n/).map(line => line.split(' ')[0]).filter(value => value.startsWith(`${major}.`)).at(-1)
    if (!version) { evidence.cases.push({ name: `sdk${major}`, result: 'BLOCKED', error: 'Required SDK unavailable; no installation attempted' }); continue }
    await cases(await fixture(major, version))
  }
  await manager.stop()
  assert.equal(manager.size, 0); assert.equal(live.size, 0)
  const initialIdentities = new Set(initialProcesses.map(identity))
  evidence.finalNewProcesses = native.inspect().processes.filter(value => !initialIdentities.has(identity(value)))
  assert.deepEqual(evidence.finalNewProcesses, [], 'New .NET workers remain after the complete harness, including preparation')
  evidence.finalResources = manager.size
  evidence.result = evidence.cases.every(value => value.result === 'PASS') ? 'PASS_ON_RECORDED_HOST' : 'NOT_PASS'
}
process.on('SIGINT', () => { void manager.stop().finally(() => app.exit(130)) })
main().catch(error => { evidence.result = 'NOT_PASS'; evidence.fatal = String(error.stack ?? error) }).finally(async () => {
  try { await manager.stop() } catch (error) { evidence.cleanupFailure = String(error); evidence.result = 'NOT_PASS' }
  evidence.finalResources = manager.size
  await save()
  console.log(JSON.stringify({ result: evidence.result, cases: evidence.cases.map(({ name, result }) => ({ name, result })), resources: manager.size }))
  app.exit(evidence.result === 'PASS_ON_RECORDED_HOST' ? 0 : 1)
})
