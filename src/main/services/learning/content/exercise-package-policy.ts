/** ADR-025 / 9E1-L1–L12. Design ceilings, not readiness, coverage or Runtime acceptance.
 * Reader, resident accounting and IPC enforcement belong to Steps 2–4. */
const KiB = 1024, MiB = 1024 * KiB
import { PUBLIC_PACKAGE_LIMITS as L } from '../../../../shared/contracts/exercise-package'
export const PACKAGE_POLICY = Object.freeze({
  schemaVersion: 1, policyVersion: 1, comparatorId: 'exact-typed', comparatorVersion: 1,
  manifestBytes: 4 * MiB, packages: L.packages, idCharacters: 64,
  metadataBytes: 256 * KiB, samplesBytes: 512 * KiB, judgeBytes: 4 * MiB,
  starterBytes: 64 * KiB, packageBytes: 6 * MiB, registryBytes: 256 * MiB,
  jsonBytes: 4 * MiB, depth: 12, objectProperties: 32, assetProperties: 100_000,
  assetNodes: 200_000, keyUnits: 64, arrayElements: 65_536,
  generalStringUnits: 262_144, numericTokenCharacters: 64,
  titleUnits: 256, statementUnits: 131_072, constraints: 32, constraintUnits: 2048,
  urlUnits: 2048, sourceUsageUnits: 8192, parameters: 16, identifierCharacters: 64,
  stringUnits: 32_768, integerElements: 65_536, stringElements: 1024,
  stringArrayUnits: 65_536, matrixRows: 1024, matrixColumns: 1024, matrixCells: 65_536,
  valueBytes: 256 * KiB, publicSamples: 16, officialCases: 128,
  requestBytes: 512 * KiB, expectedResponseBytes: 512 * KiB,
  summaryDefault: L.pageDefault, summaryMaximum: L.pageMaximum, pageBytes: L.pageBytes, publicDetailBytes: L.detailBytes,
  residentLogicalBytes: 16 * MiB, residentNodes: 1_000_000, rawBufferBytes: 8 * MiB,
  rssReviewBytes: 128 * MiB, stallP95Milliseconds: 50, stallMaxMilliseconds: 100,
  versionMaximum: 2_147_483_647,
} as const)

export const PACKAGE_ASSET_LIMITS = Object.freeze({
  metadata: PACKAGE_POLICY.metadataBytes, samples: PACKAGE_POLICY.samplesBytes,
  judge: PACKAGE_POLICY.judgeBytes, csharp: PACKAGE_POLICY.starterBytes,
  javascript: PACKAGE_POLICY.starterBytes,
})
export type PackageAssetKind = keyof typeof PACKAGE_ASSET_LIMITS

/** Safe classifications only: never embed asset contents, paths or parser messages. */
export type PackageValidationCode =
  | 'PACKAGE_MANIFEST_LIMIT' | 'PACKAGE_ASSET_LIMIT' | 'PACKAGE_STRUCTURE_LIMIT'
  | 'PACKAGE_JSON_INVALID' | 'PACKAGE_SCHEMA_INVALID' | 'PACKAGE_UNSUPPORTED'
  | 'PACKAGE_VALUE_LIMIT' | 'PACKAGE_CASE_LIMIT' | 'PACKAGE_DUPLICATE_ID'
  | 'PACKAGE_SIGNATURE_MISMATCH' | 'PACKAGE_SAMPLE_LINK_MISMATCH' | 'PACKAGE_PATH_INVALID' | 'PACKAGE_RESIDENT_LIMIT'

export type PackageValidationResult<T> = { ok: true; value: T }
  | { ok: false; code: PackageValidationCode }

export class PackageValidationError extends Error {
  constructor(readonly code: PackageValidationCode) { super(code) }
}
export function packageCheck(condition: unknown, code: PackageValidationCode): asserts condition {
  if (!condition) throw new PackageValidationError(code)
}
export function packageResult<T>(work: () => T): PackageValidationResult<T> {
  try { return { ok: true, value: work() } }
  catch (error) {
    return { ok: false, code: error instanceof PackageValidationError ? error.code : 'PACKAGE_SCHEMA_INVALID' }
  }
}
