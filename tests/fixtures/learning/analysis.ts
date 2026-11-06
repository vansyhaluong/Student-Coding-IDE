import { vi } from 'vitest'
import type { ExercisePackageRegistry, PackagePrepareOwner, PublicPackageLease } from '../../../src/main/services/learning/content/exercise-package-registry'
import type { Analysis } from '../../../src/shared/contracts/analysis'
import type { SubmissionRecord } from '../../../src/main/services/learning/storage/submission-contracts'
import { sourceRequest } from './submission-read-fixture'
export const analysisBinding = (r: SubmissionRecord) => ({ ...sourceRequest(r),
  exerciseId: r.exerciseId, language: r.language, packageVersion: r.packageVersion })
export const analysis: Analysis = { schemaVersion: 1, algorithmAnalysis: 'Scan the synthetic input.',
  timeComplexity: { bigO: 'O(n)', explanation: 'One pass.' }, spaceComplexity: { bigO: 'O(1)', explanation: 'Auxiliary space.' },
  codeQuality: ['Readable.'], improvements: ['Consider boundary inputs.'] }
export const input = { language: 'javascript' as const, source: 'return 1; // synthetic 🐟\r\n', publicStatement: 'Return a synthetic value.', packageVersion: 1 }
export const capture = { input, submissionId: '00000001-0000-4000-8000-000000000000', exerciseId: 'synthetic' }
export function envelope(content = JSON.stringify(analysis)) {
  return { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] }
}
export const response = (content = JSON.stringify(envelope())) => new Response(content, { headers: { 'content-type': 'application/json' } })
export function publicPackages(version = 1) {
  let pinned = false
  const release = vi.fn(() => { pinned = false })
  const acquirePublic = vi.fn(async (id: string, owner: PackagePrepareOwner) => {
    owner.check(); pinned = true
    return { data: { metadata: { exerciseId: id, packageVersion: version, statement: input.publicStatement,
      comparator: 'PRIVATE_COMPARATOR', official: 'HIDDEN_OFFICIAL', signature: 'PRIVATE_SIGNATURE' },
      samples: { expected: 'EXPECTED_CANARY' }, starters: { javascript: 'DRAFT_CANARY' } }, release } as unknown as PublicPackageLease
  })
  return { packages: { acquirePublic } as Pick<ExercisePackageRegistry, 'acquirePublic'>, acquirePublic, release,
    get pinned() { return pinned } }
}
export function gate<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { resolve, promise }
}
