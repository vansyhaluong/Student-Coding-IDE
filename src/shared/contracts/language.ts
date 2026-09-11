import type { ProjectId } from './project'

export const LANGUAGE_PROVIDER_IDS = ['monaco-tokenization', 'csharp-ls'] as const
export type LanguageProviderId = (typeof LANGUAGE_PROVIDER_IDS)[number]

export const LANGUAGE_CAPABILITIES = [
  'syntax', 'completion', 'hover', 'signatureHelp', 'definition', 'diagnostics',
] as const
export type LanguageCapability = (typeof LANGUAGE_CAPABILITIES)[number]
export const CSHARP_LS_CAPABILITIES = [
  'completion', 'hover', 'signatureHelp', 'definition', 'diagnostics',
] as const satisfies readonly LanguageCapability[]

/** Process availability never controls Monaco-owned C# syntax tokenization. */
export const CSHARP_CAPABILITY_PROVIDERS = {
  syntax: 'monaco-tokenization',
  completion: 'csharp-ls',
  hover: 'csharp-ls',
  signatureHelp: 'csharp-ls',
  definition: 'csharp-ls',
  diagnostics: 'csharp-ls',
} as const satisfies Record<LanguageCapability, LanguageProviderId>

export const LANGUAGE_DEPENDENCY_STATES = [
  'NOT_CONFIGURED', 'MISSING', 'AVAILABLE', 'INVALID_CONFIGURATION',
] as const
export type LanguageDependencyState = (typeof LANGUAGE_DEPENDENCY_STATES)[number]

export const LANGUAGE_SERVICE_STATES = [
  'STOPPED', 'STARTING', 'RUNNING', 'CRASHED', 'MISSING', 'INVALID_CONFIGURATION',
] as const
export type LanguageServiceState = (typeof LANGUAGE_SERVICE_STATES)[number]

export const LANGUAGE_WORKSPACE_STATES = [
  'READY', 'SELECTION_REQUIRED', 'NO_CSHARP_WORKSPACE', 'PREFLIGHT_FAILED',
] as const
export type LanguageWorkspaceState = (typeof LANGUAGE_WORKSPACE_STATES)[number]

export const LANGUAGE_REASON_CODES = [
  'DOTNET_HOST_MISSING', 'DOTNET_SDK_MISSING', 'DOTNET_SDK_TOO_OLD', 'DOTNET_PROBE_FAILED',
  'CSHARP_LS_MISSING', 'CSHARP_LS_INVALID', 'CSHARP_LS_VERSION_MISMATCH', 'CSHARP_LS_PROBE_FAILED',
  'SDK_SELECTION_FAILED', 'SOLUTION_PARSE_FAILED', 'PROJECT_EVALUATION_FAILED',
  'PROJECT_REFERENCE_MISSING', 'PROJECT_REFERENCE_OUTSIDE_ROOT',
] as const
export type LanguageReasonCode = (typeof LANGUAGE_REASON_CODES)[number]

export const LANGUAGE_WARNING_CODES = ['DOTNET_PRERELEASE_ONLY'] as const
export type LanguageWarningCode = (typeof LANGUAGE_WARNING_CODES)[number]

export const LANGUAGE_LIMITS = {
  maximumRelativePathLength: 32_767,
  maximumRequestIdLength: 96,
  maximumCompletionHandleLength: 160,
  maximumCompletionItems: 2_000,
  maximumSignatures: 100,
  maximumParameters: 100,
  maximumDefinitions: 100,
  maximumDiagnostics: 2_000,
  maximumTextLength: 256 * 1024,
  maximumCandidateCount: 256,
} as const

export type SemanticRequestId = string & { readonly __brand: 'SemanticRequestId' }
export type CompletionHandle = string & { readonly __brand: 'CompletionHandle' }
export type DocumentVersion = number & { readonly __brand: 'DocumentVersion' }

export interface LanguageDocumentIdentity {
  readonly projectId: ProjectId
  readonly relativePath: string
}
export interface LanguagePosition { readonly line: number; readonly character: number }
export interface LanguageRange { readonly start: LanguagePosition; readonly end: LanguagePosition }

export interface LanguageDependencyStatus {
  readonly state: LanguageDependencyState
  readonly reason: LanguageReasonCode | null
  readonly warnings: readonly LanguageWarningCode[]
}
export interface LanguageServiceStatus {
  readonly state: LanguageServiceState
  readonly reason: LanguageReasonCode | null
}
export interface WorkspaceCandidate {
  readonly kind: 'solution' | 'project'
  readonly relativePath: string
}
export type LanguageWorkspaceStatus =
  | { readonly state: 'READY'; readonly selected: WorkspaceCandidate }
  | { readonly state: 'SELECTION_REQUIRED'; readonly candidates: readonly WorkspaceCandidate[] }
  | { readonly state: 'NO_CSHARP_WORKSPACE' }
  | { readonly state: 'PREFLIGHT_FAILED'; readonly selected: WorkspaceCandidate; readonly reason: LanguageReasonCode }

export interface LanguageStatus {
  readonly providerId: 'csharp-ls'
  readonly capabilities: readonly LanguageCapability[]
  readonly dependency: LanguageDependencyStatus
  readonly service: LanguageServiceStatus
  readonly workspace: LanguageWorkspaceStatus
}

interface PositionedLanguageRequest {
  readonly requestId: SemanticRequestId
  readonly document: LanguageDocumentIdentity
  readonly documentVersion: DocumentVersion
  readonly position: LanguagePosition
}
export type CompletionRequest = PositionedLanguageRequest
export type HoverRequest = PositionedLanguageRequest
export type SignatureHelpRequest = PositionedLanguageRequest
export type DefinitionRequest = PositionedLanguageRequest
export interface DiagnosticRequest {
  readonly requestId: SemanticRequestId
  readonly document: LanguageDocumentIdentity
  readonly documentVersion: DocumentVersion
}
export interface CompletionResolveRequest {
  readonly requestId: SemanticRequestId
  readonly handle: CompletionHandle
}
export interface SelectLanguageWorkspaceRequest {
  readonly projectId: ProjectId
  readonly candidate: WorkspaceCandidate
}

export type CompletionItemKind = 'text' | 'method' | 'function' | 'constructor' | 'field'
  | 'variable' | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value'
  | 'enum' | 'keyword' | 'snippet' | 'color' | 'file' | 'reference' | 'folder'
  | 'enumMember' | 'constant' | 'struct' | 'event' | 'operator' | 'typeParameter'
export interface CompletionItem {
  readonly label: string
  readonly kind: CompletionItemKind | null
  readonly detail: string | null
  readonly documentation: string | null
  readonly insertText: string | null
  readonly replacementRange: LanguageRange | null
  /** Opaque Main-owned lookup token; never raw CompletionItem.data. */
  readonly handle: CompletionHandle | null
}
export interface CompletionResult {
  readonly requestId: SemanticRequestId
  readonly documentVersion: DocumentVersion
  readonly isIncomplete: boolean
  readonly items: readonly CompletionItem[]
}
export interface HoverResult {
  readonly requestId: SemanticRequestId
  readonly documentVersion: DocumentVersion
  readonly contents: string
  readonly range: LanguageRange | null
}
export interface SignatureParameter { readonly label: string; readonly documentation: string | null }
export interface SignatureInformation {
  readonly label: string
  readonly documentation: string | null
  readonly parameters: readonly SignatureParameter[]
}
export interface SignatureHelpResult {
  readonly requestId: SemanticRequestId
  readonly documentVersion: DocumentVersion
  readonly signatures: readonly SignatureInformation[]
  readonly activeSignature: number | null
  readonly activeParameter: number | null
}
export interface DefinitionTarget {
  readonly document: LanguageDocumentIdentity
  readonly range: LanguageRange
}
export interface DefinitionResult {
  readonly requestId: SemanticRequestId
  readonly documentVersion: DocumentVersion
  readonly targets: readonly DefinitionTarget[]
}
export const LANGUAGE_DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'information', 'hint'] as const
export type LanguageDiagnosticSeverity = (typeof LANGUAGE_DIAGNOSTIC_SEVERITIES)[number]
export interface LanguageDiagnostic {
  readonly range: LanguageRange
  readonly severity: LanguageDiagnosticSeverity
  readonly code: string | number | null
  readonly source: string | null
  readonly message: string
}
export interface DiagnosticResult {
  readonly requestId: SemanticRequestId
  readonly documentVersion: DocumentVersion
  readonly diagnostics: readonly LanguageDiagnostic[]
}
