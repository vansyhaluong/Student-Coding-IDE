import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, FileCheck2 } from 'lucide-react'
import { Button } from '../../components/ai/support/button/base'
import type { HintCodeActions } from './practice/use-hint-apply'

/** Existing offline Monaco tokenizers; escaped React text, no models or execution. */
export function AssistantCodeBlock({ text, language, hintActions = false, hintApply }: { text: string; language?: string; hintActions?: boolean; hintApply?: HintCodeActions }) {
  const [tokens, setTokens] = useState<{ offset: number; type: string }[][]>()
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const generation = useRef(0), description = useId()
  useEffect(() => {
    generation.current++; setCopyState('idle')
    return () => { generation.current++ }
  }, [text, language])
  const copy = async () => {
    const current = generation.current
    setCopyState('copying')
    try {
      await navigator.clipboard.writeText(text)
      if (generation.current === current) setCopyState('copied')
    } catch {
      if (generation.current === current) setCopyState('failed')
    }
  }
  const supported = language === 'csharp' || language === 'javascript'
  useEffect(() => {
    let active = true; setTokens(undefined)
    if (supported) void import('../editor/monaco').then(async ({ monaco }) => {
      await monaco.editor.colorize(text, language!, {})
      const value = monaco.editor.tokenize(text, language!)
      if (active) setTokens(value)
    }).catch(() => { /* Keep readable escaped text if tokenization is unavailable. */ })
    return () => { active = false }
  }, [text, language, supported])
  const lines = text.split('\n')
  return <div className="assistant-code-block"><div className="assistant-code-header">
    <div className="assistant-code-language">{language === 'csharp' ? 'C#' : language === 'javascript' ? 'JavaScript' : language || 'Code'}</div>
    {hintActions && <div className="assistant-code-actions" role="group" aria-label="Thao tác code Hint">
      <Button variant="ghost" size="icon" aria-label="Copy code" title={copyState === 'copied' ? 'Đã sao chép' : 'Copy code'} disabled={copyState === 'copying'} onClick={() => { void copy() }}>
        {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <Button variant="ghost" size="sm" disabled={hintApply?.disabled ?? true} onClick={hintApply?.onApply} aria-describedby={description}><FileCheck2 aria-hidden="true" />Apply</Button>
    </div>}
    </div>
    {hintActions && <div className="assistant-code-notices">
      <small id={description}>{hintApply?.message ?? 'Apply chưa khả dụng: Hint chưa có binding vùng sửa được xác thực. Chọn vùng code và dùng Suggest Fix → Review Diff → Apply Fix.'}</small>
      {hintApply?.phase && <span role="status" aria-label="Trạng thái Hint Apply">{hintApply.phase}</span>}
      {hintApply?.onCancel && <Button variant="ghost" size="sm" onClick={hintApply.onCancel}>Hủy Hint Apply</Button>}
      <span role="status" aria-live="polite">{copyState === 'copied' ? 'Đã sao chép code.' : copyState === 'failed' ? 'Không thể sao chép. Hãy thử lại hoặc sao chép thủ công.' : ''}</span>
    </div>}
    <pre className="learning-code-block" tabIndex={0} aria-label={`Code ${language || ''}`}><code className={`language-${language || 'text'}`} data-highlighted={!!tokens}>{tokens ? lines.map((line, row) => <span key={row}>
      {(tokens[row]?.length ? tokens[row] : [{ offset: 0, type: '' }]).map((token, index, list) => <span key={index} className={`learning-syntax-${token.type.split('.')[0] || 'plain'}`}>
        {line.slice(token.offset, list[index + 1]?.offset ?? line.length)}</span>)}{row < lines.length - 1 ? '\n' : ''}</span>) : text}</code></pre>
  </div>
}
