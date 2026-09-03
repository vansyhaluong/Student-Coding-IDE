import { describe, expect, it, vi } from 'vitest'

import { ProcessManager } from '../../src/main/services/process/process-manager'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('ProcessManager', () => {
  it('cleans only resources owned by the requested owner', async () => {
    const manager = new ProcessManager()
    const first = vi.fn()
    const second = vi.fn()
    manager.register({ id: 'one', ownerId: 'window-1', close: first })
    manager.register({ id: 'two', ownerId: 'window-2', close: second })

    await manager.cleanupOwner('window-1')
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(manager.size).toBe(1)
  })

  it('prevents duplicate ownership IDs and cleans all resources on stop', async () => {
    const manager = new ProcessManager()
    const close = vi.fn()
    manager.register({ id: 'one', ownerId: 'window-1', close })
    expect(() => manager.register({
      id: 'one',
      ownerId: 'window-1',
      close,
    })).toThrow('already registered')

    await manager.stop()
    expect(close).toHaveBeenCalledOnce()
    expect(manager.size).toBe(0)
  })

  it('retains ownership while close is pending and removes it only after success', async () => {
    const manager = new ProcessManager()
    const closing = deferred<void>()
    manager.register({ id: 'one', ownerId: 'window-1', close: () => closing.promise })

    const cleanup = manager.cleanupOwner('window-1')
    await vi.waitFor(() => expect(manager.size).toBe(1))
    closing.resolve()

    await expect(cleanup).resolves.toBeUndefined()
    expect(manager.size).toBe(0)
  })

  it('retains ownership when close fails', async () => {
    const manager = new ProcessManager()
    const failure = new Error('cleanup failed')
    manager.register({
      id: 'one',
      ownerId: 'window-1',
      close: () => Promise.reject(failure),
    })

    await expect(manager.cleanupOwner('window-1')).rejects.toThrow(
      'Owned resource cleanup failed',
    )
    expect(manager.size).toBe(1)
  })

  it('shares duplicate cleanup attempts without invoking close twice', async () => {
    const manager = new ProcessManager()
    const closing = deferred<void>()
    const close = vi.fn(() => closing.promise)
    manager.register({ id: 'one', ownerId: 'window-1', close })

    const first = manager.cleanupOwner('window-1')
    const second = manager.cleanupOwner('window-1')
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(manager.size).toBe(1)
    closing.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(close).toHaveBeenCalledOnce()
    expect(manager.size).toBe(0)
  })

  it('does not let unregister erase ownership during pending cleanup', async () => {
    const manager = new ProcessManager()
    const closing = deferred<void>()
    let unregister = (): void => undefined
    unregister = manager.register({
      id: 'one',
      ownerId: 'window-1',
      close: () => {
        unregister()
        return closing.promise
      },
    })

    const cleanup = manager.stop()
    await vi.waitFor(() => expect(manager.size).toBe(1))
    closing.resolve()

    await expect(cleanup).resolves.toBeUndefined()
    expect(manager.size).toBe(0)
  })

  it('continues cleanup while retaining only failed resources', async () => {
    const manager = new ProcessManager()
    const successfulClose = vi.fn()
    manager.register({
      id: 'failed',
      ownerId: 'window-1',
      close: () => Promise.reject(new Error('failed')),
    })
    manager.register({ id: 'successful', ownerId: 'window-1', close: successfulClose })

    await expect(manager.stop()).rejects.toThrow('Owned resource cleanup failed')
    expect(successfulClose).toHaveBeenCalledOnce()
    expect(manager.size).toBe(1)
  })

  it('does not report clean until every shutdown cleanup succeeds', async () => {
    const manager = new ProcessManager()
    const firstClosing = deferred<void>()
    const secondClosing = deferred<void>()
    manager.register({ id: 'one', ownerId: 'window-1', close: () => firstClosing.promise })
    manager.register({ id: 'two', ownerId: 'window-2', close: () => secondClosing.promise })

    const shutdown = manager.stop()
    expect(manager.size).toBe(2)
    secondClosing.resolve()
    await vi.waitFor(() => expect(manager.size).toBe(1))
    firstClosing.resolve()

    await expect(shutdown).resolves.toBeUndefined()
    expect(manager.size).toBe(0)
  })
})
