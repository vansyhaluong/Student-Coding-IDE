import { EXERCISE_END_REASONS, type ExerciseEndReason } from '../../../../shared/contracts/exercise'
import type { OfficialPlanIdentity } from '../official-case-plan'
import type { OfficialCaseObservation, OfficialExecutionCompletion } from '../runtime/official-execution-contracts'
import type { JudgeCaseDecision, JudgeEligibilityInput, JudgeIneligibilityReason, JudgeOwnerBoundIdentity,
  JudgeResult, JudgeVerdict } from './judge-contracts'

type Failure = NonNullable<OfficialExecutionCompletion['failure']>
type CaseFailureVerdict = Extract<JudgeCaseDecision, { kind: 'EXECUTION_FAILURE' }>['verdict']
const planKeys = ['exerciseId', 'packageVersion', 'testSetId', 'testSetVersion', 'signatureVersion',
  'signatureHash', 'officialHash', 'comparatorId', 'comparatorVersion'] as const
const cleanupKeys = ['state', 'proof', 'processClean', 'cleanupComplete', 'workspace', 'pendingIo'] as const
const positive = (v: number): boolean => Number.isSafeInteger(v) && v > 0
const nonnegative = (v: number): boolean => Number.isSafeInteger(v) && v >= 0
const hash = (v: string): boolean => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const id = (v: string): boolean => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)
const samePlan = (a: OfficialPlanIdentity, b: OfficialPlanIdentity): boolean => planKeys.every(k => a[k] === b[k])
function validPlan(p: OfficialPlanIdentity): boolean {
  return id(p.exerciseId) && id(p.testSetId) && [p.packageVersion, p.testSetVersion, p.signatureVersion].every(n => positive(n) && n <= 2147483647)
    && hash(p.signatureHash) && hash(p.officialHash) && p.comparatorId === 'exact-typed' && p.comparatorVersion === 1
}
function validBinding(b: JudgeOwnerBoundIdentity): boolean {
  return nonnegative(b.ownerId) && b.ownerEntry !== null && typeof b.ownerEntry === 'object'
    && typeof b.session.sessionId === 'string' && b.session.sessionId.length > 0 && positive(b.session.generation)
    && nonnegative(b.sourceRevision) && hash(b.sourceHash) && ['csharp', 'javascript'].includes(b.language) && validPlan(b.plan)
}
function sameOwner(a: JudgeOwnerBoundIdentity, b: JudgeOwnerBoundIdentity): boolean {
  return a.ownerId === b.ownerId && a.ownerEntry === b.ownerEntry && a.session.sessionId === b.session.sessionId
    && a.session.generation === b.session.generation
}
function cancelled(reason: ExerciseEndReason): boolean {
  return ['OWNER_LOST', 'CONTEXT_CHANGED', 'LEARNING_LEFT', 'SHUTDOWN'].includes(reason)
}
function interruption(reason: ExerciseEndReason): JudgeVerdict | null {
  if (['PREPARE_TIMEOUT', 'COMPILE_TIMEOUT', 'EXECUTE_TIMEOUT', 'OPERATION_TIMEOUT'].includes(reason)) return 'TimeLimitExceeded'
  if (reason === 'JOB_MEMORY_LIMIT') return 'MemoryLimitExceeded'
  if (reason === 'OUTPUT_LIMIT') return 'OutputLimitExceeded'
  return null
}
function failureLimit(f: Failure | null): JudgeVerdict | null {
  if (f?.kind === 'TIMEOUT') return 'TimeLimitExceeded'
  if (f?.kind === 'JOB_MEMORY_LIMIT') return 'MemoryLimitExceeded'
  if (f?.kind === 'OUTPUT_LIMIT') return 'OutputLimitExceeded'
  return null
}
function validFailure(f: Failure, count: number | null, language: JudgeOwnerBoundIdentity['language']): boolean {
  if (!['prepare', 'compile', 'execute', 'operation', 'cleanup'].includes(f.phase)) return false
  if (f.phase === 'execute' ? count === null || !nonnegative(f.caseIndex!) || f.caseIndex! >= count : f.caseIndex !== null) return false
  switch (f.kind) {
    case 'COMPILE_ERROR': return language === 'csharp' && f.phase === 'compile'
    case 'SYNTAX_ERROR': return language === 'javascript' && f.phase === 'compile'
    case 'SDK_MISSING': case 'SDK_INCOMPATIBLE': return language === 'csharp' && f.phase === 'prepare'
    case 'NODE_MISSING': case 'NODE_INCOMPATIBLE': return language === 'javascript' && f.phase === 'prepare'
    case 'RUNTIME_ERROR': return f.phase === 'execute'
    case 'PROTOCOL_FAILURE': return language === 'javascript' && f.phase === 'execute'
    case 'TIMEOUT': return f.phase !== 'cleanup'
    case 'JOB_MEMORY_LIMIT': return f.phase === 'compile' || f.phase === 'execute' || language === 'javascript' && f.phase === 'prepare'
    case 'OUTPUT_LIMIT': return ['prepare', 'compile', 'execute'].includes(f.phase)
    case 'INFRASTRUCTURE_FAILURE': return f.phase !== 'operation'
    default: return false
  }
}
function compileEvidence(c: OfficialExecutionCompletion, language: JudgeOwnerBoundIdentity['language']): boolean {
  const compile = c.compile
  if (!compile) return c.cases.length === 0
  if (!Array.isArray(compile.diagnostics) || compile.diagnostics.length > 128
    || compile.exitCode !== null && (!nonnegative(compile.exitCode) || compile.exitCode > 0xffff_ffff)) return false
  if (compile.status === 'SUCCEEDED') return compile.exitCode === 0 && compile.failure === null
    && !compile.diagnostics.some(d => 'severity' in d && d.severity === 'error' || d.code === 'SYNTAX_ERROR')
  if (compile.status !== 'FAILED' || c.cases.length !== 0 || !compile.failure || !c.failure) return false
  const f = compile.failure
  if (f.phase !== 'compile' && !(f.kind === 'TIMEOUT' && f.phase === 'operation')) return false
  if (f.kind === 'COMPILE_ERROR') {
    // Attribution is the existing compiler's typed classification, not code/text guessing.
    if (language !== 'csharp' || compile.exitCode === null || compile.exitCode === 0
      || !compile.diagnostics.some(d => 'severity' in d && d.severity === 'error')) return false
  }
  if (f.kind === 'SYNTAX_ERROR' && (language !== 'javascript' || compile.exitCode !== 1
    || !compile.diagnostics.some(d => d.code === 'SYNTAX_ERROR' && d.source === 'solution'))) return false
  return validFailure(f, 1, language) && (interruption(c.endReason) !== null || c.failure.kind === 'INFRASTRUCTURE_FAILURE' && c.failure.phase === 'cleanup'
    || f.kind === c.failure.kind && f.phase === c.failure.phase && f.caseIndex === c.failure.caseIndex)
}
function rowVerdict(row: OfficialCaseObservation): CaseFailureVerdict | null {
  switch (row.kind) {
    case 'RETURNED': return null
    case 'USER_EXCEPTION': case 'INVALID_RESULT': return 'RuntimeError'
    case 'PROTOCOL_FAILURE': case 'INFRASTRUCTURE_FAILURE': return 'InfrastructureFailure'
    case 'INTERRUPTED':
      return row.reason === 'TIMEOUT' ? 'TimeLimitExceeded' : row.reason === 'JOB_MEMORY_LIMIT' ? 'MemoryLimitExceeded'
        : row.reason === 'OUTPUT_LIMIT' ? 'OutputLimitExceeded' : 'CancelledInvalidated'
  }
}
function validReturnedOrStudent(row: OfficialCaseObservation, core: JudgeVerdict | null): boolean {
  const p = row.process
  if (!p || p.phase !== 'execute' || !p.processExited || !p.stdoutSettled || !p.stderrSettled || !p.observerSettled) return false
  // A previously parsed envelope cannot overrule an authoritative later Core
  // interruption. Secondary process quotas do not choose a new first cause.
  if (core && (p.jobMemoryLimitObserved || p.failure === 'TIMEOUT' || p.failure === 'JOB_MEMORY_LIMIT' || p.failure === 'OUTPUT_LIMIT')) return true
  if (p.jobMemoryLimitObserved) return false
  const jsFailed = row.language === 'javascript' && row.kind !== 'RETURNED'
  return p.exitCode === (jsFailed ? 1 : 0) && p.failure === (jsFailed ? 'NONZERO_EXIT' : null)
}

/** Pure consistency reduction of typed, Main-private facts. No authority is
 * authenticated here; no parsing/comparison, process, clock, mutation or I/O. */
export function reduceJudgeVerdict(input: JudgeEligibilityInput): JudgeResult {
  const { identity: expected, operationIdentity: observed, completion: c, cleanup: q } = input
  const decisions: JudgeCaseDecision[] = []
  let provisional: JudgeVerdict | null = null
  const base = () => ({
    identity: { ownerId: expected.ownerId, session: { sessionId: expected.session.sessionId, generation: expected.session.generation }, plan: {
      exerciseId: expected.plan.exerciseId, packageVersion: expected.plan.packageVersion, testSetId: expected.plan.testSetId,
      testSetVersion: expected.plan.testSetVersion, signatureVersion: expected.plan.signatureVersion,
      signatureHash: expected.plan.signatureHash, officialHash: expected.plan.officialHash,
      comparatorId: expected.plan.comparatorId, comparatorVersion: expected.plan.comparatorVersion,
    }, language: expected.language, sourceRevision: expected.sourceRevision, sourceHash: expected.sourceHash },
    requiredCases: input.caseCount, attemptedCases: c && c.cases.length <= 128 ? c.cases.length : 0,
    comparedCases: decisions.filter(d => d.kind === 'COMPARED').length,
    passedCases: decisions.filter(d => d.kind === 'COMPARED' && d.result === 'PASS').length,
    decisions: decisions.map(d => ({ ...d })), notRunCaseIndices: c && c.notRunCaseIndices.length <= 128 ? [...c.notRunCaseIndices] : [],
    provisionalVerdict: provisional, endReason: c?.endReason ?? null,
    failure: c?.failure ? { kind: c.failure.kind, phase: c.failure.phase, caseIndex: c.failure.caseIndex } : null,
    cleanup: { snapshot: { state: q.snapshot.state, proof: q.snapshot.proof,
      processClean: q.snapshot.processClean, cleanupComplete: q.snapshot.cleanupComplete, workspace: q.snapshot.workspace,
      pendingIo: q.snapshot.pendingIo }, executionDone: q.executionDone,
      ownsResources: q.ownsResources, retainedPackageTasks: q.retainedPackageTasks, representationBorrows: q.representationBorrows,
      contentReleased: q.contentReleased, contentReleaseFailed: q.contentReleaseFailed },
  })
  const ineligible = (reason: JudgeIneligibilityReason, verdict: 'InfrastructureFailure' | 'CancelledInvalidated' | null = 'InfrastructureFailure'): JudgeResult => {
    const b = base(), eligibility = { kind: 'INELIGIBLE' as const, acceptedCandidateEligible: false as const,
      gradedFailureCandidateEligible: false as const, reasons: [reason] }
    return verdict === null ? { ...b, state: 'PENDING', verdict: null, eligibility } : { ...b, state: 'FINAL', verdict, eligibility }
  }
  const ownerLost = !input.ownerCurrent || !sameOwner(expected, observed) || c?.disposition === 'INVALIDATED' || !!c && cancelled(c.endReason)
  const reject = (reason: JudgeIneligibilityReason): JudgeResult => ineligible(ownerLost ? 'OWNER_INVALIDATED' : reason,
    ownerLost ? 'CancelledInvalidated' : 'InfrastructureFailure')
  if (!validBinding(expected) || !validBinding(observed) || !samePlan(expected.plan, observed.plan)
    || expected.language !== observed.language || expected.sourceRevision !== observed.sourceRevision || expected.sourceHash !== observed.sourceHash)
    return reject('IDENTITY_MISMATCH')
  if (!c) return ownerLost ? reject('OWNER_INVALIDATED') : ineligible('PENDING_COMPLETION', null)
  if (!samePlan(expected.plan, c.identity) || !validPlan(c.identity)) return reject('IDENTITY_MISMATCH')
  if (c.cases.length > 128 || c.notRunCaseIndices.length > 128 || input.comparisons.length > 128
    || !nonnegative(q.retainedPackageTasks) || !nonnegative(q.representationBorrows)
    || q.contentReleased && q.contentReleaseFailed || !cleanupKeys.every(k => c.cleanup[k] === q.snapshot[k])) return reject('INVALID_EVIDENCE')
  const n = input.caseCount
  if (c.planAcquired ? n === null || !positive(n) || n > 128 : n !== null || c.cases.length !== 0 || c.compile !== null
    || c.notRunCaseIndices.length !== 0 || input.comparisons.length !== 0) return reject('INVALID_EVIDENCE')
  if (!EXERCISE_END_REASONS.includes(c.endReason) || !['EXHAUSTED', 'CONSUMER_STOP', 'EXECUTION_FAILURE', 'INVALIDATED'].includes(c.disposition)
    || c.failure && !validFailure(c.failure, n, expected.language) || !compileEvidence(c, expected.language)) return reject('INVALID_EVIDENCE')
  if (n !== null && (c.cases.length > n || c.notRunCaseIndices.length !== n - c.cases.length)) return reject('INVALID_EVIDENCE')
  for (let i = 0; i < c.notRunCaseIndices.length; i++) if (c.notRunCaseIndices[i] !== c.cases.length + i) return reject('INVALID_EVIDENCE')
  const core = interruption(c.endReason)
  const comparisons = input.comparisons
  let comparisonFailure = false, wa = false, lastRowFailure: JudgeVerdict | null = null
  for (let i = 0; i < c.cases.length; i++) {
    const row = c.cases[i]
    if (!row || row.caseIndex !== i || row.language !== expected.language
      || row.kind !== 'RETURNED' && i !== c.cases.length - 1) return reject('INVALID_EVIDENCE')
    if ((row.kind === 'RETURNED' || row.kind === 'USER_EXCEPTION' || row.kind === 'INVALID_RESULT') && !validReturnedOrStudent(row, core))
      return reject('INVALID_EVIDENCE')
    const rv = rowVerdict(row)
    if (rv === undefined) return reject('INVALID_EVIDENCE')
    if (rv) { lastRowFailure = rv; decisions.push({ kind: 'EXECUTION_FAILURE', caseIndex: i, verdict: rv }) }
  }
  if (comparisons.length > c.cases.length) return reject('INVALID_EVIDENCE')
  // Build decisions in real case order; failed rows never consume comparison evidence.
  const failedDecision = decisions.pop()
  for (let i = 0; i < comparisons.length; i++) {
    const comparison = comparisons[i]
    if (!comparison || comparison.caseIndex !== i || c.cases[i].kind !== 'RETURNED' || comparison.barrierVerified !== true
      || wa || comparisonFailure || !['PASS', 'DIFFERENT', 'INVALID_ACTUAL', 'INVALID_EXPECTED', 'INVALID_CONFIGURATION'].includes(comparison.result))
      return reject('INVALID_EVIDENCE')
    if (comparison.result === 'PASS' || comparison.result === 'DIFFERENT') {
      decisions.push({ kind: 'COMPARED', caseIndex: i, result: comparison.result })
      wa = comparison.result === 'DIFFERENT'
    } else comparisonFailure = true
  }
  if (failedDecision) decisions.push(failedDecision)
  if ((wa || comparisonFailure) && comparisons.length !== c.cases.length
    || c.cases.length - comparisons.length > 1) return reject('INVALID_EVIDENCE')
  const compile = c.compile
  if (compile?.status === 'FAILED') provisional = compile.failure?.kind === 'COMPILE_ERROR' ? 'CompilationError'
    : compile.failure?.kind === 'SYNTAX_ERROR' ? 'SyntaxError' : failureLimit(compile.failure) ?? 'InfrastructureFailure'
  else provisional = wa ? 'WrongAnswer' : lastRowFailure
  const f = c.failure
  // A failed execute maps to the last real attempt, not an invented next case.
  if (f?.phase === 'execute' && f.caseIndex !== c.cases.length - 1
    || f && ['prepare', 'compile'].includes(f.phase) && c.cases.length > 0
    || f?.phase === 'prepare' && compile !== null) return reject('INVALID_EVIDENCE')
  if (c.endReason === 'PREPARE_TIMEOUT' && (compile !== null || c.cases.length > 0)
    || c.endReason === 'COMPILE_TIMEOUT' && c.cases.length > 0
    || c.endReason === 'EXECUTE_TIMEOUT' && compile?.status !== 'SUCCEEDED') return reject('INVALID_EVIDENCE')
  if (!core && !ownerLost && f && f.phase !== 'cleanup' && c.endReason === 'COMPLETED') return reject('INVALID_EVIDENCE')
  if (!core && !ownerLost && ((f?.kind === 'COMPILE_ERROR' || f?.kind === 'SYNTAX_ERROR') && c.endReason !== 'COMPILATION_FAILED'
    || f?.kind === 'RUNTIME_ERROR' && c.endReason !== 'RUNTIME_FAILED')) return reject('INVALID_EVIDENCE')
  if (c.disposition === 'CONSUMER_STOP' && (!wa || comparisonFailure || f || core || c.endReason !== 'COMPLETED')) return reject('INVALID_EVIDENCE')
  if (c.disposition === 'EXHAUSTED' && (f || core || lastRowFailure || wa || comparisonFailure || c.endReason !== 'COMPLETED')) return reject('INVALID_EVIDENCE')
  if ((lastRowFailure || comparisonFailure) && !['EXECUTION_FAILURE', 'INVALIDATED'].includes(c.disposition)) return reject('INVALID_EVIDENCE')
  if (ownerLost) return reject('OWNER_INVALIDATED')
  if (comparisonFailure) return reject('INVALID_EVIDENCE')
  // Core's first reason selects a specific interruption. Otherwise contradictory
  // specific observations are infrastructure, never a new TLE/MLE/OLE ranking.
  const limit = failureLimit(f)
  if (!core && limit && lastRowFailure && lastRowFailure !== limit) return reject('INVALID_EVIDENCE')
  let verdict = core ?? limit ?? provisional
  if (core || limit) {
    if (c.disposition !== 'EXECUTION_FAILURE') return reject('INVALID_EVIDENCE')
  } else if (c.disposition === 'EXECUTION_FAILURE') {
    if (f?.kind === 'RUNTIME_ERROR') verdict = lastRowFailure === 'RuntimeError' ? 'RuntimeError' : 'InfrastructureFailure'
    else if (f?.kind === 'COMPILE_ERROR' || f?.kind === 'SYNTAX_ERROR') verdict = provisional
    else verdict = 'InfrastructureFailure'
  }
  if (lastRowFailure && !f && !core) verdict = 'InfrastructureFailure'
  if (c.disposition === 'EXHAUSTED') {
    if (!c.planAcquired || n === null || comparisons.length !== n || c.cases.length !== n || !compile || compile.status !== 'SUCCEEDED')
      return reject('INCOMPLETE_COMPARISON')
    verdict = 'Accepted'
  }
  if (core || limit || provisional === null) provisional = verdict
  if (!c.planAcquired) return reject('UNTRUSTED_FAILURE')
  if (!input.decisionSecuredBeforeClose && !core && !limit) return reject('INCOMPLETE_COMPARISON')
  const snapshot = q.snapshot
  const cleanupReady = snapshot.state === 'FINALIZED' && snapshot.proof === 'VERIFIED' && snapshot.processClean
    && snapshot.cleanupComplete && snapshot.workspace === 'REMOVED' && !snapshot.pendingIo
  if (!cleanupReady || !q.executionDone || q.ownsResources || q.retainedPackageTasks !== 0 || q.representationBorrows !== 0
    || !q.contentReleased || q.contentReleaseFailed) {
    const pending = !q.contentReleaseFailed && (snapshot.state === 'PENDING' || snapshot.state === 'NOT_STARTED'
      || snapshot.state === 'FINALIZED' && cleanupReady && (!q.executionDone || q.ownsResources || q.retainedPackageTasks > 0
        || q.representationBorrows > 0 || !q.contentReleased))
    return ineligible(!q.contentReleased ? 'RELEASE_PENDING' : 'CLEANUP_UNQUALIFIED', pending ? null : 'InfrastructureFailure')
  }
  if (!verdict || verdict === 'InfrastructureFailure') return reject('UNTRUSTED_FAILURE')
  if (verdict === 'CancelledInvalidated') return reject('OWNER_INVALIDATED')
  if (verdict === 'Accepted') return { ...base(), state: 'FINAL', verdict,
    eligibility: { kind: 'ACCEPTED_CANDIDATE', acceptedCandidateEligible: true, gradedFailureCandidateEligible: false } }
  return { ...base(), state: 'FINAL', verdict,
    eligibility: { kind: 'GRADED_FAILURE_CANDIDATE', acceptedCandidateEligible: false, gradedFailureCandidateEligible: true } }
}
