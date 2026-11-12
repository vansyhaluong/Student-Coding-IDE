import type { editor } from 'monaco-editor'
import type { SmartBinding, SmartIssue } from '../../../../../shared/contracts/smart-hints'
import { validIssueRange } from '../../../../../shared/contracts/smart-detection'
export const AI_DIAGNOSTIC_OWNER = 'student-ide.ai-detection'
export interface DetectionSnapshot { source: string; binding: SmartBinding; issues: SmartIssue[] }
export function attachDetection(ed: editor.IStandaloneCodeEditor,
  markers: Pick<typeof import('monaco-editor').editor, 'setModelMarkers'>,
  snapshot: DetectionSnapshot) {
  const model = ed.getModel(), origin = snapshot.binding.origin
  let live = true
  const current = () => live && !!model && origin.kind === 'PRACTICE' && !model.isDisposed()
    && ed.getModel() === model && model.uri.scheme === 'practice'
    && model.uri.path === `/${snapshot.binding.exerciseId}/solution.${snapshot.binding.language === 'csharp' ? 'cs' : 'js'}`
    && model.getLanguageId() === snapshot.binding.language && model.getVersionId() === origin.modelVersion
    && model.getValue() === snapshot.source
  const decorations = ed.createDecorationsCollection()
  const clear = () => {
    live = false; decorations.clear()
    if (model && !model.isDisposed()) markers.setModelMarkers(model, AI_DIAGNOSTIC_OWNER, [])
  }
  const located = model ? snapshot.issues.filter(i => i.range && validIssueRange(snapshot.source, i.range)).map(issue => {
    const a = model.getPositionAt(issue.range!.startOffset), b = model.getPositionAt(issue.range!.endOffset)
    return { issue, range: { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column },
      lastLine: b.column === 1 ? b.lineNumber - 1 : b.lineNumber }
  }) : []
  if (current()) {
    markers.setModelMarkers(model!, AI_DIAGNOSTIC_OWNER, located.map(({ issue: i, range }) => ({ ...range,
      severity: i.severity === 'error' ? 8 : i.severity === 'warning' ? 4 : 2,
      message: `Nghi vấn AI (chưa xác minh): ${i.message}\n${i.explanation}\nLý do: ${i.reason}\nTác động: ${i.impact}\nHướng khắc phục: ${i.guidance}`,
      source: 'AI Learning Assistant', code: i.id,
    })))
    decorations.set(located.map(({ issue, range, lastLine }) => ({
      range: { startLineNumber: range.startLineNumber, startColumn: 1, endLineNumber: lastLine, endColumn: model!.getLineMaxColumn(lastLine) },
      options: { isWholeLine: true, className: 'smart-detection-line',
        linesDecorationsClassName: 'smart-detection-margin',
        linesDecorationsTooltip: `Nghi vấn AI (chưa xác minh): ${issue.message}` },
    })))
  }
  const reveal = (id: string) => {
    if (!current()) { clear(); return false }
    const issue = snapshot.issues.find(i => i.id === id)
    if (!issue) return false
    if (issue.range && validIssueRange(snapshot.source, issue.range)) {
      const a = model!.getPositionAt(issue.range.startOffset), b = model!.getPositionAt(issue.range.endOffset)
      ed.setPosition(a); ed.revealRangeInCenter({ startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }); ed.focus()
    }
    return true
  }
  const observers = [ed.onDidChangeModelContent(clear), ed.onDidChangeModel(clear)]
  return { reveal, dispose: () => { observers.forEach(o => o.dispose()); clear() } }
}
