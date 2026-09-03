import { describe, expect, it, vi } from 'vitest'

import {
  ApplicationQuitCoordinator,
  type QuitApplication,
} from '../../src/main/app/application-quit-coordinator'
import type { ApplicationState } from '../../src/shared/contracts'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness() {
  let state: ApplicationState = 'RUNNING'
  const attempts: Array<ReturnType<typeof deferred<void>>> = []
  const application: QuitApplication = {
    getStatus: () => ({ state }),
    shutdown: vi.fn(() => {
      state = 'STOPPING'
      const attempt = deferred<void>()
      attempts.push(attempt)
      return attempt.promise.then(() => {
        state = 'STOPPED'
      })
    }),
  }
  const requestApproval = vi.fn(async () => true)
  const quit = vi.fn()
  const onCleanupError = vi.fn()
  const onShutdownSucceeded = vi.fn()
  const coordinator = new ApplicationQuitCoordinator({
    getApplication: () => application,
    requestApproval,
    quit,
    onCleanupError,
    onShutdownSucceeded,
  })
  return {
    application,
    attempts,
    coordinator,
    quit,
    requestApproval,
    onCleanupError,
    onShutdownSucceeded,
    getState: () => state,
  }
}

describe('ApplicationQuitCoordinator', () => {
  it('intercepts the first quit and shares repeated requests while cleanup is pending', async () => {
    const harness = createHarness()
    const first = { preventDefault: vi.fn() }
    const second = { preventDefault: vi.fn() }

    harness.coordinator.handleBeforeQuit(first)
    harness.coordinator.handleBeforeQuit(second)
    await vi.waitFor(() => expect(harness.attempts).toHaveLength(1))

    expect(first.preventDefault).toHaveBeenCalledOnce()
    expect(second.preventDefault).toHaveBeenCalledOnce()
    expect(harness.requestApproval).toHaveBeenCalledOnce()
    expect(harness.application.shutdown).toHaveBeenCalledOnce()
    expect(harness.quit).not.toHaveBeenCalled()
  })

  it('authorizes and requests exactly one final quit after cleanup succeeds', async () => {
    const harness = createHarness()
    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(harness.attempts).toHaveLength(1))

    harness.attempts[0]!.resolve()
    await vi.waitFor(() => expect(harness.quit).toHaveBeenCalledOnce())
    expect(harness.coordinator.isFinalQuitAuthorized()).toBe(true)
    expect(harness.onShutdownSucceeded).toHaveBeenCalledOnce()

    const recursive = { preventDefault: vi.fn() }
    harness.coordinator.handleBeforeQuit(recursive)
    expect(recursive.preventDefault).not.toHaveBeenCalled()
    expect(harness.application.shutdown).toHaveBeenCalledOnce()
    expect(harness.quit).toHaveBeenCalledOnce()
  })

  it('fails closed without final quit and reports one cleanup error', async () => {
    const harness = createHarness()
    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(harness.attempts).toHaveLength(1))

    const failure = new Error('private cleanup detail')
    harness.attempts[0]!.reject(failure)
    await vi.waitFor(() => expect(harness.onCleanupError).toHaveBeenCalledWith(failure))

    expect(harness.getState()).toBe('STOPPING')
    expect(harness.coordinator.isFinalQuitAuthorized()).toBe(false)
    expect(harness.quit).not.toHaveBeenCalled()
    expect(harness.onShutdownSucceeded).not.toHaveBeenCalled()
  })

  it('retries cleanup after failure without asking for approval again', async () => {
    const harness = createHarness()
    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(harness.attempts).toHaveLength(1))
    harness.attempts[0]!.reject(new Error('first attempt'))
    await flushTasks()

    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await vi.waitFor(() => expect(harness.attempts).toHaveLength(2))
    harness.attempts[1]!.resolve()
    await vi.waitFor(() => expect(harness.quit).toHaveBeenCalledOnce())

    expect(harness.requestApproval).toHaveBeenCalledOnce()
    expect(harness.application.shutdown).toHaveBeenCalledTimes(2)
    expect(harness.onCleanupError).toHaveBeenCalledOnce()
    expect(harness.onShutdownSucceeded).toHaveBeenCalledOnce()
  })

  it('does not start cleanup when close approval is cancelled', async () => {
    const harness = createHarness()
    harness.requestApproval.mockResolvedValueOnce(false)
    harness.coordinator.handleBeforeQuit({ preventDefault: vi.fn() })
    await flushTasks()

    expect(harness.application.shutdown).not.toHaveBeenCalled()
    expect(harness.quit).not.toHaveBeenCalled()
    expect(harness.coordinator.isFinalQuitAuthorized()).toBe(false)
  })
})
