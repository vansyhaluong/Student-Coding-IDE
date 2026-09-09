import type {
  AppError,
  AppResult,
  RuntimeValidator,
} from '../../shared/contracts'
import {
  invalidInputError,
  serializeAppError,
} from '../errors/app-error'

export interface IpcInvokeEventLike {
  sender: {
    id: number
  }
  readonly senderFrame?: IpcSenderFrame | null
}

/** Trusted Electron metadata, used only inside Main; never part of an IPC DTO. */
export interface IpcSenderFrame {
  readonly processId: number
  readonly frameToken: string
  readonly detached: boolean
  isDestroyed(): boolean
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, payload: unknown) => Promise<unknown>,
  ): void
  removeHandler(channel: string): void
}

export interface IpcRequestContext {
  senderId: number
  senderFrame?: IpcSenderFrame | null
}

export interface IpcRequestDefinition<TRequest, TResponse> {
  channel: string
  validate: RuntimeValidator<TRequest>
  handle(
    request: TRequest,
    context: IpcRequestContext,
  ): Promise<TResponse> | TResponse
}

export class IpcHandlerRegistry {
  private readonly channels = new Set<string>()

  constructor(private readonly ipcMain: IpcMainLike) {}

  register<TRequest, TResponse>(
    definition: IpcRequestDefinition<TRequest, TResponse>,
  ): () => void {
    if (this.channels.has(definition.channel)) {
      throw new Error(`IPC handler already registered: ${definition.channel}`)
    }

    this.channels.add(definition.channel)
    this.ipcMain.handle(definition.channel, async (event, payload) => {
      const validation = definition.validate(payload)
      if (!validation.ok) {
        const error = invalidInputError(
          definition.channel,
          validation.issues.map((issue) => issue.path),
        )
        return failure<TResponse>(
          serializeAppError(error, definition.channel),
        )
      }

      try {
        const value = await definition.handle(validation.value, {
          senderId: event.sender.id,
          senderFrame: event.senderFrame,
        })
        return success(value)
      } catch (error) {
        return failure<TResponse>(
          serializeAppError(error, definition.channel),
        )
      }
    })
    return () => {
      if (this.channels.delete(definition.channel)) {
        this.ipcMain.removeHandler(definition.channel)
      }
    }
  }

  dispose(): void {
    for (const channel of this.channels) {
      this.ipcMain.removeHandler(channel)
    }
    this.channels.clear()
  }
}

function success<T>(value: T): AppResult<T> {
  return { ok: true, value }
}

function failure<T>(error: AppError): AppResult<T> {
  return { ok: false, error }
}
