import type { editor, Selection } from 'monaco-editor'
import type { SmartStatus, SmartBinding, SmartOutput, HintApplyProposal } from '../../../../../shared/contracts/smart-hints'
import { smartCandidate, isHintApplyProposal } from '../../../../../shared/contracts/smart-hints-validation'
import type { AppResult } from '../../../../../shared/contracts/app-error'

/** Local, single-use authority minted only from a verified COMPLETE operation. */
export interface SmartFix {
  readonly result: Extract<SmartStatus, { state: 'COMPLETE' }>
  readonly source: string
  readonly candidate: string
  isCurrent(): boolean
  consume(): boolean
}
export interface HintSmartFix extends Omit<SmartFix, 'result'> {
  readonly kind: 'HINT_APPLY'; readonly result: HintApplyProposal
  authorize(): Promise<boolean>
}
export type ReviewFix = SmartFix | HintSmartFix
const armedHintFixes = new WeakSet<HintSmartFix>()
/** Only a matching Main consume ACK arms a Hint transaction; a card never does. */
export function createHintSmartFix(proposal: HintApplyProposal, source: string, current: () => boolean,
  consume: () => Promise<AppResult<HintApplyProposal>>): HintSmartFix | undefined {
  if (!isHintApplyProposal(proposal) || proposal.binding.origin.kind !== 'PRACTICE') return
  const result = structuredClone(proposal), candidate = smartCandidate(source, result.output.edits, proposal.binding.origin.eol)
  if (candidate === undefined) return
  const freeze = (value: object) => { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v) }); Object.freeze(value) }
  freeze(result)
  let used = false, attempted = false
  const isCurrent = () => !used && current() && result.expiresAt > Date.now()
  const fix: HintSmartFix = Object.freeze({ kind: 'HINT_APPLY', result, source, candidate, isCurrent,
    authorize: async () => {
      if (attempted || !isCurrent()) return false
      attempted = true
      try {
        const reply = await consume()
        if (!reply.ok || !isCurrent() || !isHintApplyProposal(reply.value) || JSON.stringify(reply.value) !== JSON.stringify(result)) return false
        armedHintFixes.add(fix); return true
      } catch { return false }
    },
    consume: () => { if (!armedHintFixes.has(fix) || !isCurrent()) return false; armedHintFixes.delete(fix); used = true; return true },
  })
  return fix
}
export type ApplyFixResult = 'APPLIED' | 'STALE' | 'TRANSACTION_FAILED'

/** Extra selection invariant; SH-1 and the existing transaction remain authoritative. */
export function isCanonicalSelectionFix(source: string, binding: SmartBinding, output: SmartOutput): boolean {
  if (binding.action.kind !== 'SUGGEST_FIX' || output.kind !== 'EDIT_PROPOSAL' || output.edits.length !== 1) return false
  const target = binding.action.selection, edit = output.edits[0]
  return edit.startOffset === target.startOffset && edit.endOffset === target.endOffset
    && edit.expectedOldText === source.slice(target.startOffset, target.endOffset)
}

export function applySmartFix(ed: editor.IStandaloneCodeEditor, fix: ReviewFix,
  current: { exerciseId: string; language: string; sourceRevision: number; source: string; modelId: string; blocked: boolean },
  selection: (sl: number, sc: number, el: number, ec: number) => Selection): ApplyFixResult {
  const model = ed.getModel(), { binding, output } = fix.result, origin = binding.origin
  const hint = 'kind' in fix && fix.kind === 'HINT_APPLY'
  if (current.blocked || !model || model.isDisposed() || !fix.isCurrent() || fix.result.expiresAt <= Date.now()
    || origin.kind !== 'PRACTICE' || output.kind !== 'EDIT_PROPOSAL' || !fix.result.proposalId
    || binding.exerciseId !== current.exerciseId || binding.language !== current.language
    || (hint ? !armedHintFixes.has(fix) || !isHintApplyProposal(fix.result) || binding.action.kind !== 'HINT'
      : !isCanonicalSelectionFix(fix.source, binding, output))
    || binding.sourceRevision !== current.sourceRevision || current.source !== fix.source || model.getValue() !== fix.source
    || origin.modelId !== current.modelId || origin.modelVersion !== model.getVersionId()
    || model.uri.scheme !== 'practice' || model.uri.path !== `/${current.exerciseId}/solution.${current.language === 'csharp' ? 'cs' : 'js'}`
    || model.getEOL() !== (origin.eol === 'CRLF' ? '\r\n' : '\n')
    || smartCandidate(fix.source, output.edits, origin.eol) !== fix.candidate) return 'STALE'
  const sorted = [...output.edits].sort((a, b) => a.startOffset - b.startOffset)
  const map = (offset: number) => {
    let delta = 0
    for (const x of sorted) {
      if (offset < x.startOffset) break
      if (offset <= x.endOffset) return x.startOffset + delta + (offset === x.endOffset && x.endOffset > x.startOffset
        ? x.replacementText.length : Math.min(offset - x.startOffset, x.replacementText.length))
      delta += x.replacementText.length - (x.endOffset - x.startOffset)
    }
    return offset + delta
  }
  const cursors = (ed.getSelections() ?? []).map(s => ({
    anchor: map(model.getOffsetAt({ lineNumber: s.selectionStartLineNumber, column: s.selectionStartColumn })),
    active: map(model.getOffsetAt({ lineNumber: s.positionLineNumber, column: s.positionColumn })),
  }))
  const scroll = { scrollTop: ed.getScrollTop(), scrollLeft: ed.getScrollLeft() }
  const edits = sorted.map(x => {
    const a = model.getPositionAt(x.startOffset), b = model.getPositionAt(x.endOffset)
    return { range: { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }, text: x.replacementText, forceMoveMarkers: true }
  })
  // No await or event-loop yield between final ownership check and the one batch.
  if (!fix.consume()) return 'STALE'
  ed.pushUndoStop()
  let applied: boolean
  try {
    applied = ed.executeEdits('learning.smartHints.apply', edits, () => cursors.map(s => {
      const a = model.getPositionAt(s.anchor), b = model.getPositionAt(s.active)
      return selection(a.lineNumber, a.column, b.lineNumber, b.column)
    }))
  } finally { ed.pushUndoStop(); ed.setScrollPosition(scroll); ed.focus() }
  return applied && model.getValue() === fix.candidate ? 'APPLIED' : 'TRANSACTION_FAILED'
}
