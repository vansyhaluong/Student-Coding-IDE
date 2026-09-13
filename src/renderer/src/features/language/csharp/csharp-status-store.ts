import type { ProjectId } from '../../../../../shared/contracts'
import type { LanguageStatus } from '../../../../../shared/contracts/language'

export function csharpStatusPresentation(status: LanguageStatus) {
  const reason = status.dependency.reason
  const dependency = reason === 'DOTNET_HOST_MISSING' || reason === 'DOTNET_SDK_MISSING' ? '.NET SDK 10+ is required'
    : reason === 'DOTNET_SDK_TOO_OLD' ? '.NET SDK 10+ is required (installed SDK is too old)'
      : reason === 'CSHARP_LS_MISSING' ? 'C# language server is missing'
        : reason?.startsWith('CSHARP_LS_') ? 'C# language server is invalid'
          : status.dependency.state === 'AVAILABLE' ? 'C# dependencies available'
            : status.dependency.state === 'NOT_CONFIGURED' ? 'C# dependencies not configured' : 'C# dependencies unavailable'
  const workspace = {
    READY: 'C# workspace preflight passed', SELECTION_REQUIRED: 'C# workspace selection required',
    NO_CSHARP_WORKSPACE: 'No C# project or solution found', PREFLIGHT_FAILED: 'C# workspace preflight failed',
  }[status.workspace.state]
  const service = {
    STOPPED: 'C# language service stopped', STARTING: 'C# language service starting',
    RUNNING: 'C# language service running', CRASHED: 'C# language service crashed',
    MISSING: 'C# language service unavailable', INVALID_CONFIGURATION: 'C# language service unavailable',
  }[status.service.state]
  const label = status.dependency.state !== 'AVAILABLE' ? dependency
    : status.workspace.state !== 'READY' ? workspace : service
  return { dependency, workspace, service, label,
    detail: `${dependency}\n${workspace}\n${service}\nPreflight and service initialization do not guarantee workspace health.${status.service.state !== 'RUNNING' ? '\nC# syntax highlighting remains available.' : ''}` }
}

let snapshot: { projectId: ProjectId; status: LanguageStatus; presentation: ReturnType<typeof csharpStatusPresentation> } | null = null
const listeners = new Set<() => void>()
export const csharpStatusStore = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  set(projectId: ProjectId | null, status: LanguageStatus | null): void {
    snapshot = projectId && status ? { projectId, status, presentation: csharpStatusPresentation(status) } : null
    for (const listener of listeners) listener()
  },
}
