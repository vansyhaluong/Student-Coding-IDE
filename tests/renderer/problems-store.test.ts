import { describe, expect, it, vi } from 'vitest'

import {
  createProviderDiagnosticBatch,
  type NormalizedDiagnostic,
} from '../../src/renderer/src/features/language/diagnostic-identity'
import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import { MonacoDiagnosticsController } from '../../src/renderer/src/features/problems/monaco-diagnostics-controller'
import { ProblemsStore } from '../../src/renderer/src/features/problems/problems-store'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProjectId = 'project_abcdef1234567890abcdef12' as ProjectId

describe('Phase 3E Problems aggregation', () => {
  it('aggregates JS, TS, CSS, and JSON by file with preserved severity and deterministic range order', () => {
    const store = new ProblemsStore()
    store.activateProject(projectId)
    replace(store, 'monaco-json', 'config.json', [diagnostic('warning', 4, 2, 'JSON warning')])
    replace(store, 'monaco-typescript', 'src/z.ts', [diagnostic('error', 7, 1, 'TS error')])
    replace(store, 'monaco-typescript', 'src/a.js', [
      diagnostic('info', 3, 8, 'Later JS information'),
      diagnostic('warning', 3, 2, 'Earlier JS warning'),
    ])
    replace(store, 'monaco-css', 'styles.css', [diagnostic('error', 2, 4, 'CSS error')])

    const snapshot = store.getSnapshot()
    expect(snapshot.groups.map((group) => group.relativePath)).toEqual([
      'config.json', 'src/a.js', 'src/z.ts', 'styles.css',
    ])
    expect(snapshot.groups[1]?.problems.map((problem) => [
      problem.severity,
      problem.range.startColumn,
    ])).toEqual([['warning', 2], ['info', 8]])
    expect(snapshot.errorCount).toBe(2)
    expect(snapshot.warningCount).toBe(2)
    expect(snapshot.totalCount).toBe(5)
  })

  it('deduplicates a batch, replaces the provider/file scope, and clears with an empty batch', () => {
    const store = new ProblemsStore()
    store.activateProject(projectId)
    const repeated = diagnostic('error', 1, 1, 'Repeated')
    replace(store, 'monaco-typescript', 'main.ts', [repeated, repeated])
    expect(store.getSnapshot().totalCount).toBe(1)

    replace(store, 'monaco-typescript', 'main.ts', [diagnostic('warning', 2, 3, 'Replacement')])
    expect(store.getSnapshot().problems).toMatchObject([{
      message: 'Replacement', severity: 'warning',
    }])

    replace(store, 'monaco-typescript', 'main.ts', [])
    expect(store.getSnapshot().totalCount).toBe(0)
  })

  it('rejects stale project/provider generations and clears switch, close, and provider disposal', () => {
    const store = new ProblemsStore()
    store.activateProject(projectId)
    const uri = projectDocumentUri(projectId, 'main.ts')
    const oldIdentity = store.captureIdentity('monaco-typescript', uri, 1)!
    replace(store, 'monaco-typescript', 'main.ts', [diagnostic('error', 1, 1, 'Old')])

    store.disposeProvider('monaco-typescript')
    expect(store.getSnapshot().totalCount).toBe(0)
    expect(store.replace('main.ts', createProviderDiagnosticBatch(oldIdentity, [
      diagnostic('error', 1, 1, 'Stale provider'),
    ]))).toBe(false)

    const projectIdentity = store.captureIdentity('monaco-css', projectDocumentUri(projectId, 'a.css'), 1)!
    store.activateProject(nextProjectId)
    expect(store.replace('a.css', createProviderDiagnosticBatch(projectIdentity, [
      diagnostic('error', 1, 1, 'Stale project'),
    ]))).toBe(false)
    expect(store.getSnapshot().projectId).toBe(nextProjectId)
    store.closeProject(nextProjectId)
    expect(store.getSnapshot()).toMatchObject({ projectId: null, totalCount: 0 })
  })

  it('clears current Problems when project filesystem authority becomes unavailable', () => {
    const store = new ProblemsStore()
    store.activateProject(projectId)
    replace(store, 'monaco-json', 'config.json', [diagnostic('error', 1, 1, 'Invalid JSON')])
    store.markProjectUnavailable(projectId)
    expect(store.getSnapshot()).toMatchObject({ projectId, totalCount: 0 })
  })

  it('has no diagnostic contributor for HTML or syntax-only/deferred languages', () => {
    const store = new ProblemsStore()
    store.activateProject(projectId)
    expect(store.captureIdentity('monaco-html', projectDocumentUri(projectId, 'index.html'), 1)).toBeNull()
    expect(store.getSnapshot().totalCount).toBe(0)
  })
})

describe('Phase 3E Monaco marker lifecycle', () => {
  it('normalizes current supported markers and removes disposed-model diagnostics', () => {
    const uri = fakeUri(projectDocumentUri(projectId, 'src/main.ts'))
    const model = {
      uri,
      getLanguageId: () => 'typescript',
      getVersionId: () => 4,
    }
    let markerListener: ((uris: readonly typeof uri[]) => void) | null = null
    const disposeMarkerSubscription = vi.fn()
    let currentModel: typeof model | null = model
    let markers = [{
      owner: 'typescript', resource: uri, severity: 8, message: 'Type error', source: 'ts',
      startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 7,
      modelVersionId: 4,
    }]
    const host = {
      onDidChangeMarkers: vi.fn((listener) => {
        markerListener = listener
        return { dispose: disposeMarkerSubscription }
      }),
      getModel: vi.fn(() => currentModel),
      getModels: vi.fn(() => currentModel ? [currentModel] : []),
      getModelMarkers: vi.fn(() => markers),
    }
    const store = new ProblemsStore()
    const controller = new MonacoDiagnosticsController(host as never, store)
    controller.activateProject(projectId)
    expect(store.getSnapshot().problems).toMatchObject([{
      providerId: 'monaco-typescript', severity: 'error', source: 'ts', message: 'Type error',
    }])

    markers = []
    markerListener!([uri])
    expect(store.getSnapshot().totalCount).toBe(0)
    markers = [{
      owner: 'typescript', resource: uri, severity: 8, message: 'Stale', source: 'ts',
      startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2,
      modelVersionId: 3,
    }]
    markerListener!([uri])
    expect(store.getSnapshot().totalCount).toBe(0)

    currentModel = model
    markers[0]!.modelVersionId = 4
    markerListener!([uri])
    expect(store.getSnapshot().totalCount).toBe(1)
    currentModel = null
    markerListener!([uri])
    expect(store.getSnapshot().totalCount).toBe(0)

    currentModel = model
    markerListener!([uri])
    expect(store.getSnapshot().totalCount).toBe(1)
    controller.dispose()
    expect(disposeMarkerSubscription).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({ projectId: null, totalCount: 0 })
  })

  it('does not accumulate marker listeners or diagnostics across repeated controller cycles', () => {
    const uri = fakeUri(projectDocumentUri(projectId, 'src/main.ts'))
    const model = {
      uri,
      getLanguageId: () => 'typescript',
      getVersionId: () => 1,
    }
    const listeners = new Set<(uris: readonly typeof uri[]) => void>()
    const host = {
      onDidChangeMarkers: vi.fn((listener) => {
        listeners.add(listener)
        return { dispose: () => listeners.delete(listener) }
      }),
      getModel: vi.fn(() => model),
      getModels: vi.fn(() => [model]),
      getModelMarkers: vi.fn(() => [{
        owner: 'typescript', resource: uri, severity: 8, message: 'Type error',
        startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2,
        modelVersionId: 1,
      }]),
    }
    const store = new ProblemsStore()

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const controller = new MonacoDiagnosticsController(host as never, store)
      controller.activateProject(projectId)
      expect(listeners.size).toBe(1)
      expect(store.getSnapshot().totalCount).toBe(1)
      controller.dispose()
      expect(listeners.size).toBe(0)
      expect(store.getSnapshot()).toMatchObject({ projectId: null, totalCount: 0 })
    }
  })
})

function replace(
  store: ProblemsStore,
  providerId: 'monaco-typescript' | 'monaco-css' | 'monaco-json',
  relativePath: string,
  diagnostics: readonly NormalizedDiagnostic[],
): void {
  const uri = projectDocumentUri(projectId, relativePath)
  const identity = store.captureIdentity(providerId, uri, 1)
  expect(identity).not.toBeNull()
  expect(store.replace(relativePath, createProviderDiagnosticBatch(identity!, diagnostics))).toBe(true)
}

function diagnostic(
  severity: NormalizedDiagnostic['severity'],
  line: number,
  column: number,
  message: string,
): NormalizedDiagnostic {
  return {
    severity,
    message,
    source: 'test-provider',
    range: {
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 1,
    },
  }
}

function fakeUri(value: string) {
  return { toString: () => value }
}
