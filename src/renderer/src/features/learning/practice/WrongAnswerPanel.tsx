import { CircleAlert } from 'lucide-react'
import type { SubmissionStatus } from '../../../../../shared/contracts/submission'
import { isSubmissionStatus } from '../../../../../shared/contracts/submission-validation'
import type { ExerciseValue } from '../../../../../shared/contracts/practice'
import { storageMessage } from './SubmissionResult'

/** Only the existing observer supplies status. No catalogue/Run/History/AI lookup. */
export function WrongAnswerPanel({ status, staleSource, error, onCheck }: {
  status: SubmissionStatus; staleSource: boolean; error?: string; onCheck(): void
}) {
  if (!isSubmissionStatus(status) || status.verdict !== 'WrongAnswer' || status.stage === 'RUNTIME') return null
  const detail = status.diagnostic?.kind === 'PUBLIC_SAMPLE_MISMATCH' ? status.diagnostic : undefined
  const storage = storageMessage(status.storage)
  const value = (label: string, data: ExerciseValue | ExerciseValue[], variant?: string) => <section className="practice-wa-value" data-variant={variant}>
    <h3>{label}</h3><pre tabIndex={0} aria-label={`${label} value`}>{JSON.stringify(data, null, 2)}</pre>
  </section>
  return <section className="practice-wrong-answer" aria-label="Wrong Answer details">
    <header className="practice-wa-heading"><h2><CircleAlert aria-hidden="true" />Wrong Answer</h2>
      <span>{status.language === 'csharp' ? 'C#' : 'JavaScript'}</span></header>
    {detail ? <>
      <p className="practice-wa-sample">Public sample {detail.sampleOrdinal}</p>
      {value('Input', detail.input)}
      <div className="practice-wa-outputs">{value('Your Output', detail.actual, 'actual')}{value('Expected Output', detail.expected, 'expected')}</div>
      <p className="practice-wa-type">Kiểu trả về: <code>{detail.returnType}</code></p>
    </> : <div className="practice-wa-fallback">
      <p>Kết quả trả về không khớp kết quả mong đợi trong bộ kiểm thử chính thức.</p>
      <p>Lần Submit này chưa có chi tiết kiểm thử được phép hiển thị. Bạn có thể sử dụng Run để kiểm tra các test case mẫu.</p>
    </div>}
    {status.counts && <div className="practice-wa-counts"><dl>
      <div><dt>Tổng số test</dt><dd>{status.counts.total}</dd></div>
      <div><dt>Số test đã chạy</dt><dd>{status.counts.attempted}</dd></div>
      <div><dt>Số test vượt qua trước khi Judge dừng</dt><dd>{status.counts.passed}</dd></div>
    </dl><p>Judge dừng khi gặp kết quả sai đầu tiên. Các test chưa chạy chưa được đánh giá.</p></div>}
    {(storage || status.stage !== 'SETTLED' || error) && <div className="practice-wa-storage"><h3>Lưu trữ</h3>{storage && <p>{storage}</p>}
      {status.stage === 'STORAGE' && <p>Đang hoàn tất lưu bài.</p>}
      {(status.stage !== 'SETTLED' || error) && <button type="button" onClick={onCheck}>Kiểm tra trạng thái</button>}
    </div>}
    {staleSource && <p className="practice-wa-notice">Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
