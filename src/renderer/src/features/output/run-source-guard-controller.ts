import { RUN_SOURCE_GUARD_LIMITS, type RunSourceGuardApi, type RunSourceGuardRequest,
  type RunSourceState } from '../../../../shared/contracts/run-source-guard'
import type { ProjectId } from '../../../../shared/contracts'
import type { EditorModelManager } from '../editor/models/editor-model-manager'

/** No Save calls or buffer contents; retained-document revision observer only. */
export class RunSourceGuardController {
  private projectId: ProjectId | null = null
  private available = false
  private readonly watches = new Map<string, { request: RunSourceGuardRequest; state: RunSourceState }>()
  constructor(private readonly api: RunSourceGuardApi,
    private readonly models: Pick<EditorModelManager, 'subscribe' | 'getSourceState'>) {}
  connect(): () => void {
    const requested = this.api.onRequested(request => {
      // One current request per session, with a bounded record count.
      for (const [id, watch] of this.watches) if (watch.request.sessionId === request.sessionId) this.watches.delete(id)
      const state = this.state(request.projectId)
      if (this.watches.size >= RUN_SOURCE_GUARD_LIMITS.maximumSessions) {
        this.send(request, { revision: null, dirty: false, conflict: false }); return
      }
      this.watches.set(request.requestId, { request, state })
      this.send(request, state)
    })
    const released = this.api.onReleased(request => {
      const watch = this.watches.get(request.requestId)
      if (watch?.request.projectId === request.projectId && watch.request.sessionId === request.sessionId) {
        this.watches.delete(request.requestId)
      }
    })
    const changed = this.models.subscribe(() => this.refresh())
    return () => {
      this.available = false; this.refresh()
      requested(); released(); changed(); this.watches.clear()
    }
  }
  activateProject(projectId: ProjectId | null): void {
    if (this.projectId === projectId) return
    this.projectId = projectId; this.refresh()
  }
  setAvailable(available: boolean): void {
    if (this.available === available) return
    this.available = available; this.refresh()
  }
  private state(projectId: ProjectId): RunSourceState {
    if (!this.available || this.projectId !== projectId) return { revision: null, dirty: false, conflict: false }
    try { return this.models.getSourceState(projectId) }
    catch { return { revision: null, dirty: false, conflict: false } }
  }
  private refresh(): void {
    for (const watch of this.watches.values()) {
      const state = this.state(watch.request.projectId)
      if (state.revision !== watch.state.revision || state.dirty !== watch.state.dirty || state.conflict !== watch.state.conflict) {
        watch.state = state; this.send(watch.request, state)
      }
    }
  }
  private send(request: RunSourceGuardRequest, state: RunSourceState): void {
    void this.api.reply({ ...request, ...state }).then(result => {
      if (!result.ok) this.watches.delete(request.requestId)
    }).catch(() => this.watches.delete(request.requestId))
  }
}
