import { describe, expect, it, vi } from 'vitest'

import { EditorModelManager, type Disposable, type EditorTextModel } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { discoverProjectSourceSnapshot } from '../../src/renderer/src/features/language/project-source-discovery'
import { PHASE_3C_PROJECT_SOURCE_LIMITS } from '../../src/renderer/src/features/language/project-source-snapshot'
import { TypeScriptProjectController } from '../../src/renderer/src/features/language/typescript-project-controller'
import type { AppError, AppResult, FileEntry, FileStat, ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const nextProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId

class MemoryFileApi {
  readonly files = new Map<string, string>()
  readonly listDirectory = vi.fn(async (
    requestedProjectId: ProjectId,
    directory: string,
  ): Promise<AppResult<FileEntry[]>> => {
    const prefix = directory ? `${directory}/` : ''
    const entries = new Map<string, FileEntry>()
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const remainder = path.slice(prefix.length)
      const [name, ...rest] = remainder.split('/')
      if (!name) continue
      const relativePath = prefix + name
      entries.set(relativePath, {
        name,
        relativePath,
        kind: rest.length > 0 ? 'directory' : 'file',
        isSymbolicLink: false,
      })
    }
    return ok([...entries.values()])
  })
  readonly stat = vi.fn(async (
    _projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<FileStat>> => {
    const content = this.files.get(relativePath)
    if (content === undefined) return fail('NOT_FOUND', 'Source disappeared.')
    return ok<FileStat>({
      name: relativePath.split('/').at(-1)!,
      relativePath,
      kind: 'file',
      isSymbolicLink: false,
      size: new TextEncoder().encode(content).byteLength,
      modifiedAt: '2026-09-04T00:00:00.000Z',
    })
  })
  readonly read = vi.fn(async (
    _projectId: ProjectId,
    relativePath: string,
  ): Promise<AppResult<string>> => {
    const content = this.files.get(relativePath)
    return content === undefined
      ? fail('NOT_FOUND', 'Source disappeared.')
      : ok(content)
  })
}

class FakeModel implements EditorTextModel {
  private value: string
  private version = 1
  private readonly listeners = new Set<() => void>()

  constructor(value: string, private readonly onDispose: () => void) {
    this.value = value
  }

  getValue(): string { return this.value }
  getVersionId(): number { return this.version }
  setValue(value: string): void {
    this.value = value
    this.version += 1
    for (const listener of this.listeners) listener()
  }
  onDidChangeContent(listener: () => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }
  dispose(): void {
    this.listeners.clear()
    this.onDispose()
  }
}

function setupController(files: Record<string, string> = {}) {
  const fileApi = new MemoryFileApi()
  for (const [path, content] of Object.entries(files)) fileApi.files.set(path, content)
  const models = new Map<string, FakeModel>()
  const createModel = vi.fn((value: string, _language: string, uri: string) => {
    const model = new FakeModel(value, () => models.delete(uri))
    models.set(uri, model)
    return model
  })
  const host = {
    createModel,
    getModel: (uri: string) => models.get(uri) ?? null,
  }
  const manager = new EditorModelManager(host)
  const controller = new TypeScriptProjectController(fileApi, manager, host)
  const unsubscribe = manager.subscribeDocumentLifecycle(
    (event) => controller.handleEditorLifecycle(event),
  )
  return { controller, createModel, fileApi, manager, models, unsubscribe }
}

describe('production project source discovery', () => {
  it('uses the measured Phase 3C production bounds', () => {
    expect(PHASE_3C_PROJECT_SOURCE_LIMITS).toEqual({
      maximumFiles: 500,
      maximumTotalBytes: 5 * 1024 * 1024,
      maximumFileBytes: 256 * 1024,
    })
  })

  it('discovers only exact Phase 3C extensions and never descends into node_modules', async () => {
    const fileApi = new MemoryFileApi()
    for (const path of [
      'src/a.js', 'src/b.jsx', 'src/c.ts', 'src/d.tsx',
      'src/skip.mjs', 'src/style.css', 'node_modules/pkg/index.ts',
    ]) fileApi.files.set(path, path)

    const plan = await discoverProjectSourceSnapshot(fileApi, projectId, {
      maximumFiles: 500,
      maximumTotalBytes: 5 * 1024 * 1024,
      maximumFileBytes: 256 * 1024,
    })

    expect(plan?.sources.map(({ relativePath }) => relativePath)).toEqual([
      'src/a.js', 'src/b.jsx', 'src/c.ts', 'src/d.tsx',
    ])
    expect(plan?.exclusions).toEqual(expect.arrayContaining([
      { relativePath: 'src/skip.mjs', reason: 'unsupported-language' },
      { relativePath: 'src/style.css', reason: 'unsupported-language' },
    ]))
    expect(fileApi.listDirectory).not.toHaveBeenCalledWith(projectId, 'node_modules')
    expect(fileApi.read).not.toHaveBeenCalledWith(
      projectId,
      'node_modules/pkg/index.ts',
    )
  })

  it('enforces file-count, total-byte, and individual-file bounds', async () => {
    const fileApi = new MemoryFileApi()
    fileApi.files.set('a.ts', '12345')
    fileApi.files.set('b.ts', '12345')
    fileApi.files.set('c.ts', '123456789')

    const plan = await discoverProjectSourceSnapshot(fileApi, projectId, {
      maximumFiles: 2,
      maximumTotalBytes: 8,
      maximumFileBytes: 8,
    })

    expect(plan?.sources.map(({ relativePath }) => relativePath)).toEqual(['a.ts'])
    expect(plan?.exclusions).toEqual(expect.arrayContaining([
      { relativePath: 'b.ts', reason: 'total-byte-limit' },
      { relativePath: 'c.ts', reason: 'file-too-large' },
    ]))

    const countPlan = await discoverProjectSourceSnapshot(fileApi, projectId, {
      maximumFiles: 1,
      maximumTotalBytes: 100,
      maximumFileBytes: 100,
    })
    expect(countPlan?.sources).toHaveLength(1)
    expect(countPlan?.exclusions).toContainEqual({
      relativePath: 'b.ts',
      reason: 'file-count-limit',
    })
  })

  it('aborts stale discovery between asynchronous filesystem operations', async () => {
    const fileApi = new MemoryFileApi()
    fileApi.files.set('a.ts', 'export {}')
    let current = true
    fileApi.listDirectory.mockImplementationOnce(async (...args) => {
      const result = await new MemoryFileApi().listDirectory(...args)
      current = false
      return result
    })

    await expect(discoverProjectSourceSnapshot(fileApi, projectId, {
      maximumFiles: 1,
      maximumTotalBytes: 100,
      maximumFileBytes: 100,
    }, () => current)).resolves.toBeNull()
    expect(fileApi.stat).not.toHaveBeenCalled()
  })
})

describe('TypeScriptProjectController integration', () => {
  it('adopts one canonical model and keeps a dirty buffer authoritative over disk refresh', async () => {
    const setup = setupController({ 'src/main.ts': 'disk A' })
    await setup.controller.activateProject(projectId)
    const backgroundModel = [...setup.models.values()][0]!

    const document = setup.manager.openDocument(projectId, 'src/main.ts', 'disk A')
    document.model.setValue('dirty B')
    setup.fileApi.files.set('src/main.ts', 'disk C')
    await setup.controller.handleFileChanged({
      projectId,
      relativePath: 'src/main.ts',
      kind: 'changed',
    })

    expect(document.model).toBe(backgroundModel)
    expect(document.model.getValue()).toBe('dirty B')
    expect(document.dirty).toBe(true)
    expect(setup.createModel).toHaveBeenCalledTimes(1)
    expect(setup.controller.getSnapshot().sources).toContainEqual({
      relativePath: 'src/main.ts',
      content: 'disk C',
    })
    expect(setup.controller.getSnapshot().backgroundPaths).toEqual([])
  })

  it('incrementally synchronizes change and safely recreates a background after close', async () => {
    const setup = setupController({ 'src/main.ts': 'A' })
    await setup.controller.activateProject(projectId)
    const document = setup.manager.openDocument(projectId, 'src/main.ts', 'A')
    document.model.setValue('B')
    const save = setup.manager.createSaveSnapshot(document.key)!
    setup.fileApi.files.set('src/main.ts', 'B')
    expect(setup.manager.acceptSave(save)).toBe(true)
    expect(setup.controller.getSnapshot().sources[0]?.content).toBe('B')

    setup.manager.close(document.key)
    await flushController(setup.controller)
    expect(setup.controller.getSnapshot().backgroundPaths).toEqual(['src/main.ts'])
    expect([...setup.models.values()][0]?.getValue()).toBe('B')
  })

  it('synchronizes create, rename, and delete through the existing coarse rename event', async () => {
    const setup = setupController({ 'src/a.ts': 'A' })
    await setup.controller.activateProject(projectId)

    setup.fileApi.files.set('src/b.ts', 'B')
    await setup.controller.handleFileChanged({ projectId, relativePath: 'src', kind: 'renamed' })
    expect(sourcePaths(setup.controller)).toEqual(['src/a.ts', 'src/b.ts'])

    setup.fileApi.files.delete('src/b.ts')
    setup.fileApi.files.set('src/c.ts', 'B')
    await setup.controller.handleFileChanged({ projectId, relativePath: 'src', kind: 'renamed' })
    expect(sourcePaths(setup.controller)).toEqual(['src/a.ts', 'src/c.ts'])

    setup.fileApi.files.delete('src/c.ts')
    await setup.controller.handleFileChanged({ projectId, relativePath: 'src/c.ts', kind: 'renamed' })
    expect(sourcePaths(setup.controller)).toEqual(['src/a.ts'])
  })

  it('preserves an open dirty model when its disk source is deleted', async () => {
    const setup = setupController({ 'src/main.ts': 'A' })
    await setup.controller.activateProject(projectId)
    const document = setup.manager.openDocument(projectId, 'src/main.ts', 'A')
    document.model.setValue('unsaved')
    setup.manager.markDiskMissing(document.key)
    setup.fileApi.files.delete('src/main.ts')

    await setup.controller.handleFileChanged({
      projectId,
      relativePath: 'src/main.ts',
      kind: 'changed',
    })

    expect(setup.manager.findDocument(projectId, 'src/main.ts')).toBe(document)
    expect(document.model.getValue()).toBe('unsaved')
    expect(document.dirty).toBe(true)
    expect(document.diskState).toBe('missing')
    expect(setup.controller.getSnapshot().sources).toEqual([])
  })

  it('rejects late old-project discovery and disposes project state on close', async () => {
    const setup = setupController({ 'old.ts': 'old' })
    let resolveOld!: (value: { ok: true; value: FileEntry[] }) => void
    let markOldStarted!: () => void
    const oldStarted = new Promise<void>((resolve) => { markOldStarted = resolve })
    setup.fileApi.listDirectory.mockImplementationOnce(() => {
      markOldStarted()
      return new Promise((resolve) => { resolveOld = resolve })
    })
    const oldSynchronization = setup.controller.activateProject(projectId)
    await oldStarted

    setup.fileApi.files.clear()
    setup.fileApi.files.set('new.ts', 'new')
    const newSynchronization = setup.controller.activateProject(nextProjectId)
    resolveOld(ok([{ name: 'old.ts', relativePath: 'old.ts', kind: 'file', isSymbolicLink: false }]))

    await expect(oldSynchronization).resolves.toBe(false)
    await expect(newSynchronization).resolves.toBe(true)
    expect(setup.controller.getSnapshot().projectId).toBe(nextProjectId)
    expect(sourcePaths(setup.controller)).toEqual(['new.ts'])
    expect(setup.controller.closeProject(nextProjectId)).toBe(true)
    expect(setup.controller.getSnapshot()).toMatchObject({
      projectId: null,
      status: 'STOPPED',
      sources: [],
      backgroundPaths: [],
    })
  })

  it('does not accumulate project models across repeated switch, close, and reopen cycles', async () => {
    const setup = setupController({ 'src/main.ts': 'export const value = 1' })

    for (const activeProjectId of [projectId, nextProjectId, projectId, nextProjectId]) {
      await expect(setup.controller.activateProject(activeProjectId)).resolves.toBe(true)
      expect(setup.models.size).toBe(1)
      expect(setup.controller.getSnapshot()).toMatchObject({
        projectId: activeProjectId,
        status: 'RUNNING',
        backgroundPaths: ['src/main.ts'],
      })
    }

    expect(setup.controller.closeProject(nextProjectId)).toBe(true)
    expect(setup.models.size).toBe(0)
    await expect(setup.controller.activateProject(projectId)).resolves.toBe(true)
    expect(setup.models.size).toBe(1)
    expect(setup.controller.closeProject(projectId)).toBe(true)
    expect(setup.models.size).toBe(0)
  })

  it('keeps editing safe after provider failure and recovers on natural reinitialization', async () => {
    const setup = setupController({ 'src/main.ts': 'disk' })
    setup.fileApi.listDirectory.mockResolvedValueOnce(
      fail('PERMISSION_DENIED', 'Project source access failed.'),
    )
    await expect(setup.controller.activateProject(projectId)).resolves.toBe(false)
    expect(setup.controller.getSnapshot().status).toBe('CRASHED')

    const document = setup.manager.openDocument(projectId, 'src/main.ts', 'disk')
    document.model.setValue('dirty remains authoritative')
    expect(document.dirty).toBe(true)

    await expect(setup.controller.activateProject(projectId)).resolves.toBe(true)
    expect(setup.controller.getSnapshot().status).toBe('RUNNING')
    expect(document.model.getValue()).toBe('dirty remains authoritative')
    expect(document.dirty).toBe(true)
    expect(setup.controller.getSnapshot().backgroundPaths).toEqual([])
  })
})

async function flushController(controller: TypeScriptProjectController): Promise<void> {
  await controller.handleFileChanged({
    projectId,
    relativePath: 'src/main.ts',
    kind: 'changed',
  })
}

function sourcePaths(controller: TypeScriptProjectController): string[] {
  return controller.getSnapshot().sources.map(({ relativePath }) => relativePath).sort()
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value }
}

function fail(code: AppError['code'], message: string): { ok: false; error: AppError } {
  return { ok: false, error: { code, message, retryable: false } }
}
