import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from 'react'
import {
  ChevronRight,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  RefreshCw,
} from 'lucide-react'

import type {
  AppError,
  FileEntry,
  ProjectIdentity,
  GitStatus,
} from '../../../../shared/contracts'
import { fileDecoration } from '../git/file-decoration'
import {
  explorerReducer,
  initialExplorerModel,
  loadedDirectoryPaths,
  parentDirectory,
  type DirectoryLoadState,
} from './explorer-model'
import { Button } from '../../components/ui/Button'
import { Dialog, PromptDialog } from '../../components/ui/Dialog'
import { ExplorerContextMenu, type ExplorerContextMenuState } from './ExplorerContextMenu'

interface ProjectExplorerProps {
  project: ProjectIdentity
  onOpenFile?(path: string): void
  onRenamed?(previous: FileEntry, renamed: FileEntry): void
  onRequestDelete?(entry: FileEntry): Promise<(() => void) | null>
  interactionLocked?: boolean
  unavailable?: boolean
  search?(tree: ReactNode): ReactNode
  gitStatus?: GitStatus | null
  /** Phase 2B compatibility only; no longer called. */
  onPreview?(path: string, content: string): void
  /** Phase 2B compatibility only; no longer called. */
  onClearPreview?(): void
}

type EntryDialogState =
  | { mode: 'create'; kind: 'file' | 'directory'; directory: string }
  | { mode: 'rename'; entry: FileEntry }

export function ProjectExplorer({
  project,
  onOpenFile,
  onRenamed,
  onRequestDelete,
  interactionLocked = false,
  unavailable = false,
  search,
  gitStatus = null,
}: ProjectExplorerProps) {
  const [state, dispatch] = useReducer(explorerReducer, initialExplorerModel)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [entryDialog, setEntryDialog] = useState<EntryDialogState | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<FileEntry | null>(null)
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuState | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
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
    setContextMenu(null)
    setEntryDialog(null)
    setDeleteCandidate(null)
    void loadDirectory('')
  }, [loadDirectory])

  useEffect(() => {
    if (unavailable) setContextMenu(null)
  }, [unavailable])

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
    if (entry.kind === 'file' && !interactionLocked) onOpenFile?.(entry.relativePath)
  }

  const openContextMenu = (event: MouseEvent<HTMLElement>, entry?: FileEntry): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    if (entry) dispatch({ type: 'select', path: entry.relativePath })
    setOperationError(null)
    setContextMenu(entry
      ? { kind: 'entry', entry, x: event.clientX, y: event.clientY }
      : { kind: 'background', x: event.clientX, y: event.clientY })
  }

  const copyPath = async (entry: FileEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.relativePath)
    } catch {
      if (mounted.current) setOperationError('Could not copy the relative path to the clipboard.')
    }
  }

  const toggleDirectory = (entry: FileEntry): void => {
    dispatch({ type: 'select', path: entry.relativePath })
    dispatch({ type: 'toggle-directory', path: entry.relativePath })
    if (!interactionLocked && !state.directories[entry.relativePath]) {
      void loadDirectory(entry.relativePath)
    }
  }

  const submitEntryName = async (name: string): Promise<void> => {
    if (interactionLocked) return
    const request = entryDialog
    if (!request) return
    setEntryDialog(null)
    if (request.mode === 'create') {
      const result = request.kind === 'file'
        ? await window.studentIde.file.createFile(project.id, request.directory, name)
        : await window.studentIde.file.createDirectory(project.id, request.directory, name)
      if (!mounted.current) return
      await finishMutation(result, request.directory)
      return
    }
    if (name === request.entry.name) return
    const parent = parentDirectory(request.entry.relativePath)
    const result = await window.studentIde.file.rename(
      project.id,
      request.entry.relativePath,
      name,
    )
    if (!mounted.current) return
    if (result.ok) onRenamed?.(request.entry, result.value)
    await finishMutation(result, parent)
  }

  const confirmDelete = async (): Promise<void> => {
    if (interactionLocked) return
    const entry = deleteCandidate
    if (!entry) return
    setDeleteCandidate(null)
    const commitEditorDelete = onRequestDelete ? await onRequestDelete(entry) : null
    if (onRequestDelete && !commitEditorDelete) return
    const parent = parentDirectory(entry.relativePath)
    const result = await window.studentIde.file.delete(project.id, entry.relativePath)
    if (!mounted.current) return
    if (!result.ok) {
      setOperationError(result.error.message)
      return
    }
    commitEditorDelete?.()
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
          <span>{project.name}</span>
        </div>
        <div className="explorer-actions" aria-label="File actions">
          <Button variant="ghost" size="iconSmall" disabled={interactionLocked} onClick={() => setEntryDialog({ mode: 'create', kind: 'file', directory: selectedDirectory })} title="New file" aria-label="New file"><FilePlus2 /></Button>
          <Button variant="ghost" size="iconSmall" disabled={interactionLocked} onClick={() => setEntryDialog({ mode: 'create', kind: 'directory', directory: selectedDirectory })} title="New folder" aria-label="New folder"><FolderPlus /></Button>
          <Button variant="ghost" size="iconSmall" disabled={interactionLocked} onClick={() => void refresh()} title="Refresh Explorer" aria-label="Refresh Explorer"><RefreshCw /></Button>
        </div>
      </div>

      {operationError && <div className="inline-error" role="alert">{operationError}</div>}
      {unavailable && (
        <div className="inline-error" role="alert">
          This project is unavailable or file monitoring stopped. Close and reopen it to retry.
        </div>
      )}

      {(search ?? ((tree: ReactNode) => tree))(<div className="tree-scroll" tabIndex={-1} onContextMenu={(event) => openContextMenu(event)}>
        <DirectoryContents
          directoryPath=""
          depth={0}
          directories={state.directories}
          expanded={state.expanded}
          selectedPath={state.selectedPath}
          gitStatus={gitStatus}
          onLoad={loadDirectory}
          onSelect={selectEntry}
          onToggle={toggleDirectory}
          onContextMenu={openContextMenu}
        />
      </div>)}
      {contextMenu && (
        <ExplorerContextMenu
          state={contextMenu}
          interactionLocked={interactionLocked}
          onClose={closeContextMenu}
          onOpen={(entry) => { if (!interactionLocked) onOpenFile?.(entry.relativePath) }}
          onCreate={(kind, directory) => { if (!interactionLocked) setEntryDialog({ mode: 'create', kind, directory }) }}
          onRename={(entry) => { if (!interactionLocked) setEntryDialog({ mode: 'rename', entry }) }}
          onDelete={(entry) => { if (!interactionLocked) setDeleteCandidate(entry) }}
          onCopyPath={(entry) => void copyPath(entry)}
          onRefresh={() => { if (!interactionLocked) void refresh() }}
        />
      )}
      {entryDialog && (
        <PromptDialog
          title={entryDialog.mode === 'create'
            ? `New ${entryDialog.kind === 'file' ? 'file' : 'folder'}`
            : 'Rename item'}
          description={entryDialog.mode === 'create'
            ? `Create it inside ${entryDialog.directory || project.name}.`
            : `Rename “${entryDialog.entry.name}”.`}
          label={entryDialog.mode === 'create' ? 'Name' : 'New name'}
          initialValue={entryDialog.mode === 'rename' ? entryDialog.entry.name : ''}
          submitLabel={entryDialog.mode === 'create' ? 'Create' : 'Rename'}
          onSubmit={(name) => void submitEntryName(name)}
          onCancel={() => setEntryDialog(null)}
          submitDisabled={interactionLocked}
        />
      )}
      {deleteCandidate && (
        <Dialog
          title="Move to Recycle Bin?"
          description={`“${deleteCandidate.name}” will be moved to the Recycle Bin.`}
          onCancel={() => setDeleteCandidate(null)}
          actions={(
            <>
              <Button variant="ghost" onClick={() => setDeleteCandidate(null)}>Cancel</Button>
              <Button variant="destructive" data-dialog-primary="true" disabled={interactionLocked} onClick={() => void confirmDelete()}>
                Move to Recycle Bin
              </Button>
            </>
          )}
        />
      )}
    </section>
  )
}

interface DirectoryContentsProps {
  gitStatus: GitStatus | null
  directoryPath: string
  depth: number
  directories: Record<string, DirectoryLoadState>
  expanded: Record<string, true>
  selectedPath: string | null
  onLoad(path: string): Promise<void>
  onSelect(entry: FileEntry): void
  onToggle(entry: FileEntry): void
  onContextMenu(event: MouseEvent<HTMLElement>, entry: FileEntry): void
}

function DirectoryContents({
  directoryPath,
  depth,
  directories,
  expanded,
  selectedPath,
  gitStatus,
  onLoad,
  onSelect,
  onToggle,
  onContextMenu,
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
        const status = entry.kind === 'file' ? gitStatus?.entries.find((item) => item.path === entry.relativePath) : undefined
        const decoration = status ? fileDecoration(status) : null
        return (
          <li key={entry.relativePath}>
            <button
              className={`tree-row${selectedPath === entry.relativePath ? ' selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 16 }}
              onClick={() => isDirectory ? onToggle(entry) : void onSelect(entry)}
              onContextMenu={(event) => onContextMenu(event, entry)}
              onKeyDown={(event) => {
                if (!isDirectory) return
                if (event.key === 'ArrowRight' && !isExpanded) {
                  event.preventDefault()
                  onToggle(entry)
                } else if (event.key === 'ArrowLeft' && isExpanded) {
                  event.preventDefault()
                  onToggle(entry)
                }
              }}
              aria-expanded={isDirectory ? isExpanded : undefined}
              aria-current={selectedPath === entry.relativePath ? 'true' : undefined}
              aria-label={decoration ? `${entry.name} ${decoration.label}` : entry.name}
              title={entry.relativePath}
            >
              <span className="tree-caret">{isDirectory ? <ChevronRight className={`tree-chevron${isExpanded ? ' expanded' : ''}`} /> : null}</span>
              {entry.isSymbolicLink
                ? <Link2 className="tree-entry-icon link" />
                : isDirectory
                  ? isExpanded ? <FolderOpen className="tree-entry-icon folder" /> : <Folder className="tree-entry-icon folder" />
                  : <File className="tree-entry-icon file" />}
              <span className={`tree-name${decoration ? ` git-decoration-${decoration.kind}` : ''}`}>{entry.name}</span>
              {decoration && <span className={`file-git-decoration git-decoration-${decoration.kind}`}
                role="img" title={decoration.label} aria-label={decoration.label}>{decoration.badge}</span>}
            </button>
            {isDirectory && isExpanded && (
              <DirectoryContents
                directoryPath={entry.relativePath}
                depth={depth + 1}
                directories={directories}
                expanded={expanded}
                selectedPath={selectedPath}
                gitStatus={gitStatus}
                onLoad={onLoad}
                onSelect={onSelect}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
