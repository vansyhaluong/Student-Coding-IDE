/* global process, console, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { WindowsPipedProcessAdapter, NodeRuntimeDetector, RunService, JavaScriptRunStrategy, ProcessManager,
  RunProjectLifecycle, ProjectService, FileSystemService, UnsavedTransitionService,
  IpcHandlerRegistry, DesktopApplication } = require(resolve(root, 'out/main/run-runtime.js'))
const fixtureRoot = resolve(root, 'tests/fixtures/run')
const projects = new ProjectService()
const manager = new ProcessManager()
let failWatch
const files = new FileSystemService(projects, { trashItem: async () => {},
  watchFactory: () => ({ close: () => {}, onError: (callback) => { failWatch = callback } }) })
const handlers = new Map()
const registry = new IpcHandlerRegistry({ handle: (channel, handler) => handlers.set(channel, handler),
  removeHandler: (channel) => handlers.delete(channel) })
let approval = true
let run
let beforeConfirm
const unsaved = new UnsavedTransitionService(registry, projects, { getRenderer: () => ({
  senderId: 7, send: (event) => {
    beforeConfirm?.()
    void handlers.get('lifecycle:resolve-unsaved-transition')?.({ sender: { id: 7 } }, {
      transitionId: event.transitionId, proceed: approval,
    })
  },
}) })
const detector = new NodeRuntimeDetector()
const events = []
const nativeProcesses = []
const adapter = new WindowsPipedProcessAdapter()
const waiters = new Set()
run = new RunService({ authorize: async (target) => ({ projectId: target.projectId,
  relativePath: target.relativePath, ...await files.authorizeRunFile(target.projectId, target.relativePath) }),
resolveRuntime: () => detector.resolve() }, [new JavaScriptRunStrategy()], {
  adapter: { create: (execution, observe) => {
    const native = adapter.create(execution, observe); nativeProcesses.push(native); return native
  } }, manager, onEvent: (_owner, event) => {
    events.push(event); for (const waiter of waiters) waiter(event)
  }, onEventSinkError: (error) => { throw error },
})
const failures = []
const lifecycle = new RunProjectLifecycle(run, projects, files, (error) => failures.push(error))
const desktop = new DesktopApplication([manager, projects, files, unsaved, lifecycle])
async function bounded(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Project Run smoke deadline')), 10000)
  })]) } finally { clearTimeout(timer) }
}
async function start() {
  const session = await run.startRun({ projectId: projects.getActiveProject().id, relativePath: 'long.js', dirty: false }, 7)
  const predicate = (event) => event.type === 'stdout' && event.session.sessionId === session.sessionId && event.data.includes('ready')
  if (!events.some(predicate)) await bounded(new Promise((resolve) => {
    const listener = (event) => { if (predicate(event)) { waiters.delete(listener); resolve() } }
    waiters.add(listener)
  }))
  return session
}
async function smoke() {
  await app.whenReady()
  await desktop.start()
  assert.equal(handlers.size, 1)
  await projects.openRoot(fixtureRoot)
  const a = await start()
  beforeConfirm = () => assert.equal(run.getSession(a.sessionId, 7).state, 'RUNNING')
  approval = false
  await assert.rejects(bounded(projects.openRoot(dirname(fixtureRoot))), { code: 'PROCESS_CANCELLED' })
  assert.equal(manager.size, 1)
  approval = true
  await bounded(projects.openRoot(dirname(fixtureRoot)))
  assert.equal(manager.size, 0)
  assert.equal(nativeProcesses[0].isReleased(), true)
  beforeConfirm = undefined
  await bounded(projects.openRoot(fixtureRoot))
  await start()
  await bounded(projects.closeProject())
  assert.equal(manager.size, 0)
  await projects.openRoot(fixtureRoot)
  await start()
  failWatch(new Error('controlled unavailable status'))
  await bounded(run.stopProject(projects.getActiveProject().id))
  assert.equal(manager.size, 0)
  await assert.rejects(start())
  await bounded(projects.openRoot(fixtureRoot))
  await start()
  await bounded(desktop.shutdown())
  assert.equal(desktop.getStatus().state, 'STOPPED')
  assert.equal(manager.size, 0)
  assert.ok(nativeProcesses.every((native) => native.isReleased()))
  assert.equal(failures.length, 0)
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron,
    abi: process.versions.modules, sessions: nativeProcesses.length,
    scenarios: ['cancel', 'confirmed switch', 'close', 'unavailable', 'reopen', 'shutdown'],
    remainingResources: manager.size, allNativeReleased: true }))
}
smoke().then(() => app.quit(), async (error) => {
  console.error(error)
  await desktop.shutdown().catch(console.error)
  app.exit(1)
})
