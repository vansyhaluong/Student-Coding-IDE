import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import type { ProviderTransport, SessionCredential } from '../analysis/contracts'
import { SmartJsonAdapter, SmartProviderError, type SmartProvider } from './adapter'
import type { SmartResponseFailure } from './response-failure'
import { SmartHintsService } from './service'

// Verified from OpenRouter Free Router/API reference, 2026-11-02. No fallback.
export const OPENROUTER_FREE_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_FREE_MODEL = 'openrouter/free'
export const NORTH_MINI_CODE_FREE_MODEL = 'cohere/north-mini-code:free'
export const DEVELOPMENT_SMOKE_TIMEOUT_MS = 30000
export type DevelopmentModelProfile = 'FREE_ROUTER' | 'NORTH_MINI_CODE_FREE'
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
/** Fresh metadata supplied by the isolated preflight, never Renderer/environment model IDs. */
export function verifiedNorthFree(catalogue: unknown, endpoints: unknown): boolean {
  const rows = record(catalogue).data, data = record(record(endpoints).data)
  const model = Array.isArray(rows) ? rows.map(record).find(m => m.id === NORTH_MINI_CODE_FREE_MODEL) : undefined
  const free = (v: unknown) => {
    const price = record(record(v).pricing)
    return price.prompt === '0' && price.completion === '0' && (price.request === undefined || price.request === '0')
  }
  return !!model && free(model) && Array.isArray(model.supported_parameters) && model.supported_parameters.includes('max_tokens')
    && data.id === NORTH_MINI_CODE_FREE_MODEL && Array.isArray(data.endpoints) && data.endpoints.length > 0
    && data.endpoints.every(e => free(e) && record(e).status === 0 && Array.isArray(record(e).supported_parameters)
      && (record(e).supported_parameters as unknown[]).includes('max_tokens'))
}

export class OpenRouterSmartHintsAdapter extends SmartJsonAdapter implements SmartProvider {
  readonly mode = 'OPENROUTER_FREE' as const
  constructor(transport: ProviderTransport, credential: SessionCredential, model: typeof OPENROUTER_FREE_MODEL | typeof NORTH_MINI_CODE_FREE_MODEL = OPENROUTER_FREE_MODEL, execution?: { timeoutMs: number; onTimeout?(): void }) {
    super(transport, credential, { endpoint: OPENROUTER_FREE_ENDPOINT, model, openrouter: true, ...execution })
    if (execution && (!Number.isSafeInteger(execution.timeoutMs) || execution.timeoutMs < 1 || execution.timeoutMs > DEVELOPMENT_SMOKE_TIMEOUT_MS)) throw new SmartProviderError('INVALID_INPUT')
  }
}

/** No disk persistence, enumeration, serialization, or Renderer/key IPC API. */
function sessionCredential(key: string): SessionCredential {
  let value = key
  return {
    authorization() {
      if (!value) throw new SmartProviderError('AUTH')
      return `Bearer ${value}`
    },
    clear() { value = '' },
  }
}

interface DevelopmentComposition {
  developmentSmoke?: boolean
  onTimeout?(owner: 'MAIN_SERVICE' | 'OPENROUTER_ADAPTER'): void
  development: boolean
  liveApproved: boolean
  readKey(): string | undefined
  onResponseFailure?(diagnostic: SmartResponseFailure): void
  transport?: ProviderTransport
  developmentModel?: { profile: 'NORTH_MINI_CODE_FREE'; catalogue: unknown; endpoints: unknown }
}

/** Approval and development gates precede even reading the environment secret.
 * Creating a service never sends. Its existing prepare/consent/start owns dispatch.
 * Tests inject a synthetic key and transport. Normal Main passes liveApproved:false.
 */
export function createOpenRouterSmartHintsService(options: DevelopmentComposition): SmartHintsService {
  if (!options.development || !options.liveApproved) return new SmartHintsService()
  if (options.developmentModel && (options.developmentModel.profile !== 'NORTH_MINI_CODE_FREE'
    || !verifiedNorthFree(options.developmentModel.catalogue, options.developmentModel.endpoints))) return new SmartHintsService()
  const key = options.readKey()
  if (!key || key.length < 16 || key.length > 512 || !/^[A-Za-z0-9_-]+$/.test(key)) return new SmartHintsService()
  const credential = sessionCredential(key)
  const transport = options.transport ?? { send: (request: Request) => fetch(request) }
  const timeoutMs = options.developmentSmoke ? DEVELOPMENT_SMOKE_TIMEOUT_MS : P.timeoutMs
  return new SmartHintsService(new OpenRouterSmartHintsAdapter(transport, credential, options.developmentModel ? NORTH_MINI_CODE_FREE_MODEL : OPENROUTER_FREE_MODEL,
    { timeoutMs, onTimeout: () => options.onTimeout?.('OPENROUTER_ADAPTER') }), Date.now, options.onResponseFailure,
    { timeoutMs, onTimeout: () => options.onTimeout?.('MAIN_SERVICE') })
}
