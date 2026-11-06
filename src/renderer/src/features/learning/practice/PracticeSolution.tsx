import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { Exercise, ExerciseLanguage } from '../../../../../shared/contracts/practice'
import { solutionCode, solutionFor } from './solutions'
import { captureSolutionSelection, type SmartSourceSnapshot } from './smart-hints-selection'

type Tokens = { offset: number; type: string }[][]
let highlighter: Promise<typeof import('../../editor/monaco')> | undefined
async function highlight(code: string, language: ExerciseLanguage): Promise<Tokens> {
  const { monaco } = await (highlighter ??= import('../../editor/monaco'))
  // Reuse the installed offline tokenizers; never create a model or execute code.
  await monaco.editor.colorize(code, language, {})
  return monaco.editor.tokenize(code, language)
}

function SolutionCode({ exerciseId, code, language, label, onExplain, onRetire }: { exerciseId: string; code: string; language: ExerciseLanguage; label: string
  onExplain?(snapshot: SmartSourceSnapshot): void; onRetire?(blockId: string): void }) {
  const [tokens, setTokens] = useState<Tokens>()
  const [highlightFailed, setHighlightFailed] = useState(false)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'error'>('idle')
  const lifetime = useRef({ active: true, request: 0 })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const node = useRef<HTMLElement>(null), blockId = useMemo(() => crypto.randomUUID(), [exerciseId, code, language])
  useEffect(() => () => { onRetire?.(blockId) }, [blockId, tokens, onRetire])
  const explain = () => {
    const snapshot = node.current && captureSolutionSelection(node.current, code, language, blockId, exerciseId)
    if (snapshot) onExplain?.(snapshot)
    else setSelectionMessage('Hãy chọn code bên trong một khối để giải thích.')
  }
  const [selectionMessage, setSelectionMessage] = useState('')
  useEffect(() => {
    const current = lifetime.current; current.active = true
    let active = true
    void highlight(code, language).then(value => { if (active) setTokens(value) }, () => { if (active) setHighlightFailed(true) })
    return () => { active = false; current.active = false; clearTimeout(timer.current) }
  }, [code, language])
  const copyCode = async () => {
    const current = lifetime.current, request = ++current.request
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(code)
      if (!current.active || current.request !== request) return
      setCopy('copied')
      timer.current = setTimeout(() => setCopy('idle'), 2000)
    } catch { if (current.active && current.request === request) setCopy('error') }
  }
  const lines = code.split('\n')
  return <div className="learning-code-block practice-solution-code">
    <div className="learning-code-toolbar"><span>{label}</span><button type="button" aria-label={`Copy ${label}`} onClick={() => { void copyCode() }}>
      {copy === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span>{copy === 'copied' ? 'Đã sao chép' : 'Copy'}</span>
    </button>{onExplain && <button type="button" onPointerDown={event => event.preventDefault()} onClick={explain}>Explain with AI</button>}</div>
    {selectionMessage && <p role="status">{selectionMessage}</p>}
    <span className="sr-only" role="status">{copy === 'copied' ? `Đã sao chép ${label}` : ''}</span>
    {copy === 'error' && <p role="alert">Không thể sao chép. Bạn có thể chọn code và sao chép trực tiếp.</p>}
    {highlightFailed && <p role="status">Không thể tô màu cú pháp. Nội dung code vẫn được giữ nguyên.</p>}
    <pre aria-label={label} tabIndex={onExplain ? 0 : undefined} aria-description={onExplain ? 'Ctrl+A chọn code trong khối; Ctrl+Shift+E giải thích lựa chọn với AI.' : undefined}
      onKeyDown={event => {
        if (!onExplain || !(event.ctrlKey || event.metaKey)) return
        if (event.key.toLowerCase() === 'a' && node.current) {
          event.preventDefault(); const range = document.createRange(); range.selectNodeContents(node.current)
          const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
        } else if (event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); explain() }
      }}><code ref={node} className={`language-${language}`} data-smart-hints-block={blockId} data-highlighted={!!tokens}>{tokens ? lines.map((line, row) => <span key={row}>
      {(tokens[row]?.length ? tokens[row] : [{ offset: 0, type: '' }]).map((token, index, list) => <span key={index} className={`learning-syntax-${token.type.split('.')[0] || 'plain'}`}>
        {line.slice(token.offset, list[index + 1]?.offset ?? line.length)}</span>)}{row < lines.length - 1 ? '\n' : ''}</span>) : code}</code></pre>
  </div>
}

export function PracticeSolution({ exercise, editorLanguage, onExplain, onRetire }: { exercise: Exercise; editorLanguage: ExerciseLanguage
  onExplain?(snapshot: SmartSourceSnapshot): void; onRetire?(blockId: string): void }) {
  const [language, setLanguage] = useState(editorLanguage)
  const id = useId(), solution = solutionFor(exercise)
  if (!solution) return <div className="practice-solution-empty" role="status">Chưa có hướng dẫn cho bài tập này</div>
  return <article className="practice-solution" aria-label={`Solution — ${exercise.title}`}>
    <h1>{exercise.title}</h1>
    <section><h2>1. Phân tích đề bài</h2>{solution.analysis.map(text => <p key={text}>{text}</p>)}</section>
    <section><h2>2. Ý tưởng thuật toán</h2><ol>{solution.algorithm.map(text => <li key={text}>{text}</li>)}</ol></section>
    <section><h2>3. Hướng dẫn code từng dòng</h2>
      <div className="practice-solution-languages" role="tablist" aria-label="Ngôn ngữ Solution">{(['csharp', 'javascript'] as const).map(lang =>
        <button type="button" role="tab" key={lang} id={`${id}-${lang}`} aria-controls={`${id}-code`} aria-selected={language === lang}
          tabIndex={language === lang ? 0 : -1} onClick={() => setLanguage(lang)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'csharp' : event.key === 'End' ? 'javascript' : language === 'csharp' ? 'javascript' : 'csharp'
            setLanguage(next); document.getElementById(`${id}-${next}`)?.focus()
          }}>{lang === 'csharp' ? 'C#' : 'JavaScript'}</button>)}</div>
    </section>
    <div role="tabpanel" id={`${id}-code`} aria-labelledby={`${id}-${language}`}>
      <ol className="practice-solution-steps">{solution.languages[language].lines.map((line, index) => <li key={`${language}-${index}`}>
        <SolutionCode exerciseId={exercise.id} code={line.code} language={language} label={`Dòng ${line.lineNumber ?? index + 1}`} onExplain={onExplain} onRetire={onRetire} /><p>{line.explanation}</p>
      </li>)}</ol>
      <section><h2>4. Code hoàn chỉnh</h2><SolutionCode key={language} exerciseId={exercise.id} code={solutionCode(solution, language)} language={language} label="Code hoàn chỉnh" onExplain={onExplain} onRetire={onRetire} /></section>
    </div>
    <section><h2>5. Độ phức tạp</h2><dl><dt>Time Complexity</dt><dd>{solution.complexity.time}</dd><dt>Space Complexity</dt><dd>{solution.complexity.space}</dd></dl></section>
  </article>
}
