// @ts-nocheck -- Independent experiment, never imported by production.
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile, readFile, open, rename, lstat, readdir, rm } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { WindowsPipedProcessAdapter } from '../exercise-runtime-9d0/windows-spike-adapter'

export const pause = (ms = 15) => new Promise(r => setTimeout(r, ms))
export async function until(check, deadlineMs = 12000) {
  const deadline = performance.now() + deadlineMs
  while (performance.now() < deadline) { if (await check()) return; await pause() }
  throw Error('Observation deadline exceeded')
}
export class PolicySession {
  name = 'PolicyBExercise-spike'; manager = new ProcessManager(); owner = `exercise:${randomUUID()}`
  records = new Map(); log = []; started = performance.now(); sealed = false; released = false
  processClean = false; cleanupComplete = false; disposition = null; faults = {}; capturesEnabled = true
  coverageGaps = []; queryError = null; timer = null; child = null; handle = null; task = null
  rootPid = 0; output = ''; exitCode = null; phase = ''; workspace = ''; recordPath = ''
  constructor(root, nativePath, environment = process.env) {
    this.root = resolve(root); this.nativePath = nativePath; this.environment = environment
    this.native = createRequire(__filename)(nativePath)
  }
  mark(event, extra = {}) { this.log.push({ event, monotonicMs: performance.now(), elapsedMs: performance.now() - this.started, ...extra }) }
  async prepare() {
    await mkdir(join(this.root, 'sessions'), { recursive: true }); await mkdir(join(this.root, 'dispositions'), { recursive: true })
    this.workspace = await mkdtemp(join(this.root, 'sessions/session-'))
    this.recordPath = join(this.root, 'dispositions', `${this.owner.slice(9)}.json`)
    await writeFile(join(this.workspace, 'manifest.json'), JSON.stringify({ owner: this.owner, processClean: false }))
    return this
  }
  async launch(executable, args, phase = 'execute') {
    if (this.sealed) throw Error('ADMISSION_CLOSED')
    this.phase = phase
    const adapter = new WindowsPipedProcessAdapter(this.nativePath, this.environment)
    adapter.native = { capability: this.native.capability,
      createRun: (...input) => { const handle = this.native.createRun(...input); this.handle = handle; return handle },
      control: (handle, operation) => {
        if (operation === 'release') { this.beforeRelease = this.native.jobMembers(handle); this.mark('native-release-start', { members: this.beforeRelease }) }
        const result = this.native.control(handle, operation)
        if (operation === 'release') this.mark('native-released')
        return result
      } }
    this.manager.register({ id: this.owner, ownerId: this.owner, close: () => this.finishProcess() })
    this.child = adapter.create({ executable, args, cwd: this.workspace, environmentAdditions: {}, shell: false }, event => {
      if (event.type === 'stdout' || event.type === 'stderr') this.output += event.data
      if (event.type === 'exit') { this.exitCode = event.exitCode; this.mark('root-exit', { code: event.exitCode }) }
      if (event.type === 'error') this.queryError = Error('Native observer error')
    })
    this.rootPid = this.child.ownership.rootPid
    this.capture(this.rootPid, true)
    this.scan()
    this.timer = setInterval(() => { try { if (!this.released && this.capturesEnabled) this.scan() } catch (e) { this.queryError = e } }, 15)
    this.mark('launched', { rootPid: this.rootPid, phase, executable })
    return this
  }
  capture(pid, root = false) {
    if ([...this.records.values()].some(r => r.pid === pid && this.native.waitState(r.handle) === 'PENDING')) return
    let handle
    try {
      handle = this.native.watch(pid)
      const identity = this.native.memberIdentity(this.handle, handle)
      if (!identity.member && !root) { this.native.closeHandle(handle); this.coverageGaps.push({ pid, reason: 'no-longer-member' }); return }
      const key = `${identity.pid}:${identity.created}`
      if (this.records.has(key)) { this.native.closeHandle(handle); return }
      this.records.set(key, { ...identity, handle, root, image: this.native.processImage(handle), signaled: false })
      this.mark('handle-retained', { pid, key, root })
    } catch (e) {
      if (handle) this.native.closeHandle(handle)
      // A vanished historical member is a gap only after a successful requery excludes it.
      if (!root && !this.native.jobMembers(this.handle).includes(pid)) { this.coverageGaps.push({ pid, reason: 'vanished-before-capture' }); return }
      throw e
    }
  }
  query() {
    if (this.faults.query) throw Error('Injected current Job query failure')
    if (this.faults.ownership) throw Error('Injected ownership failure')
    if (!this.handle || this.released || this.child.isReleased()) throw Error('Invalid Job ownership')
    const members = this.native.jobMembers(this.handle), accounting = this.native.accounting(this.handle)
    this.mark('job-snapshot', { members, accounting })
    return { members, accounting }
  }
  scan() {
    const q = this.query()
    for (const pid of q.members) if (this.capturesEnabled) this.capture(pid)
    for (const record of this.records.values()) {
      const state = this.native.waitState(record.handle)
      if (state === 'SIGNALED' && !record.signaled) { record.signaled = true; this.mark('handle-signaled', { pid: record.pid, created: record.created }) }
    }
    return q
  }
  close(deadlineMs = 12000) {
    this.sealed = true
    if (this.task) return this.task
    this.deadline = performance.now() + deadlineMs
    const task = this.manager.cleanupOwner(this.owner).then(async () => {
      if (this.manager.size !== 0) throw Error('Manager retained resource')
      if (this.disposition === 'CLEAN') {
        if (!this.processClean) throw Error('Missing process-clean proof')
        await safeRemove(join(this.root, 'sessions'), this.workspace)
        this.cleanupComplete = true; this.mark('CLEANUP_COMPLETE')
      } else if (this.disposition === 'HISTORY_UNVERIFIED') {
        if (this.processClean || this.cleanupComplete) throw Error('Historical gap mislabeled clean')
        this.mark('SERVICE_FINALIZED_WITH_HISTORY_UNVERIFIED')
      } else throw Error('Unresolved process cannot finalize service')
      return this.summary()
    })
    this.task = task
    void task.finally(() => { if (this.task === task) this.task = null }).catch(() => {})
    return task
  }
  async finishProcess() {
    this.mark('cleanup-start')
    try {
      if (this.queryError) throw this.queryError
      let q = this.scan()
      if (!this.faults.skipTerminate) { this.child.ownership.job.terminate(); this.mark('terminate-returned') }
      while (true) {
        q = this.scan()
        const allSignaled = [...this.records.values()].every(r => r.signaled)
        if (allSignaled && q.members.length === 0 && q.accounting.activeProcesses === 0) break
        if (performance.now() >= this.deadline) throw Error('Process termination evidence deadline')
        await pause()
      }
      // EOF/settled is required independently; deadline does not become an extra wait per handle.
      let settled = false
      void this.child.settled.then(() => { settled = true })
      while (!settled) { if (performance.now() >= this.deadline) throw Error('Observer settlement deadline'); await pause() }
      q = this.scan()
      if (q.members.length || q.accounting.activeProcesses || ![...this.records.values()].every(r => this.native.waitState(r.handle) === 'SIGNALED')) throw Error('Termination evidence changed')
      this.finalAccounting = q.accounting
      this.disposition = this.coverageGaps.length || q.accounting.totalProcesses !== this.records.size ? 'HISTORY_UNVERIFIED' : 'CLEAN'
      if (this.disposition === 'CLEAN') this.mark('TERMINATION_VERIFIED')
      this.mark('classification', { disposition: this.disposition, records: this.records.size, accounting: q.accounting })
      if (this.disposition === 'HISTORY_UNVERIFIED') await this.persistDisposition(false)
      clearInterval(this.timer); this.timer = null
      this.child.ownership.job.release(); this.released = true
      if (this.disposition === 'HISTORY_UNVERIFIED') await this.persistDisposition(true)
      else { this.processClean = true; this.mark('PROCESS_CLEAN') }
      for (const r of this.records.values()) this.native.closeHandle(r.handle)
      this.mark('observed-handles-closed')
    } catch (e) {
      this.disposition = 'PROCESS_UNRESOLVED'; this.mark('PROCESS_UNRESOLVED', { error: String(e.message), resources: this.manager.size })
      throw e
    }
  }
  async persistDisposition(finalized) {
    if (this.faults.record) throw Error('Injected disposition write failure')
    const record = { schemaVersion: 1, disposition: 'HISTORY_UNVERIFIED', finalized,
      processClean: false, cleanupComplete: false, workspace: this.workspace, owner: this.owner,
      rootPid: this.rootPid, accounting: this.finalAccounting, records: this.records.size,
      coverageGaps: this.coverageGaps, knownHandlesSignaled: true, jobEmpty: true }
    const temporary = `${this.recordPath}.${randomUUID()}.tmp`
    const file = await open(temporary, 'wx')
    try { await file.writeFile(JSON.stringify(record, null, 2)); await file.sync() } finally { await file.close() }
    await rename(temporary, this.recordPath)
    const written = JSON.parse(await readFile(this.recordPath, 'utf8'))
    if (written.finalized !== finalized) throw Error('Disposition read-back mismatch')
    this.mark('disposition-persisted', { finalized, recordPath: this.recordPath })
  }
  summary() { return { owner: this.owner, workspace: this.workspace, recordPath: this.recordPath,
    disposition: this.disposition, processClean: this.processClean, cleanupComplete: this.cleanupComplete,
    released: this.released, managerResources: this.manager.size, phase: this.phase, rootPid: this.rootPid,
    accounting: this.finalAccounting, retained: [...this.records.values()].map(({handle, ...r}) => r),
    coverageGaps: this.coverageGaps, output: this.output.slice(0, 4096), exitCode: this.exitCode, timeline: this.log } }
  async safety() {
    clearInterval(this.timer); this.timer = null
    this.native.setFault(0); this.faults = {}; this.queryError = null
    if (!this.released && this.child) {
      this.child.ownership.job.terminate()
      await this.child.settled
      await until(() => [...this.records.values()].every(r => this.native.waitState(r.handle) === 'SIGNALED'))
      if (this.child.ownership.job.activeProcessCount() !== 0) throw Error('Safety Job not empty')
      this.child.ownership.job.release(); this.released = true
      for (const r of this.records.values()) this.native.closeHandle(r.handle)
    }
    // Safety fallback is not a policy result. Never erase unresolved/quarantined workspace here.
  }
}
export async function safeRemove(root, workspace) {
  if (dirname(resolve(workspace)) !== resolve(root)) throw Error('Unsafe workspace containment')
  async function check(path) { const info = await lstat(path); if (info.isSymbolicLink()) throw Error('Reparse point');
    if (info.isDirectory()) for (const name of await readdir(path)) await check(join(path, name)) }
  await check(workspace); await rm(workspace, { recursive: true, force: false })
}
