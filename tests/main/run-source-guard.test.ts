import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunSourceGuard } from '../../src/main/services/run/run-source-guard'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { RUN_SOURCE_GUARD_CHANNELS, RUN_SOURCE_GUARD_LIMITS, type RunSourceGuardReply,
  type RunSourceGuardRequest } from '../../src/shared/contracts/run-source-guard'
import type { RunSession, RunSessionId, ProjectId } from '../../src/shared/contracts'

const session: RunSession = { projectId: 'project_1234567890abcdef12345678' as ProjectId,
  relativePath: 'App.csproj', sessionId: 'run_12345678-1234-1234-1234-123456789012' as RunSessionId, state: 'STARTING' }
function setup() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (name, handler) => { handlers.set(name, handler) },
    removeHandler: name => { handlers.delete(name) } })
  const messages: { channel: string; request: RunSourceGuardRequest }[] = []
  const authorize = vi.fn(() => {}), authorizeReply = vi.fn(() => {}), invalidated = vi.fn()
  const guard = new RunSourceGuard(registry, { authorize, authorizeReply,
    send: (_owner, channel, request) => messages.push({ channel, request }) })
  guard.start()
  const controller = new AbortController(), lease = guard.open(session, 7, controller.signal, invalidated)
  const request = () => messages.filter(message => message.channel === RUN_SOURCE_GUARD_CHANNELS.requested).at(-1)!.request
  const reply = (change: Partial<RunSourceGuardReply> = {}, owner = 7) => guard.receive({
    ...request(), revision: 2, dirty: false, conflict: false, ...change,
  }, owner)
  return { guard, handlers, messages, controller, lease, invalidated, authorize, authorizeReply, request, reply }
}
afterEach(() => vi.useRealTimers())
describe('Main saved-source ownership, bounds and failure policy', () => {
  it('approves a clean aggregate and requires the same revision on subsequent checks', async () => {
    const h = setup(), first = h.lease.check(); h.reply(); await first; h.lease.assertValid()
    const old = h.request(), next = h.lease.check()
    expect(h.request().requestId).not.toBe(old.requestId)
    expect(h.messages.some(message => message.channel === RUN_SOURCE_GUARD_CHANNELS.released && message.request === old)).toBe(true)
    h.reply(); await next
    h.lease.release(); expect(h.guard.size).toBe(0)
    h.guard.stop(); expect(h.handlers.size).toBe(0)
  })
  it.each([
    [{ dirty: true }, 'SOURCE_DIRTY'], [{ conflict: true }, 'SOURCE_CONFLICT'],
    [{ revision: null }, 'SOURCE_STATE_UNKNOWN'],
  ] as const)('refuses %j with a semantic reason', async (change, reason) => {
    const h = setup(), pending = h.lease.check(), rejected = expect(pending).rejects.toMatchObject({ details: { reason } })
    h.reply(change); await rejected
    expect(() => h.lease.assertValid()).toThrow()
    expect(h.invalidated).not.toHaveBeenCalled()
    h.guard.stop(); expect(h.guard.size).toBe(0)
  })
  it('times out exactly at the documented five-second bound and rejects late replies', async () => {
    vi.useFakeTimers()
    const h = setup(), pending = h.lease.check()
    const rejected = expect(pending).rejects.toMatchObject({ details: { reason: 'SOURCE_GUARD_TIMEOUT' } })
    await vi.advanceTimersByTimeAsync(RUN_SOURCE_GUARD_LIMITS.timeoutMs - 1)
    expect(h.invalidated).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); await rejected
    expect(() => h.reply()).toThrow()
    h.guard.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('abort promptly rejects a pending handshake, removes timers and releases the renderer watch', async () => {
    vi.useFakeTimers()
    const h = setup(), pending = h.lease.check()
    const rejected = expect(pending).rejects.toMatchObject({ details: { reason: 'SOURCE_GUARD_CANCELLED' } })
    h.controller.abort(); await rejected
    expect(h.guard.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(h.messages.at(-1)?.channel).toBe(RUN_SOURCE_GUARD_CHANNELS.released)
  })
  it.each(['owner', 'session', 'project', 'request'] as const)('rejects %s mismatch without granting approval', async field => {
    const h = setup(), pending = h.lease.check()
    const change: Partial<RunSourceGuardReply> = field === 'session'
      ? { sessionId: 'run_87654321-1234-1234-1234-123456789012' as RunSessionId }
      : field === 'project' ? { projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId }
        : field === 'request' ? { requestId: `source_${'b'.repeat(32)}` } : {}
    expect(() => h.reply(change, field === 'owner' ? 8 : 7)).toThrow()
    h.reply(); await pending; h.guard.stop()
  })
  it('rejects duplicate/stale replies and invalidates approval even when an edit was subsequently saved', async () => {
    const h = setup(), pending = h.lease.check(); h.reply(); await pending
    expect(() => h.reply()).toThrow()
    h.reply({ revision: 3 })
    expect(h.invalidated).toHaveBeenCalledTimes(1)
    expect(h.invalidated.mock.calls[0][0]).toMatchObject({ details: { reason: 'SOURCE_CHANGED' } })
    await expect(h.lease.check()).rejects.toMatchObject({ details: { reason: 'SOURCE_CHANGED' } })
    h.guard.stop()
  })
  it('fails closed when active project/owner authority changes', async () => {
    const h = setup(), pending = h.lease.check()
    const rejected = expect(pending).rejects.toMatchObject({ details: { reason: 'SOURCE_GUARD_UNAVAILABLE' } })
    h.authorize.mockImplementation(() => { throw new Error('private changed project') })
    expect(() => h.reply()).toThrow(); await rejected
    h.guard.stop()
  })
  it('owner loss and shutdown invalidate approved sessions and clean all guard records', async () => {
    const h = setup(), pending = h.lease.check(); h.reply(); await pending
    h.guard.invalidateOwner(8); expect(h.invalidated).not.toHaveBeenCalled()
    h.guard.invalidateOwner(7); expect(h.invalidated).toHaveBeenCalledTimes(1)
    h.guard.stop(); expect(h.guard.size).toBe(0)
  })
  it('enforces exact payload and frame authorization at IPC before accepting a reply', async () => {
    const h = setup(), pending = h.lease.check()
    const invoke = h.handlers.get(RUN_SOURCE_GUARD_CHANNELS.reply)!
    const clean = { ...h.request(), revision: 2, dirty: false, conflict: false }
    expect(await invoke({ sender: { id: 7 } }, { ...clean, executable: 'cmd.exe' })).toMatchObject({ ok: false })
    expect(h.authorizeReply).not.toHaveBeenCalled()
    h.authorizeReply.mockImplementationOnce(() => { throw new Error('private invalid subframe') })
    expect(await invoke({ sender: { id: 7 } }, clean)).toMatchObject({ ok: false })
    expect(await invoke({ sender: { id: 7 } }, clean)).toEqual({ ok: true, value: null })
    await pending; h.guard.stop()
  })
  it('bounds live session records and rejects duplicate session registration', () => {
    const h = setup()
    expect(() => h.guard.open(session, 7, h.controller.signal, h.invalidated)).toThrow()
    for (let index = 1; index < RUN_SOURCE_GUARD_LIMITS.maximumSessions; index++) {
      h.guard.open({ ...session, sessionId: `run_${index.toString(16).padStart(8, '0')}-1234-1234-1234-123456789012` as RunSessionId },
        7, new AbortController().signal, h.invalidated)
    }
    expect(() => h.guard.open({ ...session, sessionId: 'run_ffffffff-1234-1234-1234-123456789012' as RunSessionId },
      7, new AbortController().signal, h.invalidated)).toThrow(/verification/)
    h.guard.stop(); expect(h.guard.size).toBe(0)
  })
})
