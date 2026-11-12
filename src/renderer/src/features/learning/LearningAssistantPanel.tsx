import { useEffect, useRef } from 'react'
import { ArrowDown, FileCode2, MessageSquare, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { ChatContextInput, ChatScope } from '../../../../shared/contracts/learning-chat'
import type { SmartSourceSnapshot } from './practice/smart-hints-selection'
import { Message, MessageContent, MessageTyping } from '../../components/ai/message'
import { MessageBubble, MessageBubbleContent } from '../../components/ai/message-bubble'
import { MessageScroller } from '../../components/ai/message-scroller'
import { PromptInput } from '../../components/ai/prompt-input'
import { useLearningAssistant } from './use-learning-assistant'
import { AssistantQuickActions, type AssistantQuickActionsProps } from './AssistantQuickActions'
import { Advisory, RunEvidence, SmartHintsConsent } from './practice/SmartHintsPanel'
import { useAssistantTimeline } from './use-assistant-timeline'
import { AssistantMarkdown } from './AssistantMarkdown'
import './practice/smart-hints.css'
import './learning-assistant.css'

export function LearningAssistantPanel({ context, capture, onClose, quick }: {
  context?: ChatContextInput; capture?: () => SmartSourceSnapshot | undefined; onClose(): void; quick?: AssistantQuickActionsProps
}) {
  const chat = useLearningAssistant(context, capture)
  const panel = useRef<HTMLElement>(null), viewport = useRef<HTMLElement>(null)
  const focused = useRef(false), restoreComposer = useRef(false)
  const rows = useAssistantTimeline(chat, quick?.hints)
  useEffect(() => {
    const lease = quick?.slot.current
    if (lease?.kind === 'CHAT' && !chat.isBusy() || lease?.kind === 'SMART' && !quick?.hints.isBusy()) quick!.slot.current = undefined
  }, [chat.phase, chat.status, chat.session, quick?.hints.view, quick?.slot])
  const send = async () => {
    if (!chat.canSend || quick?.slot.current || quick?.hints.isBusy()) return
    if (viewport.current) { viewport.current.scrollTop = viewport.current.scrollHeight; viewport.current.dispatchEvent(new Event('scroll')) }
    const lease = { kind: 'CHAT' as const, id: Symbol() }
    if (quick) quick.slot.current = lease
    try { await chat.send() } finally { if (quick?.slot.current === lease && !chat.isBusy()) quick.slot.current = undefined }
  }
  const prepared = chat.status?.state === 'PREPARED' && chat.phase === 'Consent' ? chat.status : undefined
  useEffect(() => {
    if (prepared) {
      restoreComposer.current = true
      panel.current?.querySelector<HTMLButtonElement>('.learning-assistant-consent button')?.focus()
    } else if (chat.canSend && (!focused.current || restoreComposer.current)) {
      // A completion must not steal focus if the student has returned to Monaco.
      if (!focused.current || document.activeElement === document.body || panel.current?.contains(document.activeElement))
        panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
      focused.current = true; restoreComposer.current = false
    }
  }, [!!prepared, chat.canSend])
  const busy = chat.busy || !!quick?.hints.busy || !!quick?.hintApply?.busy
  const chatCanCancel = !prepared && chat.busy && !!chat.session
  const cancel = quick?.hints.busy ? quick.hints.cancel : chatCanCancel ? () => { void chat.cancel() } : undefined
  const toEnd = () => {
    const el = viewport.current
    if (el) { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) }
  }
  const scopeName = chat.scope === 'QUESTION_ONLY' ? 'Chỉ câu hỏi' : chat.scope === 'QUESTION_WITH_SELECTION' ? 'Code đã chọn' : 'Toàn bộ source'
  return <aside ref={panel} className="learning-assistant" aria-label="Learning Assistant" onKeyDown={event => {
    if (event.key === 'Escape' && !prepared && quick?.hints.view.phase !== 'consent' && !event.defaultPrevented) { event.preventDefault(); onClose() }
  }}>
    <header className="assistant-header"><div><Sparkles aria-hidden="true" /><h2>AI Learning Assistant</h2></div>
      <div>{quick?.hints.canRevokeConsent && <button type="button" className="assistant-icon-button" aria-label="Thu hồi quyền AI trong phiên học" title="Thu hồi quyền AI trong phiên học" onClick={() => { void quick.hints.revokeConsent() }}><ShieldCheck aria-hidden="true" /></button>}
        <button type="button" className="assistant-icon-button" aria-label="Đóng Learning Assistant" title="Đóng (Esc)" onClick={onClose}><X aria-hidden="true" /></button></div></header>
    <MessageScroller label="Hội thoại" viewportRef={viewport} className="assistant-scroller" viewportClassName="learning-assistant-timeline" smooth={false}
      contentProps={{ 'aria-label': 'Hội thoại' }}>
      {!rows.length && <div className="learning-assistant-empty"><span className="assistant-empty-icon"><Sparkles aria-hidden="true" /></span>
        <h3>Cùng tìm hướng giải.</h3><p>Hỏi về bài học, giải thích code hoặc bắt đầu bằng một gợi ý.</p></div>}
      {rows.map(row => row.kind === 'CHAT' ? <div key={row.id} data-timeline-id={row.id}>
        {chat.session?.messages.filter(m => m.operationId === row.operationId).map(message => <Message key={message.messageId} from={message.role} data-message-id={message.messageId} data-role={message.role}>
          <MessageContent><MessageBubble variant={message.role === 'user' ? 'soft' : 'ghost'}><MessageBubbleContent>
            <strong className="assistant-message-author">{message.role === 'user' ? 'Bạn' : 'Assistant'}</strong>
            {message.role === 'assistant' ? <AssistantMarkdown>{message.text}</AssistantMarkdown> : <p className="assistant-user-text">{message.text}</p>}
          </MessageBubbleContent></MessageBubble>
          <small className="assistant-provenance">{message.provenance.scope === 'QUESTION_ONLY' ? 'Chỉ câu hỏi' : message.provenance.scope === 'QUESTION_WITH_SELECTION' ? 'Code đã chọn' : 'Toàn bộ source'}
            {JSON.stringify(message.provenance.context) !== JSON.stringify(chat.session?.context) ? ' · Ngữ cảnh trước' : ''}</small>
          </MessageContent>
        </Message>)}
        {row.phase !== 'Complete' && !chat.session?.messages.some(m => m.operationId === row.operationId) && <Message from="assistant" data-role="assistant"><MessageContent>
          <strong className="assistant-message-author">Chat</strong><p className="assistant-request-status">{row.phase === 'Loading' && <MessageTyping label="Đang chờ phản hồi" />}Chat · {row.phase}</p>
          {row.error && <p role="alert">{row.error}</p>}
        </MessageContent></Message>}
      </div> : <Message key={row.id} from="assistant" data-timeline-id={row.id} data-operation-id={row.operationId} data-role="assistant">
        <MessageContent><div className={row.result?.output.kind === 'EDIT_PROPOSAL' ? 'assistant-proposal' : 'assistant-advisory'}>
          <div className="assistant-card-heading"><strong>{row.action === 'HINT' ? 'Hint' : row.action === 'ANALYZE' ? 'Analyze' : row.action === 'EXPLAIN' ? 'Explain' : 'Suggest Fix'}</strong>
            <span role="status">{['preparing', 'starting', 'running'].includes(row.phase) && <MessageTyping label="Đang chờ phản hồi" />}{row.phase === 'result' ? 'Complete' : row.phase}</span></div>
          {row.message && <p role={row.phase === 'error' ? 'alert' : 'status'}>{row.message}</p>}
          {row.result && <><details className="assistant-evidence"><summary>Ngữ cảnh & bằng chứng</summary><RunEvidence context={row.result.runContext} /></details>
            <Advisory output={row.result.output} source={row.source} markdown hintApply={row.operationId ? quick?.hintApply?.control(row.operationId) : undefined}
              onIssue={row.result.output.kind === 'DETECTION' && quick?.hints.view.result?.operationId === row.operationId ? quick?.onIssue : undefined} />
            {(context?.kind !== 'PRACTICE' || row.result.binding.exerciseId !== context.exerciseId || row.result.binding.language !== context.language
              || row.sourceRevision !== context.sourceRevision || row.result.expiresAt <= Date.now()) && <small className="assistant-provenance">Snapshot trước · chỉ tham khảo</small>}
            {row.result.output.kind === 'EDIT_PROPOSAL' && (quick && quick.hints.capabilities?.applyEnabled && quick.onPreview && quick.hints.view.result?.operationId === row.operationId && quick.hints.previewFix()
              ? <div className="assistant-proposal-actions"><button type="button" disabled={busy} onClick={() => quick.onPreview?.(row.operationId!)}>Review Diff</button>
                {quick.onDiscard && <button type="button" disabled={busy} onClick={() => quick.onDiscard?.(row.operationId!)}>Discard</button>}</div>
              : <small>Đề xuất không còn quyền Apply. Hãy yêu cầu lại nếu cần sửa.</small>)}
          </>}
        </div></MessageContent>
      </Message>)}
    </MessageScroller>
    <div className="assistant-composer-area">
      <div className="assistant-status-bar"><span className="learning-assistant-state sr-only" role="status">{quick?.hints.busy ? 'Busy · Quick Action' : chat.phase}{chat.status?.state === 'FAILED' ? ` · ${chat.status.code}` : ''}</span>
        <button type="button" className="assistant-icon-button" aria-label="Tin nhắn mới nhất" title="Tin nhắn mới nhất" onClick={toEnd}><ArrowDown aria-hidden="true" /></button></div>
      {chat.error && <p role="alert">{chat.error}</p>}
      {prepared && <section className="learning-assistant-consent" aria-label="Xác nhận gửi Gemini">
        <strong><ShieldCheck aria-hidden="true" /> Xem dữ liệu gửi Gemini</strong><p>Câu hỏi: {chat.question}</p>
        <dl><dt>Phạm vi</dt><dd>{prepared.manifest.scope}</dd><dt>Câu hỏi</dt><dd>{prepared.manifest.questionBytes} bytes</dd>
          <dt>Lịch sử phù hợp</dt><dd>{prepared.manifest.historyMessageIds.length} tin · {prepared.manifest.historyBytes} bytes</dd>
          <dt>Code đính kèm</dt><dd>{prepared.manifest.attachmentBytes} bytes</dd><dt>Tổng yêu cầu</dt><dd>{prepared.manifest.requestBytes} bytes</dd></dl>
        {chat.preview && <details open><summary>Code sẽ gửi</summary><pre>{chat.preview}</pre></details>}
        <p>Chỉ gửi câu hỏi, lịch sử phù hợp và phần đính kèm liệt kê ở trên. Không tự gửi đề bài, kết quả Run hoặc dữ liệu khác.</p>
        <div className="assistant-consent-actions"><button type="button" onClick={() => { void chat.confirm() }}>Đồng ý gửi Gemini</button><button type="button" onClick={() => { void chat.cancel() }}>Cancel</button></div>
      </section>}
      <PromptInput className="learning-assistant-composer" formProps={{ hidden: !!prepared }} aria-label="Câu hỏi" placeholder="Hỏi về bài học hoặc code…"
        value={chat.question} onValueChange={chat.setQuestion} minRows={2} maxRows={5}
        disabled={!chat.canSend || !!quick?.hints.busy || !!quick?.slot.current} loading={!!cancel} onStop={cancel} submitLabel="Send" stopLabel={quick?.hints.busy ? 'Hủy yêu cầu AI' : 'Cancel'} onSubmit={send}
        header={<>{quick ? <AssistantQuickActions quick={quick} blocked={busy || !!quick.slot.current} /> : <section className="learning-assistant-actions" aria-label="Quick Actions">
          <div className="smart-hints-actions">{['Hint', 'Analyze', 'Explain', 'Suggest Fix'].map(label => <button type="button" key={label} disabled>{label}</button>)}</div>
          </section>}</>}
        leadingAction={<label className="assistant-context-chip" title={scopeName}>{chat.scope === 'QUESTION_ONLY' ? <MessageSquare aria-hidden="true" /> : <FileCode2 aria-hidden="true" />}
          <select aria-label="Ngữ cảnh Chat" value={chat.scope} disabled={busy} onChange={e => chat.setScope(e.target.value as ChatScope)}>
            <option value="QUESTION_ONLY">Chỉ câu hỏi</option><option value="QUESTION_WITH_SELECTION" disabled={context?.kind !== 'PRACTICE'}>Code đã chọn</option>
            <option value="QUESTION_WITH_SOURCE" disabled={context?.kind !== 'PRACTICE'}>Toàn bộ source</option>
          </select></label>} />
      {quick?.hints.view.canCheck && <button type="button" onClick={quick.hints.check}>Kiểm tra trạng thái AI</button>}
      {quick?.hints.consentError && <p role="alert">{quick.hints.consentError}</p>}
    </div>
    {quick?.hints.view.phase === 'consent' && quick.hints.view.prepared && <SmartHintsConsent prepared={quick.hints.view.prepared}
      gemini={quick.hints.capabilities?.providerMode === 'GEMINI_FREE'} openrouter={quick.hints.capabilities?.providerMode === 'OPENROUTER_FREE'}
      onConfirm={remember => { if (quick.slot.current?.kind !== 'CHAT') void quick.hints.consent(remember) }} onCancel={quick.hints.cancel} />}
  </aside>
}
