import { matchesExerciseType, type ExerciseType, type ExerciseValue } from '../../../../shared/contracts/practice'
import type { PackageSignature } from '../../../../shared/contracts/exercise-package'
import type { CsharpHarnessRequest, CsharpHarnessResponse } from '../../../../shared/contracts/csharp-execution'
import { decodePackageUtf8, parsePackageJsonWork, cooperativePackageResult } from './bounded-package-json'
import { NODE_WORK, ENTRY_WORK, WORK_BARRIER, runPackageWorkSync, type PackageWork, type PackageWorkControl } from './exercise-package-work'
import type { PackageAllocationObserver } from './exercise-package-budget'
import { PACKAGE_POLICY as P, PACKAGE_ASSET_LIMITS, packageCheck as check, packageResult,
  type PackageAssetKind, type PackageValidationResult } from './exercise-package-policy'
import type { ExerciseMetadataAsset, ExercisePackageAssetBytes,
  OfficialPackageTestSet, PackageSamplesAsset, ValidatedExercisePackage } from './exercise-package-contracts'
import type { PackageManifest, PublicMetadataAsset, ValidatedPublicPackage } from './exercise-package-contracts'

const types: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const assetKinds = Object.keys(PACKAGE_ASSET_LIMITS) as PackageAssetKind[]
const keywords = new Set((
  'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while ' +
  'await debugger delete export extends function implements import instanceof let package super var with yield arguments eval ' +
  'Solution Harness __learningData'
).split(' '))
const failSchema = (ok: unknown): void => check(ok, 'PACKAGE_SCHEMA_INVALID')
const size = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

// Internal helpers only receive a tree returned by the bounded byte parser. No
// arbitrary object/getter/Proxy validator API or post-parse-only admission route.
function object(v: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  failSchema(v !== null && typeof v === 'object' && !Array.isArray(v))
  const record = v as Record<string, unknown>, keys = Object.keys(record)
  failSchema(required.every(k => Object.hasOwn(record, k)) && keys.every(k => required.includes(k) || optional.includes(k)))
  return record
}
function array(v: unknown, maximum: number): unknown[] {
  failSchema(Array.isArray(v))
  check((v as unknown[]).length <= maximum, 'PACKAGE_VALUE_LIMIT')
  return v as unknown[]
}
function text(v: unknown, maximum: number): string {
  failSchema(typeof v === 'string')
  check((v as string).length <= maximum, 'PACKAGE_VALUE_LIMIT')
  return v as string
}
function id(v: unknown): string {
  const s = text(v, P.idCharacters)
  failSchema(/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s))
  return s
}
function version(v: unknown): void {
  failSchema(typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= P.versionMaximum)
}
function hash(v: unknown): void { failSchema(typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)) }
function schema(v: unknown): void { check(v === P.schemaVersion, 'PACKAGE_UNSUPPORTED') }
function comparator(v: unknown): void {
  const c = object(v, ['id', 'version'])
  check(c.id === P.comparatorId && c.version === P.comparatorVersion, 'PACKAGE_UNSUPPORTED')
}
function identifier(v: unknown): string {
  const s = text(v, P.identifierCharacters)
  // Common spelling accepted by the existing C#/JS function harnesses.
  check(/^[A-Za-z][A-Za-z0-9]*$/.test(s) && !keywords.has(s), 'PACKAGE_SIGNATURE_MISMATCH')
  return s
}
function type(v: unknown): ExerciseType {
  check(typeof v === 'string' && types.includes(v as ExerciseType), 'PACKAGE_UNSUPPORTED')
  return v as ExerciseType
}
function signature(v: unknown): void {
  const s = object(v, ['version', 'hash', 'functionName', 'parameters', 'returnType'])
  version(s.version); hash(s.hash); identifier(s.functionName); type(s.returnType)
  const parameters = array(s.parameters, P.parameters), names = new Set<string>()
  for (const p of parameters) {
    const parameter = object(p, ['name', 'type']), name = identifier(parameter.name)
    check(!names.has(name), 'PACKAGE_SIGNATURE_MISMATCH'); names.add(name); type(parameter.type)
  }
}
function* parsed(bytes: Uint8Array, maximum: number, allocations?: PackageAllocationObserver): PackageWork<unknown> {
  return yield* parsePackageJsonWork(bytes, maximum, allocations)
}
function* metadata(bytes: Uint8Array, allocations?: PackageAllocationObserver, publicOnly = false): PackageWork<ExerciseMetadataAsset> {
  const v = object((yield* parsed(bytes, P.metadataBytes, allocations)), ['schemaVersion', 'exerciseId', 'packageVersion',
    'metadata', 'statement', 'constraints', 'signature', 'official', 'comparator'])
  if (publicOnly) check(v.schemaVersion === 2, 'PACKAGE_UNSUPPORTED')
  else schema(v.schemaVersion)
  id(v.exerciseId); version(v.packageVersion)
  const m = object(v.metadata, ['chapter', 'order', 'title', 'difficulty', 'source'])
  failSchema(Number.isInteger(m.chapter) && (m.chapter as number) >= 2 && (m.chapter as number) <= 8)
  failSchema(Number.isSafeInteger(m.order) && (m.order as number) >= 0)
  text(m.title, P.titleUnits); failSchema(['Easy', 'Medium', 'Hard'].includes(m.difficulty as string))
  const source = object(m.source, ['url', 'publisher', 'usage'])
  const url = text(source.url, P.urlUnits)
  failSchema(/^https:\/\/(leetcode\.com\/problems\/|www\.w3resource\.com\/csharp-exercises\/)/.test(url))
  text(source.publisher, P.generalStringUnits); text(source.usage, P.sourceUsageUnits)
  text(v.statement, P.statementUnits)
  array(v.constraints, P.constraints).forEach(c => text(c, P.constraintUnits))
  signature(v.signature); comparator(v.comparator)
  if (publicOnly) failSchema(v.official === null)
  else {
    const official = object(v.official, ['testSetId', 'version', 'hash'])
    id(official.testSetId); version(official.version); hash(official.hash)
  }
  return v as unknown as ExerciseMetadataAsset
}

function* typed(v: unknown, kind: ExerciseType): PackageWork<void> {
  if (kind === 'string') {
    check(typeof v === 'string', 'PACKAGE_SIGNATURE_MISMATCH'); text(v, P.stringUnits)
  }
  if (kind.endsWith('[]')) check(Array.isArray(v), 'PACKAGE_SIGNATURE_MISMATCH')
  if (kind === 'int32[]') array(v, P.integerElements)
  if (kind === 'string[]') {
    let units = 0
    for (const s of array(v, P.stringElements)) {
      yield NODE_WORK
      check(typeof s === 'string', 'PACKAGE_SIGNATURE_MISMATCH'); units += text(s, P.stringUnits).length
    }
    check(units <= P.stringArrayUnits, 'PACKAGE_VALUE_LIMIT')
  }
  if (kind === 'int32[][]') {
    const rows = array(v, P.matrixRows)
    let cells = 0
    for (const row of rows) {
      yield NODE_WORK
      check(Array.isArray(row), 'PACKAGE_SIGNATURE_MISMATCH'); cells += array(row, P.matrixColumns).length
    }
    check(cells <= P.matrixCells, 'PACKAGE_VALUE_LIMIT')
  }
  // Reuse existing int32/type/rectangular semantics after structural bounds.
  yield WORK_BARRIER
  check(matchesExerciseType(v, kind), 'PACKAGE_SIGNATURE_MISMATCH')
  yield WORK_BARRIER
  check(size(v) <= P.valueBytes, 'PACKAGE_VALUE_LIMIT')
  yield WORK_BARRIER
}
function* test(v: Record<string, unknown>, s: PackageSignature, caseIndex: number): PackageWork<void> {
  const args = array(v.args, P.parameters)
  check(args.length === s.parameters.length, 'PACKAGE_SIGNATURE_MISMATCH')
  const checkedArgs: ExerciseValue[] = []
  for (let i = 0; i < args.length; i++) { yield* typed(args[i], s.parameters[i].type); checkedArgs.push(args[i] as ExerciseValue) }
  yield* typed(v.expected, s.returnType)
  const request = { protocolVersion: 1, caseIndex, args: checkedArgs } satisfies CsharpHarnessRequest
  const expectedResponse = { protocolVersion: 1, caseIndex, outcome: 'RETURNED', actual: v.expected as ExerciseValue,
    stdout: '', stderr: '' } satisfies CsharpHarnessResponse
  // Both existing languages use this same wire envelope; no runtime/checker runs.
  yield WORK_BARRIER
  const requestFits = size(request) <= P.requestBytes
  yield WORK_BARRIER
  check(requestFits && size(expectedResponse) <= P.expectedResponseBytes, 'PACKAGE_VALUE_LIMIT')
  yield WORK_BARRIER
}
function compatible(v: Record<string, unknown>, m: ExerciseMetadataAsset): void {
  schema(v.schemaVersion); id(v.exerciseId); version(v.signatureVersion); hash(v.signatureHash)
  check(v.exerciseId === m.exerciseId && v.signatureVersion === m.signature.version
    && v.signatureHash === m.signature.hash, 'PACKAGE_SIGNATURE_MISMATCH')
}
function* samples(bytes: Uint8Array, m: ExerciseMetadataAsset, allocations?: PackageAllocationObserver): PackageWork<PackageSamplesAsset> {
  const v = object((yield* parsed(bytes, P.samplesBytes, allocations)), ['schemaVersion', 'exerciseId', 'signatureVersion', 'signatureHash', 'samples'])
  compatible(v, m)
  failSchema(Array.isArray(v.samples))
  const cases = v.samples as unknown[]
  check(cases.length > 0 && cases.length <= P.publicSamples, 'PACKAGE_CASE_LIMIT')
  const ids = new Set<string>()
  for (let i = 0; i < cases.length; i++) {
    yield NODE_WORK
    const c = cases[i]
    const value = object(c, ['id', 'args', 'expected']), key = id(value.id)
    check(!ids.has(key), 'PACKAGE_DUPLICATE_ID'); ids.add(key); yield* test(value, m.signature, i)
  }
  return v as unknown as PackageSamplesAsset
}
function* judge(bytes: Uint8Array, m: ExerciseMetadataAsset, s: PackageSamplesAsset, allocations?: PackageAllocationObserver): PackageWork<OfficialPackageTestSet> {
  const v = object((yield* parsed(bytes, P.judgeBytes, allocations)), ['schemaVersion', 'exerciseId', 'testSetId', 'version',
    'signatureVersion', 'signatureHash', 'comparator', 'cases'])
  compatible(v, m); comparator(v.comparator); id(v.testSetId); version(v.version)
  check(v.testSetId === m.official.testSetId && v.version === m.official.version, 'PACKAGE_SIGNATURE_MISMATCH')
  failSchema(Array.isArray(v.cases))
  const cases = v.cases as unknown[]
  check(cases.length > 0 && cases.length <= P.officialCases, 'PACKAGE_CASE_LIMIT')
  check(cases.length > s.samples.length, 'PACKAGE_SAMPLE_LINK_MISMATCH')
  const ids = new Set<string>()
  for (let i = 0; i < cases.length; i++) {
    yield NODE_WORK
    const c = cases[i]
    const value = object(c, ['id', 'visibility', 'args', 'expected'], ['sampleId']), key = id(value.id)
    check(!ids.has(key), 'PACKAGE_DUPLICATE_ID'); ids.add(key); yield* test(value, m.signature, i)
    failSchema(value.visibility === 'public' || value.visibility === 'hidden')
    if (i < s.samples.length) {
      const sample = s.samples[i]
      yield WORK_BARRIER
      check(value.visibility === 'public' && value.sampleId === sample.id && key === sample.id
        && JSON.stringify(value.args) === JSON.stringify(sample.args)
        && JSON.stringify(value.expected) === JSON.stringify(sample.expected), 'PACKAGE_SAMPLE_LINK_MISMATCH')
      yield WORK_BARRIER
    } else check(value.visibility === 'hidden' && !Object.hasOwn(value, 'sampleId'), 'PACKAGE_SAMPLE_LINK_MISMATCH')
  }
  return v as unknown as OfficialPackageTestSet
}

export function validatePackageMetadata(bytes: Uint8Array): PackageValidationResult<ExerciseMetadataAsset> {
  return packageResult(() => runPackageWorkSync(metadata(bytes)))
}
export function validatePackageTypedValue(bytes: Uint8Array, kind: ExerciseType): PackageValidationResult<ExerciseValue> {
  return packageResult(() => runPackageWorkSync((function* (): PackageWork<ExerciseValue> { const v = yield* parsed(bytes, P.jsonBytes); yield* typed(v, type(kind)); return v as ExerciseValue })()))
}
/** Pure structural admission, NOT integrity/readiness/release certification.
 * Input map is Main-owned fixed wiring; only its byte contents are untrusted.
 * No hash computation or filesystem/registry/IPC integration in Step 1. */
function* validateExercisePackageAssetsWork(assets: ExercisePackageAssetBytes, allocations?: PackageAllocationObserver): PackageWork<ValidatedExercisePackage> {
    failSchema(assetKinds.length === Object.keys(assets).length && assetKinds.every(k => Object.hasOwn(assets, k)))
    let total = 0
    for (const k of assetKinds) {
      check(assets[k] instanceof Uint8Array && assets[k].byteLength <= PACKAGE_ASSET_LIMITS[k], 'PACKAGE_ASSET_LIMIT')
      total += assets[k].byteLength
    }
    check(total <= P.packageBytes, 'PACKAGE_ASSET_LIMIT')
    const m = yield* metadata(assets.metadata, allocations), s = yield* samples(assets.samples, m, allocations), j = yield* judge(assets.judge, m, s, allocations)
    yield WORK_BARRIER
    const csharp = decodePackageUtf8(assets.csharp, P.starterBytes), javascript = decodePackageUtf8(assets.javascript, P.starterBytes)
    yield WORK_BARRIER
    // Two wrapper objects + two retained starter strings. Three asset roots were
    // charged by the scanner; aliases do not create second data trees.
    allocations?.parsed({ canonicalBytes: size({ metadata: null, samples: null, judge: null, starters: { csharp: null, javascript: null } })
      - 5 * 4 + size(csharp) + size(javascript), nodes: 4 })
    return { metadata: m, samples: s, judge: j, starters: { csharp, javascript } }
}

export function validateExercisePackageAssets(assets: ExercisePackageAssetBytes, allocations?: PackageAllocationObserver): PackageValidationResult<ValidatedExercisePackage> {
  return packageResult(() => runPackageWorkSync(validateExercisePackageAssetsWork(assets, allocations)))
}
export function validateExercisePackageAssetsCooperative(assets: ExercisePackageAssetBytes, allocations: PackageAllocationObserver | undefined, control: PackageWorkControl): Promise<PackageValidationResult<ValidatedExercisePackage>> {
  return cooperativePackageResult(validateExercisePackageAssetsWork(assets, allocations), control)
}

/** Declared lengths/hashes only. Actual SHA-256/root/file identity verification is
 * explicitly deferred to Step 2. Returned metadata is not asset readiness. */
function* validatePackageManifestWork(bytes: Uint8Array, allocations?: PackageAllocationObserver): PackageWork<PackageManifest> {
    check(bytes instanceof Uint8Array && bytes.byteLength <= P.manifestBytes, 'PACKAGE_MANIFEST_LIMIT')
    const v = object((yield* parsed(bytes, P.manifestBytes, allocations)), ['schemaVersion', 'policyVersion', 'version', 'packages'])
    check(v.schemaVersion === 1 && v.policyVersion === 1 || v.schemaVersion === 2 && v.policyVersion === 2, 'PACKAGE_UNSUPPORTED'); version(v.version)
    failSchema(Array.isArray(v.packages))
    const entries = v.packages as unknown[]
    check(entries.length <= P.packages, 'PACKAGE_MANIFEST_LIMIT')
    const ids = new Set<string>(), paths = new Set<string>()
    let registryBytes = bytes.byteLength
    for (const entry of entries) {
      yield ENTRY_WORK
      const e = object(entry, v.schemaVersion === 2 ? ['exerciseId', 'packageVersion', 'assets', 'profile'] : ['exerciseId', 'packageVersion', 'assets']), key = id(e.exerciseId)
      if (v.schemaVersion === 2) failSchema(e.profile === 'public-only' || e.profile === 'full')
      check(!ids.has(key), 'PACKAGE_DUPLICATE_ID'); ids.add(key)
      // Windows lookup collisions must not depend on the installed filesystem.
      check(!paths.has(key.toLowerCase()), 'PACKAGE_PATH_INVALID'); paths.add(key.toLowerCase())
      version(e.packageVersion)
      const kinds = e.profile === 'public-only' ? assetKinds.filter(k => k !== 'judge') : assetKinds
      const assets = object(e.assets, kinds)
      let packageBytes = 0
      for (const k of kinds) {
      yield NODE_WORK
        const a = object(assets[k], ['path', 'bytes', 'sha256']); hash(a.sha256)
        check(typeof a.bytes === 'number' && Number.isSafeInteger(a.bytes) && a.bytes >= 0
          && a.bytes <= PACKAGE_ASSET_LIMITS[k], 'PACKAGE_ASSET_LIMIT')
        const fixed = { metadata: 'exercise.json', samples: 'samples.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
        check(k === 'judge' ? typeof a.path === 'string' && /^judge\/v[1-9]\d{0,9}\.json$/.test(a.path)
          && Number(a.path.slice(7, -5)) <= P.versionMaximum : a.path === fixed[k], 'PACKAGE_PATH_INVALID')
        packageBytes += a.bytes as number
      }
      check(packageBytes <= P.packageBytes, 'PACKAGE_ASSET_LIMIT'); registryBytes += packageBytes
    }
    check(registryBytes <= P.registryBytes, 'PACKAGE_MANIFEST_LIMIT')
    return v as unknown as PackageManifest
}

export function validatePackageManifest(bytes: Uint8Array, allocations?: PackageAllocationObserver): PackageValidationResult<PackageManifest> {
  return packageResult(() => runPackageWorkSync(validatePackageManifestWork(bytes, allocations)))
}
export function validatePackageManifestCooperative(bytes: Uint8Array, allocations: PackageAllocationObserver | undefined, control: PackageWorkControl): Promise<PackageValidationResult<PackageManifest>> {
  return cooperativePackageResult(validatePackageManifestWork(bytes, allocations), control)
}

/** Public capability parses no Judge bytes, even when a full profile is declared. */
function* validatePublicPackageAssetsWork(assets: Omit<ExercisePackageAssetBytes, 'judge'>, publicOnly: boolean,
  allocations?: PackageAllocationObserver): PackageWork<ValidatedPublicPackage> {
    const kinds = assetKinds.filter(k => k !== 'judge')
    failSchema(Object.keys(assets).length === kinds.length && kinds.every(k => Object.hasOwn(assets, k)))
    let total = 0
    for (const k of kinds) {
      yield NODE_WORK
      check(assets[k] instanceof Uint8Array && assets[k].byteLength <= PACKAGE_ASSET_LIMITS[k], 'PACKAGE_ASSET_LIMIT')
      total += assets[k].byteLength
    }
    check(total <= P.packageBytes, 'PACKAGE_ASSET_LIMIT')
    const m = yield* metadata(assets.metadata, allocations, publicOnly), s = yield* samples(assets.samples, m, allocations)
    yield WORK_BARRIER
    const csharp = decodePackageUtf8(assets.csharp, P.starterBytes), javascript = decodePackageUtf8(assets.javascript, P.starterBytes)
    yield WORK_BARRIER
    allocations?.parsed({ canonicalBytes: size({ metadata: null, samples: null, starters: { csharp: null, javascript: null } })
      - 4 * 4 + size(csharp) + size(javascript), nodes: 4 })
    return { metadata: publicOnly ? m as unknown as PublicMetadataAsset : m, samples: s, starters: { csharp, javascript } }
}

export function validatePublicPackageAssets(assets: Omit<ExercisePackageAssetBytes, 'judge'>, publicOnly: boolean,
  allocations?: PackageAllocationObserver): PackageValidationResult<ValidatedPublicPackage> {
  return packageResult(() => runPackageWorkSync(validatePublicPackageAssetsWork(assets, publicOnly, allocations)))
}
export function validatePublicPackageAssetsCooperative(assets: Omit<ExercisePackageAssetBytes, 'judge'>, publicOnly: boolean,
  allocations: PackageAllocationObserver | undefined, control: PackageWorkControl): Promise<PackageValidationResult<ValidatedPublicPackage>> {
  return cooperativePackageResult(validatePublicPackageAssetsWork(assets, publicOnly, allocations), control)
}

