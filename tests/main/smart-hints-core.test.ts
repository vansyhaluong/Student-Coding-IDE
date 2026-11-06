import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { FakeDeepSeekAdapter, type SmartProvider } from '../../src/main/services/learning/smart-hints/adapter'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { isSmartStatus } from '../../src/shared/contracts/smart-hints-validation'
import { request, capture, output, registry, start, reference, response, fixAction } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
afterEach(async () => { for (const s of services.splice(0)) await s.stop(); vi.useRealTimers() })
function fixture(provider?: SmartProvider) {
  const run = vi.fn<SmartProvider['run']>().mockResolvedValue(output)
  const service = new SmartHintsService(provider ?? { mode: 'FAKE', run }); services.push(service)
  const check = vi.fn(), q = request(), take = vi.fn(async (generation: number) => capture(q, generation))
  return { service, run, check, q, take, prepare: () => service.prepare(1, 'document', q, check, take) }
}
describe('SH-1 operation lifecycle, fake integration and no mutation authority', () => {
  it('SH-3 Apply capability is fake-only and closes immediately at shutdown without a request', () => {
    const f = fixture()
    expect(f.service.capabilities()).toEqual({ enabled: true, providerMode: 'FAKE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(f.run).not.toHaveBeenCalled()
    f.service.beginShutdown()
    expect(f.service.capabilities()).toEqual({ enabled: false, providerMode: 'DISABLED', applyEnabled: false, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(f.run).not.toHaveBeenCalled()
  })
  it('public capture → explicit consent → one fake DeepSeek call, duplicate/lost ACK status', async () => {
    const r = registry(), q = request(), send = vi.fn(async (req: Request) => {
      expect(r.pinned).toBe(false); expect(req.url).toBe('https://api.deepseek.com/chat/completions')
      const wire = await req.text(); expect(wire).not.toMatch(/HIDDEN_CANARY|PRIVATE_|comparator|signatureHash|testSetId/)
      return response()
    })
    const service = new SmartHintsService(new FakeDeepSeekAdapter({ send }, { authorization: () => 'Bearer synthetic-sh-secret', clear() {} })); services.push(service)
    const take = vi.fn((generation: number, check: () => void) => captureSmartHints(r.packages, q, generation, check))
    const a = await service.prepare(1, 'document', q, () => {}, take), b = await service.prepare(1, 'document', q, () => {}, take)
    expect(b).toEqual(a); expect(send).not.toHaveBeenCalled(); expect(take).toHaveBeenCalledOnce()
    service.start(1, 'document', start(a)); service.start(1, 'document', start(a))
    await vi.waitFor(() => expect(service.status(1, 'document', reference(a)).state).toBe('COMPLETE'))
    const complete = service.status(1, 'document', reference(a)); expect(isSmartStatus(complete)).toBe(true)
    expect(service.start(1, 'document', start(a))).toEqual(complete); expect(send).toHaveBeenCalledOnce()
    expect(JSON.stringify(complete)).not.toMatch(/synthetic-sh-secret|function solve|HIDDEN_CANARY|PRIVATE_|stdout|stderr/)
  })
  it('unconfigured production capability fails closed even with consent', async () => {
    const s = new SmartHintsService(); services.push(s)
    expect(s.capabilities()).toEqual({ enabled: false, providerMode: 'DISABLED', applyEnabled: false, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    const q = request(), p = await s.prepare(1, 's', q, () => {}, async g => capture(q, g))
    expect(s.start(1, 's', start(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
  })
  it('rejects missing consent, wrong owner/scope/ref/token without calling provider', async () => {
    const f = fixture(), p = await f.prepare()
    for (const patch of [{ consentGranted: false }, { consentVersion: 2 }, { captureToken: randomUUID() }, { operationId: randomUUID() }]) {
      expect(() => f.service.start(1, 'document', { ...start(p), ...patch } as never)).toThrow()
    }
    expect(() => f.service.start(2, 'document', start(p))).toThrow()
    expect(() => f.service.start(1, 'other', start(p))).toThrow(); expect(f.run).not.toHaveBeenCalled()
  })
  it('same requestId with different source is rejected; old id cannot run after replacement', async () => {
    const f = fixture(), p = await f.prepare()
    expect(() => f.service.prepare(1, 'document', { ...f.q, source: 'changed' }, f.check, f.take)).toThrow()
    const q = request(), next = await f.service.prepare(1, 'document', q, f.check, async g => capture(q, g))
    expect(next.operationId).not.toBe(p.operationId)
    expect(() => f.service.start(1, 'document', start(p))).toThrow()
    expect(() => f.service.prepare(1, 'document', f.q, f.check, f.take)).toThrow()
  })
  it('cancel/retire abort pending provider and ignore late output', async () => {
    const f = fixture(), g = gate<unknown>(); f.run.mockImplementationOnce((_c, _h, signal) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve(output), { once: true }); void g.promise.then(resolve)
    }))
    const p = await f.prepare(); f.service.start(1, 'document', start(p)); await vi.waitFor(() => expect(f.run).toHaveBeenCalledOnce())
    f.service.retireContext(1, 'document', { clientContextId: f.q.clientContextId, reason: 'EDIT' })
    expect(f.run.mock.calls[0][2].aborted).toBe(true); g.resolve(output)
    await Promise.resolve(); expect(f.service.status(1, 'document', reference(p)).state).toBe('CANCELLED')
    expect(() => f.service.prepare(1, 'document', { ...f.q, requestId: randomUUID() }, f.check, f.take)).toThrow()
  })
  it('context guard revocation drops result and clears owner state', async () => {
    const f = fixture(), p = await f.prepare(); f.check.mockImplementation(() => { throw Error('PRIVATE_PATH') })
    expect(() => f.service.start(1, 'document', start(p))).toThrow(); expect(f.run).not.toHaveBeenCalled()
  })
  it('prepared TTL expires, duplicate start never revives expired capture', async () => {
    vi.useFakeTimers(); const f = fixture(), p = await f.prepare()
    await vi.advanceTimersByTimeAsync(60001)
    expect(f.service.start(1, 'document', start(p)).state).toBe('EXPIRED'); expect(f.run).not.toHaveBeenCalled()
  })
  it('provider timeout aborts operation; result TTL discards detail', async () => {
    vi.useFakeTimers(); const f = fixture()
    f.run.mockImplementationOnce((_c, _h, signal) => new Promise(resolve => signal.addEventListener('abort', () => resolve(output))))
    const p = await f.prepare(); f.service.start(1, 'document', start(p)); await vi.advanceTimersByTimeAsync(10001)
    expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    const q = request(), next = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
    f.service.start(1, 'document', start(next)); await vi.advanceTimersByTimeAsync(1)
    expect(f.service.status(1, 'document', reference(next)).state).toBe('COMPLETE')
    await vi.advanceTimersByTimeAsync(300001)
    const expired = f.service.status(1, 'document', reference(next)); expect(expired.state).toBe('EXPIRED'); expect(expired).not.toHaveProperty('output')
  })
  it('wall-clock deadline is checked after provider, even before the timer callback runs', async () => {
    let now = 1
    const s = new SmartHintsService({ mode: 'FAKE', run: async () => { now += 10001; return output } }, () => now); services.push(s)
    const q = request(), p = await s.prepare(1, 's', q, () => {}, async g => capture(q, g))
    s.start(1, 's', start(p))
    await vi.waitFor(() => expect(s.status(1, 's', reference(p))).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' }))
  })
  it('global concurrency denies second owner without adding a request', async () => {
    const f = fixture(), g = gate<unknown>(); f.run.mockReturnValueOnce(g.promise)
    const a = await f.prepare(); f.service.start(1, 'document', start(a))
    const q = request(), b = await f.service.prepare(2, 'other', q, () => {}, async g => capture(q, g))
    expect(f.service.start(2, 'other', start(b))).toMatchObject({ state: 'FAILED', code: 'BUSY' })
    g.resolve(output); await vi.waitFor(() => expect(f.service.status(1, 'document', reference(a)).state).toBe('COMPLETE'))
    expect(f.run).toHaveBeenCalledOnce()
  })
  it('rate quota admits six starts/minute; next token is spent without send', async () => {
    const f = fixture()
    for (let i = 0; i < 7; i++) {
      const q = request(), p = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
      const status = f.service.start(1, 'document', start(p))
      if (i === 6) expect(status).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
      else await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    }
    expect(f.run).toHaveBeenCalledTimes(6)
  })
  it('hour quota reserves maximum output permits, without refunds/retries after cancellation', async () => {
    vi.useFakeTimers(); const f = fixture()
    for (let i = 0; i < 31; i++) {
      const q = request(), p = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
      const s = f.service.start(1, 'document', start(p))
      if (i === 30) expect(s).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' })
      else {
        await vi.advanceTimersByTimeAsync(1)
        expect(f.service.status(1, 'document', reference(p)).state).toBe('COMPLETE')
        f.service.cancel(1, 'document', reference(p))
        await vi.advanceTimersByTimeAsync(60000)
      }
    }
    expect(f.run).toHaveBeenCalledTimes(30)
  })
  it('empty code and read-only Solution explanation use separate valid actions without Run', async () => {
    const f = fixture(), empty = request({ language: 'csharp', source: '' })
    const p = await f.service.prepare(1, 'document', empty, () => {}, async g => capture(empty, g))
    f.service.start(1, 'document', start(p)); await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    const q = request({ source: 'abc', language: 'javascript', origin: { kind: 'SOLUTION', blockId: randomUUID() },
      action: { kind: 'EXPLAIN', selection: { startOffset: 0, endOffset: 3, text: 'abc', startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 } } })
    f.run.mockResolvedValueOnce({ kind: 'EXPLANATION', syntax: 'Cú pháp.', variables: 'Biến.', controlFlow: 'Luồng.', algorithm: 'Ý tưởng.', illustrativeExamples: ['Ví dụ minh họa.'] })
    const s = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g)); f.service.start(1, 'document', start(s))
    await vi.waitFor(() => expect(f.service.status(1, 'document', reference(s)).state).toBe('COMPLETE'))
    expect(JSON.stringify(f.service.status(1, 'document', reference(s)))).not.toContain('"text":"abc"')
    expect(f.run.mock.calls[0][0].source).toBe(''); expect(f.run.mock.calls[1][0].binding.origin.kind).toBe('SOLUTION')
  })
  it('progressive levels require earlier success; reset source starts L1, duplicate hint fails', async () => {
    const f = fixture(), base = request({ action: { kind: 'HINT', level: 1 } })
    const hint = (level: 1 | 2 | 3, text: string) => ({ kind: 'HINT', level, paragraphs: [text], nextQuestion: 'Bạn nghĩ sao?', evidence: [] })
    expect(() => f.service.prepare(1, 'document', { ...base, action: { kind: 'HINT', level: 3 } }, () => {}, async g => capture(base, g))).toThrow()
    for (const level of [1, 2, 3] as const) {
      const q = { ...base, requestId: randomUUID(), action: { kind: 'HINT' as const, level } }
      f.run.mockResolvedValueOnce(hint(level, `Cấp ${level}`))
      const p = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g)); f.service.start(1, 'document', start(p))
      await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    }
    expect(f.run.mock.calls[2][1]).toEqual(['Cấp 1', 'Cấp 2'])
    const q = { ...base, requestId: randomUUID(), action: { kind: 'HINT' as const, level: 3 as const } }
    f.run.mockResolvedValueOnce(hint(3, 'Cấp 3'))
    const p = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g)); f.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'DUPLICATE_HINT' }))
    expect(() => f.service.prepare(1, 'document', { ...q, requestId: randomUUID(), sourceRevision: 2 }, () => {}, async g => capture(q, g))).toThrow()
  })
  it.each([{ ...output, private: 'HIDDEN_CANARY' }, { ...output, evidence: ['R9'] }, { kind: 'EDIT_PROPOSAL', edits: [], rationale: 'x', evidence: [] }])('invalid provider output %# cannot publish', async result => {
    const f = fixture(); f.run.mockResolvedValueOnce(result)
    const p = await f.prepare(); f.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
  })
  it('D6-2 focused target is bound to operation but cannot dispatch the incomplete pipeline', async () => {
    const f = fixture(), q = request({ action: fixAction() }), at = q.source.indexOf('x;')
    f.run.mockResolvedValueOnce({ kind: 'EDIT_PROPOSAL', edits: [{ startOffset: at, endOffset: at + 1, expectedOldText: 'x', replacementText: 'x + 1', rationale: 'Đối chiếu yêu cầu.' }], rationale: 'Thay đổi nhỏ.', evidence: [] })
    const p = await f.service.prepare(1, 'document', q, () => {}, async g => capture(q, g)); f.service.start(1, 'document', start(p))
    expect(f.service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'UNCONFIGURED' })
    const s = f.service.status(1, 'document', reference(p)); expect(isSmartStatus(s)).toBe(true)
    expect(s).not.toHaveProperty('proposalId'); expect(f.run).not.toHaveBeenCalled()
    expect(q.source).toContain('return x;'); expect(f.service.capabilities().applyEnabled).toBe(true)
  })
})
