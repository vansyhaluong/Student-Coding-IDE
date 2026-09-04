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
const editorSelections = vi.hoisted(() => [] as Array<{
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}>)
const editorReveals = vi.hoisted(() => [] as typeof editorSelections)
const editorReadOnlyStates = vi.hoisted(() => [] as boolean[])

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
    default: function MockMonacoEditor({
      onMount,
      options,
    }: {
      onMount?: (editor: unknown) => void
      options?: { readOnly?: boolean }
    }) {
      editorReadOnlyStates.push(Boolean(options?.readOnly))
      React.useEffect(() => {
        onMount?.({
          addCommand: vi.fn((_binding: number, command: () => void) => {
            editorCommands.push(command)
          }),
          focus: vi.fn(),
          restoreViewState: vi.fn(),
          saveViewState: vi.fn(() => null),
          setSelection: vi.fn((range) => editorSelections.push(range)),
          revealRangeInCenter: vi.fn((range) => editorReveals.push(range)),
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
  CreateTerminalResponse,
  FileApi,
  FileChangedEvent,
  LifecycleApi,
  LifecycleStatus,
  FileEntry,
  ProjectApi,
  ProjectIdentity,
  ProjectChangedEvent,
  ProjectFileSystemStatus,
  ProjectTransitionSettledEvent,
  SearchApi,
  SearchEvent,
  SearchMatch,
  StudentIdeApi,
  UnsavedTransitionRequestEvent,
} from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  editorModelManager.dispose()
  monacoModels.splice(0)
  editorCommands.splice(0)
  editorSelections.splice(0)
  editorReveals.splice(0)
  editorReadOnlyStates.splice(0)
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
    renderExplorer()
    await screen.findByText('Empty folder')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'main.ts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createFile).toHaveBeenCalledWith(project.id, '', 'main.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'src' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
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
    renderExplorer()
    fireEvent.click(await screen.findByTitle('main.ts'))

    fireEvent.click(screen.getByRole('button', { name: 'Rename selected item' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New name' }), {
      target: { value: 'renamed.ts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

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
    renderExplorer()
    fireEvent.click(await screen.findByTitle('main.ts'))
    const deleteButton = screen.getByRole('button', {
      name: 'Move selected item to Recycle Bin',
    })

    fireEvent.click(deleteButton)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(deleteEntry).not.toHaveBeenCalled()
    fireEvent.click(deleteButton)
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(project.id, 'main.ts'))
  })

  it('shows bridge mutation errors without hiding them in renderer state', async () => {
    installApi({
      file: {
        createFile: async () => failure('Cannot create file'),
        listDirectory: async () => success([]),
      },
    })
    renderExplorer()
    await screen.findByText('Empty folder')

    fireEvent.click(screen.getByRole('button', { name: 'New file' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'main.ts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

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

describe('Project Search integration', () => {
  it('shows grouped loading/results states and preserves search state across sidebar tabs', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    const listDirectory = vi.fn(async () => success<FileEntry[]>([]))
    installApi({
      file: { listDirectory },
      project: { getActive: async () => success(project) },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    vi.useFakeTimers()
    fireEvent.change(input, { target: { value: 'save' } })
    fireEvent.submit(input.closest('form')!)

    expect(start).toHaveBeenCalledOnce()
    expect(screen.queryByText('Searching…')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(screen.getByText('Searching…')).not.toBeNull()
    vi.useRealTimers()
    const operationId = start.mock.calls[0]![1]
    act(() => searchEvents.publish(batchEvent(operationId, [
      searchMatch('src/main.ts', 2, 4, 8, 'const save = true'),
      searchMatch('src/main.ts', 8, 1, 5, 'save()'),
      searchMatch('README.md', 3, 7, 11, 'Press Save to continue'),
    ])))
    act(() => searchEvents.publish(completeEvent(operationId)))

    expect(await screen.findByText('3 matches in 2 files')).not.toBeNull()
    expect(screen.getByText('main.ts')).not.toBeNull()
    expect(screen.getByText('README.md')).not.toBeNull()
    const firstMatch = screen.getByRole('button', { name: 'src/main.ts line 2' })
    expect(firstMatch.textContent).toContain('const save = true')
    expect(firstMatch.querySelector('mark')?.textContent).toBe('save')
    const mainGroup = screen.getByTitle('src/main.ts')
    fireEvent.click(mainGroup)
    expect(mainGroup.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(mainGroup)
    expect(mainGroup.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByRole('tab', { name: 'Explorer' }))
    await screen.findByText('Empty folder')
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    expect(screen.getByText('3 matches in 2 files')).not.toBeNull()
    expect((input as HTMLInputElement).value).toBe('save')
    expect(listDirectory.mock.calls).toEqual([
      [project.id, ''],
      [project.id, ''],
    ])
  })

  it('shows no-results and structured search error states', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    installApi({
      project: { getActive: async () => success(project) },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'missing' } })
    fireEvent.submit(input.closest('form')!)
    expect(start).toHaveBeenCalledOnce()
    act(() => searchEvents.publish(completeEvent(start.mock.calls[0]![1])))
    expect(await screen.findByText('No results found.')).not.toBeNull()

    fireEvent.change(input, { target: { value: 'locked' } })
    fireEvent.submit(input.closest('form')!)
    expect(start).toHaveBeenCalledTimes(2)
    act(() => searchEvents.publish({
      type: 'error',
      projectId: project.id,
      operationId: start.mock.calls[1]![1],
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Search access was denied.',
        retryable: false,
      },
    }))
    expect((await screen.findByRole('alert')).textContent).toContain('Search access was denied.')
  })

  it('ignores Query A events after Query B becomes authoritative', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    installApi({
      project: { getActive: async () => success(project) },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'alpha' } })
    fireEvent.submit(input.closest('form')!)
    expect(start).toHaveBeenCalledTimes(1)
    fireEvent.change(input, { target: { value: 'beta' } })
    fireEvent.submit(input.closest('form')!)
    expect(start).toHaveBeenCalledTimes(2)
    const firstId = start.mock.calls[0]![1]
    const secondId = start.mock.calls[1]![1]

    act(() => searchEvents.publish(batchEvent(firstId, [
      searchMatch('stale.ts', 1, 1, 6, 'alpha'),
    ])))
    act(() => searchEvents.publish(batchEvent(secondId, [
      searchMatch('fresh.ts', 1, 1, 5, 'beta'),
    ])))
    act(() => searchEvents.publish(completeEvent(secondId)))

    expect(await screen.findByText('fresh.ts')).not.toBeNull()
    expect(screen.queryByText('stale.ts')).toBeNull()
  })

  it('debounces rapid query changes into one authoritative search', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    installApi({
      project: { getActive: async () => success(project) },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    vi.useFakeTimers()

    fireEvent.change(input, { target: { value: 'sa' } })
    fireEvent.change(input, { target: { value: 'save' } })

    await act(async () => vi.advanceTimersByTimeAsync(179))
    expect(start).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(start).toHaveBeenCalledOnce()
    expect(start.mock.calls[0]?.[2]).toBe('save')
    vi.useRealTimers()
  })

  it('clears results on project switch and ignores late old-project events', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    installApi({
      project: {
        getActive: async () => success(project),
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'alpha' } })
    fireEvent.submit(input.closest('form')!)
    expect(start).toHaveBeenCalledOnce()
    expect(start.mock.calls[0]?.[2]).toBe('alpha')
    const operationId = start.mock.calls[0]![1]
    act(() => searchEvents.publish(batchEvent(operationId, [
      searchMatch('old.ts', 1, 1, 6, 'alpha'),
    ])))
    expect(await screen.findByText('old.ts')).not.toBeNull()

    const nextProject = {
      id: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Next',
    } as ProjectIdentity
    act(() => publishProjectChanged?.({ activeProject: nextProject }))
    act(() => searchEvents.publish(batchEvent(operationId, [
      searchMatch('late.ts', 2, 1, 6, 'alpha'),
    ])))

    await waitFor(() => expect(screen.queryByText('old.ts')).toBeNull())
    expect(screen.queryByText('late.ts')).toBeNull()
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Type to search in files')).not.toBeNull()
  })

  it('reuses a dirty canonical model and reveals each selected result without overwriting it', async () => {
    const searchEvents = createSearchEventBus()
    const start = vi.fn(async (...args: Parameters<SearchApi['start']>) => {
      void args
      return success(null)
    })
    const read = vi.fn(async () => success('disk save\nsecond save'))
    installApi({
      file: { read },
      project: { getActive: async () => success(project) },
      search: { start, onEvent: searchEvents.subscribe },
    })
    render(createElement(App))
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    const input = screen.getByLabelText('Search project')
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
    act(() => {
      fireEvent.change(input, { target: { value: 'save' } })
      fireEvent.submit(input.closest('form')!)
    })
    expect(start).toHaveBeenCalledOnce()
    expect(start.mock.calls[0]?.[2]).toBe('save')
    const operationId = start.mock.calls[0]![1]
    act(() => searchEvents.publish(batchEvent(operationId, [
      searchMatch('main.ts', 1, 6, 10, 'disk save'),
      searchMatch('main.ts', 2, 8, 12, 'second save'),
    ])))

    fireEvent.click(await screen.findByRole('button', { name: 'main.ts line 1' }))
    await waitFor(() => expect(monacoModels).toHaveLength(1))
    await waitFor(() => expect(editorSelections.at(-1)).toEqual({
      startLineNumber: 1,
      startColumn: 6,
      endLineNumber: 1,
      endColumn: 10,
    }))
    act(() => monacoModels[0]!.setValue('unsaved local content'))

    fireEvent.click(screen.getByRole('button', { name: 'main.ts line 2' }))
    await waitFor(() => expect(editorSelections.at(-1)).toEqual({
      startLineNumber: 2,
      startColumn: 8,
      endLineNumber: 2,
      endColumn: 12,
    }))
    expect(editorReveals.at(-1)).toEqual(editorSelections.at(-1))
    expect(monacoModels).toHaveLength(1)
    expect(monacoModels[0]?.getValue()).toBe('unsaved local content')
    expect(read).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
  })
})

describe('App project integration', () => {
  it('keeps editor tabs in top chrome and sidebars keyboard-resizable in session', async () => {
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    expect(screen.getByRole('tablist', { name: 'Open editors' }).closest('.app-chrome')).not.toBeNull()
    const leftResizer = screen.getByRole('separator', { name: 'Resize left sidebar' })
    const rightResizer = screen.getByRole('separator', { name: 'Resize right sidebar' })
    expect(leftResizer.getAttribute('aria-valuenow')).toBe('280')
    expect(rightResizer.getAttribute('aria-valuenow')).toBe('280')
    fireEvent.keyDown(leftResizer, { key: 'ArrowRight' })
    fireEvent.keyDown(rightResizer, { key: 'ArrowLeft' })
    expect(leftResizer.getAttribute('aria-valuenow')).toBe('290')
    expect(rightResizer.getAttribute('aria-valuenow')).toBe('290')
    expect(screen.getByTestId('monaco-editor')).not.toBeNull()
  })

  it('focuses and dismisses the create-project dialog without a native prompt', async () => {
    installApi({ project: { getActive: async () => success(null) } })
    render(createElement(App))
    await screen.findByText('No folder is currently open.')

    fireEvent.click(screen.getAllByRole('button', { name: 'Create project' })[0]!)
    const input = screen.getByRole('textbox', { name: 'Project name' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Create project' })).toBeNull()
  })

  it('settles project loading state when a transport promise rejects', async () => {
    installApi({
      project: {
        getActive: async () => success(null),
        open: async () => Promise.reject(new Error('raw transport rejection')),
      },
    })
    render(createElement(App))
    await screen.findByText('No folder is currently open.')

    fireEvent.click(screen.getAllByRole('button', { name: 'Open project' })[0]!)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The application request could not be completed.',
    )
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Open project' })[0]!
      .hasAttribute('disabled')).toBe(false)
  })

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
    expect(screen.getByRole('button', { name: 'Close main.ts' })
      .closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps the active editor through Explorer, watcher, and same-project updates', async () => {
    const changedEvents = createFileChangedEventBus()
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockResolvedValue(success('disk B'))
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
    expect(screen.getByRole('button', { name: 'Close main.ts' })
      .closest('[role="tab"]')?.getAttribute('aria-selected')).toBe('true')
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

  it('returns Cancel and Don\'t Save decisions without discarding before Main commits', async () => {
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
    expect(editorReadOnlyStates.at(-1)).toBe(false)
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()

    act(() => requestUnsaved?.(transitionEvent('22222222-2222-4222-8222-222222222222')))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      true,
    ))
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()
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

  it('shows one terminal confirmation with safe default focus and returns the explicit decision', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const resolveUnsavedTransition = vi.fn(async () => success(null))
    installApi({
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
    await screen.findByRole('button', { name: 'Close project' })

    act(() => requestUnsaved?.(transitionEvent(
      '44444444-4444-4444-8444-444444444444',
      true,
      'project-switch',
    )))
    const dialog = await screen.findByRole('dialog', { name: 'Close running terminals?' })
    expect(dialog).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      false,
    ))

    resolveUnsavedTransition.mockClear()
    act(() => requestUnsaved?.(transitionEvent(
      '77777777-7777-4777-8777-777777777777',
      true,
    )))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Close Terminals & Continue',
    }))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777',
      true,
    ))
  })

  it('orders dirty resolution before terminal confirmation and retains dirty state on terminal Cancel', async () => {
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
    act(() => monacoModels[0]!.setValue('dirty'))

    act(() => requestUnsaved?.(transitionEvent(
      '55555555-5555-4555-8555-555555555555',
      true,
      'project-close',
    )))
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Close running terminals?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: "Don't Save" }))
    expect(await screen.findByRole('dialog', { name: 'Close running terminals?' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '55555555-5555-4555-8555-555555555555',
      false,
    ))
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
  })

  it('resolves a clean transition immediately when no live terminal confirmation is required', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const resolveUnsavedTransition = vi.fn(async () => success(null))
    installApi({
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
    await screen.findByRole('button', { name: 'Close project' })
    act(() => requestUnsaved?.(transitionEvent(
      '66666666-6666-4666-8666-666666666666',
    )))

    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      true,
    ))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('treats an expected user-cancelled project transition as neutral', async () => {
    installApi({
      project: {
        getActive: async () => success(project),
        close: async () => expectedProjectCancellation(),
      },
    })
    render(createElement(App))

    fireEvent.click(await screen.findByRole('button', { name: 'Close project' }))

    await waitFor(() => expect(screen.getByText('Ready')).not.toBeNull())
    expect(screen.queryByText('Action failed')).toBeNull()
    expect(screen.queryByText('The project transition was cancelled.')).toBeNull()
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0)
  })

  it('continues to report unrelated PROCESS_CANCELLED failures', async () => {
    installApi({
      project: {
        getActive: async () => success(project),
        close: async () => ({
          ok: false,
          error: {
            code: 'PROCESS_CANCELLED',
            message: 'An unrelated operation was cancelled.',
            operation: 'terminal:create',
            retryable: false,
          },
        }),
      },
    })
    render(createElement(App))

    fireEvent.click(await screen.findByRole('button', { name: 'Close project' }))

    expect(await screen.findByText('An unrelated operation was cancelled.')).not.toBeNull()
    expect(screen.getByText('Action failed')).not.toBeNull()
  })

  it('blocks editor and feature mutations after approval, then restores the old project after cleanup failure', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const openResult = deferred<AppResult<ProjectIdentity | null>>()
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
      project: {
        getActive: async () => success(project),
        open: async () => openResult.promise,
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('dirty before approval'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch project' }))

    act(() => requestUnsaved?.(transitionEvent(
      '88888888-8888-4888-8888-888888888888',
      true,
      'project-switch',
    )))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    fireEvent.click(await screen.findByRole('button', {
      name: 'Close Terminals & Continue',
    }))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      '88888888-8888-4888-8888-888888888888',
      true,
    ))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(true))
    expect(screen.getByTitle('New file').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTitle('New folder').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTitle('New Terminal').hasAttribute('disabled')).toBe(true)

    const model = monacoModels[0]!
    const valueBeforeAttempt = model.getValue()
    const versionBeforeAttempt = model.getVersionId()
    fireEvent.click(screen.getByRole('button', { name: 'Close main.ts' }))
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull()
    expect(model.disposed).toBe(false)
    if (!editorReadOnlyStates.at(-1)) model.setValue('edit after approval')
    expect(model.getValue()).toBe(valueBeforeAttempt)
    expect(model.getVersionId()).toBe(versionBeforeAttempt)

    await act(async () => openResult.resolve(failure('Terminal cleanup failed')))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(false))
    expect(model.disposed).toBe(false)
    expect(model.getValue()).toBe('dirty before approval')
    expect(screen.getByRole('button', { name: 'Switch project' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Close main.ts' }))
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('keeps an ambiguous transport transition locked until its matching settlement', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    let settleProjectTransition: (
      (event: ProjectTransitionSettledEvent) => void
    ) | undefined
    const openResult = deferred<AppResult<ProjectIdentity | null>>()
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
      },
      lifecycle: {
        resolveUnsavedTransition: async () => transportFailure<null>(),
        onUnsavedTransitionRequested: (listener) => {
          requestUnsaved = listener
          return () => undefined
        },
        onProjectTransitionSettled: (listener) => {
          settleProjectTransition = listener
          return () => undefined
        },
      },
      project: {
        getActive: async () => success(project),
        open: async () => openResult.promise,
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('dirty'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch project' }))
    const transitionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    act(() => requestUnsaved?.(transitionEvent(
      transitionId,
      false,
      'project-switch',
    )))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(true))

    await act(async () => openResult.resolve(transportFailure<ProjectIdentity | null>()))
    expect(editorReadOnlyStates.at(-1)).toBe(true)
    expect(monacoModels[0]!.disposed).toBe(false)

    act(() => settleProjectTransition?.({
      transitionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      outcome: 'failed',
    }))
    expect(editorReadOnlyStates.at(-1)).toBe(true)

    act(() => settleProjectTransition?.({ transitionId, outcome: 'failed' }))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(false))
    expect(monacoModels[0]!.disposed).toBe(false)
    expect(monacoModels[0]!.getValue()).toBe('dirty')

    act(() => settleProjectTransition?.({ transitionId, outcome: 'failed' }))
    expect(editorReadOnlyStates.at(-1)).toBe(false)
  })

  it('finishes the existing Save path before entering the committed transition lock', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    const openResult = deferred<AppResult<ProjectIdentity | null>>()
    const write = vi.fn(async () => success(null))
    const resolveUnsavedTransition = vi.fn(async () => success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
        write,
      },
      lifecycle: {
        onUnsavedTransitionRequested: (listener) => {
          requestUnsaved = listener
          return () => undefined
        },
        resolveUnsavedTransition,
      },
      project: {
        getActive: async () => success(project),
        open: async () => openResult.promise,
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('saved before approval'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch project' }))
    act(() => requestUnsaved?.(transitionEvent(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      false,
      'project-switch',
    )))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    await waitFor(() => expect(write).toHaveBeenCalledWith(
      project.id,
      'main.ts',
      'saved before approval',
    ))
    await waitFor(() => expect(resolveUnsavedTransition).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      true,
    ))
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(
      resolveUnsavedTransition.mock.invocationCallOrder[0]!,
    )
    expect(editorReadOnlyStates.at(-1)).toBe(true)

    await act(async () => openResult.resolve(failure('Terminal cleanup failed')))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(false))
  })

  it('keeps the transition lock through success and disposes old project models on commit', async () => {
    let requestUnsaved: ((event: UnsavedTransitionRequestEvent) => void) | undefined
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const openResult = deferred<AppResult<ProjectIdentity | null>>()
    const nextProject = {
      id: 'project_aaaaaaaaaaaaaaaaaaaaaaaa',
      name: 'Next',
    } as ProjectIdentity
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
      },
      project: {
        getActive: async () => success(project),
        open: async () => openResult.promise,
        onChanged: (listener) => {
          publishProjectChanged = listener
          return () => undefined
        },
      },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('dirty'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch project' }))
    act(() => requestUnsaved?.(transitionEvent(
      '99999999-9999-4999-8999-999999999999',
      false,
      'project-switch',
    )))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(true))

    act(() => publishProjectChanged?.({ activeProject: nextProject }))
    await act(async () => openResult.resolve(transportFailure<ProjectIdentity | null>()))
    await waitFor(() => expect(monacoModels[0]!.disposed).toBe(true))
    expect((await screen.findAllByText('Next')).length).toBeGreaterThan(0)
  })

  it('reflects STOPPING, rejects new work, and cleans up lifecycle subscriptions on remount', async () => {
    const statusListeners = new Set<(status: LifecycleStatus) => void>()
    const settlementListeners = new Set<(
      event: ProjectTransitionSettledEvent,
    ) => void>()
    const unsubscribe = vi.fn<(listener: (status: LifecycleStatus) => void) => void>(
      (listener) => statusListeners.delete(listener),
    )
    const onStatusChanged = vi.fn((listener: (status: LifecycleStatus) => void) => {
      statusListeners.add(listener)
      return () => unsubscribe(listener)
    })
    const unsubscribeSettlement = vi.fn((
      listener: (event: ProjectTransitionSettledEvent) => void,
    ) => settlementListeners.delete(listener))
    const onProjectTransitionSettled = vi.fn((
      listener: (event: ProjectTransitionSettledEvent) => void,
    ) => {
      settlementListeners.add(listener)
      return () => unsubscribeSettlement(listener)
    })
    const terminalCreate = vi.fn(async () => failure<CreateTerminalResponse>('must not be called'))
    const api = installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('A'),
        createFile: async () => failure('must not be called'),
      },
      lifecycle: { onStatusChanged, onProjectTransitionSettled },
      project: { getActive: async () => success(project) },
    })
    api.terminal.create = terminalCreate
    const view = render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')

    act(() => {
      for (const listener of statusListeners) listener({ state: 'STOPPING' })
    })
    await waitFor(() => expect(editorReadOnlyStates.at(-1)).toBe(true))
    expect(screen.getByRole('button', { name: 'Switch project' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTitle('New file').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTitle('New Terminal').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
    expect(screen.getByLabelText('Search project').hasAttribute('disabled')).toBe(true)
    expect(terminalCreate).not.toHaveBeenCalled()

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(unsubscribeSettlement).toHaveBeenCalledOnce()
    expect(statusListeners.size).toBe(0)
    expect(settlementListeners.size).toBe(0)
    render(createElement(App))
    await screen.findByRole('button', { name: 'Close project' })
    expect(onStatusChanged).toHaveBeenCalledTimes(2)
    expect(onProjectTransitionSettled).toHaveBeenCalledTimes(2)
    expect(statusListeners.size).toBe(1)
    expect(settlementListeners.size).toBe(1)
  })

  it('reloads a clean external change and preserves dirty content with a warning', async () => {
    const changedEvents = createFileChangedEventBus()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockResolvedValue(success('disk B'))
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
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('marks an externally deleted clean file missing without discarding its buffer', async () => {
    const changedEvents = createFileChangedEventBus()
    const read = vi.fn()
      .mockResolvedValueOnce(success('retained content'))
      .mockResolvedValueOnce(notFound<string>())
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
    const retainedModel = monacoModels[0]!

    act(() => changedEvents.publish(fileChanged('main.ts')))

    expect((await screen.findByRole('alert')).textContent).toContain('deleted outside the IDE')
    expect(retainedModel.getValue()).toBe('retained content')
    expect(retainedModel.disposed).toBe(false)
    expect(screen.queryByLabelText('Unsaved changes')).toBeNull()
  })

  it('preserves a dirty externally deleted buffer and blocks normal save', async () => {
    const changedEvents = createFileChangedEventBus()
    const write = vi.fn(async () => success(null))
    const read = vi.fn()
      .mockResolvedValueOnce(success('disk content'))
      .mockResolvedValueOnce(notFound<string>())
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
    act(() => monacoModels[0]!.setValue('my unsaved work'))

    act(() => changedEvents.publish(fileChanged('main.ts')))
    await screen.findByText(/deleted outside the IDE/)
    await act(async () => editorCommands[0]?.())

    expect(monacoModels[0]!.getValue()).toBe('my unsaved work')
    expect(monacoModels[0]!.disposed).toBe(false)
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
    expect(write).not.toHaveBeenCalled()
    expect(screen.getByText(/no longer exists on disk/)).not.toBeNull()
  })

  it('ignores a stale missing-file response after a newer external reload succeeds', async () => {
    const changedEvents = createFileChangedEventBus()
    const staleMissing = deferred<AppResult<string>>()
    const read = vi.fn()
      .mockResolvedValueOnce(success('A'))
      .mockReturnValueOnce(staleMissing.promise)
      .mockResolvedValueOnce(success('new disk content'))
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
    act(() => changedEvents.publish(fileChanged('main.ts')))
    await waitFor(() => expect(monacoModels[0]!.getValue()).toBe('new disk content'))
    await act(async () => staleMissing.resolve(notFound<string>()))

    expect(screen.queryByText(/deleted outside the IDE/)).toBeNull()
    expect(monacoModels[0]!.getValue()).toBe('new disk content')
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
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Recycle Bin' }))
    expect(await screen.findByRole('button', { name: 'Save All' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }))

    await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith(project.id, 'src'))
    expect(screen.queryByRole('button', { name: 'Close a.ts' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close b.ts' })).toBeNull()
  })

  it('disposes a dirty model only after a confirmed delete succeeds', async () => {
    const deleteResult = deferred<AppResult<null>>()
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('original'),
        delete: async () => deleteResult.promise,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('discard after success'))
    fireEvent.click(screen.getByRole('button', { name: 'Move selected item to Recycle Bin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))

    expect(monacoModels[0]!.disposed).toBe(false)
    expect(monacoModels[0]!.getValue()).toBe('discard after success')
    await act(async () => deleteResult.resolve(success(null)))
    await waitFor(() => expect(monacoModels[0]!.disposed).toBe(true))
  })

  it('preserves a dirty model and content when confirmed deletion fails', async () => {
    const deleteEntry = vi.fn()
      .mockResolvedValueOnce(failure<null>('Recycle Bin unavailable'))
      .mockResolvedValueOnce(success(null))
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('original'),
        delete: deleteEntry,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    act(() => monacoModels[0]!.setValue('must survive'))
    fireEvent.click(screen.getByRole('button', { name: 'Move selected item to Recycle Bin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))

    expect(await screen.findByText('Recycle Bin unavailable')).not.toBeNull()
    expect(monacoModels[0]!.disposed).toBe(false)
    expect(monacoModels[0]!.getValue()).toBe('must survive')
    expect(screen.getByLabelText('Unsaved changes')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Close main.ts' })).not.toBeNull()
    expect(deleteEntry).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Move selected item to Recycle Bin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }))
    fireEvent.click(await screen.findByRole('button', { name: "Don't Save" }))
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(monacoModels[0]!.disposed).toBe(true))
  })

  it('preserves a clean model when confirmed deletion fails', async () => {
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('clean content'),
        delete: async () => failure('Recycle Bin unavailable'),
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    fireEvent.click(await screen.findByTitle('main.ts'))
    await screen.findByTestId('monaco-editor')
    fireEvent.click(screen.getByRole('button', { name: 'Move selected item to Recycle Bin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }))

    expect(await screen.findByText('Recycle Bin unavailable')).not.toBeNull()
    expect(monacoModels[0]!.disposed).toBe(false)
    expect(monacoModels[0]!.getValue()).toBe('clean content')
  })

  it('locks stale filesystem interactions and leaves Close project available', async () => {
    const statuses = createFileSystemStatusEventBus()
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        onStatusChanged: statuses.subscribe,
      },
      project: { getActive: async () => success(project) },
    })
    render(createElement(App))
    await screen.findByTitle('main.ts')

    act(() => statuses.publish({ projectId: project.id, state: 'UNAVAILABLE' }))

    expect(await screen.findByText('Project unavailable')).not.toBeNull()
    expect(screen.getByText(/file monitoring stopped/)).not.toBeNull()
    expect(screen.getByTitle('New file').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTitle('New folder').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close project' }).hasAttribute('disabled')).toBe(false)
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
    onRequestDelete: vi.fn(async () => () => undefined),
  }
}

function installApi(overrides: {
  file?: Partial<FileApi>
  lifecycle?: Partial<LifecycleApi>
  project?: Partial<ProjectApi>
  search?: Partial<SearchApi>
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
      getStatus: async (projectId) => success({ projectId, state: 'AVAILABLE' }),
      onStatusChanged: () => () => undefined,
      ...overrides.file,
    },
    lifecycle: {
      getStatus: async () => success({ state: 'RUNNING' }),
      onStatusChanged: () => () => undefined,
      resolveUnsavedTransition: async () => success(null),
      onUnsavedTransitionRequested: () => () => undefined,
      onProjectTransitionSettled: () => () => undefined,
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
    search: {
      start: async () => success(null),
      cancel: async () => success(null),
      onEvent: () => () => undefined,
      ...overrides.search,
    },
    terminal: {
      create: async () => failure('Not configured'),
      input: async () => failure('Not configured'),
      resize: async () => failure('Not configured'),
      close: async () => failure('Not configured'),
      onEvent: () => () => undefined,
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

function notFound<T>(): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The file no longer exists.',
      retryable: false,
    },
  }
}

function expectedProjectCancellation<T>(): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'PROCESS_CANCELLED',
      message: 'The project transition was cancelled.',
      operation: 'project:close',
      retryable: false,
    },
  }
}

function transportFailure<T>(): AppResult<T> {
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The application request could not be completed.',
      details: { boundaryFailure: 'transport' },
      retryable: true,
    },
  }
}

function transitionEvent(
  transitionId: string,
  terminalConfirmationRequired = false,
  reason: UnsavedTransitionRequestEvent['reason'] = 'project-close',
): UnsavedTransitionRequestEvent {
  return {
    transitionId,
    reason,
    project,
    terminalConfirmationRequired,
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

function createFileSystemStatusEventBus(): {
  subscribe: FileApi['onStatusChanged']
  publish(status: ProjectFileSystemStatus): void
} {
  const listeners = new Set<(status: ProjectFileSystemStatus) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    publish(status) {
      for (const listener of [...listeners]) listener(status)
    },
  }
}

function createSearchEventBus(): {
  subscribe: SearchApi['onEvent']
  publish(event: SearchEvent): void
} {
  const listeners = new Set<(event: SearchEvent) => void>()
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

function searchMatch(
  relativePath: string,
  lineNumber: number,
  columnStart: number,
  columnEnd: number,
  preview: string,
): SearchMatch {
  return {
    projectId: project.id,
    relativePath,
    lineNumber,
    columnStart,
    columnEnd,
    preview,
  }
}

function batchEvent(operationId: string, matches: SearchMatch[]): SearchEvent {
  return { type: 'batch', projectId: project.id, operationId, matches }
}

function completeEvent(operationId: string): SearchEvent {
  return {
    type: 'complete',
    projectId: project.id,
    operationId,
    status: 'completed',
    scannedFiles: 1,
    skippedFiles: 0,
    limitReached: false,
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
