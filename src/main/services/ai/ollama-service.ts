import type { AiChatRequest, AiStatus } from '../../../shared/contracts/ai'
import { isPlainObject } from '../../../shared/contracts/validation'
import { DomainError } from '../../errors/app-error'

const OLLAMA_URL = 'http://127.0.0.1:11434'
const MODEL = 'qwen3:1.7b'

export class OllamaService {
  readonly name = 'OllamaService'
  private readonly requests = new Set<AbortController>()
  constructor(private readonly http: typeof fetch = fetch) {}

  async getStatus(signal?: AbortSignal): Promise<AiStatus> {
    let response: unknown
    try { response = await this.request(signal) } catch (error) {
      if (error instanceof DomainError && error.code === 'DEPENDENCY_MISSING') return 'ollama-unavailable'
      throw error
    }
    if (!isPlainObject(response) || !Array.isArray(response.models)
      || !response.models.every(model => isPlainObject(model) && typeof model.name === 'string')) {
      throw failure('Ollama returned an invalid model list.')
    }
    return response.models.some(model => model.name === MODEL) ? 'ready' : 'model-unavailable'
  }

  async streamChat({ messages }: AiChatRequest, signal: AbortSignal, chunk: (content: string) => void): Promise<void> {
    const status = await this.getStatus(signal)
    signal.throwIfAborted()
    if (status !== 'ready') throw new DomainError({ code: 'DEPENDENCY_MISSING', retryable: true,
      message: status === 'ollama-unavailable' ? 'Ollama is unavailable. Start Ollama to chat.' : 'The qwen3:1.7b model is not installed in Ollama.' })
    const controller = new AbortController()
    this.requests.add(controller)
    const combined = AbortSignal.any([signal, controller.signal])
    const timeout = setTimeout(() => controller.abort(), 120_000)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const response = await this.http(`${OLLAMA_URL}/api/chat`, {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, stream: true, think: false }),
      })
      if (response.status === 404) throw new DomainError({ code: 'DEPENDENCY_MISSING', retryable: true,
        message: 'The qwen3:1.7b model is unavailable in Ollama.' })
      if (!response.ok || !response.body) throw failure('The Ollama chat request failed.')
      reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let buffer = ''
      let completed = false
      let length = 0
      const record = (line: string) => {
        if (!line.trim() || completed) return
        if (line.length > 1_048_576) throw failure('The Ollama stream record is too large.')
        const value: unknown = JSON.parse(line)
        if (!isPlainObject(value) || typeof value.done !== 'boolean' || 'error' in value
          || !isPlainObject(value.message) || value.message.role !== 'assistant'
          || typeof value.message.content !== 'string') throw failure('Ollama returned a malformed stream.')
        combined.throwIfAborted()
        const content = value.message.content
        length += content.length
        if (length > 8_388_608) throw failure('The Ollama response is too large.')
        if (content) chunk(content)
        completed = value.done
      }
      while (!completed) {
        combined.throwIfAborted()
        const next = await reader.read()
        combined.throwIfAborted()
        buffer += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true })
        let newline: number
        while (!completed && (newline = buffer.indexOf('\n')) >= 0) {
          record(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
        }
        if (buffer.length > 1_048_576) throw failure('The Ollama stream record is too large.')
        if (next.done) {
          if (buffer.trim()) record(buffer)
          if (!completed) throw failure('The Ollama response was interrupted. Please try again.')
          break
        }
      }
      if (!length) throw failure('Ollama returned an empty response.')
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw failure(combined.aborted ? 'The Ollama request was cancelled or timed out.' : 'The Ollama stream failed or contained an invalid response.')
    } finally {
      controller.abort()
      if (reader) {
        // Aborted transports may reject cancellation; release the reader regardless.
        try { await reader.cancel() } catch { /* The HTTP request is already aborted. */ }
        reader.releaseLock()
      }
      clearTimeout(timeout)
      this.requests.delete(controller)
    }
  }

  stop(): void {
    for (const controller of this.requests) controller.abort()
    this.requests.clear()
  }

  private async request(signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    this.requests.add(controller)
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      let response: Response
      try {
        response = await this.http(`${OLLAMA_URL}/api/tags`, {
          method: 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        })
      } catch {
        throw new DomainError({ code: 'DEPENDENCY_MISSING',
          message: 'Ollama is unavailable. Start Ollama to chat.', retryable: true })
      }
      if (!response.ok) throw failure('The Ollama request failed.')
      try { return await response.json() } catch { throw failure('Ollama returned an invalid response.') }
    } finally {
      controller.abort()
      clearTimeout(timeout)
      this.requests.delete(controller)
    }
  }
}

function failure(message: string): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', message, retryable: true })
}
