import type { SmartIssue } from '../../../../../shared/contracts/smart-hints'
export function DetectionIssues({ issues, onIssue }: { issues: SmartIssue[]; onIssue?(id: string): void }) {
  return <section aria-label="Phát hiện lỗi toàn bài"><h3>Kiểm tra toàn bài</h3>
    <p>Các nhận định AI là nghi vấn chưa xác minh; bằng chứng compiler/Run được trình bày riêng. Không sửa code hoặc mở Diff.</p>
    {!issues.length && <p>AI không phát hiện vấn đề trong snapshot này. Đây không phải chứng nhận code đúng.</p>}
    <ul>{issues.map(i => <li key={i.id}><button type="button" disabled={!onIssue} onClick={() => onIssue?.(i.id)}>{i.message} · {i.severity} · nghi vấn AI</button>
      {!i.range && <small>{i.locationStatus === 'INVALID_AI_RANGE' ? 'Vị trí AI không khớp source; không đánh dấu.' : 'Chưa xác định vị trí; không đánh dấu.'}</small>}</li>)}</ul>
  </section>
}
