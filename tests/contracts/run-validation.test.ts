import { describe, expect, it } from 'vitest'
import {
  RUN_CHANNELS, RUN_EXECUTION_PHASES, RUN_FAILURE_REASONS, RUN_SEMANTIC_LIMITS, RUN_STATES,
  validateCSharpRunCandidate, validateCSharpRunDependencyFailure, validateCSharpRunTargetResolution,
  validateRunEvent, validateRunExecutionPhase, validateRunFailure, validateRunSession,
  validateSemanticRunSession, validateSemanticRunTarget, validateSemanticStartRunRequest,
  validateStartRunRequest, validateStopRunRequest,
  type CSharpProjectRunTarget, type CSharpRunCandidate, type CSharpRunTargetResolution,
  type JavaScriptFileRunTarget, type ProjectId, type RunSessionId,
} from '../../src/shared/contracts'

const projectId = 'project_123456789012345678901234' as ProjectId
const sessionId = 'run_12345678-1234-1234-1234-123456789abc' as RunSessionId
const js: JavaScriptFileRunTarget = { kind: 'javascript-file', projectId, relativePath: 'src/main.js' }
const csharp: CSharpProjectRunTarget = { kind: 'csharp-project', projectId, relativePath: 'apps/Console/Console.csproj' }
const eligible: CSharpRunCandidate = { relativePath: csharp.relativePath, displayName: 'Console', eligibility: 'ELIGIBLE', reason: null }
const legacy = { projectId, relativePath: js.relativePath, dirty: false }
const legacySession = { projectId, relativePath: js.relativePath, sessionId, state: 'STARTING' }
const forbiddenFields = ['executable', 'executablePath', 'args', 'command', 'cwd', 'environmentAdditions',
  'env', 'shell', 'ownerId', 'pid', 'nativeHandle', 'canonicalRoot', 'canonicalFile', 'stdin']

describe('M1-01 semantic targets and requests', () => {
  it('validates both kinds without changing their wire shape or adding process data', () => {
    for (const target of [js, csharp]) {
      expect(validateSemanticRunTarget(target)).toEqual({ ok: true, value: target })
      expect(validateSemanticStartRunRequest({ ...target, dirty: false })).toEqual({ ok: true, value: { ...target, dirty: false } })
      expect(validateSemanticStartRunRequest({ ...target, dirty: true }).ok).toBe(true)
    }
    expect(validateSemanticRunTarget({ ...csharp, relativePath: 'Bài tập #1/CONSOLE.CSPROJ' }).ok).toBe(true)
    expect(validateSemanticRunTarget({ ...js, relativePath: 'Bài tập #1/main.js' }).ok).toBe(true)
  })
  it.each([undefined, null, '', 'csharp-file', 'project', 'CSharp', 1])('rejects unknown or missing kind %s', kind => {
    expect(validateSemanticRunTarget({ ...csharp, kind }).ok).toBe(false)
    expect(validateSemanticStartRunRequest({ ...csharp, dirty: false, kind }).ok).toBe(false)
  })
  it.each(['../App.csproj', '/App.csproj', 'C:/App.csproj', 'C:App.csproj', '\\\\server\\share\\App.csproj',
    'src/../App.csproj', 'src/./App.csproj', 'src\\App.csproj', 'src//App.csproj', 'App.csproj\0',
    'NUL.csproj', 'COM1/App.csproj', 'src/App.csproj:stream', 'src /App.csproj', 'src./App.csproj',
    'src/?.csproj', 'src/App.csproj\n', 'src/App.cs', 'src/App.sln', 'src/App.csproj/'])(
    'rejects unsafe or wrong-extension C# path %s', relativePath => {
      expect(validateSemanticRunTarget({ ...csharp, relativePath }).ok).toBe(false)
      expect(validateSemanticStartRunRequest({ ...csharp, relativePath, dirty: false }).ok).toBe(false)
      expect(validateCSharpRunCandidate({ ...eligible, relativePath }).ok).toBe(false)
    })
  it.each(['main.ts', 'main.JS', 'App.csproj', 'main.js/'])('keeps explicit JS target scoped to .js (%s)', relativePath => {
    expect(validateSemanticRunTarget({ ...js, relativePath }).ok).toBe(false)
  })
  it('rejects missing required fields, malformed objects and project identity', () => {
    for (const value of [null, [], {}, new Date(), { ...csharp, projectId: 'project_wrong' },
      { kind: csharp.kind, relativePath: csharp.relativePath }, { kind: csharp.kind, projectId },
      { ...csharp, relativePath: 1 }, { ...csharp, relativePath: '' }]) {
      expect(validateSemanticRunTarget(value).ok).toBe(false)
    }
    expect(validateSemanticStartRunRequest(csharp).ok).toBe(false)
    expect(validateSemanticStartRunRequest({ ...csharp, dirty: 'false' }).ok).toBe(false)
    expect(validateSemanticRunTarget({ ...csharp, dirty: false }).ok).toBe(false)
  })
  it.each(forbiddenFields)('rejects renderer-supplied runtime authority %s', field => {
    expect(validateSemanticRunTarget({ ...csharp, [field]: 'injected' }).ok).toBe(false)
    expect(validateSemanticStartRunRequest({ ...csharp, dirty: false, [field]: 'injected' }).ok).toBe(false)
  })
  it('bounds new paths without tightening the legacy contract', () => {
    const relativePath = 'a'.repeat(RUN_SEMANTIC_LIMITS.maximumRelativePathLength - 7) + '.csproj'
    expect(validateSemanticRunTarget({ ...csharp, relativePath }).ok).toBe(true)
    expect(validateSemanticRunTarget({ ...csharp, relativePath: 'a' + relativePath }).ok).toBe(false)
    expect(validateStartRunRequest({ ...legacy, relativePath: 'a'.repeat(5000) + '.js' }).ok).toBe(true)
  })
})

describe('M1-01 execution phase/session and safe failure classification', () => {
  it('validates defined phases separately from existing lifecycle states', () => {
    for (const phase of RUN_EXECUTION_PHASES) {
      expect(validateRunExecutionPhase(phase)).toEqual({ ok: true, value: phase })
      expect(validateSemanticRunSession({ ...csharp, sessionId, state: 'STARTING', phase }).ok).toBe(true)
    }
    for (const state of RUN_STATES) {
      expect(validateSemanticRunSession({ ...csharp, sessionId, state, phase: 'EXECUTING' }).ok).toBe(true)
    }
    expect(validateSemanticRunSession({ ...js, sessionId, state: 'RUNNING', phase: 'EXECUTING' }).ok).toBe(true)
    expect(validateSemanticRunSession({ ...js, sessionId, state: 'STARTING', phase: 'BUILD_RESTORE' }).ok).toBe(false)
  })
  it.each([null, 0, 'RUNNING', 'BUILDING', 'RESTORING', 'INPUT', ''])('rejects undefined phase %s', phase => {
    expect(validateRunExecutionPhase(phase).ok).toBe(false)
    expect(validateSemanticRunSession({ ...csharp, sessionId, state: 'STARTING', phase }).ok).toBe(false)
  })
  it('rejects missing/malformed session fields and runtime authority', () => {
    const session = { ...csharp, sessionId, state: 'RUNNING', phase: 'EXECUTING' }
    for (const field of Object.keys(session)) {
      const missing = { ...session } as Record<string, unknown>; delete missing[field]
      expect(validateSemanticRunSession(missing).ok).toBe(false)
    }
    expect(validateSemanticRunSession({ ...session, sessionId: 'run_wrong' }).ok).toBe(false)
    expect(validateSemanticRunSession({ ...session, state: 'BUILDING' }).ok).toBe(false)
    for (const field of forbiddenFields) expect(validateSemanticRunSession({ ...session, [field]: 1 }).ok).toBe(false)
  })
  it('keeps dependency, build/restore and execution failure reasons distinct', () => {
    for (const reason of RUN_FAILURE_REASONS) {
      const failure = reason === 'BUILD_OR_RESTORE_FAILED' || reason === 'EXECUTION_FAILED'
        ? { reason, exitCode: 1 } : { reason }
      expect(validateRunFailure(failure)).toEqual({ ok: true, value: failure })
    }
    expect(validateRunFailure({ reason: 'EXECUTION_FAILED', exitCode: null }).ok).toBe(true)
    expect(validateRunFailure({ reason: 'BUILD_OR_RESTORE_FAILED', exitCode: 0xffff_ffff }).ok).toBe(true)
  })
  it.each([0, -1, NaN, Infinity, 0.5, '1', undefined, 0x1_0000_0000])('rejects invalid failure exit code %s', exitCode => {
    expect(validateRunFailure({ reason: 'BUILD_OR_RESTORE_FAILED', exitCode }).ok).toBe(false)
    expect(validateRunFailure({ reason: 'EXECUTION_FAILED', exitCode }).ok).toBe(false)
  })
  it('rejects incompatible failure fields and raw process/error data', () => {
    for (const value of [null, {}, { reason: 'INPUT_FAILED' }, { reason: 'BUILD_OR_RESTORE_FAILED' },
      { reason: 'BUILD_OR_RESTORE_FAILED', exitCode: null }, { reason: 'DEPENDENCY_MISSING', exitCode: 1 },
      { reason: 'SPAWN_FAILED', stack: 'private' }, new Error('private')]) {
      expect(validateRunFailure(value).ok).toBe(false)
    }
    for (const field of forbiddenFields) expect(validateRunFailure({ reason: 'SPAWN_FAILED', [field]: 1 }).ok).toBe(false)
  })
})

describe('M1-01 C# Run target resolution', () => {
  const blocked: CSharpRunCandidate = { ...eligible, relativePath: 'Library/Library.csproj', eligibility: 'INELIGIBLE', reason: 'NOT_CONSOLE_PROJECT' }
  const unknown: CSharpRunCandidate = { ...eligible, relativePath: 'Broken/Broken.csproj', eligibility: 'UNASSESSABLE', reason: 'SDK_SELECTION_FAILED' }
  const resolutions: CSharpRunTargetResolution[] = [
    { projectId, state: 'READY', target: csharp, candidates: [eligible, blocked] },
    { projectId, state: 'SELECTION_REQUIRED', candidates: [eligible, unknown] },
    { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [] },
    { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [blocked] },
    { projectId, state: 'DEPENDENCY_FAILED', dependency: { state: 'MISSING', reason: 'DOTNET_HOST_MISSING' }, candidates: [] },
    { projectId, state: 'DEPENDENCY_FAILED', dependency: { state: 'INVALID_CONFIGURATION', reason: 'SDK_SELECTION_FAILED' }, candidates: [unknown] },
    { projectId, state: 'FAILED', reason: 'DISCOVERY_LIMIT_EXCEEDED' },
    { projectId, state: 'FAILED', reason: 'PREFLIGHT_FAILED' },
    { projectId, state: 'FAILED', reason: 'PERSISTENCE_FAILED' },
  ]
  it('validates resolution variants and reconstructs a detached candidate list', () => {
    for (const result of resolutions) expect(validateCSharpRunTargetResolution(result)).toEqual({ ok: true, value: result })
    const selected = resolutions[0]
    const validated = validateCSharpRunTargetResolution(selected)
    if (validated.ok && validated.value.state === 'READY' && selected.state === 'READY') {
      expect(validated.value.candidates).not.toBe(selected.candidates)
      expect(validated.value.candidates[0]).not.toBe(eligible)
      expect(validated.value.target).not.toBe(csharp)
    }
    const other = { ...eligible, relativePath: 'Second/Second.csproj' }
    expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates: [eligible, other] }).ok).toBe(true)
  })
  it('rejects missing required variant fields, excess fields and runtime metadata at every level', () => {
    for (const result of resolutions) {
      for (const field of Object.keys(result)) {
        const missing = { ...result } as Record<string, unknown>; delete missing[field]
        expect(validateCSharpRunTargetResolution(missing).ok).toBe(false)
      }
      for (const field of forbiddenFields) expect(validateCSharpRunTargetResolution({ ...result, [field]: 1 }).ok).toBe(false)
    }
    const ready = resolutions[0]
    for (const field of forbiddenFields) {
      expect(validateCSharpRunTargetResolution({ ...ready, target: { ...csharp, [field]: 1 } }).ok).toBe(false)
      expect(validateCSharpRunTargetResolution({ ...ready, candidates: [{ ...eligible, [field]: 1 }] }).ok).toBe(false)
      expect(validateCSharpRunDependencyFailure({ state: 'MISSING', reason: 'DOTNET_SDK_MISSING', [field]: 1 }).ok).toBe(false)
    }
  })
  it('rejects contradictory results, target substitution and partial discovery success', () => {
    for (const result of [
      { projectId, state: 'READY', target: js, candidates: [eligible] },
      { projectId, state: 'READY', target: { ...csharp, projectId: 'project_000000000000000000000000' }, candidates: [eligible] },
      { projectId, state: 'READY', target: { ...csharp, relativePath: 'Other.csproj' }, candidates: [eligible] },
      { projectId, state: 'READY', target: csharp, candidates: [unknown] },
      { projectId, state: 'SELECTION_REQUIRED', candidates: [] },
      { projectId, state: 'SELECTION_REQUIRED', candidates: [unknown] },
      { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [unknown] },
      { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [eligible] },
      { projectId, state: 'DEPENDENCY_FAILED', dependency: { state: 'MISSING', reason: 'DOTNET_SDK_MISSING' }, candidates: [eligible] },
      { projectId, state: 'FAILED', reason: 'DISCOVERY_LIMIT_EXCEEDED', candidates: [eligible] },
      { projectId, state: 'STARTING', candidates: [] },
      { projectId: 'wrong', state: 'NO_RUNNABLE_PROJECT', candidates: [] },
    ]) expect(validateCSharpRunTargetResolution(result).ok).toBe(false)
  })
  it('bounds candidate counts/display names and rejects case-insensitive duplicates', () => {
    const candidates = Array.from({ length: RUN_SEMANTIC_LIMITS.maximumCandidates }, (_, i) => ({ ...eligible, relativePath: `App${i}.csproj` }))
    expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates }).ok).toBe(true)
    expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates: [...candidates, eligible] }).ok).toBe(false)
    expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates: [eligible, { ...eligible, relativePath: eligible.relativePath.toUpperCase() }] }).ok).toBe(false)
    expect(validateCSharpRunCandidate({ ...eligible, displayName: 'x'.repeat(RUN_SEMANTIC_LIMITS.maximumDisplayNameLength) }).ok).toBe(true)
    for (const displayName of ['', ' ', '\0private', 'App\nprivate', 'x'.repeat(RUN_SEMANTIC_LIMITS.maximumDisplayNameLength + 1), 1]) {
      expect(validateCSharpRunCandidate({ ...eligible, displayName }).ok).toBe(false)
    }
    for (const candidate of [{ ...eligible, reason: 'NOT_CONSOLE_PROJECT' }, { ...blocked, reason: null },
      { ...unknown, reason: 'raw provider log' }, { ...eligible, eligibility: 'AVAILABLE' }]) {
      expect(validateCSharpRunCandidate(candidate).ok).toBe(false)
    }
  })
  it('validates dependency reasons without inferring a service lifecycle', () => {
    for (const reason of ['DOTNET_HOST_MISSING', 'DOTNET_SDK_MISSING']) expect(validateCSharpRunDependencyFailure({ state: 'MISSING', reason }).ok).toBe(true)
    for (const reason of ['SDK_SELECTION_FAILED', 'DOTNET_PROBE_FAILED']) expect(validateCSharpRunDependencyFailure({ state: 'INVALID_CONFIGURATION', reason }).ok).toBe(true)
    for (const value of [{ state: 'RUNNING', reason: 'DOTNET_HOST_MISSING' }, { state: 'MISSING', reason: 'SDK_SELECTION_FAILED' },
      { state: 'INVALID_CONFIGURATION', reason: 'DOTNET_SDK_MISSING' }, { state: 'MISSING' }]) {
      expect(validateCSharpRunDependencyFailure(value).ok).toBe(false)
    }
  })
})

describe('legacy Run contracts stay closed and backward compatible', () => {
  it('preserves valid JS requests, all session states, stop and event variants', () => {
    expect(validateStartRunRequest(legacy)).toEqual({ ok: true, value: legacy })
    expect(validateStopRunRequest({ sessionId })).toEqual({ ok: true, value: { sessionId } })
    for (const state of RUN_STATES) expect(validateRunSession({ ...legacySession, state }).ok).toBe(true)
    for (const type of ['stdout', 'stderr']) expect(validateRunEvent({ type, session: legacySession, data: 'text' }).ok).toBe(true)
    expect(validateRunEvent({ type: 'state', session: legacySession }).ok).toBe(true)
    expect(validateRunEvent({ type: 'exit', session: { ...legacySession, state: 'EXITED' }, exitCode: 0 }).ok).toBe(true)
    expect(validateRunEvent({ type: 'error', session: legacySession, error: { code: 'PROCESS_FAILED', message: 'Safe failure', retryable: true } }).ok).toBe(true)
    expect(RUN_CHANNELS).toEqual({ start: 'run:start', stop: 'run:stop', event: 'run:event' })
  })
  it('does not silently enable new DTOs through legacy IPC validators', () => {
    expect(validateStartRunRequest({ ...js, dirty: false }).ok).toBe(false)
    expect(validateStartRunRequest({ ...csharp, dirty: false }).ok).toBe(false)
    expect(validateRunSession({ ...legacySession, phase: 'EXECUTING' }).ok).toBe(false)
    expect(validateRunSession({ ...legacySession, kind: 'javascript-file' }).ok).toBe(false)
    expect(validateRunEvent({ type: 'phase', session: legacySession, phase: 'EXECUTING' }).ok).toBe(false)
    for (const field of forbiddenFields) expect(validateStartRunRequest({ ...legacy, [field]: 1 }).ok).toBe(false)
    // Existing lexical validation still delegates supported-file dispatch to Main.
    expect(validateStartRunRequest({ ...legacy, relativePath: 'main.ts' }).ok).toBe(true)
    expect(validateSemanticRunTarget(legacy).ok).toBe(false)
  })
})
