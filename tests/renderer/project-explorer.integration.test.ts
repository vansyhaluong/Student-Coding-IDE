/** @vitest-environment jsdom */

import { StrictMode, createElement } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const monacoModels = vi.hoisted(() => [] as Array<{
  value: string
  version: number
  disposed: boolean
  listeners: Set<() => void>
  getValue(): string
  setValue(value: string): void
  getVersionId(): number
  onDidChangeContent(listener: () => void): { dispose(): void }
  dispose(): void
}>)
const editorCommands = vi.hoisted(() => [] as Array<() => void>)

vi.mock('../../src/renderer/src/features/editor/monaco', () => ({
  monaco: { KeyMod: { CtrlCmd: 1 }, KeyCode: { KeyS: 2 } },
  monacoModelHost: {
    createModel(value: string) {
      const listeners = new Set<() => void>()
      const model = {
        value,
        version: 1,
        disposed: false,
        listeners,
        getValue() { return this.value },
        setValue(next: string) {
          this.value = next
          this.version += 1
          for (const listener of listeners) listener()
        },
        getVersionId() { return this.version },
        onDidChangeContent(listener: () => void) {
          listeners.add(listener)
          return { dispose: () => listeners.delete(listener) }
        },
        dispose() { this.disposed = true },
      }
      monacoModels.push(model)
      return model
    },
  },
}))

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react')
  return {
    loader: { config: vi.fn() },
    default: function MockMonacoEditor({ onMount }: { onMount?: (editor: unknown) => void }) {
      React.useEffect(() => {
        onMount?.({
          addCommand: vi.fn((_binding: number, command: () => void) => {
            editorCommands.push(command)
          }),
          focus: vi.fn(),
          restoreViewState: vi.fn(),
          saveViewState: vi.fn(() => null),
          setModel: vi.fn(),
        })
      }, [onMount])
      return React.createElement('div', { 'data-testid': 'monaco-editor' })
    },
  }
})

import type {} from '../../src/renderer/src/student-ide'

import App from '../../src/renderer/src/App'
import { editorModelManager } from '../../src/renderer/src/features/editor/editor-session'
import { ProjectExplorer } from '../../src/renderer/src/features/explorer/ProjectExplorer'
import type {
  AppResult,
  FileApi,
  FileChangedEvent,
  LifecycleApi,
  FileEntry,
  ProjectApi,
  ProjectIdentity,
  ProjectChangedEvent,
  StudentIdeApi,
  UnsavedTransitionRequestEvent,
} from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

afterEach(() => {
  cleanup()
  editorModelManager.dispose()
  monacoModels.splice(0)
  editorCommands.splice(0)
  vi.restoreAllMocks()
})

describe('ProjectExplorer integration', () => {
  it('loads the root initially and expands folders lazily', async () => {
    const listDirectory = vi.fn(async (
      _projectId: ProjectIdentity['id'],
      relativePath: string,
    ) => (
      success(relativePath === '' ? [directory('src')] : [file('src/main.ts')])
    ))
    installApi({ file: { listDirectory } })

    renderExplorer()

    expect(await screen.findByText('src')).not.toBeNull()
    expect(listDirectory).toHaveBeenCalledTimes(1)
    expect(listDirectory).toHaveBeenLastCalledWith(project.id, '')
    expect(screen.queryByText('main.ts')).toBeNull()

    fireEvent.click(screen.getByTitle('src'))

    expect(await screen.findByText('main.ts')).not.toBeNull()
    expect(listDirectory).toHaveBeenLastCalledWith(project.id, 'src')
  })

  it('survives StrictMode effect replay and renders the initial result', async () => {
    const listDirectory = vi.fn(async () => success<FileEntry[]>([]))
    installApi({ file: { listDirectory } })

    render(createElement(
      StrictMode,
      null,
      createElement(ProjectExplorer, explorerProps()),
    ))

    expect(await screen.findByText('Empty folder')).not.toBeNull()
    expect(listDirectory.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('refreshes every loaded directory', async () => {
    const listDirectory = vi.fn(async (
      _projectId: ProjectIdentity['id'],
      relativePath: string,
    ) => (
      success(relativePath === '' ? [directory('src')] : [file('src/main.ts')])
    ))
    installApi({ file: { listDirectory } })
    renderExplorer()
    fireEvent.click(await screen.findByTitle('src'))
    await screen.findByText('main.ts')
    listDirectory.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Explorer' }))

    await waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(2))
    expect(listDirectory.mock.calls.map((call) => call[1]).sort()).toEqual(['', 'src'])
  })

  it('keeps the newest directory refresh when responses resolve out of order', async () => {
    const initialLoad = deferred<AppResult<FileEntry[]>>()
    const refreshLoad = deferred<AppResult<FileEntry[]>>()
    const listDirectory = vi.fn()
      .mockReturnValueOnce(initialLoad.promise)
      .mockReturnValueOnce(refreshLoad.promise)
    installApi({ file: { listDirectory } })
    renderExplorer()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Explorer' }))
    await act(async () => refreshLoad.resolve(success([file('new.ts')])))
    expect(await screen.findByText('new.ts')).not.toBeNull()

    await act(async () => initialLoad.resolve(success([file('stale.ts')])))
    expect(screen.queryByText('stale.ts')).toBeNull()
    expect(screen.queryByText('new.ts')).not.toBeNull()
  })

  it('presents a directory error and retries through the bridge', async () => {
    const listDirectory = vi.fn()
      .mockResolvedValueOnce(failure<FileEntry[]>('Permission denied'))
      .mockResolvedValueOnce(success<FileEntry[]>([]))
    installApi({ file: { listDirectory } })
    renderExplorer()

    expect(await screen.findByText('Permission denied')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Empty folder')).not.toBeNull()
    expect(listDirectory).toHaveBeenCalledTimes(2)
  })

  it('creates files and folders through the selected directory boundary', async () => {
    const createFile = vi.fn(async () => success(file('main.ts')))
    const createDirectory = vi.fn(async () => success(directory('src')))
    installApi({
      file: {
        createDirectory,
        createFile,
        listDirectory: async () => success([]),
      },
    })
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('main.ts')
      .mockReturnValueOnce('src')
    renderExplorer()
    await screen.findByText('Empty folder')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))
    await waitFor(() => expect(createFile).toHaveBeenCalledWith(project.id, '', 'main.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await waitFor(() => expect(createDirectory).toHaveBeenCalledWith(project.id, '', 'src'))
  })

  it('renames the selected entry through the bridge', async () => {
    const rename = vi.fn(async () => success(file('renamed.ts')))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('content'),
        rename,
      },
    })
    vi.spyOn(window, 'prompt').mockReturnValue('renamed.ts')
    renderExplorer()
    fireEvent.click(await screen.findByTitle('main.ts'))

    fireEvent.click(screen.getByRole('button', { name: 'Rename selected item' }))

    await waitFor(() => expect(rename).toHaveBeenCalledWith(
      project.id,
      'main.ts',
      'renamed.ts',
    ))
  })

  it('requires confirmation before deletion and calls only the approved bridge action', async () => {
    const deleteEntry = vi.fn(async () => success(null))
    installApi({
      file: {
        delete: deleteEntry,
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('content'),
      },
    })
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    renderExplorer()
    fireEvent.click(await screen.findByTitle('main.ts'))
    const deleteButton = screen.getByRole('button', {
      name: 'Move selected item to Recycle Bin',
    })

    fireEvent.click(deleteButton)
    expect(deleteEntry).not.toHaveBeenCalled()
    fireEvent.click(deleteButton)

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(project.id, 'main.ts'))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('shows bridge mutation errors without hiding them in renderer state', async () => {
    installApi({
      file: {
        createFile: async () => failure('Cannot create file'),
        listDirectory: async () => success([]),
      },
    })
    vi.spyOn(window, 'prompt').mockReturnValue('main.ts')
    renderExplorer()
    await screen.findByText('Empty folder')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Cannot create file')
  })

  it('routes file selection to the editor without reading inside Explorer', async () => {
    const onOpenFile = vi.fn()
    const read = vi.fn()
    installApi({
      file: {
        listDirectory: async () => success([file('a.ts')]),
        read,
      },
    })
    render(createElement(ProjectExplorer, {
      project,
      onOpenFile,
    }))
    fireEvent.click(await screen.findByTitle('a.ts'))
    expect(onOpenFile).toHaveBeenCalledWith('a.ts')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('App project integration', () => {
  it('retains the active canonical model across an App remount in the same renderer session', async () => {
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
      },
      project: { getActive: async () => success(project) },
    })
    const view = render(createElement(App, { key: 'before-refresh' }))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    const retainedModel = monacoModels[0]

    view.rerender(createElement(App, { key: 'after-refresh' }))

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Close main.ts' }),
    ).not.toBeNull())
    expect(await screen.findByTestId('monaco-editor')).not.toBeNull()
    expect(monacoModels).toHaveLength(1)
    expect(monacoModels[0]).toBe(retainedModel)
    expect(retainedModel?.disposed).toBe(false)
    expect(screen.queryByText('Select a file to start editing')).toBeNull()
  })

  it('ignores an external reload owned by an App instance that has remounted', async () => {
    const changedEvents = createFileChangedEventBus()
    const reloadB = deferred<AppResult<string>>()
    const reloadC = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(reloadB.promise)
      .mockReturnValueOnce(reloadC.promise)
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    const view = render(createElement(App, { key: 'before-refresh' }))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => changedEvents.publish(fileChanged('main.ts')))
    view.rerender(createElement(App, { key: 'after-refresh' }))
    await screen.findByRole('button', { name: 'Close main.ts' })
    act(() => changedEvents.publish(fileChanged('main.ts')))
    await act(async () => reloadC.resolve(success('disk C')))
    await waitFor(() => expect(monacoModels[0]?.getValue()).toBe('disk C'))
    await act(async () => reloadB.resolve(success('disk B')))

    expect(monacoModels[0]?.getValue()).toBe('disk C')
    expect(monacoModels[0]?.disposed).toBe(false)
    expect(screen.getByRole('tab').getAttribute('aria-selected')).toBe('true')
  })

  it('keeps the active editor through Explorer, watcher, and same-project updates', async () => {
    const changedEvents = createFileChangedEventBus()
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockResolvedValueOnce(success('disk B'))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: {
        getActive: async () => success(project),
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    const retainedModel = monacoModels[0]

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Explorer' }))
    act(() => publishProjectChanged?.({ activeProject: { ...project } }))
    act(() => changedEvents.publish(fileChanged('main.ts')))

    await waitFor(() => expect(retainedModel?.getValue()).toBe('disk B'))
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()
    expect(screen.getByRole('tab').getAttribute('aria-selected')).toBe('true')
    expect(monacoModels).toHaveLength(1)
    expect(retainedModel?.disposed).toBe(false)
    expect(screen.queryByText('Select a file to start editing')).toBeNull()
  })

  it('keeps project change events authoritative over a stale initial response and resets on close', async () => {
    const initialProject = deferred<AppResult<ProjectIdentity | null>>()
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const nextProject = {
      id: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Next',
    } as ProjectIdentity
    installApi({
      project: {
        getActive: () => initialProject.promise,
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))

    act(() => publishProjectChanged?.({ activeProject: nextProject }))
    expect(await screen.findAllByText('Next')).not.toHaveLength(0)
    await act(async () => initialProject.resolve(success(project)))
    expect(screen.queryByText('Demo')).toBeNull()

    act(() => publishProjectChanged?.({ activeProject: null }))
    expect(await screen.findByText('No folder is currently open.')).not.toBeNull()
    expect(screen.queryByText('Next')).toBeNull()
  })

  it('presents project bridge errors to the user', async () => {
    installApi({
      project: {
        getActive: async () => success(null),
        open: async () => failure('Project could not be opened'),
      },
    })
    render(createElement(App))
    await screen.findByText('No folder is currently open.')

    fireEvent.click(screen.getAllByRole('button', { name: 'Open project' })[0]!)

    expect((await screen.findByRole('alert')).textContent).toContain('Project could not be opened')
  })

  it('disposes editor tabs on project switch and close', async () => {
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const nextProject = {
      id: 'project_bbbbbbbbbbbbbbbbbbbbbbbb',
      name: 'Next',
    } as ProjectIdentity
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('editor content'),
      },
      project: {
        getActive: async () => success(project),
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    expect(await screen.findByText('main.ts')).not.toBeNull()
    expect(await screen.findByTestId('monaco-editor')).not.toBeNull()

    act(() => publishProjectChanged?.({ activeProject: nextProject }))
    expect(screen.queryByText('main.ts')).toBeNull()
    expect(await screen.findAllByText('Next')).not.toHaveLength(0)

    act(() => publishProjectChanged?.({ activeProject: null }))
    expect(await screen.findByText('No folder is currently open.')).not.toBeNull()
    expect(screen.queryByText('main.ts')).toBeNull()
  })

  it('keeps the latest A/B open intent active when reads resolve out of order', async () => {
    const first = deferred<AppResult<string>>()
    const second = deferred<AppResult<string>>()
    installApi({
      file: {
        listDirectory: async () => success([file('a.ts'), file('b.ts')]),
        read: async (_projectId, path) => path === 'a.ts' ? first.promise : second.promise,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('a.ts'))
    fireEvent.click(screen.getByTitle('b.ts'))
    await act(async () => second.resolve(success('B')))
    await act(async () => first.resolve(success('A')))

    const aTab = screen.getAllByText('a.ts').find((element) => element.closest('[role="tab"]'))
    const bTab = screen.getAllByText('b.ts').find((element) => element.closest('[role="tab"]'))
    expect(bTab?.closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('true')
    expect(aTab?.closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('false')
  })

  it('keeps dirty state and the tab open when save fails', async () => {
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
        write: async () => failure('Disk is locked'),
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('B'))
    expect(await screen.findByLabelText('Unsaved changes')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close main.ts' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Disk is locked')
    expect(screen.getAllByText('main.ts').some(
      (element) => Boolean(element.closest('[role="tab"]')),
    )).toBe(true)
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
  })

  it('saves the active model through Ctrl+S and clears dirty only after success', async () => {
    const write = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
        write,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('B'))
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()

    await act(async () => editorCommands[0]?.())

    expect(write).toHaveBeenCalledWith(project.id, 'main.ts', 'B')
    await waitFor(() => expect(screen.queryByLabelText('Unsaved changes')).toBeNull())
  })

  it('returns Cancel and Don\'t Save decisions to the scoped Main transition', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const resolveUnsavedTransition = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
      },
      lifecycle: {
        onUnsavedTransitionRequested: (listener) => {
          requestUnsaved = listener
          return () => undefined
        },
        resolveUnsavedTransition,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('B'))

    act(() => requestUnsaved?.(transitionEvent('11111111-1111-4111-8111-111111111111')))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      false,
    ))
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()

    act(() => requestUnsaved?.(transitionEvent('22222222-2222-4222-8222-222222222222')))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      true,
    ))
    expect(screen.queryByRole('button', { name: 'Close main.ts' })).toBeNull()
  })

  it('blocks a Main transition when Save fails', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const resolveUnsavedTransition = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
        write: async () => failure('Save failed'),
      },
      lifecycle: {
        onUnsavedTransitionRequested: (listener) => {
          requestUnsaved = listener
          return () => undefined
        },
        resolveUnsavedTransition,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('B'))
    act(() => requestUnsaved?.(transitionEvent('33333333-3333-4333-8333-333333333333')))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      false,
    ))
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
  })

  it('reloads a clean external change and preserves dirty content with a warning', async () => {
    const changedEvents = createFileChangedEventBus()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockResolvedValueOnce(success('disk B'))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    const retainedModel = monacoModels[0]

    act(() => changedEvents.publish({
      projectId: project.id,
      relativePath: 'main.ts',
      kind: 'changed',
    }))
    await waitFor(() => expect(monacoModels[0]?.getValue()).toBe('disk B'))
    expect(monacoModels[0]).toBe(retainedModel)
    expect(monacoModels).toHaveLength(1)
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull()

    act(() => monacoModels[0]!.setValue('mine'))
    act(() => changedEvents.publish({
      projectId: project.id,
      relativePath: 'main.ts',
      kind: 'changed',
    }))
    expect((await screen.findByRole('alert')).textContent).toContain('changed on disk')
    expect(monacoModels[0]?.getValue()).toBe('mine')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('applies a pending clean reload after another document is opened', async () => {
    const changedEvents = createFileChangedEventBus()
    const pendingReload = deferred<AppResult<string>>()
    let mainReads = 0
    const read = vi.fn(async (_projectId: ProjectIdentity['id'], path: string) => {
      if (path === 'other.ts') return success('other')
      mainReads += 1
      return mainReads === 1 ? success('A') : pendingReload.promise
    })
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts'), file('other.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    fireEvent.click(screen.getByTitle('other.ts'))
    await waitFor(() => expect(monacoModels).toHaveLength(2))
    const mainTab = screen.getAllByText('main.ts').find(
      (element) => Boolean(element.closest('[role="tab"]')),
    )
    fireEvent.click(mainTab!)

    act(() => changedEvents.publish(fileChanged('main.ts')))
    const otherTab = screen.getAllByText('other.ts').find(
      (element) => Boolean(element.closest('[role="tab"]')),
    )
    fireEvent.click(otherTab!)
    await act(async () => pendingReload.resolve(success('disk B')))

    await waitFor(() => expect(monacoModels[0]?.getValue()).toBe('disk B'))
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull()
  })

  it('keeps the newest external content when reloads complete out of order', async () => {
    const changedEvents = createFileChangedEventBus()
    const reloadB = deferred<AppResult<string>>()
    const reloadC = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(reloadB.promise)
      .mockReturnValueOnce(reloadC.promise)
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => {
      changedEvents.publish(fileChanged('main.ts'))
      changedEvents.publish(fileChanged('main.ts'))
    })
    await act(async () => reloadC.resolve(success('disk C')))
    await waitFor(() => expect(monacoModels[0]?.getValue()).toBe('disk C'))
    await act(async () => reloadB.resolve(success('disk B')))

    expect(monacoModels[0]?.getValue()).toBe('disk C')
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull()
  })

  it('protects an edit made while a clean external reload is pending', async () => {
    const changedEvents = createFileChangedEventBus()
    const pendingReload = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(pendingReload.promise)
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => changedEvents.publish(fileChanged('main.ts')))
    act(() => monacoModels[0]!.setValue('local X'))
    await act(async () => pendingReload.resolve(success('disk B')))

    expect(monacoModels[0]?.getValue()).toBe('local X')
    expect((await screen.findByRole('alert')).textContent).toContain('changed on disk')
  })

  it('does not let an older external reload overwrite a newer successful save', async () => {
    const changedEvents = createFileChangedEventBus()
    const pendingReload = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(pendingReload.promise)
    const write = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        write,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => changedEvents.publish(fileChanged('main.ts')))
    act(() => monacoModels[0]!.setValue('saved X'))
    await act(async () => editorCommands[0]?.())
    await waitFor(() => expect(screen.queryByLabelText('Unsaved changes')).toBeNull())
    await act(async () => pendingReload.resolve(success('disk B')))

    expect(write).toHaveBeenCalledWith(project.id, 'main.ts', 'saved X')
    expect(monacoModels[0]?.getValue()).toBe('saved X')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores a pending reload from a closed model after the same file is reopened', async () => {
    const changedEvents = createFileChangedEventBus()
    const pendingReload = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(pendingReload.promise)
      .mockResolvedValueOnce(success('disk C'))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => changedEvents.publish(fileChanged('main.ts')))
    fireEvent.click(screen.getByRole('button', { name: 'Close main.ts' }))
    await waitFor(() => expect(monacoModels[0]?.disposed).toBe(true))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await waitFor(() => expect(monacoModels).toHaveLength(2))
    await act(async () => pendingReload.resolve(success('disk B')))

    expect(monacoModels[1]?.getValue()).toBe('disk C')
    expect(monacoModels[1]?.disposed).toBe(false)
    expect(monacoModels).toHaveLength(2)
  })

  it('does not reload or resurrect a closed document after an external event', async () => {
    const changedEvents = createFileChangedEventBus()
    const read = vi.fn().mockResolvedValue(success('A'))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    fireEvent.click(screen.getByRole('button', { name: 'Close main.ts' }))
    await waitFor(() => expect(monacoModels[0]?.disposed).toBe(true))

    act(() => changedEvents.publish(fileChanged('main.ts')))

    expect(read).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Close main.ts' })).toBeNull()
    expect(monacoModels).toHaveLength(1)
  })

  it('ignores a pending external reload after the project switches', async () => {
    const changedEvents = createFileChangedEventBus()
    const pendingReload = deferred<AppResult<string>>()
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(pendingReload.promise)
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read,
        onChanged: changedEvents.subscribe,
      },
      project: {
        getActive: async () => success(project),
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => changedEvents.publish(fileChanged('main.ts')))
    act(() => publishProjectChanged?.({
      activeProject: {
        id: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Next',
      } as ProjectIdentity,
    }))
    await act(async () => pendingReload.resolve(success('disk B')))

    expect(monacoModels[0]?.disposed).toBe(true)
    expect(screen.queryByRole('button', { name: 'Close main.ts' })).toBeNull()
    expect(await screen.findAllByText('Next')).not.toHaveLength(0)
  })

  it('ignores a file read that resolves after the project switches', async () => {
    const pending = deferred<AppResult<string>>()
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: () => pending.promise,
      },
      project: {
        getActive: async () => success(project),
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    act(() => publishProjectChanged?.({
      activeProject: {
        id: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Next',
      } as ProjectIdentity,
    }))
    await act(async () => pending.resolve(success('stale')))
    expect(screen.queryByRole('button', { name: 'Close main.ts' })).toBeNull()
  })

  it('uses one Save All decision before deleting a folder with dirty descendants', async () => {
    const write = vi.fn(async () => success(null))
    const deleteEntry = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async (_projectId, path) => success(
          path === '' ? [directory('src')] : [file('src/a.ts'), file('src/b.ts')],
        ),
        read: async (_projectId, path) => success(path),
        write,
        delete: deleteEntry,
      },
      project: { getActive: async () => success(project) },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('src'))
    fireEvent.click(await screen.findByTitle('src/a.ts'))
    fireEvent.click(screen.getByTitle('src/b.ts'))
    await waitFor(() => expect(monacoModels).toHaveLength(2))
    act(() => {
      monacoModels[0]!.setValue('dirty a')
      monacoModels[1]!.setValue('dirty b')
    })
    fireEvent.click(screen.getAllByTitle('src')[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Move selected item to Recycle Bin' }))
    expect(await screen.findByRole('button', { name: 'Save All' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }))

    await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(project.id, 'src'))
    expect(screen.queryByRole('button', { name: 'Close a.ts' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close b.ts' })).toBeNull()
  })
})

function renderExplorer(): void {
  render(createElement(ProjectExplorer, explorerProps()))
}

function explorerProps() {
  return {
    project,
    onOpenFile: vi.fn(),
    onRenamed: vi.fn(),
    onRequestDelete: vi.fn(async () => true),
  }
}

function installApi(overrides: {
  file?: Partial<FileApi>
  lifecycle?: Partial<LifecycleApi>
  project?: Partial<ProjectApi>
} = {}): StudentIdeApi {
  const api: StudentIdeApi = {
    file: {
      listDirectory: async () => success([]),
      stat: async () => failure('Not configured'),
      read: async () => failure('Not configured'),
      write: async () => failure('Not configured'),
      createFile: async () => failure('Not configured'),
      createDirectory: async () => failure('Not configured'),
      rename: async () => failure('Not configured'),
      delete: async () => failure('Not configured'),
      onChanged: () => () => undefined,
      ...overrides.file,
    },
    lifecycle: {
      getStatus: async () => success({ state: 'RUNNING' }),
      onStatusChanged: () => () => undefined,
      resolveUnsavedTransition: async () => success(null),
      onUnsavedTransitionRequested: () => () => undefined,
      ...overrides.lifecycle,
    },
    project: {
      getActive: async () => success(null),
      open: async () => success(null),
      create: async () => success(null),
      close: async () => success(null),
      onChanged: () => () => undefined,
      ...overrides.project,
    },
  }
  window.studentIde = api
  return api
}

function file(relativePath: string): FileEntry {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    kind: 'file',
    isSymbolicLink: false,
  }
}

function directory(relativePath: string): FileEntry {
  return {
    name: relativePath.split('/').at(-1) ?? relativePath,
    relativePath,
    kind: 'directory',
    isSymbolicLink: false,
  }
}

function success<T>(value: T): AppResult<T> {
  return { ok: true, value }
}

function failure<T>(message: string): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      retryable: false,
    },
  }
}

function transitionEvent(transitionId: string): UnsavedTransitionRequestEvent {
  return {
    transitionId,
    reason: 'project-close',
    project,
  }
}

function fileChanged(relativePath: string): FileChangedEvent {
  return {
    projectId: project.id,
    relativePath,
    kind: 'changed',
  }
}

function createFileChangedEventBus(): {
  subscribe: FileApi['onChanged']
  publish(event: FileChangedEvent): void
} {
  const listeners = new Set<(event: FileChangedEvent) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    publish(event) {
      for (const listener of [...listeners]) listener(event)
    },
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
