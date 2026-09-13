import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { CsharpWorkspace } from '../../src/main/services/language/csharp-workspace'
import { CsharpWorkspaceSession } from '../../src/main/services/language/csharp-workspace-session'
import { CsharpOwnerLifecycle } from '../../src/main/services/language/csharp-owner-lifecycle'
import { CsharpSemanticService } from '../../src/main/services/language/csharp-semantic-service'
import { LanguageIpcService } from '../../src/main/ipc/language-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { createLanguageBridge } from '../../src/preload/bridge/language'
import { CSHARP_LS_CAPABILITIES, LANGUAGE_CHANNELS, LANGUAGE_LIMITS, type CompletionHandle,
  type DocumentVersion, type SemanticRequestId } from '../../src/shared/contracts/language'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import type { LanguageServiceManager } from '../../src/main/services/language/language-service-manager'
import type { CSharpLsAdapter } from '../../src/main/services/language/csharp-ls-adapter'
import { completionItem, markdown, signatureResult, triggers } from '../../src/main/services/language/csharp-semantic-mapping'
import { validateLanguageStatus, validateLanguageWorkspaceStatus } from '../../src/shared/contracts/language-validation'
import { normalizeCsharpDiagnostics } from '../../src/main/services/language/csharp-diagnostic-mapping'

const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const clean of cleanup.splice(0).reverse()) await clean() })
const v = (n: number) => n as DocumentVersion
const id = (s: string) => ('language_' + s) as SemanticRequestId
const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }

describe('5.5G diagnostic normalization', () => {
  it.each([[1, 'error'], [2, 'warning'], [3, 'information'], [4, 'hint'], [undefined, 'error']])('maps severity %s explicitly to %s', (severity, expected) => {
    expect(normalizeCsharpDiagnostics([{ range, severity, message: 'message' }])[0].severity).toBe(expected)
  })
  it('keeps only semantic fields and safe code/source, redacting whole private-path messages', () => {
    const [diagnostic] = normalizeCsharpDiagnostics([{ range, message: 'Expected ;', code: 'CS1002', source: 'csharp-ls',
      data: { private: true }, relatedInformation: [{ location: { uri: 'file:///secret' } }] }])
    expect(diagnostic).toEqual({ range, severity: 'error', message: 'Expected ;', code: 'CS1002', source: 'csharp-ls' })
    for (const path of ['C:\\private space\\secret.cs', '\\\\server\\share\\file.cs', '/home/private/file.cs', 'file:///private.cs']) {
      expect(normalizeCsharpDiagnostics([{ range, message: `Failure in ${path}`, code: path, source: path }])).toEqual([
        { range, severity: 'error', message: 'C# diagnostic details contain a private path.', code: null, source: null },
      ])
    }
    expect(normalizeCsharpDiagnostics([{ range, message: 'numeric', code: 123 }])[0].code).toBe(123)
  })
  it.each([null, {}, [{ range, message: 3 }], [{ range, message: 'x', severity: 9 }], [{ message: 'x', range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } } }]])('rejects malformed diagnostics %j', input => {
    expect(() => normalizeCsharpDiagnostics(input)).toThrow()
  })
})

describe('5.5G diagnostic IPC and Main ordering', () => {
  it.each(['resultId', 'diagnosticData'])('preload rejects raw diagnostic reply fields: %s', async field => {
    const request = { requestId: id('boundary'), document: { projectId: 'project_1234567890abcdef12345678', relativePath: 'Open.cs' }, documentVersion: v(1) }
    const reply = { requestId: request.requestId, documentVersion: request.documentVersion, kind: 'full',
      diagnostics: [{ range, message: 'safe', severity: 'error', code: null, source: null,
        ...(field === 'diagnosticData' ? { data: { uri: 'file:///private' } } : {}) }],
      ...(field === 'resultId' ? { resultId: 'main-only' } : {}) }
    const api = createLanguageBridge({ invoke: async () => ({ ok: true, value: reply }), on: () => {}, removeListener: () => {} })
    expect(await api.getDiagnostics(request as Parameters<typeof api.getDiagnostics>[0])).toMatchObject({ ok: false })
  })
  it('returns full, unchanged and empty semantic reports without raw provider fields', async () => {
    const f = await fixture(); value(await f.open())
    const request = { requestId: id('diagnostics'), document: f.request().document, documentVersion: v(1) }
    const first = value(await f.api.getDiagnostics(request))
    expect(first).toMatchObject({ kind: 'full', documentVersion: 1, diagnostics: [{ severity: 'error', code: 'CS1002', source: 'csharp-ls' }] })
    f.adapter.documentDiagnosticReport.mockResolvedValue({ kind: 'unchanged', items: [{ range, message: 'CS test', severity: 1, code: 'CS1002', source: 'csharp-ls' }] })
    expect(value(await f.api.getDiagnostics(request))).toEqual({ ...first, kind: 'unchanged' })
    f.adapter.documentDiagnosticReport.mockResolvedValue({ kind: 'full', items: [] })
    expect(value(await f.api.getDiagnostics(request)).diagnostics).toEqual([])
    expect(JSON.stringify(first)).not.toMatch(/resultId|data|file:\/\/|canonicalRoot|pid|operation/)
    expect(await f.send(LANGUAGE_CHANNELS.getDiagnostics, { ...request, uri: 'file:///secret' })).toMatchObject({ ok: false })
  })
  it('flushes every prior change before pulling the current version', async () => {
    const f = await fixture(); value(await f.open()); const order: string[] = []
    f.adapter.didChange.mockImplementation(async () => { order.push('change') })
    f.adapter.documentDiagnosticReport.mockImplementation(async () => { order.push('diagnostics'); return { kind: 'full', items: [] } })
    const first = f.api.changeDocument({ ...f.document, modelVersion: v(2), changes: [{ range, text: 'def' }] })
    const second = f.api.changeDocument({ ...f.document, modelVersion: v(3), changes: [{ range, text: 'ghi' }] })
    const pull = f.api.getDiagnostics({ requestId: id('flush'), document: f.request().document, documentVersion: v(3) })
    value(await first); value(await second); value(await pull)
    expect(order).toEqual(['change', 'change', 'diagnostics'])
  })
  it('serializes overlapping pulls and cancels queued work before adapter dispatch', async () => {
    const f = await fixture(); value(await f.open())
    const entered = deferred<void>(), response = deferred<Awaited<ReturnType<CSharpLsAdapter['documentDiagnosticReport']>>>()
    f.adapter.documentDiagnosticReport.mockImplementation(() => { entered.resolve(); return response.promise })
    const request = { requestId: id('first-pull'), document: f.request().document, documentVersion: v(1) }
    const first = f.api.getDiagnostics(request); await entered.promise
    const secondRequest = { ...request, requestId: id('queued-pull') }, second = f.api.getDiagnostics(secondRequest)
    value(await f.api.cancel(secondRequest.requestId))
    expect(f.adapter.documentDiagnosticReport).toHaveBeenCalledOnce()
    response.resolve({ kind: 'full', items: [] }); value(await first)
    expect(await second).toMatchObject({ ok: false })
    expect(f.adapter.documentDiagnosticReport).toHaveBeenCalledOnce()
  })
  it.each(['change', 'close', 'session', 'crash', 'owner', 'project', 'cancel'])('rejects a late pull after %s', async cause => {
    const f = await fixture(); value(await f.open())
    const entered = deferred<void>(), response = deferred<Awaited<ReturnType<CSharpLsAdapter['documentDiagnosticReport']>>>()
    f.adapter.documentDiagnosticReport.mockImplementation(() => { entered.resolve(); return response.promise })
    const request = { requestId: id('late-pull'), document: f.request().document, documentVersion: v(1) }
    const pull = f.api.getDiagnostics(request); await entered.promise
    if (cause === 'change') value(await f.api.changeDocument({ ...f.document, modelVersion: v(2), changes: [{ range, text: 'def' }] }))
    if (cause === 'close') value(await f.api.closeDocument(f.document))
    if (cause === 'session') await f.session.invalidate()
    if (cause === 'crash') { f.manager.state = 'CRASHED'; for (const notify of f.listeners) notify() }
    if (cause === 'owner') f.owner.emit('render-process-gone')
    if (cause === 'project') await f.projects.closeProject()
    if (cause === 'cancel') value(await f.api.cancel(request.requestId))
    response.resolve({ kind: 'full', items: [{ range, message: 'stale' }] })
    expect(await pull).toMatchObject({ ok: false })
  })
})
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const frame = (token: string) => ({ frameToken: token, processId: 10, routingId: 1, detached: false, isDestroyed: () => false })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'csharp-semantic-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  for (const path of ['App.csproj', 'Open.cs', 'src/Target.cs']) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), '') }
  const projects = new ProjectService(), project = await projects.openRoot(root)
  const files = new FileSystemService(projects, { watchFactory: () => ({ close() {} }), trashItem: async () => {} }); files.start()
  const commands = { stop: vi.fn(async () => {}), execute: vi.fn(async (args: readonly string[]) => ({ exitCode: 0,
    stdout: args[0] === '--version' ? '10.0.401' : JSON.stringify({ Properties: { TargetFramework: 'net10.0', TargetFrameworks: '', TargetFrameworkIdentifier: '.NETCoreApp', TargetFrameworkVersion: 'v10.0' }, Items: { ProjectReference: [] } }) })) }
  const adapter = {
    documentDiagnosticReport: vi.fn< CSharpLsAdapter['documentDiagnosticReport'] >(async () => ({ kind: 'full', items: [{ range, message: 'CS test', severity: 1, code: 'CS1002', source: 'csharp-ls' }] })),
    didOpen: vi.fn(async () => {}), didChange: vi.fn(async () => {}), didSave: vi.fn(async () => {}), didClose: vi.fn(async () => {}),
    watchedFileRegistrations: new Map(), didChangeWatchedFiles: vi.fn(async () => {}),
    serverCapabilities: { completionResolve: true }, initializeResult: { capabilities: { completionProvider: { triggerCharacters: ['.', '.', '\n', 'bad'] },
      signatureHelpProvider: { triggerCharacters: ['(', ','], retriggerCharacters: [')'] } } },
    completion: vi.fn(async () => ({ isIncomplete: false, items: [{ handle: 'private' as CompletionHandle,
      item: { label: 'Method', kind: 2, textEdit: { newText: 'Method()', range }, data: { secret: 'private' } } }] })),
    resolveCompletion: vi.fn(async () => ({ label: 'Method', kind: 2, detail: 'resolved', documentation: { kind: 'markdown', value: '**safe**' } })),
    hover: vi.fn(async () => ({ contents: { kind: 'markdown', value: '**hover**' }, range })),
    signatureHelp: vi.fn(async () => ({ signatures: [{ label: 'Fn(a,b)', parameters: [{ label: [3, 4] }, { label: 'b' }], activeParameter: 1 }], activeSignature: 0, activeParameter: 0 })),
    definition: vi.fn(async () => [{ uri: pathToFileURL(join(root, 'src/Target.cs')).href, range }]), cancel: vi.fn(),
  }
  const listeners = new Set<() => void>()
  const manager = { state: 'STOPPED' as 'STOPPED' | 'RUNNING' | 'CRASHED',
    dependency: { state: 'AVAILABLE', reason: null, warnings: [] }, get capabilities() { return manager.state === 'RUNNING' ? CSHARP_LS_CAPABILITIES : [] },
    adapter, detectDependencies: vi.fn(async () => {}), subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    start: vi.fn(async () => { manager.state = 'RUNNING'; for (const fn of listeners) fn(); return adapter as unknown as CSharpLsAdapter }),
    stop: vi.fn(async () => { manager.state = 'STOPPED'; for (const fn of listeners) fn() }),
  }
  const session = new CsharpWorkspaceSession(projects, files,
    new CsharpWorkspace(files, { read: async () => undefined, select: async () => {} }, commands), manager, commands, vi.fn()); session.start()
  const owners = new CsharpOwnerLifecycle(session, vi.fn())
  const old = frame('old'), owner = Object.assign(new EventEmitter(), { id: 1, mainFrame: old, isDestroyed: () => false })
  owners.observe(owner as unknown as Parameters<CsharpOwnerLifecycle['observe']>[0])
  const commit = (next = owner.mainFrame) => { owner.mainFrame = next; owner.emit('did-frame-navigate', {}, 'file:///app', 200, '', true, next.processId, next.routingId) }
  commit()
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const events = new Map<string, Set<Parameters<IpcRendererLike['on']>[1]>>()
  const service = new CsharpSemanticService(projects, files, session, manager as unknown as LanguageServiceManager, owners,
    (_sender, projectId, status) => { for (const listener of events.get(LANGUAGE_CHANNELS.status) ?? []) listener({}, { projectId, status }) })
  const ipc = new LanguageIpcService(new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } }), service); ipc.start()
  const send = (channel: string, payload: unknown, caller = owner.mainFrame) => handlers.get(channel)!({ sender: { id: 1 }, senderFrame: caller }, payload)
  const api = createLanguageBridge({ invoke: send, on: (c, fn) => { if (!events.has(c)) events.set(c, new Set()); events.get(c)!.add(fn) }, removeListener: (c, fn) => { events.get(c)?.delete(fn) } })
  const document = { projectId: project.id, relativePath: 'Open.cs', modelVersion: v(1) }
  const request = (name = 'request', version = 1) => ({ requestId: id(name), document: { projectId: project.id, relativePath: 'Open.cs' }, documentVersion: v(version), position: { line: 0, character: 1 } })
  const open = () => api.openDocument({ ...document, text: 'abc', dirty: true })
  cleanup.push(async () => { ipc.stop(); owners.stop(); await session.stop(); files.stop(); await projects.stop() })
  return { root, project, projects, files, manager, adapter, session, owners, owner, old, commit, send, api, document, request, open, events, listeners }
}
function value<T>(result: import('../../src/shared/contracts').AppResult<T>): T { expect(result.ok).toBe(true); if (!result.ok) throw Error('expected success'); return result.value }

describe('5.5F public workspace/runtime contract', () => {
  it.each([{ state: 'READY', mode: 'project' }, { state: 'READY', mode: 'solution', selected: { kind: 'solution', relativePath: 'App.slnx' } },
    { state: 'PREFLIGHT_FAILED', reason: 'WORKSPACE_PREFLIGHT_FAILED' }, { state: 'PREFLIGHT_FAILED', selected: { kind: 'solution', relativePath: 'App.sln' }, reason: 'SOLUTION_PARSE_FAILED' }])('accepts truthful workspace %j', state => {
    expect(validateLanguageWorkspaceStatus(state).ok).toBe(true)
  })
  it.each([{ state: 'READY', mode: 'project', selected: { kind: 'project', relativePath: 'App.csproj' } }, { state: 'READY', mode: 'solution' },
    { state: 'PREFLIGHT_FAILED', reason: 'raw error' }, { state: 'READY', mode: 'solution', selected: { kind: 'solution', relativePath: 'C:/App.sln' } }])('rejects invalid workspace %j', state => {
    expect(validateLanguageWorkspaceStatus(state).ok).toBe(false)
  })
  it('normalizes triggers and reports effective capabilities separately; rejects stopped effective capabilities', async () => {
    const f = await fixture(), status = value(await f.open())
    expect(status.workspace).toEqual({ state: 'READY', mode: 'project' })
    expect(status.completionTriggers).toEqual(['.'])
    expect(status.signatureTriggers).toEqual(['(', ','])
    expect(validateLanguageStatus({ ...status, service: { state: 'STOPPED', reason: null } }).ok).toBe(false)
    expect(validateLanguageStatus({ ...status, effectiveCapabilities: ['raw-method'] }).ok).toBe(false)
  })
})
describe('5.5F IPC/preload ownership and synchronization', () => {
  it('opens and forwards only exact semantic DTOs through production IPC/preload', async () => {
    const f = await fixture(); value(await f.open())
    const result = value(await f.api.getCompletion(f.request()))
    expect(result.items[0]).toMatchObject({ label: 'Method', kind: 'method', insertText: 'Method()', replacementRange: range })
    expect(result.items[0].handle).toMatch(/^completion_/)
    expect(JSON.stringify(result)).not.toMatch(/private|data|canonicalRoot|pid|file:\/\//)
    expect(Object.keys(f.api).sort()).toEqual(['cancel','changeDocument','closeDocument','getCompletion','getDefinition','getDiagnostics','getHover','getSignatureHelp','getStatus','getWorkspaceState','onStatus','openDocument','resolveCompletion','saveDocument','selectWorkspace'].sort())
  })
  it.each(['../Open.cs', 'C:/private.cs', '/outside.cs', 'Open.ts'])('rejects malformed/open path %s before dispatch', async path => {
    const f = await fixture()
    expect(await f.send(LANGUAGE_CHANNELS.openDocument, { ...f.document, relativePath: path, text: '', dirty: false })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(f.adapter.didOpen).not.toHaveBeenCalled()
  })
  it('rejects unopened, wrong project, stale version, invalid position and forged process fields', async () => {
    const f = await fixture(); value(await f.api.getStatus(f.project.id))
    expect(await f.api.getCompletion(f.request())).toMatchObject({ ok: false })
    value(await f.open())
    expect(await f.api.getCompletion(f.request('version', 2))).toMatchObject({ ok: false, error: { details: { reason: 'invalid-version' } } })
    expect(await f.api.getCompletion({ ...f.request(), position: { line: 99, character: 0 } })).toMatchObject({ ok: false })
    expect(await f.send(LANGUAGE_CHANNELS.getCompletion, { ...f.request(), document: { ...f.request().document, projectId: 'project_000000000000000000000000' } })).toMatchObject({ ok: false })
    expect(await f.send(LANGUAGE_CHANNELS.getCompletion, { ...f.request(), pid: 22 })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
  it('rejects canonical symlink escape before opening a document', async () => {
    const f = await fixture(), other = await fixture()
    await symlink(other.root, join(f.root, 'linked'), 'junction')
    expect(await f.api.openDocument({ ...f.document, relativePath: 'linked/Open.cs', text: '', dirty: false })).toMatchObject({ ok: false })
    expect(f.adapter.didOpen).not.toHaveBeenCalled()
  })
  it('flushes every queued document change before a semantic request and notifies save without writing disk again', async () => {
    const f = await fixture(); value(await f.open())
    const order: string[] = []
    f.adapter.didChange.mockImplementation(async () => { order.push('change') })
    f.adapter.hover.mockImplementation(async () => { order.push('hover'); return { contents: { kind: 'markdown', value: '' }, range } })
    const first = f.api.changeDocument({ ...f.document, modelVersion: v(2), changes: [{ range, text: 'xyz' }] })
    const second = f.api.changeDocument({ ...f.document, modelVersion: v(3), changes: [{ range, text: 'def' }] })
    const hover = f.api.getHover(f.request('hover', 3))
    value(await first); value(await second); value(await hover)
    expect(order).toEqual(['change', 'change', 'hover'])
    const write = vi.spyOn(f.files, 'write')
    value(await f.api.saveDocument({ ...f.document, modelVersion: v(3) }))
    expect(write).not.toHaveBeenCalled(); expect(f.adapter.didSave).toHaveBeenCalledOnce()
  })
  it('invalidates old frame/pending work on navigation, accepts only a new committed frame, and ignores React remount', async () => {
    const f = await fixture(); value(await f.open())
    f.owner.emit('react-remount')
    value(await f.api.getHover(f.request()))
    const next = frame('new')
    f.owner.emit('did-start-navigation', {}, 'file:///new', false, true)
    expect(await f.send(LANGUAGE_CHANNELS.getStatus, { projectId: f.project.id }, f.old)).toMatchObject({ ok: false })
    f.commit(next); await f.session.invalidate()
    expect(await f.send(LANGUAGE_CHANNELS.openDocument, { ...f.document, text: 'abc', dirty: true }, f.old)).toMatchObject({ ok: false })
    value(await f.open())
    expect(await f.send(LANGUAGE_CHANNELS.getHover, f.request(), frame('subframe'))).toMatchObject({ ok: false })
  })
  it('publishes safe crash state and removes status subscription', async () => {
    const f = await fixture(), listener = vi.fn(), remove = f.api.onStatus(listener)
    value(await f.open()); listener.mockClear()
    f.manager.state = 'CRASHED'; for (const notify of f.listeners) notify()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: expect.objectContaining({ effectiveCapabilities: [], completionResolve: false, service: { state: 'CRASHED', reason: null } }) }))
    remove(); expect(f.events.get(LANGUAGE_CHANNELS.status)?.size).toBe(0)
  })
})
describe('5.5F completion/resolve and cancellation', () => {
  it.each([false, true])('preserves server isIncomplete=%s', async isIncomplete => {
    const f = await fixture(); value(await f.open()); f.adapter.completion.mockResolvedValue({ isIncomplete, items: [] })
    expect(value(await f.api.getCompletion(f.request())).isIncomplete).toBe(isIncomplete)
  })
  it('resolves opaque handles and expires them after change/close/project invalidation', async () => {
    const f = await fixture(); value(await f.open())
    const handle = value(await f.api.getCompletion(f.request())).items[0].handle!
    expect(value(await f.api.resolveCompletion({ requestId: id('resolve'), handle })).detail).toBe('resolved')
    expect(f.adapter.resolveCompletion).toHaveBeenCalledWith(expect.stringMatching(/^semantic_/), 'private')
    value(await f.api.changeDocument({ ...f.document, modelVersion: v(2), changes: [{ range, text: 'xyz' }] }))
    expect(await f.api.resolveCompletion({ requestId: id('expired'), handle })).toMatchObject({ ok: false })
    const next = value(await f.api.getCompletion(f.request('next', 2))).items[0].handle!
    value(await f.api.closeDocument({ ...f.document, modelVersion: v(2) }))
    expect(await f.api.resolveCompletion({ requestId: id('closed'), handle: next })).toMatchObject({ ok: false })
    await f.session.invalidate()
    expect(await f.api.getCompletion(f.request())).toMatchObject({ ok: false })
  })
  it('evicts old handles at the existing bound without persisting provider data', async () => {
    const f = await fixture(); value(await f.open())
    const first = value(await f.api.getCompletion(f.request())).items[0].handle!
    f.adapter.completion.mockResolvedValue({ isIncomplete: true, items: Array.from({ length: LANGUAGE_LIMITS.maximumCompletionItems }, (_, i) => ({ handle: String(i) as CompletionHandle, item: { label: 'Method', kind: 2, textEdit: { newText: 'Method()', range }, data: { secret: 'private' } } })) })
    expect(value(await f.api.getCompletion(f.request('more'))).items).toHaveLength(LANGUAGE_LIMITS.maximumCompletionItems)
    expect(await f.api.resolveCompletion({ requestId: id('evicted'), handle: first })).toMatchObject({ ok: false })
  })
  it.each(['cancel', 'change', 'owner', 'project'])('ignores late results after %s', async cause => {
    const f = await fixture(); value(await f.open())
    const entered = deferred<void>(), response = deferred<Awaited<ReturnType<typeof f.adapter.completion>>>()
    f.adapter.completion.mockImplementation(() => { entered.resolve(); return response.promise })
    const request = f.request('pending'), pending = f.api.getCompletion(request)
    await entered.promise
    if (cause === 'cancel') value(await f.api.cancel(request.requestId))
    if (cause === 'change') value(await f.api.changeDocument({ ...f.document, modelVersion: v(2), changes: [{ range, text: 'xyz' }] }))
    if (cause === 'owner') f.owner.emit('render-process-gone')
    if (cause === 'project') await f.projects.closeProject()
    response.resolve({ isIncomplete: false, items: [] })
    expect(await pending).toMatchObject({ ok: false })
    if (cause !== 'change') expect(f.adapter.cancel).toHaveBeenCalled()
  })
})
describe('5.5F hover/signature/definition mapping', () => {
  it.each(['plain <b>text</b>', { kind: 'plaintext', value: '<b>plain</b>' }, { kind: 'markdown', value: '<b>safe</b> [bad](command:run) **bold**' }])('normalizes hover presentation %j', content => {
    expect(markdown(content)).not.toContain('<b>')
    expect(markdown(content)).not.toContain('command:')
  })
  it('preserves null hover and signature results, parameter labels and active selection', async () => {
    const f = await fixture(); value(await f.open())
    const result = value(await f.api.getSignatureHelp(f.request()))!
    expect(result.activeSignature).toBe(0); expect(result.activeParameter).toBe(1); expect(result.signatures[0].parameters[0].label).toBe('a')
    expect(signatureResult(null, id('null'), v(1))).toBeNull()
    expect(signatureResult({ signatures: [{ label: 'Fn()' }] }, id('missing'), v(1))).toMatchObject({ activeSignature: null, activeParameter: null })
    f.adapter.hover.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof f.adapter.hover>>)
    expect(value(await f.api.getHover(f.request()))).toBeNull()
  })
  it('accepts same/cross-file/multiple contained targets and discards external, non-file and metadata URIs', async () => {
    const f = await fixture(), other = await fixture(); value(await f.open())
    f.adapter.definition.mockResolvedValue([join(f.root, 'Open.cs'), join(f.root, 'src/Target.cs'), join(other.root, 'Open.cs')].map(path => ({ uri: pathToFileURL(path).href, range }))
      .concat(['csharp:/metadata/System.String', 'https://example.com/file.cs', 'untitled:File.cs', 'metadata:/BCL'].map(uri => ({ uri, range }))))
    const result = value(await f.api.getDefinition(f.request()))
    expect(result.targets.map(t => t.document.relativePath.toLowerCase())).toEqual(['open.cs', 'src/target.cs'])
    expect(JSON.stringify(result)).not.toContain(f.root)
  })
  it('does not forward snippets, arbitrary fields or LSP enum numbers', () => {
    expect(completionItem({ label: 'snippet', insertTextFormat: 2 }, null)).toBeNull()
    expect(completionItem({ label: 'x', kind: 25 }, null)).toMatchObject({ kind: 'typeParameter', replacementRange: null })
    expect(completionItem({ label: 'x', textEdit: { range, newText: 'x'.repeat(LANGUAGE_LIMITS.maximumTextLength + 1) } }, null)
      ?.insertText).toHaveLength(LANGUAGE_LIMITS.maximumTextLength)
    expect(() => signatureResult({ signatures: [{ label: 'Fn(a)', parameters: [{ label: [4, 2] }] }] },
      id('invalid-signature'), v(1))).toThrow()
    expect(triggers(['.', '.', 'multi', '\0', '('])).toEqual(['.', '('])
  })
})
