/* global process, console, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath, stat } from 'node:fs/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { WindowsPipedProcessAdapter, NodeRuntimeDetector, RunService, JavaScriptRunStrategy, ProcessManager }
  = require(resolve(root, 'out/main/run-runtime.js'))
const projectId = 'project_1234567890abcdef12345678'
const cwd = resolve(root, 'tests/fixtures/run')
const manager = new ProcessManager()
const events = []
const waiters = new Set()
const failures = []
const detector = new NodeRuntimeDetector()
const service = new RunService({
  authorize: async (target, owner) => {
    assert.equal(owner, 7)
    assert.equal(target.projectId, projectId)
    assert.ok(['basic.js', 'nonzero.js', 'long.js', 'root-first.js'].includes(target.relativePath))
    const canonicalFile = await realpath(resolve(cwd, target.relativePath))
    assert.equal(dirname(canonicalFile), cwd)
    assert.ok((await stat(canonicalFile)).isFile())
    return { projectId, relativePath: target.relativePath, canonicalRoot: cwd, canonicalFile }
  },
  resolveRuntime: () => detector.resolve(),
}, [new JavaScriptRunStrategy()], { adapter: new WindowsPipedProcessAdapter(), manager,
  onEvent: (owner, event) => {
    assert.equal(owner, 7)
    events.push(event)
    for (const waiter of waiters) waiter(event)
  }, onEventSinkError: (error) => failures.push(error) })

async function bounded(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Lifecycle smoke deadline')), 10000)
  })]) } finally { clearTimeout(timer) }
}
function waitFor(predicate) {
  const previous = events.find(predicate)
  if (previous) return Promise.resolve(previous)
  return bounded(new Promise((resolve) => {
    const waiter = (event) => {
      if (predicate(event)) { waiters.delete(waiter); resolve(event) }
    }
    waiters.add(waiter)
  }))
}
const start = (relativePath) => bounded(service.startRun({ projectId, relativePath, dirty: false }, 7))
const exit = (session) => waitFor((event) => event.type === 'exit' && event.session.sessionId === session.sessionId)
const ready = (session) => waitFor((event) => event.type === 'stdout'
  && event.session.sessionId === session.sessionId && event.data.includes('ready'))

async function run() {
  await app.whenReady()
  assert.equal(process.type, 'browser')
  for (const [file, code, state] of [['basic.js', 0, 'EXITED'], ['nonzero.js', 7, 'FAILED']]) {
    const session = await start(file)
    const result = await exit(session)
    assert.equal(result.exitCode, code)
    assert.equal(result.session.state, state)
    await bounded(manager.stop())
    assert.equal(manager.size, 0)
    const output = events.filter((event) => event.session.sessionId === session.sessionId)
    if (file === 'basic.js') {
      assert.equal(output.filter((event) => event.type === 'stdout').map((event) => event.data).join(''), 'stdout-test\n')
      assert.equal(output.filter((event) => event.type === 'stderr').map((event) => event.data).join(''), 'stderr-test\n')
    }
    await bounded(service.stopRun(session.sessionId, 7))
  }
  const first = await start('long.js')
  await ready(first)
  assert.equal(manager.size, 1)
  const second = await start('long.js')
  await ready(second)
  assert.notEqual(first.sessionId, second.sessionId)
  assert.equal((await exit(first)).session.state, 'CANCELLED')
  assert.ok(events.findIndex((event) => event.type === 'exit' && event.session.sessionId === first.sessionId)
    < events.findIndex((event) => event.type === 'state' && event.session.sessionId === second.sessionId))
  assert.equal(manager.size, 1)
  await bounded(Promise.all([service.stopRun(second.sessionId, 7), service.stopRun(second.sessionId, 7)]))
  assert.equal((await exit(second)).session.state, 'CANCELLED')
  assert.equal(manager.size, 0)
  const tree = await start('root-first.js')
  assert.equal((await exit(tree)).session.state, 'EXITED')
  await bounded(manager.stop())
  assert.equal(manager.size, 0)
  for (const id of new Set(events.map((event) => event.session.sessionId))) {
    assert.equal(events.filter((event) => event.type === 'exit' && event.session.sessionId === id).length, 1)
  }
  assert.equal(events.filter((event) => event.type === 'error').length, 0)
  assert.equal(failures.length, 0)
  assert.equal(waiters.size, 0)
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron,
    abi: process.versions.modules, arch: process.arch, scenarios: ['natural exit 0', 'natural exit 7',
      'separate stdout/stderr', 'stop and duplicate stop', 'same-target re-run', 'root-first descendant cleanup'],
    sessions: new Set(events.map((event) => event.session.sessionId)).size, remainingResources: manager.size }))
}
run().then(() => app.quit(), async (error) => {
  console.error(error)
  await manager.stop().catch(console.error)
  app.exit(1)
})
