import { matchesGlob, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FileChangedEvent, ProjectId } from '../../../shared/contracts'
import type { FileSystemService } from '../filesystem/filesystem-service'
import { resolveProjectRelativePath } from '../project/project-identity'
import type { CSharpLsAdapter } from './csharp-ls-adapter'
import type { CsharpDocumentSync } from './csharp-document-sync'
import { LanguageError } from './language-error'

/** Consumes FileSystemService events; owns no filesystem watcher. */
export class CsharpWatchedFiles {
  private tail: Promise<void> = Promise.resolve()
  private known = new Map<string, string>()
  private valid = true
  constructor(private readonly projectId: ProjectId, private readonly root: string,
    private readonly files: Pick<FileSystemService, 'listDirectory' | 'authorizeRunFile' | 'stat'>,
    private readonly adapter: Pick<CSharpLsAdapter, 'watchedFileRegistrations' | 'didChangeWatchedFiles'>,
    private readonly documents: Pick<CsharpDocumentSync, 'ownsUri'>, private readonly current: () => void) {}

  initialize(): Promise<void> {
    const task = this.tail.then(async () => { this.known = await this.scan(''); this.check() })
    this.tail = task
    return task
  }

  accept(event: FileChangedEvent): Promise<void> {
    const task = this.tail.then(() => this.update(event))
    this.tail = task.catch(() => {}) // Caller owns/report failures; later events remain usable.
    return task
  }
  invalidate(): void { this.valid = false; this.known.clear() }

  private async update(event: FileChangedEvent): Promise<void> {
    this.check()
    if (event.projectId !== this.projectId) throw new LanguageError('stale-session')
    resolveProjectRelativePath(this.root, event.relativePath)
    const prefix = event.relativePath + '/'
    const before = new Map([...this.known].filter(([p]) => p === event.relativePath || p.startsWith(prefix)))
    const after = new Map<string, string>()
    try {
      const stat = await this.files.stat(this.projectId, event.relativePath)
      this.check()
      if (stat.kind === 'directory' && !stat.isSymbolicLink) {
        for (const item of await this.scan(event.relativePath)) after.set(...item)
      } else if (stat.kind === 'file' || stat.isSymbolicLink) {
        const file = await this.files.authorizeRunFile(this.projectId, event.relativePath)
        after.set(event.relativePath, uri(file.canonicalFile))
      }
    } catch (error) {
      this.check()
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      // Prove the remaining parent is still contained before reporting a deletion.
      let parent = dirname(event.relativePath).replaceAll('\\', '/')
      while (parent !== '.') {
        try { await this.files.stat(this.projectId, parent); break }
        catch (parentError) {
          if (!(parentError instanceof Error && 'code' in parentError && parentError.code === 'ENOENT')) throw parentError
          parent = dirname(parent).replaceAll('\\', '/')
        }
      }
    }
    this.check()
    const changes: Array<{ uri: string; type: 1 | 2 | 3 }> = []
    const paths = new Set([...before.keys(), ...after.keys()])
    // A deleted file can arrive before a baseline entry (e.g. rapid create/delete).
    if (!paths.size && /\.[^/]+$/.test(event.relativePath)) paths.add(event.relativePath)
    for (const path of paths) {
      const target = after.get(path) ?? before.get(path) ?? uri(resolveProjectRelativePath(this.root, path))
      const type = !after.has(path) ? 3 : !before.has(path) ? 1 : 2
      if (this.documents.ownsUri(target)) continue
      if ([...this.adapter.watchedFileRegistrations.values()].some((options) => options.watchers.some((watcher) => {
        if (typeof watcher.globPattern !== 'string' || !((watcher.kind ?? 7) & (1 << (type - 1)))) return false
        return matchesGlob(path, watcher.globPattern) || matchesGlob(resolveProjectRelativePath(this.root, path), watcher.globPattern)
      }))) changes.push({ uri: target, type })
    }
    for (const path of before.keys()) this.known.delete(path)
    for (const item of after) this.known.set(...item)
    this.check()
    if (changes.length) { await this.adapter.didChangeWatchedFiles({ changes }); this.check() }
  }

  private async scan(directory: string): Promise<Map<string, string>> {
    const pending = [directory], result = new Map<string, string>()
    let count = 0
    for (let i = 0; i < pending.length; ++i) {
      this.check()
      const entries = await this.files.listDirectory(this.projectId, pending[i])
      this.check()
      for (const entry of entries) {
        if (++count > 100_000) throw new LanguageError('preflight-failed')
        if (entry.isSymbolicLink) continue
        if (entry.kind === 'directory') pending.push(entry.relativePath)
        else if (entry.kind === 'file') {
          const file = await this.files.authorizeRunFile(this.projectId, entry.relativePath)
          this.check()
          result.set(entry.relativePath, uri(file.canonicalFile))
        }
      }
    }
    return result
  }
  private check(): void { if (!this.valid) throw new LanguageError('stale-session'); this.current() }
}
function uri(path: string): string { return pathToFileURL(process.platform === 'win32' ? path.toLowerCase() : path).href }
