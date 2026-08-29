import { describe, expect, it, vi } from 'vitest'

import { ProcessManager } from '../../src/main/services/process/process-manager'

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
})
