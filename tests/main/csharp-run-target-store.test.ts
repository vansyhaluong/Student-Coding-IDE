import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile, readdir, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CSharpProjectRunTarget } from '../../src/shared/contracts/run'
import { validateCSharpRunTargetResolution } from '../../src/shared/contracts/run'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { DotnetRunRuntimeResolver } from '../../src/main/services/dependencies/dotnet-run-runtime'
import { CsharpRunPreflight } from '../../src/main/services/run/csharp-run-preflight'
import { RUN_EVALUATION_PROPERTIES, type RunSdkProbe } from '../../src/main/services/run/csharp-run-probe'
import { CsharpRunTargetResolver } from '../../src/main/services/run/csharp-run-target-resolver'
import { CsharpRunTargetStore, type CsharpRunSelectionResult } from '../../src/main/services/run/csharp-run-target-store'
import type { PersistenceFileSystem } from '../../src/main/services/persistence/persistence-service'

const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop() })
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function fixture(paths = ['A.csproj', 'B.csproj'], backend?: PersistenceFileSystem) {
  const temp = await mkdtemp(join(tmpdir(), 'run-selection-')), root = join(temp, 'Project Việt # 😀')
  cleanup.push(() => rm(temp, { recursive: true, force: true }))
  const put = async (base: string, path: string) => { await mkdir(dirname(join(base, path)), { recursive: true }); await writeFile(join(base, path), '') }
  await mkdir(root, { recursive: true })
  for (const path of paths) await put(root, path)
  const projects = new ProjectService(), project = await projects.openRoot(root)
  const files = new FileSystemService(projects, { watchFactory: () => ({ close() {} }), trashItem: async () => {} })
  files.start(); cleanup.push(() => { files.stop(); return projects.stop() })
  const facts = new Map<string, Record<string, string>>()
  const execute = vi.fn<RunSdkProbe['execute']>(async (_exe, command) => ({ exitCode: 0, stderr: '',
    stdout: command.kind === 'inventory' ? '8.0.410 [C:\\dotnet\\sdk]'
      : command.kind === 'version' ? '8.0.410' : JSON.stringify({ Properties: {
        ...Object.fromEntries(RUN_EVALUATION_PROPERTIES.map(p => [p, ''])), OutputType: 'Exe', TargetFramework: 'net8.0',
        UsingMicrosoftNETSdk: 'true', TargetFrameworkIdentifier: '.NETCoreApp', TargetFrameworkVersion: 'v8.0',
        ...(command.kind === 'evaluate' ? facts.get(command.project.toLowerCase()) : {}),
      }, Items: { ProjectReference: [] } }) }))
  const sdk = new DotnetRunRuntimeResolver({ execute }, { PATH: 'C:\\dotnet' },
    { resolveFile: async path => path }, async () => 'valid-or-absent')
  const resolver = new CsharpRunTargetResolver(projects, files, new CsharpRunPreflight(files, sdk, { execute }))
  const directory = join(temp, 'app-data')
  const create = () => {
    const store = new CsharpRunTargetStore(directory, projects, files, resolver, backend)
    cleanup.push(() => store.stop()); return store
  }
  const store = create()
  const target = (relativePath: string): CSharpProjectRunTarget => ({ kind: 'csharp-project', projectId: project.id, relativePath })
  const signal = () => new AbortController().signal
  const file = join(directory, 'csharp-run-targets', `${project.id}.json`)
  const checked = async (promise: Promise<CsharpRunSelectionResult>) => {
    const result = await promise
    expect(validateCSharpRunTargetResolution(result.resolution).ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain(temp)
    return result
  }
  return { temp, root, project, projects, files, facts, execute, resolver, directory, store, create, target, signal, file, put, checked }
}
const disk: PersistenceFileSystem = { copyFile, mkdir, readFile, rename, unlink, writeFile }

describe('Main C# Run selection with production resolver and atomic persistence', () => {
  it('automatically identifies one eligible target without storing an implicit choice', async () => {
    const f = await fixture(['src/Console App.csproj'])
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result).toMatchObject({ selection: 'AUTOMATIC', resolution: { state: 'READY', target: { relativePath: 'src/Console App.csproj' } } })
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('returns explicit selection required for multiple candidates without editor/LSP heuristics', async () => {
    const f = await fixture(['A.csproj', 'B.csproj', 'B/Program.cs', 'Workspace.slnx'])
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result.resolution.state).toBe('SELECTION_REQUIRED')
    expect(result.resolution).not.toHaveProperty('target')
    expect(result.selection).toBe('NONE')
    expect(f.execute.mock.calls.every(([, command]) => command.kind !== 'evaluate' || command.project.endsWith('.csproj'))).toBe(true)
  })
  it('uses a separate namespace and preserves language workspace/app preferences', async () => {
    const f = await fixture()
    await mkdir(f.directory, { recursive: true })
    const languageFile = join(f.directory, `${f.project.id}.json`), appFile = join(f.directory, 'app.json')
    const language = JSON.stringify({ schemaVersion: 1, data: { csharpSolution: 'Workspace.slnx' } })
    const app = JSON.stringify({ schemaVersion: 2, data: { settings: { theme: 'Dark' } } })
    await writeFile(languageFile, language); await writeFile(appFile, app)
    expect((await f.store.resolve(f.project.id, f.signal())).resolution.state).toBe('SELECTION_REQUIRED')
    await f.store.select(f.target('B.csproj'), f.signal())
    expect(await readFile(languageFile, 'utf8')).toBe(language)
    expect(await readFile(appFile, 'utf8')).toBe(app)
  })
  it('returns no-project without persisting a choice', async () => {
    const f = await fixture([])
    expect((await f.checked(f.store.resolve(f.project.id, f.signal()))).resolution.state).toBe('NO_RUNNABLE_PROJECT')
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('stores only a versioned relative path and restores it after a fresh store/project reopen', async () => {
    const f = await fixture()
    expect(await f.checked(f.store.select(f.target('B.csproj'), f.signal()))).toMatchObject({ selection: 'EXPLICIT', resolution: { state: 'READY' } })
    expect(JSON.parse(await readFile(f.file, 'utf8'))).toEqual({ schemaVersion: 1, data: { relativePath: 'B.csproj' } })
    await f.store.stop(); await f.projects.closeProject(); await f.projects.openRoot(f.root)
    expect(await f.checked(f.create().resolve(f.project.id, f.signal()))).toMatchObject({ selection: 'SAVED', resolution: { target: { relativePath: 'B.csproj' } } })
  })
  it('isolates selections for two IDE projects containing identical relative paths', async () => {
    const f = await fixture(), second = join(f.temp, 'Other project')
    await f.put(second, 'A.csproj'); await f.put(second, 'B.csproj')
    await f.store.select(f.target('A.csproj'), f.signal())
    const other = await f.projects.openRoot(second)
    expect((await f.store.resolve(other.id, f.signal())).resolution.state).toBe('SELECTION_REQUIRED')
    await f.store.select({ kind: 'csharp-project', projectId: other.id, relativePath: 'B.csproj' }, f.signal())
    await f.projects.openRoot(f.root)
    expect((await f.store.resolve(f.project.id, f.signal())).resolution).toMatchObject({ target: { relativePath: 'A.csproj' } })
    await f.projects.openRoot(second)
    expect((await f.store.resolve(other.id, f.signal())).resolution).toMatchObject({ target: { relativePath: 'B.csproj' } })
  })
  it('changes and clears an explicit choice; clear does not resurrect the backup on reopen', async () => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal()); await f.store.select(f.target('B.csproj'), f.signal())
    expect((await f.store.resolve(f.project.id, f.signal())).resolution).toMatchObject({ target: { relativePath: 'B.csproj' } })
    expect(await f.checked(f.store.clear(f.project.id, f.signal()))).toMatchObject({ selection: 'CLEARED', resolution: { state: 'SELECTION_REQUIRED' } })
    expect(JSON.parse(await readFile(f.file, 'utf8')).data).toEqual({})
    await f.store.stop()
    expect((await f.create().resolve(f.project.id, f.signal())).selection).toBe('NONE')
  })
  it('clear permits fresh automatic resolution when exactly one target remains', async () => {
    const f = await fixture(['A.csproj'])
    await f.store.select(f.target('A.csproj'), f.signal())
    expect((await f.store.clear(f.project.id, f.signal())).resolution.state).toBe('READY')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data).toEqual({})
  })
  it.each(['deleted', 'renamed', 'library'] as const)('requires fresh selection for a %s remembered target even if one other Console remains', async kind => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal())
    if (kind === 'deleted') await unlink(join(f.root, 'A.csproj'))
    if (kind === 'renamed') await rename(join(f.root, 'A.csproj'), join(f.root, 'Renamed.csproj'))
    if (kind === 'library') f.facts.set(join(f.root, 'A.csproj').toLowerCase(), { OutputType: 'Library' })
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result).toMatchObject({ selection: 'STALE', issue: 'STALE_TARGET', resolution: { state: 'SELECTION_REQUIRED' } })
    expect(result.resolution).not.toHaveProperty('target')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
  it('permits a revalidated saved/explicit choice alongside an unrelated broken candidate', async () => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal())
    f.facts.set(join(f.root, 'B.csproj').toLowerCase(), { OutputType: '' })
    expect((await f.store.resolve(f.project.id, f.signal())).resolution.state).toBe('READY')
    expect((await f.store.select(f.target('A.csproj'), f.signal())).resolution.state).toBe('READY')
    expect((await f.store.select(f.target('B.csproj'), f.signal())).issue).toBe('INVALID_SELECTION')
  })
  it('cannot override whole-discovery bounds/failure with a saved or explicit choice', async () => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal())
    vi.spyOn(f.resolver, 'resolve').mockResolvedValue({ resolution: { projectId: f.project.id, state: 'FAILED', reason: 'DISCOVERY_LIMIT_EXCEEDED' }, assessments: [] })
    expect((await f.store.resolve(f.project.id, f.signal())).resolution).toMatchObject({ state: 'FAILED', reason: 'DISCOVERY_LIMIT_EXCEEDED' })
    expect((await f.store.select(f.target('A.csproj'), f.signal())).resolution.state).toBe('FAILED')
  })
  it('accepts Windows case variants but stores the deterministic discovered spelling', async () => {
    const f = await fixture()
    await f.store.select(f.target('a.CSPROJ'), f.signal())
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
  it.each(['../outside.csproj', 'C:\\outside\\App.csproj', '/outside.csproj', 'A.cs', 'Missing.csproj'])('rejects selection path %s without replacing the saved choice', async path => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal())
    expect((await f.store.select(f.target(path), f.signal())).issue).toBe('INVALID_SELECTION')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
  it('rejects process fields and unsupported target kinds at the Main method boundary', async () => {
    const f = await fixture()
    for (const input of [{ ...f.target('A.csproj'), cwd: f.root }, { ...f.target('A.csproj'), kind: 'javascript-file' }]) {
      expect((await f.store.select(input as CSharpProjectRunTarget, f.signal())).issue).toBe('INVALID_SELECTION')
    }
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('rejects a request belonging to a closed/different project', async () => {
    const f = await fixture(), other = join(f.temp, 'Other')
    await mkdir(other)
    await f.projects.openRoot(other)
    expect((await f.store.select(f.target('A.csproj'), f.signal())).issue).toBe('PROJECT_CHANGED')
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects a remembered path that now escapes through an outside junction', async () => {
    const f = await fixture(['src/A.csproj', 'B.csproj']), outside = join(f.temp, 'Outside')
    await f.store.select(f.target('src/A.csproj'), f.signal())
    await f.put(outside, 'A.csproj'); await rm(join(f.root, 'src'), { recursive: true }); await symlink(outside, join(f.root, 'src'), 'junction')
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result.issue).toBe('STALE_TARGET'); expect(result.resolution.state).toBe('SELECTION_REQUIRED')
  })
  it('compares canonical identity before and after resolver evaluation before saving', async () => {
    const f = await fixture()
    const resolve = f.resolver.resolve.bind(f.resolver)
    vi.spyOn(f.resolver, 'resolve').mockImplementation(async (...args) => {
      const result = await resolve(...args)
      const authorize = f.files.authorizeRunFile.bind(f.files)
      vi.spyOn(f.files, 'authorizeRunFile').mockImplementation((id, path) => authorize(id, path === 'A.csproj' ? 'B.csproj' : path))
      return result
    })
    expect((await f.store.select(f.target('A.csproj'), f.signal())).issue).toBe('STALE_TARGET')
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('persistence recovery and failure', () => {
  it('corrupt primary and valid backup require a fresh explicit choice, not backup restoration', async () => {
    const f = await fixture()
    await f.store.select(f.target('A.csproj'), f.signal()); await f.store.select(f.target('B.csproj'), f.signal())
    await writeFile(f.file, '{broken')
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result).toMatchObject({ selection: 'RECOVERED', issue: 'PERSISTENCE_RECOVERED', resolution: { state: 'SELECTION_REQUIRED' } })
    expect(result.resolution).not.toHaveProperty('target')
    await f.store.select(f.target('B.csproj'), f.signal())
    expect(await readFile(f.file + '.corrupt', 'utf8')).toBe('{broken')
    expect((await f.store.resolve(f.project.id, f.signal())).selection).toBe('SAVED')
  })
  it.each([{ schemaVersion: 99, data: {} }, { schemaVersion: 1, data: { relativePath: '../outside.csproj' } },
    { schemaVersion: 1, data: { relativePath: 'A.csproj', executable: 'anything' } }])('rejects invalid persisted schema %j even with a single candidate', async document => {
    const f = await fixture(['A.csproj'])
    await mkdir(dirname(f.file), { recursive: true }); await writeFile(f.file, JSON.stringify(document))
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result.issue).toBe('PERSISTENCE_RECOVERED'); expect(result.resolution.state).toBe('SELECTION_REQUIRED')
  })
  it('atomic replace failure retains prior selection and removes its temporary file', async () => {
    const replace = vi.fn(disk.rename), f = await fixture(undefined, { ...disk, rename: replace })
    await f.store.select(f.target('A.csproj'), f.signal())
    replace.mockRejectedValueOnce(Error('private disk failure'))
    const result = await f.checked(f.store.select(f.target('B.csproj'), f.signal()))
    expect(result.issue).toBe('PERSISTENCE_FAILED'); expect(JSON.stringify(result)).not.toContain('private disk failure')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
    expect((await readdir(dirname(f.file))).some(path => path.includes('.tmp-'))).toBe(false)
    expect((await f.store.resolve(f.project.id, f.signal())).resolution).toMatchObject({ target: { relativePath: 'A.csproj' } })
  })
  it('failed clear keeps prior preference and returns persistence failure', async () => {
    const replace = vi.fn(disk.rename), f = await fixture(undefined, { ...disk, rename: replace })
    await f.store.select(f.target('A.csproj'), f.signal()); replace.mockRejectedValueOnce(Error('disk failure'))
    expect((await f.store.clear(f.project.id, f.signal())).issue).toBe('PERSISTENCE_FAILED')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
  it('unreadable storage is a failure, not corruption/default/backup auto-choice', async () => {
    const read = vi.fn(disk.readFile), f = await fixture(['A.csproj'], { ...disk, readFile: read })
    await f.store.select(f.target('A.csproj'), f.signal())
    read.mockRejectedValueOnce(Object.assign(Error('private denied'), { code: 'EACCES' }))
    const result = await f.checked(f.store.resolve(f.project.id, f.signal()))
    expect(result.resolution).toMatchObject({ state: 'FAILED', reason: 'PERSISTENCE_FAILED' })
    expect(result.issue).toBe('PERSISTENCE_FAILED')
  })
  it('fails the atomic commit if the primary becomes unreadable after the initial load', async () => {
    const read = vi.fn(disk.readFile), f = await fixture(undefined, { ...disk, readFile: read })
    await f.store.select(f.target('A.csproj'), f.signal())
    let primaryReads = 0
    read.mockImplementation(async (...args) => {
      if (args[0] === f.file && ++primaryReads === 2) throw Object.assign(Error('denied'), { code: 'EACCES' })
      return disk.readFile(...args)
    })
    expect((await f.store.select(f.target('B.csproj'), f.signal())).issue).toBe('PERSISTENCE_FAILED')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
})

describe('asynchronous selection and project lifecycle', () => {
  it.each(['close', 'switch', 'reopen'] as const)('rejects late resolver result after project %s, including the same stable ID', async transition => {
    const f = await fixture(), entered = deferred(), release = deferred()
    const resolve = f.resolver.resolve.bind(f.resolver)
    vi.spyOn(f.resolver, 'resolve').mockImplementation(async (...args) => {
      const result = await resolve(...args); entered.resolve(); await release.promise; return result
    })
    const pending = f.store.select(f.target('A.csproj'), f.signal()); await entered.promise
    if (transition === 'close') await f.projects.closeProject()
    else if (transition === 'reopen') { await f.projects.closeProject(); await f.projects.openRoot(f.root) }
    else { const other = join(f.temp, 'Other'); await mkdir(other); await f.projects.openRoot(other) }
    release.resolve()
    expect((await pending).issue).toBe('PROJECT_CHANGED')
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('newer selection cancels old discovery and serializes the latest preference', async () => {
    const f = await fixture(), entered = deferred(), release = deferred()
    const resolve = f.resolver.resolve.bind(f.resolver)
    let oldSignal: AbortSignal | undefined
    vi.spyOn(f.resolver, 'resolve').mockImplementationOnce(async (...args) => {
      const result = await resolve(...args); oldSignal = args[1]; entered.resolve(); await release.promise; return result
    })
    const older = f.store.select(f.target('A.csproj'), f.signal()); await entered.promise
    const newer = f.store.select(f.target('B.csproj'), f.signal())
    expect(oldSignal?.aborted).toBe(true); release.resolve()
    expect((await older).issue).toBe('SUPERSEDED')
    expect((await newer).resolution).toMatchObject({ target: { relativePath: 'B.csproj' } })
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('B.csproj')
  })
  it('project close during staged persistence prevents the atomic commit', async () => {
    const entered = deferred(), release = deferred(), write = vi.fn(disk.writeFile)
    const f = await fixture(undefined, { ...disk, writeFile: write })
    await f.store.select(f.target('A.csproj'), f.signal())
    write.mockImplementationOnce(async (...args) => { await disk.writeFile(...args); entered.resolve(); await release.promise })
    const pending = f.store.select(f.target('B.csproj'), f.signal()); await entered.promise
    await f.projects.closeProject(); release.resolve()
    expect((await pending).issue).toBe('PROJECT_CHANGED')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data.relativePath).toBe('A.csproj')
  })
  it('clear supersedes a staged select and prevents the old intent from committing afterward', async () => {
    const entered = deferred(), release = deferred(), write = vi.fn(disk.writeFile)
    const f = await fixture(undefined, { ...disk, writeFile: write })
    write.mockImplementationOnce(async (...args) => { await disk.writeFile(...args); entered.resolve(); await release.promise })
    const older = f.store.select(f.target('A.csproj'), f.signal()); await entered.promise
    const clear = f.store.clear(f.project.id, f.signal()); release.resolve()
    expect((await older).issue).toBe('SUPERSEDED')
    expect((await clear).selection).toBe('CLEARED')
    expect(JSON.parse(await readFile(f.file, 'utf8')).data).toEqual({})
  })
  it('handles cancellation before a request and after asynchronous discovery without persistence', async () => {
    const f = await fixture(), controller = new AbortController()
    controller.abort()
    expect((await f.store.select(f.target('A.csproj'), controller.signal)).issue).toBe('CANCELLED')
    expect(f.execute).not.toHaveBeenCalled()
    const next = new AbortController(), resolve = f.resolver.resolve.bind(f.resolver)
    vi.spyOn(f.resolver, 'resolve').mockImplementation(async (...args) => { const result = await resolve(...args); next.abort(); return result })
    expect((await f.store.select(f.target('A.csproj'), next.signal)).issue).toBe('CANCELLED')
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('stop cancels pending operations, drains work and rejects new calls', async () => {
    const f = await fixture(), entered = deferred(), release = deferred()
    const resolve = f.resolver.resolve.bind(f.resolver)
    vi.spyOn(f.resolver, 'resolve').mockImplementation(async (...args) => { const result = await resolve(...args); entered.resolve(); await release.promise; return result })
    const pending = f.store.select(f.target('A.csproj'), f.signal()); await entered.promise
    const stopping = f.store.stop(); release.resolve(); await stopping
    expect((await pending).issue).toBe('STOPPED')
    expect((await f.store.resolve(f.project.id, f.signal())).issue).toBe('STOPPED')
    await expect(readFile(f.file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('removes operation subscriptions on both successful and failed requests', async () => {
    const f = await fixture(), subscribe = f.projects.subscribe.bind(f.projects), removals = vi.fn()
    vi.spyOn(f.projects, 'subscribe').mockImplementation(listener => { const remove = subscribe(listener); return () => { removals(); remove() } })
    await f.store.resolve(f.project.id, f.signal())
    const first = removals.mock.calls.length
    await f.store.select(f.target('Missing.csproj'), f.signal())
    expect(removals.mock.calls.length).toBeGreaterThan(first)
  })
})
