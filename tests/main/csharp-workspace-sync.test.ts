import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { CsharpWorkspace, type WorkspaceCommands } from '../../src/main/services/language/csharp-workspace'
import { CsharpWorkspaceStore } from '../../src/main/services/language/csharp-workspace-store'
import { CsharpDocumentSync } from '../../src/main/services/language/csharp-document-sync'
import { DocumentSyncQueue } from '../../src/main/services/language/document-sync-queue'
import { CsharpWatchedFiles } from '../../src/main/services/language/csharp-watched-files'
import { CsharpWorkspaceSession, type WorkspaceLanguageManager } from '../../src/main/services/language/csharp-workspace-session'
import { CsharpOwnerLifecycle } from '../../src/main/services/language/csharp-owner-lifecycle'
import { EventEmitter } from 'node:events'

const cleanups: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const evaluation = JSON.stringify({ Properties: { TargetFramework: 'net10.0', TargetFrameworks: '',
  TargetFrameworkIdentifier: '.NETCoreApp', TargetFrameworkVersion: 'v10.0' }, Items: { ProjectReference: [] } })
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function fixture(paths: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'csharp-sync-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), '') }
  const projects = new ProjectService()
  const project = await projects.openRoot(root)
  const files = new FileSystemService(projects, { watchFactory: () => ({ close() {} }), trashItem: async () => {} })
  files.start()
  cleanups.push(() => { files.stop(); return projects.stop() })
  return { root, project: projects.getAuthorizedProject(project.id), projects, files }
}
async function workspaceFixture(paths: string[], saved?: string) {
  const f = await fixture(paths)
  const store = { read: vi.fn(async () => saved), select: vi.fn(async () => {}) }
  const commands: WorkspaceCommands = { stop: vi.fn(async () => {}), execute: vi.fn(async (args) => ({ exitCode: 0,
    stdout: args[0] === '--version' ? '10.0.401' : args[0] === 'sln' ? 'Project(s)\n----------\nApp.csproj\n' : evaluation })) }
  const workspace = new CsharpWorkspace(f.files, store, commands)
  const signal = new AbortController().signal
  return { ...f, store, commands, workspace, prepare: () => workspace.prepare(f.project, signal), signal }
}

describe('C# workspace policy and structured preflight', () => {
  it.each(['sln', 'slnx'])('discovers and auto-selects one .%s with the exact ordered preflight', async (extension) => {
    const f = await workspaceFixture(['App.' + extension, 'App.csproj'])
    expect(await f.prepare()).toEqual({ state: 'READY', mode: 'solution', solution: 'App.' + extension })
    const calls = vi.mocked(f.commands.execute).mock.calls
    expect(calls.map(([args]) => args[0])).toEqual(['--version', 'sln', 'msbuild'])
    expect(calls[2][0]).toEqual(['msbuild', join(f.project.canonicalRoot, 'App.csproj'), '-nologo', '-verbosity:quiet', '-interactive:false',
      '-nodeReuse:false', '-noAutoResponse', '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion',
      '-getItem:ProjectReference'])
  })
  it('reuses a saved solution; invalid saved selection falls back to choice', async () => {
    const f = await workspaceFixture(['App.sln', 'Other.slnx', 'App.csproj'], 'Other.slnx')
    expect(await f.prepare()).toMatchObject({ state: 'READY', solution: 'Other.slnx' })
    f.store.read.mockResolvedValue('../outside.sln')
    const result = await f.prepare()
    expect(result.state).toBe('SELECTION_REQUIRED')
    if (result.state !== 'SELECTION_REQUIRED') throw Error('expected choices')
    expect(result.candidates.map((candidate) => candidate.relativePath)).toEqual(['App.sln', 'Other.slnx'])
    expect(JSON.stringify(result)).not.toContain(f.root)
    const candidate = result.candidates[0]
    expect(Object.keys(candidate).sort()).toEqual(['candidateId', 'displayName', 'relativePath'])
    expect(await f.workspace.prepare(f.project, f.signal, candidate.candidateId)).toMatchObject({ state: 'READY', solution: 'App.sln' })
    expect(f.store.select).toHaveBeenCalledWith(f.project, 'App.sln')
    await expect(f.workspace.prepare(f.project, f.signal, candidate.candidateId)).rejects.toMatchObject({ reason: 'invalid-handle' })
  })
  it('falls back from invalid saved selection to a single solution', async () => {
    const f = await workspaceFixture(['App.sln', 'App.csproj'], 'gone.sln')
    expect(await f.prepare()).toMatchObject({ state: 'READY', solution: 'App.sln' })
  })
  it.each([['App.csproj'], ['App.csproj', 'Second.csproj']])('uses project mode for %j', async (...paths) => {
    const f = await workspaceFixture(paths)
    expect(await f.prepare()).toEqual({ state: 'READY', mode: 'project' })
    expect(vi.mocked(f.commands.execute).mock.calls.some(([args]) => args.includes('--solution'))).toBe(false)
    expect(vi.mocked(f.commands.execute).mock.calls.filter(([args]) => args[0] === 'msbuild')).toHaveLength(paths.length)
  })
  it('returns syntax-only with no solution/project and executes nothing', async () => {
    const f = await workspaceFixture(['Loose.cs'])
    expect(await f.prepare()).toEqual({ state: 'NO_CSHARP_WORKSPACE' })
    expect(f.commands.execute).not.toHaveBeenCalled()
  })
  it.each(['sln', 'slnx'])('rejects a broken .%s by exit status', async (extension) => {
    const f = await workspaceFixture(['App.' + extension, 'App.csproj'])
    vi.mocked(f.commands.execute).mockImplementation(async (args) => ({ exitCode: args[0] === 'sln' ? 1 : 0, stdout: '10.0.401' }))
    expect(await f.prepare()).toMatchObject({ state: 'PREFLIGHT_FAILED' })
    expect(vi.mocked(f.commands.execute).mock.calls).toHaveLength(2)
  })
  it.each(['malformed', 'invalid-json', 'missing-reference', 'escape-reference', 'global-sdk'])('fails closed: %s', async (failure) => {
    const f = await workspaceFixture(['App.csproj', 'global.json'])
    vi.mocked(f.commands.execute).mockImplementation(async (args) => {
      if (args[0] === '--version') return { exitCode: failure === 'global-sdk' ? 1 : 0, stdout: '10.0.401' }
      return { exitCode: failure === 'malformed' ? 1 : 0, stdout: failure === 'invalid-json' ? 'not JSON' : evaluation.replace('[]',
        JSON.stringify([{ Identity: failure === 'escape-reference' ? '../Outside.csproj' : 'Missing.csproj' }])) }
    })
    expect(await f.prepare()).toMatchObject({ state: 'PREFLIGHT_FAILED' })
  })
  it('rejects solution members outside the canonical root before evaluation', async () => {
    const f = await workspaceFixture(['App.sln'])
    vi.mocked(f.commands.execute).mockImplementation(async (args) => ({ exitCode: 0,
      stdout: args[0] === '--version' ? '10.0.401' : '../Outside.csproj' }))
    expect(await f.prepare()).toMatchObject({ state: 'PREFLIGHT_FAILED' })
    expect(vi.mocked(f.commands.execute).mock.calls).toHaveLength(2)
  })
  it('rejects canonical junction escape without following it during discovery', async () => {
    const f = await workspaceFixture(['App.sln'])
    const other = await fixture(['Outside.csproj'])
    await symlink(other.root, join(f.root, 'linked'), 'junction')
    vi.mocked(f.commands.execute).mockImplementation(async (args) => ({ exitCode: 0,
      stdout: args[0] === '--version' ? '10.0.401' : 'linked/Outside.csproj' }))
    expect(await f.prepare()).toMatchObject({ state: 'PREFLIGHT_FAILED' })
  })
  it('rejects stale preflight after invalidation', async () => {
    const f = await workspaceFixture(['App.csproj'])
    const started = deferred(), response = deferred<{ exitCode: number; stdout: string }>()
    vi.mocked(f.commands.execute).mockImplementation(() => { started.resolve(); return response.promise })
    const result = f.prepare()
    await started.promise
    f.workspace.invalidate(); response.resolve({ exitCode: 0, stdout: '10.0.401' })
    await expect(result).rejects.toMatchObject({ reason: 'stale-session' })
  })
  it('persists a project selection with backup and corruption recovery', async () => {
    const f = await fixture([])
    const directory = join(f.root, 'user-data')
    const store = new CsharpWorkspaceStore(directory)
    await store.select(f.project, 'App.sln'); await store.select(f.project, 'Second.slnx')
    expect(await new CsharpWorkspaceStore(directory).read(f.project)).toBe('Second.slnx')
    await writeFile(join(directory, f.project.id + '.json'), 'broken')
    expect(await new CsharpWorkspaceStore(directory).read(f.project)).toBe('App.sln')
    await store.stop()
  })
})

async function documentFixture() {
  const f = await fixture(['Đường dẫn # 😀.cs', 'Closed.cs'])
  const events: Array<{ method: string; params: unknown }> = []
  const transport = {
    didOpen: vi.fn(async (params) => { events.push({ method: 'open', params }) }),
    didChange: vi.fn(async (params) => { events.push({ method: 'change', params }) }),
    didSave: vi.fn(async (params) => { events.push({ method: 'save', params }) }),
    didClose: vi.fn(async (params) => { events.push({ method: 'close', params }) }),
  }
  let current = true
  const sync = new CsharpDocumentSync(f.project.id, transport, f.files, () => { if (!current) throw Error('stale') })
  cleanups.push(() => sync.invalidate())
  const handle = await sync.open('Đường dẫn # 😀.cs', 1, 'a😀b\r\nline', true)
  return { ...f, events, transport, sync, handle, stale: () => { current = false } }
}
const edit = (text: string) => [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } }, text }]
describe('ordered document synchronization', () => {
  it('preserves canonical URI casing across sync and semantic requests while rejecting Windows aliases', async () => {
    const f = await documentFixture()
    const file = await f.files.authorizeRunFile(f.project.id, f.handle.relativePath)
    const uri = pathToFileURL(file.canonicalFile).href
    expect(f.transport.didOpen.mock.calls[0][0].textDocument.uri).toBe(uri)
    expect(await f.sync.withFlushedDocument(f.handle, async (target) => target)).toBe(uri)
    if (process.platform === 'win32') {
      expect(f.sync.ownsUri(uri.toLowerCase())).toBe(true)
      await expect(f.sync.open(f.handle.relativePath.toUpperCase(), 1, '', false)).rejects.toMatchObject({ reason: 'busy' })
    }
    await f.sync.change(f.handle, 2, edit('AB'))
    await f.sync.saved(f.handle, 2)
    await f.sync.close(f.handle)
    for (const transport of [f.transport.didChange, f.transport.didSave, f.transport.didClose]) {
      expect(transport.mock.calls[0][0].textDocument.uri).toBe(uri)
    }
    expect(f.sync.ownsUri(uri)).toBe(false)
    await expect(f.sync.open(f.handle.relativePath, 3, '', false)).resolves.toBeDefined()
  })
  it('retains a deleted dirty buffer, rejects save, and reopens a renamed document with a fresh identity', async () => {
    const f = await documentFixture()
    await rename(join(f.root, f.handle.relativePath), join(f.root, 'Moved.cs'))
    expect(f.sync.snapshot(f.handle).dirty).toBe(true)
    expect(await f.sync.save(f.handle, 1)).toMatchObject({ diskSaved: false })
    expect(f.transport.didSave).not.toHaveBeenCalled()
    const text = f.sync.snapshot(f.handle).text
    await f.sync.close(f.handle)
    const moved = await f.sync.open('Moved.cs', 1, text, true)
    expect(() => f.sync.snapshot(f.handle)).toThrow()
    expect(f.sync.snapshot(moved)).toEqual({ text, version: 1, dirty: true })
    expect(f.events.map((event) => event.method)).toEqual(['open', 'close', 'open'])
    await rm(join(f.root, 'Moved.cs'))
    expect(await f.sync.save(moved, 1)).toMatchObject({ diskSaved: false })
    expect(f.sync.snapshot(moved).text).toBe(text)
  })
  it('translates rename/delete/create events and respects registration kind masks', async () => {
    const f = await documentFixture()
    const notifications: unknown[] = []
    const watched = { watchedFileRegistrations: new Map([['registration', { watchers: [{ globPattern: '**/*.cs', kind: 7 }] }]]),
      didChangeWatchedFiles: vi.fn(async (params) => { notifications.push(params) }) }
    const watcher = new CsharpWatchedFiles(f.project.id, f.project.canonicalRoot, f.files, watched, f.sync, () => {})
    await watcher.initialize()
    await rename(join(f.root, 'Closed.cs'), join(f.root, 'Renamed.cs'))
    await watcher.accept({ projectId: f.project.id, relativePath: 'Closed.cs', kind: 'renamed' })
    await watcher.accept({ projectId: f.project.id, relativePath: 'Renamed.cs', kind: 'renamed' })
    expect(notifications).toEqual([
      { changes: [{ uri: expect.stringContaining('/Closed.cs'), type: 3 }] },
      { changes: [{ uri: expect.stringContaining('/Renamed.cs'), type: 1 }] },
    ])
    watched.watchedFileRegistrations.set('registration', { watchers: [{ globPattern: '**/*.cs', kind: 2 }] })
    await writeFile(join(f.root, 'New.cs'), 'new')
    await watcher.accept({ projectId: f.project.id, relativePath: 'New.cs', kind: 'renamed' })
    expect(watched.didChangeWatchedFiles).toHaveBeenCalledTimes(2)
    await watcher.accept({ projectId: f.project.id, relativePath: 'New.cs', kind: 'changed' })
    expect(watched.didChangeWatchedFiles).toHaveBeenCalledTimes(3)
    await expect(watcher.accept({ projectId: f.project.id, relativePath: '../escape.cs', kind: 'changed' })).rejects.toThrow()
    watcher.invalidate()
  })
  it('serializes concurrent saves and preserves a newer dirty version', async () => {
    const f = await documentFixture()
    const entered = deferred(), release = deferred()
    const realWrite = f.files.write.bind(f.files)
    vi.spyOn(f.files, 'write').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; await realWrite(...args) })
    const first = f.sync.save(f.handle, 1)
    await entered.promise
    await f.sync.change(f.handle, 2, edit('AB'))
    const second = f.sync.save(f.handle, 2)
    await f.sync.change(f.handle, 3, edit('CD'))
    release.resolve()
    expect(await first).toEqual({ diskSaved: true })
    expect(await second).toEqual({ diskSaved: true })
    expect(await readFile(join(f.root, f.handle.relativePath), 'utf8')).toBe('aABb\r\nline')
    expect(f.sync.snapshot(f.handle)).toEqual({ version: 3, dirty: true, text: 'aCDb\r\nline' })
  })
  it('opens the authoritative buffer, retains every version, flushes before semantic work, and closes', async () => {
    const f = await documentFixture()
    const second = f.sync.change(f.handle, 2, edit('AB'))
    const third = f.sync.change(f.handle, 3, edit('CD'))
    expect(f.sync.snapshot(f.handle).text).toBe('aCDb\r\nline')
    expect(await f.sync.withFlushedDocument(f.handle, async (uri) => {
      expect(f.transport.didChange.mock.calls.map(([params]) => params.textDocument.version)).toEqual([2, 3])
      expect(uri).toContain('%23'); expect(uri).toContain('%F0%9F%98%80')
      return 'semantic'
    })).toBe('semantic')
    await Promise.all([second, third]); await f.sync.close(f.handle)
    expect(f.events.map((event) => event.method)).toEqual(['open', 'change', 'change', 'close'])
    expect(() => f.sync.snapshot(f.handle)).toThrow()
  })
  it('batches transport calls without collapsing entries', async () => {
    const batches: number[][] = []
    const queue = new DocumentSyncQueue<number>(async (batch) => { batches.push([...batch]) })
    const results = [queue.enqueue(2), queue.enqueue(3), queue.enqueue(4)]
    await queue.flush(); await Promise.all(results)
    expect(batches).toEqual([[2, 3, 4]])
  })
  it('rejects equal/decreasing versions and invalid UTF-16 positions without changing shadow', async () => {
    const f = await documentFixture()
    expect(() => f.sync.change(f.handle, 1, edit('AB'))).toThrow()
    expect(() => f.sync.change(f.handle, 0, edit('AB'))).toThrow()
    expect(() => f.sync.change(f.handle, 2, [{ range: { start: { line: 9, character: 0 }, end: { line: 9, character: 0 } }, text: '' }])).toThrow()
    expect(f.sync.snapshot(f.handle).version).toBe(1)
  })
  it('applies multiple incremental edits within a version', async () => {
    const f = await documentFixture()
    await f.sync.change(f.handle, 2, [...edit('AB'), { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }, text: 'Việt' }])
    expect(f.sync.snapshot(f.handle).text).toBe('aABb\r\nViệt')
    expect(f.transport.didChange.mock.calls[0][0].contentChanges).toHaveLength(2)
  })
  it('sends didSave only after successful disk write; language failure does not dirty it again', async () => {
    const f = await documentFixture()
    f.transport.didSave.mockImplementation(async () => {
      expect(await readFile(join(f.root, f.handle.relativePath), 'utf8')).toBe('a😀b\r\nline')
      throw Error('transport failed')
    })
    expect(await f.sync.save(f.handle, 1)).toMatchObject({ diskSaved: true, languageError: { reason: 'protocol-error' } })
    expect(f.sync.snapshot(f.handle).dirty).toBe(false)
  })
  it('never sends didSave after a failed disk write', async () => {
    const f = await documentFixture()
    vi.spyOn(f.files, 'write').mockRejectedValue(Error('disk failed'))
    expect(await f.sync.save(f.handle, 1)).toMatchObject({ diskSaved: false })
    expect(f.transport.didSave).not.toHaveBeenCalled()
    expect(f.sync.snapshot(f.handle).dirty).toBe(true)
  })
  it('rejects stale project, document and semantic results after an edit', async () => {
    const f = await documentFixture()
    expect(() => f.sync.snapshot({ ...f.handle })).toThrow()
    const entered = deferred(), response = deferred<string>()
    const semantic = f.sync.withFlushedDocument(f.handle, () => { entered.resolve(); return response.promise })
    await entered.promise
    await f.sync.change(f.handle, 2, edit('AB'))
    response.resolve('old')
    await expect(semantic).rejects.toMatchObject({ reason: 'stale-document' })
    f.sync.invalidate()
    expect(() => f.sync.change(f.handle, 3, edit('CD'))).toThrow()
  })
  it('preserves open dirty shadow over disk watcher, delivers closed changes only while registered', async () => {
    const f = await documentFixture()
    const watched = { watchedFileRegistrations: new Map([['registration', { watchers: [{ globPattern: '**/*.cs', kind: 7 }] }]]),
      didChangeWatchedFiles: vi.fn(async () => {}) }
    const watcher = new CsharpWatchedFiles(f.project.id, f.root, f.files, watched, f.sync, () => {})
    await watcher.initialize()
    await writeFile(join(f.root, f.handle.relativePath), 'disk')
    await watcher.accept({ projectId: f.project.id, relativePath: f.handle.relativePath, kind: 'changed' })
    expect(f.sync.snapshot(f.handle).text).toBe('a😀b\r\nline')
    expect(watched.didChangeWatchedFiles).not.toHaveBeenCalled()
    await watcher.accept({ projectId: f.project.id, relativePath: 'Closed.cs', kind: 'changed' })
    expect(watched.didChangeWatchedFiles).toHaveBeenCalledTimes(1)
    watched.watchedFileRegistrations.clear()
    await watcher.accept({ projectId: f.project.id, relativePath: 'Closed.cs', kind: 'changed' })
    expect(watched.didChangeWatchedFiles).toHaveBeenCalledTimes(1)
    watcher.invalidate()
    await expect(watcher.accept({ projectId: f.project.id, relativePath: 'Closed.cs', kind: 'changed' })).rejects.toThrow()
  })
})

async function sessionFixture() {
  const f = await workspaceFixture(['App.csproj', 'Open.cs'])
  const adapter = { didOpen: vi.fn(async () => {}), didChange: vi.fn(async () => {}), didSave: vi.fn(async () => {}),
    didClose: vi.fn(async () => {}), didChangeWatchedFiles: vi.fn(async () => {}), watchedFileRegistrations: new Map() }
  const manager: { -readonly [K in keyof WorkspaceLanguageManager]: WorkspaceLanguageManager[K] } = {
    state: 'STOPPED',
    start: vi.fn(async () => { manager.state = 'RUNNING'; return adapter }),
    stop: vi.fn(async () => { manager.state = 'STOPPED' }),
  }
  let fileListener!: Parameters<FileSystemService['subscribe']>[0]
  vi.spyOn(f.files, 'subscribe').mockImplementation((listener) => { fileListener = listener; return () => {} })
  const report = vi.fn()
  const session = new CsharpWorkspaceSession(f.projects, f.files, f.workspace, manager, f.commands, report)
  session.start()
  cleanups.push(() => session.stop())
  return { ...f, adapter, manager, session, report,
    emitFile: (relativePath: string) => fileListener({ projectId: f.project.id, relativePath, kind: 'changed' }) }
}
describe('workspace session and Main owner lifecycle', () => {
  it('cancels queued watcher work quietly on owner loss while still reporting live I/O failures', async () => {
    const f = await sessionFixture(), entered = deferred(), release = deferred()
    await f.session.ensure(f.project.id)
    const stat = await f.files.stat(f.project.id, 'Open.cs')
    vi.spyOn(f.files, 'stat').mockImplementationOnce(async () => { entered.resolve(); await release.promise; return stat })
    f.emitFile('Open.cs')
    await entered.promise
    await f.session.invalidate()
    release.resolve()
    await new Promise<void>((done) => setImmediate(done))
    expect(f.report).not.toHaveBeenCalled()
    await f.session.ensure(f.project.id)
    const failure = Error('live disk failure')
    vi.mocked(f.files.stat).mockRejectedValueOnce(failure)
    f.emitFile('Open.cs')
    await new Promise<void>((done) => setImmediate(done))
    expect(f.report).toHaveBeenCalledExactlyOnceWith(failure)
  })
  it('invalidates pending provider startup on project close and permits a fresh session after cleanup', async () => {
    const f = await sessionFixture(), entered = deferred(), release = deferred()
    vi.mocked(f.manager.start).mockImplementationOnce(async () => {
      entered.resolve(); await release.promise
      return f.adapter
    })
    vi.mocked(f.manager.stop).mockImplementation(async () => { release.resolve(); f.manager.state = 'STOPPED' })
    const pending = f.session.ensure(f.project.id)
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'stale-session' })
    await entered.promise
    await f.projects.closeProject()
    await rejected
    expect(() => f.session.sync).toThrow()
    const reopened = await f.projects.openRoot(f.root)
    expect(await f.session.ensure(reopened.id)).toMatchObject({ state: 'READY' })
    await f.session.stop()
    await expect(f.session.ensure(reopened.id)).rejects.toMatchObject({ reason: 'closed' })
  })
  it('invalidates the session when the canonical project root becomes unavailable', async () => {
    const f = await sessionFixture()
    await f.session.ensure(f.project.id)
    const sync = f.session.sync, handle = await sync.open('Open.cs', 1, 'dirty', true)
    const moved = f.root + '-moved'
    await rename(f.root, moved)
    cleanups.push(() => rm(moved, { recursive: true, force: true }))
    await expect(f.files.listDirectory(f.project.id, '')).rejects.toThrow()
    expect(() => sync.snapshot(handle)).toThrow()
    expect(f.manager.stop).toHaveBeenCalled()
  })
  it('starts lazily once, reuses the session, and invalidates old documents on project switch', async () => {
    const f = await sessionFixture()
    expect(f.manager.start).not.toHaveBeenCalled()
    expect(await f.session.ensure(f.project.id)).toMatchObject({ state: 'READY' })
    const old = f.session.sync
    const handle = await old.open('Open.cs', 1, 'dirty', true)
    await f.session.ensure(f.project.id)
    expect(f.manager.start).toHaveBeenCalledTimes(1)
    const other = await fixture(['Next.csproj'])
    await f.projects.openRoot(other.root)
    expect(() => old.snapshot(handle)).toThrow()
    expect(f.manager.stop).toHaveBeenCalled()
    expect(await f.session.ensure(f.projects.getActiveProject()!.id)).toMatchObject({ state: 'READY' })
    expect(f.manager.start).toHaveBeenCalledTimes(2)
  })
  it('lets switching continue after cleanup failure but blocks a conflicting start', async () => {
    const f = await sessionFixture()
    await f.session.ensure(f.project.id)
    vi.mocked(f.manager.stop).mockRejectedValue(Error('owned child retained'))
    const other = await fixture(['Next.csproj'])
    await f.projects.openRoot(other.root)
    await expect(f.session.ensure(f.projects.getActiveProject()!.id)).rejects.toMatchObject({ reason: 'cleanup-failed' })
    expect(f.manager.start).toHaveBeenCalledTimes(1)
    vi.mocked(f.manager.stop).mockImplementation(async () => { f.manager.state = 'STOPPED' })
    await f.session.invalidate()
  })
  it('rejects old document work after crash, with no automatic restart, and permits a new project session', async () => {
    const f = await sessionFixture()
    await f.session.ensure(f.project.id)
    const old = f.session.sync, handle = await old.open('Open.cs', 1, 'text', false)
    f.manager.state = 'CRASHED'
    expect(() => old.change(handle, 2, edit('AB'))).toThrow()
    await expect(f.session.ensure(f.project.id)).rejects.toMatchObject({ reason: 'not-running' })
    expect(f.manager.start).toHaveBeenCalledTimes(1)
    await f.session.invalidate()
    await f.session.ensure(f.project.id)
    expect(() => old.snapshot(handle)).toThrow()
    expect(f.manager.start).toHaveBeenCalledTimes(2)
  })
  it('does not start a provider after failed preflight', async () => {
    const f = await sessionFixture()
    vi.mocked(f.commands.execute).mockResolvedValue({ exitCode: 1, stdout: '' })
    expect(await f.session.ensure(f.project.id)).toMatchObject({ state: 'PREFLIGHT_FAILED' })
    expect(f.manager.start).not.toHaveBeenCalled()
  })
  it('cancels pending preflight before waiting for cleanup', async () => {
    const f = await sessionFixture()
    const entered = deferred()
    vi.mocked(f.commands.execute).mockImplementation((_args, _cwd, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }); entered.resolve()
    }))
    const pending = f.session.ensure(f.project.id)
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'stale-session' })
    await entered.promise
    await f.session.invalidate(); await rejected
    expect(f.manager.start).not.toHaveBeenCalled()
  })
  it('main-frame navigation and owner crash invalidate; remount/in-page/subframe navigation do not', async () => {
    const invalidate = vi.fn(async () => {})
    const lifecycle = new CsharpOwnerLifecycle({ invalidate }, vi.fn())
    const owner = Object.assign(new EventEmitter(), { id: 1 })
    lifecycle.observe(owner)
    lifecycle.observe(owner)
    owner.emit('react-remount')
    owner.emit('did-start-navigation', {}, 'url', true, true)
    owner.emit('did-start-navigation', {}, 'url', false, false)
    expect(invalidate).not.toHaveBeenCalled()
    owner.emit('did-start-navigation', {}, 'url', false, true)
    owner.emit('render-process-gone')
    expect(invalidate).toHaveBeenCalledTimes(2)
    owner.emit('destroyed')
    expect(invalidate).toHaveBeenCalledTimes(3)
    expect(owner.eventNames()).toEqual([])
    lifecycle.stop()
  })
})
