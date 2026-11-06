import { EventEmitter } from 'node:events'
import * as fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { capturePublicSampleDiagnostic } from '../../src/main/services/learning/judge/public-sample-diagnostic'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { canonicalSignatureBytes, openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { createSubmissionBridge } from '../../src/preload/bridge/submission'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { SUBMISSION_CHANNELS as C, type SubmissionStatus } from '../../src/shared/contracts/submission'
import type { OfficialAdapterFactory, OfficialCaseObservation } from '../../src/main/services/learning/runtime/official-execution-contracts'
import { nodeStoreFilePort } from '../../src/main/services/learning/storage/store-files'
import { validateSubmissionRecord } from '../../src/main/services/learning/storage/submission-validation'
import { fixture as storageFixture } from '../fixtures/learning/submission-read-fixture'
import { waPackage, waIdentity, hiddenCanary, publicDiagnostic } from '../fixtures/learning/wa-diagnostic'
import * as comparator from '../../src/main/services/learning/judge/exact-typed-comparator'
import * as reducer from '../../src/main/services/learning/judge/verdict-reducer'
import * as diagnosticCapture from '../../src/main/services/learning/judge/public-sample-diagnostic'

const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
const dispose: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of dispose.splice(0)) await close(); vi.restoreAllMocks() })
const unavailable = { kind: 'DETAIL_UNAVAILABLE', reason: 'NO_VERIFIED_PUBLIC_DETAIL' }

describe('WA-B1 Main public provenance', () => {
  it.each([0, 1])('maps public ordinal at index%i from the exact sample, detached from all inputs', index => {
    const data = waPackage(), actual = 'wrong', d = capturePublicSampleDiagnostic(data, waIdentity(data), index, actual)
    expect(d).toEqual({ ...publicDiagnostic(), sampleOrdinal: index + 1, input: data.samples.samples[index].args, expected: data.samples.samples[index].expected })
    data.samples.samples[index].args[0] = 'mutated'; data.samples.samples[index].expected = 'mutated'
    expect(JSON.stringify(d)).not.toContain('mutated')
  })
  it.each([2, 3, -1, NaN])('never classifies hidden/out-of-range index%i as public', index => {
    const data = waPackage(), d = capturePublicSampleDiagnostic(data, waIdentity(data), index, hiddenCanary)
    expect(d).toEqual(unavailable); expect(JSON.stringify(d)).not.toContain(hiddenCanary)
  })
  it.each(['missingId', 'missingPublicId', 'wrongId', 'caseId', 'duplicateId', 'packageVersion', 'missingVersion', 'exercise', 'signature',
    'args', 'expected', 'visibility', 'sampleOrder', 'missingSample', 'testSet'] as const)('fails closed for %s provenance', mode => {
    const data = waPackage(); let identity = waIdentity(data)
    switch (mode) {
      case 'missingId': delete data.judge.cases[0].sampleId; break
      case 'missingPublicId': data.samples.samples[0].id = undefined as never; break
      case 'wrongId': data.judge.cases[0].sampleId = 'wrong'; break
      case 'caseId': data.judge.cases[0].id = 'wrong'; break
      case 'duplicateId': data.samples.samples[1].id = data.samples.samples[0].id; break
      case 'packageVersion': data.metadata.packageVersion++; break
      case 'missingVersion': data.metadata.packageVersion = undefined as never; break
      case 'exercise': data.samples.exerciseId = 'foreign'; break
      case 'signature': data.samples.signatureHash = 'c'.repeat(64); break
      case 'args': data.judge.cases[0].args = [hiddenCanary]; break
      case 'expected': data.judge.cases[0].expected = hiddenCanary; break
      case 'visibility': data.judge.cases[0].visibility = 'hidden'; break
      case 'sampleOrder': data.samples.samples.reverse(); break
      case 'missingSample': data.samples.samples.shift(); break
      case 'testSet': identity = { ...identity, testSetVersion: 99 }; break
    }
    const d = capturePublicSampleDiagnostic(data, identity, 0, hiddenCanary)
    expect(d).toEqual(unavailable); expect(JSON.stringify(d)).not.toContain(hiddenCanary)
  })
  it('falls back for oversized typed Actual without retaining raw data', () => {
    const data = waPackage()
    expect(capturePublicSampleDiagnostic(data, waIdentity(data), 0, '🙂'.repeat(20000))).toEqual({ kind: 'DETAIL_UNAVAILABLE', reason: 'DETAIL_LIMIT_EXCEEDED' })
  })
})

class Owner extends EventEmitter { dead = false; readonly id = 1; isDestroyed() { return this.dead } }
async function fixture(options: { mismatchAt?: number; pauseWrite?: boolean; unknown?: boolean; language?: 'csharp' | 'javascript'; protocol?: boolean; oversized?: boolean } = {}) {
  const writing = gate(), resume = gate()
  let denyRead = false
  const storage = await storageFixture({ ...nodeStoreFilePort,
    open: async (path, flags) => {
      if (denyRead && path.endsWith('failed-submissions.json')) throw Object.assign(Error(hiddenCanary), { code: 'EACCES' })
      const handle = await nodeStoreFilePort.open(path, flags)
      return { ...handle, write: async (...args) => {
        if (options.pauseWrite) { writing.resolve(); await resume.promise }
        return handle.write(...args)
      } }
    }, rename: async (from, to) => {
      await nodeStoreFilePort.rename(from, to)
      if (options.unknown && to.endsWith('failed-submissions.json')) denyRead = true
    } })
  const data = waPackage(), resourcesRoot = join(storage.root, 'resources'), output = join(resourcesRoot, 'learning/exercises'), id = data.metadata.exerciseId
  const signatureHash = rawPackageDigest(canonicalSignatureBytes(data.metadata.signature))
  data.metadata.signature.hash = signatureHash; data.samples.signatureHash = signatureHash; data.judge.signatureHash = signatureHash
  const assets = { judge: Buffer.from(JSON.stringify(data.judge)), samples: Buffer.from(JSON.stringify(data.samples)),
    metadata: Buffer.alloc(0), csharp: Buffer.from(data.starters.csharp), javascript: Buffer.from(data.starters.javascript) }
  data.metadata.official.hash = rawPackageDigest(assets.judge); assets.metadata = Buffer.from(JSON.stringify(data.metadata))
  const paths = { metadata: 'exercise.json', samples: 'samples.json', judge: 'judge/v1.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
  const descriptors: Record<string, { path: string; bytes: number; sha256: string }> = {}
  for (const kind of Object.keys(assets) as (keyof typeof assets)[]) {
    const path = join(output, id, paths[kind]); await fs.mkdir(dirname(path), { recursive: true }); await fs.writeFile(path, assets[kind])
    descriptors[kind] = { path: paths[kind], bytes: assets[kind].length, sha256: rawPackageDigest(assets[kind]) }
  }
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, policyVersion: 1, version: 1,
    packages: [{ exerciseId: id, packageVersion: 3, assets: descriptors }] }))
  await fs.writeFile(join(output, 'manifest.json'), manifest)
  const registry = new ExercisePackageRegistry((scope, control) => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath: resourcesRoot },
    { version: 1, rawBytes: manifest.length, sha256: rawPackageDigest(manifest) }, scope, control))
  await registry.whenStarted(); expect(registry.status().state).toBe('AVAILABLE')
  const errors: unknown[] = [], executions: number[] = []
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Unexpected network request'))
  const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
  const factory: OfficialAdapterFactory = (r, _workspace, load) => {
    let plan: Awaited<ReturnType<typeof load>> | undefined
    const cases: OfficialCaseObservation[] = []
    return { hasNextCase: () => !!plan && cases.length < plan.execution.caseCount,
      async runPhase(phase, context) {
        if (phase === 'prepare') plan = await load(context)
        if (phase === 'execute') {
          const index = cases.length, input = plan!.execution.inputAt(index); executions.push(index)
          const actual = index === (options.mismatchAt ?? 0) ? (options.oversized ? '🙂'.repeat(10000) : index === 2 ? hiddenCanary + '-actual' : 'wrong') : input[0]
          cases.push(options.protocol ? { caseIndex: index, language: r.language, process: null, kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' }
            : { caseIndex: index, language: r.language, kind: 'RETURNED', actual, stdout: hiddenCanary, stderr: hiddenCanary,
                process: { phase: 'execute', exitCode: 0, processExited: true, observerSettled: true, stdoutSettled: true, stderrSettled: true, failure: null, jobMemoryLimitObserved: false } })
        }
      }, async verifyBetweenCases() {},
      officialEvidence: () => ({ cases, notRunCaseIndices: Array.from({ length: (plan?.execution.caseCount ?? 0) - cases.length }, (_, i) => cases.length + i),
        compile: { status: 'SUCCEEDED', exitCode: 0, failure: null, diagnostics: [], stdout: hiddenCanary, stderr: '' }, failure: null }),
      async terminate() {}, async settleObservers() {}, async release() {}, async closeHandles() {},
      async evidence() { return { members: [], retained: [], activeProcesses: 0, totalProcesses: 0, observerSettled: true, coverageComplete: true, unresolvedErrors: false } } }
  }
  const service = new ExerciseService({ root: join(storage.root, 'runtime'), leases: { acquire: async () => ({ release: async () => {} }) },
    official: { registry, createAdapter: factory }, submissions: { store: () => storage.store, ownsLease: () => storage.lease.ownsLease },
    onCleanupError: e => errors.push(e) })
  const owner = new Owner(); service.start(); await service.ready(); service.observe(owner)
  const handles = new Map<string, Parameters<IpcMainLike['handle']>[1]>(), sends: SubmissionStatus[] = [], listeners = new Set<Parameters<IpcRendererLike['on']>[1]>()
  const handlers = new IpcHandlerRegistry({ handle: (c, h) => { handles.set(c, h) }, removeHandler: c => { handles.delete(c) } })
  const frame = { processId: 10, frameToken: 'current', detached: false, isDestroyed: () => false }, event = { sender: { id: 1 }, senderFrame: frame }
  const ipc = new ExerciseIpcService(handlers, service, ctx => {
    if (ctx.senderId !== 1 || ctx.senderFrame?.frameToken !== frame.frameToken) throw Error(hiddenCanary)
  }, () => {}, { store: () => storage.store, send: (_ctx, status) => { sends.push(status); for (const l of listeners) l({}, status) } })
  ipc.observe(owner); ipc.start()
  const invoke = (channel: string, request: unknown, e = event) => handles.get(channel)!(e, request)
  let lostAck = false
  const bridge = createSubmissionBridge({ invoke: async (c, p) => {
    const result = await invoke(c, p)
    if (c === C.submit && lostAck) { lostAck = false; throw Error('synthetic lost ACK') }
    return result
  }, on: (_c, l) => { listeners.add(l) }, removeListener: (_c, l) => { listeners.delete(l) } })
  const submit = vi.spyOn(service, 'submit'), compare = vi.spyOn(comparator, 'compareExactTyped')
  const request = { exerciseId: id, language: options.language ?? 'javascript', code: 'synthetic source', sourceRevision: 4 }
  dispose.push(async () => {
    resume.resolve(); denyRead = false; ipc.stop(); await service.retryCleanup(); await service.stop(); await registry.stop(); await storage.dispose()
    expect(network).not.toHaveBeenCalled()
    expect(JSON.stringify(logs.map(log => log.mock.calls))).not.toContain(hiddenCanary)
  })
  return { service, owner, registry, storage, bridge, submit, compare, request, writing, resume, sends, executions, errors, invoke, event,
    lostAck() { lostAck = true }, allowRead() { denyRead = false }, handle() { return submit.mock.results.at(-1)!.value } }
}

describe('WA-B1 same-operation Judge → storage → IPC → Preload', () => {
  it.each([['javascript', 0], ['csharp', 1], ['javascript', 2]] as const)('publishes qualified %s mismatch%i without extra comparisons or private data', async (language, mismatchAt) => {
    const f = await fixture({ language, mismatchAt }); await f.bridge.submit(f.request)
    const done = await f.handle().completion(), current = await f.bridge.current()
    expect(done.verdict, JSON.stringify(f.registry.readiness(f.request.exerciseId))).not.toBeNull()
    const diagnostic = mismatchAt === 2 ? unavailable : { ...publicDiagnostic(), sampleOrdinal: mismatchAt + 1,
      input: mismatchAt === 0 ? ['public 🙂'] : ['second'], expected: mismatchAt === 0 ? 'public 🙂' : 'second' }
    expect(done).toMatchObject({ stage: 'SETTLED', verdict: 'WrongAnswer', diagnostic, storage: { state: 'saved' } })
    expect(current).toMatchObject({ ok: true, value: { diagnostic, reference: { submissionId: done.submissionId } } })
    const page = await f.bridge.history({ exerciseId: f.request.exerciseId })
    expect(page).toMatchObject({ ok: true, value: { rows: [{ verdict: 'WrongAnswer' }] } })
    const record = JSON.parse(await fs.readFile(f.storage.path('FAILED'), 'utf8')).records[0]
    expect(validateSubmissionRecord(record).ok).toBe(true)
    expect(validateSubmissionRecord({ ...record, diagnostic }).ok).toBe(false)
    expect(JSON.stringify([record, page])).not.toMatch(/diagnostic|PUBLIC_SAMPLE|DETAIL_UNAVAILABLE|actual|expected/)
    expect(JSON.stringify([done, current, page, f.sends, f.errors, record])).not.toContain(hiddenCanary)
    expect(f.compare).toHaveBeenCalledTimes(mismatchAt + 1); expect(f.executions).toEqual(Array.from({ length: mismatchAt + 1 }, (_, i) => i))
    expect(await f.bridge.completion({ exerciseId: f.request.exerciseId })).toMatchObject({ ok: true, value: { state: 'NOT_COMPLETED' } })
    const ref = current.ok && current.value ? current.value.reference : undefined
    if (!ref) throw Error('Missing status')
    expect(await f.invoke(C.status, ref, { ...f.event, sender: { id: 2 } })).toMatchObject({ ok: false })
  })
  it('keeps detached diagnostic through STORAGE pending, lost ACK, repeated polls and SETTLED without replay', async () => {
    const f = await fixture({ pauseWrite: true }); f.lostAck()
    expect((await f.bridge.submit(f.request)).ok).toBe(false); await f.writing.promise
    const pending = await f.bridge.current()
    expect(pending).toMatchObject({ ok: true, value: { stage: 'STORAGE', storage: { state: 'pending' }, diagnostic: publicDiagnostic() } })
    if (!pending.ok || !pending.value) throw Error('Missing pending')
    const a = await f.bridge.status(pending.value.reference), b = await f.bridge.status(pending.value.reference)
    expect(a).toEqual(b); expect(f.registry.readiness(f.request.exerciseId).pinned).toBe(false)
    f.resume.resolve(); await f.handle().completion()
    expect(await f.bridge.retry(pending.value.reference)).toMatchObject({ ok: true, value: { stage: 'SETTLED', diagnostic: publicDiagnostic() } })
    expect(f.submit).toHaveBeenCalledTimes(1); expect(f.compare).toHaveBeenCalledTimes(1)
  })
  it('keeps same diagnostic through unknown/recovery without changing storage semantics', async () => {
    const f = await fixture({ unknown: true }); await f.bridge.submit(f.request); await f.handle().completion()
    const current = await f.bridge.current()
    expect(current).toMatchObject({ ok: true, value: { stage: 'STORAGE', storage: { state: 'unknown' }, diagnostic: publicDiagnostic() } })
    if (!current.ok || !current.value) throw Error('Missing current')
    f.allowRead()
    expect(await f.bridge.retry(current.value.reference)).toMatchObject({ ok: true, value: { stage: 'SETTLED', storage: { state: 'saved' }, diagnostic: publicDiagnostic() } })
    expect(f.compare).toHaveBeenCalledTimes(1); expect(f.submit).toHaveBeenCalledTimes(1)
  })
  it.each(['oversized', 'captureThrows', 'malformedCapture'] as const)('preserves final WA/fail-fast when %s falls back', async mode => {
    const f = await fixture({ oversized: mode === 'oversized' })
    if (mode === 'captureThrows') vi.spyOn(diagnosticCapture, 'capturePublicSampleDiagnostic').mockImplementation(() => { throw Error(hiddenCanary) })
    if (mode === 'malformedCapture') vi.spyOn(diagnosticCapture, 'capturePublicSampleDiagnostic').mockReturnValue({ ...publicDiagnostic(), caseIndex: 0, stdout: hiddenCanary } as never)
    await f.bridge.submit(f.request); const result = await f.handle().completion()
    expect(result).toMatchObject({ verdict: 'WrongAnswer', storage: { state: 'saved' }, diagnostic: {
      kind: 'DETAIL_UNAVAILABLE', reason: mode === 'oversized' ? 'DETAIL_LIMIT_EXCEEDED' : 'NO_VERIFIED_PUBLIC_DETAIL' } })
    expect(f.compare).toHaveBeenCalledTimes(1); expect(f.executions).toEqual([0])
    expect(JSON.stringify([result, f.sends, f.errors])).not.toContain(hiddenCanary)
  })
  it.each(['context', 'owner', 'nextSubmit'] as const)('retires idle diagnostic authority on %s', async mode => {
    const f = await fixture(); await f.bridge.submit(f.request); await f.handle().completion()
    const old = f.handle(), current = await f.bridge.current()
    if (!current.ok || !current.value) throw Error('Missing current')
    if (mode === 'context') await f.bridge.context({ reason: 'CONTEXT_CHANGED' })
    if (mode === 'owner') { f.owner.dead = true; f.owner.emit('destroyed') }
    if (mode === 'nextSubmit') { await f.bridge.submit(f.request); await f.handle().completion() }
    expect(() => old.status()).toThrow()
    expect((await f.bridge.status(current.value.reference)).ok).toBe(false)
    expect(JSON.stringify(f.errors)).not.toContain(hiddenCanary)
    if (mode === 'nextSubmit') {
      const backup = await fs.readFile(f.storage.path('FAILED', true), 'utf8')
      expect(backup).not.toMatch(/diagnostic|PUBLIC_SAMPLE|DETAIL_UNAVAILABLE|actual|expected/)
      expect(backup).not.toContain(hiddenCanary)
    }
  })
  it.each(['cancelled', 'infrastructure', 'comparator', 'protocol', 'accepted'] as const)('does not publish detail for final %s', async mode => {
    const f = await fixture({ protocol: mode === 'protocol', mismatchAt: mode === 'accepted' ? 99 : 0 })
    const original = reducer.reduceJudgeVerdict
    if (mode === 'cancelled') vi.spyOn(reducer, 'reduceJudgeVerdict').mockImplementation(input => original({ ...input, ownerCurrent: false }))
    if (mode === 'infrastructure') vi.spyOn(reducer, 'reduceJudgeVerdict').mockImplementation(input => original({ ...input, decisionSecuredBeforeClose: false }))
    if (mode === 'comparator') f.compare.mockReturnValue('INVALID_ACTUAL')
    await f.bridge.submit(f.request); const result = await f.handle().completion()
    expect(result.verdict).not.toBe('WrongAnswer'); expect(result).not.toHaveProperty('diagnostic')
    expect(JSON.stringify([await f.bridge.current(), f.sends, f.errors])).not.toContain(hiddenCanary)
  })
})
