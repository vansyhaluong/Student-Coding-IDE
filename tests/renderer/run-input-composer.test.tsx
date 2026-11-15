/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppResult, CSharpRunSession, CSharpRunTargetResolution, ProjectId, ProjectRunEvent, RunApi, RunInputStatus, RunSessionId } from '../../src/shared/contracts'
import { OutputPanel } from '../../src/renderer/src/features/output/OutputPanel'
import { RunController } from '../../src/renderer/src/features/output/run-controller'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const sessionId = 'run_12345678-1234-1234-1234-123456789abc' as RunSessionId
const nextId = 'run_abcdefab-1234-1234-1234-123456789abc' as RunSessionId
const target = { kind: 'csharp-project' as const, projectId, relativePath: 'App.csproj' }
const ready: CSharpRunTargetResolution = { projectId, state: 'READY', target,
  candidates: [{ relativePath: target.relativePath, displayName: 'App', eligibility: 'ELIGIBLE', reason: null }] }
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const session = (id = sessionId, state: CSharpRunSession['state'] = 'RUNNING', phase: CSharpRunSession['phase'] = 'EXECUTING'): CSharpRunSession =>
  ({ ...target, sessionId: id, state, phase })
function lineStatus(id: RunSessionId, nextSequence: number, closed?: 'EOF' | 'EXITED'): RunInputStatus {
  const base = { projectId, sessionId: id, capability: { mode: 'line-input' as const, acceptsInput: true as const },
    nextSequence, queuedSubmissions: 0, queuedUtf8Bytes: 0 }
  return closed ? { ...base, gate: 'CLOSED', reason: closed } : { ...base, gate: 'OPEN' }
}
const closedCapability = (id: RunSessionId): RunInputStatus => ({
  projectId, sessionId: id, capability: { mode: 'closed', acceptsInput: false }, nextSequence: 1,
  queuedSubmissions: 0, queuedUtf8Bytes: 0, gate: 'CLOSED', reason: 'EOF',
})

function setup() {
  let listener: ((event: ProjectRunEvent) => void) | undefined
  let current = lineStatus(sessionId, 1)
  const api: RunApi = {
    onEvent: vi.fn(() => () => {}),
    onProjectEvent: vi.fn(callback => { listener = callback; return () => { listener = undefined } }),
    resolveTargets: vi.fn(async () => ok(ready)), selectTarget: vi.fn(async () => ok(ready)),
    clearTarget: vi.fn(async () => ok(ready)), cancelResolution: vi.fn(async () => ok(null)),
    startProject: vi.fn(async () => ok(session(sessionId, 'STARTING', 'PREPARING'))),
    sendInput: vi.fn(async request => {
      current = lineStatus(request.sessionId, request.sequence + 1)
      return ok({ projectId, sessionId: request.sessionId, sequence: request.sequence, state: 'DELIVERED' as const })
    }),
    closeInput: vi.fn(async request => {
      current = lineStatus(request.sessionId, request.sequence + 1, 'EOF')
      return ok({ projectId, sessionId: request.sessionId, sequence: request.sequence, state: 'DELIVERED' as const })
    }),
    inputStatus: vi.fn(async () => ok(current)),
    start: vi.fn(async () => ok({ projectId, relativePath: 'main.js', sessionId, state: 'RUNNING' as const })),
    stop: vi.fn(async () => ok(null)),
  }
  let serial = 0
  const frames = new Map<number, () => void>()
  const controller = new RunController(api, callback => { frames.set(++serial, callback); return serial }, frame => { frames.delete(frame) })
  controller.activateProject(projectId)
  const disconnect = controller.connect()
  sessions.push(disconnect)
  const emit = (event: ProjectRunEvent) => act(() => listener?.(event))
  const flush = () => act(() => { for (const callback of [...frames.values()]) callback(); frames.clear() })
  const renderUi = () => render(<OutputPanel controller={controller} height={260} onHeightChange={vi.fn()}
    onSelectTerminal={vi.fn()} onSelectProblems={vi.fn()} onClosePanel={vi.fn()} />)
  return { api, controller, emit, flush, renderUi, disconnect, setStatus: (value: RunInputStatus) => { current = value } }
}
async function executing(h: ReturnType<typeof setup>) {
  await h.controller.resolveTargets()
  await h.controller.startProject({ dirty: false, conflict: false })
  h.renderUi()
  h.emit({ type: 'phase', session: session() })
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Console input' })).toBeTruthy())
}
const box = () => screen.getByRole('textbox', { name: 'Console input' }) as HTMLTextAreaElement
const chunkText = () => Array.from(document.querySelectorAll('.output-chunk')).map(node => node.textContent ?? '').join('')
const sessions: Array<() => void> = []
afterEach(() => { cleanup(); for (const disconnect of sessions.splice(0)) disconnect() })

describe('M2-05 Output line composer', () => {
  it('hides input for JavaScript and for a build step that has no writer', async () => {
    const javascript = setup(); javascript.renderUi()
    await javascript.controller.start({ projectId, relativePath: 'main.js', dirty: false, diskState: 'available', externalConflict: false })
    expect(screen.queryByRole('textbox', { name: 'Console input' })).toBeNull()
    expect(javascript.api.inputStatus).not.toHaveBeenCalled()

    const build = setup(); build.setStatus(closedCapability(sessionId)); build.renderUi()
    await build.controller.resolveTargets()
    await build.controller.startProject({ dirty: false, conflict: false })
    build.emit({ type: 'phase', session: session(sessionId, 'RUNNING', 'BUILD_RESTORE') })
    build.emit({ type: 'exit', session: session(sessionId, 'FAILED', 'BUILD_RESTORE'), exitCode: 1 })
    await act(async () => { await Promise.resolve() })
    await waitFor(() => expect(build.api.inputStatus).toHaveBeenCalled())
    expect(screen.queryByRole('textbox', { name: 'Console input' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'EOF' })).toBeNull()
    expect(screen.queryByText('End of input sent.')).toBeNull()
  })

  it('types on the WriteLine prompt line and keeps the name there', async () => {
    const h = setup(); await executing(h)
    h.emit({ type: 'stdout', session: session(), data: 'Nhập tên:\r\n' })
    h.flush()
    const log = screen.getByLabelText(/Run output/)
    const dock = document.querySelector('.output-prompt-dock')
    const prompt = dock?.querySelector('.output-stdout')
    expect(prompt?.textContent).toBe('[stdout] Nhập tên:')
    expect(prompt?.nextElementSibling).toBe(box())
    box().blur()
    fireEvent.mouseDown(prompt!)
    expect(document.activeElement).toBe(box())
    box().blur()
    const earlier = log.querySelector('.output-phase')
    expect(earlier).toBeTruthy()
    fireEvent.mouseDown(earlier!)
    expect(document.activeElement).toBe(box())
    fireEvent.change(box(), { target: { value: 'Lan' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(box().value).toBe(''))
    h.emit({ type: 'stdout', session: session(), data: 'Xin chào Lan\r\n' })
    h.flush()
    const stored = h.controller.getProjectView()?.chunks.filter(chunk => chunk.stream !== 'phase')
    expect(stored).toEqual([
      { stream: 'stdout', data: 'Nhập tên:' },
      { stream: 'input', data: 'Lan\n' },
      { stream: 'stdout', data: 'Xin chào Lan\r\n' },
    ])
    const shown = Array.from(document.querySelectorAll('.output-chunk')).map(node => node.textContent)
    expect(shown).toContain('[stdout] Nhập tên:')
    expect(shown).toContain('Lan\n')
    expect(shown.at(-1)).toBe('[stdout] Xin chào Lan')
    expect(document.querySelector('.output-prompt-dock')?.querySelector('.output-chunk')?.nextElementSibling).toBe(box())
    fireEvent.keyDown(document.body, { key: 'M' })
    expect(box().value).toBe('M')
  })

  it('sends one line on Enter, keeps Shift+Enter and IME Enter, and sends the next line', async () => {
    const h = setup(); await executing(h)
    fireEvent.change(box(), { target: { value: 'xin chào' } })
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(box(), { key: 'Process' })
    expect(h.api.sendInput).not.toHaveBeenCalled()
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(box().value).toBe(''))
    expect(h.api.sendInput).toHaveBeenCalledTimes(1)
    expect(h.api.sendInput).toHaveBeenCalledWith({ projectId, sessionId, sequence: 1, text: 'xin chào' })
    expect(h.api.sendInput.mock.calls[0][0]).not.toHaveProperty('command')
    fireEvent.change(box(), { target: { value: 'a\nb' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(box().value).toBe(''))
    expect(h.api.sendInput).toHaveBeenLastCalledWith({ projectId, sessionId, sequence: 2, text: 'a\nb' })
    expect(chunkText()).toContain('xin chào\n')
    expect(chunkText()).toContain('a\nb\n')
    expect(document.querySelector('.output-prompt-dock')?.contains(box())).toBe(true)
  })

  it('keeps an empty line, rejects a NUL locally, and does not resend a busy line', async () => {
    const h = setup(); await executing(h)
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(h.api.sendInput).toHaveBeenCalledWith({ projectId, sessionId, sequence: 1, text: '' }))
    h.controller.setInputDraft('bad\0line')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(h.api.sendInput).toHaveBeenCalledTimes(1)
    expect(h.controller.getSnapshot().consoleInput?.draft).toBe('bad\0line')

    let release!: (value: AppResult<{ projectId: ProjectId; sessionId: RunSessionId; sequence: number; state: 'DELIVERED' }>) => void
    h.api.sendInput.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    h.controller.setInputDraft('held')
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(box().hasAttribute('disabled')).toBe(true))
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(h.api.sendInput).toHaveBeenCalledTimes(2)
    h.setStatus(lineStatus(sessionId, 3))
    await act(async () => { release(ok({ projectId, sessionId, sequence: 2, state: 'DELIVERED' })) })
    await waitFor(() => expect(box().value).toBe(''))
    expect(h.api.sendInput).toHaveBeenCalledTimes(2)

    h.api.sendInput.mockResolvedValueOnce(ok({ projectId, sessionId, sequence: 3, state: 'REJECTED', reason: 'INPUT_BUSY', retryable: true }))
    h.controller.setInputDraft('again')
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(h.controller.getSnapshot().consoleInput?.notice).toBe('Input is busy. Send the line again.'))
    expect(box().value).toBe('again')
    expect(h.api.sendInput).toHaveBeenCalledTimes(3)
  })

  it('keeps an unsent draft when input closes and shows no Send or EOF control', async () => {
    const h = setup(); await executing(h)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'EOF' })).toBeNull()
    fireEvent.change(box(), { target: { value: 'still here' } })
    await h.controller.submitEof()
    await waitFor(() => expect(box().hasAttribute('disabled')).toBe(true))
    expect(h.api.closeInput).toHaveBeenCalledWith({ projectId, sessionId, sequence: 1 })
    expect(h.api.sendInput).not.toHaveBeenCalled()
    expect(box().value).toBe('still here')
  })

  it('drops unsent text and a late acknowledgement when the Console project runs again', async () => {
    const unsent = setup(); await executing(unsent)
    fireEvent.change(box(), { target: { value: 'keep me' } })
    unsent.setStatus(lineStatus(sessionId, 1, 'EXITED'))
    unsent.emit({ type: 'exit', session: session(sessionId, 'EXITED'), exitCode: 0 })
    await waitFor(() => expect(box().hasAttribute('disabled')).toBe(true))
    expect(box().value).toBe('keep me')
    expect(chunkText()).not.toContain('keep me')
    expect(document.querySelector('.output-prompt-dock')?.contains(box())).toBe(true)
    expect(unsent.api.sendInput).not.toHaveBeenCalled()
    vi.mocked(unsent.api.startProject).mockResolvedValueOnce(ok(session(nextId, 'STARTING', 'PREPARING')))
    unsent.setStatus(lineStatus(nextId, 1))
    await unsent.controller.startProject({ dirty: false, conflict: false })
    unsent.emit({ type: 'phase', session: session(nextId) })
    await waitFor(() => expect(box().value).toBe(''))
    expect(unsent.api.sendInput).not.toHaveBeenCalled()
    cleanup()

    const late = setup(); await executing(late)
    let release!: (value: AppResult<{ projectId: ProjectId; sessionId: RunSessionId; sequence: number; state: 'DELIVERED' }>) => void
    late.api.sendInput.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    fireEvent.change(box(), { target: { value: 'old line' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(late.api.sendInput).toHaveBeenCalledTimes(1))
    late.emit({ type: 'exit', session: session(sessionId, 'EXITED'), exitCode: 0 })
    vi.mocked(late.api.startProject).mockResolvedValueOnce(ok(session(nextId, 'STARTING', 'PREPARING')))
    late.setStatus(lineStatus(nextId, 1))
    await late.controller.startProject({ dirty: false, conflict: false })
    await act(async () => { release(ok({ projectId, sessionId, sequence: 1, state: 'DELIVERED' })) })
    late.emit({ type: 'phase', session: session(nextId) })
    await waitFor(() => expect(box().value).toBe(''))
    expect(late.api.sendInput).toHaveBeenCalledTimes(1)
    expect(late.api.sendInput).toHaveBeenCalledWith({ projectId, sessionId, sequence: 1, text: 'old line' })
  })
})
