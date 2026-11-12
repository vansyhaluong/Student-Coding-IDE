import { afterEach, describe, expect, it, vi } from 'vitest'
import { constructDetection } from '../../src/main/services/learning/smart-hints/detection'
import { isDetection, isDetectionWire } from '../../src/shared/contracts/smart-detection'
import { isSmartOutput, validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'
import { GeminiSmartHintsAdapter, GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-provider'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { SmartProviderError } from '../../src/main/services/learning/smart-hints/adapter'
import { request, capture, start, reference, registry, publicData, snapshot } from '../fixtures/learning/smart-hints'
import type { SmartCapture } from '../../src/main/services/learning/smart-hints/capture'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { createPublicRunReceipt, publicRunPackage, sourceFingerprint } from '../../src/main/services/learning/smart-hints/public-run-receipt'

const services: SmartHintsService[] = []
afterEach(async () => { for (const s of services.splice(0)) await s.stop(); vi.useRealTimers() })
function issue(source: string, quote = 'return a;') {
  const startOffset = source.indexOf(quote)
  return { type: 'logic' as const, severity: 'warning' as const, message: 'Có thể bỏ sót b', explanation: 'Hàm đang trả về a.',
    reason: 'Đề bài yêu cầu tổng hai số.', impact: 'Kết quả có thể sai khi b khác 0.', guidance: 'Đối chiếu biểu thức với hai tham số.', evidence: [],
    range: { startOffset, endOffset: startOffset + quote.length, quote } }
}
function detectionRequest(language: 'csharp' | 'javascript', syntax = false, eol = '\n') {
  const source = (language === 'csharp' ? 'public class Solution {\npublic int Sum(int a,int b) {\nreturn a;\n}\n}'
    : 'function Sum(a,b) {\nreturn a;\n}').replace('return a;', syntax ? 'return a + ;' : 'return a;').replaceAll('\n', eol)
  return request({ source, language, action: { kind: 'DETECT_ISSUES' },
    origin: { kind: 'PRACTICE', modelId: crypto.randomUUID(), modelVersion: 1, eol: eol === '\n' ? 'LF' : 'CRLF' } })
}
for (const language of ['csharp', 'javascript'] as const) describe(`F5 ${language}`, () => {
  it.each(['\n', '\r\n'])('no-selection source/task/schema go through actual Gemini adapter (%j)', async eol => {
    const q = detectionRequest(language, false, eol), c = capture(q), finding = issue(q.source)
    const wire = { kind: 'DETECTION', issues: [{ ...finding, range: { ...finding.range, startOffset: 0, endOffset: 1 } }] }
    const send = vi.fn(async (r: Request) => r.method === 'GET'
      ? Response.json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
      : Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(wire) }] } }] }))
    const adapter = new GeminiSmartHintsAdapter({ send }, { value: () => 'synthetic-f5-key-only', clear() {} })
    try {
      expect(validateSmartPrepare(q).ok).toBe(true)
      const output = constructDetection(c, await adapter.run(c, [], new AbortController().signal))
      expect(output.issues[0]).toMatchObject({ provenance: 'AI_INFERENCE', verification: 'SUSPECTED', locationStatus: 'LOCATED' })
      expect(output.issues[0].range).toEqual(finding.range)
      expect(isSmartOutput(output, q.action, q.source, [])).toBe(true)
      const body = await send.mock.calls[1][0].clone().json(), input = JSON.parse(body.contents[0].parts[0].text)
      expect(input.source).toBe(q.source); expect(input.publicStatement).toBe(c.statement)
      expect(input.action).toEqual({ kind: 'DETECT_ISSUES' })
      expect(body.generationConfig.responseJsonSchema.properties.kind.enum).toEqual(['DETECTION'])
      expect(body.systemInstruction.parts[0].text).toContain('No replacementText')
      expect(JSON.stringify(input)).not.toContain('synthetic-f5-key-only')
    } finally { adapter.dispose() }
  })
  it('syntax-invalid source remains eligible without selection parser or edit authority', async () => {
    const q = detectionRequest(language, true), finding = issue(q.source, 'return a + ;')
    const wire = { kind: 'DETECTION', issues: [{ ...finding, type: 'syntax', range: { ...finding.range, startOffset: 0, endOffset: 1 } }] }
    const run = vi.fn(async () => wire), service = new SmartHintsService({ mode: 'FAKE', run }); services.push(service)
    const p = await service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
    expect(run).not.toHaveBeenCalled()
    service.start(1, 'document', start(p))
    await vi.waitFor(() => expect(service.status(1, 'document', reference(p)).state).toBe('COMPLETE'))
    expect(service.status(1, 'document', reference(p))).toMatchObject({ proposalId: null, output: { kind: 'DETECTION', issues: [{ type: 'syntax', verification: 'SUSPECTED', locationStatus: 'LOCATED', range: finding.range }] } })
    expect(() => service.start(2, 'document', start(p))).toThrow()
    expect(q.source).toContain('return a + ;')
  })
  it('many distinct lines and empty result validate without inventing issues', () => {
    const q = detectionRequest(language), c = capture(q)
    const a = issue(q.source), b = issue(q.source, language === 'csharp' ? 'public int Sum' : 'function Sum')
    const output = constructDetection(c, { kind: 'DETECTION', issues: [a, b] })
    expect(output.issues[0].id).not.toBe(output.issues[1].id)
    expect(output.issues[0].range?.startOffset).not.toBe(output.issues[1].range?.startOffset)
    expect(constructDetection(c, { kind: 'DETECTION', issues: [] }).issues).toEqual([])
  })
  it.each(['wrong quote', 'unknown'])('never marks an AI %s location', mode => {
    const q = detectionRequest(language), i = issue(q.source)
    const range = mode === 'wrong quote' ? { ...i.range, quote: 'return a+b;' } : null
    const output = constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...i, range }] })
    expect(output.issues[0].range).toBeNull(); expect(isDetection(output, q.source)).toBe(true)
  })
  it('resolves out-of-source AI offsets only through a unique exact quote', () => {
    const q = detectionRequest(language), original = issue(q.source)
    const wire = { kind: 'DETECTION', issues: [{ ...original, range: { ...original.range, startOffset: q.source.length + 20, endOffset: q.source.length + 21 } }] }
    const output = constructDetection(capture(q), wire)
    expect(output.issues[0]).toMatchObject({ range: original.range, locationStatus: 'LOCATED', verification: 'SUSPECTED' })
    expect(isDetection(output, q.source)).toBe(true)
    expect(wire.issues[0].range.startOffset).toBe(q.source.length + 20)
  })
  it('preserves an exact valid reported range when its quote occurs more than once', () => {
    const base = detectionRequest(language), source = base.source.replace('return a;', 'return a;\nreturn a;')
    const q = { ...base, source }, finding = issue(source), at = source.lastIndexOf('return a;')
    const range = { quote: 'return a;', startOffset: at, endOffset: at + 'return a;'.length }
    const output = constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...finding, range }] })
    expect(output.issues[0]).toMatchObject({ range, locationStatus: 'LOCATED' })
  })
  it('wrong actions, forged verification/edits, duplicate IDs and fabricated evidence fail closed', () => {
    const q = detectionRequest(language), c = capture(q), i = issue(q.source)
    for (const bad of [{ kind: 'EDIT_PROPOSAL', edits: [] }, { kind: 'DETECTION', issues: [{ ...i, verification: 'TOOL_CONFIRMED' }] },
      { kind: 'DETECTION', issues: [{ ...i, evidence: ['R1'] }] }, { kind: 'DETECTION', issues: Array(9).fill(i) }]) {
      expect(isDetectionWire(bad, [])).toBe(false); expect(() => constructDetection(c, bad)).toThrow()
    }
    const output = constructDetection(c, { kind: 'DETECTION', issues: [i] })
    expect(isDetection({ ...output, issues: [output.issues[0], output.issues[0]] })).toBe(false)
    expect(isSmartOutput(output, { kind: 'ANALYZE' }, q.source)).toBe(false)
    expect(isSmartOutput(output, { kind: 'SUGGEST_FIX' }, q.source)).toBe(false)
  })
  it('Run evidence supports reasoning but never upgrades AI inference into tool-confirmed cause', () => {
    const q = detectionRequest(language), c = capture(q)
    c.runContext = { kind: 'RUN_PUBLIC', failure: 'COMPILE_ERROR', locations: [{ line: 2, column: 1 }],
      parameterTypes: ['int32'], returnType: 'int32', observations: [{ evidenceId: 'R1', sampleOrdinal: 1, input: [1], actual: 1, expected: 2 }] }
    const output = constructDetection(c, { kind: 'DETECTION', issues: [{ ...issue(q.source), evidence: ['R1'] }] })
    expect(output.issues[0].verification).toBe('SUSPECTED'); expect(c.runContext.failure).toBe('COMPILE_ERROR')
  })
  it('only the matching trusted Run receipt joins the full-source capture; no hidden data', async () => {
    const q = detectionRequest(language), data = publicData(), r = registry(data), run = snapshot(language)
    const receipt = createPublicRunReceipt(sourceFingerprint(q.source), run, publicRunPackage(data))!
    expect(receipt).toBeDefined()
    q.run = { sessionId: receipt.sessionId, generation: receipt.generation, sequence: receipt.sequence }
    const c = await captureSmartHints(r.packages, q, 1, () => {}, receipt)
    expect(c.runContext.kind).toBe('RUN_PUBLIC'); expect(c.statement).toBe(data.metadata.statement)
    expect(JSON.stringify(c.runContext)).not.toMatch(/HIDDEN_CANARY|PRIVATE_PATH|stdout|stderr/)
    const changed = { ...q, sourceRevision: q.sourceRevision + 1 }
    expect((await captureSmartHints(r.packages, changed, 1, () => {}, receipt)).runContext.kind).toBe('CODE_ONLY')
  })
})
it.each([
  ['repeated', 'return a;\nreturn a;', 'return a;'],
  ['overlapping', 'aaaa', 'aaa'],
  ['missing', 'return a;', 'return b;'],
  ['whitespace', 'return a;', 'return  a;'],
  ['case', 'return a;', 'Return a;'],
  ['newlines', 'before\r\nreturn a;', 'before\nreturn a;'],
  ['CRLF split', 'before\r\nreturn a;', '\nreturn a;'],
])('unique-quote localization leaves %s quotes unlocated', (_name, source, quote) => {
  const q = request({ source, action: { kind: 'DETECT_ISSUES' }, origin: { kind: 'PRACTICE', modelId: crypto.randomUUID(), modelVersion: 1, eol: source.includes('\r\n') ? 'CRLF' : 'LF' } })
  const i = issue(source, quote)
  const output = constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...i, range: { quote, startOffset: 0, endOffset: 1 } }] })
  expect(output.issues[0]).toMatchObject({ range: null, locationStatus: 'INVALID_AI_RANGE', verification: 'SUSPECTED' })
  expect(isDetection(output, source)).toBe(true)
})
it('unique exact quotes resolve correct UTF-16 offsets after emoji and CRLF', () => {
  const source = '// 😀\r\nreturn a;', q = request({ source, action: { kind: 'DETECT_ISSUES' }, origin: { kind: 'PRACTICE', modelId: crypto.randomUUID(), modelVersion: 1, eol: 'CRLF' } })
  const i = issue(source)
  const output = constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...i, range: { ...i.range, startOffset: 1, endOffset: 2 } }] })
  expect(output.issues[0].range).toEqual({ quote: 'return a;', startOffset: 7, endOffset: source.length })
})
it('F5 range validation rejects CRLF/surrogate splits and malformed sparse issue arrays', () => {
  const q = request({ source: '// 😀\r\nreturn a;', action: { kind: 'DETECT_ISSUES' }, origin: { kind: 'PRACTICE', modelId: crypto.randomUUID(), modelVersion: 1, eol: 'CRLF' } })
  const base = issue(q.source)
  for (const range of [{ startOffset: 4, endOffset: 5, quote: '\ude00' }, { startOffset: 6, endOffset: 8, quote: '\n' }]) {
    expect(() => constructDetection(capture(q), { kind: 'DETECTION', issues: [{ ...base, range }] })).toThrow()
  }
  expect(isDetectionWire({ kind: 'DETECTION', issues: new Array(2) })).toBe(false)
})
it.each(['cancel', 'timeout', 'invalid response', 'stale'] as const)('F5 %s retains no proposal and ignores late results', async mode => {
  const q = detectionRequest('javascript')
  const run = mode === 'invalid response' ? vi.fn(async () => ({ kind: 'DETECTION', issues: [{ bogus: true }] }))
    : vi.fn((_c: SmartCapture, _h: readonly string[], signal: AbortSignal) => new Promise((_yes, no) => signal.addEventListener('abort', () => no(new SmartProviderError('TIMEOUT')), { once: true })))
  const service = new SmartHintsService({ mode: 'FAKE', run }); services.push(service)
  const p = await service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
  if (mode === 'timeout') vi.useFakeTimers()
  service.start(1, 'document', start(p)); await Promise.resolve()
  if (mode === 'cancel') service.cancel(1, 'document', reference(p))
  if (mode === 'stale') service.retireContext(1, 'document', { clientContextId: q.clientContextId, reason: 'EDIT' })
  if (mode === 'timeout') await vi.advanceTimersByTimeAsync(10001)
  if (mode === 'stale') expect(service.status(1, 'document', reference(p))).toMatchObject({ state: 'CANCELLED' })
  else if (mode === 'invalid response') await vi.waitFor(() => expect(service.status(1, 'document', reference(p))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }))
  else expect(service.status(1, 'document', reference(p)).state).toBe(mode === 'cancel' ? 'CANCELLED' : 'FAILED')
})
