import type { ProjectId } from '../../../../shared/contracts'
import type { Phase3ProviderId } from './language-provider-contracts'

export type ProviderMarkerOwner = `student-ide.language.${Phase3ProviderId}`

export interface DiagnosticIdentity {
  readonly providerId: Phase3ProviderId
  readonly projectId: ProjectId
  readonly documentUri: string
  readonly modelVersion: number
  readonly projectGeneration: number
  readonly providerGeneration: number
}

export interface NormalizedDiagnosticRange {
  readonly startLineNumber: number
  readonly startColumn: number
  readonly endLineNumber: number
  readonly endColumn: number
}

export interface NormalizedDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'hint'
  readonly message: string
  readonly source: string
  readonly code?: string
  readonly range: NormalizedDiagnosticRange
}

export interface ProviderDiagnosticBatch {
  readonly identity: DiagnosticIdentity
  readonly markerOwner: ProviderMarkerOwner
  readonly diagnostics: readonly NormalizedDiagnostic[]
}

export function markerOwnerForProvider(
  providerId: Phase3ProviderId,
): ProviderMarkerOwner {
  return `student-ide.language.${providerId}`
}

export function createProviderDiagnosticBatch(
  identity: DiagnosticIdentity,
  diagnostics: readonly NormalizedDiagnostic[],
): ProviderDiagnosticBatch {
  return {
    identity,
    markerOwner: markerOwnerForProvider(identity.providerId),
    diagnostics,
  }
}

export function isCurrentDiagnosticBatch(
  batch: ProviderDiagnosticBatch,
  current: DiagnosticIdentity,
): boolean {
  return batch.markerOwner === markerOwnerForProvider(batch.identity.providerId)
    && isCurrentDiagnostic(batch.identity, current)
}

export function isCurrentDiagnostic(
  identity: DiagnosticIdentity,
  current: DiagnosticIdentity,
): boolean {
  return identity.providerId === current.providerId
    && identity.projectId === current.projectId
    && identity.documentUri === current.documentUri
    && identity.modelVersion === current.modelVersion
    && identity.projectGeneration === current.projectGeneration
    && identity.providerGeneration === current.providerGeneration
}
