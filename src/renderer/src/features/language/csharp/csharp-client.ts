import type { CancellationToken, editor } from 'monaco-editor'
import type { AppResult, ProjectId } from '../../../../../shared/contracts'
import type { LanguageApi, LanguageStatus, SemanticRequestId, DocumentVersion, CompletionRequest, LanguageTextChange } from '../../../../../shared/contracts/language'
import type { EditorModelManager, EditorDocumentLifecycleEvent, EditorDocument } from '../../editor/models/editor-model-manager'
import { documentUri } from '../../editor/models/editor-model-manager'

interface Document { model: EditorDocument['model']; relativePath: string; version: number; syncedVersion: number; text: string; opened: boolean; tail: Promise<void> }
/** Renderer-session client, independent of React mount/unmount. No protocol or disk authority. */
export class CsharpClient {
  private projectId: ProjectId | null = null
  private generation = 0
  private documents = new Map<string, Document>()
  private pending = new Map<SemanticRequestId, () => void>()
  private listeners = new Set<(status: LanguageStatus | null) => void>()
  private removers: Array<() => void> = []
  private statusValue: LanguageStatus | null = null
  private stopped = false
  constructor(readonly api: LanguageApi, private readonly editor: EditorModelManager,
    private readonly report: (message: string) => void = () => {}) {
    this.removers.push(editor.subscribeDocumentLifecycle(event => this.accept(event)), api.onStatus(event => {
      if (event.projectId !== this.projectId) return
      this.updateStatus(event.status)
    }))
  }
  get project(): ProjectId | null { return this.projectId }
  subscribe(listener: (status: LanguageStatus | null) => void): () => void {
    this.listeners.add(listener); listener(this.statusValue); return () => { this.listeners.delete(listener) }
  }
  setProject(projectId: ProjectId | null): void {
    this.generation++; for (const cancel of this.pending.values()) cancel(); this.pending.clear()
    this.documents.clear(); this.projectId = projectId; this.updateStatus(null)
    if (projectId && !this.stopped) for (const document of this.editor.getOpenDocuments()) {
      if (document.projectId === projectId) this.open(document)
    }
  }
  private updateStatus(status: LanguageStatus | null): void {
    if (status?.service.state !== 'RUNNING') for (const cancel of this.pending.values()) cancel()
    if (this.statusValue?.service.state === 'RUNNING' && status?.service.state !== 'RUNNING') {
      this.generation++; this.documents.clear()
    }
    this.statusValue = status
    for (const listener of this.listeners) listener(status)
    // Selection can make previously unsynchronized buffers available without a UI dependency.
    if (status?.service.state === 'RUNNING' && status.workspace.state === 'READY') {
      for (const document of this.editor.getOpenDocuments()) if (document.projectId === this.projectId
        && document.languageId === 'csharp' && !this.documents.has(documentUri(document.projectId, document.relativePath))) this.open(document)
    }
  }
  private open(source: EditorDocument): void {
    if (source.languageId !== 'csharp' || !this.projectId || this.stopped) return
    const projectId = this.projectId, generation = this.generation, key = documentUri(projectId, source.relativePath)
    if (this.documents.has(key)) return
    const document: Document = { model: source.model, relativePath: source.relativePath, version: source.model.getVersionId(),
      syncedVersion: source.model.getVersionId(),
      text: source.model.getValue(), opened: false, tail: Promise.resolve() }
    this.documents.set(key, document)
    document.tail = this.api.openDocument({ projectId, relativePath: source.relativePath, modelVersion: document.version as DocumentVersion,
      text: document.text, dirty: source.dirty }).then(result => {
      // A close queued during didOpen must still send didClose after the open completes.
      if (generation === this.generation && result.ok) document.opened = result.value.service.state === 'RUNNING' && result.value.workspace.state === 'READY'
      if (!this.current(generation, key, document)) return
      const status = this.unwrap(result)
      document.opened = status.service.state === 'RUNNING' && status.workspace.state === 'READY'
      if (!document.opened) this.documents.delete(key)
      this.updateStatus(status)
    }).catch(error => { if (this.current(generation, key, document)) this.failure(error) })
  }
  private accept(event: EditorDocumentLifecycleEvent): void {
    if (event.projectId !== this.projectId || this.stopped) return
    if (event.type === 'renamed') {
      this.close(event.previousRelativePath)
      const current = this.editor.findDocument(event.projectId, event.relativePath)
      if (current) this.open(current)
      return
    }
    if (event.type === 'closed') { this.close(event.relativePath); return }
    const source = this.editor.findDocument(event.projectId, event.relativePath)
    if (!source || source.languageId !== 'csharp') return
    const key = documentUri(event.projectId, event.relativePath), document = this.documents.get(key)
    if (!document) { this.open(source); return }
    const version = source.model.getVersionId(), generation = this.generation, projectId = event.projectId
    const identity = { projectId, relativePath: event.relativePath, modelVersion: version as DocumentVersion }
    if (event.type === 'saved') {
      if (event.dirty) return // Old disk save must not announce the newer unsaved buffer as saved.
      document.tail = document.tail.then(async () => {
        if (this.current(generation, key, document) && document.opened) this.unwrap(await this.api.saveDocument(identity))
      }).catch(error => this.failure(error))
    } else if (version > document.version) {
      const changes = [incrementalChange(document.text, source.model.getValue())]
      document.text = source.model.getValue(); document.version = version
      document.tail = document.tail.then(async () => {
        if (this.current(generation, key, document) && document.opened) {
          this.unwrap(await this.api.changeDocument({ ...identity, changes })); document.syncedVersion = version
        }
      }).catch(error => { document.opened = false; this.failure(error) })
    }
  }
  private close(relativePath: string): void {
    if (!this.projectId) return
    const key = documentUri(this.projectId, relativePath), document = this.documents.get(key)
    if (!document) return
    const projectId = this.projectId, generation = this.generation
    this.documents.delete(key)
    void document.tail.then(async () => {
      if (generation === this.generation && document.opened) this.unwrap(await this.api.closeDocument({ projectId, relativePath, modelVersion: document.syncedVersion as DocumentVersion }))
    }).catch(error => this.failure(error))
  }
  async request<T>(model: editor.ITextModel, position: { lineNumber: number; column: number }, token: CancellationToken,
    call: (request: CompletionRequest) => Promise<AppResult<T>>): Promise<T | null> {
    const projectId = this.projectId, key = model.uri.toString(), document = this.documents.get(key)
    if (!projectId || !document || token.isCancellationRequested) return null
    const generation = this.generation, version = model.getVersionId()
    const requestId = ('language_' + crypto.randomUUID().replaceAll('-', '')) as SemanticRequestId
    let cancelled = false, sent = false
    const cancel = () => { cancelled = true; if (sent) void this.api.cancel(requestId).catch(() => {}) }
    this.pending.set(requestId, cancel)
    const subscription = token.onCancellationRequested(cancel)
    try {
      await document.tail
      if (cancelled || !this.current(generation, key, document) || !document.opened || model.isDisposed() || model.getVersionId() !== version) return null
      sent = true
      const result = await call({ requestId, document: { projectId, relativePath: document.relativePath },
        documentVersion: version as DocumentVersion, position: { line: position.lineNumber - 1, character: position.column - 1 } })
      if (cancelled || !this.current(generation, key, document) || model.isDisposed() || model.getVersionId() !== version) return null
      const value = this.unwrap(result)
      if (typeof value === 'object' && value !== null && 'requestId' in value
        && (value.requestId !== requestId || !('documentVersion' in value) || value.documentVersion !== version)) return null
      return value
    } catch (error) { this.failure(error); return null }
    finally { subscription.dispose(); this.pending.delete(requestId) }
  }
  private current(generation: number, key: string, document: Document): boolean {
    return !this.stopped && generation === this.generation && this.documents.get(key) === document
  }
  private unwrap<T>(result: AppResult<T>): T { if (!result.ok) throw result.error; return result.value }
  private failure(error: unknown): void {
    const reason = typeof error === 'object' && error !== null && 'details' in error
      ? (error.details as { reason?: unknown } | undefined)?.reason : undefined
    if (['cancelled', 'stale-session', 'stale-document', 'invalid-version', 'invalid-handle', 'not-running'].includes(String(reason))) return
    this.report('The C# language operation could not complete.')
  }
  dispose(): void { this.stopped = true; this.setProject(null); for (const remove of this.removers.splice(0)) remove(); this.listeners.clear() }
}
export function incrementalChange(before: string, after: string): LanguageTextChange {
  let start = 0, end = before.length, nextEnd = after.length
  while (start < end && start < nextEnd && before[start] === after[start]) start++
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd-- }
  // Do not cut a surrogate pair or a CRLF boundary at either side of the edit.
  const split = (s: string, i: number) => i > 0 && (/[\uD800-\uDBFF]/.test(s[i - 1]) || s[i - 1] === '\r' && s[i] === '\n')
  if (split(before, start) || split(after, start)) start--
  if (split(before, end) || split(after, nextEnd)) { end++; nextEnd++ }
  const position = (offset: number) => { const lines = before.slice(0, offset).split(/\r\n|\r|\n/); return { line: lines.length - 1, character: lines[lines.length - 1].length } }
  return { range: { start: position(start), end: position(end) }, text: after.slice(start, nextEnd) }
}
