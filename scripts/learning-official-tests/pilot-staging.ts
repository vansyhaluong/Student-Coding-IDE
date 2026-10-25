import * as fs from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ExerciseResourceRoot, openAnchoredExerciseResources, type PackageManifestAnchor } from '../../src/main/services/learning/content/exercise-package-resources'
import { validateExercisePackageAssets, validatePackageManifest } from '../../src/main/services/learning/content/exercise-package-validation'
import { parseBoundedPackageJson } from '../../src/main/services/learning/content/bounded-package-json'
import { ExercisePackageRegistry, type PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import type { ExercisePackageAssetBytes, ExerciseMetadataAsset, PublicPackageManifest } from '../../src/main/services/learning/content/exercise-package-contracts'
import { PackageWorkControl } from '../../src/main/services/learning/content/exercise-package-work'
import { check, demand, IDS, LIMITS, same, type Id } from './model'
import { createReferences, evidenceRoot } from './references'
import { oracle } from './oracles'
import { verifyRows, type VerificationPorts } from './verify'
import { digest, FREEZE_VERSION, freezePilot, frozenBytes } from './pilot-freeze'
import { pilotMutants } from './pilot-mutants'

export const BASELINE = '97ec50d939d36f31dcf07bd77d03b0225ffc06f1bd233633da7b5caee2ddf80b'
const paths = { metadata: 'exercise.json', samples: 'samples.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt', judge: 'judge/v1.json' } as const
export function jsonStatistics(bytes: Uint8Array, max: number = P.judgeBytes) {
  let canonicalBytes = 0, nodes = 0
  const parsed = parseBoundedPackageJson(bytes, max, { parsed: s => { canonicalBytes = s.canonicalBytes; nodes = s.nodes }, raw: () => () => {} })
  demand(parsed.ok, parsed.ok ? 'UNREACHABLE' : parsed.code)
  let properties = 0, maximumDepth = 0, maximumObjectProperties = 0
  const stack = [{ value: parsed.value, depth: 0 }]
  while (stack.length) {
    const { value, depth } = stack.pop()!; maximumDepth = Math.max(maximumDepth, depth)
    if (value && typeof value === 'object') {
      if (!Array.isArray(value)) { const n = Object.keys(value).length; properties += n; maximumObjectProperties = Math.max(maximumObjectProperties, n) }
      for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 })
    }
  }
  return { rawBytes: bytes.byteLength, canonicalBytes, nodes, properties, maximumDepth, maximumObjectProperties }
}
export function wireScreen(judge: { cases: { args: unknown[]; expected: unknown }[] }) {
  const requests = judge.cases.map((c, caseIndex) => Buffer.byteLength(JSON.stringify({ protocolVersion: 1, caseIndex, args: c.args })))
  const responses = judge.cases.map((c, caseIndex) => Buffer.byteLength(JSON.stringify({ protocolVersion: 1, caseIndex, outcome: 'RETURNED', actual: c.expected, stdout: '', stderr: '' }) + '\n'))
  const total = responses.reduce((a, b) => a + b, 0)
  demand(Math.max(...requests) <= P.requestBytes && Math.max(...responses) <= P.expectedResponseBytes && total <= 768 * 1024, 'WIRE_SCREEN')
  return { maximumRequestBytes: Math.max(...requests), maximumSyntheticResponseBytes: Math.max(...responses), syntheticExpectedOutputBytes: total,
    outputTargetBytes: 768 * 1024, hardAggregateOutputBytes: 1024 * 1024, measuredRuntimeWire: 'UNVERIFIED',
    cases: judge.cases.length, wholeOperationSeconds: 60, phaseMaximaPlusCasesSeconds: 10 + 30 + 2 * judge.cases.length,
    perCaseAllowanceAfterPhaseMaximaSeconds: 20 / judge.cases.length,
    perCaseAllowanceAtReleasePhaseTargetsSeconds: 13 / judge.cases.length,
    runtime60s: 'UNVERIFIED', explanation: 'Phase maxima are not lower bounds or measured latency. Allowances exclude unmeasured barriers/private validation; batched tool timings do not certify fresh Jobs or one owned operation.' }
}
export async function stagePilot(repo: string, seed: number, signal?: AbortSignal) {
  const due = performance.now() + LIMITS.campaignMs, control = new PackageWorkControl(() => check(signal, due))
  const base = await evidenceRoot(repo), rootPath = await fs.mkdtemp(join(base, 'e2-s3-'))
  const sourceRoot = await ExerciseResourceRoot.open(resolve(repo), ['resources', 'learning', 'exercises'], control)
  const source = await sourceRoot.manifest(undefined, undefined, control)
  demand(source.anchor.sha256 === BASELINE, 'BASELINE_CHANGED')
  const references = await createReferences(repo, signal, due)
  const sourceHashes: Record<string, string> = { ...references.sourceHashes }
  const extraSource = ['pilot-coverage.ts', 'pilot-mutants.ts', 'pilot-freeze.ts', 'pilot-staging.ts', 'run-stage.mjs']
  for (const file of extraSource) { const bytes = await fs.readFile(join(repo, 'scripts/learning-official-tests', file)); demand(bytes.length <= 64 * 1024, 'SOURCE_LIMIT'); sourceHashes[file] = digest(bytes) }
  const projections = new Map<string, unknown>(), portsById = new Map<Id, VerificationPorts>(), results = [], engineering = [], quarantined = []
  const manifest: PublicPackageManifest = { schemaVersion: 2, policyVersion: 2, version: 3, packages: [] }
  const write = async (relative: string, bytes: Uint8Array) => {
    check(signal, due); const file = resolve(rootPath, relative)
    demand(file.startsWith(rootPath + sep), 'STAGING_PATH')
    await fs.mkdir(resolve(file, '..'), { recursive: true }); await fs.writeFile(file, bytes, { flag: 'wx' })
  }
  try {
    for (const descriptor of source.manifest.packages) {
      check(signal, due)
      const exercise = descriptor.exerciseId, publicData = await sourceRoot.publicPackage(source.manifest, exercise, undefined, control)
      projections.set(exercise, publicExercise(publicData.data))
      const bytes: Partial<ExercisePackageAssetBytes> = { ...publicData.bytes }
      if ((IDS as readonly string[]).includes(exercise)) {
        try {
          let calls = 0
          const observations: { language: string; phase: string; wallMs: number; parentCpuMicros: number }[] = []
          const ports = { oracle: (args: unknown[]) => oracle(exercise as Id, args), reference: async (language: 'csharp' | 'javascript', args: unknown[][]) => {
            const phase = calls < 2 ? 'pool' : calls < 4 ? 'selected' : 'readback'; calls++
            const start = performance.now(), cpu = process.cpuUsage()
            const result = await references.run(language, exercise as Id, args), used = process.cpuUsage(cpu)
            observations.push({ language, phase, wallMs: performance.now() - start, parentCpuMicros: used.user + used.system }); return result
          } }
          const frozen = await freezePilot(exercise as Id, publicData.data, ports, { seed, signal, due })
          portsById.set(exercise as Id, ports)
          bytes.judge = frozen.bytes
          const metadata: ExerciseMetadataAsset = { ...publicData.data.metadata, schemaVersion: 1, packageVersion: 2,
            official: { testSetId: frozen.judge.testSetId, version: 1, hash: digest(bytes.judge) } }
          bytes.metadata = frozenBytes(metadata)
          const checked = validateExercisePackageAssets(bytes as ExercisePackageAssetBytes)
          demand(checked.ok, checked.ok ? 'UNREACHABLE' : checked.code)
          results.push({ ...frozen.proof, judge: jsonStatistics(bytes.judge), wire: wireScreen(frozen.judge),
            judgeSHA256: digest(bytes.judge), metadataSHA256: digest(bytes.metadata), caseCount: frozen.judge.cases.length })
          engineering.push({ exercise, observations, sampledParentMemory: process.memoryUsage(), runtimeParentVsChild: 'Parent sample only; child RSS/CPU/GC NOT MEASURED; timings are developer batches.' })
        } catch (error) {
          const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PILOT_QUARANTINED'
          quarantined.push({ exercise, code }); continue
        }
      }
      const assets = Object.fromEntries(Object.entries(bytes).map(([kind, b]) => [kind, { path: paths[kind as keyof typeof paths], bytes: b!.byteLength, sha256: digest(b!) }]))
      manifest.packages.push(bytes.judge ? { profile: 'full', exerciseId: exercise, packageVersion: 2, assets } as PublicPackageManifest['packages'][number] : structuredClone(descriptor) as PublicPackageManifest['packages'][number])
      for (const [kind, b] of Object.entries(bytes)) await write(join('resources/learning/exercises', exercise, paths[kind as keyof typeof paths]), b!)
    }
    if (quarantined.length) {
      await write('QUARANTINE.json', frozenBytes({ version: FREEZE_VERSION, seed, quarantined, ready: false }))
      return { status: 'NOT_PASS' as const, rootPath, quarantined }
    }
    const manifestBytes = frozenBytes(manifest), checked = validatePackageManifest(manifestBytes)
    demand(checked.ok, checked.ok ? 'UNREACHABLE' : checked.code)
    await write('resources/learning/exercises/manifest.json', manifestBytes)
    const anchor: PackageManifestAnchor = { version: manifest.version, rawBytes: manifestBytes.length, sha256: digest(manifestBytes) }
    // Test-only anchor is never written to compiled Main or passed to the app factory.
    await write('evidence/staging-anchor.json', frozenBytes({ testOnly: true, anchor, sourceBaseline: BASELINE }))
    const staged = await ExerciseResourceRoot.open(rootPath, ['resources', 'learning', 'exercises'], control)
    const stagedManifest = await staged.manifest(anchor, undefined, control)
    await staged.exactDirectory([], ['manifest.json', ...manifest.packages.map(p => p.exerciseId)], control)
    const ledger = await registryScreen(rootPath, anchor, IDS, signal, due)
    for (const result of results) {
      const { data } = await staged.package(stagedManifest.manifest, result.exercise, undefined, control)
      const rows = data.judge.cases.map((c, i) => ({ key: result.cases[i].origin, source: result.cases[i].source,
        args: c.args, obligations: result.cases[i].obligations.filter(s => s.startsWith('group:')).map(s => s.slice(6)) }))
      const used = await verifyRows(result.exercise, rows, portsById.get(result.exercise)!, { signal, due, mutants: pilotMutants(result.exercise), expectedClaims: data.judge.cases.map(c => c.expected) })
      demand(used.mutation.every(m => m.status === 'KILLED' || m.status === 'PENDING_RUNTIME'), 'READBACK_MUTATION')
      await write(`evidence/${result.exercise}.json`, frozenBytes(result))
    }
    for (const descriptor of manifest.packages) {
      const { data } = await staged.publicPackage(stagedManifest.manifest, descriptor.exerciseId, undefined, control)
      demand(same(projections.get(descriptor.exerciseId), publicExercise(data)), 'PUBLIC_LEAK_OR_DRIFT')
    }
    await references.verifySources()
    for (const file of extraSource) demand(digest(await fs.readFile(join(repo, 'scripts/learning-official-tests', file))) === sourceHashes[file], 'SOURCE_CHANGED')
    await sourceRoot.manifest(source.anchor, undefined, control)
    const deterministic = { status: 'CANDIDATE_DATA_VERIFIED_RUNTIME_UNVERIFIED', version: FREEZE_VERSION, seed, sourceBaseline: BASELINE,
      sourceHashes, versions: references.versions, manifest: anchor, results, ledger }
    // Ledger is deterministic logical accounting. Volatile timings/RSS stay separate.
    await write('evidence/candidate-report.json', frozenBytes(deterministic))
    await write('evidence/engineering.json', frozenBytes({ engineering, measurementScope: 'developer-only, not Runtime9D', registryBudget: ledger }))
    // Publish readiness only after both Registry and child/reference scopes drained.
    await references.close()
    await write('READY-FOR-S4.json', frozenBytes({ candidateDataOnly: true, runtimeCertified: false, manifest: anchor }))
    return { status: 'PASS_WITH_LIMITATIONS' as const, rootPath, manifest: anchor, results, ledger }
  } finally { await references.close() }
}

async function registryScreen(root: string, anchor: PackageManifestAnchor, ids: readonly Id[], signal: AbortSignal | undefined, due: number) {
  const registry = new ExercisePackageRegistry((scope, control) => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath: join(root, 'resources') }, anchor, scope, control))
  const pending = new Set<Promise<unknown>>(), measured = []
  const owner: PackagePrepareOwner = { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => !signal?.aborted,
    check: () => check(signal, due), canRelease: () => pending.size === 0,
    retain: task => { pending.add(task); void task.finally(() => pending.delete(task)).catch(() => {}) } }
  try {
    await registry.whenStarted(); demand(registry.status().state === 'AVAILABLE', 'REGISTRY_START')
    for (const id of ids) {
      const lease = await registry.acquire(id, owner)
      try {
        const base = registry.status(), copy = await lease.copyCooperative(), clone = registry.status()
        let representation: Awaited<ReturnType<typeof lease.representCooperative>> | undefined
        try {
          representation = await lease.representCooperative(JSON.stringify(lease.data.judge), P.publicDetailBytes)
          const both = registry.status()
          demand(same(copy.data.judge, lease.data.judge), 'CLONE_DRIFT')
          measured.push({ exercise: id, resident: { parsedBytes: base.parsedBytes, nodes: base.nodes, rawBytes: base.rawBytes },
            registeredClone: { parsedBytes: clone.parsedBytes, nodes: clone.nodes, rawBytes: clone.rawBytes },
            withRepresentation: { parsedBytes: both.parsedBytes, nodes: both.nodes, rawBytes: both.rawBytes } })
        } finally { representation?.release(); copy.release() }
      } finally { await Promise.allSettled([...pending]); lease.release() }
    }
  } finally { await registry.stop() }
  const status = registry.status()
  demand(status.state === 'STOPPED' && status.parsedBytes === 0 && status.nodes === 0 && status.rawBytes === 0 && pending.size === 0, 'LEDGER_CLEANUP')
  return { measured, afterShutdown: { parsedBytes: status.parsedBytes, nodes: status.nodes, rawBytes: status.rawBytes },
    limits: { bytes: P.residentLogicalBytes, nodes: P.residentNodes, rawBytes: P.rawBufferBytes }, rawTransientPeak: 'NOT_MEASURED', rawEnforcement: 'Existing ledger enforced during reader/acquisition, not disabled.' }
}

export async function compareStaging(a: string, b: string) {
  async function inventory(root: string) {
    const files: Record<string, string> = {}
    async function walk(relative: string) {
      for (const entry of (await fs.readdir(join(root, relative), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
        const rel = relative ? relative + '/' + entry.name : entry.name
        demand(!entry.isSymbolicLink(), 'STAGING_PATH')
        if (entry.isDirectory()) await walk(rel)
        else if (rel !== 'evidence/engineering.json') files[rel] = digest(await fs.readFile(join(root, rel)))
      }
    }
    await walk(''); return files
  }
  const first = await inventory(a), second = await inventory(b)
  demand(same(first, second), 'REPRODUCIBILITY_FAILED')
  return { files: Object.keys(first).length, byteIdentical: true, treeSHA256: digest(frozenBytes(first)), fileHashes: first }
}
