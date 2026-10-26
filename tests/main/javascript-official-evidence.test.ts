import { describe, expect, it } from 'vitest'
import { javascriptOfficialResponse } from '../../src/main/services/learning/runtime/javascript-official-evidence'
import type { LearningProcessResult } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { ExerciseType } from '../../src/shared/contracts/practice'

const settled: LearningProcessResult = { phase: 'execute', exitCode: 0, processExited: true, stdoutSettled: true,
  stderrSettled: true, observerSettled: true, failure: null, jobMemoryLimitObserved: false }
const nonzero: LearningProcessResult = { ...settled, exitCode: 1, failure: 'NONZERO_EXIT' }
const wire = (extra: object = {}) => JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual: 3, stdout: '', stderr: '', ...extra })
const parse = (raw: string | Uint8Array, process = settled, stderr = 0, type: ExerciseType = 'int32') =>
  javascriptOfficialResponse(typeof raw === 'string' ? Buffer.from(raw) : raw, stderr,
    { parameterTypes: [], returnType: type, sampleCount: 128 }, 0, process)

describe('JS Official private v1 evidence; existing strict kernel/JS exit rules', () => {
  it.each(['USER_EXCEPTION', 'INVALID_RESULT'])('accepts valid %s only with JS FAILED exit1', error => {
    const raw = JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'FAILED', error, stdout: 'student', stderr: '' })
    expect(parse(raw, nonzero)).toMatchObject({ kind: error, stdout: 'student', process: { exitCode: 1 } })
    expect(parse(raw)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' })
  })
  it.each<[ExerciseType, unknown]>([['int32', -2147483648], ['boolean', false], ['string', 'Ω😀\n'],
    ['int32[]', [42]], ['string[]', ['', 'a']], ['int32[][]', [[1, 2], [3, 4]]]])('keeps typed %s actual with no Expected/value/length comparison', (type, actual) => {
    expect(parse(wire({ actual }), settled, 0, type)).toMatchObject({ kind: 'RETURNED', actual })
    expect(parse(wire({ actual }), nonzero, 0, type)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' })
  })
  it.each([['malformed', '{bad'], ['decoded duplicate', wire().replace('"actual":3', '"actual":3,"a\\u0063tual":4')],
    ['index', wire({ caseIndex: 1 })], ['version', wire({ protocolVersion: 2 })], ['type', wire({ actual: '3' })],
    ['extra field', wire({ expected: 3 })], ['second document', wire() + '{}'], ['BOM', '\ufeff' + wire()],
    ['depth', '['.repeat(14) + '0' + ']'.repeat(14)]])('classifies %s as protocol, never student error', (_name, raw) => {
    expect(parse(raw)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' })
  })
  it('rejects invalid UTF8 and wire-size overflow', () => {
    expect(parse(Buffer.concat([Buffer.from(wire()), Buffer.from([255])]))).toMatchObject({ kind: 'PROTOCOL_FAILURE' })
    expect(parse(Buffer.alloc(1024 * 1024 + 1, 32))).toMatchObject({ kind: 'PROTOCOL_FAILURE' })
  })
  it('requires physical stream/exit consistency and a response', () => {
    expect(parse('')).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'MISSING_RESPONSE' })
    expect(parse(wire(), settled, 1)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' })
    for (const process of [{ ...settled, exitCode: 17 }, { ...settled, failure: 'NONZERO_EXIT' as const }, { ...nonzero, failure: null }])
      expect(parse(wire(), process)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' })
  })
  it('keeps unsettled/host facts separate from untrusted wire data', () => {
    expect(parse(wire(), { ...settled, observerSettled: false })).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', reason: 'UNSETTLED' })
    expect(parse(wire(), { ...settled, failure: 'INFRASTRUCTURE_FAILURE' })).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', reason: 'RESOURCE_FAILURE' })
  })
  it.each(['TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'JOB_MEMORY_LIMIT'] as const)('uses trusted %s ahead of apparent success', failure => {
    expect(parse(wire(), { ...settled, failure, jobMemoryLimitObserved: failure === 'JOB_MEMORY_LIMIT' })).toMatchObject({ kind: 'INTERRUPTED', reason: failure })
  })
})
