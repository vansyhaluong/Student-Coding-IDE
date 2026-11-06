import { BrainCircuit, CheckCheck, Clock3, Lightbulb, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Dialog } from '../../../components/ui/Dialog'
import type { Analysis } from '../../../../../shared/contracts/analysis'
import type { HistoryRow } from './use-submission-history'
import { analysisEligible, useSubmissionAnalysis } from './use-submission-analysis'
import './submission-analysis.css'

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\r?\n\s*\r?\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</>
}
function AnalysisResult({ analysis }: { analysis: Analysis }) {
  return <div className="submission-analysis-result">
    <p className="submission-analysis-advisory"><ShieldCheck aria-hidden="true" />Kết quả AI chỉ mang tính tham khảo.</p>
    <section><h3><BrainCircuit aria-hidden="true" />Phân tích thuật toán</h3><Paragraphs text={analysis.algorithmAnalysis} /></section>
    <div className="submission-analysis-complexities">
      <section><h3><Clock3 aria-hidden="true" />Time Complexity</h3><strong className="submission-analysis-bigo">{analysis.timeComplexity.bigO}</strong>
        <Paragraphs text={analysis.timeComplexity.explanation} /><p className="submission-analysis-caption">Đánh giá của AI, không phải Runtime thực đo.</p></section>
      <section><h3><BrainCircuit aria-hidden="true" />Space Complexity</h3><strong className="submission-analysis-bigo">{analysis.spaceComplexity.bigO}</strong>
        <Paragraphs text={analysis.spaceComplexity.explanation} /><p className="submission-analysis-caption">Đánh giá của AI, không phải Memory thực đo.</p></section>
    </div>
    <section><h3><CheckCheck aria-hidden="true" />Đánh giá chất lượng code</h3>
      <p className="submission-analysis-caption">Nhận xét AI, độc lập với kết quả Judge.</p><ul>{analysis.codeQuality.map((item, i) => <li key={i}>{item}</li>)}</ul></section>
    <section><h3><Lightbulb aria-hidden="true" />Đề xuất cải thiện</h3><ul>{analysis.improvements.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <p className="submission-analysis-caption">Không tự sửa source hoặc Submit.</p></section>
  </div>
}

/** Receives only the selected committed History row, never the editable code. */
export function SubmissionAnalysis({ row, active, sourceReady }: { row: HistoryRow; active: boolean; sourceReady: boolean }) {
  const analysis = useSubmissionAnalysis(row, active, sourceReady), view = analysis.view
  const begin = view.phase === 'idle' || view.phase === 'cancelled'
  const confirming = view.phase === 'preparing' || view.phase === 'consent'
  const busy = ['preparing', 'starting', 'running', 'cancelling'].includes(view.phase)
  const language = row.language === 'csharp' ? 'C#' : 'JavaScript'
  if (!active || !analysisEligible(row)) return null
  return <section className="submission-analysis" aria-label="Phân tích lời giải">
    <header className="submission-analysis-header">
      <div><span className="submission-analysis-label"><Sparkles aria-hidden="true" />AI · Submission đã lưu</span>
        <p className="submission-analysis-caption">Phân tích cần dịch vụ AI được cấu hình. Trạng thái sẵn sàng được kiểm tra khi bạn đồng ý.</p></div>
      <Button size="small" disabled={!begin || !sourceReady || !analysis.available} onClick={analysis.begin}>
        <Sparkles aria-hidden="true" />Phân tích lời giải
      </Button>
    </header>
    {!analysis.available && <p className="submission-analysis-caption">Phân tích chưa khả dụng cho submission này hoặc kết nối ứng dụng chưa sẵn sàng.</p>}
    {analysis.available && !sourceReady && <p className="submission-analysis-caption">Cần đọc đủ source đã lưu trước khi phân tích.</p>}
    {confirming && <Dialog title="Gửi source tới DeepSeek?" label="Xác nhận phân tích lời giải" initialFocus="dialog" onCancel={analysis.cancel}
      description="Source code của submission đã lưu sẽ được gửi tới dịch vụ AI bên ngoài khi API được cấu hình và bạn đồng ý."
      actions={<><Button variant="ghost" onClick={analysis.cancel}>Hủy</Button>
        <Button variant="primary" disabled={view.phase !== 'consent'} onClick={analysis.consent}>Đồng ý phân tích</Button></>}>
      <div className="submission-analysis-consent">
        <p>Dữ liệu gửi: source đã lưu, ngôn ngữ, đề bài công khai và packageVersion.</p>
        <p>Không gửi hidden Official Tests, Expected, Judge internals hay dữ liệu riêng của hệ thống.</p>
        <p>Hãy kiểm tra thông tin nhạy cảm trong code trước khi gửi. Dịch vụ bên ngoài có thể phát sinh phí.</p>
        <dl><div><dt>Ngôn ngữ</dt><dd>{language}</dd></div>
          {view.prepared && <><div><dt>Source</dt><dd>{view.prepared.sourceBytes.toLocaleString('vi-VN')} bytes</dd></div>
            <div><dt>Đề bài</dt><dd>{view.prepared.statementBytes.toLocaleString('vi-VN')} bytes</dd></div>
            <div><dt>packageVersion</dt><dd>{view.prepared.packageVersion}</dd></div></>}</dl>
        {view.phase === 'preparing' && <p className="submission-analysis-status" role="status"><LoaderCircle className="submission-analysis-spinner" aria-hidden="true" />Đang chuẩn bị source đã lưu…</p>}
        <p>Kết quả AI chỉ mang tính tham khảo.</p>
      </div>
    </Dialog>}
    {!confirming && busy && <div className="submission-analysis-progress" role="status">
      <LoaderCircle className="submission-analysis-spinner" aria-hidden="true" />
      <span>{view.phase === 'cancelling' ? 'Đang hủy phân tích…' : 'Đang phân tích submission đã lưu…'}</span>
    </div>}
    {view.phase === 'recovering' && <p role="status">{view.message}</p>}
    {view.phase === 'error' && <p className="submission-analysis-error" role="alert">{view.message}</p>}
    {view.phase === 'cancelled' && <p role="status">{view.message}</p>}
    {view.phase === 'result' && view.analysis && <AnalysisResult analysis={view.analysis} />}
    {!begin && !confirming && <div className="submission-analysis-actions">
      {view.canCheck && <Button size="small" onClick={analysis.check}>Kiểm tra trạng thái</Button>}
      <Button variant="ghost" size="small" disabled={view.phase === 'cancelling'} onClick={analysis.cancel}>
        {view.phase === 'error' || view.phase === 'result' ? 'Đóng phân tích' : 'Hủy phân tích'}
      </Button>
    </div>}
  </section>
}
