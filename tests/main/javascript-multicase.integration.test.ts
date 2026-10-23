import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WindowsJavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-adapter'
import { runJavascriptSamples } from '../../src/main/services/learning/runtime/javascript-orchestrator'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { exercises } from '../../src/main/services/learning/content/exercises'
import type { Exercise } from '../../src/shared/contracts/practice'

const triple: Exercise = { ...exercises[0], samples: [
  { args: [14, -6], expected: 999 }, { args: [0, 0], expected: 999 }, { args: [1, 2], expected: 999 },
] }
const sum = 'function Sum(a,b){return a+b;}'
type Fault = 'none' | 'prepare-cancel' | 'syntax-cancel' | 'execute-cancel' | 'stdin-cancel' | 'between-cancel'
  | 'cleanup-retry' | 'descendant' | 'output' | 'protocol'
let root: string, evidence: string, native: LearningNativeBinding
const records: object[] = []
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Real Node24 sequential samples / Learning Jobs', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning-js-step4-'))
    evidence = resolve('out/learning-javascript-multicase-step4', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidence, { recursive: true })
    const files = ['javascript-execution-adapter.ts', 'javascript-orchestrator.ts', 'javascript-harness.ts', 'javascript-harness-child.mjs',
      'javascript-node-resolver.ts', 'javascript-node-probe.ts', 'javascript-syntax.ts', 'exercise-session.ts', 'exercise-limits.ts',
      'windows-exercise-adapter.ts', 'csharp-execution-adapter.ts', 'csharp-orchestrator.ts', 'native/learning-job.cpp'].map(f => 'src/main/services/learning/runtime/' + f)
    files.push('tests/main/javascript-multicase.integration.test.ts', 'out/main/native/learning/learning-job.node')
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), node: process.version, architecture: process.arch,
      classification: 'REAL_NODE_MULTI_CASE_MAIN_INTERNAL_NO_UI_IPC', watchdog: false,
      hashes: Object.fromEntries(await Promise.all(files.map(async f => [f, createHash('sha256').update(await readFile(f)).digest('hex')]))) }, null, 2))
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-js-step4-')) throw Error('Unsafe fixture cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  async function run(name: string, code = sum, fault: Fault = 'none') {
    const directory = join(root, name); await mkdir(directory)
    const jobs: object[] = [], watches = new Map<string, object>(), inputs: number[] = []
    const launches: { mode: string; quota: number; pid: number; member: boolean }[] = []
    const modes = new Map<object, string>(), processCounts = new Map<object, number>()
    let executions = 0, failureEnabled = fault === 'cleanup-retry'
    let closing: Promise<void> | undefined
    const cancel = () => { closing = session.close('OWNER_LOST'); void closing.catch(() => {}) }
    const binding: LearningNativeBinding = {
      capability: native.capability, acquireLease: native.acquireLease, state: native.state, watch: native.watch, observation: native.observation,
      start(exe, args, cwd, quota, env) {
        for (const old of jobs) {
          const s = native.poll(old)
          expect(s.members).toEqual([]); expect(s.activeProcesses).toBe(0); expect(s.observerSettled).toBe(true)
          expect(s.stdinSettled).toBe(true); expect(s.retained.every(p => p.signaled)).toBe(true)
          expect(native.state(old)).toMatchObject({ released: false, handlesClosed: false })
        }
        const mode = args.at(-1) === 'syntax' ? 'syntax' : args.at(-1) === 'execute' ? 'execute' : 'prepare'
        if (mode === 'execute') executions++
        let changed = args
        if (mode === 'execute' && (fault === 'descendant' && executions === 1 || fault === 'output' || fault === 'protocol' && executions === 2)) {
          const before = fault === 'descendant' ? 'require("node:child_process").spawn(process.execPath,["--eval","setTimeout(()=>{},150)"],{stdio:"ignore"});' : ''
          const after = fault === 'output' ? 'process.stdout.write(" ".repeat(600000));' : fault === 'protocol' ? 'process.stdout.write("trailing");' : ''
          changed = ['--eval', 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{'
            + before + 'const r=JSON.parse(s);process.stdout.write(JSON.stringify({protocolVersion:1,caseIndex:r.caseIndex,outcome:"RETURNED",actual:r.args[0]+r.args[1],stdout:"",stderr:""}));' + after + '});']
        }
        const h = native.start(exe, changed, cwd, quota, env), s = native.poll(h)
        jobs.push(h); modes.set(h, mode); watches.set(`${s.rootPid}:${s.retained[0].created}`, native.watch(s.rootPid))
        launches.push({ mode, quota: s.quotaBytes, pid: s.rootPid, member: s.members.includes(s.rootPid) })
        if (fault === mode + '-cancel') cancel()
        return h
      },
      submitInput(h, bytes) {
        if (modes.get(h) === 'execute') inputs.push(JSON.parse(bytes.toString()).caseIndex)
        native.submitInput(h, bytes)
        if (fault === 'stdin-cancel' && modes.get(h) === 'execute') cancel()
      },
      poll(h) {
        const s = native.poll(h)
        processCounts.set(h, Math.max(processCounts.get(h) ?? 0, s.totalProcesses))
        for (const p of s.retained) {
          const key = `${p.pid}:${p.created}`
          if (!p.signaled && !watches.has(key)) watches.set(key, native.watch(p.pid))
        }
        return s
      },
      control(h, op) {
        if (failureEnabled && op === 'terminate') { failureEnabled = false; throw { code: 'LEARNING_QUERY' } }
        native.control(h, op)
      },
    }
    const workspace = new ExerciseWorkspace(directory, 'exercise_12345678-1234-4234-8234-123456789abc', new WindowsExerciseLeaseProvider(directory, binding))
    const request = { exerciseId: triple.id, language: 'javascript' as const, code, sourceRevision: 1 }
    const runtime = new WindowsJavascriptExecutionAdapter(request, workspace, binding, new LearningNodeResolver({ PATH: dirname(process.execPath) }), [triple])
    const session = new ExerciseSession({ request, ownerId: 'real-js-multicase', workspace, adapter: runtime, checkpoints: new FileExerciseCheckpointStore(workspace) })
    if (fault === 'between-cancel') {
      const original = runtime.verifyBetweenCases.bind(runtime)
      vi.spyOn(runtime, 'verifyBetweenCases').mockImplementation(async context => {
        if (runtime.result().cases.length === 1) cancel()
        await original(context)
      })
    }
    let result: ReturnType<typeof runtime.result> | undefined, caught: unknown
    try { result = await runJavascriptSamples(session, runtime) } catch (error) { caught = error }
    try {
      if (fault === 'cleanup-retry') {
        expect(caught).toBeDefined(); expect(session.ownsResources).toBe(true)
        expect(jobs.every(h => !native.state(h).handlesClosed)).toBe(true)
      }
    } finally {
      try { if (closing) await closing; await session.close() }
      finally {
        const identities = [...watches.values()].map(h => native.observation(h, 'identity'))
        for (const h of watches.values()) native.observation(h, 'close')
        records.push({ name, fault, result: result ?? null, reason: session.snapshot().reason, inputs, launches, identities,
          diagnostics: runtime.diagnostics(), processCounts: [...processCounts.values()], cleanup: session.snapshot().cleanup, states: jobs.map(h => native.state(h)), watchdog: false })
        expect(identities.every(p => p.signaled)).toBe(true)
      }
    }
    expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', processClean: true, cleanupComplete: true })
    expect(jobs.every(h => native.state(h).released && native.state(h).handlesClosed)).toBe(true)
    expect(workspace.ownsLease).toBe(false)
    expect(launches.every(l => l.member && l.quota === (l.mode === 'syntax' ? 2 * 1024 ** 3 : 512 * 1024 ** 2))).toBe(true)
    expect(new Set(launches.map(l => l.pid)).size).toBe(launches.length)
    if (fault.endsWith('-cancel')) { expect(caught).toBeDefined(); expect(() => runtime.result()).toThrow() }
    else result = runtime.result()
    return { result, caught, launches, inputs, reason: session.snapshot().reason, processCounts: [...processCounts.values()] }
  }
  it('runs actual catalogue inputs in order using one probe/syntax and fresh Jobs', async () => {
    const r = await run('ordered')
    expect(r.caught).toBeUndefined(); expect(r.result?.cases.map(c => c.actual)).toEqual([8, 0, 3])
    expect(r.inputs).toEqual([0, 1, 2]); expect(r.result?.notRunCaseIndices).toEqual([])
    expect(r.launches.map(l => l.mode)).toEqual(['prepare', 'syntax', 'execute', 'execute', 'execute'])
  }, 20_000)
  it('does not leak top-level globals across cases', async () => {
    const r = await run('isolation', 'globalThis.n=(globalThis.n||0)+1;function Sum(){return globalThis.n;}')
    expect(r.result?.cases.map(c => c.actual)).toEqual([1, 1, 1]); expect(r.launches).toHaveLength(5)
  }, 20_000)
  it.each([0, 1])('fails fast at case %i and keeps the exact suffix', async index => {
    const r = await run('fail-' + index, 'function Sum(a,b){if(a===' + (index === 0 ? 14 : 0) + ')throw Error("student");return a+b;}')
    expect(r.result?.cases).toHaveLength(index + 1); expect(r.result?.notRunCaseIndices).toEqual([0, 1, 2].slice(index + 1))
    expect(r.result?.failure).toMatchObject({ kind: 'RUNTIME_ERROR', caseIndex: index }); expect(r.launches).toHaveLength(index + 3)
  }, 20_000)
  it('stops at syntax error before all samples', async () => {
    const r = await run('syntax', 'function Sum( {')
    expect(r.result?.failure?.kind).toBe('SYNTAX_ERROR'); expect(r.inputs).toEqual([]); expect(r.launches).toHaveLength(2)
  }, 20_000)
  it.each(['prepare-cancel', 'syntax-cancel', 'execute-cancel', 'stdin-cancel', 'between-cancel'] as const)('settles real Jobs after %s', async fault => {
    const r = await run(fault, sum, fault)
    expect(r.launches).toHaveLength(fault === 'prepare-cancel' ? 1 : fault === 'syntax-cancel' ? 2 : 3)
    expect(r.reason).toBe('OWNER_LOST')
  }, 20_000)
  it('times out middle case without launching its suffix', async () => {
    const r = await run('timeout', 'function Sum(a,b){if(a===0)for(;;){};return a+b;}')
    expect(r.result?.cases[0].actual).toBe(8); expect(r.result?.failure).toMatchObject({ kind: 'TIMEOUT', caseIndex: 1 })
    expect(r.result?.notRunCaseIndices).toEqual([2]); expect(r.reason).toBe('EXECUTE_TIMEOUT')
  }, 20_000)
  it('enforces the real 512 MiB Job limit on a middle sample', async () => {
    const r = await run('memory', 'function Sum(a,b){if(a===0){let x=[];for(;;)x.push(new Array(1048576).fill(1));}return a+b;}')
    expect(r.result?.failure).toMatchObject({ kind: 'JOB_MEMORY_LIMIT', caseIndex: 1 }); expect(r.result?.notRunCaseIndices).toEqual([2])
  }, 20_000)
  it('counts raw output cumulatively across two individually bounded case responses', async () => {
    const r = await run('output', sum, 'output')
    expect(r.result?.cases[0].actual).toBe(8); expect(r.result?.failure).toMatchObject({ kind: 'OUTPUT_LIMIT', caseIndex: 1 })
    expect(r.result?.notRunCaseIndices).toEqual([2]); expect(r.reason).toBe('OUTPUT_LIMIT')
  }, 20_000)
  it('keeps a protocol failure at its actual middle index', async () => {
    const r = await run('protocol', sum, 'protocol')
    expect(r.result?.failure).toMatchObject({ kind: 'PROTOCOL_FAILURE', caseIndex: 1 }); expect(r.result?.notRunCaseIndices).toEqual([2])
  }, 20_000)
  it('waits for a real descendant before the next case and closes retained identity handles', async () => {
    const r = await run('descendant', sum, 'descendant')
    expect(r.result?.cases.map(c => c.actual)).toEqual([8, 0, 3]); expect(r.caught).toBeUndefined()
    expect(r.processCounts.some(n => n > 1)).toBe(true)
  }, 20_000)
  it('retries real retained cleanup without relaunching any case', async () => {
    const r = await run('cleanup-retry', sum, 'cleanup-retry')
    expect(r.result?.cases.map(c => c.actual)).toEqual([8, 0, 3]); expect(r.launches).toHaveLength(5)
  }, 20_000)
})
