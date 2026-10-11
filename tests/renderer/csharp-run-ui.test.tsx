/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CSharpProjectRunTarget, CSharpRunCandidate, CSharpRunSession, CSharpRunTargetResolution, ProjectId, ProjectRunEvent, RunApi } from '../../src/shared/contracts'
import { EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { EditorRunAction } from '../../src/renderer/src/features/output/EditorRunAction'
import { OutputPanel } from '../../src/renderer/src/features/output/OutputPanel'
import { RunController } from '../../src/renderer/src/features/output/run-controller'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const target: CSharpProjectRunTarget = { kind: 'csharp-project', projectId, relativePath: 'src/App/App.csproj' }
const candidates: CSharpRunCandidate[] = [{ relativePath: target.relativePath, displayName: 'App.csproj', eligibility: 'ELIGIBLE', reason: null }]
const ready: CSharpRunTargetResolution = { projectId, state: 'READY', target, candidates }
const required: CSharpRunTargetResolution = { projectId, state: 'SELECTION_REQUIRED', candidates }
const apiError = { code: 'PROCESS_FAILED', message: 'Request failed.', retryable: true } as const
const frames = new Map<number, () => void>()
const teardown: (() => void)[] = []

function session(state: CSharpRunSession['state'], phase: CSharpRunSession['phase'] = 'PREPARING'): CSharpRunSession {
  return { ...target, sessionId: `session_${state}_${phase}_1234567890` as CSharpRunSession['sessionId'], state, phase }
}

function setup(initial: CSharpRunTargetResolution = required) {
  let resolution = initial
  let eventListener: ((event: ProjectRunEvent) => void) | undefined
  const listeners = new Set<string>()
  const api = {
    onEvent: vi.fn(() => { listeners.add('js'); return () => { listeners.delete('js') } }),
    onProjectEvent: vi.fn((listener: (event: ProjectRunEvent) => void) => { eventListener = listener; listeners.add('csharp'); return () => { listeners.delete('csharp') } }),
    resolveTargets: vi.fn(async () => ({ ok: true as const, value: resolution })),
    selectTarget: vi.fn(async () => { resolution = ready; return { ok: true as const, value: ready } }),
    clearTarget: vi.fn(async () => { resolution = required; return { ok: true as const, value: required } }),
    cancelResolution: vi.fn(async () => ({ ok: true as const, value: null })),
    startProject: vi.fn(async () => ({ ok: true as const, value: session('STARTING') })),
    start: vi.fn(async () => ({ ok: false as const, error: apiError })),
    stop: vi.fn(async () => ({ ok: true as const, value: null })),
  } as unknown as RunApi
  let frameId = 0
  const controller = new RunController(api, callback => { frames.set(++frameId, callback); return frameId }, id => frames.delete(id))
  controller.activateProject(projectId)
  const models = new EditorModelManager({ createModel(value) {
    let content = value, version = 1
    const changes = new Set<() => void>()
    return { getValue: () => content, getVersionId: () => version,
      setValue(next) { content = next; version++; for (const changed of changes) changed() },
      onDidChangeContent(changed) { changes.add(changed); return { dispose: () => changes.delete(changed) } }, dispose() {} }
  } })
  const document = models.openDocument(projectId, 'Program.cs', 'Console.WriteLine("hi");')
  const emit = (event: ProjectRunEvent): void => eventListener?.(event)
  const flush = (): void => { for (const [id, callback] of [...frames]) { frames.delete(id); callback() } }
  const disconnect = controller.connect()
  teardown.push(disconnect, () => models.dispose())
  return { api, controller, models, document, emit, flush, listeners, disconnect }
}

function Workbench({ h, panel = true }: { h: ReturnType<typeof setup>; panel?: boolean }) {
  return <>
    <header className="chrome-center"><EditorRunAction manager={h.models} controller={h.controller} locked={false} onShowOutput={() => {}} /></header>
    {panel && <OutputPanel controller={h.controller} height={260} onHeightChange={vi.fn()} onSelectTerminal={vi.fn()} onSelectProblems={vi.fn()} onClosePanel={vi.fn()} />}
  </>
}

afterEach(() => { cleanup(); for (const dispose of teardown.splice(0)) dispose(); frames.clear() })

describe('M1-11 C# target and Run presentation', () => {
  it('requires an explicit candidate pick even when only one target is returned', async () => {
    const h = setup(required); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    const radio = await screen.findByRole('radio', { name: /App\.csproj/ })
    expect(radio.getAttribute('aria-checked')).toBe('false')
    expect((screen.getByRole('button', { name: 'Use target' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(radio)
    fireEvent.click(screen.getByRole('button', { name: 'Use target' }))
    await waitFor(() => expect(h.api.selectTarget).toHaveBeenCalledWith(target))
    expect(h.api.selectTarget).toHaveBeenCalledWith({ kind: 'csharp-project', projectId, relativePath: 'src/App/App.csproj' })
    expect(h.api.startProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Run target' })).toBeNull()
  })

  it('marks the shared dialog backdrop as an interactive Electron no-drag region', () => {
    // JSDOM cannot model Electron's draggable hit-testing, so pin the CSS
    // contract that lets pointer events reach controls rendered in the titlebar.
    const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/styles.css'), 'utf8')
    expect(css).toMatch(/\.dialog-backdrop\s*\{[^}]*-webkit-app-region:\s*no-drag/s)
  })

  it('opens and closes the chooser and dispatches Run mode callbacks', async () => {
    const h = setup(ready)
    const javascript = h.models.openDocument(projectId, 'script.js', 'console.log("ok")')
    h.models.activate(javascript.key)
    render(<Workbench h={h} />)
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    const dialog = screen.getByRole('dialog', { name: 'Run target' })
    const jsMode = screen.getByRole('button', { name: /Current file \(JavaScript\)/ })
    fireEvent.click(jsMode)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run target' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    const csharpMode = screen.getByRole('button', { name: /C# Console project/ })
    fireEvent.click(csharpMode)
    await waitFor(() => expect(screen.getByRole('button', { name: /C# Console project/ }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run target' })).toBeNull())
    expect(dialog.isConnected).toBe(false)
  })

  it.each([
    ['STALE_TARGET', 'The previous target is no longer available or eligible. Choose a target again.'],
    ['PERSISTENCE_RECOVERED', 'The saved target selection was recovered. Confirm a target before running.'],
  ] as const)('shows %s without auto-confirming a sole candidate', async (diagnostic, copy) => {
    const h = setup({ ...required, selectionDiagnostic: diagnostic }); render(<Workbench h={h} />)
    fireEvent.click(await screen.findByRole('button', { name: /Choose C# target/ }))
    expect((await screen.findByText(copy)).textContent).toBe(copy)
    expect((screen.getByRole('button', { name: 'Use target' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a recoverable empty state when discovery finds no runnable project', async () => {
    const h = setup({ projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [] })
    render(<Workbench h={h} />)
    fireEvent.click(await screen.findByRole('button', { name: /Choose C# target/ }))
    expect(await screen.findByText('No runnable Console project found.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use target' }).hasAttribute('disabled')).toBe(true)
    expect(h.api.startProject).not.toHaveBeenCalled()
  })

  it('refreshes and clears through the public target API', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved choice' }))
    await waitFor(() => expect(h.api.clearTarget).toHaveBeenCalledOnce())
    expect(h.api.resolveTargets).toHaveBeenNthCalledWith(1, { projectId })
    expect(h.api.resolveTargets).toHaveBeenNthCalledWith(2, { projectId })
    expect(h.api.clearTarget).toHaveBeenCalledWith({ projectId })
    expect(screen.getByRole('button', { name: 'Use target' }).hasAttribute('disabled')).toBe(true)
  })

  it('surfaces target API errors and keeps refresh available for recovery', async () => {
    const h = setup(ready)
    const api = h.api as unknown as { resolveTargets: ReturnType<typeof vi.fn> }
    api.resolveTargets.mockResolvedValue({ ok: false, error: apiError })
    render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(apiError.message))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(api.resolveTargets).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('alert').textContent).toBe(apiError.message)
  })

  it('subscribes before startProject and adopts early PREPARING/BUILDING events for Stop and Output', async () => {
    const h = setup(ready)
    const api = h.api as unknown as { startProject: ReturnType<typeof vi.fn>; onProjectEvent: ReturnType<typeof vi.fn> }
    api.startProject.mockImplementation(async () => {
      const preparing = session('STARTING')
      h.emit({ type: 'state', session: preparing })
      h.emit({ type: 'stdout', session: preparing, data: 'preflight note\n' })
      h.emit({ type: 'phase', session: { ...preparing, state: 'RUNNING', phase: 'BUILD_RESTORE' } })
      return { ok: true, value: preparing }
    })
    render(<Workbench h={h} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run C# project' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop C# project' })).toBeTruthy())
    expect(api.onProjectEvent.mock.invocationCallOrder[0]).toBeLessThan(api.startProject.mock.invocationCallOrder[0])
    expect(document.querySelector('.output-context [role="status"]')?.textContent).toBe('Building…')
    expect(screen.getByRole('region', { name: 'Build' }).textContent).toContain('Building…')
    expect(screen.getByRole('region', { name: 'Preparation' }).textContent).toContain('preflight note')
    expect(screen.getByRole('button', { name: 'C# target pinned: src/App/App.csproj' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop C# project' }))
    await waitFor(() => expect(h.api.stop).toHaveBeenCalledWith(session('STARTING').sessionId))
  })

  it('pins target/session, ignores a foreign session and retains the selected target when Output closes', async () => {
    const h = setup(ready); const view = render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop C# project' })).toBeTruthy())
    const active = { ...session('STARTING'), state: 'RUNNING' as const, phase: 'EXECUTING' as const }
    act(() => { const other = h.models.openDocument(projectId, 'Other.cs', ''); h.models.activate(other.key) })
    act(() => h.emit({ type: 'phase', session: active }))
    act(() => h.emit({ type: 'stdout', session: { ...active, sessionId: 'old_session_1234567890123456' as CSharpRunSession['sessionId'] }, data: 'stale output' }))
    expect(screen.getByLabelText(/Run output for src\/App\/App\.csproj/).textContent).not.toContain('stale output')
    view.rerender(<Workbench h={h} panel={false} />)
    expect(screen.getByRole('button', { name: 'C# target pinned: src/App/App.csproj' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop C# project' })).toBeTruthy()
  })

  it('fails closed on dirty retained source and never calls startProject or saves', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    act(() => h.document.model.setValue('unsaved'))
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Save changed files before running.')
    expect(h.api.startProject).not.toHaveBeenCalled()
    expect(h.document.model.getValue()).toBe('unsaved')
  })

  it('discards a C# event after the active project generation changes', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledOnce())
    const oldSession = session('STARTING')
    act(() => h.controller.activateProject(nextProjectId))
    act(() => h.emit({ type: 'stdout', session: oldSession, data: 'stale project output' }))
    expect(h.controller.getSnapshot().projectId).toBe(nextProjectId)
    expect(h.controller.getSnapshot().views.size).toBe(0)
  })

  it('keeps build failure and exit status instead of treating an accepted start as success', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledOnce())
    const preparing = session('STARTING')
    act(() => h.emit({ type: 'stdout', session: { ...preparing, phase: 'BUILD_RESTORE' }, data: 'restore output\nProgram.cs(3,1): error CS1002: ; expected\n' }))
    act(() => h.emit({ type: 'stderr', session: { ...preparing, phase: 'BUILD_RESTORE' }, data: 'build warning\n' }))
    act(() => h.flush())
    act(() => h.emit({ type: 'error', session: { ...preparing, state: 'FAILED', phase: 'BUILD_RESTORE' },
      failure: { reason: 'BUILD_OR_RESTORE_FAILED', exitCode: 7 } }))
    act(() => h.emit({ type: 'state', session: { ...preparing, state: 'FAILED', phase: 'BUILD_RESTORE' } }))
    act(() => h.emit({ type: 'exit', session: { ...preparing, state: 'FAILED', phase: 'BUILD_RESTORE' }, exitCode: 7 }))
    expect(document.querySelector('.output-context [role="status"]')?.textContent).toContain('Build or restore failed (exit 7)')
    expect(screen.getByRole('alert').textContent).toContain('Build or restore failed (exit 7)')
    expect(screen.getByRole('alert').textContent).toContain('Program.cs(3,1): error CS1002: ; expected')
    expect(screen.queryByRole('region', { name: 'Execution' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Build' }).textContent).toContain('Build failed')
    expect(screen.getByRole('button', { name: 'Hide build log' })).toBeTruthy()
    expect(screen.getByLabelText('Build log').textContent).toContain('stdoutrestore output')
    expect(screen.getByLabelText('Build log').textContent).toContain('stderrbuild warning')
  })

  it('summarizes successful build, keeps its log collapsible, streams execution separately, and retains exit code', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledOnce())
    const starting = session('STARTING')
    const building = { ...starting, state: 'RUNNING' as const, phase: 'BUILD_RESTORE' as const }
    act(() => {
      h.emit({ type: 'state', session: starting })
      h.emit({ type: 'phase', session: building })
      h.emit({ type: 'stdout', session: building, data: 'Determining projects to restore...\nAll projects are up-to-date for restore.\nApp -> bin\\Debug\\App.dll\nBuild succeeded.\n0 Warning(s)\n0 Error(s)\nTime Elapsed 00:00:02.97\n' })
      h.flush()
    })
    const executing = { ...building, phase: 'EXECUTING' as const }
    act(() => {
      h.emit({ type: 'phase', session: executing })
      h.emit({ type: 'stdout', session: executing, data: 'văn sỹ hà lương\n' })
      h.emit({ type: 'stderr', session: executing, data: 'runtime note\n' })
      h.flush()
    })
    expect(screen.getByRole('region', { name: 'Build' }).textContent).toContain('Build succeeded')
    expect(screen.getByRole('region', { name: 'Build' }).textContent).toContain('2.97s')
    expect(screen.getByRole('region', { name: 'Build' }).textContent).toContain('Restore up-to-date · 0 warnings · 0 errors')
    expect(screen.queryByText(/Determining projects to restore/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('văn sỹ hà lương')
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('stdout')
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('stderr')
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('Running')
    fireEvent.click(screen.getByRole('button', { name: 'View build log' }))
    expect(screen.getByLabelText('Build log').textContent).toContain('Determining projects to restore')
    fireEvent.click(screen.getByRole('button', { name: 'Hide build log' }))
    expect(screen.queryByLabelText('Build log')).toBeNull()
    const completed = { ...executing, state: 'EXITED' as const }
    act(() => h.emit({ type: 'exit', session: completed, exitCode: 13 }))
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('Exit code 13')
  })

  it('starts a fresh C# output view instead of carrying chunks from the completed run', async () => {
    const h = setup(ready); render(<Workbench h={h} />)
    await waitFor(() => expect(h.api.resolveTargets).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledOnce())
    const first = session('STARTING')
    const executing = { ...first, state: 'RUNNING' as const, phase: 'EXECUTING' as const }
    act(() => {
      h.emit({ type: 'state', session: first })
      h.emit({ type: 'phase', session: executing })
      h.emit({ type: 'stdout', session: executing, data: 'old output\n' })
      h.flush()
      h.emit({ type: 'exit', session: { ...executing, state: 'EXITED' }, exitCode: 0 })
    })
    expect(screen.getByRole('region', { name: 'Execution' }).textContent).toContain('old output')
    fireEvent.click(screen.getByRole('button', { name: 'Run C# project' }))
    await waitFor(() => expect(h.api.startProject).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('old output')).toBeNull()
  })

  it('cancels the target resolution when the chooser closes while discovery is active', async () => {
    const h = setup()
    let release!: (value: { ok: true; value: CSharpRunTargetResolution }) => void
    ;(h.api as unknown as { resolveTargets: ReturnType<typeof vi.fn> }).resolveTargets.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    render(<Workbench h={h} />)
    fireEvent.click(screen.getByRole('button', { name: /Choose C# target/ }))
    await screen.findByText('Finding Console projects…')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(h.api.cancelResolution).toHaveBeenCalledWith({ projectId }))
    release({ ok: true, value: ready })
    expect(screen.queryByRole('dialog', { name: 'Run target' })).toBeNull()
  })
})
