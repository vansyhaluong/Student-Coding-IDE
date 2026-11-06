import { performance } from 'node:perf_hooks'
import type { ExercisePackageRegistry, PackageLease, PackagePrepareOwner } from './content/exercise-package-registry'
import { PACKAGE_POLICY as P } from './content/exercise-package-policy'
import type { ExerciseExecutionPhase, ExercisePhaseContext } from './runtime/exercise-runtime-adapter'
import { checkExecutionSignature, type ExecutionPlan } from './runtime/execution-plan'
import { exerciseCoreError } from './runtime/exercise-limits'
import type { ExerciseCleanupSnapshot } from '../../../shared/contracts/exercise'
import type { OfficialPackageCase } from './content/exercise-package-contracts'
import type { ExecutionValue } from './runtime/execution-plan'
import type { ExerciseRunRequest } from '../../../shared/contracts/exercise'
import type { ExerciseWorkspace } from './runtime/exercise-workspace'
import type { OfficialAdapterFactory, OfficialLanguageAdapter, OfficialLanguageEvidence } from './runtime/official-execution-contracts'
import type { ExerciseRuntimeAdapter } from './runtime/exercise-runtime-adapter'
import type { ExerciseType } from '../../../shared/contracts/practice'
import type { SubmissionDiagnostic } from '../../../shared/contracts/submission-diagnostic'
import { capturePublicSampleDiagnostic } from './judge/public-sample-diagnostic'

/** Judge-only lease alias. Never part of OfficialAdapterFactory's input. */
export interface OfficialJudgeView {
  readonly identity: Readonly<OfficialPlanIdentity>
  readonly returnType: ExerciseType
  readonly caseCount: number
  expectedAt(index: number): ExecutionValue
  publicDiagnostic?(index: number, actual: ExecutionValue): SubmissionDiagnostic
}

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
/** Main-only Submit selection. Identity is derived once from the owned Prepare lease. */
export type OfficialPlanSelection = OfficialPlanIdentity | Readonly<{ selection: 'CURRENT'; exerciseId: string }>

/** Same Core binding identity throughout acquisition, language execution and
 * cleanup. Construction is synchronous; acquisition/factory run only in Prepare. */
export function bindOfficialCasePlan(registry: ExercisePackageRegistry, expected: OfficialPlanSelection,
  owner: Omit<OfficialPlanOwner, 'currentPhase' | 'retainContent'>, request: Readonly<ExerciseRunRequest>, workspace: ExerciseWorkspace,
  create: OfficialAdapterFactory, initializeJudge?: (view: OfficialJudgeView) => void) {
  let phase: ExerciseExecutionPhase, context: ExercisePhaseContext
  let delegate: OfficialLanguageAdapter | undefined, plan: OfficialCasePlan | undefined, release: (() => void) | undefined
  let settled: OfficialLanguageEvidence | undefined
  let acquired = false, identity: OfficialPlanIdentity | undefined = 'selection' in expected ? undefined : expected, contentReleased = false
  const get = () => { if (!delegate) throw exerciseCoreError('RESULT_PENDING'); return delegate }
  const adapter: ExerciseRuntimeAdapter & { hasNextCase(): boolean } = {
    async runPhase(p, c) {
      phase = p; context = c
      if (!owner.packageOwner.isCurrent()) throw exerciseCoreError('RESULT_INVALIDATED')
      if (p === 'prepare') {
        if (delegate) throw exerciseCoreError('ADMISSION_CLOSED')
        delegate = create(request, workspace, async () => {
          plan = await acquireOfficialCasePlan(registry, expected, { ...owner,
            currentPhase: () => ({ phase, context }), retainContent: r => { release = r } })
          acquired = true; identity = plan.identity
          const acquiredPlan = plan
          initializeJudge?.(Object.freeze({ identity, returnType: plan.execution.signature.returnType, caseCount: plan.execution.caseCount,
            expectedAt(index: number) {
              if (phase !== 'execute') throw exerciseCoreError('ADMISSION_CLOSED')
              return acquiredPlan.caseAt(index).expected
            },
            publicDiagnostic(index: number, actual: ExecutionValue) {
              if (phase !== 'execute') throw exerciseCoreError('ADMISSION_CLOSED')
              return acquiredPlan.publicDiagnostic(index, actual)
            } }))
          return { execution: plan.execution, representInput: plan.representInput }
        })
      }
      await get().runPhase(p, c)
    },
    hasNextCase: () => get().hasNextCase(),
    verifyBetweenCases: c => {
      // The completed phase budget no longer governs: this is Core's existing
      // operation-budget barrier, also surrounding the synchronous consumer.
      context = { ...context, signal: c.signal, deadline: c.deadline }
      return get().verifyBetweenCases!(c)
    },
    async terminate(reason) { await delegate?.terminate(reason) },
    async settleObservers() { await delegate?.settleObservers() },
    async evidence() { return delegate ? delegate.evidence() : { members: [], retained: [], activeProcesses: 0, totalProcesses: 0,
      observerSettled: true, coverageComplete: true, unresolvedErrors: false } },
    async release() { await delegate?.release() },
    async closeHandles() { await delegate?.closeHandles() },
  }
  const evidence = (): OfficialLanguageEvidence => settled ?? delegate?.officialEvidence() ?? {
    cases: [], notRunCaseIndices: [], failure: { kind: 'INFRASTRUCTURE_FAILURE', phase: 'prepare', caseIndex: null } }
  return { adapter, evidence, identity: (): OfficialPlanIdentity => {
    if (!identity) throw exerciseCoreError('RESULT_PENDING')
    return identity
  }, planAcquired: () => acquired,
    representationBorrows: () => plan?.representationBorrows() ?? 0,
    contentReleased: () => contentReleased,
    releaseContent() {
      if (contentReleased) return
      // Capture aliases of bounded Runtime data, not another payload clone; the
      // language delegate/plan are then forgotten after final VERIFIED cleanup.
      settled ??= evidence()
      release?.(); release = undefined; delegate = undefined; plan = undefined; contentReleased = true
    },
  }
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
  publicDiagnostic(index: number, actual: ExecutionValue): SubmissionDiagnostic
  /** Registers serialized input + parsed representation in the existing ledger.
   * Caller releases this borrow after use, before releasing the plan. */
  representInput(index: number): ReturnType<PackageLease['representCooperative']>
  representationBorrows(): number
  release(): void
}

/** No acquisition before admitted Prepare; no paths, raw packages or Renderer DTOs. */
export async function acquireOfficialCasePlan(registry: ExercisePackageRegistry, expected: OfficialPlanSelection,
  owner: OfficialPlanOwner): Promise<OfficialCasePlan> {
  expected = Object.freeze({ ...expected })
  const original = owner.packageOwner
  let released = false
  let borrows = 0
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
    return borrows === 0 && cleanup.proof === 'VERIFIED' && cleanup.cleanupComplete && cleanup.processClean && !cleanup.pendingIo && original.canRelease()
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
  if (identity.exerciseId !== expected.exerciseId || identity.comparatorId !== 'exact-typed' || identity.comparatorVersion !== 1
    || !('selection' in expected) && (Object.keys(identity) as (keyof OfficialPlanIdentity)[]).some(k => identity[k] !== expected[k])
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
    publicDiagnostic(index: number, actual: ExecutionValue) {
      check()
      return capturePublicSampleDiagnostic(lease.data, identity, index, actual)
    },
    representationBorrows: () => borrows,
    async representInput(index: number) {
      const args = execution.inputAt(index)
      const representation = await lease.representCooperative(JSON.stringify({ protocolVersion: 1, caseIndex: index, args }), P.requestBytes)
      borrows++
      let done = false
      return Object.freeze({ get data() { return representation.data }, release() {
        if (done) return
        representation.release(); done = true; borrows--
      } })
    }, release })
}
