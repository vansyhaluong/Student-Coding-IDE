import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Position, TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol'
import type { CSharpLsAdapter } from './csharp-ls-adapter'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { ProjectId } from '../../../shared/contracts'
import { DocumentSyncQueue } from './document-sync-queue'
import { LanguageError } from './language-error'

type Transport = Pick<CSharpLsAdapter, 'didOpen' | 'didChange' | 'didSave' | 'didClose'>
export interface SyncedDocument {
  readonly projectId: ProjectId
  readonly relativePath: string
  readonly token: symbol
}
interface Document {
  handle: SyncedDocument; uri: string; version: number; savedVersion: number; text: string; closing: boolean
}
export interface SaveOutcome { diskSaved: boolean; languageError?: LanguageError; diskError?: unknown }

/** Renderer-agnostic Main shadow. The caller supplies Monaco text and versions. */
export class CsharpDocumentSync {
  private valid = true
  private documents = new Map<symbol, Document>()
  private uris = new Map<string, Document>()
  private opening = new Set<string>()
  private saves: Promise<unknown> = Promise.resolve()
  private readonly queue: DocumentSyncQueue<() => Promise<void>>

  constructor(private readonly projectId: ProjectId, private readonly transport: Transport,
    private readonly files: Pick<FileSystemService, 'authorizeRunFile' | 'write'>,
    private readonly assertSession: () => void) {
    this.queue = new DocumentSyncQueue(async (batch) => {
      for (const send of batch) { this.current(); await send(); this.current() }
    })
  }

  async open(relativePath: string, version: number, text: string, dirty: boolean): Promise<SyncedDocument> {
    this.current()
    if (!/\.cs$/i.test(relativePath) || !Number.isSafeInteger(version) || version < 1 || typeof text !== 'string') {
      throw new LanguageError('invalid-context')
    }
    const file = await this.files.authorizeRunFile(this.projectId, relativePath)
    this.current()
    // Roslyn document lookup needs canonical casing even on Windows.
    const uri = pathToFileURL(file.canonicalFile).href
    const key = uriKey(uri)
    if (this.uris.has(key) || this.opening.has(key)) throw new LanguageError('busy')
    this.opening.add(key)
    const handle = Object.freeze({ projectId: this.projectId, relativePath, token: Symbol() })
    const document = { handle, uri, version, text, savedVersion: dirty ? -1 : version, closing: false }
    try {
      await this.queue.enqueue(() => this.transport.didOpen({ textDocument: { uri, languageId: 'csharp', version, text } }))
      this.current()
      this.documents.set(handle.token, document); this.uris.set(key, document)
      return handle
    } finally { this.opening.delete(key) }
  }

  change(handle: SyncedDocument, version: number, changes: readonly TextDocumentContentChangeEvent[]): Promise<void> {
    const document = this.document(handle)
    if (!Number.isSafeInteger(version) || version <= document.version) throw new LanguageError('invalid-version')
    if (!changes.length) throw new LanguageError('invalid-context')
    const copy = structuredClone(changes)
    let text = document.text
    for (const change of copy) {
      if (!('range' in change) || !change.range || typeof change.text !== 'string') throw new LanguageError('invalid-context')
      const start = offset(text, change.range.start), end = offset(text, change.range.end)
      if (end < start || (change.rangeLength !== undefined && change.rangeLength !== end - start)) {
        throw new LanguageError('invalid-context')
      }
      text = text.slice(0, start) + change.text + text.slice(end)
    }
    document.text = text; document.version = version
    return this.queue.enqueue(() => this.transport.didChange({
      textDocument: { uri: document.uri, version }, contentChanges: [...copy],
    }))
  }

  save(handle: SyncedDocument, version: number): Promise<SaveOutcome> {
    const document = this.document(handle)
    if (version !== document.version) throw new LanguageError('invalid-version')
    const text = document.text
    const result = this.saves.then(() => this.writeSavedVersion(handle, document, version, text))
    this.saves = result.catch(() => {})
    return result
  }

  private async writeSavedVersion(handle: SyncedDocument, document: Document, version: number, text: string): Promise<SaveOutcome> {
    const outcome: SaveOutcome = { diskSaved: false }
    // Disk save stays usable even after language transport failure.
    try { await this.queue.flush() } catch { /* Report language failure after the disk outcome. */ }
    this.document(handle)
    try {
      await this.files.write(handle.projectId, handle.relativePath, text)
      outcome.diskSaved = true
      document.savedVersion = version
    } catch (error) { outcome.diskError = error; return outcome }
    try {
      this.document(handle)
      await this.queue.enqueue(() => this.transport.didSave({ textDocument: { uri: document.uri } }))
    } catch (error) {
      outcome.languageError = error instanceof LanguageError ? error : new LanguageError('protocol-error')
    }
    return outcome
  }

  /** Existing editor save already committed through FileSystemService; never write it twice. */
  saved(handle: SyncedDocument, version: number): Promise<void> {
    const document = this.document(handle)
    if (version !== document.version) throw new LanguageError('invalid-version')
    document.savedVersion = version
    return this.queue.enqueue(() => this.transport.didSave({ textDocument: { uri: document.uri } }))
  }

  async close(handle: SyncedDocument): Promise<void> {
    const document = this.document(handle)
    document.closing = true
    try { await this.queue.enqueue(() => this.transport.didClose({ textDocument: { uri: document.uri } })) }
    finally { this.documents.delete(handle.token); this.uris.delete(uriKey(document.uri)) }
  }

  /** Internal hook for 5.5F semantic operations; never an IPC flush surface. */
  async withFlushedDocument<T>(handle: SyncedDocument, operation: (uri: string) => Promise<T>): Promise<T> {
    const document = this.document(handle), version = document.version
    await this.queue.flush()
    this.assertVersion(handle, version)
    const result = await operation(document.uri)
    this.assertVersion(handle, version)
    return result
  }

  ownsUri(uri: string): boolean { return this.uris.has(uriKey(uri)) || this.opening.has(uriKey(uri)) }
  snapshot(handle: SyncedDocument): { text: string; version: number; dirty: boolean } {
    const document = this.document(handle)
    return { text: document.text, version: document.version, dirty: document.savedVersion !== document.version }
  }
  invalidate(): void {
    this.valid = false; this.queue.invalidate(); this.documents.clear(); this.uris.clear(); this.opening.clear()
  }
  private current(): void {
    if (!this.valid) throw new LanguageError('stale-session')
    this.assertSession()
  }
  private document(handle: SyncedDocument): Document {
    this.current()
    const document = this.documents.get(handle.token)
    if (!document || document.handle !== handle || document.closing || handle.projectId !== this.projectId) {
      throw new LanguageError('stale-document')
    }
    return document
  }
  private assertVersion(handle: SyncedDocument, version: number): void {
    if (this.document(handle).version !== version) throw new LanguageError('stale-document')
  }
}

function uriKey(uri: string): string { return process.platform === 'win32' ? fileURLToPath(uri).toLowerCase() : uri }

function offset(text: string, position: Position): number {
  if (!position || !Number.isSafeInteger(position.line) || position.line < 0
    || !Number.isSafeInteger(position.character) || position.character < 0) throw new LanguageError('invalid-context')
  let start = 0
  for (let line = 0; line < position.line; ++line) {
    const newline = /\r\n|\r|\n/g
    newline.lastIndex = start
    const match = newline.exec(text)
    if (!match) throw new LanguageError('invalid-context')
    start = match.index + match[0].length
  }
  const endMatch = /[\r\n]/.exec(text.slice(start))
  const length = endMatch ? endMatch.index : text.length - start
  if (position.character > length) throw new LanguageError('invalid-context')
  return start + position.character // JavaScript indexes UTF-16 code units, as negotiated.
}
