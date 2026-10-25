import { describe, expect, it } from 'vitest'
import { parseExecutionJson } from '../../src/shared/contracts/execution-json'
import { parseJavascriptHarnessResponse } from '../../src/shared/contracts/javascript-execution-validation'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'

const schema = { parameterTypes: [], returnType: 'int32' as const, sampleCount: 21 }
const response = '{"protocolVersion":1,"caseIndex":20,"outcome":"RETURNED","actual":3,"stdout":"","stderr":""}'
describe('existing strict protocol JSON kernel extraction', () => {
  it('parses the same v1 document with strict UTF8 and retains JS mapping', () => {
    expect(parseExecutionJson(new TextEncoder().encode(response))).toEqual(JSON.parse(response))
    expect(parseJavascriptHarnessResponse(response, schema, 20, 0)).toEqual({ ok: true, value: JSON.parse(response) })
    expect(parseJavascriptHarnessResponse(response, schema, 20, 1).ok).toBe(false)
  })
  it.each([
    '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"outer":{"x":1,"x":2}}',
    '{} {}', '{} trailing', '\ufeff{}', '{"a":}', '[1,]', '"\ud800"',
    '['.repeat(13) + '0' + ']'.repeat(13), ' '.repeat(EXERCISE_LIMITS.outputBytes + 1),
  ])('rejects duplicate/grammar/unicode/depth/size violations (%#)', text => {
    expect(() => parseExecutionJson(text)).toThrow()
    expect(parseJavascriptHarnessResponse(text, schema, 20, 0).ok).toBe(false)
  })
  it('rejects malformed UTF8 without replacement decoding', () => {
    const bad = new Uint8Array([0x22, 0xc3, 0x28, 0x22])
    expect(() => parseExecutionJson(bad)).toThrow()
    expect(parseJavascriptHarnessResponse(bad, schema, 20, 0).ok).toBe(false)
  })
  it('keeps depth boundary, whitespace, escaped strings and equal keys in separate objects', () => {
    for (const text of ['['.repeat(12) + '0' + ']'.repeat(12), ' \n ' + JSON.stringify({ a: [{ x: 1 }, { x: 2 }], b: '"' }) + ' \r\t']) expect(parseExecutionJson(text)).toEqual(JSON.parse(text))
  })
})
