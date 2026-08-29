import { describe, expect, it, vi } from 'vitest'

import {
  confirmRecycleBinDelete,
  explorerReducer,
  initialExplorerModel,
  loadedDirectoryPaths,
  parentDirectory,
} from '../../src/renderer/src/features/explorer/explorer-model'

describe('Explorer model', () => {
  it('loads only the explicitly requested directory', () => {
    const loading = explorerReducer(initialExplorerModel, {
      type: 'load-started',
      path: '',
    })
    const loaded = explorerReducer(loading, {
      type: 'load-succeeded',
      path: '',
      entries: [{
        name: 'src',
        relativePath: 'src',
        kind: 'directory',
        isSymbolicLink: false,
      }],
    })

    expect(Object.keys(loaded.directories)).toEqual([''])
    expect(loaded.directories).not.toHaveProperty('src')
    expect(loadedDirectoryPaths(loaded)).toEqual([''])
  })

  it('represents loading, empty, and error directory states', () => {
    const loading = explorerReducer(initialExplorerModel, {
      type: 'load-started',
      path: 'src',
    })
    const empty = explorerReducer(loading, {
      type: 'load-succeeded',
      path: 'src',
      entries: [],
    })
    const failed = explorerReducer(empty, {
      type: 'load-failed',
      path: 'locked',
      message: 'Permission denied',
    })

    expect(loading.directories.src?.status).toBe('loading')
    expect(empty.directories.src).toEqual({ status: 'loaded', entries: [] })
    expect(failed.directories.locked).toEqual({
      status: 'error',
      message: 'Permission denied',
    })
  })

  it('derives refresh parents and requires explicit Recycle Bin confirmation', () => {
    expect(parentDirectory('src/components/Button.tsx')).toBe('src/components')
    expect(parentDirectory('README.md')).toBe('')
    const deny = vi.fn(() => false)
    const approve = vi.fn(() => true)

    expect(confirmRecycleBinDelete('notes.txt', deny)).toBe(false)
    expect(confirmRecycleBinDelete('notes.txt', approve)).toBe(true)
    expect(approve).toHaveBeenCalledWith('Move “notes.txt” to the Recycle Bin?')
  })
})
