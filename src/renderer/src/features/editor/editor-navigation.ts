import type { ProjectId } from '../../../../shared/contracts'

export interface EditorNavigationRequest {
  id: number
  projectId: ProjectId
  relativePath: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}
