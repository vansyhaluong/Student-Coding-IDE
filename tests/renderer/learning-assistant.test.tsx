/** @vitest-environment jsdom */
import { StrictMode } from 'react'
import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningAssistantPanel } from '../../src/renderer/src/features/learning/LearningAssistantPanel'
import { chatIpcFixture, chatEnvelope } from '../fixtures/learning/chat-ipc'
import { selection } from '../fixtures/learning/chat'
import type { ChatContextInput } from '../../src/shared/contracts/learning-chat'
import type { SmartSourceSnapshot } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-transport'
import { validateChatPrepare } from '../../src/shared/contracts/learning-chat-validation'

const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }) })
})
afterEach(async () => {
  cleanup()
  for (const f of fixtures.splice(0)) await f.close()
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function fixture(strict = false) {
  const f = await chatIpcFixture(); fixtures.push(f)
  Object.defineProperty(window, 'studentIde', { configurable: true, value: { learning: { chat: f.api } } })
  let context: ChatContextInput = f.context, fresh = true, selected = true
  const capture = (): SmartSourceSnapshot | undefined => context.kind === 'PRACTICE' ? {
    exerciseId: context.exerciseId, language: context.language, source: context.source,
    origin: { kind: 'PRACTICE', modelId: context.modelId, modelVersion: context.modelVersion, eol: context.eol },
    selection: selected ? selection(context.source) : undefined, isCurrent: () => fresh,
  } : undefined
  const onClose = vi.fn()
  const element = () => strict ? <StrictMode><LearningAssistantPanel context={context} capture={capture} onClose={onClose} /></StrictMode>
    : <LearningAssistantPanel context={context} capture={capture} onClose={onClose} />
  const view = render(element())
  await screen.findByText('Ready')
  return { ...f, ...view, onClose, capture, change: (next: ChatContextInput) => { context = next; view.rerender(element()) },
    stale: () => { fresh = false }, noSelection: () => { selected = false } }
}
async function prepare(scope = 'QUESTION_ONLY', question = 'Explain the loop') {
  fireEvent.change(screen.getByLabelText('Ngữ cảnh Chat'), { target: { value: scope } })
  fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  return screen.findByRole('region', { name: 'Xác nhận gửi Gemini' })
}
const confirm = () => fireEvent.click(screen.getByText('Đồng ý gửi Gemini'))

describe('C4-A Learning Assistant through real typed bridge, Main and fake Gemini', () => {
  it('C4-E composes beUI messages, context chip and keyboard composer without inferring before consent', async () => {
    const f = await fixture(), input = screen.getByLabelText('Câu hỏi')
    expect(document.activeElement).toBe(input)
    expect(screen.getByRole('heading', { name: 'AI Learning Assistant' })).toBeTruthy()
    expect(document.querySelector('[data-slot="message-scroller"]')).toBeTruthy()
    expect(input.closest('form')?.querySelector('[aria-label="Quick Actions"]')).toBeTruthy()
    expect(input.closest('form')?.querySelector('.assistant-context-chip select')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'A keyboard question' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }); expect(f.transport.invoke.mock.calls.some(([c]) => c === 'learning-chat:prepare')).toBe(false)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true }); expect(f.transport.invoke.mock.calls.some(([c]) => c === 'learning-chat:prepare')).toBe(false)
    fireEvent.keyDown(input, { key: 'Enter' })
    const consent = await screen.findByRole('region', { name: 'Xác nhận gửi Gemini' })
    expect(document.activeElement).toBe(within(consent).getByRole('button', { name: 'Đồng ý gửi Gemini' }))
    expect(f.send).not.toHaveBeenCalled()
    fireEvent.click(within(consent).getByRole('button', { name: 'Cancel' }))
    await screen.findByText('Cancelled')
    await waitFor(() => expect(document.activeElement).toBe(input))
  })
  it('C4-E renders completed Markdown and code safely without links, remote images or editor actions', async () => {
    const f = await fixture(), original = f.send.getMockImplementation()!
    const markdown = '## Approach\n\n**Use the input.**\n\n```javascript\nreturn n + 1;\n```\n\n[link](javascript:alert(1))\n![remote](https://example.invalid/private.png)\n<script>alert(1)</script>'
    f.send.mockImplementation(r => r.method === 'GET' ? original(r) : Promise.resolve(Response.json(chatEnvelope({ kind: 'CHAT_REPLY', text: markdown }))))
    await prepare(); confirm()
    await screen.findByText('Complete')
    await screen.findByRole('heading', { name: 'Approach' })
    const log = screen.getByRole('log')
    expect(log.querySelector('strong')?.textContent).toBe('Bạn')
    expect(log.querySelector('code.language-javascript')?.textContent).toBe('return n + 1;')
    expect(log.querySelector('script, img, a')).toBeNull()
    expect(log.querySelectorAll('[data-slot="message"]')).toHaveLength(2)
    expect(log.querySelector('[data-from="user"] [data-slot="message-bubble"]')).toBeTruthy()
    expect(log.querySelector('[data-from="assistant"] .assistant-markdown')).toBeTruthy()
    expect(within(log).queryByRole('button', { name: /Apply|Review Diff/ })).toBeNull()
  })
  it('C4-E latest-message control scrolls only its transcript viewport and Escape closes the panel', async () => {
    const f = await fixture(), viewport = screen.getByRole('log').parentElement!
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 })
    viewport.scrollTop = 0
    fireEvent.click(screen.getByRole('button', { name: 'Tin nhắn mới nhất' }))
    expect(viewport.scrollTop).toBe(1000)
    fireEvent.keyDown(screen.getByLabelText('Câu hỏi'), { key: 'Escape' })
    expect(f.onClose).toHaveBeenCalledOnce()
  })
  it('C4-E completion does not steal focus from an editor outside the panel', async () => {
    const f = await fixture(), response = gate<Response>(), original = f.send.getMockImplementation()!
    f.send.mockImplementation(r => r.method === 'POST' ? response.promise : original(r))
    const editor = document.createElement('textarea'); document.body.append(editor)
    try {
      await prepare(); confirm()
      await waitFor(() => expect(f.send.mock.calls.some(([r]) => r.method === 'POST')).toBe(true))
      editor.focus()
      response.resolve(Response.json(chatEnvelope()))
      await screen.findByText('Complete')
      expect(document.activeElement).toBe(editor)
    } finally { editor.remove() }
  })
  it('opens/gets without inference, empty composer validation and closes on unmount', async () => {
    const f = await fixture(), close = vi.spyOn(f.api, 'closeSession')
    expect(f.send).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'x'.repeat(4097) } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(f.send).not.toHaveBeenCalled()
    f.unmount(); await waitFor(() => expect(close).toHaveBeenCalledOnce())
  })
  it.each(['QUESTION_ONLY', 'QUESTION_WITH_SELECTION', 'QUESTION_WITH_SOURCE'])('requires manifest consent for %s and commits only backend history', async scope => {
    const f = await fixture()
    const consent = await prepare(scope)
    expect(screen.getByLabelText('Câu hỏi').closest('form')?.hidden).toBe(true)
    expect(within(consent).getByText(scope)).toBeTruthy()
    expect(f.send).not.toHaveBeenCalled()
    const checked = validateChatPrepare(f.transport.invoke.mock.calls.find(([c]) => c === 'learning-chat:prepare')![1])
    if (!checked.ok) throw Error('Invalid prepare')
    const request = checked.value
    expect(request.attachment).toEqual(scope === 'QUESTION_ONLY' ? null : scope === 'QUESTION_WITH_SOURCE'
      ? { source: f.context.kind === 'PRACTICE' ? f.context.source : '' }
      : { source: f.context.kind === 'PRACTICE' ? f.context.source : '', selection: selection(f.context.kind === 'PRACTICE' ? f.context.source : '') })
    expect(screen.queryByText('Explain the loop', { selector: 'article p' })).toBeNull()
    confirm(); await screen.findByText('Complete')
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByRole('article')).toHaveLength(2))
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1)
  })
  it('supports two turns with fake Gemini and backend replay', async () => {
    const f = await fixture()
    await prepare(); confirm(); await screen.findByText('Complete')
    await prepare('QUESTION_ONLY', 'What about zero?'); confirm()
    await waitFor(() => expect(within(screen.getByRole('log')).getAllByRole('article')).toHaveLength(4))
    const posts = f.send.mock.calls.filter(([r]) => r.method === 'POST')
    const body = await posts[1][0].clone().json()
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
  })
  it('rejects missing selection and stale snapshots before prepare', async () => {
    const f = await fixture(); f.noSelection()
    fireEvent.change(screen.getByLabelText('Ngữ cảnh Chat'), { target: { value: 'QUESTION_WITH_SELECTION' } })
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'Why?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' })); expect(await screen.findByRole('alert')).toBeTruthy()
    f.stale(); fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(f.transport.invoke.mock.calls.filter(([c]) => c === 'learning-chat:prepare')).toHaveLength(0)
  })
  it('cancels consent when the selection changes before confirmation', async () => {
    const f = await fixture(); await prepare('QUESTION_WITH_SELECTION'); f.stale(); confirm()
    await screen.findByText('Cancelled'); expect(f.send).not.toHaveBeenCalled()
  })
  it('cancels prepared input without inference', async () => {
    const f = await fixture(); await prepare(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByText('Cancelled'); expect(f.send).not.toHaveBeenCalled()
    expect(screen.getByRole('log').querySelectorAll('[data-message-id]')).toHaveLength(0)
  })
  it('handles pending, duplicate send/confirm, cancellation and a late response', async () => {
    const f = await fixture(), response = gate<Response>()
    f.send.mockImplementation(async r => r.method === 'GET'
      ? Response.json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 }) : response.promise)
    const start = vi.spyOn(f.api, 'start')
    await prepare(); const send = screen.getByText('Đồng ý gửi Gemini'); fireEvent.click(send); fireEvent.click(send)
    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    await waitFor(() => expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1))
    expect((screen.getByLabelText('Câu hỏi') as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })); await screen.findByText('Cancelled')
    await act(async () => { response.resolve(Response.json(chatEnvelope())); await response.promise })
    expect(screen.getByRole('log').querySelectorAll('[data-message-id]')).toHaveLength(0)
  })
  it('shows Failed on provider failure without optimistic history', async () => {
    const f = await fixture()
    f.send.mockImplementation(async () => new Response('', { status: 503 }))
    await prepare(); confirm()
    await screen.findByText(/^Failed/)
    expect(screen.getByRole('log').querySelectorAll('[data-message-id]')).toHaveLength(0)
  })
  it('shows Expired when prepared consent expires', async () => {
    const f = await fixture(); await prepare(); f.advance(61000)
    await screen.findByText('Expired', {}, { timeout: 2000 }); expect(f.send).not.toHaveBeenCalled()
  })
  it('updates source binding and retires the previous consent', async () => {
    const f = await fixture(); await prepare()
    if (f.context.kind !== 'PRACTICE') throw Error('fixture')
    const update = vi.spyOn(f.api, 'updateContext')
    f.change({ ...f.context, source: f.context.source + '\r\n', sourceRevision: 2, modelVersion: 2 })
    await screen.findByText('Ready'); expect(update).toHaveBeenCalledOnce()
    expect(screen.queryByText('Đồng ý gửi Gemini')).toBeNull(); expect(f.send).not.toHaveBeenCalled()
  })
  it('closes old session on language/chapter navigation and opens Learning context', async () => {
    const f = await fixture(), close = vi.spyOn(f.api, 'closeSession')
    f.change({ kind: 'LEARNING', courseId: 'synthetic', chapter: 2 })
    await screen.findByText('Ready'); expect(close).toHaveBeenCalledWith(expect.objectContaining({ reason: 'CONTEXT_CHANGED' }))
    expect((screen.getByRole('option', { name: 'Code đã chọn' }) as HTMLOptionElement).disabled).toBe(true)
    await prepare(); confirm(); await screen.findByText('Complete')
  })
  it('survives StrictMode cleanup without retaining an orphan session', async () => {
    const f = await fixture(true), close = vi.spyOn(f.api, 'closeSession')
    f.unmount(); await waitFor(() => expect(close).toHaveBeenCalledOnce())
  })
  it('ignores a delayed prepare after unmount and still closes Main session', async () => {
    const f = await fixture(), pending = gate<void>(), original = f.api.prepare
    vi.spyOn(f.api, 'prepare').mockImplementation(async q => { const result = await original(q); await pending.promise; return result })
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'Why?' } }); fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const close = vi.spyOn(f.api, 'closeSession'); f.unmount()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    await act(async () => { pending.resolve(); await pending.promise })
    expect(f.send).not.toHaveBeenCalled()
  })
  it('deduplicates Send and remembers Cancel during pending prepare', async () => {
    const f = await fixture(), pending = gate<void>(), original = f.api.prepare
    const spy = vi.spyOn(f.api, 'prepare').mockImplementation(async q => { const result = await original(q); await pending.promise; return result })
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'Why?' } })
    const send = screen.getByRole('button', { name: 'Send' }); fireEvent.click(send); fireEvent.click(send)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => { pending.resolve(); await pending.promise })
    await screen.findByText('Cancelled'); expect(spy).toHaveBeenCalledOnce(); expect(f.send).not.toHaveBeenCalled()
  })
  it('retains backend reference messages after source edits', async () => {
    const f = await fixture(); await prepare(); confirm(); await screen.findByText('Complete')
    if (f.context.kind !== 'PRACTICE') throw Error('fixture')
    f.change({ ...f.context, source: f.context.source + '\r\n', sourceRevision: 2, modelVersion: 2 })
    await screen.findByText('Ready')
    expect(within(screen.getByRole('log')).getAllByRole('article')).toHaveLength(2)
    expect(screen.getAllByText(/Ngữ cảnh trước/)).toHaveLength(2)
  })
  it('reopens when the Monaco model is replaced without a draft revision change', async () => {
    const f = await fixture(), close = vi.spyOn(f.api, 'closeSession')
    if (f.context.kind !== 'PRACTICE') throw Error('fixture')
    f.change({ ...f.context, modelId: crypto.randomUUID() })
    await screen.findByText('Ready'); expect(close).toHaveBeenCalledOnce()
  })
  it('purges a completed Main session even before UI receives COMPLETE', async () => {
    const f = await fixture(), close = vi.spyOn(f.api, 'closeSession')
    await prepare(); confirm()
    await waitFor(() => expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    f.unmount(); await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect((await close.mock.results[0].value).ok).toBe(true)
  })
  it('opens the new language even when Main already retired the old Learning context', async () => {
    const f = await fixture()
    if (f.context.kind !== 'PRACTICE') throw Error('fixture')
    f.ipc.invalidateOwner(1)
    f.change({ ...f.context, language: 'csharp', modelId: crypto.randomUUID() })
    await screen.findByText('Ready')
    expect(f.transport.invoke.mock.calls.filter(([c]) => c === 'learning-chat:open')).toHaveLength(2)
  })
  it('serializes rapid close/reopen across separate panel mounts', async () => {
    const f = await fixture(), pending = gate<void>(), original = f.api.getSession
    vi.spyOn(f.api, 'getSession').mockImplementationOnce(async q => { await pending.promise; return original(q) })
    const open = vi.spyOn(f.api, 'openSession'), close = vi.spyOn(f.api, 'closeSession')
    f.unmount()
    render(<LearningAssistantPanel context={f.context} capture={f.capture} onClose={() => {}} />)
    await act(async () => { await Promise.resolve() })
    expect(open).not.toHaveBeenCalled()
    await act(async () => { pending.resolve(); await pending.promise })
    await screen.findByText('Ready')
    expect(open).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
    expect((await close.mock.results[0].value).ok).toBe(true)
    await prepare(); confirm(); await screen.findByText('Complete')
  })
  it('cancels inference before closing and rejects its late body after unmount', async () => {
    const f = await fixture(), pending = gate<Response>()
    const original = f.send.getMockImplementation()!
    f.send.mockImplementation(async r => r.method === 'GET' ? original(r) : pending.promise)
    const cancel = vi.spyOn(f.api, 'cancel'), close = vi.spyOn(f.api, 'closeSession')
    await prepare(); confirm()
    await waitFor(() => expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1))
    f.unmount()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(cancel).toHaveBeenCalledOnce(); expect((await close.mock.results[0].value).ok).toBe(true)
    await act(async () => { pending.resolve(Response.json(chatEnvelope())); await pending.promise })
  })
})
