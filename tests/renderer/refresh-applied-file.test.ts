import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectId } from '../../src/shared/contracts'
import {
  EditorModelManager,
  type Disposable,
  type EditorTextModel,
  type MonacoModelHost,
} from '../../src/renderer/src/features/editor/models/editor-model-manager'
import {
  closeDeletedDocument,
  refreshAppliedDocument,
  refreshAppliedFile,
  renameAppliedDocument,
  renameDiscardsDirtySource,
} from '../../src/renderer/src/features/ai/refresh-applied-file'

const editor = vi.hoisted(() => ({
  findDocument: vi.fn(),
  markExternalConflict: vi.fn(),
  reloadClean: vi.fn(),
  close: vi.fn(),
  markDiskMissing: vi.fn(),
  renamePath: vi.fn(),
}))

vi.mock('../../src/renderer/src/features/editor/editor-session', () => ({
  editorModelManager: editor,
}))

const projectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId

beforeEach(() => {
  editor.findDocument.mockReset()
  editor.markExternalConflict.mockReset()
  editor.reloadClean.mockReset()
})

describe('refreshAppliedFile', () => {
  it('reloads a clean open tab with the applied text', () => {
    editor.findDocument.mockReturnValue({ key: 'doc', dirty: false })
    expect(refreshAppliedFile(projectId, 'src/auth.ts', 'next\n')).toBe('reloaded')
    expect(editor.reloadClean).toHaveBeenCalledWith('doc', 'next\n')
    expect(editor.markExternalConflict).not.toHaveBeenCalled()
  })

  it('marks a dirty open tab and leaves its buffer alone', () => {
    editor.findDocument.mockReturnValue({ key: 'doc', dirty: true })
    expect(refreshAppliedFile(projectId, 'src/auth.ts', 'next\n')).toBe('conflict')
    expect(editor.markExternalConflict).toHaveBeenCalledWith('doc')
    expect(editor.reloadClean).not.toHaveBeenCalled()
  })

  it('does nothing when the file is not open', () => {
    editor.findDocument.mockReturnValue(null)
    expect(refreshAppliedFile(projectId, 'src/auth.ts', 'next\n')).toBe('closed')
    expect(editor.reloadClean).not.toHaveBeenCalled()
    expect(editor.markExternalConflict).not.toHaveBeenCalled()
  })
})

class FakeModel implements EditorTextModel {
  readonly dispose = (): void => undefined
  private value: string
  private version = 1
  private readonly listeners = new Set<() => void>()
  constructor(value: string) { this.value = value }
  getValue(): string { return this.value }
  getVersionId(): number { return this.version }
  setValue(value: string): void {
    this.value = value
    this.version += 1
    for (const listener of this.listeners) listener()
  }
  onDidChangeContent(listener: () => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => { this.listeners.delete(listener) } }
  }
}

describe('created file opened afterward', () => {
  it('shows the created text when the tab opens, and reloads a stale empty tab', () => {
    const host: MonacoModelHost = {
      createModel: (value) => new FakeModel(value),
    }
    const manager = new EditorModelManager(host)
    const created = 'export function login() {}\n'
    expect(refreshAppliedDocument(manager, projectId, 'src/auth.ts', created)).toBe('closed')
    const opened = manager.openDocument(projectId, 'src/auth.ts', created)
    expect(opened.model.getValue()).toBe(created)
    expect(opened.dirty).toBe(false)

    const stale = manager.openDocument(projectId, 'src/new.ts', '')
    expect(refreshAppliedDocument(manager, projectId, 'src/new.ts', created)).toBe('reloaded')
    expect(stale.model.getValue()).toBe(created)
    expect(stale.dirty).toBe(false)

    stale.model.setValue('unsaved')
    expect(refreshAppliedDocument(manager, projectId, 'src/new.ts', 'later\n')).toBe('conflict')
    expect(stale.model.getValue()).toBe('unsaved')
    expect(manager.findDocument(projectId, 'src/new.ts')?.externalConflict).toBe(true)
  })
})

describe('deleted and renamed tabs', () => {
  it('closes a clean tab, keeps a dirty buffer, and retargets a renamed tab', () => {
    const host: MonacoModelHost = {
      createModel: (value) => new FakeModel(value),
    }
    const manager = new EditorModelManager(host)
    manager.openDocument(projectId, 'src/old.ts', 'export const old = 1\n')
    expect(closeDeletedDocument(manager, projectId, 'src/old.ts')).toBe('closed')
    expect(manager.findDocument(projectId, 'src/old.ts')).toBeNull()
    expect(closeDeletedDocument(manager, projectId, 'src/missing.ts')).toBe('absent')

    const dirty = manager.openDocument(projectId, 'src/draft.ts', 'saved')
    dirty.model.setValue('unsaved')
    expect(closeDeletedDocument(manager, projectId, 'src/draft.ts')).toBe('kept')
    expect(manager.findDocument(projectId, 'src/draft.ts')).toMatchObject({
      dirty: true,
      diskState: 'missing',
    })
    expect(dirty.model.getValue()).toBe('unsaved')

    manager.openDocument(projectId, 'src/main.ts', 'const value = 1\n')
    expect(renameAppliedDocument(manager, projectId, 'src/main.ts', 'lib/app.ts')).toBe('renamed')
    expect(manager.findDocument(projectId, 'src/main.ts')).toBeNull()
    expect(manager.findDocument(projectId, 'lib/app.ts')?.model.getValue()).toBe('const value = 1\n')
    expect(renameAppliedDocument(manager, projectId, 'src/absent.ts', 'src/next.ts')).toBe('closed')

    manager.openDocument(projectId, 'src/clean.ts', 'taken')
    manager.openDocument(projectId, 'src/from.ts', 'source')
    expect(renameAppliedDocument(manager, projectId, 'src/from.ts', 'src/clean.ts')).toBe('retargeted')
    expect(manager.findDocument(projectId, 'src/from.ts')).toBeNull()
    expect(manager.findDocument(projectId, 'src/clean.ts')?.model.getValue()).toBe('source')
    expect(manager.getActiveDocument()?.relativePath).toBe('src/clean.ts')

    const occupied = manager.openDocument(projectId, 'src/app.ts', 'taken')
    occupied.model.setValue('unsaved dest')
    manager.openDocument(projectId, 'src/source.ts', 'source')
    expect(renameAppliedDocument(manager, projectId, 'src/source.ts', 'src/app.ts')).toBe('conflict')
    expect(manager.findDocument(projectId, 'src/source.ts')).toBeNull()
    expect(manager.findDocument(projectId, 'src/app.ts')?.model.getValue()).toBe('unsaved dest')
    expect(manager.findDocument(projectId, 'src/app.ts')?.externalConflict).toBe(true)
    expect(manager.getActiveDocument()?.relativePath).toBe('src/app.ts')
    expect(renameDiscardsDirtySource(manager, projectId, 'src/source.ts', 'src/app.ts')).toBe(false)
  })

  it('keeps a dirty source tab when the destination tab is also dirty', () => {
    const host: MonacoModelHost = {
      createModel: (value) => new FakeModel(value),
    }
    const manager = new EditorModelManager(host)
    const destination = manager.openDocument(projectId, 'src/app.ts', 'taken')
    destination.model.setValue('unsaved dest')
    const source = manager.openDocument(projectId, 'src/from.ts', 'source')
    source.model.setValue('unsaved source')
    expect(renameDiscardsDirtySource(manager, projectId, 'src/from.ts', 'src/app.ts')).toBe(true)
    expect(renameDiscardsDirtySource(manager, projectId, 'src/from.ts', '../outside.ts')).toBe(false)
    expect(renameDiscardsDirtySource(manager, projectId, 'src/from.ts', '')).toBe(false)
    expect(renameAppliedDocument(manager, projectId, 'src/from.ts', 'src/app.ts')).toBe('blocked')
    expect(manager.findDocument(projectId, 'src/from.ts')?.model.getValue()).toBe('unsaved source')
    expect(manager.findDocument(projectId, 'src/from.ts')?.diskState).toBe('missing')
    expect(manager.findDocument(projectId, 'src/app.ts')?.model.getValue()).toBe('unsaved dest')
    expect(manager.getActiveDocument()?.relativePath).toBe('src/app.ts')

    const cleanSource = manager.openDocument(projectId, 'src/clean-source.ts', 'clean')
    expect(renameDiscardsDirtySource(manager, projectId, 'src/clean-source.ts', 'src/app.ts')).toBe(false)
    expect(cleanSource.dirty).toBe(false)
  })
})
