import { describe, expect, it, vi } from 'vitest'
import { parseBoundedPackageJson } from '../../src/main/services/learning/content/bounded-package-json'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'

const bytes = (s: string): Uint8Array => Buffer.from(s, 'utf8')
const parse = (s: string) => parseBoundedPackageJson(bytes(s))
const limit = { ok: false, code: 'PACKAGE_STRUCTURE_LIMIT' }

describe('Package byte parser: bounded pre-scan before whole-document materialization', () => {
  it('parses detached JSON with strict grammar and decoded keys', () => {
    expect(parse(' {"a":[true,null,-1.25e+3,"\\uD83D\\uDE00"]} \n')).toEqual({ ok: true, value: { a: [true, null, -1250, '😀'] } })
    const input = bytes('{"a":1}'), result = parseBoundedPackageJson(input)
    input.fill(0)
    expect(result).toEqual({ ok: true, value: { a: 1 } })
  })
  it.each(['', 'undefined', 'NaN', 'Infinity', '1e309', '01', '1.', '+1', '{}{}', '[1,]', '{"a":1,}',
    '{a:1}', '{"a" 1}', 'truefalse', '"\n"', '"\\x41"', '"\\u12"', '"\\uD800"', '"\\uDC00"',
    '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"constructor":1}', '{"prototype":1}']) (
    'rejects malformed/ambiguous JSON without content-bearing diagnostics: %s', s => {
      expect(parse(s)).toEqual({ ok: false, code: 'PACKAGE_JSON_INVALID' })
    },
  )
  it('rejects invalid UTF-8, BOM and oversized input before JSON.parse', () => {
    const spy = vi.spyOn(JSON, 'parse')
    try {
      for (const b of [Buffer.from([0xff]), Buffer.from([0xef, 0xbb, 0xbf, 0x30])]) {
        expect(parseBoundedPackageJson(b)).toEqual({ ok: false, code: 'PACKAGE_JSON_INVALID' })
      }
      expect(parseBoundedPackageJson(new Uint8Array(P.jsonBytes + 1))).toEqual({ ok: false, code: 'PACKAGE_ASSET_LIMIT' })
      expect(parse('['.repeat(13) + '0' + ']'.repeat(13))).toEqual(limit)
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
  it('honors exact raw byte caps including whitespace and an asset-specific cap', () => {
    for (const count of [P.jsonBytes - 1, P.jsonBytes]) expect(parse('0' + ' '.repeat(count - 1)).ok).toBe(true)
    expect(parseBoundedPackageJson(bytes('0 '), 1)).toEqual({ ok: false, code: 'PACKAGE_ASSET_LIMIT' })
  })
  it('counts root depth zero and limits numeric tokens before conversion', () => {
    for (const n of [11, 12]) expect(parse('['.repeat(n) + '0' + ']'.repeat(n)).ok).toBe(true)
    expect(parse('['.repeat(13) + '0' + ']'.repeat(13))).toEqual(limit)
    expect(parse('0.' + '0'.repeat(61) + '1').ok).toBe(true)
    expect(parse('0.' + '0'.repeat(62) + '1')).toEqual(limit)
  })
  it('bounds decoded keys/strings, not just raw escape lengths', () => {
    for (const n of [63, 64]) expect(parse(`{"${'a'.repeat(n)}":0}`).ok).toBe(true)
    expect(parse(`{"${'a'.repeat(65)}":0}`)).toEqual(limit)
    for (const n of [P.generalStringUnits - 1, P.generalStringUnits]) expect(parse(`"${'a'.repeat(n)}"`).ok).toBe(true)
    expect(parse(`"${'a'.repeat(P.generalStringUnits + 1)}"`)).toEqual(limit)
    expect(parse('"' + '\\u0061'.repeat(P.generalStringUnits) + '"').ok).toBe(true)
  })
  it('bounds per-object properties and per-array elements independently', () => {
    const obj = (n: number) => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => ['k' + i, 0])))
    expect(parse(obj(31)).ok).toBe(true); expect(parse(obj(32)).ok).toBe(true); expect(parse(obj(33))).toEqual(limit)
    for (const n of [P.arrayElements - 1, P.arrayElements]) expect(parse(JSON.stringify(Array(n).fill(0))).ok).toBe(true)
    expect(parse(JSON.stringify(Array(P.arrayElements + 1).fill(0)))).toEqual(limit)
  })
  it('bounds aggregate properties and nodes before full parse', () => {
    const obj = Object.fromEntries(Array.from({ length: 32 }, (_, i) => ['k' + i, 0]))
    const properties = Array.from({ length: 3125 }, () => obj)
    expect(parse(JSON.stringify(properties)).ok).toBe(true) // exactly100,000
    expect(parse(JSON.stringify([...properties, { extra: 0 }]))).toEqual(limit)
    // root1 + four arrays4 + leaves199,995 =200,000 nodes
    const nodes = [Array(50_000).fill(0), Array(50_000).fill(0), Array(50_000).fill(0), Array(49_995).fill(0)]
    expect(parse(JSON.stringify(nodes)).ok).toBe(true)
    nodes[3].push(0); expect(parse(JSON.stringify(nodes))).toEqual(limit)
  })
})
