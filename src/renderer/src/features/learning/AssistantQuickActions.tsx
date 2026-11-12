import type { useSmartHints } from './practice/use-smart-hints'
import type { PracticeFixReadiness } from './practice/smart-hints-selection'
import type { AssistantSlot } from './use-assistant-timeline'
import { Lightbulb, ScanLine, TextQuote, Wrench } from 'lucide-react'
import type { useHintApply } from './practice/use-hint-apply'

export interface AssistantQuickActionsProps {
  hints: ReturnType<typeof useSmartHints>; slot: AssistantSlot
  onAction(kind: 'HINT' | 'ANALYZE' | 'SUGGEST_FIX'): void; onExplain(): void
  onPreview?(operationId: string): void; notice?: string; readiness?: PracticeFixReadiness
  onDiscard?(operationId: string): void
  hintApply?: ReturnType<typeof useHintApply>
  onIssue?(id: string): void
}
export function AssistantQuickActions({ quick, blocked }: { quick: AssistantQuickActionsProps; blocked: boolean }) {
  const { hints, readiness } = quick, { capabilities } = hints
  const enabled = capabilities?.enabled === true
  const detectEnabled = enabled && ['GEMINI_FREE', 'FAKE'].includes(capabilities?.providerMode ?? '')
    && readiness?.state === 'UNAVAILABLE' && readiness.reason === 'NO_SELECTION'
  const fixEnabled = enabled && capabilities?.suggestFixMode === 'SELECTION_V1' && capabilities.suggestFixLanguages.includes(hints.language)
  return <section className="learning-assistant-actions" aria-label="Quick Actions">
    <div className="smart-hints-actions">
      <button type="button" disabled={!enabled || blocked} onClick={() => quick.onAction('HINT')} title="Gợi ý tư duy, các bước và code"><Lightbulb aria-hidden="true" />Hint</button>
      <button type="button" aria-label="Analyze Code & Run" title="Phân tích code và Run public hiện có; không tự Run" disabled={!enabled || blocked} onClick={() => quick.onAction('ANALYZE')}><ScanLine aria-hidden="true" />Analyze</button>
      <button type="button" aria-label="Explain Selected Code (Practice)" title="Giải thích vùng chọn Monaco" disabled={!enabled || blocked} onClick={quick.onExplain}><TextQuote aria-hidden="true" />Explain</button>
      <button type="button" disabled={blocked || !(detectEnabled || fixEnabled && readiness?.state === 'READY')} onClick={() => quick.onAction('SUGGEST_FIX')} title="Không chọn: phát hiện lỗi toàn bài. Có chọn: đề xuất sửa qua Review Diff"><Wrench aria-hidden="true" />Suggest Fix</button>
    </div>
    {!enabled && <p role="status">{hints.checking ? 'Đang kiểm tra AI…' : 'Mở Settings → AI Smart Hints để cấu hình AI. Chưa gửi source.'}</p>}
    {!enabled && !hints.checking && <button type="button" disabled={blocked} onClick={hints.show}>Kiểm tra khả dụng</button>}
    {capabilities?.providerMode === 'FAKE' && <small>Chế độ kiểm thử · provider giả</small>}
    {quick.notice && <p role="status">{quick.notice}</p>}
  </section>
}
