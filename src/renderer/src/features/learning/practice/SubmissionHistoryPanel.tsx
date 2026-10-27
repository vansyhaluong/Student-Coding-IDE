import { RotateCcw } from 'lucide-react'
import type { CommittedSubmissionSummary } from '../../../../../shared/contracts/submission'
import type { SubmissionView } from './use-submission'
import type { HistoryRow, useSubmissionHistory } from './use-submission-history'

const verdicts: Record<CommittedSubmissionSummary['verdict'], string> = {
  Accepted: 'Accepted', WrongAnswer: 'Wrong Answer', CompilationError: 'Compilation Error', SyntaxError: 'Syntax Error',
  RuntimeError: 'Runtime Error', TimeLimitExceeded: 'Time Limit Exceeded', MemoryLimitExceeded: 'Memory Limit Exceeded', OutputLimitExceeded: 'Output Limit Exceeded',
}

export function SubmissionHistoryPanel({ history, completion, onRefresh, onSelect }: {
  history: ReturnType<typeof useSubmissionHistory>; completion: SubmissionView; onRefresh(): void
  onSelect?(row: HistoryRow): void
}) {
  const { view } = history, partial = view.page?.coverage === 'PARTIAL'
  const rows = [...view.rows].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
  return <section className="practice-history" aria-label="Lịch sử nộp bài" aria-busy={view.loading || view.loadingMore}>
    <div className="practice-history-heading"><h2>Submissions</h2>
      <button type="button" className="practice-history-refresh" aria-label="Tải lại lịch sử" title="Tải lại lịch sử" onClick={onRefresh}><RotateCcw aria-hidden="true" /></button></div>
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
      <thead><tr><th scope="col">Status</th><th scope="col">Language</th><th scope="col">Submitted At</th></tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.key.storeKind}/${row.key.recordId}`} data-selectable={!!onSelect}
        tabIndex={onSelect ? 0 : undefined} onClick={() => onSelect?.(row)} onKeyDown={event => {
          if (event.target !== event.currentTarget || !onSelect || !['Enter', ' '].includes(event.key)) return
          event.preventDefault(); onSelect(row)
        }}>
        <td data-accepted={row.verdict === 'Accepted'}>{onSelect ? <button type="button" className="practice-history-open" aria-label="Chi tiết"
          onClick={event => { event.stopPropagation(); onSelect(row) }}>{verdicts[row.verdict]}</button> : verdicts[row.verdict]}</td>
        <td><span className="practice-history-language">{row.language === 'csharp' ? 'C#' : 'JavaScript'}</span></td>
        <td><time dateTime={row.submittedAt}>{new Date(row.submittedAt).toLocaleString('vi-VN')}</time></td>
      </tr>)}</tbody></table></div>}
    {view.page?.nextCursor && !view.moreBlocked && <button type="button" disabled={view.loading || view.loadingMore} onClick={history.loadMore}>
      {view.loadingMore ? 'Đang tải thêm…' : 'Tải thêm'}</button>}
  </section>
}
