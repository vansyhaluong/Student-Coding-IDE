import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { HistoryRow } from './use-submission-history'
import { useSubmissionSource } from './use-submission-source'
const Viewer = lazy(async () => ({ default: (await import('./SubmissionSourceViewer')).SubmissionSourceViewer }))

export interface RestoreSubmissionSource {
  exerciseId: string; language: ExerciseLanguage; code: string; expectedLanguage: ExerciseLanguage; expectedDraftRevision: number; expectedDraftCode: string
}
const names: Record<HistoryRow['verdict'], string> = { Accepted: 'Accepted', WrongAnswer: 'Wrong Answer', CompilationError: 'Compilation Error',
  SyntaxError: 'Syntax Error', RuntimeError: 'Runtime Error', TimeLimitExceeded: 'Time Limit Exceeded', MemoryLimitExceeded: 'Memory Limit Exceeded', OutputLimitExceeded: 'Output Limit Exceeded' }

export function SubmissionDetails({ row, active, language, sourceRevision, draftCode, restoreBlocked, onBack, onRestore }: {
  row: HistoryRow; active: boolean; language: ExerciseLanguage; sourceRevision: number; restoreBlocked: boolean
  draftCode: string
  onBack(): void; onRestore(request: RestoreSubmissionSource): boolean
}) {
  const source = useSubmissionSource(row, active), applied = useRef(false)
  const mounted = useRef(false)
  const [retired, setRetired] = useState(false)
  useEffect(() => {
    mounted.current = true
    const leave = () => { mounted.current = false; setRetired(true); setConfirm(undefined) }
    window.addEventListener('pagehide', leave)
    return () => { mounted.current = false; window.removeEventListener('pagehide', leave) }
  }, [])
  const [confirm, setConfirm] = useState<{ revision: number; language: ExerciseLanguage; code: string }>()
  const [restored, setRestored] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => { if (!active || restoreBlocked) setConfirm(undefined) }, [active, restoreBlocked])
  const languageName = row.language === 'csharp' ? 'C#' : 'JavaScript'
  const ready = active && !retired && source.view.phase === 'ready' && source.view.code !== undefined
  const consent = !!confirm && confirm.revision === sourceRevision && confirm.language === language && confirm.code === draftCode
  const restore = () => {
    if (!mounted.current || !ready || restoreBlocked || !consent || applied.current) return
    applied.current = true
    const saved = onRestore({ exerciseId: row.exerciseId, language: row.language, code: source.view.code!,
      expectedLanguage: language, expectedDraftRevision: sourceRevision, expectedDraftCode: draftCode })
    setConfirm(undefined)
    if (saved) { setRestored(true); setError(undefined) }
    else { applied.current = false; setError('Ngữ cảnh đã thay đổi hoặc Draft đang khóa. Chưa thay thế source; hãy xác nhận lại.') }
  }
  return <section className="practice-submission-details" aria-label="Submission Details">
    <button type="button" onClick={onBack}>← History</button><h2>Submission Details</h2>
    <dl><div><dt>Verdict</dt><dd>{names[row.verdict]}</dd></div><div><dt>Ngôn ngữ</dt><dd>{languageName}</dd></div>
      <div><dt>Thời gian nộp</dt><dd><time dateTime={row.submittedAt}>{new Date(row.submittedAt).toLocaleString('vi-VN')}</time></dd></div>
      <div><dt>Lưu trữ</dt><dd>saved · {row.key.storeKind === 'ACCEPTED' ? 'Accepted' : 'Failed'} theo History đã commit</dd></div></dl>
    {source.view.stores && Object.values(source.view.stores).some(store => !store.readable)
      && <p className="practice-history-warning">Một phần kho không đọc được. Source chỉ được xác nhận khi đọc đủ bản ghi đã chọn.</p>}
    {source.view.stores && Object.values(source.view.stores).some(store => store.warning === 'POSSIBLE_DATA_LOSS')
      && <p className="practice-history-warning">POSSIBLE_DATA_LOSS · Dữ liệu khôi phục có thể thiếu bản ghi.</p>}
    {source.view.phase === 'loading' && <p role="status">Đang đọc source… {source.view.loadedBytes} / {row.source.byteLength} bytes</p>}
    {source.view.phase === 'error' && <div role="alert">{source.view.error} <button type="button" disabled={retired} onClick={() => { setConfirm(undefined); source.retry() }}>Đọc lại source</button></div>}
    {retired && <p>Ngữ cảnh đã đóng. Hãy quay lại History và mở lại submission.</p>}
    {ready && <div className="practice-source-viewer"><Suspense fallback={<pre aria-label="Source đã lưu (chỉ đọc)">{source.view.code}</pre>}>
      <Viewer row={row} code={source.view.code!} /></Suspense></div>}
    <button type="button" disabled={!ready || restoreBlocked || restored} onClick={() => { setError(undefined); setConfirm({ revision: sourceRevision, language, code: draftCode }) }}>Restore to Editor</button>
    {restoreBlocked && <p>Chờ Run/Submit hoặc thao tác đóng hoàn tất trước khi Restore.</p>}
    {confirm && !consent && <p>Draft hoặc ngôn ngữ đã thay đổi. Hãy xác nhận Restore lại.</p>}
    {consent && ready && !restored && <div role="alertdialog" aria-modal="false" aria-label="Xác nhận Restore to Editor">
      <p>Thay thế Code Draft {languageName} của bài {row.exerciseId} bằng source đã lưu?</p>
      {row.language !== language && <p>Editor sẽ chuyển sang {languageName}; Draft {language === 'csharp' ? 'C#' : 'JavaScript'} đang mở được giữ nguyên.</p>}
      <p>Thao tác này không tự Submit.</p>
      <button type="button" disabled={restoreBlocked} onClick={restore}>Xác nhận Restore</button>
      <button type="button" onClick={() => setConfirm(undefined)}>Hủy Restore</button>
    </div>}
    {restored && <p role="status">Đã Restore source vào Code Draft. Chưa Submit.</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
