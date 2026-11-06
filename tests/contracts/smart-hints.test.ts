import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { validateSmartPrepare, validateSmartStart, isSmartOutput, smartCandidate, isSmartStatus, smartPosition, isSmartCapabilities, isSmartBinding } from '../../src/shared/contracts/smart-hints-validation'
import { request, capture, output, source, fixAction } from '../fixtures/learning/smart-hints'

describe('SH-1 exact request, output and UTF-16 edit contracts', () => {
  it.each(['csharp', 'javascript'] as const)('accepts %s empty/incomplete source', language => {
    for (const code of ['', 'function (', source]) expect(validateSmartPrepare(request({ language, source: code })).ok).toBe(true)
  })
  it.each(['apiKey', 'endpoint', 'model', 'prompt', 'official', 'owner', 'path', 'diagnostic'])('rejects unknown %s before dispatch', field => {
    expect(validateSmartPrepare({ ...request(), [field]: 'HIDDEN_CANARY' }).ok).toBe(false)
  })
  it.each(['\ud800', '\0', '🐟'.repeat(5000)])('rejects malformed/oversized text %j', source => {
    expect(validateSmartPrepare(request({ source })).ok).toBe(false)
  })
  it('requires exact multiline selection including CRLF and UTF-16 columns', () => {
    const source = 'a🐟\r\nbc', q = request({ source, origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'CRLF' },
      action: { kind: 'EXPLAIN', selection: { startOffset: 1, endOffset: 6, text: source.slice(1, 6), startLine: 1, startColumn: 2, endLine: 2, endColumn: 2 } } })
    expect(validateSmartPrepare(q).ok).toBe(true)
    if (q.action.kind !== 'EXPLAIN') throw Error()
    for (const patch of [{ text: 'wrong' }, { startOffset: 2 }, { endOffset: 4 }, { endLine: 1 }]) {
      expect(validateSmartPrepare({ ...q, action: { kind: 'EXPLAIN', selection: { ...q.action.selection, ...patch } } }).ok).toBe(false)
    }
    expect(smartPosition(source, 6)).toEqual({ line: 2, column: 2 })
  })
  it('empty/single-line CRLF model preserves explicit EOL binding', () => {
    for (const source of ['', 'abc']) expect(validateSmartPrepare(request({ source,
      origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'CRLF' } })).ok).toBe(true)
    const edits = [{ startOffset: 1, endOffset: 2, expectedOldText: 'b', replacementText: 'b\r\nx', rationale: 'Minh họa.' }]
    expect(smartCandidate('abc', edits, 'CRLF')).toBe('ab\r\nxc')
    expect(smartCandidate('abc', edits, 'LF')).toBeUndefined()
  })
  it('Solution has separate read-only origin/language and no Run or Fix capability', () => {
    const q = request({ language: 'csharp', source: 'abc', origin: { kind: 'SOLUTION', blockId: randomUUID() },
      action: { kind: 'EXPLAIN', selection: { startOffset: 0, endOffset: 3, text: 'abc', startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 } } })
    expect(validateSmartPrepare(q).ok).toBe(true)
    expect(validateSmartPrepare({ ...q, action: { kind: 'SUGGEST_FIX' } }).ok).toBe(false)
    expect(validateSmartPrepare({ ...q, run: { sessionId: `exercise_${randomUUID()}`, generation: 1, sequence: 1 } }).ok).toBe(false)
    expect(JSON.stringify(capture(q).binding)).not.toContain('"text"')
  })
  it('strict consent and unknown fields are rejected', () => {
    const q = { requestId: randomUUID(), operationId: randomUUID(), captureToken: randomUUID(), consentVersion: 1, consentGranted: true }
    expect(validateSmartStart(q).ok).toBe(true)
    for (const patch of [{ consentGranted: false }, { consentVersion: 2 }, { key: 'secret' }]) expect(validateSmartStart({ ...q, ...patch }).ok).toBe(false)
  })
  const edit = { startOffset: source.indexOf('x;'), endOffset: source.indexOf('x;') + 1, expectedOldText: 'x', replacementText: 'x + 1', rationale: 'Đối chiếu yêu cầu.' }
  it('computes focused candidate on exact base, not a text search', () => {
    expect(smartCandidate(source, [edit])).toBe(source.replace('return x;', 'return x + 1;'))
    expect(isSmartOutput({ kind: 'EDIT_PROPOSAL', edits: [edit], rationale: 'Sửa nhỏ.', evidence: [] }, { kind: 'SUGGEST_FIX' }, source, [])).toBe(true)
  })
  it.each([
    [{ ...edit, expectedOldText: 'z' }], [{ ...edit, startOffset: -1 }], [{ ...edit, endOffset: 999 }], [edit, edit],
    [{ ...edit, startOffset: 0, endOffset: source.length, expectedOldText: source }],
    [{ ...edit, replacementText: 'a'.repeat(17000) }], [{ ...edit, replacementText: '\n'.repeat(201) }],
    [edit, { ...edit, startOffset: edit.endOffset, endOffset: edit.endOffset, expectedOldText: '', replacementText: '!' }],
  ].map(edits => ({ edits })))('rejects invalid/overlapping/oversized/full-file edits %#', ({ edits }) => expect(smartCandidate(source, edits)).toBeUndefined())
  it('supports multiple base ranges, rejects split surrogate/EOL and wrong newline', () => {
    const text = '🐟\r\na = b;\r\n', x = { ...edit, startOffset: 8, endOffset: 9, expectedOldText: 'b', replacementText: 'c' }
    expect(smartCandidate(text, [x])).toBe('🐟\r\na = c;\r\n')
    expect(smartCandidate(text, [{ ...x, startOffset: 1, endOffset: 2, expectedOldText: text.slice(1, 2) }])).toBeUndefined()
    expect(smartCandidate(text, [{ ...x, startOffset: 2, endOffset: 3, expectedOldText: '\r' }])).toBeUndefined()
    expect(smartCandidate(text, [{ ...x, replacementText: 'c\n' }])).toBeUndefined()
    expect(smartCandidate(source, [edit, { ...edit, startOffset: 0, endOffset: 0, expectedOldText: '', replacementText: '// hi\n' }])).toContain('// hi\n')
  })
  it('rejects wrong action/evidence/private response fields and malformed status', () => {
    expect(isSmartOutput(output, { kind: 'HINT', level: 1 })).toBe(false)
    expect(isSmartOutput({ ...output, evidence: ['HIDDEN_CASE_1'] })).toBe(false)
    expect(isSmartOutput({ ...output, evidence: ['R1'] }, { kind: 'ANALYZE' }, source, [])).toBe(false)
    expect(isSmartOutput({ ...output, actual: 'HIDDEN_CANARY' })).toBe(false)
    expect(isSmartStatus({ state: 'COMPLETE', output })).toBe(false)
  })
  it('rejects sparse or property-bearing advisory arrays', () => {
    expect(isSmartOutput({ ...output, hypotheses: new Array(2) })).toBe(false)
    const hypotheses = Object.assign(['text'], { private: 'HIDDEN_CANARY' })
    expect(isSmartOutput({ ...output, hypotheses })).toBe(false)
  })
})

describe('D6-2 required exact selection and strict capability migration', () => {
  it.each(['\n', '\r\n'])('binds duplicate text by UTF-16 offsets with %j, not the first occurrence', eol => {
    const source = ['// 😀', 'return x;', 'return x;', '// tail'].join(eol), at = source.lastIndexOf('return')
    const q = request({ source, action: fixAction(source, at, at + 9),
      origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 2, eol: eol === '\n' ? 'LF' : 'CRLF' } })
    expect(validateSmartPrepare(q).ok).toBe(true)
    const b = capture(q).binding
    expect(isSmartBinding(b)).toBe(true); expect(b.action).toMatchObject({ kind: 'SUGGEST_FIX', selection: { startOffset: at, startLine: 3 } })
    expect(b.action).not.toHaveProperty('selection.text')
    if (q.action.kind !== 'SUGGEST_FIX') throw Error()
    for (const patch of [{ text: 'return y;' }, { startOffset: at + .5 }, { endOffset: source.length + 1 },
      { startLine: 2 }, { endColumn: 100 }, { endOffset: at }, { startOffset: -1 }])
      expect(validateSmartPrepare({ ...q, action: { ...q.action, selection: { ...q.action.selection, ...patch } } }).ok).toBe(false)
    for (const bad of [{ kind: 'SUGGEST_FIX' }, { kind: 'SUGGEST_FIX', selection: [] },
      fixAction(source, 0, source.length), fixAction(source, 4, 5), fixAction(source, 2, 3)])
      expect(validateSmartPrepare({ ...q, action: bad }).ok).toBe(false)
    if (eol === '\r\n') expect(validateSmartPrepare({ ...q, action: fixAction(source, 1, source.indexOf('\n')) }).ok).toBe(false)
    expect(isSmartBinding({ ...b, action: { kind: 'SUGGEST_FIX' } })).toBe(false)
    expect(isSmartBinding({ ...b, action: { ...b.action, selection: { ...('selection' in b.action ? b.action.selection : {}), text: 'private' } } })).toBe(false)
  })
  it('rejects blank, oversize, source-only/full-source and non-Practice targets while Explain retains whole-source support', () => {
    for (const code of [' ', 'x'.repeat(8193) + ';', 'x'.repeat(16385)]) {
      const q = request({ source: code, action: fixAction(code, 0, code.length - (code.length > 8193 ? 1 : 0)) })
      expect(validateSmartPrepare(q).ok).toBe(false)
    }
    const q = request({ action: fixAction(source, 0, source.length) })
    expect(validateSmartPrepare(q).ok).toBe(false)
    if (q.action.kind !== 'SUGGEST_FIX') throw Error()
    expect(validateSmartPrepare({ ...q, action: { ...q.action, kind: 'EXPLAIN' } }).ok).toBe(true)
    expect(validateSmartPrepare({ ...q, action: fixAction(), origin: { kind: 'SOLUTION', blockId: randomUUID() } }).ok).toBe(false)
  })
  const cap = { enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] }
  it('allows only dense unique canonical language lists with coherent modes; rejects legacy/mixed capabilities', () => {
    expect(isSmartCapabilities(cap)).toBe(true)
    for (const langs of [['csharp'], ['javascript'], ['csharp', 'javascript']])
      expect(isSmartCapabilities({ ...cap, suggestFixMode: 'SELECTION_V1', suggestFixLanguages: langs })).toBe(true)
    for (const patch of [{ suggestFixMode: 'LEGACY' }, { suggestFixLanguages: ['javascript'] }, { suggestFixMode: 'SELECTION_V1' },
      { suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['javascript', 'csharp'] },
      { suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['csharp', 'csharp'] },
      { suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['python'] },
      { suggestFixMode: 'SELECTION_V1', suggestFixLanguages: new Array(1) },
      { enabled: false, applyEnabled: false, providerMode: 'DISABLED', suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['csharp'] }])
      expect(isSmartCapabilities({ ...cap, ...patch })).toBe(false)
    expect(isSmartCapabilities({ enabled: true, providerMode: 'FAKE', applyEnabled: true, consentVersion: 1 })).toBe(false)
  })
})
