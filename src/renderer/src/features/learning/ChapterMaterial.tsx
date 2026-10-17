import { useEffect, useMemo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { LearningChapter, LearningManifest } from '../../../../shared/contracts/learning'
import { highlightCsharp } from './highlight-csharp'

function CsharpCode({ code }: { code: string }) {
  const [tokens, setTokens] = useState<Awaited<ReturnType<typeof highlightCsharp>> | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  useEffect(() => {
    let active = true
    void highlightCsharp(code).then(value => { if (active) setTokens(value) }, () => { if (active) setFailed(true) })
    return () => { active = false }
  }, [code])
  const lines = code.split('\n')
  return <div className="learning-code-block">
    <div className="learning-code-toolbar"><span>C# · Ví dụ minh họa</span>
      <button type="button" onClick={() => {
        void navigator.clipboard.writeText(code).then(() => { setCopied(true); setCopyError(false) }, () => setCopyError(true))
      }}>{copied ? 'Đã sao chép' : 'Copy Code'}</button>
    </div>
    {copyError && <p role="alert">Không thể sao chép code. Bạn có thể chọn và sao chép trực tiếp.</p>}
    {failed && <p role="status">Không thể tô màu cú pháp. Nội dung code vẫn được giữ nguyên.</p>}
    <pre><code className="language-csharp" data-highlighted={tokens !== null}>
      {tokens ? lines.map((line, row) => <span key={row}>{(tokens[row] ?? []).map((token, index, list) =>
        <span key={index} className={`learning-syntax-${token.type.split('.')[0] || 'plain'}`}>
          {line.slice(token.offset, list[index + 1]?.offset ?? line.length)}
        </span>)}{row < lines.length - 1 ? '\n' : ''}</span>) : code}
    </code></pre>
  </div>
}

export function ChapterMaterial({ chapter, markdown, policy }: {
  chapter: LearningChapter; markdown: string; policy: LearningManifest['sourceUsePolicy']
}) {
  const components = useMemo<Components>(() => ({
    h1: ({ children }) => chapter.specialIntroductionChapter ? <h2 className="learning-material-title">{children}</h2> : <h1>{children}</h1>,
    pre: ({ children }) => <div className="learning-code-container">{children}</div>,
    code: ({ className, children }) => className === 'language-csharp'
      ? <CsharpCode code={String(children)} /> : <code className={className}>{children}</code>,
    table: ({ children }) => <div className="learning-table-scroll" tabIndex={0}><table>{children}</table></div>,
    // References remain readable/copyable offline. No navigation or network authority.
    a: ({ href, children }) => <span className="learning-external-reference" title={href}>{children}
      {href && <small> [nguồn bên ngoài]</small>}</span>,
  }), [chapter.specialIntroductionChapter])
  return <article className="learning-material" data-chapter-id={chapter.id}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']}
      components={components}>{markdown}</Markdown>
    <details className="learning-source-metadata"><summary>Nguồn tham khảo & quyền sử dụng</summary>
      <p>Các URL dưới đây là nguồn đối chiếu bên ngoài. Toàn bộ nội dung chương đang đọc đã có sẵn offline.</p>
      <dl><div><dt>Định danh nội dung</dt><dd>{chapter.id} · {chapter.contentPath}</dd></div>
        <div><dt>Nội dung biên soạn</dt><dd>{policy.authoredContent}</dd></div>
        <div><dt>Phạm vi nguồn bên ngoài</dt><dd>{policy.externalSourceMaterial}</dd></div>
        <div><dt>Ý nghĩa metadata giấy phép</dt><dd>{policy.licenseMetadataMeaning}</dd></div></dl>
      <ul>{chapter.references.map(reference => <li key={reference.url}>
        <strong>{reference.publisher}</strong><br /><span>{reference.url}</span><br />
        <span>{reference.sourceLicenseStatus}</span>
      </li>)}</ul>
    </details>
  </article>
}
