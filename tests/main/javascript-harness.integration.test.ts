import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JavascriptSingleSampleRuntime } from '../../src/main/services/learning/runtime/javascript-single-sample'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { loadLearningNative, type LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { WindowsExerciseLeaseProvider } from '../../src/main/services/learning/runtime/windows-exercise-lease'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { validateJavascriptExecutionResult } from '../../src/shared/contracts/javascript-execution-validation'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'
import { exercises } from '../fixtures/learning/legacy-exercises'
import type { Exercise, ExerciseType, ExerciseValue } from '../../src/shared/contracts/practice'

const supported = process.platform === 'win32' && process.arch === 'x64'
let native: LearningNativeBinding, root: string, evidence: string
const records: object[] = []
type Fault = 'none' | 'bad-json' | 'bad-utf8' | 'duplicate-key' | 'trailing-request' | 'deep-request' | 'wrong-index'
  | 'syntax-response' | 'bad-response' | 'duplicate-response' | 'trailing-response' | 'stdout-contamination'
  | 'nonzero-response' | 'source-compile' | 'source-execute' | 'harness-execute' | 'stdin-cancel' | 'execute-cancel' | 'cleanup-retry'
const fixtureExercise = (type: ExerciseType, value: ExerciseValue): Exercise => ({
  ...structuredClone(exercises[0]), functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type,
  samples: [{ args: [value], expected: value }],
})
describe.skipIf(!supported)('Real Node24 JavaScript harness/syntax under Learning Jobs', () => {
  beforeAll(async () => {
    native = loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    root = await mkdtemp(join(tmpdir(), 'Learning-js-step3-'))
    evidence = resolve('out/learning-javascript-harness-step3', new Date().toISOString().replace(/[:.]/g, '-'))
    await mkdir(evidence, { recursive: true })
    const files = ['javascript-harness.ts', 'javascript-harness-child.mjs', 'javascript-harness-workspace.ts',
      'javascript-syntax.ts', 'javascript-single-sample.ts', 'exercise-session.ts', 'windows-exercise-adapter.ts',
      'native/learning-job.cpp'].map(f => 'src/main/services/learning/runtime/' + f)
    files.push('tests/main/javascript-harness.integration.test.ts', 'out/main/native/learning/learning-job.node')
    await writeFile(join(evidence, 'environment.json'), JSON.stringify({ windows: release(), node: process.version, arch: process.arch,
      classification: 'REAL_NODE_FIXED_HARNESS_SINGLE_SAMPLE_NO_PRODUCTION_WIRING', watchdog: false,
      hashes: Object.fromEntries(await Promise.all(files.map(async f => [f, createHash('sha256').update(await readFile(f)).digest('hex')])) ) }, null, 2))
  })
  afterAll(async () => {
    if (evidence) await writeFile(join(evidence, 'observations.json'), JSON.stringify(records, null, 2))
    if (root) {
      if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-js-step3-')) throw Error('Unsafe fixture cleanup')
      await rm(root, { recursive: true, force: true })
    }
  })
  async function run(name: string, code: string, exercise: Exercise = exercises[0], fault: Fault = 'none', syntaxOnly = false) {
    const directory = join(root, name); await mkdir(directory)
    const jobs: object[] = [], watches: object[] = [], launches: { mode: string; quota: number; pid: number; member: boolean }[] = []
    const modes = new Map<object, string>(), inputs: number[] = []
    let closing: Promise<void> | undefined, failCleanup = false
    const goodResponse = JSON.stringify({ protocolVersion: 1, caseIndex: 0, stdout: '', stderr: '', outcome: 'RETURNED', actual: 8 })
    const binding: LearningNativeBinding = {
      capability: native.capability, acquireLease: native.acquireLease, state: native.state, watch: native.watch, observation: native.observation,
      start(executable, args, cwd, quota, env) {
        const mode = args.at(-1) === 'syntax' ? 'syntax' : args.at(-1) === 'execute' ? 'execute' : 'probe'
        let changed = args
        if (mode === 'syntax' && fault === 'syntax-response') changed = ['--eval', 'process.stdout.write("{bad syntax frame}")']
        if (mode === 'execute' && ['bad-response', 'duplicate-response', 'trailing-response', 'stdout-contamination', 'nonzero-response'].includes(fault)) {
          const bytes = fault === 'bad-response' ? Buffer.from([0xff]) : Buffer.from(fault === 'duplicate-response' ? goodResponse + goodResponse
            : fault === 'trailing-response' ? goodResponse + 'trailing' : fault === 'stdout-contamination' ? 'console log\n' + goodResponse : goodResponse)
          changed = ['--eval', 'process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write(Buffer.from('
            + JSON.stringify([...bytes]) + '),()=>process.exit(' + (fault === 'nonzero-response' ? 17 : 0) + '));})']
        }
        const h = native.start(executable, changed, cwd, quota, env)
        jobs.push(h); modes.set(h, mode)
        const first = native.poll(h); watches.push(native.watch(first.rootPid))
        launches.push({ mode, quota: first.quotaBytes, pid: first.rootPid, member: first.members.includes(first.rootPid) && first.retained.some(p => p.pid === first.rootPid && !p.signaled) })
        if (mode === 'execute' && fault === 'execute-cancel') { closing = session.close('OWNER_LOST'); void closing.catch(() => {}) }
        return h
      },
      submitInput(h, input) {
        let bytes = input
        if (modes.get(h) === 'execute') {
          const text = input.toString('utf8')
          if (fault === 'bad-json') bytes = Buffer.from('{')
          if (fault === 'bad-utf8') bytes = Buffer.from([0xff])
          if (fault === 'duplicate-key') bytes = Buffer.from(text.replace('"caseIndex":0', '"caseIndex":0,"caseIndex":0'))
          if (fault === 'trailing-request') bytes = Buffer.from(text + text)
          if (fault === 'deep-request') bytes = Buffer.from('['.repeat(13) + '0' + ']'.repeat(13))
          if (fault === 'wrong-index') bytes = Buffer.from(text.replace('"caseIndex":0', '"caseIndex":999'))
        }
        inputs.push(bytes.length); native.submitInput(h, bytes)
        if (modes.get(h) === 'execute' && fault === 'stdin-cancel') { closing = session.close('CONTEXT_CHANGED'); void closing.catch(() => {}) }
      },
      poll(h) { if (failCleanup) { failCleanup = false; throw { code: 'LEARNING_QUERY' } }; return native.poll(h) },
      control: native.control,
    }
    const workspace = new ExerciseWorkspace(directory, 'exercise_12345678-1234-4234-8234-123456789abc', new WindowsExerciseLeaseProvider(directory, binding))
    const request = { exerciseId: exercise.id, language: 'javascript' as const, code, sourceRevision: 1 }
    const runtime = new JavascriptSingleSampleRuntime(request, workspace, binding, new LearningNodeResolver({ PATH: dirname(process.execPath) }), [exercise])
    const session = new ExerciseSession({ request, ownerId: 'real-js-harness', workspace, checkpoints: new FileExerciseCheckpointStore(workspace), adapter: runtime })
    let caught: unknown
    try {
      await session.runPhase('prepare')
      if (fault === 'source-compile') await writeFile(join(workspace.path, 'javascript', 'Source.json'), '{}')
      await session.verifyExecutionBarrier()
      await session.runPhase('compile')
      if (!syntaxOnly) {
        const source = join(workspace.path, 'javascript', 'Source.json'), harness = join(workspace.path, 'javascript', 'Harness.mjs')
        if (fault === 'source-execute') await writeFile(source, '{}')
        if (fault === 'harness-execute') { await rename(harness, harness + '.old'); await writeFile(harness, await readFile(harness + '.old')) }
        await session.verifyExecutionBarrier()
        await session.runPhase('execute')
        await expect(session.runPhase('execute')).rejects.toThrow() // Step 3 never admits a second sample.
      }
    } catch (error) { caught = error }
    try {
      if (fault === 'cleanup-retry') {
        failCleanup = true; await expect(session.close()).rejects.toThrow()
        expect(session.ownsResources).toBe(true)
        expect(runtime.diagnostics().harness.every(j => !j.handlesClosed)).toBe(true)
      }
    } finally {
      try { if (closing) await closing; await session.close() }
      finally {
        const identities = watches.map(h => native.observation(h, 'identity'))
        for (const h of watches) native.observation(h, 'close')
        let result
        try { result = runtime.result() } catch { result = null }
        records.push({ name, fault, result, reason: session.snapshot().reason, launches, inputs, identities,
          diagnostics: runtime.diagnostics(), cleanup: session.snapshot().cleanup, states: jobs.map(h => native.state(h)), watchdog: false })
        expect(identities.every(p => p.signaled)).toBe(true)
      }
    }
    expect(session.snapshot().cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true, processClean: true })
    expect(jobs.every(h => native.state(h).released && native.state(h).handlesClosed)).toBe(true)
    expect(launches.every(l => l.member && l.quota === (l.mode === 'syntax' ? 2 * 1024 ** 3 : 512 * 1024 ** 2))).toBe(true)
    expect(workspace.ownsLease).toBe(false)
    expect(session.snapshot().stdout).toBe(''); expect(session.snapshot().stderr).toBe('')
    if (fault.endsWith('-cancel')) { expect(() => runtime.result()).toThrow(); return { result: null!, caught, launches, reason: session.snapshot().reason } }
    const result = runtime.result()
    expect(validateJavascriptExecutionResult(result, { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }).ok).toBe(true)
    return { result, caught, launches, reason: session.snapshot().reason }
  }
  it('runs the actual catalogue function/sample through verified Node, stdin/EOF and three Jobs', async () => {
    const r = await run('catalogue', 'function Sum(a,b){return a+b;}')
    expect(r.caught).toBeUndefined()
    expect(r.result.syntax?.status).toBe('SUCCEEDED')
    expect(r.result.cases[0]).toMatchObject({ outcome: 'RETURNED', actual: 8, exitCode: 0, failure: null })
    expect(r.launches.map(l => l.mode)).toEqual(['probe', 'syntax', 'execute'])
  }, 20_000)
  const values: [ExerciseType, ExerciseValue][] = [
    ['int32', -2147483648], ['int32', 2147483647], ['int32', 0], ['boolean', false], ['boolean', true],
    ['string', ''], ['string', 'Việt 日本語 😀\n\0"\\'],
    ['int32[]', []], ['int32[]', [-2147483648, 0, 2147483647]], ['string[]', ['', 'Ω', '😀']],
    ['int32[][]', []], ['int32[][]', [[], []]], ['int32[][]', [[1, 2], [3, 4]]],
  ]
  it.each(values)('round trips real synchronous %s %#', async (type, value) => {
    const r = await run('type-' + values.findIndex(v => v[0] === type && v[1] === value), 'function Echo(value){return value;}', fixtureExercise(type, value))
    expect(r.caught).toBeUndefined(); expect(r.result.cases[0]).toMatchObject({ outcome: 'RETURNED', actual: value, exitCode: 0, failure: null })
  }, 20_000)
  it('syntax check never evaluates top-level side effects or infinite loops', async () => {
    const marker = join(root, 'must-not-exist.txt')
    const r = await run('syntax-sentinel', 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ',"bad");for(;;){}', exercises[0], 'none', true)
    expect(r.caught).toBeUndefined(); expect(r.result.syntax?.status).toBe('SUCCEEDED'); expect(r.result.cases).toEqual([])
    expect(r.launches).toHaveLength(2); await expect(access(marker)).rejects.toThrow()
  }, 20_000)
  it('classifies real syntax error without executing any sample', async () => {
    const r = await run('syntax-error', 'function Sum(a,b){ return a + ; }')
    expect(r.result.syntax?.failure?.kind).toBe('SYNTAX_ERROR'); expect(r.result.cases).toEqual([]); expect(r.launches).toHaveLength(2)
    expect(r.reason).toBe('COMPILATION_FAILED')
  }, 20_000)
  it('does not support ESM student imports or execute them during syntax checking', async () => {
    const r = await run('student-import', 'import fs from "node:fs";function Sum(a,b){return a+b;}')
    expect(r.result.syntax?.failure?.kind).toBe('SYNTAX_ERROR'); expect(r.result.cases).toEqual([]); expect(r.launches).toHaveLength(2)
  }, 20_000)
  it.each([
    ['exception', 'function Echo(value){throw Error("private student stack");}'],
    ['missing-function', 'function Other(value){return value;}'],
    ['top-level-throw', 'throw Error("private");function Echo(value){return value;}'],
    ['require-unavailable', 'function Echo(){return require("node:fs");}'],
  ])('classifies real %s as runtime failure', async (name, code) => {
    const r = await run(name, code, fixtureExercise('int32', 1))
    expect(r.result.cases[0].failure?.kind).toBe('RUNTIME_ERROR'); expect(r.reason).toBe('RUNTIME_FAILED')
    expect(JSON.stringify(r.result)).not.toContain('private')
  }, 20_000)
  it.each([
    ['undefined', 'undefined', 'int32'], ['nan', 'NaN', 'int32'], ['infinity', 'Infinity', 'int32'], ['bigint', '1n', 'int32'],
    ['promise', 'Promise.resolve(1)', 'int32'], ['async', '(async()=>1)()', 'int32'], ['thenable', '({then(){}})', 'int32'],
    ['fraction', '1.5', 'int32'], ['range', '2147483648', 'int32'], ['sparse', 'new Array(2)', 'int32[]'],
    ['ragged', '[[1],[2,3]]', 'int32[][]'], ['cycle', '(()=>{const a=[];a.push(a);return a;})()', 'int32[][]'],
    ['to-json', 'Object.assign([1],{toJSON(){throw Error("serialization");}})', 'int32[]'],
    ['getter', 'Object.defineProperty([1],"0",{get(){throw Error("must not read getter");}})', 'int32[]'],
    ['lone-surrogate', '"\\ud800"', 'string'],
  ] as const)('rejects %s return instead of publishing successful actual', async (name, value, type) => {
    const input = type === 'int32[]' ? [] : type === 'int32[][]' ? [] : type === 'string' ? '' : 1
    const r = await run('invalid-' + name, 'function Echo(){return ' + value + ';}', fixtureExercise(type, input))
    expect(r.result.cases[0]).toMatchObject({ outcome: 'FAILED', actual: null, failure: { kind: 'RUNTIME_ERROR' } })
  }, 20_000)
  it('creates context console and preserves the protocol despite logs and prototype mutation', async () => {
    const code = 'function Echo(value){console.log("console Ω",1);console.error("err 😀");'
      + 'Array.prototype.toJSON=()=>{throw Error("must not serialize polluted prototype");};JSON.stringify=()=>"bad";return value;}'
    const r = await run('console-prototypes', code, fixtureExercise('int32[]', [1, 2]))
    expect(r.result.cases[0]).toMatchObject({ outcome: 'RETURNED', actual: [1, 2], stdout: 'console Ω 1\n', stderr: 'err 😀\n' })
  }, 20_000)
  it('provides no process/require/Buffer/filesystem/timer or raw transport globals', async () => {
    const code = 'function Echo(){return [typeof process,typeof require,typeof Buffer,typeof fs,typeof setTimeout,typeof __learningData];}'
    const r = await run('context-globals', code, fixtureExercise('string[]', []))
    expect(r.result.cases[0].actual).toEqual(Array(6).fill('undefined'))
  }, 20_000)
  it('fails bounded console overflow even when student catches its exception', async () => {
    const r = await run('console-overflow', 'function Echo(){try{console.log("x".repeat(1048576));}catch{}return 8;}', fixtureExercise('int32', 8))
    expect(r.result.cases[0]).toMatchObject({ outcome: 'FAILED', actual: null, failure: { kind: 'RUNTIME_ERROR' } })
  }, 20_000)
  it('keeps cumulative raw output quota across probe, syntax and execute', async () => {
    const overhead = Buffer.byteLength(JSON.stringify({ protocolVersion: 1, caseIndex: 0, stdout: '', stderr: '', outcome: 'RETURNED', actual: '' }))
    const exercise = { ...fixtureExercise('int32', EXERCISE_LIMITS.outputBytes - overhead), returnType: 'string' as const }
    const r = await run('raw-output-limit', 'function Echo(n){return "x".repeat(n);}', exercise)
    expect(r.reason).toBe('OUTPUT_LIMIT'); expect(r.result.cases[0].failure?.kind).toBe('OUTPUT_LIMIT')
  }, 20_000)
  it.each(['bad-json', 'bad-utf8', 'duplicate-key', 'trailing-request', 'deep-request', 'wrong-index',
    'bad-response', 'duplicate-response', 'trailing-response', 'stdout-contamination', 'nonzero-response'] as const)(
    'rejects real protocol fault %s', async fault => {
      const r = await run(fault, 'function Sum(a,b){return a+b;}', exercises[0], fault)
      expect(r.result.cases[0].failure?.kind).toBe('PROTOCOL_FAILURE'); expect(r.reason).toBe('INTERNAL_ERROR')
    }, 20_000,
  )
  it('separates malformed syntax transport from source syntax errors', async () => {
    const r = await run('syntax-response', 'function Sum(a,b){return a+b;}', exercises[0], 'syntax-response')
    expect(r.result.syntax?.failure?.kind).toBe('PROTOCOL_FAILURE'); expect(r.result.syntax?.diagnostics).toEqual([])
  }, 20_000)
  it.each(['source-compile', 'source-execute', 'harness-execute'] as const)('refuses %s tampering before launch', async fault => {
    const r = await run(fault, 'function Sum(a,b){return a+b;}', exercises[0], fault)
    expect(r.result.failure?.kind).toBe('INFRASTRUCTURE_FAILURE')
    expect(r.launches).toHaveLength(fault === 'source-compile' ? 1 : 2)
  }, 20_000)
  it.each(['stdin-cancel', 'execute-cancel'] as const)('retains I/O/handles and invalidates result during %s', async fault => {
    const r = await run(fault, 'function Sum(a,b){return a+b;}', exercises[0], fault)
    expect(r.result).toBeNull(); expect(r.reason).toBe(fault === 'stdin-cancel' ? 'CONTEXT_CHANGED' : 'OWNER_LOST')
  }, 20_000)
  it('times out student loops under the unchanged execute 2s deadline', async () => {
    const r = await run('infinite-loop', 'function Sum(){for(;;){}}')
    expect(r.reason).toBe('EXECUTE_TIMEOUT'); expect(r.result.cases[0].failure?.kind).toBe('TIMEOUT')
  }, 20_000)
  it('times out serialization/log conversion inside the child, not Electron', async () => {
    const r = await run('log-conversion-loop', 'function Sum(){console.log({toString(){for(;;){}}});return 1;}')
    expect(r.reason).toBe('EXECUTE_TIMEOUT'); expect(r.result.cases[0].failure?.kind).toBe('TIMEOUT')
  }, 20_000)
  it('retries failed cleanup without respawn or early resource release', async () => {
    const r = await run('cleanup-retry', 'function Sum(a,b){return a+b;}', exercises[0], 'cleanup-retry')
    expect(r.caught).toBeUndefined(); expect(r.launches).toHaveLength(3)
    expect(r.result.cases[0]).toMatchObject({ actual: 8, outcome: 'RETURNED' })
  }, 20_000)
})
