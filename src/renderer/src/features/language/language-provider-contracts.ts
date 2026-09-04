import type { ProjectId } from '../../../../shared/contracts'
import type { Phase3LanguageId } from './language-capabilities'

export type Phase3ProviderId =
  | 'monaco-typescript'
  | 'monaco-html'
  | 'monaco-css'
  | 'monaco-json'

export type LanguageProviderStatus =
  | 'NOT_CONFIGURED'
  | 'MISSING'
  | 'STARTING'
  | 'RUNNING'
  | 'STOPPED'
  | 'CRASHED'
  | 'INVALID_CONFIGURATION'

export const languageProviderStatuses = [
  'NOT_CONFIGURED',
  'MISSING',
  'STARTING',
  'RUNNING',
  'STOPPED',
  'CRASHED',
  'INVALID_CONFIGURATION',
] as const satisfies readonly LanguageProviderStatus[]

export interface LanguageProviderContract {
  readonly providerId: Phase3ProviderId
  readonly languages: readonly Phase3LanguageId[]
  readonly execution: 'renderer-monaco-worker'
  readonly projectAware: boolean
}

export const phase3ProviderContracts = {
  'monaco-typescript': {
    providerId: 'monaco-typescript',
    languages: ['javascript', 'typescript'],
    execution: 'renderer-monaco-worker',
    projectAware: true,
  },
  'monaco-html': {
    providerId: 'monaco-html',
    languages: ['html'],
    execution: 'renderer-monaco-worker',
    projectAware: false,
  },
  'monaco-css': {
    providerId: 'monaco-css',
    languages: ['css'],
    execution: 'renderer-monaco-worker',
    projectAware: false,
  },
  'monaco-json': {
    providerId: 'monaco-json',
    languages: ['json'],
    execution: 'renderer-monaco-worker',
    projectAware: false,
  },
} as const satisfies Record<Phase3ProviderId, LanguageProviderContract>

export interface ProviderGenerationIdentity {
  readonly providerId: Phase3ProviderId
  readonly projectId: ProjectId
  readonly generation: number
}

export function isCurrentProviderGeneration(
  candidate: ProviderGenerationIdentity,
  current: ProviderGenerationIdentity,
): boolean {
  return candidate.providerId === current.providerId
    && candidate.projectId === current.projectId
    && candidate.generation === current.generation
}
