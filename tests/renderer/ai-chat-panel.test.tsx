/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiApi, AiChatEvent, AiChatSession, AppResult, StudentIdeApi } from '../../src/shared/contracts'
import { AiChatPanel } from '../../src/renderer/src/features/ai/AiChatPanel'

const firstId = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'
const startChat = vi.fn<AiApi['startChat']>()
const stopChat = vi.fn<AiApi['stopChat']>()
const getStatus = vi.fn<AiApi['getStatus']>()
const listeners = new Set<(event: AiChatEvent) => void>()
beforeEach(() => {
  listeners.clear()
  startChat.mockReset().mockResolvedValue({ ok: true, value: { requestId: firstId } })
  stopChat.mockReset().mockResolvedValue({ ok: true, value: null })
  getStatus.mockReset().mockResolvedValue({ ok: true, value: 'ready' })
  window.studentIde = { ai: { startChat, stopChat, getStatus, onChatEvent: listener => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  } } } as StudentIdeApi
})
afterEach(cleanup)
function submit(text = 'Hello') {
  const input = screen.getByRole('textbox', { name: 'Ask Qwen' })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
  return input as HTMLTextAreaElement
}
async function emit(event: AiChatEvent) {
  await act(async () => { for (const listener of listeners) listener(event) })
}
async function start() {
  render(<AiChatPanel onClose={vi.fn()} />)
  const input = submit()
  await act(async () => {})
  return input
}

describe('Local AI streaming UI', () => {
  it('renders one growing assistant response, hides Thinking on first chunk, and sends history', async () => {
    const input = await start()
    expect(input.value).toBe('')
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByText('Thinking...')).toBeTruthy()
    expect(screen.queryByText('YOU', { exact: true })).toBeNull()
    expect(screen.queryByText('QWEN', { exact: true })).toBeNull()
    await emit({ type: 'chunk', requestId: firstId, content: 'First ' })
    expect(screen.queryByText('Thinking...')).toBeNull()
    await emit({ type: 'chunk', requestId: firstId, content: 'answer' })
    expect(screen.getByText('First answer')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    await emit({ type: 'complete', requestId: firstId })
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull()
    submit('Continue')
    expect(startChat).toHaveBeenLastCalledWith({ messages: [
      { role: 'user', content: 'Hello' }, { role: 'assistant', content: 'First answer' }, { role: 'user', content: 'Continue' },
    ] })
    await act(async () => {})
  })
  it('blocks second submission during generation', async () => {
    await start()
    submit('Do not queue')
    expect(startChat).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy()
  })
  it('keeps partial content after Stop, permits another submit and ignores late/duplicate events', async () => {
    await start()
    await emit({ type: 'chunk', requestId: firstId, content: 'Partial' })
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull())
    expect(stopChat).toHaveBeenCalledWith(firstId)
    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    startChat.mockResolvedValue({ ok: true, value: { requestId: secondId } })
    submit('Next')
    expect(startChat).toHaveBeenLastCalledWith({ messages: [
      { role: 'user', content: 'Hello' }, { role: 'user', content: 'Next' },
    ] })
    await act(async () => {})
    await emit({ type: 'chunk', requestId: firstId, content: 'OLD' })
    await emit({ type: 'complete', requestId: firstId })
    await emit({ type: 'stopped', requestId: firstId })
    expect(screen.getByText('Thinking...')).toBeTruthy()
    await emit({ type: 'chunk', requestId: secondId, content: 'New answer' })
    await emit({ type: 'complete', requestId: secondId })
    await emit({ type: 'chunk', requestId: secondId, content: 'Late' })
    expect(screen.getByText('New answer')).toBeTruthy()
    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText(/OLD|New answerLate/)).toBeNull()
    submit('Again')
    expect(startChat).toHaveBeenLastCalledWith({ messages: [
      { role: 'user', content: 'Hello' }, { role: 'user', content: 'Next' },
      { role: 'assistant', content: 'New answer' }, { role: 'user', content: 'Again' },
    ] })
    await act(async () => {})
  })
  it('handles events arriving before startChat acknowledgement', async () => {
    let resolve!: (value: AppResult<AiChatSession>) => void
    startChat.mockReturnValue(new Promise(done => { resolve = done }))
    render(<AiChatPanel onClose={vi.fn()} />)
    submit()
    await emit({ type: 'chunk', requestId: firstId, content: 'Early answer' })
    await emit({ type: 'complete', requestId: firstId })
    await act(async () => resolve({ ok: true, value: { requestId: firstId } }))
    expect(screen.getByText('Early answer')).toBeTruthy()
    expect(screen.queryByText('Thinking...')).toBeNull()
  })
  it('stops when acknowledgement arrives after Stop was clicked', async () => {
    let resolve!: (value: AppResult<AiChatSession>) => void
    startChat.mockReturnValue(new Promise(done => { resolve = done }))
    render(<AiChatPanel onClose={vi.fn()} />)
    submit()
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    await act(async () => resolve({ ok: true, value: { requestId: firstId } }))
    expect(stopChat).toHaveBeenCalledWith(firstId)
    expect(screen.queryByText('Thinking...')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it.each(['ollama-unavailable', 'model-unavailable'] as const)('shows %s', async value => {
    getStatus.mockResolvedValue({ ok: true, value })
    render(<AiChatPanel onClose={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain(value === 'model-unavailable' ? 'qwen3:1.7b' : 'Ollama')
  })
  it('retains partial text on stream error and allows another submit', async () => {
    await start()
    await emit({ type: 'chunk', requestId: firstId, content: 'Partial' })
    await emit({ type: 'error', requestId: firstId, error: { code: 'PROCESS_FAILED', message: 'Ollama stream was interrupted.', retryable: true } })
    expect(screen.getByRole('alert').textContent).toContain('interrupted')
    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText('Thinking...')).toBeNull()
    submit('Retry')
    expect(startChat).toHaveBeenCalledTimes(2)
    expect(startChat).toHaveBeenLastCalledWith({ messages: [
      { role: 'user', content: 'Hello' }, { role: 'user', content: 'Retry' },
    ] })
    await act(async () => {})
  })
  it('preserves multiline plain text and wraps long code lines for both roles', async () => {
    render(<AiChatPanel onClose={vi.fn()} />)
    const prompt = 'Explain this:\n    const value = 1;\n    return value;'
    const answer = `function example() {\n    return "${'x'.repeat(300)}";\n}`
    submit(prompt)
    await act(async () => {})
    await emit({ type: 'chunk', requestId: firstId, content: answer })
    await emit({ type: 'complete', requestId: firstId })
    for (const [index, text] of [prompt, answer].entries()) {
      const surface = screen.getAllByRole('article')[index].querySelector<HTMLElement>('[data-slot="message-bubble-content"]')!
      expect(surface.textContent).toBe(text)
      expect(getComputedStyle(surface).whiteSpace).toBe('pre-wrap')
      expect(getComputedStyle(surface).overflowWrap).toBe('anywhere')
    }
    expect(startChat).toHaveBeenCalledWith({ messages: [{ role: 'user', content: prompt }] })
  })
  it.each(['result', 'rejection'])('handles start %s failure without crashing', async kind => {
    if (kind === 'result') startChat.mockResolvedValue({ ok: false, error: { code: 'PROCESS_FAILED', message: 'Ollama failed.', retryable: true } })
    else startChat.mockRejectedValue(new Error('private transport detail'))
    await start()
    expect(screen.getByRole('alert').textContent).toContain('Ollama')
    expect(screen.queryByText('Thinking...')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull()
  })
  it('unsubscribes and cancels on unmount, including a delayed acknowledgement', async () => {
    let resolve!: (value: AppResult<AiChatSession>) => void
    startChat.mockReturnValue(new Promise(done => { resolve = done }))
    const view = render(<AiChatPanel onClose={vi.fn()} />)
    submit()
    view.unmount()
    expect(listeners.size).toBe(0)
    await act(async () => resolve({ ok: true, value: { requestId: firstId } }))
    expect(stopChat).toHaveBeenCalledWith(firstId)
  })
  it('cancels an acknowledged request on unmount', async () => {
    await start()
    cleanup()
    expect(stopChat).toHaveBeenCalledWith(firstId)
    expect(listeners.size).toBe(0)
  })
  it('preserves Shift+Enter/IME/whitespace behavior and close action', async () => {
    const close = vi.fn()
    render(<AiChatPanel onClose={close} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Edit' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true)
    submit('   ')
    expect(startChat).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close Local AI chat' }))
    expect(close).toHaveBeenCalledOnce()
    await act(async () => {})
  })
})
