import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileIpcService } from '../../src/main/ipc/file-ipc-service'
import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import { ProjectIpcService } from '../../src/main/ipc/project-ipc-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FILE_CHANNELS, PROJECT_CHANNELS } from '../../src/shared/contracts'

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (event: { sender: { id: number } }, payload: unknown) => Promise<unknown>>()

  handle(channel: string, listener: (event: { sender: { id: number } }, payload: unknown) => Promise<unknown>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: 5 } }, payload)
  }
}

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )))
})

describe('Phase 2B IPC adapters', () => {
  it('validates payloads, authorizes projects, maps errors, and cleans handlers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'student-ide-ipc-'))
    temporaryRoots.push(root)
    await writeFile(join(root, 'main.ts'), 'const value = 1', 'utf8')
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    const projectService = new ProjectService()
    const selectDirectory = vi.fn(async () => root)
    const projectIpc = new ProjectIpcService(registry, projectService, {
      authorizeRecent: vi.fn(),
      selectDirectory,
      publishChanged: vi.fn(),
    })
    const fileSystemService = new FileSystemService(projectService, {
      trashItem: vi.fn(),
      watchFactory: () => ({ close: () => undefined }),
    })
    const publishStatusChanged = vi.fn()
    const fileIpc = new FileIpcService(
      registry,
      fileSystemService,
      vi.fn(),
      publishStatusChanged,
    )
    projectIpc.start()
    fileSystemService.start()
    fileIpc.start()

    await expect(ipcMain.invoke(PROJECT_CHANNELS.open, { unexpected: true }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(selectDirectory).not.toHaveBeenCalled()

    const opened = await ipcMain.invoke(PROJECT_CHANNELS.open, {}) as {
      ok: true
      value: { id: string }
    }
    expect(opened.ok).toBe(true)
    expect(selectDirectory).toHaveBeenCalledOnce()
    await expect(ipcMain.invoke(FILE_CHANNELS.getStatus, {
      projectId: opened.value.id,
    })).resolves.toEqual({
      ok: true,
      value: { projectId: opened.value.id, state: 'AVAILABLE' },
    })
    await expect(ipcMain.invoke(FILE_CHANNELS.getStatus, {
      projectId: 7,
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(publishStatusChanged).toHaveBeenCalledWith({
      projectId: opened.value.id,
      state: 'AVAILABLE',
    })

    await expect(ipcMain.invoke(FILE_CHANNELS.read, {
      projectId: opened.value.id,
      relativePath: 'main.ts',
    })).resolves.toEqual({ ok: true, value: 'const value = 1' })

    await expect(ipcMain.invoke(FILE_CHANNELS.write, {
      projectId: opened.value.id,
      relativePath: 'main.ts',
      content: 'const value = 2',
    })).resolves.toEqual({ ok: true, value: null })
    await expect(ipcMain.invoke(FILE_CHANNELS.read, {
      projectId: opened.value.id,
      relativePath: 'main.ts',
    })).resolves.toEqual({ ok: true, value: 'const value = 2' })

    await expect(ipcMain.invoke(FILE_CHANNELS.write, {
      projectId: opened.value.id,
      relativePath: '../outside.ts',
      content: 'escape',
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })

    await expect(ipcMain.invoke(FILE_CHANNELS.write, {
      projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
      relativePath: 'main.ts',
      content: 'foreign',
    })).resolves.toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })

    await expect(ipcMain.invoke(FILE_CHANNELS.read, {
      projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
      relativePath: 'main.ts',
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' },
    })

    const read = vi.spyOn(fileSystemService, 'read')
    await expect(ipcMain.invoke(FILE_CHANNELS.read, {
      projectId: opened.value.id,
      relativePath: 7,
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(read).not.toHaveBeenCalled()

    fileIpc.stop()
    fileSystemService.stop()
    projectIpc.stop()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('returns a structured AppError when create persistence and safe rollback both fail', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'student-ide-ipc-create-'))
    temporaryRoots.push(parent)
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    const projectService = new ProjectService({
      mkdir: (path) => mkdir(path),
      realpath,
      rmdir: async () => {
        throw Object.assign(new Error('private locked path'), { code: 'EPERM' })
      },
      stat,
    }, process.platform, {
      getRecentProjects: () => [],
      updateRecentProjects: async () => {
        throw new Error('private persistence details')
      },
    })
    const projectIpc = new ProjectIpcService(registry, projectService, {
      authorizeRecent: vi.fn(),
      selectDirectory: async () => parent,
      publishChanged: vi.fn(),
    })
    projectIpc.start()

    await expect(ipcMain.invoke(PROJECT_CHANNELS.create, {
      name: 'stuck-project',
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Project creation failed and its empty directory could not be rolled back safely.',
        operation: 'project:create',
        details: { rollback: 'failed' },
        retryable: false,
      },
    })

    projectIpc.stop()
  })
})

describe('Phase 6 history boundary', () => {
  it('validates opaque history IDs before authorization and blocks denied callers', async () => {
    const ipc = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipc)
    const project = new ProjectService()
    const list = vi.spyOn(project, 'listRecent')
    const authorizeRecent = vi.fn(() => { throw new Error('owner unavailable') })
    const service = new ProjectIpcService(registry, project, {
      authorizeRecent, selectDirectory: async () => null, publishChanged: vi.fn(),
    })
    service.start()
    await expect(ipc.invoke(PROJECT_CHANNELS.openRecent, { id: '../outside' }))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(authorizeRecent).not.toHaveBeenCalled()
    await expect(ipc.invoke(PROJECT_CHANNELS.listRecent, {})).resolves.toMatchObject({ ok: false })
    expect(authorizeRecent).toHaveBeenCalledOnce()
    expect(list).not.toHaveBeenCalled()
    service.stop()
    expect(ipc.handlers.size).toBe(0)
  })
})
