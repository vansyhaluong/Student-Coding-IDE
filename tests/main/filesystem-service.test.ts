import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FileSystemService,
  isPathWithinRoot,
  type FileSystemPort,
  type WatchFactory,
} from '../../src/main/services/filesystem/filesystem-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import type { FileChangedEvent, ProjectId } from '../../src/shared/contracts'

const temporaryRoots: string[] = []

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'student-ide-files-'))
  temporaryRoots.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )))
})

describe('FileSystemService', () => {
  it('lists only immediate typed entries and reads files', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'src', 'deep'))
    await writeFile(join(root, 'README.md'), 'hello', 'utf8')
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    const rootEntries = await service.listDirectory(project.id, '')

    expect(rootEntries).toEqual([
      { name: 'src', relativePath: 'src', kind: 'directory', isSymbolicLink: false },
      { name: 'README.md', relativePath: 'README.md', kind: 'file', isSymbolicLink: false },
    ])
    expect(rootEntries.some((entry) => entry.relativePath === 'src/deep')).toBe(false)
    await expect(service.read(project.id, 'README.md')).resolves.toBe('hello')
  })

  it('does not enumerate nested directories when listing the project root', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'src', 'deep', 'deeper'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'many', 'nested'), { recursive: true })
    await writeFile(join(root, 'package.json'), '{}', 'utf8')
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const readdirPaths: string[] = []
    const fileSystem: FileSystemPort = {
      realpath,
      lstat,
      readdir: async (path) => {
        readdirPaths.push(path)
        return readdir(path, { withFileTypes: true })
      },
      readFile: (path) => readFile(path, 'utf8'),
      writeFile: async (path, data) => writeFile(path, data),
      mkdir: async (path) => mkdir(path),
      rename,
    }
    const service = new FileSystemService(projectService, {
      fileSystem,
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    await expect(service.listDirectory(project.id, '')).resolves.toHaveLength(3)

    expect(readdirPaths).toEqual([root])
    expect(readdirPaths).not.toContain(join(root, 'src'))
    expect(readdirPaths).not.toContain(join(root, 'node_modules'))
  })

  it('creates, stats, renames, and sends deletion only to trash', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const trashItem = vi.fn(async () => undefined)
    const service = new FileSystemService(projectService, {
      trashItem,
      watchFactory: noWatch,
    })

    await expect(service.createDirectory(project.id, '', 'src'))
      .resolves.toMatchObject({ relativePath: 'src', kind: 'directory' })
    await expect(service.createFile(project.id, 'src', 'main.ts'))
      .resolves.toMatchObject({ relativePath: 'src/main.ts', kind: 'file' })
    await expect(service.createFile(project.id, 'src', 'main.ts'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.stat(project.id, 'src/main.ts'))
      .resolves.toMatchObject({ size: 0, kind: 'file' })
    await expect(service.rename(project.id, 'src/main.ts', 'index.ts'))
      .resolves.toMatchObject({ relativePath: 'src/index.ts' })

    await service.delete(project.id, 'src/index.ts')
    expect(trashItem).toHaveBeenCalledWith(join(root, 'src', 'index.ts'))
  })

  it('does not fall back to permanent deletion when trash fails', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'locked.txt'), 'keep me', 'utf8')
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const trashError = Object.assign(new Error('trash unavailable'), {
      code: 'EPERM',
    })
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(async () => { throw trashError }),
      watchFactory: noWatch,
    })

    await expect(service.delete(project.id, 'locked.txt')).rejects.toBe(trashError)
    await expect(service.read(project.id, 'locked.txt')).resolves.toBe('keep me')
  })

  it('reports targets that disappear before an operation', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    await expect(service.read(project.id, 'missing.txt'))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(service.rename(project.id, 'missing.txt', 'new.txt'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rechecks project authorization immediately before mutation', async () => {
    const firstRoot = await temporaryDirectory()
    const secondRoot = await temporaryDirectory()
    const projectService = new ProjectService()
    const first = await projectService.openRoot(firstRoot)
    let rootStatCount = 0
    const directoryStats = {
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
      size: 0,
      mtime: new Date(0),
    }
    const writeFile = vi.fn(async () => undefined)
    const fileSystem: FileSystemPort = {
      realpath: async (path) => path,
      lstat: async (path) => {
        if (path === firstRoot) {
          rootStatCount += 1
          if (rootStatCount === 2) await projectService.openRoot(secondRoot)
          return directoryStats
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      },
      readdir: async () => [],
      readFile: async () => '',
      writeFile,
      mkdir: async () => undefined,
      rename: async () => undefined,
    }
    const service = new FileSystemService(projectService, {
      fileSystem,
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    await expect(service.createFile(first.id, '', 'late.txt'))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('rejects traversal, absolute paths, root mutation, and stale project IDs', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'inside.txt'), 'safe', 'utf8')
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    await expect(service.read(project.id, '../outside.txt'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.read(project.id, 'C:\\outside.txt'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.delete(project.id, ''))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(service.read('project_deadbeefdeadbeefdeadbeef' as ProjectId, 'inside.txt'))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('rejects a symlink whose canonical target escapes the root', async () => {
    const root = await temporaryDirectory()
    const outside = await temporaryDirectory()
    const linkPath = join(root, 'outside-link')
    try {
      await symlink(outside, linkPath, 'junction')
    } catch {
      // A deterministic port below covers hosts where symlink creation is restricted.
    }
    const projectService = new ProjectService()
    const project = await projectService.openRoot(root)
    const symbolicStats = {
      isFile: () => false,
      isDirectory: () => false,
      isSymbolicLink: () => true,
      size: 0,
      mtime: new Date(0),
    }
    const fileSystem: FileSystemPort = {
      realpath: async (path) => path === linkPath ? outside : path,
      lstat: async () => symbolicStats,
      readdir: async () => [],
      readFile: async () => '',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      rename: async () => undefined,
    }
    const service = new FileSystemService(projectService, {
      fileSystem,
      trashItem: vi.fn(),
      watchFactory: noWatch,
    })

    await expect(service.read(project.id, 'outside-link'))
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('handles deterministic Windows drive, case, and UNC containment', () => {
    expect(isPathWithinRoot('C:\\Projects\\Demo', 'c:\\projects\\demo\\src', 'win32')).toBe(true)
    expect(isPathWithinRoot('C:\\', 'C:\\Projects\\Demo', 'win32')).toBe(true)
    expect(isPathWithinRoot('C:\\Projects\\Demo', 'D:\\Projects\\Demo', 'win32')).toBe(false)
    expect(isPathWithinRoot('\\\\Server\\Share\\', '\\\\server\\share\\demo', 'win32')).toBe(true)
    expect(isPathWithinRoot('\\\\Server\\Share\\', '\\\\server\\other\\demo', 'win32')).toBe(false)
  })

  it('replaces and closes project watchers and ignores stale events', async () => {
    const firstRoot = await temporaryDirectory()
    const secondRoot = await temporaryDirectory()
    const projectService = new ProjectService()
    const first = await projectService.openRoot(firstRoot)
    const watchers: Array<{
      close: ReturnType<typeof vi.fn>
      emit: (kind: string, path: string | null) => void
    }> = []
    const watchFactory: WatchFactory = (_root, listener) => {
      const watcher = { close: vi.fn(), emit: listener }
      watchers.push(watcher)
      return watcher
    }
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory,
    })
    const events: FileChangedEvent[] = []
    service.subscribe((event) => events.push(event))
    service.start()

    watchers[0]?.emit('change', 'first.txt')
    await projectService.openRoot(secondRoot)
    watchers[0]?.emit('change', 'stale.txt')
    watchers[1]?.emit('rename', 'second.txt')
    await projectService.closeProject()

    expect(events).toEqual([
      { projectId: first.id, relativePath: 'first.txt', kind: 'changed' },
      expect.objectContaining({ relativePath: 'second.txt', kind: 'renamed' }),
    ])
    expect(watchers[0]?.close).toHaveBeenCalledOnce()
    expect(watchers[1]?.close).toHaveBeenCalledOnce()

    service.stop()
    expect(watchers.every((watcher) => watcher.close.mock.calls.length === 1)).toBe(true)
  })

  it('closes an active watcher on service shutdown', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    await projectService.openRoot(root)
    const close = vi.fn()
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: () => ({ close }),
    })
    service.start()

    service.stop()

    expect(close).toHaveBeenCalledOnce()
  })

  it('reports watcher startup failure without corrupting project activation', async () => {
    const root = await temporaryDirectory()
    const projectService = new ProjectService()
    const onWatcherError = vi.fn()
    const service = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: () => {
        throw Object.assign(new Error('watch failed'), { code: 'EACCES' })
      },
      onWatcherError,
    })
    service.start()

    await expect(projectService.openRoot(root)).resolves.toMatchObject({ name: expect.any(String) })
    expect(onWatcherError).toHaveBeenCalledOnce()
    expect(projectService.getActiveProject()).not.toBeNull()
  })
})

const noWatch: WatchFactory = () => ({ close: () => undefined })
