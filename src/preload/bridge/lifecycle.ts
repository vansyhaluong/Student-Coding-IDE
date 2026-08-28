import type {
  AppResult,
  LifecycleApi,
  LifecycleStatus,
} from '../../shared/contracts'
import {
  APPLICATION_STATES,
  LIFECYCLE_CHANNELS,
} from '../../shared/contracts'

interface IpcEventLike {
  readonly sender?: unknown
}

export interface IpcRendererLike {
  invoke(channel: string, payload: unknown): Promise<unknown>
  on(
    channel: string,
    listener: (event: IpcEventLike, payload: unknown) => void,
  ): void
  removeListener(
    channel: string,
    listener: (event: IpcEventLike, payload: unknown) => void,
  ): void
}

export function createLifecycleBridge(
  ipcRenderer: IpcRendererLike,
): LifecycleApi {
  return {
    async getStatus(): Promise<AppResult<LifecycleStatus>> {
      const response = await ipcRenderer.invoke(
        LIFECYCLE_CHANNELS.getStatus,
        {},
      )
      if (isLifecycleResult(response)) {
        return response
      }
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The application returned an invalid response.',
          operation: LIFECYCLE_CHANNELS.getStatus,
          retryable: false,
        },
      }
    },

    onStatusChanged(listener): () => void {
      const wrapped = (_event: IpcEventLike, payload: unknown): void => {
        if (isLifecycleStatus(payload)) {
          listener(payload)
        }
      }
      ipcRenderer.on(LIFECYCLE_CHANNELS.statusChanged, wrapped)
      return () => {
        ipcRenderer.removeListener(
          LIFECYCLE_CHANNELS.statusChanged,
          wrapped,
        )
      }
    },
  }
}

function isLifecycleResult(
  value: unknown,
): value is AppResult<LifecycleStatus> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false
  }
  if (value.ok === true) {
    return 'value' in value && isLifecycleStatus(value.value)
  }
  if (value.ok !== false || !('error' in value)) {
    return false
  }
  const error = value.error
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && 'message' in error
    && typeof error.message === 'string'
    && 'retryable' in error
    && typeof error.retryable === 'boolean'
}

function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return typeof value === 'object'
    && value !== null
    && 'state' in value
    && typeof value.state === 'string'
    && APPLICATION_STATES.includes(
      value.state as (typeof APPLICATION_STATES)[number],
    )
}
