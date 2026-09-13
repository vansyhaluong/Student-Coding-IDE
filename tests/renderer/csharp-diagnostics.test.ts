import { afterEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import type { AppResult, ProjectId } from '../../src/shared/contracts'
import { CSHARP_LS_CAPABILITIES, type LanguageApi, type LanguageStatus, type LanguageStatusEvent,
  type DiagnosticRequest, type DiagnosticResult } from '../../src/shared/contracts/language'
import type { EditorDocumentLifecycleEvent, EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { CsharpClient } from '../../src/renderer/src/features/language/csharp/csharp-client'
import { CsharpDiagnosticsController } from '../../src/renderer/src/features/language/csharp/csharp-diagnostics-controller'
import { csharpStatusPresentation } from '../../src/renderer/src/features/language/csharp/csharp-status-store'
import { ProblemsStore } from '../../src/renderer/src/features/problems/problems-store'
import { createProviderDiagnosticBatch } from '../../src/renderer/src/features/language/diagnostic-identity'
import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProject = 'project_abcdef1234567890abcdef12' as ProjectId
const owner = 'student-ide.language.csharp-ls'
const running: LanguageStatus = {
  providerId: 'csharp-ls', capabilities: CSHARP_LS_CAPABILITIES, effectiveCapabilities: CSHARP_LS_CAPABILITIES,
  completionResolve: true, completionTriggers: ['.'], signatureTriggers: ['('], signatureRetriggers: [],
  dependency: { state: 'AVAILABLE', reason: null, warnings: [] }, service: { state: 'RUNNING', reason: null },
  workspace: { state: 'READY', mode: 'project' },
}
const diagnostic = { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } },
  severity: 'error' as const, code: 'CS1002', source: 'csharp-ls', message: 'Expected ;' }
const success = <T>(value: T): AppResult<T> => ({ ok: true, value })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const cleanup: Array<() => void> = []
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose() })

async function fixture() {
  const lifecycle = new Set<(event: EditorDocumentLifecycleEvent) => void>()
  let statusListener: ((event: LanguageStatusEvent) => void) | undefined
  let version = 1, text = 'abc', opened = true
  const uri = projectDocumentUri(projectId, 'Program.cs')
  const model = { uri: { toString: () => uri }, getVersionId: () => version, getValue: () => text,
    getLanguageId: () => 'csharp', isDisposed: () => false } as unknown as editor.ITextModel
  const document = { projectId, relativePath: 'Program.cs', languageId: 'csharp', model, dirty: true }
  const documents = { getOpenDocuments: () => opened ? [document] : [], findDocument: () => opened ? document : undefined,
    subscribeDocumentLifecycle: (listener: (event: EditorDocumentLifecycleEvent) => void) => {
      lifecycle.add(listener); return () => { lifecycle.delete(listener) }
    } } as unknown as EditorModelManager
  const api = {
    onStatus: (listener: (event: LanguageStatusEvent) => void) => { statusListener = listener; return () => { statusListener = undefined } },
    openDocument: vi.fn(async () => success(running)), changeDocument: vi.fn(async () => success(null)),
    saveDocument: vi.fn(async () => success(null)), closeDocument: vi.fn(async () => success(null)), cancel: vi.fn(async () => success(null)),
    getDiagnostics: vi.fn<(request: DiagnosticRequest) => Promise<AppResult<DiagnosticResult>>>(async request => success({
      requestId: request.requestId, documentVersion: request.documentVersion, kind: 'full', diagnostics: [diagnostic],
    })),
  }
  const store = new ProblemsStore(); store.activateProject(projectId)
  const client = new CsharpClient(api as unknown as LanguageApi, documents)
  const requests = vi.spyOn(client, 'request')
  const markers = new Map<string, editor.IMarkerData[]>([['typescript', [{ message: 'Existing TS' } as editor.IMarkerData]]])
  const host = { getModels: () => [model], setModelMarkers: vi.fn((_model: editor.ITextModel, provider: string, values: editor.IMarkerData[]) => { markers.set(provider, values) }) }
  const controller = new CsharpDiagnosticsController(host, client, documents, store)
  cleanup.push(() => { controller.dispose(); client.dispose(); store.dispose() })
  const emit = (event: EditorDocumentLifecycleEvent) => { for (const listener of lifecycle) listener(event) }
  const refresh = () => statusListener?.({ projectId, status: running })
  const settle = async () => {
    await vi.waitFor(() => expect(requests).toHaveBeenCalled())
    await requests.mock.results.at(-1)!.value
  }
  client.setProject(projectId)
  await vi.waitFor(() => expect(store.getSnapshot().totalCount).toBe(1))
  return { api, client, store, host, model, markers, controller, refresh, settle, uri, requests,
    status: (status: LanguageStatus) => statusListener?.({ projectId, status }),
    change(n: number) { version = n; text = `value${n}`; emit({ type: 'content-changed', projectId, relativePath: 'Program.cs', content: text, dirty: true }) },
    save() { emit({ type: 'saved', projectId, relativePath: 'Program.cs', content: text, dirty: false }) },
    close() { opened = false; emit({ type: 'closed', projectId, relativePath: 'Program.cs' }) },
    reopen() { opened = true; version = 1; text = 'abc'; emit({ type: 'opened', projectId, relativePath: 'Program.cs', content: text, dirty: true }) },
  }
}

describe('5.5G direct C# markers and Problems pipeline', () => {
  it('sets, replaces, retains unchanged and clears empty full without touching built-in markers', async () => {
    const f = await fixture()
    expect(f.markers.get(owner)).toMatchObject([{ startLineNumber: 1, startColumn: 2, severity: 8, code: 'CS1002' }])
    expect(f.store.getSnapshot().problems).toMatchObject([{ providerId: 'csharp-ls', projectId, relativePath: 'Program.cs', severity: 'error', range: { startColumn: 2 } }])
    f.api.getDiagnostics.mockImplementation(async request => success({ requestId: request.requestId, documentVersion: request.documentVersion,
      kind: 'full', diagnostics: [{ ...diagnostic, severity: 'warning', message: 'Replacement' }] }))
    f.refresh(); await f.settle()
    expect(f.markers.get(owner)).toMatchObject([{ severity: 4, message: 'Replacement' }])
    expect(f.store.getSnapshot().warningCount).toBe(1)
    const writes = f.host.setModelMarkers.mock.calls.length, snapshot = f.store.getSnapshot()
    f.api.getDiagnostics.mockImplementation(async request => success({ requestId: request.requestId, documentVersion: request.documentVersion,
      kind: 'unchanged', diagnostics: [{ ...diagnostic, severity: 'warning', message: 'Replacement' }] }))
    f.refresh(); await f.settle()
    expect(f.host.setModelMarkers).toHaveBeenCalledTimes(writes)
    expect(f.store.getSnapshot()).toBe(snapshot)
    f.api.getDiagnostics.mockImplementation(async request => success({ requestId: request.requestId, documentVersion: request.documentVersion, kind: 'full', diagnostics: [] }))
    f.refresh(); await f.settle()
    expect(f.markers.get(owner)).toEqual([]); expect(f.store.getSnapshot().totalCount).toBe(0)
    expect(f.markers.get('typescript')).toEqual([{ message: 'Existing TS' }])
    expect(f.host.setModelMarkers.mock.calls.every(call => call[1] === owner)).toBe(true)
  })
  it('coalesces pending versions, flushes sync and never resurrects version 10 after version 12', async () => {
    const f = await fixture(), entered = deferred<void>(), response = deferred<AppResult<DiagnosticResult>>()
    let old!: DiagnosticRequest
    f.api.getDiagnostics.mockImplementationOnce(request => { old = request; entered.resolve(); return response.promise })
    f.change(10); await entered.promise
    const count = f.api.getDiagnostics.mock.calls.length
    f.change(11); f.change(12)
    expect(f.api.getDiagnostics).toHaveBeenCalledTimes(count)
    expect(f.markers.get(owner)).toEqual([]); expect(f.store.getSnapshot().totalCount).toBe(0)
    response.resolve(success({ requestId: old.requestId, documentVersion: old.documentVersion, kind: 'full', diagnostics: [{ ...diagnostic, message: 'STALE' }] }))
    await vi.waitFor(() => expect(f.markers.get(owner)).toMatchObject([{ modelVersionId: 12, message: 'Expected ;' }]))
    expect(f.api.getDiagnostics.mock.calls.slice(-2).map(([request]) => request.documentVersion)).toEqual([10, 12])
    expect(f.api.changeDocument.mock.calls).toHaveLength(3)
    expect(f.api.cancel).toHaveBeenCalledWith(old.requestId)
    expect(JSON.stringify(f.store.getSnapshot())).not.toContain('STALE')
  })
  it('waits for edit and save synchronization before pulling the current diagnostics', async () => {
    const f = await fixture(), changed = deferred<AppResult<null>>(), saved = deferred<AppResult<null>>()
    f.api.getDiagnostics.mockClear()
    f.api.changeDocument.mockImplementationOnce(() => changed.promise)
    f.api.saveDocument.mockImplementationOnce(() => saved.promise)
    f.change(2); f.save()
    await vi.waitFor(() => expect(f.api.changeDocument).toHaveBeenCalledOnce())
    expect(f.api.getDiagnostics).not.toHaveBeenCalled()
    changed.resolve(success(null))
    await vi.waitFor(() => expect(f.api.saveDocument).toHaveBeenCalledOnce())
    expect(f.api.getDiagnostics).not.toHaveBeenCalled()
    saved.resolve(success(null))
    await vi.waitFor(() => expect(f.api.getDiagnostics).toHaveBeenCalledOnce())
    expect(f.api.getDiagnostics.mock.calls[0][0].documentVersion).toBe(2)
    await vi.waitFor(() => expect(f.store.getSnapshot().problems).toMatchObject([{ providerId: 'csharp-ls' }]))
    expect(f.markers.get(owner)).toMatchObject([{ modelVersionId: 2 }])
  })
  it('settles an unchanged result after an edit until csharp-ls publishes a fresh full report', async () => {
    const f = await fixture()
    f.api.getDiagnostics.mockImplementationOnce(async request => success({ requestId: request.requestId,
      documentVersion: request.documentVersion, kind: 'unchanged', diagnostics: [diagnostic] }))
      .mockImplementationOnce(async request => success({ requestId: request.requestId,
        documentVersion: request.documentVersion, kind: 'unchanged', diagnostics: [diagnostic] }))
      .mockImplementationOnce(async request => success({ requestId: request.requestId,
        documentVersion: request.documentVersion, kind: 'full', diagnostics: [] }))
    f.change(2)
    await vi.waitFor(() => expect(f.api.getDiagnostics.mock.calls.filter(([request]) => request.documentVersion === 2)).toHaveLength(3),
      { timeout: 2_000 })
    await vi.waitFor(() => expect(f.store.getSnapshot().totalCount).toBe(0))
    expect(f.markers.get(owner)).toEqual([])
  })
  it.each(['close', 'project', 'crash', 'provider', 'dispose'])('clears and rejects late results after %s', async cause => {
    const f = await fixture(), entered = deferred<void>(), response = deferred<AppResult<DiagnosticResult>>()
    let old!: DiagnosticRequest
    f.api.getDiagnostics.mockImplementationOnce(request => { old = request; entered.resolve(); return response.promise })
    f.refresh(); await entered.promise
    if (cause === 'close') f.close()
    if (cause === 'project') { f.client.setProject(nextProject); f.store.activateProject(nextProject) }
    if (cause === 'crash') f.status({ ...running, effectiveCapabilities: [], service: { state: 'CRASHED', reason: null } })
    if (cause === 'provider') { f.store.disposeProvider('csharp-ls'); f.controller.dispose() }
    if (cause === 'dispose') f.controller.dispose()
    expect(f.markers.get(owner)).toEqual([]); expect(f.store.getSnapshot().totalCount).toBe(0)
    response.resolve(success({ requestId: old.requestId, documentVersion: old.documentVersion, kind: 'full', diagnostics: [{ ...diagnostic, message: 'STALE' }] }))
    await f.settle()
    expect(f.markers.get(owner)).toEqual([]); expect(f.store.getSnapshot().totalCount).toBe(0)
  })
  it('accepts a reopened document and clears Problems on close', async () => {
    const f = await fixture(); f.change(12)
    await vi.waitFor(() => expect(f.markers.get(owner)).toMatchObject([{ modelVersionId: 12 }]))
    f.close(); await vi.waitFor(() => expect(f.api.closeDocument).toHaveBeenCalledOnce())
    expect(f.store.getSnapshot().totalCount).toBe(0)
    f.reopen()
    await vi.waitFor(() => expect(f.markers.get(owner)).toMatchObject([{ modelVersionId: 1 }]))
  })
  it('closes a buffer edited and closed while didOpen was still pending using the last synced version', async () => {
    const f = await fixture(); f.close()
    await vi.waitFor(() => expect(f.api.closeDocument).toHaveBeenCalledOnce())
    const opened = deferred<AppResult<LanguageStatus>>()
    f.api.openDocument.mockImplementationOnce(() => opened.promise)
    f.reopen(); f.change(2); f.close()
    opened.resolve(success(running))
    await vi.waitFor(() => expect(f.api.closeDocument).toHaveBeenCalledTimes(2))
    expect(f.api.closeDocument).toHaveBeenLastCalledWith({ projectId, relativePath: 'Program.cs', modelVersion: 1 })
    expect(f.store.getSnapshot().totalCount).toBe(0)
  })
  it.each([['information', 2], ['hint', 1]] as const)('maps %s markers explicitly to %s', async (severity, expected) => {
    const f = await fixture()
    f.api.getDiagnostics.mockImplementation(async request => success({ requestId: request.requestId,
      documentVersion: request.documentVersion, kind: 'full', diagnostics: [{ ...diagnostic, severity }] }))
    f.refresh(); await f.settle()
    expect(f.markers.get(owner)).toMatchObject([{ severity: expected }])
    expect(f.store.getSnapshot().problems[0].severity).toBe(severity === 'information' ? 'info' : 'hint')
  })
  it('rejects stale versions/generations and unsafe Problems navigation targets', async () => {
    const f = await fixture(), identity = f.store.captureIdentity('csharp-ls', f.uri, 12)!
    const batch = createProviderDiagnosticBatch(identity, [{ severity: 'error', message: 'safe', source: 'csharp-ls',
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 } }])
    for (const path of ['../outside.cs', 'C:/private.cs', '/outside.cs', 'Other.cs']) expect(f.store.replace(path, batch)).toBe(false)
    expect(f.store.replace('Program.cs', batch)).toBe(true)
    expect(f.store.replace('Program.cs', { ...batch, identity: { ...identity, modelVersion: 10 } })).toBe(false)
    f.store.disposeProvider('csharp-ls')
    expect(f.store.replace('Program.cs', batch)).toBe(false)
    f.store.activateProject(nextProject)
    expect(f.store.replace('Program.cs', batch)).toBe(false)
  })
})

describe('5.5G safe status presentation', () => {
  it.each([
    ['DOTNET_HOST_MISSING', '.NET SDK 10+ is required'], ['DOTNET_SDK_MISSING', '.NET SDK 10+ is required'],
    ['DOTNET_SDK_TOO_OLD', '.NET SDK 10+ is required (installed SDK is too old)'],
    ['CSHARP_LS_MISSING', 'C# language server is missing'], ['CSHARP_LS_INVALID', 'C# language server is invalid'],
    ['CSHARP_LS_VERSION_MISMATCH', 'C# language server is invalid'],
  ] as const)('shows actionable dependency %s', (reason, label) => {
    expect(csharpStatusPresentation({ ...running, dependency: { state: 'MISSING', reason, warnings: [] } }).label).toBe(label)
  })
  it.each(['STOPPED', 'STARTING', 'RUNNING', 'CRASHED'] as const)('shows lifecycle %s independently from preflight', state => {
    const result = csharpStatusPresentation({ ...running, service: { state, reason: null } })
    expect(result.service.toLowerCase()).toContain(state.toLowerCase())
    expect(result.workspace).toBe('C# workspace preflight passed')
    expect(result.detail).toContain('do not guarantee workspace health')
  })
  it.each([
    [{ state: 'SELECTION_REQUIRED', candidates: [] }, 'C# workspace selection required'],
    [{ state: 'NO_CSHARP_WORKSPACE' }, 'No C# project or solution found'],
    [{ state: 'PREFLIGHT_FAILED', reason: 'WORKSPACE_PREFLIGHT_FAILED' }, 'C# workspace preflight failed'],
  ] as const)('shows workspace state %j', (workspace, label) => {
    expect(csharpStatusPresentation({ ...running, workspace }).label).toBe(label)
  })
  it('does not render privileged or arbitrary extra status fields', () => {
    const unsafe = { ...running, pid: 1234, executable: 'C:/secret.exe', cwd: 'C:/private', stderr: 'raw log', stack: 'raw stack' }
    expect(JSON.stringify(csharpStatusPresentation(unsafe))).not.toMatch(/1234|secret|private|raw log|raw stack|cwd|stderr/)
  })
})
