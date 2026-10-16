import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { RunIpcService } from '../../src/main/ipc/run-ipc-service'
import { IpcHandlerRegistry, type IpcInvokeEventLike } from '../../src/main/ipc/ipc-handler-registry'
import { DomainError } from '../../src/main/errors/app-error'
import { createPreloadApi } from '../../src/preload/bridge'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { RUN_CHANNELS, type ProjectId, type RunEvent, type StartRunRequest } from '../../src/shared/contracts'
import type { PipedProcessEvent } from '../../src/main/services/run/piped-process-adapter'
import { EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { EditorTabs } from '../../src/renderer/src/features/editor/EditorTabs'
import { EditorRunAction } from '../../src/renderer/src/features/output/EditorRunAction'
import { OutputPanel } from '../../src/renderer/src/features/output/OutputPanel'
import { RunController } from '../../src/renderer/src/features/output/run-controller'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProject = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const disposals: (() => Promise<void>)[] = []
afterEach(async () => { cleanup(); for (const dispose of disposals.splice(0)) await dispose() })
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
function setup(path = 'main.js') {
  const handlers = new Map<string, (event: IpcInvokeEventLike, payload: unknown) => Promise<unknown>>()
  const listeners = new Set<(event: unknown, payload: unknown) => void>()
  const events: RunEvent[] = []
  const frames = new Map<number, () => void>()
  let frameId = 0
  const registry = new IpcHandlerRegistry({ handle: (channel, listener) => { handlers.set(channel, listener) },
    removeHandler: (channel) => { handlers.delete(channel) } })
  const transport: IpcRendererLike = {
    invoke: vi.fn(async (channel, payload) => handlers.get(channel)!({ sender: { id: 7 } }, payload)),
    on: (_channel, listener) => { listeners.add(listener) },
    removeListener: (_channel, listener) => { listeners.delete(listener) },
  }
  const manager = new ProcessManager()
  const natives: { emit(event: PipedProcessEvent): void; finish(): void; gate: ReturnType<typeof deferred>; closing: ReturnType<typeof deferred>; released: boolean }[] = []
  const authority = {
    authorize: vi.fn(async (target: StartRunRequest) => ({ ...target, canonicalRoot: 'C:\\project', canonicalFile: `C:\\project\\${target.relativePath}` })),
    resolveRuntime: vi.fn(async () => ({ executable: 'C:\\node\\node.exe' })),
  }
  const adapter = { create: vi.fn((_execution: unknown, emit: (event: PipedProcessEvent) => void) => {
    const gate = deferred(), closing = deferred(), settled = deferred()
    const native = { emit, gate, closing, released: false, finish() {
      emit({ type: 'exit', exitCode: 0 }); emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' }); settled.resolve()
    } }
    natives.push(native)
    return { ownership: { mode: 'LEGACY_ROOT_OWNED' as const, rootPid: 123 }, settled: settled.promise,
      isReleased: () => native.released,
      close: async () => { closing.resolve(); await gate.promise; native.finish(); native.released = true } }
  }) }
  const emit = (event: RunEvent) => { for (const listener of listeners) listener({}, event) }
  const run = new RunService(authority, [new JavaScriptRunStrategy()], { adapter, manager, onEvent: (_owner, event) => { events.push(event); emit(event) } })
  const owner = vi.fn()
  const ipc = new RunIpcService(registry, run, owner); ipc.start()
  const api = createPreloadApi(transport)
  const controller = new RunController(api.run, (callback) => { frames.set(++frameId, callback); return frameId }, (id) => { frames.delete(id) })
  controller.activateProject(projectId)
  const models = new EditorModelManager({ createModel(value) {
    let content = value, version = 1
    const changes = new Set<() => void>()
    return { getValue: () => content, getVersionId: () => version,
      setValue(next) { content = next; version++; for (const listener of changes) listener() },
      onDidChangeContent(listener) { changes.add(listener); return { dispose: () => { changes.delete(listener) } } }, dispose() {} }
  } })
  const document = models.openDocument(projectId, path, 'console.log(1)')
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback() } }
  disposals.push(async () => { for (const native of natives) native.gate.resolve(); await run.stop(); ipc.stop(); models.dispose() })
  return { api, controller, models, document, transport, manager, run, natives, authority, adapter, events, emit, listeners, frames, flush, owner }
}
function Harness({ h }: { h: ReturnType<typeof setup> }) {
  const [open, setOpen] = useState(true)
  useEffect(() => h.controller.connect(), [h])
  return <>
    <header className="chrome-center"><EditorTabs manager={h.models} onClose={async () => {}} />
      <EditorRunAction manager={h.models} controller={h.controller} locked={false} onShowOutput={() => setOpen(true)} /></header>
    <button onClick={() => setOpen(!open)}>Toggle panel</button>
    {open && <OutputPanel controller={h.controller} height={260} onHeightChange={vi.fn()}
      onSelectTerminal={() => setOpen(false)} onSelectProblems={() => setOpen(false)} onClosePanel={() => setOpen(false)} />}
  </>
}
async function start(h: ReturnType<typeof setup>) {
  fireEvent.click(screen.getByRole('button', { name: 'Run' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop current file' }).hasAttribute('disabled')).toBe(false))
  return h.events.findLast((event) => event.session.state === 'RUNNING')!.session
}

describe('Phase 4E editor and narrow Run integration', () => {
  it('places one saved JS Run at the right of editor tabs and sends only the typed target', async () => {
    const h = setup(); render(<Harness h={h} />)
    expect(screen.getAllByRole('button', { name: 'Run' })).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Run current file' }).previousElementSibling?.getAttribute('aria-label')).toBe('Open editors')
    await start(h)
    expect(h.transport.invoke).toHaveBeenCalledWith(RUN_CHANNELS.start, { projectId, relativePath: 'main.js', dirty: false })
    expect(h.owner).toHaveBeenCalledWith(7)
    expect(Object.keys(h.api.run).sort()).toEqual(['cancelResolution', 'clearTarget', 'onEvent', 'onProjectEvent',
      'resolveTargets', 'selectTarget', 'start', 'startProject', 'stop'])
  })
  it('blocks dirty JS without autosave or an invocation', () => {
    const h = setup(); render(<Harness h={h} />)
    act(() => h.document.model.setValue('dirty'))
    const button = screen.getByRole('button', { name: /Run unavailable: Save/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(h.transport.invoke).not.toHaveBeenCalled()
    expect(h.document.model.getValue()).toBe('dirty')
  })
  it('allows Run after an explicit successful Save without creating a temporary target', async () => {
    const h = setup(); render(<Harness h={h} />)
    act(() => h.document.model.setValue('saved explicitly'))
    expect(screen.getByRole('button', { name: /Run unavailable: Save/ })).not.toBeNull()
    const snapshot = h.models.createSaveSnapshot(h.document.key)!
    act(() => { expect(h.models.acceptSave(snapshot)).toBe(true) })
    await start(h)
    expect(h.authority.authorize).toHaveBeenCalledWith({ projectId, relativePath: 'main.js', dirty: false }, 7)
    expect(h.adapter.create).toHaveBeenCalledOnce()
  })
  it.each(['main.ts', 'main.tsx', 'main.jsx', 'main.mjs', 'main.cjs', 'main.json', 'main.JS'])('blocks unsupported %s with appropriate feedback', (path) => {
    const h = setup(path); render(<Harness h={h} />)
    const button = screen.getByRole('button', { name: /Run unavailable/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    if (path === 'main.ts') expect(button.title).toContain('not supported in current V1')
    fireEvent.click(button)
    expect(h.transport.invoke).not.toHaveBeenCalled()
  })
  it('reports missing Node without a process spawn', async () => {
    const h = setup()
    h.authority.resolveRuntime.mockRejectedValue(new DomainError({ code: 'DEPENDENCY_MISSING', retryable: true, message: 'Missing' }))
    render(<Harness h={h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Node.js was not found on PATH. Install Node.js and restart the IDE.')
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Run failed')
  })
  it('renders safe spawn failure without raw exception details', async () => {
    const h = setup(); h.adapter.create.mockImplementationOnce(() => { throw new Error('private native stack C:\\secret') })
    render(<Harness h={h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The Run process could not be started.')
    expect(document.body.textContent).not.toContain('secret')
    expect(h.manager.size).toBe(0)
  })
  it('Stop targets the session and disables duplicate actions through cleanup', async () => {
    const h = setup(); render(<Harness h={h} />)
    const session = await start(h)
    fireEvent.click(screen.getByRole('button', { name: 'Stop current file' }))
    await act(async () => { await h.natives[0].closing.promise })
    expect(screen.getByRole('button', { name: 'Stopping…' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop current file' }).hasAttribute('disabled')).toBe(true)
    expect(h.transport.invoke).toHaveBeenLastCalledWith(RUN_CHANNELS.stop, { sessionId: session.sessionId })
    await act(async () => { h.natives[0].gate.resolve(); await h.run.stopRun(session.sessionId, 7) })
    expect(screen.getByRole('status').textContent).toBe('Stopped')
    expect(screen.getByRole('button', { name: 'Run' }).hasAttribute('disabled')).toBe(false)
    expect(h.manager.size).toBe(0)
  })
  it('re-run waits for Main cleanup, replaces output, and rejects late A chunks and states', async () => {
    const h = setup(); render(<Harness h={h} />)
    const a = await start(h)
    act(() => { h.natives[0].emit({ type: 'stdout', data: 'A text' }); h.flush() })
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }))
    await act(async () => { await h.natives[0].closing.promise })
    expect(h.natives).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('Stopping…')
    await act(async () => { h.natives[0].gate.resolve() })
    await waitFor(() => expect(h.natives).toHaveLength(2))
    act(() => {
      h.emit({ type: 'stdout', session: a, data: 'late A' })
      h.emit({ type: 'state', session: { ...a, state: 'STARTING' } })
      h.natives[1].emit({ type: 'stdout', data: 'B text' }); h.flush()
    })
    expect(screen.getByLabelText('Run output for main.js').textContent).toBe('[stdout] B text')
    expect(screen.getByRole('status').textContent).toBe('Running')
  })
})

describe('Phase 4E output and view lifecycle', () => {
  it.each([0, 7])('preserves stream order and renders exit %s', async (code) => {
    const h = setup(); render(<Harness h={h} />)
    const session = await start(h)
    act(() => {
      h.natives[0].emit({ type: 'stdout', data: 'hello\n' })
      h.natives[0].emit({ type: 'stderr', data: 'warning\n' })
      h.natives[0].emit({ type: 'stdout', data: 'last\n' })
      expect(h.frames.size).toBe(1)
      h.flush()
    })
    expect(screen.getByRole('tab', { name: 'Output' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('Run output for main.js').textContent).toBe('[stdout] hello\n[stderr] warning\n[stdout] last\n')
    await act(async () => { h.natives[0].emit({ type: 'exit', exitCode: code }); h.natives[0].gate.resolve(); await h.run.stopRun(session.sessionId, 7) })
    expect(screen.getByRole('status').textContent).toBe(code === 0 ? 'Exited successfully (0)' : 'Exited with code 7')
  })
  it('does not regress a fast completed run to the older invoke response', async () => {
    const h = setup(); render(<Harness h={h} />)
    const invoke = vi.mocked(h.transport.invoke).getMockImplementation()!
    vi.mocked(h.transport.invoke).mockImplementationOnce(async (channel, payload) => {
      const result = await invoke(channel, payload)
      h.natives[0].gate.resolve()
      h.natives[0].emit({ type: 'exit', exitCode: 0 })
      await h.run.stopProject(projectId)
      return result
    })
    await act(async () => { await h.controller.start(h.document) })
    expect(screen.getByRole('status').textContent).toBe('Exited successfully (0)')
  })
  it('isolates different targets and selects output for the target being stopped', async () => {
    const h = setup(); render(<Harness h={h} />)
    const a = await start(h)
    act(() => h.models.openDocument(projectId, 'other.js', ''))
    await start(h)
    act(() => { h.emit({ type: 'stdout', session: a, data: 'A only' }); h.flush() })
    expect(screen.getByLabelText('Run output for other.js').textContent).toBe('')
    act(() => h.models.activate(h.document.key))
    fireEvent.click(screen.getByRole('button', { name: 'Stop current file' }))
    expect(screen.getByLabelText('Run output for main.js').textContent).toContain('A only')
  })
  it('clears old project state, buffered frames and delayed start replies on project switch', async () => {
    const h = setup(); render(<Harness h={h} />)
    const a = await start(h)
    act(() => {
      h.emit({ type: 'stdout', session: a, data: 'queued A' })
      h.controller.activateProject(nextProject)
      h.emit({ type: 'stdout', session: a, data: 'late A' }); h.flush()
    })
    expect(h.frames.size).toBe(0)
    expect(screen.queryByLabelText('Run output for main.js')).toBeNull()
    expect(h.controller.getSnapshot().views.size).toBe(0)
  })
  it('unavailability clears active output and rejects new actions and stale events', async () => {
    const h = setup(); render(<Harness h={h} />)
    const a = await start(h)
    act(() => { h.controller.setAvailable(false); h.emit({ type: 'stdout', session: a, data: 'late' }); h.flush() })
    expect(screen.getByRole('button', { name: /Run unavailable: Project unavailable/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByLabelText('Run output for main.js')).toBeNull()
  })
  it('tab toggling and remount keep one event listener, unmount removes it and pending frames', async () => {
    const h = setup(); const view = render(<Harness h={h} />)
    const a = await start(h)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Toggle panel'))
    expect(h.listeners.size).toBe(1)
    act(() => h.emit({ type: 'stdout', session: a, data: 'buffered' }))
    view.unmount()
    expect(h.listeners.size).toBe(0)
    expect(h.frames.size).toBe(0)
    h.controller.activateProject(projectId)
    const remount = render(<Harness h={h} />)
    expect(h.listeners.size).toBe(1)
    remount.unmount()
    expect(h.listeners.size).toBe(0)
  })
  it('uses the existing accessible panel resizer and removes drag listeners when hidden', () => {
    const h = setup(); render(<Harness h={h} />)
    const separator = screen.getByRole('separator', { name: 'Resize Output panel' })
    fireEvent.pointerDown(separator, { clientY: 340 })
    expect(document.body.classList.contains('is-resizing-panel')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Hide Output' }))
    expect(document.body.classList.contains('is-resizing-panel')).toBe(false)
    expect(h.listeners.size).toBe(1)
  })
})
