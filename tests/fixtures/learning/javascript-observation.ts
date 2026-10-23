import type { ExerciseSnapshot } from '../../../src/shared/contracts/exercise'

export const javascriptObservation: NonNullable<ExerciseSnapshot['javascript']> = {
  schema: { parameterTypes: ['int32', 'int32'], returnType: 'int32', sampleCount: 2 },
  result: {
    syntax: { status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null },
    cases: [{ caseIndex: 0, outcome: 'RETURNED', actual: 8, stdout: '', stderr: '', exitCode: 0, failure: null }],
    notRunCaseIndices: [1], failure: null,
  },
}
