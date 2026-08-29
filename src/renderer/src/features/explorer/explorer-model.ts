import type { FileEntry } from '../../../../shared/contracts'

export type DirectoryLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; entries: FileEntry[] }
  | { status: 'error'; message: string }

export interface ExplorerModel {
  directories: Record<string, DirectoryLoadState>
  expanded: Record<string, true>
  selectedPath: string | null
}

export type ExplorerAction =
  | { type: 'reset' }
  | { type: 'load-started'; path: string }
  | { type: 'load-succeeded'; path: string; entries: FileEntry[] }
  | { type: 'load-failed'; path: string; message: string }
  | { type: 'toggle-directory'; path: string }
  | { type: 'select'; path: string | null }

export const initialExplorerModel: ExplorerModel = {
  directories: {},
  expanded: { '': true },
  selectedPath: null,
}

export function explorerReducer(
  state: ExplorerModel,
  action: ExplorerAction,
): ExplorerModel {
  switch (action.type) {
    case 'reset':
      return initialExplorerModel
    case 'load-started':
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.path]: { status: 'loading' },
        },
      }
    case 'load-succeeded':
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.path]: { status: 'loaded', entries: action.entries },
        },
      }
    case 'load-failed':
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.path]: { status: 'error', message: action.message },
        },
      }
    case 'toggle-directory': {
      const expanded = { ...state.expanded }
      if (expanded[action.path]) {
        delete expanded[action.path]
      } else {
        expanded[action.path] = true
      }
      return { ...state, expanded }
    }
    case 'select':
      return { ...state, selectedPath: action.path }
  }
}

export function parentDirectory(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/')
  return separator < 0 ? '' : relativePath.slice(0, separator)
}

export function loadedDirectoryPaths(model: ExplorerModel): string[] {
  return Object.entries(model.directories)
    .filter(([, directory]) => directory.status === 'loaded')
    .map(([path]) => path)
}

export function confirmRecycleBinDelete(
  name: string,
  confirm: (message: string) => boolean,
): boolean {
  return confirm(`Move “${name}” to the Recycle Bin?`)
}
