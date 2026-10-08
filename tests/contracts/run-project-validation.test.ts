import { describe, expect, it } from 'vitest'
import { validateRunProjectRequest, validateCSharpStartRunRequest, validateCSharpRunTarget,
  validateProjectRunEvent, validateProjectRunFailure } from '../../src/shared/contracts/run-project'

const projectId = 'project_1234567890abcdef12345678'
const target = { kind: 'csharp-project', projectId, relativePath: 'src/Việt 😀/App.csproj' }
const session = { ...target, sessionId: 'run_12345678-1234-1234-1234-123456789abc', state: 'STARTING', phase: 'PREPARING' }
describe('M1-10 exact semantic wire contracts', () => {
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
