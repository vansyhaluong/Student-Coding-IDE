import type { SmartCapture } from './capture'
import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartBoundary, smartFields, smartInteger, smartText } from '../../../../shared/contracts/smart-hints-validation'
import { isHintParserInput } from './hint-context'
import { HINT_APPLY_STAGES, type HintApplyStage, type HintApplyReason } from '../../../../shared/contracts/smart-hints'

export interface HintApplyParserFailure { stage: HintApplyStage; reason: HintApplyReason }
export function isHintApplyParserFailure(v: unknown): v is HintApplyParserFailure {
  return smartFields(v, ['stage', 'reason']) && HINT_APPLY_STAGES.includes(v.stage as HintApplyStage)
    && ['TARGET_INVALID', 'CANDIDATE_INVALID', 'UNSUPPORTED'].includes(v.reason as string)
}
export class HintApplyParserError extends Error {
  constructor(readonly failure: HintApplyParserFailure) { super('Hint Apply parser rejected preparation.') }
}

/** Private parse-only protocol. Offsets are requests, parser output establishes authority. */
export interface HintApplyParserInput {
  hintApply: true; source: string; starter: string; code: string
  signature: SmartCapture['signature']; implementation: 'NO_IMPLEMENTATION' | 'HAS_IMPLEMENTATION'
  selection: { start: number; end: number } | null
}
export interface HintApplyParserEdit { start: number; end: number; replacementText: string }
export function isHintApplyParserInput(v: unknown): v is HintApplyParserInput {
  if (!smartFields(v, ['hintApply', 'source', 'starter', 'code', 'signature', 'implementation', 'selection']) || v.hintApply !== true
    || !isHintParserInput({ hint: 'CLASSIFY', source: v.source, starter: v.starter, signature: v.signature })
    || !smartText(v.code, 8192) || !['NO_IMPLEMENTATION', 'HAS_IMPLEMENTATION'].includes(v.implementation as string)) return false
  const s = v.selection
  return s === null || smartFields(s, ['start', 'end']) && smartInteger(s.start) && smartInteger(s.end)
    && s.end >= s.start && s.end <= (v.source as string).length && smartBoundary(v.source as string, s.start) && smartBoundary(v.source as string, s.end)
}
export function isHintApplyParserEdit(input: HintApplyParserInput, v: unknown): v is HintApplyParserEdit {
  return smartFields(v, ['start', 'end', 'replacementText']) && smartInteger(v.start) && smartInteger(v.end)
    && v.end >= v.start && v.end <= input.source.length && !(v.start === 0 && v.end === input.source.length)
    && smartBoundary(input.source, v.start) && smartBoundary(input.source, v.end) && smartText(v.replacementText, P.editBytes)
}
