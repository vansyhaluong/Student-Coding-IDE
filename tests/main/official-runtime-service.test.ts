import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseService, type ExerciseOwner } from '../../src/main/services/learning/exercise-service'
import type { OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { OfficialAdapterFactory, OfficialCaseObservation, OfficialLanguageAdapter, OfficialSettledCaseConsumer } from '../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'
import type { ExerciseClock } from '../../src/main/services/learning/runtime/exercise-limits'
import { performance } from 'node:perf_hooks'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import { FileExerciseCheckpointStore } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import type { ExerciseCheckpoint } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import type { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { EXERCISE_CHANNELS } from '../../src/shared/contracts/exercise'

class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const request = { exerciseId: 'ch2-04', language: 'csharp' as const, code: 'PRIVATE_CODE_SENTINEL', sourceRevision: 1 }
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const cleanEvidence = () => ({ members: [], retained: [], totalProcesses: 0, activeProcesses: 0, observerSettled: true, coverageComplete: true, unresolvedErrors: false })
const dispose: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of dispose.splice(0)) await close(); vi.restoreAllMocks() })

async function fixture(options: { pausePrepare?: boolean; checkpoint?: (record: ExerciseCheckpoint) => Promise<void>; clock?: ExerciseClock } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'e3-s4-service-')), registry = await sourceRegistry()
  const m = JSON.parse(await readFile('resources/learning/exercises/ch2-04/exercise.json', 'utf8'))
  const j = JSON.parse(await readFile('resources/learning/exercises/ch2-04/judge/v1.json', 'utf8'))
  const identity: OfficialPlanIdentity = { exerciseId: m.exerciseId, packageVersion: m.packageVersion, testSetId: m.official.testSetId,
    testSetVersion: m.official.version, signatureVersion: m.signature.version, signatureHash: m.signature.hash, officialHash: m.official.hash,
    comparatorId: 'exact-typed', comparatorVersion: 1 }
  const prepareEntered = gate(), prepareContinue = gate(), executeEntered = gate(), executeContinue = gate()
  let pauseExecute = false, failCase = -1, queryFault = false, ownerCancel = false, borrowCount = 0
  const adapters: OfficialLanguageAdapter[] = [], events: string[] = [], snapshots: unknown[] = [], errors: unknown[] = []
  const factory = vi.fn<OfficialAdapterFactory>((_request, _workspace, load) => {
    let inputs: Awaited<ReturnType<typeof load>> | undefined, borrow: Awaited<ReturnType<Awaited<ReturnType<typeof load>>['representInput']>> | undefined
    const cases: OfficialCaseObservation[] = []
    let compile: import('../../src/shared/contracts/csharp-execution').CsharpCompileResult | null = null
    let failure: import('../../src/shared/contracts/csharp-execution').CsharpExecutionFailure | null = null
    const adapter: OfficialLanguageAdapter = {
      hasNextCase: () => !!inputs && cases.length < inputs.execution.caseCount && !failure,
      async runPhase(phase, context) {
        events.push(phase)
        if (phase === 'prepare') { prepareEntered.resolve(); if (options.pausePrepare) await prepareContinue.promise; inputs = await load(context) }
        if (phase === 'compile') compile = { status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: 'PRIVATE_DIAGNOSTIC', stderr: '', failure: null }
        if (phase === 'execute') {
          const index = cases.length
          inputs!.execution.inputAt(index); borrow = await inputs!.representInput(index); borrowCount++
          executeEntered.resolve(); if (pauseExecute) await executeContinue.promise
          const interrupted = context.signal.aborted || ownerCancel
          cases.push({ caseIndex: index, language: 'csharp', process: null,
            ...(interrupted ? { kind: 'INTERRUPTED' as const, reason: 'CANCELLED' as const }
              : index === failCase ? { kind: 'USER_EXCEPTION' as const, stdout: 'PRIVATE_CONSOLE_SENTINEL', stderr: '' }
                : { kind: 'RETURNED' as const, actual: [17382911, index], stdout: 'PRIVATE_CONSOLE_SENTINEL', stderr: '' }) })
          if (interrupted) throw context.signal.reason ?? exerciseCoreError('OWNER_LOST')
          if (index === failCase) { failure = { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: index }; throw exerciseCoreError('RUNTIME_FAILED') }
        }
      },
      async verifyBetweenCases() { events.push('barrier'); if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); borrow?.release(); if (borrow) borrowCount--; borrow = undefined },
      officialEvidence: () => ({ compile, cases, failure, notRunCaseIndices: Array.from({ length: (inputs?.execution.caseCount ?? 0) - cases.length }, (_, i) => i + cases.length) }),
      async terminate() { events.push('terminate') }, async settleObservers() {},
      async evidence() { if (queryFault) throw exerciseCoreError('PROCESS_UNRESOLVED'); return cleanEvidence() },
      async release() { borrow?.release(); if (borrow) borrowCount--; borrow = undefined }, async closeHandles() {},
    }
    adapters.push(adapter); return adapter
  })
  const publicAdapter: ExerciseRuntimeAdapter = { runPhase: vi.fn(async () => {}), terminate: vi.fn(async () => {}),
    settleObservers: vi.fn(async () => {}), release: vi.fn(async () => {}), closeHandles: vi.fn(async () => {}), evidence: async () => cleanEvidence() }
  const publicEntered = gate(), publicContinue = gate()
  let pausePublic = false
  const service = new ExerciseService({ root, clock: options.clock, leases: { acquire: async () => ({ release: async () => {} }) },
    official: { registry, createAdapter: factory }, onSnapshot: (_owner, snapshot) => snapshots.push(snapshot), onCleanupError: e => errors.push(e),
    createExecution: () => ({ adapter: { ...publicAdapter, runPhase: async (p, c) => {
      publicEntered.resolve(); if (pausePublic) await publicContinue.promise; await publicAdapter.runPhase(p, c)
    } }, phases: ['execute'] }),
    checkpointStore: workspace => {
      const store = new FileExerciseCheckpointStore(workspace), write = store.write.bind(store)
      vi.spyOn(store, 'write').mockImplementation(async record => { await options.checkpoint?.(record); await write(record) }); return store
    },
  })
  const owner = new Owner(1), other = new Owner(2)
  service.start(); await service.ready(); service.observe(owner as ExerciseOwner); service.observe(other as ExerciseOwner)
  dispose.push(async () => {
    queryFault = false; prepareContinue.resolve(); executeContinue.resolve(); publicContinue.resolve()
    await service.stop(); await registry.stop()
    expect(registry.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e3-s4-service-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  })
  return { service, root, registry, identity, owner, other, factory, snapshots, errors, adapters, events, prepareEntered, prepareContinue, executeEntered, executeContinue,
    publicEntered, publicContinue, count: j.cases.length as number, borrows: () => borrowCount,
    pauseExecute: () => { pauseExecute = true }, pausePublic: () => { pausePublic = true }, queryFault: (v: boolean) => { queryFault = v },
    failAt: (i: number) => { failCase = i }, cancel: () => { ownerCancel = true } }
}

describe('Main-private Official admission on the existing ExerciseService slot', () => {
  it('rejects Official while Run owns the slot, without invoking Official factory/acquisition', async () => {
    const f = await fixture(); f.pausePublic()
    const admitted = f.service.run(1, request), ref = { sessionId: admitted.sessionId, generation: admitted.generation }, done = f.service.completion(1, ref)
    await f.publicEntered.promise
    expect(() => f.service.runOfficial(2, request, f.identity, () => 'CONTINUE')).toThrow(expect.objectContaining({ details: { reason: 'OPERATION_BUSY' } }))
    expect(f.factory).not.toHaveBeenCalled(); f.publicContinue.resolve(); await done
  })
  it('defers factory/acquisition to Prepare; Official excludes both Run and another Official, with exact STOP suffix', async () => {
    const f = await fixture({ pausePrepare: true }), acquire = vi.spyOn(f.registry, 'acquire')
    const handle = f.service.runOfficial(1, request, f.identity, () => 'STOP')
    expect(f.factory).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled()
    await f.prepareEntered.promise; expect(acquire).not.toHaveBeenCalled()
    expect(() => f.service.run(2, request)).toThrow(); expect(() => f.service.runOfficial(2, request, f.identity, () => 'CONTINUE')).toThrow()
    f.prepareContinue.resolve(); const result = await handle.completion()
    expect(result).toMatchObject({ disposition: 'CONSUMER_STOP', planAcquired: true, failure: null, endReason: 'COMPLETED', cases: [{ kind: 'RETURNED' }] })
    expect(result.notRunCaseIndices).toEqual(Array.from({ length: f.count - 1 }, (_, i) => i + 1))
    expect(result.cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true }); expect(f.borrows()).toBe(0)
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(false); expect(f.snapshots).toEqual([])
    expect(f.service.status().active).toBe(false)
    const publicRef = f.service.run(2, request); await f.service.completion(2, { sessionId: publicRef.sessionId, generation: publicRef.generation })
    expect((await handle.completion()).disposition).toBe('INVALIDATED') // A new generation cannot publish old success.
  })
  it('private refs cannot select snapshots/completion/stop or populate public last/events/errors', async () => {
    const f = await fixture(); f.pauseExecute()
    const handle = f.service.runOfficial(1, request, f.identity, () => 'STOP')
    await f.executeEntered.promise
    for (const owner of [1, 2]) {
      expect(() => f.service.snapshot(owner, handle.reference)).toThrow()
      expect(() => f.service.completion(owner, handle.reference)).toThrow()
      expect(() => f.service.snapshot(owner, { ...handle.reference, generation: handle.reference.generation + 1 })).toThrow()
      await expect(f.service.stopSession(owner, { ...handle.reference, reason: 'LEARNING_LEFT' })).rejects.toThrow()
    }
    expect(f.service.status().active).toBe(true)
    f.executeContinue.resolve(); const result = await handle.completion()
    expect(result.cases[0]).toMatchObject({ actual: [17382911, 0], stdout: 'PRIVATE_CONSOLE_SENTINEL' })
    expect(() => f.service.snapshot(1, handle.reference)).toThrow(); expect(f.snapshots).toEqual([])
    expect(JSON.stringify([f.snapshots, f.errors, f.service.status()])).not.toMatch(/17382911|PRIVATE_|testSetId|officialHash|expected/)
    expect(() => f.service.run(1, { ...request, official: true } as typeof request)).toThrow()
  })
  it('CONTINUE exhausts exact ordered inputs and detaches private completion data', async () => {
    const f = await fixture(), seen: number[] = []
    const handle = f.service.runOfficial(1, request, f.identity, row => { seen.push(row.caseIndex); return 'CONTINUE' })
    const result = await handle.completion()
    expect(result.disposition).toBe('EXHAUSTED'); expect(seen).toEqual(Array.from({ length: f.count }, (_, i) => i))
    expect(result.notRunCaseIndices).toEqual([]); expect(f.events.filter(e => e === 'prepare')).toHaveLength(1)
    expect(f.events.filter(e => e === 'compile')).toHaveLength(1)
    ;(result.cases[0] as { stdout: string }).stdout = 'mutated'
    expect((await handle.completion()).cases[0]).toMatchObject({ stdout: 'PRIVATE_CONSOLE_SENTINEL' })
  })
  it('keeps valid harness failure private and never invokes the hook for the failed case', async () => {
    const f = await fixture(), hook = vi.fn(() => 'CONTINUE' as const); f.failAt(1)
    const result = await f.service.runOfficial(1, request, f.identity, hook).completion()
    expect(result).toMatchObject({ disposition: 'EXECUTION_FAILURE', cases: [{ kind: 'RETURNED' }, { kind: 'USER_EXCEPTION' }], failure: { kind: 'RUNTIME_ERROR', caseIndex: 1 } })
    expect(hook).toHaveBeenCalledTimes(1); expect(f.snapshots).toEqual([])
  })
  it.each(['navigation', 'render-process-gone', 'destroyed', 'context', 'shutdown'] as const)('retains pending operation/input on %s and completes INVALIDATED without late success', async mode => {
    const f = await fixture(); f.pauseExecute()
    const handle = f.service.runOfficial(1, request, f.identity, () => 'CONTINUE')
    await f.executeEntered.promise; expect(f.borrows()).toBe(1)
    if (mode === 'navigation') f.owner.emit('did-start-navigation', {}, '', false, true)
    else if (mode === 'destroyed') { f.owner.dead = true; f.owner.emit('destroyed') }
    else if (mode === 'context') f.service.invalidate(1, 'CONTEXT_CHANGED')
    else if (mode === 'shutdown') f.service.beginShutdown()
    else f.owner.emit('render-process-gone')
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.executeContinue.resolve(); const result = await handle.completion(); await f.service.retryCleanup()
    expect(result.disposition).toBe('INVALIDATED'); expect(result.cases).toMatchObject([{ kind: 'INTERRUPTED', reason: 'CANCELLED' }])
    expect(result.cleanup.cleanupComplete).toBe(true); expect(f.borrows()).toBe(0); expect(f.snapshots).toEqual([])
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
  })
  it('suppresses STOP success when the hook invalidates the current owner generation', async () => {
    const f = await fixture()
    const result = await f.service.runOfficial(1, request, f.identity, () => { f.service.invalidate(1, 'CONTEXT_CHANGED'); return 'STOP' }).completion()
    expect(result.disposition).toBe('INVALIDATED'); expect(result.endReason).toBe('CONTEXT_CHANGED')
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1)
  })
  it('retains Jobs/input/full lease and the active slot on barrier/query failure, then retries without relaunch', async () => {
    const f = await fixture(); f.pauseExecute()
    const handle = f.service.runOfficial(1, request, f.identity, () => 'CONTINUE')
    await f.executeEntered.promise; f.queryFault(true); f.executeContinue.resolve()
    const failed = await handle.completion()
    expect(failed.cleanup).toMatchObject({ proof: 'PROCESS_UNRESOLVED', cleanupComplete: false })
    expect(f.service.status().active).toBe(true); expect(f.borrows()).toBe(1)
    expect(() => f.service.run(2, request)).toThrow(); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.queryFault(false); await f.service.retryCleanup()
    expect((await handle.completion()).cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('failed identity preflight never starts cases and keeps its acquired release handle until verified cleanup', async () => {
    const f = await fixture()
    const result = await f.service.runOfficial(1, request, { ...f.identity, signatureHash: 'stale' }, () => 'CONTINUE').completion()
    expect(result).toMatchObject({ disposition: 'EXECUTION_FAILURE', planAcquired: false, cases: [], cleanup: { proof: 'VERIFIED', cleanupComplete: true } })
    expect(f.events).not.toContain('execute'); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('invalid owner/recovery state cannot acquire Official data', async () => {
    const f = await fixture()
    const recovering = new ExerciseService({ root: join(f.root, 'recovering'), leases: { acquire: async () => ({ release: async () => {} }) },
      official: { registry: f.registry, createAdapter: f.factory } })
    recovering.start(); recovering.observe(new Owner(3) as ExerciseOwner)
    expect(() => recovering.runOfficial(3, request, f.identity, () => 'STOP')).toThrow(expect.objectContaining({ details: { reason: 'ADMISSION_CLOSED' } }))
    await recovering.ready(); await recovering.stop()
    expect(() => f.service.runOfficial(99, request, f.identity, () => 'CONTINUE')).toThrow()
    f.owner.emit('did-start-navigation', {}, '', false, true)
    expect(() => f.service.runOfficial(1, request, f.identity, () => 'CONTINUE')).toThrow()
    f.owner.emit('did-finish-load')
    expect((await f.service.runOfficial(1, request, f.identity, () => 'STOP').completion()).disposition).toBe('CONSUMER_STOP')
    f.service.beginShutdown(); expect(() => f.service.runOfficial(1, request, f.identity, () => 'STOP')).toThrow()
  })
  it('binds invalidation to the old owner entry even when a new document reuses the same numeric owner', async () => {
    const f = await fixture(); f.pauseExecute()
    const handle = f.service.runOfficial(1, request, f.identity, () => 'STOP')
    await f.executeEntered.promise; f.owner.dead = true; f.owner.emit('destroyed')
    const replacement = new Owner(1); f.service.observe(replacement as ExerciseOwner)
    expect(() => f.service.runOfficial(1, request, f.identity, () => 'STOP')).toThrow()
    f.executeContinue.resolve(); expect((await handle.completion()).disposition).toBe('INVALIDATED')
    expect(f.owner.listenerCount('destroyed')).toBe(0)
    const next = f.service.runOfficial(1, request, f.identity, () => 'STOP')
    expect(next.reference.generation).toBeGreaterThan(handle.reference.generation)
    expect((await next.completion()).disposition).toBe('CONSUMER_STOP')
  })
  it('keeps the same slot/lease and checkpoint task beyond caller12s, then completes STOP after managed retry', async () => {
    let now = performance.now()
    const timers = new Map<object, { due: number; callback: () => void }>()
    const clock: ExerciseClock = { now: () => now, schedule: (callback, ms) => {
      const key = {}; timers.set(key, { due: now + ms, callback }); return () => { timers.delete(key) }
    } }
    const entered = gate(), pending = gate()
    const f = await fixture({ clock, checkpoint: async r => { if (r.checkpoint === 'FINALIZED') { entered.resolve(); await pending.promise } } })
    const handle = f.service.runOfficial(1, request, f.identity, () => 'STOP'), completion = handle.completion()
    await entered.promise
    const expireNextWait = async () => {
      const due = Math.min(...[...timers.values()].map(t => t.due)); now = due
      for (const [key, timer] of [...timers]) if (timer.due <= now) { timers.delete(key); timer.callback() }
      // Let the retained service join its next existing Core caller wait.
      for (let i = 0; i < 20; i++) await Promise.resolve()
    }
    await expireNextWait()
    const failed = await completion
    expect(failed.cleanup).toMatchObject({ cleanupComplete: false, pendingIo: true })
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    expect(() => f.service.run(2, request)).toThrow()
    pending.resolve(); await f.service.retryCleanup()
    const final = await handle.completion()
    expect(final).toMatchObject({ disposition: 'CONSUMER_STOP', failure: null, cleanup: { proof: 'VERIFIED', cleanupComplete: true } })
    expect(f.events.filter(e => e === 'execute')).toHaveLength(1); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('seals Official refs/flags at the existing IPC reply/event/stop boundary without adding channels', async () => {
    const f = await fixture(), handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>(), send = vi.fn()
    const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } })
    const ipc = new ExerciseIpcService(registry, f.service, () => {}, send)
    ipc.observe(f.owner); ipc.start()
    const event = { sender: { id: 1 }, senderFrame: { processId: 1, frameToken: 's4', detached: false, isDestroyed: () => false } }
    try {
      f.pauseExecute(); const handle = f.service.runOfficial(1, request, f.identity, () => 'STOP')
      await f.executeEntered.promise
      expect([...handlers.keys()].sort()).toEqual([EXERCISE_CHANNELS.run, EXERCISE_CHANNELS.snapshot, EXERCISE_CHANNELS.stop].sort())
      const replies = [
        await handlers.get(EXERCISE_CHANNELS.snapshot)!(event, handle.reference),
        await handlers.get(EXERCISE_CHANNELS.stop)!(event, { ...handle.reference, reason: 'LEARNING_LEFT' }),
        await handlers.get(EXERCISE_CHANNELS.run)!(event, { ...request, official: true }),
        await handlers.get(EXERCISE_CHANNELS.run)!(event, request),
      ]
      expect(replies.every(r => r && typeof r === 'object' && 'ok' in r && r.ok === false)).toBe(true)
      expect(JSON.stringify(replies)).not.toMatch(/PRIVATE_|17382911|testSetId|officialHash|expected/)
      expect(send).not.toHaveBeenCalled(); expect(f.snapshots).toEqual([])
      f.executeContinue.resolve(); await handle.completion()
      expect(send).not.toHaveBeenCalled()
    } finally { ipc.stop() }
  })
  it('retains the slot/private full-lease on HISTORY_UNVERIFIED rather than claiming final cleanup', async () => {
    const f = await fixture()
    // Account the validated TEST data copy through the real Registry. The mocked
    // lease below has no native resources and models an intentionally sticky
    // HISTORY_UNVERIFIED owner; it is never force-released by production cleanup.
    const lease = await f.registry.acquire(request.exerciseId, { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => true,
      check() {}, retain() {}, canRelease: () => true }), copy = lease.copy()
    lease.release()
    const release = vi.fn(), mockRegistry = { acquire: vi.fn(async () => ({ data: copy.data, release })), invalidate: vi.fn() } as unknown as ExercisePackageRegistry
    const history = new ExerciseService({ root: join(f.root, 'history-control'), leases: { acquire: async () => ({ release: async () => {} }) },
      official: { registry: mockRegistry, createAdapter: (_r, _w, load) => ({
        hasNextCase: () => true, async runPhase(p, c) { if (p === 'prepare') await load(c) },
        async verifyBetweenCases() { throw exerciseCoreError('PROCESS_UNRESOLVED') },
        officialEvidence: () => ({ cases: [], notRunCaseIndices: Array.from({ length: f.count }, (_, i) => i), failure: { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null } }),
        async terminate() {}, async settleObservers() {}, async release() {}, async closeHandles() {},
        async evidence() { return { ...cleanEvidence(), coverageComplete: false } },
      }) } })
    try {
      history.start(); await history.ready(); history.observe(new Owner(3) as ExerciseOwner)
      const result = await history.runOfficial(3, request, f.identity, () => 'CONTINUE').completion()
      expect(result.cleanup).toMatchObject({ proof: 'HISTORY_UNVERIFIED', cleanupComplete: false, workspace: 'QUARANTINED' })
      expect(history.status().active).toBe(true); expect(release).not.toHaveBeenCalled()
      expect(() => history.runOfficial(3, request, f.identity, () => 'STOP')).toThrow()
      await expect(history.stop()).rejects.toMatchObject({ details: { reason: 'PACKAGE_CLEANUP_UNVERIFIED' } })
      expect(release).not.toHaveBeenCalled()
    } finally { copy.release() } // Dispose accounted test data only; never release the mocked held operation.
  })
  it('owns a delayed real Registry handoff across invalidation and releases only after Core settles it', async () => {
    const f = await fixture(), entered = gate(), pending = gate(), acquire = f.registry.acquire.bind(f.registry)
    vi.spyOn(f.registry, 'acquire').mockImplementationOnce(async (id, owner) => {
      const lease = await acquire(id, owner); entered.resolve(); await pending.promise; return lease
    })
    const handle = f.service.runOfficial(1, request, f.identity, () => 'CONTINUE'), completed = handle.completion()
    await entered.promise; expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    f.service.invalidate(1, 'CONTEXT_CHANGED')
    expect(f.service.status().active).toBe(true); expect(f.registry.readiness(request.exerciseId).pinned).toBe(true)
    expect(() => f.service.run(2, request)).toThrow()
    pending.resolve(); const result = await completed
    expect(result).toMatchObject({ disposition: 'INVALIDATED', planAcquired: false, cases: [], cleanup: { proof: 'VERIFIED', cleanupComplete: true } })
    expect(f.events).not.toContain('compile'); expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
  it('maps a Promise hook to infrastructure completion without inventing a failed case or publishing its exception', async () => {
    const f = await fixture()
    const invalid = (() => Promise.reject(Error('PRIVATE_HOOK_EXCEPTION'))) as unknown as OfficialSettledCaseConsumer
    const result = await f.service.runOfficial(1, request, f.identity, invalid).completion()
    expect(result).toMatchObject({ disposition: 'EXECUTION_FAILURE', endReason: 'INTERNAL_ERROR', compile: { status: 'SUCCEEDED' },
      failure: { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }, cases: [{ kind: 'RETURNED' }],
      cleanup: { proof: 'VERIFIED', cleanupComplete: true } })
    expect(result.cases).toHaveLength(1); expect(result.notRunCaseIndices).toEqual(Array.from({ length: f.count - 1 }, (_, i) => i + 1))
    expect(f.snapshots).toEqual([]); expect(JSON.stringify([f.errors, f.service.status()])).not.toContain('PRIVATE_HOOK_EXCEPTION')
    expect(f.registry.readiness(request.exerciseId).pinned).toBe(false)
  })
})
