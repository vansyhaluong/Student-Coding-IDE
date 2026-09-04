import type { editor, Uri } from 'monaco-editor'

import type { ProjectId } from '../../../../shared/contracts'
import {
  createProviderDiagnosticBatch,
  type NormalizedDiagnostic,
} from '../language/diagnostic-identity'
import type { Phase3ProviderId } from '../language/language-provider-contracts'
import { parseProjectDocumentUri } from '../language/project-uri'
import type { ProblemsStore } from './problems-store'

export interface MonacoDiagnosticsHost {
  onDidChangeMarkers(listener: (uris: readonly Uri[]) => void): { dispose(): void }
  getModel(uri: Uri): editor.ITextModel | null
  getModels(): editor.ITextModel[]
  getModelMarkers(filter: { owner?: string; resource?: Uri }): editor.IMarker[]
}

const providerByMarkerOwner: Readonly<Record<string, Phase3ProviderId | undefined>> = {
  javascript: 'monaco-typescript',
  typescript: 'monaco-typescript',
  css: 'monaco-css',
  json: 'monaco-json',
}

export class MonacoDiagnosticsController {
  private readonly markerSubscription: { dispose(): void }
  private activeProjectId: ProjectId | null = null

  constructor(
    private readonly host: MonacoDiagnosticsHost,
    private readonly store: ProblemsStore,
  ) {
    this.markerSubscription = host.onDidChangeMarkers((uris) => {
      for (const uri of uris) this.refreshUri(uri)
    })
  }

  activateProject(projectId: ProjectId): void {
    this.activeProjectId = projectId
    this.store.activateProject(projectId)
    for (const model of this.host.getModels()) this.refreshUri(model.uri)
  }

  closeProject(projectId: ProjectId): void {
    if (this.activeProjectId !== projectId) return
    this.activeProjectId = null
    this.store.closeProject(projectId)
  }

  markProjectUnavailable(projectId: ProjectId): void {
    if (this.activeProjectId !== projectId) return
    this.store.markProjectUnavailable(projectId)
  }

  disposeProvider(providerId: Phase3ProviderId): void {
    this.store.disposeProvider(providerId)
  }

  dispose(): void {
    this.activeProjectId = null
    this.markerSubscription.dispose()
    this.store.dispose()
  }

  private refreshUri(uri: Uri): void {
    const identity = parseProjectDocumentUri(uri.toString())
    if (!identity || identity.projectId !== this.activeProjectId) return
    const model = this.host.getModel(uri)
    if (!model) {
      this.store.clearDocument(identity.projectId, uri.toString())
      return
    }
    const owner = model.getLanguageId()
    const providerId = providerByMarkerOwner[owner]
    if (!providerId) return
    const modelVersion = model.getVersionId()
    const diagnosticIdentity = this.store.captureIdentity(
      providerId,
      uri.toString(),
      modelVersion,
    )
    if (!diagnosticIdentity) return
    const diagnostics = this.host.getModelMarkers({ owner, resource: uri })
      .filter((marker) => (
        marker.modelVersionId === undefined || marker.modelVersionId === modelVersion
      ))
      .map(normalizeMarker)
    this.store.replace(
      identity.relativePath,
      createProviderDiagnosticBatch(diagnosticIdentity, diagnostics),
    )
  }
}

function normalizeMarker(marker: editor.IMarker): NormalizedDiagnostic {
  return {
    severity: normalizeSeverity(marker.severity),
    message: marker.message,
    source: marker.source ?? marker.owner,
    code: typeof marker.code === 'string' ? marker.code : marker.code?.value,
    range: {
      startLineNumber: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLineNumber: marker.endLineNumber,
      endColumn: marker.endColumn,
    },
  }
}

function normalizeSeverity(severity: number): NormalizedDiagnostic['severity'] {
  if (severity === 8) return 'error'
  if (severity === 4) return 'warning'
  if (severity === 2) return 'info'
  return 'hint'
}
