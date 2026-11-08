import { projectEnvelopeDiagnostics, type EnvelopeDiagnostics } from './envelope-diagnostics'
import type { SmartAction } from '../../../../shared/contracts/smart-hints'
import { smartText, isSmartHintCode } from '../../../../shared/contracts/smart-hints-validation'
import { classifySmartOutput, VALIDATION_REASONS, VALIDATION_FIELDS, type SmartValidationDiagnostic } from './validation-diagnostics'

export const PROVIDER_FAILURE_SOURCES = ['HTTP_ERROR', 'MODEL_METADATA_ERROR', 'RESERVATION_IO_ERROR', 'PERSISTENCE_IO_ERROR', 'UNEXPECTED_ERROR'] as const
export type ProviderFailureSource = typeof PROVIDER_FAILURE_SOURCES[number]

// Main-private diagnostics only. Never a public status, IPC field or raw provider value.
export type ResponseFailureCode = 'ENVELOPE_INVALID' | 'CONTENT_MISSING' | 'JSON_PARSE_FAILED' | 'SCHEMA_VALIDATION_FAILED'
export type ResponseContentType = 'UNOBSERVED' | 'MISSING' | 'NULL' | 'STRING' | 'ARRAY' | 'OBJECT' | 'NUMBER' | 'BOOLEAN' | 'OTHER'
const fields = ['$', 'kind', 'level', 'paragraphs', 'nextQuestion', 'thinking', 'steps', 'code', 'evidence', 'hypotheses', 'suggestions',
  'syntax', 'variables', 'controlFlow', 'algorithm', 'illustrativeExamples', 'edits', 'rationale', 'reason', 'advice'] as const
type SchemaField = typeof fields[number]
export interface SmartResponseFailure {
  stage: 'ENVELOPE' | 'CONTENT_EXTRACTION' | 'CONTENT_JSON' | 'SH1_SCHEMA'
  code: ResponseFailureCode
  contentType: ResponseContentType
  invalidFields: SchemaField[]
  envelope?: EnvelopeDiagnostics
  validation?: SmartValidationDiagnostic
}
export function responseContentType(value: unknown, present = true): ResponseContentType {
  if (!present) return 'MISSING'
  if (value === null) return 'NULL'
  if (Array.isArray(value)) return 'ARRAY'
  switch (typeof value) {
    case 'string': return 'STRING'
    case 'object': return 'OBJECT'
    case 'number': return 'NUMBER'
    case 'boolean': return 'BOOLEAN'
    default: return 'OTHER'
  }
}
export function responseFailure(code: ResponseFailureCode, contentType: ResponseContentType = 'UNOBSERVED', invalidFields: SchemaField[] = [], envelope?: EnvelopeDiagnostics): SmartResponseFailure {
  const stages = { ENVELOPE_INVALID: 'ENVELOPE', CONTENT_MISSING: 'CONTENT_EXTRACTION', JSON_PARSE_FAILED: 'CONTENT_JSON', SCHEMA_VALIDATION_FAILED: 'SH1_SCHEMA' } as const
  return { stage: stages[code], code, contentType, invalidFields: fields.filter(field => invalidFields.includes(field)), ...(envelope ? { envelope } : {}) }
}

/** Final allowlist at the diagnostic sink, including defensive handling of a
 * custom transport/provider error. Never forward arbitrary error properties.
 */
export function projectResponseFailure(value: unknown): SmartResponseFailure | undefined {
  if (!value || typeof value !== 'object') return undefined
  const read = (key: string): unknown => {
    const d = Object.getOwnPropertyDescriptor(value, key)
    return d && Object.hasOwn(d, 'value') ? d.value : undefined
  }
  const code = read('code'), type = read('contentType'), bad = read('invalidFields')
  if (!['ENVELOPE_INVALID', 'CONTENT_MISSING', 'JSON_PARSE_FAILED', 'SCHEMA_VALIDATION_FAILED'].includes(code as string)) return undefined
  const typeSafe = ['UNOBSERVED', 'MISSING', 'NULL', 'STRING', 'ARRAY', 'OBJECT', 'NUMBER', 'BOOLEAN', 'OTHER'].includes(type as string) ? type as ResponseContentType : 'UNOBSERVED'
  const names = Array.isArray(bad) && bad.length <= fields.length ? Array.from({ length: bad.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(bad, String(i))
    return d && Object.hasOwn(d, 'value') ? d.value : undefined
  }) : []
  const result = responseFailure(code as ResponseFailureCode, typeSafe, fields.filter(field => names.includes(field)), projectEnvelopeDiagnostics(read('envelope')))
  const validation = read('validation')
  if (validation && typeof validation === 'object') {
    const reason = Object.getOwnPropertyDescriptor(validation, 'reason'), field = Object.getOwnPropertyDescriptor(validation, 'field')
    if (reason && Object.hasOwn(reason, 'value') && VALIDATION_REASONS.includes(reason.value)
      && field && Object.hasOwn(field, 'value') && VALIDATION_FIELDS.includes(field.value)) result.validation = { reason: reason.value, field: field.value }
  }
  return result
}

/** Read-only explanatory projection AFTER isSmartOutput rejects. It never decides
 * acceptance or repairs output. Unknown names and cross-field failures become '$'.
 * Only known SH-1 field names survive; provider strings/values never do.
 */
export function schemaResponseFailure(value: unknown, action: { kind: SmartAction['kind']; level?: number }, evidence: string[], source?: string, expectedEol?: 'LF' | 'CRLF'): SmartResponseFailure {
  const result = schemaFieldsFailure(value, action, evidence)
  if (source !== undefined) {
    const validation = classifySmartOutput(value, action, source, evidence, expectedEol)
    if (validation) result.validation = validation
  }
  return result
}
function schemaFieldsFailure(value: unknown, action: { kind: SmartAction['kind']; level?: number }, evidence: string[]): SmartResponseFailure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return responseFailure('SCHEMA_VALIDATION_FAILED', 'STRING', ['$'])
  const get = (field: SchemaField): unknown => {
    const d = Object.getOwnPropertyDescriptor(value, field)
    return d?.enumerable && Object.hasOwn(d, 'value') ? d.value : undefined
  }
  const kind = get('kind')
  const expected: SchemaField[] = action.kind === 'HINT' ? ['kind', 'thinking', 'steps', 'code', 'evidence']
    : action.kind === 'ANALYZE' ? ['kind', 'hypotheses', 'suggestions', 'evidence']
      : action.kind === 'EXPLAIN' ? ['kind', 'syntax', 'variables', 'controlFlow', 'algorithm', 'illustrativeExamples']
        : kind === 'NO_FIX' ? ['kind', 'reason', 'advice'] : ['kind', 'edits', 'rationale', 'evidence']
  const invalid = new Set<SchemaField>()
  for (const field of expected) if (get(field) === undefined) invalid.add(field)
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !expected.includes(key as SchemaField))) invalid.add('$')
  const expectedKind = action.kind === 'HINT' ? 'HINT' : action.kind === 'ANALYZE' ? 'ANALYSIS' : action.kind === 'EXPLAIN' ? 'EXPLANATION' : kind === 'NO_FIX' ? 'NO_FIX' : 'EDIT_PROPOSAL'
  if (kind !== expectedKind) invalid.add('kind')
  if (action.kind === 'HINT' && !isSmartHintCode(get('code'))) invalid.add('code')
  const list = (v: unknown, cap: number, minimum = 0): v is string[] => {
    if (!Array.isArray(v) || v.length < minimum || v.length > 8 || Object.getPrototypeOf(v) !== Array.prototype
      || Reflect.ownKeys(v).length !== v.length + 1) return false
    return Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i)))
      .every(d => !!d?.enumerable && Object.hasOwn(d, 'value') && smartText(d.value, cap))
  }
  for (const field of expected) {
    const v = get(field)
    if (['paragraphs', 'steps', 'hypotheses', 'suggestions', 'illustrativeExamples'].includes(field)
      && !list(v, field === 'paragraphs' ? 4096 : 2048, field === 'paragraphs' || field === 'steps' ? 1 : 0)) invalid.add(field)
    if (['thinking', 'nextQuestion', 'syntax', 'variables', 'controlFlow', 'algorithm', 'rationale', 'advice'].includes(field)
      && !smartText(v, field === 'nextQuestion' ? 2048 : 4096)) invalid.add(field)
    if (field === 'evidence' && (!list(v, 16) || v.some(ref => !/^R[1-9][0-9]?$/.test(ref) || !evidence.includes(ref)))) invalid.add(field)
    if (field === 'reason' && !['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'].includes(v as string)) invalid.add(field)
  }
  return responseFailure('SCHEMA_VALIDATION_FAILED', 'STRING', invalid.size ? [...invalid] : ['$'])
}
