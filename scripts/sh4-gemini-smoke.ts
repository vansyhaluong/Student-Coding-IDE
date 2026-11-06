/* global AbortController */
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import type { SmartPrepare, SmartOutput } from '../src/shared/contracts/smart-hints'
import { SMART_HINT_POLICY as P } from '../src/shared/contracts/smart-hints'
import { bindSmartAction, type SmartCapture } from '../src/main/services/learning/smart-hints/capture'
import { sourceFingerprint } from '../src/main/services/learning/smart-hints/public-run-receipt'
import { createGeminiSmartHintsService, geminiKeyState, GEMINI_MODEL, GEMINI_SMOKE_TIMEOUT_MS, type GeminiDiagnostic } from '../src/main/services/learning/smart-hints/gemini-provider'
import { SmartProviderError } from '../src/main/services/learning/smart-hints/adapter'
import type { SmartHintsService } from '../src/main/services/learning/smart-hints/service'
import type { SmartResponseFailure } from '../src/main/services/learning/smart-hints/response-failure'

export const GEMINI_SMOKE_SOURCE = 'public static int Solve(int x)\n{\n    return x;\n}\n'
export const GEMINI_SMOKE_STATEMENT = 'Return x + 1. Public examples: Solve(0) = 1; Solve(2) = 3.'
export interface GeminiSmokeEvidence {
  provider: 'GOOGLE_GEMINI'; model: typeof GEMINI_MODEL; result: 'STOP' | 'FAIL' | 'PASS'; code: string
  stage: string; timeoutMs: number; timeoutOwner: 'MAIN_SERVICE' | 'GEMINI_ADAPTER' | null
  httpRequests: number; inferenceRequests: number; inferenceReserved: boolean
  freeTierAttested: boolean; modelAccessible: boolean
  modelHttpStatus: number | null; inferenceHttpStatus: number | null
  diagnostic: GeminiDiagnostic | null; responseFailure: SmartResponseFailure | null
  schemaValidation: 'NOT_RUN' | 'FAIL' | 'PASS'; hint: Extract<SmartOutput, { kind: 'HINT' }> | null
  productionEnabled: false; retry: false; paidFallback: false
}
export interface GeminiSmokeOptions {
  electronMainDevelopment: boolean; liveApproved: boolean
  readKey(): string | undefined
  send(request: Request): Promise<Response>
  confirm(stage: 'PREFLIGHT' | 'SNAPSHOT', details: string, signal: AbortSignal): Promise<boolean>
  reserve(): Promise<void>
  progress?(evidence: GeminiSmokeEvidence): Promise<void>
}

/** Isolated synthetic smoke. Its caller supplies all I/O, never normal Renderer. */
export async function runGeminiSmoke(options: GeminiSmokeOptions): Promise<GeminiSmokeEvidence> {
  const evidence: GeminiSmokeEvidence = { provider: 'GOOGLE_GEMINI', model: GEMINI_MODEL, result: 'STOP', code: 'NOT_STARTED',
    stage: 'MAIN_STARTED', timeoutMs: GEMINI_SMOKE_TIMEOUT_MS, timeoutOwner: null, httpRequests: 0, inferenceRequests: 0,
    inferenceReserved: false, freeTierAttested: false, modelAccessible: false, modelHttpStatus: null, inferenceHttpStatus: null,
    diagnostic: null, responseFailure: null, schemaValidation: 'NOT_RUN', hint: null, productionEnabled: false, retry: false, paidFallback: false }
  const progress = async (stage: string) => {
    evidence.stage = stage
    try { await options.progress?.(structuredClone(evidence)) }
    catch { throw new Error('EVIDENCE_PERSISTENCE_FAILED') }
  }
  const consent = async (stage: 'PREFLIGHT' | 'SNAPSHOT', details: string) => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error(`${stage}_CONSENT_TIMEOUT`)); controller.abort() }, P.prepareMs)
    })
    try {
      return await Promise.race([(async () => {
        await progress(`${stage}_CONSENT`)
        if (controller.signal.aborted) return false
        try { return await options.confirm(stage, details, controller.signal) }
        catch { throw new Error(`${stage}_CONSENT_FAILED`) }
      })(), deadline])
    } finally { clearTimeout(timer); controller.abort() }
  }
  let service: SmartHintsService | undefined, key = ''
  try {
    if (!options.electronMainDevelopment || !options.liveApproved) { evidence.code = 'DEVELOPMENT_APPROVAL_REQUIRED'; return evidence }
    await progress('MAIN_STARTED')
    if (!await consent('PREFLIGHT', `Google Gemini API. Fixed model: ${GEMINI_MODEL}. Confirm ONLY if you have checked in Google AI Studio that the project owning GEMINI_API_KEY is Free Tier with no active billing/paid tier. Unknown or paid project: Cancel. This is your explicit per-attempt tier attestation; model metadata cannot verify billing or remaining quota. Google may use Free Tier content to improve products. Next: authenticated GET of this exact model to check access/generateContent support, then at most one synthetic Hint L1 inference after snapshot consent. No billing changes, retry, alternative model, paid fallback or tools. 30s execution cap / 2048 output tokens.`)) {
      evidence.code = 'PREFLIGHT_CANCELLED'; return evidence
    }
    evidence.freeTierAttested = true
    // The prior consent stage does not describe a local credential failure.
    await progress('KEY_VALIDATION')
    key = options.readKey() ?? ''
    const keyState = geminiKeyState(key)
    if (keyState !== 'VALID') { evidence.code = keyState; return evidence }
    service = createGeminiSmartHintsService({ development: true, liveApproved: true, freeTierConfirmed: true, developmentSmoke: true,
      readKey: () => key,
      onTimeout: () => { evidence.timeoutOwner ??= 'GEMINI_ADAPTER' },
      onServiceTimeout: () => { evidence.timeoutOwner ??= 'MAIN_SERVICE' },
      onResponseFailure: failure => { evidence.responseFailure = failure },
      onDiagnostic: diagnostic => {
        evidence.diagnostic = diagnostic; evidence.stage = `${diagnostic.requestKind}_${diagnostic.stage}`
        if (diagnostic.httpStatus !== undefined) {
          if (diagnostic.requestKind === 'MODEL') evidence.modelHttpStatus = diagnostic.httpStatus
          else evidence.inferenceHttpStatus = diagnostic.httpStatus
        }
      },
      beforeInference: async signal => {
        if (signal.aborted) throw new SmartProviderError('TIMEOUT')
        evidence.modelAccessible = true
        try { await options.reserve() } catch { evidence.code = 'ATTEMPT_RESERVATION_FAILED'; throw new SmartProviderError('INVALID_INPUT') }
        if (signal.aborted) throw new SmartProviderError('TIMEOUT')
        evidence.inferenceReserved = true
        try { await progress('INFERENCE_DISPATCHING') } catch { evidence.code = 'EVIDENCE_PERSISTENCE_FAILED'; throw new SmartProviderError('INVALID_INPUT') }
      },
      transport: { send: async request => {
        evidence.httpRequests++
        if (request.method === 'POST') {
          if (!evidence.freeTierAttested || !evidence.modelAccessible || !evidence.inferenceReserved || evidence.inferenceRequests) throw new Error('DISPATCH_DENIED')
          evidence.inferenceRequests++
        }
        return options.send(request)
      } } })
    const q: SmartPrepare = { requestId: randomUUID(), clientContextId: randomUUID(), exerciseId: 'sh4-gemini-synthetic', language: 'csharp',
      sourceRevision: 1, source: GEMINI_SMOKE_SOURCE, origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'LF' },
      action: { kind: 'HINT', level: 1 }, run: null }
    const prepared = await service.prepare(1, 'gemini-smoke', q, () => {}, async generation => {
      const signature = { functionName: 'Solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' }
      const capture: SmartCapture = { action: q.action, source: q.source, statement: GEMINI_SMOKE_STATEMENT, constraints: ['0 <= x <= 100'],
        signature,
        // Trusted synthetic task identity; no package/signature claim comes from Renderer.
        signatureIdentity: { version: 1, hash: sourceFingerprint(JSON.stringify(signature)) },
        binding: { clientContextId: q.clientContextId, contextGeneration: generation, exerciseId: q.exerciseId, language: q.language,
          packageVersion: 1, sourceRevision: 1, fingerprint: sourceFingerprint(q.source), sourceBytes: Buffer.byteLength(q.source), origin: q.origin, action: bindSmartAction(q.action) },
        runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } }
      return capture
    })
    if (prepared.state !== 'PREPARED') throw new Error('PREPARE_FAILED')
    if (!await consent('SNAPSHOT', `Google Gemini API / ${GEMINI_MODEL} / Free Tier attested.\n${GEMINI_SMOKE_SOURCE}\nTask: ${GEMINI_SMOKE_STATEMENT}\nConstraint: 0 <= x <= 100. Signature: Solve(int32) -> int32. C# / Practice / Hint L1 / no Run evidence / no prior hints. Send ONLY this public synthetic snapshot after the model access check? 30s total execution, 2048 output tokens, one inference reservation. Google may use Free Tier content to improve products. No Run, Submit, Apply, retry or paid fallback.`)) {
      evidence.code = 'CONSENT_CANCELLED'; return evidence
    }
    const ref = { requestId: prepared.requestId, operationId: prepared.operationId }
    service.start(1, 'gemini-smoke', { ...ref, captureToken: prepared.captureToken, consentVersion: 1, consentGranted: true })
    let status = service.status(1, 'gemini-smoke', ref)
    while (status.state === 'RUNNING') { await pause(25); status = service.status(1, 'gemini-smoke', ref) }
    if (status.state === 'COMPLETE' && status.output.kind === 'HINT' && status.output.level === 1) {
      evidence.result = 'PASS'; evidence.code = 'COMPLETE'; evidence.schemaValidation = 'PASS'; evidence.hint = status.output; evidence.stage = 'COMPLETE'
    } else {
      evidence.result = evidence.httpRequests ? 'FAIL' : 'STOP'; evidence.code = ['ATTEMPT_RESERVATION_FAILED', 'EVIDENCE_PERSISTENCE_FAILED'].includes(evidence.code) ? evidence.code : status.state === 'FAILED' ? status.code : status.state
      if (evidence.code === 'AUTH' && [evidence.modelHttpStatus, evidence.inferenceHttpStatus].some(status => status === 401 || status === 403)) evidence.code = 'HTTP_AUTH_FAILED'
      evidence.schemaValidation = evidence.responseFailure?.code === 'SCHEMA_VALIDATION_FAILED' ? 'FAIL' : 'NOT_RUN'
    }
    return evidence
  } catch (error) {
    const allowed = ['EVIDENCE_PERSISTENCE_FAILED', 'ATTEMPT_RESERVATION_FAILED', 'PREPARE_FAILED', 'PREFLIGHT_CONSENT_TIMEOUT', 'SNAPSHOT_CONSENT_TIMEOUT', 'PREFLIGHT_CONSENT_FAILED', 'SNAPSHOT_CONSENT_FAILED']
    evidence.code = error instanceof Error && allowed.includes(error.message) ? error.message : 'SMOKE_FAILED'
    evidence.result = evidence.httpRequests ? 'FAIL' : 'STOP'
    return evidence
  } finally { await service?.stop(); key = '' }
}
