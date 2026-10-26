import type { CommittedSubmissionSummary, SubmissionAvailabilityState } from '../../../../../shared/contracts/submission'
import type { SubmissionView } from './use-submission'
import type { HistoryRow, useSubmissionHistory } from './use-submission-history'

const verdicts: Record<CommittedSubmissionSummary['verdict'], string> = {
  Accepted: 'Accepted', WrongAnswer: 'Wrong Answer', CompilationError: 'Compilation Error', SyntaxError: 'Syntax Error',
  RuntimeError: 'Runtime Error', TimeLimitExceeded: 'Time Limit Exceeded', MemoryLimitExceeded: 'Memory Limit Exceeded', OutputLimitExceeded: 'Output Limit Exceeded',
}
const availability: Record<SubmissionAvailabilityState, string> = { AVAILABLE: 'Khả dụng', MISSING: 'Chưa có kho', RECOVERED: 'Đã khôi phục',
  READ_ONLY: 'Chỉ đọc', UNAVAILABLE: 'Không khả dụng', UNSUPPORTED_SCHEMA: 'Định dạng chưa hỗ trợ', CORRUPT: 'Dữ liệu hỏng',
  CONFLICT: 'Xung đột', RECOVERY_PENDING: 'Đang chờ khôi phục' }

export function SubmissionHistoryPanel({ history, completion, onRefresh, onSelect }: {
  history: ReturnType<typeof useSubmissionHistory>; completion: SubmissionView; onRefresh(): void
  onSelect?(row: HistoryRow): void
}) {
  const { view } = history, partial = view.page?.coverage === 'PARTIAL'
  const completionState = view.stores?.ACCEPTED.readable === false ? 'UNKNOWN' : completion.completion
  return <section className="practice-history" aria-label="Lịch sử nộp bài" aria-busy={view.loading || view.loadingMore}>
    <div className="practice-history-heading"><h2>Lịch sử nộp bài</h2>
      <button type="button" onClick={onRefresh}>Tải lại lịch sử</button></div>
    <p className="practice-history-completion">Tiến độ: {completionState === 'COMPLETED' ? 'Hoàn thành (Accepted đã commit)'
      : completionState === 'NOT_COMPLETED' ? 'Chưa có Accepted đã commit' : completionState === 'LOADING' ? 'Đang đọc…' : 'Chưa xác định'}</p>
    {view.stores && <p className="practice-history-availability">Accepted: {availability[view.stores.ACCEPTED.state]} · Failed: {availability[view.stores.FAILED.state]}</p>}
    {(completion.possibleDataLoss || view.stores && Object.values(view.stores).some(store => store.warning === 'POSSIBLE_DATA_LOSS'))
      && <p className="practice-history-warning">POSSIBLE_DATA_LOSS · Dữ liệu khôi phục có thể thiếu bản ghi.</p>}
    {partial && <p className="practice-history-warning">Chỉ hiển thị phần lịch sử đọc được. Tổng số bản ghi chưa xác định; kho không đọc được không được coi là rỗng.</p>}
    {view.loading && <p role="status">Đang tải lịch sử nộp bài…</p>}
    {view.notice && <p role="status">{view.notice}</p>}
    {view.error && <div role="alert">{view.error}{view.rows.length > 0 && <p>Các bản ghi bên dưới đã tải trước đó; chưa xác nhận danh sách mới nhất.</p>}</div>}
    {!view.loading && !view.error && view.page && !view.rows.length && <p>{partial
      ? 'Chưa đọc được bản ghi nào trong phần lịch sử khả dụng.' : 'Chưa có lần nộp bài đã commit cho bài tập này.'}</p>}
    {view.rows.length > 0 && <div className="practice-history-table"><table>
      <caption className="sr-only">Các lần nộp bài đã commit</caption>
      <thead><tr><th scope="col">Thời gian nộp</th><th scope="col">Ngôn ngữ</th><th scope="col">Verdict</th><th scope="col">Lưu trữ</th>{onSelect && <th scope="col">Chi tiết</th>}</tr></thead>
      <tbody>{view.rows.map(row => <tr key={`${row.key.storeKind}/${row.key.recordId}`}>
        <td><time dateTime={row.submittedAt}>{new Date(row.submittedAt).toLocaleString('vi-VN')}</time></td>
        <td>{row.language === 'csharp' ? 'C#' : 'JavaScript'}</td><td data-accepted={row.verdict === 'Accepted'}>{verdicts[row.verdict]}</td>
        <td>saved · {row.key.storeKind === 'ACCEPTED' ? 'Accepted' : 'Failed'}</td>
        {onSelect && <td><button type="button" onClick={() => onSelect(row)}>Chi tiết</button></td>}
      </tr>)}</tbody></table></div>}
    {view.page && <p>Đã tải {view.rows.length} / {view.page.knownCount} {partial ? 'bản ghi đọc được; tổng chưa xác định' : 'bản ghi'}.</p>}
    {view.page?.nextCursor && !view.moreBlocked && <button type="button" disabled={view.loading || view.loadingMore} onClick={history.loadMore}>
      {view.loadingMore ? 'Đang tải thêm…' : 'Tải thêm'}</button>}
  </section>
}
