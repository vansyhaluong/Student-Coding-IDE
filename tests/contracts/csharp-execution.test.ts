import { describe, expect, it } from 'vitest'
import { EXERCISE_LIMITS, CSHARP_FAILURE_END_REASON, CSHARP_TIMEOUT_END_REASON,
  parseCsharpHarnessResponse, validateCsharpCaseResult, validateCsharpCompileResult,
  validateCsharpCompilerDiagnostic, validateCsharpExecutionFailure, validateCsharpExecutionResult,
  validateCsharpHarnessRequest, validateCsharpHarnessResponse, validateExerciseRunRequest,
  type CsharpCompileResult, type CsharpExecutionFailure, type CsharpSampleSchema } from '../../src/shared/contracts'
import type { ExerciseType } from '../../src/shared/contracts/practice'

const schema: CsharpSampleSchema = { parameterTypes: ['int32', 'int32'], returnType: 'int32', sampleCount: 2 }
const request = { protocolVersion: 1, caseIndex: 0, args: [14, -6] }
const response = { protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual: 8, stdout: '', stderr: '' }
const diagnostic = { code: 'CS1002', severity: 'error', source: 'solution', line: 4, column: 12 }
const compiled: CsharpCompileResult = { status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null }
const returned = { caseIndex: 0, outcome: 'RETURNED', actual: 8, stdout: '', stderr: '', exitCode: 0, failure: null }
const runtimeFailure: CsharpExecutionFailure = { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: 0 }
const failed = { ...returned, outcome: 'FAILED', actual: null, exitCode: 23, failure: runtimeFailure }
const report = { compile: compiled, cases: [returned], failure: null }
const draft = { exerciseId: 'ch2-01', language: 'csharp', code: 'public class Solution {}', sourceRevision: 1 }

describe('C# harness JSON and catalogue schema', () => {
  const values: [ExerciseType, unknown][] = [
    ['int32', -2147483648], ['int32', 2147483647], ['boolean', false], ['string', 'Tiếng Việt 😀\n"\\'],
    ['int32[]', []], ['int32[]', [-1, 0, 2]], ['string[]', ['', 'á', '😀']],
    ['int32[][]', []], ['int32[][]', [[], []]], ['int32[][]', [[1, 2], [3, 4]]],
  ]
  it.each(values)('round-trips %s without comparison or code injection', (type, actual) => {
    const s = { parameterTypes: [type], returnType: type, sampleCount: 1 }
    expect(validateCsharpHarnessRequest({ ...request, args: [actual] }, s, 0).ok).toBe(true)
    const payload = { ...response, actual }
    expect(parseCsharpHarnessResponse(JSON.stringify(payload), s, 0)).toEqual({ ok: true, value: payload })
  })
  it('requires current Main sample index, arity, types and protocol version', () => {
    expect(validateCsharpHarnessRequest(request, schema, 0)).toEqual({ ok: true, value: request })
    for (const v of [null, {}, { ...request, protocolVersion: 2 }, { ...request, args: [1] },
      { ...request, args: [1, '2'] }, { ...request, caseIndex: 1 }, { ...request, functionName: 'Main' }]) {
      expect(validateCsharpHarnessRequest(v, schema, 0).ok).toBe(false)
    }
    expect(validateCsharpHarnessRequest(request, schema, 2).ok).toBe(false)
    expect(validateCsharpHarnessRequest(request, { ...schema, sampleCount: 0 }, 0).ok).toBe(false)
  })
  it.each([
    ['int32', 2147483648], ['int32', -2147483649], ['int32', 1.1], ['int32', NaN], ['int32', Infinity],
    ['boolean', 'false'], ['string', null], ['string', '\ud800'], ['string', '\udc00'],
    ['int32[]', [1, '2']], ['string[]', ['valid', null]], ['int32[][]', [[1], [2, 3]]], ['int32[][]', [null]],
  ] as [ExerciseType, unknown][])('rejects invalid %s value %#', (returnType, actual) => {
    expect(validateCsharpHarnessResponse({ ...response, actual }, { ...schema, returnType }, 0).ok).toBe(false)
  })
  it('rejects sparse arrays, cyclic/deep objects and malformed/multiple JSON records', () => {
    expect(validateCsharpHarnessRequest({ ...request, args: new Array(2) }, schema, 0).ok).toBe(false)
    const cycle: unknown[] = []; cycle.push(cycle)
    expect(validateCsharpHarnessResponse({ ...response, actual: cycle }, schema, 0).ok).toBe(false)
    for (const json of ['', '{', JSON.stringify(response) + '\n' + JSON.stringify(response),
      JSON.stringify({ ...response, actual: { nested: [] } }), '\ufeff' + JSON.stringify(response)]) {
      expect(parseCsharpHarnessResponse(json, schema, 0).ok).toBe(false)
    }
  })
  it('enforces exact encoded-byte boundary including framing, escaping and Unicode', () => {
    const overhead = Buffer.byteLength(JSON.stringify(response))
    const atLimit = { ...response, stdout: 'x'.repeat(EXERCISE_LIMITS.outputBytes - overhead) }
    expect(parseCsharpHarnessResponse(JSON.stringify(atLimit), schema, 0).ok).toBe(true)
    expect(validateCsharpHarnessResponse({ ...atLimit, stderr: 'x' }, schema, 0).ok).toBe(false)
    expect(parseCsharpHarnessResponse(' '.repeat(EXERCISE_LIMITS.outputBytes) + JSON.stringify(response), schema, 0).ok).toBe(false)
    expect(validateCsharpHarnessResponse({ ...response, stdout: '😀'.repeat(EXERCISE_LIMITS.outputBytes / 4) }, schema, 0).ok).toBe(false)
    expect(validateCsharpHarnessResponse({ ...response, stdout: '\0'.repeat(EXERCISE_LIMITS.outputBytes / 2) }, schema, 0).ok).toBe(false)
  })
  it('accepts only safe exception tags and never exposes exceptions/stacks as metadata', () => {
    expect(validateCsharpHarnessResponse({ ...response, stdout: '\ud800' }, schema, 0).ok).toBe(false)
    expect(validateCsharpHarnessResponse({ ...response, stderr: '\udc00' }, schema, 0).ok).toBe(false)
    for (const error of ['USER_EXCEPTION', 'INVALID_RESULT']) {
      expect(validateCsharpHarnessResponse({ protocolVersion: 1, caseIndex: 0, outcome: 'FAILED', error, stdout: '', stderr: '' }, schema, 0).ok).toBe(true)
    }
    for (const extra of [{ outcome: 'FAILED', error: 'C:\\host\\exception' }, { stack: 'raw stack' }, { exitCode: 0 }]) {
      expect(validateCsharpHarnessResponse({ ...response, ...extra }, schema, 0).ok).toBe(false)
    }
  })
  it('returns detached data after validation', () => {
    const input = { ...request, args: [1, 2] }
    const valid = validateCsharpHarnessRequest(input, schema, 0)
    input.args[0] = 99
    expect(valid.ok && valid.value.args[0]).toBe(1)
  })
})

describe('C# failure and compiler diagnostics contracts', () => {
  it.each([
    ['SDK_MISSING', 'prepare', null], ['SDK_INCOMPATIBLE', 'prepare', null], ['COMPILE_ERROR', 'compile', null],
    ['RUNTIME_ERROR', 'execute', 0], ['TIMEOUT', 'prepare', null], ['TIMEOUT', 'compile', null], ['TIMEOUT', 'execute', 1],
    ['TIMEOUT', 'operation', null], ['JOB_MEMORY_LIMIT', 'compile', null], ['JOB_MEMORY_LIMIT', 'execute', 0],
    ['OUTPUT_LIMIT', 'execute', 0], ['INFRASTRUCTURE_FAILURE', 'prepare', null], ['INFRASTRUCTURE_FAILURE', 'cleanup', null],
  ])('accepts %s at %s', (kind, phase, caseIndex) => {
    expect(validateCsharpExecutionFailure({ kind, phase, caseIndex }, 2).ok).toBe(true)
  })
  it.each([
    { kind: 'SDK_MISSING', phase: 'compile', caseIndex: null }, { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: null },
    { kind: 'COMPILE_ERROR', phase: 'compile', caseIndex: 0 }, { kind: 'TIMEOUT', phase: 'cleanup', caseIndex: null },
    { kind: 'JOB_MEMORY_LIMIT', phase: 'prepare', caseIndex: null }, { ...runtimeFailure, caseIndex: 2 },
    { ...runtimeFailure, caseIndex: -1 }, { ...runtimeFailure, caseIndex: 0.5 }, { ...runtimeFailure, win32: 5 },
    { ...runtimeFailure, kind: 'Wrong Answer' }, { ...runtimeFailure, kind: 'OutOfMemoryException' },
  ])('rejects invalid failure scope or unsafe metadata %#', v => {
    expect(validateCsharpExecutionFailure(v, 2).ok).toBe(false)
  })
  it('maps dependency/user/infra failures and each timeout without changing Common policy', () => {
    expect(CSHARP_FAILURE_END_REASON).toMatchObject({ SDK_MISSING: 'DEPENDENCY_MISSING', SDK_INCOMPATIBLE: 'INVALID_RUNTIME',
      COMPILE_ERROR: 'COMPILATION_FAILED', RUNTIME_ERROR: 'RUNTIME_FAILED', INFRASTRUCTURE_FAILURE: 'INTERNAL_ERROR' })
    expect(CSHARP_TIMEOUT_END_REASON).toEqual({ prepare: 'PREPARE_TIMEOUT', compile: 'COMPILE_TIMEOUT', execute: 'EXECUTE_TIMEOUT', operation: 'OPERATION_TIMEOUT' })
    expect(EXERCISE_LIMITS).toMatchObject({ operationMs: 60_000, cleanupWaitMs: 12_000,
      compileJobMemoryBytes: 2 * 1024 ** 3, executeJobMemoryBytes: 512 * 1024 ** 2, outputBytes: 1024 ** 2 })
  })
  it('exposes diagnostic aliases/CS codes and coordinates, without free-form messages/paths', () => {
    expect(validateCsharpCompilerDiagnostic(diagnostic).ok).toBe(true)
    expect(validateCsharpCompilerDiagnostic({ ...diagnostic, source: 'compiler', line: null, column: null }).ok).toBe(true)
    for (const extra of [{ path: 'C:\\temp\\Solution.cs' }, { message: 'raw compiler message' }, { code: '../file' },
      { line: 0 }, { column: NaN }, { source: 'C:\\temp' }, { source: 'compiler' }]) {
      expect(validateCsharpCompilerDiagnostic({ ...diagnostic, ...extra }).ok).toBe(false)
    }
  })
  it('requires compile success/error consistency and permits whole-operation timeout during compile', () => {
    expect(validateCsharpCompileResult(compiled, 2).ok).toBe(true)
    const failure = { kind: 'COMPILE_ERROR', phase: 'compile', caseIndex: null }
    const error = { ...compiled, status: 'FAILED', exitCode: 1, diagnostics: [diagnostic], failure }
    expect(validateCsharpCompileResult(error, 2).ok).toBe(true)
    for (const v of [{ ...compiled, diagnostics: [diagnostic] }, { ...compiled, exitCode: null },
      { ...error, diagnostics: [] }, { ...error, exitCode: 0 }, { ...error, failure: null }]) {
      expect(validateCsharpCompileResult(v, 2).ok).toBe(false)
    }
    expect(validateCsharpCompileResult({ ...error, diagnostics: [], exitCode: null,
      failure: { kind: 'TIMEOUT', phase: 'operation', caseIndex: null } }, 2).ok).toBe(true)
  })
})

describe('C# sample results are unjudged bounded observations', () => {
  it('separates false/zero/empty returned values from failure and validates Windows exit codes', () => {
    for (const [returnType, actual] of [['int32', 0], ['boolean', false], ['string', '']] as const) {
      expect(validateCsharpCaseResult({ ...returned, actual }, { ...schema, returnType }).ok).toBe(true)
    }
    expect(validateCsharpCaseResult(failed, schema).ok).toBe(true)
    expect(validateCsharpCaseResult({ ...failed, exitCode: 0xc0000005 }, schema).ok).toBe(true)
    for (const extra of [{ exitCode: -1 }, { exitCode: 0x1_0000_0000 }, { exitCode: 1.2 }, { actual: 0 },
      { failure: { ...runtimeFailure, caseIndex: 1 } }]) {
      expect(validateCsharpCaseResult({ ...failed, ...extra }, schema).ok).toBe(false)
    }
    expect(validateCsharpCaseResult({ ...returned, exitCode: 1 }, schema).ok).toBe(false)
  })
  it('requires successful compile before a contiguous sequential sample prefix; fails fast', () => {
    expect(validateCsharpExecutionResult({ compile: null, cases: [], failure: null }, schema).ok).toBe(true)
    expect(validateCsharpExecutionResult(report, schema).ok).toBe(true)
    expect(validateCsharpExecutionResult({ ...report, cases: [failed], failure: runtimeFailure }, schema).ok).toBe(true)
    const reordered = { caseIndex: 0, phase: 'execute', kind: 'RUNTIME_ERROR' }
    expect(validateCsharpExecutionResult({ ...report, cases: [failed], failure: reordered }, schema).ok).toBe(true)
    for (const v of [{ ...report, compile: null }, { ...report, cases: [{ ...returned, caseIndex: 1 }] },
      { ...report, cases: [returned, returned] }, { ...report, cases: [failed, { ...returned, caseIndex: 1 }], failure: runtimeFailure },
      { ...report, cases: [failed], failure: null }, { ...report, failure: runtimeFailure }]) {
      expect(validateCsharpExecutionResult(v, schema).ok).toBe(false)
    }
  })
  it('applies a single bounded report envelope, not a fresh output allowance per case', () => {
    const half = 'x'.repeat(EXERCISE_LIMITS.outputBytes / 2)
    expect(validateCsharpExecutionResult({ ...report, cases: [{ ...returned, stdout: half },
      { ...returned, caseIndex: 1, stderr: half }] }, schema).ok).toBe(false)
    expect(validateCsharpExecutionResult({ ...report, compile: { ...compiled, stdout: half }, cases: [{ ...returned, stdout: half }] }, schema).ok).toBe(false)
  })
  it.each(['expected', 'verdict', 'passed', 'accepted', 'cleanupComplete', 'workspacePath', 'pid', 'nativeHandle']) (
    'rejects unsupported public result field %s', field => {
      expect(validateCsharpExecutionResult({ ...report, [field]: 'untrusted' }, schema).ok).toBe(false)
      expect(validateCsharpCaseResult({ ...returned, [field]: 'untrusted' }, schema).ok).toBe(false)
    },
  )
  it.each(['args', 'command', 'path', 'compilerArguments', 'sdkPath', 'samples', 'customCases', 'signature']) (
    'keeps Renderer Run unable to supply %s', field => {
      expect(validateExerciseRunRequest({ ...draft, [field]: 'untrusted' }).ok).toBe(false)
      expect(validateCsharpHarnessRequest({ ...request, [field]: 'untrusted' }, schema, 0).ok).toBe(false)
    },
  )
})
