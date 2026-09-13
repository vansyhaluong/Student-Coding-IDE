import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import type { ProjectId } from '../../../shared/contracts'
import { CSHARP_LS_CAPABILITIES, LANGUAGE_LIMITS, LANGUAGE_REASON_CODES,
  type LanguageStatus, type LanguageWorkspaceStatus, type LanguageReasonCode, type LanguageModelIdentity,
  type OpenLanguageDocumentRequest, type ChangeLanguageDocumentRequest, type CompletionRequest,
  type CompletionResolveRequest, type CompletionHandle, type CompletionItem, type DefinitionTarget,
  type SemanticRequestId, type SelectLanguageWorkspaceRequest, type DiagnosticRequest, type DiagnosticResult } from '../../../shared/contracts/language'
import type { IpcRequestContext } from '../../ipc/ipc-handler-registry'
import type { ProjectService } from '../project/project-service'
import { isPathWithinRoot, type FileSystemService } from '../filesystem/filesystem-service'
import type { LanguageServiceManager } from './language-service-manager'
import type { CsharpWorkspaceSession } from './csharp-workspace-session'
import type { CsharpOwnerLifecycle } from './csharp-owner-lifecycle'
import type { SyncedDocument, CsharpDocumentSync } from './csharp-document-sync'
import { LanguageError } from './language-error'
import { completionItem, markdown, safeRange, signatureResult, triggers } from './csharp-semantic-mapping'
import { normalizeCsharpDiagnostics } from './csharp-diagnostic-mapping'

type Document = { handle: SyncedDocument; sync: CsharpDocumentSync; owner: string; epoch: number; version: number }
type Operation = { owner: string; operation: string; cancelled: boolean; cancel(): void }
type Handle = { document: Document; version: number; internal: CompletionHandle }
/** Main-only semantic routing. Every async continuation rechecks trusted ownership. */
export class CsharpSemanticService {
  private readonly documents = new Map<string, Document>()
  private readonly handles = new Map<CompletionHandle, Handle>()
  private readonly pending = new Map<SemanticRequestId, Operation>()
  private documentTail: Promise<unknown> = Promise.resolve()
  private readonly diagnosticTails = new Map<string, Promise<unknown>>()
  private removeDiagnosticRefresh?: () => void
  private diagnosticAdapter?: LanguageServiceManager['adapter']
  private readonly removers: Array<() => void> = []
  private observers = new Map<string, { context: IpcRequestContext; projectId: ProjectId }>()
  constructor(private readonly projects: ProjectService, private readonly files: FileSystemService,
    private readonly session: CsharpWorkspaceSession, private readonly manager: LanguageServiceManager,
    private readonly owners: Pick<CsharpOwnerLifecycle, 'assertCurrent'>,
    private readonly publish: (senderId: number, projectId: ProjectId, status: LanguageStatus) => void) {
    this.removers.push(session.subscribe(() => { this.prune(); this.statusChanged() }), manager.subscribe(() => {
      if (manager.state !== 'RUNNING') this.cancelAll()
      this.statusChanged()
    }))
  }
  private key(identity: { projectId: ProjectId; relativePath: string }): string {
    return identity.projectId + ':' + (process.platform === 'win32' ? identity.relativePath.toLowerCase() : identity.relativePath)
  }
  private authorize(context: IpcRequestContext, projectId: ProjectId): string {
    const owner = this.owners.assertCurrent(context)
    this.projects.getAuthorizedProject(projectId)
    if (this.files.getStatus(projectId).state !== 'AVAILABLE') throw new LanguageError('stale-session')
    this.observers.set(owner, { context, projectId })
    return owner
  }
  private capture(context: IpcRequestContext, projectId: ProjectId): () => void {
    const owner = this.authorize(context, projectId), epoch = this.session.epoch
    return () => { if (this.authorize(context, projectId) !== owner || epoch !== this.session.epoch) throw new LanguageError('stale-session') }
  }
  async getStatus(projectId: ProjectId, context: IpcRequestContext): Promise<LanguageStatus> {
    const current = this.capture(context, projectId)
    await this.manager.detectDependencies()
    current()
    if (!this.session.snapshot && this.manager.state !== 'CRASHED') {
      try { await this.session.ensure(projectId) } catch (error) {
        this.authorize(context, projectId)
        if (!this.session.snapshot) throw error
      }
    }
    this.authorize(context, projectId)
    const status = this.status()
    this.publish(context.senderId, projectId, status)
    return status
  }
  async select(request: SelectLanguageWorkspaceRequest, context: IpcRequestContext): Promise<LanguageStatus> {
    const current = this.capture(context, request.projectId)
    const state = this.session.snapshot
    if (state?.state !== 'SELECTION_REQUIRED' || request.candidate.kind !== 'solution') throw new LanguageError('invalid-context')
    const candidate = state.candidates.find(c => c.relativePath === request.candidate.relativePath)
    if (!candidate) throw new LanguageError('invalid-context')
    await this.session.ensure(request.projectId, candidate.candidateId); current()
    this.statusChanged()
    return this.status()
  }
  open(request: OpenLanguageDocumentRequest, context: IpcRequestContext): Promise<LanguageStatus> {
    const current = this.capture(context, request.projectId), owner = this.owners.assertCurrent(context)
    return this.serialize(async () => {
      current()
      const status = await this.getStatus(request.projectId, context)
      current()
      if (status.workspace.state !== 'READY' || status.service.state !== 'RUNNING') return status
      if (this.documents.has(this.key(request))) throw new LanguageError('busy')
      const sync = this.session.sync
      const handle = await sync.open(request.relativePath, request.modelVersion, request.text, request.dirty)
      current()
      this.documents.set(this.key(request), { handle, sync, owner, epoch: this.session.epoch, version: request.modelVersion })
      return this.status()
    })
  }
  change(request: ChangeLanguageDocumentRequest, context: IpcRequestContext): Promise<null> {
    const current = this.capture(context, request.projectId)
    return this.serialize(async () => {
      current()
      const document = this.document(request, context, false)
      if (request.modelVersion <= document.version) throw new LanguageError('invalid-version')
      this.expire(document)
      const sent = document.sync.change(document.handle, request.modelVersion, request.changes)
      document.version = request.modelVersion
      await sent; current(); return null
    })
  }
  save(request: LanguageModelIdentity, context: IpcRequestContext): Promise<null> {
    const current = this.capture(context, request.projectId)
    return this.serialize(async () => {
      current(); const document = this.document(request, context)
      await document.sync.saved(document.handle, request.modelVersion); current(); this.expire(document); return null
    })
  }
  close(request: LanguageModelIdentity, context: IpcRequestContext): Promise<null> {
    const current = this.capture(context, request.projectId)
    return this.serialize(async () => {
      current(); const document = this.document(request, context)
      this.expire(document); this.documents.delete(this.key(request))
      await document.sync.close(document.handle); current(); return null
    })
  }
  async semantic(kind: 'completion' | 'hover' | 'signature' | 'definition', request: CompletionRequest, context: IpcRequestContext) {
    const current = this.capture(context, request.document.projectId)
    return this.operation(request.requestId, context, async (operation, check) => {
      await this.documentTail; current(); check()
      const document = this.document({ ...request.document, modelVersion: request.documentVersion }, context)
      const adapter = this.manager.adapter
      return document.sync.withFlushedDocument(document.handle, async uri => {
        check()
        const position = request.position, params = { textDocument: { uri }, position }
        const text = document.sync.snapshot(document.handle).text.split(/\r\n|\r|\n/)
        if (position.line >= text.length || position.character > text[position.line].length) throw new LanguageError('invalid-context')
        const base = { requestId: request.requestId, documentVersion: request.documentVersion }
        if (kind === 'completion') {
          const result = await adapter.completion(operation, params); current(); check()
          this.expire(document)
          const items: CompletionItem[] = []
          for (const entry of result.items) {
            const handle = ('completion_' + randomUUID().replaceAll('-', '')) as CompletionHandle
            const mapped = completionItem(entry.item, handle)
            if (!mapped) continue
            while (this.handles.size >= LANGUAGE_LIMITS.maximumCompletionItems) this.handles.delete(this.handles.keys().next().value!)
            this.handles.set(handle, { document, version: document.version, internal: entry.handle }); items.push(mapped)
          }
          return { ...base, isIncomplete: result.isIncomplete, items }
        }
        if (kind === 'hover') {
          const result = await adapter.hover(operation, params); current(); check()
          return result === null ? null : { ...base, contents: markdown(result.contents) ?? '', range: safeRange(result.range) }
        }
        if (kind === 'signature') {
          const result = await adapter.signatureHelp(operation, params); current(); check()
          return signatureResult(result, request.requestId, request.documentVersion)
        }
        const result = await adapter.definition(operation, params); current(); check()
        const targets: DefinitionTarget[] = []
        for (const target of (result === null ? [] : Array.isArray(result) ? result : [result]).slice(0, LANGUAGE_LIMITS.maximumDefinitions)) {
          const range = safeRange(target.range)
          if (!range) continue
          try {
            const url = new URL(target.uri)
            if (url.protocol !== 'file:' || url.search || url.hash) continue
            const root = this.projects.getAuthorizedProject(request.document.projectId).canonicalRoot
            const path = fileURLToPath(url)
            if (!isPathWithinRoot(root, path)) continue
            const relativePath = relative(root, path).replaceAll('\\', '/')
            const authorized = await this.files.authorizeRunFile(request.document.projectId, relativePath)
            current(); check()
            if (!isPathWithinRoot(root, authorized.canonicalFile)) continue
            targets.push({ document: { projectId: request.document.projectId,
              relativePath: relative(root, authorized.canonicalFile).replaceAll('\\', '/') }, range })
          } catch { current(); check() /* Unsupported/inaccessible target stays outside the public result. */ }
        }
        return { ...base, targets }
      })
    })
  }
  async resolve(request: CompletionResolveRequest, context: IpcRequestContext): Promise<CompletionItem> {
    const cached = this.handles.get(request.handle)
    if (!cached) throw new LanguageError('invalid-handle')
    const document = cached.document, current = this.capture(context, document.handle.projectId)
    return this.operation(request.requestId, context, async (operation, check) => {
      await this.documentTail; current(); check()
      if (document.owner !== this.owners.assertCurrent(context) || cached.version !== document.version
        || this.handles.get(request.handle) !== cached) throw new LanguageError('invalid-handle')
      return document.sync.withFlushedDocument(document.handle, async () => {
        const item = await this.manager.adapter.resolveCompletion(operation, cached.internal)
        current(); check()
        if (this.handles.get(request.handle) !== cached) throw new LanguageError('invalid-handle')
        const result = completionItem(item, request.handle)
        if (!result) throw new LanguageError('invalid-response')
        return result
      })
    })
  }
  cancel(requestId: SemanticRequestId, context: IpcRequestContext): null {
    const owner = this.owners.assertCurrent(context), pending = this.pending.get(requestId)
    if (pending && pending.owner !== owner) throw new LanguageError('invalid-context')
    if (pending) { pending.cancelled = true; pending.cancel() }
    return null
  }
  async diagnostics(request: DiagnosticRequest, context: IpcRequestContext): Promise<DiagnosticResult> {
    const current = this.capture(context, request.document.projectId), key = this.key(request.document)
    const prior = this.diagnosticTails.get(key) ?? Promise.resolve()
    const task = this.operation(request.requestId, context, async (operation, check) => {
      await prior; await this.documentTail; current(); check()
      const identity = { ...request.document, modelVersion: request.documentVersion }
      const document = this.document(identity, context), adapter = this.manager.adapter
      return document.sync.withFlushedDocument(document.handle, async uri => {
        current(); check()
        const report = await adapter.documentDiagnosticReport(operation, uri)
        current(); check()
        if (this.document(identity, context) !== document || this.manager.adapter !== adapter) throw new LanguageError('stale-document')
        return { requestId: request.requestId, documentVersion: request.documentVersion,
          kind: report.kind, diagnostics: normalizeCsharpDiagnostics(report.items) }
      })
    })
    const tail = task.catch(() => {})
    this.diagnosticTails.set(key, tail)
    try { return await task }
    finally { if (this.diagnosticTails.get(key) === tail) this.diagnosticTails.delete(key) }
  }
  private async operation<T>(id: SemanticRequestId, context: IpcRequestContext,
    run: (operation: string, check: () => void) => Promise<T>): Promise<T> {
    if (this.pending.has(id)) throw new LanguageError('busy')
    const owner = this.owners.assertCurrent(context), operation = 'semantic_' + randomUUID()
    const adapter = this.manager.adapter
    const pending = { owner, operation, cancelled: false, cancel: () => adapter.cancel(operation) }
    this.pending.set(id, pending)
    const check = () => {
      if (pending.cancelled) throw new LanguageError('cancelled')
      if (this.owners.assertCurrent(context) !== owner) throw new LanguageError('stale-session')
    }
    try { const result = await run(operation, check); check(); return result }
    finally { if (this.pending.get(id) === pending) this.pending.delete(id) }
  }
  private document(identity: LanguageModelIdentity, context: IpcRequestContext, exact = true): Document {
    const owner = this.authorize(context, identity.projectId), document = this.documents.get(this.key(identity))
    if (!document || document.owner !== owner || document.epoch !== this.session.epoch) throw new LanguageError('stale-document')
    if (exact && identity.modelVersion !== document.version) throw new LanguageError('invalid-version')
    document.sync.snapshot(document.handle)
    return document
  }
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const task = this.documentTail.then(run); this.documentTail = task.catch(() => {}); return task
  }
  private expire(document: Document): void { for (const [handle, cached] of this.handles) if (cached.document === document) this.handles.delete(handle) }
  private prune(): void {
    for (const [key, document] of this.documents) if (document.epoch !== this.session.epoch) { this.expire(document); this.documents.delete(key) }
    this.cancelAll()
  }
  private cancelAll(): void { for (const op of this.pending.values()) { op.cancelled = true; op.cancel() } }
  private status(): LanguageStatus {
    const source = this.session.snapshot
    if (!source || !this.manager.dependency) throw new LanguageError('not-running')
    let workspace: LanguageWorkspaceStatus
    if (source.state === 'READY') workspace = source.mode === 'solution'
      ? { state: 'READY', mode: 'solution', selected: { kind: 'solution', relativePath: source.solution! } } : { state: 'READY', mode: 'project' }
    else if (source.state === 'SELECTION_REQUIRED') workspace = { state: 'SELECTION_REQUIRED', candidates: source.candidates.map(c => ({ kind: 'solution', relativePath: c.relativePath })) }
    else if (source.state === 'NO_CSHARP_WORKSPACE') workspace = { state: 'NO_CSHARP_WORKSPACE' }
    else workspace = { state: 'PREFLIGHT_FAILED', reason: LANGUAGE_REASON_CODES.includes(source.reason as LanguageReasonCode)
      ? source.reason as LanguageReasonCode : 'WORKSPACE_PREFLIGHT_FAILED' }
    const running = this.manager.state === 'RUNNING'
    const adapter = running ? this.manager.adapter : undefined, caps = adapter?.initializeResult?.capabilities
    if (adapter !== this.diagnosticAdapter) {
      this.removeDiagnosticRefresh?.(); this.diagnosticAdapter = adapter
      this.removeDiagnosticRefresh = adapter?.subscribeDiagnosticsRefresh?.(() => {
        if (this.manager.state === 'RUNNING' && this.manager.adapter === adapter) this.statusChanged()
      })
    }
    return { providerId: 'csharp-ls', capabilities: CSHARP_LS_CAPABILITIES,
      effectiveCapabilities: this.manager.capabilities, completionResolve: running && adapter?.serverCapabilities?.completionResolve === true,
      completionTriggers: triggers(caps?.completionProvider?.triggerCharacters),
      signatureTriggers: triggers(caps?.signatureHelpProvider?.triggerCharacters), signatureRetriggers: triggers(caps?.signatureHelpProvider?.retriggerCharacters),
      dependency: this.manager.dependency, service: { state: this.manager.state, reason: null }, workspace }
  }
  private statusChanged(): void {
    for (const [owner, { context, projectId }] of this.observers) {
      try { this.authorize(context, projectId); this.publish(context.senderId, projectId, this.status()) }
      catch { this.observers.delete(owner) /* No status can be delivered to retired ownership. */ }
    }
  }
  stop(): void { this.cancelAll(); this.removeDiagnosticRefresh?.(); for (const remove of this.removers.splice(0)) remove(); this.documents.clear(); this.handles.clear(); this.observers.clear() }
}
