import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadLearningNative, type LearningJobSample, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { WindowsExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/windows-exercise-adapter'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { ExerciseSession, classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { validateExerciseSnapshot } from '../../src/shared/contracts/exercise-validation'

const supported = process.platform === 'win32' && process.arch === 'x64'
const modulePath = resolve('out/main/native/learning/learning-job.node')
const tree = resolve('tests/fixtures/learning/job-tree.mjs')
const id = 'exercise_12345678-1234-4234-8234-123456789abc'
const records: object[] = []
let native: LearningNativeBinding, root: string, evidenceDirectory: string
async function until(check: () => boolean | Promise<boolean>, ms = 12_000) {
  const end = performance.now() + ms
  while (performance.now() < end) {
    if (await check()) return
    await new Promise<void>(r => setTimeout(r, 15))
  }
  throw Error('Observation deadline; no watchdog kill can make this a PASS')
}
function proof(sample: LearningJobSample) {
  return { ...sample, members: sample.members.map(pid => {
    const p = sample.retained.find(r => r.pid === pid)
    if (!p) throw Error('Member identity not retained')
    return { pid, created: p.created }
  }), unresolvedErrors: false }
}
function summary(s: LearningJobSample) {
  return { rootPid: s.rootPid, members: s.members, activeProcesses: s.activeProcesses, totalProcesses: s.totalProcesses,
    retained: s.retained, observerSettled: s.observerSettled, coverageComplete: s.coverageComplete, quotaBytes: s.quotaBytes,
    peakJobCommitBytes: s.peakJobCommitBytes, reportedJobCommitBytes: s.reportedJobCommitBytes }
}
describe.skipIf(!supported)('Learning native Windows integration (real processes, no watchdog)', () => {
  beforeAll(async () => {
    expect(process.version).toMatch(/^v24\./)
    native = loadLearningNative(modulePath)
    root = await mkdtemp(join(tmpdir(), 'exercise-native-'))
    evidenceDirectory = resolve('out/learning-native-step3', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidenceDirectory, { recursive: true })
    const files = [modulePath, resolve('src/main/services/learning/runtime/native/learning-job.cpp'),
      resolve('src/main/services/learning/runtime/windows-exercise-adapter.ts')]
    const hashes = Object.fromEntries(await Promise.all(files.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])))
    await writeFile(join(evidenceDirectory, 'environment.json'), JSON.stringify({ platform: process.platform, arch: process.arch,
      node: process.version, hashes, watchdog: false, productionQuotasUnchanged: true }, null, 2))
  })
  afterAll(async () => {
    if (evidenceDirectory) await writeFile(join(evidenceDirectory, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('exercise-native-')) throw Error('Unsafe test cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })

  it('process result port observes real OS exit and settled streams without releasing the Job', async () => {
    for (const exitCode of [0, 1, 259]) {
      const adapter = new WindowsExerciseRuntimeAdapter(native, () => ({ executable: process.execPath,
        args: ['-e', `process.stdout.write('diagnostic stdout'); process.stderr.write('diagnostic stderr'); process.exitCode = ${exitCode}`], cwd: root }))
      let stdout = '', stderr = ''
      try {
        const result = await adapter.runProcessPhase('compile', { signal: new AbortController().signal,
          deadline: performance.now() + 30_000, jobMemoryBytes: 2 * 1024 ** 3,
          output: (stream, text) => { if (stream === 'stdout') stdout += text; else stderr += text } })
        expect(result).toMatchObject({ exitCode, processExited: true, observerSettled: true,
          stdoutSettled: true, stderrSettled: true, failure: exitCode === 0 ? null : 'NONZERO_EXIT', jobMemoryLimitObserved: false })
        expect(stdout).toBe('diagnostic stdout'); expect(stderr).toBe('diagnostic stderr')
        expect(adapter.diagnostics()[0]).toMatchObject({ released: false, handlesClosed: false })
        records.push({ name: 'process-result-port', assertionsCompleted: true, result, stdout, stderr,
          beforeCleanup: adapter.diagnostics(), watchdog: false })
      } finally {
        await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
      }
      const result = adapter.processResult()
      await adapter.release(); await adapter.closeHandles()
      expect(adapter.processResult()).toEqual(result)
    }
  }, 40_000)

  it('owns compile/execute Jobs before resume; retains root/descendant handles and completes Core Policy B', async () => {
    const handles: object[] = [], jobs: object[] = []
    let suspended: LearningJobSample | undefined
    const binding: LearningNativeBinding = { ...native, capability: native.capability,
      // N-API functions are non-enumerable; explicitly retain the whole port.
      poll: native.poll, control: native.control, state: native.state, acquireLease: native.acquireLease,
      submitInput: native.submitInput,
      watch: native.watch, observation: native.observation,
      start: (...args) => { const job = native.start(...args); jobs.push(job); suspended = native.poll(job); return job },
    }
    const workspace = new ExerciseWorkspace(root, id, new WindowsExerciseLeaseProvider(root, native))
    const adapter = new WindowsExerciseRuntimeAdapter(binding, phase => phase === 'prepare' ? null
      : { executable: process.execPath, args: phase === 'compile' ? ['-e', "console.log(JSON.stringify(process.argv.slice(1)))", 'quote" space', 'tail\\'] : [tree], cwd: workspace.path })
    const store = new FileExerciseCheckpointStore(workspace)
    const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language: 'javascript', code: '', sourceRevision: 1 },
      ownerId: 'native-integration', workspace, checkpoints: store, adapter })
    let phase: Promise<void> | undefined
    try {
      await session.runPhase('prepare'); await session.runPhase('compile')
      expect(suspended!.quotaBytes).toBe(2 * 1024 ** 3)
      expect(suspended!.members).toContain(suspended!.rootPid)
      expect(suspended!.retained[0].signaled).toBe(false)
      expect(session.snapshot().stdout).toContain('quote\\" space')
      phase = session.runPhase('execute'); void phase.catch(() => {})
      await until(() => session.snapshot().stdout.includes('CHILD_READY'), 2_000)
      expect(suspended!.quotaBytes).toBe(512 * 1024 ** 2)
      const live = await adapter.evidence()
      expect(live.members.length).toBeGreaterThanOrEqual(2)
      for (const p of live.members) {
        const h = native.watch(p.pid); handles.push(h)
        expect(native.observation(h, 'identity')).toMatchObject({ pid: p.pid, created: p.created, signaled: false })
      }
      expect(() => native.control(jobs[1], 'release')).toThrow() // Real native ownership guard, not a mock.
      expect(native.state(jobs[1]).released).toBe(false)
      await session.close('CONTEXT_CHANGED'); await phase?.catch(() => {})
      const final = session.snapshot()
      expect(final.cleanup.proof).toBe('VERIFIED'); expect(final.cleanup.cleanupComplete).toBe(true)
      expect(validateExerciseSnapshot(final).ok).toBe(true)
      for (const h of handles) expect(native.observation(h, 'identity').signaled).toBe(true)
      expect(adapter.diagnostics().every(s => s.released && s.handlesClosed)).toBe(true)
      expect(native.state(jobs[1])).toMatchObject({ terminated: true, released: true, handlesClosed: true })
      await expect(readFile(store.path, 'utf8')).resolves.toContain('CLEANUP_COMPLETE')
      records.push({ name: 'root-descendant-core', assertionsCompleted: true, live,
        final, diagnostics: adapter.diagnostics(), independentHandles: handles.map(h => native.observation(h, 'identity')) })
    } finally {
      if (session.ownsResources) await session.close('SHUTDOWN')
      await phase?.catch(() => {})
      for (const h of handles) native.observation(h, 'close')
    }
  }, 20_000)

  it('proves a hard aggregate Job quota using bounded native allocation denial plus matching event', async () => {
    const quota = 64 * 1024 ** 2 // Test-only mechanism probe; production Core settings stay 2 GiB/512 MiB.
    const job = native.start(resolve('out/main/native/learning/native-allocator.exe'), [], root, quota, [])
    let text = '', last = native.poll(job)
    const observer = native.watch(last.rootPid), events: { message: number; pid: number }[] = []
    const before = summary(last)
    try {
      expect(last.quotaBytes).toBe(quota); expect(last.retained[0].signaled).toBe(false)
      native.control(job, 'resume')
      await until(() => {
        last = native.poll(job); text += last.stdout.toString('utf8'); events.push(...last.events)
        return text.includes('ALLOC_DENIED') && events.some(e => e.message === 10 && e.pid === last.rootPid)
      })
      expect(text).toContain('ALLOCATOR_READY'); expect(text).not.toContain('ALLOC_CEILING')
      const denial = /ALLOC_DENIED (\d+) (\d+)/.exec(text)!
      expect(denial).not.toBeNull(); expect(Number(denial[1])).toBeLessThan(96 * 1024 ** 2); expect(Number(denial[2])).toBe(1455)
      const violation = summary(last)
      native.control(job, 'terminate')
      await until(() => { last = native.poll(job); return last.observerSettled && !last.activeProcesses && !last.members.length && last.retained.every(p => p.signaled) })
      expect(classifyExerciseTermination(proof(last))).toBe('VERIFIED')
      expect(native.observation(observer, 'identity').signaled).toBe(true)
      native.control(job, 'release'); native.control(job, 'closeHandles')
      records.push({ name: 'bounded-job-memory', assertionsCompleted: true, before, violation, text, events, after: summary(last), watchdog: false })
    } finally {
      if (!native.state(job).released) {
        native.control(job, 'terminate')
        await until(() => { last = native.poll(job); return last.observerSettled && !last.activeProcesses && !last.members.length })
        native.control(job, 'release')
      }
      native.control(job, 'closeHandles'); native.observation(observer, 'close')
    }
  }, 20_000)

  it('retains real native ownership across an ambiguous release error and retries without re-query/release', async () => {
    let job: object | undefined, fail = true, releaseCalls = 0, queriesAfterRelease = 0
    const binding: LearningNativeBinding = { capability: native.capability, start: (...a) => { job = native.start(...a); return job },
      submitInput: native.submitInput,
      state: native.state, acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      poll: h => { if (native.state(h).released) queriesAfterRelease++; return native.poll(h) },
      control: (h, op) => {
        if (op === 'release') releaseCalls++
        native.control(h, op)
        if (op === 'release' && fail) { fail = false; throw { code: 'LEARNING_CLOSE', win32: 6 } }
      },
    }
    const adapter = new WindowsExerciseRuntimeAdapter(binding, () => ({ executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: root }))
    try {
      await adapter.runPhase('execute', { signal: new AbortController().signal, deadline: performance.now() + 2_000,
        jobMemoryBytes: 512 * 1024 ** 2, output: () => {} })
      await expect(adapter.release()).rejects.toMatchObject({ details: { nativeCode: 'LEARNING_CLOSE' } })
      expect(native.state(job!).released).toBe(true)
      await adapter.evidence(); await adapter.release(); await adapter.closeHandles()
      expect(releaseCalls).toBe(1); expect(queriesAfterRelease).toBe(0)
      records.push({ name: 'ambiguous-release-retry', assertionsCompleted: true, releaseCalls, queriesAfterRelease, state: native.state(job!) })
    } finally {
      if (job && !native.state(job).released) { await adapter.terminate(); await adapter.settleObservers(); await adapter.release() }
      await adapter.closeHandles()
    }
  }, 20_000)

  it('releases the OS-exclusive lease and kills owned descendants when the owner process exits', async () => {
    const leases = join(root, 'peer-leases'); await mkdir(leases)
    const leasePath = join(leases, `${id}.lock`)
    const peer = spawn(resolve('node_modules/electron/dist/electron.exe'),
      [resolve('tests/fixtures/learning/lease-owner.mjs'), modulePath, leasePath, tree, process.execPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    })
    const watched: object[] = []
    const exited = new Promise<number | null>((resolve, reject) => { peer.once('exit', resolve); peer.once('error', reject) })
    let readiness: { pids: number[]; electron: string; node: string } | undefined
    peer.on('message', message => { if (typeof message === 'object' && message && 'pids' in message) readiness = message as typeof readiness })
    let stderr = '', ownerOutput = ''
    peer.stderr?.on('data', b => { stderr += b.toString() })
    peer.stdout?.on('data', b => { ownerOutput += b.toString() })
    try {
      await until(() => { if (peer.exitCode !== null) throw Error(`Owner exited before ready: ${stderr}`); return readiness !== undefined })
      expect(native.acquireLease(leasePath)).toBeNull() // Different OS process currently owns it.
      expect(typeof readiness!.electron).toBe('string')
      for (const pid of readiness!.pids) { const h = native.watch(pid); watched.push(h); expect(native.observation(h, 'identity').signaled).toBe(false) }
      peer.send('exit-owner')
      expect(await exited).toBe(17)
      await until(() => watched.every(h => native.observation(h, 'identity').signaled))
      const lease = native.acquireLease(leasePath); expect(lease).not.toBeNull()
      native.observation(lease!, 'close')
      records.push({ name: 'owner-exit-lease-and-kill-on-close', assertionsCompleted: true,
        ownerExitCode: 17, host: { electron: readiness!.electron, node: readiness!.node },
        identities: watched.map(h => native.observation(h, 'identity')), leaseReacquired: true, watchdog: false })
    } finally {
      await writeFile(join(evidenceDirectory, 'owner-diagnostic.json'), JSON.stringify({ ownerOutput, stderr, readiness: readiness ?? null, exitCode: peer.exitCode }, null, 2))
      // Containment only on a failed test, never counted as termination proof.
      if (peer.exitCode === null) { peer.kill(); await exited }
      for (const h of watched) native.observation(h, 'close')
    }
  }, 20_000)

  it('rejects invalid native authority and a nonexistent executable before untrusted code can run', () => {
    expect(() => native.start(join(root, 'missing.exe'), [], root, 512 * 1024 ** 2, [])).toThrow()
    expect(() => native.start('node.exe', [], root, 512 * 1024 ** 2, [])).toThrow()
    expect(() => native.poll({})).toThrow()
    records.push({ name: 'native-validation-and-spawn-rollback', assertionsCompleted: true })
  })
})
