import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WindowsExerciseRuntimeAdapter, learningEnvironment } from '../../src/main/services/learning/runtime/windows-exercise-adapter'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'

let native: LearningNativeBinding, root: string, evidence: string
const records: object[] = []
const context = (signal = new AbortController().signal) => ({ signal, deadline: performance.now() + 2000,
  jobMemoryBytes: 512 * 1024 ** 2, output: () => {} })
const pause = () => new Promise<void>(r => setTimeout(r, 15))
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Learning stdin real Windows processes', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'learning-stdin-'))
    evidence = resolve('out/learning-stdin', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidence, { recursive: true })
    const paths = ['out/main/native/learning/learning-job.node', 'src/main/services/learning/runtime/native/learning-job.cpp',
      'src/main/services/learning/runtime/windows-exercise-adapter.ts']
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ platform: process.platform, node: process.version,
      watchdog: false, hashes: Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])) ) }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('learning-stdin-')) throw Error('Unsafe cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  it.each(['', 'Tiếng Việt 日本語 😀\n\0', 'x'.repeat(1024 * 1024)])('delivers bounded input and EOF (case %#)', async input => {
    const reader = "const c=require('node:crypto'); const h=c.createHash('sha256'); let n=0; process.stdin.on('data',b=>{h.update(b); n+=b.length; process.stdin.pause(); setTimeout(()=>process.stdin.resume(),1)}); process.stdin.on('end',()=>console.log(n+':'+h.digest('hex')))"
    const adapter = new WindowsExerciseRuntimeAdapter(native, () => ({ executable: process.execPath, args: ['-e', reader], cwd: root, stdin: input }))
    let output = '', ticks = 0
    const timer = setInterval(() => ticks++, 5)
    try {
      const result = await adapter.runProcessPhase('execute', { ...context(), output: (_s, t) => { output += t } })
      expect(result).toMatchObject({ exitCode: 0, observerSettled: true, failure: null })
      expect(output.trim()).toBe(`${Buffer.byteLength(input)}:${createHash('sha256').update(input).digest('hex')}`)
      expect(ticks).toBeGreaterThan(0)
      expect(adapter.diagnostics()[0].released).toBe(false)
      records.push({ name: 'delivery-eof', bytes: Buffer.byteLength(input), result, ticks })
    } finally {
      clearInterval(timer); await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles()
    }
    expect(adapter.diagnostics()[0]).toMatchObject({ released: true, handlesClosed: true })
  })
  it('rejects early exit/broken pipe and retains ownership until cleanup', async () => {
    const adapter = new WindowsExerciseRuntimeAdapter(native, () => ({ executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: root, stdin: 'x'.repeat(1024 * 1024) }))
    try {
      await expect(adapter.runProcessPhase('execute', context())).rejects.toMatchObject({ details: { reason: 'STDIN_DELIVERY_FAILED' } })
      expect(adapter.processResult()?.failure).toBe('INFRASTRUCTURE_FAILURE')
      expect(adapter.diagnostics()[0].released).toBe(false)
    } finally { await adapter.terminate(); await adapter.settleObservers(); await adapter.release(); await adapter.closeHandles() }
    records.push({ name: 'broken-pipe', result: adapter.processResult(), diagnostics: adapter.diagnostics() })
  })
  it('enforces native input bounds/one-shot ownership and retains a detached buffer across partial progress', async () => {
    const job = native.start(process.execPath, ['-e', "const h=require('node:crypto').createHash('sha256'); process.stdin.on('data',b=>h.update(b)); process.stdin.on('end',()=>console.log(h.digest('hex')))"], root, 512 * 1024 ** 2, learningEnvironment(process.env))
    let sample = native.poll(job), output = '', stderr = ''
    const progress = new Set<number>()
    try {
      expect(sample.members).toContain(sample.rootPid); expect(sample.retained[0].signaled).toBe(false)
      expect(() => native.submitInput(job, Buffer.alloc(1024 * 1024 + 1))).toThrow()
      const input = Buffer.alloc(65536, 120)
      native.submitInput(job, input); input.fill(0)
      expect(() => native.submitInput(job, Buffer.alloc(0))).toThrow()
      native.control(job, 'resume')
      const due = performance.now() + 2000
      while (!sample.observerSettled && performance.now() < due) {
        sample = native.poll(job); progress.add(sample.stdinBytesWritten); output += sample.stdout.toString('utf8'); stderr += sample.stderr.toString('utf8'); await pause()
      }
      expect(stderr).toBe('')
      expect(sample).toMatchObject({ stdinSettled: true, stdinFailed: false, stdinBytesWritten: 65536, observerSettled: true, activeProcesses: 0 })
      expect(output.trim()).toBe(createHash('sha256').update(Buffer.alloc(65536, 120)).digest('hex')); expect(progress.size).toBeGreaterThan(1)
      records.push({ name: 'native-bounds-one-shot-progress', progress: [...progress], settled: sample.observerSettled })
    } finally {
      native.control(job, 'terminate')
      const due = performance.now() + 12000
      do { sample = native.poll(job); if (sample.observerSettled && !sample.activeProcesses) break; await pause() } while (performance.now() < due)
      native.control(job, 'release'); native.control(job, 'closeHandles')
    }
    expect(() => native.submitInput(job, Buffer.alloc(0))).toThrow()
    expect(native.state(job)).toMatchObject({ released: true, handlesClosed: true })
  })
  it.each(['exit', 'gc'])('kills the real child on native owner %s while stdin is pending', async mode => {
    const owner = spawn(process.execPath, ['--expose-gc', resolve('tests/fixtures/learning/stdin-owner.mjs'), resolve('out/main/native/learning/learning-job.node')],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    const exited = new Promise<number | null>((resolve, reject) => { owner.once('exit', resolve); owner.once('error', reject) })
    let readiness: { pid: number; pending: boolean } | undefined, watched: object | undefined, collected = false
    owner.on('message', message => {
      if (typeof message === 'object' && message && 'collected' in message) collected = true
      else readiness = message as typeof readiness
    })
    try {
      const due = performance.now() + 4000
      while (!readiness && owner.exitCode === null && performance.now() < due) await pause()
      expect(readiness?.pending).toBe(true)
      watched = native.watch(readiness!.pid)
      expect(native.observation(watched, 'identity').signaled).toBe(false)
      owner.send(mode)
      if (mode === 'exit') expect(await exited).toBe(17)
      const cleanupDue = performance.now() + 4000
      while (!native.observation(watched, 'identity').signaled && performance.now() < cleanupDue) await pause()
      expect(native.observation(watched, 'identity').signaled).toBe(true)
      if (mode === 'gc') { expect(collected).toBe(true); expect(owner.exitCode).toBeNull(); owner.send('exit'); expect(await exited).toBe(17) }
      records.push({ name: `native-owner-${mode}`, signaled: true, pendingBeforeOwnerLoss: true })
    } finally {
      if (owner.exitCode === null) { owner.kill(); await exited }
      if (watched) native.observation(watched, 'close')
    }
  }, 12_000)
  it.each(['OWNER_LOST', 'EXECUTE_TIMEOUT'] as const)('settles blocked write through Core %s with retained retry', async reason => {
    let handle: object | undefined, fail = true
    const binding: LearningNativeBinding = { capability: native.capability, submitInput: native.submitInput, state: native.state,
      acquireLease: native.acquireLease, watch: native.watch, observation: native.observation, control: native.control,
      start: (...args) => { handle = native.start(...args); return handle },
      poll: h => {
        if (native.state(h).terminated && fail) throw { code: 'LEARNING_QUERY' }
        return native.poll(h)
      } }
    const workspace = new ExerciseWorkspace(root, `exercise_${reason === 'OWNER_LOST' ? '12345678' : '87654321'}-1234-4234-8234-123456789abc`, new WindowsExerciseLeaseProvider(root, native))
    const adapter = new WindowsExerciseRuntimeAdapter(binding, phase => phase === 'prepare' ? null : ({ executable: process.execPath,
      args: ['-e', "process.stdout.write('READY'); setInterval(()=>{},1000)"], cwd: workspace.path, stdin: 'x'.repeat(1024 * 1024) }))
    const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language: 'csharp', code: '', sourceRevision: 1 },
      ownerId: 'stdin-native', workspace, checkpoints: new FileExerciseCheckpointStore(workspace), adapter })
    let task: Promise<void> | undefined, watched: object | undefined
    try {
      await session.runPhase('prepare')
      task = session.runPhase('execute'); void task.catch(() => {})
      const due = performance.now() + 1800
      while (!session.snapshot().stdout.includes('READY') && performance.now() < due) await pause()
      expect(session.snapshot().stdout).toContain('READY')
      const pending = native.poll(handle!)
      expect(pending.stdinSettled).toBe(false)
      expect(pending.stdinBytesWritten).toBeLessThan(1024 * 1024)
      watched = native.watch(pending.rootPid)
      await expect(adapter.release()).rejects.toThrow()
      if (reason === 'OWNER_LOST') await session.close(reason).catch(() => {})
      else { await task.catch(() => {}); while (session.pendingCleanup) await pause() }
      expect(session.ownsResources).toBe(true)
      expect(native.state(handle!).released).toBe(false)
      fail = false
      await session.close(reason); await task.catch(() => {})
      expect(native.observation(watched, 'identity').signaled).toBe(true)
      expect(session.snapshot().cleanup).toMatchObject({ cleanupComplete: true, proof: 'VERIFIED' })
      expect(session.snapshot().reason).toBe(reason)
      expect(native.state(handle!)).toMatchObject({ released: true, handlesClosed: true })
      records.push({ name: reason, pendingBytes: pending.stdinBytesWritten, snapshot: session.snapshot(), diagnostics: adapter.diagnostics() })
    } finally {
      fail = false
      if (session.ownsResources) await session.close('SHUTDOWN')
      await task?.catch(() => {}); if (watched) native.observation(watched, 'close')
    }
  }, 15_000)
})
