import {
  lstat,
  mkdtemp,
  mkdir,
  opendir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SearchService,
  type SearchDirectoryEntry,
  type SearchFileSystem,
} from '../../src/main/services/search/search-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import {
  SEARCH_LIMITS,
  type SearchEvent,
  type SearchMatch,
} from '../../src/shared/contracts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )))
})

describe('SearchService', () => {
  it('finds case-insensitive matches across nested files with exact ranges and previews', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'main.ts'), 'const Save = "save"; // SAVE\nnone', 'utf8')
    await writeFile(join(root, 'src', 'nested.ts'), 'save again', 'utf8')

    const { events } = await runSearch(root, 'Save')
    const matches = collectMatches(events)

    expect(matches).toHaveLength(4)
    expect(matches.map((match) => match.relativePath)).toEqual([
      'main.ts', 'main.ts', 'main.ts', 'src/nested.ts',
    ])
    expect(matches[0]).toMatchObject({
      lineNumber: 1,
      columnStart: 7,
      columnEnd: 11,
      preview: 'const Save = "save"; // SAVE',
    })
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      status: 'completed',
      scannedFiles: 2,
      limitReached: false,
    })
  })

  it('returns no matches without treating that as an error', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'main.ts'), 'alpha', 'utf8')

    const { events } = await runSearch(root, 'missing')

    expect(collectMatches(events)).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: 'complete', status: 'completed' })
  })

  it('excludes generated directories, obvious binary files, and NUL-containing content', async () => {
    const root = await temporaryDirectory()
    for (const name of ['.git', 'node_modules', 'dist', 'build', 'out']) {
      await mkdir(join(root, name))
      await writeFile(join(root, name, 'hidden.txt'), 'needle', 'utf8')
    }
    await writeFile(join(root, 'image.png'), 'needle', 'utf8')
    await writeFile(join(root, 'binary.dat'), Buffer.from([110, 0, 101, 101, 100, 108, 101]))
    await writeFile(
      join(root, 'oversized.txt'),
      `needle${'x'.repeat(SEARCH_LIMITS.maximumFileBytes)}`,
      'utf8',
    )
    await writeFile(join(root, 'visible.txt'), 'needle', 'utf8')

    const { events } = await runSearch(root, 'needle')

    expect(collectMatches(events).map((match) => match.relativePath))
      .toEqual(['visible.txt'])
    expect(events.at(-1)).toMatchObject({ skippedFiles: 8 })
  })

  it('bounds long text previews while retaining the match context', async () => {
    const root = await temporaryDirectory()
    await writeFile(
      join(root, 'long.txt'),
      `${'a'.repeat(400)}Needle${'b'.repeat(400)}`,
      'utf8',
    )

    const { events } = await runSearch(root, 'needle')
    const preview = collectMatches(events)[0]?.preview ?? ''

    expect(preview.length).toBeLessThanOrEqual(SEARCH_LIMITS.previewLength)
    expect(preview).toContain('Needle')
    expect(preview.startsWith('…')).toBe(true)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('continues after a file becomes unreadable', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'locked.txt'), 'needle', 'utf8')
    await writeFile(join(root, 'visible.txt'), 'needle', 'utf8')
    const base = nodePort()
    const fileSystem: SearchFileSystem = {
      ...base,
      readFile: async (path) => {
        if (path.endsWith('locked.txt')) {
          throw Object.assign(new Error('locked'), { code: 'EACCES' })
        }
        return base.readFile(path)
      },
    }

    const { events } = await runSearch(root, 'needle', fileSystem)

    expect(collectMatches(events).map((match) => match.relativePath))
      .toEqual(['visible.txt'])
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      scannedFiles: 1,
      skippedFiles: 1,
    })
  })

  it('does not scan an invalid empty query', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const fileSystem = nodePort()
    const openDirectory = vi.spyOn(fileSystem, 'openDirectory')
    const service = new SearchService(projectService, { fileSystem })
    service.start()

    expect(() => service.startSearch({
      projectId: project.id,
      operationId: 'search_empty',
      query: '   ',
    }, 1, vi.fn())).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(openDirectory).not.toHaveBeenCalled()
    service.stop()
  })

  it('never traverses a directory whose canonical path escapes the project root', async () => {
    const root = await temporaryDirectory()
    const outside = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const opened: string[] = []
    const fileSystem: SearchFileSystem = {
      openDirectory: async (path) => {
        opened.push(path)
        return iterable(path === root ? [directoryEntry('escape')] : [])
      },
      lstat: async () => fileStats(0),
      realpath: async (path) => path.endsWith('escape') ? outside : path,
      readFile: async () => Buffer.from('needle'),
    }
    const service = new SearchService(projectService, { fileSystem })
    service.start()
    const events = await startAndCollect(service, project.id, 'needle')

    expect(opened).toEqual([root])
    expect(collectMatches(events)).toEqual([])
    expect(events.at(-1)).toMatchObject({ skippedFiles: 1 })
    service.stop()
  })

  it('skips symbolic links without reading or traversing their targets', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const read = vi.fn(async () => Buffer.from('needle'))
    const fileSystem: SearchFileSystem = {
      openDirectory: async () => iterable([symbolicEntry('linked.txt')]),
      lstat: async () => fileStats(6),
      realpath: async (path) => path,
      readFile: read,
    }
    const service = new SearchService(projectService, { fileSystem })
    service.start()

    const events = await startAndCollect(service, project.id, 'needle')

    expect(read).not.toHaveBeenCalled()
    expect(collectMatches(events)).toEqual([])
    service.stop()
  })

  it('bounds result accumulation and reports the reached limit', async () => {
    const root = await temporaryDirectory()
    await writeFile(
      join(root, 'many.txt'),
      'x '.repeat(SEARCH_LIMITS.maximumMatches + 50),
      'utf8',
    )

    const { events } = await runSearch(root, 'x')

    expect(collectMatches(events)).toHaveLength(SEARCH_LIMITS.maximumMatches)
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      limitReached: true,
    })
  })

  it('keeps a representative large-project disk search bounded', async () => {
    const root = await temporaryDirectory()
    const directoryCount = 20
    const filesPerDirectory = 25
    await Promise.all(Array.from({ length: directoryCount }, async (_, directoryIndex) => {
      const directory = join(root, `area-${directoryIndex}`)
      await mkdir(directory)
      await Promise.all(Array.from({ length: filesPerDirectory }, (_, fileIndex) => (
        writeFile(
          join(directory, `file-${fileIndex}.txt`),
          'needle first\nneedle second\nneedle third',
          'utf8',
        )
      )))
    }))

    const { events } = await runSearch(root, 'needle')

    expect(collectMatches(events)).toHaveLength(SEARCH_LIMITS.maximumMatches)
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      limitReached: true,
    })
  })

  it('cooperatively suppresses late batches when a newer search supersedes it', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const firstRead = deferred<Buffer>()
    const firstReadStarted = deferred<void>()
    let reads = 0
    const fileSystem: SearchFileSystem = {
      openDirectory: async () => iterable([regularEntry('main.txt')]),
      lstat: async () => fileStats(20),
      realpath: async (path) => path,
      readFile: async () => {
        reads += 1
        if (reads === 1) {
          firstReadStarted.resolve()
          return firstRead.promise
        }
        return Buffer.from('beta')
      },
    }
    const service = new SearchService(projectService, { fileSystem })
    service.start()
    const events: SearchEvent[] = []
    service.startSearch(request(project.id, 'search_a', 'alpha'), 7, (event) => events.push(event))
    await firstReadStarted.promise
    const secondComplete = eventPromise(events, 'search_b')
    service.startSearch(request(project.id, 'search_b', 'beta'), 7, secondComplete.publish)
    firstRead.resolve(Buffer.from('alpha'))
    await secondComplete.promise
    await vi.waitFor(() => expect(events.some(
      (event) => event.type === 'complete' && event.operationId === 'search_a',
    )).toBe(true))

    expect(events.filter(
      (event) => event.type === 'batch' && event.operationId === 'search_a',
    )).toEqual([])
    expect(collectMatches(events).map((match) => match.preview)).toEqual(['beta'])
    service.stop()
  })

  it('suppresses late results after the active project changes', async () => {
    const firstRoot = await temporaryDirectory()
    const secondRoot = await temporaryDirectory()
    const projectService = new ProjectService()
    const first = await projectService.openRoot(firstRoot)
    const pendingRead = deferred<Buffer>()
    const readStarted = deferred<void>()
    const fileSystem: SearchFileSystem = {
      openDirectory: async () => iterable([regularEntry('main.txt')]),
      lstat: async () => fileStats(20),
      realpath: async (path) => path,
      readFile: async () => {
        readStarted.resolve()
        return pendingRead.promise
      },
    }
    const service = new SearchService(projectService, { fileSystem })
    service.start()
    const completion = eventPromise([], 'search_project_a')
    service.startSearch(
      request(first.id, 'search_project_a', 'alpha'),
      3,
      completion.publish,
    )
    await readStarted.promise
    await projectService.openRoot(secondRoot)
    pendingRead.resolve(Buffer.from('alpha'))
    const events = await completion.promise

    expect(collectMatches(events)).toEqual([])
    expect(events.at(-1)).toMatchObject({ status: 'cancelled' })
    service.stop()
  })
})

async function runSearch(
  root: string,
  query: string,
  fileSystem = nodePort(),
): Promise<{ events: SearchEvent[] }> {
  const projectService = new ProjectService()
  const project = await projectService.openRoot(root)
  const service = new SearchService(projectService, { fileSystem })
  service.start()
  const events = await startAndCollect(service, project.id, query)
  service.stop()
  return { events }
}

function startAndCollect(
  service: SearchService,
  projectId: string,
  query: string,
): Promise<SearchEvent[]> {
  const operationId = `search_${Math.random().toString(36).slice(2)}`
  const completion = eventPromise([], operationId)
  service.startSearch(request(projectId, operationId, query), 1, completion.publish)
  return completion.promise
}

function eventPromise(initial: SearchEvent[], operationId: string): {
  promise: Promise<SearchEvent[]>
  publish(event: SearchEvent): void
} {
  const events = initial
  let resolve!: (events: SearchEvent[]) => void
  const promise = new Promise<SearchEvent[]>((resolvePromise) => {
    resolve = resolvePromise
  })
  return {
    promise,
    publish(event) {
      events.push(event)
      if (event.operationId === operationId && (event.type === 'complete' || event.type === 'error')) {
        resolve(events)
      }
    },
  }
}

function collectMatches(events: SearchEvent[]): SearchMatch[] {
  return events.flatMap((event) => event.type === 'batch' ? event.matches : [])
}

function request(projectId: string, operationId: string, query: string) {
  return { projectId, operationId, query } as Parameters<SearchService['startSearch']>[0]
}

function nodePort(): SearchFileSystem {
  return {
    openDirectory: (path) => opendir(path),
    lstat,
    realpath,
    readFile,
  }
}

function iterable(entries: SearchDirectoryEntry[]): AsyncIterable<SearchDirectoryEntry> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* entries
    },
  }
}

function regularEntry(name: string): SearchDirectoryEntry {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  }
}

function directoryEntry(name: string): SearchDirectoryEntry {
  return {
    name,
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  }
}

function symbolicEntry(name: string): SearchDirectoryEntry {
  return {
    name,
    isFile: () => false,
    isDirectory: () => false,
    isSymbolicLink: () => true,
  }
}

function fileStats(size: number) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    size,
  }
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'student-ide-search-'))
  temporaryRoots.push(path)
  return path
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
