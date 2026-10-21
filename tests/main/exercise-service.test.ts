import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseService, createWindowsExerciseService, type ExerciseExecution } from '../../src/main/services/learning/exercise-service'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { FileExerciseCheckpointStore, makeExerciseCheckpoint, type ExerciseCheckpoint } from '../../src/main/services/learning/runtime/exercise-checkpoint'
import type { ExerciseLeaseProvider, ExerciseRuntimeAdapter } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import { DesktopApplication } from '../../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../../src/main/app/application-quit-coordinator'
import type { ExerciseRunRequest, ExerciseSessionReference } from '../../src/shared/contracts/exercise'
import { validateExerciseSnapshot } from '../../src/shared/contracts/exercise-validation'

class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
const request: ExerciseRunRequest = { exerciseId: 'ch2-01', language: 'javascript', code: 'function source', sourceRevision: 4 }
function admit(service: ExerciseService, owner: number, input = request): ExerciseSessionReference {
  const snapshot = service.run(owner, input)
  return { sessionId: snapshot.sessionId, generation: snapshot.generation }
}
const historicId = 'exercise_12345678-1234-4234-8234-123456789abc'
const hostEpoch = '12345678-1234-4234-8234-123456789abc'
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
function mockAdapter() {
  return { runPhase: vi.fn<ExerciseRuntimeAdapter['runPhase']>().mockResolvedValue(),
    terminate: vi.fn<ExerciseRuntimeAdapter['terminate']>().mockResolvedValue(),
    settleObservers: vi.fn<ExerciseRuntimeAdapter['settleObservers']>().mockResolvedValue(),
    evidence: vi.fn<ExerciseRuntimeAdapter['evidence']>().mockResolvedValue({ members: [], activeProcesses: 0, totalProcesses: 0,
      retained: [], observerSettled: true, coverageComplete: true, unresolvedErrors: false }),
    release: vi.fn<ExerciseRuntimeAdapter['release']>().mockResolvedValue(),
    closeHandles: vi.fn<ExerciseRuntimeAdapter['closeHandles']>().mockResolvedValue() }
}
const roots: string[] = [], services: ExerciseService[] = []
const clock = { now: () => Date.now(), schedule: (callback: () => void, ms: number) => {
  const timer = setTimeout(callback, ms); return () => clearTimeout(timer)
} }
async function fixture(options: {
  configure?: (adapter: ReturnType<typeof mockAdapter>) => void
  phases?: ExerciseExecution['phases']
  checkpoint?: (record: ExerciseCheckpoint) => Promise<void>
  seed?: (root: string, leases: ExerciseLeaseProvider) => Promise<void>
  ready?: boolean
  start?: boolean
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exercise-service-')); roots.push(root)
  const held = new Set<string>()
  const leases: ExerciseLeaseProvider = { acquire: async id => {
    if (held.has(id)) return null
    held.add(id); return { release: async () => { held.delete(id) } }
  } }
  await options.seed?.(root, leases)
  const adapters: ReturnType<typeof mockAdapter>[] = [], snapshots: object[] = []
  const report = vi.fn()
  const service = new ExerciseService({ root, leases, clock,
    onCleanupError: report, onSnapshot: (owner, snapshot) => { snapshots.push({ owner, snapshot }) },
    checkpointStore: w => {
      const store = new FileExerciseCheckpointStore(w), write = store.write.bind(store)
      vi.spyOn(store, 'write').mockImplementation(async r => { await options.checkpoint?.(r); await write(r) })
      return store
    },
    createExecution: () => {
      const adapter = mockAdapter(); options.configure?.(adapter); adapters.push(adapter)
      return { adapter, phases: options.phases ?? ['execute'] }
    },
  })
  services.push(service); if (options.start !== false) service.start()
  if (options.ready !== false) await service.ready()
  const owner = new Owner(1); service.observe(owner)
  return { service, owner, root, held, leases, adapters, report, snapshots }
}
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop().catch(() => {})
  vi.clearAllTimers(); vi.useRealTimers()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('exercise-service-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  }
})

describe('ExerciseService admission and Main identity', () => {
  it('admits one operation globally, no queue; validates owner/reference and issues fresh Main identity/generation', async () => {
    const entered = gate(), pending = gate()
    const f = await fixture({ configure: adapter => adapter.runPhase.mockImplementation(async p => {
      if (p === 'execute') { entered.resolve(); await pending.promise }
    }) })
    const other = new Owner(2); f.service.observe(other)
    const ref = admit(f.service, f.owner.id), completed = f.service.completion(f.owner.id, ref)
    expect(ref.sessionId).toMatch(/^exercise_/); expect(ref.generation).toBe(1)
    expect(() => f.service.run(other.id, request)).toThrow()
    expect(() => f.service.snapshot(other.id, ref)).toThrow()
    expect(() => f.service.snapshot(f.owner.id, { ...ref, generation: ref.generation + 1 })).toThrow()
    await entered.promise; pending.resolve()
    const result = await completed
    expect(result.cleanup.cleanupComplete).toBe(true); expect(validateExerciseSnapshot(result).ok).toBe(true)
    const second = admit(f.service, other.id)
    expect(second.sessionId).not.toBe(ref.sessionId); expect(second.generation).toBeGreaterThan(ref.generation)
    expect(() => f.service.snapshot(f.owner.id, ref)).toThrow()
    await f.service.completion(other.id, second)
    expect(f.held.size).toBe(0)
  })

  it('copies source at admission and prevents mutation of cached snapshots', async () => {
    const f = await fixture(), input = { ...request }
    const ref = admit(f.service, 1, input); input.sourceRevision = 900
    await f.service.completion(1, ref)
    const snapshot = f.service.snapshot(1, ref); snapshot.cleanup.processClean = false
    expect(f.service.snapshot(1, ref).cleanup.processClean).toBe(true)
    expect(f.service.snapshot(1, ref).sourceRevision).toBe(4)
  })

  it('rejects invalid requests, missing owners and unimplemented language drivers without creating an operation', async () => {
    const f = await fixture()
    expect(() => f.service.run(999, request)).toThrow()
    expect(() => f.service.run(1, { ...request, language: 'python' } as unknown as ExerciseRunRequest)).toThrow()
    const unconfigured = createWindowsExerciseService(join(f.root, 'no-drivers'))
    services.push(unconfigured); unconfigured.start(); await unconfigured.ready(); unconfigured.observe(f.owner)
    expect(() => unconfigured.run(1, request)).toThrow()
    expect(unconfigured.status().active).toBe(false)
    expect(f.adapters).toHaveLength(0)
  })

  it.each(['CONTEXT_CHANGED', 'LEARNING_LEFT'] as const)('invalidates %s immediately and suppresses stale completion/publication', async reason => {
    const entered = gate(), pending = gate()
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    const ref = admit(f.service, 1), completion = f.service.completion(1, ref)
    const stale = expect(completion).rejects.toMatchObject({ details: { reason: 'STALE_SESSION' } })
    await entered.promise; const count = f.snapshots.length
    f.service.invalidate(1, reason)
    expect(() => f.service.snapshot(1, ref)).toThrow(); expect(() => f.service.run(1, request)).toThrow()
    pending.resolve(); await f.service.retryCleanup(); await stale
    expect(f.snapshots).toHaveLength(count)
    expect(f.service.status().active).toBe(false)
  })

  it('cancels safely even when owner invalidation arrives immediately after admission', async () => {
    const f = await fixture(), ref = admit(f.service, 1)
    const completion = f.service.completion(1, ref); const stale = expect(completion).rejects.toThrow()
    f.service.invalidate(1, 'LEARNING_LEFT'); await f.service.retryCleanup(); await stale
    expect(f.held.size).toBe(0); expect(f.service.status().active).toBe(false)
  })
})

describe('Owner loss and stale work', () => {
  it.each(['navigation', 'render-process-gone', 'destroyed'] as const)('cancels only Learning on %s and retains pending work for cleanup', async event => {
    const entered = gate(), pending = gate()
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    const ref = admit(f.service, 1), completion = f.service.completion(1, ref)
    const stale = expect(completion).rejects.toThrow(); await entered.promise
    if (event === 'navigation') f.owner.emit('did-start-navigation', {}, 'about:blank', false, true)
    else { if (event === 'destroyed') f.owner.dead = true; f.owner.emit(event) }
    expect(f.service.status().generation).toBeGreaterThan(ref.generation)
    expect(() => f.service.run(1, request)).toThrow()
    pending.resolve(); await f.service.retryCleanup(); await stale
    expect(f.adapters[0].terminate).toHaveBeenCalledOnce()
    expect(f.held.size).toBe(0)
  })

  it('retains an owner-loss native failure for managed retry without admitting another owner', async () => {
    const entered = gate(), pending = gate(), failed = gate()
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    f.report.mockImplementation(() => failed.resolve())
    const ref = admit(f.service, 1), done = f.service.completion(1, ref), rejected = expect(done).rejects.toThrow()
    await entered.promise; f.adapters[0].terminate.mockRejectedValueOnce(Error('native failure'))
    f.owner.emit('render-process-gone'); await failed.promise
    const other = new Owner(2); f.service.observe(other)
    expect(f.service.status().active).toBe(true); expect(f.held.size).toBe(1)
    expect(() => f.service.run(2, request)).toThrow()
    pending.resolve(); await f.service.retryCleanup(); await rejected
    expect(f.adapters[0].terminate).toHaveBeenCalledTimes(2); expect(f.held.size).toBe(0)
  })

  it('ignores subframe/in-place navigation and another owner loss; re-enables a fresh document after full load', async () => {
    const entered = gate(), pending = gate()
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    const other = new Owner(2); f.service.observe(other)
    const ref = admit(f.service, 1), done = f.service.completion(1, ref); await entered.promise
    f.owner.emit('did-start-navigation', {}, '', false, false); f.owner.emit('did-start-navigation', {}, '', true, true)
    other.emit('render-process-gone')
    expect(f.service.snapshot(1, ref).generation).toBe(ref.generation)
    pending.resolve(); await done
    f.owner.emit('did-start-navigation', {}, '', false, true)
    expect(() => f.service.run(1, request)).toThrow()
    f.owner.emit('did-finish-load')
    const next = admit(f.service, 1); await f.service.completion(1, next)
    expect(next.generation).toBeGreaterThan(ref.generation)
  })
})

describe('Service deadlines, retained cleanup and shutdown barrier', () => {
  it('spans prepare/compile/cases with one monotonic deadline and clamps the final phase to remaining operation time', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const entered = gate(), pending = gate(); let cases = 0, due = 0
    const f = await fixture({ phases: ['compile', ...Array.from({ length: 12 }, () => 'execute' as const)],
      configure: a => a.runPhase.mockImplementation(async (phase, context) => {
        if (phase === 'prepare') await vi.advanceTimersByTimeAsync(9_000)
        else if (phase === 'compile') await vi.advanceTimersByTimeAsync(29_000)
        else if (++cases < 12) await vi.advanceTimersByTimeAsync(1_900)
        else { due = context.deadline; entered.resolve(); await pending.promise }
      }) })
    const ref = admit(f.service, 1), done = f.service.completion(1, ref)
    await entered.promise; expect(due).toBe(60_000)
    await vi.advanceTimersByTimeAsync(1_100); pending.resolve()
    expect((await done).reason).toBe('OPERATION_TIMEOUT')
    expect(f.held.size).toBe(0)
  })

  it('keeps pending FINALIZED I/O owned at 12s, rejects admission and joins concurrent cleanup retries', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const entered = gate(), pending = gate()
    const f = await fixture({ checkpoint: async r => { if (r.checkpoint === 'FINALIZED') { entered.resolve(); await pending.promise } } })
    const ref = admit(f.service, 1), done = f.service.completion(1, ref)
    const failed = expect(done).rejects.toMatchObject({ details: { reason: 'CLEANUP_DEADLINE' } })
    await entered.promise; await vi.advanceTimersByTimeAsync(12_000); await failed
    expect(f.service.snapshot(1, ref).cleanup).toMatchObject({ state: 'FAILED', processClean: false, pendingIo: true })
    expect(f.service.status().active).toBe(true); expect(f.held.size).toBe(1)
    expect(() => f.service.run(1, request)).toThrow()
    const retry1 = f.service.retryCleanup(), retry2 = f.service.retryCleanup()
    pending.resolve(); await Promise.all([retry1, retry2])
    expect(f.adapters[0].release).toHaveBeenCalledOnce(); expect(f.adapters[0].closeHandles).toHaveBeenCalledOnce()
    expect(f.service.snapshot(1, ref).cleanup.cleanupComplete).toBe(true)
  })

  it('seals synchronously at STOPPING; native failure blocks WindowManager and existing domains until safe retry', async () => {
    const entered = gate(), pending = gate(), stops: string[] = []
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    // Fixture service already started; DesktopApplication adopts this same service through a no-op start facade.
    const projectRun = { name: 'ProjectRun', stop: vi.fn(() => { stops.push('ProjectRun') }) }
    const terminal = { name: 'Terminal', stop: vi.fn(() => { stops.push('Terminal') }) }
    const windows = { name: 'WindowManager', stop: vi.fn(() => { stops.push('WindowManager') }) }
    const barrier = { name: f.service.name, stop: () => f.service.stop() }
    const app = new DesktopApplication([projectRun, terminal, barrier, windows], { shutdownLast: [windows] })
    app.subscribe(s => { if (s.state === 'STOPPING') f.service.beginShutdown() })
    await app.start()
    const ref = admit(f.service, 1), done = f.service.completion(1, ref), stale = expect(done).rejects.toThrow()
    await entered.promise; f.adapters[0].terminate.mockRejectedValueOnce(Error('native terminate failure'))
    const shutdown = app.shutdown()
    expect(f.service.status().state).toBe('STOPPING'); expect(() => f.service.run(1, request)).toThrow()
    await expect(shutdown).rejects.toThrow(); expect(app.getStatus().state).toBe('STOPPING')
    expect(stops).toEqual([]); expect(f.held.size).toBe(1)
    pending.resolve(); await app.shutdown(); await stale
    expect(stops).toEqual(['Terminal', 'ProjectRun', 'WindowManager'])
    expect(f.service.status().state).toBe('STOPPED')
    expect(f.owner.listenerCount('destroyed')).toBe(0)
  })

  it('does not authorize final quit after cleanup failure; retries through unchanged quit coordinator', async () => {
    const entered = gate(), pending = gate(), events: string[] = []
    const f = await fixture({ configure: a => a.runPhase.mockImplementation(async p => { if (p === 'execute') { entered.resolve(); await pending.promise } }) })
    const window = { name: 'WindowManager', stop: () => { events.push('window') } }
    const app = new DesktopApplication([{ name: f.service.name, stop: () => f.service.stop() }, window], { shutdownLast: [window] })
    app.subscribe(s => { if (s.state === 'STOPPING') f.service.beginShutdown() }); await app.start()
    const ref = admit(f.service, 1), done = f.service.completion(1, ref), stale = expect(done).rejects.toThrow()
    await entered.promise; f.adapters[0].terminate.mockRejectedValueOnce(Error('native failure'))
    const failure = gate(), quit = gate()
    const coordinator = new ApplicationQuitCoordinator({ getApplication: () => app, requestApproval: async () => true,
      quit: () => { events.push('quit'); quit.resolve() }, onCleanupError: () => failure.resolve() })
    coordinator.handleBeforeQuit({ preventDefault: vi.fn() }); await failure.promise
    expect(coordinator.isFinalQuitAuthorized()).toBe(false); expect(events).toEqual([])
    // A new user quit event occurs after the previous rejection handler/finally.
    await Promise.resolve()
    pending.resolve(); coordinator.handleBeforeQuit({ preventDefault: vi.fn() }); await quit.promise; await stale
    expect(events).toEqual(['window', 'quit']); expect(coordinator.isFinalQuitAuthorized()).toBe(true)
  })
})

describe('Managed startup recovery', () => {
  it.each(['OWNED', 'RELEASE_READY', 'FINALIZED', 'HISTORY_UNVERIFIED'] as const)('recovers %s using a lease and preserves quarantine', async stage => {
    const f = await fixture({ seed: async (root, leases) => {
      const w = new ExerciseWorkspace(root, historicId, leases); await w.prepare()
      const store = new FileExerciseCheckpointStore(w), base = { sessionId: historicId, hostEpoch, ownerId: 'old-main', workspaceIdentity: w.identity! }
      await store.write(makeExerciseCheckpoint(base, 'OWNED', null))
      if (stage !== 'OWNED') await store.write(makeExerciseCheckpoint(base, 'RELEASE_READY', stage === 'HISTORY_UNVERIFIED' ? 'HISTORY_UNVERIFIED' : 'VERIFIED'))
      if (stage === 'FINALIZED' || stage === 'HISTORY_UNVERIFIED') await store.write(makeExerciseCheckpoint(base, 'FINALIZED', stage === 'HISTORY_UNVERIFIED' ? 'HISTORY_UNVERIFIED' : 'VERIFIED'))
      await w.releaseLease()
    } })
    expect(f.service.status().recovery[0].result).toBe(stage === 'FINALIZED' ? 'CLEANUP_COMPLETE' : 'QUARANTINED')
    expect(f.held.size).toBe(0)
    if (stage === 'FINALIZED') await expect(readFile(join(f.root, 'sessions', historicId, 'anything'))).rejects.toMatchObject({ code: 'ENOENT' })
    else expect(await readFile(join(f.root, 'checkpoints', `${historicId}.json`), 'utf8')).not.toContain('"cleanupComplete":true')
  })

  it('retains orphan workspaces without adopting/deleting or trusting historical PIDs', async () => {
    const f = await fixture({ seed: async root => { await mkdir(join(root, 'sessions', historicId), { recursive: true }); await writeFile(join(root, 'sessions', historicId, 'manifest.json'), '{"pid":123}') } })
    expect(f.service.status().orphanQuarantine).toEqual([historicId]); expect(f.held.size).toBe(0)
    expect(await readFile(join(f.root, 'sessions', historicId, 'manifest.json'), 'utf8')).toContain('123')
  })

  it('tracks recovery failure inside an already managed service and blocks admission until explicit retry', async () => {
    const f = await fixture({ ready: false, seed: async root => {
      await mkdir(join(root, 'checkpoints')); await writeFile(join(root, 'checkpoints', `${historicId}.json`), '{broken')
    } })
    await expect(f.service.ready()).rejects.toThrow()
    expect(f.service.status().state).toBe('RECOVERY_FAILED'); expect(() => f.service.run(1, request)).toThrow()
    await expect(f.service.stop()).rejects.toThrow(); expect(f.service.status().state).toBe('STOPPING')
    // Explicit test repair produces a valid OWNED record under a fresh lease;
    // production recovery must never silently remove/ignore a corrupt checkpoint.
    const repair = new ExerciseWorkspace(f.root, historicId, f.leases); await repair.prepare()
    await writeFile(join(f.root, 'checkpoints', `${historicId}.json`), JSON.stringify(makeExerciseCheckpoint({ sessionId: historicId,
      hostEpoch, ownerId: 'old-main', workspaceIdentity: repair.identity! }, 'OWNED', null)))
    await repair.releaseLease()
    await f.service.stop(); expect(f.service.status().state).toBe('STOPPED')
  })

  it('keeps startup recovery pending I/O and lease tracked across 12s managed stop deadlines', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const entered = gate(), pending = gate()
    const f = await fixture({ ready: false, start: false, seed: async (root, leases) => {
      const w = new ExerciseWorkspace(root, historicId, leases); await w.prepare()
      const s = new FileExerciseCheckpointStore(w), base = { sessionId: historicId, hostEpoch, ownerId: 'old-main', workspaceIdentity: w.identity! }
      for (const stage of ['OWNED', 'RELEASE_READY', 'FINALIZED'] as const) await s.write(makeExerciseCheckpoint(base, stage, stage === 'OWNED' ? null : 'VERIFIED'))
      await w.releaseLease()
    }, checkpoint: async r => { if (r.checkpoint === 'CLEANUP_COMPLETE') { entered.resolve(); await pending.promise } } })
    const windows = { name: 'WindowManager', stop: vi.fn() }
    const app = new DesktopApplication([f.service, windows], { shutdownLast: [windows] })
    app.subscribe(s => { if (s.state === 'STOPPING') f.service.beginShutdown() })
    await app.start(); expect(app.getStatus().state).toBe('RUNNING')
    await entered.promise; expect(() => f.service.run(1, request)).toThrow()
    const stopped = app.shutdown(), failed = expect(stopped).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(12_000); await failed
    expect(f.held.size).toBe(1); expect(f.service.status().state).toBe('STOPPING')
    expect(windows.stop).not.toHaveBeenCalled()
    const retry = app.shutdown(); pending.resolve(); await retry
    expect(f.held.size).toBe(0); expect(f.service.status().state).toBe('STOPPED')
    expect(windows.stop).toHaveBeenCalledOnce()
  })
})
