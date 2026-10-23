import { describe, expect, it } from 'vitest'
import { javascriptObservation } from '../fixtures/learning/javascript-observation'
import {
  EXERCISE_LIMITS, validateExerciseCleanupSnapshot, validateExerciseRunRequest,
  validateExerciseSessionReference, validateExerciseSnapshot, validateExerciseStopRequest,
  type ExerciseCleanupSnapshot, type ExerciseSnapshot,
} from '../../src/shared/contracts'

const ref = { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1 }
const run = { exerciseId: 'ch2-01', language: 'csharp', code: 'int Sum(int a, int b) => a + b;', sourceRevision: 0 }
const idle: ExerciseCleanupSnapshot = {
  state: 'NOT_STARTED', proof: 'PENDING', processClean: false, cleanupComplete: false,
  workspace: 'RETAINED', pendingIo: false,
}
const clean: ExerciseCleanupSnapshot = {
  state: 'FINALIZED', proof: 'VERIFIED', processClean: true, cleanupComplete: true,
  workspace: 'REMOVED', pendingIo: false,
}
const quarantine: ExerciseCleanupSnapshot = {
  state: 'FINALIZED', proof: 'HISTORY_UNVERIFIED', processClean: false, cleanupComplete: false,
  workspace: 'QUARANTINED', pendingIo: false,
}
const snapshot: ExerciseSnapshot = {
  ...ref, exerciseId: 'ch2-01', language: 'csharp', sourceRevision: 0, sequence: 0,
  phase: 'prepare', reason: null, stdout: '', stderr: '', cleanup: idle,
}

it('validates independent JavaScript observations and rejects foreign/mixed/malformed/oversized envelopes', () => {
  const value = { ...snapshot, language: 'javascript', javascript: javascriptObservation }
  expect(validateExerciseSnapshot(value).ok).toBe(true)
  for (const bad of [
    { ...value, language: 'csharp' }, { ...value, csharp: {} },
    { ...value, javascript: { ...javascriptObservation, command: 'node' } },
    { ...value, javascript: { ...javascriptObservation, schema: { ...javascriptObservation.schema, returnType: 'boolean' } } },
    { ...value, javascript: { ...javascriptObservation, result: { ...javascriptObservation.result, compile: {} } } },
    { ...value, javascript: { ...javascriptObservation, result: { ...javascriptObservation.result, notRunCaseIndices: [0] } } },
    { ...value, stdout: 'x'.repeat(EXERCISE_LIMITS.outputBytes - 50) },
  ]) expect(validateExerciseSnapshot(bad).ok).toBe(false)
  const parsed = validateExerciseSnapshot(value)
  if (parsed.ok) { parsed.value.javascript!.result.cases[0].actual = 999; expect(javascriptObservation.result.cases[0].actual).toBe(8) }
})

describe('Exercise requests are bounded semantic capabilities', () => {
  it('accepts both languages and preserves an immutable code/revision snapshot', () => {
    for (const language of ['csharp', 'javascript']) {
      const request = { ...run, language }
      const result = validateExerciseRunRequest(request)
      expect(result).toEqual({ ok: true, value: request })
      request.code = 'changed after validation'
      if (result.ok) expect(result.value.code).toBe(run.code)
    }
  })

  it.each(['command', 'executable', 'args', 'cwd', 'path', 'projectId', 'ownerId', 'sessionId', 'generation', 'limits', 'tests']) (
    'rejects renderer authority field %s', field => {
      expect(validateExerciseRunRequest({ ...run, [field]: 'untrusted' }).ok).toBe(false)
    },
  )

  it.each([
    null, [], 'run', {}, { ...run, exerciseId: '../ch2-01' }, { ...run, language: 'python' },
    { ...run, code: 123 }, { ...run, code: 'x'.repeat(256 * 1024 + 1) },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'].map(sourceRevision => ({ ...run, sourceRevision })),
  ])('rejects malformed run request %#', request => expect(validateExerciseRunRequest(request).ok).toBe(false))

  it('retains the existing draft code ceiling including its exact boundary', () => {
    expect(validateExerciseRunRequest({ ...run, code: 'x'.repeat(256 * 1024) }).ok).toBe(true)
  })

  it('validates opaque Main references without purporting to authorize a sender', () => {
    expect(validateExerciseSessionReference(ref)).toEqual({ ok: true, value: ref })
    expect(validateExerciseSessionReference({ ...ref, ownerId: 12 }).ok).toBe(false)
    for (const sessionId of ['', 'C:\\temp\\exercise', '../session', 'run_123', 'exercise_12345678-1234-4234-8234-123456789abc\n']) {
      expect(validateExerciseSessionReference({ ...ref, sessionId }).ok).toBe(false)
    }
    for (const generation of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateExerciseSessionReference({ ...ref, generation }).ok).toBe(false)
    }
  })

  it('only accepts the two renderer lifecycle stop reasons', () => {
    for (const reason of ['CONTEXT_CHANGED', 'LEARNING_LEFT']) {
      expect(validateExerciseStopRequest({ ...ref, reason }).ok).toBe(true)
    }
    for (const reason of ['SHUTDOWN', 'OWNER_LOST', 'JOB_MEMORY_LIMIT', 'USER_STOP', undefined]) {
      expect(validateExerciseStopRequest({ ...ref, reason }).ok).toBe(false)
    }
    expect(validateExerciseStopRequest({ ...ref, reason: 'LEARNING_LEFT', pid: 1 }).ok).toBe(false)
  })
})

describe('Policy B public cleanup invariants', () => {
  it('distinguishes clean finalization from acknowledged historical quarantine', () => {
    expect(validateExerciseCleanupSnapshot(clean)).toEqual({ ok: true, value: clean })
    expect(validateExerciseCleanupSnapshot(quarantine)).toEqual({ ok: true, value: quarantine })
  })

  it('permits retained unresolved ownership and pending I/O without false finalization', () => {
    expect(validateExerciseCleanupSnapshot({ ...idle, state: 'FAILED', proof: 'PROCESS_UNRESOLVED' }).ok).toBe(true)
    expect(validateExerciseCleanupSnapshot({ ...idle, state: 'FAILED', proof: 'VERIFIED', pendingIo: true }).ok).toBe(true)
    expect(validateExerciseCleanupSnapshot({ ...clean, state: 'FAILED', cleanupComplete: false, workspace: 'DELETE_PENDING' }).ok).toBe(true)
  })

  it.each([
    { ...quarantine, processClean: true }, { ...quarantine, cleanupComplete: true },
    { ...quarantine, workspace: 'REMOVED' }, { ...quarantine, pendingIo: true },
    { ...clean, proof: 'PROCESS_UNRESOLVED' }, { ...clean, pendingIo: true },
    { ...clean, state: 'PENDING' }, { ...clean, cleanupComplete: false },
    { ...idle, workspace: 'DELETE_PENDING' }, { ...idle, workspace: 'REMOVED' },
    { ...idle, pendingIo: true }, { ...idle, state: 'FINALIZED' },
    { ...idle, nativeHandle: 12 }, { ...idle, proof: 'TOTAL_PROCESSES_MISMATCH' },
  ])('rejects false clean/finalized or privileged cleanup payload %#', value => {
    expect(validateExerciseCleanupSnapshot(value).ok).toBe(false)
  })
})

describe('Exercise snapshot boundary', () => {
  it('validates and detaches the typed C# result/schema without accepting privileged fields', () => {
    const csharp = { schema: { parameterTypes: ['int32' as const], returnType: 'boolean' as const, sampleCount: 2 },
      result: { compile: { status: 'SUCCEEDED' as const, exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null },
        cases: [{ caseIndex: 0, outcome: 'RETURNED' as const, actual: false, stdout: '', stderr: '', exitCode: 0, failure: null }],
        notRunCaseIndices: [1], failure: null } }
    const checked = validateExerciseSnapshot({ ...snapshot, csharp })
    expect(checked.ok).toBe(true)
    csharp.result.cases[0].actual = true
    if (checked.ok) expect(checked.value.csharp?.result.cases[0].actual).toBe(false)
    for (const value of [
      { ...snapshot, language: 'javascript', csharp },
      { ...snapshot, csharp: { ...csharp, command: 'secret' } },
      { ...snapshot, csharp: { ...csharp, schema: { ...csharp.schema, path: 'secret' } } },
      { ...snapshot, csharp: { ...csharp, result: { ...csharp.result, notRunCaseIndices: [0] } } },
      { ...snapshot, csharp: { ...csharp, schema: { ...csharp.schema, returnType: 'int32' } } },
    ]) expect(validateExerciseSnapshot(value).ok).toBe(false)
    csharp.result.cases[0].stdout = 'x'.repeat(EXERCISE_LIMITS.outputBytes - 450)
    // Individually bounded result + transport envelope must fit together.
    expect(validateExerciseSnapshot({ ...snapshot, csharp }).ok).toBe(false)
  })
  it('accepts active, cleanup-pending, clean and quarantined snapshots', () => {
    const values = [snapshot,
      { ...snapshot, phase: 'cleanup', reason: 'EXECUTE_TIMEOUT', cleanup: { ...idle, state: 'PENDING', pendingIo: true } },
      { ...snapshot, phase: 'finished', reason: 'COMPLETED', cleanup: clean },
      { ...snapshot, phase: 'finished', reason: 'CONTEXT_CHANGED', cleanup: quarantine },
    ]
    for (const value of values) expect(validateExerciseSnapshot(value)).toEqual({ ok: true, value })
  })

  it.each([
    { ...snapshot, phase: 'finished' }, { ...snapshot, reason: 'COMPLETED' },
    { ...snapshot, phase: 'cleanup', cleanup: clean }, { ...snapshot, cleanup: quarantine },
    { ...snapshot, phase: 'cleanup', reason: 'EXECUTE_TIMEOUT', cleanup: idle },
    { ...snapshot, phase: 'execute', reason: 'Accepted' }, { ...snapshot, sequence: -1 },
    { ...snapshot, sourceRevision: 0.5 }, { ...snapshot, sequence: Infinity },
    { ...snapshot, language: 'typescript' }, { ...snapshot, rootPid: 1 },
    { ...snapshot, workspacePath: 'C:\\temp' }, { ...snapshot, cleanup: { ...idle, jobHandle: 12 } },
  ])('rejects contradictory phases, unsafe fields or invalid counters %#', value => {
    expect(validateExerciseSnapshot(value).ok).toBe(false)
  })

  it('enforces the combined UTF-8 output cap with exact ASCII and Unicode boundaries', () => {
    const half = EXERCISE_LIMITS.outputBytes / 2
    expect(validateExerciseSnapshot({ ...snapshot, stdout: 'a'.repeat(half), stderr: 'b'.repeat(half) }).ok).toBe(true)
    expect(validateExerciseSnapshot({ ...snapshot, stdout: 'a'.repeat(half), stderr: 'b'.repeat(half + 1) }).ok).toBe(false)
    const unicode = '😀'.repeat(EXERCISE_LIMITS.outputBytes / 4)
    expect(validateExerciseSnapshot({ ...snapshot, stdout: unicode }).ok).toBe(true)
    expect(validateExerciseSnapshot({ ...snapshot, stdout: unicode, stderr: 'é' }).ok).toBe(false)
    expect(validateExerciseSnapshot({ ...snapshot, stdout: 12 }).ok).toBe(false)
  })
})
