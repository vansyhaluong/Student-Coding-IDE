import { useEffect, useRef, useState } from 'react'
import type { AppResult } from '../../../../shared/contracts/app-error'
import type { SmartHintsReadiness, SmartHintsSettingsSnapshot } from '../../../../shared/contracts/smart-hints-settings'
import { Button } from '../../components/ui/Button'

export const smartHintsStateLabel: Record<SmartHintsReadiness, string> = {
  DISABLED: 'Đã tắt', MISSING_KEY: 'Thiếu API Key', READY: 'Sẵn sàng', OFFLINE: 'Không kết nối',
  LOCAL_BUDGET_EXHAUSTED: 'Đã dùng hết hạn mức trong ngày của IDE', LOCAL_RATE_LIMIT: 'IDE tạm giới hạn tốc độ (6/phút, 30/giờ)',
  GEMINI_RATE_LIMIT: 'Google báo giới hạn tốc độ (HTTP 429; quota chưa xác định nếu thiếu chi tiết)',
  GEMINI_QUOTA_EXHAUSTED: 'Google báo hết quota; hạn mức IDE không thay đổi quota Google',
  INVALID_KEY: 'API Key không hợp lệ hoặc chưa được cấp quyền',
  SECURE_STORAGE_UNAVAILABLE: 'Lưu trữ bảo mật chưa sẵn sàng', ERROR: 'Không thể xác nhận cấu hình Gemini',
}
export function SmartHintsSettings() {
  const api = window.studentIde?.settings?.smartHints
  const [snapshot, setSnapshot] = useState<SmartHintsSettingsSnapshot>()
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dailyLimit, setDailyLimit] = useState(20)
  const mounted = useRef(true), admission = useRef(false)
  useEffect(() => {
    mounted.current = true
    void api?.get().then(r => { if (mounted.current) { if (r.ok) { setSnapshot(r.value); setDailyLimit(r.value.needsLimitReview ? 20 : r.value.requestLimit) } else setError(r.error.message) } })
      .catch(() => { if (mounted.current) setError('Không tải được trạng thái AI Smart Hints.') })
    return () => { mounted.current = false }
  }, [api])
  async function action(call: () => Promise<AppResult<SmartHintsSettingsSnapshot>>, configurationChanged = true) {
    if (admission.current) return
    admission.current = true; setBusy(true); setError('')
    try {
      const r = await call()
      if (r.ok) {
        if (mounted.current) { setSnapshot(r.value); setDailyLimit(r.value.needsLimitReview ? 20 : r.value.requestLimit) }
        window.dispatchEvent(new Event(configurationChanged ? 'smart-hints-configuration-changed' : 'smart-hints-readiness-changed'))
      } else if (mounted.current) setError(r.error.message)
    } catch { if (mounted.current) setError('Thao tác AI chưa hoàn tất. Không tự gửi lại yêu cầu.') }
    finally { admission.current = false; if (mounted.current) setBusy(false) }
  }
  return <section aria-label="AI Smart Hints" className="smart-hints-settings">
    <h3>AI Smart Hints</h3>
    {!api ? <p role="status">Cấu hình AI chưa khả dụng trong phiên này.</p> : <>
      <label>Provider<select aria-label="Smart Hints provider" value="GEMINI" disabled><option value="GEMINI">Google Gemini</option></select></label>
      <p>gemini-3.1-flash-lite</p>
      <label className="settings-check"><input aria-label="Bật AI Smart Hints" type="checkbox" checked={snapshot?.enabled ?? false}
        disabled={busy || !snapshot} onChange={e => { void action(() => api.enable({ enabled: e.target.checked })) }} />Bật AI Smart Hints</label>
      <p role="status">{busy ? 'Đang xử lý cấu hình AI…' : snapshot ? snapshot.needsLimitReview && snapshot.enabled ? 'Cần xác nhận hạn mức theo ngày' : smartHintsStateLabel[snapshot.state] : 'Đang tải cấu hình AI…'}</p>
      <p>{snapshot?.hasKey ? 'Đã có API Key được mã hóa bằng Windows.' : 'Chưa lưu API Key.'} Key chỉ nhập trong cửa sổ Windows native, không đi qua giao diện web hoặc IPC.</p>
      <div className="smart-hints-settings-actions">
        <Button disabled={busy || !snapshot} onClick={() => { void action(() => api.configureKey()) }}>{snapshot?.hasKey ? 'Thay API Key…' : 'Cấu hình API Key…'}</Button>
        <Button disabled={busy || !snapshot?.hasKey} onClick={() => { void action(() => api.removeKey()) }}>Xóa API Key…</Button>
        <Button disabled={busy || !snapshot?.enabled || !snapshot.hasKey} onClick={() => { void action(() => api.check(), false) }}>Kiểm tra kết nối (không gửi code)</Button>
        <Button disabled={busy || !snapshot} onClick={() => { void action(() => api.get(), false) }}>Cập nhật hạn mức (offline)</Button>
      </div>
      <p>Kiểm tra kết nối không gửi code và không bảo đảm còn hạn mức tạo nội dung.</p>
      <p>Hạn mức IDE: {snapshot?.requestLimit ?? '…'}/ngày UTC · đã dùng {snapshot?.usedRequests ?? 0} · còn {snapshot?.remainingRequests ?? '…'} lượt. Tổng reservation: {snapshot?.lifetimeRequests ?? 0}.</p>
      {snapshot && <p>Kỳ tiếp theo: {new Date(snapshot.resetAt).toLocaleString('vi-VN')} (00:00 UTC). Không đổi bộ đếm khi khởi động hoặc đổi key. Đây không phải quota Google.</p>}
      {snapshot?.retryAt && snapshot.retryAt > Date.now() && <p>Chờ ít nhất đến {new Date(snapshot.retryAt).toLocaleString('vi-VN')}. Không tự gửi lại.</p>}
      {snapshot?.needsLimitReview && <p role="alert">Cấu hình ngân sách cũ ({snapshot.requestLimit} lượt) cần xác nhận hạn mức theo ngày trước khi tiếp tục. Lượt đã ghi được giữ nguyên. Đề xuất 20/ngày.</p>}
      <label>Hạn mức mỗi ngày UTC<input aria-label="Ngân sách Smart Hints" type="number" min={1} max={300} value={dailyLimit}
        onChange={e => setDailyLimit(e.target.valueAsNumber)} disabled={busy} /></label>
      <Button disabled={busy || !snapshot || !Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 300}
        onClick={() => { void action(() => api.budget({ dailyLimit })) }}>Lưu hạn mức theo ngày…</Button>
      <p>Giới hạn an toàn bổ sung: 6 yêu cầu/phút, 30/giờ. Reservation tính trước khi gửi, kể cả lỗi hoặc hủy sau đó. Kiểm tra trạng thái không dùng lượt inference. Đổi hạn mức không cấp lại lượt đã dùng hoặc quota Google. Thông báo quota Google là phản hồi gần nhất; kiểm tra model không xác minh được quota tạo nội dung.</p>
      <p>Thay đổi AI có hiệu lực ngay. Chỉ gửi source sau mỗi lần bạn yêu cầu và xác nhận snapshot. Có thể phát sinh phí theo project; ứng dụng không bật billing, không xác minh Free Tier và không tự retry.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
