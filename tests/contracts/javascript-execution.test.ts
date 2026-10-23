import { describe, expect, it } from 'vitest'
import { EXERCISE_LIMITS, JAVASCRIPT_FAILURE_END_REASON, JAVASCRIPT_FAILURE_KINDS, JAVASCRIPT_TIMEOUT_END_REASON,
  parseJavascriptHarnessRequest, parseJavascriptHarnessResponse, validateJavascriptCaseResult,
  validateJavascriptDiagnostic, validateJavascriptExecutionFailure, validateJavascriptExecutionResult,
  validateJavascriptHarnessRequest, validateJavascriptHarnessResponse, validateJavascriptSampleSchema,
  validateJavascriptSyntaxResult, type JavascriptSampleSchema, type JavascriptExecutionFailure,
  type JavascriptSyntaxResult } from '../../src/shared/contracts'
import type { ExerciseType } from '../../src/shared/contracts/practice'

const schema: JavascriptSampleSchema = { parameterTypes: ['int32'], returnType: 'int32', sampleCount: 3 }
const request = { protocolVersion: 1, caseIndex: 0, args: [8] }
const response = { protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual: 8, stdout: '', stderr: '' }
const syntax: JavascriptSyntaxResult = { status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null }
const returned = { caseIndex: 0, outcome: 'RETURNED', actual: 8, stdout: '', stderr: '', exitCode: 0, failure: null }
const runtime: JavascriptExecutionFailure = { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: 0 }
const failed = { ...returned, outcome: 'FAILED', actual: null, exitCode: 1, failure: runtime }
const report = { syntax, cases: [returned], notRunCaseIndices: [1, 2], failure: null }
const diagnostic = { code: 'SYNTAX_ERROR', source: 'solution', line: 1, column: 2 }
const syntaxFailure: JavascriptExecutionFailure = { kind: 'SYNTAX_ERROR', phase: 'compile', caseIndex: null }
const badSyntax = { ...syntax, status: 'FAILED', exitCode: 1, diagnostics: [diagnostic], failure: syntaxFailure }
const parse = (text: string | Uint8Array, exitCode: number | null = 0) => parseJavascriptHarnessResponse(text, schema, 0, exitCode)

describe('JavaScript six-type protocol', () => {
  it.each<[ExerciseType, unknown]>([
    ['int32', -2147483648], ['int32', 2147483647], ['int32', 0], ['boolean', false], ['boolean', true],
    ['string', ''], ['string', 'Tiếng Việt 😀\n"\\'], ['int32[]', []], ['int32[]', [-2147483648, 0, 2147483647]],
    ['string[]', ['', 'á', '😀']], ['int32[][]', []], ['int32[][]', [[], []]], ['int32[][]', [[1, 2], [3, 4]]],
  ])('round trips %s %# as data', (type, actual) => {
    const s = { ...schema, parameterTypes: [type], returnType: type }
    const req = { ...request, args: [actual] }
    const res = { ...response, actual }
    expect(parseJavascriptHarnessRequest(new TextEncoder().encode(JSON.stringify(req)), s, 0)).toEqual({ ok: true, value: req })
    expect(parseJavascriptHarnessResponse(JSON.stringify(res), s, 0, 0)).toEqual({ ok: true, value: res })
  })
  it.each<[ExerciseType, unknown]>([
    ['int32', -2147483649], ['int32', 2147483648], ['int32', 1.5], ['int32', NaN], ['int32', Infinity],
    ['int32', '1'], ['boolean', 0], ['string', null], ['string', '\ud800'], ['string', '\udc00'],
    ['int32[]', [1, '2']], ['string[]', ['a', null]], ['int32[][]', [[1], [1, 2]]], ['int32[][]', [null]],
    ['int32', undefined], ['int32', 1n], ['int32', Promise.resolve(1)], ['int32', { then: () => 1 }],
  ])('rejects invalid %s value %# on request and response', (type, actual) => {
    const s = { ...schema, parameterTypes: [type], returnType: type }
    expect(validateJavascriptHarnessRequest({ ...request, args: [actual] }, s, 0).ok).toBe(false)
    expect(validateJavascriptHarnessResponse({ ...response, actual }, s, 0, 0).ok).toBe(false)
  })
  it.each([
    null, {}, { ...request, protocolVersion: 2 }, { ...request, args: [] }, { ...request, args: [1, 2] },
    { ...request, caseIndex: 1 }, { ...request, args: new Array(1) }, { ...request, customCases: [] },
  ])('rejects invalid/excess request fields %#', v => {
    expect(validateJavascriptHarnessRequest(v, schema, 0).ok).toBe(false)
  })
  it.each([
    { ...schema, sampleCount: 0 }, { ...schema, sampleCount: Infinity }, { ...schema, sampleCount: 0.5 },
    { ...schema, sampleCount: EXERCISE_LIMITS.outputBytes + 1 }, { ...schema, parameterTypes: ['number'] },
    { ...schema, returnType: 'object' }, { ...schema, expected: 8 }, { ...schema, parameterTypes: new Array(1) },
  ])('validates Main-owned schema bounds %#', s => {
    expect(validateJavascriptSampleSchema(s).ok).toBe(false)
    expect(validateJavascriptHarnessRequest(request, s as JavascriptSampleSchema, 0).ok).toBe(false)
  })
  it.each([-1, 0.5, 3, NaN, Infinity])('rejects invalid expected case index %s', i => {
    expect(parseJavascriptHarnessResponse(JSON.stringify(response), schema, i, 0).ok).toBe(false)
    expect(validateJavascriptHarnessRequest(request, schema, i).ok).toBe(false)
  })
  it('returns detached values and does not invoke getters/toJSON', () => {
    const input = { ...request, args: [8] }
    const checked = validateJavascriptHarnessRequest(input, schema, 0)
    input.args[0] = 99
    expect(checked.ok && checked.value.args[0]).toBe(8)
    let calls = 0
    const getter = { ...response, get actual() { calls++; throw new Error('must not run') } }
    const hook = { ...response, toJSON() { calls++; return response } }
    expect(validateJavascriptHarnessResponse(getter, schema, 0, 0).ok).toBe(false)
    expect(validateJavascriptHarnessResponse(hook, schema, 0, 0).ok).toBe(false)
    expect(calls).toBe(0)
    const cycle: unknown[] = []; cycle.push(cycle)
    const array = [1]; Object.defineProperty(array, 'extra', { value: 2 })
    for (const actual of [cycle, array, new Date(), new Map(), Symbol('x')]) {
      expect(validateJavascriptHarnessResponse({ ...response, actual }, schema, 0, 0).ok).toBe(false)
    }
    expect(validateJavascriptHarnessResponse({ ...response, [Symbol('hidden')]: 1 }, schema, 0, 0).ok).toBe(false)
  })
})

describe('strict JSON framing and encoded bounds', () => {
  it.each([
    '', '{', 'null', '[]', '\ufeff{}', JSON.stringify(response) + JSON.stringify(response),
    JSON.stringify(response) + '\nlog', JSON.stringify(response) + '\0',
    '{"protocolVersion":1,"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"","stderr":""}',
    '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"","std\\u006fut":"","stderr":""}',
    '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":{"a":1,"a":2},"stdout":"","stderr":""}',
    '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"\\ud800","stderr":""}',
    '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"\n","stderr":""}',
    '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"","stderr":"",}',
    JSON.stringify(response).replace('"actual":8', '"actual":01'),
    JSON.stringify(response).replace('"actual":8', '"actual":1e999'),
    '['.repeat(13) + '0' + ']'.repeat(13),
  ])('rejects malformed/duplicate/trailing/deep input %#', text => {
    expect(parse(text).ok).toBe(false)
    expect(parse(new TextEncoder().encode(text)).ok).toBe(false)
  })
  it('uses the same strict parser for request framing', () => {
    const req = JSON.stringify(request)
    for (const text of [req + req, req.replace('"args"', '"args":[],"args"'), req + 'x', '\ufeff' + req]) {
      expect(parseJavascriptHarnessRequest(text, schema, 0).ok).toBe(false)
    }
    expect(parseJavascriptHarnessRequest(' \n' + req + '\r\t', schema, 0).ok).toBe(true)
  })
  it.each([
    [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82], [0x80],
  ].map(bad => ({ bad })))('rejects malformed UTF-8 bytes %#', ({ bad }) => {
    const prefix = new TextEncoder().encode(JSON.stringify(response).replace('"stdout":""', '"stdout":"MARK"'))
    const marker = new TextEncoder().encode('MARK')
    const start = prefix.findIndex((_, i) => marker.every((b, j) => prefix[i + j] === b))
    const input = new Uint8Array([...prefix.slice(0, start), ...bad, ...prefix.slice(start + marker.length)])
    expect(parse(input).ok).toBe(false)
  })
  it('accepts whitespace and escaped quotes/brackets in valid strings', () => {
    const v = { ...response, stdout: '\\"{[}]\\ and 😀' }
    expect(parse(' \n' + JSON.stringify(v) + '\t\r')).toEqual({ ok: true, value: v })
  })
  it('enforces byte boundary including escaping, framing, Unicode and whitespace', () => {
    const base = Buffer.byteLength(JSON.stringify(response))
    const at = { ...response, stdout: 'x'.repeat(EXERCISE_LIMITS.outputBytes - base) }
    const text = JSON.stringify(at)
    expect(parse(text).ok).toBe(true)
    expect(parse(new TextEncoder().encode(text)).ok).toBe(true)
    expect(parse(text + ' ').ok).toBe(false)
    expect(validateJavascriptHarnessResponse({ ...at, stderr: 'x' }, schema, 0, 0).ok).toBe(false)
    for (const stdout of ['😀'.repeat(EXERCISE_LIMITS.outputBytes / 4), '\0'.repeat(EXERCISE_LIMITS.outputBytes / 2)]) {
      expect(validateJavascriptHarnessResponse({ ...response, stdout }, schema, 0, 0).ok).toBe(false)
    }
    expect(parse(' '.repeat(EXERCISE_LIMITS.outputBytes + 1)).ok).toBe(false)
  })
})

describe('outcome/exit and safe diagnostics', () => {
  it.each([null, 1, -1, 1.5, NaN, 0xc0000005, 0x1_0000_0000])('rejects RETURNED with exit %s', code => {
    expect(parse(JSON.stringify(response), code).ok).toBe(false)
  })
  it.each(['USER_EXCEPTION', 'INVALID_RESULT'])('accepts only semantic %s failure with exit 1', error => {
    const payload = { protocolVersion: 1, caseIndex: 0, outcome: 'FAILED', error, stdout: '', stderr: '' }
    expect(parse(JSON.stringify(payload), 1)).toEqual({ ok: true, value: payload })
    for (const code of [null, 0, 2, 0xc0000005]) expect(parse(JSON.stringify(payload), code).ok).toBe(false)
    expect(parse(JSON.stringify({ ...payload, actual: null }), 1).ok).toBe(false)
  })
  it.each([
    { ...response, outcome: 'FAILED' }, { ...response, error: 'USER_EXCEPTION' }, { ...response, actual: null },
    { ...response, outcome: 'ACCEPTED' }, { ...response, stack: 'raw' }, { ...response, stdout: '\udc00' },
  ])('rejects impossible/unsafe response %#', payload => expect(validateJavascriptHarnessResponse(payload, schema, 0, 0).ok).toBe(false))
  it('permits bounded diagnostic aliases only and paired coordinates', () => {
    expect(validateJavascriptDiagnostic(diagnostic).ok).toBe(true)
    expect(validateJavascriptDiagnostic({ ...diagnostic, source: 'harness', line: null, column: null }).ok).toBe(true)
    for (const fields of [{ line: 0 }, { column: null }, { line: Infinity }, { source: 'C:\\temp' },
      { code: 'CS1002' }, { message: 'raw stack' }, { path: '/host/file' }]) {
      expect(validateJavascriptDiagnostic({ ...diagnostic, ...fields }).ok).toBe(false)
    }
  })
  it('requires syntax status/diagnostic/failure consistency', () => {
    expect(validateJavascriptSyntaxResult(syntax, 3).ok).toBe(true)
    expect(validateJavascriptSyntaxResult(badSyntax, 3).ok).toBe(true)
    for (const v of [{ ...syntax, exitCode: null }, { ...syntax, diagnostics: [diagnostic] },
      { ...badSyntax, diagnostics: [] }, { ...badSyntax, exitCode: 0 }, { ...badSyntax, failure: null },
      { ...badSyntax, failure: runtime }]) expect(validateJavascriptSyntaxResult(v, 3).ok).toBe(false)
  })
  it.each(['TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT', 'PROTOCOL_FAILURE', 'INFRASTRUCTURE_FAILURE']) (
    'permits a syntax-stage %s observation without fabricating syntax diagnostics', kind => {
      const failure = { kind, phase: 'compile', caseIndex: null }
      const observed = { ...syntax, status: 'FAILED', exitCode: null, failure }
      expect(validateJavascriptSyntaxResult(observed, 3).ok).toBe(true)
      expect(validateJavascriptSyntaxResult({ ...observed, diagnostics: [diagnostic] }, 3).ok).toBe(false)
      expect(validateJavascriptExecutionResult({ syntax: observed, cases: [], notRunCaseIndices: [0, 1, 2], failure }, schema).ok).toBe(true)
    },
  )
})

describe('failure taxonomy and unchanged Common policy', () => {
  const allowed: Record<string, string[]> = {
    NODE_MISSING: ['prepare'], NODE_INCOMPATIBLE: ['prepare'], SYNTAX_ERROR: ['compile'], RUNTIME_ERROR: ['execute'],
    PROTOCOL_FAILURE: ['prepare', 'compile', 'execute'], TIMEOUT: ['prepare', 'compile', 'execute', 'operation'],
    JOB_MEMORY_LIMIT: ['prepare', 'compile', 'execute'], OUTPUT_LIMIT: ['prepare', 'compile', 'execute'],
    INFRASTRUCTURE_FAILURE: ['prepare', 'compile', 'execute', 'cleanup'],
  }
  for (const kind of JAVASCRIPT_FAILURE_KINDS) {
    it.each(['prepare', 'compile', 'execute', 'operation', 'cleanup'])(`${kind} scope %s`, phase => {
      const f = { kind, phase, caseIndex: phase === 'execute' ? 0 : null }
      expect(validateJavascriptExecutionFailure(f, 3).ok).toBe(allowed[kind].includes(phase))
    })
  }
  it('rejects invalid scopes/count/metadata and does not treat OOM text as quota proof', () => {
    for (const f of [{ ...runtime, caseIndex: null }, { ...runtime, caseIndex: 3 }, { ...runtime, caseIndex: -1 },
      { ...runtime, phase: 'compile' }, { ...runtime, kind: 'Wrong Answer' }, { ...runtime, kind: 'V8_OOM' },
      { ...runtime, nativeHandle: 8 }]) expect(validateJavascriptExecutionFailure(f, 3).ok).toBe(false)
    for (const n of [0, -1, Infinity]) expect(validateJavascriptExecutionFailure(runtime, n).ok).toBe(false)
  })
  it('maps syntax/runtime/protocol separately without modifying limits', () => {
    expect(JAVASCRIPT_FAILURE_END_REASON).toEqual({ NODE_MISSING: 'DEPENDENCY_MISSING', NODE_INCOMPATIBLE: 'INVALID_RUNTIME',
      SYNTAX_ERROR: 'COMPILATION_FAILED', RUNTIME_ERROR: 'RUNTIME_FAILED', PROTOCOL_FAILURE: 'INTERNAL_ERROR',
      JOB_MEMORY_LIMIT: 'JOB_MEMORY_LIMIT', OUTPUT_LIMIT: 'OUTPUT_LIMIT', INFRASTRUCTURE_FAILURE: 'INTERNAL_ERROR' })
    expect(JAVASCRIPT_TIMEOUT_END_REASON).toEqual({ prepare: 'PREPARE_TIMEOUT', compile: 'COMPILE_TIMEOUT', execute: 'EXECUTE_TIMEOUT', operation: 'OPERATION_TIMEOUT' })
    expect(EXERCISE_LIMITS).toEqual({ prepareMs: 10_000, compileMs: 30_000, executeCaseMs: 2_000, operationMs: 60_000,
      cleanupWaitMs: 12_000, compileJobMemoryBytes: 2 * 1024 ** 3, executeJobMemoryBytes: 512 * 1024 ** 2,
      outputBytes: 1024 ** 2, concurrentOperations: 1, queuedOperations: 0 })
  })
})

describe('unjudged settled sample observations', () => {
  it('validates success, zero/false/empty actuals, fail-fast and syntax failure', () => {
    expect(validateJavascriptExecutionResult(report, schema).ok).toBe(true)
    expect(validateJavascriptExecutionResult({ ...report, cases: [failed], failure: runtime }, schema).ok).toBe(true)
    expect(validateJavascriptExecutionResult({ syntax: badSyntax, cases: [], notRunCaseIndices: [0, 1, 2], failure: syntaxFailure }, schema).ok).toBe(true)
    for (const [returnType, actual] of [['int32', 0], ['boolean', false], ['string', '']] as const) {
      expect(validateJavascriptCaseResult({ ...returned, actual }, { ...schema, returnType }).ok).toBe(true)
    }
  })
  it.each([
    { ...report, syntax: null }, { ...report, syntax: badSyntax }, { ...report, cases: [failed] },
    { ...report, failure: runtime }, { ...report, cases: [{ ...returned, caseIndex: 1 }] },
    { ...report, cases: [failed, { ...returned, caseIndex: 1 }], notRunCaseIndices: [2], failure: runtime },
    { ...report, notRunCaseIndices: [] }, { ...report, notRunCaseIndices: [2, 1] }, { ...report, notRunCaseIndices: [1, 1] },
    { ...report, notRunCaseIndices: [0, 2] }, { ...report, notRunCaseIndices: new Array(2) },
    { ...report, syntax: badSyntax, cases: [], notRunCaseIndices: [0, 1, 2], failure: null },
  ])('rejects impossible progress or failure coverage %#', v => expect(validateJavascriptExecutionResult(v, schema).ok).toBe(false))
  it('validates prepare failures, operation timeout and protocol/crash observations', () => {
    const prepare = { kind: 'NODE_MISSING', phase: 'prepare', caseIndex: null }
    expect(validateJavascriptExecutionResult({ syntax: null, cases: [], notRunCaseIndices: [0, 1, 2], failure: prepare }, schema).ok).toBe(true)
    const timeout = { kind: 'TIMEOUT', phase: 'operation', caseIndex: null }
    expect(validateJavascriptExecutionResult({ ...report, failure: timeout }, schema).ok).toBe(true)
    const protocol = { kind: 'PROTOCOL_FAILURE', phase: 'execute', caseIndex: 0 }
    expect(validateJavascriptCaseResult({ ...failed, exitCode: 0xc0000005, failure: protocol }, schema).ok).toBe(true)
    expect(validateJavascriptCaseResult({ ...failed, exitCode: 0 }, schema).ok).toBe(false)
    for (const code of [-1, 0x1_0000_0000, 1.5]) expect(validateJavascriptCaseResult({ ...failed, exitCode: code }, schema).ok).toBe(false)
    expect(validateJavascriptCaseResult({ ...returned, exitCode: 1 }, schema).ok).toBe(false)
  })
  it('requires matching terminal failure identities and preserves detached reports', () => {
    const input = { ...report, cases: [failed], notRunCaseIndices: [1, 2], failure: runtime }
    const checked = validateJavascriptExecutionResult(input, schema)
    input.notRunCaseIndices[0] = 99
    expect(checked.ok && checked.value.notRunCaseIndices).toEqual([1, 2])
    for (const v of [
      { ...report, failure: syntaxFailure },
      { ...report, cases: [failed], failure: { ...runtime, caseIndex: 1 } },
      { ...report, cases: [{ ...failed, failure: { ...runtime, caseIndex: 1 } }], failure: runtime },
      { ...report, failure: { kind: 'NODE_MISSING', phase: 'prepare', caseIndex: null } },
    ]) expect(validateJavascriptExecutionResult(v, schema).ok).toBe(false)
    const operationFailure = { kind: 'TIMEOUT', phase: 'operation', caseIndex: null }
    const interruptedSyntax = { ...syntax, status: 'FAILED', exitCode: null, failure: operationFailure }
    expect(validateJavascriptExecutionResult({ syntax: interruptedSyntax, cases: [], notRunCaseIndices: [0, 1, 2], failure: operationFailure }, schema).ok).toBe(true)
    expect(validateJavascriptExecutionResult({ syntax: null, cases: [], notRunCaseIndices: [0, 1, 2], failure: operationFailure }, schema).ok).toBe(true)
  })
  it.each(['expected', 'verdict', 'accepted', 'passed', 'cleanupComplete', 'pid', 'path', 'command', 'customCases']) (
    'rejects out-of-scope field %s', field => {
      expect(validateJavascriptExecutionResult({ ...report, [field]: 1 }, schema).ok).toBe(false)
      expect(validateJavascriptCaseResult({ ...returned, [field]: 1 }, schema).ok).toBe(false)
    },
  )
  it('bounds aggregate report bytes rather than granting each case another allowance', () => {
    const half = 'x'.repeat(EXERCISE_LIMITS.outputBytes / 2)
    expect(validateJavascriptExecutionResult({ ...report, syntax: { ...syntax, stdout: half },
      cases: [{ ...returned, stderr: half }] }, schema).ok).toBe(false)
    expect(validateJavascriptExecutionResult({ ...report, cases: [{ ...returned, stdout: half },
      { ...returned, caseIndex: 1, stdout: half }], notRunCaseIndices: [2] }, schema).ok).toBe(false)
  })
})
