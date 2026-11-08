import type { SmartCapture } from './capture'
import { smartFields, smartText } from '../../../../shared/contracts/smart-hints-validation'
import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'

/** Main-private pedagogical context. It never grants editor or execution authority. */
export const HINT_IMPLEMENTATION_STATES = ['NO_IMPLEMENTATION', 'HAS_IMPLEMENTATION', 'UNCERTAIN'] as const
export type HintImplementationState = typeof HINT_IMPLEMENTATION_STATES[number]
export interface HintParserInput {
  hint: 'CLASSIFY' | 'VALIDATE'
  source: string
  starter: string
  signature: SmartCapture['signature']
}
export const HINT_PARSER_RESULTS = [...HINT_IMPLEMENTATION_STATES, 'VALID_HINT_CODE', 'INVALID_HINT_CODE'] as const
export type HintParserResult = typeof HINT_PARSER_RESULTS[number]
export function isHintParserInput(v: unknown): v is HintParserInput {
  if (!smartFields(v, ['hint', 'source', 'starter', 'signature']) || !['CLASSIFY', 'VALIDATE'].includes(v.hint as string)
    || !smartText(v.source, P.sourceBytes, true) || !smartText(v.starter, 65536)) return false
  const s = v.signature
  return smartFields(s, ['functionName', 'parameters', 'returnType']) && smartText(s.functionName, 128)
    && smartText(s.returnType, 128) && Array.isArray(s.parameters) && s.parameters.length <= 16
    && s.parameters.every(p => smartFields(p, ['name', 'type']) && smartText(p.name, 128) && smartText(p.type, 128))
}
export const hintCodePolicy = (state: HintImplementationState = 'UNCERTAIN'): string => state === 'NO_IMPLEMENTATION'
  ? 'NO_IMPLEMENTATION: the trusted starter contains scaffolding, not student work. Give the complete required function with its exact declaration, parameter names/order/types and return type. Preserve the required class identity for C#; a method declaration alone is allowed. Do not return only a body fragment.'
  : state === 'HAS_IMPLEMENTATION'
    ? 'HAS_IMPLEMENTATION: acknowledge the observed student logic and preserve its approach. Give only the relevant next/additional/corrected code fragment, not a whole-function rewrite. Explain where it belongs. If the code appears complete, suggest edge-case checks or a justified small improvement; do not invent a defect or unnecessary change.'
    : 'UNCERTAIN: template, syntax or structure is insufficient to classify progress safely. Describe only observed code, acknowledge uncertainty and give a narrowly relevant illustrative fragment with its location. Do not claim the student has finished, has not started, or has a defect without evidence. Do not replace the whole function based on a guess.'
