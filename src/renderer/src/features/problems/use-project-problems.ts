import { useEffect } from 'react'

import type { ProjectIdentity } from '../../../../shared/contracts'
import { getMonacoDiagnosticsController } from './problems-session'

export function useProjectProblems(project: ProjectIdentity | null): void {
  useEffect(() => {
    if (!project) return
    const controller = getMonacoDiagnosticsController()
    controller?.activateProject(project.id)
    let active = true
    let statusRevision = 0
    const unsubscribe = window.studentIde.file.onStatusChanged((status) => {
      if (status.projectId !== project.id) return
      statusRevision += 1
      if (status.state === 'UNAVAILABLE') controller?.markProjectUnavailable(project.id)
    })
    const requestedRevision = statusRevision
    void window.studentIde.file.getStatus(project.id).then((result) => {
      if (
        active
        && statusRevision === requestedRevision
        && result.ok
        && result.value.state === 'UNAVAILABLE'
      ) controller?.markProjectUnavailable(project.id)
    }).catch(() => undefined)
    return () => {
      active = false
      unsubscribe()
      controller?.closeProject(project.id)
    }
  }, [project?.id])
}
