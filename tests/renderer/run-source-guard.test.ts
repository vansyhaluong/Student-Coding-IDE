import { describe, expect, it, vi } from 'vitest'
import { EditorModelManager, type EditorTextModel } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { RunSourceGuardController } from '../../src/renderer/src/features/output/run-source-guard-controller'
import type { ProjectId } from '../../src/shared/contracts'
import type { RunSourceGuardApi, RunSourceGuardRequest } from '../../src/shared/contracts/run-source-guard'

class SourceModel implements EditorTextModel {
  private version = 1
  private readonly listeners = new Set<() => void>()
  constructor(private value: string) {}
  getValue() { return this.value }
  getVersionId() { return this.version }
  setValue(value: string) { this.value = value; this.version++; for (const listener of this.listeners) listener() }
  onDidChangeContent(listener: () => void) { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) } }
  dispose() { this.listeners.clear() }
}
const projectId = 'project_1234567890abcdef12345678' as ProjectId
const other = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const request: RunSourceGuardRequest = { projectId,
  sessionId: 'run_12345678-1234-1234-1234-123456789012' as RunSourceGuardRequest['sessionId'], requestId: `source_${'a'.repeat(32)}` }
function setup() {
  const models = new EditorModelManager({ createModel: value => new SourceModel(value) })
  let requested!: (request: RunSourceGuardRequest) => void, released!: (request: RunSourceGuardRequest) => void
  const api: RunSourceGuardApi = {
    onRequested: listener => { requested = listener; return vi.fn() },
    onReleased: listener => { released = listener; return vi.fn() }, reply: vi.fn<RunSourceGuardApi['reply']>(async () => ({ ok: true, value: null })),
  }
  const controller = new RunSourceGuardController(api, models)
  controller.activateProject(projectId); controller.setAvailable(true)
  const disconnect = controller.connect()
  const replies = () => vi.mocked(api.reply).mock.calls.map(([reply]) => reply)
  return { models, controller, api, request: (value = request) => requested(value),
    release: (value = request) => released(value), disconnect, replies }
}
describe('Renderer retained-source aggregation and revision tracking', () => {
  it('reports saved sources without saving or leaking buffer contents', () => {
    const h = setup(); h.models.openDocument(projectId, 'Program.cs', 'private source')
    const save = vi.spyOn(h.models, 'createSaveSnapshot')
    h.request()
    expect(h.replies()[0]).toMatchObject({ dirty: false, conflict: false, revision: 1 })
    expect(JSON.stringify(h.replies())).not.toContain('private source')
    expect(save).not.toHaveBeenCalled(); h.disconnect()
  })
  it('blocks multiple non-active retained files including referenced source and project configuration', () => {
    const h = setup(), first = h.models.openDocument(projectId, 'lib/Library.cs', 'first')
    const second = h.models.openDocument(projectId, 'Directory.Build.props', 'second')
    h.models.openDocument(projectId, 'active.js', 'active')
    first.model.setValue('edited'); second.model.setValue('edited')
    h.request(); expect(h.replies().at(-1)?.dirty).toBe(true)
    expect(h.models.getActiveDocument()?.relativePath).toBe('active.js')
    h.disconnect()
  })
  it('increments revision for edits that stay dirty and for manual Save completion', () => {
    const h = setup(), document = h.models.openDocument(projectId, 'Program.cs', 'original')
    h.request()
    document.model.setValue('edit one'); const first = h.replies().at(-1)!
    document.model.setValue('edit two'); const second = h.replies().at(-1)!
    expect(second.revision!).toBeGreaterThan(first.revision!)
    const snapshot = h.models.createSaveSnapshot(document.key)!
    expect(h.models.acceptSave(snapshot)).toBe(true)
    expect(h.replies().at(-1)).toMatchObject({ dirty: false })
    expect(h.replies().at(-1)!.revision!).toBeGreaterThan(second.revision!)
    h.disconnect()
  })
  it('Save of an older snapshot preserves new dirty edits', () => {
    const h = setup(), document = h.models.openDocument(projectId, 'Program.cs', 'original')
    document.model.setValue('saved version')
    const snapshot = h.models.createSaveSnapshot(document.key)!
    document.model.setValue('new edit'); h.request()
    expect(h.models.acceptSave(snapshot)).toBe(false)
    expect(h.models.getSourceState(projectId).dirty).toBe(true)
    h.disconnect()
  })
  it.each(['conflict', 'missing'] as const)('includes non-active external %s state', kind => {
    const h = setup(), document = h.models.openDocument(projectId, 'Reference.cs', 'source', false)
    h.request()
    if (kind === 'conflict') h.models.markExternalConflict(document.key)
    else h.models.markDiskMissing(document.key)
    expect(h.replies().at(-1)?.conflict).toBe(true)
    h.disconnect()
  })
  it('clean reload, rename and close advance revision without changing buffers automatically', () => {
    const h = setup(), document = h.models.openDocument(projectId, 'Program.cs', 'original')
    const revision = () => h.models.getSourceState(projectId).revision!
    const first = revision(); h.models.reloadClean(document.key, 'external edit'); expect(revision()).toBeGreaterThan(first)
    const second = revision(); h.models.renamePath(projectId, 'Program.cs', 'Renamed.cs', false); expect(revision()).toBeGreaterThan(second)
    const third = revision(); h.models.closeProject(projectId); expect(revision()).toBeGreaterThan(third)
    h.disconnect()
  })
  it('ignores active-tab changes and other-project edits', () => {
    const h = setup(), first = h.models.openDocument(projectId, 'Program.cs', 'first')
    h.models.openDocument(projectId, 'Other.cs', 'other')
    const unrelated = h.models.openDocument(other, 'Outside.cs', 'outside')
    h.request(); const revision = h.replies()[0].revision
    h.models.activate(first.key); unrelated.model.setValue('dirty outside')
    expect(h.models.getSourceState(projectId)).toEqual({ revision, dirty: false, conflict: false })
    expect(h.replies()).toHaveLength(1); h.disconnect()
  })
  it.each(['project', 'unavailable', 'disconnect'] as const)('reports unknown source state on %s change', kind => {
    const h = setup(); h.request()
    if (kind === 'project') h.controller.activateProject(other)
    else if (kind === 'unavailable') h.controller.setAvailable(false)
    else h.disconnect()
    expect(h.replies().at(-1)?.revision).toBeNull()
    if (kind !== 'disconnect') h.disconnect()
  })
  it('releases only matching watches and stops sending after release', () => {
    const h = setup(), document = h.models.openDocument(projectId, 'Program.cs', 'original')
    h.request(); h.release({ ...request, projectId: other })
    document.model.setValue('edit'); expect(h.replies()).toHaveLength(2)
    h.release(); document.model.setValue('late'); expect(h.replies()).toHaveLength(2)
    h.disconnect()
  })
  it('handles model-state failure conservatively and removes failed transport subscriptions', async () => {
    const h = setup()
    vi.spyOn(h.models, 'getSourceState').mockImplementation(() => { throw new Error('unknown models') })
    vi.mocked(h.api.reply).mockResolvedValue({ ok: false, error: { code: 'INTERNAL_ERROR', retryable: false, message: 'failed' } })
    h.request(); expect(h.replies()[0].revision).toBeNull()
    await Promise.resolve(); h.models.openDocument(projectId, 'Program.cs', 'original')
    expect(h.replies()).toHaveLength(1); h.disconnect()
  })
  it('supersedes old request watches within the same session', () => {
    const h = setup(), document = h.models.openDocument(projectId, 'Program.cs', 'original')
    h.request(); h.request({ ...request, requestId: `source_${'b'.repeat(32)}` })
    h.release(request); document.model.setValue('edit')
    expect(h.replies().at(-1)?.requestId).toBe(`source_${'b'.repeat(32)}`)
    h.disconnect()
  })
})
