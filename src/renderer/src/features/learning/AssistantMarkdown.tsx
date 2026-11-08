import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AssistantCodeBlock } from './AssistantCodeBlock'

/** Presentation only: no raw HTML, remote images, URL navigation or tool actions. */
export function AssistantMarkdown({ children }: { children: string }) {
  return <div className="assistant-markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
    a: ({ children }) => <span className="assistant-link-text">{children}</span>,
    img: ({ alt }) => <span>{alt ? `[${alt}]` : '[Image]'}</span>,
    pre: ({ children }) => <>{children}</>,
    code: ({ children, className }) => {
      const text = String(children), name = /language-([^\s]+)/.exec(className || '')?.[1]
      const language = name === 'cs' || name === 'c#' ? 'csharp' : name === 'js' ? 'javascript' : name
      return name || text.includes('\n') ? <AssistantCodeBlock text={text.replace(/\n$/, '')} language={language} /> : <code>{children}</code>
    },
  }}>{children}</ReactMarkdown></div>
}
