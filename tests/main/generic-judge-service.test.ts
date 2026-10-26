import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseService, type ExerciseOwner } from '../../src/main/services/learning/exercise-service'
import type { OfficialJudgeView, OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { OfficialAdapterFactory, OfficialCaseObservation, OfficialLanguageEvidence } from '../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { exerciseCoreError, type ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { DomainError } from '../../src/main/errors/app-error'
import { FileExerciseCheckpointStore, type ExerciseCheckpoint } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import * as comparator from '../../src/main/services/learning/judge/exact-typed-comparator'
import * as reducer from '../../src/main/services/learning/judge/verdict-reducer'
import * as judges from '../../src/main/services/learning/judge-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { EXERCISE_CHANNELS } from '../../src/shared/contracts/exercise'

class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const request = { exerciseId: 'ch2-04', language: 'csharp' as const, code: 'PRIVATE_SOURCE', sourceRevision: 4 }
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const clean = () => ({ members: [], retained: [], activeProcesses: 0, totalProcesses: 0, observerSettled: true, coverageComplete: true, unresolvedErrors: false })
const dispose: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of dispose.splice(0)) await close(); vi.restoreAllMocks() })
function clock() {
  let now = performance.now()
  const timers = new Map<object, { due: number; callback: () => void }>()
  const value: ExerciseClock = { now: () => now, schedule(callback, ms) {
    const key = {}; timers.set(key, { due: now + ms, callback }); return () => { timers.delete(key) }
  } }
  return { value, advance(ms: number) { now += ms }, expireNext() {
    now = Math.min(...[...timers.values()].map(t => t.due))
    for (const [key, timer] of [...timers]) if (timer.due <= now) { timers.delete(key); timer.callback() }
  } }
}
async function fixture(options: { language?: 'csharp' | 'javascript'; pausePrepare?: boolean; clock?: ExerciseClock;
  checkpoint?: (record: ExerciseCheckpoint) => Promise<void>; phaseAdvance?: (phase: 'prepare' | 'compile' | 'execute') => void } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'e4-s3-judge-')), registry = await sourceRegistry()
  const metadata = JSON.parse(await readFile('resources/learning/exercises/ch2-04/exercise.json', 'utf8'))
  const count = (JSON.parse(await readFile('resources/learning/exercises/ch2-04/judge/v1.json', 'utf8')).cases as unknown[]).length
  const identity: OfficialPlanIdentity = { exerciseId: metadata.exerciseId, packageVersion: metadata.packageVersion,
    testSetId: metadata.official.testSetId, testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version,
    signatureHash: metadata.signature.hash, officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
  const value = { ...request, language: options.language ?? 'csharp' }
  const prepareEntered = gate(), prepareContinue = gate(), executeEntered = gate(), executeContinue = gate()
  const events: string[] = [], snapshots: unknown[] = [], errors: unknown[] = []
  let pauseExecute = false, wrongAt = -1, failAt = -1, compileFail = false, queryFault = false, releaseFault = false, holdBorrow = false
  let failureKind: 'USER_EXCEPTION' | 'INVALID_RESULT' | 'PROTOCOL_FAILURE' = 'USER_EXCEPTION'
  let afterBarrier: (() => void) | undefined, onRelease: (() => void) | undefined
  let borrow: Awaited<ReturnType<Awaited<ReturnType<Parameters<OfficialAdapterFactory>[2]>>['representInput']>> | undefined
  const acquire = registry.acquire.bind(registry)
  const release = vi.fn()
  vi.spyOn(registry, 'acquire').mockImplementation(async (id, owner) => {
    const lease = await acquire(id, owner)
    return { get data() { return lease.data }, copy: lease.copy, copyCooperative: lease.copyCooperative,
      represent: lease.represent, representCooperative: lease.representCooperative, packet: lease.packet, packetCooperative: lease.packetCooperative,
      release() { release(); events.push('content-release'); onRelease?.(); if (releaseFault) throw Error('PRIVATE_RELEASE_FAILURE'); lease.release() } }
  })
  const dropBorrow = () => { borrow?.release(); borrow = undefined }
  const factory = vi.fn<OfficialAdapterFactory>((r, _workspace, load) => {
    let inputs: Awaited<ReturnType<typeof load>> | undefined, signal: AbortSignal | undefined
    let compile: OfficialLanguageEvidence['compile'] = null, syntax: OfficialLanguageEvidence['syntax'] = null
    let failure: OfficialLanguageEvidence['failure'] = null
    const cases: OfficialCaseObservation[] = []
    return {
      hasNextCase: () => !!inputs && !failure && cases.length < inputs.execution.caseCount,
      async runPhase(phase, context) {
        events.push(phase)
        if (phase === 'prepare') {
          signal = context.signal; prepareEntered.resolve(); if (options.pausePrepare) await prepareContinue.promise
          inputs = await load(context)
          expect(Object.keys(inputs).sort()).toEqual(['execution', 'representInput'])
          expect(Object.keys(inputs.execution).sort()).toEqual(['caseCount', 'inputAt', 'signature'])
          expect(JSON.stringify(inputs.execution)).not.toMatch(/expected|visibility|testSetId|officialHash/)
        }
        if (phase === 'compile') {
          if (r.language === 'csharp') {
            const f = compileFail ? { kind: 'COMPILE_ERROR' as const, phase: 'compile' as const, caseIndex: null } : null
            compile = { status: compileFail ? 'FAILED' : 'SUCCEEDED', exitCode: compileFail ? 1 : 0, failure: f,
              diagnostics: compileFail ? [{ code: 'CS1503', severity: 'error', source: 'harness', line: 1, column: 1 }] : [], stdout: 'PRIVATE_DIAGNOSTIC', stderr: '' }
            failure = f
          } else {
            const f = compileFail ? { kind: 'SYNTAX_ERROR' as const, phase: 'compile' as const, caseIndex: null } : null
            syntax = { status: compileFail ? 'FAILED' : 'SUCCEEDED', exitCode: compileFail ? 1 : 0, failure: f,
              diagnostics: compileFail ? [{ code: 'SYNTAX_ERROR', source: 'solution', line: null, column: null }] : [], stdout: '', stderr: '' }
            failure = f
          }
          if (compileFail) throw exerciseCoreError('COMPILATION_FAILED')
        }
        if (phase === 'execute') {
          const caseIndex = cases.length, args = inputs!.execution.inputAt(caseIndex)
          borrow = await inputs!.representInput(caseIndex); executeEntered.resolve(); if (pauseExecute) await executeContinue.promise
          if (context.signal.aborted) {
            cases.push({ caseIndex, language: r.language, process: null, kind: 'INTERRUPTED', reason: 'CANCELLED' }); throw context.signal.reason
          }
          const process = { phase: 'execute' as const, exitCode: 0, processExited: true, stdoutSettled: true, stderrSettled: true,
            observerSettled: true, failure: null, jobMemoryLimitObserved: false }
          if (caseIndex === failAt) {
            const kind = failureKind
            cases.push(kind === 'PROTOCOL_FAILURE' ? { caseIndex, language: r.language, process, kind, reason: 'MALFORMED' }
              : { caseIndex, language: r.language, process: { ...process, exitCode: r.language === 'javascript' ? 1 : 0,
                failure: r.language === 'javascript' ? 'NONZERO_EXIT' : null }, kind, stdout: 'PRIVATE_CONSOLE', stderr: '' })
            failure = { kind: kind === 'PROTOCOL_FAILURE' && r.language === 'javascript' ? 'PROTOCOL_FAILURE' : 'RUNTIME_ERROR', phase: 'execute', caseIndex }
            throw exerciseCoreError(failure.kind === 'PROTOCOL_FAILURE' ? 'INTERNAL_ERROR' : 'RUNTIME_FAILED')
          }
          // Controlled fake process implements public Divide contract independently;
          // no Expected/visibility/Judge view reaches this input-only adapter.
          const a = args[0] as number, b = args[1] as number
          cases.push({ caseIndex, language: r.language, process, kind: 'RETURNED', actual: [Math.floor(a / b), a % b + (caseIndex === wrongAt ? 1 : 0)],
            stdout: 'PRIVATE_CONSOLE', stderr: '' })
        }
        options.phaseAdvance?.(phase)
      },
      async verifyBetweenCases() { events.push('barrier'); if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); if (!holdBorrow) dropBorrow(); afterBarrier?.() },
      officialEvidence() {
        const reason = signal?.reason instanceof DomainError ? signal.reason.details?.reason : undefined
        return { compile, syntax, cases, notRunCaseIndices: Array.from({ length: (inputs?.execution.caseCount ?? 0) - cases.length }, (_, i) => cases.length + i),
          failure: failure ?? (reason === 'OPERATION_TIMEOUT' ? { kind: 'TIMEOUT', phase: 'operation', caseIndex: null } : null) }
      },
      async terminate() { events.push('terminate') }, async settleObservers() {},
      async evidence() { if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); return clean() },
      async release() { if (!holdBorrow) dropBorrow() }, async closeHandles() {},
    }
  })
  const publicEntered = gate(), publicContinue = gate(); let pausePublic = false
  const publicAdapter: ExerciseRuntimeAdapter = { async runPhase() { publicEntered.resolve(); if (pausePublic) await publicContinue.promise },
    async terminate() {}, async settleObservers() {}, async evidence() { return clean() }, async release() {}, async closeHandles() {} }
  const service = new ExerciseService({ root, clock: options.clock, leases: { acquire: async () => ({ release: async () => {} }) },
    official: { registry, createAdapter: factory }, createExecution: () => ({ adapter: publicAdapter, phases: ['execute'] }),
    onSnapshot: (_owner, snapshot) => snapshots.push(snapshot), onCleanupError: error => errors.push(error),
    checkpointStore(workspace) {
      const store = new FileExerciseCheckpointStore(workspace), write = store.write.bind(store)
      vi.spyOn(store, 'write').mockImplementation(async record => { await options.checkpoint?.(record); await write(record) }); return store
    },
  })
  const owner = new Owner(1), other = new Owner(2)
  service.start(); await service.ready(); service.observe(owner as ExerciseOwner); service.observe(other as ExerciseOwner)
  dispose.push(async () => {
    queryFault = false; releaseFault = false; holdBorrow = false; afterBarrier = undefined; onRelease = undefined
    prepareContinue.resolve(); executeContinue.resolve(); publicContinue.resolve(); dropBorrow()
    await service.stop(); await registry.stop(); expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e4-s3-judge-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  })
  return { service, owner, other, registry, identity, request: value, count, events, snapshots, errors, release, factory,
    prepareEntered, prepareContinue, executeEntered, executeContinue, publicEntered, publicContinue,
    wrongAt(index: number) { wrongAt = index }, failAt(index: number, kind: typeof failureKind) { failAt = index; failureKind = kind },
    compileFail() { compileFail = true }, pauseExecute() { pauseExecute = true }, pausePublic() { pausePublic = true },
    queryFault(v: boolean) { queryFault = v }, releaseFault(v: boolean) { releaseFault = v },
    holdBorrow(v: boolean) { holdBorrow = v }, dropBorrow,
    afterBarrier(fn: () => void) { afterBarrier = fn }, onRelease(fn: () => void) { onRelease = fn },
  }
}

describe('same-operation Main-private Judge (controlled adapters, real Core/Registry)', () => {
  it.each(['csharp', 'javascript'] as const)('all-pass %s seals after verified cleanup/release, before slot release', async language => {
    const original = reducer.reduceJudgeVerdict
    const f = await fixture({ language }), compare = vi.spyOn(comparator, 'compareExactTyped'), reduce = vi.spyOn(reducer, 'reduceJudgeVerdict')
    reduce.mockImplementation(input => {
      expect(f.service.status().active).toBe(true); expect(f.release).toHaveBeenCalledTimes(1)
      expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
      expect(input.ownerCurrent).toBe(true); expect(input.cleanup).toMatchObject({ contentReleased: true, representationBorrows: 0, retainedPackageTasks: 0 })
      return original(input)
    })
    const h = f.service.runJudge(1, f.request, f.identity), result = await h.judgeResult()
    expect(result).toMatchObject({ state: 'FINAL', verdict: 'Accepted', attemptedCases: f.count, passedCases: f.count,
      eligibility: { kind: 'ACCEPTED_CANDIDATE' }, cleanup: { snapshot: { state: 'FINALIZED', proof: 'VERIFIED', workspace: 'REMOVED', pendingIo: false } } })
    expect(compare).toHaveBeenCalledTimes(f.count); expect(reduce).toHaveBeenCalledTimes(1); expect(f.service.status().active).toBe(false)
    expect((await h.completion()).disposition).toBe('EXHAUSTED'); expect(await h.judgeResult()).toEqual(result); expect(reduce).toHaveBeenCalledTimes(1)
    expect(f.snapshots).toEqual([]); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|"actual"|"expected"|"stdout"|"diagnostics"/)
  })
  it.each([0, 3, 6])('WA at first/middle/final case %i stops with genuine suffix', async index => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped'); f.wrongAt(index)
    const h = f.service.runJudge(1, f.request, f.identity), result = await h.judgeResult(), raw = await h.completion()
    expect(result).toMatchObject({ verdict: 'WrongAnswer', attemptedCases: index + 1, comparedCases: index + 1, eligibility: { kind: 'GRADED_FAILURE_CANDIDATE' } })
    expect(compare).toHaveBeenCalledTimes(index + 1); expect(f.events.filter(e => e === 'execute')).toHaveLength(index + 1)
    expect(raw.disposition).toBe('CONSUMER_STOP'); expect(raw.cases.every(row => row.kind === 'RETURNED')).toBe(true)
    expect(result.notRunCaseIndices).toEqual(Array.from({ length: f.count - index - 1 }, (_, i) => index + i + 1))
  })
  it.each(['USER_EXCEPTION', 'INVALID_RESULT', 'PROTOCOL_FAILURE'] as const)('does not compare failed runtime case %s or turn protocol into student error', async kind => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped'); f.failAt(1, kind)
    const result = await f.service.runJudge(1, f.request, f.identity).judgeResult()
    expect(result.verdict).toBe(kind === 'PROTOCOL_FAILURE' ? 'InfrastructureFailure' : 'RuntimeError')
    expect(result.eligibility.kind).toBe(kind === 'PROTOCOL_FAILURE' ? 'INELIGIBLE' : 'GRADED_FAILURE_CANDIDATE')
    expect(compare).toHaveBeenCalledTimes(1); expect(result.attemptedCases).toBe(2)
  })
  it.each(['csharp', 'javascript'] as const)('maps trusted %s compile/syntax with no fabricated cases', async language => {
    const f = await fixture({ language }), compare = vi.spyOn(comparator, 'compareExactTyped'); f.compileFail()
    const result = await f.service.runJudge(1, f.request, f.identity).judgeResult()
    expect(result.verdict).toBe(language === 'csharp' ? 'CompilationError' : 'SyntaxError')
    expect(result.eligibility.kind).toBe('GRADED_FAILURE_CANDIDATE'); expect(result.decisions).toEqual([]); expect(compare).not.toHaveBeenCalled()
  })
  it('acquires/initializes only in owned Prepare; no initialization race or second slot', async () => {
    const f = await fixture({ pausePrepare: true }), init = vi.spyOn(judges, 'createOfficialJudge')
    const h = f.service.runJudge(1, f.request, f.identity)
    expect(f.factory).not.toHaveBeenCalled(); expect(f.registry.acquire).not.toHaveBeenCalled()
    await f.prepareEntered.promise; expect(f.registry.acquire).not.toHaveBeenCalled()
    expect(() => f.service.run(2, f.request)).toThrow(); expect(() => f.service.runJudge(2, f.request, f.identity)).toThrow()
    f.prepareContinue.resolve(); expect((await h.judgeResult()).verdict).toBe('Accepted')
    expect(init).toHaveBeenCalled(); expect(f.events.filter(e => e === 'prepare')).toHaveLength(1)
  })
  it('Judge cannot bypass a public Run owning the existing slot', async () => {
    const f = await fixture(); f.pausePublic()
    const snapshot = f.service.run(1, f.request), done = f.service.completion(1, { sessionId: snapshot.sessionId, generation: snapshot.generation })
    await f.publicEntered.promise; expect(() => f.service.runJudge(2, f.request, f.identity)).toThrow()
    expect(f.factory).not.toHaveBeenCalled(); expect(f.registry.acquire).not.toHaveBeenCalled()
    f.publicContinue.resolve(); await done
  })
  it('requires VERIFIED barrier before any Expected read and revokes reads after close/release', async () => {
    const f = await fixture(), create = judges.createOfficialJudge
    let view: OfficialJudgeView | undefined; const reads: number[] = []
    vi.spyOn(judges, 'createOfficialJudge').mockImplementation(() => {
      const engine = create()
      return { ...engine, initialize(v) { view = v; engine.initialize({ ...v, expectedAt(index) {
        expect(f.events.at(-1)).toBe('barrier'); reads.push(index); return v.expectedAt(index)
      } }) } }
    })
    f.releaseFault(true)
    const h = f.service.runJudge(1, f.request, f.identity); expect((await h.judgeResult()).eligibility.kind).toBe('INELIGIBLE')
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    expect(reads).toEqual(Array.from({ length: f.count }, (_, i) => i)); expect(() => view!.expectedAt(0)).toThrow() // Closed but still pinned.
    f.releaseFault(false); await f.service.retryCleanup(); expect((await h.judgeResult()).verdict).toBe('Accepted')
    expect(() => view!.expectedAt(0)).toThrow() // Released too.
    await f.service.retryCleanup(); expect(reads).toHaveLength(f.count)
  })
  it('barrier failure retains slot/lease and never compares; retry does not relaunch', async () => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped'); f.pauseExecute()
    const h = f.service.runJudge(1, f.request, f.identity); await f.executeEntered.promise
    f.queryFault(true); f.executeContinue.resolve(); const failed = await h.judgeResult()
    expect(failed.eligibility.kind).toBe('INELIGIBLE'); expect(compare).not.toHaveBeenCalled()
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.queryFault(false); await f.service.retryCleanup(); const result = await h.judgeResult()
    expect(result.verdict).toBe('InfrastructureFailure'); expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it.each(['before', 'after'] as const)('Core operation timeout %s comparison supersedes apparent success', async when => {
    const time = clock(), f = await fixture({ clock: time.value, phaseAdvance: when === 'before'
      ? phase => { if (phase === 'prepare') time.advance(9000); if (phase === 'compile') time.advance(29000) } : undefined }), original = comparator.compareExactTyped
    const compare = vi.spyOn(comparator, 'compareExactTyped')
    if (when === 'before') {
      // Reach operation60s while each phase and barrier stays within its own
      // budget: Prepare9s + compile29s + compile-barrier11s + execute-barrier11s.
      f.afterBarrier(() => time.advance(f.events.includes('execute') ? 11001 : 11000))
    } else {
      f.wrongAt(0)
      compare.mockImplementationOnce((...args) => { const result = original(...args); time.advance(60001); return result })
    }
    const result = await f.service.runJudge(1, f.request, f.identity).judgeResult()
    expect(result.verdict, JSON.stringify({ endReason: result.endReason, failure: result.failure, eligibility: result.eligibility,
      attempted: result.attemptedCases, compared: result.comparedCases, cleanup: result.cleanup })).toBe('TimeLimitExceeded')
    expect(result.eligibility.kind).toBe('GRADED_FAILURE_CANDIDATE')
    expect(compare).toHaveBeenCalledTimes(when === 'before' ? 0 : 1); expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
  })
  it.each(['expected', 'configuration', 'throw'] as const)('invalid Judge %s fails infrastructure through the existing consumer failure path', async mode => {
    const f = await fixture(), create = judges.createOfficialJudge
    vi.spyOn(judges, 'createOfficialJudge').mockImplementation(() => {
      const engine = create(); return { ...engine, initialize(view) {
        if (mode === 'expected') engine.initialize({ ...view, expectedAt: () => true })
        if (mode === 'configuration') engine.initialize({ ...view, identity: { ...view.identity, comparatorVersion: 2 } } as unknown as OfficialJudgeView)
        if (mode === 'throw') engine.initialize({ ...view, expectedAt() { throw Error('PRIVATE_EXPECTED_EXCEPTION') } })
      } }
    })
    const result = await f.service.runJudge(1, f.request, f.identity).judgeResult()
    expect(result.verdict).toBe('InfrastructureFailure'); expect(result.eligibility.kind).toBe('INELIGIBLE')
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1); expect(f.snapshots).toEqual([])
    expect(JSON.stringify(f.errors)).not.toContain('PRIVATE_EXPECTED_EXCEPTION')
  })
  it('invalid/missing plan cannot fall back to samples or grade', async () => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped')
    const h = f.service.runJudge(1, f.request, { ...f.identity, signatureHash: 'a'.repeat(64) })
    expect((await h.judgeResult()).verdict).toBe('InfrastructureFailure'); expect(compare).not.toHaveBeenCalled()
    expect((await h.completion()).planAcquired).toBe(false); expect(f.events).not.toContain('execute')
    const missing = { ...f.request, exerciseId: 'missing' }
    const result = await f.service.runJudge(1, missing, { ...f.identity, exerciseId: missing.exerciseId }).judgeResult()
    expect(result.eligibility.kind).toBe('INELIGIBLE'); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('failed Prepare Judge initialization keeps its release handle and never launches cases', async () => {
    const f = await fixture(), create = judges.createOfficialJudge, compare = vi.spyOn(comparator, 'compareExactTyped')
    vi.spyOn(judges, 'createOfficialJudge').mockImplementation(() => {
      const engine = create(); return { ...engine, initialize() { throw Error('PRIVATE_INITIALIZER_FAILURE') } }
    })
    const result = await f.service.runJudge(1, f.request, f.identity).judgeResult()
    expect(result.verdict).toBe('InfrastructureFailure'); expect(result.eligibility.kind).toBe('INELIGIBLE')
    expect(compare).not.toHaveBeenCalled(); expect(f.events).not.toContain('execute')
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(false); expect(f.service.status().active).toBe(false)
    expect(JSON.stringify(f.errors)).not.toContain('PRIVATE_INITIALIZER_FAILURE')
  })
  it.each(['navigation', 'context', 'leave', 'shutdown', 'destroyed'] as const)('suppresses eligibility on %s while retaining ongoing ownership', async mode => {
    const f = await fixture(); f.pauseExecute()
    const h = f.service.runJudge(1, f.request, f.identity); await f.executeEntered.promise
    if (mode === 'navigation') f.owner.emit('did-start-navigation', {}, '', false, true)
    if (mode === 'context') f.service.invalidate(1, 'CONTEXT_CHANGED')
    if (mode === 'leave') f.service.invalidate(1, 'LEARNING_LEFT')
    if (mode === 'shutdown') f.service.beginShutdown()
    if (mode === 'destroyed') { f.owner.dead = true; f.owner.emit('destroyed') }
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.executeContinue.resolve(); expect((await h.judgeResult()).verdict).toBe('CancelledInvalidated')
    expect(f.snapshots).toEqual([]); expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
  })
  it('rechecks owner after content release and cannot revive old results after reload/new generation', async () => {
    const f = await fixture(); f.onRelease(() => f.owner.emit('did-start-navigation', {}, '', false, true))
    const h = f.service.runJudge(1, f.request, f.identity)
    expect((await h.judgeResult()).verdict).toBe('CancelledInvalidated')
    f.onRelease(() => {}); f.owner.emit('did-finish-load')
    expect((await h.judgeResult()).eligibility.kind).toBe('INELIGIBLE')
    const next = f.service.runJudge(1, f.request, f.identity); expect((await next.judgeResult()).verdict).toBe('Accepted')
    expect(next.reference.generation).toBeGreaterThan(h.reference.generation); expect((await h.judgeResult()).verdict).toBe('CancelledInvalidated')
  })
  it('retains a delayed Registry acquisition across invalidation without initializing/comparing a late plan', async () => {
    const f = await fixture(), entered = gate(), pending = gate(), acquire = vi.mocked(f.registry.acquire).getMockImplementation()!
    const compare = vi.spyOn(comparator, 'compareExactTyped')
    vi.mocked(f.registry.acquire).mockImplementationOnce(async (id, owner) => {
      const lease = await acquire(id, owner); entered.resolve(); await pending.promise; return lease
    })
    try {
      const h = f.service.runJudge(1, f.request, f.identity); await entered.promise
      f.service.invalidate(1, 'CONTEXT_CHANGED')
      expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
      expect(() => f.service.runJudge(2, f.request, f.identity)).toThrow()
      pending.resolve(); const result = await h.judgeResult()
      expect(result.verdict).toBe('CancelledInvalidated'); expect(compare).not.toHaveBeenCalled()
      expect(f.events).not.toContain('execute'); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
    } finally { pending.resolve() }
  })
  it('revokes a previously sealed result after idle navigation/reload, not just active invalidation', async () => {
    const f = await fixture(), h = f.service.runJudge(1, f.request, f.identity)
    expect((await h.judgeResult()).verdict).toBe('Accepted')
    f.owner.emit('did-start-navigation', {}, '', false, true); f.owner.emit('did-finish-load')
    expect((await h.judgeResult()).verdict).toBe('CancelledInvalidated')
    expect((await h.completion()).disposition).toBe('INVALIDATED')
  })
  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT'] as const)('revokes idle context receipt on %s after slot release', async reason => {
    const f = await fixture(), h = f.service.runJudge(1, f.request, f.identity)
    expect((await h.judgeResult()).verdict).toBe('Accepted')
    f.service.invalidate(1, reason)
    expect((await h.judgeResult()).verdict).toBe('CancelledInvalidated')
    expect((await h.completion()).disposition).toBe('INVALIDATED')
  })
  it('content release failure retains slot/pin; retry releases/finalizes once without compare/relaunch', async () => {
    const f = await fixture(), compare = vi.spyOn(comparator, 'compareExactTyped'), reduce = vi.spyOn(reducer, 'reduceJudgeVerdict')
    f.releaseFault(true); const h = f.service.runJudge(1, f.request, f.identity)
    expect((await h.judgeResult()).eligibility.kind).toBe('INELIGIBLE'); expect(f.service.status().active).toBe(true)
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(true); expect(() => f.service.run(2, f.request)).toThrow()
    f.releaseFault(false); await f.service.retryCleanup(); expect((await h.judgeResult()).verdict).toBe('Accepted')
    await f.service.retryCleanup(); await h.judgeResult()
    expect(compare).toHaveBeenCalledTimes(f.count); expect(f.events.filter(e => e === 'execute')).toHaveLength(f.count)
    expect(reduce.mock.results.filter(r => r.type === 'return' && r.value.eligibility.kind === 'ACCEPTED_CANDIDATE')).toHaveLength(1)
    expect(f.release).toHaveBeenCalledTimes(2); expect(JSON.stringify(f.errors)).not.toContain('PRIVATE_RELEASE_FAILURE')
  })
  it('preserves legacy Official raw completion failure across content release failure and retry', async () => {
    const f = await fixture(); f.releaseFault(true)
    const h = f.service.runOfficial(1, f.request, f.identity, () => 'STOP'), raw = await h.completion()
    expect(raw.disposition).toBe('EXECUTION_FAILURE'); expect(raw.failure?.kind).toBe('INFRASTRUCTURE_FAILURE')
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.releaseFault(false); await f.service.retryCleanup()
    expect((await h.completion()).disposition).toBe('CONSUMER_STOP')
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
  })
  it('an actual retained input borrow blocks release/eligibility until settled on the same operation', async () => {
    const f = await fixture(); f.holdBorrow(true); f.wrongAt(0)
    const h = f.service.runJudge(1, f.request, f.identity), result = await h.judgeResult()
    expect(result.eligibility.kind).toBe('INELIGIBLE'); expect(result.cleanup.representationBorrows).toBe(1)
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.holdBorrow(false); f.dropBorrow(); await f.service.retryCleanup()
    expect((await h.judgeResult()).verdict).toBe('WrongAnswer'); expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('a failed finalizer cannot publish a preview candidate; managed retry seals once without another release or comparison', async () => {
    const f = await fixture(), original = reducer.reduceJudgeVerdict, compare = vi.spyOn(comparator, 'compareExactTyped')
    const reduce = vi.spyOn(reducer, 'reduceJudgeVerdict').mockImplementationOnce(() => { throw Error('PRIVATE_FINALIZER_FAILURE') })
    const h = f.service.runJudge(1, f.request, f.identity)
    await expect(h.judgeResult()).rejects.toMatchObject({ details: { reason: 'OFFICIAL_JUDGE_FINALIZATION_FAILED' } })
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
    await expect(h.judgeResult()).rejects.toThrow(); expect(reduce).toHaveBeenCalledTimes(1)
    reduce.mockImplementation(original); await f.service.retryCleanup(); expect((await h.judgeResult()).verdict).toBe('Accepted')
    await h.judgeResult(); await f.service.retryCleanup()
    expect(reduce).toHaveBeenCalledTimes(2); expect(f.release).toHaveBeenCalledTimes(1); expect(compare).toHaveBeenCalledTimes(f.count)
    expect(JSON.stringify(f.errors)).not.toContain('PRIVATE_FINALIZER_FAILURE')
  })
  it('retains a pending FINALIZED checkpoint beyond caller wait; retry never compares/runs again', async () => {
    const time = clock(), entered = gate(), pending = gate()
    const f = await fixture({ clock: time.value, checkpoint: async r => { if (r.checkpoint === 'FINALIZED') { entered.resolve(); await pending.promise } } })
    const compare = vi.spyOn(comparator, 'compareExactTyped'), reduce = vi.spyOn(reducer, 'reduceJudgeVerdict')
    f.wrongAt(0); const h = f.service.runJudge(1, f.request, f.identity), result = h.judgeResult()
    await entered.promise; time.expireNext(); const blocked = await result
    expect(blocked.eligibility.kind).toBe('INELIGIBLE'); expect(blocked.cleanup.snapshot.pendingIo).toBe(true)
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    pending.resolve(); await f.service.retryCleanup(); expect((await h.judgeResult()).verdict).toBe('WrongAnswer')
    await f.service.retryCleanup(); expect(compare).toHaveBeenCalledTimes(1)
    expect(reduce.mock.results.filter(r => r.type === 'return' && r.value.eligibility.kind === 'GRADED_FAILURE_CANDIDATE')).toHaveLength(1)
    expect(f.release).toHaveBeenCalledTimes(1)
  })
  it('private Judge handle cannot select public snapshots/stop/IPC or emit hidden payload', async () => {
    const f = await fixture(), handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>(), send = vi.fn()
    const routes = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } })
    const ipc = new ExerciseIpcService(routes, f.service, () => {}, send); ipc.observe(f.owner); ipc.start()
    const event = { sender: { id: 1 }, senderFrame: { processId: 1, frameToken: 's3', detached: false, isDestroyed: () => false } }
    try {
      f.pauseExecute(); const h = f.service.runJudge(1, f.request, f.identity); await f.executeEntered.promise
      expect([...handlers.keys()].sort()).toEqual([EXERCISE_CHANNELS.run, EXERCISE_CHANNELS.snapshot, EXERCISE_CHANNELS.stop].sort())
      expect(() => f.service.completion(1, h.reference)).toThrow()
      const replies = [await handlers.get(EXERCISE_CHANNELS.snapshot)!(event, h.reference),
        await handlers.get(EXERCISE_CHANNELS.stop)!(event, { ...h.reference, reason: 'LEARNING_LEFT' }),
        await handlers.get(EXERCISE_CHANNELS.run)!(event, { ...f.request, judge: true })]
      expect(replies.every(r => r && typeof r === 'object' && 'ok' in r && r.ok === false)).toBe(true)
      expect(JSON.stringify(replies)).not.toMatch(/PRIVATE_|testSetId|officialHash|"expected"|"actual"/)
      f.executeContinue.resolve(); const result = await h.judgeResult()
      expect(result.verdict).toBe('Accepted'); expect((await h.completion()).cases[0].kind).toBe('RETURNED')
      expect(f.snapshots).toEqual([]); expect(send).not.toHaveBeenCalled()
    } finally { ipc.stop() }
  })
})
