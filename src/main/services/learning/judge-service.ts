import type { OfficialJudgeView } from './official-case-plan'
import type { OfficialSettledCaseConsumer } from './runtime/official-execution-contracts'
import { exerciseCoreError } from './runtime/exercise-limits'
import { compareExactTyped } from './judge/exact-typed-comparator'
import { reduceJudgeVerdict } from './judge/verdict-reducer'
import type { JudgeComparisonEvidence, JudgeEligibilityInput } from './judge/judge-contracts'

/** One operation-local accumulator; ExerciseService alone admits, drives, closes,
 * authenticates the handoff and seals its result. No service/lifecycle owner here. */
export function createOfficialJudge() {
  let view: OfficialJudgeView | undefined, count: number | null = null, stopped = false
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
    if (result === 'DIFFERENT') return 'STOP'
    throw exerciseCoreError('OFFICIAL_JUDGE_INVALID')
  }
  return {
    initialize(leasedView: OfficialJudgeView) {
      if (count !== null) throw exerciseCoreError('OFFICIAL_JUDGE_INVALID')
      view = leasedView; count = leasedView.caseCount
    },
    consume,
    revokeView() { view = undefined },
    reduce(facts: Omit<JudgeEligibilityInput, 'caseCount' | 'comparisons'>) {
      return reduceJudgeVerdict({ ...facts, caseCount: count, comparisons })
    },
  }
}
