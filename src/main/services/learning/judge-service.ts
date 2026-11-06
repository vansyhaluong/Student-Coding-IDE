import type { OfficialJudgeView } from './official-case-plan'
import type { OfficialSettledCaseConsumer } from './runtime/official-execution-contracts'
import { exerciseCoreError } from './runtime/exercise-limits'
import { compareExactTyped } from './judge/exact-typed-comparator'
import { reduceJudgeVerdict } from './judge/verdict-reducer'
import type { JudgeComparisonEvidence, JudgeEligibilityInput } from './judge/judge-contracts'
import type { JudgeResult } from './judge/judge-contracts'
import { isSubmissionDiagnostic, unavailableDiagnostic, type SubmissionDiagnostic } from '../../../shared/contracts/submission-diagnostic'

/** One operation-local accumulator; ExerciseService alone admits, drives, closes,
 * authenticates the handoff and seals its result. No service/lifecycle owner here. */
export function createOfficialJudge(captureDiagnostic = false) {
  let view: OfficialJudgeView | undefined, count: number | null = null, stopped = false
  let diagnostic: SubmissionDiagnostic | undefined, retired = false
  const comparisons: JudgeComparisonEvidence[] = []
  const consume: OfficialSettledCaseConsumer = row => {
    if (!view || stopped || row.kind !== 'RETURNED' || row.caseIndex !== comparisons.length || row.caseIndex >= view.caseCount)
      throw exerciseCoreError('OFFICIAL_JUDGE_INVALID')
    const result = compareExactTyped(view.returnType, row.actual, view.expectedAt(row.caseIndex), {
      id: view.identity.comparatorId, version: view.identity.comparatorVersion,
    })
    comparisons.push(Object.freeze({ caseIndex: row.caseIndex, result, barrierVerified: true }))
    if (result === 'PASS') return 'CONTINUE'
    stopped = true
    if (result === 'DIFFERENT') {
      if (captureDiagnostic && !retired) {
        try {
          const value = view.publicDiagnostic?.(row.caseIndex, row.actual)
          diagnostic = isSubmissionDiagnostic(value) ? structuredClone(value) : unavailableDiagnostic()
        } catch { diagnostic = unavailableDiagnostic() }
      }
      return 'STOP'
    }
    throw exerciseCoreError('OFFICIAL_JUDGE_INVALID')
  }
  return {
    initialize(leasedView: OfficialJudgeView) {
      if (count !== null) throw exerciseCoreError('OFFICIAL_JUDGE_INVALID')
      view = leasedView; count = leasedView.caseCount
    },
    consume,
    revokeView() { view = undefined },
    discardDiagnostic() { retired = true; diagnostic = undefined },
    diagnostic(result: JudgeResult): SubmissionDiagnostic | undefined {
      if (!captureDiagnostic || retired || result.state !== 'FINAL' || result.verdict !== 'WrongAnswer'
        || result.eligibility.kind !== 'GRADED_FAILURE_CANDIDATE') return undefined
      return structuredClone(diagnostic ?? unavailableDiagnostic())
    },
    reduce(facts: Omit<JudgeEligibilityInput, 'caseCount' | 'comparisons'>) {
      const result = reduceJudgeVerdict({ ...facts, caseCount: count, comparisons })
      if (result.state === 'FINAL' && result.verdict !== 'WrongAnswer') diagnostic = undefined
      return result
    },
  }
}
