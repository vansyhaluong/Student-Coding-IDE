import type { AiApi } from './ai'
import type { ProjectAgentApi } from './project-agent'
import type { LearningApi } from './learning'
import type { SettingsApi } from './settings'
import type { LanguageApi } from './language'
import type { FileApi } from './file'
import type { GitApi } from './git'
import type { LifecycleApi } from './lifecycle'
import type { ProjectApi } from './project'
import type { SearchApi } from './search'
import type { TerminalContractApi } from './terminal'
import type { RunApi } from './run'

export interface StudentIdeApi {
  learning: LearningApi
  ai: AiApi
  agent: ProjectAgentApi
  settings: SettingsApi
  language: LanguageApi
  file: FileApi
  git: GitApi
  lifecycle: LifecycleApi
  project: ProjectApi
  search: SearchApi
  terminal: TerminalContractApi
  run: RunApi
}
