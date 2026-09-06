import type { FileApi } from './file'
import type { GitApi } from './git'
import type { LifecycleApi } from './lifecycle'
import type { ProjectApi } from './project'
import type { SearchApi } from './search'
import type { TerminalContractApi } from './terminal'
import type { RunApi } from './run'

export interface StudentIdeApi {
  file: FileApi
  git: GitApi
  lifecycle: LifecycleApi
  project: ProjectApi
  search: SearchApi
  terminal: TerminalContractApi
  run: RunApi
}
