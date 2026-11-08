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
}
export function AssistantQuickActions({ quick, blocked }: { quick: AssistantQuickActionsProps; blocked: boolean }) {
  const { hints, readiness } = quick, { capabilities } = hints
  const enabled = capabilities?.enabled === true
  const fixEnabled = enabled && capabilities?.suggestFixMode === 'SELECTION_V1' && capabilities.suggestFixLanguages.includes(hints.language)
  const range = hints.frozenSelection ?? (readiness?.state === 'READY' ? readiness.range : undefined)
  return <section className="learning-assistant-actions" aria-label="Quick Actions">
    <div className="smart-hints-actions">
      <button type="button" disabled={!enabled || blocked} onClick={() => quick.onAction('HINT')} title="Gợi ý tư duy, các bước và code"><Lightbulb aria-hidden="true" />Hint</button>
      <button type="button" aria-label="Analyze Code & Run" title="Phân tích code và Run public hiện có; không tự Run" disabled={!enabled || blocked} onClick={() => quick.onAction('ANALYZE')}><ScanLine aria-hidden="true" />Analyze</button>
      <button type="button" aria-label="Explain Selected Code (Practice)" title="Giải thích vùng chọn Monaco" disabled={!enabled || blocked} onClick={quick.onExplain}><TextQuote aria-hidden="true" />Explain</button>
      <button type="button" disabled={!fixEnabled || blocked || readiness?.state !== 'READY'} onClick={() => quick.onAction('SUGGEST_FIX')} title="Đề xuất sửa vùng chọn; luôn cần Review Diff"><Wrench aria-hidden="true" />Suggest Fix</button>
    </div>
    <p className="smart-hints-muted assistant-selection-summary" aria-label="Chuẩn bị vùng chọn Suggest Fix">{!fixEnabled && 'Sửa theo vùng chọn chưa bật cho ngôn ngữ này. '}
      {range ? `Vùng chọn${hints.frozenSelection ? ' đã chụp' : ''}: dòng ${range.startLine}:${range.startColumn} → ${range.endLine}:${range.endColumn}.`
        : 'Bôi đen đoạn code cần sửa trước khi sử dụng Suggest Fix.'}</p>
    {!enabled && <p role="status">{hints.checking ? 'Đang kiểm tra AI…' : 'Mở Settings → AI Smart Hints để cấu hình AI. Chưa gửi source.'}</p>}
    {!enabled && !hints.checking && <button type="button" disabled={blocked} onClick={hints.show}>Kiểm tra khả dụng</button>}
    {capabilities?.providerMode === 'FAKE' && <small>Chế độ kiểm thử · provider giả</small>}
    {capabilities?.providerMode === 'GEMINI_FREE' && <small>Google Gemini · gemini-3.1-flash-lite</small>}
    {quick.notice && <p role="status">{quick.notice}</p>}
  </section>
}
