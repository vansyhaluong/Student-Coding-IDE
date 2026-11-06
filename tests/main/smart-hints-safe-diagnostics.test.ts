import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SmartHintsConfiguration } from '../../src/main/services/learning/smart-hints/configuration'
import { classifySmartOutput, smartOutputDiagnostic, VALIDATION_REASONS } from '../../src/main/services/learning/smart-hints/validation-diagnostics'
import { projectResponseFailure } from '../../src/main/services/learning/smart-hints/response-failure'
import { isSmartOutput, isSmartStatus } from '../../src/shared/contracts/smart-hints-validation'
import { GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-provider'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import type { SmartAction } from '../../src/shared/contracts/smart-hints'
import { capture, request, start, reference, fixAction } from '../fixtures/learning/smart-hints'

const secret = 'AQ.SYNTHETIC_DIAGNOSTICS_KEY', canary = 'PRIVATE-DIAGNOSTICS-CANARY'
const source = 'function solve(x) { return x; }', offset = source.indexOf('x;')
const edit = { startOffset: offset, endOffset: offset + 1, expectedOldText: 'x', replacementText: 'x + 1', rationale: canary }
const proposal = { kind: 'EDIT_PROPOSAL', edits: [edit], rationale: canary, evidence: [] }
const noFix = { kind: 'NO_FIX', reason: 'LOCATION_UNKNOWN', advice: canary }
const fix = fixAction(source, offset, offset + 1)
const analysis = { kind: 'ANALYSIS', hypotheses: [canary], suggestions: [], evidence: [] }
const metadata = { name: `models/${GEMINI_MODEL}`, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] }
const roots: string[] = [], managers: SmartHintsConfiguration[] = []
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.stop()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  vi.unstubAllGlobals()
})
const withEdit = (patch: Partial<typeof edit>) => ({ ...proposal, edits: [{ ...edit, ...patch }] })
const cases = [
  { name: 'old text mismatch', output: withEdit({ expectedOldText: canary }), reason: 'OLD_TEXT_MISMATCH', field: 'expectedOldText' },
  { name: 'fractional offset', output: withEdit({ startOffset: 1.5 }), reason: 'INVALID_RANGE', field: 'startOffset' },
  { name: 'out of bounds', output: withEdit({ endOffset: source.length + 1 }), reason: 'INVALID_RANGE', field: 'endOffset' },
  { name: 'no-op edit', output: withEdit({ replacementText: edit.expectedOldText }), reason: 'INVALID_FIELD', field: 'replacementText' },
  // Empty old text allows the boundary check to distinguish a split surrogate.
  { name: 'UTF-16 insertion split', source: '🐟abc', output: withEdit({ startOffset: 1, endOffset: 1, expectedOldText: '' }), reason: 'INVALID_RANGE', field: 'startOffset' },
  { name: 'CRLF mismatch', eol: 'CRLF' as const, output: withEdit({ replacementText: 'x\n+1' }), reason: 'INVALID_EOL', field: 'replacementText' },
  { name: 'CRLF boundary split', source: 'a\r\nb', eol: 'CRLF' as const, output: withEdit({ startOffset: 2, endOffset: 2, expectedOldText: '' }), reason: 'INVALID_RANGE', field: 'startOffset' },
  { name: 'overlap', output: { ...proposal, edits: [edit, edit] }, reason: 'OVERLAPPING_EDITS', field: 'edits' },
  { name: 'full source', output: withEdit({ startOffset: 0, endOffset: source.length, expectedOldText: source }), reason: 'FULL_SOURCE_REWRITE', field: 'edits' },
  { name: 'missing field', output: { kind: 'EDIT_PROPOSAL', edits: [edit], evidence: [] }, reason: 'MISSING_FIELD', field: 'rationale' },
  { name: 'extra field', output: { ...proposal, [canary]: canary }, reason: 'WRONG_SHAPE', field: '$' },
  { name: 'nested missing field', output: { ...proposal, edits: [{ startOffset: 0, endOffset: 1, replacementText: 'x', rationale: canary }] }, reason: 'MISSING_FIELD', field: 'expectedOldText' },
  { name: 'invalid evidence', output: { ...proposal, evidence: ['R1'] }, reason: 'INVALID_EVIDENCE', field: 'evidence' },
  { name: 'oversized edit', output: withEdit({ replacementText: 'a'.repeat(16385) }), reason: 'SIZE_LIMIT_EXCEEDED', field: 'replacementText' },
  { name: 'too many lines', output: withEdit({ replacementText: '\n'.repeat(201) }), reason: 'SIZE_LIMIT_EXCEEDED', field: 'edits' },
  { name: 'wrong NO_FIX reason', output: { ...noFix, reason: canary }, reason: 'INVALID_FIELD', field: 'reason' },
  { name: 'non object', output: canary, reason: 'WRONG_SHAPE', field: '$' },
]

async function fixture(options: { output?: unknown; source?: string; eol?: 'LF' | 'CRLF'; http?: number; metadata?: unknown; action?: SmartAction } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sh4-d1-')); roots.push(root)
  const file = join(root, 'smart-hints-settings.json'), onDiagnostic = vi.fn(), onDiagnosticStoreError = vi.fn()
  const send = vi.fn(async (r: Request) => {
    if (r.method === 'GET') return Response.json(options.metadata ?? metadata)
    return options.http ? Response.json({ error: { message: canary, status: canary } }, { status: options.http })
      : Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(options.output ?? analysis) }] } }] })
  })
  const manager = new SmartHintsConfiguration({ file, transport: { send },
    encryption: { available: async () => true, encrypt: async () => Buffer.from('OPAQUE'), decrypt: async () => secret },
    promptKey: async () => secret, confirm: async () => true, onDiagnostic, onDiagnosticStoreError })
  managers.push(manager); await manager.start(); await manager.configureKey(() => {}); await manager.enable(true, () => {})
  const q = request({ source: options.source ?? source, action: options.action ?? { kind: 'ANALYZE' },
    origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: options.eol ?? 'LF' } })
  async function run() {
    const prepared = await manager.service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
    manager.service.start(1, 'doc', start(prepared))
    await vi.waitFor(() => expect(onDiagnostic).toHaveBeenCalledOnce())
    const status = manager.service.status(1, 'doc', reference(prepared)), diagnostic = onDiagnostic.mock.calls[0][0]
    expect(isSmartStatus(status)).toBe(true)
    for (const field of ['outputKind', 'validationReason', 'validationField', 'buildIdentity', 'providerFailureSource', 'diagnosticsVersion']) expect(status).not.toHaveProperty(field)
    const safe = JSON.stringify(diagnostic)
    for (const privateValue of [secret, canary, q.source, q.requestId, q.clientContextId, root]) expect(safe).not.toContain(privateValue)
    expect(diagnostic).toMatchObject({ model: GEMINI_MODEL, buildIdentity: 'UNBUNDLED', diagnosticsVersion: 1 })
    expect(safe.length).toBeLessThan(2048)
    return { status, diagnostic }
  }
  return { manager, file, root, q, run, send, onDiagnostic, onDiagnosticStoreError }
}

describe('SH4-D1 normal application → Gemini fake transport → SH1 → safe terminal evidence', () => {
  it.each(cases)('$name retains the original SH-1 rejection reason without dispatching disabled Fix', test => {
    const code = test.source ?? source, eol = 'eol' in test ? test.eol : 'LF'
    const before = structuredClone(test.output)
    expect(isSmartOutput(test.output, fix, code, [], eol)).toBe(false)
    expect(classifySmartOutput(test.output, fix, code, [], eol)).toMatchObject({ reason: test.reason, field: test.field })
    expect(test.output).toEqual(before)
  })
  it.each([proposal, noFix])('legacy canonical $kind retains its SH-1 validation independently from disabled dispatch', output => {
    expect(isSmartOutput(output, fix, source, [], 'LF')).toBe(true)
    expect(classifySmartOutput(output, fix, source, [], 'LF')).toBeUndefined()
  })
  it('configured Main rejects selection Fix and legacy kind-only Fix without HTTP, quota, execution diagnostics or grants', async () => {
    const f = await fixture({ action: fix })
    const p = await f.manager.service.prepare(1, 'doc', f.q, () => {}, async g => capture(f.q, g))
    expect(f.manager.service.start(1, 'doc', start(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(f.send).not.toHaveBeenCalled(); expect(f.onDiagnostic).not.toHaveBeenCalled()
    expect(f.manager.snapshot().usedRequests).toBe(0)
    expect(() => f.manager.service.prepare(1, 'doc', { ...f.q, requestId: randomUUID(), action: { kind: 'SUGGEST_FIX' } } as never,
      () => {}, async g => capture(f.q, g))).toThrow()
    await expect(readFile(join(f.root, 'smart-hints-last-suggest-fix.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('unpaired UTF-16 in provider JSON stays a parser failure, not an invented SH1 reason', async () => {
    const f = await fixture({ output: withEdit({ expectedOldText: '\udc1f' }) }), { status, diagnostic } = await f.run()
    expect(status).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    expect(diagnostic).toMatchObject({ stage: 'CONTENT_JSON', outputJsonValidation: 'FAIL', schemaValidation: 'NOT_RUN', validationReason: null })
  })
  it.each([400, 404, 503])('HTTP %i remains PROVIDER/HTTP_ERROR, no body or additional request', async http => {
    const f = await fixture({ http }), { status, diagnostic } = await f.run()
    expect(status).toMatchObject({ state: 'FAILED', code: 'PROVIDER' })
    expect(diagnostic).toMatchObject({ providerFailureSource: 'HTTP_ERROR', httpStatus: http, requestKind: 'INFERENCE', outputKind: 'UNOBSERVED', schemaValidation: 'NOT_RUN' })
    expect(f.send).toHaveBeenCalledTimes(2)
  })
  it('metadata mismatch is local PROVIDER with zero POST and no reservation', async () => {
    const f = await fixture({ metadata: { ...metadata, name: canary } }), { status, diagnostic } = await f.run()
    expect(status).toMatchObject({ state: 'FAILED', code: 'PROVIDER' })
    expect(diagnostic).toMatchObject({ providerFailureSource: 'MODEL_METADATA_ERROR', requestKind: 'MODEL', inferenceDispatched: false })
    expect(f.send).toHaveBeenCalledOnce(); expect(f.manager.snapshot().usedRequests).toBe(0)
  })
  it('reservation write failure remains PROVIDER, with zero POST and no refund', async () => {
    const f = await fixture()
    await writeFile(`${f.file}.usage`, canary) // Cause ENOTDIR/EEXIST using owned synthetic storage only.
    const { status, diagnostic } = await f.run()
    expect(status).toMatchObject({ state: 'FAILED', code: 'PROVIDER' })
    expect(diagnostic).toMatchObject({ providerFailureSource: 'RESERVATION_IO_ERROR', stage: 'RESERVATION', inferenceDispatched: false })
    expect(f.send).toHaveBeenCalledOnce(); expect(f.manager.snapshot().usedRequests).toBe(1)
  })
  it('post-inference persistence failure stays PROVIDER/PERSISTENCE_IO_ERROR', async () => {
    const f = await fixture()
    // A prior remote observation is needed to reach the existing clear-and-persist path.
    await f.manager.stop(); managers.splice(managers.indexOf(f.manager), 1)
    const data = JSON.parse(await readFile(f.file, 'utf8'))
    await writeFile(f.file, JSON.stringify({ ...data, providerLimit: { kind: 'GEMINI_RATE_LIMIT', retryAt: 1 } }))
    const diagnostic = vi.fn(), send = vi.fn(async (r: Request) => {
      if (r.method === 'GET') return Response.json(metadata)
      await rm(f.file); await mkdir(f.file) // Reservation persisted; fail only later settings rename.
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(proposal) }] } }] })
    })
    const m = new SmartHintsConfiguration({ file: f.file, transport: { send },
      encryption: { available: async () => true, encrypt: async () => Buffer.from('OPAQUE'), decrypt: async () => secret },
      promptKey: async () => secret, confirm: async () => true, onDiagnostic: diagnostic })
    managers.push(m); await m.start()
    const p = await m.service.prepare(1, 'doc', f.q, () => {}, async g => capture(f.q, g))
    m.service.start(1, 'doc', start(p)); await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledOnce())
    expect(m.service.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'PROVIDER' })
    expect(diagnostic.mock.calls[0][0]).toMatchObject({ providerFailureSource: 'PERSISTENCE_IO_ERROR', outputKind: 'EDIT_PROPOSAL', editCount: 1, httpStatus: 200, schemaValidation: 'NOT_RUN' })
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(canary)
    expect(send).toHaveBeenCalledTimes(2); expect(m.snapshot().usedRequests).toBe(1)
  })
  it('throwing Analyze terminal sink never alters COMPLETE/quota or writes disabled Fix diagnostics', async () => {
    const f = await fixture()
    await mkdir(join(f.root, 'smart-hints-last-suggest-fix.json'))
    f.onDiagnostic.mockImplementation(() => { throw Error(canary) })
    const { status } = await f.run()
    expect(status.state).toBe('COMPLETE'); await f.manager.stop()
    expect(f.onDiagnosticStoreError).not.toHaveBeenCalled()
    expect((await readdir(f.root)).filter(name => name.startsWith('smart-hints-last-suggest-fix.json.') && name.endsWith('.tmp'))).toEqual([])
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.manager.snapshot().usedRequests).toBe(1)
  })
  it('cancelled late failure cannot contaminate the next request diagnostic', async () => {
    const f = await fixture(), normalSend = f.send.getMockImplementation()!
    let release!: () => void
    const held = new Promise<void>(done => { release = done })
    f.send.mockImplementationOnce(normalSend).mockImplementationOnce(async () => {
      await held
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(withEdit({ expectedOldText: canary })) }] } }] })
    })
    try {
      const p = await f.manager.service.prepare(1, 'doc', f.q, () => {}, async g => capture(f.q, g))
      f.manager.service.start(1, 'doc', start(p))
      await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
      f.manager.service.cancel(1, 'doc', reference(p))
      release()
      await vi.waitFor(() => expect(f.onDiagnostic).toHaveBeenCalledOnce())
      const q = { ...f.q, requestId: randomUUID() }
      const p2 = await f.manager.service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
      // Wait for the aborted provider task to release service.active before the manual start.
      await new Promise(done => setTimeout(done, 0))
      f.manager.service.start(1, 'doc', start(p2))
      await vi.waitFor(() => expect(f.onDiagnostic).toHaveBeenCalledTimes(2))
      expect(f.onDiagnostic.mock.calls.map(([d]) => [d.state, d.validationReason])).toEqual([['CANCELLED', null], ['COMPLETE', null]])
      expect(f.send).toHaveBeenCalledTimes(4); expect(f.manager.snapshot().usedRequests).toBe(2)
    } finally { release() }
  })
  it.each([
    { action: { kind: 'HINT', level: 1 }, output: { kind: 'HINT', level: 1, paragraphs: [canary], nextQuestion: canary, evidence: [] } },
    { action: { kind: 'ANALYZE' }, output: { kind: 'ANALYSIS', hypotheses: [canary], suggestions: [], evidence: [] } },
    { action: { kind: 'EXPLAIN', selection: { startOffset: 0, endOffset: 8, text: 'function', startLine: 1, startColumn: 1, endLine: 1, endColumn: 9 } },
      output: { kind: 'EXPLANATION', syntax: canary, variables: canary, controlFlow: canary, algorithm: canary, illustrativeExamples: [] } },
  ])('unchanged $output.kind action contract and single POST', async test => {
    const f = await fixture({ ...test, action: test.action as SmartAction }), { status, diagnostic } = await f.run()
    expect(status).toMatchObject({ state: 'COMPLETE', output: test.output })
    expect(diagnostic).toMatchObject({ outputKind: test.output.kind, schemaValidation: 'PASS', validationReason: null })
    expect(f.send).toHaveBeenCalledTimes(2)
  })
})

it('classification agrees with unchanged acceptance on a mutation corpus, without mutating input', () => {
  const corpus: unknown[] = [proposal, noFix, ...cases.map(x => x.output), null, [], {}, { ...proposal, evidence: ['R1'] }]
  for (const field of Object.keys(edit)) for (const value of [undefined, null, -1, -0, 0, 1.1, '', canary, [], {}]) corpus.push(withEdit({ [field]: value } as never))
  for (let startOffset = -1; startOffset <= source.length + 1; startOffset++) {
    for (const endOffset of [0, startOffset, startOffset + 1, source.length, source.length + 1]) {
      corpus.push(withEdit({ startOffset, endOffset, expectedOldText: source.slice(startOffset, endOffset) }))
    }
  }
  for (const value of corpus) {
    const before = structuredClone(value), classification = classifySmartOutput(value, fix, source, [], 'LF')
    expect(classification === undefined).toBe(isSmartOutput(value, fix, source, [], 'LF'))
    if (classification) expect(VALIDATION_REASONS).toContain(classification.reason)
    expect(value).toEqual(before)
  }
})

it('diagnostic projections bound counts and discard unknown provider values/accessors', () => {
  expect(smartOutputDiagnostic({ kind: canary, edits: new Array(10000) })).toEqual({ outputKind: 'UNRECOGNIZED', editCount: 5 })
  expect(projectResponseFailure({ code: 'SCHEMA_VALIDATION_FAILED', invalidFields: [canary], validation: { reason: canary, field: canary }, raw: secret })).not.toHaveProperty('validation')
  const getter = vi.fn(() => secret)
  expect(smartOutputDiagnostic(Object.defineProperty({}, 'kind', { get: getter }))).toEqual({ outputKind: 'UNRECOGNIZED', editCount: null })
  expect(getter).not.toHaveBeenCalled()
  const refs = Object.defineProperty([canary], '0', { get: getter, enumerable: true })
  expect(classifySmartOutput({ ...proposal, evidence: refs }, fix, source, [])).toMatchObject({ reason: 'INVALID_EVIDENCE' })
  expect(getter).not.toHaveBeenCalled()
})

it.each([new Error(canary), new SmartProviderError('PROVIDER', undefined, undefined, canary as never)])('unexpected exception cannot leak its reason or change the public code', async error => {
  const onExecution = vi.fn(), service = new SmartHintsService({ mode: 'FAKE', run: async () => { throw error } }, Date.now, undefined,
    { timeoutMs: 10000, onExecution })
  try {
    const q = request({ source, action: { kind: 'ANALYZE' } }), p = await service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
    service.start(1, 'doc', start(p))
    await vi.waitFor(() => expect(service.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'PROVIDER' }))
    expect(onExecution.mock.calls.at(-1)?.[0]).toMatchObject({ providerFailureSource: 'UNEXPECTED_ERROR' })
    expect(JSON.stringify(onExecution.mock.calls)).not.toContain(canary)
  } finally { await service.stop() }
})
