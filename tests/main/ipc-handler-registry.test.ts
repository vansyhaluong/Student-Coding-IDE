import { describe, expect, it, vi } from 'vitest'

import { IpcHandlerRegistry } from '../../src/main/ipc/ipc-handler-registry'
import type { IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { ValidationResult } from '../../src/shared/contracts'

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (...args: never[]) => Promise<unknown>>()

  handle(
    channel: string,
    listener: (event: { sender: { id: number } }, payload: unknown) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener as (...args: never[]) => Promise<unknown>)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) {
      throw new Error(`Missing handler: ${channel}`)
    }
    return handler({ sender: { id: 7 } } as never, payload as never)
  }
}

function validateName(value: unknown): ValidationResult<{ name: string }> {
  if (
    typeof value === 'object'
    && value !== null
    && 'name' in value
    && typeof value.name === 'string'
  ) {
    return { ok: true, value: { name: value.name } }
  }
  return {
    ok: false,
    issues: [{ path: '$.name', message: 'Expected a string' }],
  }
}

describe('IpcHandlerRegistry', () => {
  it('dispatches only a validated request and supplies sender ownership', async () => {
    const ipcMain = new FakeIpcMain()
    const service = vi.fn(({ name }: { name: string }, senderId: number) => ({
      greeting: `Hello ${name}`,
      senderId,
    }))
    const registry = new IpcHandlerRegistry(ipcMain)
    registry.register({
      channel: 'test:greet',
      validate: validateName,
      handle: (request, context) => service(request, context.senderId),
    })

    await expect(ipcMain.invoke('test:greet', { name: 'Ada' })).resolves.toEqual({
      ok: true,
      value: { greeting: 'Hello Ada', senderId: 7 },
    })
    expect(service).toHaveBeenCalledOnce()
  })

  it('maps malformed input to INVALID_INPUT before domain dispatch', async () => {
    const ipcMain = new FakeIpcMain()
    const service = vi.fn()
    const registry = new IpcHandlerRegistry(ipcMain)
    registry.register({
      channel: 'test:greet',
      validate: validateName,
      handle: service,
    })

    const result = await ipcMain.invoke('test:greet', { name: 42 })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        operation: 'test:greet',
      },
    })
    expect(service).not.toHaveBeenCalled()
  })

  it('serializes handler errors and disposes registered handlers', async () => {
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    registry.register({
      channel: 'test:greet',
      validate: validateName,
      handle: () => {
        throw new Error('unsafe cause')
      },
    })

    const result = await ipcMain.invoke('test:greet', { name: 'Ada' })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    })
    expect(JSON.stringify(result)).not.toContain('unsafe cause')

    registry.dispose()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('prevents duplicate channel registration', () => {
    const registry = new IpcHandlerRegistry(new FakeIpcMain())
    const definition = {
      channel: 'test:greet',
      validate: validateName,
      handle: ({ name }: { name: string }) => name,
    }
    registry.register(definition)
    expect(() => registry.register(definition)).toThrow(
      'IPC handler already registered',
    )
  })
})
