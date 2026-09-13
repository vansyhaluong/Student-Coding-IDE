import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { createMessageConnection, ErrorCodes, ResponseError, StreamMessageReader,
  StreamMessageWriter, type MessageConnection } from 'vscode-jsonrpc/node'
import { LspConnection } from '../../src/main/services/language/lsp-connection'
import { CSharpLsAdapter, inspectCsharpCapabilities } from '../../src/main/services/language/csharp-ls-adapter'
import { LanguageServiceManager } from '../../src/main/services/language/language-service-manager'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { CsharpProcess, CsharpProcessEvent, CsharpProcessFactory } from '../../src/main/services/language/csharp-process'
import { serializeAppError } from '../../src/main/errors/app-error'

const capabilities = {
  positionEncoding: 'utf-16', completionProvider: { resolveProvider: true },
  hoverProvider: true, signatureHelpProvider: {}, definitionProvider: true,
  diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
  textDocumentSync: { openClose: true, change: 2 },
}
const context = { root: 'C:\\project', solution: 'Project.sln' }
const document = { textDocument: { uri: 'file:///C:/project/Program.cs' }, position: { line: 1, character: 2 } }
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const disposables: Array<() => void | Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  for (const dispose of disposables.splice(0).reverse()) await dispose()
})

function pair(onFailure: () => void = () => {}) {
  const input = new PassThrough(), output = new PassThrough()
  const server = createMessageConnection(new StreamMessageReader(output), new StreamMessageWriter(input))
  const client = new LspConnection(input, output, onFailure)
  server.listen()
  disposables.push(() => { client.dispose(); server.dispose(); input.destroy(); output.destroy() })
  return { client, server, input, output }
}
async function adapterPair() {
  const pairValue = pair()
  pairValue.server.onRequest('initialize', () => ({ capabilities }))
  let current = true
  const adapter = new CSharpLsAdapter(pairValue.client, 1, () => current)
  await adapter.initialize(context)
  return { ...pairValue, adapter, stale: () => { current = false } }
}

class FakeFactory implements CsharpProcessFactory {
  server!: MessageConnection
  process!: CsharpProcess
  observer!: (event: CsharpProcessEvent) => void
  failSpawn = false
  failCleanup = false
  failInitialize = false
  failShutdown = false
  cleanupCalls = 0
  spawnCalls = 0
  alive = false
  released = false
  order: string[] = []
  initializeOverride?: () => Promise<unknown>
  create(_provider: unknown, _context: unknown, observe: (event: CsharpProcessEvent) => void): CsharpProcess {
    this.spawnCalls++
    if (this.failSpawn) throw new Error('secret executable path')
    this.alive = true; this.released = false; this.observer = observe
    const exited = deferred()
    const stdout = new PassThrough(), stdin = new PassThrough()
    this.server = createMessageConnection(new StreamMessageReader(stdin), new StreamMessageWriter(stdout))
    this.server.onRequest('initialize', () => {
      this.order.push('initialize')
      if (this.failInitialize) throw new ResponseError(1, 'secret provider error')
      return this.initializeOverride?.() ?? { capabilities }
    })
    this.server.onNotification('initialized', () => { this.order.push('initialized') })
    this.server.onRequest('shutdown', () => {
      this.order.push('shutdown')
      if (this.failShutdown) throw new ResponseError(1, 'shutdown provider secret')
      return null
    })
    this.server.onNotification('exit', () => {
      this.order.push('exit'); this.alive = false; exited.resolve(); observe('exit')
    })
    this.server.listen()
    this.process = {
      stdout, stdin, exited: exited.promise, isAlive: () => this.alive, isReleased: () => this.released,
      close: async () => {
        this.cleanupCalls++
        if (this.failCleanup) throw new Error('native secret path')
        this.order.push('cleanup')
        this.alive = false
        exited.resolve()
        this.released = true
        this.server.dispose(); stdin.destroy(); stdout.destroy()
      },
    }
    return this.process
  }
  crash() { this.alive = false; this.observer('exit') }
}
function managerFixture() {
  const factory = new FakeFactory(), processes = new ProcessManager()
  const available = { state: 'AVAILABLE' as const, reason: null, warnings: [] }
  const manager = new LanguageServiceManager({ factory, processes,
    sdk: { detect: async () => ({ status: available, runtime: {
      executable: 'C:\\dotnet.exe', sdks: [{ version: '10.0.401', major: 10, prerelease: false }],
    } }) },
    provider: { detect: async () => ({ status: available,
      provider: { executable: 'C:\\csharp-ls.exe', version: '0.27.0' } }) },
  })
  disposables.push(async () => { factory.failCleanup = false; factory.failShutdown = false; await manager.dispose() })
  return { factory, processes, manager }
}

describe('Main internal JSON-RPC transport', () => {
  it('settles a request deadline and emits cancellation without waiting for a server response', async () => {
    const { client, server } = pair()
    const arrived = deferred(), cancelled = deferred(), response = deferred()
    server.onRequest('slow', (_params, token) => {
      token.onCancellationRequested(() => cancelled.resolve())
      arrived.resolve(); return response.promise
    })
    client.listen()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pending = expect(client.request('deadline', 'slow', {}, 100)).rejects.toMatchObject({ reason: 'timeout' })
    await arrived.promise
    await vi.advanceTimersByTimeAsync(100)
    await pending; await cancelled.promise
    expect(client.pendingCount).toBe(0)
  })
  it('correlates concurrent requests and sends notifications', async () => {
    const { client, server } = pair()
    const notification = deferred<unknown>()
    server.onRequest('echo', (params) => params)
    server.onNotification('note', (params) => notification.resolve(params))
    client.listen(); client.listen()
    expect(await Promise.all([client.request('a', 'echo', { value: 1 }), client.request('b', 'echo', { value: 2 })]))
      .toEqual([{ value: 1 }, { value: 2 }])
    await client.notify('note', { value: 3 })
    expect(await notification.promise).toEqual({ value: 3 })
  })
  it('normalizes JSON-RPC errors without leaking provider details', async () => {
    const { client, server } = pair()
    server.onRequest('fail', () => { throw new ResponseError(5, 'C:\\secret\\provider.exe', { token: 'secret' }) })
    client.listen()
    const error = await client.request('a', 'fail', {}).catch((error: unknown) => error)
    expect(serializeAppError(error)).toMatchObject({ details: { reason: 'protocol-error' } })
    expect(JSON.stringify(serializeAppError(error))).not.toContain('secret')
  })
  it('maps cancellation to the actual wire ID, settles immediately, ignores late responses', async () => {
    const { client, server } = pair()
    const started = deferred(), cancelled = deferred(), response = deferred<string>()
    server.onRequest('slow', (_params, token) => {
      token.onCancellationRequested(() => cancelled.resolve())
      started.resolve()
      return response.promise
    })
    server.onRequest('echo', () => 'current')
    client.listen()
    const pending = client.request('semantic-opaque-id', 'slow', {})
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'cancelled' })
    await started.promise
    client.cancel('semantic-opaque-id')
    await rejected; await cancelled.promise
    expect(client.pendingCount).toBe(0)
    response.resolve('late')
    expect(await client.request('next', 'echo', {})).toBe('current')
  })
  it('rejects duplicate operation identity and settles every request on dispose', async () => {
    const { client, server } = pair()
    const arrived = deferred(), response = deferred()
    server.onRequest('slow', () => { arrived.resolve(); return response.promise })
    client.listen()
    const first = client.request('same', 'slow', {})
    const rejected = expect(first).rejects.toMatchObject({ reason: 'closed' })
    await arrived.promise
    await expect(client.request('same', 'slow', {})).rejects.toMatchObject({ reason: 'busy' })
    client.dispose(); client.dispose()
    await rejected
    await expect(client.request('new', 'slow', {})).rejects.toMatchObject({ reason: 'closed' })
  })
  it('settles pending work on stream close', async () => {
    const { client, server, input } = pair()
    const arrived = deferred(), response = deferred()
    server.onRequest('slow', () => { arrived.resolve(); return response.promise })
    client.listen()
    const pending = expect(client.request('a', 'slow', {})).rejects.toMatchObject({ reason: 'closed' })
    await arrived.promise
    input.end()
    await pending
  })
  it('isolates malformed JSON framing by closing the transport', async () => {
    const failed = deferred()
    const { client, input } = pair(() => failed.resolve())
    client.listen()
    input.write('Content-Length: 1\r\n\r\n{')
    await failed.promise
    await expect(client.request('a', 'any', {})).rejects.toMatchObject({ reason: 'closed' })
  })
})

describe('CSharpLsAdapter', () => {
  it('orders initialize before initialized and advertises only supported client features', async () => {
    const { client, server } = pair()
    const initialized = deferred()
    let params: unknown
    server.onRequest('initialize', (value) => { params = value; return { capabilities } })
    server.onNotification('initialized', () => initialized.resolve())
    const adapter = new CSharpLsAdapter(client, 1, () => true)
    expect(adapter.effectiveCapabilities(true)).toEqual([])
    await adapter.initialize(context); await initialized.promise
    expect(params).toMatchObject({ capabilities: {
      general: { positionEncodings: ['utf-16'] },
      textDocument: { completion: { dynamicRegistration: false, completionItem: { snippetSupport: false } } },
    } })
    expect(adapter.serverCapabilities).toMatchObject({ completionResolve: true, incrementalSync: true })
    expect(adapter.effectiveCapabilities(true)).toHaveLength(5)
    expect(adapter.effectiveCapabilities(false)).toEqual([])
    const copy = adapter.initializeResult!
    copy.capabilities.hoverProvider = false
    expect(adapter.initializeResult!.capabilities.hoverProvider).toBe(true)
  })
  it.each(['completionProvider', 'hoverProvider', 'signatureHelpProvider', 'definitionProvider',
    'diagnosticProvider', 'textDocumentSync'])('rejects missing %s as a decision gate', (key) => {
    const c: Record<string, unknown> = { ...capabilities }
    delete c[key]
    expect(() => inspectCsharpCapabilities({ capabilities: c })).toThrow(expect.objectContaining({ reason: 'capability-mismatch' }))
  })
  it('rejects incompatible encoding and absent resolve support', () => {
    expect(() => inspectCsharpCapabilities({ capabilities: { ...capabilities, positionEncoding: 'utf-8' } })).toThrow()
    expect(() => inspectCsharpCapabilities({ capabilities: { ...capabilities, completionProvider: {} } })).toThrow()
  })
  it('handles configuration, progress, refresh and only watched-file registrations', async () => {
    const { server, adapter } = await adapterPair()
    expect(await server.sendRequest('workspace/configuration', { items: [{}] }))
      .toEqual([{ analyzersEnabled: false, useMetadataUris: false, razorSupport: false }])
    expect(await server.sendRequest('window/workDoneProgress/create', { token: 'load' })).toBeNull()
    await server.sendRequest('client/registerCapability', { registrations: [{
      id: 'watch', method: 'workspace/didChangeWatchedFiles', registerOptions: { watchers: [{ globPattern: '**/*.cs', kind: 7 }] },
    }] })
    expect(adapter.watchedFileRegistrations.size).toBe(1)
    await expect(server.sendRequest('client/registerCapability', { registrations: [
      { id: 'second', method: 'workspace/didChangeWatchedFiles', registerOptions: { watchers: [] } },
      { id: 'rename', method: 'textDocument/rename', registerOptions: {} },
    ] })).rejects.toMatchObject({ code: ErrorCodes.InvalidParams })
    expect(adapter.watchedFileRegistrations.size).toBe(1)
    await expect(server.sendRequest('workspace/applyEdit', { edit: {} })).rejects.toMatchObject({ code: ErrorCodes.MethodNotFound })
    await server.sendRequest('client/unregisterCapability', { unregisterations: [{ id: 'watch', method: 'workspace/didChangeWatchedFiles' }] })
    expect(adapter.watchedFileRegistrations.size).toBe(0)
    await server.sendRequest('workspace/diagnostic/refresh')
    await server.sendRequest('workspace/semanticTokens/refresh')
    expect(adapter.diagnosticRefreshRevision).toBe(1)
    await server.sendNotification('window/logMessage', { message: 'workspace failed C:\\private' })
    expect(adapter.effectiveCapabilities(true)).toHaveLength(5)
  })
  it('keeps completion data behind opaque handles and invalidates them on document change', async () => {
    const { server, adapter } = await adapterPair()
    const data = { secret: 'provider-state' }
    server.onRequest('textDocument/completion', () => [{ label: 'Test', data }])
    server.onRequest('completionItem/resolve', (item) => {
      expect(item.data).toEqual(data)
      return { ...item, detail: 'resolved' }
    })
    const result = await adapter.completion('c', document)
    expect(JSON.stringify(result)).not.toContain('provider-state')
    expect(await adapter.resolveCompletion('r', result.items[0].handle)).toEqual({ label: 'Test', detail: 'resolved' })
    await adapter.didChange({ textDocument: { uri: document.textDocument.uri, version: 2 }, contentChanges: [] })
    await expect(adapter.resolveCompletion('r2', result.items[0].handle)).rejects.toMatchObject({ reason: 'invalid-handle' })
  })
  it('maps hover/signature/definition and raw notification primitives', async () => {
    const { server, adapter } = await adapterPair()
    for (const method of ['hover', 'signatureHelp', 'definition']) server.onRequest('textDocument/' + method, (params) => {
      expect(params).toEqual(document); return null
    })
    expect(await adapter.hover('h', document)).toBeNull()
    expect(await adapter.signatureHelp('s', document)).toBeNull()
    expect(await adapter.definition('d', document)).toBeNull()
    const seen: string[] = [], done = deferred()
    for (const method of ['didOpen', 'didChange', 'didSave', 'didClose']) {
      server.onNotification('textDocument/' + method, () => { seen.push(method) })
    }
    server.onNotification('workspace/didChangeWatchedFiles', () => { seen.push('watch'); done.resolve() })
    await adapter.didOpen({ textDocument: { uri: document.textDocument.uri, languageId: 'csharp', version: 1, text: '😀' } })
    await adapter.didChange({ textDocument: { uri: document.textDocument.uri, version: 2 }, contentChanges: [] })
    await adapter.didSave({ textDocument: document.textDocument })
    await adapter.didClose({ textDocument: document.textDocument })
    await adapter.didChangeWatchedFiles({ changes: [] })
    await done.promise
    expect(seen).toEqual(['didOpen', 'didChange', 'didSave', 'didClose', 'watch'])
  })
  it('retains diagnostic resultId privately across unchanged reports', async () => {
    const { server, adapter } = await adapterPair()
    let requests = 0
    server.onRequest('textDocument/diagnostic', (params): unknown => {
      requests++
      if (requests === 1) { expect(params.previousResultId).toBeUndefined(); return { kind: 'full', resultId: 'secret', items: [] } }
      expect(params.previousResultId).toBe('secret')
      return { kind: 'unchanged', resultId: 'next' }
    })
    expect(await adapter.documentDiagnostics('d1', document.textDocument.uri)).toEqual([])
    expect(await adapter.documentDiagnostics('d2', document.textDocument.uri)).toEqual([])
  })
  it('rejects stale generation and document-revision responses', async () => {
    const { server, adapter, stale } = await adapterPair()
    const arrived = deferred(), response = deferred<null>()
    server.onRequest('textDocument/hover', () => { arrived.resolve(); return response.promise })
    const pending = adapter.hover('h', document)
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'stale-session' })
    await arrived.promise
    await adapter.didChange({ textDocument: { uri: document.textDocument.uri, version: 2 }, contentChanges: [] })
    response.resolve(null); await rejected
    stale()
    await expect(adapter.hover('next', document)).rejects.toMatchObject({ reason: 'stale-session' })
    expect(adapter.effectiveCapabilities(true)).toEqual([])
  })
  it('5.5G retains result IDs across changes, replaces full reports, and resets on close/refresh', async () => {
    const { server, adapter } = await adapterPair(), uri = document.textDocument.uri
    const item = { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'Expected ;', severity: 1 }
    const received: Array<{ identifier?: string; previousResultId?: string }> = []
    let report: unknown = { kind: 'full', resultId: 'main-only', items: [item] }
    server.onRequest('textDocument/diagnostic', params => { received.push(params); return report })
    expect(await adapter.documentDiagnosticReport('full', uri)).toEqual({ kind: 'full', items: [item] })
    expect(received[0].identifier).toBe('csharp-ls')
    await adapter.didChange({ textDocument: { uri, version: 2 }, contentChanges: [] })
    report = { kind: 'unchanged', resultId: 'next-main-only' }
    expect(await adapter.documentDiagnosticReport('unchanged', uri)).toEqual({ kind: 'unchanged', items: [item] })
    expect(received.at(-1)?.previousResultId).toBe('main-only')
    report = { kind: 'full', resultId: 'empty', items: [] }
    expect(await adapter.documentDiagnosticReport('empty', uri)).toEqual({ kind: 'full', items: [] })
    const refresh = vi.fn(), remove = adapter.subscribeDiagnosticsRefresh(refresh)
    await server.sendRequest('workspace/diagnostic/refresh')
    expect(refresh).toHaveBeenCalledOnce()
    await adapter.documentDiagnosticReport('refresh', uri)
    expect(received.at(-1)?.previousResultId).toBeUndefined()
    remove(); await server.sendRequest('workspace/diagnostic/refresh'); expect(refresh).toHaveBeenCalledOnce()
    await adapter.documentDiagnosticReport('before-close', uri)
    await adapter.didClose({ textDocument: { uri } })
    await adapter.documentDiagnosticReport('after-close', uri)
    expect(received.at(-1)?.previousResultId).toBeUndefined()
  })
  it('rejects malformed completion and diagnostic reports', async () => {
    const { server, adapter } = await adapterPair()
    server.onRequest('textDocument/completion', () => ({ items: [null] }))
    server.onRequest('textDocument/diagnostic', () => ({ kind: 'unchanged', resultId: 'unknown' }))
    await expect(adapter.completion('c', document)).rejects.toMatchObject({ reason: 'invalid-response' })
    await expect(adapter.documentDiagnostics('d', document.textDocument.uri)).rejects.toMatchObject({ reason: 'invalid-response' })
  })
  it('isolates malformed hover/signature/definition responses without breaking the session', async () => {
    const { server, adapter } = await adapterPair()
    server.onRequest('textDocument/hover', () => 123)
    server.onRequest('textDocument/signatureHelp', () => ({ signatures: [null] }))
    server.onRequest('textDocument/definition', () => [{ uri: 'file:///C:/private', range: null }])
    await expect(adapter.hover('h', document)).rejects.toMatchObject({ reason: 'invalid-response' })
    await expect(adapter.signatureHelp('s', document)).rejects.toMatchObject({ reason: 'invalid-response' })
    await expect(adapter.definition('d', document)).rejects.toMatchObject({ reason: 'invalid-response' })
    expect(adapter.effectiveCapabilities(true)).toHaveLength(5)
  })
})

describe('LanguageServiceManager ownership and lifecycle', () => {
  it('does bounded forced cleanup when the shutdown request never returns', async () => {
    const { manager, factory, processes } = managerFixture()
    await manager.start(context)
    const arrived = deferred(), response = deferred()
    factory.server.onRequest('shutdown', () => { arrived.resolve(); return response.promise })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stopped = expect(manager.stop()).rejects.toMatchObject({ reason: 'timeout' })
    await arrived.promise
    await vi.advanceTimersByTimeAsync(5000)
    await stopped
    expect(manager.state).toBe('STOPPED')
    expect(processes.size).toBe(0)
  })
  it('keeps the prior adapter stale after an explicitly started new session', async () => {
    const { manager } = managerFixture()
    const old = await manager.start(context)
    await manager.stop()
    const current = await manager.start(context)
    expect(current.generation).not.toBe(old.generation)
    await expect(old.hover('old', document)).rejects.toMatchObject({ reason: 'stale-session' })
    expect(current.effectiveCapabilities(true)).toHaveLength(5)
  })
  it('retains ownership if initialize and cleanup both fail', async () => {
    const { manager, factory, processes } = managerFixture()
    factory.failInitialize = true; factory.failCleanup = true
    await expect(manager.start(context)).rejects.toMatchObject({ reason: 'cleanup-failed' })
    expect(manager.state).toBe('CRASHED')
    expect(processes.size).toBe(1)
    factory.failCleanup = false
    await manager.dispose()
    expect(processes.size).toBe(0)
  })
  it('starts one session, captures capabilities, shuts down in protocol order and releases ownership', async () => {
    const { manager, factory, processes } = managerFixture()
    const starting = manager.start(context)
    expect(manager.state).toBe('STARTING')
    const adapter = await starting
    expect(manager.state).toBe('RUNNING')
    expect(processes.size).toBe(1)
    await expect(manager.start(context)).rejects.toMatchObject({ reason: 'busy' })
    const stop = manager.stop()
    expect(manager.stop()).toBe(stop)
    await stop
    expect(factory.order).toEqual(['initialize', 'initialized', 'shutdown', 'exit', 'cleanup'])
    expect(manager.state).toBe('STOPPED')
    expect(processes.size).toBe(0)
    await expect(adapter.hover('old', document)).rejects.toMatchObject({ reason: 'stale-session' })
    await manager.dispose(); await manager.dispose()
  })
  it.each(['failSpawn', 'failInitialize'] as const)('does not leave false RUNNING on %s', async (failure) => {
    const { manager, factory, processes } = managerFixture()
    factory[failure] = true
    await expect(manager.start(context)).rejects.toBeDefined()
    expect(manager.state).toBe('CRASHED')
    expect(processes.size).toBe(0)
    expect(manager.cleanupPending).toBe(false)
  })
  it('cancels initialization on stop without starting a replacement', async () => {
    const { manager, factory } = managerFixture()
    const arrived = deferred(), initialized = deferred<unknown>()
    factory.initializeOverride = () => { arrived.resolve(); return initialized.promise }
    const starting = manager.start(context)
    const rejected = expect(starting).rejects.toMatchObject({ reason: 'stale-session' })
    await arrived.promise
    await manager.stop(); await rejected
    expect(manager.state).toBe('STOPPED')
    expect(factory.spawnCalls).toBe(1)
  })
  it('settles pending requests on crash, retains failed cleanup, and never restarts automatically', async () => {
    const { manager, factory, processes } = managerFixture()
    const adapter = await manager.start(context)
    const arrived = deferred(), response = deferred<null>()
    factory.server.onRequest('textDocument/hover', () => { arrived.resolve(); return response.promise })
    const pending = expect(adapter.hover('pending', document)).rejects.toBeDefined()
    await arrived.promise
    factory.failCleanup = true
    factory.crash()
    await pending
    expect(manager.state).toBe('CRASHED')
    await expect(manager.stop()).rejects.toMatchObject({ reason: 'cleanup-failed' })
    expect(manager.cleanupPending).toBe(true)
    expect(processes.size).toBe(1)
    expect(manager.lastCleanupError?.reason).toBe('cleanup-failed')
    await expect(manager.start(context)).rejects.toMatchObject({ reason: 'busy' })
    factory.failCleanup = false
    await manager.stop()
    expect(manager.state).toBe('STOPPED')
    expect(processes.size).toBe(0)
    expect(factory.spawnCalls).toBe(1)
  })
  it('retains ownership on graceful cleanup failure and supports owner cleanup retry', async () => {
    const { manager, factory, processes } = managerFixture()
    await manager.start(context)
    factory.failCleanup = true
    await expect(processes.stop()).rejects.toBeDefined()
    expect(manager.state).toBe('CRASHED')
    expect(processes.size).toBe(1)
    factory.failCleanup = false
    await processes.stop()
    expect(processes.size).toBe(0)
    expect(manager.state).toBe('STOPPED')
  })
  it('cleans the Job even when shutdown fails, reporting the protocol error', async () => {
    const { manager, factory, processes } = managerFixture()
    await manager.start(context)
    factory.failShutdown = true
    await expect(manager.stop()).rejects.toMatchObject({ reason: 'protocol-error' })
    expect(factory.order).not.toContain('exit')
    expect(manager.state).toBe('STOPPED')
    expect(processes.size).toBe(0)
  })
  it('preserves dependency failure separately from STOPPED lifecycle', async () => {
    const { factory, processes } = managerFixture()
    const missing = { state: 'MISSING' as const, reason: 'DOTNET_SDK_MISSING' as const, warnings: [] }
    const manager = new LanguageServiceManager({ factory, processes,
      sdk: { detect: async () => ({ status: missing, runtime: null }) },
      provider: { detect: async () => { throw new Error('must not probe') } },
    })
    await expect(manager.start(context)).rejects.toMatchObject({ reason: 'startup-failed' })
    expect(manager.state).toBe('STOPPED')
    expect(manager.dependency).toEqual(missing)
    expect(factory.spawnCalls).toBe(0)
  })
})
