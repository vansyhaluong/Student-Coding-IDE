export type Profile = 'FREE_ROUTER' | 'NORTH_MINI_CODE_FREE' | 'GEMINI_FLASH_LITE'
export interface Manifest {
  schemaVersion: number; attemptId: string; runId: string; profile: Profile; model: string
  executionMode: 'LIVE' | 'OFFLINE'; recordedAt: string; approvalReference: string
  approvalScope: string; maximumInferenceRequests: number; timeoutMs: number
  maxOutputTokens: number; productionEnabled: false; retry: false; paidFallback: false
}
export interface Attempt {
  directory: string; lock: string; manifest: string; reservation: string; result: string; manifestValue: Manifest
}
export const models: Record<Profile, string>
export function attemptPaths(root: string, attemptId: string, mode: 'LIVE' | 'OFFLINE', provider?: 'OPENROUTER' | 'GEMINI'): Omit<Attempt, 'manifestValue'>
export function publishExclusive(destination: string, value: unknown): Promise<void>
export function claimAttempt(root: string, options: { attemptId: string; runId: string; profile: Profile; executionMode: 'LIVE' | 'OFFLINE' }): Promise<Attempt>
export function loadAttempt(root: string, attemptId: string, mode: 'LIVE' | 'OFFLINE', runId: string, profile: Profile): Promise<Attempt>
export function acquireAttemptLock(attempt: Attempt): Promise<() => Promise<void>>
export function reserveInference(attempt: Attempt): Promise<void>
