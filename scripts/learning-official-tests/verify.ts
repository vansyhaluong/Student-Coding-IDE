import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setImmediate as tick } from 'node:timers/promises'
import { resolve } from 'node:path'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { author, authorVersion, obligations, type Candidate } from './author'
import { domain } from './domains'
import { oracle } from './oracles'
import { mutants, type Mutant } from './mutants'
import { createReferences } from './references'
import { check, demand, encode, IDS, LIMITS, same, signatures, typed, type Args, type Id } from './model'
import type { ExerciseType } from '../../src/shared/contracts/practice'

export interface VerificationPorts {
  reference(language: 'javascript' | 'csharp', rows: Args[]): Promise<unknown>
  oracle(args: Args): unknown
}
export async function verifyRows(exercise: string, rows: Candidate[], ports: VerificationPorts,
  options: { signal?: AbortSignal; due?: number; expectedClaims?: unknown[]; mutants?: Mutant[];
    domain?: (args: Args) => void; obligations?: readonly string[]; resultType?: ExerciseType } = {}) {
  const due = options.due ?? performance.now() + LIMITS.campaignMs
  const validate = options.domain ?? ((args: Args) => domain(exercise as Id, args))
  const declared = options.obligations ?? obligations[exercise as Id]
  const resultType = options.resultType ?? signatures[exercise as Id].result
  demand(rows.length > 0 && rows.length <= LIMITS.rows, 'COUNT'); encode(rows)
  const keys = new Set<string>()
  for (const row of rows) {
    check(options.signal, due)
    demand(Object.keys(row).sort().join(',') === 'args,key,obligations,source', 'CANDIDATE_SCHEMA')
    demand(typeof row.key === 'string' && row.key.length <= 128 && !keys.has(row.key), 'CANDIDATE_KEY'); keys.add(row.key)
    demand(['public', 'curated', 'seeded'].includes(row.source) && row.obligations.every(k => declared.includes(k)), 'PROVENANCE')
    validate(row.args) // Before either reference or oracle receives input.
  }
  if (options.expectedClaims) demand(options.expectedClaims.length === rows.length, 'CLAIM_COUNT')
  const outputs: unknown[][] = []
  for (const language of ['csharp', 'javascript'] as const) {
    check(options.signal, due)
    const result = await ports.reference(language, rows.map(row => structuredClone(row.args)))
    demand(Array.isArray(result) && result.length === rows.length, 'REFERENCE_COUNT'); encode(result)
    outputs.push(result)
  }
  const expected: unknown[] = []
  for (let i = 0; i < rows.length; i++) {
    await tick(); check(options.signal, due)
    const result = ports.oracle(structuredClone(rows[i].args))
    typed(result, resultType)
    for (const values of outputs) { typed(values[i], resultType); demand(same(values[i], result), 'REFERENCE_ORACLE_DISAGREEMENT') }
    if (options.expectedClaims) { typed(options.expectedClaims[i], resultType); demand(same(options.expectedClaims[i], result), 'EXPECTED_DISAGREEMENT') }
    expected.push(result)
  }
  const mutation = []
  for (const m of options.mutants ?? mutants(exercise as Id)) {
    demand(m.obligations.length > 0 && m.obligations.every(k => declared.includes(k)), 'MUTANT_MAPPING')
    if (m.kind === 'performance') { mutation.push({ name: m.name, obligations: m.obligations, status: 'PENDING_RUNTIME', kills: [] as string[] }); continue }
    const kills: string[] = []; let invalid = false
    for (let i = 0; i < rows.length; i++) {
      check(options.signal, due)
      try {
        const actual = m.run(structuredClone(rows[i].args), structuredClone(expected[i]))
        if (m.kind === 'domain' ? actual !== true : !same(actual, expected[i])) kills.push(rows[i].key)
      } catch { invalid = true; break } // A crash is not silently a killed non-equivalent mutant.
    }
    mutation.push({ name: m.name, obligations: m.obligations, status: invalid ? 'INVALID_REVIEW_REQUIRED' : kills.length ? 'KILLED' : 'SURVIVED_REVIEW_REQUIRED', kills })
  }
  check(options.signal, due)
  return { exercise, rows: rows.length, inputsSHA256: createHash('sha256').update(encode(rows)).digest('hex'),
    expectedSHA256: createHash('sha256').update(encode(expected)).digest('hex'),
    unwitnessed: declared.filter(k => !rows.some(r => r.obligations.includes(k))), mutation }
}

/** No freeze/compactor/promotion/manifest writer: those are E2-S3+ work. */
export async function campaign(repo: string, seed: number, signal?: AbortSignal) {
  const due = performance.now() + LIMITS.campaignMs
  const root = await ExerciseResourceRoot.open(resolve(repo), ['resources', 'learning', 'exercises'])
  const { manifest, anchor } = await root.manifest()
  demand(anchor.sha256 === '97ec50d939d36f31dcf07bd77d03b0225ffc06f1bd233633da7b5caee2ddf80b', 'BASELINE_CHANGED')
  const references = await createReferences(repo, signal, due)
  const results = []
  try {
    for (const exercise of IDS) {
      check(signal, due)
      const { data } = await root.publicPackage(manifest, exercise)
      const samples = data.samples.samples
      const rows = await author(exercise, { seed, signal }, samples)
      const result = await verifyRows(exercise, rows, { reference: (language, args) => references.run(language, exercise, args), oracle: a => oracle(exercise, a) }, { signal, due })
      // Public Expected is an independent claim as well; never rewrite a sample.
      for (const s of samples) demand(same(oracle(exercise, structuredClone(s.args)), s.expected), 'PUBLIC_EXPECTED_DISAGREEMENT')
      results.push(result)
    }
    await root.manifest(anchor)
    await references.verifySources()
    return { status: 'VERIFIED_REFERENCE_EXPLORATION', version: authorVersion, seed, versions: references.versions,
      sourceHashes: references.sourceHashes, runtimeCertification: 'NOT_MEASURED', results }
  } finally { await references.close() }
}
