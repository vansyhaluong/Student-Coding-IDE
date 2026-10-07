/* global console, process, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { WindowsPipedProcessAdapter, NodeRuntimeDetector, RunService, JavaScriptRunStrategy, ProcessManager }
  = require(resolve(root, 'out/main/run-runtime.js'))
const projectId = 'project_1234567890abcdef12345678'
const cwd = resolve(root, 'tests/fixtures/run')
const records = []
let liveProcess
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
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron,
    node: process.versions.node, modules: process.versions.modules, napi: process.versions.napi,
    arch: process.arch, cycles: records.length, rootFirstCleanup: true, failedSpawn: true, records }))
}
run().then(() => app.quit(), async (error) => {
  console.error(error)
  if (liveProcess) await liveProcess.close().catch(console.error)
  app.exit(1)
})
