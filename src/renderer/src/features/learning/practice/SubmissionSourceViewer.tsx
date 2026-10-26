import Editor from '@monaco-editor/react'
import '../../editor/monaco'
import type { HistoryRow } from './use-submission-history'

/** A disposable read-only model in a separate URI namespace; never shares the practice draft model. */
export function SubmissionSourceViewer({ row, code }: { row: HistoryRow; code: string }) {
  return <Editor height="280px" theme="vs" value={code} language={row.language}
    path={`submission-view:///${row.exerciseId}/${row.key.storeKind}/${row.key.recordId}.${row.language === 'csharp' ? 'cs' : 'js'}`}
    keepCurrentModel={false} saveViewState={false}
    options={{ readOnly: true, domReadOnly: true, ariaLabel: 'Source đã lưu (chỉ đọc)', automaticLayout: true,
      minimap: { enabled: false }, fontSize: 12, tabSize: 4, scrollBeyondLastLine: false, padding: { top: 12 } }} />
}
