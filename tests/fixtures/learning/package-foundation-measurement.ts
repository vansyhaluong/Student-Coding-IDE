/** Synthetic acceptance measurements only; no production Judge/reference data. */
import { app } from 'electron'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, statfs } from 'node:fs/promises'
import { join, resolve, dirname, sep } from 'node:path'
import { cpus, totalmem, release } from 'node:os'
import { performance, PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks'
import { ExercisePackageRegistry, type PackagePrepareOwner } from '../../../src/main/services/learning/content/exercise-package-registry'
import { canonicalSignatureBytes, rawPackageDigest, openAnchoredExerciseResources } from '../../../src/main/services/learning/content/exercise-package-resources'
import { PACKAGE_POLICY as P } from '../../../src/main/services/learning/content/exercise-package-policy'
import type { PackageAllocationObserver } from '../../../src/main/services/learning/content/exercise-package-budget'
import { publicExercise } from '../../../src/main/services/learning/content/public-exercise-projection'

const entryStart = performance.now()
const directory = resolve(process.argv.at(-2)!), scenario = process.argv.at(-1)!
if (!directory.startsWith(resolve('out') + sep)
  || !['production', 'large-string', 'dense-nodes', 'maximum-registry'].includes(scenario)) throw Error('Invalid measurement invocation')
app.disableHardwareAcceleration()
app.setPath('userData', join(directory, `user-data-${scenario}`))
const encode = (v: unknown) => Buffer.from(JSON.stringify(v))
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const owner = (phase: 'prepare' | 'public'): PackagePrepareOwner => ({ owner: {}, generation: 1, phase,
  isCurrent: () => true, check() {}, retain() {}, canRelease: () => true })
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { n: sorted.length, min: sorted[0] ?? null, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null,
    p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, max: sorted.at(-1) ?? null }
}

/** All fixture writes precede the measured interval and trusted root admission. */
async function fixture() {
  const resourcesPath = join(directory, `fixture-${scenario}`), root = join(resourcesPath, 'learning/exercises')
  await mkdir(root, { recursive: true })
  const many = scenario === 'maximum-registry', count = many ? P.packages : 1
  const signature = { version: 1, functionName: 'Solve', parameters: [{ name: 'value', type: scenario === 'large-string' ? 'string' : scenario === 'dense-nodes' ? 'int32[]' : 'int32' }], returnType: scenario === 'large-string' ? 'string' : scenario === 'dense-nodes' ? 'int32[]' : 'int32' }
  const hash = rawPackageDigest(canonicalSignatureBytes(signature as Parameters<typeof canonicalSignatureBytes>[0]))
  const paths = { metadata: 'exercise.json', samples: 'samples.json', judge: 'judge/v1.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
  const packages: { exerciseId: string; packageVersion: number; profile: string; assets: Record<string, { path: string; bytes: number; sha256: string }> }[] = []
  const records: { id: string; assets: Record<string, Buffer> }[] = []
  let judgeBytes = 0
  for (let i = 0; i < count; i++) {
    const id = `synthetic-${String(i).padStart(4, '0')}`
    const value = scenario === 'large-string' ? 'x'.repeat(16200) : scenario === 'dense-nodes' ? Array(760).fill(1) : 1
    const samples = { schemaVersion: 1, exerciseId: id, signatureVersion: 1, signatureHash: hash,
      samples: [{ id: 'public-1', args: [value], expected: value }] }
    const judge = { schemaVersion: 1, exerciseId: id, testSetId: 'synthetic-only', version: 1,
      signatureVersion: 1, signatureHash: hash, comparator: { id: 'exact-typed', version: 1 },
      cases: Array.from({ length: 128 }, (_, j) => ({ id: j ? `hidden-${j}` : 'public-1', ...(j ? {} : { sampleId: 'public-1' }),
        visibility: j ? 'hidden' : 'public', args: [value], expected: value })) }
    const official = encode(judge); judgeBytes = official.length
    const metadata = { schemaVersion: many ? 2 : 1, exerciseId: id, packageVersion: 1,
      metadata: { chapter: 2, order: i, title: 'Synthetic measurement fixture', difficulty: 'Easy', source: {
        url: 'https://leetcode.com/problems/synthetic-measurement/', publisher: 'Fixture', usage: 'Not production Official Tests' } },
      statement: 'Synthetic measurement fixture only.', constraints: [], signature: { ...signature, hash },
      comparator: { id: 'exact-typed', version: 1 }, official: many ? null : { testSetId: 'synthetic-only', version: 1, hash: rawPackageDigest(official) } }
    const assets: Record<string, Buffer> = { metadata: encode(metadata), samples: encode(samples),
      csharp: Buffer.from('// synthetic measurement only\n'), javascript: Buffer.from('// synthetic measurement only\n') }
    if (!many) assets.judge = official
    records.push({ id, assets })
    packages.push({ exerciseId: id, packageVersion: 1, profile: many ? 'public-only' : 'full',
      assets: Object.fromEntries(Object.entries(assets).map(([key, bytes]) => [key, {
        path: paths[key as keyof typeof paths], bytes: bytes.length, sha256: rawPackageDigest(bytes) }])) })
  }
  const manifest = { schemaVersion: 2, policyVersion: 2, version: 1, packages }
  if (many) {
    // Uniform starter size takes this fully materialized fixture close to, below,
    // the registry byte ceiling, including the final manifest digit widths.
    for (const p of packages) p.assets.csharp.bytes = 60000
    const overhead = encode(manifest).length + records.reduce((n, r) => n + Object.entries(r.assets).filter(([k]) => k !== 'csharp').reduce((a, [, b]) => a + b.length, 0), 0)
    const bytes = Math.min(P.starterBytes, Math.floor((P.registryBytes - overhead - 1024) / count))
    const starter = Buffer.from('// Synthetic measurement only\n' + ' '.repeat(bytes - 30))
    // Do not depend on comment character counting in fixture admission.
    const fixed = Buffer.alloc(bytes, 32); starter.copy(fixed, 0, 0, Math.min(starter.length, fixed.length))
    for (let i = 0; i < count; i++) {
      records[i].assets.csharp = fixed
      packages[i].assets.csharp = { path: paths.csharp, bytes: fixed.length, sha256: rawPackageDigest(fixed) }
    }
  }
  for (let start = 0; start < records.length; start += 32) await Promise.all(records.slice(start, start + 32).map(async r => {
    for (const [key, bytes] of Object.entries(r.assets)) {
      const target = join(root, r.id, paths[key as keyof typeof paths])
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes)
    }
  }))
  const raw = encode(manifest)
  await writeFile(join(root, 'manifest.json'), raw)
  const logicalBytes = raw.length + packages.reduce((n, p) => n + Object.values(p.assets).reduce((a, b) => a + b.bytes, 0), 0)
  return { environment: { packaged: true, mainOutput: '', resourcesPath }, anchor: { version: 1, rawBytes: raw.length, sha256: rawPackageDigest(raw) },
    inventory: { packages: count, rawManifestBytes: raw.length, logicalBytes, judgeBytes: many ? null : judgeBytes, synthetic: true, materialized: true } }
}

async function main() {
  await app.whenReady()
  const appReadyMs = performance.now() - entryStart
  await mkdir(directory, { recursive: true })
  const disk = await statfs(directory)
  if (disk.bavail * disk.bsize < 512 * 1024 * 1024) throw Error('Insufficient measurement fixture disk reserve')
  const synthetic = scenario === 'production' ? undefined : await fixture()
  const compiled = createRequire(join(process.cwd(), 'package.json'))(resolve('out/main/exercise-package-resources-runtime.js')) as {
    openBundledExerciseResources: (env: { packaged: boolean; resourcesPath: string }, allocations?: PackageAllocationObserver) => ReturnType<typeof openAnchoredExerciseResources>
  }
  // Preexisting built Main anchor is used only for real migrated production data.
  const inventory = synthetic?.inventory ?? { packages: 63, synthetic: false,
    rawManifestBytes: (await readFile('resources/learning/exercises/manifest.json')).length }
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.(); await pause(50)
  const baseline = process.memoryUsage(), peak = { ...baseline }
  const samples: Record<string, number[]> = {}, stalls: number[] = [], gcEvents: { duration: number; kind: number | undefined }[] = []
  const histogram = monitorEventLoopDelay({ resolution: 1 }); histogram.enable()
  const observer = new PerformanceObserver(list => { for (const event of list.getEntries()) gcEvents.push({ duration: event.duration,
    kind: (event as unknown as { detail?: { kind: number } }).detail?.kind }) })
  observer.observe({ entryTypes: ['gc'] })
  let last = performance.now()
  const memory = () => { const current = process.memoryUsage(); for (const k of Object.keys(current) as (keyof typeof current)[]) peak[k] = Math.max(peak[k], current[k]) }
  const timer = setInterval(() => { const now = performance.now(); stalls.push(Math.max(0, now - last - 5)); last = now; memory() }, 5)
  const highWater = { parsedBytes: 0, nodes: 0, rawBytes: 0 }
  let registry: ExercisePackageRegistry | undefined
  const sampleLedger = () => { if (!registry) return; const status = registry.status(); for (const key of Object.keys(highWater) as (keyof typeof highWater)[]) highWater[key] = Math.max(highWater[key], status[key]); memory() }
  const observe = (allocation?: PackageAllocationObserver): PackageAllocationObserver | undefined => allocation && ({
    parsed: value => { allocation.parsed(value); sampleLedger() },
    raw: bytes => { const release = allocation.raw(bytes); sampleLedger(); return () => { release(); sampleLedger() } },
  })
  const elapsed = async (name: string, work: () => unknown | Promise<unknown>) => {
    const start = performance.now(); await work(); (samples[name] ??= []).push(performance.now() - start); sampleLedger()
    // Give timer/GC observers a turn; no forced GC inside measured operations.
    await pause(5)
  }
  let logicalAfterStop: ReturnType<ExercisePackageRegistry['status']> | undefined
  const errors: string[] = []
  try {
    for (let repetition = 0; repetition < (scenario === 'production' ? 3 : 5); repetition++) {
      registry = new ExercisePackageRegistry(async allocation => {
        const resources = synthetic ? await openAnchoredExerciseResources(synthetic.environment, synthetic.anchor, observe(allocation))
          : await compiled.openBundledExerciseResources({ packaged: false, resourcesPath: process.resourcesPath }, observe(allocation))
        return { ...resources,
          readPackage: (id, scope) => resources.readPackage(id, observe(scope)),
          readPublicPackage: (id, scope) => resources.readPublicPackage(id, observe(scope)),
        }
      })
      const start = performance.now(); registry.start(); (samples.startDispatch ??= []).push(performance.now() - start)
      await elapsed('manifestStartup', () => registry!.whenStarted())
      if (registry.status().state !== 'AVAILABLE') throw Error(registry.status().failure ?? 'Registry unavailable')
      const ids = [...registry.ids()]
      const selection = scenario === 'production' ? ids : scenario === 'maximum-registry' ? [ids[0], ids.at(-1)!] : [ids[0]]
      for (const id of selection) await elapsed(synthetic && scenario !== 'maximum-registry' ? 'officialLoad' : 'publicLoad', async () => {
        const lease = synthetic && scenario !== 'maximum-registry' ? await registry!.acquire(id, owner('prepare')) : await registry!.acquirePublic(id, owner('public'))
        try {
          if (!synthetic || scenario === 'maximum-registry') {
            const projected = lease.represent(JSON.stringify(publicExercise(lease.data)), P.publicDetailBytes)
            sampleLedger(); void projected.data; projected.release()
          }
          const clone = lease.copy(); sampleLedger(); void clone.data; clone.release()
        } finally { lease.release() }
      })
      for (let reuse = 0; reuse < 10; reuse++) await elapsed('residentReuse', async () => {
        const context = owner(synthetic && scenario !== 'maximum-registry' ? 'prepare' : 'public')
        const lease = synthetic && scenario !== 'maximum-registry' ? await registry!.acquire(selection.at(-1)!, context) : await registry!.acquirePublic(selection.at(-1)!, context)
        void lease.data; lease.release()
      })
      await elapsed('shutdown', () => registry!.stop())
      logicalAfterStop = registry.status()
      if (logicalAfterStop.parsedBytes || logicalAfterStop.nodes || logicalAfterStop.rawBytes) throw Error('Retained logical accounting after stop')
      registry = undefined
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : 'Measurement failed') }
  finally { if (registry) { await registry.stop(); logicalAfterStop = registry.status(); registry = undefined } }
  await pause(50)
  const beforeForcedGc = process.memoryUsage()
  histogram.disable(); clearInterval(timer); observer.disconnect()
  const gcDurations = gcEvents.map(event => event.duration)
  gc?.(); await pause(50)
  const afterForcedGc = process.memoryUsage(), stall = stats(stalls)
  const rssDelta = peak.rss - baseline.rss
  const target = { stallP95Ms: P.stallP95Milliseconds, stallMaxMs: P.stallMaxMilliseconds, rssReviewBytes: P.rssReviewBytes }
  const checks = { instrumentation: errors.length === 0, stallP95: stall.p95 !== null && stall.p95 <= target.stallP95Ms,
    stallMax: stall.max !== null && stall.max <= target.stallMaxMs, rssReviewTriggered: rssDelta > target.rssReviewBytes,
    ledgerWithinLimits: highWater.parsedBytes <= P.residentLogicalBytes && highWater.nodes <= P.residentNodes && highWater.rawBytes <= P.rawBufferBytes }
  const result = { scenario, measuredAt: new Date().toISOString(), versions: process.versions, host: { platform: process.platform,
    release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), physicalCores: 'UNVERIFIED', diskType: 'UNVERIFIED' },
    inventory, appReadyMs, latencyMs: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)])),
    memory: { baseline, sampledPeak: peak, peakRssDelta: rssDelta, beforeForcedGc, afterForcedGc, forcedGcAvailable: !!gc },
    eventLoop: { timerIntervalMs: 5, excessDelayMs: stall, monitorDelayMs: { p95: histogram.percentile(95) / 1e6, max: histogram.max / 1e6 } },
    gc: { events: gcEvents.length, durationsMs: stats(gcDurations), totalMs: gcDurations.reduce((a, b) => a + b, 0) },
    highWater, logicalAfterStop, target, checks, errors,
    limitations: ['Single available host, filesystem cache not flushed', 'Not full application startup or installed packaging acceptance',
      'Boundary samples may miss transient physical allocation peaks', 'Synthetic official data is not production Judge readiness',
      'Forced GC only before/after measurement, never a lifecycle/correctness proof', 'Latency/GC have no approved absolute loader target; compare only approved stall/RSS review thresholds'] }
  await writeFile(join(directory, `${scenario}.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ scenario, checks, errors, latencyMs: result.latencyMs, rssDelta, stalls: stall }))
  return errors.length ? 1 : 0
}
void main().then(code => app.exit(code)).catch(async error => {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${scenario}-instrumentation-failure.json`), JSON.stringify({ error: error instanceof Error ? error.message : 'Failure' }))
  app.exit(1)
})
