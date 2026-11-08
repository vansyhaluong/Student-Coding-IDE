import { useEffect, useId, useRef } from 'react'
import { AssistantCodeBlock } from '../AssistantCodeBlock'
import { AssistantMarkdown } from '../AssistantMarkdown'
import { Sparkles, X } from 'lucide-react'
import type { SmartAction, SmartOutput, SmartRunContext, SmartStatus } from '../../../../../shared/contracts/smart-hints'
import { geminiActionTimeoutMs } from '../../../../../shared/contracts/smart-hints'
import { smartPosition } from '../../../../../shared/contracts/smart-hints-validation'
import type { useSmartHints } from './use-smart-hints'
import type { PracticeFixReadiness } from './smart-hints-selection'
import type { HintCodeActions } from './use-hint-apply'

type Controller = ReturnType<typeof useSmartHints>
const actionLabel = (a: SmartAction | SmartStatus['binding']['action']) => a.kind === 'HINT' ? 'Hint'
  : a.kind === 'ANALYZE' ? 'Phân tích Code & Run' : a.kind === 'EXPLAIN' ? 'Explain Selected Code' : 'Suggest Fix'
export function RunEvidence({ context }: { context: SmartRunContext }) {
  if (context.kind === 'CODE_ONLY') return <p className="smart-hints-muted">Chưa có Run public phù hợp với snapshot này. Phân tích chỉ dựa trên code và đề bài công khai.</p>
  const failure = { COMPILE_ERROR: 'Compile Error', SYNTAX_ERROR: 'Syntax Error', RUNTIME_ERROR: 'Runtime Error' }
  return <section aria-label="Bằng chứng Run public" className="smart-hints-evidence"><h3>Quan sát từ Run public</h3>
    <p>Chỉ các sample công khai; đây không phải verdict của Submit.</p>
    {context.failure && <p>Run xác nhận: <strong>{failure[context.failure]}</strong></p>}
    {context.locations.map((l, i) => <p key={i}>Vị trí diagnostic công khai: dòng {l.line}, cột {l.column}.</p>)}
    {context.observations.map(o => <details key={o.evidenceId}><summary>Public sample {o.sampleOrdinal} · {JSON.stringify(o.actual) === JSON.stringify(o.expected) ? 'Khớp' : 'Không khớp'}</summary>
      <dl><dt>Input</dt><dd><pre>{JSON.stringify(o.input)}</pre></dd><dt>Your Output</dt><dd><pre>{JSON.stringify(o.actual)}</pre></dd>
        <dt>Expected Output</dt><dd><pre>{JSON.stringify(o.expected)}</pre></dd></dl>
    </details>)}
  </section>
}
export function Advisory({ output, source, markdown = false, hintApply }: { output: SmartOutput; source?: string; markdown?: boolean; hintApply?: HintCodeActions }) {
  const paragraph = (text: string) => markdown ? <AssistantMarkdown>{text}</AssistantMarkdown> : <p>{text}</p>
  if (output.kind === 'HINT') return <section aria-label="Hint">
    <section><h3>Gợi ý tư duy</h3>{paragraph(output.thinking)}</section>
    <section><h3>Hướng dẫn thực hiện</h3><ol>{output.steps.map((step, i) => <li key={i}>{markdown ? <AssistantMarkdown>{step}</AssistantMarkdown> : step}</li>)}</ol></section>
    <section><h3>Gợi ý code</h3><AssistantCodeBlock text={output.code.text} language={output.code.language} hintActions hintApply={hintApply} /></section>
  </section>
  if (output.kind === 'ANALYSIS') return <section><h3>Nhận định của AI</h3><p>Các nhận định logic cần được bạn kiểm chứng.</p>
    {output.hypotheses.map((p, i) => <div key={i}>{paragraph(p)}</div>)}<h3>Gợi ý kiểm tra</h3><ul>{output.suggestions.map((s, i) => <li key={i}>{markdown ? <AssistantMarkdown>{s}</AssistantMarkdown> : s}</li>)}</ul></section>
  if (output.kind === 'EXPLANATION') return <section aria-label="Giải thích code">
    {([['Cú pháp', output.syntax], ['Vai trò biến', output.variables], ['Luồng điều khiển', output.controlFlow], ['Ý nghĩa thuật toán', output.algorithm]]).map(([title, text]) => <div key={title}><h3>{title}</h3>{paragraph(text)}</div>)}
    {!!output.illustrativeExamples.length && <><h3>Ví dụ minh họa của AI</h3>{output.illustrativeExamples.map((p, i) => <pre key={i}>{p}</pre>)}</>}
  </section>
  if (output.kind === 'NO_FIX') return <section><h3>Chưa có bản sửa phù hợp</h3><p>{output.reason === 'LOCATION_UNKNOWN' ? 'AI chưa xác định được vị trí lỗi.' : 'Chưa đủ bằng chứng để đề xuất thay đổi tập trung.'}</p><p>{output.advice}</p></section>
  return <section aria-label="Đề xuất sửa code"><h3>Đề xuất của AI</h3>{paragraph(output.rationale)}
    <p>Đây là vùng nghi ngờ; bản sửa chưa được Run xác nhận.</p>
    {output.edits.map((edit, i) => {
      const a = source === undefined ? undefined : smartPosition(source, edit.startOffset), b = source === undefined ? undefined : smartPosition(source, edit.endOffset)
      return <section className="smart-hints-edit" key={i}><h4>Vùng {i + 1}{a && b ? ` · dòng ${a.line}:${a.column} → ${b.line}:${b.column}` : ''}</h4>
        <p>{edit.rationale}</p><h4>Code cũ</h4><pre>{edit.expectedOldText || '(vị trí chèn)'}</pre><h4>Code đề xuất</h4><pre>{edit.replacementText || '(xóa đoạn code)'}</pre></section>
    })}<p className="smart-hints-muted">Đề xuất chỉ để đọc và tự kiểm chứng.</p></section>
}
export function SmartHintsConsent({ prepared, openrouter, gemini, onConfirm, onCancel }: { prepared: Extract<SmartStatus, { state: 'PREPARED' }>; openrouter: boolean; gemini: boolean; onConfirm(): void; onCancel(): void }) {
  const ref = useRef<HTMLDialogElement>(null), title = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, dialog = ref.current
    if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', '')
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { dialog?.close?.(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={ref} className="smart-hints-consent" aria-labelledby={title} aria-modal="true" onCancel={event => { event.preventDefault(); onCancel() }}>
    <h2 id={title}>Cho phép gửi snapshot này?</h2><p>{actionLabel(prepared.binding.action)} · {prepared.binding.language === 'csharp' ? 'C#' : 'JavaScript'}
      {prepared.binding.origin.kind === 'SOLUTION' ? ' · Solution, chỉ đọc' : ' · Practice'}</p>
    <p>Source ({prepared.binding.sourceBytes} bytes), đề bài, constraints và signature công khai sẽ được gửi tới {gemini ? 'Google Gemini API' : openrouter ? 'OpenRouter và nhà cung cấp mô hình miễn phí được chọn' : 'DeepSeek'} cho yêu cầu này.</p>
    {prepared.binding.action.kind === 'SUGGEST_FIX' && <p>Gemini nhận toàn bộ source và vùng chọn: dòng {prepared.binding.action.selection.startLine}:{prepared.binding.action.selection.startColumn} → {prepared.binding.action.selection.endLine}:{prepared.binding.action.selection.endColumn}. Chỉ vùng chọn đã xác nhận được đề xuất sửa; chưa Apply code.</p>}
    {gemini && <><p>Google Gemini · gemini-3.1-flash-lite. Có kèm đoạn chọn khi Explain/Suggest Fix. Không gửi lại Hint trước. Chỉ gửi code bạn có quyền chia sẻ, không chứa secrets.</p><p>Ứng dụng không xác minh Free Tier hoặc billing. Có thể phát sinh phí và giới hạn theo project; nội dung có thể được Google xử lý/lưu theo chính sách tài khoản của bạn. Không tự retry hoặc chuyển mô hình. AI không thay thế việc tự kiểm chứng.</p></>}
    {gemini && <p>Thời gian xử lý tối đa {geminiActionTimeoutMs(prepared.binding.action.kind) / 1000} giây cho yêu cầu này; bạn có thể hủy khi đang chờ.</p>}
    {openrouter && <><p>Có kèm đoạn chọn khi Explain. Không gửi lại Hint trước. Chỉ gửi code bạn có quyền chia sẻ, không chứa secrets.</p>
      <p>openrouter/free chỉ định tuyến mô hình miễn phí, phụ thuộc hạn mức và khả dụng; không tự retry. Chính sách lưu và sử dụng dữ liệu của OpenRouter và nhà cung cấp được chọn có thể khác nhau. AI không thay thế việc tự kiểm chứng.</p></>}
    <p>{prepared.runContextKind === 'RUN_PUBLIC' ? 'Có kèm bằng chứng Run public đã được xác minh cho cùng snapshot.' : 'Không kèm kết quả Run khác snapshot.'}</p>
    <p>Không gửi hidden tests. AI có thể nhận định sai; hãy kiểm chứng nội dung trả về.</p>
    <div className="smart-hints-actions"><button type="button" onClick={onCancel}>Hủy</button><button type="button" onClick={onConfirm}>Đồng ý gửi snapshot</button></div>
  </dialog>
}
export function SmartHintsPanel({ hints, onAction, onExplain, onClose, notice, id, onPreview, selectionFixReadiness }: { hints: Controller; onAction(action: 'HINT' | 'ANALYZE' | 'SUGGEST_FIX'): void; onExplain(): void; onClose(): void; notice?: string; id?: string; onPreview?(): void; selectionFixReadiness?: PracticeFixReadiness }) {
  const title = useId(), { view, capabilities } = hints
  const enabled = capabilities?.enabled === true, result = view.result
  const fixEnabled = enabled && capabilities?.suggestFixMode === 'SELECTION_V1'
    && capabilities.suggestFixLanguages.includes(hints.language)
  const range = hints.frozenSelection ?? (selectionFixReadiness?.state === 'READY' ? selectionFixReadiness.range : undefined)
  return <aside id={id} className="smart-hints-drawer" aria-labelledby={title} onKeyDown={event => {
    if (event.key === 'Escape' && view.phase !== 'consent') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <header><div><h2 id={title}><Sparkles aria-hidden="true" />Smart Hints</h2><p>Gợi ý theo code bạn đang làm</p></div>
      <button type="button" className="practice-icon-button" aria-label="Đóng Smart Hints" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="smart-hints-body" aria-busy={['preparing', 'starting', 'running'].includes(view.phase)}>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{view.phase === 'result' ? 'Đã có kết quả AI cho snapshot đã xác nhận.' : ''}</span>
      {capabilities?.providerMode === 'FAKE' && <p className="smart-hints-muted">Chế độ kiểm thử · provider giả</p>}
      {capabilities?.providerMode === 'GEMINI_FREE' && <p className="smart-hints-muted">Google Gemini · gemini-3.1-flash-lite</p>}
      {capabilities?.providerMode === 'OPENROUTER_FREE' && <p className="smart-hints-muted">Development/test · OpenRouter · openrouter/free</p>}
      {!enabled && <p role="status">{hints.checking ? 'Đang kiểm tra AI…' : 'AI chưa được cấu hình hoặc chưa sẵn sàng. Chưa gửi source.'}</p>}
      {!enabled && !hints.checking && <p className="smart-hints-muted">Mở Settings → AI Smart Hints để bật tính năng, cấu hình API Key hoặc kiểm tra hạn mức/kết nối.</p>}
      {!enabled && !hints.checking && <button type="button" onClick={hints.show}>Kiểm tra khả dụng</button>}
      <div className="smart-hints-actions"><button type="button" disabled={!enabled || hints.busy} onClick={() => onAction('HINT')}>Hint</button>
        <button type="button" disabled={!enabled || hints.busy} onClick={() => onAction('ANALYZE')}>Analyze Code & Run</button>
        <button type="button" disabled={!enabled || hints.busy} onClick={onExplain}>Explain Selected Code (Practice)</button>
        <button type="button" disabled={!fixEnabled || hints.busy || selectionFixReadiness?.state !== 'READY'} onClick={() => onAction('SUGGEST_FIX')}>Suggest Fix</button></div>
      <p className="smart-hints-muted" aria-label="Chuẩn bị vùng chọn Suggest Fix">
        {!fixEnabled && 'Sửa theo vùng chọn chưa bật cho ngôn ngữ này. '}{range
          ? `Vùng chọn${hints.frozenSelection ? ' đã chụp' : ''}: dòng ${range.startLine}:${range.startColumn} → ${range.endLine}:${range.endColumn}.`
          : 'Bôi đen đoạn code cần sửa trước khi sử dụng Suggest Fix.'}
        {fixEnabled && ' Chọn một biểu thức, các câu lệnh trong cùng hàm hoặc toàn bộ hàm; không chọn toàn bộ file.'}
      </p>
      {['preparing', 'starting', 'running'].includes(view.phase) && <p role="status">{view.phase === 'preparing' ? 'Đang chụp và xác minh snapshot…' : 'Đang chờ AI cho snapshot đã xác nhận…'}</p>}
      {view.message && <p role={view.phase === 'error' ? 'alert' : 'status'}>{view.message}</p>}
      {notice && <p role="status">{notice}</p>}
      {hints.busy && <button type="button" onClick={hints.cancel}>Hủy yêu cầu AI</button>}
      {view.canCheck && <button type="button" onClick={hints.check}>Kiểm tra trạng thái AI</button>}
      {hints.canRetry && <button type="button" onClick={hints.retry}>Thử lại yêu cầu AI</button>}
      {view.hints.filter(h => h !== result).map(h => <Advisory key={h.operationId} output={h.output} />)}
      {result && <><p className="smart-hints-snapshot">Snapshot đã xác nhận · {result.binding.language === 'csharp' ? 'C#' : 'JavaScript'}
        {result.binding.origin.kind === 'SOLUTION' ? ' · Solution, chỉ đọc' : ' · Practice'}</p>
        {(result.binding.action.kind === 'EXPLAIN' || result.binding.action.kind === 'SUGGEST_FIX') && <p>Đoạn đã chọn: dòng {result.binding.action.selection.startLine}–{result.binding.action.selection.endLine} trong snapshot.</p>}
        {result.binding.origin.kind === 'PRACTICE' && <RunEvidence context={result.runContext} />}<Advisory output={result.output} source={hints.capturedSource} />
        {result.output.kind === 'EDIT_PROPOSAL' && result.binding.origin.kind === 'PRACTICE' && onPreview && <button type="button" onClick={onPreview}>Diff Preview</button>}</>}
    </div>
    {view.phase === 'consent' && view.prepared && <SmartHintsConsent prepared={view.prepared} openrouter={capabilities?.providerMode === 'OPENROUTER_FREE'} gemini={capabilities?.providerMode === 'GEMINI_FREE'} onConfirm={() => { void hints.consent() }} onCancel={hints.cancel} />}
  </aside>
}
