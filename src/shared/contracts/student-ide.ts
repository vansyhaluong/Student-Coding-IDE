import type { FileApi } from './file'
import type { LifecycleApi } from './lifecycle'
import type { ProjectApi } from './project'
import type { SearchApi } from './search'
import type { TerminalContractApi } from './terminal'

export interface StudentIdeApi {
  file: FileApi
  lifecycle: LifecycleApi
  project: ProjectApi
  search: SearchApi
  terminal: TerminalContractApi
}
