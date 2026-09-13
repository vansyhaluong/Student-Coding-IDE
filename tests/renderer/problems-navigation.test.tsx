/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {} from '../../src/renderer/src/student-ide'
import { useEditorWorkspace } from '../../src/renderer/src/features/editor/use-editor-workspace'
import {
  EditorModelManager,
  type EditorTextModel,
} from '../../src/renderer/src/features/editor/models/editor-model-manager'
import type {
  AppResult,
  ProjectIdentity,
  StudentIdeApi,
} from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

afterEach(cleanup)

describe('Phase 3E diagnostic navigation', () => {
  it.each(['src/app.ts', 'src/App.cs'])('reuses the canonical dirty diagnostic target %s without disk reads', async relativePath => {
    const read = vi.fn(async () => success('disk content'))
    installStudentIde(read)
    const manager = new EditorModelManager(new FakeModelHost())
    const dirty = manager.openDocument(project.id, relativePath, 'disk content')
    dirty.model.setValue('unsaved dirty content')
    const other = manager.openDocument(project.id, 'other.ts', 'other')
    expect(manager.getActiveDocument()).toBe(other)
    const { result } = renderHook(() => useEditorWorkspace(project, manager))

    await act(async () => result.current.navigateToLocation({
      projectId: project.id,
      relativePath,
      startLineNumber: 4,
      startColumn: 3,
      endLineNumber: 5,
      endColumn: 7,
    }))

    expect(read).not.toHaveBeenCalled()
    expect(manager.getActiveDocument()).toBe(dirty)
    expect(dirty.model.getValue()).toBe('unsaved dirty content')
    expect(dirty.dirty).toBe(true)
    expect(result.current.navigation).toMatchObject({
      projectId: project.id,
      relativePath,
      startLineNumber: 4,
      startColumn: 3,
      endLineNumber: 5,
      endColumn: 7,
    })
  })

  it('opens a current target and safely refuses deleted or old-project targets', async () => {
    const read = vi.fn(async (_projectId, relativePath: string) => relativePath === 'deleted.json'
      ? failure('NOT_FOUND', 'The file no longer exists.')
      : success('body {}'))
    installStudentIde(read)
    const manager = new EditorModelManager(new FakeModelHost())
    const { result } = renderHook(() => useEditorWorkspace(project, manager))

    await act(async () => result.current.navigateToLocation({
      projectId: project.id,
      relativePath: 'styles.css',
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 6,
    }))
    expect(manager.findDocument(project.id, 'styles.css')).not.toBeNull()
    expect(result.current.navigation?.relativePath).toBe('styles.css')

    await act(async () => result.current.navigateToLocation({
      projectId: project.id,
      relativePath: 'deleted.json',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    }))
    expect(manager.findDocument(project.id, 'deleted.json')).toBeNull()
    expect(result.current.navigation?.relativePath).toBe('styles.css')
    expect(result.current.error).toBe('The file no longer exists.')

    const readCount = read.mock.calls.length
    await act(async () => result.current.navigateToLocation({
      projectId: 'project_abcdef1234567890abcdef12' as ProjectIdentity['id'],
      relativePath: 'old.ts',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    }))
    expect(read).toHaveBeenCalledTimes(readCount)
    expect(manager.findDocument(project.id, 'old.ts')).toBeNull()
  })
})

class FakeModelHost {
  private readonly models = new Map<string, FakeTextModel>()
  createModel(value: string, _languageId: string, uri: string): EditorTextModel {
    const model = new FakeTextModel(value, () => this.models.delete(uri))
    this.models.set(uri, model)
    return model
  }
  getModel(uri: string): EditorTextModel | null {
    return this.models.get(uri) ?? null
  }
}

class FakeTextModel implements EditorTextModel {
  private readonly listeners = new Set<() => void>()
  private version = 1
  constructor(private value: string, private readonly onDispose: () => void) {}
  getValue(): string { return this.value }
  getVersionId(): number { return this.version }
  setValue(value: string): void {
    this.value = value
    this.version += 1
    for (const listener of this.listeners) listener()
  }
  onDidChangeContent(listener: () => void) {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }
  dispose(): void { this.onDispose() }
}

function installStudentIde(read: StudentIdeApi['file']['read']): void {
  Object.defineProperty(window, 'studentIde', {
    configurable: true,
    value: {
      lifecycle: {
        getStatus: async () => success({ state: 'RUNNING' }),
        onStatusChanged: () => () => undefined,
        onUnsavedTransitionRequested: () => () => undefined,
        onProjectTransitionSettled: () => () => undefined,
        resolveUnsavedTransition: async () => success(undefined),
      },
      file: {
        read,
        write: async () => success(undefined),
        getStatus: async () => success({ projectId: project.id, state: 'AVAILABLE' }),
        onStatusChanged: () => () => undefined,
        onChanged: () => () => undefined,
      },
    } as unknown as StudentIdeApi,
  })
}

function success<T>(value: T): AppResult<T> {
  return { ok: true, value }
}

function failure(code: 'NOT_FOUND', message: string): AppResult<never> {
  return {
    ok: false,
    error: { code, message, retryable: false },
  }
}
