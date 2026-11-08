import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmartHintsConfiguration } from '../../src/main/services/learning/smart-hints/configuration'
import { capture, request, start, reference, fixAction } from '../fixtures/learning/smart-hints'
import type { SmartAction, SmartOutput } from '../../src/shared/contracts/smart-hints'

const key = 'AQ.SYNTHETIC_SETTINGS_ONLY_KEY'
const roots: string[] = [], managers: SmartHintsConfiguration[] = []
afterEach(async () => { for (const m of managers.splice(0)) await m.stop(); vi.useRealTimers(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture(wallClock = false) {
  const root = await mkdtemp(join(tmpdir(), 'smart-config-')); roots.push(root)
  let mode = 'ok'
  let now = Date.UTC(2026, 10, 3, 12)
  const send = vi.fn(async (r: Request) => {
    expect(r.headers.get('x-goog-api-key')).toBe(key)
    if (mode === 'pending' || mode === 'pending-post' && r.method === 'POST') return new Promise<Response>((_, reject) => r.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }))
    if (mode === 'pending-body-post' && r.method === 'POST') return new Response(new ReadableStream<Uint8Array>({}), { headers: { 'content-type': 'application/json' } })
    if (mode === '429') return Response.json({}, { status: 429 })
    if (mode === 'daily429' && r.method === 'POST') return Response.json({ error: { details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '60s' },
    ] } }, { status: 429 })
    if (mode === '401') return Response.json({}, { status: 401 })
    if (mode === '503-post' && r.method === 'POST') return Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'SYNTHETIC_UNTRUSTED_MESSAGE' } }, { status: 503 })
    if (r.method === 'GET') return Response.json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 })
    const body = await r.json(), input = JSON.parse(body.contents[0].parts[0].text), a = input.action
    if (mode === 'max-tokens') return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ text: '{"kind":"EDIT_PROPOSAL"' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 768, thoughtsTokenCount: 1280, totalTokenCount: 2148 } })
    if (mode === 'safety') return Response.json({ candidates: [{ finishReason: 'SAFETY' }] })
    if (mode === 'missing-json') return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '' }] } }] })
    let output: SmartOutput
    if (a.kind === 'HINT') output = { kind: 'HINT', thinking: 'Compare the input and output.', steps: ['Compare the public inputs.'], code: { language: input.language, text: 'return x + 1;' }, evidence: [] }
    else if (a.kind === 'EXPLAIN') output = { kind: 'EXPLANATION', syntax: 'Return statement.', variables: 'x is input.', controlFlow: 'Returns.', algorithm: 'Identity.', illustrativeExamples: ['Illustrative only: 2 becomes 2.'] }
    else if (a.kind === 'SUGGEST_FIX') {
      const offset = input.source.indexOf('x;')
      output = { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: offset, endOffset: offset + 1, expectedOldText: 'x', replacementText: 'x + 1', rationale: 'Unverified proposal.' }], rationale: 'Check against public task.', evidence: [] }
    } else output = { kind: 'ANALYSIS', hypotheses: ['Current source returns x.'], suggestions: ['Check the public task.'], evidence: [] }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(output) }] } }] })
  })
  const encryption = { available: vi.fn(async () => true), encrypt: vi.fn(async () => Buffer.from('OPAQUE-OS-CIPHERTEXT')),
    decrypt: vi.fn(async () => key) }
  const promptKey = vi.fn(async () => key), confirm = vi.fn(async () => true)
  const onDiagnostic = vi.fn()
  const options = { file: join(root, 'smart-hints-settings.json'), encryption, transport: { send }, promptKey, confirm, clock: wallClock ? () => Date.now() : () => now, onDiagnostic }
  const manager = new SmartHintsConfiguration(options); managers.push(manager); await manager.start()
  const base = request({ source: 'function solve(x) { return x; }', exerciseId: 'ordinary-public-exercise' })
  const run = async (action: SmartAction = { kind: 'ANALYZE' }) => {
    const q = { ...base, requestId: randomUUID(), action }
    const prepared = await manager.service.prepare(1, 'main-owned', q, () => {}, async g => capture(q, g))
    return { status: manager.service.start(1, 'main-owned', start(prepared)), ref: reference(prepared) }
  }
  const complete = async (action?: SmartAction) => {
    const r = await run(action)
    await vi.waitFor(() => expect(manager.service.status(1, 'main-owned', r.ref).state).toBe('COMPLETE'))
    return manager.service.status(1, 'main-owned', r.ref)
  }
  return { manager, options, send, encryption, promptKey, confirm, onDiagnostic, base, run, complete, setMode: (value: string) => { mode = value }, advance: (ms: number) => { now += ms } }
}
describe('normal Smart Hints configuration → real service/Gemini adapter; fake transport', () => {
  it('starts off without key/env/HTTP; native key entry persists ciphertext and no secret DTO', async () => {
    const f = await fixture()
    expect(f.manager.snapshot()).toMatchObject({ enabled: false, hasKey: false, state: 'DISABLED', requestLimit: 20 })
    expect(f.send).not.toHaveBeenCalled()
    await f.manager.enable(true, () => {})
    expect(f.manager.snapshot().state).toBe('MISSING_KEY'); expect(f.manager.service.capabilities().enabled).toBe(false)
    const snapshot = await f.manager.configureKey(() => {})
    expect(snapshot.state).toBe('READY'); expect(f.manager.service.capabilities().enabled).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain(key)
    const stored = await readFile(f.options.file, 'utf8')
    expect(stored).not.toContain(key); expect(stored).not.toContain(Buffer.from(key).toString('base64'))
    expect(f.send).not.toHaveBeenCalled()
  })
  it('ordinary Hint/Analyze/Explain retain consent; selection Fix is disabled without a reservation', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    await f.manager.budget(6, () => {})
    for (const level of [1, 2, 3] as const) expect((await f.complete({ kind: 'HINT', level })).state).toBe('COMPLETE')
    await f.complete()
    const source = f.base.source
    await f.complete({ kind: 'EXPLAIN', selection: { text: source, startOffset: 0, endOffset: source.length, startLine: 1, startColumn: 1, endLine: 1, endColumn: source.length + 1 } })
    const at = source.indexOf('x;'), before = f.manager.snapshot().usedRequests
    const fix = await f.run(fixAction(source, at, at + 1))
    expect(fix.status).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(f.manager.snapshot().usedRequests).toBe(before)
    expect(f.manager.service.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(5)
  })
  it('source-free Check is one metadata GET and never spends budget', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    expect((await f.manager.checkConnection(() => {})).state).toBe('READY')
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.send.mock.calls[0][0].method).toBe('GET')
    expect(f.send.mock.calls[0][0].body).toBeNull(); expect(f.manager.snapshot().usedRequests).toBe(0)
  })
  it('budget3 survives toggle, key rotation and restart; fourth action sends no HTTP', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    await f.manager.budget(3, () => {})
    for (let i = 0; i < 3; i++) await f.complete()
    expect(f.manager.snapshot().state).toBe('LOCAL_BUDGET_EXHAUSTED')
    expect(f.manager.service.capabilities().enabled).toBe(false)
    await f.manager.enable(false, () => {}); await f.manager.enable(true, () => {}); await f.manager.configureKey(() => {})
    const r = await f.run(); await vi.waitFor(() => expect(f.manager.service.status(1, 'main-owned', r.ref)).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' }))
    expect(f.send.mock.calls.filter(([v]) => v.method === 'POST')).toHaveLength(3)
    await f.manager.stop()
    const reopened = new SmartHintsConfiguration(f.options); managers.push(reopened); await reopened.start()
    expect(reopened.snapshot()).toMatchObject({ requestLimit: 3, usedRequests: 3, state: 'LOCAL_BUDGET_EXHAUSTED' })
  })
  it.each([['429', 'GEMINI_RATE_LIMIT'], ['401', 'INVALID_KEY']] as const)('Check %s maps status, no POST or secret error body', async (mode, state) => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode(mode)
    expect((await f.manager.checkConnection(() => {})).state).toBe(state)
    expect(f.send).toHaveBeenCalledTimes(1)
  })
  it('disable while AI is pending aborts owned HTTP and never resets spent slots', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode('pending')
    await f.run(); await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
    const signal = f.send.mock.calls[0][0].signal
    await f.manager.enable(false, () => {})
    expect(signal.aborted).toBe(true); expect(f.manager.service.capabilities().enabled).toBe(false)
  })
  it('secure storage unavailable never asks for key; cancel enable never provisions', async () => {
    const f = await fixture(); f.encryption.available.mockResolvedValue(false)
    await expect(f.manager.configureKey(() => {})).rejects.toThrow()
    expect(f.promptKey).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
    f.confirm.mockResolvedValue(false); await f.manager.enable(true, () => {})
    expect(f.manager.snapshot().enabled).toBe(false)
  })
  it('cancellation after dispatch retains the durable slot; later enable does not re-grant it', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode('pending-post')
    await f.run(); await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
    await f.manager.enable(false, () => {})
    expect(f.send.mock.calls[1][0].signal.aborted).toBe(true)
    expect(f.manager.snapshot().usedRequests).toBe(1)
    await f.manager.enable(true, () => {}); expect(f.manager.snapshot().usedRequests).toBe(1)
  })
  it('source-free connection timeout aborts, does not spend inference and never retries', async () => {
    vi.useFakeTimers()
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode('pending')
    const checking = f.manager.checkConnection(() => {})
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(10001)
    expect((await checking).state).toBe('OFFLINE')
    expect(f.send.mock.calls[0][0].signal.aborted).toBe(true)
    expect(f.manager.snapshot().usedRequests).toBe(0)
    expect(f.send).toHaveBeenCalledTimes(1)
  })
  it.each(['pending', 'pending-post', 'pending-body-post'])('disabled Fix does not enter %s or create a deadline/reservation', async mode => {
    vi.useFakeTimers()
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode(mode)
    const at = f.base.source.indexOf('x;'), r = await f.run(fixAction(f.base.source, at, at + 1))
    expect(r.status).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    await vi.advanceTimersByTimeAsync(30001)
    expect(f.manager.service.status(1, 'main-owned', r.ref)).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(f.send).not.toHaveBeenCalled(); expect(f.onDiagnostic).not.toHaveBeenCalled()
    expect(f.manager.snapshot().usedRequests).toBe(0)
    await f.manager.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['ANALYZE', 'HINT', 'EXPLAIN'] as const)('normal %s still has10s, independent of Suggest Fix30s', async kind => {
    vi.useFakeTimers()
    const f = await fixture(true); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode('pending')
    const action: SmartAction = kind === 'HINT' ? { kind, level: 1 } : kind === 'EXPLAIN'
      ? { kind, selection: { text: f.base.source, startOffset: 0, endOffset: f.base.source.length, startLine: 1, startColumn: 1, endLine: 1, endColumn: f.base.source.length + 1 } } : { kind }
    const run = await f.run(action); await vi.advanceTimersByTimeAsync(10001)
    expect(f.manager.service.status(1, 'main-owned', run.ref)).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(f.onDiagnostic).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: kind, timeoutMs: 10000 }))
    expect(f.manager.snapshot().usedRequests).toBe(0)
  })
  it.each(['503-post', 'max-tokens', 'missing-json', 'safety', 'ok'])('disabled Fix never reaches legacy provider response %s or overwrites diagnostics', async mode => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode(mode)
    const at = f.base.source.indexOf('x;'), r = await f.run(fixAction(f.base.source, at, at + 1))
    expect(r.status).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    expect(f.send).not.toHaveBeenCalled(); expect(f.onDiagnostic).not.toHaveBeenCalled()
    expect(f.manager.snapshot().usedRequests).toBe(0)
    await expect(readFile(join(f.options.file, '..', 'smart-hints-last-suggest-fix.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const legacy = { ...f.base, requestId: randomUUID(), action: { kind: 'SUGGEST_FIX' } }
    expect(() => f.manager.service.prepare(1, 'main-owned', legacy as never, () => {}, async g => capture(f.base, g))).toThrow()
  })
  it('normal default permits a fourth inference; local minute throttle is separate and probes never spend', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    for (let i = 0; i < 6; i++) await f.complete()
    expect(f.manager.snapshot()).toMatchObject({ state: 'LOCAL_RATE_LIMIT', usedRequests: 6, remainingRequests: 14, retryAt: f.options.clock() + 60000 })
    for (let i = 0; i < 5; i++) { f.manager.snapshot(); f.manager.service.capabilities(); await f.manager.checkConnection(() => {}) }
    expect(f.manager.snapshot().usedRequests).toBe(6)
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(6)
    f.advance(60000); expect(f.manager.snapshot().state).toBe('READY')
    await f.complete(); expect(f.manager.snapshot().usedRequests).toBe(7)
  })
  it('migrates legacy3 without deleting ledger or granting requests; explicit daily limit change keeps all usage', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    for (let i = 0; i < 3; i++) await f.complete()
    await f.manager.stop()
    const stored = JSON.parse(await readFile(f.options.file, 'utf8'))
    await writeFile(f.options.file, JSON.stringify({ version: 1, enabled: true, encryptedKey: stored.encryptedKey, usedRequests: 3, requestLimit: 3 }))
    const original = await Promise.all([1, 2, 3].map(i => readFile(`${f.options.file}.usage/${i}.json`, 'utf8')))
    const reopened = new SmartHintsConfiguration(f.options); managers.push(reopened); await reopened.start()
    expect(reopened.snapshot()).toMatchObject({ needsLimitReview: true, usedRequests: 3, lifetimeRequests: 3, requestLimit: 3, remainingRequests: 0 })
    expect(reopened.service.capabilities().enabled).toBe(false)
    f.confirm.mockResolvedValueOnce(false); await reopened.budget(20, () => {})
    expect(reopened.snapshot().requestLimit).toBe(3)
    await reopened.budget(20, () => {})
    expect(reopened.snapshot()).toMatchObject({ needsLimitReview: false, usedRequests: 3, lifetimeRequests: 3, requestLimit: 20, remainingRequests: 17 })
    expect(await Promise.all([1, 2, 3].map(i => readFile(`${f.options.file}.usage/${i}.json`, 'utf8')))).toEqual(original)
    const count = f.send.mock.calls.length
    f.advance(86400000)
    expect(reopened.snapshot()).toMatchObject({ usedRequests: 0, lifetimeRequests: 3, remainingRequests: 20 })
    expect(await readdir(`${f.options.file}.usage`)).toHaveLength(3)
    expect(f.send).toHaveBeenCalledTimes(count)
  })
  it('Google daily quota observation survives metadata checks, toggles and local budget changes; no auto retry', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); f.setMode('daily429')
    const r = await f.run()
    await vi.waitFor(() => expect(f.manager.service.status(1, 'main-owned', r.ref).state).toBe('FAILED'))
    expect(f.manager.snapshot()).toMatchObject({ state: 'GEMINI_QUOTA_EXHAUSTED', usedRequests: 1, retryAt: f.options.clock() + 60000 })
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    f.setMode('ok'); await f.manager.checkConnection(() => {}); await f.manager.budget(30, () => {})
    await f.manager.enable(false, () => {}); await f.manager.enable(true, () => {})
    expect(f.manager.snapshot()).toMatchObject({ state: 'GEMINI_QUOTA_EXHAUSTED', usedRequests: 1 })
    expect(f.manager.service.capabilities().enabled).toBe(false)
    const reopened = new SmartHintsConfiguration(f.options); managers.push(reopened); await reopened.start()
    expect(reopened.snapshot()).toMatchObject({ state: 'GEMINI_QUOTA_EXHAUSTED', usedRequests: 1, retryAt: f.options.clock() + 60000 })
    await reopened.stop()
    f.advance(60000)
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    await f.complete(); expect(f.manager.snapshot()).toMatchObject({ state: 'READY', usedRequests: 2 })
  })
  it('30/hour local throttle stays separate from the configured daily budget', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); await f.manager.budget(100, () => {})
    const beginning = f.options.clock()
    for (let group = 0; group < 5; group++) {
      for (let i = 0; i < 6; i++) await f.complete()
      f.advance(60000)
    }
    expect(f.manager.snapshot()).toMatchObject({ state: 'LOCAL_RATE_LIMIT', usedRequests: 30, remainingRequests: 70, retryAt: beginning + 3600000 })
    f.advance(3600000)
    expect(f.manager.snapshot()).toMatchObject({ state: 'READY', usedRequests: 30, remainingRequests: 70 })
  })
  it('lowering the daily cap does not refund reservations, and UTC rollover retains lifetime slots', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    for (let i = 0; i < 4; i++) await f.complete()
    await f.manager.budget(2, () => {})
    expect(f.manager.snapshot()).toMatchObject({ usedRequests: 4, lifetimeRequests: 4, remainingRequests: 0, state: 'LOCAL_BUDGET_EXHAUSTED' })
    f.advance(86400000)
    await f.complete()
    expect(f.manager.snapshot()).toMatchObject({ usedRequests: 1, lifetimeRequests: 5, remainingRequests: 1 })
    expect(await readdir(`${f.options.file}.usage`)).toHaveLength(5)
  })
  it('missing historical reservations fail closed without inventing usage or deleting surviving evidence', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); await f.complete()
    await f.manager.stop()
    const stored = JSON.parse(await readFile(f.options.file, 'utf8')); stored.usedRequests = 2
    await writeFile(f.options.file, JSON.stringify(stored))
    const reopened = new SmartHintsConfiguration(f.options); managers.push(reopened); await reopened.start()
    expect(reopened.snapshot()).toMatchObject({ state: 'ERROR', usedRequests: 1, lifetimeRequests: 2 })
    expect(reopened.service.capabilities().enabled).toBe(false)
    await expect(reopened.budget(20, () => {})).rejects.toThrow(/usage records are invalid/)
    expect(await readdir(`${f.options.file}.usage`)).toEqual(['1.json'])
  })
  it('a fake consumer and Smart Hints use the same durable daily ledger without double reservation', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {}); await f.manager.budget(2, () => {})
    const controller = new AbortController(), admitted = f.manager.coordinator.admit({ signal: controller.signal,
      deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
    if (!admitted.ok) throw Error(admitted.code)
    try {
      const first = admitted.admission.reserveInference(controller.signal)
      expect(admitted.admission.reserveInference(controller.signal)).toBe(first)
      await first
      expect(f.manager.snapshot()).toMatchObject({ usedRequests: 1, lifetimeRequests: 1 })
      expect(await readdir(`${f.options.file}.usage`)).toEqual(['1.json'])
    } finally { admitted.admission.release(); await f.manager.coordinator.drain() }
    await f.complete()
    expect(f.manager.snapshot()).toMatchObject({ usedRequests: 2, lifetimeRequests: 2, state: 'LOCAL_BUDGET_EXHAUSTED' })
    const next = f.manager.coordinator.admit({ signal: controller.signal, deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
    if (!next.ok) throw Error(next.code)
    try { await expect(next.admission.reserveInference(controller.signal)).rejects.toMatchObject({ code: 'RATE_LIMIT' }) }
    finally { next.admission.release(); await f.manager.coordinator.drain() }
    expect(await readdir(`${f.options.file}.usage`)).toEqual(['1.json', '2.json'])
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
  })
  it('shared reservation I/O failure is fail-closed, counted once and never dispatches inference', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    // A file where the usage directory should be makes trusted ledger I/O fail.
    await writeFile(`${f.options.file}.usage`, 'synthetic locked usage location')
    const controller = new AbortController(), admitted = f.manager.coordinator.admit({ signal: controller.signal,
      deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
    if (!admitted.ok) throw Error(admitted.code)
    try {
      const first = admitted.admission.reserveInference(controller.signal)
      await expect(first).rejects.toMatchObject({ code: 'PROVIDER', providerFailureSource: 'RESERVATION_IO_ERROR' })
      expect(admitted.admission.reserveInference(controller.signal)).toBe(first)
      await expect(first).rejects.toMatchObject({ code: 'PROVIDER' })
      expect(f.manager.snapshot()).toMatchObject({ state: 'ERROR', usedRequests: 1, lifetimeRequests: 1 })
    } finally { admitted.admission.release(); await f.manager.coordinator.drain() }
    const r = await f.run()
    await vi.waitFor(() => expect(f.manager.service.status(1, 'main-owned', r.ref).state).toBe('FAILED'))
    expect(f.manager.snapshot().usedRequests).toBe(1); expect(f.send).not.toHaveBeenCalled()
  })
  it('disabling configuration cancels another consumer and waits for its cleanup', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    const controller = new AbortController(), admitted = f.manager.coordinator.admit({ signal: controller.signal,
      deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
    if (!admitted.ok) throw Error(admitted.code)
    let disabled = false
    const pending = f.manager.enable(false, () => {}).then(() => { disabled = true })
    try {
      await vi.waitFor(() => expect(controller.signal.aborted).toBe(true))
      expect(disabled).toBe(false)
      expect(f.manager.coordinator.admit({ signal: new AbortController().signal, deadline: f.options.clock() + 10000, cancel() {} })).toEqual({ ok: false, code: 'BUSY' })
    } finally { admitted.admission.release() }
    await pending
    expect(f.manager.snapshot()).toMatchObject({ enabled: false, usedRequests: 0 })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('interleaved fake consumer and Smart Hints share the six-per-minute window', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    for (let i = 0; i < 6; i++) {
      if (i % 2) { await f.complete(); continue }
      const controller = new AbortController(), admitted = f.manager.coordinator.admit({ signal: controller.signal,
        deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
      if (!admitted.ok) throw Error(admitted.code)
      try { await admitted.admission.reserveInference(controller.signal) }
      finally { admitted.admission.release(); await f.manager.coordinator.drain() }
    }
    expect(f.manager.snapshot()).toMatchObject({ state: 'LOCAL_RATE_LIMIT', usedRequests: 6, retryAt: f.options.clock() + 60000 })
    expect((await f.run()).status).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(3)
  })
  it('duplicate Smart Hints Start ACKs spend exactly one durable reservation and one POST', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    const q = { ...f.base, requestId: randomUUID() }
    const p = await f.manager.service.prepare(1, 'main-owned', q, () => {}, async g => capture(q, g))
    const first = f.manager.service.start(1, 'main-owned', start(p))
    expect(f.manager.service.start(1, 'main-owned', start(p))).toEqual(first)
    await vi.waitFor(() => expect(f.manager.service.status(1, 'main-owned', reference(p)).state).toBe('COMPLETE'))
    expect(f.manager.snapshot()).toMatchObject({ usedRequests: 1, lifetimeRequests: 1 })
    expect(await readdir(`${f.options.file}.usage`)).toEqual(['1.json'])
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
  })
  it('configuration shutdown seals shared admission and joins another consumer cleanup', async () => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    const controller = new AbortController(), admitted = f.manager.coordinator.admit({ signal: controller.signal,
      deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
    if (!admitted.ok) throw Error(admitted.code)
    let stopped = false
    const pending = f.manager.stop().then(() => { stopped = true })
    try {
      await vi.waitFor(() => expect(controller.signal.aborted).toBe(true))
      expect(stopped).toBe(false)
      expect(f.manager.coordinator.admit({ signal: new AbortController().signal, deadline: f.options.clock() + 10000, cancel() {} })).toEqual({ ok: false, code: 'TIMEOUT' })
    } finally { admitted.admission.release() }
    await pending
    expect(stopped).toBe(true); expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'timeout'])('normal Gemini %s after dispatch does not refund daily quota and releases admission after abort settles', async mode => {
    const f = await fixture(); await f.manager.configureKey(() => {}); await f.manager.enable(true, () => {})
    vi.useFakeTimers()
    try {
      f.setMode('pending-post')
      const r = await f.run()
      await vi.waitFor(() => expect(f.send.mock.calls.some(([request]) => request.method === 'POST')).toBe(true))
      if (mode === 'cancel') f.manager.service.cancel(1, 'main-owned', r.ref)
      else { f.advance(10000); await vi.advanceTimersByTimeAsync(10000) }
      await f.manager.coordinator.drain()
      expect(f.manager.service.status(1, 'main-owned', r.ref)).toMatchObject(mode === 'cancel'
        ? { state: 'CANCELLED' } : { state: 'FAILED', code: 'TIMEOUT' })
      expect(f.send.mock.calls.find(([request]) => request.method === 'POST')![0].signal.aborted).toBe(true)
      expect(f.manager.snapshot()).toMatchObject({ usedRequests: 1, lifetimeRequests: 1 })
      expect(await readdir(`${f.options.file}.usage`)).toEqual(['1.json'])
      expect(f.send.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1)
      const controller = new AbortController(), next = f.manager.coordinator.admit({ signal: controller.signal,
        deadline: f.options.clock() + 10000, cancel: () => controller.abort() })
      expect(next.ok).toBe(true)
      if (next.ok) next.admission.release()
    } finally { vi.useRealTimers() }
  })
})
