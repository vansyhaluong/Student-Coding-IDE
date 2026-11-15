// @ts-nocheck -- Independent staged Learning experiment; never imported by production.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { WindowsPipedProcessAdapter } from '../exercise-runtime-9d0/windows-spike-adapter'
import { acknowledge, recordPaths, identity, failure, ranks } from './policy-b-checkpoint'
import { safeRemove } from './policy-b-recovery'
export { safeRemove } from './policy-b-recovery'
export const pause = (ms = 15) => new Promise(r => setTimeout(r, ms))
export async function until(check, deadlineMs = 12000) {
  const deadline = performance.now() + deadlineMs
  while (performance.now() < deadline) { if (await check()) return; await pause() }
  throw Error('Observation deadline exceeded')
}
export class PolicySession {
  name = 'PolicyBExercise-staged-spike'; manager = new ProcessManager()
  sessionId = randomUUID(); hostEpoch = randomUUID(); records = new Map(); log = []; started = performance.now()
  sealed = false; released = false; processClean = false; cleanupComplete = false; finalized = false
  disposition = null; proof = null; nativeStage = 'OWNED'; persistenceStage = 'PENDING'; workspaceState = 'RETAINED'
  faults = {}; hooks = {}; capturesEnabled = true; coverageGaps = []; queryError = null
  timer = null; child = null; handle = null; task = null; rootPid = 0; output = ''; exitCode = null; phase = ''
  checkpoint = null; checkpointPayloads = new Map(); lease = null; lastError = null; stopCalls = 0; generation = 0
  counters = { spawn: 0, query: 0, terminate: 0, release: 0, handlesClosed: 0, delete: 0 }
  constructor(root, nativePath, environment = process.env) {
    this.root = resolve(root); this.nativePath = nativePath; this.environment = environment
    this.native = createRequire(__filename)(nativePath); this.owner = `exercise:${this.sessionId}`
    Object.assign(this, recordPaths(this.root, this.sessionId))
  }
  mark(event, extra = {}) { this.log.push({ event, monotonicMs: performance.now(), elapsedMs: performance.now() - this.started, ...extra }) }
  async prepare() {
    for (const dir of ['sessions', 'dispositions', 'leases']) await mkdir(join(this.root, dir), { recursive: true })
    this.lease = this.native.acquireLease(this.leasePath)
    if (!this.lease) throw failure('OWNERSHIP', 'Session lease unavailable')
    await mkdir(this.workspace); this.workspaceIdentity = await identity(this.workspace)
    await writeFile(join(this.workspace, 'manifest.json'), JSON.stringify({ schemaVersion: 2, owner: this.owner, processClean: false }))
    await this.persist('OWNED'); return this
  }
  async launch(executable, args, phase = 'execute') {
    if (this.sealed) throw Error('ADMISSION_CLOSED')
    if (this.child || this.handle) throw Error('Session already launched')
    this.phase = phase
    const adapter = new WindowsPipedProcessAdapter(this.nativePath, this.environment)
    adapter.native = { capability: this.native.capability,
      createRun: (...input) => { const handle = this.native.createRun(...input); this.handle = handle; return handle },
      control: (handle, operation) => {
        if (this.released) throw failure('NATIVE', 'Operation on released Job prohibited')
        if (operation === 'terminate') this.counters.terminate++
        if (operation === 'release') { this.counters.release++; this.beforeRelease = this.native.jobMembers(handle); this.mark('native-release-start', { members: this.beforeRelease }) }
        const result = this.native.control(handle, operation)
        if (operation === 'release') this.mark('native-released')
        return result
      } }
    const unregister = this.manager.register({ id: this.owner, ownerId: this.owner, close: () => this.finishProcess() })
    try {
      this.child = adapter.create({ executable, args, cwd: this.workspace, environmentAdditions: {}, shell: false }, event => {
        if (event.type === 'stdout' || event.type === 'stderr') this.output += event.data
        if (event.type === 'exit') { this.exitCode = event.exitCode; this.mark('root-exit', { code: event.exitCode }) }
        if (event.type === 'error') this.queryError = failure('PROCESS', 'Native observer error')
      })
    } catch (e) {
      // No returned session: createRun's native rollback owns partial allocations.
      if (!this.handle) { unregister(); this.launchFailed = true; this.mark('launch-rejected-before-session', { error: e.message }) }
      throw e
    }
    this.counters.spawn++; this.rootPid = this.child.ownership.rootPid
    this.capture(this.rootPid, true); this.scan()
    this.timer = setInterval(() => { try { if (!this.released && this.capturesEnabled) this.scan() } catch (e) { this.queryError = e } }, 15)
    this.mark('launched', { rootPid: this.rootPid, phase, executable }); return this
  }
  capture(pid, root = false) {
    if ([...this.records.values()].some(r => r.pid === pid && this.native.waitState(r.handle) === 'PENDING')) return
    let handle
    try {
      handle = this.native.watch(pid)
      const id = this.native.memberIdentity(this.handle, handle)
      if (!id.member) {
        this.native.closeHandle(handle); handle = null
        if (root) throw failure('OWNERSHIP', 'Root no longer associated at capture')
        this.coverageGaps.push({ pid, reason: 'no-longer-member' }); return
      }
      const key = `${id.pid}:${id.created}`
      if (this.records.has(key)) { this.native.closeHandle(handle); return }
      this.records.set(key, { ...id, handle, root, image: this.native.processImage(handle), signaled: false, closed: false })
      this.mark('handle-retained', { pid, key, root })
    } catch (e) {
      if (handle) this.native.closeHandle(handle)
      if (!root && !this.native.jobMembers(this.handle).includes(pid)) { this.coverageGaps.push({ pid, reason: 'vanished-before-capture' }); return }
      throw e
    }
  }
  query() {
    if (this.released || this.nativeStage !== 'OWNED') throw failure('NATIVE', 'Released Job must not be queried')
    this.counters.query++
    if (this.faults.query) throw failure('PROCESS', 'Injected current Job query failure')
    if (this.faults.ownership) throw failure('OWNERSHIP', 'Injected ownership failure')
    if (!this.handle || this.child.isReleased()) throw failure('OWNERSHIP', 'Invalid Job ownership')
    const members = this.native.jobMembers(this.handle), accounting = this.native.accounting(this.handle)
    this.mark('job-snapshot', { members, accounting }); return { members, accounting }
  }
  scan() {
    const q = this.query()
    for (const pid of q.members) if (this.capturesEnabled) this.capture(pid)
    for (const r of this.records.values()) if (!r.closed && this.native.waitState(r.handle) === 'SIGNALED' && !r.signaled) {
      r.signaled = true; this.mark('handle-signaled', { pid: r.pid, created: r.created })
    }
    return q
  }
  baseRecord(checkpoint) {
    const finalized = checkpoint === 'FINALIZED' || checkpoint === 'CLEANUP_COMPLETE', verified = this.proof?.kind === 'VERIFIED'
    return { schemaVersion: 2, sessionId: this.sessionId, owner: this.owner, hostEpoch: this.hostEpoch,
      root: this.root, workspace: this.workspace, workspaceIdentity: this.workspaceIdentity,
      checkpoint, revision: ranks[checkpoint], proof: this.proof, finalized,
      nativeStage: finalized ? 'HANDLES_CLOSED' : 'OWNED', processClean: finalized && verified,
      cleanupComplete: checkpoint === 'CLEANUP_COMPLETE',
      workspaceState: this.proof?.kind === 'HISTORY_UNVERIFIED' ? 'QUARANTINED' : checkpoint === 'CLEANUP_COMPLETE' ? 'REMOVED' : finalized ? 'DELETE_PENDING' : 'RETAINED' }
  }
  async persist(checkpoint) {
    if (!this.checkpointPayloads.has(checkpoint)) this.checkpointPayloads.set(checkpoint, this.baseRecord(checkpoint))
    this.persistenceStage = 'PENDING'
    await acknowledge(this.recordPath, this.checkpointPayloads.get(checkpoint), (phase, point) => {
      if (this.faults.persistence === phase && (this.faults.persistencePoint ?? 'before-write') === point) throw failure('PERSISTENCE', `Injected ${phase} ${point} failure`)
    })
    this.checkpoint = checkpoint; this.persistenceStage = 'ACKNOWLEDGED'; this.mark('checkpoint-acknowledged', { checkpoint })
  }
  beginShutdown() {
    if (!this.sealed) { this.sealed = true; this.generation++; this.mark('admission-closed') }
    this.backgroundTask = this.close()
    void this.backgroundTask.catch(e => { this.lastError ??= { kind: e.kind ?? 'PROCESS', message: e.message } })
  }
  start() {}
  async stop() { this.stopCalls++; await this.close() }
  close(deadlineMs = 12000) {
    this.sealed = true
    if (this.task) return this.task
    if (this.finalized) return Promise.resolve(this.summary())
    this.deadline = performance.now() + deadlineMs
    const task = (async () => {
      try {
        if (this.manager.size) await this.manager.cleanupOwner(this.owner)
        if (this.launchFailed) { this.closeLease(); return this.summary() }
        if (this.checkpoint !== 'FINALIZED' && this.checkpoint !== 'CLEANUP_COMPLETE') throw failure('PERSISTENCE', 'Finalized record missing')
        if (this.proof.kind === 'VERIFIED') {
          this.processClean = true; this.workspaceState = 'DELETE_PENDING'; this.counters.delete++
          await safeRemove(join(this.root, 'sessions'), this.workspace, this.workspaceIdentity, this.faults.delete)
          this.workspaceState = 'REMOVED'; await this.persist('CLEANUP_COMPLETE')
          this.cleanupComplete = true; this.mark('CLEANUP_COMPLETE')
        } else { this.workspaceState = 'QUARANTINED'; this.mark('SERVICE_FINALIZED_WITH_HISTORY_UNVERIFIED') }
        this.disposition = this.proof.kind === 'VERIFIED' ? 'CLEAN' : 'HISTORY_UNVERIFIED'
        this.finalized = true; this.lastError = null; this.closeLease(); return this.summary()
      } catch (e) {
        let cause = e
        while (cause instanceof AggregateError && cause.errors.length) cause = cause.errors[0]
        const kind = cause.kind ?? 'PROCESS'; this.lastError = { kind, message: cause.message }
        if (kind !== 'PERSISTENCE' && kind !== 'WORKSPACE') this.disposition = 'PROCESS_UNRESOLVED'
        this.mark('cleanup-rejected', { kind, message: e.message, resources: this.manager.size }); throw e
      }
    })()
    this.task = task; void task.finally(() => { if (this.task === task) this.task = null }).catch(() => {})
    return task
  }
  async verifyTermination() {
    if (this.queryError) throw this.queryError
    this.scan()
    if (!this.faults.skipTerminate) { this.child.ownership.job.terminate(); this.mark('terminate-returned') }
    while (true) {
      const q = this.scan()
      if ([...this.records.values()].every(r => r.signaled) && !q.members.length && !q.accounting.activeProcesses) break
      if (performance.now() >= this.deadline) throw failure('PROCESS', 'Process termination evidence deadline')
      await pause()
    }
    let settled = false; void this.child.settled.then(() => { settled = true })
    while (!settled) { if (performance.now() >= this.deadline) throw failure('PROCESS', 'Observer settlement deadline'); await pause() }
    const q = this.revalidate(); this.finalAccounting = q.accounting
    const kind = this.coverageGaps.length || q.accounting.totalProcesses !== this.records.size ? 'HISTORY_UNVERIFIED' : 'VERIFIED'
    this.proof = { kind, allRetainedSignaled: true, jobEmpty: true, observerSettled: true, unresolvedErrors: 0,
      retained: [...this.records.values()].map(({ handle, ...r }) => r), accounting: q.accounting, coverageGaps: [...this.coverageGaps] }
    this.disposition = kind === 'VERIFIED' ? 'CLEAN' : 'HISTORY_UNVERIFIED'
    this.mark(kind === 'VERIFIED' ? 'TERMINATION_VERIFIED' : 'HISTORY_UNVERIFIED')
  }
  revalidate() {
    if (this.queryError) throw this.queryError
    const q = this.scan()
    if (q.members.length || q.accounting.activeProcesses || ![...this.records.values()].every(r => this.native.waitState(r.handle) === 'SIGNALED')) throw failure('PROCESS', 'Termination evidence changed')
    return q
  }
  async finishProcess() {
    this.mark('cleanup-stage-entry', { nativeStage: this.nativeStage })
    if (this.nativeStage === 'OWNED') {
      if (!this.proof) await this.verifyTermination()
      await this.persist('RELEASE_READY'); this.revalidate()
      clearInterval(this.timer); this.timer = null
      try { this.child.ownership.job.release() } catch (e) { throw Object.assign(e, { kind: 'NATIVE' }) }
      this.released = true; this.nativeStage = 'JOB_RELEASED'
      if (this.hooks.afterRelease) await this.hooks.afterRelease()
    }
    if (this.nativeStage === 'JOB_RELEASED') {
      for (const r of this.records.values()) if (!r.closed) {
        if (this.native.waitState(r.handle) !== 'SIGNALED') throw failure('NATIVE', 'Retained handle not terminated')
        this.native.closeHandle(r.handle); r.closed = true; this.counters.handlesClosed++
      }
      this.nativeStage = 'HANDLES_CLOSED'; this.mark('observed-handles-closed')
    }
    await this.persist('FINALIZED')
    if (this.proof.kind === 'VERIFIED') { this.processClean = true; this.mark('PROCESS_CLEAN') }
  }
  closeLease() { if (this.lease) { this.native.closeHandle(this.lease); this.lease = null; this.mark('lease-released') } }
  summary() { return { owner: this.owner, sessionId: this.sessionId, workspace: this.workspace, recordPath: this.recordPath,
    disposition: this.disposition, proof: this.proof, nativeStage: this.nativeStage, persistenceStage: this.persistenceStage,
    workspaceState: this.workspaceState, checkpoint: this.checkpoint, lastError: this.lastError,
    processClean: this.processClean, cleanupComplete: this.cleanupComplete, finalized: this.finalized,
    released: this.released, managerResources: this.manager.size, counters: { ...this.counters },
    phase: this.phase, rootPid: this.rootPid, accounting: this.finalAccounting,
    retained: [...this.records.values()].map(({ handle, ...r }) => r), coverageGaps: this.coverageGaps,
    output: this.output.slice(0, 4096), exitCode: this.exitCode, timeline: [...this.log] } }
  async safety() {
    clearInterval(this.timer); this.timer = null; this.native.setFault(0)
    if (!this.released && this.child) {
      this.child.ownership.job.terminate(); await this.child.settled
      await until(() => [...this.records.values()].every(r => r.closed || this.native.waitState(r.handle) === 'SIGNALED'))
      if (this.child.ownership.job.activeProcessCount() !== 0) throw Error('Safety Job not empty')
      this.child.ownership.job.release(); this.released = true; this.nativeStage = 'JOB_RELEASED'
    }
    for (const r of this.records.values()) if (!r.closed) { this.native.closeHandle(r.handle); r.closed = true }
    this.closeLease()
    // Separate test containment fallback; never a successful policy result or workspace deletion.
  }
}
