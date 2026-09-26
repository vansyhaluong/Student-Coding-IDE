import { describe, expect, it, vi } from 'vitest'
import { OllamaService } from '../../src/main/services/ai/ollama-service'
import { afterEach } from 'vitest'

afterEach(() => vi.useRealTimers())

const messages = [{ role: 'user' as const, content: 'Hello' }]
const tags = () => Response.json({ models: [{ name: 'qwen3:1.7b' }] })
const record = (content: string, done = false) => JSON.stringify({ message: { role: 'assistant', content }, done }) + '\n'
function stream(parts: string[]) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
    controller.close()
  } }))
}
function setup(response: Response) {
  const http = vi.fn<typeof fetch>().mockResolvedValueOnce(tags()).mockResolvedValueOnce(response)
  return { http, service: new OllamaService(http), signal: new AbortController().signal }
}

describe('Ollama streaming', () => {
  it.each(['tags', 'chat'] as const)('aborts an unread HTTP error body from /api/%s', async endpoint => {
    vi.useFakeTimers()
    let body!: ReadableStream<Uint8Array>
    let failedSignal: AbortSignal | null | undefined
    const http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (endpoint === 'chat' && String(url).endsWith('/api/tags')) return tags()
      failedSignal = init?.signal
      body = new ReadableStream<Uint8Array>({ start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new Error('transport aborted')), { once: true })
      } })
      return new Response(body, { status: 500 })
    })
    const service = new OllamaService(http)
    const result = endpoint === 'tags' ? service.getStatus() : service.streamChat({ messages }, new AbortController().signal, vi.fn())
    await expect(result).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(failedSignal?.aborted).toBe(true)
    const reader = body.getReader()
    await expect(reader.read()).rejects.toThrow('transport aborted')
    reader.releaseLock()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('times out model discovery after five seconds and releases its timer', async () => {
    vi.useFakeTimers()
    const http = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const result = new OllamaService(http).getStatus()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(http.mock.calls[0][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('ollama-unavailable')
    expect(http.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('times out a pending generation read, preserving emitted content and releasing the reader', async () => {
    vi.useFakeTimers()
    let body!: ReadableStream<Uint8Array>
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(tags()).mockImplementationOnce(async (_url, init) => {
      body = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(record('Partial')))
        init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
      } })
      return new Response(body)
    })
    const chunks = vi.fn()
    const result = new OllamaService(http).streamChat({ messages }, new AbortController().signal, chunks)
    const rejection = expect(result).rejects.toMatchObject({ code: 'PROCESS_FAILED', message: expect.stringContaining('timed out') })
    await vi.advanceTimersByTimeAsync(0)
    expect(chunks.mock.calls).toEqual([['Partial']])
    await vi.advanceTimersByTimeAsync(119_999)
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    expect(body.locked).toBe(false)
    expect(chunks.mock.calls).toEqual([['Partial']])
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['terminated', 'unterminated'] as const)('rejects an oversized %s NDJSON record and cancels the body', async kind => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('x'.repeat(1_048_577) + (kind === 'terminated' ? '\n' : '')))
    }, cancel })
    const { service, signal, http } = setup(new Response(body))
    const chunks = vi.fn()
    await expect(service.streamChat({ messages }, signal, chunks)).rejects.toMatchObject({ message: 'The Ollama stream record is too large.' })
    expect(chunks).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('allows the output limit but rejects the next content before emitting it', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (let index = 0; index < 16; index++) controller.enqueue(new TextEncoder().encode(record('x'.repeat(524_288))))
      controller.enqueue(new TextEncoder().encode(record('overflow', true)))
    }, cancel })
    const { service, signal, http } = setup(new Response(body))
    const chunks = vi.fn()
    await expect(service.streamChat({ messages }, signal, chunks)).rejects.toMatchObject({ message: 'The Ollama response is too large.' })
    expect(chunks).toHaveBeenCalledTimes(16)
    expect(chunks.mock.calls.reduce((sum, [content]) => sum + content.length, 0)).toBe(8_388_608)
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('checks ready status at the fixed localhost endpoint', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(tags())
    await expect(new OllamaService(http).getStatus()).resolves.toBe('ready')
    expect(http).toHaveBeenCalledWith('http://127.0.0.1:11434/api/tags', expect.objectContaining({ method: 'GET', redirect: 'error' }))
  })
  it.each(['ollama-unavailable', 'model-unavailable'] as const)('handles %s without generating', async state => {
    const http = vi.fn<typeof fetch>()
    if (state === 'ollama-unavailable') http.mockRejectedValue(new Error('private'))
    else http.mockImplementation(async () => Response.json({ models: [] }))
    const service = new OllamaService(http)
    await expect(service.getStatus()).resolves.toBe(state)
    await expect(service.streamChat({ messages }, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'DEPENDENCY_MISSING' })
    expect(http.mock.calls.every(([url]) => String(url).endsWith('/api/tags'))).toBe(true)
  })
  it('sends fixed options/history and forwards split records in order', async () => {
    const text = record('Xin ') + record('chào', true)
    const { http, service, signal } = setup(stream([text.slice(0, 12), text.slice(12)]))
    const chunks = vi.fn()
    const history = [...messages, { role: 'assistant' as const, content: 'Hi' }, ...messages]
    await service.streamChat({ messages: history }, signal, chunks)
    expect(chunks.mock.calls).toEqual([['Xin '], ['chào']])
    expect(http.mock.calls[1][0]).toBe('http://127.0.0.1:11434/api/chat')
    expect(JSON.parse(http.mock.calls[1][1]?.body as string)).toEqual({ model: 'qwen3:1.7b', messages: history, stream: true, think: false })
  })
  it('forwards content before the stream closes and aborts a pending read', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(tags()).mockImplementationOnce(async (_url, init) => {
      init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
      return new Response(body)
    })
    const abort = new AbortController()
    const chunks = vi.fn()
    const request = new OllamaService(http).streamChat({ messages }, abort.signal, chunks)
    const rejection = expect(request).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    controller.enqueue(new TextEncoder().encode(record('Partial')))
    await vi.waitFor(() => expect(chunks).toHaveBeenCalledWith('Partial'))
    abort.abort()
    await rejection
    expect(http.mock.calls[1][1]?.signal?.aborted).toBe(true)
  })
  it('decodes UTF-8 split within a multibyte character and final record without newline', async () => {
    const bytes = new TextEncoder().encode(record('你好', true).trimEnd())
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    } }))
    const { service, signal } = setup(response)
    const chunks = vi.fn()
    await service.streamChat({ messages }, signal, chunks)
    expect(chunks).toHaveBeenCalledWith('你好')
  })
  it.each([
    ['malformed JSON', '{bad}\n'],
    ['invalid shape', '{"done":false}\n'],
    ['unexpected EOF', record('Partial')],
    ['empty output', record('', true)],
    ['provider error', '{"error":"private server detail"}\n'],
  ])('rejects %s safely', async (_name, text) => {
    const { service, signal } = setup(stream([text]))
    await expect(service.streamChat({ messages }, signal, vi.fn())).rejects.toMatchObject({ code: 'PROCESS_FAILED', message: expect.not.stringContaining('private server detail') })
  })
  it.each([404, 500])('handles HTTP %s', async status => {
    const { service, signal } = setup(new Response('private', { status }))
    await expect(service.streamChat({ messages }, signal, vi.fn())).rejects.toMatchObject({ code: status === 404 ? 'DEPENDENCY_MISSING' : 'PROCESS_FAILED' })
  })
  it('rejects malformed tags', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ models: [{}] }))
    await expect(new OllamaService(http).getStatus()).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
  })
  it('ignores records after completion', async () => {
    const { service, signal } = setup(stream([record('Done', true) + record('Late', true)]))
    const chunks = vi.fn()
    await service.streamChat({ messages }, signal, chunks)
    expect(chunks.mock.calls).toEqual([['Done']])
  })
})
