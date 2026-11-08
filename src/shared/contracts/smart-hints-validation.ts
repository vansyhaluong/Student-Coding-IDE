import { analysisFields as fields, analysisWellFormed } from './analysis-validation'
import { isExerciseId, matchesExerciseType, type ExerciseType } from './practice'
import { SMART_HINT_POLICY as P, SMART_FAILURES, type SmartPrepare, type SmartReference, type SmartStart,
  type SmartRetire, type SmartAction, type SmartOrigin, type SmartBinding, type SmartOutput,
  type SmartRunContext, type SmartStatus, type SmartCapabilities, type SmartEdit } from './smart-hints'
import type { ValidationResult } from './validation'
import type { PrepareHintApply, HintApplyProposal, ConsumeHintApply, DiscardHintApply } from './smart-hints'
import { HINT_APPLY_MAX_ATTEMPTS, HINT_APPLY_STAGES } from './smart-hints'
import type { AppError } from './app-error'

/** Accept only a correlated, bounded Main failure; never treat transport errors as retry permission. */
export function isHintApplyFailure(error: AppError, q: PrepareHintApply): boolean {
  const d = error.details
  return error.operation === 'prepareHintApply' && !!d
    && fields(d, ['requestId', 'operationId', 'stage', 'reason', 'attempt', 'remaining', 'noGrant'])
    && d.requestId === q.requestId && d.operationId === q.hint.operationId && d.noGrant === true
    && HINT_APPLY_STAGES.includes(d.stage as typeof HINT_APPLY_STAGES[number])
    && ['TARGET_INVALID', 'CANDIDATE_INVALID', 'STALE', 'UNSUPPORTED'].includes(d.reason as string)
    && smartInteger(d.attempt, 1) && (d.attempt as number) <= HINT_APPLY_MAX_ATTEMPTS
    && d.remaining === HINT_APPLY_MAX_ATTEMPTS - (d.attempt as number)
    && error.retryable === ((d.reason === 'TARGET_INVALID' || d.reason === 'CANDIDATE_INVALID') && (d.remaining as number) > 0)
}

export function validateConsumeHintApply(v: unknown): ValidationResult<ConsumeHintApply> {
  if (fields(v, ['preparation', 'proposalId']) && smartUuid(v.proposalId)) {
    const p = validatePrepareHintApply(v.preparation)
    if (p.ok) return { ok: true, value: { preparation: p.value, proposalId: v.proposalId } }
  }
  return { ok: false, issues: [{ path: '$', message: 'Invalid Hint consume request.' }] }
}
export function validateDiscardHintApply(v: unknown): ValidationResult<DiscardHintApply> {
  if (fields(v, ['hint', 'requestId']) && smartUuid(v.requestId) && validateSmartReference(v.hint).ok)
    return { ok: true, value: structuredClone(v) as unknown as DiscardHintApply }
  return { ok: false, issues: [{ path: '$', message: 'Invalid Hint discard request.' }] }
}

export function validatePrepareHintApply(v: unknown): ValidationResult<PrepareHintApply> {
  const invalid = (): ValidationResult<never> => ({ ok: false, issues: [{ path: '$', message: 'Invalid Hint Apply request.' }] })
  if (!fields(v, ['requestId', 'hint', 'exerciseId', 'language', 'sourceRevision', 'source', 'packageVersion', 'origin', 'selection'])
    || !validateSmartReference(v.hint).ok || !smartInteger(v.packageVersion, 1)
    || !isSmartPrepare({ requestId: v.requestId, clientContextId: v.requestId, exerciseId: v.exerciseId, language: v.language,
      sourceRevision: v.sourceRevision, source: v.source, origin: v.origin, action: { kind: 'HINT' }, run: null })
    || !origin(v.origin) || v.origin.kind !== 'PRACTICE') return invalid()
  const s = v.selection, source = v.source as string
  if (s !== null) {
    if (!fields(s, ['startOffset', 'endOffset', 'text', 'startLine', 'startColumn', 'endLine', 'endColumn'])
      || !smartInteger(s.startOffset) || !smartInteger(s.endOffset) || s.endOffset < s.startOffset || s.endOffset > source.length
      || !smartBoundary(source, s.startOffset) || !smartBoundary(source, s.endOffset)
      || !smartText(s.text, P.selectionBytes, true) || s.text !== source.slice(s.startOffset, s.endOffset)) return invalid()
    const a = smartPosition(source, s.startOffset), b = smartPosition(source, s.endOffset)
    if (a.line !== s.startLine || a.column !== s.startColumn || b.line !== s.endLine || b.column !== s.endColumn) return invalid()
  }
  return { ok: true, value: structuredClone(v) as unknown as PrepareHintApply }
}

/** Separate proposal envelope: never relax HINT status/output validation. */
export function isHintApplyProposal(v: unknown): v is HintApplyProposal {
  if (!fields(v, ['schemaVersion', 'requestId', 'proposalId', 'hint', 'binding', 'expiresAt', 'target', 'output'])
    || v.schemaVersion !== 1 || !smartUuid(v.requestId) || !smartUuid(v.proposalId) || !validateSmartReference(v.hint).ok
    || !isSmartBinding(v.binding) || v.binding.action.kind !== 'HINT' || v.binding.origin.kind !== 'PRACTICE'
    || !smartInteger(v.expiresAt, 1) || !fields(v.target, ['kind', 'startOffset', 'endOffset'])
    || !['TEMPLATE_BODY', 'SELECTION'].includes(v.target.kind as string)
    || !smartInteger(v.target.startOffset) || !smartInteger(v.target.endOffset) || v.target.endOffset < v.target.startOffset
    || !isSmartOutput(v.output) || v.output.kind !== 'EDIT_PROPOSAL' || v.output.edits.length !== 1) return false
  const edit = v.output.edits[0]
  return edit.startOffset === v.target.startOffset && edit.endOffset === v.target.endOffset && smartBytes(v) <= P.requestBytes
}

export { fields as smartFields }
export const smartBytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length
export const smartText = (v: unknown, cap: number, empty = false): v is string => typeof v === 'string'
  && v.length <= cap && (empty || !!v.trim()) && analysisWellFormed(v) && !v.includes('\0') && new TextEncoder().encode(v).length <= cap
export const smartInteger = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && !Object.is(v, -0)
export const smartUuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
const language = (v: unknown) => v === 'csharp' || v === 'javascript'
function array(v: unknown, max: number): v is unknown[] {
  return Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= max
    && Reflect.ownKeys(v).length === v.length + 1
    && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i)))
      .every(d => !!d && d.enumerable === true && Object.hasOwn(d, 'value'))
}
const types: ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
export function smartExerciseValue(v: unknown, t: ExerciseType): boolean {
  let nodes = 0
  const bounded = (x: unknown, depth: number): boolean => {
    if (++nodes > 4096 || depth > 2) return false
    if (typeof x === 'string') return smartText(x, P.runBytes, true)
    if (Array.isArray(x)) return array(x, 4096) && x.every(item => bounded(item, depth + 1))
    return true
  }
  if (!bounded(v, 0)) return false
  if (!matchesExerciseType(v, t)) return false
  if (typeof v === 'string') return smartText(v, P.runBytes, true)
  if (Array.isArray(v)) return v.every(x => typeof x !== 'string' || smartText(x, P.runBytes, true))
  return true
}
const type = (v: unknown): v is ExerciseType => types.includes(v as ExerciseType)
const list = (v: unknown, cap = 2048): v is string[] => array(v, 8) && v.every(x => smartText(x, cap))
const eol = (s: string) => s.includes('\r\n') ? 'CRLF' : 'LF'
export function smartPosition(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset), lines = prefix.split('\n')
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}
export function smartBoundary(s: string, n: number): boolean {
  const before = s.charCodeAt(n - 1), after = s.charCodeAt(n)
  return !(before === 13 && after === 10) && !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff)
}
function origin(v: unknown): v is SmartOrigin {
  return fields(v, ['kind', 'modelId', 'modelVersion', 'eol']) && v.kind === 'PRACTICE' && smartUuid(v.modelId)
    && smartInteger(v.modelVersion, 1) && ['LF', 'CRLF'].includes(v.eol as string)
    || fields(v, ['kind', 'blockId']) && v.kind === 'SOLUTION' && smartUuid(v.blockId)
}
function action(v: unknown): v is SmartAction {
  if (fields(v, ['kind'])) return v.kind === 'ANALYZE' || v.kind === 'HINT'
  if (fields(v, ['kind', 'level'])) return v.kind === 'HINT' && [1, 2, 3].includes(v.level as number)
  if (!fields(v, ['kind', 'selection']) || (v.kind !== 'EXPLAIN' && v.kind !== 'SUGGEST_FIX')) return false
  const s = v.selection
  return fields(s, ['startOffset', 'endOffset', 'text', 'startLine', 'startColumn', 'endLine', 'endColumn'])
    && smartInteger(s.startOffset) && smartInteger(s.endOffset) && s.endOffset > s.startOffset
    && smartText(s.text, P.selectionBytes) && [s.startLine, s.startColumn, s.endLine, s.endColumn].every(x => smartInteger(x, 1))
}
export function isSmartPrepare(v: unknown): v is SmartPrepare {
  if (!fields(v, ['requestId', 'clientContextId', 'exerciseId', 'language', 'sourceRevision', 'source', 'origin', 'action', 'run'])
    || !smartUuid(v.requestId) || !smartUuid(v.clientContextId) || !isExerciseId(v.exerciseId) || !language(v.language)
    || !smartInteger(v.sourceRevision) || !smartText(v.source, P.sourceBytes, true) || !origin(v.origin) || !action(v.action)) return false
  if (v.origin.kind === 'SOLUTION' && (v.action.kind !== 'EXPLAIN' || v.run !== null)) return false
  if (v.origin.kind === 'PRACTICE' && (v.source.includes('\n') && v.origin.eol !== eol(v.source) || /\r(?!\n)/.test(v.source)
    || v.origin.eol === 'CRLF' && /(?<!\r)\n/.test(v.source))) return false
  if (v.run !== null && (!fields(v.run, ['sessionId', 'generation', 'sequence']) || !smartText(v.run.sessionId, 128)
    || !v.run.sessionId.startsWith('exercise_') || !smartUuid(v.run.sessionId.slice(9)) || !smartInteger(v.run.generation, 1) || !smartInteger(v.run.sequence))) return false
  if (v.action.kind === 'EXPLAIN' || v.action.kind === 'SUGGEST_FIX') {
    const s = v.action.selection, a = smartPosition(v.source, s.startOffset), b = smartPosition(v.source, s.endOffset)
    if (s.endOffset > v.source.length || !smartBoundary(v.source, s.startOffset) || !smartBoundary(v.source, s.endOffset)
      || s.text !== v.source.slice(s.startOffset, s.endOffset) || a.line !== s.startLine || a.column !== s.startColumn
      || b.line !== s.endLine || b.column !== s.endColumn
      || v.action.kind === 'SUGGEST_FIX' && s.startOffset === 0 && s.endOffset === v.source.length) return false
  }
  return smartBytes(v) <= P.requestBytes
}
export function isSmartBinding(v: unknown): v is SmartBinding {
  return fields(v, ['clientContextId', 'contextGeneration', 'exerciseId', 'language', 'packageVersion', 'sourceRevision', 'fingerprint', 'sourceBytes', 'origin', 'action'])
    && smartUuid(v.clientContextId) && smartInteger(v.contextGeneration, 1) && isExerciseId(v.exerciseId) && language(v.language)
    && smartInteger(v.packageVersion, 1) && smartInteger(v.sourceRevision) && typeof v.fingerprint === 'string'
    && /^[a-f0-9]{64}$/.test(v.fingerprint) && smartInteger(v.sourceBytes) && v.sourceBytes <= P.sourceBytes
    && origin(v.origin) && boundAction(v.action) && (v.origin.kind !== 'SOLUTION' || v.action.kind === 'EXPLAIN')
}
function boundAction(v: unknown): v is SmartBinding['action'] {
  if (fields(v, ['kind', 'selection']) && (v.kind === 'EXPLAIN' || v.kind === 'SUGGEST_FIX')) {
    const s = v.selection
    return fields(s, ['startOffset', 'endOffset', 'startLine', 'startColumn', 'endLine', 'endColumn', 'fingerprint'])
      && smartInteger(s.startOffset) && smartInteger(s.endOffset) && s.endOffset > s.startOffset
      && [s.startLine, s.startColumn, s.endLine, s.endColumn].every(x => smartInteger(x, 1))
      && typeof s.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(s.fingerprint)
  }
  return action(v) && v.kind !== 'EXPLAIN' && v.kind !== 'SUGGEST_FIX'
}
export function isSmartRunContext(v: unknown): v is SmartRunContext {
  if (fields(v, ['kind', 'reason'])) return v.kind === 'CODE_ONLY' && ['NO_MATCHING_PUBLIC_RUN', 'DETAIL_LIMIT_EXCEEDED'].includes(v.reason as string)
  if (!fields(v, ['kind', 'parameterTypes', 'returnType', 'observations', 'failure', 'locations']) || v.kind !== 'RUN_PUBLIC'
    || !array(v.parameterTypes, 16) || !v.parameterTypes.every(type) || !type(v.returnType)
    || !array(v.observations, 16) || ![null, 'COMPILE_ERROR', 'SYNTAX_ERROR', 'RUNTIME_ERROR'].includes(v.failure as never)
    || !array(v.locations, 16) || !v.locations.every(l => fields(l, ['line', 'column']) && smartInteger(l.line, 1) && smartInteger(l.column, 1))) return false
  const ids = new Set<string>(), ordinals = new Set<number>()
  return v.observations.every(o => {
    if (!fields(o, ['evidenceId', 'sampleOrdinal', 'input', 'expected', 'actual']) || typeof o.evidenceId !== 'string'
      || !/^R[1-9][0-9]?$/.test(o.evidenceId) || ids.has(o.evidenceId) || !smartInteger(o.sampleOrdinal, 1) || o.sampleOrdinal > 16
      || ordinals.has(o.sampleOrdinal) || !array(o.input, 16) || o.input.length !== (v.parameterTypes as unknown[]).length
      || !o.input.every((x, i) => smartExerciseValue(x, (v.parameterTypes as ExerciseType[])[i]))
      || !smartExerciseValue(o.expected, v.returnType as ExerciseType) || !smartExerciseValue(o.actual, v.returnType as ExerciseType)) return false
    ids.add(o.evidenceId); ordinals.add(o.sampleOrdinal); return true
  }) && smartBytes(v) <= P.runBytes
}
export function isSmartEdit(v: unknown): v is SmartEdit {
  return fields(v, ['startOffset', 'endOffset', 'expectedOldText', 'replacementText', 'rationale'])
    && smartInteger(v.startOffset) && smartInteger(v.endOffset) && v.endOffset >= v.startOffset
    && smartText(v.expectedOldText, P.editBytes, true) && smartText(v.replacementText, P.editBytes, true)
    && v.expectedOldText !== v.replacementText && smartText(v.rationale, 2048)
}
/** Same base source for every edit. No fuzzy search, repair or rebasing. */
export function smartCandidate(source: string, edits: SmartEdit[], expectedEol?: 'LF' | 'CRLF'): string | undefined {
  if (!array(edits, P.edits) || !edits.length || !edits.every(isSmartEdit)) return undefined
  const sorted = [...edits].sort((a, b) => a.startOffset - b.startOffset)
  let bytes = 0, lines = 0, covered = 0
  for (let i = 0; i < sorted.length; i++) {
    const x = sorted[i], previous = sorted[i - 1]
    if (x.endOffset > source.length || !smartBoundary(source, x.startOffset) || !smartBoundary(source, x.endOffset)
      || source.slice(x.startOffset, x.endOffset) !== x.expectedOldText || previous && (previous.endOffset > x.startOffset
        || previous.endOffset === x.startOffset && (previous.startOffset === previous.endOffset || x.startOffset === x.endOffset))) return undefined
    const s = x.replacementText
    if (/\r(?!\n)/.test(s) || ((expectedEol ?? eol(source)) === 'LF' ? s.includes('\r') : /(?<!\r)\n/.test(s))) return undefined
    bytes += new TextEncoder().encode(x.expectedOldText + s).length
    lines += (x.expectedOldText ? x.expectedOldText.split('\n').length : 0) + (s ? s.split('\n').length : 0)
    covered += x.endOffset - x.startOffset
  }
  if (bytes > P.editBytes || lines > P.editLines || covered === source.length) return undefined
  let result = source
  for (const x of sorted.reverse()) result = result.slice(0, x.startOffset) + x.replacementText + result.slice(x.endOffset)
  return smartText(result, P.sourceBytes, true) ? result : undefined
}
/** Advisory snippets are not compiled or granted editor authority. Reject foreign
 * language markers after removing comments/strings; common C#/JS statements are
 * valid in either language. Binding language is also checked at every boundary. */
export function isSmartHintCode(v: unknown, expectedLanguage?: string): boolean {
  if (!fields(v, ['language', 'text']) || !language(v.language) || expectedLanguage !== undefined && v.language !== expectedLanguage
    || !smartText(v.text, 8192) || v.text.includes('```')) return false
  const code = v.text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ' ')
  if (!/[;{}()=+*/-]/.test(code) || /^\s*(?:def |from \w+ import |print\s*\()/m.test(code)) return false
  return v.language === 'csharp'
    ? !/\bfunction\b|\blet\s|\bconst\s+\w+\s*=|\bconsole\s*\.|===|!==/.test(code)
    : !/\b(?:public|private|protected|internal|namespace|using)\s|\b(?:int|bool|string|double|float|decimal|void)\s+\w+/.test(code)
}
export function isSmartOutput(v: unknown, a?: { kind: SmartAction['kind']; level?: number }, source?: string, evidence?: string[], expectedEol?: 'LF' | 'CRLF', expectedLanguage?: string): v is SmartOutput {
  let valid = false
  if (fields(v, ['kind', 'thinking', 'steps', 'code', 'evidence'])) valid = v.kind === 'HINT'
    && smartText(v.thinking, 4096) && list(v.steps, 2048) && v.steps.length > 0 && isSmartHintCode(v.code, expectedLanguage)
    && list(v.evidence, 16) && (!a || a.kind === 'HINT')
  else if (fields(v, ['kind', 'hypotheses', 'suggestions', 'evidence'])) valid = v.kind === 'ANALYSIS' && list(v.hypotheses) && list(v.suggestions)
    && list(v.evidence, 16) && (!a || a.kind === 'ANALYZE')
  else if (fields(v, ['kind', 'syntax', 'variables', 'controlFlow', 'algorithm', 'illustrativeExamples'])) valid = v.kind === 'EXPLANATION'
    && [v.syntax, v.variables, v.controlFlow, v.algorithm].every(x => smartText(x, 4096)) && list(v.illustrativeExamples) && (!a || a.kind === 'EXPLAIN')
  else if (fields(v, ['kind', 'reason', 'advice'])) valid = v.kind === 'NO_FIX' && ['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'].includes(v.reason as string)
    && smartText(v.advice, 4096) && (!a || a.kind === 'SUGGEST_FIX')
  else if (fields(v, ['kind', 'edits', 'rationale', 'evidence'])) valid = v.kind === 'EDIT_PROPOSAL' && array(v.edits, P.edits)
    && v.edits.length > 0 && v.edits.length <= P.edits && v.edits.every(isSmartEdit) && smartText(v.rationale, 4096) && list(v.evidence, 16)
    && (!a || a.kind === 'SUGGEST_FIX') && (source === undefined || smartCandidate(source, v.edits, expectedEol) !== undefined)
  if (!valid) return false
  const o = v as SmartOutput
  if ('evidence' in o && o.evidence.some(x => !/^R[1-9][0-9]?$/.test(x) || evidence && !evidence.includes(x))) return false
  return smartBytes(v) <= P.resultBytes
}
export function isSmartStatus(v: unknown): v is SmartStatus {
  if (!v || typeof v !== 'object' || !Reflect.ownKeys(v).every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))) return false
  const o = v as Record<string, unknown>, base = ['schemaVersion', 'requestId', 'operationId', 'sequence', 'binding', 'state']
  if (o.schemaVersion !== 1 || !smartUuid(o.requestId) || !smartUuid(o.operationId) || !smartInteger(o.sequence) || !isSmartBinding(o.binding)) return false
  if (['PREPARING', 'RUNNING', 'CANCELLED', 'EXPIRED'].includes(o.state as string)) return fields(o, base)
  if (o.state === 'FAILED') return fields(o, [...base, 'code']) && SMART_FAILURES.includes(o.code as never)
  if (o.state === 'PREPARED') return fields(o, [...base, 'captureToken', 'expiresAt', 'consentVersion', 'statementBytes', 'runContextKind'])
    && smartUuid(o.captureToken) && smartInteger(o.expiresAt, 1) && o.consentVersion === 1 && smartInteger(o.statementBytes)
    && o.statementBytes <= P.statementBytes && ['CODE_ONLY', 'RUN_PUBLIC'].includes(o.runContextKind as string)
  if (o.state !== 'COMPLETE' || !fields(o, [...base, 'output', 'runContext', 'expiresAt', 'proposalId']) || !isSmartRunContext(o.runContext)
    || !isSmartOutput(o.output, o.binding.action, undefined, o.runContext.kind === 'RUN_PUBLIC' ? o.runContext.observations.map(x => x.evidenceId) : [], undefined, o.binding.language)
    || !smartInteger(o.expiresAt, 1) || (o.output.kind === 'EDIT_PROPOSAL' ? !smartUuid(o.proposalId) : o.proposalId !== null)) return false
  return smartBytes(o) <= P.requestBytes
}
function checked<T>(v: unknown, check: (v: unknown) => boolean): ValidationResult<T> {
  try { return check(v) ? { ok: true, value: structuredClone(v) as T } : { ok: false, issues: [{ path: '$', message: 'Invalid Smart Hints request.' }] } }
  catch { return { ok: false, issues: [{ path: '$', message: 'Invalid Smart Hints request.' }] } }
}
export const validateSmartPrepare = (v: unknown) => {
  const result = checked<SmartPrepare>(v, isSmartPrepare)
  if (result.ok && result.value.action.kind === 'HINT') result.value.action = { kind: 'HINT' }
  return result
}
export const validateSmartReference = (v: unknown) => checked<SmartReference>(v, x => fields(x, ['requestId', 'operationId']) && smartUuid(x.requestId) && smartUuid(x.operationId))
export const validateSmartStart = (v: unknown) => checked<SmartStart>(v, x => fields(x, ['requestId', 'operationId', 'captureToken', 'consentVersion', 'consentGranted'])
  && smartUuid(x.requestId) && smartUuid(x.operationId) && smartUuid(x.captureToken) && x.consentVersion === 1 && x.consentGranted === true)
export const validateSmartRetire = (v: unknown) => checked<SmartRetire>(v, x => fields(x, ['clientContextId', 'reason']) && smartUuid(x.clientContextId)
  && ['EDIT', 'RESET', 'RESTORE', 'EXERCISE', 'LANGUAGE', 'LEARNING_LEFT'].includes(x.reason as string))
export function isSmartCapabilities(v: unknown): v is SmartCapabilities {
  return fields(v, ['enabled', 'providerMode', 'applyEnabled', 'consentVersion', 'suggestFixMode', 'suggestFixLanguages']) && typeof v.enabled === 'boolean' && typeof v.applyEnabled === 'boolean'
    && (!v.applyEnabled || v.enabled === true && ['FAKE', 'OPENROUTER_FREE', 'GEMINI_FREE'].includes(v.providerMode as string))
    && v.consentVersion === 1 && (v.enabled ? ['FAKE', 'OPENROUTER_FREE', 'GEMINI_FREE'].includes(v.providerMode as string) : v.providerMode === 'DISABLED')
    && array(v.suggestFixLanguages, 2) && v.suggestFixLanguages.every(language)
    && (v.suggestFixMode === 'DISABLED' ? v.suggestFixLanguages.length === 0
      : v.suggestFixMode === 'SELECTION_V1' && v.enabled && v.suggestFixLanguages.length > 0
        && (v.suggestFixLanguages.length === 1 || v.suggestFixLanguages[0] === 'csharp' && v.suggestFixLanguages[1] === 'javascript'))
}
