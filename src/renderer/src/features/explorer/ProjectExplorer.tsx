import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import type {
  AppError,
  FileEntry,
  ProjectIdentity,
} from '../../../../shared/contracts'
import {
  explorerReducer,
  confirmRecycleBinDelete,
  initialExplorerModel,
  loadedDirectoryPaths,
  parentDirectory,
  type DirectoryLoadState,
} from './explorer-model'

interface ProjectExplorerProps {
  project: ProjectIdentity
  onOpenFile?(path: string): void
  onRenamed?(previous: FileEntry, renamed: FileEntry): void
  onRequestDelete?(entry: FileEntry): Promise<boolean>
  /** Phase 2B compatibility only; no longer called. */
  onPreview?(path: string, content: string): void
  /** Phase 2B compatibility only; no longer called. */
  onClearPreview?(): void
}

interface IconProps {
  className?: string
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`tree-chevron${expanded ? ' expanded' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  )
}

function FileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 1.75h6l4 4v8.5H3z" />
      <path d="M9 1.75v4h4" />
    </svg>
  )
}

function FolderIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 3.5h4l1.25 1.4h7.25v7.6H1.75z" />
    </svg>
  )
}

function NewFileIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 1.75h6l4 4v8.5H3zM9 1.75v4h4M5.5 10h5M8 7.5v5" />
    </svg>
  )
}

function NewFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 3.5h4l1.25 1.4h7.25v7.6H1.75zM6.25 8.75h3.5M8 7v3.5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.25 5.5A5 5 0 1 0 13 9M12.25 2.5v3h-3" />
    </svg>
  )
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 11.5-.5 2 2-.5L12 5.5 10.5 4zM9.5 5l1.5 1.5" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 4.5h9M6 4.5v-2h4v2M5 6.5v6M8 6.5v6M11 6.5v6M4 4.5l.5 10h7l.5-10" />
    </svg>
  )
}

function LinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.25 9.75 9.75 6.25M5.25 11.75l-1 1a2.12 2.12 0 0 1-3-3l2-2a2.12 2.12 0 0 1 3 0M10.75 4.25l1-1a2.12 2.12 0 0 1 3 3l-2 2a2.12 2.12 0 0 1-3 0" />
    </svg>
  )
}

export function ProjectExplorer({
  project,
  onOpenFile,
  onRenamed,
  onRequestDelete,
}: ProjectExplorerProps) {
  const [state, dispatch] = useReducer(explorerReducer, initialExplorerModel)
  const [operationError, setOperationError] = useState<string | null>(null)
  const mounted = useRef(true)
  const directoryGenerations = useRef<Record<string, number>>({})

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadDirectory = useCallback(async (relativePath: string) => {
    const generation = (directoryGenerations.current[relativePath] ?? 0) + 1
    directoryGenerations.current[relativePath] = generation
    dispatch({ type: 'load-started', path: relativePath })
    const result = await window.studentIde.file.listDirectory(project.id, relativePath)
    if (
      !mounted.current
      || generation !== directoryGenerations.current[relativePath]
    ) return
    if (result.ok) {
      dispatch({ type: 'load-succeeded', path: relativePath, entries: result.value })
    } else {
      dispatch({ type: 'load-failed', path: relativePath, message: result.error.message })
    }
  }, [project.id])

  useEffect(() => {
    dispatch({ type: 'reset' })
    void loadDirectory('')
  }, [loadDirectory])

  useEffect(() => window.studentIde.file.onChanged((event) => {
    if (event.projectId !== project.id) return
    const parent = parentDirectory(event.relativePath)
    if (Object.hasOwn(state.directories, parent)) {
      void loadDirectory(parent)
    }
  }), [loadDirectory, project.id, state.directories])

  const selectedEntry = useMemo(() => {
    for (const directory of Object.values(state.directories)) {
      if (directory.status !== 'loaded') continue
      const selected = directory.entries.find(
        (entry) => entry.relativePath === state.selectedPath,
      )
      if (selected) return selected
    }
    return null
  }, [state.directories, state.selectedPath])

  const selectedDirectory = selectedEntry?.kind === 'directory'
    ? selectedEntry.relativePath
    : selectedEntry
      ? parentDirectory(selectedEntry.relativePath)
      : ''

  const selectEntry = (entry: FileEntry): void => {
    dispatch({ type: 'select', path: entry.relativePath })
    setOperationError(null)
    if (entry.kind === 'file') onOpenFile?.(entry.relativePath)
  }

  const toggleDirectory = (entry: FileEntry): void => {
    dispatch({ type: 'select', path: entry.relativePath })
    dispatch({ type: 'toggle-directory', path: entry.relativePath })
    if (!state.directories[entry.relativePath]) {
      void loadDirectory(entry.relativePath)
    }
  }

  const createEntry = async (kind: 'file' | 'directory'): Promise<void> => {
    const label = kind === 'file' ? 'file' : 'folder'
    const name = window.prompt(`Name the new ${label}`)
    if (!name) return
    const result = kind === 'file'
      ? await window.studentIde.file.createFile(project.id, selectedDirectory, name)
      : await window.studentIde.file.createDirectory(project.id, selectedDirectory, name)
    if (!mounted.current) return
    await finishMutation(result, selectedDirectory)
  }

  const renameSelected = async (): Promise<void> => {
    if (!selectedEntry) return
    const newName = window.prompt('Rename item', selectedEntry.name)
    if (!newName || newName === selectedEntry.name) return
    const parent = parentDirectory(selectedEntry.relativePath)
    const result = await window.studentIde.file.rename(
      project.id,
      selectedEntry.relativePath,
      newName,
    )
    if (!mounted.current) return
    if (result.ok) onRenamed?.(selectedEntry, result.value)
    await finishMutation(result, parent)
  }

  const deleteSelected = async (): Promise<void> => {
    if (!selectedEntry) return
    if (!confirmRecycleBinDelete(
      selectedEntry.name,
      (message) => window.confirm(message),
    )) return
    if (onRequestDelete && !await onRequestDelete(selectedEntry)) return
    const parent = parentDirectory(selectedEntry.relativePath)
    const result = await window.studentIde.file.delete(project.id, selectedEntry.relativePath)
    if (!mounted.current) return
    if (!result.ok) {
      setOperationError(result.error.message)
      return
    }
    dispatch({ type: 'select', path: null })
    setOperationError(null)
    await loadDirectory(parent)
  }

  const finishMutation = async (
    result: { ok: true; value: FileEntry } | { ok: false; error: AppError },
    directory: string,
  ): Promise<void> => {
    if (!result.ok) {
      setOperationError(result.error.message)
      return
    }
    setOperationError(null)
    dispatch({ type: 'select', path: result.value.relativePath })
    await loadDirectory(directory)
  }

  const refresh = async (): Promise<void> => {
    setOperationError(null)
    const paths = loadedDirectoryPaths(state)
    await Promise.all((paths.length > 0 ? paths : ['']).map(loadDirectory))
  }

  return (
    <section className="explorer-panel" aria-label="Project Explorer">
      <div className="explorer-toolbar">
        <div className="explorer-project-name" title={project.name}>
          <FolderIcon className="tree-entry-icon folder" />
          <span>{project.name}</span>
        </div>
        <div className="explorer-actions" aria-label="File actions">
          <button onClick={() => void createEntry('file')} title="New file" aria-label="New file">
            <NewFileIcon />
          </button>
          <button onClick={() => void createEntry('directory')} title="New folder" aria-label="New folder">
            <NewFolderIcon />
          </button>
          <button onClick={() => void refresh()} title="Refresh Explorer" aria-label="Refresh Explorer">
            <RefreshIcon />
          </button>
          <button disabled={!selectedEntry} onClick={() => void renameSelected()} title="Rename selected item" aria-label="Rename selected item">
            <RenameIcon />
          </button>
          <button className="danger-action" disabled={!selectedEntry} onClick={() => void deleteSelected()} title="Move selected item to Recycle Bin" aria-label="Move selected item to Recycle Bin">
            <DeleteIcon />
          </button>
        </div>
      </div>

      {operationError && <div className="inline-error" role="alert">{operationError}</div>}

      <div className="tree-scroll">
        <DirectoryContents
          directoryPath=""
          depth={0}
          directories={state.directories}
          expanded={state.expanded}
          selectedPath={state.selectedPath}
          onLoad={loadDirectory}
          onSelect={selectEntry}
          onToggle={toggleDirectory}
        />
      </div>
    </section>
  )
}

interface DirectoryContentsProps {
  directoryPath: string
  depth: number
  directories: Record<string, DirectoryLoadState>
  expanded: Record<string, true>
  selectedPath: string | null
  onLoad(path: string): Promise<void>
  onSelect(entry: FileEntry): void
  onToggle(entry: FileEntry): void
}

function DirectoryContents({
  directoryPath,
  depth,
  directories,
  expanded,
  selectedPath,
  onLoad,
  onSelect,
  onToggle,
}: DirectoryContentsProps) {
  const directory = directories[directoryPath]
  if (!directory || directory.status === 'idle' || directory.status === 'loading') {
    return <div className="tree-state" style={{ paddingLeft: 8 + depth * 16 }}>Loading…</div>
  }
  if (directory.status === 'error') {
    return (
      <div className="tree-state tree-error" style={{ paddingLeft: 8 + depth * 16 }}>
        <span>{directory.message}</span>
        <button onClick={() => void onLoad(directoryPath)}>Retry</button>
      </div>
    )
  }
  if (directory.entries.length === 0) {
    return <div className="tree-state" style={{ paddingLeft: 8 + depth * 16 }}>Empty folder</div>
  }

  return (
    <ul className="tree-list">
      {directory.entries.map((entry) => {
        const isDirectory = entry.kind === 'directory' && !entry.isSymbolicLink
        const isExpanded = Boolean(expanded[entry.relativePath])
        return (
          <li key={entry.relativePath}>
            <button
              className={`tree-row${selectedPath === entry.relativePath ? ' selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 16 }}
              onClick={() => isDirectory ? onToggle(entry) : void onSelect(entry)}
              aria-expanded={isDirectory ? isExpanded : undefined}
              title={entry.relativePath}
            >
              <span className="tree-caret">{isDirectory ? <ChevronIcon expanded={isExpanded} /> : null}</span>
              {entry.isSymbolicLink
                ? <LinkIcon className="tree-entry-icon link" />
                : isDirectory
                  ? <FolderIcon className="tree-entry-icon folder" />
                  : <FileIcon className="tree-entry-icon file" />}
              <span className="tree-name">{entry.name}</span>
            </button>
            {isDirectory && isExpanded && (
              <DirectoryContents
                directoryPath={entry.relativePath}
                depth={depth + 1}
                directories={directories}
                expanded={expanded}
                selectedPath={selectedPath}
                onLoad={onLoad}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
