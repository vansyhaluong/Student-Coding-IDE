import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ProjectService,
  type ProjectServiceFileSystem,
} from '../../src/main/services/project/project-service'
import type { RecentProjectMetadata } from '../../src/shared/contracts'

const temporaryRoots: string[] = []

async function temporaryDirectory(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'student-ide-project-')))
  temporaryRoots.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )))
})

describe('ProjectService', () => {
  it('opens one canonical local project and persists minimal recent metadata', async () => {
    const root = await temporaryDirectory()
    let recent: RecentProjectMetadata[] = []
    const updateRecentProjects = vi.fn(async (value: RecentProjectMetadata[]) => {
      recent = value
    })
    const service = new ProjectService(undefined, process.platform, {
      getRecentProjects: () => recent,
      updateRecentProjects,
    })

    const project = await service.openRoot(root)

    expect(project.name).toBe(root.split(/[\\/]/).at(-1))
    expect(service.getActiveProject()).toEqual(project)
    expect(updateRecentProjects).toHaveBeenCalledOnce()
    expect(recent[0]).toMatchObject({ id: project.id, name: project.name })
    expect(recent[0]?.rootPath).toBe(root)
  })

  it('creates a new empty child and rejects an existing target', async () => {
    const parent = await temporaryDirectory()
    const service = new ProjectService()

    const project = await service.createProject(parent, 'hello-world')

    expect(project.name).toBe('hello-world')
    await expect(stat(join(parent, 'hello-world'))).resolves.toMatchObject({})
    await expect(service.createProject(parent, 'hello-world'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('rejects invalid roots and unsafe project names', async () => {
    const parent = await temporaryDirectory()
    const service = new ProjectService()

    await expect(service.openRoot('relative-project'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.createProject(parent, '../escape'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('routes switch and close through guards with no bypass', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const service = new ProjectService()
    await service.openRoot(first)
    const guard = vi.fn(() => false)
    service.registerTransitionGuard(guard)

    await expect(service.openRoot(second))
      .rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(service.getActiveProject()?.name).toBe(first.split(/[\\/]/).at(-1))
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ reason: 'switch' }))

    await expect(service.createProject(second, 'blocked-project'))
      .rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    await expect(stat(join(second, 'blocked-project')))
      .rejects.toMatchObject({ code: 'ENOENT' })

    await expect(service.closeProject())
      .rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(service.getActiveProject()).not.toBeNull()
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ reason: 'close' }))
  })

  it('reports a correlated failed transition only after authority is retained', async () => {
    const first = await temporaryDirectory()
    const unavailable = await temporaryDirectory()
    const fileSystem = nodeProjectFileSystem({
      realpath: async (path) => {
        if (path === unavailable) throw new Error('unavailable')
        return realpath(path)
      },
    })
    const service = new ProjectService(fileSystem)
    const project = await service.openRoot(first)
    let guardedTransitionId = ''
    service.registerTransitionGuard((transition) => {
      guardedTransitionId = transition.transitionId
      return true
    })
    const settled = vi.fn((transitionId: string) => {
      expect(service.getActiveProject()).toEqual(project)
      expect(transitionId).toBe(guardedTransitionId)
    })
    service.subscribeTransitionSettled(settled)

    await expect(service.openRoot(unavailable)).rejects.toThrow('unavailable')

    expect(guardedTransitionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(settled).toHaveBeenCalledOnce()
  })

  it('uses project change, not failed settlement, for successful transitions', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const service = new ProjectService()
    await service.openRoot(first)
    service.registerTransitionGuard(() => true)
    const settled = vi.fn()
    service.subscribeTransitionSettled(settled)

    await expect(service.openRoot(second)).resolves.toMatchObject({
      name: second.split(/[\\/]/).at(-1),
    })

    expect(settled).not.toHaveBeenCalled()
  })

  it('notifies project switch and close after an approving guard', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    await mkdir(join(first, 'nested'))
    const service = new ProjectService()
    const listener = vi.fn()
    service.subscribe(listener)
    service.registerTransitionGuard(() => true)

    await service.openRoot(first)
    await service.openRoot(second)
    await service.closeProject()

    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenLastCalledWith(null)
  })

  it('keeps committed project state authoritative when an observer throws', async () => {
    const parent = await temporaryDirectory()
    const listenerError = new Error('observer failed')
    const onListenerError = vi.fn()
    const service = new ProjectService(
      undefined,
      process.platform,
      undefined,
      onListenerError,
    )
    service.subscribe(() => {
      throw listenerError
    })

    await expect(service.createProject(parent, 'created-project'))
      .resolves.toMatchObject({ name: 'created-project' })

    expect(service.getActiveProject()?.name).toBe('created-project')
    expect(onListenerError).toHaveBeenCalledWith(listenerError)
    await expect(stat(join(parent, 'created-project'))).resolves.toMatchObject({})
  })

  it('serializes concurrent opens and evaluates each guard against the authoritative project', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const third = await temporaryDirectory()
    const enteredSecond = deferred<void>()
    const releaseSecond = deferred<void>()
    const fileSystem = nodeProjectFileSystem({
      realpath: async (path) => {
        if (path === second) {
          enteredSecond.resolve()
          await releaseSecond.promise
        }
        return realpath(path)
      },
    })
    const service = new ProjectService(fileSystem)
    await service.openRoot(first)
    const guardedProjects: string[] = []
    service.registerTransitionGuard(({ currentProject }) => {
      guardedProjects.push(currentProject.name)
      return true
    })

    const openSecond = service.openRoot(second)
    await enteredSecond.promise
    const openThird = service.openRoot(third)

    expect(guardedProjects).toEqual([nameOf(first)])
    releaseSecond.resolve()
    await Promise.all([openSecond, openThird])

    expect(guardedProjects).toEqual([nameOf(first), nameOf(second)])
    expect(service.getActiveProject()?.name).toBe(nameOf(third))
  })

  it('serializes concurrent close then open without evaluating against stale state', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const closeEntered = deferred<void>()
    const releaseClose = deferred<void>()
    const service = new ProjectService()
    await service.openRoot(first)
    const guarded: Array<{ reason: string; project: string }> = []
    service.registerTransitionGuard(async ({ reason, currentProject }) => {
      guarded.push({ reason, project: currentProject.name })
      if (reason === 'close') {
        closeEntered.resolve()
        await releaseClose.promise
      }
      return true
    })

    const closing = service.closeProject()
    await closeEntered.promise
    const opening = service.openRoot(second)

    expect(guarded).toEqual([{ reason: 'close', project: nameOf(first) }])
    releaseClose.resolve()
    await Promise.all([closing, opening])

    expect(guarded).toEqual([{ reason: 'close', project: nameOf(first) }])
    expect(service.getActiveProject()?.name).toBe(nameOf(second))
  })

  it('serializes concurrent create then open and guards the created project', async () => {
    const first = await temporaryDirectory()
    const parent = await temporaryDirectory()
    const destination = await temporaryDirectory()
    const createEntered = deferred<void>()
    const releaseCreate = deferred<void>()
    const target = join(parent, 'created-project')
    const fileSystem = nodeProjectFileSystem({
      mkdir: async (path) => {
        if (path === target) {
          createEntered.resolve()
          await releaseCreate.promise
        }
        await mkdir(path)
      },
    })
    const service = new ProjectService(fileSystem)
    await service.openRoot(first)
    const guardedProjects: string[] = []
    service.registerTransitionGuard(({ currentProject }) => {
      guardedProjects.push(currentProject.name)
      return true
    })

    const creating = service.createProject(parent, 'created-project')
    await createEntered.promise
    const opening = service.openRoot(destination)

    expect(guardedProjects).toEqual([nameOf(first)])
    releaseCreate.resolve()
    await Promise.all([creating, opening])

    expect(guardedProjects).toEqual([nameOf(first), 'created-project'])
    expect(service.getActiveProject()?.name).toBe(nameOf(destination))
  })

  it('releases the transition queue after failure', async () => {
    const first = await temporaryDirectory()
    const failed = await temporaryDirectory()
    const next = await temporaryDirectory()
    const fileSystem = nodeProjectFileSystem({
      realpath: async (path) => {
        if (path === failed) {
          throw Object.assign(new Error('unavailable'), { code: 'EACCES' })
        }
        return realpath(path)
      },
    })
    const service = new ProjectService(fileSystem)
    await service.openRoot(first)
    const guardedProjects: string[] = []
    service.registerTransitionGuard(({ currentProject }) => {
      guardedProjects.push(currentProject.name)
      return true
    })

    const failedOpen = service.openRoot(failed)
    const nextOpen = service.openRoot(next)

    await expect(failedOpen).rejects.toMatchObject({ code: 'EACCES' })
    await expect(nextOpen).resolves.toMatchObject({ name: nameOf(next) })
    expect(guardedProjects).toEqual([nameOf(first), nameOf(first)])
  })

  it('rejects a reentrant transition instead of deadlocking its own guard', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const service = new ProjectService()
    await service.openRoot(first)
    let nestedError: unknown
    service.registerTransitionGuard(async () => {
      try {
        await service.openRoot(second)
      } catch (error) {
        nestedError = error
      }
      return true
    })

    await expect(service.closeProject()).resolves.toBeUndefined()

    expect(nestedError).toMatchObject({
      code: 'PROCESS_CANCELLED',
      operation: 'project:open',
    })
    expect(service.getActiveProject()).toBeNull()
  })

  it('rolls back its newly created empty directory when persistence fails and allows retry', async () => {
    const parent = await temporaryDirectory()
    const target = join(parent, 'retry-project')
    let shouldFail = true
    let recent: RecentProjectMetadata[] = []
    const removeCreatedDirectory = vi.fn((path: string) => rmdir(path))
    const service = new ProjectService(
      nodeProjectFileSystem({ rmdir: removeCreatedDirectory }),
      process.platform,
      {
        getRecentProjects: () => recent,
        updateRecentProjects: async (projects) => {
          if (shouldFail) throw new Error('persistence unavailable')
          recent = projects
        },
      },
    )

    await expect(service.createProject(parent, 'retry-project'))
      .rejects.toThrow('persistence unavailable')
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(removeCreatedDirectory).toHaveBeenCalledOnce()
    expect(service.getActiveProject()).toBeNull()

    shouldFail = false
    await expect(service.createProject(parent, 'retry-project'))
      .resolves.toMatchObject({ name: 'retry-project' })
    await expect(stat(target)).resolves.toMatchObject({})
  })

  it('never rolls back a pre-existing project target', async () => {
    const parent = await temporaryDirectory()
    const target = join(parent, 'existing-project')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'keep', 'utf8')
    const removeCreatedDirectory = vi.fn((path: string) => rmdir(path))
    const service = new ProjectService(
      nodeProjectFileSystem({ rmdir: removeCreatedDirectory }),
    )

    await expect(service.createProject(parent, 'existing-project'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })

    expect(removeCreatedDirectory).not.toHaveBeenCalled()
    await expect(stat(join(target, 'keep.txt'))).resolves.toMatchObject({})
  })

  it('surfaces safe structured failure when empty-directory rollback fails', async () => {
    const parent = await temporaryDirectory()
    const target = join(parent, 'stuck-project')
    const service = new ProjectService(
      nodeProjectFileSystem({
        rmdir: async () => {
          throw Object.assign(new Error(`locked: ${target}`), { code: 'EPERM' })
        },
      }),
      process.platform,
      {
        getRecentProjects: () => [],
        updateRecentProjects: async () => {
          throw new Error('persistence unavailable')
        },
      },
    )

    await expect(service.createProject(parent, 'stuck-project')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      operation: 'project:create',
      details: { rollback: 'failed' },
    })
    await expect(stat(target)).resolves.toMatchObject({})
  })

  it('never recursively deletes unexpected content created before compensation', async () => {
    const parent = await temporaryDirectory()
    const target = join(parent, 'changed-project')
    const service = new ProjectService(
      nodeProjectFileSystem(),
      process.platform,
      {
        getRecentProjects: () => [],
        updateRecentProjects: async () => {
          await writeFile(join(target, 'unexpected.txt'), 'preserve', 'utf8')
          throw new Error('persistence unavailable')
        },
      },
    )

    await expect(service.createProject(parent, 'changed-project')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      details: { rollback: 'failed' },
    })
    await expect(stat(join(target, 'unexpected.txt'))).resolves.toMatchObject({})
  })

  it('drains an in-flight transition during shutdown and rejects later transitions', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    const enteredSecond = deferred<void>()
    const releaseSecond = deferred<void>()
    const service = new ProjectService(nodeProjectFileSystem({
      realpath: async (path) => {
        if (path === second) {
          enteredSecond.resolve()
          await releaseSecond.promise
        }
        return realpath(path)
      },
    }))
    await service.openRoot(first)

    const opening = service.openRoot(second)
    await enteredSecond.promise
    const stopping = service.stop()
    releaseSecond.resolve()
    await Promise.all([opening, stopping])

    expect(service.getActiveProject()).toBeNull()
    await expect(service.openRoot(first)).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
    })
  })
})

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

function nodeProjectFileSystem(
  overrides: Partial<ProjectServiceFileSystem> = {},
): ProjectServiceFileSystem {
  return {
    mkdir: (path) => mkdir(path),
    realpath,
    rmdir,
    stat,
    ...overrides,
  }
}

function nameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

describe('Phase 6 Recent Projects', () => {
  it('keeps MRU unique, routes reopen through guards, and removes history without deleting source', async () => {
    const first = await temporaryDirectory()
    const second = await temporaryDirectory()
    await writeFile(join(first, 'source.ts'), 'keep me')
    let recent: RecentProjectMetadata[] = []
    const service = new ProjectService(undefined, process.platform, {
      getRecentProjects: () => recent,
      updateRecentProjects: async value => { recent = value },
    })
    const a = await service.openRoot(first)
    const b = await service.openRoot(second)
    await service.openRecent(a.id)
    expect(service.listRecent().map(p => p.id)).toEqual([a.id, b.id])
    const guard = service.registerTransitionGuard(() => false)
    await expect(service.openRecent(b.id)).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(service.getActiveProject()?.id).toBe(a.id)
    guard()
    await service.removeRecent(a.id)
    expect(service.listRecent().map(p => p.id)).toEqual([b.id])
    expect(service.getActiveProject()?.id).toBe(a.id)
    await expect(stat(join(first, 'source.ts'))).resolves.toBeDefined()
    await expect(service.openRecent(a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await service.stop()
  })

  it('retains missing folders for explicit removal and keeps the active project', async () => {
    const first = await temporaryDirectory()
    const missing = await temporaryDirectory()
    let recent: RecentProjectMetadata[] = []
    const service = new ProjectService(undefined, process.platform, {
      getRecentProjects: () => recent, updateRecentProjects: async value => { recent = value },
    })
    const old = await service.openRoot(missing)
    const active = await service.openRoot(first)
    await rmdir(missing)
    await expect(service.openRecent(old.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(service.getActiveProject()?.id).toBe(active.id)
    expect(service.listRecent().some(p => p.id === old.id)).toBe(true)
    await service.stop()
  })
})
