import { describe, expect, it } from 'vitest'
import { reduceJudgeVerdict } from '../../src/main/services/learning/judge/verdict-reducer'
import type { JudgeEligibilityInput, JudgeVerdict } from '../../src/main/services/learning/judge/judge-contracts'
import type { OfficialCaseObservation, OfficialExecutionCompletion } from '../../src/main/services/learning/runtime/official-execution-contracts'
import type { ExerciseCleanupSnapshot } from '../../src/shared/contracts/exercise'
import type { CsharpCompileResult } from '../../src/shared/contracts/csharp-execution'

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
type Input = Mutable<JudgeEligibilityInput>
type Completion = Mutable<OfficialExecutionCompletion>
const cleaned = (): ExerciseCleanupSnapshot => ({ state: 'FINALIZED', proof: 'VERIFIED', processClean: true,
  cleanupComplete: true, workspace: 'REMOVED', pendingIo: false })
function fixture(language: 'csharp' | 'javascript' = 'csharp', count = 3) {
  const plan = { exerciseId: 'synthetic', packageVersion: 1, testSetId: 'official', testSetVersion: 1,
    signatureVersion: 1, signatureHash: 'a'.repeat(64), officialHash: 'b'.repeat(64), comparatorId: 'exact-typed' as const, comparatorVersion: 1 as const }
  const identity = { ownerId: 7, ownerEntry: {}, session: { sessionId: 'session', generation: 2 }, plan, language,
    sourceRevision: 8, sourceHash: 'c'.repeat(64) }
  const cases: Mutable<OfficialCaseObservation>[] = Array.from({ length: count }, (_, caseIndex) => ({ caseIndex, language,
    kind: 'RETURNED', actual: 1, stdout: '', stderr: '', process: { phase: 'execute', exitCode: 0, processExited: true,
      stdoutSettled: true, stderrSettled: true, observerSettled: true, failure: null, jobMemoryLimitObserved: false } }))
  const c: Completion = { identity: { ...plan }, planAcquired: true, disposition: 'EXHAUSTED', compile: {
    status: 'SUCCEEDED', exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null }, cases,
    notRunCaseIndices: [], failure: null, endReason: 'COMPLETED', cleanup: cleaned() }
  const input: Input = { identity, operationIdentity: { ...identity, session: { ...identity.session }, plan: { ...plan } }, completion: c,
    caseCount: count, comparisons: cases.map((_, caseIndex) => ({ caseIndex, result: 'PASS', barrierVerified: true })), ownerCurrent: true,
    decisionSecuredBeforeClose: true, cleanup: { snapshot: cleaned(), executionDone: true, ownsResources: false,
      retainedPackageTasks: 0, representationBorrows: 0, contentReleased: true } }
  return { input, c }
}
function prefix(input: Input, c: Completion, attempted: number) {
  c.cases = c.cases.slice(0, attempted)
  input.comparisons = input.comparisons.slice(0, attempted)
  c.notRunCaseIndices = Array.from({ length: input.caseCount! - attempted }, (_, i) => attempted + i)
}
function wrong(index = 1) {
  const f = fixture(); prefix(f.input, f.c, index + 1)
  f.input.comparisons[index].result = 'DIFFERENT'; f.c.disposition = 'CONSUMER_STOP'
  return f
}
function failed(kind: 'USER_EXCEPTION' | 'INVALID_RESULT' | 'PROTOCOL_FAILURE' | 'INFRASTRUCTURE_FAILURE', language: 'csharp' | 'javascript' = 'csharp') {
  const f = fixture(language); prefix(f.input, f.c, 2); f.input.comparisons.pop()
  const prior = f.c.cases[1]
  f.c.cases[1] = kind === 'USER_EXCEPTION' || kind === 'INVALID_RESULT'
    ? { caseIndex: 1, language, kind, stdout: '', stderr: 'private', process: { ...prior.process!,
      exitCode: language === 'javascript' ? 1 : 0, failure: language === 'javascript' ? 'NONZERO_EXIT' : null } }
    : kind === 'PROTOCOL_FAILURE' ? { caseIndex: 1, language, kind, reason: 'MALFORMED', process: prior.process }
      : { caseIndex: 1, language, kind, reason: 'UNKNOWN', process: prior.process }
  f.c.disposition = 'EXECUTION_FAILURE'
  f.c.failure = { kind: kind === 'INFRASTRUCTURE_FAILURE' ? 'INFRASTRUCTURE_FAILURE'
    : kind === 'PROTOCOL_FAILURE' && language === 'javascript' ? 'PROTOCOL_FAILURE' : 'RUNTIME_ERROR', phase: 'execute', caseIndex: 1 }
  f.c.endReason = kind === 'INFRASTRUCTURE_FAILURE' || kind === 'PROTOCOL_FAILURE' && language === 'javascript' ? 'INTERNAL_ERROR' : 'RUNTIME_FAILED'
  return f
}
function expectFinal(input: Input, verdict: JudgeVerdict, eligible: 'ACCEPTED_CANDIDATE' | 'GRADED_FAILURE_CANDIDATE' | 'INELIGIBLE') {
  const result = reduceJudgeVerdict(input)
  expect(result.state).toBe('FINAL'); expect(result.verdict).toBe(verdict); expect(result.eligibility.kind).toBe(eligible)
  expect(result.eligibility.acceptedCandidateEligible && result.eligibility.gradedFailureCandidateEligible).toBe(false)
  return result
}

describe('pure Main-private verdict/eligibility reduction', () => {
  it.each(['csharp', 'javascript'] as const)('accepts only the full %s all-pass candidate', language => {
    const { input } = fixture(language)
    const result = expectFinal(input, 'Accepted', 'ACCEPTED_CANDIDATE')
    expect([result.requiredCases, result.attemptedCases, result.comparedCases, result.passedCases]).toEqual([3, 3, 3, 3])
    expect(result.notRunCaseIndices).toEqual([])
    expect(result.decisions.every(d => d.kind === 'COMPARED' && d.result === 'PASS')).toBe(true)
  })
  it.each([0, 1, 2])('preserves first/middle/final WA at %i and exact untouched suffix', index => {
    const { input } = wrong(index)
    const result = expectFinal(input, 'WrongAnswer', 'GRADED_FAILURE_CANDIDATE')
    expect(result.attemptedCases).toBe(index + 1); expect(result.passedCases).toBe(index)
    expect(result.notRunCaseIndices).toEqual(Array.from({ length: 2 - index }, (_, i) => index + 1 + i))
    expect(result.decisions).toHaveLength(index + 1)
  })
  it.each(['csharp', 'javascript'] as const)('requires trusted %s USER_EXCEPTION/INVALID_RESULT envelope evidence', language => {
    for (const kind of ['USER_EXCEPTION', 'INVALID_RESULT'] as const) {
      const { input } = failed(kind, language)
      const result = expectFinal(input, 'RuntimeError', 'GRADED_FAILURE_CANDIDATE')
      expect(result.decisions[1]).toEqual({ caseIndex: 1, kind: 'EXECUTION_FAILURE', verdict: 'RuntimeError' })
      expect(result.comparedCases).toBe(1)
    }
  })
  it.each(['csharp', 'javascript'] as const)('preserves protocol/infrastructure as ungraded in %s', language => {
    for (const kind of ['PROTOCOL_FAILURE', 'INFRASTRUCTURE_FAILURE'] as const) {
      const { input } = failed(kind, language)
      expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    }
  })
  it.each(['csharp', 'javascript'] as const)('reduces trusted %s compile/syntax failure with zero cases', language => {
    const { input, c } = fixture(language); prefix(input, c, 0)
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'COMPILATION_FAILED'
    if (language === 'csharp') {
      c.failure = { kind: 'COMPILE_ERROR', phase: 'compile', caseIndex: null }
      c.compile = { status: 'FAILED', exitCode: 1, stdout: '', stderr: '', failure: c.failure,
        diagnostics: [{ code: 'CS1503', source: 'harness', severity: 'error', line: 1, column: 1 }] }
    } else {
      c.failure = { kind: 'SYNTAX_ERROR', phase: 'compile', caseIndex: null }
      c.compile = { status: 'FAILED', exitCode: 1, stdout: '', stderr: '', failure: c.failure,
        diagnostics: [{ code: 'SYNTAX_ERROR', source: 'solution', line: null, column: null }] }
    }
    const result = expectFinal(input, language === 'csharp' ? 'CompilationError' : 'SyntaxError', 'GRADED_FAILURE_CANDIDATE')
    expect(result.decisions).toEqual([]); expect(result.attemptedCases).toBe(0); expect(result.notRunCaseIndices).toEqual([0, 1, 2])
  })
  it('does not infer a compile grade from diagnostic text or mixed/ambiguous compiler failure', () => {
    const { input, c } = fixture(); prefix(input, c, 0)
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'COMPILATION_FAILED'
    const failure = { kind: 'INFRASTRUCTURE_FAILURE' as const, phase: 'compile' as const, caseIndex: null }
    c.failure = failure
    c.compile = { status: 'FAILED', exitCode: 1, stdout: '', stderr: 'CS0006 out of memory user error', failure,
      diagnostics: [{ code: 'CS1503', source: 'harness', severity: 'error', line: 1, column: 1 },
        { code: 'CS0006', source: 'compiler', severity: 'error', line: null, column: null }] }
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it.each(['TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT'] as const)('uses trusted execute %s without comparison or invented rows', kind => {
    const { input, c } = fixture(); prefix(input, c, 2); input.comparisons.pop()
    c.cases[1] = { caseIndex: 1, language: 'csharp', kind: 'INTERRUPTED', reason: kind, process: null }
    c.disposition = 'EXECUTION_FAILURE'; c.failure = { kind, phase: 'execute', caseIndex: 1 }
    c.endReason = kind === 'TIMEOUT' ? 'EXECUTE_TIMEOUT' : kind
    const verdict = kind === 'TIMEOUT' ? 'TimeLimitExceeded' : kind === 'JOB_MEMORY_LIMIT' ? 'MemoryLimitExceeded' : 'OutputLimitExceeded'
    expectFinal(input, verdict, 'GRADED_FAILURE_CANDIDATE')
  })
  it.each(['PREPARE_TIMEOUT', 'COMPILE_TIMEOUT', 'EXECUTE_TIMEOUT', 'OPERATION_TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT'] as const)(
    'preserves authoritative Core cause %s', reason => {
      const { input, c } = fixture()
      if (reason === 'PREPARE_TIMEOUT' || reason === 'COMPILE_TIMEOUT') { prefix(input, c, 0); c.compile = null }
      c.disposition = 'EXECUTION_FAILURE'; c.endReason = reason
      c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
      const verdict = reason === 'JOB_MEMORY_LIMIT' ? 'MemoryLimitExceeded' : reason === 'OUTPUT_LIMIT' ? 'OutputLimitExceeded' : 'TimeLimitExceeded'
      expectFinal(input, verdict, 'GRADED_FAILURE_CANDIDATE')
    })
  it.each(['OPERATION_TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT'] as const)('supersedes provisional WA with Core %s, retaining its compared row', reason => {
    const { input, c } = wrong(); c.disposition = 'EXECUTION_FAILURE'; c.endReason = reason; input.decisionSecuredBeforeClose = false
    c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
    const verdict = reason === 'OPERATION_TIMEOUT' ? 'TimeLimitExceeded' : reason === 'JOB_MEMORY_LIMIT' ? 'MemoryLimitExceeded' : 'OutputLimitExceeded'
    const result = expectFinal(input, verdict, 'GRADED_FAILURE_CANDIDATE')
    expect(result.decisions[1]).toEqual({ kind: 'COMPARED', caseIndex: 1, result: 'DIFFERENT' })
  })
  it('uses Core first cause rather than inventing quota ranking', () => {
    const { input, c } = failed('USER_EXCEPTION'); c.endReason = 'OPERATION_TIMEOUT'
    c.failure = { kind: 'JOB_MEMORY_LIMIT', phase: 'execute', caseIndex: 1 }
    expectFinal(input, 'TimeLimitExceeded', 'GRADED_FAILURE_CANDIDATE')
    c.endReason = 'RUNTIME_FAILED'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('never allows a parsed RETURNED/WA envelope to overrule trusted late process quota and Core cause', () => {
    const { input, c } = wrong(); c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'JOB_MEMORY_LIMIT'
    c.cases[1].process!.jobMemoryLimitObserved = true
    c.cases[1].process!.failure = 'JOB_MEMORY_LIMIT'
    c.failure = { kind: 'JOB_MEMORY_LIMIT', phase: 'execute', caseIndex: 1 }
    expectFinal(input, 'MemoryLimitExceeded', 'GRADED_FAILURE_CANDIDATE')
    c.endReason = 'OPERATION_TIMEOUT'
    expectFinal(input, 'TimeLimitExceeded', 'GRADED_FAILURE_CANDIDATE')
    c.endReason = 'RUNTIME_FAILED'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('does not infer TLE from an unsecured decision without trusted timeout evidence', () => {
    const { input } = wrong(); input.decisionSecuredBeforeClose = false
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it.each(['TIMEOUT', 'JOB_MEMORY_LIMIT', 'OUTPUT_LIMIT'] as const)('retains trusted compile %s and its phase without case rows', kind => {
    const { input, c } = fixture(); prefix(input, c, 0)
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = kind === 'TIMEOUT' ? 'COMPILE_TIMEOUT' : kind
    const failure = { kind, phase: 'compile' as const, caseIndex: null }
    c.failure = failure
    c.compile = { status: 'FAILED', exitCode: null, diagnostics: [], stdout: '', stderr: '', failure }
    const result = expectFinal(input, kind === 'TIMEOUT' ? 'TimeLimitExceeded' : kind === 'JOB_MEMORY_LIMIT' ? 'MemoryLimitExceeded' : 'OutputLimitExceeded', 'GRADED_FAILURE_CANDIDATE')
    expect(result.failure).toEqual(failure); expect(result.endReason).toBe(c.endReason); expect(result.decisions).toEqual([])
  })
  it('supports existing JavaScript Prepare-probe quota facts without inventing a case', () => {
    const { input, c } = fixture('javascript'); prefix(input, c, 0); c.compile = null
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'JOB_MEMORY_LIMIT'
    c.failure = { kind: 'JOB_MEMORY_LIMIT', phase: 'prepare', caseIndex: null }
    expectFinal(input, 'MemoryLimitExceeded', 'GRADED_FAILURE_CANDIDATE')
    c.planAcquired = false; input.caseCount = null; c.notRunCaseIndices = []
    const result = expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    expect(result.provisionalVerdict).toBe('MemoryLimitExceeded')
  })
  it('requires source syntax attribution rather than harness syntax error', () => {
    const { input, c } = fixture('javascript'); prefix(input, c, 0)
    const failure = { kind: 'SYNTAX_ERROR' as const, phase: 'compile' as const, caseIndex: null }
    c.failure = failure; c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'COMPILATION_FAILED'
    c.compile = { status: 'FAILED', exitCode: 1, stdout: '', stderr: '', failure,
      diagnostics: [{ code: 'SYNTAX_ERROR', source: 'harness', line: null, column: null }] }
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it.each(['OWNER_LOST', 'CONTEXT_CHANGED', 'LEARNING_LEFT', 'SHUTDOWN'] as const)('suppresses success on %s', reason => {
    const { input, c } = wrong(); c.disposition = 'INVALIDATED'; c.endReason = reason
    const result = expectFinal(input, 'CancelledInvalidated', 'INELIGIBLE')
    expect(result.provisionalVerdict).toBe('WrongAnswer')
  })
  it.each(['ownerCurrent', 'ownerId', 'ownerEntry', 'sessionId', 'generation'] as const)('rejects stale binding fact %s without claiming authority', field => {
    const { input } = fixture()
    if (field === 'ownerCurrent') input.ownerCurrent = false
    if (field === 'ownerId') input.operationIdentity.ownerId++
    if (field === 'ownerEntry') input.operationIdentity.ownerEntry = {}
    if (field === 'sessionId') input.operationIdentity.session.sessionId = 'replacement'
    if (field === 'generation') input.operationIdentity.session.generation++
    expectFinal(input, 'CancelledInvalidated', 'INELIGIBLE')
  })
  it.each(['packageVersion', 'testSetVersion', 'signatureVersion', 'exerciseId', 'testSetId', 'officialHash', 'signatureHash', 'comparatorId', 'comparatorVersion'] as const)(
    'checks exact acquired plan field %s', field => {
      const { input, c } = fixture()
      Object.assign(c.identity, { [field]: typeof c.identity[field] === 'number' ? 2 : 'different' })
      expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    })
  it.each(['language', 'sourceRevision', 'sourceHash', 'plan'] as const)('checks observed operation %s', field => {
    const { input } = fixture()
    if (field === 'language') input.operationIdentity.language = 'javascript'
    if (field === 'sourceRevision') input.operationIdentity.sourceRevision++
    if (field === 'sourceHash') input.operationIdentity.sourceHash = 'd'.repeat(64)
    if (field === 'plan') input.operationIdentity.plan.packageVersion++
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('never turns unavailable plan into empty Accepted or fabricates a suffix', () => {
    const { input, c } = fixture(); c.planAcquired = false; input.caseCount = null; c.cases = []; c.compile = null
    input.comparisons = []; c.notRunCaseIndices = []; c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'PREPARATION_FAILED'
    c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'prepare', caseIndex: null }
    const result = expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    expect(result.requiredCases).toBeNull(); expect(result.notRunCaseIndices).toEqual([]); expect(result.decisions).toEqual([])
    c.notRunCaseIndices = [0, 1, 2]
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it.each([0, -1, 129, 1.5, NaN, null])('rejects invalid acquired count %s', n => {
    const { input } = fixture(); input.caseCount = n
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  const mutations: [string, (input: Input, c: Completion) => void][] = [
    ['missing row', (_i, c) => { c.cases.pop() }],
    ['duplicate row', (_i, c) => { c.cases[1].caseIndex = 0 }],
    ['out of order', (_i, c) => { c.cases.reverse() }],
    ['out of range', (_i, c) => { c.cases[2].caseIndex = 3 }],
    ['wrong language', (_i, c) => { c.cases[1].language = 'javascript' }],
    ['sparse prefix', (_i, c) => { c.cases = new Array(3) }],
    ['missing comparison', (i) => { i.comparisons.pop() }],
    ['duplicate comparison', i => { i.comparisons[1].caseIndex = 0 }],
    ['unverified case barrier', i => { i.comparisons[1].barrierVerified = false }],
    ['bad suffix', (i, c) => { prefix(i, c, 1); c.notRunCaseIndices = [1, 1] }],
    ['sparse suffix', (i, c) => { prefix(i, c, 1); c.notRunCaseIndices = new Array(2) }],
    ['overlapping suffix', (i, c) => { prefix(i, c, 1); c.notRunCaseIndices = [0, 2] }],
    ['STOP without WA', (_i, c) => { c.disposition = 'CONSUMER_STOP' }],
    ['EXHAUSTED after WA', i => { i.comparisons[2].result = 'DIFFERENT' }],
    ['cases after WA', i => { i.comparisons[0].result = 'DIFFERENT' }],
    ['RETURNED without settled process', (_i, c) => { c.cases[2].process = null }],
    ['unexpected successful exit', (_i, c) => { c.cases[2].process!.exitCode = 1 }],
    ['wrong failure index', (_i, c) => { c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'RUNTIME_FAILED'; c.failure = { kind: 'RUNTIME_ERROR', phase: 'execute', caseIndex: 0 } }],
  ]
  it.each(mutations)('rejects inconsistent evidence: %s', (_name, mutate) => {
    const { input, c } = fixture(); mutate(input, c)
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it.each(['INVALID_ACTUAL', 'INVALID_EXPECTED', 'INVALID_CONFIGURATION'] as const)('never grades comparator %s as student Runtime Error', result => {
    const { input, c } = fixture(); prefix(input, c, 1); input.comparisons[0].result = result
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'INTERNAL_ERROR'; c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('does not infer student crash/MLE from nonzero exit/stderr or coarse RUNTIME_ERROR', () => {
    const { input, c } = failed('PROTOCOL_FAILURE'); c.cases[1].process!.exitCode = 137
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    c.cases[1] = { ...c.cases[1], kind: 'PROTOCOL_FAILURE', reason: 'MISSING_RESPONSE' }
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('rejects a successful compile with error diagnostics and failed compile without trusted attribution', () => {
    const { input, c } = fixture()
    ;(c.compile as CsharpCompileResult).diagnostics.push({ code: 'CS1503', source: 'harness', severity: 'error', line: 1, column: 1 })
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    prefix(input, c, 0); c.compile = { status: 'FAILED', exitCode: 1, failure: null, diagnostics: [], stdout: '', stderr: 'syntax error' }
    c.disposition = 'EXECUTION_FAILURE'; c.endReason = 'COMPILATION_FAILED'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('returns pending without a completion and blocks all grade eligibility', () => {
    const { input } = fixture(); input.completion = null
    const result = reduceJudgeVerdict(input)
    expect(result.state).toBe('PENDING'); expect(result.verdict).toBeNull(); expect(result.eligibility.kind).toBe('INELIGIBLE')
  })
  it.each(['NOT_STARTED', 'PENDING', 'FAILED'] as const)('blocks cleanup %s while preserving provisional WA', state => {
    const { input, c } = wrong()
    const snapshot: ExerciseCleanupSnapshot = { ...cleaned(), state, proof: 'PENDING', workspace: 'RETAINED', cleanupComplete: false }
    input.cleanup.snapshot = snapshot; c.cleanup = { ...snapshot }; input.cleanup.contentReleased = false
    const result = reduceJudgeVerdict(input)
    expect(result.state).toBe(state === 'FAILED' ? 'FINAL' : 'PENDING')
    expect(result.provisionalVerdict).toBe('WrongAnswer'); expect(result.eligibility.kind).toBe('INELIGIBLE')
  })
  const cleanupMutations: [string, (i: Input) => void][] = [
    ['HISTORY_UNVERIFIED', i => { i.cleanup.snapshot.proof = 'HISTORY_UNVERIFIED' }],
    ['PROCESS_UNRESOLVED', i => { i.cleanup.snapshot.proof = 'PROCESS_UNRESOLVED' }],
    ['proof pending', i => { i.cleanup.snapshot.proof = 'PENDING' }],
    ['process dirty', i => { i.cleanup.snapshot.processClean = false }],
    ['cleanup incomplete', i => { i.cleanup.snapshot.cleanupComplete = false }],
    ['workspace retained', i => { i.cleanup.snapshot.workspace = 'RETAINED' }],
    ['workspace deleting', i => { i.cleanup.snapshot.workspace = 'DELETE_PENDING' }],
    ['workspace quarantined', i => { i.cleanup.snapshot.workspace = 'QUARANTINED' }],
    ['pending I/O', i => { i.cleanup.snapshot.pendingIo = true }],
    ['execution pending', i => { i.cleanup.executionDone = false }],
    ['owned resources', i => { i.cleanup.ownsResources = true }],
    ['Registry work', i => { i.cleanup.retainedPackageTasks = 1 }],
    ['retained borrow', i => { i.cleanup.representationBorrows = 1 }],
    ['release pending', i => { i.cleanup.contentReleased = false }],
    ['release failed', i => { i.cleanup.contentReleased = false; i.cleanup.contentReleaseFailed = true }],
    ['negative task count', i => { i.cleanup.retainedPackageTasks = -1 }],
    ['NaN borrow count', i => { i.cleanup.representationBorrows = NaN }],
  ]
  it.each(cleanupMutations)('eligibility truth table blocks %s for Accepted and WA', (_name, mutate) => {
    for (const { input, c } of [fixture(), wrong()]) {
      mutate(input); c.cleanup = { ...input.cleanup.snapshot }
      const result = reduceJudgeVerdict(input)
      expect(result.eligibility.kind).toBe('INELIGIBLE')
      expect(result.eligibility.acceptedCandidateEligible).toBe(false); expect(result.eligibility.gradedFailureCandidateEligible).toBe(false)
      expect(result.verdict).not.toBe('Accepted')
    }
  })
  it('rejects a mixed stale cleanup snapshot instead of combining unrelated facts', () => {
    const { input, c } = fixture(); c.cleanup.proof = 'HISTORY_UNVERIFIED'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('does not reinterpret cleanup caller wait as execution timeout or erase prior WA', () => {
    const { input, c } = wrong(); c.disposition = 'EXECUTION_FAILURE'; c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
    input.cleanup.snapshot.state = 'PENDING'; input.cleanup.snapshot.cleanupComplete = false; input.cleanup.contentReleased = false
    c.cleanup = { ...input.cleanup.snapshot }
    const result = reduceJudgeVerdict(input)
    expect(result.state).toBe('PENDING'); expect(result.provisionalVerdict).toBe('WrongAnswer')
    expect(result.decisions[1]).toEqual({ kind: 'COMPARED', caseIndex: 1, result: 'DIFFERENT' })
  })
  it('retains a trusted compile failure provisionally when cleanup fails', () => {
    const { input, c } = fixture(); prefix(input, c, 0)
    const failure = { kind: 'COMPILE_ERROR' as const, phase: 'compile' as const, caseIndex: null }
    c.compile = { status: 'FAILED', exitCode: 1, stdout: '', stderr: '', failure,
      diagnostics: [{ code: 'CS1503', source: 'harness', severity: 'error', line: 1, column: 1 }] }
    c.failure = { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup', caseIndex: null }
    c.endReason = 'COMPILATION_FAILED'; c.disposition = 'EXECUTION_FAILURE'
    input.cleanup.snapshot.state = 'FAILED'; input.cleanup.snapshot.cleanupComplete = false; input.cleanup.contentReleased = false
    c.cleanup = { ...input.cleanup.snapshot }
    const result = expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    expect(result.provisionalVerdict).toBe('CompilationError'); expect(result.decisions).toEqual([])
  })
  it('treats late process settlement and failure/disposition conflicts as infrastructure', () => {
    const { input, c } = failed('USER_EXCEPTION', 'javascript')
    c.cases[1].process!.observerSettled = false
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    c.cases[1].process!.observerSettled = true; c.endReason = 'COMPLETED'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
    c.endReason = 'PREPARE_TIMEOUT'
    expectFinal(input, 'InfrastructureFailure', 'INELIGIBLE')
  })
  it('does not retain private payloads or mutate frozen input facts', () => {
    const { input } = fixture()
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } }
    freeze(input)
    const result = expectFinal(input, 'Accepted', 'ACCEPTED_CANDIDATE')
    expect(result).not.toHaveProperty('actual'); expect(result).not.toHaveProperty('compile')
    expect(result.identity).not.toHaveProperty('ownerEntry'); expect(result.decisions[0]).not.toHaveProperty('stdout')
    expect(result.decisions).not.toBe(input.comparisons); expect(result.cleanup.snapshot).not.toBe(input.cleanup.snapshot)
    expect(reduceJudgeVerdict(input)).toEqual(result)
  })
})
