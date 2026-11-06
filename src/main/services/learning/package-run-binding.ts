import { performance } from 'node:perf_hooks'
import type { Exercise } from '../../../shared/contracts/practice'
import { isExercise } from '../../../shared/contracts/practice'
import type { ExerciseEndReason } from '../../../shared/contracts/exercise'
import type { ExercisePhaseContext, ExerciseRuntimeAdapter, ExerciseTerminationEvidence } from './runtime/exercise-runtime-adapter'
import type { CsharpExecutionAdapter } from './runtime/csharp-execution-contracts'
import type { JavascriptExecutionAdapter } from './runtime/javascript-execution-contracts'
import { exerciseCoreError } from './runtime/exercise-limits'
import type { ExercisePackageRegistry, PublicPackageLease } from './content/exercise-package-registry'
import { publicExercise } from './content/public-exercise-projection'
import { PACKAGE_POLICY as P } from './content/exercise-package-policy'
import { publicRunPackage } from './smart-hints/public-run-receipt'

/** Additive Main binding; delegates unchanged9D adapters after Core admits Prepare. */
export function packageRunBinding<T extends CsharpExecutionAdapter | JavascriptExecutionAdapter>(registry: ExercisePackageRegistry,
  id: string, factory: (exercise: Exercise) => T) {
  let delegate: T | undefined, lease: PublicPackageLease | undefined
  let representation: ReturnType<PublicPackageLease['represent']> | undefined
  let pending: Promise<unknown> | undefined, signal: AbortSignal | undefined
  let released = false, clean = false
  let receiptPackage: ReturnType<typeof publicRunPackage>
  const owner = {}
  let schema: { parameterTypes: Exercise['parameters'][number]['type'][]; returnType: Exercise['returnType']; sampleCount: number } | undefined
  const get = (): T => { if (!delegate) throw exerciseCoreError('RESULT_PENDING'); return delegate }
  const adapter: ExerciseRuntimeAdapter & { hasNextCase(): boolean; result(): ReturnType<T['result']>; verifyBetweenCases(context: Pick<ExercisePhaseContext, 'signal' | 'deadline'>): Promise<void> } = {
    async runPhase(phase, context) {
      if (phase === 'prepare') {
        signal = context.signal
        const check = () => { if (signal!.aborted || released || performance.now() >= context.deadline) throw exerciseCoreError('ADMISSION_CLOSED') }
        lease = await registry.acquirePublic(id, { owner, generation: 1, phase: 'prepare', isCurrent: () => !released && !signal!.aborted,
          check, retain: task => { pending = task }, canRelease: () => clean })
        check()
        // Reserve both input projection and the adapter's unchanged structuredClone.
        representation = await lease.representCooperative(JSON.stringify(publicExercise(lease.data)), P.publicDetailBytes, 2)
        check()
        const exercise = representation.data
        if (!isExercise(exercise)) throw exerciseCoreError('INTERNAL_ERROR')
        // Capture detached public mapping now, from the inputs actually projected to this adapter.
        // Advisory failure never changes the admitted Run or its cleanup.
        try {
          const candidate = publicRunPackage(lease.data)
          if (candidate && JSON.stringify(candidate.samples.map(s => ({ args: s.args, expected: s.expected }))) === JSON.stringify(exercise.samples)) receiptPackage = candidate
        } catch { receiptPackage = undefined }
        delegate = factory(exercise)
        schema = { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }
      }
      await get().runPhase(phase, context)
    },
    hasNextCase: () => get().hasNextCase(), result: () => get().result() as ReturnType<T['result']>,
    verifyBetweenCases: context => get().verifyBetweenCases(context),
    async terminate(reason: ExerciseEndReason) { if (delegate) await delegate.terminate(reason) },
    async settleObservers() { await pending?.catch(() => {}); if (delegate) await delegate.settleObservers() },
    async evidence(): Promise<ExerciseTerminationEvidence> {
      return delegate ? delegate.evidence() : { members: [], activeProcesses: 0, totalProcesses: 0, retained: [], coverageComplete: true, observerSettled: true, unresolvedErrors: false }
    },
    async release() { if (delegate) await delegate.release() },
    async closeHandles() { if (delegate) await delegate.closeHandles() },
  }
  return {
    adapter,
    schema: () => schema,
    available: () => !!delegate,
    // Detached public-only evidence from the SAME leased input used by the adapter.
    publicRunPackage: () => !released && receiptPackage ? structuredClone(receiptPackage) : undefined,
    /** Called by ExerciseService only after Core cleanup AND execution settle. */
    releaseContent() { clean = true; released = true; delegate = undefined; schema = undefined; receiptPackage = undefined; representation?.release(); representation = undefined; lease?.release(); lease = undefined; pending = undefined },
  }
}
