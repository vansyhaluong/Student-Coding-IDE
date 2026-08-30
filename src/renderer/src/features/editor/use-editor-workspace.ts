import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  FileEntry,
  ProjectIdentity,
  SearchMatch,
  UnsavedTransitionRequestEvent,
} from '../../../../shared/contracts'
import {
  EditorModelManager,
  type EditorDocument,
} from './models/editor-model-manager'
import type { EditorNavigationRequest } from './editor-navigation'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface UnsavedDialogState {
  mode: 'single' | 'multiple'
  context: 'close-tab' | 'delete' | 'transition'
  documents: readonly EditorDocument[]
}

export function useEditorWorkspace(
  project: ProjectIdentity | null,
  manager: EditorModelManager,
) {
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<UnsavedDialogState | null>(null)
  const [navigation, setNavigation] = useState<EditorNavigationRequest | null>(null)
  const dialogResolver = useRef<((choice: UnsavedChoice) => void) | null>(null)
  const projectRef = useRef(project)
  const previousProject = useRef(project)
  const openGeneration = useRef(0)
  const externalGenerations = useRef(new Map<string, number>())
  const navigationGeneration = useRef(0)

  projectRef.current = project

  const requestChoice = useCallback((state: UnsavedDialogState) => (
    new Promise<UnsavedChoice>((resolve) => {
      if (dialogResolver.current) {
        resolve('cancel')
        return
      }
      dialogResolver.current = resolve
      setDialog(state)
    })
  ), [])

  const choose = useCallback((choice: UnsavedChoice) => {
    const resolve = dialogResolver.current
    dialogResolver.current = null
    setDialog(null)
    resolve?.(choice)
  }, [])

  const invalidateExternalReload = useCallback((key: string): void => {
    externalGenerations.current.set(
      key,
      (externalGenerations.current.get(key) ?? 0) + 1,
    )
  }, [])

  const save = useCallback(async (key: string): Promise<boolean> => {
    const snapshot = manager.createSaveSnapshot(key)
    if (!snapshot) return false
    setError(null)
    const result = await window.studentIde.file.write(
      snapshot.projectId,
      snapshot.relativePath,
      snapshot.content,
    )
    if (!result.ok) {
      setError(result.error.message)
      return false
    }
    invalidateExternalReload(snapshot.key)
    const clean = manager.acceptSave(snapshot)
    if (!clean) {
      setError('The file changed while it was being saved. Save again to store the latest edits.')
    }
    return clean
  }, [invalidateExternalReload, manager])

  const saveAll = useCallback(async (
    documents: readonly EditorDocument[],
  ): Promise<boolean> => {
    for (const document of documents) {
      if (document.dirty && !await save(document.key)) return false
    }
    return true
  }, [save])

  const openFile = useCallback(async (
    relativePath: string,
  ): Promise<EditorDocument | null> => {
    const activeProject = projectRef.current
    if (!activeProject) return null
    const existing = manager.findDocument(activeProject.id, relativePath)
    if (existing) {
      openGeneration.current += 1
      manager.activate(existing.key)
      return existing
    }
    const generation = ++openGeneration.current
    setError(null)
    const result = await window.studentIde.file.read(activeProject.id, relativePath)
    if (!result.ok) {
      if (
        generation === openGeneration.current
        && projectRef.current?.id === activeProject.id
      ) setError(result.error.message)
      return null
    }
    if (projectRef.current?.id !== activeProject.id) return null
    return manager.openDocument(
      activeProject.id,
      relativePath,
      result.value,
      generation === openGeneration.current,
    )
  }, [manager])

  const navigateToSearchMatch = useCallback(async (
    match: SearchMatch,
  ): Promise<void> => {
    const activeProject = projectRef.current
    if (!activeProject || activeProject.id !== match.projectId) return
    const generation = ++navigationGeneration.current
    const document = await openFile(match.relativePath)
    if (
      !document
      || generation !== navigationGeneration.current
      || projectRef.current?.id !== match.projectId
    ) return
    setNavigation({
      id: generation,
      projectId: match.projectId,
      relativePath: document.relativePath,
      lineNumber: match.lineNumber,
      columnStart: match.columnStart,
      columnEnd: match.columnEnd,
    })
  }, [openFile])

  const closeDocument = useCallback(async (key: string): Promise<void> => {
    const document = manager.getOpenDocuments().find((item) => item.key === key)
    if (!document) return
    if (document.dirty) {
      const choice = await requestChoice({
        mode: 'single',
        context: 'close-tab',
        documents: [document],
      })
      if (choice === 'cancel') return
      if (choice === 'save' && !await save(document.key)) return
    }
    invalidateExternalReload(key)
    manager.close(key)
  }, [invalidateExternalReload, manager, requestChoice, save])

  const requestDelete = useCallback(async (entry: FileEntry): Promise<boolean> => {
    const activeProject = projectRef.current
    if (!activeProject) return false
    const affected = manager.findAffectedDocuments(
      activeProject.id,
      entry.relativePath,
      entry.kind === 'directory',
    )
    const dirty = affected.filter((document) => document.dirty)
    if (dirty.length > 0) {
      const choice = await requestChoice({
        mode: entry.kind === 'directory' || dirty.length > 1 ? 'multiple' : 'single',
        context: 'delete',
        documents: dirty,
      })
      if (choice === 'cancel') return false
      if (choice === 'save' && !await saveAll(dirty)) return false
    }
    if (projectRef.current?.id !== activeProject.id) return false
    for (const document of affected) {
      invalidateExternalReload(document.key)
      manager.close(document.key)
    }
    return true
  }, [invalidateExternalReload, manager, requestChoice, saveAll])

  const renamed = useCallback((previous: FileEntry, next: FileEntry) => {
    const activeProject = projectRef.current
    if (!activeProject) return
    for (const document of manager.findAffectedDocuments(
      activeProject.id,
      previous.relativePath,
      previous.kind === 'directory',
    )) {
      invalidateExternalReload(document.key)
    }
    manager.renamePath(
      activeProject.id,
      previous.relativePath,
      next.relativePath,
      previous.kind === 'directory',
    )
  }, [invalidateExternalReload, manager])

  useEffect(() => {
    const oldProject = previousProject.current
    if (oldProject && oldProject.id !== project?.id) {
      openGeneration.current += 1
      navigationGeneration.current += 1
      setNavigation(null)
      externalGenerations.current.clear()
      manager.closeProject(oldProject.id)
    }
    previousProject.current = project
  }, [manager, project])

  useEffect(() => window.studentIde.file.onChanged((event) => {
    if (event.projectId !== projectRef.current?.id) return
    const document = manager.findDocument(event.projectId, event.relativePath)
    if (!document) return
    if (document.dirty) {
      manager.markExternalConflict(document.key)
      return
    }
    const generation = (externalGenerations.current.get(document.key) ?? 0) + 1
    externalGenerations.current.set(document.key, generation)
    void window.studentIde.file.read(event.projectId, event.relativePath).then((result) => {
      if (
        externalGenerations.current.get(document.key) !== generation
        || projectRef.current?.id !== event.projectId
      ) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const current = manager.findDocument(event.projectId, event.relativePath)
      if (!current || current.model !== document.model) return
      if (current.dirty) {
        manager.markExternalConflict(current.key)
        return
      }
      manager.reloadClean(current.key, result.value)
    })
  }), [manager])

  useEffect(() => window.studentIde.lifecycle.onUnsavedTransitionRequested(
    (event: UnsavedTransitionRequestEvent) => {
      void resolveTransition(event)
    },
  ), [manager, requestChoice, saveAll])

  const resolveTransition = async (
    event: UnsavedTransitionRequestEvent,
  ): Promise<void> => {
    const currentProject = projectRef.current
    if (!currentProject || currentProject.id !== event.project.id) {
      await resolveMainTransition(event.transitionId, false)
      return
    }
    const dirty = manager.getOpenDocuments().filter(
      (document) => document.projectId === currentProject.id && document.dirty,
    )
    if (dirty.length === 0) {
      await resolveMainTransition(event.transitionId, true)
      return
    }
    const choice = await requestChoice({
      mode: dirty.length > 1 ? 'multiple' : 'single',
      context: 'transition',
      documents: dirty,
    })
    if (choice === 'cancel') {
      await resolveMainTransition(event.transitionId, false)
      return
    }
    if (choice === 'save' && !await saveAll(dirty)) {
      await resolveMainTransition(event.transitionId, false)
      return
    }
    if (choice === 'discard') manager.closeProject(currentProject.id)
    await resolveMainTransition(event.transitionId, true)
  }

  const resolveMainTransition = async (
    transitionId: string,
    proceed: boolean,
  ): Promise<void> => {
    const result = await window.studentIde.lifecycle.resolveUnsavedTransition(
      transitionId,
      proceed,
    )
    if (!result.ok) setError(result.error.message)
  }

  useEffect(() => () => {
    openGeneration.current += 1
    navigationGeneration.current += 1
    externalGenerations.current.clear()
    dialogResolver.current?.('cancel')
    dialogResolver.current = null
  }, [])

  return {
    manager,
    dialog,
    error,
    navigation,
    choose,
    save,
    openFile,
    navigateToSearchMatch,
    closeDocument,
    requestDelete,
    renamed,
  }
}
