import {
  TERMINAL_CHANNELS,
  validateCloseTerminalRequest,
  validateCloseTerminalResponse,
  validateCreateTerminalRequest,
  validateCreateTerminalResponse,
  validateResizeTerminalRequest,
  validateTerminalEvent,
  validateTerminalInputRequest,
  type AppResult,
  type TerminalContractApi,
  type TerminalEvent,
} from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'
import { parseAppResult } from './result'

export type TerminalApi = TerminalContractApi

export function createTerminalBridge(
  ipcRenderer: IpcRendererLike,
): TerminalApi {
  const subscribers = new Set<(event: TerminalEvent) => void>()
  let listening = false
  const receiveEvent = (_event: unknown, payload: unknown): void => {
    const validation = validateTerminalEvent(payload)
    if (!validation.ok) return
    for (const subscriber of subscribers) subscriber(validation.value)
  }

  return {
    async create(request) {
      const validation = validateCreateTerminalRequest(request)
      if (!validation.ok) return invalidRequest(TERMINAL_CHANNELS.create)
      return parseAppResult(
        await ipcRenderer.invoke(TERMINAL_CHANNELS.create, validation.value),
        (value): value is Awaited<ReturnType<TerminalApi['create']>> extends AppResult<infer T>
          ? T
          : never => validateCreateTerminalResponse(value).ok,
        TERMINAL_CHANNELS.create,
      )
    },
    async input(request) {
      const validation = validateTerminalInputRequest(request)
      if (!validation.ok) return invalidRequest(TERMINAL_CHANNELS.input)
      return parseAppResult(
        await ipcRenderer.invoke(TERMINAL_CHANNELS.input, validation.value),
        (value): value is null => value === null,
        TERMINAL_CHANNELS.input,
      )
    },
    async resize(request) {
      const validation = validateResizeTerminalRequest(request)
      if (!validation.ok) return invalidRequest(TERMINAL_CHANNELS.resize)
      return parseAppResult(
        await ipcRenderer.invoke(TERMINAL_CHANNELS.resize, validation.value),
        (value): value is null => value === null,
        TERMINAL_CHANNELS.resize,
      )
    },
    async close(request) {
      const validation = validateCloseTerminalRequest(request)
      if (!validation.ok) return invalidRequest(TERMINAL_CHANNELS.close)
      return parseAppResult(
        await ipcRenderer.invoke(TERMINAL_CHANNELS.close, validation.value),
        (value): value is Awaited<ReturnType<TerminalApi['close']>> extends AppResult<infer T>
          ? T
          : never => validateCloseTerminalResponse(value).ok,
        TERMINAL_CHANNELS.close,
      )
    },
    onEvent(listener): () => void {
      subscribers.add(listener)
      if (!listening) {
        listening = true
        ipcRenderer.on(TERMINAL_CHANNELS.event, receiveEvent)
      }
      return () => {
        subscribers.delete(listener)
        if (listening && subscribers.size === 0) {
          listening = false
          ipcRenderer.removeListener(TERMINAL_CHANNELS.event, receiveEvent)
        }
      }
    },
  }
}

function invalidRequest<T>(operation: string): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message: 'The terminal request is invalid.',
      operation,
      retryable: false,
    },
  }
}
