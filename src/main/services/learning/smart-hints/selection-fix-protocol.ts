import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartBoundary, smartFields, smartInteger, smartText } from '../../../../shared/contracts/smart-hints-validation'

export const FIX_PARSER_PROTOCOL = 1
export const FIX_PARSER_TYPESCRIPT = '6.0.3'
export const FIX_PARSER_SDK = '10.0.112'
export const FIX_PARSER_RUNTIME = '10.0.12'
export const FIX_PARSER_ROSLYN = '5.0.0.0'
export const FIX_PARSER_REASONS = ['ACCEPT', 'SYNTAX', 'SIGNATURE', 'TARGET', 'WHOLE_FILE', 'STRUCTURE', 'UNSUPPORTED_GRAMMAR', 'INTERNAL'] as const
export type FixParserReason = typeof FIX_PARSER_REASONS[number]
export interface FixParserInput {
  protocol: 1; phase: 'PREFLIGHT' | 'POSTFLIGHT'
  source: string; candidate: string | null; start: number; end: number
  signature: { functionName: string; parameters: { name: string; type: string }[]; returnType: string }
}
const types = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
export function isFixParserInput(v: unknown): v is FixParserInput {
  if (!smartFields(v, ['protocol', 'phase', 'source', 'candidate', 'start', 'end', 'signature']) || v.protocol !== 1
    || !['PREFLIGHT', 'POSTFLIGHT'].includes(v.phase as string) || !smartText(v.source, P.sourceBytes)
    || !smartInteger(v.start) || !smartInteger(v.end) || v.end <= v.start || v.end > v.source.length
    || !smartBoundary(v.source, v.start) || !smartBoundary(v.source, v.end)
    || (v.phase === 'PREFLIGHT' ? v.candidate !== null : !smartText(v.candidate, P.sourceBytes, true))) return false
  const s = v.signature
  return smartFields(s, ['functionName', 'parameters', 'returnType']) && smartText(s.functionName, 128)
    && types.includes(s.returnType as string) && Array.isArray(s.parameters) && s.parameters.length <= 16
    && s.parameters.every(p => smartFields(p, ['name', 'type']) && smartText(p.name, 128) && types.includes(p.type as string))
}
