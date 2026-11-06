import type { PublicSubmissionStorage, PublicSubmissionVerdict } from '../../../../../shared/contracts/submission'
import type { SubmissionView } from './use-submission'
import { LoaderCircle } from 'lucide-react'

const verdicts: Record<PublicSubmissionVerdict, string> = {
  Accepted: 'Accepted', WrongAnswer: 'Wrong Answer', CompilationError: 'Compilation Error', SyntaxError: 'Syntax Error',
  RuntimeError: 'Runtime Error', TimeLimitExceeded: 'Time Limit Exceeded', MemoryLimitExceeded: 'Memory Limit Exceeded',
  OutputLimitExceeded: 'Output Limit Exceeded', InfrastructureFailure: 'Không thể hoàn tất chấm bài', CancelledInvalidated: 'Đã hủy / ngữ cảnh đã đổi',
}
const failures = { FULL: 'Bộ nhớ lưu bài đã đầy.', UNAVAILABLE: 'Kho lưu bài không khả dụng.', CANCELLED: 'Đã hủy lưu bài.',
  EXPIRED: 'Đã hết thời gian chờ lưu bài.', CONFLICT: 'Xung đột bản ghi.', IO_FAILURE: 'Không thể ghi bài vào kho lưu.' }
export function storageMessage(storage: PublicSubmissionStorage) {
  switch (storage.state) {
    case 'pending': return 'pending · Đang chờ lưu; chưa xác nhận đã lưu.'
    case 'saved': return null
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
  const storage = status && storageMessage(status.storage)
  if (view.busy && (!status || status.stage === 'RUNTIME' && status.verdict === null) && !view.error) return <section
    className="practice-submission-result practice-submission-loading" aria-label="Submit Result" aria-busy="true">
    <div role="status" aria-label="Đang chấm bài"><LoaderCircle aria-hidden="true" /></div>
  </section>
  if (!status && !view.busy && !view.error) return null
  return <section className="practice-submission-result" aria-label="Submit Result" aria-live="polite" aria-busy={view.busy}>
    <div className="practice-submission-summary"><strong>Submit Result</strong>
      <span data-completed={view.completion === 'COMPLETED'}>{view.completion === 'COMPLETED' ? 'Hoàn thành · Accepted đã commit'
        : view.completion === 'LOADING' ? 'Đang đọc completion…' : view.completion === 'UNKNOWN' ? 'Completion chưa xác định' : 'Chưa có Accepted đã commit'}</span>
    </div>
    {view.possibleDataLoss && <p>POSSIBLE_DATA_LOSS · Dữ liệu được đọc từ bản khôi phục, có thể thiếu bản ghi.</p>}
    {status ? <>
      <p><strong className="practice-submission-verdict" data-accepted={status.verdict === 'Accepted'}>{status.verdict ? verdicts[status.verdict] : 'Chưa xác định verdict'}</strong> · {status.language === 'csharp' ? 'C#' : 'JavaScript'}</p>
      {storage && <p>{storage}</p>}
      {status.stage !== 'SETTLED' && <p>{status.stage === 'STORAGE' ? 'Đang hoàn tất lưu bài.' : 'Chưa xác nhận hoàn tất thu hồi tài nguyên.'}</p>}
      {staleSource && <p>Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.</p>}
    </> : <p>{view.busy ? 'Đang gửi Submit và chờ xác nhận…' : 'Chọn Submit để chấm bài. Run chỉ chạy test mẫu.'}</p>}
    {view.error && <p role="alert">{view.error}</p>}
    {(view.busy || view.error) && <button type="button" onClick={onCheck}>Kiểm tra trạng thái</button>}
    {view.completion === 'UNKNOWN' && <button type="button" onClick={onCompletion}>Đọc lại completion</button>}
  </section>
}
