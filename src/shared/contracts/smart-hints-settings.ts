import type { AppResult } from './app-error'
import { validateExactObject, type ValidationResult } from './validation'

export type SmartHintsReadiness = 'DISABLED' | 'MISSING_KEY' | 'READY' | 'OFFLINE'
  | 'LOCAL_BUDGET_EXHAUSTED' | 'LOCAL_RATE_LIMIT' | 'GEMINI_RATE_LIMIT' | 'GEMINI_QUOTA_EXHAUSTED'
  | 'INVALID_KEY' | 'SECURE_STORAGE_UNAVAILABLE' | 'ERROR'
export interface SmartHintsSettingsSnapshot {
  enabled: boolean; provider: 'GEMINI'; model: 'gemini-3.1-flash-lite'; hasKey: boolean
  state: SmartHintsReadiness; usedRequests: number; requestLimit: number
  remainingRequests: number; lifetimeRequests: number; resetAt: number; retryAt: number | null; needsLimitReview: boolean
}
export const SMART_HINT_SETTINGS_CHANNELS = {
  get: 'settings:smart-hints:get', enable: 'settings:smart-hints:enable',
  key: 'settings:smart-hints:configure-key', removeKey: 'settings:smart-hints:remove-key',
  check: 'settings:smart-hints:check', budget: 'settings:smart-hints:budget',
} as const
export interface SmartHintsSettingsApi {
  get(): Promise<AppResult<SmartHintsSettingsSnapshot>>
  enable(value: { enabled: boolean }): Promise<AppResult<SmartHintsSettingsSnapshot>>
  configureKey(): Promise<AppResult<SmartHintsSettingsSnapshot>>
  removeKey(): Promise<AppResult<SmartHintsSettingsSnapshot>>
  check(): Promise<AppResult<SmartHintsSettingsSnapshot>>
  budget(value: { dailyLimit: number }): Promise<AppResult<SmartHintsSettingsSnapshot>>
}
export function validateSmartHintsEnable(value: unknown): ValidationResult<{ enabled: boolean }> {
  const r = validateExactObject(value, ['enabled'])
  return r.ok && typeof r.value.enabled === 'boolean' ? { ok: true, value: { enabled: r.value.enabled } }
    : { ok: false, issues: [{ path: '$', message: 'Invalid Smart Hints enable request.' }] }
}
export function validateSmartHintsBudget(value: unknown): ValidationResult<{ dailyLimit: number }> {
  const r = validateExactObject(value, ['dailyLimit'])
  return r.ok && Number.isSafeInteger(r.value.dailyLimit) && Number(r.value.dailyLimit) >= 1 && Number(r.value.dailyLimit) <= 300
    ? { ok: true, value: { dailyLimit: Number(r.value.dailyLimit) } }
    : { ok: false, issues: [{ path: '$', message: 'Choose between 1 and 300 requests per UTC day.' }] }
}
export function isSmartHintsSettingsSnapshot(value: unknown): value is SmartHintsSettingsSnapshot {
  const r = validateExactObject(value, ['enabled', 'provider', 'model', 'hasKey', 'state', 'usedRequests', 'requestLimit',
    'remainingRequests', 'lifetimeRequests', 'resetAt', 'retryAt', 'needsLimitReview'])
  if (!r.ok) return false
  const v = r.value
  return typeof v.enabled === 'boolean' && typeof v.hasKey === 'boolean' && v.provider === 'GEMINI' && v.model === 'gemini-3.1-flash-lite'
    && ['DISABLED', 'MISSING_KEY', 'READY', 'OFFLINE', 'LOCAL_BUDGET_EXHAUSTED', 'LOCAL_RATE_LIMIT', 'GEMINI_RATE_LIMIT', 'GEMINI_QUOTA_EXHAUSTED', 'INVALID_KEY', 'SECURE_STORAGE_UNAVAILABLE', 'ERROR'].includes(String(v.state))
    && Number.isSafeInteger(v.usedRequests) && Number(v.usedRequests) >= 0 && Number.isSafeInteger(v.requestLimit)
    && Number(v.requestLimit) >= 1 && Number(v.requestLimit) <= 300
    && Number.isSafeInteger(v.remainingRequests) && v.remainingRequests === Math.max(0, Number(v.requestLimit) - Number(v.usedRequests))
    && Number.isSafeInteger(v.lifetimeRequests) && Number(v.lifetimeRequests) >= Number(v.usedRequests)
    && Number.isSafeInteger(v.resetAt) && Number(v.resetAt) > 0
    && (v.retryAt === null || Number.isSafeInteger(v.retryAt) && Number(v.retryAt) > 0) && typeof v.needsLimitReview === 'boolean'
}
