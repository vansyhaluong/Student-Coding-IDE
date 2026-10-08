import { describe, expect, it, vi } from 'vitest'
import { createRunBridge } from '../../src/preload/bridge/run'
import { RUN_PROJECT_CHANNELS } from '../../src/shared/contracts/run-project'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const target = { kind: 'csharp-project' as const, projectId, relativePath: 'App.csproj' }
const response = { projectId, state: 'READY', target,
  candidates: [{ relativePath: 'App.csproj', displayName: 'App', eligibility: 'ELIGIBLE', reason: null }] }
function setup() {
  const ipc = { invoke: vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(async () => ({ ok: true, value: response })),
    on: vi.fn(), removeListener: vi.fn() }
  return { ipc, api: createRunBridge(ipc) }
}
describe('M1-10 preload boundary', () => {
  it.each(['resolveTargets', 'selectTarget', 'clearTarget', 'cancelResolution', 'startProject'] as const)(
    '%s rejects privilege fields without invoking IPC', async method => {
      const h = setup()
      const request = method === 'startProject' ? { ...target, dirty: false } : method === 'selectTarget' ? target : { projectId }
      expect(await h.api[method]({ ...request, cwd: 'C:\\private' } as never)).toMatchObject({ ok: false })
      expect(h.ipc.invoke).not.toHaveBeenCalled()
    })
  it.each([
    { ok: true, value: { ...response, canonicalRoot: 'private' } },
    { ok: true, value: response, executable: 'private' },
    { ok: true, value: { ...response, projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' } },
    { ok: false, error: { code: 'PROCESS_FAILED', message: 'error', retryable: false, stack: 'private' } },
    { ok: false, error: { code: 'PROCESS_FAILED', message: 'error', retryable: false, details: { native: {} } } },
  ])('rejects malformed or mismatched responses %#', async value => {
    const h = setup(); h.ipc.invoke.mockResolvedValue(value)
    expect(await h.api.resolveTargets({ projectId })).toMatchObject({ ok: false, error: { details: { boundaryFailure: 'response-validation' } } })
  })
  it('validates session project/path correspondence and transport errors', async () => {
    const h = setup()
    h.ipc.invoke.mockResolvedValue({ ok: true, value: { ...target, relativePath: 'Other.csproj',
      sessionId: 'run_12345678-1234-1234-1234-123456789abc', state: 'STARTING', phase: 'PREPARING' } })
    expect((await h.api.startProject({ ...target, dirty: false })).ok).toBe(false)
    h.ipc.invoke.mockRejectedValue(new Error('private transport'))
    const result = await h.api.resolveTargets({ projectId })
    expect(result).toMatchObject({ ok: false, error: { details: { boundaryFailure: 'transport' } } })
    expect(JSON.stringify(result)).not.toContain('private transport')
  })
  it('dispatches exact semantic requests and disposes event listeners', async () => {
    const h = setup()
    expect(await h.api.selectTarget(target)).toEqual({ ok: true, value: response })
    expect(h.ipc.invoke).toHaveBeenCalledWith(RUN_PROJECT_CHANNELS.select, target)
    const listener = vi.fn(), remove = h.api.onProjectEvent(listener)
    const callback = h.ipc.on.mock.calls[0][1]
    callback({}, { type: 'error', session: {}, failure: { reason: 'SPAWN_FAILED', executable: 'private' } })
    expect(listener).not.toHaveBeenCalled()
    remove(); expect(h.ipc.removeListener).toHaveBeenCalledWith(RUN_PROJECT_CHANNELS.event, callback)
  })
})
