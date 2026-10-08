import { describe, expect, it } from 'vitest'
import { validateRunProjectRequest, validateCSharpStartRunRequest, validateCSharpRunTarget,
  validateProjectRunEvent, validateProjectRunFailure, validateCSharpRunTargetResolution } from '../../src/shared/contracts/run-project'

const projectId = 'project_1234567890abcdef12345678'
const target = { kind: 'csharp-project', projectId, relativePath: 'src/Việt 😀/App.csproj' }
const session = { ...target, sessionId: 'run_12345678-1234-1234-1234-123456789abc', state: 'STARTING', phase: 'PREPARING' }
describe('M1-10 exact semantic wire contracts', () => {
  const candidates = [{ relativePath: target.relativePath, displayName: 'App', eligibility: 'ELIGIBLE', reason: null }]
  it.each(['STALE_TARGET', 'PERSISTENCE_RECOVERED'])('R2 validates optional %s while retaining selection authority', selectionDiagnostic => {
    const resolution = { projectId, state: 'SELECTION_REQUIRED', candidates, selectionDiagnostic }
    expect(validateCSharpRunTargetResolution(resolution)).toEqual({ ok: true, value: resolution })
    expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates }).ok).toBe(true)
    expect(validateCSharpRunTargetResolution({ projectId, state: 'READY', target, candidates, selectionDiagnostic }).ok).toBe(false)
    for (const value of [
      { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [] },
      { projectId, state: 'FAILED', reason: 'PREFLIGHT_FAILED' },
      { projectId, state: 'DEPENDENCY_FAILED', candidates: [], dependency: { state: 'MISSING', reason: 'DOTNET_HOST_MISSING' } },
    ]) expect(validateCSharpRunTargetResolution({ ...value, selectionDiagnostic }).ok).toBe(true)
  })
  it.each(['UNKNOWN', '', null, undefined, 1, { reason: 'STALE_TARGET' }, ['STALE_TARGET']])(
    'R2 rejects malformed diagnostic %#', selectionDiagnostic => {
      expect(validateCSharpRunTargetResolution({ projectId, state: 'SELECTION_REQUIRED', candidates, selectionDiagnostic }).ok).toBe(false)
    })
  it('R2 rejects internal fields alongside a valid diagnostic', () => {
    const resolution = { projectId, state: 'SELECTION_REQUIRED', candidates, selectionDiagnostic: 'STALE_TARGET' }
    for (const field of ['assessments', 'canonicalRoot', 'storageError', 'selectedPath', 'executable']) {
      expect(validateCSharpRunTargetResolution({ ...resolution, [field]: 'private' }).ok).toBe(false)
    }
  })
  it('accepts project-only resolution/clear/cancel and C# target/start requests', () => {
    expect(validateRunProjectRequest({ projectId }).ok).toBe(true)
    expect(validateCSharpRunTarget(target).ok).toBe(true)
    expect(validateCSharpStartRunRequest({ ...target, dirty: false }).ok).toBe(true)
  })
  it.each(['executable', 'args', 'cwd', 'env', 'command', 'ownerId', 'root', 'glob', 'canonicalFile'])(
    'rejects %s authority in every request', field => {
      expect(validateRunProjectRequest({ projectId, [field]: 'injected' }).ok).toBe(false)
      expect(validateCSharpRunTarget({ ...target, [field]: 'injected' }).ok).toBe(false)
      expect(validateCSharpStartRunRequest({ ...target, dirty: false, [field]: 'injected' }).ok).toBe(false)
    })
  it.each(['../App.csproj', 'C:/App.csproj', '/App.csproj', 'src\\App.csproj', 'Program.cs', 'app.js', 'NUL.csproj'])(
    'rejects unsupported/path escalation %s', relativePath => {
      expect(validateCSharpStartRunRequest({ ...target, relativePath, dirty: false }).ok).toBe(false)
    })
  it('rejects wrong kinds, unknown phase and native session fields', () => {
    expect(validateCSharpRunTarget({ ...target, kind: 'javascript-file', relativePath: 'a.js' }).ok).toBe(false)
    for (const extra of [{ phase: 'RESTORE' }, { canonicalRoot: 'C:\\secret' }, { pid: 10 }]) {
      expect(validateProjectRunEvent({ type: 'state', session: { ...session, ...extra } }).ok).toBe(false)
    }
  })
  it.each(['PREPARING', 'BUILD_RESTORE', 'EXECUTING'])('accepts %s phase separately from lifecycle state', phase => {
    expect(validateProjectRunEvent({ type: 'phase', session: { ...session, phase } }).ok).toBe(true)
  })
  it('validates stdout/stderr, terminal exit and semantic failure without raw errors', () => {
    for (const type of ['stdout', 'stderr']) expect(validateProjectRunEvent({ type, session, data: 'hello' }).ok).toBe(true)
    expect(validateProjectRunEvent({ type: 'exit', session, exitCode: 0 }).ok).toBe(false)
    expect(validateProjectRunEvent({ type: 'exit', session: { ...session, state: 'EXITED' }, exitCode: 0 }).ok).toBe(true)
    expect(validateProjectRunEvent({ type: 'error', session, failure: { reason: 'SOURCE_DIRTY' } }).ok).toBe(true)
    expect(validateProjectRunEvent({ type: 'error', session, failure: { reason: 'SELECTION_REQUIRED' } }).ok).toBe(true)
    expect(validateProjectRunEvent({ type: 'error', session, failure: { reason: 'SPAWN_FAILED', stderr: 'private' } }).ok).toBe(false)
    expect(validateProjectRunFailure({ reason: 'EXECUTION_FAILED', exitCode: 23 }).ok).toBe(true)
    expect(validateProjectRunFailure({ reason: 'BUILD_OR_RESTORE_FAILED', exitCode: 0 }).ok).toBe(false)
  })
})
