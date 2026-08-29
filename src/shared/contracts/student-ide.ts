import type { FileApi } from './file'
import type { LifecycleApi } from './lifecycle'
import type { ProjectApi } from './project'

export interface StudentIdeApi {
  file: FileApi
  lifecycle: LifecycleApi
  project: ProjectApi
}
