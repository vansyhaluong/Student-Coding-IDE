import { beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import type { SmartCapture } from '../../src/main/services/learning/smart-hints/capture'
import { capture, request } from '../fixtures/learning/smart-hints'
import { smartPosition } from '../../src/shared/contracts/smart-hints-validation'
import type { SmartSelection } from '../../src/shared/contracts/smart-hints'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import { performance } from 'node:perf_hooks'

let parser: MainSelectionFixGuard
beforeAll(async () => {
  const sdk = await new SelectionFixCsharpSdkResolver().resolve({ signal: new AbortController().signal, deadline: performance.now() + 15000 })
  if (sdk.state !== 'AVAILABLE') throw Error('Pinned real C# SDK required')
  parser = new MainSelectionFixGuard({ assetDirectory: resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/main/smart-hints-parser'), sdkResolver: { resolve: async () => sdk } })
}, 20000)
const scope = () => ({ signal: new AbortController().signal, clock: Date.now, deadline: Date.now() + 15000, check() {} })
const selection = (source: string, start: number, end = start): SmartSelection => {
  const a = smartPosition(source, start), b = smartPosition(source, end)
  return { startOffset: start, endOffset: end, text: source.slice(start, end), startLine: a.line, startColumn: a.column, endLine: b.line, endColumn: b.column }
}
function sample(language: 'csharp' | 'javascript', kind: 'loop' | 'logic' | 'syntax'): SmartCapture {
  const loop = kind === 'loop', parameters = loop ? [{ name: 'n', type: 'int32' }] : [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }]
  const name = loop ? 'SumToN' : 'Sum'
  const wrap = (body: string) => language === 'csharp'
    ? `public class Solution { public int ${name}(${loop ? 'int n' : 'int a, int b'}) {\n${body}\n} }`
    : `function ${name}(${loop ? 'n' : 'a, b'}) {\n${body}\n}`
  const body = loop ? `${language === 'csharp' ? 'int' : 'let'} sum = 0;\nfor (${language === 'csharp' ? 'int' : 'let'} i = 1; i <= n; i++) {\n    // Chưa cộng dồn\n}\nreturn sum;`
    : kind === 'syntax' ? 'return a + ;' : 'return a;'
  const source = wrap(body)
  return { ...capture(request({ language, source, action: { kind: 'HINT' } })),
    signature: { functionName: name, parameters, returnType: 'int32' }, hintTemplate: wrap(''), hintImplementation: 'HAS_IMPLEMENTATION' }
}
describe.each(['csharp', 'javascript'] as const)('F4 real %s Hint parser', language => {
  it('A/D classifies written loop and inserts at its nested caret without replacing the loop', async () => {
    const c = sample(language, 'loop'), at = c.source.indexOf('{', c.source.indexOf('for (')) + 1
    expect(await parser.classifyHint(c, scope())).toBe('HAS_IMPLEMENTATION')
    const edit = await parser.prepareHintApply(c, 'sum += i;', selection(c.source, at), scope())
    expect(edit.start).toBe(at); expect(edit.end).toBe(at)
    expect(c.source.slice(0, edit.start) + edit.replacementText + c.source.slice(edit.end)).toContain('for (')
  })
  it('A/D infers only one safe empty loop block when no explicit target was supplied', async () => {
    const c = sample(language, 'loop')
    const edit = await parser.prepareHintApply(c, 'sum += i;', null, scope())
    expect(edit.start).toBe(edit.end)
    expect(edit.start).toBeGreaterThan(c.source.indexOf('for ('))
    expect(edit.start).toBeLessThan(c.source.indexOf('//'))
  })
  it('B/D replaces an explicit return statement', async () => {
    const c = sample(language, 'logic'), at = c.source.indexOf('return')
    const edit = await parser.prepareHintApply(c, 'return a + b;', selection(c.source, at, at + 'return a;'.length), scope())
    expect(c.source.slice(0, edit.start) + edit.replacementText + c.source.slice(edit.end)).toBe(c.source.replace('return a;', 'return a + b;'))
  })
  it.each(['start', 'end'] as const)('B/D resolves a return-boundary caret at %s as a statement replacement, never duplicate returns', async boundary => {
    const c = sample(language, 'logic'), at = c.source.indexOf('return') + (boundary === 'end' ? 'return a;'.length : 0)
    const edit = await parser.prepareHintApply(c, 'return a + b;', selection(c.source, at), scope())
    expect(c.source.slice(0, edit.start) + edit.replacementText + c.source.slice(edit.end)).toBe(c.source.replace('return a;', 'return a + b;'))
  })
  it('C/D keeps syntax-uncertain source out of Hint Apply authority', async () => {
    expect(await parser.classifyHint(sample(language, 'syntax'), scope())).toBe('UNCERTAIN')
  })
  it('requires an explicit target when two lexical empty loop blocks fit', async () => {
    const c = sample(language, 'loop'), loop = c.source.slice(c.source.indexOf('for ('), c.source.indexOf('return sum'))
    c.source = c.source.replace('return sum;', loop + 'return sum;')
    await expect(parser.prepareHintApply(c, 'sum += i;', null, scope())).rejects.toMatchObject({ failure: { stage: 'TARGET', reason: 'TARGET_INVALID' } })
    const at = c.source.indexOf('{', c.source.indexOf('for (')) + 1
    expect((await parser.prepareHintApply(c, 'sum += i;', selection(c.source, at), scope())).start).toBe(at)
  })
  it('rejects a token-interior caret and a nonempty header selection', async () => {
    const c = sample(language, 'logic'), at = c.source.indexOf('return') + 2
    for (const target of [selection(c.source, at), selection(c.source, 0, 6)])
      await expect(parser.prepareHintApply(c, 'return a + b;', target, scope())).rejects.toMatchObject({ failure: { stage: 'TARGET', reason: 'TARGET_INVALID' } })
  })
  it('rejects full-function and foreign-language candidates, preserving the source', async () => {
    const c = sample(language, 'logic'), at = c.source.indexOf('return'), source = c.source
    for (const code of [c.source.replace('return a;', 'return a + b;'), language === 'csharp' ? 'function Sum(a,b) { return a+b; }' : 'public int Sum(int a,int b) { return a+b; }'])
      await expect(parser.prepareHintApply(c, code, selection(c.source, at, at + 9), scope())).rejects.toMatchObject({ failure: { reason: 'CANDIDATE_INVALID' } })
    expect(c.source).toBe(source)
  })
  it('preserves adjacent statements and permits a verified multi-statement range', async () => {
    const c = sample(language, 'logic'), decl = language === 'csharp' ? 'int' : 'let'
    c.source = c.source.replace('return a;', `${decl} x = a;\n${decl} y = b;\nreturn x + y;`)
    const at = c.source.indexOf(`${decl} x`), end = c.source.indexOf('return x') - 1
    const edit = await parser.prepareHintApply(c, `${decl} x = a;\n${decl} y = b + 1;`, selection(c.source, at, end), scope())
    expect(c.source.slice(0, edit.start) + edit.replacementText + c.source.slice(edit.end)).toContain('return x + y;')
  })
  it('keeps CRLF, braces, loop header and declaration byte-identical outside insertion', async () => {
    const c = sample(language, 'loop'); c.source = c.source.replaceAll('\n', '\r\n'); c.hintTemplate = c.hintTemplate!.replaceAll('\n', '\r\n')
    const edit = await parser.prepareHintApply(c, 'sum += i;', null, scope())
    expect(edit.start).toBe(edit.end)
    const candidate = c.source.slice(0, edit.start) + edit.replacementText + c.source.slice(edit.end)
    expect(candidate.replace(edit.replacementText, '')).toBe(c.source)
  })
  it('never replaces the selected loop with the suggested accumulation fragment', async () => {
    const c = sample(language, 'loop'), at = c.source.indexOf('for ('), end = c.source.indexOf('return sum') - 1
    await expect(parser.prepareHintApply(c, 'sum += i;', selection(c.source, at, end), scope())).rejects.toMatchObject({ failure: { reason: 'TARGET_INVALID', stage: 'TARGET' } })
  })
})
