import { SmartProviderError } from './adapter'

const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
/** Read only bounded structured error fields. Never expose the body/message or quota identifiers. */
export async function geminiLimitError(response: Response, signal: AbortSignal): Promise<SmartProviderError> {
  let kind: 'GEMINI_RATE_LIMIT' | 'GEMINI_QUOTA_EXHAUSTED' = 'GEMINI_RATE_LIMIT'
  const header = response.headers.get('retry-after')
  let retryAfterMs = header && /^\d+(\.\d+)?$/.test(header) ? Math.ceil(Number(header) * 1000) : undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let rejectAbort!: (error: Error) => void
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
  void aborted.catch(() => {})
  const abort = () => { void reader?.cancel().catch(() => {}); rejectAbort(new Error('ABORTED')) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (signal.aborted) throw Error('ABORTED')
    if (response.body && response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      reader = response.body.getReader()
      let text = '', bytes = 0
      const decoder = new TextDecoder('utf-8', { fatal: true })
      for (;;) {
        const part = await Promise.race([reader.read(), aborted])
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 16384) throw Error('BOUNDED')
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
      const error = record(record(JSON.parse(text)).error)
      if (error.type === 'quota_exceeded' || error.code === 'quota_exceeded') kind = 'GEMINI_QUOTA_EXHAUSTED'
      for (const item of Array.isArray(error.details) ? error.details : []) {
        const detail = record(item)
        if (detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure') {
          for (const entry of Array.isArray(detail.violations) ? detail.violations : []) {
            const violation = record(entry)
            const identifier = `${typeof violation.quotaId === 'string' ? violation.quotaId : ''} ${typeof violation.quotaMetric === 'string' ? violation.quotaMetric : ''}`
            if (/PerDay|_per_day/.test(identifier) || violation.quotaValue === '0' || violation.quotaValue === 0) kind = 'GEMINI_QUOTA_EXHAUSTED'
          }
        }
        if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' && typeof detail.retryDelay === 'string' && /^\d+(\.\d+)?s$/.test(detail.retryDelay)) {
          retryAfterMs = Math.max(retryAfterMs ?? 0, Math.ceil(Number(detail.retryDelay.slice(0, -1)) * 1000))
        }
      }
    }
  } catch { /* Unknown/malformed/truncated429 remains rate-limited, quota unspecified. */ }
  finally {
    signal.removeEventListener('abort', abort)
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() }
    else void response.body?.cancel().catch(() => {})
  }
  if (signal.aborted) throw new SmartProviderError('TIMEOUT')
  return new SmartProviderError('RATE_LIMIT', undefined, { kind,
    ...(retryAfterMs !== undefined && Number.isSafeInteger(retryAfterMs) && retryAfterMs > 0 && retryAfterMs <= 7 * 86400000 ? { retryAfterMs } : {}) })
}
