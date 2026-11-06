import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartBytes, smartFields, smartText } from '../../../../shared/contracts/smart-hints-validation'
import { smartBoundary, smartInteger, smartPosition, isSmartBinding } from '../../../../shared/contracts/smart-hints-validation'
import type { SmartOutput } from '../../../../shared/contracts/smart-hints'
import { bindSmartAction, type SmartCapture } from './capture'
import { sourceFingerprint } from './public-run-receipt'
import { SelectionFixError } from './selection-fix-diagnostics'

/** Main-private replacement wire, validated by Gemini. Canonical construction is a separate gate. */
export type SelectionFixWire =
  | { kind: 'EDIT_PROPOSAL'; replacementText: string; rationale: string; evidence: string[] }
  | { kind: 'NO_FIX'; reason: 'INSUFFICIENT_CONTEXT' | 'LOCATION_UNKNOWN' | 'NO_FOCUSED_CHANGE'; advice: string }

export function isSelectionFixWire(value: unknown, allowedEvidence: readonly string[]): value is SelectionFixWire {
  if (smartFields(value, ['kind', 'replacementText', 'rationale', 'evidence'])) {
    const e = value.evidence
    return value.kind === 'EDIT_PROPOSAL' && smartText(value.replacementText, P.editBytes, true)
      && smartText(value.rationale, 2048) && Array.isArray(e) && Object.getPrototypeOf(e) === Array.prototype
      && e.length <= 8 && Reflect.ownKeys(e).length === e.length + 1
      && Array.from({ length: e.length }, (_, i) => Object.getOwnPropertyDescriptor(e, String(i)))
        .every(d => !!d && d.enumerable === true && Object.hasOwn(d, 'value')
          && typeof d.value === 'string' && /^R[1-9][0-9]?$/.test(d.value) && allowedEvidence.includes(d.value))
      && smartBytes(value) <= P.resultBytes
  }
  return smartFields(value, ['kind', 'reason', 'advice']) && value.kind === 'NO_FIX'
    && ['INSUFFICIENT_CONTEXT', 'LOCATION_UNKNOWN', 'NO_FOCUSED_CHANGE'].includes(value.reason as string)
    && smartText(value.advice, 4096) && smartBytes(value) <= P.resultBytes
}

/** Assert the original target, never search for matching text or rebase it. */
export function assertSelectionFixBinding(c: SmartCapture): void {
  const bad = () => { throw new SelectionFixError('INVALID_INPUT', 'BINDING', 'BINDING_MISMATCH') }
  if (c.action.kind !== 'SUGGEST_FIX' || c.binding.action.kind !== 'SUGGEST_FIX' || c.binding.origin.kind !== 'PRACTICE'
    || !isSmartBinding(c.binding) || !smartText(c.source, P.sourceBytes) || c.binding.fingerprint !== sourceFingerprint(c.source)
    || c.binding.sourceBytes !== Buffer.byteLength(c.source) || !c.signatureIdentity
    || !smartInteger(c.signatureIdentity.version, 1) || !/^[a-f0-9]{64}$/.test(c.signatureIdentity.hash)) return bad()
  const s = c.action.selection
  if (!s || !smartInteger(s.startOffset) || !smartInteger(s.endOffset) || s.endOffset <= s.startOffset || s.endOffset > c.source.length
    || s.startOffset === 0 && s.endOffset === c.source.length || !smartText(s.text, P.selectionBytes)
    || !smartBoundary(c.source, s.startOffset) || !smartBoundary(c.source, s.endOffset)
    || c.source.slice(s.startOffset, s.endOffset) !== s.text
    || JSON.stringify(bindSmartAction(c.action)) !== JSON.stringify(c.binding.action)) return bad()
  const a = smartPosition(c.source, s.startOffset), b = smartPosition(c.source, s.endOffset)
  if (a.line !== s.startLine || a.column !== s.startColumn || b.line !== s.endLine || b.column !== s.endColumn
    || /\r(?!\n)/.test(c.source) || (c.binding.origin.eol === 'LF' ? c.source.includes('\r') : /(?<!\r)\n/.test(c.source))) bad()
}

/** G0-C1: one deterministic canonical edit; SH-1 and the parser run downstream unchanged. */
export function constructSelectionFix(c: SmartCapture, value: unknown): SmartOutput {
  try { assertSelectionFixBinding(c) } catch { throw new SelectionFixError('PROVIDER', 'CONSTRUCTION', 'BINDING_MISMATCH') }
  const ids = c.runContext.kind === 'RUN_PUBLIC' ? c.runContext.observations.map(o => o.evidenceId) : []
  if (!isSelectionFixWire(value, ids)) throw new SelectionFixError('INVALID_RESPONSE', 'WIRE', 'INVALID_WIRE')
  if (value.kind === 'NO_FIX') return structuredClone(value)
  if (c.action.kind !== 'SUGGEST_FIX') throw new SelectionFixError('PROVIDER', 'CONSTRUCTION', 'BINDING_MISMATCH')
  const { startOffset, endOffset } = c.action.selection
  return { kind: 'EDIT_PROPOSAL', edits: [{ startOffset, endOffset, expectedOldText: c.source.slice(startOffset, endOffset),
    replacementText: value.replacementText, rationale: value.rationale }], rationale: value.rationale, evidence: [...value.evidence] }
}
