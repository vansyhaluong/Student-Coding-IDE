import {
  PROJECT_AGENT_CHANNELS as CHANNELS,
  validateAgentApplyRequest,
  validateAgentApplyResult,
  validateProjectAgentCancelRequest,
  validateProjectAgentSession,
  validateProjectAgentSessionRequest,
  validateProjectAgentTurnRequest,
  validateProjectAgentTurnResult,
  type AgentApplyResult,
  type ProjectAgentApi,
  type ProjectAgentSession,
  type ProjectAgentTurnResult,
} from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

const invalid = (message: string) => ({
  ok: false as const,
  error: { code: 'INVALID_INPUT' as const, message, retryable: false },
})

export function createProjectAgentBridge(ipc: IpcRendererLike): ProjectAgentApi {
  return {
    session: async () => {
      const request = validateProjectAgentSessionRequest({})
      if (!request.ok) return invalid('Invalid project agent session request.')
      return parseAppResult(
        await invokeSafely(ipc, CHANNELS.session, request.value),
        (value): value is ProjectAgentSession => validateProjectAgentSession(value).ok,
        CHANNELS.session,
      )
    },
    turn: async (request) => {
      const valid = validateProjectAgentTurnRequest(request)
      if (!valid.ok) return invalid('Invalid project agent message.')
      return parseAppResult(
        await invokeSafely(ipc, CHANNELS.turn, valid.value),
        (value): value is ProjectAgentTurnResult => validateProjectAgentTurnResult(value).ok,
        CHANNELS.turn,
      )
    },
    cancel: async (request) => {
      const valid = validateProjectAgentCancelRequest(request)
      if (!valid.ok) return invalid('Invalid project agent cancel request.')
      return parseAppResult(
        await invokeSafely(ipc, CHANNELS.cancel, valid.value),
        (value): value is null => value === null,
        CHANNELS.cancel,
      )
    },
    apply: async (request) => {
      const valid = validateAgentApplyRequest(request)
      if (!valid.ok) return invalid('Apply the edit only after explicit confirmation.')
      return parseAppResult(
        await invokeSafely(ipc, CHANNELS.apply, valid.value),
        (value): value is AgentApplyResult => validateAgentApplyResult(value).ok,
        CHANNELS.apply,
      )
    },
  }
}
