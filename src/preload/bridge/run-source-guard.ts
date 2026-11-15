import { RUN_SOURCE_GUARD_CHANNELS, validateRunSourceGuardReply, validateRunSourceGuardRequest,
  type RunSourceGuardApi, type RunSourceGuardRequest } from '../../shared/contracts/run-source-guard'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

export function createRunSourceGuardBridge(ipc: IpcRendererLike): RunSourceGuardApi {
  const subscribe = (channel: string, listener: (request: RunSourceGuardRequest) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => {
      const validated = validateRunSourceGuardRequest(payload)
      if (validated.ok) listener(validated.value)
    }
    ipc.on(channel, wrapped)
    return () => ipc.removeListener(channel, wrapped)
  }
  return {
    onRequested: listener => subscribe(RUN_SOURCE_GUARD_CHANNELS.requested, listener),
    onReleased: listener => subscribe(RUN_SOURCE_GUARD_CHANNELS.released, listener),
    async reply(response) {
      const validated = validateRunSourceGuardReply(response)
      if (!validated.ok) return { ok: false, error: { code: 'INVALID_INPUT', retryable: false,
        message: 'Invalid saved-source guard response.' } }
      return parseAppResult(await invokeSafely(ipc, RUN_SOURCE_GUARD_CHANNELS.reply, validated.value),
        (value): value is null => value === null, RUN_SOURCE_GUARD_CHANNELS.reply)
    },
  }
}
