import type { AppResult } from './app-error'
import {
  validateExactObject,
  validateEmptyObject,
  type ValidationResult,
} from './validation'
import type { ProjectIdentity } from './project'

export const LIFECYCLE_CHANNELS = {
  getStatus: 'lifecycle:get-status',
  statusChanged: 'lifecycle:status-changed',
  unsavedTransitionRequested: 'lifecycle:unsaved-transition-requested',
  projectTransitionSettled: 'lifecycle:project-transition-settled',
  resolveUnsavedTransition: 'lifecycle:resolve-unsaved-transition',
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

export type UnsavedTransitionReason =
  | 'project-close'
  | 'project-switch'
  | 'application-close'

export interface UnsavedTransitionRequestEvent {
  transitionId: string
  reason: UnsavedTransitionReason
  project: ProjectIdentity
  terminalConfirmationRequired: boolean
}

export interface ResolveUnsavedTransitionRequest {
  transitionId: string
  proceed: boolean
}

export interface ProjectTransitionSettledEvent {
  transitionId: string
  outcome: 'failed'
}

export interface LifecycleApi {
  getStatus(): Promise<AppResult<LifecycleStatus>>
  onStatusChanged(listener: (status: LifecycleStatus) => void): () => void
  resolveUnsavedTransition(
    transitionId: string,
    proceed: boolean,
  ): Promise<AppResult<null>>
  onUnsavedTransitionRequested(
    listener: (event: UnsavedTransitionRequestEvent) => void,
  ): () => void
  onProjectTransitionSettled(
    listener: (event: ProjectTransitionSettledEvent) => void,
  ): () => void
}

export function validateGetLifecycleStatusRequest(
  value: unknown,
): ValidationResult<GetLifecycleStatusRequest> {
  return validateEmptyObject(value)
}

export function validateResolveUnsavedTransitionRequest(
  value: unknown,
): ValidationResult<ResolveUnsavedTransitionRequest> {
  const object = validateExactObject(value, ['transitionId', 'proceed'])
  if (!object.ok) return object
  if (
    typeof object.value.transitionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      object.value.transitionId,
    )
    || typeof object.value.proceed !== 'boolean'
  ) {
    return {
      ok: false,
      issues: [{ path: '$', message: 'Expected a valid transition resolution' }],
    }
  }
  return {
    ok: true,
    value: {
      transitionId: object.value.transitionId,
      proceed: object.value.proceed,
    },
  }
}
