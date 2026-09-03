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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
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

  it('remains STOPPING and propagates a cleanup failure', async () => {
    const failure = new Error('cleanup failed')
    const application = new DesktopApplication([{
      name: 'broken-cleanup',
      stop: () => {
        throw failure
      },
    }])
    await application.start()

    await expect(application.shutdown()).rejects.toThrow(
      'Application cleanup failed',
    )
    expect(application.getStatus().state).toBe('STOPPING')
  })

  it('retries only retained cleanup after failure and stops recovery services last', async () => {
    const events: string[] = []
    let attempts = 0
    const mandatory: ManagedService = {
      name: 'mandatory',
      stop: vi.fn(() => {
        attempts += 1
        events.push(`stop:mandatory:${attempts}`)
        if (attempts === 1) throw new Error('first attempt failed')
      }),
    }
    const alreadyStopped = service('front-adapter', events)
    const recoverySurface = service('window', events)
    const application = new DesktopApplication([
      mandatory,
      alreadyStopped,
      recoverySurface,
    ], { shutdownLast: [recoverySurface] })
    await application.start()

    await expect(application.shutdown()).rejects.toThrow('Application cleanup failed')
    expect(application.getStatus().state).toBe('STOPPING')
    expect(events.slice(-2)).toEqual(['stop:front-adapter', 'stop:mandatory:1'])
    expect(recoverySurface.stop).not.toHaveBeenCalled()

    await expect(application.shutdown()).resolves.toBeUndefined()
    expect(application.getStatus().state).toBe('STOPPED')
    expect(alreadyStopped.stop).toHaveBeenCalledOnce()
    expect(mandatory.stop).toHaveBeenCalledTimes(2)
    expect(recoverySurface.stop).toHaveBeenCalledOnce()
    expect(events.slice(-2)).toEqual(['stop:mandatory:2', 'stop:window'])
  })

  it('shares one in-flight shutdown and reports STOPPED only after it completes', async () => {
    const closing = deferred<void>()
    const stop = vi.fn(() => closing.promise)
    const application = new DesktopApplication([{ name: 'terminal', stop }])
    await application.start()

    const first = application.shutdown()
    const second = application.shutdown()
    expect(second).toBe(first)
    expect(application.getStatus().state).toBe('STOPPING')
    expect(stop).toHaveBeenCalledOnce()

    closing.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(application.getStatus().state).toBe('STOPPED')
  })

  it('does not run cleanup again after successful shutdown', async () => {
    const stop = vi.fn()
    const application = new DesktopApplication([{ name: 'service', stop }])
    await application.start()

    await application.shutdown()
    await application.shutdown()

    expect(stop).toHaveBeenCalledOnce()
  })
})
