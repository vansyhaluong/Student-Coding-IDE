import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { isSmartOutput, isSmartStatus, validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'
import { geminiResponseSchema } from '../../src/main/services/learning/smart-hints/gemini-schema'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { chatIpcFixture, chatEnvelope } from '../fixtures/learning/chat-ipc'
import { request, capture, start, reference } from '../fixtures/learning/smart-hints'

const hint = (language: 'csharp' | 'javascript' = 'javascript') => ({ kind: 'HINT' as const,
  thinking: 'Compare the required output with the input.', steps: ['Use x from the public signature.', 'Return x plus one.'],
  code: { language, text: 'return x + 1;' }, evidence: [] })
const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('C4-D unified Hint', () => {
  it.each(['cancel', 'timeout', 'stale'] as const)('%s retires Hint and ignores a late complete response', async mode => {
    vi.useFakeTimers()
    let release!: (output: unknown) => void
    const run = vi.fn(() => new Promise(resolve => { release = resolve }))
    const service = new SmartHintsService({ mode: 'FAKE', run })
    try {
      const q = request({ action: { kind: 'HINT' } })
      const p = await service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
      service.start(1, 'doc', start(p)); await vi.advanceTimersByTimeAsync(0)
      expect(run).toHaveBeenCalledOnce()
      if (mode === 'timeout') await vi.advanceTimersByTimeAsync(10000)
      else if (mode === 'cancel') service.cancel(1, 'doc', reference(p))
      else service.retireContext(1, 'doc', { clientContextId: q.clientContextId, reason: 'EDIT' })
      const state = service.status(1, 'doc', reference(p))
      expect(state.state).toBe(mode === 'timeout' ? 'FAILED' : 'CANCELLED')
      if (mode === 'timeout') expect(state).toMatchObject({ code: 'TIMEOUT' })
      release(hint()); await vi.advanceTimersByTimeAsync(0)
      expect(service.status(1, 'doc', reference(p))).toEqual(state)
      expect(run).toHaveBeenCalledOnce()
    } finally { await service.stop() }
  })
  it.each(['csharp', 'javascript'] as const)('%s binds language, normalizes all legacy levels and defines three separate sections', language => {
    for (const level of [undefined, 1, 2, 3]) {
      const action = level === undefined ? { kind: 'HINT' } : { kind: 'HINT', level }
      const q = validateSmartPrepare(request({ language, action: action as { kind: 'HINT' } }))
      expect(q.ok && q.value.action).toEqual({ kind: 'HINT' })
    }
    expect(validateSmartPrepare(request({ action: { kind: 'HINT', level: 4 } as never })).ok).toBe(false)
    const schema = geminiResponseSchema(capture(request({ language, action: { kind: 'HINT' } })))
    expect(schema.required).toEqual(['kind', 'thinking', 'steps', 'code', 'evidence'])
    expect(isSmartOutput(hint(language), { kind: 'HINT' }, undefined, [], undefined, language)).toBe(true)
  })
  it.each([
    { ...hint(), thinking: '' }, { ...hint(), steps: [] }, { ...hint(), steps: ['  '] },
    { ...hint(), code: { language: 'javascript', text: ' ' } },
    { ...hint(), code: { language: 'python', text: 'return x + 1' } },
    { ...hint(), code: { language: 'csharp', text: 'return x + 1;' } },
    { ...hint(), code: { language: 'javascript', text: 'public int Solve(int x) { return x; }' } },
    { ...hint(), code: { language: 'javascript', text: '```javascript\nreturn x;\n```' } },
    { kind: 'HINT', level: 3, paragraphs: ['Old'], nextQuestion: 'Next?', evidence: [] },
    ...['thinking', 'steps', 'code'].map(key => Object.fromEntries(Object.entries(hint()).filter(([k]) => k !== key))),
    { ...hint(), applyGrant: 'forged' },
  ])('rejects incomplete/legacy/foreign/extra output %#', output => {
    expect(isSmartOutput(output, { kind: 'HINT' }, undefined, [], undefined, 'javascript')).toBe(false)
  })
  it('rejects JavaScript syntax mislabeled as C# but allows comments and string literals', () => {
    expect(isSmartOutput({ ...hint('csharp'), code: { language: 'csharp', text: 'function solve(x) { return x; }' } }, { kind: 'HINT' }, undefined, [], undefined, 'csharp')).toBe(false)
    expect(isSmartOutput({ ...hint('csharp'), code: { language: 'csharp', text: '// function is a word\nreturn "let x = 1";' } }, { kind: 'HINT' }, undefined, [], undefined, 'csharp')).toBe(true)
  })
  it.each([
    { ...hint(), thinking: '' }, { ...hint(), steps: [] },
    { ...hint(), code: { language: 'csharp', text: 'return x + 1;' } },
    { ...hint(), code: { language: 'javascript', text: 'public int Solve(int x) { return x; }' } },
  ])('Main rejects invalid Hint %# after exactly one dispatched/reserved inference', async output => {
    vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
    const f = await chatIpcFixture(); fixtures.push(f)
    const original = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? original(r) : Response.json(chatEnvelope(output)))
    const q = request({ action: { kind: 'HINT' } })
    const p = await f.config.service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
    f.config.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.config.service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    expect(f.config.snapshot().usedRequests).toBe(1)
  })
  it.each(['csharp', 'javascript'] as const)('%s one consented action, duplicate start => one POST/reservation, no Hint replay', async language => {
    vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
    const f = await chatIpcFixture(); fixtures.push(f)
    const original = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? original(r) : Response.json(chatEnvelope(hint(language))))
    const q = request({ language, action: { kind: 'HINT', level: 3 } })
    const p = await f.config.service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
    expect(f.send).not.toHaveBeenCalled()
    expect(p.binding.action).toEqual({ kind: 'HINT' })
    f.config.service.start(1, 'document', start(p)); f.config.service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(f.config.service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    const result = f.config.service.status(1, 'document', reference(p))
    expect(isSmartStatus(result)).toBe(true); expect(result).toMatchObject({ output: hint(language), proposalId: null })
    const posts = f.send.mock.calls.filter(([r]) => r.method === 'POST')
    expect(posts).toHaveLength(1); expect(f.config.snapshot().usedRequests).toBe(1)
    const wire = await posts[0][0].clone().json(), input = JSON.parse(wire.contents[0].parts[0].text)
    expect(input.action).toEqual({ kind: 'HINT' }); expect(input.previousHints).toEqual([])
    expect(wire.systemInstruction.parts[0].text).toContain('code MUST be the last teaching section')
    const next = { ...q, requestId: randomUUID(), action: { kind: 'HINT' as const } }
    const second = await f.config.service.prepare(1, 'document', next, () => {}, async g => capture(next, g))
    f.config.service.start(1, 'document', start(second))
    await vi.waitFor(() => expect(f.config.service.status(1, 'document', reference(second)).state).toBe('COMPLETE'))
    const last = await f.send.mock.calls.filter(([r]) => r.method === 'POST').at(-1)![0].clone().json()
    expect(JSON.parse(last.contents[0].parts[0].text).previousHints).toEqual([])
    expect(f.config.snapshot().usedRequests).toBe(2)
  })
})
