import { SmartProviderError } from './adapter'

export const SELECTION_FIX_STAGES = ['WIRE', 'BINDING', 'CONSTRUCTION', 'SH1', 'PREFLIGHT', 'POSTFLIGHT', 'GUARD_RUNTIME'] as const
export const SELECTION_FIX_REASONS = ['INVALID_WIRE', 'BINDING_MISMATCH', 'SH1_REJECTED', 'SYNTAX', 'SIGNATURE',
  'TARGET', 'WHOLE_FILE', 'STRUCTURE', 'UNSUPPORTED_GRAMMAR', 'UNAVAILABLE', 'ASSET_CHANGED', 'CRASH',
  'TIMEOUT', 'CANCELLED', 'INVALID_PROTOCOL', 'CLEANUP_FAILED'] as const
export interface SelectionFixDiagnostic {
  stage: typeof SELECTION_FIX_STAGES[number]
  reason: typeof SELECTION_FIX_REASONS[number]
}
export function projectSelectionFixDiagnostic(value: unknown): SelectionFixDiagnostic | undefined {
  if (!value || typeof value !== 'object') return undefined
  const stage = Object.getOwnPropertyDescriptor(value, 'stage'), reason = Object.getOwnPropertyDescriptor(value, 'reason')
  if (!stage || !reason || !Object.hasOwn(stage, 'value') || !Object.hasOwn(reason, 'value')
    || !SELECTION_FIX_STAGES.includes(stage.value) || !SELECTION_FIX_REASONS.includes(reason.value)) return undefined
  return { stage: stage.value, reason: reason.value }
}
/** Fixed private enums only. Never retain parser output, paths or exception messages. */
export class SelectionFixError extends SmartProviderError {
  readonly selectionFix: Readonly<SelectionFixDiagnostic>
  constructor(code: 'INVALID_INPUT' | 'INVALID_RESPONSE' | 'PROVIDER' | 'TIMEOUT', stage: SelectionFixDiagnostic['stage'], reason: SelectionFixDiagnostic['reason']) {
    super(code, undefined, undefined, code === 'PROVIDER' ? 'UNEXPECTED_ERROR' : undefined)
    this.selectionFix = Object.freeze({ stage, reason })
  }
}
