import type { AppResult } from './app-error'
import type { ProjectRunApi } from './run-project'
import { validateAppError, type AppError } from './app-error'
import type { ProjectId } from './project'
import { validateExactObject, type ValidationResult } from './validation'

export const RUN_CHANNELS = { start: 'run:start', stop: 'run:stop', event: 'run:event' } as const
declare const runSessionBrand: unique symbol
export type RunSessionId = string & { readonly [runSessionBrand]: true }
export const RUN_STATES = ['STARTING', 'RUNNING', 'STOPPING', 'EXITED', 'FAILED', 'CANCELLED'] as const
export type RunState = typeof RUN_STATES[number]

export interface RunTarget {
  readonly projectId: ProjectId
  readonly relativePath: string
}

/** UI selects the current document. Dirty is a guard, never disk/path authority. */
export interface StartRunRequest extends RunTarget {
  readonly dirty: boolean
}
export interface StopRunRequest { readonly sessionId: RunSessionId }
export interface RunSession extends RunTarget {
  readonly sessionId: RunSessionId
  readonly state: RunState
}
export type RunEvent =
  | { readonly type: 'state'; readonly session: RunSession }
  | { readonly type: 'stdout' | 'stderr'; readonly session: RunSession; readonly data: string }
  | { readonly type: 'exit'; readonly session: RunSession; readonly exitCode: number | null }
  | { readonly type: 'error'; readonly session: RunSession; readonly error: AppError }

/** Live Renderer capability exposes only these semantic operations, never process options. */
export interface RunApi extends ProjectRunApi {
  start(request: StartRunRequest): Promise<AppResult<RunSession>>
  stop(sessionId: RunSessionId): Promise<AppResult<null>>
  onEvent(listener: (event: RunEvent) => void): () => void
}

/** M1-01 semantic DTOs; M1-10 adds project methods while legacy validators stay unchanged.
 * Validation is lexical only. Main must authorize owner, project, canonical paths,
 * Console eligibility and SDK before execution. Never add PreparedRun/process fields here.
 */
export const RUN_TARGET_KINDS = ['javascript-file', 'csharp-project'] as const
export type RunTargetKind = typeof RUN_TARGET_KINDS[number]
export interface JavaScriptFileRunTarget extends RunTarget { readonly kind: 'javascript-file' }
export interface CSharpProjectRunTarget extends RunTarget { readonly kind: 'csharp-project' }
export type SemanticRunTarget = JavaScriptFileRunTarget | CSharpProjectRunTarget
/** Dirty remains a presentation guard, not filesystem or process authority. */
export type SemanticStartRunRequest = SemanticRunTarget & { readonly dirty: boolean }
export const RUN_EXECUTION_PHASES = ['PREPARING', 'BUILD_RESTORE', 'EXECUTING'] as const
export type RunExecutionPhase = typeof RUN_EXECUTION_PHASES[number]
/** Phase is separate from lifecycle state; transition/ownership checks belong to Main. */
export type SemanticRunSession = SemanticRunTarget & {
  readonly sessionId: RunSessionId
  readonly state: RunState
  readonly phase: RunExecutionPhase
}
export const RUN_SEMANTIC_LIMITS = {
  maximumRelativePathLength: 4096,
  maximumDisplayNameLength: 256,
  maximumCandidates: 64,
} as const
export const CSHARP_RUN_CANDIDATE_REASONS = [
  'NOT_CONSOLE_PROJECT', 'UNSUPPORTED_SDK', 'UNSUPPORTED_FRAMEWORK', 'MULTIPLE_FRAMEWORKS',
  'INVALID_PROJECT', 'INVALID_PROJECT_REFERENCE', 'SDK_MISSING', 'SDK_SELECTION_FAILED',
  'PREFLIGHT_FAILED',
] as const
export type CSharpRunCandidateReason = typeof CSHARP_RUN_CANDIDATE_REASONS[number]
export type CSharpRunCandidate = {
  readonly relativePath: string
  readonly displayName: string
} & (
  | { readonly eligibility: 'ELIGIBLE'; readonly reason: null }
  | { readonly eligibility: 'INELIGIBLE' | 'UNASSESSABLE'; readonly reason: CSharpRunCandidateReason }
)
export const CSHARP_RUN_DEPENDENCY_REASONS = [
  'DOTNET_HOST_MISSING', 'DOTNET_SDK_MISSING', 'SDK_SELECTION_FAILED', 'DOTNET_PROBE_FAILED',
] as const
export type CSharpRunDependencyFailure =
  | { readonly state: 'MISSING'; readonly reason: 'DOTNET_HOST_MISSING' | 'DOTNET_SDK_MISSING' }
  | { readonly state: 'INVALID_CONFIGURATION'; readonly reason: 'SDK_SELECTION_FAILED' | 'DOTNET_PROBE_FAILED' }
export const CSHARP_RUN_RESOLUTION_STATES = [
  'READY', 'SELECTION_REQUIRED', 'NO_RUNNABLE_PROJECT', 'DEPENDENCY_FAILED', 'FAILED',
] as const
export const CSHARP_RUN_SELECTION_DIAGNOSTICS = ['STALE_TARGET', 'PERSISTENCE_RECOVERED'] as const
export type CSharpRunSelectionDiagnostic = typeof CSHARP_RUN_SELECTION_DIAGNOSTICS[number]
/** Optional explanation only; resolution.state remains selection/launch authority. */
export type CSharpRunTargetResolution = { readonly projectId: ProjectId;
  readonly selectionDiagnostic?: CSharpRunSelectionDiagnostic } & (
  | { readonly state: 'READY'; readonly selectionDiagnostic?: never; readonly target: CSharpProjectRunTarget; readonly candidates: readonly CSharpRunCandidate[] }
  | { readonly state: 'SELECTION_REQUIRED' | 'NO_RUNNABLE_PROJECT'; readonly candidates: readonly CSharpRunCandidate[] }
  | { readonly state: 'DEPENDENCY_FAILED'; readonly dependency: CSharpRunDependencyFailure; readonly candidates: readonly CSharpRunCandidate[] }
  | { readonly state: 'FAILED'; readonly reason: 'DISCOVERY_LIMIT_EXCEEDED' | 'PREFLIGHT_FAILED' | 'PERSISTENCE_FAILED' }
)
export const RUN_FAILURE_REASONS = [
  'DEPENDENCY_MISSING', 'INVALID_CONFIGURATION', 'PREFLIGHT_FAILED', 'BUILD_OR_RESTORE_FAILED',
  'EXECUTION_FAILED', 'SPAWN_FAILED', 'OBSERVATION_FAILED', 'CLEANUP_FAILED',
] as const
/** Safe semantic failure classification, not an error stack/log or execution capability. */
export type RunFailure =
  | { readonly reason: 'BUILD_OR_RESTORE_FAILED'; readonly exitCode: number }
  | { readonly reason: 'EXECUTION_FAILED'; readonly exitCode: number | null }
  | { readonly reason: Exclude<typeof RUN_FAILURE_REASONS[number], 'BUILD_OR_RESTORE_FAILED' | 'EXECUTION_FAILED'> }

export function validateSemanticRunTarget(value: unknown): ValidationResult<SemanticRunTarget> {
  const object = validateExactObject(value, ['kind', 'projectId', 'relativePath'])
  return object.ok ? semanticTarget(object.value) : object
}

function semanticTarget(value: Record<string, unknown>): ValidationResult<SemanticRunTarget> {
  const validated = target(value)
  if (!validated.ok) return validated
  const path = semanticPath(validated.value.relativePath, value.kind)
  if (!path.ok) return path
  if (value.kind === 'javascript-file') {
    return { ok: true, value: { ...validated.value, kind: 'javascript-file' } }
  }
  return { ok: true, value: { ...validated.value, kind: 'csharp-project' } }
}

function semanticPath(value: unknown, kind: unknown): ValidationResult<string> {
  const path = runRelativePath(value)
  if (!path.ok) return path
  if (path.value.length > RUN_SEMANTIC_LIMITS.maximumRelativePathLength) return invalid('$.relativePath')
  if (kind !== 'javascript-file' && kind !== 'csharp-project') return invalid('$.kind')
  return (kind === 'javascript-file' ? path.value.endsWith('.js') : /\.csproj$/i.test(path.value))
    ? path : invalid('$.relativePath')
}

export function validateSemanticStartRunRequest(value: unknown): ValidationResult<SemanticStartRunRequest> {
  const object = validateExactObject(value, ['kind', 'projectId', 'relativePath', 'dirty'])
  if (!object.ok) return object
  const validated = semanticTarget(object.value)
  if (!validated.ok) return validated
  return typeof object.value.dirty === 'boolean'
    ? { ok: true, value: { ...validated.value, dirty: object.value.dirty } } : invalid('$.dirty')
}

export function validateRunExecutionPhase(value: unknown): ValidationResult<RunExecutionPhase> {
  return typeof value === 'string' && RUN_EXECUTION_PHASES.includes(value as RunExecutionPhase)
    ? { ok: true, value: value as RunExecutionPhase } : invalid('$.phase')
}

export function validateSemanticRunSession(value: unknown): ValidationResult<SemanticRunSession> {
  const object = validateExactObject(value, ['kind', 'projectId', 'relativePath', 'sessionId', 'state', 'phase'])
  if (!object.ok) return object
  const validated = semanticTarget(object.value)
  if (!validated.ok) return validated
  const { sessionId, state } = object.value
  if (!isRunSessionId(sessionId)) return invalid('$.sessionId')
  if (typeof state !== 'string' || !RUN_STATES.includes(state as RunState)) return invalid('$.state')
  const phase = validateRunExecutionPhase(object.value.phase)
  if (!phase.ok) return phase
  if (validated.value.kind === 'javascript-file' && phase.value === 'BUILD_RESTORE') return invalid('$.phase')
  return { ok: true, value: { ...validated.value, sessionId, state: state as RunState, phase: phase.value } }
}

export function validateCSharpRunCandidate(value: unknown): ValidationResult<CSharpRunCandidate> {
  const object = validateExactObject(value, ['relativePath', 'displayName', 'eligibility', 'reason'])
  if (!object.ok) return object
  const path = semanticPath(object.value.relativePath, 'csharp-project')
  if (!path.ok) return path
  const { displayName, eligibility, reason } = object.value
  if (typeof displayName !== 'string' || !displayName.trim()
    || displayName.length > RUN_SEMANTIC_LIMITS.maximumDisplayNameLength
    || [...displayName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return invalid('$.displayName')
  }
  const candidate = { relativePath: path.value, displayName }
  if (eligibility === 'ELIGIBLE' && reason === null) return { ok: true, value: { ...candidate, eligibility, reason } }
  if ((eligibility === 'INELIGIBLE' || eligibility === 'UNASSESSABLE') && typeof reason === 'string'
    && CSHARP_RUN_CANDIDATE_REASONS.includes(reason as CSharpRunCandidateReason)) {
    return { ok: true, value: { ...candidate, eligibility, reason: reason as CSharpRunCandidateReason } }
  }
  return invalid('$.eligibility')
}

export function validateCSharpRunDependencyFailure(value: unknown): ValidationResult<CSharpRunDependencyFailure> {
  const object = validateExactObject(value, ['state', 'reason'])
  if (!object.ok) return object
  const { state, reason } = object.value
  if (state === 'MISSING' && (reason === 'DOTNET_HOST_MISSING' || reason === 'DOTNET_SDK_MISSING')) {
    return { ok: true, value: { state, reason } }
  }
  if (state === 'INVALID_CONFIGURATION' && (reason === 'SDK_SELECTION_FAILED' || reason === 'DOTNET_PROBE_FAILED')) {
    return { ok: true, value: { state, reason } }
  }
  return invalid('$.dependency')
}

export function validateCSharpRunTargetResolution(value: unknown): ValidationResult<CSharpRunTargetResolution> {
  const object = validateExactObject(value, ['projectId', 'state', 'target', 'candidates', 'dependency', 'reason', 'selectionDiagnostic'])
  if (!object.ok) return object
  const { projectId, state } = object.value
  if (typeof projectId !== 'string' || !/^project_[a-f0-9]{24}$/.test(projectId)) return invalid('$.projectId')
  const fields = state === 'READY' ? ['projectId', 'state', 'target', 'candidates']
    : state === 'SELECTION_REQUIRED' || state === 'NO_RUNNABLE_PROJECT' ? ['projectId', 'state', 'candidates']
      : state === 'DEPENDENCY_FAILED' ? ['projectId', 'state', 'dependency', 'candidates']
        : ['projectId', 'state', 'reason']
  const diagnostic = object.value.selectionDiagnostic
  const hasDiagnostic = Object.hasOwn(object.value, 'selectionDiagnostic')
  if (hasDiagnostic && (state === 'READY' || typeof diagnostic !== 'string'
    || !CSHARP_RUN_SELECTION_DIAGNOSTICS.includes(diagnostic as CSharpRunSelectionDiagnostic))) return invalid('$.selectionDiagnostic')
  const metadata = hasDiagnostic ? { selectionDiagnostic: diagnostic as CSharpRunSelectionDiagnostic } : {}
  const exact = validateExactObject(value, [...fields, ...(hasDiagnostic ? ['selectionDiagnostic'] : [])])
  if (!exact.ok) return exact
  if (state === 'FAILED') {
    const reason = object.value.reason
    if (reason === 'DISCOVERY_LIMIT_EXCEEDED' || reason === 'PREFLIGHT_FAILED' || reason === 'PERSISTENCE_FAILED') {
      return { ok: true, value: { projectId: projectId as ProjectId, state, reason, ...metadata } }
    }
    return invalid('$.reason')
  }
  if (!CSHARP_RUN_RESOLUTION_STATES.includes(state as typeof CSHARP_RUN_RESOLUTION_STATES[number])) return invalid('$.state')
  if (!Array.isArray(object.value.candidates) || object.value.candidates.length > RUN_SEMANTIC_LIMITS.maximumCandidates) {
    return invalid('$.candidates')
  }
  const candidates: CSharpRunCandidate[] = []
  const paths = new Set<string>()
  for (const item of object.value.candidates) {
    const candidate = validateCSharpRunCandidate(item)
    if (!candidate.ok) return candidate
    const identity = candidate.value.relativePath.toLowerCase()
    if (paths.has(identity)) return invalid('$.candidates')
    paths.add(identity)
    candidates.push(candidate.value)
  }
  const context = { projectId: projectId as ProjectId, candidates }
  if (state === 'READY') {
    const selected = validateSemanticRunTarget(object.value.target)
    if (!selected.ok) return selected
    if (selected.value.kind !== 'csharp-project' || selected.value.projectId !== projectId
      || !candidates.some(candidate => candidate.eligibility === 'ELIGIBLE'
        && candidate.relativePath.toLowerCase() === selected.value.relativePath.toLowerCase())) return invalid('$.target')
    return { ok: true, value: { ...context, state, target: selected.value } }
  }
  if (state === 'SELECTION_REQUIRED' && candidates.some(candidate => candidate.eligibility === 'ELIGIBLE')) {
    return { ok: true, value: { ...context, state, ...metadata } }
  }
  if (state === 'NO_RUNNABLE_PROJECT' && candidates.every(candidate => candidate.eligibility === 'INELIGIBLE')) {
    return { ok: true, value: { ...context, state, ...metadata } }
  }
  if (state === 'DEPENDENCY_FAILED' && !candidates.some(candidate => candidate.eligibility === 'ELIGIBLE')) {
    const dependency = validateCSharpRunDependencyFailure(object.value.dependency)
    return dependency.ok ? { ok: true, value: { ...context, state, dependency: dependency.value, ...metadata } } : dependency
  }
  return invalid('$.state')
}

export function validateRunFailure(value: unknown): ValidationResult<RunFailure> {
  const object = validateExactObject(value, ['reason', 'exitCode'])
  if (!object.ok) return object
  const { reason, exitCode } = object.value
  if (typeof reason !== 'string' || !RUN_FAILURE_REASONS.includes(reason as typeof RUN_FAILURE_REASONS[number])) {
    return invalid('$.reason')
  }
  const exact = validateExactObject(value, reason === 'BUILD_OR_RESTORE_FAILED' || reason === 'EXECUTION_FAILED'
    ? ['reason', 'exitCode'] : ['reason'])
  if (!exact.ok) return exact
  if (reason === 'BUILD_OR_RESTORE_FAILED' || reason === 'EXECUTION_FAILED') {
    if (typeof exitCode === 'number' && Number.isInteger(exitCode) && exitCode > 0 && exitCode <= 0xffff_ffff) {
      return { ok: true, value: { reason, exitCode } }
    }
    if (reason === 'EXECUTION_FAILED' && exitCode === null) return { ok: true, value: { reason, exitCode } }
    return invalid('$.exitCode')
  }
  return { ok: true, value: { reason: reason as Exclude<typeof RUN_FAILURE_REASONS[number], 'BUILD_OR_RESTORE_FAILED' | 'EXECUTION_FAILED'> } }
}

function invalid(path: string): ValidationResult<never> {
  return { ok: false, issues: [{ path, message: 'Invalid Run field' }] }
}

export function isRunSessionId(value: unknown): value is RunSessionId {
  return typeof value === 'string'
    && /^run_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
}

/** Lexical IPC check only. Main must separately verify active project and real paths. */
function target(value: Record<string, unknown>): ValidationResult<RunTarget> {
  if (typeof value.projectId !== 'string' || !/^project_[a-f0-9]{24}$/.test(value.projectId)) {
    return invalid('$.projectId')
  }
  const path = runRelativePath(value.relativePath)
  return path.ok ? { ok: true, value: { projectId: value.projectId as ProjectId, relativePath: path.value } } : path
}

function runRelativePath(path: unknown): ValidationResult<string> {
  if (typeof path !== 'string' || !path || /[\\<>:"|?*]/.test(path)
    || [...path].some((character) => character.charCodeAt(0) < 32)
    || path.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    return invalid('$.relativePath')
  }
  return { ok: true, value: path }
}

export function validateStartRunRequest(value: unknown): ValidationResult<StartRunRequest> {
  const object = validateExactObject(value, ['projectId', 'relativePath', 'dirty'])
  if (!object.ok) return object
  const validated = target(object.value)
  if (!validated.ok) return validated
  if (typeof object.value.dirty !== 'boolean') return invalid('$.dirty')
  return { ok: true, value: { ...validated.value, dirty: object.value.dirty } }
}

export function validateStopRunRequest(value: unknown): ValidationResult<StopRunRequest> {
  const object = validateExactObject(value, ['sessionId'])
  if (!object.ok) return object
  return isRunSessionId(object.value.sessionId)
    ? { ok: true, value: { sessionId: object.value.sessionId } } : invalid('$.sessionId')
}

export function validateRunSession(value: unknown): ValidationResult<RunSession> {
  const object = validateExactObject(value, ['projectId', 'relativePath', 'sessionId', 'state'])
  if (!object.ok) return object
  const validated = target(object.value)
  if (!validated.ok) return validated
  const { sessionId, state } = object.value
  if (!isRunSessionId(sessionId)) return invalid('$.sessionId')
  if (typeof state !== 'string' || !RUN_STATES.some((candidate) => candidate === state)) {
    return invalid('$.state')
  }
  return { ok: true, value: { ...validated.value, sessionId, state: state as RunState } }
}

export function validateRunEvent(value: unknown): ValidationResult<RunEvent> {
  const object = validateExactObject(value, ['type', 'session', 'data', 'exitCode', 'error'])
  if (!object.ok) return object
  const session = validateRunSession(object.value.session)
  if (!session.ok) return session
  const { type, data, exitCode, error } = object.value
  const fields = type === 'state' ? ['type', 'session']
    : type === 'stdout' || type === 'stderr' ? ['type', 'session', 'data']
      : type === 'exit' ? ['type', 'session', 'exitCode'] : ['type', 'session', 'error']
  const exact = validateExactObject(value, fields)
  if (!exact.ok) return exact
  if (type === 'state') return { ok: true, value: { type, session: session.value } }
  if ((type === 'stdout' || type === 'stderr') && typeof data === 'string') {
    return { ok: true, value: { type, session: session.value, data } }
  }
  if (type === 'exit' && ['EXITED', 'FAILED', 'CANCELLED'].includes(session.value.state)
    && (exitCode === null || typeof exitCode === 'number'
      && Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 0xffff_ffff)) {
    return { ok: true, value: { type, session: session.value, exitCode } }
  }
  if (type === 'error') {
    const validated = validateAppError(error)
    if (validated.ok) return { ok: true, value: { type, session: session.value, error: validated.value } }
  }
  return invalid('$')
}
