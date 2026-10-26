/** Main TEST ONLY: receipt assertions and frozen asset reads, never a product Comparator. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { ExerciseMetadataAsset, OfficialPackageTestSet, PackageManifest } from '../../../../src/main/services/learning/content/exercise-package-contracts'
import type { OfficialPlanIdentity } from '../../../../src/main/services/learning/official-case-plan'
import type { PilotReceipt } from './pilot-native'
import { PILOT_IDS, type PilotLanguage } from './pilot-solutions'

export const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const languages = ['csharp', 'javascript'] as const
export type CatalogueSolutions = Record<string, Record<PilotLanguage, string>>
export interface CataloguePin { reference: Record<PilotLanguage, string>; source: Record<PilotLanguage, string>; functionName: string }
export async function catalogue() {
  const manifest = JSON.parse(await readFile('resources/learning/exercises/manifest.json', 'utf8')) as PackageManifest
  const sources = JSON.parse(await readFile('tests/fixtures/learning/official-runtime/catalogue-solutions.json', 'utf8')) as CatalogueSolutions
  const pins = JSON.parse(await readFile('tests/fixtures/learning/official-runtime/catalogue-pins.json', 'utf8')) as Record<string, CataloguePin>
  const ids = manifest.packages.map(p => p.exerciseId).sort()
  assert.equal(manifest.version, 7); assert.equal(ids.length, 63); assert.equal(new Set(ids).size, 63)
  const remaining = ids.filter(id => !PILOT_IDS.some(p => p === id))
  assert.deepEqual(Object.keys(sources).sort(), remaining); assert.deepEqual(Object.keys(pins).sort(), remaining)
  return { manifest, ids, remaining, sources, pins }
}
export async function frozen(id: string) {
  const metadata = JSON.parse(await readFile(`resources/learning/exercises/${id}/exercise.json`, 'utf8')) as ExerciseMetadataAsset
  const bytes = await readFile(`resources/learning/exercises/${id}/judge/v1.json`)
  const judge = JSON.parse(bytes.toString()) as OfficialPackageTestSet
  assert.equal(sha(bytes), metadata.official.hash)
  assert.equal(judge.exerciseId, id); assert.equal(judge.testSetId, metadata.official.testSetId)
  assert.equal(judge.version, metadata.official.version); assert.equal(judge.signatureHash, metadata.signature.hash)
  assert.equal(judge.signatureVersion, metadata.signature.version)
  const identity: OfficialPlanIdentity = { exerciseId: id, packageVersion: metadata.packageVersion,
    testSetId: metadata.official.testSetId, testSetVersion: metadata.official.version,
    signatureVersion: metadata.signature.version, signatureHash: metadata.signature.hash,
    officialHash: metadata.official.hash, comparatorId: 'exact-typed', comparatorVersion: 1 }
  return { metadata, judge, identity }
}
export async function checkFullReceipt(r: PilotReceipt, code: string) {
  const { judge, identity } = await frozen(r.id)
  assert.equal(r.mode, 'full'); assert.equal(r.sourceSha256, sha(code)); assert.deepEqual(r.identity, identity)
  assert.deepEqual(r.errors, []); assert.deepEqual(r.violations, []); assert.notEqual(r.retained, true)
  assert.equal(r.caseCount, judge.cases.length)
  assert.equal(r.result?.disposition, 'EXHAUSTED'); assert.equal(r.result.planAcquired, true)
  assert.equal(r.result.failure, null); assert.equal(r.result.endReason, 'COMPLETED')
  assert.deepEqual(r.result.cases.map(c => c.kind === 'RETURNED' ? c.actual : c.kind), judge.cases.map(c => c.expected))
  assert.deepEqual(r.result.notRunCaseIndices, [])
  const order = judge.cases.map((_c, i) => i)
  assert.deepEqual(r.result.cases.map(c => c.caseIndex), order)
  assert.deepEqual(r.seen, order); assert.deepEqual(r.requests.map(c => c.caseIndex), order)
  for (const input of r.requests) {
    assert.deepEqual(input.keys, ['args', 'caseIndex', 'protocolVersion'])
    assert.equal(input.argsHash, sha(JSON.stringify(judge.cases[input.caseIndex].args)))
  }
  assert.equal(r.snapshotCount, 0)
  const expectedPrepareJobs = r.language === 'javascript' ? 1 : 0
  assert.equal(r.jobs.filter(j => j.phase === 'probe').length, expectedPrepareJobs)
  assert.equal(r.jobs.filter(j => j.phase === 'compile').length, 1)
  assert.equal(r.jobs.filter(j => j.phase === 'execute').length, judge.cases.length)
  assert.equal(r.jobs.length, judge.cases.length + 1 + expectedPrepareJobs)
  assert.equal(new Set(r.jobs.map(j => `${j.pid}:${j.created}`)).size, r.jobs.length)
  assert.equal(r.barriers, r.jobs.length)
  assert.equal(r.phases.filter(p => p.phase === 'prepare').length, 1)
  assert.equal(r.phases.filter(p => p.phase === 'compile').length, 1)
  assert.equal(r.phases.filter(p => p.phase === 'execute').length, judge.cases.length)
  assert.equal(new Set(r.phases.map(p => p.operationDeadline)).size, 1)
  for (const p of r.phases) {
    const budget = p.phase === 'prepare' ? 10000 : p.phase === 'compile' ? 30000 : 2000
    assert.ok(p.remainingAtEntryMs > 0 && p.remainingAtEntryMs <= budget)
    assert.ok(p.deadline <= p.operationDeadline)
    assert.ok(typeof p.durationMs === 'number' && p.durationMs >= 0)
  }
  for (const j of r.jobs) {
    assert.equal(j.quota, j.phase === 'compile' ? 2 * 1024 ** 3 : 512 * 1024 ** 2)
    assert.equal(j.coverageComplete, true); assert.equal(j.releases, 1); assert.equal(j.closes, 1)
  }
  assert.equal(r.rawBytes, r.jobs.reduce((n, j) => n + j.stdoutBytes + j.stderrBytes, 0))
  assert.ok(r.rawBytes <= 1024 ** 2)
  assert.ok(Buffer.byteLength(JSON.stringify(r.result)) + 128 * 1024 < 1024 ** 2)
  assert.ok(r.executionMs !== undefined && r.executionMs < 60000)
  assert.equal(r.result.cleanup.proof, 'VERIFIED'); assert.equal(r.result.cleanup.cleanupComplete, true)
  assert.equal(r.result.cleanup.pendingIo, false); assert.equal(r.result.cleanup.processClean, true)
  for (const field of ['parsedBytes', 'nodes', 'rawBytes'] as const) assert.equal(r.ledger?.[field], 0)
  assert.equal(r.environment.nativeSha256, sha(await readFile('out/main/native/learning/learning-job.node')))
}
