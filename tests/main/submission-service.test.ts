import { EventEmitter } from 'node:events'
import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseService, type ExerciseOwner } from '../../src/main/services/learning/exercise-service'
import { LearningStore } from '../../src/main/services/learning/learning-store'
import { SubmissionStoreFiles, nodeStoreFilePort } from '../../src/main/services/learning/storage/store-files'
import { SharedSubmissionStoreLease } from '../../src/main/services/learning/storage/store-lease'
import { decodeSubmissionDocument } from '../../src/main/services/learning/storage/submission-validation'
import { SUBMISSION_STORE_POLICY as P, type SubmissionStoreKind } from '../../src/main/services/learning/storage/submission-contracts'
import type { OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { OfficialAdapterFactory, OfficialCaseObservation, OfficialLanguageEvidence } from '../../src/main/services/learning/runtime/official-execution-contracts'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import * as comparator from '../../src/main/services/learning/judge/exact-typed-comparator'
import * as reducer from '../../src/main/services/learning/judge/verdict-reducer'

class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const clean = () => ({ members: [], retained: [], activeProcesses: 0, totalProcesses: 0, observerSettled: true, coverageComplete: true, unresolvedErrors: false })
const fault = (code = 'EACCES') => Object.assign(Error('PRIVATE_IO_DIAGNOSTIC'), { code })
function clock() {
  let now = performance.now()
  const timers = new Map<object, { due: number; callback: () => void }>()
  const value: ExerciseClock = { now: () => now, schedule(callback, ms) {
    const key = {}; timers.set(key, { due: now + ms, callback }); return () => { timers.delete(key) }
  } }
  return { value, advance(ms: number) {
    now += ms
    for (const [key, t] of [...timers]) if (t.due <= now) { timers.delete(key); t.callback() }
  }, remaining: () => [...timers.values()].map(t => t.due - now) }
}
type Mode = 'accepted' | 'wa' | 'compile' | 'runtime' | 'protocol' | 'time' | 'memory' | 'output'
const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); vi.restoreAllMocks() })

async function fixture(options: { language?: 'csharp' | 'javascript'; mode?: Mode; pausePrepare?: boolean; pauseExecute?: boolean;
  pauseWrite?: boolean; pauseRename?: boolean; pauseFinalized?: boolean } = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'student-submission-s5-')), registry = await sourceRegistry(), time = clock()
  const m = JSON.parse(await fs.readFile('resources/learning/exercises/ch2-04/exercise.json', 'utf8'))
  const count = (JSON.parse(await fs.readFile('resources/learning/exercises/ch2-04/judge/v1.json', 'utf8')).cases as unknown[]).length
  const identity: OfficialPlanIdentity = { exerciseId: m.exerciseId, packageVersion: m.packageVersion, testSetId: m.official.testSetId,
    testSetVersion: m.official.version, signatureVersion: m.signature.version, signatureHash: m.signature.hash,
    officialHash: m.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
  const request = { exerciseId: 'ch2-04', language: options.language ?? 'javascript', code: 'PRIVATE_SOURCE\r\n🙂', sourceRevision: 4 }
  const mode = options.mode ?? 'accepted'
  const prepare = gate(), preparing = gate(), execute = gate(), executing = gate(), write = gate(), writing = gate(), rename = gate(), renaming = gate()
  const finalized = gate(), finalizing = gate()
  const events: string[] = [], snapshots: unknown[] = [], errors: unknown[] = []
  let releaseFault = false, queryFault = false, closeFault = false, denyRead = false, denyAfterRename = false, lostAck = false, full = false, unavailable = false
  let held = false, beginCalls = 0, primaryRenames = 0, storeCloses = 0, checkpointPause = options.pauseFinalized ?? false
  let onContentRelease: (() => void) | undefined
  const acquire = registry.acquire.bind(registry), release = vi.fn()
  vi.spyOn(registry, 'acquire').mockImplementation(async (id, owner) => {
    const lease = await acquire(id, owner)
    return { ...lease, get data() { return lease.data }, release() {
      release(); events.push('content-release'); onContentRelease?.()
      if (releaseFault) throw fault('EIO')
      lease.release()
    } }
  })
  const factory = vi.fn<OfficialAdapterFactory>((r, _workspace, load) => {
    let inputs: Awaited<ReturnType<typeof load>> | undefined, borrow: Awaited<ReturnType<Awaited<ReturnType<typeof load>>['representInput']>> | undefined
    let compile: OfficialLanguageEvidence['compile'] = null, syntax: OfficialLanguageEvidence['syntax'] = null, failure: OfficialLanguageEvidence['failure'] = null
    const cases: OfficialCaseObservation[] = []
    return {
      hasNextCase: () => !!inputs && !failure && cases.length < inputs.execution.caseCount,
      async runPhase(phase, context) {
        events.push(phase)
        if (phase === 'prepare') { preparing.resolve(); if (options.pausePrepare) await prepare.promise; inputs = await load(context) }
        if (phase === 'compile') {
          if (r.language === 'csharp') {
            const f = mode === 'compile' ? { kind: 'COMPILE_ERROR' as const, phase: 'compile' as const, caseIndex: null } : null
            compile = { status: f ? 'FAILED' : 'SUCCEEDED', exitCode: f ? 1 : 0, failure: f,
              diagnostics: f ? [{ code: 'CS1503', severity: 'error', source: 'harness', line: 1, column: 1 }] : [], stdout: 'PRIVATE_COMPILE', stderr: '' }; failure = f
          } else {
            const f = mode === 'compile' ? { kind: 'SYNTAX_ERROR' as const, phase: 'compile' as const, caseIndex: null } : null
            syntax = { status: f ? 'FAILED' : 'SUCCEEDED', exitCode: f ? 1 : 0, failure: f,
              diagnostics: f ? [{ code: 'SYNTAX_ERROR', source: 'solution', line: null, column: null }] : [], stdout: '', stderr: '' }; failure = f
          }
          if (mode === 'compile') throw exerciseCoreError('COMPILATION_FAILED')
        }
        if (phase === 'execute') {
          const index = cases.length, args = inputs!.execution.inputAt(index)
          borrow = await inputs!.representInput(index); executing.resolve(); if (options.pauseExecute) await execute.promise
          if (context.signal.aborted) throw context.signal.reason
          const process = { phase: 'execute' as const, exitCode: 0, processExited: true, stdoutSettled: true, stderrSettled: true,
            observerSettled: true, failure: null, jobMemoryLimitObserved: false }
          if (['runtime', 'protocol', 'time', 'memory', 'output'].includes(mode)) {
            if (mode === 'runtime') {
              cases.push({ caseIndex: index, language: r.language, process: { ...process, exitCode: r.language === 'javascript' ? 1 : 0,
                failure: r.language === 'javascript' ? 'NONZERO_EXIT' : null }, kind: 'USER_EXCEPTION', stdout: 'PRIVATE_CONSOLE', stderr: '' })
              failure = { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: index }; throw exerciseCoreError('RUNTIME_FAILED')
            }
            if (mode === 'protocol') {
              cases.push({ caseIndex: index, language: r.language, process, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' })
              failure = { kind: 'PROTOCOL_FAILURE', phase: 'execute', caseIndex: index }; throw exerciseCoreError('INTERNAL_ERROR')
            }
            const kind = mode === 'time' ? 'TIMEOUT' : mode === 'memory' ? 'JOB_MEMORY_LIMIT' : 'OUTPUT_LIMIT'
            cases.push({ caseIndex: index, language: r.language, process: null, kind: 'INTERRUPTED', reason: kind })
            failure = { kind, phase: 'execute', caseIndex: index }
            throw exerciseCoreError(mode === 'time' ? 'EXECUTE_TIMEOUT' : kind)
          }
          // Controlled input-only implementation of Divide. Never reads Expected.
          const a = args[0] as number, b = args[1] as number
          cases.push({ caseIndex: index, language: r.language, process, kind: 'RETURNED', actual: [Math.floor(a / b), a % b + (mode === 'wa' ? 1 : 0)], stdout: 'PRIVATE_CONSOLE', stderr: '' })
        }
      },
      async verifyBetweenCases() { events.push('barrier'); if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); borrow?.release(); borrow = undefined },
      officialEvidence: () => ({ compile, syntax, cases, failure,
        notRunCaseIndices: Array.from({ length: (inputs?.execution.caseCount ?? 0) - cases.length }, (_, i) => cases.length + i) }),
      async terminate() {}, async settleObservers() {}, async evidence() { if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); return clean() },
      async release() { borrow?.release(); borrow = undefined }, async closeHandles() {},
    }
  })
  const files = await SubmissionStoreFiles.open(join(root, 'storage'), { ...nodeStoreFilePort,
    statfs: async path => full ? { bavail: 1n, bsize: 1n } : nodeStoreFilePort.statfs(path),
    open: async (path, flags) => {
      if (denyRead && (path.endsWith('accepted.json') || path.endsWith('failed-submissions.json'))) throw fault()
      const h = await nodeStoreFilePort.open(path, flags)
      return { ...h, write: async (...args) => {
        if (options.pauseWrite) { writing.resolve(); await write.promise }
        return h.write(...args)
      } }
    },
    rename: async (from, to) => {
      if (to.endsWith('accepted.json') || to.endsWith('failed-submissions.json')) {
        primaryRenames++; events.push('primary-dispatch'); renaming.resolve(); if (options.pauseRename) await rename.promise
        await fs.rename(from, to); if (denyAfterRename) denyRead = true
      } else await fs.rename(from, to)
    } })
  await fs.writeFile(files.lockPath, '')
  const lease = new SharedSubmissionStoreLease(files, { capability: 'student-ide-learning-job-v1',
    acquireLease() { if (held) return null; held = true; return {} },
    observation() { if (closeFault) throw fault('EIO'); held = false; storeCloses++; events.push('store-close') } })
  const store = new LearningStore({ files, lease, clock: { now: time.value.now, sleep: async ms => { time.advance(ms) } } })
  const begin = vi.spyOn(store, 'begin')
  begin.mockImplementation((r, guard) => {
    beginCalls++; events.push('storage-entry')
    return LearningStore.prototype.begin.call(store, r, guard, () => { if (lostAck) throw fault('EIO') })
  })
  const service = new ExerciseService({ root: join(root, 'runtime'), clock: time.value,
    leases: { acquire: async () => ({ release: async () => { events.push('runtime-lease-close') } }) },
    official: { registry, createAdapter: factory }, submissions: { store() { if (unavailable) throw fault(); return store }, ownsLease: () => lease.ownsLease },
    createExecution: () => ({ phases: ['execute'], adapter: { async runPhase() {}, async terminate() {}, async settleObservers() {}, async evidence() { return clean() }, async release() {}, async closeHandles() {} } }),
    onSnapshot: (_owner, snapshot) => snapshots.push(snapshot), onCleanupError: error => errors.push(error),
    checkpointStore: workspace => {
      const checkpoint = new FileExerciseCheckpointStore(workspace), original = checkpoint.write.bind(checkpoint)
      return { ...checkpoint, read: () => checkpoint.read(), write: async record => {
        if (record.checkpoint === 'FINALIZED' && checkpointPause) { finalizing.resolve(); await finalized.promise }
        await original(record)
      } }
    } })
  const owner = new Owner(1), other = new Owner(2)
  service.start(); await service.ready(); service.observe(owner as ExerciseOwner); service.observe(other as ExerciseOwner)
  disposals.push(async () => {
    releaseFault = false; queryFault = false; closeFault = false; denyRead = false; denyAfterRename = false; onContentRelease = undefined
    checkpointPause = false; prepare.resolve(); execute.resolve(); write.resolve(); rename.resolve(); finalized.resolve()
    await service.retryCleanup(); await service.stop(); await store.settleReads(); await registry.stop(); await files.retryClose(); await lease.retryRelease()
    expect(registry.status()).toMatchObject({ rawBytes: 0, parsedBytes: 0, nodes: 0 }); expect(held).toBe(false)
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('student-submission-s5-')) throw Error('Fixture scope')
    await fs.rm(root, { recursive: true })
  })
  return { root, service, registry, owner, other, request, identity, count, store, files, lease, time, events, snapshots, errors, release, factory, begin,
    prepare, preparing, execute, executing, write, writing, rename, renaming, finalized, finalizing,
    get beginCalls() { return beginCalls }, get primaryRenames() { return primaryRenames }, get storeCloses() { return storeCloses },
    releaseFault(value: boolean) { releaseFault = value }, queryFault(value: boolean) { queryFault = value }, closeFault(value: boolean) { closeFault = value },
    denyRead(value: boolean) { denyRead = value }, denyAfterRename(value: boolean) { denyAfterRename = value }, lostAck(value: boolean) { lostAck = value },
    full(value: boolean) { full = value }, unavailable(value: boolean) { unavailable = value }, onContentRelease(fn: () => void) { onContentRelease = fn },
    async read(kind: SubmissionStoreKind = 'ACCEPTED') {
      const v = decodeSubmissionDocument(await fs.readFile(join(root, 'storage', P[kind].filename))); if (!v.ok) throw Error(v.reason); return v.value
    } }
}

describe('E5-S5 source capture, owned current plan and one-slot routing', () => {
  it.each(['csharp', 'javascript'] as const)('commits eligible %s Accepted only after verified cleanup/release without exposing private data', async language => {
    const f = await fixture({ language }), compare = vi.spyOn(comparator, 'compareExactTyped'), reduce = vi.spyOn(reducer, 'reduceJudgeVerdict')
    const h = f.service.submit(1, f.request), done = await h.completion()
    expect(done).toMatchObject({ stage: 'SETTLED', verdict: 'Accepted', storage: { state: 'saved', recordKey: { storeKind: 'ACCEPTED' } } })
    const doc = await f.read(); expect(doc.records[0]).toMatchObject({ code: f.request.code, submissionId: h.submissionId,
      sourceRevision: 4, packageVersion: f.identity.packageVersion, signatureHash: f.identity.signatureHash,
      testSet: { hash: f.identity.officialHash, total: f.count, passed: f.count } })
    expect(f.events.indexOf('runtime-lease-close')).toBeLessThan(f.events.indexOf('storage-entry'))
    expect(f.events.indexOf('content-release')).toBeLessThan(f.events.indexOf('primary-dispatch'))
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.beginCalls).toBe(1); expect(compare).toHaveBeenCalledTimes(f.count); expect(reduce).toHaveBeenCalledTimes(1)
    expect(await f.files.inspect('FAILED')).toBeNull(); expect(f.service.status().active).toBe(false)
    expect(await f.store.completion(f.request.exerciseId)).toMatchObject({ state: 'COMPLETED' })
    expect(f.snapshots).toEqual([])
    expect(JSON.stringify([done, f.errors, f.service.status()])).not.toMatch(/PRIVATE_|expected|actual|diagnostics|testSetId|signatureHash|officialHash|cleanupProof|payloadDigest/)
  })
  it.each([
    ['javascript', 'wa', 'WrongAnswer'], ['csharp', 'compile', 'CompilationError'], ['javascript', 'compile', 'SyntaxError'],
    ['javascript', 'runtime', 'RuntimeError'], ['javascript', 'time', 'TimeLimitExceeded'], ['javascript', 'memory', 'MemoryLimitExceeded'], ['javascript', 'output', 'OutputLimitExceeded'],
  ] as const)('routes %s/%s to Failed with stable verdict %s', async (language, mode, verdict) => {
    const f = await fixture({ language, mode }), h = f.service.submit(1, f.request)
    expect(await h.completion()).toMatchObject({ stage: 'SETTLED', verdict, storage: { state: 'saved', recordKey: { storeKind: 'FAILED' } } })
    expect((await f.read('FAILED')).records[0]).toMatchObject({ verdict, submissionId: h.submissionId })
    expect(await f.files.inspect('ACCEPTED')).toBeNull(); expect(await f.store.completion(f.request.exerciseId)).toMatchObject({ state: 'NOT_COMPLETED' })
  })
  it('captures source/revision synchronously and selects actual identity only inside owned Prepare', async () => {
    const f = await fixture({ pausePrepare: true }), originalCode = f.request.code
    const h = f.service.submit(1, f.request)
    expect(f.factory).not.toHaveBeenCalled(); expect(f.registry.acquire).not.toHaveBeenCalled()
    f.request.code = 'draft edited after Submit'; f.request.sourceRevision = 999
    await f.preparing.promise; expect(f.registry.acquire).not.toHaveBeenCalled()
    expect(() => f.service.run(2, f.request)).toThrow(); expect(() => f.service.runJudge(2, f.request, f.identity)).toThrow(); expect(() => f.service.submit(2, f.request)).toThrow()
    f.prepare.resolve(); expect((await h.completion()).storage.state).toBe('saved')
    expect((await f.read()).records[0]).toMatchObject({ code: originalCode, sourceRevision: 4, signatureHash: f.identity.signatureHash })
    expect(f.registry.acquire).toHaveBeenCalledTimes(1)
  })
  it('keeps runJudge evidence-only and rejects Renderer-supplied identity/verdict flags', async () => {
    const f = await fixture(), h = f.service.runJudge(1, f.request, f.identity)
    expect((await h.judgeResult()).verdict).toBe('Accepted'); expect(f.beginCalls).toBe(0)
    expect(await f.files.inspect('ACCEPTED')).toBeNull()
    expect(() => f.service.submit(1, { ...f.request, verdict: 'Accepted' } as typeof f.request)).toThrow()
    expect(() => f.service.submit(1, { ...f.request, officialHash: f.identity.officialHash } as typeof f.request)).toThrow()
    expect(() => f.service.submit(1, { ...f.request, code: '\ud800' })).toThrow()
    expect(() => f.service.runJudge(1, f.request, { ...f.identity, selection: 'CURRENT' } as typeof f.identity)).toThrow()
  })
  it('missing plan never acquires a placeholder identity or creates a grade', async () => {
    const f = await fixture(), h = f.service.submit(1, { ...f.request, exerciseId: 'missing' })
    expect(await h.completion()).toMatchObject({ stage: 'SETTLED', verdict: null, storage: { state: 'not-requested', reason: 'PLAN_UNAVAILABLE' } })
    expect(f.beginCalls).toBe(0); expect(f.events).not.toContain('execute'); expect(f.service.status().active).toBe(false)
  })
  it('cancellation before Prepare completes retains then releases the same slot without grading', async () => {
    const f = await fixture({ pausePrepare: true }), h = f.service.submit(1, f.request); await f.preparing.promise
    f.service.invalidate(1, 'CONTEXT_CHANGED'); expect(f.service.status().active).toBe(true)
    f.prepare.resolve(); await f.service.retryCleanup(); await expect(h.completion()).rejects.toThrow()
    expect(f.service.status().active).toBe(false); expect(f.beginCalls).toBe(0)
    expect(f.registry.readiness(f.request.exerciseId).pinned).toBe(false)
  })
  it('delayed Registry acquisition across invalidation releases the acquired pin without initializing a late grade', async () => {
    const f = await fixture(), entered = gate(), pending = gate(), acquire = vi.mocked(f.registry.acquire).getMockImplementation()!
    vi.mocked(f.registry.acquire).mockImplementationOnce(async (...args) => { const lease = await acquire(...args); entered.resolve(); await pending.promise; return lease })
    const h = f.service.submit(1, f.request); await entered.promise
    f.service.invalidate(1, 'LEARNING_LEFT'); expect(f.service.status().active).toBe(true)
    pending.resolve(); await expect(h.completion()).rejects.toThrow(); await f.service.retryCleanup()
    expect(f.beginCalls).toBe(0); expect(f.registry.readiness(f.request.exerciseId).pinned).toBe(false); expect(f.service.status().active).toBe(false)
  })
  it('protocol infrastructure failure never creates a graded record', async () => {
    const f = await fixture({ mode: 'protocol' }), h = f.service.submit(1, f.request)
    expect(await h.completion()).toMatchObject({ verdict: 'InfrastructureFailure', storage: { state: 'not-requested' } })
    expect(f.beginCalls).toBe(0); expect(await f.files.inspect('FAILED')).toBeNull()
  })
  it('Submit refs remain rejected by public Run snapshot/completion/stop routes during and after settlement', async () => {
    const f = await fixture({ pauseExecute: true }), h = f.service.submit(1, f.request); await f.executing.promise
    for (const owner of [1, 2]) {
      expect(() => f.service.snapshot(owner, h.reference)).toThrow(); expect(() => f.service.completion(owner, h.reference)).toThrow()
      await expect(f.service.stopSession(owner, { ...h.reference, reason: 'LEARNING_LEFT' })).rejects.toThrow()
    }
    f.execute.resolve(); await h.completion(); expect(() => f.service.snapshot(1, h.reference)).toThrow()
    const run = f.service.run(2, f.request); await f.service.completion(2, { sessionId: run.sessionId, generation: run.generation })
    expect(f.beginCalls).toBe(1); expect(() => h.status()).toThrow()
  })
})

describe('E5-S5 retained storage, guard revocation and retry', () => {
  it('joins concurrent continuation/cleanup/retry without relaunch, recompare or duplicate commit', async () => {
    const f = await fixture({ pauseWrite: true }), compare = vi.spyOn(comparator, 'compareExactTyped'), reduce = vi.spyOn(reducer, 'reduceJudgeVerdict')
    const h = f.service.submit(1, f.request); await f.writing.promise
    expect(h.status()).toMatchObject({ verdict: 'Accepted', storage: { state: 'pending' }, stage: 'STORAGE' })
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(f.request.exerciseId).pinned).toBe(false)
    const retry = h.retry(), cleanup1 = f.service.retryCleanup(), cleanup2 = f.service.retryCleanup()
    expect(() => f.service.run(2, f.request)).toThrow(); expect(f.storeCloses).toBe(0)
    f.write.resolve(); await Promise.all([retry, cleanup1, cleanup2])
    expect((await h.completion()).storage.state).toBe('saved'); expect((await f.read()).records).toHaveLength(1)
    expect(f.beginCalls).toBe(1); expect(f.primaryRenames).toBe(1); expect(f.storeCloses).toBe(1)
    expect(compare).toHaveBeenCalledTimes(f.count); expect(reduce).toHaveBeenCalledTimes(1)
    await h.retry(); expect(f.beginCalls).toBe(1)
  })
  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT', 'OWNER_LOST'] as const)('revokes %s before dispatch, draining staging without grade', async reason => {
    const f = await fixture({ pauseWrite: true }), h = f.service.submit(1, f.request); await f.writing.promise
    f.service.invalidate(1, reason); expect(() => h.status()).toThrow(); expect(f.service.status().active).toBe(true)
    f.write.resolve(); await f.service.retryCleanup()
    expect(f.primaryRenames).toBe(0); expect(await f.files.inspect('ACCEPTED')).toBeNull(); expect(f.lease.ownsLease).toBe(false)
    expect(f.service.status().active).toBe(false)
  })
  it('owner replacement with the same numeric id cannot revive captured admission authority', async () => {
    const f = await fixture({ pauseWrite: true }); f.service.submit(1, f.request); await f.writing.promise
    f.owner.dead = true; f.owner.emit('destroyed'); const replacement = new Owner(1); f.service.observe(replacement)
    f.write.resolve(); await f.service.retryCleanup(); expect(f.primaryRenames).toBe(0)
  })
  it('owner loss synchronously during content release prevents any storage continuation from granting authority', async () => {
    const f = await fixture(); f.onContentRelease(() => f.service.invalidate(1, 'CONTEXT_CHANGED'))
    const h = f.service.submit(1, f.request); await expect(h.completion()).rejects.toThrow(); await f.service.retryCleanup()
    expect(f.beginCalls).toBe(0); expect(f.primaryRenames).toBe(0); expect(f.service.status().active).toBe(false)
  })
  it('shutdown before primary dispatch revokes storage authority while draining the original staging I/O', async () => {
    const f = await fixture({ pauseWrite: true }); f.service.submit(1, f.request); await f.writing.promise
    f.service.beginShutdown(); expect(f.service.status().active).toBe(true); expect(f.lease.ownsLease).toBe(true)
    f.write.resolve(); await f.service.stop()
    expect(f.primaryRenames).toBe(0); expect(await f.files.inspect('ACCEPTED')).toBeNull(); expect(f.lease.ownsLease).toBe(false)
  })
  it('owner loss after dispatch settles the admitted rename, saves once and suppresses stale publication', async () => {
    const f = await fixture({ pauseRename: true }), h = f.service.submit(1, f.request); await f.renaming.promise
    f.service.invalidate(1, 'OWNER_LOST'); expect(() => h.status()).toThrow(); expect(f.lease.ownsLease).toBe(true)
    f.rename.resolve(); await f.service.retryCleanup()
    expect(f.service.status().active).toBe(false); expect((await f.read()).records).toHaveLength(1); expect(f.primaryRenames).toBe(1)
    await expect(h.completion()).rejects.toThrow(); expect(f.snapshots).toEqual([])
  })
  it('expiry of original precommit window never renews on retry', async () => {
    const f = await fixture({ pauseWrite: true }), h = f.service.submit(1, f.request); await f.writing.promise
    f.time.advance(15001); expect((await h.completion()).storage.state).toBe('pending'); expect(f.service.status().active).toBe(true)
    f.write.resolve(); expect(await h.retry()).toMatchObject({ verdict: 'Accepted', storage: { state: 'failed', reason: 'EXPIRED' }, stage: 'SETTLED' })
    await h.retry(); expect(f.primaryRenames).toBe(0); expect(f.beginCalls).toBe(1)
  })
  it('unknown read-back retains the same slot/lease and reconciles without rerun or append', async () => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped')
    f.denyAfterRename(true); const h = f.service.submit(1, f.request)
    expect(await h.completion()).toMatchObject({ verdict: 'Accepted', storage: { state: 'unknown', recoveryPending: true }, stage: 'STORAGE' })
    expect(f.service.status().active).toBe(true); expect(f.lease.ownsLease).toBe(true)
    expect(() => f.service.submit(2, f.request)).toThrow(); f.denyRead(false); f.denyAfterRename(false)
    expect(await h.retry()).toMatchObject({ stage: 'SETTLED', storage: { state: 'saved' } })
    expect(f.beginCalls).toBe(1); expect(f.primaryRenames).toBe(1); expect(compare).toHaveBeenCalledTimes(f.count)
  })
  it('lost ACK reconciles the one committed record with no historical result authority', async () => {
    const f = await fixture(); f.lostAck(true)
    const h = f.service.submit(1, f.request); expect((await h.completion()).storage.state).toBe('saved')
    await h.retry(); expect(f.beginCalls).toBe(1); expect(f.primaryRenames).toBe(1); expect((await f.read()).records).toHaveLength(1)
  })
  it('verified saved with failed lease close keeps slot until resource settlement', async () => {
    const f = await fixture(); f.closeFault(true)
    const h = f.service.submit(1, f.request); expect(await h.completion()).toMatchObject({ storage: { state: 'saved' }, stage: 'STORAGE' })
    expect(f.service.status().active).toBe(true); expect(() => f.service.run(2, f.request)).toThrow()
    f.closeFault(false); expect(await h.retry()).toMatchObject({ stage: 'SETTLED', storage: { state: 'saved' } }); expect(f.beginCalls).toBe(1)
  })
  it.each(['full', 'unavailable'] as const)('keeps Judge verdict separate from %s storage refusal and safely permits later Run', async mode => {
    const f = await fixture({ mode: 'wa' }); if (mode === 'full') f.full(true); else f.unavailable(true)
    const h = f.service.submit(1, f.request)
    expect(await h.completion()).toMatchObject({ verdict: 'WrongAnswer', storage: { state: 'failed', reason: mode === 'full' ? 'FULL' : 'UNAVAILABLE' }, stage: 'SETTLED' })
    expect(await f.files.inspect('FAILED')).toBeNull(); expect(await f.files.inspect('ACCEPTED')).toBeNull()
    const run = f.service.run(2, f.request); await f.service.completion(2, { sessionId: run.sessionId, generation: run.generation })
  })
  it('failed content release retains the operation; retry finalizes and stores once without re-execution', async () => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped'); f.releaseFault(true)
    const h = f.service.submit(1, f.request); expect((await h.completion()).storage.state).toBe('not-requested')
    expect(f.service.status().active).toBe(true); expect(f.beginCalls).toBe(0)
    f.releaseFault(false); expect((await h.retry()).storage.state).toBe('saved')
    expect(compare).toHaveBeenCalledTimes(f.count); expect(f.events.filter(e => e === 'execute')).toHaveLength(f.count)
  })
  it('PROCESS_UNRESOLVED cleanup cannot create a grade or be bypassed by retry', async () => {
    const f = await fixture({ pauseExecute: true }), h = f.service.submit(1, f.request); await f.executing.promise
    f.queryFault(true); f.execute.resolve(); await h.completion(); expect(f.beginCalls).toBe(0); expect(f.service.status().active).toBe(true)
    f.queryFault(false); expect(await h.retry()).toMatchObject({ verdict: 'InfrastructureFailure', storage: { state: 'not-requested' } })
  })
  it('retains pending FINALIZED checkpoint at12s, then joins cleanup and commits once', async () => {
    const f = await fixture({ pauseFinalized: true }), h = f.service.submit(1, f.request); await f.finalizing.promise
    f.time.advance(12001); await h.completion(); expect(f.service.status().active).toBe(true); expect(f.beginCalls).toBe(0)
    f.finalized.resolve(); await f.service.retryCleanup(); expect((await h.retry()).storage.state).toBe('saved'); expect(f.beginCalls).toBe(1)
  })
})

describe('E5-S5 managed shutdown storage joins', () => {
  it.each(['accepted', 'wa'] as const)('keeps %s storage wait independent of runtime12s and blocks dependency shutdown until safe retry', async mode => {
    const f = await fixture({ mode, pauseRename: true }); f.service.submit(1, f.request); await f.renaming.promise
    const dependencyStopped = vi.fn(), app = new DesktopApplication([
      { name: 'SubmissionStorageDependency', stop: dependencyStopped }, { name: f.service.name, stop: () => f.service.stop() },
    ])
    app.subscribe(s => { if (s.state === 'STOPPING') f.service.beginShutdown() }); await app.start()
    const stopping = app.shutdown().then(() => undefined, error => error)
    // Allow stop() to reach its separate target storage join, without real time waits.
    for (let i = 0; i < 12; i++) await Promise.resolve()
    expect(f.time.remaining().map(Math.round)).toContain(mode === 'accepted' ? 15000 : 10000)
    if (mode === 'accepted') {
      f.time.advance(12001); await Promise.resolve(); expect(dependencyStopped).not.toHaveBeenCalled(); expect(f.service.status().active).toBe(true)
      f.time.advance(3000)
    } else f.time.advance(10001)
    expect(await stopping).toMatchObject({ cause: { details: { reason: 'SUBMISSION_STORAGE_PENDING' } } })
    expect(app.getStatus().state).toBe('STOPPING'); expect(dependencyStopped).not.toHaveBeenCalled()
    expect(f.lease.ownsLease).toBe(true); expect(f.storeCloses).toBe(0)
    f.rename.resolve(); await f.service.retryCleanup(); await app.shutdown()
    expect(dependencyStopped).toHaveBeenCalledOnce(); expect(f.service.status().state).toBe('STOPPED')
    expect((await f.read(mode === 'accepted' ? 'ACCEPTED' : 'FAILED')).records).toHaveLength(1)
  })
})
