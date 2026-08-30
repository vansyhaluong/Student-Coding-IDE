import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import { SearchIpcService } from '../../src/main/ipc/search-ipc-service'
import {
  SearchService,
  type SearchFileSystem,
} from '../../src/main/services/search/search-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import { SEARCH_CHANNELS, type SearchEvent } from '../../src/shared/contracts'

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>>()

  handle(channel: string, listener: (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, payload: unknown, senderId = 5): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: senderId } }, payload)
  }
}

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )))
})

describe('Phase 2D search IPC', () => {
  it('validates narrow requests, propagates operation identity, and cleans handlers', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const openDirectory = vi.fn(async () => emptyIterable())
    const searchService = new SearchService(projectService, {
      fileSystem: {
        openDirectory,
        lstat: async () => fileStats(),
        realpath,
        readFile: async () => Buffer.from(''),
      },
    })
    searchService.start()
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    const published: Array<{ ownerId: number; event: SearchEvent }> = []
    const ipc = new SearchIpcService(
      registry,
      searchService,
      (ownerId, event) => published.push({ ownerId, event }),
    )
    ipc.start()

    await expect(ipcMain.invoke(SEARCH_CHANNELS.start, {
      projectId: project.id,
      operationId: 'search_query_1',
      query: 'Save',
    })).resolves.toEqual({ ok: true, value: null })
    await vi.waitFor(() => expect(published.at(-1)).toMatchObject({
      ownerId: 5,
      event: {
        type: 'complete',
        projectId: project.id,
        operationId: 'search_query_1',
      },
    }))
    expect(openDirectory).toHaveBeenCalledWith(root)

    openDirectory.mockClear()
    await expect(ipcMain.invoke(SEARCH_CHANNELS.start, {
      projectId: project.id,
      operationId: 'search_escape',
      query: 'text',
      rootPath: 'C:\\secret',
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    await expect(ipcMain.invoke(SEARCH_CHANNELS.start, {
      projectId: project.id,
      operationId: 'search_empty',
      query: '   ',
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(openDirectory).not.toHaveBeenCalled()

    ipc.stop()
    searchService.stop()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('allows cancellation only from the renderer that owns the operation', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const pendingRead = deferred<Buffer>()
    const readStarted = deferred<void>()
    const fileSystem: SearchFileSystem = {
      openDirectory: async () => oneFileIterable(),
      lstat: async () => fileStats(),
      realpath: async (path) => path,
      readFile: async () => {
        readStarted.resolve()
        return pendingRead.promise
      },
    }
    const searchService = new SearchService(projectService, { fileSystem })
    searchService.start()
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    const events: SearchEvent[] = []
    const ipc = new SearchIpcService(
      registry,
      searchService,
      (_ownerId, event) => events.push(event),
    )
    ipc.start()
    await ipcMain.invoke(SEARCH_CHANNELS.start, {
      projectId: project.id,
      operationId: 'search_owned',
      query: 'needle',
    }, 5)
    await readStarted.promise

    await expect(ipcMain.invoke(
      SEARCH_CHANNELS.cancel,
      { operationId: 'search_owned' },
      6,
    )).resolves.toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })
    await expect(ipcMain.invoke(
      SEARCH_CHANNELS.cancel,
      { operationId: 'search_owned' },
      5,
    )).resolves.toEqual({ ok: true, value: null })
    pendingRead.resolve(Buffer.from('needle'))
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({
      type: 'complete',
      status: 'cancelled',
    }))

    ipc.stop()
    searchService.stop()
  })
})

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'student-ide-search-ipc-'))
  temporaryRoots.push(path)
  return path
}

function emptyIterable() {
  return {
    async *[Symbol.asyncIterator]() { /* no entries */ },
  }
}

function oneFileIterable() {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        name: 'main.txt',
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      }
    },
  }
}

function fileStats() {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    size: 20,
  }
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
