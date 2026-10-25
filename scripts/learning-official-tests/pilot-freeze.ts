import { createHash } from 'node:crypto'
import { author, authorVersion, type Candidate } from './author'
import { coverage, requiredCoverage, supplements } from './pilot-coverage'
import { pilotMutants } from './pilot-mutants'
import { verifyRows, type VerificationPorts } from './verify'
import { demand, encode, same, type Id } from './model'
import type { OfficialPackageTestSet, ValidatedPublicPackage } from '../../src/main/services/learning/content/exercise-package-contracts'

export const FREEZE_VERSION = 'e2-s3-v1/greedy-cover-v1/reverse-delete-v1/facets-v1'
export const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
export const frozenBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')
export interface FreezeOptions { seed: number; signal?: AbortSignal; due?: number }

/** Shared deterministic coverage compactor; mandatory public prefix is never removed. */
export function compactWitnesses(pool: readonly Candidate[], sets: readonly Set<string>[], required: readonly string[]) {
  const covers = (selection: Set<number>) => required.every(k => [...selection].some(i => sets[i].has(k)))
  const chosen = new Set([0, 1])
  demand(covers(new Set(pool.map((_, i) => i))), 'FACET_COVERAGE')
  while (!covers(chosen)) {
    const uncovered = required.filter(k => ![...chosen].some(i => sets[i].has(k)))
    const candidates = pool.map((_, i) => ({ i, gain: uncovered.filter(k => sets[i].has(k)).length, bytes: encode(pool[i].args).length }))
      .filter(x => !chosen.has(x.i) && x.gain > 0).sort((a, b) => b.gain - a.gain || a.bytes - b.bytes || a.i - b.i)
    demand(candidates.length > 0, 'COMPACTION_COVERAGE'); chosen.add(candidates[0].i)
  }
  for (const i of [...chosen].filter(i => i > 1).sort((a, b) => b - a)) { chosen.delete(i); if (!covers(chosen)) chosen.add(i) }
  return [...chosen].sort((a, b) => a - b)
}

export async function freezePilot(exercise: Id, source: ValidatedPublicPackage, ports: VerificationPorts, options: FreezeOptions) {
  demand(source.metadata.exerciseId === exercise && source.samples.samples.length === 2, 'PILOT_BASELINE')
  const pool = await author(exercise, { seed: options.seed, signal: options.signal }, source.samples.samples)
  for (const extra of supplements(exercise)) {
    const existing = pool.find(row => same(row.args, extra.args))
    if (existing) existing.obligations = [...new Set([...existing.obligations, ...extra.obligations])].sort()
    else pool.push(extra)
  }
  const catalog = pilotMutants(exercise)
  let csharp: unknown[] = []
  const poolResult = await verifyRows(exercise, pool, { oracle: a => ports.oracle(a), reference: async (language, args) => {
    const value = await ports.reference(language, args)
    if (language === 'csharp') { demand(Array.isArray(value), 'REFERENCE_COUNT'); csharp = value }
    return value
  } }, { ...options, mutants: catalog })
  demand(poolResult.unwitnessed.length === 0, 'GROUP_COVERAGE')
  demand(poolResult.mutation.every(m => m.status === 'KILLED' || m.status === 'PENDING_RUNTIME'), 'MUTANT_QUARANTINE')
  const tokens = requiredCoverage(exercise)
  const correctness = poolResult.mutation.filter(m => m.status !== 'PENDING_RUNTIME')
  const required = [...tokens, ...correctness.map(m => 'kill:' + m.name)]
  const sets = pool.map((row, i) => new Set([...coverage(exercise, row, csharp[i]), ...correctness.filter(m => m.kills.includes(row.key)).map(m => 'kill:' + m.name)]))
  const selected = compactWitnesses(pool, sets, required), rows = selected.map(i => ({ ...pool[i], obligations: [...sets[i]].filter(k => k.startsWith('group:')).map(k => k.slice(6)) })), expected = selected.map(i => structuredClone(csharp[i]))
  demand(rows.length > 2 && rows.length <= 128, 'CASE_LIMIT')
  const final = await verifyRows(exercise, rows, ports, { ...options, mutants: catalog, expectedClaims: expected })
  demand(final.unwitnessed.length === 0 && final.mutation.every(m => m.status === 'KILLED' || m.status === 'PENDING_RUNTIME'), 'FROZEN_MUTATION_COVERAGE')
  const cases = rows.map((row, i) => i < 2 ? {
    id: source.samples.samples[i].id, visibility: 'public' as const, sampleId: source.samples.samples[i].id,
    args: structuredClone(source.samples.samples[i].args), expected: structuredClone(source.samples.samples[i].expected),
  } : { id: 'hidden-' + String(i - 1).padStart(3, '0'), visibility: 'hidden' as const, args: structuredClone(row.args) as typeof source.samples.samples[0]['args'], expected: expected[i] as typeof source.samples.samples[0]['expected'] })
  for (let i = 0; i < 2; i++) demand(same(cases[i].args, rows[i].args) && same(cases[i].expected, expected[i]), 'PUBLIC_EXPECTED_DISAGREEMENT')
  const judge: OfficialPackageTestSet = { schemaVersion: 1, exerciseId: exercise, testSetId: exercise + '-official', version: 1,
    signatureVersion: source.metadata.signature.version, signatureHash: source.metadata.signature.hash,
    comparator: { id: 'exact-typed', version: 1 }, cases }
  // Deterministic private provenance, never extra Judge fields.
  const critical = final.mutation.filter(m => catalog.find(c => c.name === m.name)!.tier === 'critical')
  const broader = final.mutation.filter(m => catalog.find(c => c.name === m.name)!.tier === 'broader')
  const score = broader.filter(m => m.status === 'KILLED').length / broader.length
  demand(score >= 0.9, 'BROAD_MUTATION_SCORE')
  const proof = { exercise, version: FREEZE_VERSION, authorVersion, seed: options.seed, poolRows: pool.length,
    poolSHA256: digest(encode(pool)), required, groups: source.metadata.signature.functionName,
    critical: { total: critical.length, killed: critical.filter(m => m.status === 'KILLED').length, pending: critical.filter(m => m.status === 'PENDING_RUNTIME').map(m => m.name) },
    broader: { total: broader.length, killed: broader.filter(m => m.status === 'KILLED').length, score, survivors: broader.filter(m => m.status !== 'KILLED') },
    catalog: catalog.map(({ name, obligations, kind, tier, rationale }) => ({ name, obligations, kind, tier, rationale })),
    cases: rows.map((row, j) => ({ id: cases[j].id, origin: row.key, source: row.source,
      obligations: [...sets[selected[j]]].sort(), argsSHA256: digest(encode(row.args)), expectedSHA256: digest(encode(expected[j])),
      // At least one unique requirement justifies every retained non-public row.
      soleWitnessFor: required.filter(k => sets[selected[j]].has(k) && !selected.some(i => i !== selected[j] && sets[i].has(k))) })),
    mutation: final.mutation, pendingRuntime: critical.some(m => m.status === 'PENDING_RUNTIME'),
    compaction: { algorithm: 'maximum uncovered gain, then smaller canonical args bytes, then pool ordinal; reverse deletion; final pool order', optimality: 'inclusion-minimal with mandatory prefix; not global minimum' } }
  demand(proof.cases.slice(2).every(c => c.soleWitnessFor.length > 0), 'REDUNDANT_HIDDEN_CASE')
  return { judge, bytes: frozenBytes(judge), proof, rows: rows as Candidate[] }
}
