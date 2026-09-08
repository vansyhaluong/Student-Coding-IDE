import { resolve, join, basename } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SearchService, type SearchDirectoryEntry, type SearchFileSystem } from '../../src/main/services/search/search-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import type { NamesSearchEvent, SearchEvent } from '../../src/shared/contracts'
import { SEARCH_CHANNELS } from '../../src/shared/contracts'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { SearchIpcService } from '../../src/main/ipc/search-ipc-service'

const root = resolve('virtual-search-project')
function entry(name: string, kind = 'file'): SearchDirectoryEntry {
  return { name, isFile: () => kind === 'file', isDirectory: () => kind === 'directory', isSymbolicLink: () => kind === 'link' }
}
function iterable(entries: SearchDirectoryEntry[]) { return (async function* () { yield* entries })() }
async function setup(entries: SearchDirectoryEntry[], overrides: Partial<SearchFileSystem> = {}) {
  const projects = new ProjectService({ realpath: async (path) => path,
    stat: async () => ({ isDirectory: () => true }), mkdir: async () => {}, rmdir: async () => {} })
  const project = await projects.openRoot(root)
  const readFile = vi.fn(async () => Buffer.from('contents needle'))
  const fs: SearchFileSystem = { openDirectory: async () => iterable(entries),
    realpath: async (path) => path, lstat: async () => ({ isFile: () => true, isDirectory: () => false,
      isSymbolicLink: () => false, size: 2 * 1024 * 1024 }), readFile, ...overrides }
  const service = new SearchService(projects, { fileSystem: fs })
  service.start()
  let serial = 0
  const names = (query: string) => new Promise<NamesSearchEvent[]>((done) => {
    const events: NamesSearchEvent[] = []
    service.startNames({ projectId: project.id, operationId: `search_names_${++serial}`, query }, 1, (event) => {
      events.push(event); if (event.type !== 'batch') done(events)
    })
  })
  return { project, projects, service, names, readFile, fs }
}
function matches(events: NamesSearchEvent[]) { return events.flatMap((event) => event.type === 'batch' ? event.matches : []) }

describe('Names through shared bounded SearchService', () => {
  it('validates Names at Main IPC and publishes only to the requesting owner', async () => {
    const f = await setup([entry('needle.png')])
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const registry = new IpcHandlerRegistry({ handle: (channel, listener) => { handlers.set(channel, listener) },
      removeHandler: (channel) => { handlers.delete(channel) } })
    const published: Array<{ owner: number; event: NamesSearchEvent }> = []
    let finish!: () => void
    const completed = new Promise<void>((done) => { finish = done })
    const ipc = new SearchIpcService(registry, f.service, () => {}, (owner, event) => {
      published.push({ owner, event }); if (event.type !== 'batch') finish()
    })
    ipc.start()
    const invoke = (payload: unknown) => handlers.get(SEARCH_CHANNELS.startNames)!({ sender: { id: 7 } }, payload)
    const request = { projectId: f.project.id, operationId: 'search_ipc', query: 'needle' }
    expect(await invoke({ ...request, root: 'C:/' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(published).toEqual([])
    expect(await invoke(request)).toEqual({ ok: true, value: null })
    await completed
    expect(published[0]).toEqual({ owner: 7, event: { type: 'batch', projectId: f.project.id,
      operationId: 'search_ipc', matches: [{ relativePath: 'needle.png' }] } })
    ipc.stop(); f.service.stop(); expect(handlers.size).toBe(0)
  })
  it('searches full relative paths including binary and large files without reading content or expanding Explorer', async () => {
    const f = await setup([], { openDirectory: async (path) => iterable(path === root
      ? [entry('src', 'directory')] : [entry('Auth.png'), entry('large.bin'), entry('literal[1].ts')]) })
    expect(matches(await f.names('SRC/auth'))).toEqual([{ relativePath: 'src/Auth.png' }])
    expect(matches(await f.names('src/'))).toHaveLength(3)
    expect(matches(await f.names('large'))).toEqual([{ relativePath: 'src/large.bin' }])
    expect(matches(await f.names('[1]'))).toEqual([{ relativePath: 'src/literal[1].ts' }])
    expect(matches(await f.names('srath'))).toEqual([])
    expect(f.readFile).not.toHaveBeenCalled()
    f.service.stop()
  })

  it('preserves exclusions, skips symlinks and directories as results, and rejects root escapes', async () => {
    const opened: string[] = []
    const f = await setup([], {
      openDirectory: async (path) => {
        opened.push(path)
        return iterable(path === root ? [entry('.git', 'directory'), entry('node_modules', 'directory'),
          entry('dist', 'directory'), entry('build', 'directory'), entry('out', 'directory'), entry('linked', 'link'),
          entry('escape.txt'), entry('src', 'directory')] : [entry('file.ts')])
      },
      realpath: async (path) => basename(path) === 'escape.txt' ? resolve('outside/file.txt') : path,
    })
    expect(matches(await f.names('src'))).toEqual([{ relativePath: 'src/file.ts' }])
    expect(opened).toEqual([root, join(root, 'src')])
    expect(matches(await f.names('escape'))).toEqual([])
    f.service.stop()
  })

  it('bounds returned paths to 1,000 and emits batches of 50 in discovery order without sorting', async () => {
    const entries = Array.from({ length: 1002 }, (_, i) => entry(`file-${1002 - i}.bin`))
    const f = await setup(entries)
    const events = await f.names('file-')
    expect(matches(events)).toEqual(entries.slice(0, 1000).map(({ name }) => ({ relativePath: name })))
    expect(events.filter((e) => e.type === 'batch').map((e) => e.matches.length)).toEqual(Array(20).fill(50))
    expect(events.at(-1)).toMatchObject({ limitReached: true, scannedFiles: 1000 })
    expect(f.readFile).not.toHaveBeenCalled()
    f.service.stop()
  })

  it('stops at 10,000 eligible files even when none match', async () => {
    const f = await setup(Array.from({ length: 10001 }, (_, i) => entry(`file-${i}`)))
    const events = await f.names('absent')
    expect(matches(events)).toEqual([])
    expect(events.at(-1)).toMatchObject({ limitReached: true, scannedFiles: 10000 })
    f.service.stop()
  })

  it('stops at the 50,000-entry traversal bound even when entries are ineligible', async () => {
    const f = await setup(Array.from({ length: 50001 }, (_, i) => entry(`link-${i}`, 'link')))
    expect((await f.names('link')).at(-1)).toMatchObject({ limitReached: true, skippedFiles: 50000, scannedFiles: 0 })
    f.service.stop()
  })

  it.each(['names', 'contents'] as const)('a new %s search supersedes the other mode for the same owner', async (next) => {
    let release!: () => void, entered!: () => void
    const enteredPromise = new Promise<void>((done) => { entered = done })
    const barrier = new Promise<void>((done) => { release = done })
    let first = true
    const f = await setup([entry('needle.ts')], { lstat: async () => {
      if (first) { first = false; entered(); await barrier }
      return { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, size: 10 }
    } })
    const oldEvents: Array<NamesSearchEvent | SearchEvent> = []
    let oldDone!: () => void
    const completed = new Promise<void>((done) => { oldDone = done })
    const oldPublish = (event: NamesSearchEvent | SearchEvent) => { oldEvents.push(event); if (event.type !== 'batch') oldDone() }
    const request = { projectId: f.project.id, operationId: 'search_old', query: 'needle' }
    if (next === 'names') f.service.startSearch(request, 1, oldPublish)
    else f.service.startNames(request, 1, oldPublish)
    await enteredPromise
    const fresh = new Promise<void>((done) => {
      const publish = (event: NamesSearchEvent | SearchEvent) => { if (event.type !== 'batch') done() }
      if (next === 'names') f.service.startNames({ ...request, operationId: 'search_new' }, 1, publish)
      else f.service.startSearch({ ...request, operationId: 'search_new' }, 1, publish)
    })
    release(); await completed; await fresh
    expect(oldEvents).toEqual([expect.objectContaining({ type: 'complete', status: 'cancelled' })])
    f.service.stop()
  })
})
