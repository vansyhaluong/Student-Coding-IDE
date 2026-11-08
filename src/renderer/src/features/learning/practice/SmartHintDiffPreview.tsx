import { useEffect, useId, useRef, useState } from 'react'
import { monaco } from '../../editor/monaco'
import type { ReviewFix, ApplyFixResult } from './smart-hint-edits'

export function SmartHintDiffPreview({ fix, blocked, onApply, onDiscard, onApplied, onReturnFocus }: {
  fix: ReviewFix; blocked: boolean; onApply(): ApplyFixResult | Promise<ApplyFixResult>; onDiscard(): void; onApplied?(): void; onReturnFocus(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null), host = useRef<HTMLDivElement>(null), title = useId()
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const applying = useRef(false), alive = useRef(true)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    alive.current = true
    dialog.current?.showModal()
    dialog.current?.querySelector('button')?.focus()
    const namespace = `smart-hint-preview:///${crypto.randomUUID()}`
    const language = fix.result.binding.language
    const original = monaco.editor.createModel(fix.source, language, monaco.Uri.parse(`${namespace}/original`))
    const modified = monaco.editor.createModel(fix.candidate, language, monaco.Uri.parse(`${namespace}/modified`))
    let sideBySide = host.current!.clientWidth >= 900
    const diff = monaco.editor.createDiffEditor(host.current!, { readOnly: true, originalEditable: false,
      automaticLayout: false, renderSideBySide: sideBySide, minimap: { enabled: false },
      scrollBeyondLastLine: false, domReadOnly: true, accessibilitySupport: 'on' })
    const updated = diff.onDidUpdateDiff(() => { if (diff.getLineChanges() !== null) setReady(true) })
    diff.setModel({ original, modified })
    let disposed = false, frame: number | undefined
    // Changing diff mode affects modal scrollbars/width. Write outside the RO
    // delivery phase so it cannot resize another observed target in that batch.
    const resize = new ResizeObserver(() => {
      if (frame !== undefined || disposed) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (disposed || !host.current?.isConnected) return
        const width = host.current.clientWidth, height = host.current.clientHeight
        const next = width >= 900
        if (next !== sideBySide) { sideBySide = next; diff.updateOptions({ renderSideBySide: next }) }
        diff.layout({ width, height })
      })
    })
    resize.observe(host.current!)
    return () => {
      alive.current = false
      disposed = true; resize.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame)
      updated.dispose(); diff.setModel(null); diff.dispose(); original.dispose(); modified.dispose(); onReturnFocus()
    }
  }, [fix])
  return <dialog ref={dialog} className="smart-hint-diff" aria-labelledby={title} onCancel={e => { e.preventDefault(); onDiscard() }}>
    <h2 id={title}>Diff Preview</h2>
    <p>Source gốc → bản sửa AI đề xuất · chỉ đọc. Apply không tự Run hoặc Submit. Dùng Ctrl+Z / Ctrl+Y trong Code Editor để Undo / Redo.</p>
    <div className="smart-hint-diff-editor" ref={host} aria-label="So sánh source gốc và bản sửa AI" />
    <details><summary>Các vùng thay đổi</summary>{fix.result.output.kind === 'EDIT_PROPOSAL' && fix.result.output.edits.map((x, i) =>
      <section key={i}><p>{x.rationale}</p><pre aria-label={`Code cũ ${i + 1}`}>{x.expectedOldText || '(chèn)'}</pre><pre aria-label={`Code mới ${i + 1}`}>{x.replacementText || '(xóa)'}</pre></section>)}</details>
    {error && <p role="alert">{error}</p>}
    <div className="smart-hints-actions"><button type="button" onClick={onDiscard}>Discard</button>
      <button type="button" disabled={!ready || blocked || pending || !!error || !fix.isCurrent()} onClick={async () => {
        if (applying.current) return
        applying.current = true; setPending(true)
        let result: ApplyFixResult
        try { const reply = onApply(); result = typeof reply === 'string' ? reply : await reply } catch { result = 'STALE' }
        if (!alive.current) return
        if (result === 'APPLIED') onApplied?.()
        else setError(result === 'STALE' ? 'Source hoặc ngữ cảnh đã thay đổi. Hãy yêu cầu lại.' : 'Không xác nhận được transaction. Apply đã khóa; giữ code hiện tại và kiểm tra Draft.')
      }}>Apply Fix</button></div>
  </dialog>
}
