import { useEffect, useRef, useState } from 'react'
import type { SmartHintsApi, PrepareHintApply } from '../../../../../shared/contracts/smart-hints'
import { isHintApplyProposal, validatePrepareHintApply, isHintApplyFailure } from '../../../../../shared/contracts/smart-hints-validation'
import type { useSmartHints } from './use-smart-hints'
import type { HintApplySnapshot } from './smart-hints-selection'
import { createHintSmartFix, type HintSmartFix } from './smart-hint-edits'
import type { AssistantSlot, AssistantLease } from '../use-assistant-timeline'

export interface HintCodeActions {
  phase: string; disabled: boolean; message?: string; onApply(): void; onCancel?(): void
}
type Phase = 'Preparing' | 'Review' | 'Applied' | 'Failed' | 'Stale' | 'Discarded'
interface View { operationId?: string; phase?: Phase; message?: string; locked?: boolean }
interface Ticket { live: boolean; operationId: string; request: PrepareHintApply; snapshot: HintApplySnapshot; lease: AssistantLease; fix?: HintSmartFix }
const failedTarget = 'UNSUPPORTED: Không xác minh được phản hồi preparation. Apply đã khóa để tránh cấp quyền trùng; code giữ nguyên.'

export function useHintApply(input: { hints: ReturnType<typeof useSmartHints>; capture(): HintApplySnapshot | undefined;
  active: boolean; blocked: boolean; slot: AssistantSlot; onReview(fix: HintSmartFix): void },
  api: SmartHintsApi | undefined = window.studentIde?.learning?.smartHints) {
  const latest = useRef(input); latest.current = input
  const mounted = useRef(true), ticket = useRef<Ticket | undefined>(undefined), viewRef = useRef<View>({})
  const [view, setView] = useState<View>({})
  const publish = (next: View) => { viewRef.current = next; if (mounted.current) setView(next) }
  const release = (t: Ticket) => { if (latest.current.slot.current === t.lease) latest.current.slot.current = undefined }
  const eligible = (operationId: string) => {
    const now = latest.current, result = now.hints.view.result
    return mounted.current && now.active && !now.blocked && now.hints.capabilities?.applyEnabled === true && !now.hints.busy
      && result?.operationId === operationId && result.output.kind === 'HINT' && result.binding.origin.kind === 'PRACTICE' && result.expiresAt > Date.now()
  }
  const same = (t: Ticket) => t.live && ticket.current === t && eligible(t.operationId) && t.snapshot.isCurrent()
  const retire = (phase: Phase, message: string) => {
    const t = ticket.current
    if (!t) return
    t.live = false; ticket.current = undefined; release(t)
    void api?.discardHintApply({ hint: t.request.hint, requestId: t.request.requestId }).catch(() => {})
    publish({ operationId: t.operationId, phase, message, locked: true })
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const t = ticket.current
      if (t) { t.live = false; release(t); void api?.discardHintApply({ hint: t.request.hint, requestId: t.request.requestId }).catch(() => {}) }
      ticket.current = undefined
    }
  }, [api])
  useEffect(() => {
    const t = ticket.current
    if (!t) return
    if (viewRef.current.phase === 'Applied') { t.live = false; ticket.current = undefined; release(t); return }
    if (!same(t)) retire('Stale', 'STALE: Source, model hoặc ngữ cảnh đã thay đổi. Hint này không còn quyền Apply.')
  }, [input.active, input.blocked, input.hints.view, input.hints.capabilities])
  const prepare = async (operationId: string) => {
    if (!api || !eligible(operationId) || ticket.current || latest.current.slot.current
      || viewRef.current.operationId === operationId && viewRef.current.locked) return
    const result = latest.current.hints.view.result!, snapshot = latest.current.capture()
    if (!snapshot || snapshot.origin.kind !== 'PRACTICE' || !snapshot.isCurrent()
      || snapshot.sourceRevision !== result.binding.sourceRevision || snapshot.source !== latest.current.hints.capturedSource
      || snapshot.exerciseId !== result.binding.exerciseId || snapshot.language !== result.binding.language
      || JSON.stringify(snapshot.origin) !== JSON.stringify(result.binding.origin)) {
      publish({ operationId, phase: snapshot ? 'Stale' : 'Failed',
        message: snapshot ? 'STALE: Source/model/revision không khớp Hint.' : 'TARGET_INVALID: Hãy chọn vùng hoặc đặt con trỏ trong đúng Code Editor.', locked: !!snapshot }); return
    }
    const request: PrepareHintApply = { requestId: crypto.randomUUID(), hint: { requestId: result.requestId, operationId },
      exerciseId: snapshot.exerciseId, language: snapshot.language, sourceRevision: snapshot.sourceRevision, source: snapshot.source,
      packageVersion: result.binding.packageVersion, origin: snapshot.origin, selection: snapshot.selection ?? null }
    if (!validatePrepareHintApply(request).ok) {
      publish({ operationId, phase: 'Failed', message: 'TARGET_INVALID: Vùng chọn/con trỏ không hợp lệ hoặc vượt giới hạn. Chọn lại trong Code Editor.', locked: false }); return
    }
    const lease: AssistantLease = { kind: 'HINT_APPLY', id: Symbol() }, t: Ticket = { live: true, operationId, request, snapshot, lease }
    ticket.current = t; latest.current.slot.current = lease
    publish({ operationId, phase: 'Preparing', message: 'Đang xác minh target và candidate trên snapshot gốc…', locked: true })
    try {
      const reply = await api.prepareHintApply(request)
      if (!same(t)) { if (ticket.current === t) retire('Stale', 'STALE: Snapshot đã thay đổi trong khi chuẩn bị.'); return }
      if (!reply.ok && isHintApplyFailure(reply.error, request)) {
        const d = reply.error.details!, reason = d.reason
        const advice = reason === 'TARGET_INVALID' ? 'Chọn lại đoạn cần sửa hoặc đặt con trỏ tại ranh giới câu lệnh trong đúng hàm.'
          : reason === 'CANDIDATE_INVALID' ? 'Code gợi ý không vượt qua kiểm tra cú pháp, signature hoặc cấu trúc. Chọn lại target chỉ khi phù hợp; không bỏ qua parser.'
          : reason === 'STALE' ? 'Snapshot, package hoặc thời hạn Hint không còn hợp lệ.'
          : d.stage === 'CLASSIFICATION' ? 'Không phân loại an toàn source hiện tại: hãy kiểm tra cú pháp, chữ ký hàm và template. Code được giữ nguyên; không suy đoán vùng ghi đè.'
          : 'Parser chưa hỗ trợ source/candidate hoặc không sẵn sàng.'
        t.live = false; ticket.current = undefined; release(t)
        publish({ operationId, phase: reason === 'STALE' ? 'Stale' : 'Failed', locked: !reply.error.retryable,
          message: `${reason} (${d.stage}): ${advice} ${reply.error.retryable ? `Còn ${d.remaining} lần thử thủ công trên cùng Hint; không gọi Gemini lại.` : 'Apply đã khóa cho Hint này.'}` })
        return
      }
      if (!reply.ok || !isHintApplyProposal(reply.value) || reply.value.requestId !== request.requestId
        || JSON.stringify(reply.value.hint) !== JSON.stringify(request.hint) || JSON.stringify(reply.value.binding) !== JSON.stringify(result.binding)) throw Error('invalid')
      const fix = createHintSmartFix(reply.value, snapshot.source, () => same(t), () => api.consumeHintApply({ preparation: request, proposalId: reply.value.proposalId }))
      if (!fix) throw Error('invalid')
      t.fix = fix; publish({ operationId, phase: 'Review', message: 'Review Diff trước khi xác nhận Apply.', locked: true })
      latest.current.onReview(fix)
    } catch { if (ticket.current === t) retire('Failed', failedTarget) }
  }
  return {
    view, busy: view.phase === 'Preparing' || view.phase === 'Review',
    control: (operationId: string): HintCodeActions => {
      const local = view.operationId === operationId ? view : undefined
      return { phase: local?.phase ?? (eligible(operationId) ? '' : 'Stale'),
        disabled: !eligible(operationId) || !!latest.current.slot.current || !!local?.locked,
        message: local?.message ?? (!eligible(operationId) ? 'Hint lịch sử hoặc snapshot cũ chỉ để tham khảo; không có quyền Apply.' : 'Main xác minh vùng sửa hoặc điểm chèn duy nhất. Khi target chưa rõ, chọn đúng statement hoặc đặt con trỏ tại ranh giới câu lệnh trong hàm.'),
        onApply: () => { void prepare(operationId) }, onCancel: local?.phase === 'Preparing' ? () => retire('Discarded', 'Đã hủy preparation. Code giữ nguyên; không tự retry.') : undefined }
    },
    discard: () => retire('Discarded', 'Đã bỏ đề xuất. Code giữ nguyên; preparation của Hint đã khóa.'),
    failed: (transactionFailed = false) => retire(transactionFailed ? 'Failed' : 'Stale', transactionFailed
      ? 'Không xác nhận được transaction. Apply đã khóa; giữ code hiện tại và kiểm tra Draft. Không tự retry.'
      : 'Không xác nhận được grant hoặc snapshot đã thay đổi. Code không được áp dụng; không tự retry.'),
    applied: () => {
      const t = ticket.current
      if (t) { publish({ operationId: t.operationId, phase: 'Applied', message: 'Đã áp dụng. Dùng Ctrl+Z / Ctrl+Y trong Code Editor để Undo/Redo.', locked: true }); release(t) }
    },
  }
}
