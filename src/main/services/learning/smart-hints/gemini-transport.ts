import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartBytes } from '../../../../shared/contracts/smart-hints-validation'
import type { ProviderTransport } from '../analysis/contracts'
import { strictJson } from '../analysis/validation'
import { SmartProviderError } from './adapter'
import { responseFailure } from './response-failure'
import { geminiLimitError } from './gemini-limit'

export const GEMINI_MODEL = 'gemini-3.1-flash-lite'
export const GEMINI_MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`
export const GEMINI_GENERATE_URL = `${GEMINI_MODEL_URL}:generateContent`
export const GEMINI_SMOKE_TIMEOUT_MS = 30000
export const GEMINI_FINISH_REASONS = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT',
  'SPII', 'MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL', 'FINISH_REASON_UNSPECIFIED'] as const
export type GeminiStage = 'MODEL_CHECK' | 'WAITING_HEADERS' | 'HEADERS_RECEIVED' | 'READING_BODY'
  | 'ENVELOPE_VALIDATION' | 'CONTENT_JSON' | 'SH1_VALIDATION' | 'RESERVATION' | 'GENERATION_FINISH'
export interface GeminiResponseDiagnostic {
  maxOutputTokens: number
  inferenceDispatched: boolean
  finishReason: typeof GEMINI_FINISH_REASONS[number] | 'UNOBSERVED' | 'UNRECOGNIZED'
  usageMetadata: { promptTokenCount: number | null; candidatesTokenCount: number | null; thoughtsTokenCount: number | null; totalTokenCount: number | null } | null
  envelopeJsonValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  outputJsonValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
}
export interface GeminiDiagnostic extends GeminiResponseDiagnostic { stage: GeminiStage; requestKind: 'MODEL' | 'INFERENCE'; httpStatus?: number }
export interface GeminiExecution {
  timeoutMs?: number
  onDiagnostic?(diagnostic: GeminiDiagnostic): void
  onTimeout?(): void
  beforeInference?(signal: AbortSignal): Promise<void>
}
export interface GeminiCredential { value(): string; clear(): void }
export interface GeminiDeadline { deadline: number; clock(): number }
/** Main-private JSON generation request; no model/URL/tools authority. */
export interface GeminiGenerateRequest {
  systemInstruction: { parts: { text: string }[] }
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[]
  generationConfig: { responseMimeType: 'application/json'; responseJsonSchema: unknown; candidateCount: 1; maxOutputTokens: number }
}
export interface GeminiTransportSession {
  readonly responseDiagnostic: GeminiResponseDiagnostic
  check(): void
  safe(value: unknown): void
  diagnostic(stage: GeminiStage, httpStatus?: number): void
  checkModel(): Promise<void>
  generate(body: GeminiGenerateRequest): Promise<Record<string, unknown>>
}
const invalid = () => new SmartProviderError('INVALID_RESPONSE', responseFailure('ENVELOPE_INVALID'))

/** Fixed Gemini REST I/O only. No conversation, action validation or quota ledger.
 * A consumer holds its admission through execute() and owns its outer deadline.
 */
export class SharedGeminiTransport {
  constructor(private readonly transport: ProviderTransport, private readonly credential: GeminiCredential,
    private readonly execution: GeminiExecution = {}) {
    const ms = execution.timeoutMs ?? P.timeoutMs
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > GEMINI_SMOKE_TIMEOUT_MS) throw new SmartProviderError('INVALID_INPUT')
  }
  dispose(): void { this.credential.clear() }
  async execute<T>(signal: AbortSignal, consume: (session: GeminiTransportSession) => Promise<T>, execution?: GeminiDeadline): Promise<T> {
    const controller = new AbortController(), abort = () => controller.abort()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, closed = false
    const responseBody: { current: ReadableStream<Uint8Array> | null } = { current: null }
    let kind: GeminiDiagnostic['requestKind'] = 'MODEL'
    const responseDiagnostic: GeminiResponseDiagnostic = { maxOutputTokens: P.maxOutputTokens, inferenceDispatched: false, finishReason: 'UNOBSERVED',
      usageMetadata: null, envelopeJsonValidation: 'NOT_RUN', outputJsonValidation: 'NOT_RUN' }
    const state: { phase: 'NETWORK' | 'INVALID_RESPONSE' } = { phase: 'NETWORK' }
    const diagnostic = (stage: GeminiStage, httpStatus?: number) => {
      try { this.execution.onDiagnostic?.({ ...responseDiagnostic,
        usageMetadata: responseDiagnostic.usageMetadata ? { ...responseDiagnostic.usageMetadata } : null,
        stage, requestKind: kind, ...(httpStatus === undefined ? {} : { httpStatus }) }) } catch { /* Telemetry cannot change acceptance. */ }
    }
    let rejectAbort!: (error: SmartProviderError) => void
    const stopped = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = () => { void reader?.cancel().catch(() => {}); rejectAbort(new SmartProviderError('TIMEOUT')) }
    controller.signal.addEventListener('abort', onAbort, { once: true })
    signal.addEventListener('abort', abort, { once: true })
    void stopped.catch(() => {})
    if (signal.aborted) abort()
    // Normal composition has one outer Main timer. Direct callers retain theirs.
    const timer = execution ? undefined : setTimeout(() => {
      try { this.execution.onTimeout?.() } catch { /* Best effort. */ }
      abort()
    }, this.execution.timeoutMs ?? P.timeoutMs)
    try {
      const check = () => { if (closed || controller.signal.aborted || execution && execution.clock() >= execution.deadline) throw new SmartProviderError('TIMEOUT') }
      check()
      const key = this.credential.value()
      if (!key) throw new SmartProviderError('AUTH')
      const forms = [key, Buffer.from(key).toString('base64')]
      const safe = (value: unknown) => { if (forms.some(s => JSON.stringify(value).includes(s))) throw invalid() }
      const exchange = async (url: string, body?: unknown): Promise<Record<string, unknown>> => {
        check(); state.phase = 'NETWORK'
        const request = new Request(url, { method: body === undefined ? 'GET' : 'POST',
          headers: { 'x-goog-api-key': key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
          redirect: 'error', credentials: 'omit', cache: 'no-store' })
        if (kind === 'INFERENCE') responseDiagnostic.inferenceDispatched = true
        diagnostic('WAITING_HEADERS')
        const pending = this.transport.send(request).then(response => {
          if (closed || controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new SmartProviderError('TIMEOUT') }
          return response
        })
        const response = await Promise.race([pending, stopped])
        responseBody.current = response.body
        diagnostic('HEADERS_RECEIVED', response.status)
        if (response.status === 429) throw await geminiLimitError(response, controller.signal)
        if (!response.ok) throw new SmartProviderError(response.status === 401 || response.status === 403 ? 'AUTH'
          : response.status === 429 ? 'RATE_LIMIT' : response.status === 402 ? 'BALANCE' : 'PROVIDER', undefined, undefined, 'HTTP_ERROR')
        state.phase = 'INVALID_RESPONSE'
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) throw invalid()
        const length = response.headers.get('content-length')
        if (length && (!/^\d+$/.test(length) || Number(length) > P.wireBytes)) throw new SmartProviderError('LIMIT_EXCEEDED')
        diagnostic('READING_BODY')
        reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8', { fatal: true })
        let raw = '', bytes = 0
        try {
          for (;;) {
            const part = await Promise.race([reader.read(), stopped]); check()
            if (part.done) break
            bytes += part.value.byteLength
            if (bytes > P.wireBytes) throw new SmartProviderError('LIMIT_EXCEEDED')
            raw += decoder.decode(part.value, { stream: true })
          }
          raw += decoder.decode()
        } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); reader = undefined; responseBody.current = null }
        diagnostic('ENVELOPE_VALIDATION')
        if (forms.some(s => raw.includes(s))) throw invalid()
        let parsed: unknown
        try { parsed = strictJson(raw, P.wireBytes); if (kind === 'INFERENCE') responseDiagnostic.envelopeJsonValidation = 'PASS' }
        catch { if (kind === 'INFERENCE') { responseDiagnostic.envelopeJsonValidation = 'FAIL'; diagnostic('ENVELOPE_VALIDATION') } throw invalid() }
        safe(parsed)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid()
        return parsed as Record<string, unknown>
      }
      let model: Promise<void> | undefined, ready = false, generated = false
      const checkModel = () => model ??= (async () => {
        diagnostic('MODEL_CHECK')
        const metadata = await exchange(GEMINI_MODEL_URL)
        if (metadata.name !== `models/${GEMINI_MODEL}` || !Array.isArray(metadata.supportedGenerationMethods)
          || !metadata.supportedGenerationMethods.includes('generateContent')
          || !Number.isSafeInteger(metadata.outputTokenLimit) || (metadata.outputTokenLimit as number) < P.maxOutputTokens)
          throw new SmartProviderError('PROVIDER', undefined, undefined, 'MODEL_METADATA_ERROR')
        check(); ready = true
      })()
      const generate = async (body: GeminiGenerateRequest) => {
        check()
        if (!ready || generated) throw new SmartProviderError('INVALID_INPUT')
        generated = true
        // Detach once before the reservation await; callers cannot mutate the
        // bounded/secret-checked request into a different payload during I/O.
        const bounded = structuredClone(body)
        if (bounded.generationConfig.maxOutputTokens !== P.maxOutputTokens || bounded.generationConfig.candidateCount !== 1)
          throw new SmartProviderError('INVALID_INPUT')
        responseDiagnostic.maxOutputTokens = bounded.generationConfig.maxOutputTokens
        if (smartBytes(bounded) > P.requestBytes) throw new SmartProviderError('LIMIT_EXCEEDED')
        safe(bounded)
        if (this.execution.beforeInference) { diagnostic('RESERVATION'); await Promise.race([this.execution.beforeInference(controller.signal), stopped]) }
        check(); kind = 'INFERENCE'
        return exchange(GEMINI_GENERATE_URL, bounded)
      }
      return await consume(Object.freeze({ responseDiagnostic, check, safe, diagnostic, checkModel, generate }))
    } catch (error) {
      if (error instanceof SmartProviderError) throw error
      throw new SmartProviderError(controller.signal.aborted ? 'TIMEOUT' : state.phase,
        state.phase === 'INVALID_RESPONSE' ? responseFailure('ENVELOPE_INVALID') : undefined)
    } finally {
      closed = true
      clearTimeout(timer); signal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', onAbort)
      void reader?.cancel().catch(() => {}); if (!reader) void responseBody.current?.cancel().catch(() => {})
    }
  }
}
