import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { resolve, join, sep } from 'node:path'
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { validatePrepareHintApply, isHintApplyProposal, smartCandidate, smartPosition, isSmartStatus } from '../../src/shared/contracts/smart-hints-validation'
import type { PrepareHintApply, SmartSelection } from '../../src/shared/contracts/smart-hints'
import { registry, request, start, reference, fixAction } from '../fixtures/learning/smart-hints'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { SMART_HINT_CHANNELS as C } from '../../src/shared/contracts/smart-hints'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import { SharedExecutionCoordinator } from '../../src/main/services/learning/smart-hints/execution-coordinator'
import type { SmartProvider } from '../../src/main/services/learning/smart-hints/adapter'

let parser: MainSelectionFixGuard
beforeAll(async () => {
  const sdk = await new SelectionFixCsharpSdkResolver().resolve({ signal: new AbortController().signal, deadline: performance.now() + 15000 })
  if (sdk.state !== 'AVAILABLE') throw Error('Pinned C# SDK required; no skipped acceptance')
  parser = new MainSelectionFixGuard({ assetDirectory: resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/hint-apply-f2/main/smart-hints-parser'),
    sdkResolver: { resolve: async () => sdk } })
}, 20000)
const services: SmartHintsService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.stop())); vi.unstubAllGlobals() })
const wrap = (language: 'csharp' | 'javascript', body: string) => language === 'csharp'
  ? `public class Solution { public int solve(int x) {${body}} }` : `function solve(x) {${body}}`
function selection(source: string, startOffset: number, endOffset: number): SmartSelection {
  const a = smartPosition(source, startOffset), b = smartPosition(source, endOffset)
  return { startOffset, endOffset, text: source.slice(startOffset, endOffset), startLine: a.line, startColumn: a.column, endLine: b.line, endColumn: b.column }
}
async function fixture(language: 'csharp' | 'javascript', body = '', code = wrap(language, 'return x + 1;'), source = wrap(language, body)) {
  vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
  let now = Date.now(), live = true
  const q = request({ language, source, action: { kind: 'HINT' } }), pkg = registry()
  if (q.origin.kind === 'PRACTICE' && q.source.includes('\r\n')) q.origin.eol = 'CRLF'
  pkg.data.starters[language] = wrap(language, '')
  const reservations = vi.fn(async () => {}), coordinator = new SharedExecutionCoordinator(() => now, reservations)
  const run = vi.fn<SmartProvider['run']>(async (_capture, _history, _signal, execution) => {
    await execution!.reserveInference!(_signal)
    return { kind: 'HINT' as const, thinking: 'Think', steps: ['Implement'], code: { language, text: code }, evidence: [] }
  })
  const diagnostics = vi.fn()
  const service = new SmartHintsService({ mode: 'FAKE', run }, () => now, undefined, { timeoutMs: 10000, onHintApply: diagnostics }, parser, coordinator, parser)
  services.push(service)
  const check = () => { if (!live) throw Error('retired') }
  const recapture = vi.fn((r: typeof q, generation: number, guard: () => void) => captureSmartHints(pkg.packages, r, generation, guard))
  const p = await service.prepare(1, 'doc', q, check, (g, c) => recapture(q, g, c))
  service.start(1, 'doc', start(p))
  await vi.waitFor(() => expect(['COMPLETE', 'FAILED'].includes(service.status(1, 'doc', reference(p)).state)).toBe(true), { timeout: 10000 })
  expect(service.status(1, 'doc', reference(p)).state).toBe('COMPLETE')
  if (q.origin.kind !== 'PRACTICE') throw Error('fixture')
  const apply: PrepareHintApply = { requestId: randomUUID(), hint: reference(p), exerciseId: q.exerciseId, language,
    sourceRevision: q.sourceRevision, source: q.source, packageVersion: 1, origin: q.origin, selection: null }
  const prepare = (value = apply) => service.prepareHintApply(1, 'doc', value, recapture)
  return { service, q, pkg, apply, prepare, recapture, run, reservations, diagnostics, expire: () => { now += 300001 }, retire: () => { live = false } }
}

describe.each(['csharp', 'javascript'] as const)('%s F1 trusted Hint Apply with real parser', language => {
  it('F3 invalid target then reselection prepares one grant on the same trusted Hint', async () => {
    const f = await fixture(language, 'return x;', 'return x + 1;'), at = f.q.source.indexOf('return')
    const bad = { ...f.apply, selection: selection(f.q.source, at + 2, at + 2) }
    await expect(f.prepare(bad)).rejects.toMatchObject({ retryable: true, details: { reason: 'TARGET_INVALID', stage: 'TARGET', attempt: 1, remaining: 2, noGrant: true } })
    await expect(f.prepare(bad)).rejects.toMatchObject({ details: { attempt: 1 } })
    await expect(Promise.resolve().then(() => f.prepare({ ...bad, selection: selection(f.q.source, at, at + 9) }))).rejects.toThrow()
    const good = { ...f.apply, requestId: randomUUID(), selection: selection(f.q.source, at, at + 9) }
    const proposal = await f.prepare(good)
    expect(smartCandidate(f.q.source, proposal.output.edits, 'LF')).toBe(wrap(language, 'return x + 1;'))
    await expect(Promise.resolve().then(() => f.prepare({ ...good, requestId: randomUUID() }))).rejects.toThrow()
    await expect(Promise.resolve().then(() => f.prepare(bad))).rejects.toThrow()
    expect(f.service.consumeHintApply(1, 'doc', f.apply.hint, proposal.proposalId)).toEqual(proposal)
    expect(() => f.service.consumeHintApply(1, 'doc', f.apply.hint, proposal.proposalId)).toThrow()
    expect(f.diagnostics.mock.calls.map(([d]) => [d.stage, d.reason, d.attempt])).toEqual([['TARGET', 'TARGET_INVALID', 1], ['SH1', 'ACCEPT', 2]])
    expect(JSON.stringify(f.diagnostics.mock.calls)).not.toContain(f.q.source)
    expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
  })
  it('F3 invalid candidate stays rejected, retries bounded, duplicate failed attempts do not spend a turn', async () => {
    const f = await fixture(language, 'return x;', 'return (x + ;'), at = f.q.source.indexOf('return')
    for (let attempt = 1; attempt <= 3; attempt++) {
      const q = { ...f.apply, requestId: randomUUID(), selection: selection(f.q.source, at, at + 9) }
      for (let duplicate = 0; duplicate < 2; duplicate++)
        await expect(f.prepare(q)).rejects.toMatchObject({ retryable: attempt < 3, details: { reason: 'CANDIDATE_INVALID', stage: 'CANDIDATE', attempt, remaining: 3 - attempt } })
    }
    await expect(Promise.resolve().then(() => f.prepare({ ...f.apply, requestId: randomUUID(), selection: selection(f.q.source, at, at + 9) }))).rejects.toThrow()
    expect(f.diagnostics).toHaveBeenCalledTimes(3)
    expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
  })
  it('F3 uncertain classification reports UNSUPPORTED, keeps Copy text and never retries parsing', async () => {
    const f = await fixture(language, 'return x;', 'return x + 1;', wrap(language, 'return x;').replace('solve', 'other'))
    await expect(Promise.resolve().then(() => f.prepare())).rejects.toMatchObject({ retryable: false, details: { reason: 'UNSUPPORTED', stage: 'CLASSIFICATION' } })
    expect(f.service.status(1, 'doc', f.apply.hint).state).toBe('COMPLETE')
    expect(f.diagnostics).toHaveBeenLastCalledWith({ stage: 'CLASSIFICATION', reason: 'UNSUPPORTED', attempt: 1, language, implementation: 'UNCERTAIN' })
    expect(f.reservations).toHaveBeenCalledOnce()
  })
  it('F3 concurrent changed preparation cannot mint another proposal', async () => {
    const f = await fixture(language)
    let release!: () => void
    const pending = new Promise<void>(r => { release = r })
    const task = f.service.prepareHintApply(1, 'doc', f.apply, async (...args) => { await pending; return f.recapture(...args) })
    await expect(Promise.resolve().then(() => f.prepare({ ...f.apply, requestId: randomUUID() }))).rejects.toThrow()
    release(); const proposal = await task
    expect((await f.prepare()).proposalId).toBe(proposal.proposalId)
    expect(f.diagnostics).toHaveBeenCalledOnce()
  })
  it('F3 parser identifies extraction signature mismatch without relaxing validation', async () => {
    const f = await fixture(language), capture = await f.recapture(f.q, 1, () => {})
    await expect(parser.prepareHintApply({ ...capture, hintImplementation: 'NO_IMPLEMENTATION' }, wrap(language, 'return x;').replace('solve', 'other'), null,
      { signal: new AbortController().signal, deadline: Date.now() + 10000, clock: Date.now, check() {} }))
      .rejects.toMatchObject({ failure: { stage: 'SIGNATURE', reason: 'CANDIDATE_INVALID' } })
  })
  it('F3 failed attempt cannot reopen after TTL', async () => {
    const f = await fixture(language, 'return x;', 'return x + 1;'), at = f.q.source.indexOf('return')
    await expect(f.prepare()).rejects.toMatchObject({ details: { reason: 'TARGET_INVALID', stage: 'TARGET' } })
    f.expire()
    await expect(Promise.resolve().then(() => f.prepare({ ...f.apply, requestId: randomUUID(), selection: selection(f.q.source, at, at + 9) }))).rejects.toThrow()
  })
  it('replaces only the recognized unimplemented scaffold body', async () => {
    const f = await fixture(language, language === 'javascript' ? 'throw new Error("Chưa triển khai");' : 'throw new System.NotImplementedException();')
    const p = await f.prepare()
    expect(smartCandidate(f.q.source, p.output.edits, 'LF')).toBe(wrap(language, 'return x + 1;'))
  })
  it('F2 final consume rechecks package and allows only one concurrent consume', async () => {
    const f = await fixture(language), proposal = await f.prepare(), request = { preparation: f.apply, proposalId: proposal.proposalId }
    const outcomes = await Promise.allSettled([f.service.consumePreparedHintApply(1, 'doc', request, f.recapture), f.service.consumePreparedHintApply(1, 'doc', request, f.recapture)])
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1)
    await expect(f.service.consumePreparedHintApply(1, 'doc', request, f.recapture)).rejects.toThrow()
    expect(f.reservations).toHaveBeenCalledOnce()
  })
  it('F2 changed package at confirmation rejects and spends the grant', async () => {
    const f = await fixture(language), proposal = await f.prepare()
    f.pkg.data.metadata.packageVersion++
    await expect(f.service.consumePreparedHintApply(1, 'doc', { preparation: f.apply, proposalId: proposal.proposalId }, f.recapture)).rejects.toThrow()
    expect(() => f.service.consumeHintApply(1, 'doc', f.apply.hint, proposal.proposalId)).toThrow()
  })
  it('F2 discard cancels late preparation without destroying Hint copy/history', async () => {
    const f = await fixture(language)
    let release!: () => void
    const pending = new Promise<void>(r => { release = r })
    const preparing = f.service.prepareHintApply(1, 'doc', f.apply, async (...args) => { await pending; return f.recapture(...args) })
    f.service.discardHintApply(1, 'doc', { hint: f.apply.hint, requestId: f.apply.requestId }); release()
    await expect(preparing).rejects.toThrow()
    expect(f.service.status(1, 'doc', f.apply.hint).state).toBe('COMPLETE')
    await expect(Promise.resolve().then(() => f.prepare())).rejects.toThrow()
  })
  it('F2 captured full-source selection cannot redirect the automatic template body target', async () => {
    const f = await fixture(language)
    const p = await f.prepare({ ...f.apply, selection: selection(f.q.source, 0, f.q.source.length) })
    expect(p.target.kind).toBe('TEMPLATE_BODY'); expect(p.output.edits[0].expectedOldText).toBe('{}')
  })
  it('extracts complete function body, preserves exact header, canonical SH-1 and owned one-shot grant', async () => {
    const f = await fixture(language), p = await f.prepare(), candidate = smartCandidate(f.q.source, p.output.edits, 'LF')!
    expect(isHintApplyProposal(p)).toBe(true); expect(p.target.kind).toBe('TEMPLATE_BODY')
    expect(p.binding.action).toEqual({ kind: 'HINT' }); expect(p.hint).toEqual(f.apply.hint)
    expect(candidate).toBe(wrap(language, 'return x + 1;'))
    expect(p.output.edits[0].expectedOldText).toBe('{}')
    expect(f.run).toHaveBeenCalledOnce()
    expect(f.reservations).toHaveBeenCalledOnce()
    expect(isSmartStatus({ ...f.service.status(1, 'doc', f.apply.hint), output: p.output, proposalId: p.proposalId })).toBe(false)
    for (const [owner, scope, grant] of [[2, 'doc', p.proposalId], [1, 'other', p.proposalId], [1, 'doc', randomUUID()]] as const)
      expect(() => f.service.consumeHintApply(owner, scope, f.apply.hint, grant)).toThrow()
    expect(f.service.consumeHintApply(1, 'doc', f.apply.hint, p.proposalId)).toEqual(p)
    expect(() => f.service.consumeHintApply(1, 'doc', f.apply.hint, p.proposalId)).toThrow()
    await expect(Promise.resolve().then(() => f.prepare())).rejects.toThrow()
  })
  it('prepares duplicate requests once; response mutation cannot forge a grant', async () => {
    const f = await fixture(language), count = f.recapture.mock.calls.length
    const forged = f.service.status(1, 'doc', f.apply.hint)
    if (forged.state === 'COMPLETE' && forged.output.kind === 'HINT') forged.output.code.text = wrap(language, 'return 999;')
    const [a, b] = await Promise.all([f.prepare(), f.prepare()])
    expect(a).toEqual(b); expect(f.recapture.mock.calls.length).toBe(count + 2)
    a.output.edits[0].replacementText = '{return 999;}'; a.proposalId = randomUUID()
    expect((await f.prepare()).output.edits[0].replacementText).toBe('{return x + 1;}')
    await expect(Promise.resolve().then(() => f.prepare({ ...f.apply, requestId: randomUUID() }))).rejects.toThrow()
    expect(f.run).toHaveBeenCalledOnce()
    expect(f.reservations).toHaveBeenCalledOnce()
  })
  it('normalizes CRLF candidate while preserving the original signature and surrounding source', async () => {
    const f = await fixture(language, '\r\n// template\r\n', wrap(language, '\nreturn x + 1;\n'))
    const proposal = await f.prepare()
    expect(smartCandidate(f.q.source, proposal.output.edits, 'CRLF')).toBe(wrap(language, '\r\nreturn x + 1;\r\n'))
  })
  it('partial implementation uses exact explicit selection; rejects missing selection', async () => {
    const f = await fixture(language, 'return x;', 'return x + 1;')
    await expect(Promise.resolve().then(() => f.prepare())).rejects.toThrow()
    const at = f.q.source.indexOf('return')
    const p = await f.prepare({ ...f.apply, requestId: randomUUID(), selection: selection(f.q.source, at, at + 'return x;'.length) })
    expect(p.target).toEqual({ kind: 'SELECTION', startOffset: at, endOffset: at + 9 })
    expect(smartCandidate(f.q.source, p.output.edits, 'LF')).toBe(wrap(language, 'return x + 1;'))
  })
  it('allows explicit statement-boundary insertion with unchanged surrounding statements', async () => {
    const f = await fixture(language, 'return x;', 'x = x + 1;'), at = f.q.source.indexOf('return')
    const p = await f.prepare({ ...f.apply, selection: selection(f.q.source, at, at) })
    expect(p.output.edits[0].expectedOldText).toBe('')
    expect(smartCandidate(f.q.source, p.output.edits, 'LF')).toBe(wrap(language, 'x = x + 1;return x;'))
  })
  it.each(['source', 'revision', 'model', 'modelVersion', 'package', 'owner', 'operation', 'scope'] as const)('rejects forged/stale %s', async kind => {
    const f = await fixture(language), q = structuredClone(f.apply)
    if (kind === 'source') q.source += ' '
    if (kind === 'revision') q.sourceRevision++
    if (kind === 'model') q.origin.modelId = randomUUID()
    if (kind === 'modelVersion') q.origin.modelVersion++
    if (kind === 'package') q.packageVersion++
    if (kind === 'operation') q.hint.operationId = randomUUID()
    await expect(Promise.resolve().then(() => f.service.prepareHintApply(kind === 'owner' ? 2 : 1, kind === 'scope' ? 'other' : 'doc', q, f.recapture))).rejects.toThrow()
  })
  it.each(['package', 'signature', 'starter'] as const)('rejects recaptured package %s changes', async kind => {
    const f = await fixture(language)
    if (kind === 'package') f.pkg.data.metadata.packageVersion++
    if (kind === 'signature') f.pkg.data.metadata.signature.hash = 'b'.repeat(64)
    if (kind === 'starter') f.pkg.data.starters[language] += ' '
    await expect(f.prepare()).rejects.toThrow()
  })
  it('rejects a package replacement during parser work before publishing a grant', async () => {
    const f = await fixture(language), original = f.recapture.getMockImplementation()!
    let calls = 0
    f.recapture.mockImplementation(async (...args) => {
      if (++calls === 2) f.pkg.data.metadata.packageVersion++
      return original(...args)
    })
    await expect(f.prepare()).rejects.toThrow()
  })
  it.each(['invalid syntax', 'signature change', 'ambiguous target', 'inside token', 'unsupported grammar'] as const)('rejects %s candidate/target', async kind => {
    const code = kind === 'invalid syntax' ? 'return (x + ;' : kind === 'signature change' ? wrap(language, 'return x;').replace('solve', 'other')
      : kind === 'unsupported grammar' ? language === 'csharp' ? 'return await Task.FromResult(x);' : 'return (() => x)();' : 'return x + 1;'
    const f = await fixture(language, 'return x;', code)
    const a = kind === 'ambiguous target' ? 0 : f.q.source.indexOf('return') + (kind === 'inside token' ? 2 : 0)
    const b = kind === 'ambiguous target' ? f.q.source.length - 1 : f.q.source.indexOf('return') + 9
    await expect(f.prepare({ ...f.apply, selection: selection(f.q.source, a, b) })).rejects.toThrow()
  })
  it('does not synthesize or overwrite a whole file when the physical template function is missing', async () => {
    const f = await fixture(language, '', wrap(language, 'return x + 1;'), '')
    await expect(f.prepare()).rejects.toMatchObject({ retryable: false, details: { stage: 'SOURCE_PARSE', reason: 'UNSUPPORTED' } })
  })
  it.each(['ttl', 'retire', 'context', 'cancel', 'provider'] as const)('%s invalidates prepared grant and retained Hint', async kind => {
    const f = await fixture(language), p = await f.prepare()
    if (kind === 'ttl') f.expire()
    if (kind === 'retire') f.retire()
    if (kind === 'context') f.service.retireContext(1, 'doc', { clientContextId: f.q.clientContextId, reason: 'EDIT' })
    if (kind === 'cancel') f.service.cancel(1, 'doc', f.apply.hint)
    if (kind === 'provider') await f.service.configureProvider()
    expect(() => f.service.consumeHintApply(1, 'doc', f.apply.hint, p.proposalId)).toThrow()
    await expect(Promise.resolve().then(() => f.prepare())).rejects.toThrow()
  })
  it('late package capture cannot publish after source retirement', async () => {
    const f = await fixture(language)
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const task = f.service.prepareHintApply(1, 'doc', f.apply, async (...args) => { await pending; return f.recapture(...args) })
    f.service.retireContext(1, 'doc', { clientContextId: f.q.clientContextId, reason: 'EDIT' }); release()
    await expect(task).rejects.toThrow()
    expect(f.run).toHaveBeenCalledOnce()
  })
  it('typed bridge → real IPC → Main proposal, forged input/frame rejected and bridge epochs preserved', async () => {
    const f = await fixture(language), handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const ipcRegistry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } })
    class Owner extends EventEmitter { id = 1; isDestroyed() { return false } }
    const owner = new Owner(), frame = { processId: 10, frameToken: 'main', detached: false, isDestroyed: () => false }
    const event = { sender: { id: 1 }, senderFrame: frame }, order = createLearningOrder()
    const ipc = new ExerciseIpcService(ipcRegistry, { retirePublicRunReceipt() {} } as unknown as ExerciseService,
      c => { if (c.senderFrame?.frameToken !== 'main') throw Error('denied') }, () => {}, undefined, undefined,
      { service: f.service, capture: f.recapture })
    ipc.observe(owner); ipc.start()
    const invoke = vi.fn(async (channel: string, value: unknown) => handlers.get(channel)!(event, value))
    const api = createSmartHintsBridge({ invoke, on() {}, removeListener() {} }, order, undefined)
    try {
      const q = { ...f.q, requestId: randomUUID(), clientContextId: randomUUID() }
      const prepared = await api.prepare(q); expect(prepared.ok).toBe(true); if (!prepared.ok) throw Error('prepare')
      await api.start(start(prepared.value))
      await vi.waitFor(async () => { const s = await api.status(reference(prepared.value)); expect(s.ok && s.value.state).toBe('COMPLETE') }, { timeout: 10000 })
      const apply = { ...f.apply, requestId: randomUUID(), hint: reference(prepared.value) }, count = f.run.mock.calls.length
      const proposal = await api.prepareHintApply(apply)
      expect(proposal.ok).toBe(true); expect(f.run.mock.calls.length).toBe(count)
      if (!proposal.ok) throw Error('proposal')
      const forged = await handlers.get(C.prepareHintApply)!(event, { ...apply, candidate: 'forged' })
      expect(forged).toMatchObject({ ok: false })
      expect(await handlers.get(C.prepareHintApply)!({ ...event, sender: { id: 99 } }, apply)).toMatchObject({ ok: false })
      expect(await handlers.get(C.prepareHintApply)!({ ...event, senderFrame: { ...frame, frameToken: 'subframe' } }, apply)).toMatchObject({ ok: false })
      const calls = invoke.mock.calls.length
      expect((await api.prepareHintApply({ ...apply, hint: { ...apply.hint, operationId: randomUUID() } })).ok).toBe(false)
      expect(invoke.mock.calls.length).toBe(calls)
      const original = invoke.getMockImplementation()!
      invoke.mockImplementationOnce(async (...args) => { const reply = await original(...args); order.invalidate(); return reply })
      expect((await api.prepareHintApply(apply)).ok).toBe(false)
      owner.emit('render-process-gone')
      expect((await api.prepareHintApply(apply)).ok).toBe(false)
    } finally { await ipc.stop(); ipcRegistry.dispose() }
  })
})

it('strict contract rejects Renderer-provided code, result, candidate, offsets, grant and malformed selection', async () => {
  const f = await fixture('javascript')
  for (const key of ['code', 'hintText', 'output', 'candidate', 'edits', 'startOffset', 'grant', 'proposalId'])
    expect(validatePrepareHintApply({ ...f.apply, [key]: 'forged' }).ok).toBe(false)
  expect(validatePrepareHintApply({ ...f.apply, selection: { startOffset: 1, endOffset: 2, text: 'wrong' } }).ok).toBe(false)
})
it('C# complete method without class wrapper yields only the parsed method body', async () => {
  const f = await fixture('csharp', '', 'public int solve(int x) {return x + 1;}')
  const proposal = await f.prepare()
  expect(smartCandidate(f.q.source, proposal.output.edits, 'LF')).toBe(wrap('csharp', 'return x + 1;'))
})
it('default SDK lifecycle reuses verified identity between Hint phases without increasing parser budgets', async () => {
  const f = await fixture('csharp'), runtime = new MainSelectionFixGuard({ assetDirectory: resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/hint-apply-f2/main/smart-hints-parser') })
  const capture = await f.recapture(f.q, 1, () => {})
  const scope = { signal: new AbortController().signal, clock: Date.now, deadline: Date.now() + 30000, check() {} }
  expect(await runtime.classifyHint(capture, scope)).toBe('NO_IMPLEMENTATION')
  expect(await runtime.validateHintFunction(capture, wrap('csharp', 'return x + 1;'), scope)).toBe(true)
  expect(await runtime.prepareHintApply({ ...capture, hintImplementation: 'NO_IMPLEMENTATION' }, wrap('csharp', 'return x + 1;'), null, scope))
    .toMatchObject({ replacementText: '{return x + 1;}' })
}, 15000)
it('warm Hint asset identity still rejects changed asset bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f2-hint-assets-'))
  const safeDirectory = resolve(directory).startsWith(resolve(tmpdir()) + sep)
  expect(safeDirectory).toBe(true)
  try {
    const assets = join(directory, 'parser'); await cp(resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/hint-apply-f2/main/smart-hints-parser'), assets, { recursive: true })
    const f = await fixture('javascript'), runtime = new MainSelectionFixGuard({ assetDirectory: assets })
    const capture = await f.recapture(f.q, 1, () => {}), scope = { signal: new AbortController().signal, clock: Date.now, deadline: Date.now() + 30000, check() {} }
    expect(await runtime.classifyHint(capture, scope)).toBe('NO_IMPLEMENTATION')
    await writeFile(join(assets, 'TYPESCRIPT-LICENSE.txt'), 'changed bytes')
    expect(await runtime.validateHintFunction(capture, wrap('javascript', 'return x + 1;'), scope)).toBe(false)
  } finally {
    if (safeDirectory) await rm(directory, { recursive: true, force: true })
  }
})
it('JavaScript scaffold exception never grants NewExpression to Suggest Fix or candidates', async () => {
  const f = await fixture('javascript', 'throw new Error("TODO");')
  const at = f.q.source.indexOf('throw'), q = { ...f.q, action: fixAction(f.q.source, at, at + 'throw new Error("TODO");'.length) }
  const captured = await f.recapture(q, 1, () => {}), scope = { signal: new AbortController().signal, clock: Date.now, deadline: Date.now() + 30000, check() {} }
  await expect(parser.preflight(captured, scope)).rejects.toThrow()
  const candidate = await fixture('javascript', '', wrap('javascript', 'return new Error("TODO");'))
  await expect(candidate.prepare()).rejects.toThrow()
})
