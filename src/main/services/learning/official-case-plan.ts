import { performance } from 'node:perf_hooks'
import type { ExercisePackageRegistry, PackageLease, PackagePrepareOwner } from './content/exercise-package-registry'
import { PACKAGE_POLICY as P } from './content/exercise-package-policy'
import type { ExerciseExecutionPhase, ExercisePhaseContext } from './runtime/exercise-runtime-adapter'
import { checkExecutionSignature, type ExecutionPlan } from './runtime/execution-plan'
import { exerciseCoreError } from './runtime/exercise-limits'
import type { ExerciseCleanupSnapshot } from '../../../shared/contracts/exercise'
import type { OfficialPackageCase } from './content/exercise-package-contracts'
import type { ExecutionValue } from './runtime/execution-plan'

export interface OfficialPlanIdentity {
  readonly exerciseId: string
  readonly packageVersion: number
  readonly testSetId: string
  readonly testSetVersion: number
  readonly signatureVersion: number
  readonly signatureHash: string
  readonly officialHash: string
  readonly comparatorId: 'exact-typed'
  readonly comparatorVersion: 1
}
/** Trusted Main caller only: supplied by the already admitted operation/Core.
 * Not a request validator or an alternative admission/cleanup lifecycle. */
export interface OfficialPlanOwner {
  readonly packageOwner: PackagePrepareOwner
  currentPhase(): { phase: ExerciseExecutionPhase; context: ExercisePhaseContext }
  /** Required cleanup is VERIFIED and execution/retained Core work has settled. */
  cleanup(): Readonly<ExerciseCleanupSnapshot>
  /** Attach to the SAME operation's content-release path, including failed Prepare. */
  retainContent(release: () => void): void
}
export interface OfficialCasePlan {
  readonly identity: Readonly<OfficialPlanIdentity>
  readonly execution: ExecutionPlan
  /** Judge-side alias only; NEVER part of a language descriptor or public DTO. */
  caseAt(index: number): Readonly<Omit<OfficialPackageCase, 'args' | 'expected'> & { args: readonly ExecutionValue[]; expected: ExecutionValue }>
  /** Registers serialized input + parsed representation in the existing ledger.
   * Caller releases this borrow after use, before releasing the plan. */
  representInput(index: number): ReturnType<PackageLease['representCooperative']>
  release(): void
}

/** No acquisition before admitted Prepare; no paths, raw packages or Renderer DTOs. */
export async function acquireOfficialCasePlan(registry: ExercisePackageRegistry, expected: OfficialPlanIdentity,
  owner: OfficialPlanOwner): Promise<OfficialCasePlan> {
  expected = Object.freeze({ ...expected })
  const original = owner.packageOwner
  let released = false
  let preparing = true
  const initial = owner.currentPhase()
  const signal = initial.context.signal
  const current = () => !released && original.isCurrent() && !signal.aborted
  const check = () => {
    const { phase, context } = owner.currentPhase()
    if (preparing && phase !== 'prepare' || !current() || context.signal !== signal || context.signal.aborted || performance.now() >= context.deadline) throw exerciseCoreError('ADMISSION_CLOSED')
  }
  const canRelease = () => {
    const cleanup = owner.cleanup()
    return cleanup.proof === 'VERIFIED' && cleanup.cleanupComplete && cleanup.processClean && !cleanup.pendingIo && original.canRelease()
  }
  if (initial.phase !== 'prepare' || original.phase !== 'prepare') throw exerciseCoreError('ADMISSION_CLOSED')
  check()
  // check() intentionally reads CURRENT Core phase, never a captured Prepare deadline.
  const lease = await registry.acquire(expected.exerciseId, { owner: original.owner, generation: original.generation,
    phase: 'prepare', isCurrent: current, check, retain: task => original.retain(task), canRelease })
  // On failure the same owner must drain retained work/cleanup and release this pin.
  // Keep a release handle available even when identity validation fails.
  const release = () => { if (released) return; if (!canRelease()) throw exerciseCoreError('RESULT_PENDING'); lease.release(); released = true }
  owner.retainContent(release)
  check()
  const { metadata: m, judge: j } = lease.data
  const identity: OfficialPlanIdentity = { exerciseId: m.exerciseId, packageVersion: m.packageVersion,
    testSetId: j.testSetId, testSetVersion: j.version, signatureVersion: m.signature.version,
    signatureHash: m.signature.hash, officialHash: m.official.hash, comparatorId: m.comparator.id, comparatorVersion: m.comparator.version }
  if ((Object.keys(identity) as (keyof OfficialPlanIdentity)[]).some(k => identity[k] !== expected[k])
    || j.exerciseId !== m.exerciseId || j.testSetId !== m.official.testSetId || j.version !== m.official.version
    || j.signatureVersion !== m.signature.version || j.signatureHash !== m.signature.hash) throw exerciseCoreError('HARNESS_SCHEMA')
  const count = j.cases.length
  checkExecutionSignature(m.signature, count)
  // Header only; all payload arrays remain frozen aliases of the one Registry tree.
  const signature = Object.freeze({ functionName: m.signature.functionName, parameters: m.signature.parameters, returnType: m.signature.returnType })
  const caseAt = (index: number) => {
    check()
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw exerciseCoreError('HARNESS_SCHEMA')
    return lease.data.judge.cases[index]
  }
  const execution: ExecutionPlan = Object.freeze({ signature, caseCount: count, inputAt(index: number) {
    // Touch the lease on every read: invalidation/shutdown revokes aliases.
    return caseAt(index).args
  } })
  preparing = false
  return Object.freeze({ identity: Object.freeze(identity), execution, caseAt,
    representInput(index: number) {
      const args = execution.inputAt(index)
      return lease.representCooperative(JSON.stringify({ protocolVersion: 1, caseIndex: index, args }), P.requestBytes)
    }, release })
}
