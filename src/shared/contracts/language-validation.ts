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
  if (isPlainObject(object.value.candidate) && object.value.candidate.kind !== 'solution') {
    invalid(issues, '$.candidate.kind', 'solution workspace candidate')
  }
  return finish<SelectLanguageWorkspaceRequest>(object.value, issues)
}

export function validateLanguageStatus(value: unknown): ValidationResult<LanguageStatus> {
  const object = validateExactObject(value, ['providerId', 'capabilities', 'effectiveCapabilities', 'completionResolve', 'completionTriggers', 'signatureTriggers', 'signatureRetriggers', 'dependency', 'service', 'workspace'])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  if (object.value.providerId !== 'csharp-ls') invalid(issues, '$.providerId', 'C# provider ID')
  const capabilities = object.value.capabilities
  if (!Array.isArray(capabilities) || capabilities.length !== CSHARP_LS_CAPABILITIES.length
    || !capabilities.every(isLanguageCapability) || new Set(capabilities).size !== capabilities.length
    || !CSHARP_LS_CAPABILITIES.every((capability) => capabilities.includes(capability))) {
    invalid(issues, '$.capabilities', 'complete unique capability set')
  }
  const effective = object.value.effectiveCapabilities
  if (!Array.isArray(effective) || !effective.every((item) => CSHARP_LS_CAPABILITIES.includes(item))
    || new Set(effective).size !== effective.length) invalid(issues, '$.effectiveCapabilities', 'unique effective capabilities')
  if (typeof object.value.completionResolve !== 'boolean') invalid(issues, '$.completionResolve', 'boolean')
  for (const field of ['completionTriggers', 'signatureTriggers', 'signatureRetriggers']) {
    const triggers = object.value[field]
    if (!Array.isArray(triggers) || triggers.some((v) => typeof v !== 'string' || [...v].length !== 1 || !isVisibleCharacter(v))
      || new Set(triggers).size !== triggers.length) invalid(issues, '$.' + field, 'unique trigger characters')
  }
  if (isPlainObject(object.value.service) && object.value.service.state !== 'RUNNING'
    && (Array.isArray(effective) && effective.length || object.value.completionResolve === true)) {
    invalid(issues, '$.effectiveCapabilities', 'no effective capability while stopped')
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
  const fields = value.state === 'READY' ? (value.mode === 'project' ? ['state', 'mode'] : ['state', 'mode', 'selected'])
    : value.state === 'SELECTION_REQUIRED' ? ['state', 'candidates']
      : value.state === 'NO_CSHARP_WORKSPACE' ? ['state']
        : value.state === 'PREFLIGHT_FAILED' ? ['state', 'reason', ...(value.selected === undefined ? [] : ['selected'])] : ['state']
  const object = validateExactObject(value, fields)
  if (!object.ok) return prefixIssues(object.issues, '$.workspace', issues)
  if (!LANGUAGE_WORKSPACE_STATES.includes(object.value.state as LanguageWorkspaceState)) return invalid(issues, '$.workspace.state', 'workspace state')
  if (object.value.state === 'READY' && object.value.mode !== 'project' && object.value.mode !== 'solution') invalid(issues, '$.workspace.mode', 'workspace mode')
  if ((object.value.state === 'READY' && object.value.mode === 'solution') || (object.value.state === 'PREFLIGHT_FAILED' && object.value.selected !== undefined)) {
    validateWorkspaceCandidateField(object.value.selected, '$.workspace.selected', issues)
    if (object.value.state === 'READY' && isPlainObject(object.value.selected) && object.value.selected.kind !== 'solution') invalid(issues, '$.workspace.selected', 'solution candidate')
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

export function validateLanguageWorkspaceStatus(value: unknown): ValidationResult<import('./language').LanguageWorkspaceStatus> {
  const issues: ValidationIssue[] = []
  validateWorkspaceStatusField(value, issues)
  return issues.length ? { ok: false, issues } : { ok: true, value: value as import('./language').LanguageWorkspaceStatus }
}
export function validateLanguageProject(value: unknown): ValidationResult<{ projectId: import('./project').ProjectId }> {
  const object = validateExactObject(value, ['projectId'])
  if (!object.ok) return object
  return isProjectId(object.value.projectId) ? { ok: true, value: { projectId: object.value.projectId } }
    : { ok: false, issues: [{ path: '$.projectId', message: 'Expected project identity' }] }
}
export function validateLanguageDocument(value: unknown, kind: 'open'): ValidationResult<import('./language').OpenLanguageDocumentRequest>
export function validateLanguageDocument(value: unknown, kind: 'change'): ValidationResult<import('./language').ChangeLanguageDocumentRequest>
export function validateLanguageDocument(value: unknown, kind: 'identity'): ValidationResult<import('./language').LanguageModelIdentity>
export function validateLanguageDocument(value: unknown, kind: 'open' | 'change' | 'identity'):
  ValidationResult<import('./language').OpenLanguageDocumentRequest | import('./language').ChangeLanguageDocumentRequest | import('./language').LanguageModelIdentity> {
  const object = validateExactObject(value, ['projectId', 'relativePath', 'modelVersion',
    ...(kind === 'open' ? ['text', 'dirty'] : kind === 'change' ? ['changes'] : [])])
  if (!object.ok) return object
  const issues: ValidationIssue[] = []
  if (!isProjectId(object.value.projectId)) invalid(issues, '$.projectId', 'project identity')
  if (!isLanguageRelativePath(object.value.relativePath) || !/\.cs$/i.test(String(object.value.relativePath))) invalid(issues, '$.relativePath', 'C# relative path')
  if (!isDocumentVersion(object.value.modelVersion)) invalid(issues, '$.modelVersion', 'model version')
  if (kind === 'open' && (typeof object.value.text !== 'string'
    || object.value.text.length > LANGUAGE_LIMITS.maximumTextLength || typeof object.value.dirty !== 'boolean')) {
    invalid(issues, '$', 'bounded text and dirty flag')
  }
  if (kind === 'change') {
    const changes = object.value.changes
    if (!Array.isArray(changes) || !changes.length || changes.length > LANGUAGE_LIMITS.maximumDocumentChanges) {
      invalid(issues, '$.changes', 'bounded ordered changes')
    }
    else for (const change of changes) {
      const c = validateExactObject(change, ['range', 'text'])
      if (!c.ok || typeof c.value.text !== 'string' || c.value.text.length > LANGUAGE_LIMITS.maximumTextLength) {
        invalid(issues, '$.changes', 'bounded text change'); continue
      }
      const r = validateExactObject(c.value.range, ['start', 'end'])
      if (!r.ok) { invalid(issues, '$.changes.range', 'range'); continue }
      validatePositionField(r.value.start, '$.changes.range.start', issues)
      validatePositionField(r.value.end, '$.changes.range.end', issues)
      if (isPlainObject(r.value.start) && isPlainObject(r.value.end)
        && Number.isSafeInteger(r.value.start.line) && Number.isSafeInteger(r.value.start.character)
        && Number.isSafeInteger(r.value.end.line) && Number.isSafeInteger(r.value.end.character)
        && (Number(r.value.end.line) < Number(r.value.start.line)
          || r.value.end.line === r.value.start.line && Number(r.value.end.character) < Number(r.value.start.character))) {
        invalid(issues, '$.changes.range', 'ordered range')
      }
    }
  }
  return finish(object.value, issues)
}
export function validateLanguageCancel(value: unknown): ValidationResult<{ requestId: SemanticRequestId }> {
  const object = validateExactObject(value, ['requestId'])
  if (!object.ok) return object
  return isSemanticRequestId(object.value.requestId) ? { ok: true, value: { requestId: object.value.requestId } }
    : { ok: false, issues: [{ path: '$.requestId', message: 'Expected semantic request ID' }] }
}

function isVisibleCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0)
  return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f
}
