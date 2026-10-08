import { describe, expect, it, vi } from 'vitest'
import { CsharpRunTargetRequests } from '../../src/main/services/run/csharp-run-target-requests'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { CsharpRunSelectionResult } from '../../src/main/services/run/csharp-run-target-store'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const result: CsharpRunSelectionResult = { resolution: { projectId, state: 'NO_RUNNABLE_PROJECT', candidates: [] }, assessments: [], selection: 'NONE' }
function setup() {
  const manager = new ProcessManager(), close = vi.fn(async () => {})
  const store = { resolve: vi.fn<(id: ProjectId, signal: AbortSignal) => Promise<CsharpRunSelectionResult>>(async () => result), select: vi.fn(), clear: vi.fn() }
  const create = vi.fn(() => ({ store, close })), requests = new CsharpRunTargetRequests(manager, create)
  return { manager, close, store, create, requests }
}
describe('M1-10 finite discovery request ownership', () => {
  it.each(['STALE_TARGET', 'PERSISTENCE_RECOVERED'] as const)('R2 projects only allowlisted %s selection context', async issue => {
    const h = setup()
    h.store.resolve.mockResolvedValue({ ...result, issue, selection: issue === 'STALE_TARGET' ? 'STALE' : 'RECOVERED' })
    expect(await h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).toEqual({ ...result.resolution, selectionDiagnostic: issue })
    expect(h.manager.size).toBe(0)
  })
  it('R2 does not expose unrelated internal selection issues or assessments', async () => {
    const h = setup()
    h.store.resolve.mockResolvedValue({ ...result, issue: 'INVALID_SELECTION' })
    expect(await h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).toEqual(result.resolution)
  })
  it('R2 rejects diagnostics that contradict a READY result', async () => {
    const h = setup()
    h.store.resolve.mockResolvedValue({ ...result, issue: 'STALE_TARGET', resolution: { projectId, state: 'READY',
      target: { kind: 'csharp-project', projectId, relativePath: 'App.csproj' },
      candidates: [{ relativePath: 'App.csproj', displayName: 'App', eligibility: 'ELIGIBLE', reason: null }] } })
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).rejects.toMatchObject({ details: { reason: 'INVALID_RESPONSE' } })
    expect(h.manager.size).toBe(0)
  })
  it('registers before scope construction and releases before returning semantic results', async () => {
    const h = setup(); h.create.mockImplementation(() => { expect(h.manager.size).toBe(1); return { store: h.store, close: h.close } })
    expect(await h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).toEqual(result.resolution)
    expect(h.manager.size).toBe(0); expect(h.close).toHaveBeenCalledTimes(1)
  })
  it('bounds concurrent discovery, cancels only the matching owner/project and rejects late results', async () => {
    const h = setup(); let signal!: AbortSignal, finish!: () => void
    h.store.resolve.mockImplementation(async (_id, value) => { signal = value; await new Promise<void>(done => { finish = done }); return result })
    const pending = h.requests.perform(7, projectId, { kind: 'resolve' }, () => {}), rejected = expect(pending).rejects.toMatchObject({ details: { reason: 'CANCELLED' } })
    await vi.waitFor(() => expect(h.store.resolve).toHaveBeenCalled())
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).rejects.toMatchObject({ details: { reason: 'REQUEST_IN_PROGRESS' } })
    await expect(h.requests.cancel(8, projectId)).rejects.toMatchObject({ details: { reason: 'WRONG_OWNER_OR_PROJECT' } })
    expect(signal.aborted).toBe(false)
    const cancel = h.requests.cancel(7, projectId); expect(signal.aborted).toBe(true); finish()
    await cancel; await rejected; expect(h.manager.size).toBe(0); expect(h.create).toHaveBeenCalledTimes(1)
  })
  it('retains cleanup failure and blocks replacement until explicit cancellation retry succeeds', async () => {
    const h = setup(); h.close.mockRejectedValue(new Error('private native cleanup'))
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {}))
      .rejects.toMatchObject({ code: 'PROCESS_FAILED', details: { reason: 'CLEANUP_FAILED' } })
    expect(h.manager.size).toBe(1)
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).rejects.toMatchObject({ details: { reason: 'CLEANUP_FAILED' } })
    h.close.mockResolvedValue(); await h.requests.cancel(7, projectId)
    expect(h.manager.size).toBe(0)
    expect(await h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).toEqual(result.resolution)
  })
  it('cancellation during post-discovery cleanup cannot return a successful stale result', async () => {
    const h = setup(); let finish!: () => void
    h.close.mockImplementation(() => new Promise<void>(done => { finish = done }))
    const pending = h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})
    const rejected = expect(pending).rejects.toMatchObject({ details: { reason: 'CANCELLED' } })
    await vi.waitFor(() => expect(h.close).toHaveBeenCalled())
    const cancel = h.requests.cancel(7, projectId); finish(); await cancel; await rejected
    expect(h.manager.size).toBe(0)
  })
  it('rejects malformed/wrong-project responses and never exposes evaluator assessments', async () => {
    const h = setup()
    h.store.resolve.mockResolvedValue({ ...result, resolution: { ...result.resolution, projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId } })
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).rejects.toMatchObject({ details: { reason: 'INVALID_RESPONSE' } })
    expect(h.manager.size).toBe(0)
  })
  it('shutdown invalidates queued work before any probe scope is constructed', async () => {
    const h = setup(), pending = h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})
    const rejected = expect(pending).rejects.toThrow()
    await h.requests.stop(); await rejected
    expect(h.create).not.toHaveBeenCalled(); expect(h.manager.size).toBe(0)
    await expect(h.requests.perform(7, projectId, { kind: 'resolve' }, () => {})).rejects.toThrow()
  })
})
