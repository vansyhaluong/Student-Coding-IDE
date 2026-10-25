import type { PackagePublicSample, PublicExercisePackage } from '../../../../shared/contracts/exercise-package'
import type { ExerciseValue } from '../../../../shared/contracts/practice'
import type { PackageAssetKind } from './exercise-package-policy'

/** Main-only: never export from shared contracts or attach to a public DTO. */
export interface PackageComparator { id: 'exact-typed'; version: 1 }
export interface OfficialTestDescriptor { testSetId: string; version: number; hash: string }
export interface ExerciseMetadataAsset extends Omit<PublicExercisePackage, 'starters' | 'publicSamples'> {
  comparator: PackageComparator
  official: OfficialTestDescriptor
}
export interface PackageSamplesAsset {
  schemaVersion: 1
  exerciseId: string
  signatureVersion: number
  signatureHash: string
  samples: PackagePublicSample[]
}
export interface OfficialPackageCase {
  id: string
  visibility: 'public' | 'hidden'
  sampleId?: string
  args: ExerciseValue[]
  expected: ExerciseValue
}
export interface OfficialPackageTestSet {
  schemaVersion: 1
  exerciseId: string
  testSetId: string
  version: number
  signatureVersion: number
  signatureHash: string
  comparator: PackageComparator
  cases: OfficialPackageCase[]
}
export interface PackageAssetDescriptor { path: string; bytes: number; sha256: string }
export interface ExercisePackageDescriptor {
  exerciseId: string
  packageVersion: number
  assets: Record<PackageAssetKind, PackageAssetDescriptor>
}
export interface PublicPackageDescriptor {
  profile: 'public-only'
  exerciseId: string
  packageVersion: number
  assets: Record<Exclude<PackageAssetKind, 'judge'>, PackageAssetDescriptor>
}
export interface PublicMetadataAsset extends Omit<ExerciseMetadataAsset, 'schemaVersion' | 'official'> {
  schemaVersion: 2
  official: null
}
export interface ValidatedPublicPackage {
  metadata: PublicMetadataAsset | ExerciseMetadataAsset
  samples: PackageSamplesAsset
  starters: { csharp: string; javascript: string }
}
export interface PublicPackageManifest {
  schemaVersion: 2
  policyVersion: 2
  version: number
  packages: (PublicPackageDescriptor | (ExercisePackageDescriptor & { profile: 'full' }))[]
}
export type PackageManifest = ExercisePackageManifest | PublicPackageManifest
export interface ExercisePackageManifest {
  schemaVersion: 1
  policyVersion: 1
  version: number
  packages: ExercisePackageDescriptor[]
}
export interface ValidatedExercisePackage {
  metadata: ExerciseMetadataAsset
  samples: PackageSamplesAsset
  judge: OfficialPackageTestSet
  starters: { csharp: string; javascript: string }
}
export type ExercisePackageAssetBytes = Record<PackageAssetKind, Uint8Array>
