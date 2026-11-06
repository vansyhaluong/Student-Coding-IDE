import { SMART_HINT_POLICY as P, type SmartAction } from '../../../../shared/contracts/smart-hints'
import { isSmartOutput, smartFields, smartText, smartInteger, smartBoundary, smartBytes } from '../../../../shared/contracts/smart-hints-validation'

// Main-private explanations, never acceptance authority or public IPC contracts.
export const VALIDATION_REASONS = ['WRONG_SHAPE', 'MISSING_FIELD', 'INVALID_FIELD', 'INVALID_RANGE',
  'OLD_TEXT_MISMATCH', 'INVALID_EOL', 'OVERLAPPING_EDITS', 'FULL_SOURCE_REWRITE', 'SIZE_LIMIT_EXCEEDED',
  'INVALID_EVIDENCE', 'OTHER_VALIDATION_FAILURE'] as const
export const VALIDATION_FIELDS = ['$', 'kind', 'level', 'paragraphs', 'nextQuestion', 'evidence', 'hypotheses', 'suggestions',
  'syntax', 'variables', 'controlFlow', 'algorithm', 'illustrativeExamples', 'edits', 'rationale', 'reason', 'advice',
  'startOffset', 'endOffset', 'expectedOldText', 'replacementText'] as const
export interface SmartValidationDiagnostic {
  reason: typeof VALIDATION_REASONS[number]
  field: typeof VALIDATION_FIELDS[number]
}
const kinds = ['HINT', 'ANALYSIS', 'EXPLANATION', 'EDIT_PROPOSAL', 'NO_FIX'] as const
export interface SmartOutputDiagnostic { outputKind: typeof kinds[number] | 'UNRECOGNIZED' | 'UNOBSERVED'; editCount: number | null }
const own = (v: unknown, key: string): unknown => {
  if (!v || typeof v !== 'object') return undefined
  const d = Object.getOwnPropertyDescriptor(v, key)
  return d?.enumerable && Object.hasOwn(d, 'value') ? d.value : undefined
}
export function smartOutputDiagnostic(value: unknown): SmartOutputDiagnostic {
  try {
    const kind = own(value, 'kind'), edits = own(value, 'edits')
    return { outputKind: kinds.includes(kind as typeof kinds[number]) ? kind as typeof kinds[number] : 'UNRECOGNIZED',
      // Five means >=5; never retain an unbounded/provider-controlled count.
      editCount: Array.isArray(edits) ? Math.min(edits.length, P.edits + 1) : null }
  } catch { return { outputKind: 'UNOBSERVED', editCount: null } }
}
const failure = (reason: SmartValidationDiagnostic['reason'], field: SmartValidationDiagnostic['field'] = '$'): SmartValidationDiagnostic => ({ reason, field })
const size = (v: unknown, cap: number) => typeof v === 'string' && (v.length > cap || new TextEncoder().encode(v).length > cap)
function shape(v: unknown, keys: string[]): SmartValidationDiagnostic | undefined {
  if (smartFields(v, keys)) return undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return failure('WRONG_SHAPE')
  const missing = keys.find(k => !Object.hasOwn(v, k))
  return missing ? failure('MISSING_FIELD', missing as SmartValidationDiagnostic['field']) : failure('WRONG_SHAPE')
}
function text(v: unknown, cap: number, field: SmartValidationDiagnostic['field'], empty = false): SmartValidationDiagnostic | undefined {
  return smartText(v, cap, empty) ? undefined : failure(size(v, cap) ? 'SIZE_LIMIT_EXCEEDED' : 'INVALID_FIELD', field)
}

/** Called only for rejected data; rechecks the unchanged predicate to prevent a
 * valid result from ever being labeled invalid. Every specific reason witnesses
 * a rejection condition. Residual/hostile input gets a fixed fallback, no values.
 */
export function classifySmartOutput(value: unknown, action: { kind: SmartAction['kind']; level?: number }, source: string,
  evidence: string[], expectedEol?: 'LF' | 'CRLF'): SmartValidationDiagnostic | undefined {
  try {
    if (isSmartOutput(value, action, source, evidence, expectedEol)) return undefined
    const kind = own(value, 'kind')
    const keys = action.kind === 'HINT' ? ['kind', 'level', 'paragraphs', 'nextQuestion', 'evidence']
      : action.kind === 'ANALYZE' ? ['kind', 'hypotheses', 'suggestions', 'evidence']
        : action.kind === 'EXPLAIN' ? ['kind', 'syntax', 'variables', 'controlFlow', 'algorithm', 'illustrativeExamples']
          : kind === 'NO_FIX' ? ['kind', 'reason', 'advice'] : ['kind', 'edits', 'rationale', 'evidence']
    const badShape = shape(value, keys)
    if (badShape) return badShape
    const expectedKind = action.kind === 'HINT' ? 'HINT' : action.kind === 'ANALYZE' ? 'ANALYSIS'
      : action.kind === 'EXPLAIN' ? 'EXPLANATION' : kind === 'NO_FIX' ? 'NO_FIX' : 'EDIT_PROPOSAL'
    if (kind !== expectedKind) return failure('INVALID_FIELD', 'kind')
    if (kind === 'NO_FIX') {
      if (!['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'].includes(own(value, 'reason') as string)) return failure('INVALID_FIELD', 'reason')
      return text(own(value, 'advice'), 4096, 'advice') ?? failure('OTHER_VALIDATION_FAILURE')
    }
    if (kind === 'EDIT_PROPOSAL') {
      const edits = own(value, 'edits')
      if (!Array.isArray(edits) || !edits.length) return failure('INVALID_FIELD', 'edits')
      if (edits.length > P.edits) return failure('SIZE_LIMIT_EXCEEDED', 'edits')
      // Match the validator's dense, ordinary-array requirement before iterating.
      if (Object.getPrototypeOf(edits) !== Array.prototype || Reflect.ownKeys(edits).length !== edits.length + 1
        || Array.from({ length: edits.length }, (_, i) => Object.getOwnPropertyDescriptor(edits, String(i)))
          .some(d => !d?.enumerable || !Object.hasOwn(d, 'value'))) return failure('WRONG_SHAPE', 'edits')
      for (const edit of edits) {
        const bad = shape(edit, ['startOffset', 'endOffset', 'expectedOldText', 'replacementText', 'rationale'])
        if (bad) return bad
        if (!smartInteger(edit.startOffset)) return failure('INVALID_RANGE', 'startOffset')
        if (!smartInteger(edit.endOffset) || edit.endOffset < edit.startOffset) return failure('INVALID_RANGE', 'endOffset')
        for (const field of ['expectedOldText', 'replacementText', 'rationale'] as const) {
          const badText = text(edit[field], field === 'rationale' ? 2048 : P.editBytes, field, field !== 'rationale')
          if (badText) return badText
        }
        if (edit.expectedOldText === edit.replacementText) return failure('INVALID_FIELD', 'replacementText')
      }
      const rationale = text(own(value, 'rationale'), 4096, 'rationale')
      if (rationale) return rationale
      const sorted = [...edits].sort((a, b) => a.startOffset - b.startOffset)
      let bytes = 0, lines = 0, covered = 0
      for (let i = 0; i < sorted.length; i++) {
        const x = sorted[i], previous = sorted[i - 1]
        if (!smartBoundary(source, x.startOffset)) return failure('INVALID_RANGE', 'startOffset')
        if (x.endOffset > source.length || !smartBoundary(source, x.endOffset)) return failure('INVALID_RANGE', 'endOffset')
        if (source.slice(x.startOffset, x.endOffset) !== x.expectedOldText) return failure('OLD_TEXT_MISMATCH', 'expectedOldText')
        if (previous && (previous.endOffset > x.startOffset || previous.endOffset === x.startOffset
          && (previous.startOffset === previous.endOffset || x.startOffset === x.endOffset))) return failure('OVERLAPPING_EDITS', 'edits')
        const s: string = x.replacementText
        if (/\r(?!\n)/.test(s) || ((expectedEol ?? (source.includes('\r\n') ? 'CRLF' : 'LF')) === 'LF'
          ? s.includes('\r') : /(?<!\r)\n/.test(s))) return failure('INVALID_EOL', 'replacementText')
        bytes += new TextEncoder().encode(x.expectedOldText + s).length
        lines += (x.expectedOldText ? x.expectedOldText.split('\n').length : 0) + (s ? s.split('\n').length : 0)
        covered += x.endOffset - x.startOffset
      }
      if (bytes > P.editBytes || lines > P.editLines) return failure('SIZE_LIMIT_EXCEEDED', 'edits')
      if (covered === source.length) return failure('FULL_SOURCE_REWRITE', 'edits')
      let candidate = source
      for (const x of sorted.reverse()) candidate = candidate.slice(0, x.startOffset) + x.replacementText + candidate.slice(x.endOffset)
      if (!smartText(candidate, P.sourceBytes, true)) return failure(size(candidate, P.sourceBytes) ? 'SIZE_LIMIT_EXCEEDED' : 'INVALID_FIELD', 'edits')
    }
    if ('evidence' in (value as object)) {
      const refs = own(value, 'evidence')
      if (!Array.isArray(refs) || refs.length > 8 || Object.getPrototypeOf(refs) !== Array.prototype
        || Reflect.ownKeys(refs).length !== refs.length + 1
        || Array.from({ length: refs.length }, (_, i) => Object.getOwnPropertyDescriptor(refs, String(i)))
          .some(d => !d?.enumerable || !Object.hasOwn(d, 'value'))
        || refs.some(x => !smartText(x, 16) || !/^R[1-9][0-9]?$/.test(x) || !evidence.includes(x))) return failure('INVALID_EVIDENCE', 'evidence')
    }
    if (smartBytes(value) > P.resultBytes) return failure('SIZE_LIMIT_EXCEEDED')
    // Non-Fix field failures remain distinguishable without duplicating their validator.
    return failure('OTHER_VALIDATION_FAILURE')
  } catch { return failure('OTHER_VALIDATION_FAILURE') }
}
