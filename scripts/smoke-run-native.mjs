/* global console, process, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { WindowsPipedProcessAdapter, NodeRuntimeDetector, RunService, JavaScriptRunStrategy, ProcessManager }
  = require(resolve(root, 'out/main/run-runtime.js'))
const projectId = 'project_1234567890abcdef12345678'
const cwd = resolve(root, 'tests/fixtures/run')
const records = []
let liveProcess
let argumentDirectory
const binding = require(resolve(root, 'out/main/native/run-process.node'))
const execFileAsync = promisify(execFile)
async function handleCount() {
  const { stdout } = await execFileAsync(resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${process.pid}).HandleCount`],
    { windowsHide: true, shell: false })
  return Number(stdout.trim())
}
async function argumentSmoke(runtime) {
  argumentDirectory = await mkdtemp(resolve(tmpdir(), 'student-ide-run-argv '))
  const executable = resolve(argumentDirectory, 'node space # Việt 😀.exe')
  const fixture = resolve(argumentDirectory, 'argv space # Việt 😀.js')
  await copyFile(runtime.executable, executable)
  await copyFile(resolve(cwd, 'argv.js'), fixture)
  const adapter = new WindowsPipedProcessAdapter(undefined, { ...process.env,
    NODE_OPTIONS: '--this-must-never-reach-node', NODE_PATH: 'private', ELECTRON_RUN_AS_NODE: '1',
    RUN_SMOKE_INHERITED: 'inherited # Việt 😀' })
  const preparation = { executable, args: [fixture], cwd: argumentDirectory,
    shell: false, environmentAdditions: {} }
  async function roundTrip(args) {
    const events = []
    liveProcess = adapter.create({ ...preparation, args: [fixture, ...args] }, (event) => events.push(event))
    const pid = liveProcess.ownership.rootPid
    await bounded(liveProcess.settled)
    assert.equal(events.find((event) => event.type === 'exit')?.exitCode, 0)
    assert.equal(events.filter((event) => event.type === 'error').length, 0)
    const output = JSON.parse(events.filter((event) => event.type === 'stdout').map((event) => event.data).join(''))
    assert.deepEqual(output, { args, cwd: argumentDirectory, stdin: '', nodeOptions: null,
      nodePath: null, electronAsNode: null, inherited: 'inherited # Việt 😀' })
    const job = liveProcess.ownership.job
    await bounded(liveProcess.close())
    assert.equal(liveProcess.isReleased(), true)
    assert.equal(await job.activeProcessCount(), 0)
    assert.throws(() => process.kill(pid, 0), 'root must no longer exist')
    liveProcess = undefined
  }
  await roundTrip([])
  const handlesBefore = await handleCount()
  const tricky = ['', 'one', 'two words', 'C:\\space # Việt 😀\\', 'a"b', '"', '\\', '\\\\',
    'a\\"b', 'a\\\\"b', 'trailing\\\\', '\t', 'line\r\nbreak', '& echo injected | > marker', '%PATH%', '!PATH!', '^()']
  for (let i = 0; i < 20; ++i) await roundTrip(tricky)
  await roundTrip(Array.from({ length: 1023 }, (_, i) => `arg${i}`))
  // All these paths contain no quotes/backslashes at the end: quoted length is +2.
  const overhead = executable.length + 2 + 1 + fixture.length + 2 + 1 + 2
  await roundTrip(['x'.repeat(32766 - overhead)])
  let rejected = 0
  for (const change of [
    { args: 'not-an-array' }, { args: [null] }, { args: [1] }, { args: Array(2) },
    { args: ['bad\0argument'] }, { args: Array(1025).fill('') },
    { args: [fixture, 'x'.repeat(32767 - overhead)] }, { args: ['\\'.repeat(20000)] },
    { args: ['x'.repeat(32767)] }, { executable: 'node.exe' }, { executable: 'C:node.exe' },
    { executable: '\\node.exe' }, { executable: executable + '\0' },
    { executable: argumentDirectory }, { executable: fixture }, { executable: executable + '.missing.exe' },
    { cwd: '.' }, { cwd: 'C:relative' }, { cwd: fixture }, { cwd: argumentDirectory + '\0' },
    { cwd: resolve(argumentDirectory, 'missing') }, { shell: true }, { environmentAdditions: { UNSAFE: '1' } },
  ]) {
    assert.throws(() => adapter.create({ ...preparation, ...change }, () => {}))
    ++rejected
  }
  for (const [args, environment, observer] of [
    ['legacy-string', [], () => {}], [[], [], null], [[], ['=empty'], () => {}],
    [[], ['INVALID'], () => {}], [[], ['A=bad\0value'], () => {}],
    [[], ['A=' + 'x'.repeat(32765)], () => {}], [[], Array(32768).fill('A=B'), () => {}],
  ]) {
    assert.throws(() => binding.createRun(executable, args, argumentDirectory, environment, observer))
    ++rejected
  }
  // Zero args is valid and stdin EOF lets Node terminate without an interactive REPL.
  liveProcess = adapter.create({ ...preparation, args: [] }, () => {})
  await bounded(liveProcess.settled)
  await bounded(liveProcess.close())
  liveProcess = undefined
  const handlesAfter = await handleCount()
  assert.ok(handlesAfter <= handlesBefore + 2, `native handle growth: ${handlesBefore} -> ${handlesAfter}`)
  for (const mode of ['live-root', 'root-first']) {
    let output = '', ready
    const childReady = new Promise((done) => { ready = done })
    liveProcess = adapter.create({ ...preparation,
      args: [resolve(cwd, 'argv-tree.js'), mode, 'space # Việt 😀', ''] }, (event) => {
      if (event.type === 'stdout') {
        output += event.data
        if (output.includes('\n')) ready()
      }
    })
    await bounded(childReady)
    const childPid = Number(output.trim()), rootPid = liveProcess.ownership.rootPid
    const job = liveProcess.ownership.job
    if (mode === 'root-first') await bounded(liveProcess.settled)
    process.kill(childPid, 0)
    assert.ok(await job.activeProcessCount() > 0)
    await bounded(Promise.all([liveProcess.close(), liveProcess.close()]))
    assert.equal(liveProcess.isReleased(), true)
    assert.equal(await job.activeProcessCount(), 0)
    assert.throws(() => process.kill(rootPid, 0))
    assert.throws(() => process.kill(childPid, 0))
    liveProcess = undefined
  }
  return { roundTrips: 23, rejected, maxArguments: 1024, maxCommandLine: 32766,
    closedStdin: true, filteredEnvironment: true, handlesBefore, handlesAfter,
    multiArgumentStop: true, multiArgumentRootFirstCleanup: true }
}
async function removeArgumentDirectory() {
  if (!argumentDirectory) return
  const path = resolve(argumentDirectory)
  assert.ok(path.startsWith(resolve(tmpdir(), 'student-ide-run-argv ')))
  await rm(path, { recursive: true, force: true })
  argumentDirectory = undefined
}
async function bounded(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Native smoke deadline')), 10000)
  })]) } finally { clearTimeout(timer) }
}
async function run() {
  await app.whenReady()
  assert.equal(process.type, 'browser')
  const runtime = await new NodeRuntimeDetector().resolve()
  const adapter = new WindowsPipedProcessAdapter()
  const manager = new ProcessManager()
  const service = new RunService({
    authorize: async (target) => {
      assert.equal(target.projectId, projectId)
      assert.ok(['basic.js', 'nonzero.js', 'stream.js', 'root-first.js'].includes(target.relativePath))
      return { projectId, relativePath: target.relativePath, canonicalRoot: cwd,
        canonicalFile: resolve(cwd, target.relativePath) }
    },
    resolveRuntime: async () => runtime,
  }, [new JavaScriptRunStrategy()])
  for (let i = 0; i < 15; ++i) {
    const file = ['basic.js', 'nonzero.js', 'stream.js'][i % 3]
    const events = []
    const preparation = await service.prepare({ projectId, relativePath: file, dirty: false }, 7)
    let synchronous = true
    liveProcess = await service.launchPrepared(preparation.session.sessionId, 7, adapter, manager, (event) => {
      assert.equal(synchronous, false, 'native streaming must be asynchronous')
      events.push(event)
    })
    synchronous = false
    assert.equal(liveProcess.ownership.mode, 'JOB_OWNED')
    await bounded(liveProcess.settled)
    assert.equal(events.filter((event) => event.type === 'exit').length, 1)
    assert.equal(events.find((event) => event.type === 'exit').exitCode, file === 'nonzero.js' ? 7 : 0)
    assert.equal(events.filter((event) => event.type === 'stdout-eof').length, 1)
    assert.equal(events.filter((event) => event.type === 'stderr-eof').length, 1)
    assert.equal(events.filter((event) => event.type === 'error').length, 0)
    const stdout = events.filter((event) => event.type === 'stdout').map((event) => event.data).join('')
    const stderr = events.filter((event) => event.type === 'stderr').map((event) => event.data).join('')
    if (file === 'basic.js') { assert.equal(stdout, 'stdout-test\n'); assert.equal(stderr, 'stderr-test\n') }
    if (file === 'stream.js') { assert.match(stdout, /unicode: Việt Nam 😀/); assert.equal(stderr, 'second-output\n') }
    await bounded(Promise.all([liveProcess.close(), liveProcess.close()]))
    assert.equal(liveProcess.isReleased(), true)
    assert.equal(manager.size, 0)
    const count = events.length
    await liveProcess.close()
    assert.equal(events.length, count, 'no duplicate finalization events')
    records.push({ file, events: events.map((event) => event.type), released: true })
    liveProcess = undefined
  }
  // Root/pipe settlement does not mean the owned descendant tree is empty.
  const treePreparation = await service.prepare({ projectId, relativePath: 'root-first.js', dirty: false }, 7)
  liveProcess = await service.launchPrepared(treePreparation.session.sessionId, 7, adapter, manager, () => {})
  await bounded(liveProcess.settled)
  assert.equal(liveProcess.ownership.mode, 'JOB_OWNED')
  const job = liveProcess.ownership.job
  assert.ok(await job.activeProcessCount() > 0, 'descendant survives root exit')
  await bounded(manager.stop())
  assert.equal(liveProcess.isReleased(), true)
  assert.equal(await job.activeProcessCount(), 0)
  assert.equal(manager.size, 0)
  liveProcess = undefined
  // A failed native creation must not retain ProcessManager ownership.
  const failed = await service.prepare({ projectId, relativePath: 'basic.js', dirty: false }, 7)
  const brokenAdapter = { create: (execution, observe) => adapter.create({ ...execution,
    executable: resolve(root, 'tests/fixtures/run/missing/node.exe') }, observe) }
  await assert.rejects(service.launchPrepared(failed.session.sessionId, 7, brokenAdapter, manager, () => {}))
  assert.equal(manager.size, 0)
  service.releasePreparation(failed.session.sessionId, 7)
  const argumentsResult = await argumentSmoke(runtime)
  await removeArgumentDirectory()
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron,
    node: process.versions.node, modules: process.versions.modules, napi: process.versions.napi,
    arch: process.arch, cycles: records.length, rootFirstCleanup: true, failedSpawn: true, argumentsResult, records }))
}
run().then(() => app.quit(), async (error) => {
  console.error(error)
  if (liveProcess) await liveProcess.close().catch(console.error)
  await removeArgumentDirectory().catch(console.error)
  app.exit(1)
})
