import { AI_CHANNELS, isAiStatus, validateAiChatRequest, validateAiSession, validateAiEvent, type AiApi, type AiChatSession } from '../../shared/contracts/ai'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

export function createAiBridge(ipc: IpcRendererLike): AiApi {
  return {
    getStatus: async () => parseAppResult(await invokeSafely(ipc, AI_CHANNELS.getStatus, {}), isAiStatus, AI_CHANNELS.getStatus),
    startChat: async request => {
      const valid = validateAiChatRequest(request)
      if (!valid.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid chat messages.', retryable: false } }
      return parseAppResult(await invokeSafely(ipc, AI_CHANNELS.startChat, valid.value),
        (value): value is AiChatSession => validateAiSession(value).ok, AI_CHANNELS.startChat)
    },
    stopChat: async requestId => {
      const valid = validateAiSession({ requestId })
      if (!valid.ok) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid chat request identity.', retryable: false } }
      return parseAppResult(await invokeSafely(ipc, AI_CHANNELS.stopChat, valid.value), (value): value is null => value === null, AI_CHANNELS.stopChat)
    },
    onChatEvent: listener => {
      const wrapped = (_event: unknown, value: unknown) => {
        const valid = validateAiEvent(value)
        if (valid.ok) listener(valid.value)
      }
      ipc.on(AI_CHANNELS.event, wrapped)
      return () => ipc.removeListener(AI_CHANNELS.event, wrapped)
    },
  }
}
