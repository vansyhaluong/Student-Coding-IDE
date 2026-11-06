import type { ValidatedExercisePackage } from '../content/exercise-package-contracts'
import type { OfficialPlanIdentity } from '../official-case-plan'
import { diagnosticJsonBytes, isSubmissionDiagnostic, unavailableDiagnostic,
  type SubmissionDiagnostic } from '../../../../shared/contracts/submission-diagnostic'

/** Invoked only under the current leased plan after DIFFERENT. Public values
 * originate in samples, never in the Official case. No alias escapes this call. */
export function capturePublicSampleDiagnostic(data: ValidatedExercisePackage, identity: OfficialPlanIdentity,
  index: number, actual: unknown): SubmissionDiagnostic {
  try {
    const { metadata: m, samples: s, judge: j } = data
    if (m.exerciseId !== identity.exerciseId || m.packageVersion !== identity.packageVersion
      || !Number.isSafeInteger(m.packageVersion) || m.packageVersion < 1
      || s.exerciseId !== m.exerciseId || j.exerciseId !== m.exerciseId
      || s.signatureHash !== m.signature.hash || s.signatureVersion !== m.signature.version
      || j.signatureHash !== m.signature.hash || j.signatureVersion !== m.signature.version
      || identity.signatureHash !== m.signature.hash || identity.signatureVersion !== m.signature.version
      || identity.testSetId !== j.testSetId || identity.testSetVersion !== j.version || identity.officialHash !== m.official.hash
      || !Number.isSafeInteger(index) || index < 0 || index >= s.samples.length) return unavailableDiagnostic()
    const sample = s.samples[index], official = j.cases[index]
    if (!sample || !official || official.visibility !== 'public' || !sample.id
      || official.sampleId !== sample.id || official.id !== sample.id
      || s.samples.filter(v => v.id === sample.id).length !== 1
      || j.cases.filter(v => v.id === sample.id || v.sampleId === sample.id).length !== 1) return unavailableDiagnostic()
    const candidate = { kind: 'PUBLIC_SAMPLE_MISMATCH' as const, exerciseId: m.exerciseId, packageVersion: m.packageVersion,
      sampleOrdinal: index + 1, parameterTypes: m.signature.parameters.map(p => p.type), input: sample.args,
      returnType: m.signature.returnType, actual, expected: sample.expected }
    if (diagnosticJsonBytes(candidate) === null) return unavailableDiagnostic('DETAIL_LIMIT_EXCEEDED')
    if (!isSubmissionDiagnostic(candidate)
      || diagnosticJsonBytes(official.args) === null || diagnosticJsonBytes(official.expected) === null
      || JSON.stringify(official.args) !== JSON.stringify(sample.args)
      || JSON.stringify(official.expected) !== JSON.stringify(sample.expected)) return unavailableDiagnostic()
    // Parse bounded descriptor-validated JSON: detached from both actual and lease.
    return JSON.parse(JSON.stringify(candidate)) as SubmissionDiagnostic
  } catch { return unavailableDiagnostic() }
}
