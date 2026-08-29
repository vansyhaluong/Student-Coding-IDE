import { describe, expect, it, vi } from 'vitest'

import {
  EditorModelManager,
  documentKey,
  isSameOrDescendant,
  languageIdForPath,
  type Disposable,
  type EditorTextModel,
  type MonacoModelHost,
} from '../../src/renderer/src/features/editor/models/editor-model-manager'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const anotherProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId

class FakeModel implements EditorTextModel {
  readonly dispose = vi.fn()
  private value: string
  private version = 1
  private readonly listeners = new Set<() => void>()

  constructor(value: string) {
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
}

function setup() {
  const models: { model: FakeModel; language: string; uri: string }[] = []
  const host: MonacoModelHost = {
    createModel(value, language, uri) {
      const model = new FakeModel(value)
      models.push({ model, language, uri })
      return model
    },
  }
  return { manager: new EditorModelManager(host), models }
}

describe('EditorModelManager', () => {
  it('opens one retained model per normalized document identity', () => {
    const { manager, models } = setup()
    const first = manager.openDocument(projectId, 'src\\App.tsx', 'first')
    const reopened = manager.openDocument(projectId, 'SRC/App.tsx', 'ignored')
    const distinct = manager.openDocument(projectId, 'src/main.ts', 'main')

    expect(reopened).toBe(first)
    expect(distinct).not.toBe(first)
    expect(models).toHaveLength(2)
    expect(first.languageId).toBe('typescript')
    expect(first.key).toBe(documentKey(projectId, 'src/App.tsx'))
    expect(models[0]?.uri).toContain('student-ide://project/')
  })

  it('tracks dirty against the saved content rather than change occurrence', () => {
    const { manager } = setup()
    const document = manager.openDocument(projectId, 'main.ts', 'A')
    expect(document.dirty).toBe(false)

    document.model.setValue('B')
    expect(document.dirty).toBe(true)
    document.model.setValue('A')
    expect(document.dirty).toBe(false)
  })

  it('accepts only a current successful save as clean and retains a newer edit as dirty', () => {
    const { manager } = setup()
    const document = manager.openDocument(projectId, 'main.ts', 'A')
    document.model.setValue('B')
    const snapshot = manager.createSaveSnapshot(document.key)!
    expect(manager.acceptSave(snapshot)).toBe(true)
    expect(document.dirty).toBe(false)

    document.model.setValue('C')
    const stale = manager.createSaveSnapshot(document.key)!
    document.model.setValue('D')
    expect(manager.acceptSave(stale)).toBe(false)
    expect(document.dirty).toBe(true)
    document.model.setValue('C')
    expect(document.dirty).toBe(false)
  })

  it('does not change the baseline when a failed save is not accepted', () => {
    const { manager } = setup()
    const document = manager.openDocument(projectId, 'main.ts', 'A')
    document.model.setValue('B')
    manager.createSaveSnapshot(document.key)
    expect(document.dirty).toBe(true)
  })

  it('uses deterministic active-tab fallback and disposes only truly closed models', () => {
    const { manager, models } = setup()
    const first = manager.openDocument(projectId, 'a.ts', 'a')
    const second = manager.openDocument(projectId, 'b.ts', 'b')
    const third = manager.openDocument(projectId, 'c.ts', 'c')
    manager.activate(second.key)

    manager.close(second.key)
    expect(manager.getActiveDocument()?.key).toBe(third.key)
    expect(models[1]?.model.dispose).toHaveBeenCalledOnce()
    expect(models[0]?.model.dispose).not.toHaveBeenCalled()
    expect(manager.findDocument(projectId, first.relativePath)).toBe(first)
  })

  it('disposes only models owned by the closed project', () => {
    const { manager, models } = setup()
    manager.openDocument(projectId, 'a.ts', 'a')
    manager.openDocument(anotherProjectId, 'b.ts', 'b')

    manager.closeProject(projectId)

    expect(manager.getOpenDocuments()).toHaveLength(1)
    expect(manager.getOpenDocuments()[0]?.projectId).toBe(anotherProjectId)
    expect(models[0]?.model.dispose).toHaveBeenCalledOnce()
    expect(models[1]?.model.dispose).not.toHaveBeenCalled()
  })

  it('retains view state and preserves it across activation', () => {
    const { manager } = setup()
    const document = manager.openDocument(projectId, 'a.ts', 'a')
    const viewState = { cursorState: [], viewState: {} } as never
    manager.setViewState(document.key, viewState)
    expect(manager.getViewState(document.key)).toBe(viewState)
  })

  it('renames file and folder identities without duplicate stale models', () => {
    const { manager, models } = setup()
    const file = manager.openDocument(projectId, 'src/a.ts', 'a')
    const nested = manager.openDocument(projectId, 'src/nested/b.ts', 'b')
    file.model.setValue('dirty')

    manager.renamePath(projectId, 'src', 'lib', true)

    expect(manager.findDocument(projectId, 'src/a.ts')).toBeNull()
    expect(manager.findDocument(projectId, 'lib/a.ts')?.dirty).toBe(true)
    expect(manager.findDocument(projectId, 'lib/nested/b.ts')).not.toBeNull()
    expect(manager.getOpenDocuments()).toHaveLength(2)
    expect(models[0]?.model.dispose).toHaveBeenCalledOnce()
    expect(models[1]?.model.dispose).toHaveBeenCalledOnce()
    expect(models).toHaveLength(4)
    expect(nested.relativePath).toBe('lib/nested/b.ts')
  })

  it('matches normalized ancestry without matching sibling prefixes', () => {
    expect(isSameOrDescendant('src/foo/a.ts', 'src/foo')).toBe(true)
    expect(isSameOrDescendant('src/foo', 'src/foo')).toBe(true)
    expect(isSameOrDescendant('src/foobar/a.ts', 'src/foo')).toBe(false)
  })

  it('reloads clean external changes and protects dirty content with a conflict', () => {
    const { manager } = setup()
    const clean = manager.openDocument(projectId, 'clean.ts', 'A')
    expect(manager.reloadClean(clean.key, 'B')).toBe(true)
    expect(clean.model.getValue()).toBe('B')
    expect(clean.dirty).toBe(false)

    const dirty = manager.openDocument(projectId, 'dirty.ts', 'A')
    dirty.model.setValue('mine')
    manager.markExternalConflict(dirty.key)
    expect(manager.reloadClean(dirty.key, 'disk')).toBe(false)
    expect(dirty.model.getValue()).toBe('mine')
    expect(dirty.externalConflict).toBe(true)
  })

  it('maps only Phase 2C syntax languages', () => {
    expect(languageIdForPath('a.js')).toBe('javascript')
    expect(languageIdForPath('a.tsx')).toBe('typescript')
    expect(languageIdForPath('a.py')).toBe('python')
    expect(languageIdForPath('a.cs')).toBe('csharp')
    expect(languageIdForPath('README')).toBe('plaintext')
  })
})
