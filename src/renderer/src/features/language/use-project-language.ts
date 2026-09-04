import { useEffect } from 'react'

import type { ProjectIdentity } from '../../../../shared/contracts'
import type { EditorModelManager } from '../editor/models/editor-model-manager'
import { typeScriptProjectController } from './language-session'
import { ProjectSourceDiscoveryError } from './project-source-discovery'

export function useProjectLanguage(
  project: ProjectIdentity | null,
  editorModelManager: EditorModelManager,
): void {
  useEffect(() => {
    if (!project) return
    let active = true
    let statusRevision = 0
    const unsubscribeEditor = editorModelManager.subscribeDocumentLifecycle(
      (event) => typeScriptProjectController.handleEditorLifecycle(event),
    )
    const unsubscribeFiles = window.studentIde.file.onChanged((event) => {
      if (event.projectId !== project.id) return
      void typeScriptProjectController.handleFileChanged(event)
    })
    const unsubscribeStatus = window.studentIde.file.onStatusChanged((status) => {
      if (status.projectId !== project.id) return
      statusRevision += 1
      typeScriptProjectController.handleFileSystemStatus(status)
    })

    void typeScriptProjectController.activateProject(project.id)
    const requestedStatusRevision = statusRevision
    void window.studentIde.file.getStatus(project.id).then((result) => {
      if (!active || statusRevision !== requestedStatusRevision) return
      if (result.ok) {
        typeScriptProjectController.handleFileSystemStatus(result.value)
      } else {
        typeScriptProjectController.handleProjectAccessFailure(
          project.id,
          new ProjectSourceDiscoveryError(result.error),
        )
      }
    }).catch((error: unknown) => {
      if (active && statusRevision === requestedStatusRevision) {
        typeScriptProjectController.handleProjectAccessFailure(project.id, error)
      }
    })

    return () => {
      active = false
      unsubscribeStatus()
      unsubscribeFiles()
      unsubscribeEditor()
      typeScriptProjectController.closeProject(project.id)
    }
  }, [editorModelManager, project?.id])
}
