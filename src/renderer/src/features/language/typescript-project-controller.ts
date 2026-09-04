import type {
  FileApi,
  FileChangedEvent,
  ProjectFileSystemStatus,
  ProjectId,
} from '../../../../shared/contracts'
import type {
  EditorDocumentLifecycleEvent,
  EditorModelManager,
  EditorTextModel,
  MonacoModelHost,
} from '../editor/models/editor-model-manager'
import {
  isCurrentProviderGeneration,
  type LanguageProviderStatus,
  type ProviderGenerationIdentity,
} from './language-provider-contracts'
import {
  ProjectSourceDiscoveryError,
  discoverProjectSourceSnapshot,
} from './project-source-discovery'
import {
  isPhase3cProjectSourcePath,
  PHASE_3C_PROJECT_SOURCE_LIMITS,
  ProjectSourceSnapshotState,
  type ProjectSourceCandidate,
  type ProjectSourceSnapshotLimits,
  type ProjectSourceSnapshotPlan,
  type SnapshotGeneration,
} from './project-source-snapshot'
import { normalizeProjectRelativePath, projectDocumentUri } from './project-uri'

type ProjectSourceFileApi = Pick<FileApi, 'listDirectory' | 'stat' | 'read'>
type ProjectModelHost = MonacoModelHost & Required<Pick<MonacoModelHost, 'getModel'>>

interface LifecycleToken {
  readonly snapshot: SnapshotGeneration
  readonly provider: ProviderGenerationIdentity
}

interface OwnedBackgroundModel {
  readonly relativePath: string
  readonly model: EditorTextModel
}

export interface TypeScriptProjectControllerSnapshot {
  readonly projectId: ProjectId | null
  readonly status: LanguageProviderStatus
  readonly sources: readonly ProjectSourceCandidate[]
  readonly exclusions: ProjectSourceSnapshotPlan['exclusions']
  readonly backgroundPaths: readonly string[]
  readonly error: string | null
}

export class TypeScriptProjectController {
  private readonly snapshotState = new ProjectSourceSnapshotState()
  private readonly listeners = new Set<() => void>()
  private readonly diskSources = new Map<string, ProjectSourceCandidate>()
  private readonly backgroundModels = new Map<string, OwnedBackgroundModel>()
  private providerGeneration = 0
  private status: LanguageProviderStatus = 'STOPPED'
  private exclusions: ProjectSourceSnapshotPlan['exclusions'] = []
  private error: string | null = null
  private operationQueue: Promise<void> = Promise.resolve()
  private pendingFullSync: Promise<boolean> | null = null

  constructor(
    private readonly fileApi: ProjectSourceFileApi,
    private readonly editorModelManager: EditorModelManager,
    private readonly modelHost: ProjectModelHost,
    private readonly limits: ProjectSourceSnapshotLimits = PHASE_3C_PROJECT_SOURCE_LIMITS,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  activateProject(projectId: ProjectId): Promise<boolean> {
    this.pendingFullSync = null
    this.disposeBackgroundModels()
    this.diskSources.clear()
    this.exclusions = []
    this.error = null
    this.providerGeneration += 1
    this.snapshotState.activate(projectId)
    this.setStatus('STARTING')
    return this.synchronizeProject()
  }

  synchronizeProject(): Promise<boolean> {
    if (this.pendingFullSync) return this.pendingFullSync
    const token = this.captureToken()
    if (!token) return Promise.resolve(false)
    const synchronization = this.enqueue(async () => {
      if (!this.isCurrent(token)) return false
      try {
        const plan = await discoverProjectSourceSnapshot(
          this.fileApi,
          token.snapshot.projectId,
          this.limits,
          () => this.isCurrent(token),
        )
        if (!plan || !this.isCurrent(token)) return false
        return this.applyPlan(token, plan)
      } catch (error) {
        this.handleFailure(token, error)
        return false
      }
    })
    this.pendingFullSync = synchronization
    void synchronization.finally(() => {
      if (this.pendingFullSync === synchronization) this.pendingFullSync = null
    })
    return synchronization
  }

  handleFileChanged(event: FileChangedEvent): Promise<boolean> {
    const current = this.snapshotState.capture()
    if (!current || current.projectId !== event.projectId) return Promise.resolve(false)
    if (event.kind === 'renamed') return this.synchronizeProject()
    return this.refreshSource(event.projectId, event.relativePath)
  }

  handleFileSystemStatus(status: ProjectFileSystemStatus): void {
    const current = this.snapshotState.capture()
    if (!current || current.projectId !== status.projectId) return
    if (status.state === 'UNAVAILABLE') {
      this.markUnavailable(status.projectId)
    }
  }

  handleProjectAccessFailure(projectId: ProjectId, error: unknown): void {
    const token = this.captureToken()
    if (!token || token.snapshot.projectId !== projectId) return
    this.handleFailure(token, error)
  }

  handleEditorLifecycle(event: EditorDocumentLifecycleEvent): void {
    const current = this.snapshotState.capture()
    if (!current || current.projectId !== event.projectId) return
    const pathIdentity = identityPath(event.relativePath)
    if (event.type === 'opened' || event.type === 'content-changed') {
      this.backgroundModels.delete(pathIdentity)
      return
    }
    if (event.type === 'saved' || event.type === 'reloaded') {
      if (isPhase3cProjectSourcePath(event.relativePath)) {
        this.diskSources.set(pathIdentity, {
          relativePath: normalizeProjectRelativePath(event.relativePath),
          content: event.content,
        })
      }
      this.backgroundModels.delete(pathIdentity)
      return
    }
    if (event.type === 'renamed') {
      this.removeSource(event.previousRelativePath)
      void this.refreshSource(event.projectId, event.relativePath)
      return
    }
    void this.refreshSource(event.projectId, event.relativePath)
  }

  markUnavailable(projectId: ProjectId): boolean {
    if (!this.snapshotState.markUnavailable(projectId)) return false
    this.providerGeneration += 1
    this.pendingFullSync = null
    this.disposeBackgroundModels()
    this.diskSources.clear()
    this.exclusions = []
    this.error = null
    this.setStatus('STOPPED')
    return true
  }

  closeProject(projectId: ProjectId): boolean {
    if (!this.snapshotState.close(projectId)) return false
    this.providerGeneration += 1
    this.pendingFullSync = null
    this.disposeBackgroundModels()
    this.diskSources.clear()
    this.exclusions = []
    this.error = null
    this.setStatus('STOPPED')
    return true
  }

  dispose(): void {
    this.snapshotState.dispose()
    this.providerGeneration += 1
    this.pendingFullSync = null
    this.disposeBackgroundModels()
    this.diskSources.clear()
    this.exclusions = []
    this.error = null
    this.setStatus('STOPPED')
    this.listeners.clear()
  }

  getSnapshot(): TypeScriptProjectControllerSnapshot {
    return {
      projectId: this.snapshotState.capture()?.projectId ?? null,
      status: this.status,
      sources: [...this.diskSources.values()],
      exclusions: this.exclusions,
      backgroundPaths: [...this.backgroundModels.values()]
        .map(({ relativePath }) => relativePath),
      error: this.error,
    }
  }

  private refreshSource(
    projectId: ProjectId,
    relativePath: string,
  ): Promise<boolean> {
    const token = this.captureToken()
    if (!token || token.snapshot.projectId !== projectId) return Promise.resolve(false)
    const normalizedPath = normalizeProjectRelativePath(relativePath)
    if (!isPhase3cProjectSourcePath(normalizedPath)) return Promise.resolve(false)
    return this.enqueue(async () => {
      if (!this.isCurrent(token)) return false
      try {
        const stat = await this.fileApi.stat(projectId, normalizedPath)
        if (!this.isCurrent(token)) return false
        if (!stat.ok) {
          if (stat.error.code === 'NOT_FOUND') {
            this.removeSource(normalizedPath)
            this.setStatus('RUNNING')
            return true
          }
          throw new ProjectSourceDiscoveryError(stat.error)
        }
        if (
          stat.value.kind !== 'file'
          || stat.value.isSymbolicLink
          || stat.value.size > this.limits.maximumFileBytes
        ) {
          this.removeSource(normalizedPath)
          this.setStatus('RUNNING')
          return true
        }
        const existing = this.diskSources.get(identityPath(normalizedPath))
        const existingBytes = existing ? utf8Bytes(existing.content) : 0
        if (
          (!existing && this.diskSources.size >= this.limits.maximumFiles)
          || this.selectedBytes() - existingBytes + stat.value.size
            > this.limits.maximumTotalBytes
        ) {
          this.removeSource(normalizedPath)
          this.setStatus('RUNNING')
          return true
        }
        const read = await this.fileApi.read(projectId, normalizedPath)
        if (!this.isCurrent(token)) return false
        if (!read.ok) {
          if (read.error.code === 'NOT_FOUND') {
            this.removeSource(normalizedPath)
            this.setStatus('RUNNING')
            return true
          }
          throw new ProjectSourceDiscoveryError(read.error)
        }
        const bytes = utf8Bytes(read.value)
        if (
          bytes > this.limits.maximumFileBytes
          || this.selectedBytes() - existingBytes + bytes
            > this.limits.maximumTotalBytes
        ) {
          this.removeSource(normalizedPath)
          this.setStatus('RUNNING')
          return true
        }
        const source = { relativePath: normalizedPath, content: read.value }
        this.diskSources.set(identityPath(normalizedPath), source)
        this.reconcileSourceModel(source)
        this.error = null
        this.setStatus('RUNNING')
        this.emit()
        return true
      } catch (error) {
        this.handleFailure(token, error)
        return false
      }
    })
  }

  private applyPlan(
    token: LifecycleToken,
    plan: ProjectSourceSnapshotPlan,
  ): boolean {
    const openDocuments = this.editorModelManager.getOpenDocuments()
    if (!this.snapshotState.apply(token.snapshot, plan, openDocuments)) return false
    this.diskSources.clear()
    for (const source of plan.sources) {
      this.diskSources.set(identityPath(source.relativePath), source)
    }
    const desiredBackgrounds = new Set(
      this.snapshotState.getSources().map((source) => identityPath(source.relativePath)),
    )
    for (const [pathIdentity, background] of this.backgroundModels) {
      if (desiredBackgrounds.has(pathIdentity)) continue
      background.model.dispose()
      this.backgroundModels.delete(pathIdentity)
    }
    for (const source of this.snapshotState.getSources()) {
      this.reconcileSourceModel(source)
    }
    this.exclusions = plan.exclusions
    this.error = null
    this.setStatus('RUNNING')
    this.emit()
    return true
  }

  private reconcileSourceModel(source: ProjectSourceCandidate): void {
    const current = this.snapshotState.capture()
    if (!current) return
    const pathIdentity = identityPath(source.relativePath)
    if (this.editorModelManager.findDocument(current.projectId, source.relativePath)) {
      this.backgroundModels.delete(pathIdentity)
      return
    }
    const uri = projectDocumentUri(current.projectId, source.relativePath)
    const tracked = this.backgroundModels.get(pathIdentity)
    const model = tracked?.model ?? this.modelHost.getModel(uri)
      ?? this.modelHost.createModel(
        source.content,
        languageIdForProjectSource(source.relativePath),
        uri,
      )
    if (model.getValue() !== source.content) model.setValue(source.content)
    this.backgroundModels.set(pathIdentity, {
      relativePath: normalizeProjectRelativePath(source.relativePath),
      model,
    })
  }

  private removeSource(relativePath: string): void {
    const pathIdentity = identityPath(relativePath)
    this.diskSources.delete(pathIdentity)
    const background = this.backgroundModels.get(pathIdentity)
    if (background) background.model.dispose()
    this.backgroundModels.delete(pathIdentity)
    this.emit()
  }

  private selectedBytes(): number {
    let total = 0
    for (const source of this.diskSources.values()) total += utf8Bytes(source.content)
    return total
  }

  private captureToken(): LifecycleToken | null {
    const snapshot = this.snapshotState.capture()
    if (!snapshot) return null
    return {
      snapshot,
      provider: {
        providerId: 'monaco-typescript',
        projectId: snapshot.projectId,
        generation: this.providerGeneration,
      },
    }
  }

  private isCurrent(token: LifecycleToken): boolean {
    const snapshot = this.snapshotState.capture()
    if (
      !snapshot
      || snapshot.projectId !== token.snapshot.projectId
      || snapshot.generation !== token.snapshot.generation
    ) return false
    return isCurrentProviderGeneration(token.provider, {
      providerId: 'monaco-typescript',
      projectId: snapshot.projectId,
      generation: this.providerGeneration,
    })
  }

  private handleFailure(token: LifecycleToken, error: unknown): void {
    if (!this.isCurrent(token)) return
    this.error = error instanceof ProjectSourceDiscoveryError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'JavaScript/TypeScript project synchronization failed.'
    this.setStatus('CRASHED')
  }

  private setStatus(status: LanguageProviderStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit()
  }

  private disposeBackgroundModels(): void {
    for (const { model } of this.backgroundModels.values()) model.dispose()
    this.backgroundModels.clear()
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation)
    this.operationQueue = next.then(() => undefined, () => undefined)
    return next
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function identityPath(relativePath: string): string {
  return normalizeProjectRelativePath(relativePath).toLocaleLowerCase('en-US')
}

function languageIdForProjectSource(relativePath: string): 'javascript' | 'typescript' {
  const extension = normalizeProjectRelativePath(relativePath)
    .split('.')
    .at(-1)
    ?.toLowerCase()
  return extension === 'ts' || extension === 'tsx' ? 'typescript' : 'javascript'
}

function utf8Bytes(content: string): number {
  return new TextEncoder().encode(content).byteLength
}
