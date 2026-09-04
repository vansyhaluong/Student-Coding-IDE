import { describe, expect, it, vi } from 'vitest'

import {
  createProviderDiagnosticBatch,
  isCurrentDiagnostic,
  isCurrentDiagnosticBatch,
  markerOwnerForProvider,
  type DiagnosticIdentity,
} from '../../src/renderer/src/features/language/diagnostic-identity'
import {
  phase3LanguageCapabilities,
  phase3LanguageIdForPath,
} from '../../src/renderer/src/features/language/language-capabilities'
import {
  isCurrentProviderGeneration,
  languageProviderStatuses,
  phase3ProviderContracts,
} from '../../src/renderer/src/features/language/language-provider-contracts'
import {
  planProjectSourceSnapshot,
  ProjectSourceSnapshotState,
} from '../../src/renderer/src/features/language/project-source-snapshot'
import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import { workerKindForLabel } from '../../src/renderer/src/features/language/worker-routing'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const limits = {
  maximumFiles: 100,
  maximumTotalBytes: 1024 * 1024,
  maximumFileBytes: 128 * 1024,
}

describe('Phase 3 language foundation', () => {
  it('routes every Monaco worker label to a locally owned worker kind', () => {
    expect(workerKindForLabel('typescript')).toBe('typescript')
    expect(workerKindForLabel('javascript')).toBe('typescript')
    expect(workerKindForLabel('html')).toBe('html')
    expect(workerKindForLabel('css')).toBe('css')
    expect(workerKindForLabel('json')).toBe('json')
    expect(workerKindForLabel('unknown')).toBe('editor')
  })

  it('publishes only the approved capability matrix', () => {
    expect(phase3LanguageCapabilities.javascript.capabilities).toEqual({
      syntax: true,
      completion: true,
      diagnostics: true,
      hover: true,
      signatureHelp: true,
      definition: true,
    })
    expect(phase3LanguageCapabilities.typescript.capabilities)
      .toEqual(phase3LanguageCapabilities.javascript.capabilities)
    for (const language of ['html', 'css', 'json'] as const) {
      expect(phase3LanguageCapabilities[language].capabilities).toMatchObject({
        syntax: true,
        completion: true,
        diagnostics: true,
        hover: true,
        signatureHelp: false,
        definition: false,
      })
    }
    for (const language of ['csharp', 'php'] as const) {
      expect(phase3LanguageCapabilities[language].provider).toBe('monaco-tokenization')
      expect(phase3LanguageCapabilities[language].capabilities).toMatchObject({
        syntax: true,
        completion: false,
        diagnostics: false,
      })
    }
    expect(phase3LanguageCapabilities.python.scope).toBe('deferred')
    expect(phase3LanguageCapabilities.java.scope).toBe('deferred')
  })

  it('keeps every current intelligence provider renderer-owned and Monaco-native', () => {
    expect(phase3ProviderContracts).toEqual({
      'monaco-typescript': {
        providerId: 'monaco-typescript',
        languages: ['javascript', 'typescript'],
        execution: 'renderer-monaco-worker',
        projectAware: true,
      },
      'monaco-html': {
        providerId: 'monaco-html',
        languages: ['html'],
        execution: 'renderer-monaco-worker',
        projectAware: false,
      },
      'monaco-css': {
        providerId: 'monaco-css',
        languages: ['css'],
        execution: 'renderer-monaco-worker',
        projectAware: false,
      },
      'monaco-json': {
        providerId: 'monaco-json',
        languages: ['json'],
        execution: 'renderer-monaco-worker',
        projectAware: false,
      },
    })
    expect(languageProviderStatuses).toEqual([
      'NOT_CONFIGURED',
      'MISSING',
      'STARTING',
      'RUNNING',
      'STOPPED',
      'CRASHED',
      'INVALID_CONFIGURATION',
    ])
  })

  it('maps every current Phase 3 acceptance extension', () => {
    expect(phase3LanguageIdForPath('src/a.js')).toBe('javascript')
    expect(phase3LanguageIdForPath('src/a.jsx')).toBe('javascript')
    expect(phase3LanguageIdForPath('src/a.mjs')).toBe('javascript')
    expect(phase3LanguageIdForPath('src/a.cjs')).toBe('javascript')
    expect(phase3LanguageIdForPath('src/a.ts')).toBe('typescript')
    expect(phase3LanguageIdForPath('src/a.tsx')).toBe('typescript')
    expect(phase3LanguageIdForPath('index.htm')).toBe('html')
    expect(phase3LanguageIdForPath('style.css')).toBe('css')
    expect(phase3LanguageIdForPath('data.json')).toBe('json')
    expect(phase3LanguageIdForPath('Program.cs')).toBe('csharp')
    expect(phase3LanguageIdForPath('index.php')).toBe('php')
  })

  it('creates stable project-scoped URIs without canonical filesystem roots', () => {
    const uri = projectDocumentUri(projectId, 'src/My File.ts')
    expect(uri).toBe(
      'student-ide://project/project_1234567890abcdef12345678/src/My%20File.ts',
    )
    expect(uri).not.toMatch(/[A-Z]:\\|file:\/\//i)
    expect(() => projectDocumentUri(projectId, '../outside.ts')).toThrow()
    expect(() => projectDocumentUri(projectId, 'C:\\secret.ts')).toThrow()
  })

  it('bounds project sources and excludes node_modules and non-JS/TS files', () => {
    const plan = planProjectSourceSnapshot([
      { relativePath: 'src/a.ts', content: 'export const a = 1' },
      { relativePath: 'src/b.js', content: 'export const b = 2' },
      { relativePath: 'node_modules/pkg/index.d.ts', content: 'export {}' },
      { relativePath: 'src/style.css', content: '.a {}' },
      { relativePath: 'src/huge.ts', content: 'x'.repeat(128 * 1024 + 1) },
    ], limits)

    expect(plan.sources.map((source) => source.relativePath)).toEqual([
      'src/a.ts',
      'src/b.js',
    ])
    expect(plan.exclusions).toEqual(expect.arrayContaining([
      { relativePath: 'node_modules/pkg/index.d.ts', reason: 'node-modules' },
      { relativePath: 'src/style.css', reason: 'unsupported-language' },
      { relativePath: 'src/huge.ts', reason: 'file-too-large' },
    ]))
    expect(plan.measuredFiles).toBe(5)
    expect(plan.selectedBytes).toBeGreaterThan(0)
  })

  it('gives open dirty models precedence over background snapshot content', () => {
    const state = new ProjectSourceSnapshotState()
    const request = state.activate(projectId)
    const plan = planProjectSourceSnapshot([
      { relativePath: 'src/open.ts', content: 'disk content' },
      { relativePath: 'src/background.ts', content: 'background content' },
    ], limits)

    expect(state.apply(request, plan, [{
      projectId,
      relativePath: 'SRC/open.ts',
      dirty: true,
    }])).toBe(true)
    expect(state.getSources().map((source) => source.relativePath))
      .toEqual(['src/background.ts'])
  })

  it('cleans project state and rejects stale generations on switch and close', () => {
    const state = new ProjectSourceSnapshotState()
    const stale = state.activate(projectId)
    const plan = planProjectSourceSnapshot([
      { relativePath: 'a.ts', content: 'export {}' },
    ], limits)
    expect(state.apply(stale, plan, [])).toBe(true)

    const current = state.activate(nextProjectId)
    expect(state.getSources()).toEqual([])
    expect(state.apply(stale, plan, [])).toBe(false)
    expect(state.apply(current, plan, [])).toBe(true)
    expect(state.close(nextProjectId)).toBe(true)
    expect(state.getSources()).toEqual([])
    expect(state.apply(current, plan, [])).toBe(false)
  })

  it('stops project-aware state when the active root becomes unavailable', () => {
    const clearDiagnostics = vi.fn()
    const state = new ProjectSourceSnapshotState(clearDiagnostics)
    const request = state.activate(projectId)
    const plan = planProjectSourceSnapshot([
      { relativePath: 'a.ts', content: 'export {}' },
    ], limits)
    state.apply(request, plan, [])

    expect(state.markUnavailable(projectId)).toBe(true)
    expect(state.getSources()).toEqual([])
    expect(state.apply(request, plan, [])).toBe(false)
    expect(clearDiagnostics).toHaveBeenCalledWith('monaco-typescript', projectId)
  })

  it('clears the active generation on renderer disposal', () => {
    const clearDiagnostics = vi.fn()
    const state = new ProjectSourceSnapshotState(clearDiagnostics)
    state.activate(projectId)

    state.dispose()

    expect(state.getSources()).toEqual([])
    expect(state.capture()).toBeNull()
    expect(clearDiagnostics).toHaveBeenCalledWith('monaco-typescript', projectId)
  })

  it('scopes diagnostic ownership and stale checks by provider and generation', () => {
    const current: DiagnosticIdentity = {
      providerId: 'monaco-typescript',
      projectId,
      documentUri: projectDocumentUri(projectId, 'a.ts'),
      modelVersion: 4,
      projectGeneration: 7,
      providerGeneration: 2,
    }
    expect(markerOwnerForProvider('monaco-typescript'))
      .not.toBe(markerOwnerForProvider('monaco-json'))
    expect(isCurrentDiagnostic(current, current)).toBe(true)
    expect(isCurrentDiagnostic(
      { ...current, projectGeneration: 6 },
      current,
    )).toBe(false)
    expect(isCurrentDiagnostic(
      { ...current, providerGeneration: 1 },
      current,
    )).toBe(false)
    expect(isCurrentDiagnostic(
      { ...current, providerId: 'monaco-json' },
      current,
    )).toBe(false)

    const batch = createProviderDiagnosticBatch(current, [{
      severity: 'error',
      message: 'Expected a value.',
      source: 'typescript',
      code: '1109',
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
      },
    }])
    expect(batch.markerOwner).toBe(markerOwnerForProvider('monaco-typescript'))
    expect(isCurrentDiagnosticBatch(batch, current)).toBe(true)
    expect(isCurrentDiagnosticBatch(batch, {
      ...current,
      providerGeneration: current.providerGeneration + 1,
    })).toBe(false)
  })

  it('rejects provider generations from another project or provider', () => {
    const current = {
      providerId: 'monaco-typescript' as const,
      projectId,
      generation: 3,
    }
    expect(isCurrentProviderGeneration(current, current)).toBe(true)
    expect(isCurrentProviderGeneration(
      { ...current, generation: 2 },
      current,
    )).toBe(false)
    expect(isCurrentProviderGeneration(
      { ...current, projectId: nextProjectId },
      current,
    )).toBe(false)
    expect(isCurrentProviderGeneration(
      { ...current, providerId: 'monaco-json' },
      current,
    )).toBe(false)
  })
})
