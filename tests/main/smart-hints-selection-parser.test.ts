import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import { constructSelectionFix } from '../../src/main/services/learning/smart-hints/selection-fix'
import { immutableSmartCapture } from '../../src/main/services/learning/smart-hints/capture'
import { smartCandidate, isSmartOutput } from '../../src/shared/contracts/smart-hints-validation'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import type { CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import type { SelectionFixScope } from '../../src/main/services/learning/smart-hints/selection-fix-guard'
import { request, capture, fixAction, start, reference } from '../fixtures/learning/smart-hints'

vi.mock('node:child_process', async original => { const m = await original<typeof import('node:child_process')>(); return { ...m, spawn: vi.fn(m.spawn) } })
const assets = resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/main/smart-hints-parser'), owned: string[] = []
const scope = (signal = new AbortController().signal): SelectionFixScope => ({ signal, clock: Date.now, deadline: Date.now() + 30000, check() {} })
let sdk: CsharpSdkSelection
beforeAll(async () => {
  expect(JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8')).typescript).toBe('6.0.3')
  const result = await new SelectionFixCsharpSdkResolver().resolve({ signal: new AbortController().signal, deadline: performance.now() + 15000 })
  if (result.state !== 'AVAILABLE') throw Error('Pinned SDK missing: C# acceptance must not silently skip')
  sdk = result.selection
}, 20000)
afterEach(async () => {
  vi.restoreAllMocks(); vi.mocked(spawn).mockClear()
  for (const root of owned.splice(0)) { expect(root.startsWith(join(tmpdir(), 'sh4-d64-'))).toBe(true); await rm(root, { recursive: true, force: true }) }
})
function fixture(language: 'csharp' | 'javascript', eol = '\n', selected = 'return v;', code?: string) {
  const source = code ?? (language === 'csharp'
    ? 'public class Solution {\n public int Sum(int a, int b) {\n  int v = a;\n  return v;\n }\n public int Other() { return 1; }\n}'
    : 'function sum(a, b) {\n const v = a;\n return v;\n}\nfunction other() { return 1; }').replace(/\n/g, eol)
  const at = source.indexOf(selected)
  if (at < 0) throw Error('Fixture range missing')
  const q = request({ language, source, action: fixAction(source, at, at + selected.length),
    origin: { kind: 'PRACTICE', modelId: '11111111-1111-4111-8111-111111111111', modelVersion: 2, eol: eol === '\r\n' ? 'CRLF' : 'LF' } })
  const c = capture(q)
  c.signature = { functionName: language === 'csharp' ? 'Sum' : 'sum', parameters: [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }], returnType: 'int32' }
  return immutableSmartCapture(c)
}
// Resolve the real SDK once above; grammar cases reuse that validated identity.
// Missing/version/real resolver behavior is checked separately below.
function guard(directory = assets, budgetMs = 2000) { return new MainSelectionFixGuard({ assetDirectory: directory, budgetMs,
  sdkResolver: { resolve: async () => ({ state: 'AVAILABLE', selection: sdk }) } }) }
async function verify(c: ReturnType<typeof fixture>, replacementText: string, runtime = guard()) {
  const output = constructSelectionFix(c, { kind: 'EDIT_PROPOSAL', replacementText, rationale: 'Synthetic focused change.', evidence: [] })
  if (output.kind !== 'EDIT_PROPOSAL' || c.binding.origin.kind !== 'PRACTICE') throw Error()
  expect(isSmartOutput(output, c.action, c.source, [], c.binding.origin.eol)).toBe(true)
  const candidate = smartCandidate(c.source, output.edits, c.binding.origin.eol)!
  const lease = await runtime.preflight(c, scope())
  try { await lease.verify(candidate, scope()) } finally { await lease.dispose() }
  return candidate
}
describe('D6-4 real standalone parsers and approved grammar', () => {
  it.each(['csharp', 'javascript'] as const)('%s real guard integrates C1/SH-1/service publication without enabling normal capability', async language => {
    const c = fixture(language), q = request({ clientContextId: c.binding.clientContextId, exerciseId: c.binding.exerciseId,
      language, source: c.source, sourceRevision: c.binding.sourceRevision, action: c.action, origin: c.binding.origin })
    const run = vi.fn(async () => ({ kind: 'EDIT_PROPOSAL', replacementText: 'return v + b;', rationale: 'Synthetic focused change.', evidence: [] }))
    const service = new SmartHintsService({ mode: 'FAKE', run }, Date.now, undefined, { timeoutMs: 30000 }, guard())
    try {
      await service.probeCapabilities()
      const p = await service.prepare(1, 'real-guard', q, () => {}, async g => ({ ...c, binding: { ...c.binding, contextGeneration: g } }))
      service.start(1, 'real-guard', start(p))
      await vi.waitFor(() => expect(service.status(1, 'real-guard', reference(p)).state).toBe('COMPLETE'), { timeout: 10000 })
      expect(service.status(1, 'real-guard', reference(p))).toMatchObject({ proposalId: expect.any(String), output: { edits: [expect.objectContaining({ expectedOldText: 'return v;' })] } })
      expect(service.capabilities()).toMatchObject({ suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['csharp', 'javascript'] })
    } finally { await service.stop() }
  }, 20000)
  it('checks real runtime versions/assets before advertising private availability', async () => {
    expect(await guard().availability('javascript', scope())).toBe(true)
    expect(await new MainSelectionFixGuard({ assetDirectory: assets }).availability('csharp', scope())).toBe(true)
  }, 10000)
  for (const language of ['csharp', 'javascript'] as const) for (const eol of ['\n', '\r\n']) {
    it(`${language} ${JSON.stringify(eol)} expression/single/multiline/trivia/function/helper/deletion`, async () => {
      await expect(verify(fixture(language, eol, 'v;'), 'v + b;')).rejects.toMatchObject({ code: 'INVALID_INPUT', selectionFix: { reason: 'TARGET' } })
      const base = fixture(language, eol), expression = structuredClone(base)
      const at = base.source.indexOf('return v;') + 7
      expression.action = fixAction(base.source, at, at + 1)
      const { bindSmartAction } = await import('../../src/main/services/learning/smart-hints/capture')
      expression.binding.action = bindSmartAction(expression.action)
      await verify(expression, 'v + b')
      await verify(base, 'return v + b;')
      const statements = `${language === 'csharp' ? 'int' : 'const'} v = a;${eol}${language === 'csharp' ? '  ' : ' '}return v;`
      await verify(fixture(language, eol, statements), statements.replace('v = a', 'v = a + b'))
      const trivia = `${eol}${language === 'csharp' ? '  ' : ' '}return v;${eol}`
      await verify(fixture(language, eol, trivia), `${eol} /* selected trivia */ return v + b;${eol}`)
      const whole = language === 'csharp' ? `public int Sum(int a, int b) {${eol}  int v = a;${eol}  return v;${eol} }`
        : `function sum(a, b) {${eol} const v = a;${eol} return v;${eol}}`
      await verify(fixture(language, eol, whole), whole.replace('return v;', 'return v + b;'))
      const helper = language === 'csharp' ? 'public int Other() { return 1; }' : 'function other() { return 1; }'
      await verify(fixture(language, eol, helper), helper.replace('return 1;', 'return 2;'))
      await verify(fixture(language, eol, `${language === 'csharp' ? 'int' : 'const'} v = a;`), '')
    }, 30000)
  }
  it.each(['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]'])('C# trusted signature type %s maps exactly', async type => {
    const alias = { int32: 'int', boolean: 'bool', string: 'string', 'int32[]': 'int[]', 'string[]': 'string[]', 'int32[][]': 'int[][]' }[type]!
    const c = structuredClone(fixture('csharp', '\n', 'return a;', `public class Solution { public ${alias} Sum(${alias} a) { return a; } }`))
    c.signature.parameters = [{ name: 'a', type }]; c.signature.returnType = type
    await verify(c, 'return a; /* preserved */')
  }, 10000)
  it.each(['csharp', 'javascript'] as const)('%s rejects syntax/signature/structural escape with no outside byte repair', async language => {
    const c = fixture(language), lease = await guard().preflight(c, scope())
    const replacement = (text: string) => c.source.replace('return v;', text)
    try {
      for (const text of ['return (;', language === 'csharp' ? 'return v; } public int Injected() { return 0;' : 'return v; } function injected() { return 0;'])
        await expect(lease.verify(replacement(text), scope())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
      const whole = language === 'csharp' ? 'public int Other() { return 1; }' : 'function other() { return 1; }'
      await expect(verify(fixture(language, '\n', whole), whole.replace(language === 'csharp' ? 'Other' : 'other', 'renamed'))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    } finally { await lease.dispose() }
  }, 15000)
  it.each(['csharp', 'javascript'] as const)('%s Unicode/CRLF exact source, comment escape and required header changes', async language => {
    const base = fixture(language, '\r\n'), code = '// 🐟 é\r\n' + base.source
    await verify(fixture(language, '\r\n', 'return v;', code), 'return v + b; /* 🐟 é */')
    const escaped = (language === 'csharp'
      ? 'public class Solution { public int Sum(int a, int b) { return a;\n return b; // outside */\n } public int Other() { return 1; } }'
      : 'function sum(a, b) { return a;\n return b; // outside */\n }\nfunction other() { return 1; }')
    await expect(verify(fixture(language, '\n', 'return a;', escaped), 'return a; /*')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', selectionFix: { reason: 'STRUCTURE' } })
    const whole = language === 'csharp' ? 'public int Sum(int a, int b) { return a; }' : 'function sum(a, b) { return a; }'
    const source = language === 'csharp' ? `public class Solution { ${whole} }` : `${whole}\nconst tail = 1;`
    for (const replacement of [whole.replace(language === 'csharp' ? 'int a, int b' : 'a, b', language === 'csharp' ? 'int b, int a' : 'b, a'),
      whole.replace(language === 'csharp' ? 'Sum' : 'sum', 'renamed')])
      await expect(verify(fixture(language, '\n', whole, source), replacement)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', selectionFix: { reason: 'SIGNATURE' } })
  }, 30000)
  it('rejects sole JS program even with trivia padding, partial headers, cross-function and dynamic entry writes', async () => {
    const only = '// comment\nfunction sum(a, b) { return a; }\n// tail'
    await expect(guard().preflight(fixture('javascript', '\n', 'function sum(a, b) { return a; }', only), scope())).rejects.toMatchObject({ selectionFix: { reason: 'WHOLE_FILE' } })
    for (const [code, selected] of [
      ['function sum(a, b) { return a; }\nfunction other() { return 1; }', 'sum(a, b)'],
      ['function sum(a, b) { return a; }\nfunction other() { return 1; }', 'return a; }\nfunction other() { return 1;'],
      ['function sum(a, b) { sum = 1; return a; }', 'return a;'],
      ['function sum(a, b) { for (sum of [1]) {} return a; }', 'return a;'],
      ['function sum(a, b) { for (sum in a) {} return a; }', 'return a;'],
      ['function sum(a, b) { const f = () => a; return a; }', 'return a;'],
      ['export function sum(a, b) { return a; }', 'return a;'],
      ['function sum(a: number, b) { return a; }', 'return a;'],
    ]) await expect(guard().preflight(fixture('javascript', '\n', selected, code), scope())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }, 15000)
  it('C# rejects partial/generic/local functions, overloads and signature baselines that cannot be proved', async () => {
    for (const source of [
      'public partial class Solution { public int Sum(int a, int b) { return a; } }',
      'public class Solution { public int Sum<T>(int a, int b) { return a; } }',
      'public class Solution { public int Sum(int a, int b) { int Inner() { return 1; } return a; } }',
      'public class Solution { public int Sum(int a, int b) { return a; } public int Sum(int a) { return a; } }',
      'public class Solution { public bool Sum(int a, int b) { return a; } }',
    ]) await expect(guard().preflight(fixture('csharp', '\n', 'return a;', source), scope())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }, 15000)
})

describe('isolated syntax recovery with real parsers and canonical construction', () => {
  it('ch4-01 malformed body reproducer preserves SumToN metadata and the frozen whole-function target', async () => {
    const whole = 'public int SumToN(int n) { int sum=0; for(int i=i0;i<=n;i++) return sum;{ sum+=; } }'
    const source = `public class Solution { ${whole} }`
    const c = structuredClone(fixture('csharp', '\n', whole, source))
    c.signature = { functionName: 'SumToN', parameters: [{ name: 'n', type: 'int32' }], returnType: 'int32' }
    const replacement = 'public int SumToN(int n) { int sum=0; for(int i=1;i<=n;i++) { sum+=i; } return sum; }'
    expect(await verify(immutableSmartCapture(c), replacement)).toBe(`public class Solution { ${replacement} }`)
  }, 10000)
  for (const language of ['csharp', 'javascript'] as const) {
    const wrap = (body: string) => language === 'csharp'
      ? `public class Solution { public int Sum(int a, int b) { ${body} } public int Other() { return 1; } }`
      : `function solve(a, b) { ${body} }\nfunction other() { return 1; }`
    const declaration = language === 'csharp' ? 'int' : 'let'
    const syntaxFixture = (selected: string, source: string, eol = '\n') => {
      const c = structuredClone(fixture(language, eol, selected, source))
      if (language === 'javascript') c.signature.functionName = 'solve'
      return immutableSmartCapture(c)
    }
    for (const [selected, replacement] of [
      ['sum += ;', 'sum += a;'],
      ['return a + ;', 'return a + b;'],
      ['(a + )', '(a + b)'],
      ['return a', 'return a + b;'],
      [`${declaration} sum = 0;\n sum += ;\n return sum;`, `${declaration} sum = 0;\n sum += a + b;\n return sum;`],
    ]) it(`${language} recovers selected ${JSON.stringify(selected)}`, async () => {
      const body = selected.startsWith('sum') ? `${declaration} sum = 0; ${selected} return sum;`
        : selected.startsWith('(') ? `return ${selected};` : selected
      const c = syntaxFixture(selected, wrap(body))
      expect(await verify(c, replacement)).toBe(c.source.replace(selected, replacement))
    }, 10000)
    it(`${language} whole-function body errors preserve the required header`, async () => {
      const source = wrap(`${declaration} sum = 0; sum += ; return a + ;`)
      const whole = language === 'csharp' ? source.slice(source.indexOf('public int Sum'), source.indexOf(' public int Other'))
        : source.slice(0, source.indexOf('\nfunction other'))
      const c = syntaxFixture(whole, source), fixed = whole.replace('sum += ;', 'sum += a;').replace('return a + ;', 'return sum + b;')
      await verify(c, fixed)
      await expect(verify(c, fixed.replace(language === 'csharp' ? 'int a, int b' : 'a, b', language === 'csharp' ? 'int b, int a' : 'b, a'))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    }, 15000)
    it(`${language} Unicode CRLF recovered selection stays exact`, async () => {
      const source = ('// 🐟 é\n' + wrap('return a + ;')).replace(/\n/g, '\r\n')
      const c = syntaxFixture('return a + ;', source, '\r\n')
      await verify(c, 'return a + b; /* 🐟 */')
    }, 10000)
    it(`${language} missing semicolon between adjacent statements stays inside selection`, async () => {
      const selected = 'return a return b;'
      await verify(syntaxFixture(selected, wrap(selected)), 'return a; return b;')
      await expect(guard().preflight(syntaxFixture('return b;', wrap(selected)), scope())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(guard().preflight(syntaxFixture('return b;', wrap('return a + return b;')), scope())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }, 10000)
    it(`${language} invalid candidate and structural escape stay rejected`, async () => {
      const c = syntaxFixture('return a + ;', wrap('return a + ;'))
      for (const text of ['return b + ;', language === 'csharp' ? 'return a; } public int Injected() { return b;' : 'return a; } function injected() { return b;'])
        await expect(verify(c, text)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    }, 15000)
    it(`${language} outside errors, damaged headers and missing function boundaries fail closed`, async () => {
      const originals = [wrap('return a; return b + ;'), wrap('return a;').replace(language === 'csharp' ? 'int a, int b' : 'a, b', language === 'csharp' ? 'int a int b' : 'a b'),
        wrap('return a;').replace('}', ''), wrap('return a;').replace('return 1;', 'return 1 + ;')]
      for (const source of originals)
        await expect(guard().preflight(syntaxFixture('return a;', source), scope())).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }, 20000)
    it.each(['valid', 'invalid', 'NO_FIX'])(`${language} invalid original → %s fake response through service`, async mode => {
      const c = syntaxFixture('return a + ;', wrap('return a + ;'))
      const q = request({ clientContextId: c.binding.clientContextId, exerciseId: c.binding.exerciseId, language, source: c.source,
        sourceRevision: c.binding.sourceRevision, action: c.action, origin: c.binding.origin })
      const run = vi.fn(async () => mode === 'NO_FIX' ? { kind: 'NO_FIX', reason: 'INSUFFICIENT_CONTEXT', advice: 'Review the public context.' }
        : { kind: 'EDIT_PROPOSAL', replacementText: mode === 'valid' ? 'return a + b;' : 'return b + ;', rationale: 'Synthetic focused change.', evidence: [] })
      const service = new SmartHintsService({ mode: 'FAKE', run }, Date.now, undefined, { timeoutMs: 30000 }, guard())
      try {
        await service.probeCapabilities()
        const p = await service.prepare(1, 'syntax-recovery', q, () => {}, async g => ({ ...c, binding: { ...c.binding, contextGeneration: g } }))
        expect(run).not.toHaveBeenCalled()
        service.start(1, 'syntax-recovery', start(p))
        await vi.waitFor(() => expect(['FAILED', 'COMPLETE']).toContain(service.status(1, 'syntax-recovery', reference(p)).state), { timeout: 10000 })
        const result = service.status(1, 'syntax-recovery', reference(p))
        expect(result).toMatchObject(mode === 'invalid' ? { state: 'FAILED', code: 'INVALID_RESPONSE' }
          : mode === 'NO_FIX' ? { state: 'COMPLETE', proposalId: null, output: { kind: 'NO_FIX' } }
            : { state: 'COMPLETE', proposalId: expect.any(String), output: { edits: [expect.objectContaining({ expectedOldText: 'return a + ;', startOffset: c.action.kind === 'SUGGEST_FIX' ? c.action.selection.startOffset : -1 })] } })
        if (mode === 'invalid') expect(result).not.toHaveProperty('proposalId')
        expect(run).toHaveBeenCalledTimes(1)
      } finally { await service.stop() }
    }, 20000)
  }
})

async function clonedAssets(worker?: string) {
  const root = await mkdtemp(join(tmpdir(), 'sh4-d64-')); owned.push(root)
  await cp(assets, root, { recursive: true })
  if (worker) {
    await writeFile(join(root, 'selection-fix-js.cjs'), worker)
    const m = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')), data = Buffer.from(worker)
    m.artifacts['selection-fix-js.cjs'] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
    await writeFile(join(root, 'manifest.json'), JSON.stringify(m))
  }
  return root
}
describe('D6-4 asset fail-closed and owned parser lifecycle', () => {
  it('missing/corrupt assets and SDK availability fail closed without parser fallback', async () => {
    expect(await guard(join(assets, 'missing')).availability('javascript', scope())).toBe(false)
    const root = await clonedAssets(); await writeFile(join(root, 'selection-fix-js.cjs'), 'tampered')
    expect(await guard(root).availability('javascript', scope())).toBe(false)
    const missing = new MainSelectionFixGuard({ assetDirectory: assets, sdkResolver: { resolve: async () => ({ state: 'MISSING', reason: 'SDK_NOT_FOUND' }) } })
    expect(await missing.availability('csharp', scope())).toBe(false)
  })
  it('worker crash/version mismatch/timeout/cancel all terminate before returning', async () => {
    for (const code of ["throw Error('PRIVATE_CANARY')", "const {parentPort}=require('node:worker_threads'); parentPort.postMessage({protocol:1,ready:true,version:'OTHER'});", "const {parentPort}=require('node:worker_threads'); parentPort.postMessage({protocol:1,ready:true,version:'6.0.3'}); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);"]) {
      const terminate = vi.spyOn(Worker.prototype, 'terminate'), root = await clonedAssets(code)
      await expect(guard(root, 300).preflight(fixture('javascript'), scope())).rejects.toThrow()
      expect(terminate).toHaveBeenCalled(); expect(terminate.mock.instances.every(w => (w as Worker).threadId === -1)).toBe(true); terminate.mockRestore()
    }
    const root = await clonedAssets("const {parentPort}=require('node:worker_threads'); parentPort.postMessage({protocol:1,ready:true,version:'6.0.3'}); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);")
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 100)
    try { await expect(guard(root).preflight(fixture('javascript'), scope(controller.signal))).rejects.toMatchObject({ selectionFix: { reason: 'CANCELLED' } }) }
    finally { clearTimeout(timer) }
  }, 10000)
  it('C# timeout/cancel/crash await the real helper close; no source/error text is returned', async () => {
    const actual = vi.mocked(spawn).getMockImplementation()!
    for (const mode of ['timeout', 'cancel', 'crash']) {
      const controller = new AbortController()
      vi.mocked(spawn).mockImplementationOnce((...args) => {
        const child = actual(...args)
        if (mode === 'timeout') vi.spyOn(child.stdin!, 'end').mockImplementation(() => child.stdin! as never)
        else queueMicrotask(() => mode === 'cancel' ? controller.abort() : child.kill('SIGKILL'))
        return child
      })
      const runtime = new MainSelectionFixGuard({ assetDirectory: assets, budgetMs: 500, sdkResolver: { resolve: async () => ({ state: 'AVAILABLE', selection: sdk }) } })
      await expect(runtime.preflight(fixture('csharp'), scope(controller.signal))).rejects.toThrow()
      const child = vi.mocked(spawn).mock.results.at(-1)!.value
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      expect(child.stdout.destroyed).toBe(true)
    }
  }, 10000)
  it('asset changes between preflight and postflight invalidate that exact lease', async () => {
    const root = await clonedAssets(), lease = await guard(root).preflight(fixture('javascript'), scope())
    await writeFile(join(root, 'manifest.json'), '{}')
    try { await expect(lease.verify('irrelevant', scope())).rejects.toMatchObject({ selectionFix: { stage: 'GUARD_RUNTIME', reason: 'ASSET_CHANGED' } }) }
    finally { await lease.dispose() }
  })
})
