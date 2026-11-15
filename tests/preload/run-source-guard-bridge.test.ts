import { describe, expect, it, vi } from 'vitest'
import { createRunSourceGuardBridge } from '../../src/preload/bridge/run-source-guard'
import { RUN_SOURCE_GUARD_CHANNELS, type RunSourceGuardRequest } from '../../src/shared/contracts/run-source-guard'

const request: RunSourceGuardRequest = { projectId: 'project_1234567890abcdef12345678' as RunSourceGuardRequest['projectId'],
  sessionId: 'run_12345678-1234-1234-1234-123456789012' as RunSourceGuardRequest['sessionId'], requestId: `source_${'a'.repeat(32)}` }
function setup() {
  const listeners = new Map<string, (event: { readonly sender?: unknown }, value: unknown) => void>()
  const transport = { invoke: vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(async () => ({ ok: true, value: null })),
    on: (channel: string, listener: (event: { readonly sender?: unknown }, value: unknown) => void) => { listeners.set(channel, listener) },
    removeListener: vi.fn((channel: string) => { listeners.delete(channel) }) }
  return { api: createRunSourceGuardBridge(transport), transport, listeners }
}
describe('narrow saved-source preload bridge', () => {
  it('exposes only handshake methods and filters malformed Main events', () => {
    const h = setup(), receive = vi.fn(), release = vi.fn()
    expect(Object.keys(h.api).sort()).toEqual(['onReleased', 'onRequested', 'reply'])
    const removeRequest = h.api.onRequested(receive), removeRelease = h.api.onReleased(release)
    h.listeners.get(RUN_SOURCE_GUARD_CHANNELS.requested)!({}, { ...request, cwd: 'C:\\outside' })
    expect(receive).not.toHaveBeenCalled()
    h.listeners.get(RUN_SOURCE_GUARD_CHANNELS.requested)!({}, request)
    h.listeners.get(RUN_SOURCE_GUARD_CHANNELS.released)!({}, request)
    expect(receive).toHaveBeenCalledWith(request); expect(release).toHaveBeenCalledWith(request)
    removeRequest(); removeRelease(); expect(h.listeners.size).toBe(0)
  })
  it('validates replies before invocation and returns a typed acknowledgment', async () => {
    const h = setup(), reply = { ...request, revision: 1, dirty: false, conflict: false }
    expect(await h.api.reply({ ...reply, command: 'execute' } as typeof reply)).toMatchObject({ ok: false })
    expect(h.transport.invoke).not.toHaveBeenCalled()
    expect(await h.api.reply(reply)).toEqual({ ok: true, value: null })
    expect(h.transport.invoke).toHaveBeenCalledWith(RUN_SOURCE_GUARD_CHANNELS.reply, reply)
  })
  it('fails closed on malformed acknowledgments and rejected transport', async () => {
    const h = setup(), reply = { ...request, revision: 1, dirty: false, conflict: false }
    h.transport.invoke.mockResolvedValueOnce({ ok: true, value: { command: 'unsafe' } })
    expect(await h.api.reply(reply)).toMatchObject({ ok: false })
    h.transport.invoke.mockRejectedValueOnce(new Error('private electron failure'))
    const result = await h.api.reply(reply)
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain('private electron')
  })
})
