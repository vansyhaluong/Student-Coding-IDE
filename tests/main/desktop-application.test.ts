import { describe, expect, it, vi } from 'vitest'

import {
  DesktopApplication,
  type ManagedService,
} from '../../src/main/app/desktop-application'

function service(
  name: string,
  events: string[],
  startError?: Error,
): ManagedService {
  return {
    name,
    start: vi.fn(() => {
      events.push(`start:${name}`)
      if (startError) {
        throw startError
      }
    }),
    stop: vi.fn(() => {
      events.push(`stop:${name}`)
    }),
  }
}

describe('DesktopApplication', () => {
  it('starts in order and stops owned services in reverse order', async () => {
    const events: string[] = []
    const application = new DesktopApplication([
      service('persistence', events),
      service('ipc', events),
      service('window', events),
    ])

    await application.start()
    expect(application.getStatus()).toEqual({ state: 'RUNNING' })

    await application.shutdown()
    expect(application.getStatus()).toEqual({ state: 'STOPPED' })
    expect(events).toEqual([
      'start:persistence',
      'start:ipc',
      'start:window',
      'stop:window',
      'stop:ipc',
      'stop:persistence',
    ])
  })

  it('cleans up already-started services after startup failure', async () => {
    const events: string[] = []
    const application = new DesktopApplication([
      service('first', events),
      service('broken', events, new Error('failed')),
      service('never-started', events),
    ])

    await expect(application.start()).rejects.toThrow('failed')
    expect(application.getStatus()).toEqual({ state: 'FAILED' })
    expect(events).toEqual([
      'start:first',
      'start:broken',
      'stop:first',
    ])
  })

  it('prevents duplicate initialization and makes shutdown idempotent', async () => {
    const application = new DesktopApplication([])
    await application.start()
    await expect(application.start()).rejects.toThrow(
      'Application cannot start',
    )
    await application.shutdown()
    await application.shutdown()
    expect(application.getStatus().state).toBe('STOPPED')
  })

  it('returns cleanup from lifecycle subscriptions', async () => {
    const listener = vi.fn()
    const application = new DesktopApplication([])
    const unsubscribe = application.subscribe(listener)
    await application.start()
    expect(listener).toHaveBeenCalled()

    unsubscribe()
    const calls = listener.mock.calls.length
    await application.shutdown()
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('reaches STOPPED even when one cleanup operation fails', async () => {
    const application = new DesktopApplication([{
      name: 'broken-cleanup',
      stop: () => {
        throw new Error('cleanup failed')
      },
    }])
    await application.start()

    await expect(application.shutdown()).rejects.toThrow(
      'Application cleanup failed',
    )
    expect(application.getStatus().state).toBe('STOPPED')
  })
})
