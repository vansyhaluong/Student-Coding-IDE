import type { ProviderTransport } from '../analysis/contracts'
import { GEMINI_MODEL, GEMINI_MODEL_URL } from './gemini-provider'
import { SmartProviderError } from './adapter'
import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { geminiLimitError } from './gemini-limit'

/** Explicit Settings action only. Fixed metadata endpoint; no source or inference. */
export async function checkGeminiConnection(key: string, transport: ProviderTransport, signal: AbortSignal): Promise<void> {
  const controller = new AbortController(), abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let body: ReadableStream<Uint8Array> | null = null
  const timer = setTimeout(abort, P.timeoutMs)
  let fail!: () => void
  const stopped = new Promise<never>((_, reject) => { fail = () => reject(new SmartProviderError('TIMEOUT')) })
  void stopped.catch(() => {}); controller.signal.addEventListener('abort', fail, { once: true })
  try {
    if (controller.signal.aborted) throw new SmartProviderError('TIMEOUT')
    const pending = transport.send(new Request(GEMINI_MODEL_URL, { method: 'GET', headers: { 'x-goog-api-key': key },
      signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' })).then(response => {
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new SmartProviderError('TIMEOUT') }
      return response
    })
    const response = await Promise.race([pending, stopped])
    body = response.body
    if (response.status === 429) throw await geminiLimitError(response, controller.signal)
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new SmartProviderError(response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER')
    }
    if (!response.body || !response.headers.get('content-type')?.startsWith('application/json')) throw new SmartProviderError('PROVIDER')
    reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true }); let text = '', bytes = 0
    for (;;) {
      const part = await Promise.race([reader.read(), stopped]); if (part.done) break
      bytes += part.value.byteLength; if (bytes > P.wireBytes) throw new SmartProviderError('LIMIT_EXCEEDED')
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
    const data = JSON.parse(text)
    if (data.name !== `models/${GEMINI_MODEL}` || !Array.isArray(data.supportedGenerationMethods)
      || !data.supportedGenerationMethods.includes('generateContent') || !Number.isSafeInteger(data.outputTokenLimit)
      || data.outputTokenLimit < P.maxOutputTokens) throw new SmartProviderError('PROVIDER')
  } catch (error) {
    if (error instanceof SmartProviderError) throw error
    throw new SmartProviderError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', fail)
    void reader?.cancel().catch(() => {})
    if (!reader) void body?.cancel().catch(() => {})
  }
}
