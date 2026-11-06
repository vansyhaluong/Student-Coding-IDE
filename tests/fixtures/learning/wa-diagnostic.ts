import type { ValidatedExercisePackage } from '../../../src/main/services/learning/content/exercise-package-contracts'
import type { OfficialPlanIdentity } from '../../../src/main/services/learning/official-case-plan'
import type { SubmissionDiagnostic } from '../../../src/shared/contracts/submission-diagnostic'

export const hiddenCanary = 'WA_B1_HIDDEN_CANARY_7c913'
/** Entirely synthetic; never reads production Official assets or executes student code. */
export function waPackage(): ValidatedExercisePackage {
  const signatureHash = 'a'.repeat(64)
  return {
    metadata: { schemaVersion: 1, exerciseId: 'wa-synthetic', packageVersion: 3,
      metadata: { chapter: 2, order: 0, title: 'Synthetic diagnostic', difficulty: 'Easy',
        source: { url: 'https://leetcode.com/problems/example/', publisher: 'Fixture', usage: 'Synthetic' } },
      statement: 'Return the input.', constraints: [],
      signature: { version: 1, hash: signatureHash, functionName: 'Solve', parameters: [{ name: 'value', type: 'string' }], returnType: 'string' },
      official: { testSetId: 'private-tests', version: 1, hash: 'b'.repeat(64) }, comparator: { id: 'exact-typed', version: 1 } },
    samples: { schemaVersion: 1, exerciseId: 'wa-synthetic', signatureVersion: 1, signatureHash,
      samples: [{ id: 'public-one', args: ['public 🙂'], expected: 'public 🙂' }, { id: 'public-two', args: ['second'], expected: 'second' }] },
    judge: { schemaVersion: 1, exerciseId: 'wa-synthetic', signatureVersion: 1, signatureHash,
      testSetId: 'private-tests', version: 1, comparator: { id: 'exact-typed', version: 1 }, cases: [
        { id: 'public-one', sampleId: 'public-one', visibility: 'public', args: ['public 🙂'], expected: 'public 🙂' },
        { id: 'public-two', sampleId: 'public-two', visibility: 'public', args: ['second'], expected: 'second' },
        { id: hiddenCanary, visibility: 'hidden', args: [hiddenCanary], expected: hiddenCanary },
      ] }, starters: { csharp: '// synthetic', javascript: '// synthetic' },
  }
}
export function waIdentity(data = waPackage()): OfficialPlanIdentity {
  const m = data.metadata, j = data.judge
  return { exerciseId: m.exerciseId, packageVersion: m.packageVersion, testSetId: j.testSetId, testSetVersion: j.version,
    signatureVersion: m.signature.version, signatureHash: m.signature.hash, officialHash: m.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
}
export function publicDiagnostic(): Extract<SubmissionDiagnostic, { kind: 'PUBLIC_SAMPLE_MISMATCH' }> {
  return { kind: 'PUBLIC_SAMPLE_MISMATCH', exerciseId: 'wa-synthetic', packageVersion: 3, sampleOrdinal: 1,
    parameterTypes: ['string'], input: ['public 🙂'], returnType: 'string', actual: 'wrong', expected: 'public 🙂' }
}
