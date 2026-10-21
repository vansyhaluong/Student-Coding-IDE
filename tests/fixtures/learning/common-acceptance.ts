// Electron-only test composition. Fixed Main fixtures; no debug IPC, public paths,
// language implementation, shortened limits, or production composition changes.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { app, BrowserWindow, ipcMain } from 'electron'
import { ExerciseService, type ExerciseExecution } from '../../../src/main/services/learning/exercise-service'
import { WindowsExerciseRuntimeAdapter } from '../../../src/main/services/learning/runtime/windows-exercise-adapter'
import { loadLearningNative, type LearningNativeBinding } from '../../../src/main/services/learning/runtime/windows-exercise-native'
import { WindowsExerciseLeaseProvider } from '../../../src/main/services/learning/runtime/windows-exercise-lease'
import { ExerciseWorkspace } from '../../../src/main/services/learning/runtime/exercise-workspace'
import { FileExerciseCheckpointStore, makeExerciseCheckpoint, type ExerciseCheckpoint } from '../../../src/main/services/learning/runtime/exercise-checkpoint'
import { ExerciseIpcService } from '../../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry } from '../../../src/main/ipc/ipc-handler-registry'
import { DomainError } from '../../../src/main/errors/app-error'
import { DesktopApplication } from '../../../src/main/app/desktop-application'
import { ProcessManager } from '../../../src/main/services/process/process-manager'
import { WindowsProcessTreeTerminator } from '../../../src/main/services/process/windows-process-tree-terminator'
import { ProjectService } from '../../../src/main/services/project/project-service'
import { FileSystemService } from '../../../src/main/services/filesystem/filesystem-service'
import { RunService } from '../../../src/main/services/run/run-service'
import { WindowsPipedProcessAdapter } from '../../../src/main/services/run/windows-piped-process-adapter'
import { NodeRuntimeDetector } from '../../../src/main/services/dependencies/node-runtime'
import { TerminalService } from '../../../src/main/services/terminal/terminal-service'
import { NodePtyPort } from '../../../src/main/services/terminal/node-pty-adapter'
import { EXERCISE_CHANNELS, EXERCISE_LIMITS, type ExerciseSnapshot } from '../../../src/shared/contracts/exercise'
import type { ProjectId } from '../../../src/shared/contracts'

const directory = resolve(process.argv[2])
const evidence: { result: string; environment: object; checks: object[]; limitations: string[]; failure?: string } = {
  result: 'NOT_OBSERVED', environment: { electron: process.versions.electron, node: process.version,
    abi: process.versions.modules, windows: release(), arch: process.arch, watchdog: false }, checks: [],
  limitations: ['Fixed test-only Main driver is not C#/JS adapter acceptance', 'Windows 10 not observed',
    'Failure, pending I/O and history gaps are injected; actual OS faults are not claimed'],
}
const request = { exerciseId: 'ch2-01', language: 'javascript' as const, code: 'never evaluated by fixture', sourceRevision: 7 }
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
async function until(check: () => boolean | Promise<boolean>, label: string, ms = 10_000) {
  const due = performance.now() + ms
  while (performance.now() < due) { if (await check()) return; await pause(15) }
  throw Error(`Observation deadline: ${label}; no watchdog termination counts as PASS`)
}
function gate() { let open!: () => void; const promise = new Promise<void>(r => { open = r }); return { promise, open } }
const ref = (s: ExerciseSnapshot) => ({ sessionId: s.sessionId, generation: s.generation })
async function record(name: string, classification: string, observations: object) {
  evidence.checks.push({ name, classification, ...observations })
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(`PASS ${name} [${classification}]`)
}
let native: LearningNativeBinding
let window: BrowserWindow
let terminal: TerminalService
let run: RunService
let manager: ProcessManager
let projects: ProjectService
let files: FileSystemService
let projectId: ProjectId
let terminalSession: Awaited<ReturnType<TerminalService['create']>>
let projectSession: Awaited<ReturnType<RunService['startRun']>>
const projectEvents: object[] = []
let terminalText = '', projectText = ''
let execution: (workspace: ExerciseWorkspace) => ExerciseExecution
let hook: (record: ExerciseCheckpoint) => Promise<void> = async () => {}
let service: ExerciseService
let ipc: ExerciseIpcService
const adapters: WindowsExerciseRuntimeAdapter[] = []
const jobs: { handle: object; initial: object }[] = []
const handles: object[] = []
const evaluate = (code: string) => window.webContents.executeJavaScript(code, true)
async function invoke(method: string, payload: object) {
  return evaluate(`window.studentIde.learning.exercise.${method}(${JSON.stringify(payload)})`)
}
async function admit() {
  const result = await invoke('run', request)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value as ExerciseSnapshot
}
async function ready(s: ExerciseSnapshot) {
  await until(() => service.snapshot(window.webContents.id, ref(s)).stdout.includes('CHILD_READY'), 'native child readiness', 1_800)
}
function nativeExecution(workspace: ExerciseWorkspace, options: { phases?: ExerciseExecution['phases']; compileMs?: number;
  executeMs?: number; tree?: boolean; releaseFault?: boolean; historyGap?: boolean; executeScript?: string; missing?: boolean } = {}): ExerciseExecution {
  let fail = options.releaseFault ?? false
  const binding: LearningNativeBinding = { capability: native.capability, state: native.state, submitInput: native.submitInput,
    acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
    poll: native.poll, start: (...args) => { const handle = native.start(...args); jobs.push({ handle, initial: native.poll(handle) }); return handle },
    control: (h, action) => {
      if (action === 'release' && fail) { fail = false; throw { code: 'LEARNING_CLOSE', win32: 5 } }
      native.control(h, action)
    },
  }
  const adapter = new WindowsExerciseRuntimeAdapter(binding, phase => phase === 'prepare' ? null : {
    executable: options.missing ? join(workspace.path, 'absent-test-only.exe') : nodeExecutable, cwd: workspace.path,
    args: phase === 'execute' && options.tree ? [resolve('tests/fixtures/learning/job-tree.mjs')]
      : ['-e', phase === 'execute' && options.executeScript ? options.executeScript
        : `console.log('PHASE_READY');setTimeout(()=>{},${phase === 'compile' ? options.compileMs ?? 1 : options.executeMs ?? 1})`],
  })
  if (options.historyGap) {
    const original = adapter.evidence.bind(adapter)
    adapter.evidence = async () => { const e = await original(); return { ...e, totalProcesses: e.totalProcesses + 1, coverageComplete: false } }
  }
  adapters.push(adapter)
  return { adapter, phases: options.phases ?? ['compile', 'execute'] }
}
let nodeExecutable: string
async function isolation(label: string) {
  const before = projectText.length
  const marker = `ISOLATION_${label}_${Date.now()}`
  terminal.input({ sessionId: terminalSession.sessionId, data: `echo ${marker}\r` },
    { ownerWebContentsId: window.webContents.id, projectId })
  await until(() => projectText.length > before && terminalText.includes(marker), `Project heartbeat and PTY ${label}`)
  assert.equal(run.getSession(projectSession.sessionId, window.webContents.id).state, 'RUNNING')
  assert.equal(manager.size, 2)
  projectEvents.push({ label, projectStillRunning: true, heartbeatAfterProbe: true, ptyRoundTrip: true, resources: manager.size })
}
async function main() {
  await mkdir(directory, { recursive: true })
  app.setPath('userData', join(directory, 'user-data'))
  await app.whenReady()
  native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
  const hashes: Record<string, string> = {}
  for (const path of ['out/main/native/learning/learning-job.node', 'out/main/native/run-process.node',
    'out/preload/index.js', 'tests/fixtures/learning/common-acceptance.ts', 'src/main/services/learning/exercise-service.ts',
    'src/main/services/learning/runtime/exercise-session.ts', 'src/main/services/learning/runtime/native/learning-job.cpp']) {
    hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
  }
  evidence.environment = { ...evidence.environment, hashes, limits: EXERCISE_LIMITS }
  nodeExecutable = (await new NodeRuntimeDetector().resolve()).executable
  window = new BrowserWindow({ show: false, webPreferences: { preload: resolve('out/preload/index.js'),
    sandbox: true, nodeIntegration: false, contextIsolation: true } })
  const root = join(directory, 'learning')
  const leases = new WindowsExerciseLeaseProvider(root, native)
  service = new ExerciseService({ root, leases, createExecution: (_request, workspace) => execution(workspace),
    checkpointStore: workspace => { const store = new FileExerciseCheckpointStore(workspace); return {
      read: () => store.read(), write: async r => { await hook(r); await store.write(r) },
    } }, onSnapshot: (owner, snapshot) => ipc.publish(owner, snapshot) })
  ipc = new ExerciseIpcService(new IpcHandlerRegistry(ipcMain), service, context => {
    if (context.senderId !== window.webContents.id || context.senderFrame !== window.webContents.mainFrame) {
      throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Fixture owner only', retryable: false })
    }
  }, (context, s) => { assert.equal(context.senderId, window.webContents.id); window.webContents.send(EXERCISE_CHANNELS.changed, s) })
  service.observe(window.webContents); ipc.observe(window.webContents)
  const desktop = new DesktopApplication([service, ipc])
  await desktop.start(); await service.ready()
  await window.loadURL('data:text/html,<html><body>Common acceptance test fixture</body></html>')
  await evaluate('globalThis.events=[]; window.studentIde.learning.exercise.onChanged(s=>events.push(s)); true')
  const prefs = (window.webContents as unknown as { getLastWebPreferences(): Electron.WebPreferences }).getLastWebPreferences()
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false)

  // Actual unchanged Project Run + TerminalService + patched node-pty in this Electron host.
  const projectRoot = join(directory, 'project'); await mkdir(projectRoot)
  await writeFile(join(projectRoot, 'heartbeat.js'), "console.log('PROJECT_READY');setInterval(()=>console.log('BEAT'),100)")
  projects = new ProjectService(); manager = new ProcessManager()
  projectId = (await projects.openRoot(projectRoot)).id
  files = new FileSystemService(projects, { trashItem: async () => { throw Error('unused') } }); await files.start()
  run = new RunService({ authorize: async target => ({ projectId: target.projectId, relativePath: target.relativePath,
    ...await files.authorizeRunFile(target.projectId, target.relativePath) }), resolveRuntime: () => new NodeRuntimeDetector().resolve() },
  { adapter: new WindowsPipedProcessAdapter(resolve('out/main/native/run-process.node')), manager,
    onEvent: (_owner, event) => { if (event.type === 'stdout') projectText += event.data } })
  projectSession = await run.startRun({ projectId, relativePath: 'heartbeat.js', dirty: false }, window.webContents.id)
  terminal = new TerminalService({ ptyPort: new NodePtyPort(), projectService: projects, processManager: manager,
    processTreeTerminator: new WindowsProcessTreeTerminator(), shellResolver: { resolve: async () => ({
      executable: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cmd.exe'), args: ['/Q'], shellLabel: 'cmd' }) },
    publish: (_owner, event) => { if (event.type === 'data') terminalText += event.data } })
  terminal.start()
  terminalSession = await terminal.create({ projectId, cols: 80, rows: 24 }, { ownerWebContentsId: window.webContents.id, projectId })
  await isolation('before')

  let s: ExerciseSnapshot
  if (!process.argv[3]) {
  execution = workspace => nativeExecution(workspace, { tree: true })
  s = await admit(); const completed = service.completion(window.webContents.id, ref(s)); await ready(s)
  const live = await adapters.at(-1)!.evidence()
  assert.ok(live.members.length >= 2)
  for (const p of live.members) { const h = native.watch(p.pid); handles.push(h); assert.equal(native.observation(h, 'identity').created, p.created) }
  const busy = await invoke('run', request); assert.equal(busy.ok, false); assert.equal(busy.error.code, 'PROCESS_FAILED')
  await isolation('learning_running')
  const final = await completed
  assert.equal(final.reason, 'EXECUTE_TIMEOUT'); assert.equal(final.cleanup.cleanupComplete, true)
  assert.equal(final.cleanup.proof, 'VERIFIED')
  assert.ok(handles.every(h => native.observation(h, 'identity').signaled))
  assert.ok(adapters.at(-1)!.diagnostics().every(j => j.released && j.handlesClosed))
  const quotas = adapters.at(-1)!.diagnostics().map(j => j.quotaBytes)
  assert.deepEqual(quotas, [2 * 1024 ** 3, 512 * 1024 ** 2])
  await isolation('after_timeout')
  await record('native launch/membership/descendants/quota/2s-timeout/cleanup/admission', 'PASS_NATIVE_ELECTRON_WITH_FIXED_DRIVER',
    { live, final, quotas, handles: handles.map(h => native.observation(h, 'identity')), initialSuspendedJobs: jobs.map(j => j.initial) })

  // Exercise IPC checks current sequence; Preload checks unsolicited/stale deliveries.
  const eventCount = await evaluate('events.length')
  ipc.publish(window.webContents.id, final); ipc.publish(window.webContents.id, { ...final, sequence: final.sequence - 1 })
  window.webContents.send(EXERCISE_CHANNELS.changed, { ...final, sequence: final.sequence - 1 })
  window.webContents.send(EXERCISE_CHANNELS.changed, { ...final, sessionId: `exercise_${randomUUID()}`, sequence: final.sequence + 10 })
  await pause(50); assert.equal(await evaluate('events.length'), eventCount)
  const sequences: number[] = await evaluate('events.map(s=>s.sequence)')
  assert.ok(sequences.length > 0); assert.ok(sequences.every((n, i) => i === 0 || n > sequences[i - 1]))
  assert.equal((await invoke('snapshot', { ...ref(final), generation: final.generation + 1 })).ok, false)
  await record('IPC session/generation/sequence stale rejection', 'PASS_FIXTURE_INJECTION_REAL_TRANSPORT', { sequences, eventCount })

  for (const trigger of ['navigation', 'owner-loss'] as const) {
    execution = workspace => nativeExecution(workspace, { tree: true })
    s = await admit(); assert.ok(s.generation > final.generation)
    const completion = service.completion(window.webContents.id, ref(s)).then(() => 'unexpected', () => 'stale')
    await ready(s)
    if (trigger === 'navigation') await window.loadURL('data:text/html,<html><body>Replacement document</body></html>')
    else window.webContents.forcefullyCrashRenderer()
    await until(() => !service.status().active, `${trigger} native cleanup`)
    assert.equal(await completion, 'stale')
    assert.ok(adapters.at(-1)!.diagnostics().every(j => j.released && j.handlesClosed))
    const audit = new ExerciseWorkspace(root, s.sessionId, leases)
    await audit.acquire()
    try { assert.equal((await new FileExerciseCheckpointStore(audit).read()).checkpoint, 'CLEANUP_COMPLETE') }
    finally { await audit.releaseLease() }
    if (trigger === 'owner-loss') await window.loadURL('data:text/html,<html><body>Recovered owner</body></html>')
    assert.equal((await invoke('snapshot', ref(s))).ok, false)
    await isolation(trigger)
    await record(`real Electron ${trigger} cancellation`, 'PASS_NATIVE_ELECTRON_WITH_FIXED_DRIVER', { reference: ref(s), diagnostics: adapters.at(-1)!.diagnostics() })
  }

  // Native release failure is injected once, before the real native action.
  execution = workspace => nativeExecution(workspace, { releaseFault: true })
  s = await admit()
  await assert.rejects(service.completion(window.webContents.id, ref(s)))
  const failed = service.snapshot(window.webContents.id, ref(s))
  assert.equal(failed.cleanup.cleanupComplete, false); assert.equal(failed.cleanup.proof, 'PROCESS_UNRESOLVED')
  assert.equal(service.status().active, true); assert.equal((await invoke('run', request)).ok, false)
  await isolation('cleanup_failure')
  await service.retryCleanup(); assert.equal(service.status().active, false)
  assert.ok(adapters.at(-1)!.diagnostics().every(j => j.released && j.handlesClosed))
  await record('native cleanup failure retains ownership and retry', 'PASS_FIXTURE_FAULT_WITH_REAL_NATIVE', { failed, afterRetry: adapters.at(-1)!.diagnostics() })

  // Real 12s caller bound over a retained, injected pending checkpoint I/O task.
  const pending = gate(); let writes = 0
  hook = async r => { if (r.checkpoint === 'FINALIZED') { writes++; await pending.promise } }
  execution = workspace => nativeExecution(workspace)
  s = await admit(); const due = performance.now()
  await assert.rejects(service.completion(window.webContents.id, ref(s)))
  const waited = performance.now() - due
  const blocked = service.snapshot(window.webContents.id, ref(s))
  assert.ok(waited >= 12_000 && waited < 16_000); assert.equal(blocked.cleanup.pendingIo, true)
  assert.equal(blocked.cleanup.cleanupComplete, false); assert.equal(writes, 1)
  assert.equal((await leases.acquire(s.sessionId)), null)
  assert.equal((await invoke('run', request)).ok, false)
  await isolation('pending_io_after_12s')
  const retry = service.retryCleanup(); await pause(50); assert.equal(writes, 1)
  pending.open(); await retry; assert.equal(writes, 1); hook = async () => {}
  assert.equal(service.snapshot(window.webContents.id, ref(s)).cleanup.cleanupComplete, true)
  await record('12s cleanup wait retains I/O/lease; retry joins original task', 'PASS_FIXTURE_PENDING_IO_REAL_CLOCK_NATIVE', { waited, writes, blocked })

  // Deliberate historical evidence gap after genuine process settlement.
  execution = workspace => nativeExecution(workspace, { historyGap: true })
  s = await admit(); const quarantined = await service.completion(window.webContents.id, ref(s))
  assert.equal(quarantined.cleanup.proof, 'HISTORY_UNVERIFIED'); assert.equal(quarantined.cleanup.processClean, false)
  assert.equal(quarantined.cleanup.cleanupComplete, false); assert.equal(quarantined.cleanup.workspace, 'QUARANTINED')
  assert.ok((await stat(join(root, 'sessions', s.sessionId))).isDirectory())
  await record('Policy B historical gap never reports clean', 'PASS_FIXTURE_EVIDENCE_GAP_REAL_NATIVE', { quarantined })
  }

  if (process.argv[3] !== '--recovery') for (const failure of ['output', 'exit', 'spawn'] as const) {
    execution = w => nativeExecution(w, { phases: ['execute'], missing: failure === 'spawn',
      executeScript: failure === 'output' ? "process.stdout.write('x'.repeat(1100000));setInterval(()=>{},1000)" : 'process.exit(23)' })
    s = await admit(); const failedExecution = await service.completion(window.webContents.id, ref(s))
    assert.equal(failedExecution.reason, failure === 'output' ? 'OUTPUT_LIMIT' : 'RUNTIME_FAILED')
    assert.equal(failedExecution.cleanup.cleanupComplete, true)
    assert.ok(Buffer.byteLength(failedExecution.stdout) + Buffer.byteLength(failedExecution.stderr) <= EXERCISE_LIMITS.outputBytes)
    await isolation(`native_${failure}_failure`)
    await record(`native ${failure} failure handling`, 'PASS_NATIVE_ELECTRON_FIXED_FAILURE_PROCESS', {
      reason: failedExecution.reason, cleanup: failedExecution.cleanup,
      outputBytes: Buffer.byteLength(failedExecution.stdout) + Buffer.byteLength(failedExecution.stderr), diagnostics: adapters.at(-1)!.diagnostics() })
  }

  // Restart independent service against real exclusive leases and acknowledged checkpoints.
  const orphan = `exercise_${randomUUID()}`; await mkdir(join(root, 'sessions', orphan))
  const seed = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, leases); await seed.prepare()
  await new FileExerciseCheckpointStore(seed).write(makeExerciseCheckpoint({ sessionId: seed.sessionId, ownerId: 'test-only',
    hostEpoch: randomUUID(), workspaceIdentity: seed.identity! }, 'OWNED', null)); await seed.releaseLease()
  // Seed a verified finalized record only after an actual prior native clean proof.
  const verified = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, leases); await verified.prepare()
  const verifiedBase = { sessionId: verified.sessionId, ownerId: 'test-only', hostEpoch: randomUUID(), workspaceIdentity: verified.identity! }
  const verifiedStore = new FileExerciseCheckpointStore(verified)
  for (const stage of ['OWNED', 'RELEASE_READY', 'FINALIZED'] as const) {
    await verifiedStore.write(makeExerciseCheckpoint(verifiedBase, stage, 'VERIFIED'))
  }
  await verified.releaseLease()
  const history = new ExerciseWorkspace(root, `exercise_${randomUUID()}`, leases); await history.prepare()
  const historyBase = { sessionId: history.sessionId, ownerId: 'test-only', hostEpoch: randomUUID(), workspaceIdentity: history.identity! }
  const historyStore = new FileExerciseCheckpointStore(history)
  for (const stage of ['OWNED', 'RELEASE_READY', 'FINALIZED'] as const) {
    await historyStore.write(makeExerciseCheckpoint(historyBase, stage, stage === 'OWNED' ? null : 'HISTORY_UNVERIFIED'))
  }
  await history.releaseLease()
  await service.stop(); ipc.stop()
  const recovery = new ExerciseService({ root, leases }); recovery.start(); await recovery.ready()
  const status = recovery.status()
  assert.ok(status.orphanQuarantine.includes(orphan))
  assert.equal(status.recovery.find(r => r.sessionId === seed.sessionId)?.result, 'QUARANTINED')
  assert.equal(status.recovery.find(r => r.sessionId === history.sessionId)?.result, 'QUARANTINED')
  assert.equal(status.recovery.find(r => r.sessionId === verified.sessionId)?.result, 'CLEANUP_COMPLETE')
  await assert.rejects(stat(verified.path), { code: 'ENOENT' }); await recovery.stop()
  await record('startup recovery/quarantine/checkpoint deletion', 'PASS_SEEDED_FIXTURE_REAL_FILESYSTEM_NATIVE_LEASE', { status })

  // A separate root/service for one monotonic real 60s operation across phase changes.
  const longRoot = join(directory, 'deadline')
  const longService = new ExerciseService({ root: longRoot, leases: new WindowsExerciseLeaseProvider(longRoot, native),
    createExecution: (_r, workspace) => nativeExecution(workspace, { compileMs: 20_000, executeMs: 1_400,
      phases: ['compile', ...Array.from({ length: 32 }, () => 'execute' as const)] }) })
  longService.start(); await longService.ready(); longService.observe(window.webContents)
  const admittedAt = performance.now(); s = longService.run(window.webContents.id, request)
  const operation = longService.completion(window.webContents.id, ref(s))
  await isolation('operation60_running')
  const deadlineResult = await operation; const elapsed = performance.now() - admittedAt
  assert.equal(deadlineResult.reason, 'OPERATION_TIMEOUT'); assert.ok(elapsed >= 60_000 && elapsed < 65_000)
  assert.equal(deadlineResult.cleanup.cleanupComplete, true)
  await isolation('operation60_timeout'); await longService.stop()
  await record('60s monotonic operation deadline across compile/sequential execute', 'PASS_NATIVE_ELECTRON_FIXED_PHASE_PLAN_REAL_CLOCK',
    { elapsed, jobs: adapters.at(-1)!.diagnostics().length, deadlineResult })

  // Real active service shutdown through unchanged DesktopApplication, not app.exit.
  const shutdownRoot = join(directory, 'shutdown')
  let blockFinalization = true
  const shutdownService = new ExerciseService({ root: shutdownRoot, leases: new WindowsExerciseLeaseProvider(shutdownRoot, native),
    createExecution: (_r, w) => nativeExecution(w, { tree: true }), checkpointStore: w => {
      const store = new FileExerciseCheckpointStore(w)
      return { read: () => store.read(), write: async r => {
        if (r.checkpoint === 'FINALIZED' && blockFinalization) throw Error('test-only checkpoint failure')
        await store.write(r)
      } }
    } })
  const shutdownDesktop = new DesktopApplication([shutdownService]); await shutdownDesktop.start(); await shutdownService.ready()
  shutdownService.observe(window.webContents); s = shutdownService.run(window.webContents.id, request)
  const shutdownCompletion = shutdownService.completion(window.webContents.id, ref(s)).catch(() => undefined)
  await until(() => shutdownService.snapshot(window.webContents.id, ref(s)).stdout.includes('CHILD_READY'), 'shutdown active native readiness', 1_800)
  shutdownService.beginShutdown()
  assert.throws(() => shutdownService.run(window.webContents.id, request))
  await assert.rejects(shutdownDesktop.shutdown())
  assert.equal(shutdownDesktop.getStatus().state, 'STOPPING'); assert.equal(shutdownService.status().active, true)
  assert.equal(window.isDestroyed(), false)
  await isolation('shutdown_failure')
  blockFinalization = false
  await shutdownDesktop.shutdown(); await shutdownCompletion
  assert.equal(shutdownDesktop.getStatus().state, 'STOPPED'); assert.equal(shutdownService.status().active, false)
  assert.ok(adapters.at(-1)!.diagnostics().every(j => j.released && j.handlesClosed))
  await isolation('learning_shutdown')
  await record('active native shutdown seals admission and waits real cleanup', 'PASS_NATIVE_ELECTRON_FIXED_COMPOSITION',
    { status: shutdownDesktop.getStatus(), diagnostics: adapters.at(-1)!.diagnostics() })
  await record('Project Run/Terminal PTY isolation', 'PASS_REAL_SERVICES_NATIVE_ELECTRON_TEST_COMPOSITION', { probes: projectEvents })
  for (const h of handles) native.observation(h, 'close')
  await terminal.stop(); await run.stopProject(projectId); await files.stop(); await projects.stop(); await manager.stop()
  assert.equal(manager.size, 0)
  evidence.result = 'PASS'
  app.once('will-quit', () => { console.log(`PASS will-quit ${directory}`) })
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  window.destroy(); app.quit()
}
void main().catch(async error => {
  evidence.result = 'FAIL'; evidence.failure = String(error)
  console.error(error)
  await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
  // Failure containment is explicitly excluded from PASS and preserves the artifact.
  await service?.stop().catch(() => {}); ipc?.stop()
  await terminal?.stop().catch(() => {}); if (projectId) await run?.stopProject(projectId).catch(() => {})
  app.exit(1)
})
