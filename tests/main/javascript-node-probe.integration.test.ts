import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { WindowsLearningNodeProbe } from '../../src/main/services/learning/runtime/javascript-node-probe'
import type { JavascriptNodeResolution } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import type { ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { probeReport } from '../fixtures/learning/javascript-node-files'

const supported = process.platform === 'win32' && process.arch === 'x64'
let root: string, evidence: string, native: LearningNativeBinding
const records: object[] = []
type Fault = 'none' | 'first-major' | 'cancel-launch' | 'quota-readback' | 'observer' | 'cleanup-retry' | 'output' | 'prepare-timeout'
describe.skipIf(!supported)('Real installed Node in Learning Prepare Jobs', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning-node-live-'))
    evidence = resolve('out/learning-javascript-node-step2', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidence, { recursive: true })
    const files = ['javascript-node-files.ts', 'javascript-node-resolver.ts', 'javascript-node-probe.ts',
      'exercise-session.ts', 'windows-exercise-adapter.ts', 'native/learning-job.cpp'].map(f => `src/main/services/learning/runtime/${f}`)
    files.push('out/main/native/learning/learning-job.node', 'tests/main/javascript-node-probe.integration.test.ts')
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), hostNode: process.version,
      arch: process.arch, classification: 'INSTALLED_NODE_PREPARE_PROBE_NO_STUDENT_EXECUTION', watchdog: false,
      hashes: Object.fromEntries(await Promise.all(files.map(async f => [f, createHash('sha256').update(await readFile(f)).digest('hex')])) ) }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-node-live-')) throw Error('Unsafe fixture cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  async function run(name: string, fault: Fault = 'none', junction = false) {
    const directory = join(root, name); await mkdir(directory)
    const alias = join(directory, 'Node Việt nvm')
    if (junction || fault === 'first-major') await symlink(dirname(process.execPath), alias, 'junction')
    const environment = { PATH: fault === 'first-major' ? `${alias};${dirname(process.execPath)}` : junction ? alias : dirname(process.execPath) }
    const jobs: object[] = [], watched: object[] = [], starts: object[] = [], resumes: object[] = []
    let closing: Promise<void> | undefined, failQuery = false, observerFault = fault === 'observer'
    let resolution: JavascriptNodeResolution | undefined, due = 0
    // Node-API methods are non-enumerable: explicitly forward every unchanged port.
    const binding: LearningNativeBinding = { capability: native.capability, submitInput: native.submitInput,
      state: native.state, acquireLease: native.acquireLease, watch: native.watch, observation: native.observation,
      start(executable, args, cwd, quota, env) {
        const n = jobs.length
        let actualArgs = args
        if (fault === 'output') actualArgs = ['--eval', 'process.stdout.write("x".repeat(1024*1024+4096))']
        if (fault === 'prepare-timeout') actualArgs = ['--eval', 'for(;;){}']
        if (fault === 'first-major' && n === 0) actualArgs = ['--eval', `process.stdout.write(${JSON.stringify(probeReport({ canonicalPath: executable }).replace('v24.8.1', 'v22.1.0'))})`]
        const h = native.start(executable, actualArgs, cwd, quota, env)
        jobs.push(h)
        const initial = native.poll(h)
        watched.push(native.watch(initial.rootPid))
        starts.push({ rootPid: initial.rootPid, requestedQuota: quota, readBackQuota: initial.quotaBytes,
          memberBeforeResume: initial.members.includes(initial.rootPid), retainedBeforeResume: initial.retained.some(p => p.pid === initial.rootPid && !p.signaled),
          suspended: true, fixedProbe: actualArgs === args, due })
        if (fault === 'cancel-launch') { closing = session.close('OWNER_LOST'); void closing.catch(() => {}) }
        return h
      },
      poll(h) {
        if (failQuery) { failQuery = false; throw { code: 'LEARNING_QUERY' } }
        const sample = native.poll(h)
        if (fault === 'quota-readback' && resumes.length === 0 && sample.retained.some(p => !p.signaled)) return { ...sample, quotaBytes: 1 }
        if (observerFault && resumes.length > 0) { observerFault = false; throw { code: 'LEARNING_PIPE' } }
        return sample
      },
      control(h, op) {
        if (op === 'resume') {
          const s = native.poll(h)
          expect(s.quotaBytes).toBe(512 * 1024 ** 2)
          expect(s.members).toContain(s.rootPid)
          resumes.push({ rootPid: s.rootPid, quota: s.quotaBytes })
        }
        native.control(h, op)
      },
    }
    const workspace = new ExerciseWorkspace(directory, 'exercise_12345678-1234-4234-8234-123456789abc', new WindowsExerciseLeaseProvider(directory, binding))
    const resolver = new LearningNodeResolver(environment), probe = new WindowsLearningNodeProbe(binding, workspace)
    // Test-only admitted Prepare driver; no production JavaScript factory/orchestrator.
    const adapter: ExerciseRuntimeAdapter = {
      async runPhase(phase, context) {
        expect(phase).toBe('prepare'); due = context.deadline
        resolution = await resolver.resolve(context, probe)
        if (resolution.state !== 'AVAILABLE') throw Error('Real Node24 candidate unavailable')
        await resolver.revalidate(resolution.selection, context)
      },
      terminate: reason => probe.terminate(reason), settleObservers: () => probe.settleObservers(), evidence: () => probe.evidence(),
      release: () => probe.release(), closeHandles: () => probe.closeHandles(),
    }
    const session = new ExerciseSession({ request: { exerciseId: 'ch2-01', language: 'javascript', code: '', sourceRevision: 0 },
      ownerId: 'test-owner', workspace, checkpoints: new FileExerciseCheckpointStore(workspace), adapter })
    let caught: unknown
    try { await session.runPhase('prepare') } catch (e) { caught = e }
    try {
      if (fault === 'cleanup-retry') {
        failQuery = true
        await expect(session.close()).rejects.toThrow()
        expect(session.ownsResources).toBe(true)
        expect(probe.diagnostics().every(j => !j.released && !j.handlesClosed)).toBe(true)
      }
    } finally {
      try { if (closing) await closing; await session.close() }
      finally {
        const identities = watched.map(h => native.observation(h, 'identity'))
        for (const h of watched) native.observation(h, 'close')
        records.push({ name, fault, resolution, reason: session.snapshot().reason, starts, resumes,
          diagnostics: probe.diagnostics(), cleanup: session.snapshot().cleanup, identities,
          state: jobs.map(h => native.state(h)), watchdog: false })
        expect(identities.every(identity => identity.signaled)).toBe(true)
      }
    }
    expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', processClean: true, cleanupComplete: true })
    expect(session.snapshot().stdout).toBe(''); expect(session.snapshot().stderr).toBe('')
    expect(workspace.ownsLease).toBe(false)
    expect(jobs.every(h => native.state(h).released && native.state(h).handlesClosed)).toBe(true)
    expect(starts.every(s => (s as { readBackQuota: number }).readBackQuota === 512 * 1024 ** 2)).toBe(true)
    if (fault === 'none' || fault === 'first-major' || fault === 'cleanup-retry') {
      expect(caught).toBeUndefined(); expect(resolution).toMatchObject({ state: 'AVAILABLE', selection: { version: expect.stringMatching(/^v24\./), architecture: 'x64' } })
    } else expect(caught).toBeDefined()
    if (fault === 'first-major') { expect(jobs).toHaveLength(2); expect(starts.every(s => (s as { due: number }).due === due)).toBe(true) }
    if (fault === 'cancel-launch' || fault === 'quota-readback') expect(resumes).toHaveLength(0)
    if (fault === 'cancel-launch') expect(session.snapshot().reason).toBe('OWNER_LOST')
    if (fault === 'output') expect(session.snapshot().reason).toBe('OUTPUT_LIMIT')
    if (fault === 'prepare-timeout') expect(session.snapshot().reason).toBe('PREPARE_TIMEOUT')
  }
  it('verifies actual installed stable Node24 in an owned Prepare Job', () => run('installed'), 20_000)
  it('runs safely through a verified Unicode/space nvm-style junction', () => run('junction', 'none', true), 20_000)
  it.each(['first-major', 'cancel-launch', 'quota-readback', 'observer', 'cleanup-retry', 'output', 'prepare-timeout'] as const)(
    'preserves ownership and cleanup for real Job %s', fault => run(fault, fault), 25_000,
  )
})
