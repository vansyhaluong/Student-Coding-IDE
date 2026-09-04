import type { ProjectId } from '../../../../shared/contracts'
import type {
  NormalizedDiagnostic,
  ProviderDiagnosticBatch,
} from '../language/diagnostic-identity'
import type { Phase3ProviderId } from '../language/language-provider-contracts'

export interface ProblemItem extends NormalizedDiagnostic {
  readonly id: string
  readonly projectId: ProjectId
  readonly relativePath: string
  readonly documentUri: string
  readonly providerId: Phase3ProviderId
}

export interface ProblemFileGroup {
  readonly relativePath: string
  readonly fileName: string
  readonly problems: readonly ProblemItem[]
}

export interface ProblemsSnapshot {
  readonly projectId: ProjectId | null
  readonly projectGeneration: number
  readonly problems: readonly ProblemItem[]
  readonly groups: readonly ProblemFileGroup[]
  readonly errorCount: number
  readonly warningCount: number
  readonly totalCount: number
}

interface ProviderFileDiagnostics {
  readonly documentUri: string
  readonly relativePath: string
  readonly problems: readonly ProblemItem[]
}

const providers: readonly Phase3ProviderId[] = [
  'monaco-typescript',
  'monaco-css',
  'monaco-json',
]

export class ProblemsStore {
  private readonly listeners = new Set<() => void>()
  private readonly providerGenerations = new Map<Phase3ProviderId, number>()
  private readonly diagnostics = new Map<string, ProviderFileDiagnostics>()
  private projectId: ProjectId | null = null
  private projectGeneration = 0
  private snapshot = emptySnapshot(null, 0)

  constructor() {
    for (const providerId of providers) this.providerGenerations.set(providerId, 0)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): ProblemsSnapshot {
    return this.snapshot
  }

  activateProject(projectId: ProjectId): void {
    this.projectGeneration += 1
    this.projectId = projectId
    this.diagnostics.clear()
    for (const providerId of providers) this.incrementProviderGeneration(providerId)
    this.publish()
  }

  closeProject(projectId: ProjectId): void {
    if (this.projectId !== projectId) return
    this.projectGeneration += 1
    this.projectId = null
    this.diagnostics.clear()
    for (const providerId of providers) this.incrementProviderGeneration(providerId)
    this.publish()
  }

  markProjectUnavailable(projectId: ProjectId): void {
    if (this.projectId !== projectId) return
    this.projectGeneration += 1
    this.diagnostics.clear()
    for (const providerId of providers) this.incrementProviderGeneration(providerId)
    this.publish()
  }

  captureIdentity(
    providerId: Phase3ProviderId,
    documentUri: string,
    modelVersion: number,
  ): ProviderDiagnosticBatch['identity'] | null {
    if (!this.projectId || !providers.includes(providerId)) return null
    return {
      providerId,
      projectId: this.projectId,
      documentUri,
      modelVersion,
      projectGeneration: this.projectGeneration,
      providerGeneration: this.providerGenerations.get(providerId) ?? 0,
    }
  }

  replace(relativePath: string, batch: ProviderDiagnosticBatch): boolean {
    if (!this.isCurrent(batch)) return false
    const key = scopeKey(batch.identity.providerId, batch.identity.documentUri)
    const unique = new Map<string, ProblemItem>()
    for (const diagnostic of batch.diagnostics) {
      const item: ProblemItem = {
        ...diagnostic,
        id: problemId(batch.identity.providerId, relativePath, diagnostic),
        projectId: batch.identity.projectId,
        relativePath,
        documentUri: batch.identity.documentUri,
        providerId: batch.identity.providerId,
      }
      unique.set(item.id, item)
    }
    if (unique.size === 0) this.diagnostics.delete(key)
    else {
      this.diagnostics.set(key, {
        documentUri: batch.identity.documentUri,
        relativePath,
        problems: [...unique.values()],
      })
    }
    this.publish()
    return true
  }

  clearDocument(projectId: ProjectId, documentUri: string): void {
    if (this.projectId !== projectId) return
    let changed = false
    for (const [key, entry] of this.diagnostics) {
      if (entry.documentUri !== documentUri) continue
      this.diagnostics.delete(key)
      changed = true
    }
    if (changed) this.publish()
  }

  disposeProvider(providerId: Phase3ProviderId): void {
    this.incrementProviderGeneration(providerId)
    let changed = false
    for (const key of this.diagnostics.keys()) {
      if (!key.startsWith(`${providerId}\n`)) continue
      this.diagnostics.delete(key)
      changed = true
    }
    if (changed) this.publish()
  }

  dispose(): void {
    this.projectGeneration += 1
    this.projectId = null
    this.diagnostics.clear()
    for (const providerId of providers) this.incrementProviderGeneration(providerId)
    this.publish()
    this.listeners.clear()
  }

  private isCurrent(batch: ProviderDiagnosticBatch): boolean {
    return providers.includes(batch.identity.providerId)
      && batch.identity.projectId === this.projectId
      && batch.identity.projectGeneration === this.projectGeneration
      && batch.identity.providerGeneration
        === (this.providerGenerations.get(batch.identity.providerId) ?? -1)
  }

  private incrementProviderGeneration(providerId: Phase3ProviderId): void {
    this.providerGenerations.set(
      providerId,
      (this.providerGenerations.get(providerId) ?? 0) + 1,
    )
  }

  private publish(): void {
    const problems = [...this.diagnostics.values()]
      .flatMap((entry) => entry.problems)
      .sort(compareProblems)
    const grouped = new Map<string, ProblemItem[]>()
    for (const problem of problems) {
      const group = grouped.get(problem.relativePath) ?? []
      group.push(problem)
      grouped.set(problem.relativePath, group)
    }
    this.snapshot = {
      projectId: this.projectId,
      projectGeneration: this.projectGeneration,
      problems,
      groups: [...grouped.entries()].map(([relativePath, groupProblems]) => ({
        relativePath,
        fileName: relativePath.split('/').at(-1) ?? relativePath,
        problems: groupProblems,
      })),
      errorCount: problems.filter(({ severity }) => severity === 'error').length,
      warningCount: problems.filter(({ severity }) => severity === 'warning').length,
      totalCount: problems.length,
    }
    for (const listener of this.listeners) listener()
  }
}

function emptySnapshot(projectId: ProjectId | null, projectGeneration: number): ProblemsSnapshot {
  return {
    projectId,
    projectGeneration,
    problems: [],
    groups: [],
    errorCount: 0,
    warningCount: 0,
    totalCount: 0,
  }
}

function scopeKey(providerId: Phase3ProviderId, documentUri: string): string {
  return `${providerId}\n${documentUri}`
}

function problemId(
  providerId: Phase3ProviderId,
  relativePath: string,
  diagnostic: NormalizedDiagnostic,
): string {
  const { range } = diagnostic
  return [
    providerId,
    relativePath.toLocaleLowerCase('en-US'),
    diagnostic.severity,
    diagnostic.source,
    diagnostic.code ?? '',
    range.startLineNumber,
    range.startColumn,
    range.endLineNumber,
    range.endColumn,
    diagnostic.message,
  ].join('\u0000')
}

function compareProblems(left: ProblemItem, right: ProblemItem): number {
  return left.relativePath.localeCompare(right.relativePath, 'en-US', { sensitivity: 'base' })
    || left.range.startLineNumber - right.range.startLineNumber
    || left.range.startColumn - right.range.startColumn
    || left.range.endLineNumber - right.range.endLineNumber
    || left.range.endColumn - right.range.endColumn
    || left.message.localeCompare(right.message, 'en-US')
    || left.providerId.localeCompare(right.providerId, 'en-US')
}
