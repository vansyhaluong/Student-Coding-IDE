import type { AppResult } from './app-error'
import {
  validateEmptyObject,
  type ValidationResult,
} from './validation'

export const LIFECYCLE_CHANNELS = {
  getStatus: 'lifecycle:get-status',
  statusChanged: 'lifecycle:status-changed',
} as const

export const APPLICATION_STATES = [
  'CREATED',
  'STARTING',
  'RUNNING',
  'STOPPING',
  'STOPPED',
  'FAILED',
] as const

export type ApplicationState = (typeof APPLICATION_STATES)[number]

export type GetLifecycleStatusRequest = Record<string, never>

export interface LifecycleStatus {
  state: ApplicationState
}

export interface LifecycleApi {
  getStatus(): Promise<AppResult<LifecycleStatus>>
  onStatusChanged(listener: (status: LifecycleStatus) => void): () => void
}

export function validateGetLifecycleStatusRequest(
  value: unknown,
): ValidationResult<GetLifecycleStatusRequest> {
  return validateEmptyObject(value)
}
