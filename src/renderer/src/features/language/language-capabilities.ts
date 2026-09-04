export type Phase3LanguageId =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
  | 'csharp'
  | 'php'
  | 'python'
  | 'java'

export interface LanguageCapabilities {
  readonly syntax: boolean
  readonly completion: boolean
  readonly diagnostics: boolean
  readonly hover: boolean
  readonly signatureHelp: boolean
  readonly definition: boolean
}

export interface LanguageCapabilityRegistration {
  readonly languageId: Phase3LanguageId
  readonly scope: 'tier-1' | 'tier-2' | 'tier-3' | 'deferred'
  readonly provider:
    | 'monaco-typescript'
    | 'monaco-html'
    | 'monaco-css'
    | 'monaco-json'
    | 'monaco-tokenization'
    | 'deferred'
  readonly capabilities: LanguageCapabilities
}

const fullIntelligence: LanguageCapabilities = {
  syntax: true,
  completion: true,
  diagnostics: true,
  hover: true,
  signatureHelp: true,
  definition: true,
}

const webIntelligence: LanguageCapabilities = {
  syntax: true,
  completion: true,
  diagnostics: true,
  hover: true,
  signatureHelp: false,
  definition: false,
}

const syntaxOnly: LanguageCapabilities = {
  syntax: true,
  completion: false,
  diagnostics: false,
  hover: false,
  signatureHelp: false,
  definition: false,
}

const deferred: LanguageCapabilities = {
  syntax: false,
  completion: false,
  diagnostics: false,
  hover: false,
  signatureHelp: false,
  definition: false,
}

export const phase3LanguageCapabilities = {
  javascript: {
    languageId: 'javascript',
    scope: 'tier-1',
    provider: 'monaco-typescript',
    capabilities: fullIntelligence,
  },
  typescript: {
    languageId: 'typescript',
    scope: 'tier-1',
    provider: 'monaco-typescript',
    capabilities: fullIntelligence,
  },
  html: {
    languageId: 'html',
    scope: 'tier-2',
    provider: 'monaco-html',
    capabilities: webIntelligence,
  },
  css: {
    languageId: 'css',
    scope: 'tier-2',
    provider: 'monaco-css',
    capabilities: webIntelligence,
  },
  json: {
    languageId: 'json',
    scope: 'tier-2',
    provider: 'monaco-json',
    capabilities: webIntelligence,
  },
  csharp: {
    languageId: 'csharp',
    scope: 'tier-3',
    provider: 'monaco-tokenization',
    capabilities: syntaxOnly,
  },
  php: {
    languageId: 'php',
    scope: 'tier-3',
    provider: 'monaco-tokenization',
    capabilities: syntaxOnly,
  },
  python: {
    languageId: 'python',
    scope: 'deferred',
    provider: 'deferred',
    capabilities: deferred,
  },
  java: {
    languageId: 'java',
    scope: 'deferred',
    provider: 'deferred',
    capabilities: deferred,
  },
} as const satisfies Record<Phase3LanguageId, LanguageCapabilityRegistration>

const languageByExtension = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  cs: 'csharp',
  php: 'php',
  py: 'python',
  java: 'java',
} as const satisfies Record<string, Phase3LanguageId>

export function phase3LanguageIdForPath(relativePath: string): Phase3LanguageId | null {
  const extension = relativePath.split('.').at(-1)?.toLowerCase()
  return languageByExtension[extension as keyof typeof languageByExtension] ?? null
}
