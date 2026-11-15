import { useEffect, useLayoutEffect, useState } from 'react'
import type { ProjectIdentity } from '../../../../shared/contracts'
import { RunController } from './run-controller'
import { RunSourceGuardController } from './run-source-guard-controller'
import { editorModelManager } from '../editor/editor-session'

export function useProjectRun(project: ProjectIdentity | null, unavailable: boolean) {
  const [controller] = useState(() => new RunController(window.studentIde.run,
    (callback) => requestAnimationFrame(callback), (frame) => cancelAnimationFrame(frame)))
  const [sourceGuard] = useState(() => new RunSourceGuardController(window.studentIde.runSourceGuard, editorModelManager))
  useLayoutEffect(() => { controller.activateProject(project?.id ?? null) }, [controller, project?.id])
  useLayoutEffect(() => { controller.setAvailable(!!project && !unavailable) }, [controller, project, unavailable])
  useLayoutEffect(() => {
    sourceGuard.activateProject(project?.id ?? null)
    sourceGuard.setAvailable(!!project && !unavailable)
  }, [sourceGuard, project, unavailable])
  useEffect(() => {
    const disconnect = controller.connect()
    const disconnectGuard = sourceGuard.connect()
    // Immediate event-boundary invalidation, before React commits the new project.
    const removeProject = window.studentIde.project.onChanged(({ activeProject }) => {
      controller.activateProject(activeProject?.id ?? null, true)
      sourceGuard.activateProject(activeProject?.id ?? null)
      sourceGuard.setAvailable(!!activeProject)
    })
    const removeStatus = window.studentIde.file.onStatusChanged((status) => {
      if (status.projectId === controller.getSnapshot().projectId) {
        controller.setAvailable(status.state === 'AVAILABLE'); sourceGuard.setAvailable(status.state === 'AVAILABLE')
      }
    })
    const removeLifecycle = window.studentIde.lifecycle.onStatusChanged((status) => {
      if (status.state === 'STOPPING' || status.state === 'STOPPED') {
        controller.setAvailable(false); sourceGuard.setAvailable(false)
      }
    })
    return () => { removeLifecycle(); removeStatus(); removeProject(); disconnectGuard(); disconnect() }
  }, [controller, sourceGuard])
  return controller
}
