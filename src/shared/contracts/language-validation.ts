import { isProjectId } from './project'
import {
  LANGUAGE_CAPABILITIES,
  CSHARP_LS_CAPABILITIES,
  LANGUAGE_DEPENDENCY_STATES,
  LANGUAGE_LIMITS,
  LANGUAGE_PROVIDER_IDS,
  LANGUAGE_REASON_CODES,
  LANGUAGE_SERVICE_STATES,
  LANGUAGE_WARNING_CODES,
  LANGUAGE_WORKSPACE_STATES,
  type CompletionHandle,
  type CompletionRequest,
  type CompletionResolveRequest,
  type DefinitionRequest,
  type DiagnosticRequest,
  type DocumentVersion,
  type HoverRequest,
  type LanguageCapability,
  type LanguageDependencyState,
  type LanguageProviderId,
  type LanguageReasonCode,
  type LanguageServiceState,
  type LanguageStatus,
  type LanguageWarningCode,
  type LanguageWorkspaceState,
  type SelectLanguageWorkspaceRequest,
  type SemanticRequestId,
  type SignatureHelpRequest,
} from './language'
import { isPlainObject, validateExactObject, type ValidationIssue, type ValidationResult } from './validation'

export function isLanguageProviderId(value: unknown): value is LanguageProviderId {
  return typeof value === 'string' && LANGUAGE_PROVIDER_IDS.includes(value as LanguageProviderId)
}
export function isLanguageCapability(value: unknown): value is LanguageCapability {
  return typeof value === 'string' && LANGUAGE_CAPABILITIES.includes(value as LanguageCapability)
}
export function isSemanticRequestId(value: unknown): value is SemanticRequestId {
  return typeof value === 'string' && value.length <= LANGUAGE_LIMITS.maximumRequestIdLength
    && /^language_[A-Za-z0-9_-]{1,87}$/.test(value)
}
export function isCompletionHandle(value: unknown): value is CompletionHandle {
  return typeof value === 'string' && value.length <= LANGUAGE_LIMITS.maximumCompletionHandleLength
    && /^completion_[A-Za-z0-9_-]{16,149}$/.test(value)
}
export function isDocumentVersion(value: unknown): value is DocumentVersion {
  return Number.isSafeInteger(value) && (value as number) >= 1
}
export function isLanguageRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && value.length <= LANGUAGE_LIMITS.maximumRelativePathLength
    && !value.startsWith('/') && !value.startsWith('\\') && !/^[a-z]:/i.test(value)
    && !/[\0\r\n]/.test(value) && !value.includes('\\')
    && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

export function validateCompletionRequest(value: unknown): ValidationResult<CompletionRequest> {
  return validatePositionedRequest<CompletionRequest>(value)
}
export function validateHoverRequest(value: unknown): ValidationResult<HoverRequest> {
  return validatePositionedRequest<HoverRequest>(value)
}
export function validateSignatureHelpRequest(value: unknown): ValidationResult<SignatureHelpRequest> {
  return validatePositionedRequest<SignatureHelpRequest>(value)
}
export function validateDefinitionRequest(value: unknown): ValidationResult<DefinitionRequest> {
  return validatePositionedRequest<DefinitionRequest>(value)
}
export function validateDiagnosticRequest(value: unknown): ValidationResult<DiagnosticRequest> {
  const object = validateExactObject(value, ['requestId', 'document', 'documentVersion'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateRequestIdentity(object.value, issues)
  return finish<DiagnosticRequest>(object.value, issues)
}
export function validateCompletionResolveRequest(value: unknown): ValidationResult<CompletionResolveRequest> {
  const object = validateExactObject(value, ['requestId', 'handle'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  if (!isSemanticRequestId(object.value.requestId)) invalid(issues, '$.requestId', 'semantic request ID')
  if (!isCompletionHandle(object.value.handle)) invalid(issues, '$.handle', 'completion handle')
  return finish<CompletionResolveRequest>(object.value, issues)
}
export function validateSelectLanguageWorkspaceRequest(value: unknown): ValidationResult<SelectLanguageWorkspaceRequest> {
  const object = validateExactObject(value, ['projectId', 'candidate'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  if (!isProjectId(object.value.projectId)) invalid(issues, '$.projectId', 'ProjectId')
  validateWorkspaceCandidateField(object.value.candidate, '$.candidate', issues)
  return finish<SelectLanguageWorkspaceRequest>(object.value, issues)
}

export function validateLanguageStatus(value: unknown): ValidationResult<LanguageStatus> {
  const object = validateExactObject(value, ['providerId', 'capabilities', 'dependency', 'service', 'workspace'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  if (object.value.providerId !== 'csharp-ls') invalid(issues, '$.providerId', 'C# provider ID')
  const capabilities = object.value.capabilities
  if (!Array.isArray(capabilities) || capabilities.length !== CSHARP_LS_CAPABILITIES.length
    || !capabilities.every(isLanguageCapability) || new Set(capabilities).size !== capabilities.length
    || !CSHARP_LS_CAPABILITIES.every((capability) => capabilities.includes(capability))) {
    invalid(issues, '$.capabilities', 'complete unique capability set')
  }
  validateDependencyStatusField(object.value.dependency, issues)
  validateServiceStatusField(object.value.service, issues)
  validateWorkspaceStatusField(object.value.workspace, issues)
  return finish<LanguageStatus>(object.value, issues)
}

function validatePositionedRequest<T>(value: unknown): ValidationResult<T> {
  const object = validateExactObject(value, ['requestId', 'document', 'documentVersion', 'position'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  validateRequestIdentity(object.value, issues)
  validatePositionField(object.value.position, '$.position', issues)
  return finish<T>(object.value, issues)
}
function validateRequestIdentity(value: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (!isSemanticRequestId(value.requestId)) invalid(issues, '$.requestId', 'semantic request ID')
  validateDocumentField(value.document, '$.document', issues)
  if (!isDocumentVersion(value.documentVersion)) invalid(issues, '$.documentVersion', 'positive document version')
}
function validateDocumentField(value: unknown, path: string, issues: ValidationIssue[]): void {
  const object = validateExactObject(value, ['projectId', 'relativePath'])
  if (!object.ok) return prefixIssues(object.issues, path, issues)
  if (!isProjectId(object.value.projectId)) invalid(issues, `${path}.projectId`, 'ProjectId')
  if (!isLanguageRelativePath(object.value.relativePath)) invalid(issues, `${path}.relativePath`, 'project-relative path')
}
function validatePositionField(value: unknown, path: string, issues: ValidationIssue[]): void {
  const object = validateExactObject(value, ['line', 'character'])
  if (!object.ok) return prefixIssues(object.issues, path, issues)
  for (const field of ['line', 'character'] as const) {
    if (!Number.isSafeInteger(object.value[field]) || (object.value[field] as number) < 0) {
      invalid(issues, `${path}.${field}`, 'non-negative integer')
    }
  }
}
function validateWorkspaceCandidateField(value: unknown, path: string, issues: ValidationIssue[]): void {
  const object = validateExactObject(value, ['kind', 'relativePath'])
  if (!object.ok) return prefixIssues(object.issues, path, issues)
  const { kind, relativePath } = object.value
  if (kind !== 'solution' && kind !== 'project') invalid(issues, `${path}.kind`, 'workspace candidate kind')
  if (!isLanguageRelativePath(relativePath)
    || kind === 'solution' && !/\.(?:sln|slnx)$/i.test(relativePath as string)
    || kind === 'project' && !/\.csproj$/i.test(relativePath as string)) {
    invalid(issues, `${path}.relativePath`, 'matching workspace-relative path')
  }
}
function validateDependencyStatusField(value: unknown, issues: ValidationIssue[]): void {
  const object = validateExactObject(value, ['state', 'reason', 'warnings'])
  if (!object.ok) return prefixIssues(object.issues, '$.dependency', issues)
  const { state, reason, warnings } = object.value
  if (!LANGUAGE_DEPENDENCY_STATES.includes(state as LanguageDependencyState)) invalid(issues, '$.dependency.state', 'dependency state')
  if (reason !== null && !LANGUAGE_REASON_CODES.includes(reason as LanguageReasonCode)) invalid(issues, '$.dependency.reason', 'reason code or null')
  if (!Array.isArray(warnings) || warnings.length > LANGUAGE_WARNING_CODES.length
    || !warnings.every((item) => LANGUAGE_WARNING_CODES.includes(item as LanguageWarningCode))
    || new Set(warnings).size !== warnings.length) invalid(issues, '$.dependency.warnings', 'unique warning codes')
  const hasNoFailure = state === 'AVAILABLE' || state === 'NOT_CONFIGURED'
  if (hasNoFailure ? reason !== null : reason === null) invalid(issues, '$.dependency', 'coherent dependency status')
  if (state !== 'AVAILABLE' && Array.isArray(warnings) && warnings.length > 0) {
    invalid(issues, '$.dependency.warnings', 'warnings only for an available dependency')
  }
}
function validateServiceStatusField(value: unknown, issues: ValidationIssue[]): void {
  const object = validateExactObject(value, ['state', 'reason'])
  if (!object.ok) return prefixIssues(object.issues, '$.service', issues)
  if (!LANGUAGE_SERVICE_STATES.includes(object.value.state as LanguageServiceState)) invalid(issues, '$.service.state', 'service state')
  if (object.value.reason !== null && !LANGUAGE_REASON_CODES.includes(object.value.reason as LanguageReasonCode)) {
    invalid(issues, '$.service.reason', 'reason code or null')
  }
}
function validateWorkspaceStatusField(value: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) return invalid(issues, '$.workspace', 'workspace status')
  const fields = value.state === 'READY' ? ['state', 'selected']
    : value.state === 'SELECTION_REQUIRED' ? ['state', 'candidates']
      : value.state === 'NO_CSHARP_WORKSPACE' ? ['state']
        : value.state === 'PREFLIGHT_FAILED' ? ['state', 'selected', 'reason'] : ['state']
  const object = validateExactObject(value, fields)
  if (!object.ok) return prefixIssues(object.issues, '$.workspace', issues)
  if (!LANGUAGE_WORKSPACE_STATES.includes(object.value.state as LanguageWorkspaceState)) return invalid(issues, '$.workspace.state', 'workspace state')
  if (object.value.state === 'READY' || object.value.state === 'PREFLIGHT_FAILED') {
    validateWorkspaceCandidateField(object.value.selected, '$.workspace.selected', issues)
  }
  if (object.value.state === 'SELECTION_REQUIRED') {
    if (!Array.isArray(object.value.candidates) || object.value.candidates.length < 2
      || object.value.candidates.length > LANGUAGE_LIMITS.maximumCandidateCount) {
      invalid(issues, '$.workspace.candidates', 'bounded candidate list')
    } else object.value.candidates.forEach((candidate, index) => validateWorkspaceCandidateField(candidate, `$.workspace.candidates[${index}]`, issues))
  }
  if (object.value.state === 'PREFLIGHT_FAILED'
    && !LANGUAGE_REASON_CODES.includes(object.value.reason as LanguageReasonCode)) invalid(issues, '$.workspace.reason', 'reason code')
}
function prefixIssues(source: readonly ValidationIssue[], prefix: string, target: ValidationIssue[]): void {
  target.push(...source.map((issue) => ({ path: issue.path === '$' ? prefix : `${prefix}${issue.path.slice(1)}`, message: issue.message })))
}
function invalid(issues: ValidationIssue[], path: string, expected: string): void {
  issues.push({ path, message: `Expected ${expected}` })
}
function finish<T>(value: Record<string, unknown>, issues: ValidationIssue[]): ValidationResult<T> {
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as T }
}
