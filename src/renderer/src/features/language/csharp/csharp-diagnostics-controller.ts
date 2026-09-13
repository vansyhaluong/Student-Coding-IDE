import type { CancellationToken, editor } from 'monaco-editor'
import type { EditorModelManager } from '../../editor/models/editor-model-manager'
import type { CsharpClient } from './csharp-client'
import type { ProblemsStore } from '../../problems/problems-store'
import { createProviderDiagnosticBatch, isCurrentDiagnostic, markerOwnerForProvider,
  type NormalizedDiagnostic } from '../diagnostic-identity'
import { parseProjectDocumentUri, projectDocumentUri } from '../project-uri'

export interface CsharpDiagnosticsHost {
  getModels(): editor.ITextModel[]
  setModelMarkers(model: editor.ITextModel, owner: string, markers: editor.IMarkerData[]): void
}
interface Pull {
  model: editor.ITextModel
  pending: boolean
  running: boolean
  revision: number
  appliedVersion?: number
  requestedVersion?: number
  settlingUntil?: number
  retryDelayMs: number
  retry?: ReturnType<typeof setTimeout>
  cancel?: () => void
}
const owner = markerOwnerForProvider('csharp-ls')
const markerSeverity = { error: 8, warning: 4, info: 2, hint: 1 } as const
const settling = { initialDelayMs: 100, maximumDelayMs: 1_000, timeoutMs: 30_000 } as const

/** Immediate, single-flight pulls. Changes remain ordered by CsharpClient/Main sync;
 * redundant pending diagnostic work coalesces into the latest model snapshot. */
export class CsharpDiagnosticsController {
  private readonly pulls = new Map<string, Pull>()
  private readonly removers: Array<() => void> = []
  private enabled = false
  private stopped = false
  private projectGeneration: number
  constructor(private readonly host: CsharpDiagnosticsHost, private readonly client: CsharpClient,
    private readonly documents: EditorModelManager, private readonly store: ProblemsStore) {
    this.projectGeneration = store.getSnapshot().projectGeneration
    this.removers.push(client.subscribe(status => {
      this.enabled = status?.service.state === 'RUNNING' && status.workspace.state === 'READY'
        && status.effectiveCapabilities.includes('diagnostics')
      if (!this.enabled) this.invalidate(true)
      else this.schedule()
    }), documents.subscribeDocumentLifecycle(event => {
      if (event.projectId !== client.project) return
      if (event.type === 'closed' || event.type === 'renamed') {
        const uri = projectDocumentUri(event.projectId, event.type === 'renamed' ? event.previousRelativePath : event.relativePath)
        this.remove(uri)
      }
      this.schedule()
    }), store.subscribe(() => {
      const generation = store.getSnapshot().projectGeneration
      if (generation === this.projectGeneration) return
      this.projectGeneration = generation
      this.invalidate(false); this.schedule()
    }))
  }
  private schedule(): void {
    if (this.stopped || !this.enabled || this.store.getSnapshot().projectId !== this.client.project) return
    const open = new Set(this.documents.getOpenDocuments().filter(d => d.projectId === this.client.project
      && d.languageId === 'csharp').map(d => projectDocumentUri(d.projectId, d.relativePath)))
    for (const [uri] of this.pulls) if (!open.has(uri)) this.remove(uri)
    for (const model of this.host.getModels()) {
      const uri = model.uri.toString()
      if (!open.has(uri) || model.isDisposed() || model.getLanguageId() !== 'csharp') continue
      let pull = this.pulls.get(uri)
      if (pull && pull.model !== model) { this.remove(uri); pull = undefined }
      if (!pull) {
        pull = { model, pending: false, running: false, revision: 0, retryDelayMs: settling.initialDelayMs }
        this.pulls.set(uri, pull)
      }
      if (pull.retry) { clearTimeout(pull.retry); pull.retry = undefined }
      if (pull.requestedVersion !== undefined && pull.requestedVersion !== model.getVersionId()) {
        pull.settlingUntil = Date.now() + settling.timeoutMs
        pull.retryDelayMs = settling.initialDelayMs
      }
      pull.pending = true; pull.revision++; pull.cancel?.()
      if (pull.appliedVersion !== undefined && pull.appliedVersion !== model.getVersionId()) this.clear(pull)
      if (!pull.running) void this.drain(uri, pull)
    }
  }
  private async drain(uri: string, pull: Pull): Promise<void> {
    pull.running = true
    try {
      while (pull.pending && this.pulls.get(uri) === pull && !this.stopped && this.enabled) {
        pull.pending = false
        const revision = pull.revision, model = pull.model, version = model.getVersionId()
        pull.requestedVersion = version
        const identity = this.store.captureIdentity('csharp-ls', uri, version)
        const target = parseProjectDocumentUri(uri)
        if (!identity || !target || target.projectId !== this.client.project) continue
        let cancelled = false
        const listeners = new Set<() => void>()
        pull.cancel = () => { cancelled = true; for (const listener of listeners) listener() }
        const token: CancellationToken = {
          get isCancellationRequested() { return cancelled },
          onCancellationRequested: listener => { listeners.add(listener); return { dispose: () => { listeners.delete(listener) } } },
        }
        const result = await this.client.request(model, { lineNumber: 1, column: 1 }, token,
          request => this.client.api.getDiagnostics({ requestId: request.requestId, document: request.document, documentVersion: request.documentVersion }))
        pull.cancel = undefined
        const current = this.store.captureIdentity('csharp-ls', uri, model.getVersionId())
        if (cancelled || this.pulls.get(uri) !== pull || revision !== pull.revision || model.isDisposed()
          || !current || !isCurrentDiagnostic(identity, current) || this.client.project !== target.projectId) continue
        if (!result || result.documentVersion !== version) { this.clear(pull); continue }
        // The unchanged snapshot also seeds consumers whose earlier full result was cancelled.
        if (result.kind === 'unchanged' && pull.appliedVersion === version) {
          this.retryUnchanged(uri, pull)
          continue
        }
        const diagnostics: NormalizedDiagnostic[] = result.diagnostics.map(d => ({
          severity: d.severity === 'information' ? 'info' : d.severity, message: d.message,
          source: d.source ?? 'csharp-ls', ...(d.code === null ? {} : { code: String(d.code) }),
          range: { startLineNumber: d.range.start.line + 1, startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1, endColumn: d.range.end.character + 1 },
        }))
        if (!this.store.replace(target.relativePath, createProviderDiagnosticBatch(identity, diagnostics))) continue
        const afterPublish = this.store.captureIdentity('csharp-ls', uri, model.getVersionId())
        if (this.pulls.get(uri) !== pull || model.isDisposed() || !afterPublish || !isCurrentDiagnostic(identity, afterPublish)) continue
        this.host.setModelMarkers(model, owner, diagnostics.map(d => ({ ...d.range,
          severity: markerSeverity[d.severity], message: d.message, source: d.source, code: d.code, modelVersionId: version })))
        pull.appliedVersion = version
        if (result.kind === 'full') pull.settlingUntil = undefined
        else this.retryUnchanged(uri, pull)
      }
    } finally { pull.running = false; pull.cancel = undefined }
  }
  private retryUnchanged(uri: string, pull: Pull): void {
    if (!pull.settlingUntil || Date.now() >= pull.settlingUntil || pull.retry) return
    const delay = pull.retryDelayMs
    pull.retryDelayMs = Math.min(delay * 2, settling.maximumDelayMs)
    pull.retry = setTimeout(() => {
      pull.retry = undefined
      if (this.pulls.get(uri) !== pull || this.stopped || !this.enabled || pull.model.isDisposed()) return
      pull.pending = true; pull.revision++
      if (!pull.running) void this.drain(uri, pull)
    }, delay)
  }
  private clear(pull: Pull): void {
    pull.appliedVersion = undefined
    if (!pull.model.isDisposed()) this.host.setModelMarkers(pull.model, owner, [])
    const uri = pull.model.uri.toString(), target = parseProjectDocumentUri(uri)
    const identity = this.store.captureIdentity('csharp-ls', uri, pull.model.getVersionId())
    if (identity && target?.projectId === identity.projectId) this.store.replace(target.relativePath, createProviderDiagnosticBatch(identity, []))
  }
  private remove(uri: string): void {
    const pull = this.pulls.get(uri)
    if (!pull) return
    this.pulls.delete(uri); pull.cancel?.()
    if (pull.retry) clearTimeout(pull.retry)
    this.clear(pull)
    const target = parseProjectDocumentUri(uri)
    if (target) this.store.clearProviderDocument('csharp-ls', target.projectId, uri)
  }
  private invalidate(provider: boolean): void {
    for (const uri of [...this.pulls.keys()]) this.remove(uri)
    if (provider) this.store.disposeProvider('csharp-ls')
  }
  dispose(): void {
    this.stopped = true
    for (const remove of this.removers.splice(0)) remove()
    this.invalidate(true)
  }
}
