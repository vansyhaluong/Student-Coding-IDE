import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { packageRunBinding } from '../../src/main/services/learning/package-run-binding'
import type { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import type { JavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { registry, request, snapshot } from '../fixtures/learning/smart-hints'

class Owner extends EventEmitter { constructor(readonly id: number) { super() } isDestroyed() { return false } }
describe('SH-1 receipt in real ExerciseService with synthetic adapter (no native execution)', () => {
  it('same leased Run → cleanup/release → private receipt → exact capture; owner/generation retirement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sh1-run-')), r = registry(), q = request(), held = new Set<string>()
    const template = snapshot().javascript!, phases: string[] = [], cleanup = vi.fn()
    const service = new ExerciseService({ root, leases: { acquire: async id => {
      if (held.has(id)) return null
      held.add(id); return { release: async () => { held.delete(id) } }
    } }, createExecution: () => {
      const plan = packageRunBinding<JavascriptExecutionAdapter>(r.packages as ExercisePackageRegistry, q.exerciseId, () => ({
        runPhase: async (phase: string) => { phases.push(phase) }, result: () => structuredClone(template.result),
        terminate: async () => {}, settleObservers: async () => {}, release: async () => {}, closeHandles: async () => {},
        evidence: async () => ({ members: [], activeProcesses: 0, totalProcesses: 0, retained: [], observerSettled: true, coverageComplete: true, unresolvedErrors: false }),
      }) as unknown as JavascriptExecutionAdapter)
      return { adapter: plan.adapter, phases: ['compile', 'execute'], publicRunPackage: plan.publicRunPackage,
        releaseContent: () => { cleanup(); plan.releaseContent() }, javascriptObservation: () => plan.available() ? { schema: plan.schema()!, result: plan.adapter.result() } : undefined }
    } })
    try {
      service.start(); await service.ready(); service.observe(new Owner(1)); service.observe(new Owner(2))
      const admitted = service.run(1, { exerciseId: q.exerciseId, language: q.language, code: q.source, sourceRevision: q.sourceRevision })
      const ref = { sessionId: admitted.sessionId, generation: admitted.generation }
      expect(service.publicRunReceipt(1, admitted)).toBeUndefined()
      const final = await service.completion(1, ref)
      expect(final.cleanup.cleanupComplete).toBe(true); expect(phases).toEqual(['prepare', 'compile', 'execute'])
      expect(cleanup).toHaveBeenCalledOnce(); expect(r.release).toHaveBeenCalledOnce(); expect(held.size).toBe(0)
      const receipt = service.publicRunReceipt(1, admitted)!
      expect(receipt.context.kind).toBe('RUN_PUBLIC'); expect(JSON.stringify(receipt)).not.toMatch(/HIDDEN_CANARY|PRIVATE_PATH|stdout|stderr|caseIndex/)
      const c = await captureSmartHints(r.packages, { ...q, run: { sessionId: final.sessionId, generation: final.generation, sequence: final.sequence } }, 1, () => {}, receipt)
      expect(c.runContext.kind).toBe('RUN_PUBLIC'); expect(phases).toHaveLength(3)
      expect(() => service.publicRunReceipt(2, admitted)).toThrow()
      const beforeRetirement = service.snapshot(1, ref)
      service.retirePublicRunReceipt(1)
      expect(service.publicRunReceipt(1, admitted)).toBeUndefined()
      expect(service.snapshot(1, ref)).toEqual(beforeRetirement) // No Run result/generation mutation.
      service.invalidate(1, 'LEARNING_LEFT')
      expect(() => service.publicRunReceipt(1, admitted)).toThrow()
    } finally { await service.stop(); await rm(root, { recursive: true, force: true }) }
  })
})
