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

import type {} from '../../src/renderer/src/student-ide'

import App from '../../src/renderer/src/App'
import { ProjectExplorer } from '../../src/renderer/src/features/explorer/ProjectExplorer'
import type {
  AppResult,
  FileApi,
  FileEntry,
  ProjectApi,
  ProjectIdentity,
  ProjectChangedEvent,
  StudentIdeApi,
} from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

afterEach(() => {
  cleanup()
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

  it('ignores stale success and failure responses when previews resolve out of order', async () => {
    const firstRead = deferred<AppResult<string>>()
    const secondRead = deferred<AppResult<string>>()
    const read = vi.fn((
      _projectId: ProjectIdentity['id'],
      relativePath: string,
    ) => (
      relativePath === 'a.ts' ? firstRead.promise : secondRead.promise
    ))
    installApi({
      file: {
        listDirectory: async () => success([file('a.ts'), file('b.ts')]),
        read,
      },
    })
    const onPreview = vi.fn()
    const onClearPreview = vi.fn()
    render(createElement(ProjectExplorer, {
      project,
      onPreview,
      onClearPreview,
    }))
    fireEvent.click(await screen.findByTitle('a.ts'))
    fireEvent.click(screen.getByTitle('b.ts'))

    await act(async () => secondRead.resolve(success('second')))
    expect(onPreview).toHaveBeenCalledWith('b.ts', 'second')

    await act(async () => firstRead.resolve(failure('stale failure')))
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('stale failure')).toBeNull()
  })

  it('invalidates a pending preview when selection changes to a directory', async () => {
    const pendingRead = deferred<AppResult<string>>()
    installApi({
      file: {
        listDirectory: async (_projectId, path) => success(
          path === '' ? [file('a.ts'), directory('src')] : [],
        ),
        read: () => pendingRead.promise,
      },
    })
    const onPreview = vi.fn()
    render(createElement(ProjectExplorer, {
      ...explorerProps(),
      onPreview,
    }))
    fireEvent.click(await screen.findByTitle('a.ts'))
    fireEvent.click(screen.getByTitle('src'))

    await act(async () => pendingRead.resolve(success('stale content')))

    expect(onPreview).not.toHaveBeenCalled()
  })

  it('ignores a pending preview response after component unmount', async () => {
    const pendingRead = deferred<AppResult<string>>()
    installApi({
      file: {
        listDirectory: async () => success([file('a.ts')]),
        read: () => pendingRead.promise,
      },
    })
    const onPreview = vi.fn()
    const rendered = render(createElement(ProjectExplorer, {
      ...explorerProps(),
      onPreview,
    }))
    fireEvent.click(await screen.findByTitle('a.ts'))

    rendered.unmount()
    await act(async () => pendingRead.resolve(success('stale content')))

    expect(onPreview).not.toHaveBeenCalled()
  })
})

describe('App project integration', () => {
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

  it('clears file preview state on project switch and close', async () => {
    let publishProjectChanged: ((event: ProjectChangedEvent) => void) | undefined
    const nextProject = {
      id: 'project_bbbbbbbbbbbbbbbbbbbbbbbb',
      name: 'Next',
    } as ProjectIdentity
    installApi({
      file: {
        listDirectory: async () => success([file('main.ts')]),
        read: async () => success('preview content'),
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
    expect(await screen.findByText('preview content')).not.toBeNull()

    act(() => publishProjectChanged?.({ activeProject: nextProject }))
    expect(screen.queryByText('preview content')).toBeNull()
    expect(await screen.findAllByText('Next')).not.toHaveLength(0)

    act(() => publishProjectChanged?.({ activeProject: null }))
    expect(await screen.findByText('No folder is currently open.')).not.toBeNull()
    expect(screen.queryByText('preview content')).toBeNull()
  })
})

function renderExplorer(): void {
  render(createElement(ProjectExplorer, explorerProps()))
}

function explorerProps() {
  return {
    project,
    onPreview: vi.fn(),
    onClearPreview: vi.fn(),
  }
}

function installApi(overrides: {
  file?: Partial<FileApi>
  project?: Partial<ProjectApi>
} = {}): StudentIdeApi {
  const api: StudentIdeApi = {
    file: {
      listDirectory: async () => success([]),
      stat: async () => failure('Not configured'),
      read: async () => failure('Not configured'),
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
