import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { release, tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { createWindowsExerciseService } from '../../src/main/services/learning/exercise-service'
import * as nativeModule from '../../src/main/services/learning/runtime/windows-exercise-native'
import type { LearningNativeBinding } from '../../src/main/services/learning/runtime/windows-exercise-native'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import type { openBundledExerciseResources } from '../../src/main/services/learning/content/exercise-package-resources-runtime'
import type { OfficialPlanIdentity } from '../../src/main/services/learning/official-case-plan'
import type { OfficialOperationHandle } from '../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseSnapshot } from '../../src/shared/contracts/exercise'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'

class Owner extends EventEmitter { constructor(readonly id: number) { super() } isDestroyed() { return false } }
const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_OFFICIAL_SERVICE_LIVE === '1'
async function removeRoot(root: string) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('e3-s4-native-')) throw Error('Unsafe fixture cleanup')
  await rm(root, { recursive: true, force: true })
}
describe.skipIf(!enabled)('E3-S4 actual Main-private service entry / compiled Registry / real native runtimes', () => {
  it.each(['csharp', 'javascript'] as const)('%s shares the service slot, hooks after barriers, stops exactly and retains public Run parity', async language => {
    const native = nativeModule.loadLearningNative(resolve('out/main/native/learning/learning-job.node'))
    const bundled = createRequire(__filename)(resolve('out/main/exercise-package-resources-runtime.js')) as { openBundledExerciseResources: typeof openBundledExerciseResources }
    const packages = new ExercisePackageRegistry((scope, control) => bundled.openBundledExerciseResources({ packaged: false, resourcesPath: '' }, scope, control))
    await packages.whenStarted(); expect(packages.status().state).toBe('AVAILABLE')
    const metadata = JSON.parse(await readFile('resources/learning/exercises/ch2-04/exercise.json', 'utf8'))
    const judge = JSON.parse(await readFile('resources/learning/exercises/ch2-04/judge/v1.json', 'utf8'))
    const identity: OfficialPlanIdentity = { exerciseId: metadata.exerciseId, packageVersion: metadata.packageVersion, testSetId: metadata.official.testSetId,
      testSetVersion: metadata.official.version, signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash,
      officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
    const jobs: object[] = [], watches: object[] = [], inputs: unknown[] = []
    const launches: { operation: string; phase: string; pid: number; quota: number }[] = []
    const actions = new Map<object, { releases: number; closes: number }>()
    let operation = 'official'
    const binding: LearningNativeBinding = { capability: native.capability, acquireLease: native.acquireLease,
      state: native.state, watch: native.watch, observation: native.observation,
      start: (exe, args, cwd, quota, environment) => {
        for (const job of jobs) if (!native.state(job).handlesClosed) {
          const old = native.poll(job)
          expect(old.activeProcesses).toBe(0); expect(old.members).toEqual([]); expect(old.observerSettled && old.stdinSettled).toBe(true)
          expect(old.retained.every(p => p.signaled)).toBe(true)
        }
        const phase = args.some(a => a.endsWith('csc.dll')) || args.at(-1) === 'syntax' ? 'compile'
          : language === 'javascript' && args.at(-1) !== 'execute' ? 'probe' : 'execute'
        expect(quota).toBe(phase === 'compile' ? EXERCISE_LIMITS.compileJobMemoryBytes : EXERCISE_LIMITS.executeJobMemoryBytes)
        const job = native.start(exe, args, cwd, quota, environment), sample = native.poll(job)
        expect(sample.quotaBytes).toBe(quota); jobs.push(job); watches.push(native.watch(sample.rootPid))
        actions.set(job, { releases: 0, closes: 0 }); launches.push({ operation, phase, pid: sample.rootPid, quota })
        return job
      },
      submitInput: (job, bytes) => { if (bytes.length) inputs.push({ operation, request: JSON.parse(bytes.toString()) }); native.submitInput(job, bytes) },
      poll: native.poll,
      control: (job, action) => { native.control(job, action); if (action === 'release') actions.get(job)!.releases++; if (action === 'closeHandles') actions.get(job)!.closes++ },
    }
    const root = await mkdtemp(join(tmpdir(), 'e3-s4-native-'))
    // Redirect only module location for the source test host. This is the actual
    // unchanged native binding, not a fake native process or ABI rebuild.
    const nativeLocation = vi.spyOn(nativeModule, 'loadLearningNative').mockReturnValue(binding)
    const snapshots: ExerciseSnapshot[] = [], errors: unknown[] = []
    const service = createWindowsExerciseService(root, { packages, onSnapshot: (_owner, s) => snapshots.push(s), onCleanupError: e => errors.push(e) })
    const owner = new Owner(1), other = new Owner(2)
    const request = { exerciseId: 'ch2-04', language, sourceRevision: 1,
      code: language === 'csharp' ? 'public class Solution { public int[] Divide(int a,int b) => new[]{a/b,a%b}; }'
        : 'function Divide(a,b){return [Math.trunc(a/b),a%b];}' }
    const stopAt = language === 'csharp' ? 0 : 1, seen: number[] = []
    let handle!: OfficialOperationHandle
    try {
      service.start(); await service.ready(); service.observe(owner); service.observe(other)
      handle = service.runOfficial(1, request, identity, row => {
        expect(row.kind).toBe('RETURNED'); expect(row.process?.observerSettled).toBe(true)
        expect(service.status().active).toBe(true); expect(packages.readiness(request.exerciseId).pinned).toBe(true)
        expect(jobs.every(j => !native.state(j).released && !native.state(j).handlesClosed)).toBe(true)
        expect(() => service.run(2, request)).toThrow(); expect(() => service.runOfficial(2, request, identity, () => 'STOP')).toThrow()
        seen.push(row.caseIndex); return row.caseIndex === stopAt ? 'STOP' : 'CONTINUE'
      })
      expect(() => service.snapshot(1, handle.reference)).toThrow(); expect(() => service.completion(1, handle.reference)).toThrow()
      await expect(service.stopSession(1, { ...handle.reference, reason: 'LEARNING_LEFT' })).rejects.toThrow()
      const result = await handle.completion()
      expect(result).toMatchObject({ disposition: 'CONSUMER_STOP', planAcquired: true, failure: null, endReason: 'COMPLETED',
        cleanup: { proof: 'VERIFIED', processClean: true, cleanupComplete: true, pendingIo: false, workspace: 'REMOVED' } })
      expect(seen).toEqual(Array.from({ length: stopAt + 1 }, (_, i) => i))
      // Expected assertions live only in this Main test, outside the driver/child.
      expect(result.cases.map(c => c.kind === 'RETURNED' ? c.actual : c.kind)).toEqual(judge.cases.slice(0, stopAt + 1).map((c: { expected: unknown }) => c.expected))
      expect(result.notRunCaseIndices).toEqual(judge.cases.slice(stopAt + 1).map((_c: unknown, i: number) => stopAt + i + 1))
      expect(snapshots).toEqual([]); expect(errors).toEqual([]); expect(service.status().active).toBe(false)
      expect(packages.readiness(request.exerciseId).pinned).toBe(false)
      expect(launches.filter(l => l.operation === 'official' && l.phase === 'execute')).toHaveLength(stopAt + 1)
      expect(inputs).toEqual(judge.cases.slice(0, stopAt + 1).map((c: { args: unknown }, caseIndex: number) => ({ operation: 'official', request: { protocolVersion: 1, caseIndex, args: c.args } })))
      expect(jobs.every(j => native.state(j).released && native.state(j).handlesClosed)).toBe(true)
      operation = 'public'
      const admitted = service.run(2, request), ref = { sessionId: admitted.sessionId, generation: admitted.generation }
      const publicResult = await service.completion(2, ref)
      const rows = language === 'csharp' ? publicResult.csharp!.result.cases : publicResult.javascript!.result.cases
      expect(rows.map(c => c.actual)).toEqual(judge.cases.slice(0, 2).map((c: { expected: unknown }) => c.expected))
      expect(publicResult.cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true })
      expect(snapshots.every(s => s.sessionId === ref.sessionId)).toBe(true)
      expect(() => service.snapshot(1, handle.reference)).toThrow()
      expect((await handle.completion()).disposition).toBe('INVALIDATED')
      await service.stop(); await packages.stop()
      expect(packages.status()).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
      expect(new Set(launches.map(l => l.pid)).size).toBe(launches.length)
      expect([...actions.values()].every(s => s.releases === 1 && s.closes === 1)).toBe(true)
      expect(watches.every(w => native.observation(w, 'identity').signaled)).toBe(true)
      await mkdir('out/e3-s4/native', { recursive: true })
      await writeFile(`out/e3-s4/native/${language}.json`, JSON.stringify({ language, windows: release(), node: process.version, abi: process.versions.modules,
        limits: EXERCISE_LIMITS, launches, result, publicResult, events: snapshots.length, actions: [...actions.values()], ledger: packages.status() }, null, 2))
    } finally {
      await service.stop(); await packages.stop(); nativeLocation.mockRestore()
      for (const watch of watches) native.observation(watch, 'close')
      await removeRoot(root)
    }
  }, 60_000)
})
