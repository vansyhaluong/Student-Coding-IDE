/* global console, process, setTimeout, clearTimeout, Buffer */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const binding = require(resolve('out/main/native/run-process.node'))
const { createCsharpLanguageManager } = require(resolve('out/main/language-runtime.js'))
const resources = new Map()
const registry = { register(resource) { resources.set(resource.id, resource); return () => resources.delete(resource.id) } }
const deadline = (promise, ms = 10000) => new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error('C# smoke deadline')), ms)
  promise.then((value) => { clearTimeout(timer); done(value) }, (error) => { clearTimeout(timer); fail(error) })
})
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
let manager, nativeHandle, control
let nativeSettled = deferred()
async function main() {
try {
  await app.whenReady()
  const pathValue = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const node = pathValue.split(';').map((entry) => join(entry.replace(/^"|"$/g, ''), 'node.exe'))
    .find((candidate) => /^[a-z]:[\\/]/i.test(candidate) && existsSync(candidate))
  assert.ok(node, 'Native smoke requires PATH node.exe')
  const environment = Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')
    .map(([key, value]) => key + '=' + value)
  environment.push('ELECTRON_RUN_AS_NODE=1')
  const childReady = deferred(), echoed = deferred(), rootExited = deferred()
  let stdout = '', stderr = '', childPid
  control = spawn(node, [resolve('tests/fixtures/csharp-native-child.mjs'), 'child'], {
    shell: false, windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  await new Promise((done, fail) => { control.once('spawn', done); control.once('error', fail) })
  nativeHandle = binding.createCsharp(node, [resolve('tests/fixtures/csharp-native-child.mjs')],
    resolve('.'), environment, (event) => {
      if (event.type === 'stdout') {
        stdout += event.data.toString('utf8')
        const match = /CHILD:(\d+)\r?\n/.exec(stdout)
        if (match) { childPid = Number(match[1]); childReady.resolve() }
        if (stdout.includes('xin chào # 😀\n')) echoed.resolve()
      }
      if (event.type === 'stderr') stderr += event.data.toString('utf8')
      if (event.type === 'exit') rootExited.resolve()
      if (event.type === 'settled') nativeSettled.resolve()
    })
  await deadline(childReady.promise)
  await new Promise((done, fail) => binding.writeCsharp(nativeHandle, Buffer.from('xin chào # 😀\n'),
    (ok) => ok ? done() : fail(new Error('stdin write failed'))))
  await deadline(echoed.promise)
  assert.ok(stderr.includes('STDERR'))
  const rootPid = binding.control(nativeHandle, 'pid')
  await new Promise((done, fail) => execFile(join(process.env.SystemRoot, 'System32/taskkill.exe'),
    ['/PID', String(rootPid), '/F'], { windowsHide: true, shell: false }, (error) => error ? fail(error) : done()))
  await deadline(rootExited.promise)
  process.kill(childPid, 0)
  assert.ok(binding.control(nativeHandle, 'count') >= 1, 'Job must retain surviving descendant')
  assert.throws(() => binding.control(nativeHandle, 'release'))
  binding.control(nativeHandle, 'terminate')
  await deadline(nativeSettled.promise)
  assert.equal(binding.control(nativeHandle, 'count'), 0)
  assert.throws(() => process.kill(childPid, 0))
  process.kill(control.pid, 0)
  binding.control(nativeHandle, 'release')
  binding.control(nativeHandle, 'release')
  nativeHandle = undefined
  console.log(JSON.stringify({ native: 'PASS', hardKilledRoot: rootPid, descendant: childPid,
    ownershipRetainedAfterRootExit: true, emptyBeforeRelease: true, unrelatedControlSurvived: true }))

  nativeSettled = deferred()
  const blockedReady = deferred(), written = deferred()
  nativeHandle = binding.createCsharp(node, [resolve('tests/fixtures/csharp-native-child.mjs'), 'blocked'],
    resolve('.'), environment, (event) => {
      if (event.type === 'stdout') blockedReady.resolve()
      if (event.type === 'settled') nativeSettled.resolve()
    })
  await deadline(blockedReady.promise)
  binding.writeCsharp(nativeHandle, Buffer.alloc(8 * 1024 * 1024, 65), (success) => written.resolve(success))
  binding.control(nativeHandle, 'terminate')
  assert.equal(await deadline(written.promise), false, 'Blocked stdin write must settle on tree termination')
  await deadline(nativeSettled.promise)
  assert.equal(binding.control(nativeHandle, 'count'), 0)
  binding.control(nativeHandle, 'release')
  nativeHandle = undefined
  console.log(JSON.stringify({ blockedStdinCleanup: 'PASS', pendingWriteSettled: true, emptyBeforeRelease: true }))

  const sdk = resolve('spikes/csharp-lsp-compatibility/.dotnet')
  const env = { ...process.env, DOTNET_ROOT: sdk }
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = sdk + ';' + (env[pathKey] ?? '')
  manager = createCsharpLanguageManager({ mode: 'development',
    privateExecutable: resolve('spikes/csharp-lsp-compatibility/.tools/csharp-ls.exe') }, registry, env)
  const adapter = await deadline(manager.start({
    root: resolve('spikes/csharp-lsp-compatibility/fixtures/solution-sln'), solution: 'SpikeSolution.sln',
  }), 45000)
  assert.equal(manager.state, 'RUNNING')
  assert.equal(resources.size, 1)
  console.log(JSON.stringify({ realProvider: 'initialized', capabilities: adapter.serverCapabilities }))
  await manager.stop()
  assert.equal(manager.state, 'STOPPED')
  assert.equal(resources.size, 0)
  assert.equal(manager.cleanupPending, false)
  console.log(JSON.stringify({ realProvider: 'PASS', gracefulShutdown: true, released: true }))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  if (manager) { try { await manager.dispose() } catch (error) { console.error(error); process.exitCode = 1 } }
  if (nativeHandle) {
    binding.control(nativeHandle, 'terminate')
    await deadline(nativeSettled.promise)
    binding.control(nativeHandle, 'release')
  }
  if (control?.pid) {
    const exited = new Promise((done) => control.once('exit', done))
    control.kill()
    await deadline(exited)
  }
  app.exit(process.exitCode ?? 0)
}
}
void main()
