/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OnMount } from '@monaco-editor/react'

import { EditorWorkbench } from '../../src/renderer/src/features/editor/EditorWorkbench'
import { EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import type { ProjectId } from '../../src/shared/contracts'

const monacoMount = vi.hoisted(() => ({ complete: null as (() => void) | null }))

vi.mock('../../src/renderer/src/features/editor/monaco', () => ({
  monaco: { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 } },
}))

vi.mock('@monaco-editor/react', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MockEditor({ onMount }: { onMount: OnMount }) {
      useEffect(() => {
        const instance = createEditor()
        // Monaco initialization is asynchronous; parent effects may run first.
        monacoMount.complete = () => onMount(
          instance as unknown as Parameters<OnMount>[0],
          {} as Parameters<OnMount>[1],
        )
        return () => {
          monacoMount.complete = null
          instance.dispose()
        }
        // Match the wrapper's once-per-instance onMount lifecycle.
      }, [])
      return <div data-testid="monaco-editor" />
    },
  }
})

const instances: ReturnType<typeof createEditor>[] = []

function createEditor() {
  let disposed = false
  const listeners = new Set<() => void>()
  const assertLive = () => {
    if (disposed) throw new Error('InstantiationService has been disposed')
  }
  const instance = {
    setModel: vi.fn((model: unknown) => { assertLive(); return model }),
    saveViewState: vi.fn(() => { assertLive(); return null }),
    restoreViewState: vi.fn(assertLive),
    focus: vi.fn(assertLive),
    addCommand: vi.fn(assertLive),
    onDidDispose: (listener: () => void) => {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    },
    dispose: vi.fn(() => {
      if (disposed) return
      disposed = true
      for (const listener of listeners) listener()
      listeners.clear()
    }),
  }
  instances.push(instance)
  return instance
}

afterEach(() => {
  cleanup()
  instances.length = 0
  document.getElementById('root')?.remove()
})

describe('EditorWorkbench editor lifetime', () => {
  it.each(['switch project', 'close last tab'] as const)(
    'keeps the UI mounted and attaches only to a live editor after %s',
    transition => {
      const projectA = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
      const projectB = 'project_bbbbbbbbbbbbbbbbbbbbbbbb' as ProjectId
      const manager = new EditorModelManager({
        createModel: value => ({
          getValue: () => value,
          setValue: vi.fn(),
          getVersionId: () => 1,
          onDidChangeContent: () => ({ dispose: vi.fn() }),
          updateOptions: vi.fn(),
          dispose: vi.fn(),
        }),
      })
      const first = manager.openDocument(projectA, 'first.ts', 'first')
      const root = document.createElement('div')
      root.id = 'root'
      document.body.append(root)
      const view = render(
        <EditorWorkbench manager={manager} onSave={async () => true}
          navigation={null} readOnly={false} />,
        { container: root },
      )
      act(() => monacoMount.complete!())
      const oldEditor = instances[0]!
      expect(oldEditor.setModel).toHaveBeenLastCalledWith(first.model)
      const previousCalls = oldEditor.setModel.mock.calls.length

      act(() => {
        if (transition === 'switch project') manager.closeProject(projectA)
        else manager.close(first.key)
      })
      expect(first.model.dispose).toHaveBeenCalledOnce()
      expect(oldEditor.dispose).toHaveBeenCalledOnce()
      expect(screen.getByText('Select a file to start editing')).toBeTruthy()
      expect(root.childElementCount).toBeGreaterThan(0)

      const nextProject = transition === 'switch project' ? projectB : projectA
      act(() => { manager.openDocument(nextProject, 'next.ts', 'next') })
      expect(oldEditor.setModel).toHaveBeenCalledTimes(previousCalls)
      act(() => monacoMount.complete!())
      expect(instances[1]!.setModel).toHaveBeenLastCalledWith(manager.getActiveDocument()!.model)
      expect(oldEditor.setModel).toHaveBeenCalledTimes(previousCalls)
      expect(screen.getByRole('region', { name: 'Code editor' })).toBeTruthy()
      expect(screen.getByTestId('monaco-editor')).toBeTruthy()
      expect(root.childElementCount).toBeGreaterThan(0)
      view.unmount()
      manager.dispose()
    },
  )
})
