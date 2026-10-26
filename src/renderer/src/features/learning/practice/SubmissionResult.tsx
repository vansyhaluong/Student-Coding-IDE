import type { PublicSubmissionStorage, PublicSubmissionVerdict } from '../../../../../shared/contracts/submission'
import type { SubmissionView } from './use-submission'

const verdicts: Record<PublicSubmissionVerdict, string> = {
  Accepted: 'Accepted', WrongAnswer: 'Wrong Answer', CompilationError: 'Compilation Error', SyntaxError: 'Syntax Error',
  RuntimeError: 'Runtime Error', TimeLimitExceeded: 'Time Limit Exceeded', MemoryLimitExceeded: 'Memory Limit Exceeded',
  OutputLimitExceeded: 'Output Limit Exceeded', InfrastructureFailure: 'Không thể hoàn tất chấm bài', CancelledInvalidated: 'Đã hủy / ngữ cảnh đã đổi',
}
const failures = { FULL: 'Bộ nhớ lưu bài đã đầy.', UNAVAILABLE: 'Kho lưu bài không khả dụng.', CANCELLED: 'Đã hủy lưu bài.',
  EXPIRED: 'Đã hết thời gian chờ lưu bài.', CONFLICT: 'Xung đột bản ghi.', IO_FAILURE: 'Không thể ghi bài vào kho lưu.' }
function storageMessage(storage: PublicSubmissionStorage) {
  switch (storage.state) {
    case 'pending': return 'pending · Đang chờ lưu; chưa xác nhận đã lưu.'
    case 'saved': return 'saved · Đã xác minh bản ghi được lưu.'
    case 'failed': return `failed · ${failures[storage.reason]} Verdict không thay đổi.`
    case 'unknown': return 'unknown · Chưa xác định kết quả lưu; không gửi lại Submit.'
    case 'not-requested': return storage.reason === 'PLAN_UNAVAILABLE' ? 'Không lưu · Bộ chấm chưa khả dụng.'
      : storage.reason === 'INELIGIBLE' ? 'Không lưu · Kết quả chưa đủ điều kiện lưu.' : 'Chưa yêu cầu lưu.'
  }
}
export function SubmissionResult({ view, staleSource, onCheck, onCompletion }: {
  view: SubmissionView; staleSource: boolean; onCheck(): void; onCompletion(): void
}) {
  const status = view.status
  return <section className="practice-submission-result" aria-label="Submit Result" aria-live="polite" aria-busy={view.busy}>
    <div className="practice-submission-summary"><strong>Submit Result</strong>
      <span data-completed={view.completion === 'COMPLETED'}>{view.completion === 'COMPLETED' ? 'Hoàn thành · Accepted đã commit'
        : view.completion === 'LOADING' ? 'Đang đọc completion…' : view.completion === 'UNKNOWN' ? 'Completion chưa xác định' : 'Chưa có Accepted đã commit'}</span>
    </div>
    {view.possibleDataLoss && <p>POSSIBLE_DATA_LOSS · Dữ liệu được đọc từ bản khôi phục, có thể thiếu bản ghi.</p>}
    {status ? <>
      <p><strong>{status.verdict ? verdicts[status.verdict] : 'Đang chấm bài…'}</strong> · {status.language === 'csharp' ? 'C#' : 'JavaScript'} · source revision {status.sourceRevision}</p>
      <p>{storageMessage(status.storage)}</p>
      {status.stage !== 'SETTLED' && <p>Operation vẫn đang được xử lý an toàn.</p>}
      {staleSource && <p>Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.</p>}
    </> : <p>{view.busy ? 'Đang gửi Submit và chờ xác nhận…' : 'Chọn Submit để chấm bài. Run chỉ chạy test mẫu.'}</p>}
    {view.error && <p role="alert">{view.error}</p>}
    {(view.busy || view.error) && <button type="button" onClick={onCheck}>Kiểm tra trạng thái</button>}
    {view.completion === 'UNKNOWN' && <button type="button" onClick={onCompletion}>Đọc lại completion</button>}
  </section>
}
