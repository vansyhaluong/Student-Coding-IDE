import type { ProjectId } from '../../../../shared/contracts'
import { editorModelManager } from '../editor/editor-session'

export type AppliedFileRefresh = 'reloaded' | 'conflict' | 'closed'

export interface AppliedFileDocuments {
  findDocument(projectId: ProjectId, relativePath: string): { key: string; dirty: boolean } | null
  markExternalConflict(key: string): void
  reloadClean(key: string, content: string): boolean
}

/** Refresh a clean open tab from the bytes Main just wrote. A dirty tab keeps its buffer. */
export function refreshAppliedDocument(
  documents: AppliedFileDocuments,
  projectId: ProjectId,
  relativePath: string,
  content: string,
): AppliedFileRefresh {
  const document = documents.findDocument(projectId, relativePath)
  if (!document) return 'closed'
  if (document.dirty) {
    documents.markExternalConflict(document.key)
    return 'conflict'
  }
  documents.reloadClean(document.key, content)
  return 'reloaded'
}

export function refreshAppliedFile(
  projectId: ProjectId,
  relativePath: string,
  content: string,
): AppliedFileRefresh {
  return refreshAppliedDocument(editorModelManager, projectId, relativePath, content)
}

export type DeletedFileRefresh = 'closed' | 'kept' | 'absent'

export interface DeletedFileDocuments {
  findDocument(projectId: ProjectId, relativePath: string): { key: string; dirty: boolean } | null
  close(key: string): boolean
  markDiskMissing(key: string): void
}

/** Close a clean tab after Main deletes the file. A dirty tab keeps its buffer. */
export function closeDeletedDocument(
  documents: DeletedFileDocuments,
  projectId: ProjectId,
  relativePath: string,
): DeletedFileRefresh {
  const document = documents.findDocument(projectId, relativePath)
  if (!document) return 'absent'
  if (document.dirty) {
    documents.markDiskMissing(document.key)
    return 'kept'
  }
  documents.close(document.key)
  return 'closed'
}

export function closeDeletedFile(projectId: ProjectId, relativePath: string): DeletedFileRefresh {
  return closeDeletedDocument(editorModelManager, projectId, relativePath)
}

export type RenamedFileRefresh = 'renamed' | 'retargeted' | 'closed' | 'conflict' | 'blocked'

/** Shown before a rename is sent when both tabs have unsaved edits. */
export const DIRTY_SOURCE_RENAME_MESSAGE =
  'Save or discard unsaved edits in the source file before applying. The destination tab also has unsaved edits.'

export interface RenamedFileDocuments {
  findDocument(projectId: ProjectId, relativePath: string): { key: string; dirty: boolean } | null
  close(key: string): boolean
  activate(key: string): boolean
  markExternalConflict(key: string): void
  markDiskMissing(key: string): void
  renamePath(
    projectId: ProjectId,
    oldPath: string,
    newPath: string,
    includeDescendants: boolean,
  ): void
}

/** True when applying the rename would discard unsaved edits in the source tab. */
export function renameDiscardsDirtySource(
  documents: Pick<RenamedFileDocuments, 'findDocument'>,
  projectId: ProjectId,
  relativePath: string,
  destinationPath: string,
): boolean {
  if (destinationPath.length === 0) return false
  const source = findOpenDocument(documents, projectId, relativePath)
  const destination = findOpenDocument(documents, projectId, destinationPath)
  return Boolean(
    source
    && source.dirty
    && destination
    && destination.key !== source.key
    && destination.dirty,
  )
}

export function sourceRenameBlocked(
  projectId: ProjectId,
  relativePath: string,
  destinationPath: string,
): boolean {
  return renameDiscardsDirtySource(editorModelManager, projectId, relativePath, destinationPath)
}

export function subscribeEditorDocuments(listener: () => void): () => void {
  return editorModelManager.subscribe(listener)
}

function findOpenDocument(
  documents: Pick<RenamedFileDocuments, 'findDocument'>,
  projectId: ProjectId,
  relativePath: string,
): { key: string; dirty: boolean } | null {
  try {
    return documents.findDocument(projectId, relativePath)
  } catch {
    return null
  }
}

/**
 * Point an open tab at the path Main just renamed or moved.
 * A clean tab already at the destination is closed so the source tab can follow.
 * A dirty destination tab is kept. A clean source tab is closed.
 * A dirty source tab is kept when the destination tab is also dirty.
 */
export function renameAppliedDocument(
  documents: RenamedFileDocuments,
  projectId: ProjectId,
  relativePath: string,
  destinationPath: string,
): RenamedFileRefresh {
  if (destinationPath.length === 0) return 'closed'
  const source = documents.findDocument(projectId, relativePath)
  if (!source) return 'closed'
  const destination = documents.findDocument(projectId, destinationPath)
  if (destination && destination.key !== source.key) {
    if (destination.dirty && source.dirty) {
      documents.markDiskMissing(source.key)
      documents.markExternalConflict(destination.key)
      documents.activate(destination.key)
      return 'blocked'
    }
    if (destination.dirty) {
      documents.close(source.key)
      documents.markExternalConflict(destination.key)
      documents.activate(destination.key)
      return 'conflict'
    }
    documents.close(destination.key)
    documents.renamePath(projectId, relativePath, destinationPath, false)
    const moved = documents.findDocument(projectId, destinationPath)
    if (moved) documents.activate(moved.key)
    return 'retargeted'
  }
  documents.renamePath(projectId, relativePath, destinationPath, false)
  const moved = documents.findDocument(projectId, destinationPath)
  if (moved) documents.activate(moved.key)
  return 'renamed'
}

export function renameAppliedFile(
  projectId: ProjectId,
  relativePath: string,
  destinationPath: string,
): RenamedFileRefresh {
  return renameAppliedDocument(editorModelManager, projectId, relativePath, destinationPath)
}
