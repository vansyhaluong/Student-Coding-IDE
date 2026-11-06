import { describe, expect, it, vi } from 'vitest'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { createPublicRunReceipt, publicRunPackage, sourceFingerprint } from '../../src/main/services/learning/smart-hints/public-run-receipt'
import { packageRunBinding } from '../../src/main/services/learning/package-run-binding'
import type { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import type { JavascriptExecutionAdapter } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import { registry, snapshot, request, source } from '../fixtures/learning/smart-hints'

describe('SH-1 same leased public Run provenance and CODE_ONLY fallback', () => {
  it.each(['csharp', 'javascript'] as const)('%s first and later public samples keep exact input/actual/expected', async language => {
    const r = registry(), s = snapshot(language), pkg = publicRunPackage(r.data)!
    const receipt = createPublicRunReceipt(sourceFingerprint(source), s, pkg)!
    expect(receipt.context).toMatchObject({ kind: 'RUN_PUBLIC', observations: [
      { evidenceId: 'R1', sampleOrdinal: 1, input: [1], expected: 2, actual: 1 },
      { evidenceId: 'R2', sampleOrdinal: 2, input: [3], expected: 4, actual: 3 },
    ] })
    const q = request({ language, run: { sessionId: s.sessionId, generation: s.generation, sequence: s.sequence } })
    const c = await captureSmartHints(r.packages, q, 1, () => {}, receipt)
    expect(c.runContext.kind).toBe('RUN_PUBLIC'); expect(r.release).toHaveBeenCalledOnce()
    expect(JSON.stringify(c)).not.toMatch(/HIDDEN_CANARY|PRIVATE_PATH|stdout|stderr|caseIndex|official|signatureHash/)
  })
  it.each(['source', 'revision', 'language', 'operation', 'sequence', 'version', 'sampleId', 'args', 'expected', 'expired'] as const)('%s mismatch falls back, never reruns', async change => {
    const r = registry(), s = snapshot(), receipt = createPublicRunReceipt(sourceFingerprint(source), s, publicRunPackage(r.data))!
    const q = request({ run: { sessionId: s.sessionId, generation: s.generation, sequence: s.sequence } })
    if (change === 'source') q.source += '// changed'
    if (change === 'revision') q.sourceRevision++
    if (change === 'language') q.language = 'csharp'
    if (change === 'operation') q.run!.generation++
    if (change === 'sequence') q.run!.sequence++
    if (change === 'version') r.data.metadata.packageVersion++
    if (change === 'sampleId') r.data.samples.samples[0].id = 'other'
    if (change === 'args') r.data.samples.samples[0].args = [7]
    if (change === 'expected') r.data.samples.samples[0].expected = 99
    if (change === 'expired') receipt.capturedAt -= 300001
    const c = await captureSmartHints(r.packages, q, 1, () => {}, receipt)
    expect(c.runContext.kind).toBe('CODE_ONLY'); expect(r.acquirePublic).toHaveBeenCalledOnce()
  })
  it.each(['cleanup', 'cancelled', 'infrastructure', 'schema', 'boundary', 'missingPackage'] as const)('%s does not produce confirmed evidence', reason => {
    const r = registry(), s = snapshot(), pkg = publicRunPackage(r.data)!
    if (reason === 'cleanup') s.cleanup.state = 'PENDING'
    if (reason === 'cancelled') s.reason = 'CONTEXT_CHANGED'
    if (reason === 'infrastructure') s.reason = 'INTERNAL_ERROR'
    if (reason === 'schema') s.javascript!.schema.sampleCount++
    if (reason === 'boundary') s.javascript!.result.cases.push({ ...s.javascript!.result.cases[0], caseIndex: 2, actual: 777777 })
    expect(createPublicRunReceipt(sourceFingerprint(source), s, reason === 'missingPackage' ? undefined : pkg)).toBeUndefined()
  })
  it('missing/duplicate public ID or malformed typed value cannot establish package provenance', () => {
    for (const mutate of [
      (r: ReturnType<typeof registry>) => { r.data.samples.samples[0].id = '' },
      (r: ReturnType<typeof registry>) => { r.data.samples.samples[1].id = 'public-a' },
      (r: ReturnType<typeof registry>) => { r.data.samples.samples[0].args = ['wrong'] },
      (r: ReturnType<typeof registry>) => { r.data.samples.samples[0].expected = 'wrong' },
      (r: ReturnType<typeof registry>) => { r.data.samples.signatureVersion++ },
    ]) { const r = registry(); mutate(r); expect(publicRunPackage(r.data)).toBeUndefined() }
  })
  it.each([
    ['string', 'Tiếng Việt 🐟', 'khác'], ['boolean', true, false], ['int32[]', [1, 2], [1, 3]],
    ['string[]', ['Xin chào', '🐟'], ['khác']], ['int32[][]', [[1, 2], [3, 4]], [[0, 2], [3, 4]]],
  ] as const)('typed %s public Actual/Expected stays exact', (type, expected, actual) => {
    const r = registry(), s = snapshot()
    r.data.metadata.signature.returnType = type
    r.data.samples.samples.forEach(x => { x.expected = structuredClone(expected) as never })
    s.javascript!.schema.returnType = type
    s.javascript!.result.cases.forEach(x => { x.actual = structuredClone(actual) as never })
    const receipt = createPublicRunReceipt(sourceFingerprint(source), s, publicRunPackage(r.data))!
    expect(receipt.context).toMatchObject({ kind: 'RUN_PUBLIC', observations: [{ expected, actual }, { expected, actual }] })
  })
  it.each(['csharp', 'javascript'] as const)('%s safe compile/syntax and runtime categories omit raw diagnostics', language => {
    const r = registry(), s = snapshot(language), payload = language === 'csharp' ? s.csharp! : s.javascript!
    s.reason = 'COMPILATION_FAILED'; payload.result.cases = []; payload.result.notRunCaseIndices = [0, 1]
    const failure = { kind: language === 'csharp' ? 'COMPILE_ERROR' as const : 'SYNTAX_ERROR' as const, phase: 'compile' as const, caseIndex: null }
    if (language === 'csharp') s.csharp!.result.failure = { ...failure, kind: 'COMPILE_ERROR' }
    else s.javascript!.result.failure = { ...failure, kind: 'SYNTAX_ERROR' }
    const receipt = createPublicRunReceipt(sourceFingerprint(source), s, publicRunPackage(r.data))!
    expect(receipt.context).toMatchObject({ kind: 'RUN_PUBLIC', failure: language === 'csharp' ? 'COMPILE_ERROR' : 'SYNTAX_ERROR', observations: [] })
    s.reason = 'RUNTIME_FAILED'; payload.result.failure!.kind = 'RUNTIME_ERROR'
    expect(createPublicRunReceipt(sourceFingerprint(source), s, publicRunPackage(r.data))!.context).toMatchObject({ failure: 'RUNTIME_ERROR' })
  })
  it('oversized public mapping cannot hold a lease or export a partial sample', async () => {
    const r = registry(); r.data.metadata.signature.returnType = 'string'; r.data.samples.samples.forEach(x => { x.expected = '🐟'.repeat(3000) })
    expect(publicRunPackage(r.data)).toBeUndefined()
    const c = await captureSmartHints(r.packages, request({ run: { sessionId: snapshot().sessionId, generation: 1, sequence: 7 } }), 1, () => {})
    expect(c.runContext).toEqual({ kind: 'CODE_ONLY', reason: 'DETAIL_LIMIT_EXCEEDED' }); expect(r.pinned).toBe(false)
  })
  it('actual public adapter plan returns detached mapping from its own lease, clears after release', async () => {
    const r = registry(), runPhase = vi.fn(async () => {})
    const plan = packageRunBinding<JavascriptExecutionAdapter>(r.packages as ExercisePackageRegistry, 'synthetic', () => ({ runPhase }) as unknown as JavascriptExecutionAdapter)
    expect(plan.publicRunPackage()).toBeUndefined()
    await plan.adapter.runPhase('prepare', { signal: new AbortController().signal, deadline: performance.now() + 10000 } as never)
    const copy = plan.publicRunPackage()!; copy.samples[0].args[0] = 555
    expect(plan.publicRunPackage()!.samples[0].args).toEqual([1]); expect(runPhase).toHaveBeenCalledOnce()
    plan.releaseContent(); expect(plan.publicRunPackage()).toBeUndefined(); expect(r.release).toHaveBeenCalledOnce()
  })
  it('failed capture check still releases the public lease', async () => {
    const r = registry(); let n = 0
    await expect(captureSmartHints(r.packages, request(), 1, () => { if (++n > 2) throw Error('stale') })).rejects.toThrow()
    expect(r.pinned).toBe(false)
  })
})
