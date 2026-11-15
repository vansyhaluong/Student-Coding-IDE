/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppResult, CSharpRunSession, CSharpRunTargetResolution, ProjectId, ProjectRunEvent, RunApi, RunSessionId } from '../../src/shared/contracts'
import { RunController } from '../../src/renderer/src/features/output/run-controller'
import { EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { EditorRunAction } from '../../src/renderer/src/features/output/EditorRunAction'
import { OutputPanel, runResult } from '../../src/renderer/src/features/output/OutputPanel'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const other = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const target = { kind: 'csharp-project' as const, projectId, relativePath: 'src/Việt 😀/App.csproj' }
const candidate = { relativePath: target.relativePath, displayName: 'App', eligibility: 'ELIGIBLE' as const, reason: null }
const ready: CSharpRunTargetResolution = { projectId, state: 'READY', target, candidates: [candidate] }
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const failed = (): AppResult<never> => ({ ok: false, error: { code: 'PROCESS_FAILED', message: 'Cleanup failed', retryable: true } })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const disposals: (() => void)[] = []
afterEach(() => { cleanup(); for (const dispose of disposals.splice(0)) dispose() })
function setup(resolution = ready) {
  let listener: ((event: ProjectRunEvent) => void) | undefined
  let serial = 0
  const frames = new Map<number, () => void>()
  const api: RunApi = {
    onEvent: vi.fn(() => () => {}), onProjectEvent: vi.fn(callback => { listener = callback; return () => { listener = undefined } }),
    resolveTargets: vi.fn(async () => ok(resolution)), selectTarget: vi.fn(async () => ok(ready)), clearTarget: vi.fn(async () => ok(ready)),
    cancelResolution: vi.fn(async () => ok(null)), startProject: vi.fn(async () => ok(session())),
    sendInput: vi.fn(), closeInput: vi.fn(), inputStatus: vi.fn(),
    start: vi.fn(), stop: vi.fn(async () => ok(null)),
  }
  const controller = new RunController(api, callback => { frames.set(++serial, callback); return serial }, frame => { frames.delete(frame) })
  controller.activateProject(projectId)
  const disconnect = controller.connect()
  const models = new EditorModelManager({ createModel(value) {
    let content = value, version = 1
    const changes = new Set<() => void>()
    return { getValue: () => content, getVersionId: () => version,
      setValue(next) { content = next; version++; for (const change of changes) change() },
      onDidChangeContent(change) { changes.add(change); return { dispose: () => { changes.delete(change) } } }, dispose() {} }
  } })
  disposals.push(() => { disconnect(); models.dispose() })
  const emit = (event: ProjectRunEvent) => act(() => listener?.(event))
  const renderUi = () => render(<><EditorRunAction controller={controller} manager={models} locked={false} onShowOutput={vi.fn()} />
    <OutputPanel controller={controller} height={260} onHeightChange={vi.fn()} onSelectTerminal={vi.fn()} onSelectProblems={vi.fn()} onClosePanel={vi.fn()} /></>)
  return { api, controller, models, emit, renderUi, frames }
}
function session(id = 'run_1234567890abcdef12345678', state: CSharpRunSession['state'] = 'STARTING', phase: CSharpRunSession['phase'] = 'PREPARING'): CSharpRunSession {
  return { ...target, sessionId: id as RunSessionId, state, phase }
}
async function launch(h: ReturnType<typeof setup>) {
  await h.controller.resolveTargets()
  await h.controller.startProject({ dirty: false, conflict: false })
}

describe('M1-11 C# target and unified Run presentation', () => {
  it('auto-resolves Main READY and runs a csproj with no editor tab', async () => {
    const h = setup(); h.renderUi()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledWith({ ...target, dirty: false }))
    expect(h.api.start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Stop Console project' }).hasAttribute('disabled')).toBe(false)
  })
  it('requires explicit choice with multiple eligible targets, persists through Main, and does not start', async () => {
    const h = setup({ projectId, state: 'SELECTION_REQUIRED', candidates: [candidate, { ...candidate, relativePath: 'other/App.csproj' }] })
    h.renderUi()
    await waitFor(() => expect(h.controller.getSnapshot().resolution?.state).toBe('SELECTION_REQUIRED'))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Run target' }))
    expect(screen.getAllByRole('radio').every(input => !(input as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: 'Use target' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getAllByRole('radio')[0]); fireEvent.click(screen.getByRole('button', { name: 'Use target' }))
    await waitFor(() => expect(h.api.selectTarget).toHaveBeenCalledWith(target))
    expect(h.api.startProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved choice' }))
    await waitFor(() => expect(h.api.clearTarget).toHaveBeenCalledWith({ projectId }))
    expect(h.controller.getSnapshot().resolution?.state).toBe('READY')
  })
  it.each(['STALE_TARGET', 'PERSISTENCE_RECOVERED'] as const)('explains %s and does not auto-select the remaining candidate', async selectionDiagnostic => {
    const h = setup({ projectId, state: 'SELECTION_REQUIRED', selectionDiagnostic, candidates: [candidate] }); h.renderUi()
    await waitFor(() => expect(h.controller.getSnapshot().resolution).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Choose Run target' }))
    expect(screen.getByRole('alert').textContent).toMatch(selectionDiagnostic === 'STALE_TARGET' ? /previous target/ : /recovered/)
    expect((screen.getByRole('radio') as HTMLInputElement).checked).toBe(false)
    expect(h.api.selectTarget).not.toHaveBeenCalled()
  })
  it('explains no Console target and disabled candidate reasons', async () => {
    const h = setup({ projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [{ ...candidate, eligibility: 'INELIGIBLE', reason: 'NOT_CONSOLE_PROJECT' }] })
    h.renderUi(); await waitFor(() => expect(h.controller.getSnapshot().resolution).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Choose Run target' }))
    expect(screen.getByText('No runnable Console project found.')).toBeTruthy()
    expect(screen.getByText('not console project')).toBeTruthy()
    expect(screen.getByRole('radio').hasAttribute('disabled')).toBe(true)
  })
  it('rejects dirty/conflicting inactive source without a Run invocation or auto-save', async () => {
    const h = setup(); const doc = h.models.openDocument(projectId, 'inactive.txt', 'a', false)
    doc.model.setValue('b'); h.renderUi()
    await waitFor(() => expect(screen.getByRole('button', { name: /Run unavailable: Save changed/ }).hasAttribute('disabled')).toBe(true))
    await h.controller.startProject(h.models.getSourceState(projectId))
    expect(h.api.startProject).not.toHaveBeenCalled(); expect(doc.dirty).toBe(true)
    await act(() => h.controller.startProject({ dirty: false, conflict: true }))
    expect(h.api.startProject).not.toHaveBeenCalled()
  })
  it('pins C# target and Stop when a JavaScript editor becomes active', async () => {
    const h = setup(); await launch(h); h.renderUi()
    act(() => { h.models.openDocument(projectId, 'unrelated.js', ''); h.models.openDocument(projectId, 'Library.cs', '') })
    expect(screen.getByRole('button', { name: 'Stop Console project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose Run target' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Stop Console project' }))
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledWith(session().sessionId))
  })
  it.each(['PREPARING', 'BUILD_RESTORE', 'EXECUTING'] as const)('allows Stop during %s before start response', async phase => {
    const h = setup(), pending = deferred<AppResult<CSharpRunSession>>()
    vi.mocked(h.api.startProject).mockReturnValue(pending.promise)
    await h.controller.resolveTargets()
    const start = h.controller.startProject({ dirty: false, conflict: false })
    h.emit({ type: 'state', session: session() }); h.emit({ type: 'phase', session: session(undefined, 'RUNNING', phase) })
    h.renderUi(); fireEvent.click(screen.getByRole('button', { name: 'Stop Console project' }))
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledTimes(1))
    h.emit({ type: 'exit', session: session(undefined, 'CANCELLED', phase), exitCode: null })
    await act(async () => { pending.resolve(ok(session())); await start })
    expect(runResult(h.controller.getProjectView()!)).toBe('Stopped')
  })
  it('queues Stop before session identity, then stops only the matching attempt', async () => {
    const h = setup(), pending = deferred<AppResult<CSharpRunSession>>()
    vi.mocked(h.api.startProject).mockReturnValue(pending.promise)
    await h.controller.resolveTargets(); const start = h.controller.startProject({ dirty: false, conflict: false })
    await h.controller.stopProject(); expect(h.api.stop).not.toHaveBeenCalled()
    h.emit({ type: 'state', session: session() })
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledWith(session().sessionId))
    pending.resolve(ok(session())); await start
  })
  it('orders stream batches at phase boundaries and preserves build failure after exit', async () => {
    const h = setup(); await launch(h)
    h.emit({ type: 'stdout', session: session(), data: 'probe output\n' })
    h.emit({ type: 'phase', session: session(undefined, 'RUNNING', 'BUILD_RESTORE') })
    h.emit({ type: 'stderr', session: session(), data: 'CS1002\n' })
    const end = session(undefined, 'FAILED', 'BUILD_RESTORE')
    h.emit({ type: 'error', session: end, failure: { reason: 'BUILD_OR_RESTORE_FAILED', exitCode: 1 } })
    h.emit({ type: 'exit', session: end, exitCode: 1 })
    h.renderUi()
    expect(screen.getByLabelText(/Run output for/).textContent).toMatch(/probe output.*Build \/ restore.*CS1002/s)
    expect(screen.getByRole('alert').textContent).toBe('Build or restore failed (exit 1)')
    expect(runResult(h.controller.getProjectView()!)).toBe('Build or restore failed (exit 1)')
  })
  it.each([0, 23, null])('reports execution exit %s separately from build failure', async exitCode => {
    const h = setup(); await launch(h)
    h.emit({ type: 'phase', session: session(undefined, 'RUNNING', 'EXECUTING') })
    const end = session(undefined, exitCode === 0 ? 'EXITED' : 'FAILED', 'EXECUTING')
    if (exitCode !== 0) h.emit({ type: 'error', session: end, failure: { reason: 'EXECUTION_FAILED', exitCode } })
    h.emit({ type: 'exit', session: end, exitCode })
    expect(runResult(h.controller.getProjectView()!)).toBe(exitCode === 0 ? 'Exited successfully (0)' : `Execution failed (exit ${exitCode ?? 'unknown'})`)
  })
  it('re-runs with fresh output and rejects old-session callbacks', async () => {
    const h = setup(); await launch(h)
    h.emit({ type: 'exit', session: session(undefined, 'EXITED'), exitCode: 0 })
    const next = session('run_aaaaaaaaaaaaaaaaaaaaaaaa')
    vi.mocked(h.api.startProject).mockResolvedValue(ok(next))
    await h.controller.startProject({ dirty: false, conflict: false })
    h.emit({ type: 'stdout', session: session(), data: 'stale' })
    h.emit({ type: 'stdout', session: next, data: 'fresh' })
    act(() => { for (const callback of h.frames.values()) callback(); h.frames.clear() })
    expect(h.controller.getProjectView()?.chunks.at(-1)?.data).toBe('fresh')
    expect(h.controller.getProjectView()?.chunks.some(chunk => chunk.data === 'stale')).toBe(false)
    expect(h.api.startProject).toHaveBeenCalledTimes(2)
  })
  it('retains failed cleanup for Retry Stop and blocks a replacement', async () => {
    const h = setup(); await launch(h)
    h.emit({ type: 'error', session: session(undefined, 'STOPPING'), failure: { reason: 'CLEANUP_FAILED' } })
    vi.mocked(h.api.stop).mockResolvedValueOnce(failed())
    await h.controller.stopProject(); await h.controller.startProject({ dirty: false, conflict: false })
    expect(h.api.startProject).toHaveBeenCalledTimes(1)
    h.renderUi(); fireEvent.click(screen.getByRole('button', { name: 'Retry Stop' }))
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledTimes(2))
    h.emit({ type: 'exit', session: session(undefined, 'CANCELLED'), exitCode: null })
    expect(runResult(h.controller.getProjectView()!)).toBe('Stopped')
  })
  it('invalidates sessions, buffered output and pending invokes on project switch/reopen', async () => {
    const h = setup(), pending = deferred<AppResult<CSharpRunSession>>()
    vi.mocked(h.api.startProject).mockReturnValue(pending.promise)
    await h.controller.resolveTargets(); const start = h.controller.startProject({ dirty: false, conflict: false })
    h.emit({ type: 'state', session: session() }); h.emit({ type: 'stdout', session: session(), data: 'old' })
    h.controller.activateProject(other); h.controller.activateProject(projectId)
    h.emit({ type: 'state', session: session() }); pending.resolve(ok(session())); await start
    expect(h.controller.getProjectView()).toBeUndefined(); expect(h.frames.size).toBe(0)
  })
  it('invalidates project unavailable state and disconnects both event streams', async () => {
    const h = setup(); await launch(h); h.controller.setAvailable(false)
    h.emit({ type: 'state', session: session() })
    expect(h.controller.getSnapshot().views.size).toBe(0)
    const disconnect = h.controller.connect(); disconnect()
    expect(h.controller.getSnapshot().projectId).toBeNull()
    expect(h.api.onProjectEvent).toHaveBeenCalledTimes(1)
  })
  it('serializes cancellation before fresh discovery for a reopened same project', async () => {
    const h = setup(), old = deferred<AppResult<CSharpRunTargetResolution>>(), cancel = deferred<AppResult<null>>()
    vi.mocked(h.api.resolveTargets).mockReturnValueOnce(old.promise)
    vi.mocked(h.api.cancelResolution).mockReturnValueOnce(cancel.promise)
    const first = h.controller.resolveTargets(); await Promise.resolve()
    h.controller.activateProject(null); h.controller.activateProject(projectId)
    const next = h.controller.resolveTargets(); await Promise.resolve()
    expect(h.api.resolveTargets).toHaveBeenCalledTimes(1)
    old.resolve(ok({ projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [] })); cancel.resolve(ok(null))
    await first; await next
    expect(h.api.resolveTargets).toHaveBeenCalledTimes(2)
    expect(h.controller.getSnapshot().resolution?.state).toBe('READY')
  })
  it('retains failed target cancellation and supports retry before replacement', async () => {
    const h = setup(), old = deferred<AppResult<CSharpRunTargetResolution>>()
    vi.mocked(h.api.resolveTargets).mockReturnValueOnce(old.promise)
    vi.mocked(h.api.cancelResolution).mockResolvedValueOnce(failed())
    const first = h.controller.resolveTargets(); await Promise.resolve()
    await h.controller.cancelTargets(); await h.controller.resolveTargets()
    expect(h.controller.getSnapshot().cancellationFailed).toBe(true)
    expect(h.api.resolveTargets).toHaveBeenCalledTimes(1)
    old.resolve(ok(ready)); await first; await h.controller.cancelTargets(); await h.controller.resolveTargets()
    expect(h.controller.getSnapshot().resolution?.state).toBe('READY')
  })
  it('drops remembered-session events during a new start after forced same-ID activation', async () => {
    const h = setup(); await launch(h)
    h.controller.activateProject(projectId, true)
    const pending = deferred<AppResult<CSharpRunSession>>()
    vi.mocked(h.api.startProject).mockReturnValue(pending.promise)
    await h.controller.resolveTargets(); const start = h.controller.startProject({ dirty: false, conflict: false })
    h.emit({ type: 'state', session: session() })
    expect(h.controller.getProjectView()?.session).toBeUndefined()
    const next = session('run_bbbbbbbbbbbbbbbbbbbbbbbb')
    pending.resolve(ok(next)); await start
    expect(h.controller.getProjectView()?.session?.sessionId).toBe(next.sessionId)
  })
  it('ignores an old target event after Main selection changes', async () => {
    const h = setup(); await launch(h)
    h.emit({ type: 'exit', session: session(undefined, 'EXITED'), exitCode: 0 })
    await h.controller.resolveTargets('select', 'other/App.csproj')
    h.emit({ type: 'error', session: session(undefined, 'FAILED'), failure: { reason: 'EXECUTION_FAILED', exitCode: 4 } })
    expect(h.controller.getProjectView()).toBeUndefined()
  })
  it('does not let target cancellation invalidate a concurrent JavaScript start', async () => {
    const h = setup(), pending = deferred<AppResult<CSharpRunTargetResolution>>()
    vi.mocked(h.api.resolveTargets).mockReturnValue(pending.promise)
    const discovering = h.controller.resolveTargets(); await Promise.resolve()
    const doc = h.models.openDocument(projectId, 'main.js', '')
    const js = { projectId, relativePath: 'main.js', state: 'RUNNING' as const, sessionId: 'run_cccccccccccccccccccccccc' as RunSessionId }
    const jsStart = deferred<AppResult<typeof js>>()
    vi.mocked(h.api.start).mockReturnValue(jsStart.promise)
    const start = h.controller.start(doc)
    const cancelling = h.controller.cancelTargets(); pending.resolve(ok(ready))
    await discovering; await cancelling; jsStart.resolve(ok(js)); await start
    expect(h.controller.getView('main.js')?.session).toEqual(js)
  })
  it('joins retired discovery when Main denies an old-project cancellation after a successful switch', async () => {
    const h = setup(), pending = deferred<AppResult<CSharpRunTargetResolution>>()
    vi.mocked(h.api.resolveTargets).mockReturnValueOnce(pending.promise)
    vi.mocked(h.api.cancelResolution).mockResolvedValueOnce({ ok: false, error: { code: 'PERMISSION_DENIED', retryable: false, message: 'Project retired' } })
    const first = h.controller.resolveTargets(); await Promise.resolve()
    h.controller.activateProject(other); h.controller.activateProject(projectId)
    const next = h.controller.resolveTargets(); pending.resolve(ok(ready)); await first; await next
    expect(h.controller.getSnapshot().resolution?.state).toBe('READY')
    expect(h.controller.getSnapshot().cancellationFailed).toBe(false)
  })
  it('shows dependency failure, mutation failure and a working keyboard Cancel', async () => {
    const h = setup({ projectId, state: 'DEPENDENCY_FAILED', dependency: { state: 'MISSING', reason: 'DOTNET_SDK_MISSING' }, candidates: [] })
    h.renderUi(); await waitFor(() => expect(h.controller.getSnapshot().resolution).toBeDefined())
    const trigger = screen.getByRole('button', { name: 'Choose Run target' }); trigger.focus(); fireEvent.click(trigger)
    expect(screen.getByText(/\.NET dependency: dotnet sdk missing/)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger)
    vi.mocked(h.api.selectTarget).mockResolvedValueOnce(failed())
    await act(() => h.controller.resolveTargets('select', target.relativePath))
    expect(h.controller.getSnapshot().resolution).toBeUndefined()
    expect(h.controller.getSnapshot().targetError).toBe('Cleanup failed')
  })
  it('retains C# Stop when Output is unmounted', async () => {
    const h = setup(); await launch(h)
    const ui = h.renderUi()
    ui.rerender(<EditorRunAction controller={h.controller} manager={h.models} locked={false} onShowOutput={vi.fn()} />)
    expect(screen.queryByLabelText('Output panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop Console project' }))
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledTimes(1))
  })
  it('invalidates READY after a structured stale-target failure', async () => {
    const h = setup(); await launch(h)
    h.emit({ type: 'error', session: session(undefined, 'FAILED'), failure: { reason: 'STALE_TARGET' } })
    h.emit({ type: 'exit', session: session(undefined, 'FAILED'), exitCode: null })
    await h.controller.startProject({ dirty: false, conflict: false })
    expect(h.controller.getSnapshot().resolution).toBeUndefined()
    expect(h.api.startProject).toHaveBeenCalledTimes(1)
  })
  it('keeps a rejected preflight visible until the student explicitly refreshes targets', async () => {
    const h = setup()
    vi.mocked(h.api.startProject).mockResolvedValueOnce({ ok: false, error: {
      code: 'NOT_FOUND', message: 'The selected project no longer exists. Refresh targets.', retryable: true,
    } })
    h.renderUi(); await waitFor(() => expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The selected project no longer exists. Refresh targets.'))
    expect(h.api.resolveTargets).toHaveBeenCalledTimes(1)
    expect(h.controller.getSnapshot().resolution).toBeUndefined()
  })
})
