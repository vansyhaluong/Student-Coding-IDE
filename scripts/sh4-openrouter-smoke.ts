/* global Request, Response, AbortController, TextDecoder */
// Manual-smoke support only. The Electron entry supplies every network operation.
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setTimeout as pause } from 'node:timers/promises'
import { Buffer } from 'node:buffer'
import { SMART_HINT_POLICY as P, type SmartPrepare, type SmartOutput } from '../src/shared/contracts/smart-hints'
import { bindSmartAction, type SmartCapture } from '../src/main/services/learning/smart-hints/capture'
import { sourceFingerprint } from '../src/main/services/learning/smart-hints/public-run-receipt'
import { createOpenRouterSmartHintsService, DEVELOPMENT_SMOKE_TIMEOUT_MS, OPENROUTER_FREE_ENDPOINT, OPENROUTER_FREE_MODEL, NORTH_MINI_CODE_FREE_MODEL, verifiedNorthFree, type DevelopmentModelProfile } from '../src/main/services/learning/smart-hints/openrouter-provider'
import type { SmartHintsService } from '../src/main/services/learning/smart-hints/service'
import { strictJson } from '../src/main/services/learning/analysis/validation'
import { safeOpenRouterDiagnostics, type OpenRouterDiagnostics } from './sh4-openrouter-diagnostics'
import { envelopeDiagnostics, type EnvelopeCheck } from '../src/main/services/learning/smart-hints/envelope-diagnostics'
import { responseFailure, type SmartResponseFailure } from '../src/main/services/learning/smart-hints/response-failure'
import { SmartProviderError } from '../src/main/services/learning/smart-hints/adapter'

export const SMOKE_SOURCE = 'public static int Solve(int x)\n{\n    return x;\n}\n'
export const SMOKE_STATEMENT = 'Return x + 1. Public examples: Solve(0) = 1; Solve(2) = 3.'
const KEY_URL = 'https://openrouter.ai/api/v1/key'
const MODELS_URL = 'https://openrouter.ai/api/v1/models'
type Hint = Extract<SmartOutput, { kind: 'HINT' }>
export interface SmokeEvidence {
  timeoutMs: number; timeoutOwner: 'MAIN_SERVICE' | 'OPENROUTER_ADAPTER' | 'PREFLIGHT' | null
  inferenceStage: 'NOT_STARTED' | 'WAITING_HEADERS' | 'HEADERS_RECEIVED' | 'READING_BODY' | 'BODY_RECEIVED' | 'VALIDATION' | 'COMPLETE'
  stage: string; httpRequests: number; httpDelivery: 'NOT_ATTEMPTED' | 'UNKNOWN'
  result: 'STOP' | 'FAIL' | 'PASS'; code: string; inferenceRequests: number
  keyPresent: boolean; freeRouteVerified: boolean; accountVerified: boolean
  keyHttpStatus: number | null; catalogueHttpStatus: number | null; endpointHttpStatus: number | null; httpStatus: number | null
  model: string | null; latencyMs: number | null
  requestedModel: string; responseFailure: SmartResponseFailure | null; diagnostics: OpenRouterDiagnostics | null
  quota: { observedAt: string; used: number | null; limit: number | null; remaining: number | null } | null
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; cost: number | null } | null
  schemaValidation: 'NOT_RUN' | 'FAIL' | 'PASS'; hint: Hint | null
  productionEnabled: false; retry: false; paidFallback: false
}
export interface SmokeOptions {
  modelProfile?: DevelopmentModelProfile
  electronMainDevelopment: boolean
  readKey(): string | undefined
  send(request: Request): Promise<Response>
  confirm(stage: 'PREFLIGHT' | 'SNAPSHOT', details: string, signal: AbortSignal): Promise<boolean>
  /** Exclusive persistent reservation. Never remove it after an attempted send. */
  reserve(): Promise<void>
  /** Persist selected safe evidence before consent/dispatch. Failure must prevent sending. */
  progress?(evidence: SmokeEvidence): Promise<void>
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
class ConsentError extends Error {
  constructor(readonly code: string) { super(code) }
}

/** Bounded reads reuse the same request signal; no clone, retry or unbounded text(). */
async function bodyText(response: Response, maximum: number, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new SmartProviderError('INVALID_RESPONSE')
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let size = 0, raw = ''
    for (;;) {
      if (signal.aborted) throw new SmartProviderError('TIMEOUT')
      const part = await reader.read()
      if (signal.aborted) throw new SmartProviderError('TIMEOUT')
      if (part.done) return raw + decoder.decode()
      size += part.value.byteLength
      if (size > maximum) throw new SmartProviderError('LIMIT_EXCEEDED')
      raw += decoder.decode(part.value, { stream: true })
    }
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

export async function runOpenRouterSmoke(options: SmokeOptions): Promise<SmokeEvidence> {
  const profile = options.modelProfile ?? 'FREE_ROUTER'
  const selectedModel = profile === 'NORTH_MINI_CODE_FREE' ? NORTH_MINI_CODE_FREE_MODEL : OPENROUTER_FREE_MODEL
  const evidence: SmokeEvidence = { timeoutMs: DEVELOPMENT_SMOKE_TIMEOUT_MS, timeoutOwner: null, inferenceStage: 'NOT_STARTED', result: 'STOP', code: 'NOT_STARTED', inferenceRequests: 0,
    stage: 'MAIN_STARTED', httpRequests: 0, httpDelivery: 'NOT_ATTEMPTED',
    keyPresent: false, freeRouteVerified: false, accountVerified: false,
    keyHttpStatus: null, catalogueHttpStatus: null, endpointHttpStatus: null, httpStatus: null, model: null, latencyMs: null,
    requestedModel: selectedModel, responseFailure: null, diagnostics: null, quota: null,
    usage: null, schemaValidation: 'NOT_RUN', hint: null, productionEnabled: false, retry: false, paidFallback: false }
  const progress = async (stage: string) => {
    evidence.stage = stage
    try { await options.progress?.(structuredClone(evidence)) }
    catch { evidence.code = 'EVIDENCE_PERSISTENCE_FAILED'; throw new SmartProviderError('INVALID_INPUT') }
  }
  async function consent(at: 'PREFLIGHT' | 'SNAPSHOT', details: string): Promise<boolean> {
    const controller = new AbortController()
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined
    const timeout = new ConsentError(`${at}_CONSENT_TIMEOUT`)
    const deadline = new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => {
        // Reject before aborting: native dialog abort resolves as Cancel on Windows.
        reject(timeout)
        controller.abort()
      }, P.prepareMs)
    })
    try {
      return await Promise.race([(async () => {
        await progress(`${at}_CONSENT`)
        if (controller.signal.aborted) throw timeout
        return options.confirm(at, details, controller.signal)
      })(), deadline])
    } catch (error) {
      if (error instanceof ConsentError || evidence.code === 'EVIDENCE_PERSISTENCE_FAILED') throw error
      throw new ConsentError(`${at}_CONSENT_FAILED`)
    } finally { globalThis.clearTimeout(timer); controller.abort() }
  }
  await progress('MAIN_STARTED')
  if (!options.electronMainDevelopment) { evidence.code = 'ELECTRON_MAIN_DEVELOPMENT_REQUIRED'; return evidence }
  if (profile !== 'FREE_ROUTER' && profile !== 'NORTH_MINI_CODE_FREE') { evidence.code = 'MODEL_PROFILE_DENIED'; return evidence }
  let key = options.readKey() ?? ''
  evidence.keyPresent = !!key
  if (!key || key.length < 16 || key.length > 512 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    evidence.code = 'KEY_MISSING_OR_INVALID'; return evidence
  }
  let service: SmartHintsService | undefined
  const createService = (catalogue: unknown, endpoints: unknown) => createOpenRouterSmartHintsService({ development: true, liveApproved: true, developmentSmoke: true,
    onTimeout: owner => { evidence.timeoutOwner ??= owner }, readKey: () => key,
    onResponseFailure: diagnostic => { evidence.responseFailure = diagnostic },
    ...(profile === 'NORTH_MINI_CODE_FREE' ? { developmentModel: { profile, catalogue, endpoints } } : {}),
    transport: { send: async request => {
      // Defense in depth: this transport cannot dispatch any other action/route.
      const body = await request.clone().json()
      const input = JSON.parse(body.messages?.[1]?.content ?? '{}')
      if (request.url !== OPENROUTER_FREE_ENDPOINT || request.method !== 'POST' || request.redirect !== 'error'
        || body.model !== selectedModel || body.max_tokens !== P.maxOutputTokens || body.stream !== false
        || body.provider?.allow_fallbacks !== false || body.provider?.max_price?.prompt !== 0
        || body.provider?.max_price?.completion !== 0 || body.provider?.max_price?.request !== 0
        || body.response_format !== undefined || body.models !== undefined || body.tools !== undefined
        || input.action?.kind !== 'HINT' || Object.keys(input.action).length !== 1 || input.source !== SMOKE_SOURCE
        || input.language !== 'csharp' || input.publicStatement !== SMOKE_STATEMENT || evidence.inferenceRequests !== 0
        || !evidence.freeRouteVerified || !evidence.accountVerified) throw new SmartProviderError('INVALID_INPUT')
      try { await options.reserve() } catch {
        evidence.code = 'ATTEMPT_RESERVATION_FAILED'
        throw new SmartProviderError('INVALID_INPUT')
      } // Must succeed before fetch. A failed/aborted send still spends the allowance.
      evidence.inferenceRequests = 1
      // Abort may have fired while asynchronous reservation/evidence I/O was pending.
      if (request.signal.aborted) throw new SmartProviderError('TIMEOUT')
      evidence.httpRequests++; evidence.httpDelivery = 'UNKNOWN'
      await progress('INFERENCE_DISPATCHING')
      if (request.signal.aborted) throw new SmartProviderError('TIMEOUT')
      const started = performance.now()
      let received: Response | undefined
      try {
        evidence.inferenceStage = 'WAITING_HEADERS'
        const response = await options.send(request)
        if (request.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new SmartProviderError('TIMEOUT') }
        received = response
        evidence.inferenceStage = 'HEADERS_RECEIVED'
        evidence.httpStatus = response.status
        await progress('INFERENCE_HEADERS_RECEIVED')
        evidence.inferenceStage = 'READING_BODY'
        if (!response.ok) {
          // Only this isolated Main transport reads errors. The adapter/public IPC stays fixed-code only.
          let errorBody: unknown
          if (response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
            try { errorBody = strictJson(await bodyText(response, 16384, request.signal), 16384) }
            catch { /* Unreadable/oversized/malformed metadata supplies no attribution. */ }
          } else { void response.body?.cancel().catch(() => {}) }
          evidence.diagnostics = safeOpenRouterDiagnostics(response, errorBody)
          return new Response(null, { status: response.status })
        }
        let raw: string, parsed: Record<string, unknown>
        let envelopeCheck: EnvelopeCheck = 'BODY'
        try { raw = await bodyText(response, P.wireBytes, request.signal); evidence.inferenceStage = 'BODY_RECEIVED'; envelopeCheck = 'OUTER_JSON'; parsed = record(JSON.parse(raw)) }
        catch (error) { throw error instanceof SmartProviderError && error.code !== 'INVALID_RESPONSE' ? error
          : new SmartProviderError('INVALID_RESPONSE', responseFailure('ENVELOPE_INVALID', 'UNOBSERVED', [], envelopeDiagnostics(envelopeCheck))) }
        // Never retain reflected credentials, even in metrics from invalid responses.
        const forms = [key, `Bearer ${key}`, Buffer.from(key).toString('base64')]
        if (forms.some(value => raw.includes(value) || JSON.stringify(parsed).includes(value))) throw new SmartProviderError('INVALID_RESPONSE', responseFailure('ENVELOPE_INVALID', 'UNOBSERVED', [], envelopeDiagnostics('RESPONSE_POLICY', parsed)))
        if (typeof parsed.model === 'string' && parsed.model.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9_./:+-]*$/.test(parsed.model)) evidence.model = parsed.model
        if (profile === 'NORTH_MINI_CODE_FREE' && parsed.model !== selectedModel) throw new SmartProviderError('INVALID_RESPONSE', responseFailure('ENVELOPE_INVALID', 'UNOBSERVED', [], envelopeDiagnostics('MODEL_IDENTITY', parsed)))
        const usage = record(parsed.usage)
        evidence.usage = parsed.usage == null ? null : { promptTokens: count(usage.prompt_tokens), completionTokens: count(usage.completion_tokens),
          totalTokens: count(usage.total_tokens), cost: typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : null }
        evidence.inferenceStage = 'VALIDATION'
        await progress('INFERENCE_VALIDATION')
        if (request.signal.aborted) throw new SmartProviderError('TIMEOUT')
        return new Response(raw, { status: response.status, headers: response.headers })
      } finally {
        evidence.latencyMs = Math.round(performance.now() - started)
        void received?.body?.cancel().catch(() => {})
      }
    } } })
  let stage = 'CONSENT_CANCELLED'
  try {
    if (!await consent('PREFLIGHT', `Selected model: ${selectedModel}. Verify the local key and free quota using GET /api/v1/key, and zero prices using GET /api/v1/models.${profile === 'NORTH_MINI_CODE_FREE' ? ' Also verify public GET /api/v1/models/cohere/north-mini-code:free/endpoints for zero prices, availability and max_tokens support.' : ''} These metadata GETs do not generate content. No payment, retry or alternate route.`)) return { ...evidence, code: stage }
    async function get(url: string, maximum: number, authenticated: boolean): Promise<unknown> {
      const controller = new AbortController(), timer = globalThis.setTimeout(() => { evidence.timeoutOwner = 'PREFLIGHT'; controller.abort() }, DEVELOPMENT_SMOKE_TIMEOUT_MS)
      let abort: (() => void) | undefined
      try {
        // Race even a broken transport that ignores abort. Use the same bounded development smoke cap.
        const stopped = new Promise<never>((_, reject) => {
          abort = () => reject(new SmartProviderError('TIMEOUT'))
          controller.signal.addEventListener('abort', abort, { once: true })
        })
        const response = await Promise.race([(async () => {
          evidence.httpRequests++; evidence.httpDelivery = 'UNKNOWN'
          await progress(authenticated ? 'ACCOUNT_DISPATCHING' : 'CATALOGUE_DISPATCHING')
          if (controller.signal.aborted) throw new SmartProviderError('TIMEOUT')
          const response = await options.send(new Request(url, { method: 'GET', headers: authenticated ? { authorization: `Bearer ${key}` } : {},
            signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' }))
          if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new SmartProviderError('TIMEOUT') }
          return response
        })(), stopped])
        if (authenticated) evidence.keyHttpStatus = response.status
        else if (url.endsWith('/endpoints')) evidence.endpointHttpStatus = response.status
        else evidence.catalogueHttpStatus = response.status
        if (!response.ok) {
          let errorBody: unknown
          if (response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
            try { errorBody = strictJson(await Promise.race([bodyText(response, 16384, controller.signal), stopped]), 16384) }
            catch { /* Only bounded selected metadata may survive a failed preflight. */ }
          } else { void response.body?.cancel().catch(() => {}) }
          evidence.diagnostics = safeOpenRouterDiagnostics(response, errorBody)
          throw new Error('PREFLIGHT')
        }
        if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
          void response.body?.cancel().catch(() => {}); throw new Error('PREFLIGHT')
        }
        const parsed: unknown = JSON.parse(await Promise.race([bodyText(response, maximum, controller.signal), stopped]))
        const remaining = count(record(record(record(parsed).data).free_model_daily_requests).remaining)
        if (authenticated && remaining === 0) evidence.diagnostics = safeOpenRouterDiagnostics(response, undefined, remaining)
        return parsed
      } finally {
        globalThis.clearTimeout(timer)
        if (abort) controller.signal.removeEventListener('abort', abort)
      }
    }
    stage = 'ACCOUNT_FREE_ACCESS_UNVERIFIED'
    const account = record(record(await get(KEY_URL, 65536, true)).data), quota = record(account.free_model_daily_requests)
    evidence.quota = { observedAt: new Date().toISOString(), used: count(quota.used), limit: count(quota.limit), remaining: count(quota.remaining) }
    if (typeof account.is_free_tier !== 'boolean' || count(quota.remaining) === null || Number(quota.remaining) < 1
      || (account.limit_remaining !== null && (typeof account.limit_remaining !== 'number' || account.limit_remaining < 0))
      || (account.effective_budget != null && !(Number(record(account.effective_budget).remaining_usd) > 0))) return { ...evidence, code: stage }
    evidence.accountVerified = true
    stage = 'FREE_ROUTE_UNVERIFIED'
    const catalogue = record(await get(MODELS_URL, 8 * 1024 * 1024, false))
    const model = Array.isArray(catalogue.data) ? catalogue.data.map(record).find(m => m.id === selectedModel) : undefined
    const price = record(model?.pricing)
    if (!model || price.prompt !== '0' || price.completion !== '0'
      || !Array.isArray(model.supported_parameters) || !model.supported_parameters.includes('max_tokens')) return { ...evidence, code: stage }
    let endpoints: unknown
    if (profile === 'NORTH_MINI_CODE_FREE') {
      endpoints = await get('https://openrouter.ai/api/v1/models/cohere/north-mini-code:free/endpoints', 1024 * 1024, false)
      if (!verifiedNorthFree(catalogue, endpoints)) return { ...evidence, code: stage }
    }
    evidence.freeRouteVerified = true
    service = createService(catalogue, endpoints)
    const q: SmartPrepare = { requestId: randomUUID(), clientContextId: randomUUID(), exerciseId: 'sh4-synthetic', language: 'csharp',
      sourceRevision: 1, source: SMOKE_SOURCE, origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'LF' },
      action: { kind: 'HINT' }, run: null }
    stage = 'PREPARE_FAILED'
    // Trusted Main-only synthetic fixture, not a Renderer/public catalogue claim.
    const prepared = await service.prepare(1, 'manual-smoke', q, () => {}, async generation => {
      const signature = { functionName: 'Solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' }
      const capture: SmartCapture = { action: q.action, source: q.source, statement: SMOKE_STATEMENT, constraints: ['0 <= x <= 100'],
        signature,
        // Trusted synthetic task identity; no package/signature claim comes from Renderer.
        signatureIdentity: { version: 1, hash: sourceFingerprint(JSON.stringify(signature)) },
        binding: { clientContextId: q.clientContextId, contextGeneration: generation, exerciseId: q.exerciseId, language: q.language,
          packageVersion: 1, sourceRevision: 1, fingerprint: sourceFingerprint(q.source), sourceBytes: Buffer.byteLength(q.source), origin: q.origin, action: bindSmartAction(q.action) },
        runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } }
      return capture
    })
    if (prepared.state !== 'PREPARED') throw new Error('PREPARE')
    stage = 'CONSENT_CANCELLED'
    if (!await consent('SNAPSHOT', `${SMOKE_SOURCE}\nSelected model: ${selectedModel}.\nTask: ${SMOKE_STATEMENT}\nConstraint: 0 <= x <= 100. Signature: Solve(int32) -> int32.\nC# / Practice / Unified Hint / no Run evidence / no previous hints / packageVersion 1.\nSend this public synthetic snapshot to OpenRouter and its selected free provider? Their data policies vary. Exactly one inference attempt; no retry or paid fallback. 30s / 2048 output tokens. Consent expires after 60s. No Run, Submit or Apply.`)) return { ...evidence, code: stage }
    stage = 'SERVICE_FAILED'
    const ref = { requestId: prepared.requestId, operationId: prepared.operationId }
    service.start(1, 'manual-smoke', { ...ref, captureToken: prepared.captureToken, consentVersion: 1, consentGranted: true })
    let status = service.status(1, 'manual-smoke', ref)
    while (status.state === 'RUNNING') { await pause(25); status = service.status(1, 'manual-smoke', ref) }
    if (status.state === 'COMPLETE' && status.output.kind === 'HINT') {
      evidence.inferenceStage = 'COMPLETE'; evidence.result = 'PASS'; evidence.code = 'COMPLETE'; evidence.schemaValidation = 'PASS'; evidence.hint = status.output
    } else {
      evidence.result = evidence.inferenceRequests ? 'FAIL' : 'STOP'
      evidence.code = ['ATTEMPT_RESERVATION_FAILED', 'EVIDENCE_PERSISTENCE_FAILED'].includes(evidence.code) ? evidence.code : status.state === 'FAILED' ? status.code : status.state
      evidence.schemaValidation = evidence.responseFailure?.code === 'SCHEMA_VALIDATION_FAILED' ? 'FAIL' : 'NOT_RUN'
    }
    return evidence
  } catch (error) {
    evidence.result = evidence.inferenceRequests ? 'FAIL' : 'STOP'
    if (evidence.code !== 'EVIDENCE_PERSISTENCE_FAILED') evidence.code = error instanceof ConsentError ? error.code : error instanceof SmartProviderError && error.code === 'TIMEOUT' ? `${stage}_TIMEOUT` : stage
    return evidence
  } finally { await service?.stop(); key = '' }
}
