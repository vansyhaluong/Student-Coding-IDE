import { RUN_CHANNELS, validateRunEvent, validateRunSession,
  validateStartRunRequest, validateStopRunRequest, type RunApi,
  type RunSession } from '../../shared/contracts/run'
import type { AppResult } from '../../shared/contracts/app-error'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

function invalid<T>(): AppResult<T> {
  return { ok: false, error: { code: 'INVALID_INPUT', retryable: false,
    message: 'Invalid Run request.' } }
}

/** Narrow semantic Run capability; no executable or process options cross the bridge. */
export function createRunBridge(ipc: IpcRendererLike): RunApi {
  return {
    async start(request) {
      const validated = validateStartRunRequest(request)
      if (!validated.ok) return invalid()
      return parseAppResult(await invokeSafely(ipc, RUN_CHANNELS.start, validated.value),
        (value): value is RunSession => validateRunSession(value).ok, RUN_CHANNELS.start)
    },
    async stop(sessionId) {
      const validated = validateStopRunRequest({ sessionId })
      if (!validated.ok) return invalid()
      return parseAppResult(await invokeSafely(ipc, RUN_CHANNELS.stop, validated.value),
        (value): value is null => value === null, RUN_CHANNELS.stop)
    },
    onEvent(listener) {
      const wrapped = (_event: unknown, value: unknown): void => {
        const validated = validateRunEvent(value)
        if (validated.ok) listener(validated.value)
      }
      ipc.on(RUN_CHANNELS.event, wrapped)
      return () => ipc.removeListener(RUN_CHANNELS.event, wrapped)
    },
  }
}
