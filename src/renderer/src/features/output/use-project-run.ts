import { useEffect, useLayoutEffect, useState } from 'react'
import type { ProjectIdentity } from '../../../../shared/contracts'
import { RunController } from './run-controller'

export function useProjectRun(project: ProjectIdentity | null, unavailable: boolean) {
  const [controller] = useState(() => new RunController(window.studentIde.run,
    (callback) => requestAnimationFrame(callback), (frame) => cancelAnimationFrame(frame)))
  useLayoutEffect(() => { controller.activateProject(project?.id ?? null) }, [controller, project?.id])
  useLayoutEffect(() => { controller.setAvailable(!!project && !unavailable) }, [controller, project, unavailable])
  useEffect(() => {
    const disconnect = controller.connect()
    // Immediate event-boundary invalidation, before React commits the new project.
    const removeProject = window.studentIde.project.onChanged(({ activeProject }) => controller.activateProject(activeProject?.id ?? null))
    const removeStatus = window.studentIde.file.onStatusChanged((status) => {
      if (status.projectId === controller.getSnapshot().projectId) controller.setAvailable(status.state === 'AVAILABLE')
    })
    const removeLifecycle = window.studentIde.lifecycle.onStatusChanged((status) => {
      if (status.state === 'STOPPING' || status.state === 'STOPPED') controller.setAvailable(false)
    })
    return () => { removeLifecycle(); removeStatus(); removeProject(); disconnect() }
  }, [controller])
  return controller
}
