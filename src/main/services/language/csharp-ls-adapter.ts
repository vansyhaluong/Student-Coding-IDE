import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ErrorCodes, ResponseError } from 'vscode-jsonrpc/node'
import type * as Lsp from 'vscode-languageserver-protocol'
import { CSHARP_LS_CAPABILITIES, LANGUAGE_LIMITS, type CompletionHandle,
  type LanguageCapability } from '../../../shared/contracts/language'
import { LspConnection } from './lsp-connection'
import { LanguageError } from './language-error'
import type { CsharpSessionContext } from './csharp-process'

export interface CsharpServerCapabilities {
  readonly completion: boolean
  readonly completionResolve: boolean
  readonly hover: boolean
  readonly signatureHelp: boolean
  readonly definition: boolean
  readonly diagnostics: boolean
  readonly incrementalSync: boolean
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const supported = (value: unknown): boolean => value === true || object(value)
const position = (value: unknown): boolean => object(value) && Number.isInteger(value.line)
  && Number(value.line) >= 0 && Number.isInteger(value.character) && Number(value.character) >= 0
const range = (value: unknown): boolean => object(value) && position(value.start) && position(value.end)

export function inspectCsharpCapabilities(value: unknown): CsharpServerCapabilities {
  if (!object(value) || !object(value.capabilities)) throw new LanguageError('invalid-response')
  const c = value.capabilities
  const sync = c.textDocumentSync
  const capabilities = {
    completion: object(c.completionProvider),
    completionResolve: object(c.completionProvider) && c.completionProvider.resolveProvider === true,
    hover: supported(c.hoverProvider),
    signatureHelp: object(c.signatureHelpProvider),
    definition: supported(c.definitionProvider),
    diagnostics: object(c.diagnosticProvider) && typeof c.diagnosticProvider.interFileDependencies === 'boolean'
      && typeof c.diagnosticProvider.workspaceDiagnostics === 'boolean',
    incrementalSync: sync === 2 || (object(sync) && sync.change === 2 && sync.openClose === true),
  }
  if ((c.positionEncoding !== undefined && c.positionEncoding !== 'utf-16')
    || Object.values(capabilities).some((value) => !value)) throw new LanguageError('capability-mismatch')
  return Object.freeze(capabilities)
}

export interface AdapterCompletion {
  readonly handle: CompletionHandle
  /** Internal LSP presentation fields only; resolve data is held in the adapter. */
  readonly item: Omit<Lsp.CompletionItem, 'data'>
}

export class CSharpLsAdapter {
  private valid = true
  private initialized = false
  private result?: Lsp.InitializeResult
  private advertised?: CsharpServerCapabilities
  private readonly completions = new Map<CompletionHandle, { uri: string; item: Lsp.CompletionItem }>()
  private readonly diagnostics = new Map<string, { resultId?: string; items: Lsp.Diagnostic[] }>()
  private readonly revisions = new Map<string, number>()
  private readonly registrations = new Map<string, Lsp.DidChangeWatchedFilesRegistrationOptions>()
  private refreshRevision = 0
  private readonly diagnosticListeners = new Set<() => void>()
  subscribeDiagnosticsRefresh(listener: () => void): () => void {
    this.diagnosticListeners.add(listener)
    return () => { this.diagnosticListeners.delete(listener) }
  }

  constructor(private readonly connection: LspConnection, readonly generation: number,
    private readonly isCurrent: () => boolean) {}

  get serverCapabilities(): CsharpServerCapabilities | undefined { return this.advertised }
  /** Main-only retained initialize result. No public bridge references this type. */
  get initializeResult(): Lsp.InitializeResult | undefined {
    return this.result ? structuredClone(this.result) : undefined
  }
  get watchedFileRegistrations(): ReadonlyMap<string, Lsp.DidChangeWatchedFilesRegistrationOptions> {
    return new Map([...this.registrations].map(([id, options]) => [id, structuredClone(options)]))
  }
  get diagnosticRefreshRevision(): number { return this.refreshRevision }

  effectiveCapabilities(running: boolean): readonly LanguageCapability[] {
    if (!running || !this.valid || !this.isCurrent() || !this.initialized || !this.advertised) return []
    return CSHARP_LS_CAPABILITIES.filter((capability) => this.advertised![capability])
  }

  async initialize(context: CsharpSessionContext): Promise<void> {
    this.assertCurrent()
    this.registerServerHandlers()
    this.connection.listen()
    const rootUri = pathToFileURL(context.root).href
    const params: Lsp.InitializeParams = {
      processId: process.pid, rootUri,
      clientInfo: { name: 'Student Coding IDE', version: '1.0.0' },
      workspaceFolders: [{ uri: rootUri, name: basename(context.root) }],
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true } },
        window: { workDoneProgress: true },
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          completion: { dynamicRegistration: false, completionItem: {
            snippetSupport: false, documentationFormat: ['plaintext'],
            resolveSupport: { properties: ['detail', 'documentation'] },
          } },
          hover: { dynamicRegistration: false, contentFormat: ['plaintext'] },
          signatureHelp: { dynamicRegistration: false, signatureInformation: {
            documentationFormat: ['plaintext'], parameterInformation: { labelOffsetSupport: true },
          } },
          definition: { dynamicRegistration: false, linkSupport: false },
          diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
        },
      },
    }
    const result = await this.connection.request<unknown>('@initialize', 'initialize', params, 30_000)
    this.assertCurrent()
    this.advertised = inspectCsharpCapabilities(result)
    this.result = structuredClone(result as Lsp.InitializeResult)
    await this.connection.notify('initialized', {})
    this.assertCurrent()
    this.initialized = true
  }

  async completion(operation: string, document: Lsp.TextDocumentPositionParams): Promise<{
    isIncomplete: boolean; items: AdapterCompletion[]
  }> {
    const result = await this.request<Lsp.CompletionItem[] | Lsp.CompletionList | null>(
      operation, 'textDocument/completion', document, document.textDocument.uri)
    if (result === null) return { isIncomplete: false, items: [] }
    const items = Array.isArray(result) ? result : result.items
    if (!Array.isArray(items) || items.some((item) => !object(item) || typeof item.label !== 'string')) {
      throw new LanguageError('invalid-response')
    }
    this.clearCompletions(document.textDocument.uri)
    return {
      isIncomplete: !Array.isArray(result) && result.isIncomplete === true,
      items: items.slice(0, LANGUAGE_LIMITS.maximumCompletionItems).map((item) => {
        const handle = randomUUID() as CompletionHandle
        while (this.completions.size >= LANGUAGE_LIMITS.maximumCompletionItems) {
          this.completions.delete(this.completions.keys().next().value!)
        }
        this.completions.set(handle, { uri: document.textDocument.uri, item: structuredClone(item) })
        return { handle, item: withoutData(item) }
      }),
    }
  }

  async resolveCompletion(operation: string, handle: CompletionHandle): Promise<Omit<Lsp.CompletionItem, 'data'>> {
    this.assertReady()
    const cached = this.completions.get(handle)
    if (!cached) throw new LanguageError('invalid-handle')
    const result = await this.request<Lsp.CompletionItem>(operation, 'completionItem/resolve',
      cached.item, cached.uri)
    if (!object(result) || typeof result.label !== 'string') throw new LanguageError('invalid-response')
    return withoutData(result)
  }

  async hover(operation: string, params: Lsp.TextDocumentPositionParams): Promise<Lsp.Hover | null> {
    const result = await this.request<Lsp.Hover | null>(operation, 'textDocument/hover', params, params.textDocument.uri)
    if (result !== null && (!object(result) || result.contents === undefined
      || (result.range !== undefined && !range(result.range)))) throw new LanguageError('invalid-response')
    return result
  }
  async signatureHelp(operation: string, params: Lsp.TextDocumentPositionParams): Promise<Lsp.SignatureHelp | null> {
    const result = await this.request<Lsp.SignatureHelp | null>(
      operation, 'textDocument/signatureHelp', params, params.textDocument.uri)
    if (result !== null && (!object(result) || !Array.isArray(result.signatures)
      || result.signatures.some((item) => !object(item) || typeof item.label !== 'string'))) {
      throw new LanguageError('invalid-response')
    }
    return result
  }
  async definition(operation: string, params: Lsp.TextDocumentPositionParams): Promise<Lsp.Definition | null> {
    // The public semantic service performs URI containment and DTO conversion.
    const result = await this.request<Lsp.Definition | null>(
      operation, 'textDocument/definition', params, params.textDocument.uri)
    if (result !== null && (Array.isArray(result) ? result : [result]).some(
      (item) => !object(item) || typeof item.uri !== 'string' || !range(item.range))) {
      throw new LanguageError('invalid-response')
    }
    return result
  }

  async documentDiagnostics(operation: string, uri: string): Promise<readonly Lsp.Diagnostic[]> {
    return (await this.documentDiagnosticReport(operation, uri)).items
  }
  async documentDiagnosticReport(operation: string, uri: string): Promise<{ kind: 'full' | 'unchanged'; items: readonly Lsp.Diagnostic[] }> {
    const cached = this.diagnostics.get(uri)
    const result = await this.request<Lsp.DocumentDiagnosticReport>(operation, 'textDocument/diagnostic',
      { textDocument: { uri }, identifier: 'csharp-ls',
        ...(cached?.resultId ? { previousResultId: cached.resultId } : {}) }, uri)
    if (!object(result) || (result.resultId !== undefined && typeof result.resultId !== 'string')) {
      throw new LanguageError('invalid-response')
    }
    if (result.kind === 'full' && Array.isArray(result.items)
      && result.items.every((item) => object(item) && typeof item.message === 'string' && range(item.range))) {
      this.diagnostics.set(uri, { resultId: result.resultId, items: structuredClone(result.items) })
    } else if (result.kind === 'unchanged' && cached) {
      this.diagnostics.set(uri, { ...cached, resultId: result.resultId })
    } else throw new LanguageError('invalid-response')
    return { kind: result.kind, items: structuredClone(this.diagnostics.get(uri)!.items) }
  }

  didOpen(params: Lsp.DidOpenTextDocumentParams): Promise<void> {
    this.diagnostics.delete(params.textDocument.uri)
    this.invalidateDocument(params.textDocument.uri)
    return this.notify('textDocument/didOpen', params)
  }
  didChange(params: Lsp.DidChangeTextDocumentParams): Promise<void> {
    this.invalidateDocument(params.textDocument.uri)
    return this.notify('textDocument/didChange', params)
  }
  didSave(params: Lsp.DidSaveTextDocumentParams): Promise<void> {
    this.invalidateDocument(params.textDocument.uri)
    return this.notify('textDocument/didSave', params)
  }
  didClose(params: Lsp.DidCloseTextDocumentParams): Promise<void> {
    this.diagnostics.delete(params.textDocument.uri)
    this.invalidateDocument(params.textDocument.uri)
    return this.notify('textDocument/didClose', params)
  }
  didChangeWatchedFiles(params: Lsp.DidChangeWatchedFilesParams): Promise<void> {
    return this.notify('workspace/didChangeWatchedFiles', params)
  }
  cancel(operation: string): void { this.connection.cancel(operation) }

  invalidate(): void {
    if (!this.valid) return
    this.valid = false
    this.connection.cancelAll()
    this.completions.clear(); this.diagnostics.clear(); this.revisions.clear(); this.registrations.clear()
    this.diagnosticListeners.clear()
  }

  private invalidateDocument(uri: string): void {
    this.revisions.set(uri, (this.revisions.get(uri) ?? 0) + 1)
    this.clearCompletions(uri)
  }
  private clearCompletions(uri: string): void {
    for (const [handle, item] of this.completions) if (item.uri === uri) this.completions.delete(handle)
  }
  private assertCurrent(): void {
    if (!this.valid || !this.isCurrent()) throw new LanguageError('stale-session')
  }
  private assertReady(): void {
    this.assertCurrent()
    if (!this.initialized) throw new LanguageError('not-running')
  }
  private async request<T>(operation: string, method: string, params: unknown, uri: string): Promise<T> {
    this.assertReady()
    if (operation.startsWith('@')) throw new LanguageError('invalid-context')
    const revision = this.revisions.get(uri) ?? 0
    this.revisions.set(uri, revision)
    const result = await this.connection.request<T>(operation, method, params)
    this.assertReady()
    if (revision !== (this.revisions.get(uri) ?? 0)) throw new LanguageError('stale-session')
    return result
  }
  private async notify(method: string, params: unknown): Promise<void> {
    this.assertReady()
    await this.connection.notify(method, params)
    this.assertCurrent()
  }

  private registerServerHandlers(): void {
    const invalid = () => new ResponseError(ErrorCodes.InvalidParams, 'Unsupported language server request.')
    this.connection.onRequest('workspace/configuration', (params) => {
      if (!object(params) || !Array.isArray(params.items) || params.items.length > 256) throw invalid()
      return params.items.map(() => ({ analyzersEnabled: false, useMetadataUris: false, razorSupport: false }))
    })
    this.connection.onRequest('window/workDoneProgress/create', (params) => {
      if (!object(params) || (typeof params.token !== 'string' && typeof params.token !== 'number')) throw invalid()
      return null
    })
    this.connection.onRequest('client/registerCapability', (params) => {
      if (!object(params) || !Array.isArray(params.registrations) || params.registrations.length > 256) throw invalid()
      const accepted = new Map<string, Lsp.DidChangeWatchedFilesRegistrationOptions>()
      for (const entry of params.registrations) {
        if (!object(entry) || typeof entry.id !== 'string' || entry.id.length > 256
          || entry.method !== 'workspace/didChangeWatchedFiles' || this.registrations.has(entry.id)
          || accepted.has(entry.id) || !object(entry.registerOptions)) throw invalid()
        const watchers = entry.registerOptions.watchers
        if (!Array.isArray(watchers) || watchers.length > 256 || watchers.some((watcher) =>
          !object(watcher) || typeof watcher.globPattern !== 'string' || watcher.globPattern.length > 1024
          || (watcher.kind !== undefined && (!Number.isInteger(watcher.kind)
            || Number(watcher.kind) < 1 || Number(watcher.kind) > 7)))) throw invalid()
        accepted.set(entry.id, structuredClone(entry.registerOptions) as unknown as Lsp.DidChangeWatchedFilesRegistrationOptions)
      }
      if (this.registrations.size + accepted.size > 256) throw invalid()
      for (const [id, options] of accepted) this.registrations.set(id, options)
      return null
    })
    this.connection.onRequest('client/unregisterCapability', (params) => {
      // LSP's wire field intentionally uses the historical "unregisterations" spelling.
      if (!object(params) || !Array.isArray(params.unregisterations)) throw invalid()
      for (const entry of params.unregisterations) {
        if (!object(entry) || typeof entry.id !== 'string' || entry.method !== 'workspace/didChangeWatchedFiles'
          || !this.registrations.has(entry.id)) throw invalid()
      }
      for (const entry of params.unregisterations) this.registrations.delete(entry.id)
      return null
    })
    this.connection.onRequest('workspace/diagnostic/refresh', () => {
      this.refreshRevision++
      this.diagnostics.clear()
      for (const uri of this.revisions.keys()) this.invalidateDocument(uri)
      for (const listener of this.diagnosticListeners) listener()
      return null
    })
    this.connection.onRequest('workspace/semanticTokens/refresh', () => null)
    for (const method of ['window/logMessage', 'window/showMessage', '$/progress', '$/logTrace', 'telemetry/event']) {
      this.connection.onNotification(method, () => { /* drained; no raw logs or lifecycle inference */ })
    }
  }
}

function withoutData(item: Lsp.CompletionItem): Omit<Lsp.CompletionItem, 'data'> {
  const copy = structuredClone(item)
  delete copy.data
  return copy
}
