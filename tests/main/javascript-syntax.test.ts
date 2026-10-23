import { describe, expect, it } from 'vitest'
import { javascriptSyntaxObservation, javascriptProcessFailure } from '../../src/main/services/learning/runtime/javascript-syntax'
import { validateJavascriptSyntaxResult } from '../../src/shared/contracts/javascript-execution-validation'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'
import { probeContext } from '../fixtures/learning/javascript-node-files'

describe('JavaScript syntax protocol and failure separation', () => {
  it('recognizes only exact fixed frames and exit codes', () => {
    const good = javascriptSyntaxObservation(Buffer.from('{"status":"SUCCEEDED"}'), 0, 0)
    expect(good).toMatchObject({ status: 'SUCCEEDED', failure: null, diagnostics: [] })
    expect(validateJavascriptSyntaxResult(good, 1).ok).toBe(true)
    const bad = javascriptSyntaxObservation(Buffer.from('{"status":"FAILED","code":"SYNTAX_ERROR"}'), 0, 1)
    expect(bad).toMatchObject({ status: 'FAILED', failure: { kind: 'SYNTAX_ERROR' }, diagnostics: [{ code: 'SYNTAX_ERROR', source: 'solution', line: null, column: null }] })
    expect(validateJavascriptSyntaxResult(bad, 1).ok).toBe(true)
  })
  it.each([
    ['', 0], ['{"status":"SUCCEEDED"}', 1], ['{"status":"SUCCEEDED"} ', 0],
    ['{"status":"SUCCEEDED"}{"status":"SUCCEEDED"}', 0], ['{"status":"SUCCEEDED","status":"SUCCEEDED"}', 0],
    ['{"status":"FAILED","code":"SYNTAX_ERROR"}', 0], ['\ufeff{"status":"SUCCEEDED"}', 0], ['raw path/stack', 1],
  ] as const)('classifies invalid syntax transport %# as protocol failure', (text, exit) => {
    expect(javascriptSyntaxObservation(Buffer.from(text), 0, exit).failure?.kind).toBe('PROTOCOL_FAILURE')
  })
  it('rejects malformed UTF-8 and unexpected raw stderr', () => {
    expect(javascriptSyntaxObservation(Buffer.from([0xff]), 0, 0).failure?.kind).toBe('PROTOCOL_FAILURE')
    expect(javascriptSyntaxObservation(Buffer.from('{"status":"SUCCEEDED"}'), 1, 0).failure?.kind).toBe('PROTOCOL_FAILURE')
  })
  it.each(['PREPARE_TIMEOUT', 'COMPILE_TIMEOUT', 'EXECUTE_TIMEOUT', 'OPERATION_TIMEOUT', 'OUTPUT_LIMIT', 'JOB_MEMORY_LIMIT'] as const)(
    'preserves authoritative Common reason %s', reason => {
      const context = probeContext(), controller = new AbortController()
      controller.abort(exerciseCoreError(reason))
      const f = javascriptProcessFailure({ ...context, signal: controller.signal }, 'execute', Error(), null)
      expect(f.kind).toBe(reason.endsWith('_TIMEOUT') ? 'TIMEOUT' : reason)
      expect(f.phase).toBe(reason === 'OPERATION_TIMEOUT' ? 'operation' : 'execute')
    },
  )
  it('does not publish owner cancellation as runtime failure or infer memory from an OOM exception', () => {
    const controller = new AbortController(); controller.abort(exerciseCoreError('OWNER_LOST'))
    expect(() => javascriptProcessFailure({ ...probeContext(), signal: controller.signal }, 'compile', Error('cancel'), null)).toThrow()
    expect(javascriptProcessFailure(probeContext(), 'execute', Error('V8 OOM'), null).kind).toBe('INFRASTRUCTURE_FAILURE')
  })
})
