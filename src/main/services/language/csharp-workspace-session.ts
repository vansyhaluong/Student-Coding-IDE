import type { ManagedService } from '../../app/desktop-application'
import type { ProjectId } from '../../../shared/contracts'
import type { ProjectService } from '../project/project-service'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { LanguageServiceManager } from './language-service-manager'
import type { CsharpWorkspace, WorkspaceCommands, WorkspaceResult } from './csharp-workspace'
import { CsharpDocumentSync } from './csharp-document-sync'
import { CsharpWatchedFiles } from './csharp-watched-files'
import { LanguageError } from './language-error'
import type { CSharpLsAdapter } from './csharp-ls-adapter'

type SessionAdapter = Pick<CSharpLsAdapter, 'didOpen' | 'didChange' | 'didSave' | 'didClose'
  | 'watchedFileRegistrations' | 'didChangeWatchedFiles'>
export interface WorkspaceLanguageManager {
  readonly state: LanguageServiceManager['state']
  start(context: { root: string; solution?: string }): Promise<SessionAdapter>
  stop(): Promise<void>
}

/** Internal lazy entry point for 5.5F; no Renderer/IPC authority. */
export class CsharpWorkspaceSession implements ManagedService {
  readonly name = 'CsharpWorkspaceSession'
  private generation = 0
  private abort?: AbortController
  private starting?: Promise<WorkspaceResult>
  private cleanup: Promise<void> = Promise.resolve()
  private documents?: CsharpDocumentSync
  private watched?: CsharpWatchedFiles
  private projectId?: ProjectId
  private removers: Array<() => void> = []
  private stopped = false
  private ready?: WorkspaceResult

  constructor(private readonly projects: ProjectService, private readonly files: FileSystemService,
    private readonly workspace: CsharpWorkspace, private readonly manager: WorkspaceLanguageManager,
    private readonly commands: WorkspaceCommands, private readonly report: (error: unknown) => void) {}

  start(): void {
    this.removers.push(this.projects.registerTransitionGuard(async () => { await this.invalidate().catch(this.report); return true }))
    this.removers.push(this.projects.subscribe(() => { void this.invalidate().catch(this.report) }))
    this.removers.push(this.files.subscribeStatus((status) => {
      if (status.projectId === this.projectId && status.state === 'UNAVAILABLE') void this.invalidate().catch(this.report)
    }))
    this.removers.push(this.files.subscribe((event) => {
      const watched = this.watched
      if (event.projectId !== this.projectId || !watched) return
      void watched.accept(event).catch((error: unknown) => {
        // Owner/project invalidation deliberately cancels queued watcher work.
        // Keep actual I/O, protocol and cleanup failures observable.
        if (watched !== this.watched && error instanceof LanguageError && error.reason === 'stale-session') return
        this.report(error)
      })
    }))
  }

  ensure(projectId: ProjectId, candidateId?: string): Promise<WorkspaceResult> {
    if (this.stopped) return Promise.reject(new LanguageError('closed'))
    if (this.starting) return this.projectId === projectId && candidateId === undefined
      ? this.starting : Promise.reject(new LanguageError('busy'))
    if (this.manager.state === 'CRASHED') return Promise.reject(new LanguageError('not-running'))
    if (this.documents && this.projectId === projectId && this.ready) return candidateId === undefined
      ? Promise.resolve(this.ready) : Promise.reject(new LanguageError('busy'))
    const project = this.projects.getAuthorizedProject(projectId)
    const generation = this.generation
    const current = () => {
      if (generation !== this.generation || this.stopped || this.projects.getActiveProject()?.id !== projectId
        || this.files.getStatus(projectId).state !== 'AVAILABLE') throw new LanguageError('stale-session')
    }
    const abort = new AbortController()
    this.abort = abort
    this.projectId = projectId
    const startWorkspace = async (): Promise<WorkspaceResult> => {
      await this.cleanup
      current()
      const result = await this.workspace.prepare(project, abort.signal, candidateId)
      current()
      if (result.state !== 'READY') return result
      const adapter = await this.manager.start({ root: project.canonicalRoot, solution: result.solution })
      current()
      const assertSession = () => { current(); if (this.manager.state !== 'RUNNING') throw new LanguageError('stale-session') }
      this.documents = new CsharpDocumentSync(projectId, adapter, this.files, assertSession)
      this.watched = new CsharpWatchedFiles(projectId, project.canonicalRoot, this.files, adapter, this.documents, assertSession)
      await this.watched.initialize()
      current()
      this.ready = result
      return result
    }
    const task = startWorkspace().catch(async (error: unknown) => {
      if (generation === this.generation) {
        ++this.generation; abort.abort(); this.workspace.invalidate()
        this.documents?.invalidate(); this.documents = undefined
        this.watched?.invalidate(); this.watched = undefined
        this.ready = undefined
        this.cleanup = Promise.all([this.manager.stop(), this.commands.stop()]).then(() => {})
        try { await this.cleanup } catch (cleanupError) { this.report(cleanupError) }
      }
      throw error
    })
    this.starting = task
    void task.finally(() => { if (this.starting === task) this.starting = undefined }).catch(() => {})
    return task
  }

  get sync(): CsharpDocumentSync {
    if (!this.documents) throw new LanguageError('not-running')
    return this.documents
  }

  /** Main-frame navigation, owner loss, project invalidation; never React unmount. */
  invalidate(): Promise<void> {
    ++this.generation
    this.abort?.abort(); this.abort = undefined
    this.workspace.invalidate()
    this.documents?.invalidate(); this.documents = undefined
    this.watched?.invalidate(); this.watched = undefined
    this.projectId = undefined
    this.ready = undefined
    const starting = this.starting
    this.cleanup = this.cleanup.catch(() => {}).then(async () => {
      const results = await Promise.allSettled([this.commands.stop(), this.manager.stop()])
      if (starting) { try { await starting } catch { /* The initiating caller receives the failure. */ } }
      if (results.some((result) => result.status === 'rejected')) throw new LanguageError('cleanup-failed')
    })
    return this.cleanup
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const remove of this.removers.splice(0)) remove()
    await this.invalidate()
  }

  beginShutdown(): void { this.stopped = true; void this.invalidate().catch(this.report) }
}
