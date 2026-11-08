import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import { captureSmartHints, type SmartCapture } from '../../src/main/services/learning/smart-hints/capture'
import type { HintImplementationState } from '../../src/main/services/learning/smart-hints/hint-context'
import type { CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import { request, registry, start, reference } from '../fixtures/learning/smart-hints'
import { chatIpcFixture, chatEnvelope } from '../fixtures/learning/chat-ipc'
import { validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'

const assets = resolve('out/hint-context/main/smart-hints-parser')
const languages = ['csharp', 'javascript'] as const
type Language = typeof languages[number]
let sdk: CsharpSdkSelection
let parser: MainSelectionFixGuard
const scope = (signal = new AbortController().signal) => ({ signal, clock: Date.now, deadline: Date.now() + 30000, check() {} })
const starter = (language: Language) => language === 'csharp'
  ? 'public class Solution { public int solve(int x) { // TODO\n throw new System.NotImplementedException(); } }'
  : 'function solve(x) { // TODO\n throw new Error("Chưa triển khai"); }'
const body = (language: Language, statements: string) => language === 'csharp'
  ? `public class Solution { public int solve(int x) { ${statements} } }`
  : `function solve(x) { ${statements} }`
async function captured(language: Language, source: string) {
  const q = request({ language, source, action: { kind: 'HINT' } }), pkg = registry()
  pkg.data.starters[language] = starter(language)
  const c = await captureSmartHints(pkg.packages, q, 1, () => {})
  expect(pkg.release).toHaveBeenCalledOnce()
  return { q, c, pkg }
}
const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
beforeAll(async () => {
  // Required real parsers; missing SDK/assets fail, never silently skip acceptance.
  expect(JSON.parse(await readFile(resolve(assets, 'manifest.json'), 'utf8')).typescript).toBe('6.0.3')
  const resolved = await new SelectionFixCsharpSdkResolver().resolve({ signal: new AbortController().signal, deadline: performance.now() + 15000 })
  if (resolved.state !== 'AVAILABLE') throw Error('Pinned C# SDK required for Hint context tests')
  sdk = resolved.selection
  parser = new MainSelectionFixGuard({ assetDirectory: assets, sdkResolver: { resolve: async () => ({ state: 'AVAILABLE', selection: sdk }) } })
}, 20000)
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe.each(languages)('%s context-aware Hint with real parsers', language => {
  const cases: [string, string, HintImplementationState][] = [
    ['trusted starter', starter(language), 'NO_IMPLEMENTATION'],
    ['blank editor', '', 'NO_IMPLEMENTATION'],
    ['comment only', '// student notes, no executable logic\n', 'NO_IMPLEMENTATION'],
    ['empty required function', body(language, ''), 'NO_IMPLEMENTATION'],
    ['signature only', language === 'csharp' ? 'public class Solution { public int solve(int x); }' : 'function solve(x);', 'NO_IMPLEMENTATION'],
    ['bare required signature', language === 'csharp' ? 'public int solve(int x)' : 'function solve(x)', 'NO_IMPLEMENTATION'],
    ['different comments/whitespace/empty statement', body(language, '/* new plan */\n ; // TODO\n'), 'NO_IMPLEMENTATION'],
    ['nested empty scaffolding', body(language, '{ /* TODO */ ; }'), 'NO_IMPLEMENTATION'],
    ['different placeholder', body(language, language === 'csharp' ? 'throw new NotImplementedException();' : 'throw new Error("TODO");'), 'NO_IMPLEMENTATION'],
    ['partial implementation', body(language, language === 'csharp' ? 'int result = x;' : 'const result = x;'), 'HAS_IMPLEMENTATION'],
    ['logic mistake', body(language, 'return x - 1;'), 'HAS_IMPLEMENTATION'],
    ['complete implementation', body(language, 'return x + 1;'), 'HAS_IMPLEMENTATION'],
    ['comment-looking string is code', body(language, language === 'csharp' ? 'string note = "// TODO"; return x;' : 'const note = "// TODO"; return x;'), 'HAS_IMPLEMENTATION'],
    ['broken syntax', body(language, 'return x + ;'), 'UNCERTAIN'],
    ['wrong required signature', body(language, 'return x;').replace('solve', 'other'), 'UNCERTAIN'],
    ['ambiguous extra function', body(language, 'return x;') + (language === 'csharp' ? '\npublic class Extra {}' : '\nfunction extra() {}'), 'UNCERTAIN'],
    ['unterminated comment', '/* unfinished', 'UNCERTAIN'],
  ]
  it.each(cases)('%s -> %s', async (_label, source, expected) => {
    const { c } = await captured(language, source)
    expect(await parser.classifyHint(c, scope())).toBe(expected)
  }, 15000)
  it('uses installed exercise starter/signature and ignores comment-only changes', async () => {
    const source = await readFile(resolve(`resources/learning/exercises/ch2-04/starters/${language}.txt`), 'utf8')
    const { c } = await captured(language, source)
    const metadata = JSON.parse(await readFile(resolve('resources/learning/exercises/ch2-04/exercise.json'), 'utf8'))
    const { functionName, parameters, returnType } = metadata.signature
    const signature = { functionName, parameters, returnType }
    const real: SmartCapture = { ...c, hintTemplate: source, source: source.replace('Viết lời giải của bạn tại đây.', 'TODO: đọc ví dụ trước.'), signature }
    expect(await parser.classifyHint(real, scope())).toBe('NO_IMPLEMENTATION')
  })
  it('missing or unfamiliar trusted starter is UNCERTAIN, even with forged classification', async () => {
    const { c } = await captured(language, '')
    expect(await parser.classifyHint({ ...c, hintTemplate: undefined, hintImplementation: 'HAS_IMPLEMENTATION' }, scope())).toBe('UNCERTAIN')
    expect(await parser.classifyHint({ ...c, hintTemplate: body(language, 'return x;') }, scope())).toBe('UNCERTAIN')
    const missing = new MainSelectionFixGuard({ assetDirectory: resolve('out/hint-context/missing-assets') })
    expect(await missing.classifyHint(c, scope())).toBe('UNCERTAIN')
    const abort = new AbortController(); abort.abort()
    await expect(parser.classifyHint(c, scope(abort.signal))).rejects.toBeDefined()
    expect(validateSmartPrepare({ ...request(), hintImplementation: 'NO_IMPLEMENTATION' }).ok).toBe(false)
    expect(validateSmartPrepare({ ...request(), hintTemplate: starter(language) }).ok).toBe(false)
  })
  it('validates complete code and rejects body-only, changed signatures, extra functions and placeholders', async () => {
    const { c } = await captured(language, starter(language))
    expect(await parser.validateHintFunction(c, body(language, 'return x + 1;'), scope())).toBe(true)
    if (language === 'csharp') expect(await parser.validateHintFunction(c, 'public int solve(int x) { return x + 1; }', scope())).toBe(true)
    for (const text of ['return x + 1;', body(language, 'return x;').replace('solve', 'wrong'),
      body(language, 'return x;').replace(language === 'csharp' ? 'int x' : '(x)', language === 'csharp' ? 'string x' : '(y)'), starter(language),
      body(language, language === 'csharp' ? 'if (x == 0) throw new System.NotImplementedException(); return x;' : 'if (x === 0) throw new Error("TODO"); return x;')])
      expect(await parser.validateHintFunction(c, text, scope())).toBe(false)
  }, 15000)
  if (language === 'csharp') it('recognizes an empty class and expression-bodied implementation/placeholder', async () => {
    const { c } = await captured(language, '')
    for (const [source, expected] of [
      ['public class Solution {}', 'NO_IMPLEMENTATION'],
      ['public class Solution { public int solve(int x) => x + 1; }', 'HAS_IMPLEMENTATION'],
      ['public class Solution { public int solve(int x) => throw new System.NotImplementedException(); }', 'NO_IMPLEMENTATION'],
    ]) expect(await parser.classifyHint({ ...c, source }, scope())).toBe(expected)
    expect(await parser.validateHintFunction(c, 'public int solve(int x) => x + 1;', scope())).toBe(true)
    expect(await parser.validateHintFunction(c, 'public int solve(int x) => throw new NotImplementedException();', scope())).toBe(false)
  })
  it.each(['NO_IMPLEMENTATION', 'HAS_IMPLEMENTATION', 'UNCERTAIN'] as const)('%s reaches fake Gemini through Main capture/consent and one reservation', async state => {
    vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
    const f = await chatIpcFixture(undefined, parser); fixtures.push(f)
    const source = state === 'NO_IMPLEMENTATION' ? starter(language) : body(language, state === 'HAS_IMPLEMENTATION' ? 'return x + 1;' : 'return x + ;')
    const { q, pkg } = await captured(language, source)
    const reply = { kind: 'HINT', thinking: state === 'HAS_IMPLEMENTATION' ? 'Observed return: check edge cases; no defect established.' : 'Use the required inputs.',
      steps: ['Preserve the signature and inspect the public examples.'],
      code: { language, text: state === 'NO_IMPLEMENTATION' ? body(language, 'return x + 1;') : 'return x + 1;' }, evidence: [] }
    const send = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? send(r) : Response.json(chatEnvelope(reply)))
    const prepared = await f.config.service.prepare(1, 'doc', q, () => {}, (g, check) => captureSmartHints(pkg.packages, q, g, check))
    expect(f.send).not.toHaveBeenCalled(); expect(f.config.snapshot().usedRequests).toBe(0)
    expect(prepared).not.toHaveProperty('hintTemplate'); expect(prepared).not.toHaveProperty('hintImplementation')
    f.config.service.start(1, 'doc', start(prepared)); f.config.service.start(1, 'doc', start(prepared))
    await vi.waitFor(() => expect(f.config.service.status(1, 'doc', reference(prepared))).toMatchObject({ state: 'COMPLETE', proposalId: null, output: reply }), { timeout: 10000 })
    const posts = f.send.mock.calls.filter(([r]) => r.method === 'POST')
    expect(posts).toHaveLength(1); expect(f.config.snapshot().usedRequests).toBe(1)
    const wire = await posts[0][0].clone().json(), input = JSON.parse(wire.contents[0].parts[0].text)
    expect(input.implementationState).toBe(state); expect(input.source).toBe(source)
    expect(input.signature).toEqual({ functionName: 'solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' })
    expect(input).not.toHaveProperty('hintTemplate'); expect(input).not.toHaveProperty('starters')
    const instruction = wire.systemInstruction.parts[0].text
    expect(instruction).toContain(`${state}:`); expect(instruction).toContain('code MUST be the last teaching section')
    expect(instruction).toContain(state === 'NO_IMPLEMENTATION' ? 'Give the complete required function' : state === 'HAS_IMPLEMENTATION' ? 'do not invent a defect' : 'acknowledge uncertainty')
    expect(wire.generationConfig.responseJsonSchema.properties.code.description).toContain(`${state}:`)
    expect(q.source).toBe(source)
  }, 20000)
  it('Main rejects wrong full-function signature after one consented inference without retry', async () => {
    const f = await chatIpcFixture(undefined, parser); fixtures.push(f)
    const { q, pkg } = await captured(language, '')
    const send = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? send(r) : Response.json(chatEnvelope({ kind: 'HINT', thinking: 'Approach.', steps: ['Implement.'],
      code: { language, text: body(language, 'return x;').replace('solve', 'wrong') }, evidence: [] })))
    const prepared = await f.config.service.prepare(1, 'doc', q, () => {}, (g, check) => captureSmartHints(pkg.packages, q, g, check))
    f.config.service.start(1, 'doc', start(prepared))
    await vi.waitFor(() => expect(f.config.service.status(1, 'doc', reference(prepared))).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' }), { timeout: 10000 })
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    expect(f.config.snapshot().usedRequests).toBe(1)
  }, 20000)
  it.each(['cancel', 'stale'] as const)('%s during full-function validation prevents late publication', async mode => {
    let release!: (valid: boolean) => void
    const validate = vi.fn(() => new Promise<boolean>(resolve => { release = resolve }))
    const f = await chatIpcFixture(undefined, { classifyHint: (c, s) => parser.classifyHint(c, s), validateHintFunction: validate }); fixtures.push(f)
    const { q, pkg } = await captured(language, '')
    const send = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? send(r) : Response.json(chatEnvelope({ kind: 'HINT', thinking: 'Approach.', steps: ['Implement.'],
      code: { language, text: body(language, 'return x + 1;') }, evidence: [] })))
    const prepared = await f.config.service.prepare(1, 'doc', q, () => {}, (g, check) => captureSmartHints(pkg.packages, q, g, check))
    f.config.service.start(1, 'doc', start(prepared))
    await vi.waitFor(() => expect(validate).toHaveBeenCalledOnce())
    if (mode === 'cancel') f.config.service.cancel(1, 'doc', reference(prepared))
    else f.config.service.retireContext(1, 'doc', { clientContextId: q.clientContextId, reason: 'EDIT' })
    const retired = f.config.service.status(1, 'doc', reference(prepared))
    expect(retired.state).toBe('CANCELLED'); release(true)
    await f.config.service.stop()
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
    expect(f.config.snapshot().usedRequests).toBe(1)
    expect(retired).not.toHaveProperty('output')
  }, 20000)
})
