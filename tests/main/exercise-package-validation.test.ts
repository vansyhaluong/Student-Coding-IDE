import { describe, expect, it } from 'vitest'
import { PACKAGE_POLICY as P, PACKAGE_ASSET_LIMITS } from '../../src/main/services/learning/content/exercise-package-policy'
import { validateExercisePackageAssets, validatePackageManifest, validatePackageMetadata,
  validatePackageTypedValue } from '../../src/main/services/learning/content/exercise-package-validation'
import type { ExercisePackageDescriptor, ExercisePackageManifest, ExerciseMetadataAsset } from '../../src/main/services/learning/content/exercise-package-contracts'
import type { ExerciseType } from '../../src/shared/contracts/practice'

const encode = (v: unknown): Uint8Array => Buffer.from(JSON.stringify(v))
const hash = 'a'.repeat(64)
// Synthetic contract data only. Not Official Tests, solver or release evidence.
function fixture(kind: ExerciseType = 'int32', value: unknown = 1) {
  const metadata: ExerciseMetadataAsset = { schemaVersion: 1, exerciseId: 'new-65', packageVersion: 1,
    metadata: { chapter: 2, order: 0, title: 'Synthetic contract', difficulty: 'Easy',
      source: { url: 'https://leetcode.com/problems/example/', publisher: 'Synthetic', usage: 'Independent fixture' } },
    statement: 'Contract fixture only.', constraints: [],
    signature: { version: 1, hash, functionName: 'Solve', parameters: [{ name: 'value', type: kind }], returnType: kind },
    official: { testSetId: 'tests-v1', version: 1, hash }, comparator: { id: 'exact-typed', version: 1 } }
  const samples = { schemaVersion: 1, exerciseId: metadata.exerciseId, signatureVersion: 1, signatureHash: hash,
    samples: [{ id: 'sample-1', args: [value], expected: value }] }
  const judge = { schemaVersion: 1, exerciseId: metadata.exerciseId, testSetId: 'tests-v1', version: 1,
    signatureVersion: 1, signatureHash: hash, comparator: { id: 'exact-typed', version: 1 }, cases: [
      { id: 'sample-1', visibility: 'public', sampleId: 'sample-1', args: [value], expected: value },
      { id: 'hidden-1', visibility: 'hidden', args: [value], expected: value },
    ] }
  const assets = () => ({ metadata: encode(metadata), samples: encode(samples), judge: encode(judge),
    csharp: Buffer.from('// synthetic C#'), javascript: Buffer.from('// synthetic JavaScript') })
  return { metadata, samples, judge, assets }
}
function descriptor(id = 'new-65'): ExercisePackageDescriptor {
  return { exerciseId: id, packageVersion: 1, assets: {
    metadata: { path: 'exercise.json', bytes: 0, sha256: hash }, samples: { path: 'samples.json', bytes: 0, sha256: hash },
    judge: { path: 'judge/v1.json', bytes: 0, sha256: hash }, csharp: { path: 'starters/csharp.txt', bytes: 0, sha256: hash },
    javascript: { path: 'starters/javascript.txt', bytes: 0, sha256: hash },
  } }
}
const manifest = (): ExercisePackageManifest => ({ schemaVersion: 1, policyVersion: 1, version: 1, packages: [descriptor()] })

describe('Six typed package values: existing semantics plus approved bounds', () => {
  it.each<[ExerciseType, unknown]>([['int32', -2147483648], ['int32', 2147483647], ['boolean', false],
    ['string', 'é😀'], ['int32[]', [-2147483648, 0, 2147483647]], ['string[]', ['', '😀']],
    ['int32[][]', [[1, 2], [3, 4]]], ['int32[][]', [[], []]]])('accepts %s', (kind, value) => {
    expect(validatePackageTypedValue(encode(value), kind)).toEqual({ ok: true, value })
    expect(validateExercisePackageAssets(fixture(kind, value).assets()).ok).toBe(true)
  })
  it.each<[ExerciseType, unknown]>([['int32', 2147483648], ['int32', -2147483649], ['int32', 0.5], ['int32', '1'],
    ['boolean', 0], ['string', null], ['int32[]', ['1']], ['string[]', [1]], ['int32[][]', [[1], [1, 2]]]])(
    'rejects wrong type/overflow/ragged %s', (kind, value) => expect(validatePackageTypedValue(encode(value), kind).ok).toBe(false),
  )
  it('enforces string, array and matrix boundaries without truncation', () => {
    for (const n of [P.stringUnits - 1, P.stringUnits]) expect(validatePackageTypedValue(encode('x'.repeat(n)), 'string').ok).toBe(true)
    expect(validatePackageTypedValue(encode('x'.repeat(P.stringUnits + 1)), 'string')).toEqual({ ok: false, code: 'PACKAGE_VALUE_LIMIT' })
    for (const n of [P.integerElements - 1, P.integerElements]) expect(validatePackageTypedValue(encode(Array(n).fill(0)), 'int32[]').ok).toBe(true)
    expect(validatePackageTypedValue(encode(Array(P.integerElements + 1).fill(0)), 'int32[]').ok).toBe(false)
    expect(validatePackageTypedValue(encode(Array(P.stringElements).fill('')), 'string[]').ok).toBe(true)
    expect(validatePackageTypedValue(encode(Array(P.stringElements + 1).fill('')), 'string[]').ok).toBe(false)
    const words = ['a'.repeat(P.stringUnits), 'b'.repeat(P.stringUnits)]
    expect(validatePackageTypedValue(encode(words), 'string[]').ok).toBe(true)
    expect(validatePackageTypedValue(encode([...words, 'c']), 'string[]').ok).toBe(false)
    expect(validatePackageTypedValue(encode(Array.from({ length: P.matrixRows }, () => [])), 'int32[][]').ok).toBe(true)
    expect(validatePackageTypedValue(encode(Array.from({ length: P.matrixRows + 1 }, () => [])), 'int32[][]').ok).toBe(false)
    const row = Array(P.matrixColumns).fill(0)
    expect(validatePackageTypedValue(encode([row]), 'int32[][]').ok).toBe(true)
    expect(validatePackageTypedValue(encode([[...row, 0]]), 'int32[][]').ok).toBe(false)
    expect(validatePackageTypedValue(encode(Array(64).fill(row)), 'int32[][]').ok).toBe(true)
    expect(validatePackageTypedValue(encode(Array(65).fill(row)), 'int32[][]').ok).toBe(false)
  })
  it('enforces encoded value bytes independently from element counts', () => {
    const values = Array(65_535).fill(100)
    for (const [first, expected] of [[10_000, true], [100_000, true], [1_000_000, false]] as const) {
      values[0] = first
      expect(encode(values).byteLength).toBe(P.valueBytes + (first === 10_000 ? -1 : first === 100_000 ? 0 : 1))
      expect(validatePackageTypedValue(encode(values), 'int32[]').ok).toBe(expected)
    }
    // Canonical typed bytes, not whitespace/escape spelling, define this limit.
    expect(validatePackageTypedValue(Buffer.from('0' + ' '.repeat(P.valueBytes)), 'int32')).toEqual({ ok: true, value: 0 })
    expect(validatePackageTypedValue(encode('😀'.repeat(P.stringUnits / 2)), 'string').ok).toBe(true)
  })
})

describe('Exact metadata, samples and official test-set contracts', () => {
  it('validates all five assets into detached Main-only data without claiming hash verification', () => {
    const f = fixture(), bytes = f.assets(), result = validateExercisePackageAssets(bytes)
    expect(result.ok).toBe(true)
    bytes.metadata.fill(0); f.metadata.statement = 'changed'
    if (result.ok) expect(result.value.metadata.statement).toBe('Contract fixture only.')
    // Hashes are syntactically valid placeholders: real integrity is Step 2.
  })
  it('rejects unknown/missing fields at every schema layer', () => {
    for (const field of Object.keys(fixture().metadata)) {
      const f = fixture(), m = { ...f.metadata } as Record<string, unknown>
      delete m[field]
      expect(validatePackageMetadata(encode(m)).ok).toBe(false)
    }
    for (const target of ['metadata', 'source', 'signature', 'parameter', 'official', 'comparator', 'samples', 'sample', 'judge', 'case']) {
      const f = fixture()
      const values: Record<string, object> = { metadata: f.metadata.metadata, source: f.metadata.metadata.source,
        signature: f.metadata.signature, parameter: f.metadata.signature.parameters[0], official: f.metadata.official,
        comparator: f.metadata.comparator, samples: f.samples, sample: f.samples.samples[0], judge: f.judge, case: f.judge.cases[0] }
      Object.assign(values[target], { unexpected: true })
      expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_SCHEMA_INVALID' })
    }
  })
  it('rejects unsupported schema/comparator/types and bounds versions', () => {
    for (const patch of [{ schemaVersion: 2 }, { comparator: { id: 'arbitrary-code', version: 1 } },
      { comparator: { id: 'exact-typed', version: 2 } }]) {
      expect(validatePackageMetadata(encode({ ...fixture().metadata, ...patch }))).toEqual({ ok: false, code: 'PACKAGE_UNSUPPORTED' })
    }
    for (const version of [0, -1, 1.5, P.versionMaximum + 1]) {
      expect(validatePackageMetadata(encode({ ...fixture().metadata, packageVersion: version })).ok).toBe(false)
    }
    expect(validatePackageMetadata(encode({ ...fixture().metadata, packageVersion: P.versionMaximum })).ok).toBe(true)
    const f = fixture(); Object.assign(f.metadata.signature, { returnType: 'float64' })
    expect(validatePackageMetadata(encode(f.metadata))).toEqual({ ok: false, code: 'PACKAGE_UNSUPPORTED' })
  })
  it('enforces bounded identifiers, chapters and existing source URL policy', () => {
    for (const chapter of [1, 9, 2.5]) {
      const f = fixture(); f.metadata.metadata.chapter = chapter
      expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(false)
    }
    for (const exerciseId of ['', '../x', 'a/b', 'é', 'x'.repeat(65)]) {
      expect(validatePackageMetadata(encode({ ...fixture().metadata, exerciseId })).ok).toBe(false)
    }
    expect(validatePackageMetadata(encode({ ...fixture().metadata, exerciseId: 'x'.repeat(64) })).ok).toBe(true)
    const f = fixture(); f.metadata.metadata.source.url = 'https://example.org/'
    expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(false)
  })
  it('bounds metadata fields and parameter count at exact limits', () => {
    for (const [field, maximum] of [['title', P.titleUnits], ['statement', P.statementUnits], ['usage', P.sourceUsageUnits]] as const) {
      for (const offset of [-1, 0, 1]) {
        const f = fixture(), target = field === 'title' ? f.metadata.metadata : field === 'usage' ? f.metadata.metadata.source : f.metadata
        Object.assign(target, { [field]: 'x'.repeat(maximum + offset) })
        expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(offset <= 0)
      }
    }
    const f = fixture(); f.metadata.constraints = Array(P.constraints).fill('x'.repeat(P.constraintUnits))
    expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(true)
    f.metadata.constraints.push('x'); expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(false)
    f.metadata.constraints = ['x'.repeat(P.constraintUnits + 1)]; expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(false)
    f.metadata.constraints = []
    for (const n of [15, 16, 17]) {
      f.metadata.signature.parameters = Array.from({ length: n }, (_, i) => ({ name: 'param' + i, type: 'int32' }))
      expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(n <= 16)
    }
    for (const offset of [-1, 0, 1]) {
      const a = fixture(), prefix = 'https://leetcode.com/problems/'
      a.metadata.metadata.source.url = prefix + 'x'.repeat(P.urlUnits + offset - prefix.length)
      expect(validatePackageMetadata(encode(a.metadata)).ok).toBe(offset <= 0)
    }
  })
  it('rejects reserved/injecting/duplicate names and invalid signatures/args/expected', () => {
    for (const functionName of ['function', 'class', 'Solution', 'a();evil', 'x'.repeat(65)]) {
      const f = fixture(); f.metadata.signature.functionName = functionName
      expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(false)
    }
    const f = fixture(); f.metadata.signature.functionName = 'x'.repeat(64)
    expect(validatePackageMetadata(encode(f.metadata)).ok).toBe(true)
    f.metadata.signature.parameters.push(f.metadata.signature.parameters[0])
    expect(validatePackageMetadata(encode(f.metadata))).toEqual({ ok: false, code: 'PACKAGE_SIGNATURE_MISMATCH' })
    for (const mutation of ['arity', 'type', 'expected', 'signature']) {
      const a = fixture()
      if (mutation === 'arity') a.samples.samples[0].args.push(2)
      if (mutation === 'type') a.samples.samples[0].args = ['bad']
      if (mutation === 'expected') a.judge.cases[1].expected = 'bad'
      if (mutation === 'signature') a.judge.signatureHash = 'b'.repeat(64)
      expect(validateExercisePackageAssets(a.assets())).toEqual({ ok: false, code: 'PACKAGE_SIGNATURE_MISMATCH' })
    }
  })
  it('requires unique IDs, exact public prefix linkage and hidden coverage', () => {
    for (const mutation of ['duplicate', 'link', 'expected', 'order', 'hiddenSampleId', 'noHidden']) {
      const f = fixture()
      if (mutation === 'duplicate') f.judge.cases[1].id = 'sample-1'
      if (mutation === 'link') f.judge.cases[0].sampleId = 'another'
      if (mutation === 'expected') f.judge.cases[0].expected = 2
      if (mutation === 'order') f.judge.cases.reverse()
      if (mutation === 'hiddenSampleId') f.judge.cases[1].sampleId = 'sample-1'
      if (mutation === 'noHidden') f.judge.cases.pop()
      expect(validateExercisePackageAssets(f.assets()).ok).toBe(false)
    }
    const f = fixture(); f.samples.samples.push(f.samples.samples[0])
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_DUPLICATE_ID' })
  })
  it('treats sample16/official128 as admission ceilings, never Runtime acceptance', () => {
    const f = fixture()
    f.samples.samples = Array.from({ length: 16 }, (_, i) => ({ id: 'public-' + i, args: [1], expected: 1 }))
    f.judge.cases = [...f.samples.samples.map(s => ({ ...s, sampleId: s.id, visibility: 'public' })),
      ...Array.from({ length: 112 }, (_, i) => ({ id: 'hidden-' + i, visibility: 'hidden', args: [1], expected: 1 }))]
    expect(validateExercisePackageAssets(f.assets()).ok).toBe(true)
    f.judge.cases.push({ id: 'hidden-extra', visibility: 'hidden', args: [1], expected: 1 })
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_CASE_LIMIT' })
    f.samples.samples.push({ id: 'public-extra', args: [1], expected: 1 })
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_CASE_LIMIT' })
  })
  it('checks asset byte ceilings including whitespace and starter UTF-8 independently', () => {
    for (const kind of Object.keys(PACKAGE_ASSET_LIMITS) as (keyof typeof PACKAGE_ASSET_LIMITS)[]) {
      const maximum = PACKAGE_ASSET_LIMITS[kind]
      for (const offset of [-1, 0, 1]) {
        const assets = fixture().assets(), input = assets[kind]
        assets[kind] = Buffer.concat([input, Buffer.alloc(maximum + offset - input.byteLength, 32)])
        expect(validateExercisePackageAssets(assets).ok).toBe(offset <= 0)
      }
    }
    const assets = fixture().assets(); assets.javascript = Buffer.from([0xff])
    expect(validateExercisePackageAssets(assets)).toEqual({ ok: false, code: 'PACKAGE_JSON_INVALID' })
  })
  it('rejects hidden request envelope overflow even when individual values and Judge asset fit', () => {
    const f = fixture('string', '')
    f.metadata.signature.parameters = Array.from({ length: 16 }, (_, i) => ({ name: 'p' + i, type: 'string' }))
    f.samples.samples[0].args = Array(16).fill(''); f.judge.cases[0].args = Array(16).fill('')
    f.judge.cases[1].args = Array(16).fill('x'.repeat(P.stringUnits))
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_VALUE_LIMIT' })
    f.judge.cases[1].args = Array(15).fill('x'.repeat(P.stringUnits)).concat('')
    expect(validateExercisePackageAssets(f.assets()).ok).toBe(true)
    const spare = P.requestBytes - encode({ protocolVersion: 1, caseIndex: 1, args: f.judge.cases[1].args }).byteLength
    for (const offset of [-1, 0, 1]) {
      f.judge.cases[1].args[15] = 'x'.repeat(spare + offset)
      expect(validateExercisePackageAssets(f.assets()).ok).toBe(offset <= 0)
    }
  })
  it('rejects empty cases and gives deterministic safe codes without leaking private content', () => {
    const f = fixture('string', 'private hidden marker')
    f.judge.cases[1].args = [false]
    const first = validateExercisePackageAssets(f.assets())
    expect(first).toEqual({ ok: false, code: 'PACKAGE_SIGNATURE_MISMATCH' })
    expect(validateExercisePackageAssets(f.assets())).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('private hidden marker')
    f.judge.cases = []
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_CASE_LIMIT' })
    f.samples.samples = []
    expect(validateExercisePackageAssets(f.assets())).toEqual({ ok: false, code: 'PACKAGE_CASE_LIMIT' })
  })
})

describe('Manifest declared admission: not filesystem/root/hash verification', () => {
  it('admits generic64/65 identities and five fixed asset roles only', () => {
    const m = manifest(); m.packages.push(descriptor('new-64'))
    expect(validatePackageManifest(encode(m))).toEqual({ ok: true, value: m })
    Object.assign(m.packages[0].assets, { reference: { path: 'solver.js', bytes: 1, sha256: hash } })
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_SCHEMA_INVALID' })
  })
  it('rejects missing fields, unsupported policy/schema and malformed hashes', () => {
    for (const patch of [{ schemaVersion: 2 }, { policyVersion: 2 }]) {
      expect(validatePackageManifest(encode({ ...manifest(), ...patch }))).toEqual({ ok: false, code: 'PACKAGE_UNSUPPORTED' })
    }
    expect(validatePackageManifest(encode({ schemaVersion: 1, policyVersion: 1, version: 1 })).ok).toBe(false)
    const m = manifest(); m.packages[0].assets.judge.sha256 = 'not-sha256'
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_SCHEMA_INVALID' })
  })
  it('rejects duplicate/case-colliding IDs and arbitrary relative/absolute paths', () => {
    const m = manifest(); m.packages.push(descriptor())
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_DUPLICATE_ID' })
    m.packages[1].exerciseId = 'NEW-65'
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_PATH_INVALID' })
    for (const path of ['../judge/v1.json', 'C:/judge/v1.json', '//host/share', 'judge/v0.json', 'judge/v2147483648.json', 'judge/v1.json:ads']) {
      const a = manifest(); a.packages[0].assets.judge.path = path
      expect(validatePackageManifest(encode(a))).toEqual({ ok: false, code: 'PACKAGE_PATH_INVALID' })
    }
  })
  it('bounds manifest bytes, count and declared registry total independently', () => {
    const empty = encode(manifest())
    expect(validatePackageManifest(Buffer.concat([empty, Buffer.alloc(P.manifestBytes - empty.byteLength, 32)])).ok).toBe(true)
    expect(validatePackageManifest(Buffer.alloc(P.manifestBytes + 1))).toEqual({ ok: false, code: 'PACKAGE_MANIFEST_LIMIT' })
    const m = manifest(); m.packages = Array.from({ length: P.packages }, (_, i) => descriptor('id-' + i))
    expect(validatePackageManifest(encode(m)).ok).toBe(true)
    m.packages.push(descriptor('extra'))
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_MANIFEST_LIMIT' })
    m.packages = Array.from({ length: 64 }, (_, i) => descriptor('id-' + i))
    m.packages.forEach(p => { p.assets.judge.bytes = P.judgeBytes })
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_MANIFEST_LIMIT' })
    m.packages[63].assets.judge.bytes -= encode(m).byteLength
    // Changing declared byte digit lengths can change the encoded manifest size.
    const sum = () => encode(m).byteLength + m.packages.reduce((n, p) => n + p.assets.judge.bytes, 0)
    m.packages[63].assets.judge.bytes += P.registryBytes - sum()
    expect(sum()).toBe(P.registryBytes)
    expect(validatePackageManifest(encode(m)).ok).toBe(true)
    m.packages[63].assets.judge.bytes++
    expect(validatePackageManifest(encode(m))).toEqual({ ok: false, code: 'PACKAGE_MANIFEST_LIMIT' })
  })
})

