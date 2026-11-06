// Main/manual-only projection. Never serialize headers, messages or arbitrary strings.
export interface OpenRouterDiagnostics {
  observedAt: string
  status: number
  retryAfterSeconds: number | null
  retryAfterAt: string | null
  rateLimit: { limit: number | null; remaining: number | null; reset: number | null }
  errorCode: number | null
  errorType: 'insufficient_quota' | 'rate_limit_exceeded' | 'routing_error' | null
  providerCode: number | null
  attribution: 'ACCOUNT_QUOTA' | 'PROVIDER_RATE_LIMIT' | 'ROUTING' | 'UNKNOWN'
}
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const number = (v: string | null): number | null => v !== null && /^\d{1,12}$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null
const code = (v: unknown): number | null => typeof v === 'number' && Number.isInteger(v) && v >= 400 && v <= 599 ? v : null
export function safeOpenRouterDiagnostics(response: Response, body: unknown, accountQuotaRemaining?: number | null): OpenRouterDiagnostics {
  const retry = response.headers.get('retry-after'), seconds = number(retry)
  // Canonical HTTP date only; Date.parse accepts unsafe/ambiguous text otherwise.
  const date = retry && /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retry) ? Date.parse(retry) : NaN
  const error = record(record(body).error), metadata = record(error.metadata)
  const errorType = typeof metadata.error_type === 'string' && ['insufficient_quota', 'rate_limit_exceeded', 'routing_error'].includes(metadata.error_type)
    ? metadata.error_type as OpenRouterDiagnostics['errorType'] : null
  const providerCode = code(metadata.provider_code)
  // Account quota is established only by the authenticated account preflight, not an ambiguous provider error label.
  const account = response.status === 200 && accountQuotaRemaining === 0
  const provider = response.status === 429 && providerCode === 429
  const routing = [404, 503].includes(response.status) && errorType === 'routing_error'
  return { observedAt: new Date().toISOString(), status: response.status, retryAfterSeconds: seconds !== null && seconds <= 604800 ? seconds : null,
    retryAfterAt: Number.isFinite(date) && new Date(date).toUTCString() === retry ? new Date(date).toISOString() : null,
    rateLimit: { limit: number(response.headers.get('x-ratelimit-limit')), remaining: number(response.headers.get('x-ratelimit-remaining')),
      reset: number(response.headers.get('x-ratelimit-reset')) }, errorCode: code(error.code), errorType, providerCode,
    attribution: provider && errorType === 'insufficient_quota' ? 'UNKNOWN' : account ? 'ACCOUNT_QUOTA' : provider ? 'PROVIDER_RATE_LIMIT' : routing ? 'ROUTING' : 'UNKNOWN' }
}
