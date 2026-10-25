import type { ExerciseLanguage, ExerciseType, ExerciseValue } from './practice'
/** Shared transport/cardinality ceilings from approved L1/L8; not runtime quotas. */
export const PUBLIC_PACKAGE_LIMITS = Object.freeze({ packages: 4096, pageDefault: 32, pageMaximum: 100,
  pageBytes: 256 * 1024, detailBytes: 1024 * 1024 })

/** Public data only. No official descriptor, asset path or hidden Judge values.
 * Additive contracts: the existing Exercise/Run contracts are unchanged. */
export interface PackageSignature {
  version: number
  hash: string
  functionName: string
  parameters: { name: string; type: ExerciseType }[]
  returnType: ExerciseType
}
export interface PackagePublicSample {
  id: string
  args: ExerciseValue[]
  expected: ExerciseValue
}
export interface PublicExercisePackage {
  schemaVersion: 1
  exerciseId: string
  packageVersion: number
  metadata: {
    chapter: number
    order: number
    title: string
    difficulty: 'Easy' | 'Medium' | 'Hard'
    source: { url: string; publisher: string; usage: string }
  }
  statement: string
  constraints: string[]
  signature: PackageSignature
  starters: Record<ExerciseLanguage, string>
  publicSamples: PackagePublicSample[]
}
