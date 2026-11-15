// Independent Electron test host. No production module is edited.
// @ts-nocheck -- bundled experiment; production APIs are exercised at runtime.
import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile, rm, lstat, readdir, symlink, access } from 'node:fs/promises'
import { writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../../src/main/app/application-quit-coordinator'
import { RunService } from '../../src/main/services/run/run-service'
import { WindowsPipedProcessAdapter as ProjectAdapter } from '../../src/main/services/run/windows-piped-process-adapter'
import { ProjectService } from '../../src/main/services/project/project-service'
import { TerminalService } from '../../src/main/services/terminal/terminal-service'
import { NodePtyPort } from '../../src/main/services/terminal/node-pty-adapter'
import { WindowsProcessTreeTerminator } from '../../src/main/services/process/windows-process-tree-terminator'
import { WindowsPipedProcessAdapter as LearningAdapter } from '../exercise-runtime-9d0/windows-spike-adapter'
import { ExerciseSpike } from '../exercise-runtime-9d0/runtime'
import { exercises } from '../../src/main/services/learning/content/exercises'

const output = resolve(__dirname), config = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'))
const mode = process.argv.find(a => a.startsWith('--spike-mode='))?.split('=')[1] ?? 'suite'
const nativePath = join(output, 'exercise-process.node')
const native = createRequire(__filename)(nativePath)
const records: any[] = [], handles: any[] = [], sessions: any[] = []
const trace: string[] = []
const runRoot = join(output, `host-${mode}-${randomUUID()}`)
app.setPath('userData', join(runRoot, 'userData'))
app.setPath('crashDumps', join(runRoot, 'crashes'))
const delay = (ms = 15) => new Promise(r => setTimeout(r, ms))
async function waitFor(check: () => any, ms = 12000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { if (await check()) return; await delay() }
  throw Error('Observation deadline exceeded')
}
function watch(pid: number) { const h = native.watch(pid); handles.push(h); return h }
async function absent(path: string) { await assert.rejects(access(path)) }
function safeError(e: any) { return { name: e?.name, message: String(e?.message ?? e).slice(0, 600) } }
async function test(name: string, work: (r: any) => Promise<void>) {
  if (mode === 'root-first' && !name.startsWith('B: root exited')) return
  if (mode === 'remaining' && !/^(B: injected|C: Electron|D:|E: production)/.test(name)) return
  const r: any = { name, started: new Date().toISOString() }, start = Date.now()
  try { await work(r); r.status = 'PASS' }
  catch (e) { r.status = 'FAIL'; r.error = safeError(e); throw e }
  finally { r.elapsedMs = Date.now() - start; records.push(r); persist(); console.log(`${r.status}: ${name}`) }
}
function persist() { writeFileSync(join(output, 'suite-results.json'), JSON.stringify({ hostPid: process.pid,
  electron: process.versions.electron, node: process.versions.node, mode, runRoot, trace, records }, null, 2)) }

async function safeDelete(root: string, workspace: string, processClean: boolean, denied = false) {
  if (!processClean) throw Error('PROCESS_NOT_CLEAN')
  const base = resolve(root), target = resolve(workspace)
  if (dirname(target) !== base || !relative(base, target) || relative(base, target).startsWith('..')) throw Error('UNSAFE_CONTAINMENT')
  async function validate(path: string) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw Error('REPARSE_POINT')
    if (info.isDirectory()) for (const name of await readdir(path)) await validate(join(path, name))
  }
  await validate(target)
  if (denied) { const e = new Error('Injected delete access denial'); (e as any).code = 'EACCES'; throw e }
  await rm(target, { recursive: true, force: false })
}

class LearningSession {
  readonly name = 'ExerciseService-spike'
  readonly manager = new ProcessManager()
  readonly owner = `exercise:${randomUUID()}`
  workspace = ''; child: any; processHandle: any; rootPid = 0; stopping = false
  generation = 0; spawns = 0; cleanupTask?: Promise<void>; cleanupError: any
  denyDelete = false; terminal = false; record: any; stopCalls = 0
  constructor(readonly label: string) { sessions.push(this) }
  start() {} // No runtime probing during application initialization.
  async launch(phase = 'execute', script = 'setInterval(()=>{},1000)', options: any = {}) {
    if (this.stopping) throw Error('SHUTTING_DOWN')
    const generation = this.generation
    const root = join(runRoot, 'sessions'); await mkdir(root, { recursive: true })
    this.workspace = await mkdtemp(join(root, 'session-'))
    await writeFile(join(this.workspace, 'manifest.json'), JSON.stringify({ version: 1, sessionId: this.owner, phase, processClean: false }))
    const fixture = join(this.workspace, 'worker.cjs'); await writeFile(fixture, script)
    if (this.stopping || generation !== this.generation) throw Error('SHUTTING_DOWN')
    let child: any
    const remove = this.manager.register({ id: this.owner, ownerId: this.owner, close: async () => {
      await child?.close()
      if (child && !child.isReleased()) throw Error('NOT_RELEASED')
      remove()
    } })
    try {
      const adapter = new LearningAdapter(nativePath)
      // Transparent SPIKE observation seam. Delegate identical calls; do not alter spawn/cleanup.
      adapter.native = { capability: native.capability,
        createRun: (...args: any[]) => { const handle = native.createRun(...args); this.nativeSession = handle; return handle },
        control: (handle: any, operation: string) => {
          if (operation === 'release') this.membersBeforeRelease = native.jobMembers(handle)
          const result = native.control(handle, operation)
          this.observeNative?.(operation, result)
          return result
        } }
      child = adapter.create({ executable: options.executable ?? config.node, args: options.args ?? [fixture],
        cwd: options.cwd ?? this.workspace, environmentAdditions: {}, shell: false }, e => {
        if (e.type === 'exit') trace.push(`${this.label}:root-exit:${e.exitCode}`)
      })
      this.child = child; this.spawns++; this.rootPid = child.ownership.rootPid; this.processHandle = watch(this.rootPid)
      trace.push(`${this.label}:spawn:${phase}`)
      if (this.stopping) this.beginShutdown()
    } catch (e) { remove(); throw e }
    return this
  }
  beginShutdown() {
    this.stopping = true; this.generation++
    trace.push(`${this.label}:cancel`)
    // Non-throwing/non-awaiting lifecycle hook; keep the cleanup promise and error.
    void Promise.resolve().then(() => this.cleanup()).catch(e => { this.cleanupError = safeError(e) })
  }
  cleanup(): Promise<void> {
    if (this.terminal) return Promise.resolve()
    if (this.cleanupTask) return this.cleanupTask
    const task = (async () => {
      await this.manager.cleanupOwner(this.owner)
      if (this.manager.size !== 0) throw Error('OWNERSHIP_RETAINED')
      if (this.workspace) {
        if (this.processHandle && native.alive(this.processHandle)) throw Error('PROCESS_STILL_ALIVE')
        await writeFile(join(this.workspace, 'manifest.json'), JSON.stringify({ version: 1, sessionId: this.owner,
          processClean: true, cleanupPending: true }))
        await writeFile(`${this.workspace}.recovery.json`, JSON.stringify({ version: 1, sessionId: this.owner,
          processClean: true, cleanupPending: true }))
        await safeDelete(dirname(this.workspace), this.workspace, true, this.denyDelete)
        await rm(`${this.workspace}.recovery.json`, { force: false })
      }
      this.terminal = true; this.cleanupError = undefined; trace.push(`${this.label}:clean`)
    })()
    this.cleanupTask = task
    void task.finally(() => { if (this.cleanupTask === task) this.cleanupTask = undefined }).catch(() => {})
    return task
  }
  async stop() { this.stopCalls++; trace.push(`${this.label}:barrier`); this.stopping = true; await this.cleanup() }
}

function application(session: LearningSession, project: any, window?: any) {
  const events: string[] = [], service = (name: string) => ({ name, stop() { events.push(name) } })
  const win = window ?? service('WindowManager')
  const application = new DesktopApplication([session, service('ProjectDependency'), project, win], { shutdownLast: [win] })
  let stoppingEvents = 0
  application.subscribe(status => { if (status.state === 'STOPPING') { stoppingEvents++; session.beginShutdown() } })
  return { application, events, get stoppingEvents() { return stoppingEvents } }
}

async function suite() {
  await test('A: graceful IDE quit with running Exercise; Project order then Learning then Window', async r => {
    const s = new LearningSession('normal'); const order: string[] = []
    const p = { name: 'Project', stop() { order.push('project') } }
    const w = { name: 'WindowManager', stop() { order.push('window'); assert.equal(s.terminal, true) } }
    const h = application(s, p, w); await h.application.start(); await s.launch()
    let quits = 0
    const q = new ApplicationQuitCoordinator({ getApplication: () => h.application, requestApproval: async () => true,
      quit: () => { quits++ } })
    q.handleBeforeQuit({ preventDefault() {} }); q.handleBeforeQuit({ preventDefault() {} })
    await waitFor(() => quits === 1)
    assert.deepEqual(order, ['project', 'window']); assert.deepEqual(h.events, ['ProjectDependency'])
    assert.equal(h.application.getStatus().state, 'STOPPED'); assert.equal(s.manager.size, 0)
    assert.equal(native.alive(s.processHandle), false); await absent(s.workspace)
    r.order = [...order]; r.trace = trace.filter(t => t.startsWith('normal:')); r.stoppingEvents = h.stoppingEvents
    r.finalQuitCalls = quits
  })
  await test('A: Learning cleanup rejection does not block Project; retry without STOPPING replay', async r => {
    const s = new LearningSession('learning-failure'); let projectStops = 0, windowStops = 0
    const h = application(s, { name: 'Project', stop() { projectStops++ } },
      { name: 'WindowManager', stop() { windowStops++ } })
    await h.application.start(); await s.launch(); native.setFault(3)
    try {
      await assert.rejects(h.application.shutdown())
      assert.equal(projectStops, 1); assert.equal(windowStops, 0); assert.equal(s.manager.size, 1)
      assert.equal(h.application.getStatus().state, 'STOPPING'); assert.equal(native.alive(s.processHandle), true)
    } finally { native.setFault(0) }
    await h.application.shutdown(); assert.equal(projectStops, 1); assert.equal(windowStops, 1)
    assert.equal(h.stoppingEvents, 1); assert.equal(s.manager.size, 0)
    r.projectStops = projectStops; r.windowStops = windowStops; r.stoppingEvents = h.stoppingEvents
    r.trace = trace.filter(t => t.startsWith('learning-failure:'))
  })
  await test('A: Project rejects before Learning barrier; background cancellation still cleans', async r => {
    const s = new LearningSession('project-failure'); let attempt = 0
    const h = application(s, { name: 'Project', stop() { if (++attempt === 1) throw Error('Injected Project failure') } })
    await h.application.start(); await s.launch(); await assert.rejects(h.application.shutdown())
    await waitFor(() => s.terminal); assert.equal(s.stopCalls, 0); assert.equal(s.manager.size, 0)
    assert.equal(h.application.getStatus().state, 'STOPPING')
    await h.application.shutdown(); assert.equal(h.stoppingEvents, 1); assert.equal(attempt, 2)
    r.projectAttempts = attempt; r.stoppingEvents = h.stoppingEvents; r.backgroundCleanBeforeBarrier = true
  })
  await test('A: Project pending before Learning; background cleanup and shared shutdown promise', async r => {
    const s = new LearningSession('project-pending'); let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const h = application(s, { name: 'Project', stop() { return pending } })
    await h.application.start(); await s.launch(); const shutdown = h.application.shutdown()
    assert.equal(h.application.shutdown(), shutdown); await waitFor(() => s.terminal)
    assert.equal(s.stopCalls, 0); assert.equal(h.application.getStatus().state, 'STOPPING')
    release(); await shutdown; r.cleanedWhileProjectPending = true
  })
  await test('A: cancelled close approval does not cancel Exercise; later approved quit works', async r => {
    const s = new LearningSession('approval'); const h = application(s, { name: 'Project', stop() {} })
    await h.application.start(); await s.launch(); let approved = false, approvals = 0, quits = 0
    const q = new ApplicationQuitCoordinator({ getApplication: () => h.application,
      requestApproval: async () => { approvals++; return approved }, quit: () => { quits++ } })
    q.handleBeforeQuit({ preventDefault() {} }); await delay(50)
    assert.equal(s.stopping, false); assert.equal(native.alive(s.processHandle), true)
    assert.equal(h.application.getStatus().state, 'RUNNING')
    approved = true; q.handleBeforeQuit({ preventDefault() {} }); await waitFor(() => quits === 1)
    r.approvals = approvals; r.quits = quits
  })
  await test('A: concurrent cancellation/stop idempotent; no new spawn after shutdown', async r => {
    const s = new LearningSession('idempotent'); await s.launch(); s.beginShutdown(); s.beginShutdown()
    await Promise.all([s.stop(), s.stop(), s.cleanup()]); assert.equal(s.manager.size, 0)
    await assert.rejects(s.launch(), /SHUTTING_DOWN/); assert.equal(s.spawns, 1); r.spawns = s.spawns
  })
  for (const phase of ['prepare', 'compile', 'execute']) await test(`B: cancellation at ${phase} owned-process boundary`, async r => {
    const s = new LearningSession(`phase-${phase}`); await s.launch(phase)
    s.beginShutdown(); await s.cleanup(); assert.equal(native.alive(s.processHandle), false)
    assert.equal(s.manager.size, 0); await absent(s.workspace); r.pid = s.rootPid
    r.scope = 'Controlled long-running Node phase fixture; real C# compiler checked separately'
  })
  await test('B: real C# prepare/compile/execute cancellation using installed SDK10', async r => {
    const results: any[] = []
    for (const phase of ['prepare', 'compile', 'execute']) {
      const manager = new ProcessManager(), spike = new ExerciseSpike(join(runRoot, 'csharp'), nativePath, manager)
      let triggered = false
      const run = spike.run({ language: 'csharp', exercise: exercises[0],
        code: 'public class Solution { public int Sum(int a,int b) { while(true) {} } }',
        cases: [[1, 2]], node: config.node, dotnet: config.dotnet, sdk: config.sdk,
        onSpawn: (p, pid) => { if (p === phase) { triggered = true; watch(pid); void spike.stop().catch(() => {}) } } })
      await assert.rejects(run, (e: any) => e.reason === 'STOPPED')
      assert.equal(triggered, true); assert.equal(manager.size, 0); if (spike.workspace) await absent(spike.workspace)
      results.push({ phase, stopped: triggered, resources: manager.size })
    }
    r.phases = results
  })
  await test('B: infinite loop stopped by experimental timeout', async r => {
    const s = new LearningSession('timeout'); await s.launch('execute', 'while(true){}')
    const timer = setTimeout(() => s.beginShutdown(), 150)
    try { await waitFor(() => s.terminal); assert.equal(native.alive(s.processHandle), false) }
    finally { clearTimeout(timer) }
    r.experimentalTimeoutMs = 150
  })
  await test('B: root exited while descendant remains; Job-wide cancellation cleans child', async r => {
    const s = new LearningSession('descendant')
    const pidFile = join(runRoot, 'descendant.pid')
    const releaseRoot = join(runRoot, 'release-root')
    const childCode = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid)); setInterval(()=>{},1000)`
    await s.launch('execute', `const {spawn}=require('node:child_process'); const fs=require('node:fs');
      const p=spawn(${JSON.stringify(config.node)},['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore',windowsHide:true});
      p.once('error',()=>process.exit(2)); p.unref();
      setInterval(()=>{if(fs.existsSync(${JSON.stringify(releaseRoot)}))process.exit(0)},15);`)
    await waitFor(async () => { try { return (await readFile(pidFile, 'utf8')).length > 0 } catch { return false } })
    const pid = Number(await readFile(pidFile, 'utf8')), child = watch(pid)
    assert.equal(native.alive(s.processHandle), true); assert.equal(native.alive(child), true)
    const beforeMembers = native.jobMembers(s.nativeSession)
    assert.ok(beforeMembers.includes(s.rootPid)); assert.ok(beforeMembers.includes(pid))
    assert.equal(s.child.ownership.job.activeProcessCount(), beforeMembers.length)
    const extraProcesses = beforeMembers.filter((p: number) => p !== pid && p !== s.rootPid).map((p: number) => {
      const handle = watch(p), image = native.processImage(handle)
      return { pid: p, image, handle }
    })
    r.beforeRootExit = { root: s.rootPid, child: pid, members: beforeMembers,
      additionalProcesses: extraProcesses.map(({pid, image}: any) => ({pid, image})) }
    // Identify every additional process; do not ignore an unexplained Job member.
    for (const extra of extraProcesses) assert.match(extra.image, /\\(?:conhost|OpenConsole)\.exe$/i)
    await writeFile(releaseRoot, 'release only after child readiness and Job accounting')
    await waitFor(() => !native.alive(s.processHandle)); assert.equal(native.alive(child), true)
    const activeAfterRoot = s.child.ownership.job.activeProcessCount()
    const afterMembers = native.jobMembers(s.nativeSession)
    assert.ok(activeAfterRoot > 0); assert.equal(activeAfterRoot, afterMembers.length)
    assert.ok(afterMembers.includes(pid)); assert.equal(afterMembers.includes(s.rootPid), false)
    assert.equal(s.manager.size, 1)
    r.preCleanup = { rootExited: !native.alive(s.processHandle), childAlive: native.alive(child),
      learningJobActiveProcesses: activeAfterRoot, jobReleased: s.child.isReleased(),
      members: afterMembers, membershipEvidence: 'Direct QueryInformationJobObject on the owned Learning Job handle' }
    const originalPostCleanupAssertions = async () => {
      assert.equal(native.alive(child), false)
      r.root = s.rootPid; r.child = pid; r.retainedAfterRootExit = true
      assert.deepEqual(s.membersBeforeRelease, []); assert.equal(s.child.isReleased(), true)
      assert.equal(s.manager.size, 0); await absent(s.workspace)
      for (const extra of extraProcesses) assert.equal(native.alive(extra.handle), false)
      r.postCleanup = { childExited: !native.alive(child), membersBeforeRelease: s.membersBeforeRelease,
        released: s.child.isReleased(), resources: s.manager.size, workspaceAbsent: true, additionalProcessesExited: true }
    }
    if (!config.r4) { s.beginShutdown(); await s.cleanup(); await originalPostCleanupAssertions() }
    else {
      // R4: observers delegate unchanged operations and retain only existing process handles.
      // No Job handle is opened, duplicated or inherited; the existing nativeSession is observed only.
      const origin = performance.now(), deadline = origin + 12000
      const timeline: any[] = [], milestones: Record<string, number> = {}, lastAlive: Record<string, number> = {}
      const observedProcesses = [{ label: 'child', pid, handle: child },
        ...extraProcesses.map((p: any) => ({ ...p, label: `helper:${p.pid}` }))]
      let nativeReleased = false
      const stamp = (event: string, details: any = {}) => {
        const monotonicMs = performance.now(), offsetMs = monotonicMs - origin
        timeline.push({ event, monotonicMs, offsetMs, ...details })
        milestones[event] ??= offsetMs
      }
      const sample = (source: string) => {
        const states = observedProcesses.map(p => {
          const alive = native.alive(p.handle), label = p.label
          if (alive) lastAlive[label] = performance.now() - origin
          else if (!( `${label}:terminated` in milestones)) stamp(`${label}:terminated`,
            { pid: p.pid, lastObservedAliveOffsetMs: lastAlive[label] ?? null, source })
          return { label, pid: p.pid, alive }
        })
        stamp('sample', { source, states, nativeReleased, wrapperReleased: s.child.isReleased(), resources: s.manager.size })
        return states
      }
      s.observeNative = (operation: string, result: any) => {
        if (operation === 'terminate') stamp('native-terminate-returned')
        if (operation === 'count') {
          stamp('job-active-count', { active: result })
          if (result === 0) stamp('job-empty-observed')
        }
        if (operation === 'release') {
          nativeReleased = true
          stamp('native-job-released', { membersBeforeRelease: s.membersBeforeRelease })
        }
        sample(`native:${operation}`)
      }
      const originalManagerCleanup = s.manager.cleanupOwner.bind(s.manager)
      s.manager.cleanupOwner = (...args: any[]) => {
        const task = originalManagerCleanup(...args)
        void task.then(() => { stamp('manager-cleanup-resolved', { resources: s.manager.size });
          if (s.manager.size === 0) stamp('manager-zero'); sample('manager-resolve') },
        (e: any) => stamp('manager-cleanup-rejected', { error: safeError(e), resources: s.manager.size }))
        return task
      }
      const originalCleanup = s.cleanup.bind(s)
      s.cleanup = () => {
        if (!s.cleanupTask && !s.terminal) stamp('cleanup-start')
        const task = originalCleanup()
        void task.then(() => { stamp('cleanup-resolved'); sample('cleanup-resolve') },
          (e: any) => stamp('cleanup-rejected', { error: safeError(e) }))
        return task
      }
      sample('before-cleanup')
      let cleanupFailure: any, immediateFailure: any
      s.beginShutdown()
      try {
        await s.cleanup(); stamp('cleanup-await-returned'); sample('after-cleanup-await')
        // Same immediate acceptance, evaluated BEFORE passive observation; never replace failure with later success.
        try { await originalPostCleanupAssertions(); stamp('immediate-assertions-passed') }
        catch (e) { immediateFailure = e; stamp('immediate-assertions-failed', { error: safeError(e) }) }
      } catch (e) { cleanupFailure = e; stamp('cleanup-await-rejected', { error: safeError(e) }) }
      let states = sample('passive-start')
      while (states.some(p => p.alive) && performance.now() < deadline) {
        await delay() // Existing 15ms observation poll; not part of cleanup or acceptance.
        states = sample('passive-poll')
      }
      stamp('passive-finished', { allObservedTerminated: states.every(p => !p.alive),
        originalDeadlineMs: 12000, deadlineExceeded: performance.now() >= deadline })
      r.r4 = { clock: 'node:perf_hooks performance.now monotonic milliseconds', originMonotonicMs: origin,
        originalDeadlineMs: 12000, observationPollMs: 15, milestones, timeline,
        immediateAcceptance: immediateFailure ? { status: 'FAIL', error: safeError(immediateFailure) }
          : cleanupFailure ? { status: 'NOT_REACHED' } : { status: 'PASS' },
        processStatesAtEnd: states, nativeReleased, wrapperReleased: s.child.isReleased(), resources: s.manager.size,
        membersBeforeRelease: s.membersBeforeRelease, workspaceAbsent: false,
        jobHandleOpenedOrDuplicatedByObserver: false }
      try { await access(s.workspace) } catch (e) { if ((e as any).code === 'ENOENT') r.r4.workspaceAbsent = true }
      // Persist after recording but before propagating the unchanged immediate failure.
      if (cleanupFailure) throw cleanupFailure
      if (immediateFailure) throw immediateFailure
    }
  })
  for (const [fault, label] of [[1, 'Job creation'], [2, 'spawn']]) await test(`B: injected native ${label} failure is fail-closed`, async r => {
    const s = new LearningSession(`fault-${fault}`); native.setFault(fault)
    try { await assert.rejects(s.launch()); assert.equal(s.manager.size, 0); assert.equal(s.spawns, 0) }
    finally { native.setFault(0); await s.cleanup() }
    r.injection = 'Native test fault before OS call; not a naturally occurring WinAPI error'
  })
  for (const [fault, label] of [[3, 'terminate'], [4, 'release']]) await test(`B: injected native ${label} retains ownership and retries`, async r => {
    const s = new LearningSession(`fault-${fault}`); await s.launch(); native.setFault(fault)
    try { await assert.rejects(s.cleanup()); assert.equal(s.manager.size, 1); assert.equal(s.terminal, false); await access(s.workspace) }
    finally { native.setFault(0) }
    await s.cleanup(); assert.equal(s.manager.size, 0); assert.equal(s.child.isReleased(), true)
    r.injection = 'Native test fault at operation boundary'; r.resourcesAfterRetry = s.manager.size
  })
  for (const event of ['reload', 'navigation', 'renderer-crash', 'destroyed']) await test(`C: Electron ${event} revokes owner and suppresses stale result`, async r => {
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
    await window.loadURL('data:text/html,<title>Exercise fixture</title>')
    const s = new LearningSession(event); await s.launch(); const documentGeneration = s.generation
    let invalidated = 0, delivered = 0
    const invalidate = () => { invalidated++; s.beginShutdown() }
    const navigate = (_: any, _url: string, inPlace: boolean, mainFrame: boolean) => { if (!inPlace && mainFrame) invalidate() }
    window.webContents.on('did-start-navigation', navigate)
    window.webContents.on('render-process-gone', invalidate)
    window.webContents.once('destroyed', invalidate)
    if (event === 'reload') window.webContents.reload()
    if (event === 'navigation') await window.loadURL('data:text/html,<title>New document</title>')
    if (event === 'renderer-crash') window.webContents.forcefullyCrashRenderer()
    if (event === 'destroyed') window.destroy()
    await waitFor(() => s.terminal)
    if (s.generation === documentGeneration && !s.stopping) delivered++
    assert.equal(delivered, 0); assert.ok(invalidated > 0); assert.equal(native.alive(s.processHandle), false)
    if (!window.isDestroyed()) window.destroy()
    r.events = invalidated; r.staleResultsDelivered = delivered
  })
  await test('D: locked workspace retained after process cleanup; restart recovery and stale manifest PID ignored', async r => {
    const s = new LearningSession('locked'); await s.launch()
    const lockedPath = join(s.workspace, 'locked.txt'); await writeFile(lockedPath, 'locked fixture')
    const lock = native.lockFile(lockedPath)
    try { await assert.rejects(s.cleanup()); assert.equal(s.manager.size, 0); assert.equal(native.alive(s.processHandle), false)
      const manifest = JSON.parse(await readFile(`${s.workspace}.recovery.json`, 'utf8'))
      assert.equal(manifest.processClean, true); assert.equal(manifest.cleanupPending, true)
    } finally { native.closeHandle(lock) }
    // A fresh recovery instance only accepts a verified process-clean marker. PID is data, never authority.
    const sentinel = new LearningSession('recovery-sentinel'); await sentinel.launch()
    await writeFile(`${s.workspace}.recovery.json`, JSON.stringify({ version: 1, processClean: true,
      cleanupPending: true, pid: sentinel.rootPid }))
    await recoverWorkspace(dirname(s.workspace), s.workspace)
    s.terminal = true
    assert.equal(native.alive(sentinel.processHandle), true); await absent(s.workspace); await sentinel.cleanup()
    r.recoveryIgnoredManifestPid = true; r.lock = 'Real Windows handle without FILE_SHARE_DELETE'
  })
  await test('D: injected EACCES records recovery but still rejects shutdown; retry succeeds', async r => {
    const s = new LearningSession('denied'); const h = application(s, { name: 'Project', stop() {} })
    await h.application.start(); await s.launch(); s.denyDelete = true
    await assert.rejects(h.application.shutdown()); assert.equal(h.application.getStatus().state, 'STOPPING')
    assert.equal(s.manager.size, 0); await access(`${s.workspace}.recovery.json`)
    s.denyDelete = false; await h.application.shutdown(); r.policy = 'No exit-on-orphan policy change'
  })
  await test('D: containment and nested junction fail closed; external file preserved', async r => {
    const base = join(runRoot, 'reparse'); await mkdir(base)
    const outside = join(runRoot, 'outside'); await mkdir(outside); const sentinel = join(outside, 'keep.txt')
    await writeFile(sentinel, 'preserve'); await assert.rejects(safeDelete(base, outside, true), /UNSAFE_CONTAINMENT/)
    const inside = await mkdtemp(join(base, 'session-')); await symlink(outside, join(inside, 'link'), 'junction')
    await assert.rejects(safeDelete(base, inside, true), /REPARSE_POINT/)
    assert.equal(await readFile(sentinel, 'utf8'), 'preserve')
    // Unlink the owned junction itself; never traverse it.
    await rm(join(inside, 'link')); await safeDelete(base, inside, true)
    r.externalFilePreserved = true
  })
  await test('D: recovery refuses unproven process state and active workspace', async r => {
    const base = join(runRoot, 'recovery'); await mkdir(base); const workspace = await mkdtemp(join(base, 'session-'))
    await writeFile(`${workspace}.recovery.json`, JSON.stringify({ version: 1, processClean: false, pid: process.pid }))
    await assert.rejects(recoverWorkspace(base, workspace), /QUARANTINED/); await access(workspace)
    r.unknownCrashWorkspace = 'retained, not guessed safe by PID or age'
  })
  await test('E: production RunService and TerminalService remain live through Learning cancellation/failure', projectIsolation)
}

async function recoverWorkspace(root: string, workspace: string) {
  if (dirname(resolve(workspace)) !== resolve(root)) throw Error('UNSAFE_CONTAINMENT')
  const info = await lstat(workspace); if (info.isSymbolicLink()) throw Error('REPARSE_POINT')
  const m = JSON.parse(await readFile(`${workspace}.recovery.json`, 'utf8'))
  if (m.version !== 1 || m.processClean !== true || m.cleanupPending !== true) throw Error('QUARANTINED')
  await safeDelete(root, workspace, true)
  await rm(`${workspace}.recovery.json`)
}

async function projectIsolation(r: any) {
  const root = join(runRoot, 'project-fixture'); await mkdir(root)
  await writeFile(join(root, 'live.js'), 'setInterval(()=>console.log("project-live"),150)')
  const projects = new ProjectService(), project = await projects.openRoot(root), manager = new ProcessManager()
  const runEvents: any[] = [], terminalEvents: any[] = []
  const adapter = new ProjectAdapter(join(config.root, 'out/main/native/run-process.node'))
  const run = new RunService({ authorize: async request => ({ projectId: project.id,
    relativePath: request.relativePath, canonicalRoot: root, canonicalFile: join(root, request.relativePath) }),
  resolveRuntime: async () => ({ executable: config.node }) }, { adapter, manager,
    onEvent: (_owner, e) => runEvents.push(e), onEventSinkError() {} })
  const terminal = new TerminalService({ ptyPort: new NodePtyPort(), projectService: projects, processManager: manager,
    processTreeTerminator: new WindowsProcessTreeTerminator(), shellResolver: { resolve: async () => ({
      executable: join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      args: ['-NoLogo', '-NoProfile'], shellLabel: 'Windows PowerShell' }) }, publish: (_owner, e) => terminalEvents.push(e) })
  terminal.start(); let runSession: any, term: any
  try {
    runSession = await run.startRun({ projectId: project.id, relativePath: 'live.js', dirty: false }, 77)
    term = await terminal.create({ projectId: project.id, cols: 80, rows: 24 }, { ownerWebContentsId: 77, projectId: project.id })
    await waitFor(() => runEvents.some(e => e.type === 'stdout'))
    const before = manager.size
    const s = new LearningSession('isolation'); await s.launch(); native.setFault(3)
    try { await assert.rejects(s.cleanup()); assert.equal(s.manager.size, 1); assert.equal(manager.size, before) }
    finally { native.setFault(0) }
    s.beginShutdown(); await s.cleanup()
    assert.equal(run.getSession(runSession.sessionId, 77).state, 'RUNNING')
    assert.equal(terminal.getSessionSnapshot(term.sessionId)?.state, 'RUNNING')
    const count = runEvents.filter(e => e.type === 'stdout').length
    await terminal.input({ sessionId: term.sessionId, data: "Write-Output ('terminal-'+'still-live')\r" }, { ownerWebContentsId: 77, projectId: project.id })
    await waitFor(() => terminalEvents.filter(e => e.type === 'data').map(e => e.data).join('').includes('terminal-still-live'))
    await waitFor(() => runEvents.filter(e => e.type === 'stdout').length > count)
    assert.equal(await readFile(join(root, 'live.js'), 'utf8'), 'setInterval(()=>console.log("project-live"),150)')
    r.projectManagerResources = before; r.runState = 'RUNNING'; r.terminalState = 'RUNNING'; r.terminalInputAfterCancel = true
  } finally { native.setFault(0); await run.stop(); await terminal.stop(); await manager.stop(); await projects.stop() }
}

async function crashHost(phase: string) {
  const s = new LearningSession(`crash-${phase}`)
  await s.launch(phase, 'setInterval(()=>{},1000)')
  writeFileSync(join(output, `ready-${mode}.json`), JSON.stringify({ host: process.pid, pid: s.rootPid,
    workspace: s.workspace, phase, runRoot, childReady: true }))
  // Wait for external verifier to retain process handles and terminate only this test host.
  await new Promise(() => {})
}

async function main() {
await mkdir(runRoot, { recursive: true })
await app.whenReady()
// Hidden test windows may be destroyed/reloaded; do not let window-all-closed end the suite.
app.on('window-all-closed', () => {})
let failed = false
try {
  assert.ok(process.versions.electron); assert.equal(process.type, 'browser')
  if (mode.startsWith('crash-')) await crashHost(mode.slice(6))
  else { await suite(); persist() }
} catch (e) { failed = true; console.error(safeError(e)); persist() }
finally {
  native.setFault(0)
  for (const s of sessions) await s.cleanup().catch(e => { console.error('Safety cleanup:', safeError(e)) })
  for (const h of handles) native.closeHandle(h)
  if (!mode.startsWith('crash-')) app.exit(failed ? 1 : 0)
}
}
void main().catch(e => { console.error(safeError(e)); app.exit(1) })
