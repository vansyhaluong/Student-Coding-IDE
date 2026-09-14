import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ApplicationState,
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

export interface TerminalTransitionDialogState {
  reason: 'project-close' | 'project-switch'
  project: ProjectIdentity
}

export function useEditorWorkspace(
  project: ProjectIdentity | null,
  manager: EditorModelManager,
) {
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<UnsavedDialogState | null>(null)
  const [terminalTransitionDialog, setTerminalTransitionDialog] = useState<
    TerminalTransitionDialogState | null
  >(null)
  const [navigation, setNavigation] = useState<EditorNavigationRequest | null>(null)
  const [applicationState, setApplicationState] = useState<ApplicationState | null>(null)
  const [transitionFinalizing, setTransitionFinalizing] = useState(false)
  const [fileSystemUnavailable, setFileSystemUnavailable] = useState(false)
  const dialogResolver = useRef<((choice: UnsavedChoice) => void) | null>(null)
  const terminalDialogResolver = useRef<((proceed: boolean) => void) | null>(null)
  const projectRef = useRef(project)
  const previousProject = useRef(project)
  const openGeneration = useRef(0)
  const externalGenerations = useRef(new Map<string, number>())
  const navigationGeneration = useRef(0)
  const interactionLockedRef = useRef(false)
  const activeTransitionIdRef = useRef<string | null>(null)
  const transitionFinalizingRef = useRef(false)
  const applicationStateRef = useRef<ApplicationState | null>(null)
  const fileSystemUnavailableRef = useRef(false)

  projectRef.current = project
  applicationStateRef.current = applicationState

  const lifecycleLocked = applicationState === 'STOPPING'
    || applicationState === 'STOPPED'
  const interactionLocked = lifecycleLocked || transitionFinalizing
  interactionLockedRef.current = interactionLocked
  fileSystemUnavailableRef.current = fileSystemUnavailable

  const setTransitionLock = useCallback((locked: boolean, transitionId?: string): void => {
    activeTransitionIdRef.current = locked ? transitionId ?? null : null
    transitionFinalizingRef.current = locked
    interactionLockedRef.current = locked
      || applicationStateRef.current === 'STOPPING'
      || applicationStateRef.current === 'STOPPED'
    setTransitionFinalizing(locked)
  }, [])

  const releaseProjectTransitionLock = useCallback((transitionId?: string): void => {
    if (
      transitionId !== undefined
      && activeTransitionIdRef.current !== transitionId
    ) return
    setTransitionLock(false)
  }, [setTransitionLock])

  useEffect(() => {
    let active = true
    let statusRevision = 0
    const unsubscribe = window.studentIde.lifecycle.onStatusChanged((status) => {
      statusRevision += 1
      applicationStateRef.current = status.state
      interactionLockedRef.current = transitionFinalizingRef.current
        || status.state === 'STOPPING'
        || status.state === 'STOPPED'
      setApplicationState(status.state)
    })
    const requestedRevision = statusRevision
    void window.studentIde.lifecycle.getStatus().then((result) => {
      if (!active || statusRevision !== requestedRevision || !result.ok) return
      applicationStateRef.current = result.value.state
      interactionLockedRef.current = transitionFinalizingRef.current
        || result.value.state === 'STOPPING'
        || result.value.state === 'STOPPED'
      setApplicationState(result.value.state)
    }).catch(() => undefined)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    let statusRevision = 0
    fileSystemUnavailableRef.current = false
    setFileSystemUnavailable(false)
    if (!project) return () => { active = false }

    const applyStatus = (state: 'AVAILABLE' | 'UNAVAILABLE'): void => {
      const unavailable = state === 'UNAVAILABLE'
      fileSystemUnavailableRef.current = unavailable
      setFileSystemUnavailable(unavailable)
      if (unavailable) {
        openGeneration.current += 1
        navigationGeneration.current += 1
        externalGenerations.current.clear()
      }
    }
    const unsubscribe = window.studentIde.file.onStatusChanged((status) => {
      if (status.projectId !== project.id) return
      statusRevision += 1
      applyStatus(status.state)
    })
    const requestedRevision = statusRevision
    void window.studentIde.file.getStatus(project.id).then((result) => {
      if (!active || statusRevision !== requestedRevision || !result.ok) return
      applyStatus(result.value.state)
    }).catch(() => undefined)
    return () => {
      active = false
      unsubscribe()
    }
  }, [project?.id])

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

  const requestTerminalConfirmation = useCallback((
    state: TerminalTransitionDialogState,
  ) => new Promise<boolean>((resolve) => {
    if (terminalDialogResolver.current) {
      resolve(false)
      return
    }
    terminalDialogResolver.current = resolve
    setTerminalTransitionDialog(state)
  }), [])

  const chooseTerminalTransition = useCallback((proceed: boolean) => {
    const resolve = terminalDialogResolver.current
    terminalDialogResolver.current = null
    setTerminalTransitionDialog(null)
    resolve?.(proceed)
  }, [])

  const invalidateExternalReload = useCallback((key: string): void => {
    externalGenerations.current.set(
      key,
      (externalGenerations.current.get(key) ?? 0) + 1,
    )
  }, [])

  const save = useCallback(async (key: string, automatic = false): Promise<boolean> => {
    if (interactionLockedRef.current || fileSystemUnavailableRef.current) return false
    const document = manager.getOpenDocuments().find((item) => item.key === key)
    if (automatic && document?.externalConflict) {
      setError('Auto Save stopped because this file changed on disk. Review the conflict and save manually.'); return false
    }
    if (document?.diskState === 'missing') {
      setError('This file no longer exists on disk. Close the buffer or restore the file outside the IDE.')
      return false
    }
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
    if (interactionLockedRef.current || fileSystemUnavailableRef.current) return null
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

  const navigateToLocation = useCallback(async (location: {
    projectId: ProjectIdentity['id']
    relativePath: string
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }): Promise<void> => {
    const activeProject = projectRef.current
    if (!activeProject || activeProject.id !== location.projectId) return
    const generation = ++navigationGeneration.current
    const document = await openFile(location.relativePath)
    if (
      !document
      || generation !== navigationGeneration.current
      || projectRef.current?.id !== location.projectId
    ) return
    setNavigation({
      id: generation,
      projectId: location.projectId,
      relativePath: document.relativePath,
      startLineNumber: location.startLineNumber,
      startColumn: location.startColumn,
      endLineNumber: location.endLineNumber,
      endColumn: location.endColumn,
    })
  }, [openFile])

  const navigateToSearchMatch = useCallback(async (
    match: SearchMatch,
  ): Promise<void> => navigateToLocation({
    projectId: match.projectId,
    relativePath: match.relativePath,
    startLineNumber: match.lineNumber,
    startColumn: match.columnStart,
    endLineNumber: match.lineNumber,
    endColumn: match.columnEnd,
  }), [navigateToLocation])

  const closeDocument = useCallback(async (key: string): Promise<void> => {
    if (interactionLockedRef.current) return
    const document = manager.getOpenDocuments().find((item) => item.key === key)
    if (!document) return
    if (document.dirty) {
      const choice = await requestChoice({
        mode: 'single',
        context: 'close-tab',
        documents: [document],
      })
      if (interactionLockedRef.current) return
      if (choice === 'cancel') return
      if (choice === 'save' && !await save(document.key)) return
    }
    if (interactionLockedRef.current) return
    invalidateExternalReload(key)
    manager.close(key)
  }, [invalidateExternalReload, manager, requestChoice, save])

  const requestDelete = useCallback(async (entry: FileEntry): Promise<(() => void) | null> => {
    if (interactionLockedRef.current || fileSystemUnavailableRef.current) return null
    const activeProject = projectRef.current
    if (!activeProject) return null
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
      if (choice === 'cancel') return null
      if (choice === 'save' && !await saveAll(dirty)) return null
    }
    if (
      projectRef.current?.id !== activeProject.id
      || fileSystemUnavailableRef.current
    ) return null
    return () => {
      if (projectRef.current?.id !== activeProject.id) return
      for (const document of affected) {
        if (manager.findDocument(document.projectId, document.relativePath) !== document) continue
        invalidateExternalReload(document.key)
        manager.close(document.key)
      }
    }
  }, [invalidateExternalReload, manager, requestChoice, saveAll])

  const renamed = useCallback((previous: FileEntry, next: FileEntry) => {
    if (interactionLockedRef.current || fileSystemUnavailableRef.current) return
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
      setTransitionLock(false)
    }
    previousProject.current = project
  }, [manager, project, setTransitionLock])

  useEffect(() => window.studentIde.file.onChanged((event) => {
    if (event.projectId !== projectRef.current?.id) return
    const document = manager.findDocument(event.projectId, event.relativePath)
    if (!document) return
    const generation = (externalGenerations.current.get(document.key) ?? 0) + 1
    externalGenerations.current.set(document.key, generation)
    void window.studentIde.file.read(event.projectId, event.relativePath).then((result) => {
      if (
        externalGenerations.current.get(document.key) !== generation
        || projectRef.current?.id !== event.projectId
      ) return
      const current = manager.findDocument(event.projectId, event.relativePath)
      if (!current || current.model !== document.model) return
      if (!result.ok) {
        if (result.error.code === 'NOT_FOUND') {
          manager.markDiskMissing(current.key)
          return
        }
        setError(result.error.message)
        return
      }
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
  ), [manager, requestChoice, requestTerminalConfirmation, saveAll])

  useEffect(() => window.studentIde.lifecycle.onProjectTransitionSettled(
    (event) => releaseProjectTransitionLock(event.transitionId),
  ), [releaseProjectTransitionLock])

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
    if (dirty.length > 0) {
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
    }
    if (event.terminalConfirmationRequired) {
      const confirmed = await requestTerminalConfirmation({
        reason: event.reason === 'project-close' ? 'project-close' : 'project-switch',
        project: event.project,
      })
      if (!confirmed) {
        await resolveMainTransition(event.transitionId, false)
        return
      }
    }
    await resolveMainTransition(event.transitionId, true)
  }

  const resolveMainTransition = async (
    transitionId: string,
    proceed: boolean,
  ): Promise<void> => {
    if (proceed) setTransitionLock(true, transitionId)
    try {
      const result = await window.studentIde.lifecycle.resolveUnsavedTransition(
        transitionId,
        proceed,
      )
      if (!result.ok) {
        if (proceed && !isAmbiguousBoundaryFailure(result.error.details)) {
          releaseProjectTransitionLock(transitionId)
        }
        setError(result.error.message)
      }
    } catch {
      setError('The application request could not be completed.')
    }
  }

  useEffect(() => () => {
    openGeneration.current += 1
    navigationGeneration.current += 1
    externalGenerations.current.clear()
    dialogResolver.current?.('cancel')
    dialogResolver.current = null
    terminalDialogResolver.current?.(false)
    terminalDialogResolver.current = null
  }, [])

  return {
    reportAutoSaveError: () => setError('Auto Save could not complete. Your changes remain unsaved.'),
    manager,
    dialog,
    terminalTransitionDialog,
    error,
    navigation,
    applicationState,
    interactionLocked,
    fileSystemUnavailable,
    choose,
    chooseTerminalTransition,
    save,
    openFile,
    navigateToLocation,
    navigateToSearchMatch,
    closeDocument,
    requestDelete,
    renamed,
    releaseProjectTransitionLock,
  }
}

function isAmbiguousBoundaryFailure(
  details: Record<string, string | number | boolean | null> | undefined,
): boolean {
  return details?.boundaryFailure === 'transport'
    || details?.boundaryFailure === 'response-validation'
}
