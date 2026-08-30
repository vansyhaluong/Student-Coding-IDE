import type { ProjectId } from '../../../../shared/contracts'

export interface EditorNavigationRequest {
  id: number
  projectId: ProjectId
  relativePath: string
  lineNumber: number
  columnStart: number
  columnEnd: number
}
