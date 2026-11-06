import { createHash } from 'node:crypto'
import type { LearningStore } from '../learning-store'
import type { SubmissionSourceRequest } from '../storage/submission-read-model'
import type { ExercisePackageRegistry } from '../content/exercise-package-registry'
import { inputSnapshot } from './validation'
import type { AnalysisInput } from './contracts'

export interface SavedAnalysisCapture {
  input: Readonly<AnalysisInput>
  submissionId: string
  exerciseId: string
}
export interface AnalysisSubmissionBinding extends SubmissionSourceRequest {
  exerciseId: string
  language: AnalysisInput['language']
  packageVersion: number
}
export class AnalysisCaptureError extends Error {
  constructor(readonly code: 'SOURCE_UNAVAILABLE' | 'CONTENT_VERSION_MISMATCH' | 'INVALID_INPUT') { super(code) }
}
/** Uses existing committed-read recovery and public-only Registry capability. */
export async function captureSavedAnalysis(store: Pick<LearningStore, 'analysisSource'>,
  packages: Pick<ExercisePackageRegistry, 'acquirePublic'>, binding: AnalysisSubmissionBinding,
  check: () => void): Promise<SavedAnalysisCapture> {
  check()
  const saved = await store.analysisSource({ key: binding.key, submissionId: binding.submissionId,
    sourceHash: binding.sourceHash, sourceRevision: binding.sourceRevision, offset: 0 })
  check()
  if (!saved.ok) throw new AnalysisCaptureError('SOURCE_UNAVAILABLE')
  if (saved.exerciseId !== binding.exerciseId || saved.language !== binding.language
    || saved.packageVersion !== binding.packageVersion) throw new AnalysisCaptureError('SOURCE_UNAVAILABLE')
  if (!saved.eof || saved.offset !== 0 || saved.nextOffset !== saved.totalBytes
    || saved.totalBytes !== Buffer.byteLength(saved.code) || saved.key.storeKind !== binding.key.storeKind
    || saved.key.recordId !== binding.key.recordId || saved.submissionId !== binding.submissionId
    || saved.sourceRevision !== binding.sourceRevision || saved.sourceHash !== binding.sourceHash
    || createHash('sha256').update(saved.code, 'utf8').digest('hex') !== binding.sourceHash) throw new AnalysisCaptureError('SOURCE_UNAVAILABLE')
  let settled = false
  const work = new Set<Promise<unknown>>()
  const lease = await packages.acquirePublic(saved.exerciseId, { owner: {}, generation: 1, phase: 'public',
    check, isCurrent: () => { try { check(); return true } catch { return false } },
    retain: task => { work.add(task); void task.finally(() => work.delete(task)).catch(() => {}) }, canRelease: () => settled })
  try {
    check()
    const m = lease.data.metadata
    if (m.exerciseId !== saved.exerciseId || m.packageVersion !== saved.packageVersion) throw new AnalysisCaptureError('CONTENT_VERSION_MISMATCH')
    // No samples, Expected, comparator, verdict, signatures or private diagnostics.
    return Object.freeze({ submissionId: saved.submissionId, exerciseId: saved.exerciseId,
      input: inputSnapshot({ language: saved.language, source: saved.code,
        publicStatement: m.statement, packageVersion: saved.packageVersion }) })
  } finally {
    await Promise.allSettled([...work]); settled = true; lease.release()
  }
}
