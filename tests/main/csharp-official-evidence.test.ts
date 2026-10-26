import { describe, expect, it } from 'vitest'
import { csharpOfficialResponse } from '../../src/main/services/learning/runtime/csharp-official-evidence'
import type { LearningProcessResult } from '../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { ExerciseType } from '../../src/shared/contracts/practice'

const process: LearningProcessResult = { phase: 'execute', exitCode: 0, processExited: true, stdoutSettled: true,
  stderrSettled: true, observerSettled: true, failure: null, jobMemoryLimitObserved: false }
const wire = (extra: object = {}) => JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'RETURNED', actual: 3, stdout: '', stderr: '', ...extra })
const parse = (raw: string | Uint8Array, p = process, physicalStderr = 0, type: ExerciseType = 'int32') =>
  csharpOfficialResponse(typeof raw === 'string' ? Buffer.from(raw) : raw, physicalStderr,
    { parameterTypes: [], returnType: type, sampleCount: 21 }, 0, p)

describe('C# private wire v1 evidence; no Expected or Judge input', () => {
  it.each(['USER_EXCEPTION', 'INVALID_RESULT'])('retains valid %s with exit zero', error => {
    const raw = JSON.stringify({ protocolVersion: 1, caseIndex: 0, outcome: 'FAILED', error, stdout: 'student', stderr: '' })
    expect(parse(raw)).toMatchObject({ kind: error, stdout: 'student', process: { exitCode: 0 } })
    expect(parse(raw, { ...process, exitCode: 1, failure: 'NONZERO_EXIT' })).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' })
  })
  it.each<[ExerciseType, unknown]>([['int32', -2147483648], ['boolean', false], ['string', 'Ω😀'],
    ['int32[]', [9, 8, 7]], ['string[]', ['', 'a']], ['int32[][]', [[1, 2], [3, 4]]]])('retains typed %s actual independently of problem value/length', (type, actual) => {
    expect(parse(wire({ actual }), process, 0, type)).toMatchObject({ kind: 'RETURNED', actual })
  })
  it.each([['malformed', '{bad'], ['decoded duplicate', wire().replace('"actual":3', '"actual":3,"a\\u0063tual":4')],
    ['index', wire({ caseIndex: 1 })], ['version', wire({ protocolVersion: 2 })], ['type', wire({ actual: '3' })],
    ['extra field', wire({ expected: 3 })], ['second document', wire() + '{}'], ['BOM', '\ufeff' + wire()],
    ['depth', '['.repeat(14) + '0' + ']'.repeat(14)]])('classifies %s as protocol failure', (_name, raw) => {
    expect(parse(raw)).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'MALFORMED' })
  })
  it('rejects invalid UTF8 and wire-size overflow', () => {
    expect(parse(Buffer.concat([Buffer.from(wire()), Buffer.from([255])]))).toMatchObject({ kind: 'PROTOCOL_FAILURE' })
    expect(parse(Buffer.alloc(1024 * 1024 + 1, 32))).toMatchObject({ kind: 'PROTOCOL_FAILURE' })
  })
  it('requires one response, consistent physical streams/exit and settled host facts', () => {
    expect(parse('')).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'MISSING_RESPONSE' })
    expect(parse(wire(), process, 1)).toMatchObject({ kind: 'PROTOCOL_FAILURE' })
    expect(parse(wire(), { ...process, exitCode: 17 })).toMatchObject({ kind: 'PROTOCOL_FAILURE', reason: 'UNEXPECTED_EXIT' })
    expect(parse(wire(), { ...process, observerSettled: false })).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE', reason: 'UNSETTLED' })
    expect(parse(wire(), { ...process, failure: 'INFRASTRUCTURE_FAILURE' })).toMatchObject({ kind: 'INFRASTRUCTURE_FAILURE' })
  })
  it.each(['TIMEOUT', 'CANCELLED', 'OUTPUT_LIMIT', 'JOB_MEMORY_LIMIT'] as const)('uses trusted %s ahead of apparent success', failure => {
    expect(parse(wire(), { ...process, failure, jobMemoryLimitObserved: failure === 'JOB_MEMORY_LIMIT' })).toMatchObject({ kind: 'INTERRUPTED', reason: failure })
  })
})
