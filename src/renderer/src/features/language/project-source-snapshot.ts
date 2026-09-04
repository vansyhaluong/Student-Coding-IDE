import type { ProjectId } from '../../../../shared/contracts'
import { phase3LanguageIdForPath } from './language-capabilities'
import type { Phase3ProviderId } from './language-provider-contracts'
import { normalizeProjectRelativePath, projectDocumentUri } from './project-uri'

export interface ProjectSourceCandidate {
  readonly relativePath: string
  readonly content: string
}

export interface ProjectSourceSnapshotLimits {
  readonly maximumFiles: number
  readonly maximumTotalBytes: number
  readonly maximumFileBytes: number
}

export const PHASE_3C_PROJECT_SOURCE_LIMITS: ProjectSourceSnapshotLimits = {
  maximumFiles: 500,
  maximumTotalBytes: 5 * 1024 * 1024,
  maximumFileBytes: 256 * 1024,
}

export type SnapshotExclusionReason =
  | 'unsupported-language'
  | 'node-modules'
  | 'file-too-large'
  | 'file-count-limit'
  | 'total-byte-limit'

export interface ProjectSourceSnapshotPlan {
  readonly sources: readonly ProjectSourceCandidate[]
  readonly exclusions: ReadonlyArray<{
    relativePath: string
    reason: SnapshotExclusionReason
  }>
  readonly measuredFiles: number
  readonly measuredBytes: number
  readonly selectedBytes: number
}

const snapshotProviderId: Phase3ProviderId = 'monaco-typescript'

export function isPhase3cProjectSourcePath(relativePath: string): boolean {
  const normalized = normalizeProjectRelativePath(relativePath)
  const extension = normalized.split('.').at(-1)?.toLowerCase()
  return extension === 'js'
    || extension === 'jsx'
    || extension === 'ts'
    || extension === 'tsx'
}

export function planProjectSourceSnapshot(
  candidates: readonly ProjectSourceCandidate[],
  limits: ProjectSourceSnapshotLimits,
): ProjectSourceSnapshotPlan {
  assertPositiveLimits(limits)
  const sources: ProjectSourceCandidate[] = []
  const exclusions: Array<{ relativePath: string; reason: SnapshotExclusionReason }> = []
  let measuredBytes = 0
  let selectedBytes = 0

  for (const candidate of candidates) {
    const relativePath = normalizeProjectRelativePath(candidate.relativePath)
    const bytes = new TextEncoder().encode(candidate.content).byteLength
    measuredBytes += bytes
    let reason: SnapshotExclusionReason | null = null
    if (relativePath.split('/').some((part) => part.toLowerCase() === 'node_modules')) {
      reason = 'node-modules'
    } else if (!isPhase3cProjectSourcePath(relativePath)) {
      reason = 'unsupported-language'
    } else if (bytes > limits.maximumFileBytes) {
      reason = 'file-too-large'
    } else if (sources.length >= limits.maximumFiles) {
      reason = 'file-count-limit'
    } else if (selectedBytes + bytes > limits.maximumTotalBytes) {
      reason = 'total-byte-limit'
    }
    if (reason) {
      exclusions.push({ relativePath, reason })
      continue
    }
    sources.push({ relativePath, content: candidate.content })
    selectedBytes += bytes
  }

  return {
    sources,
    exclusions,
    measuredFiles: candidates.length,
    measuredBytes,
    selectedBytes,
  }
}

export interface SnapshotGeneration {
  readonly projectId: ProjectId
  readonly generation: number
}

export interface OpenProjectDocument {
  readonly projectId: ProjectId
  readonly relativePath: string
  readonly dirty: boolean
}

export interface SynchronizedProjectSource extends ProjectSourceCandidate {
  readonly uri: string
  readonly languageId: 'javascript' | 'typescript'
}

export class ProjectSourceSnapshotState {
  private projectId: ProjectId | null = null
  private generation = 0
  private available = false
  private sources = new Map<string, SynchronizedProjectSource>()

  constructor(
    private readonly clearProjectDiagnostics: (
      providerId: Phase3ProviderId,
      projectId: ProjectId,
    ) => void
      = () => undefined,
  ) {}

  activate(projectId: ProjectId): SnapshotGeneration {
    this.invalidate()
    this.projectId = projectId
    this.available = true
    return this.capture()!
  }

  capture(): SnapshotGeneration | null {
    return this.projectId
      ? { projectId: this.projectId, generation: this.generation }
      : null
  }

  apply(
    request: SnapshotGeneration,
    plan: ProjectSourceSnapshotPlan,
    openDocuments: readonly OpenProjectDocument[],
  ): boolean {
    if (!this.available || !this.isCurrent(request)) return false
    const openPaths = new Set(openDocuments
      .filter((document) => document.projectId === request.projectId)
      .map((document) => normalizeIdentityPath(document.relativePath)))
    const next = new Map<string, SynchronizedProjectSource>()
    for (const source of plan.sources) {
      const pathIdentity = normalizeIdentityPath(source.relativePath)
      if (openPaths.has(pathIdentity)) continue
      const languageId = phase3LanguageIdForPath(source.relativePath)
      if (languageId !== 'javascript' && languageId !== 'typescript') continue
      next.set(pathIdentity, {
        ...source,
        uri: projectDocumentUri(request.projectId, source.relativePath),
        languageId,
      })
    }
    this.sources = next
    return true
  }

  markUnavailable(projectId: ProjectId): boolean {
    if (this.projectId !== projectId) return false
    this.available = false
    this.generation += 1
    this.sources.clear()
    this.clearProjectDiagnostics(snapshotProviderId, projectId)
    return true
  }

  close(projectId: ProjectId): boolean {
    if (this.projectId !== projectId) return false
    this.invalidate()
    this.projectId = null
    this.available = false
    return true
  }

  dispose(): void {
    this.invalidate()
    this.projectId = null
    this.available = false
  }

  getSources(): readonly SynchronizedProjectSource[] {
    return [...this.sources.values()]
  }

  private isCurrent(request: SnapshotGeneration): boolean {
    return request.projectId === this.projectId
      && request.generation === this.generation
  }

  private invalidate(): void {
    if (this.projectId) {
      this.clearProjectDiagnostics(snapshotProviderId, this.projectId)
    }
    this.generation += 1
    this.sources.clear()
  }
}

function normalizeIdentityPath(relativePath: string): string {
  return normalizeProjectRelativePath(relativePath).toLocaleLowerCase('en-US')
}

function assertPositiveLimits(limits: ProjectSourceSnapshotLimits): void {
  for (const value of [
    limits.maximumFiles,
    limits.maximumTotalBytes,
    limits.maximumFileBytes,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Snapshot limits must be positive safe integers.')
    }
  }
}
